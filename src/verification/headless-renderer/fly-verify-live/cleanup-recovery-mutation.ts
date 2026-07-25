/**
 * Bounded cleanup-recovery mutation — Redis → R2 → Neon for one discovered run.
 * Never deletes foreign stream entries, bucket prefixes, or cross-owner Neon rows.
 */

import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { deriveHeadlessQueueStreamNames } from "@/features/headless-renderer/control-plane/services/headless-queue-stream-names";
import { stableHeadlessVerifyDeliveryId } from "@/features/headless-renderer/control-plane/services/stable-delivery-id";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import type { HeadlessR2ObjectLocator } from "@/features/headless-renderer/control-plane/ports/r2-object-io.port";

import type { FlyVerifyCleanupRecoveryTarget } from "./cleanup-recovery";
import { countFlyVerifyCleanupRecoveryNeonLeftovers } from "./cleanup-recovery";

const SHARED_VERIFY_STREAM_RE = /^hfq:verify:(local|staging|production)$/;
const WINDOW_SCAN_MAX = 64;

export type FlyVerifyCleanupRecoveryProviderDisposition =
  | "absent_confirmed"
  | "already_absent"
  | "deleted_confirmed"
  | "probe_failed"
  | "ambiguous"
  | "delete_failed"
  | "not_run";

export type FlyVerifyCleanupRecoveryMutationDispositions = {
  readonly redis: FlyVerifyCleanupRecoveryProviderDisposition;
  readonly r2: FlyVerifyCleanupRecoveryProviderDisposition;
  readonly neon: FlyVerifyCleanupRecoveryProviderDisposition;
};

type FlyVerifyCleanupRecoveryMutationDispositionBuilder = {
  redis: FlyVerifyCleanupRecoveryProviderDisposition;
  r2: FlyVerifyCleanupRecoveryProviderDisposition;
  neon: FlyVerifyCleanupRecoveryProviderDisposition;
};

function freezeFlyVerifyCleanupRecoveryMutationDispositions(
  builder: FlyVerifyCleanupRecoveryMutationDispositionBuilder,
): FlyVerifyCleanupRecoveryMutationDispositions {
  return Object.freeze({
    redis: builder.redis,
    r2: builder.r2,
    neon: builder.neon,
  });
}

function initialFlyVerifyCleanupRecoveryMutationDispositions(): FlyVerifyCleanupRecoveryMutationDispositionBuilder {
  return {
    redis: "not_run",
    r2: "not_run",
    neon: "not_run",
  };
}

export type FlyVerifyCleanupRecoveryAbsenceVerification = {
  readonly neonJobCount: number;
  readonly neonObjectCount: number;
  readonly neonOwnershipCount: number;
  readonly r2Absent: boolean;
  readonly redisStreamAbsent: boolean;
  readonly redisPendingAbsent: boolean;
};

export type FlyVerifyCleanupRecoveryMutationResult =
  | {
      readonly ok: true;
      readonly dispositions: FlyVerifyCleanupRecoveryMutationDispositions;
      readonly absence: FlyVerifyCleanupRecoveryAbsenceVerification;
    }
  | {
      readonly ok: false;
      readonly overall: "FAIL" | "PARTIAL";
      readonly failClass: string;
      readonly dispositions: FlyVerifyCleanupRecoveryMutationDispositions;
      readonly absence: FlyVerifyCleanupRecoveryAbsenceVerification | null;
    };

export type FlyVerifyCleanupRecoveryRedisPort = {
  readonly qaXrange: (input: {
    readonly streamKey: string;
    readonly start: string;
    readonly end: string;
    readonly count?: number;
  }) => Promise<
    readonly {
      readonly streamId: string;
      readonly fields: Readonly<Record<string, string>>;
    }[]
  >;
  readonly qaXackInGroup: (
    streamKey: string,
    group: string,
    streamId: string,
  ) => Promise<boolean>;
  readonly qaXdel: (streamKey: string, ...streamIds: string[]) => Promise<number>;
  readonly qaProbePendingInGroup: (
    streamKey: string,
    group: string,
    streamId: string,
  ) => Promise<{ readonly ok: boolean; readonly pending?: boolean }>;
  readonly qaProbeStreamEntry: (
    streamKey: string,
    streamId: string,
  ) => Promise<{ readonly ok: boolean; readonly present?: boolean }>;
};

function isAuthorizedVerifyStream(stream: string): boolean {
  return SHARED_VERIFY_STREAM_RE.test(stream);
}

function matchesRunOwnedVerifyEntry(
  fields: Readonly<Record<string, string>>,
  input: {
    readonly deliveryId: string;
    readonly ownedObjectId: string;
    readonly ownerId: string;
    readonly windowStartMs: number;
    readonly windowEndMs: number;
  },
): boolean {
  if (fields.deliveryKind !== "verify") return false;
  if (fields.deliveryId !== input.deliveryId) return false;
  if (fields.ownedObjectId !== input.ownedObjectId) return false;
  if (fields.ownerId !== input.ownerId) return false;
  const enqueuedAtMs = Number(fields.enqueuedAtMs);
  if (!Number.isFinite(enqueuedAtMs)) return false;
  return (
    enqueuedAtMs >= input.windowStartMs && enqueuedAtMs <= input.windowEndMs
  );
}

async function findRunOwnedVerifyStreamIds(input: {
  readonly redis: FlyVerifyCleanupRecoveryRedisPort;
  readonly verifyStream: string;
  readonly verifyGroup: string;
  readonly deliveryId: string;
  readonly ownedObjectId: string;
  readonly ownerId: string;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
}): Promise<
  | { readonly ok: true; readonly streamIds: readonly string[] }
  | { readonly ok: false; readonly failClass: string }
> {
  if (!isAuthorizedVerifyStream(input.verifyStream)) {
    return { ok: false, failClass: "redis_stream_unauthorized" };
  }
  const entries = await input.redis.qaXrange({
    streamKey: input.verifyStream,
    start: `${input.windowStartMs}-0`,
    end: `${input.windowEndMs}-999999`,
    count: WINDOW_SCAN_MAX,
  });
  const matched = entries
    .filter((entry) =>
      matchesRunOwnedVerifyEntry(entry.fields, {
        deliveryId: input.deliveryId,
        ownedObjectId: input.ownedObjectId,
        ownerId: input.ownerId,
        windowStartMs: input.windowStartMs,
        windowEndMs: input.windowEndMs,
      }),
    )
    .map((entry) => entry.streamId);
  if (entries.length >= WINDOW_SCAN_MAX && matched.length === 0) {
    return { ok: false, failClass: "redis_window_scan_truncated" };
  }
  return { ok: true, streamIds: Object.freeze(matched) };
}

async function verifyRedisRunOwnedAbsent(input: {
  readonly redis: FlyVerifyCleanupRecoveryRedisPort;
  readonly verifyStream: string;
  readonly verifyGroup: string;
  readonly streamId: string;
}): Promise<
  | { readonly ok: true; readonly streamAbsent: boolean; readonly pendingAbsent: boolean }
  | { readonly ok: false }
> {
  const pending = await input.redis.qaProbePendingInGroup(
    input.verifyStream,
    input.verifyGroup,
    input.streamId,
  );
  if (!pending.ok) {
    return { ok: false };
  }
  const presence = await input.redis.qaProbeStreamEntry(
    input.verifyStream,
    input.streamId,
  );
  if (!presence.ok) {
    return { ok: false };
  }
  return {
    ok: true,
    streamAbsent: !presence.present,
    pendingAbsent: !pending.pending,
  };
}

async function mutateRedisRunOwned(input: {
  readonly redis: FlyVerifyCleanupRecoveryRedisPort;
  readonly target: FlyVerifyCleanupRecoveryTarget;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
}): Promise<{
  readonly disposition: FlyVerifyCleanupRecoveryProviderDisposition;
  readonly failClass: string | null;
  readonly trackedStreamId: string | null;
}> {
  const names = deriveHeadlessQueueStreamNames("staging");
  const deliveryId = stableHeadlessVerifyDeliveryId(
    input.target.objectId,
    input.target.verifyAttempt,
  );
  const found = await findRunOwnedVerifyStreamIds({
    redis: input.redis,
    verifyStream: names.verifyStream,
    verifyGroup: names.verifyGroup,
    deliveryId,
    ownedObjectId: input.target.objectId,
    ownerId: input.target.ownerId,
    windowStartMs: input.windowStartMs,
    windowEndMs: input.windowEndMs,
  });
  if (!found.ok) {
    return {
      disposition: "probe_failed",
      failClass: found.failClass,
      trackedStreamId: null,
    };
  }
  if (found.streamIds.length === 0) {
    return {
      disposition: "already_absent",
      failClass: null,
      trackedStreamId: null,
    };
  }
  if (found.streamIds.length !== 1) {
    return {
      disposition: "ambiguous",
      failClass: "redis_multiple_run_owned_entries",
      trackedStreamId: null,
    };
  }
  const streamId = found.streamIds[0]!;
  try {
    await input.redis.qaXackInGroup(
      names.verifyStream,
      names.verifyGroup,
      streamId,
    );
    await input.redis.qaXdel(names.verifyStream, streamId);
  } catch {
    return {
      disposition: "delete_failed",
      failClass: "redis_delete_failed",
      trackedStreamId: streamId,
    };
  }
  const absent = await verifyRedisRunOwnedAbsent({
    redis: input.redis,
    verifyStream: names.verifyStream,
    verifyGroup: names.verifyGroup,
    streamId,
  });
  if (!absent.ok) {
    return {
      disposition: "probe_failed",
      failClass: "redis_post_delete_probe_failed",
      trackedStreamId: streamId,
    };
  }
  if (!absent.streamAbsent || !absent.pendingAbsent) {
    return {
      disposition: "delete_failed",
      failClass: "redis_post_delete_still_present",
      trackedStreamId: streamId,
    };
  }
  return {
    disposition: "deleted_confirmed",
    failClass: null,
    trackedStreamId: streamId,
  };
}

async function mutateR2ExactLocator(input: {
  readonly storage: R2StorageAdapter;
  readonly target: FlyVerifyCleanupRecoveryTarget;
}): Promise<{
  readonly disposition: FlyVerifyCleanupRecoveryProviderDisposition;
  readonly failClass: string | null;
}> {
  const locator: HeadlessR2ObjectLocator = {
    storeId: input.target.storeId,
    objectKey: input.target.objectKey,
  };
  const before = await input.storage.probeExactObjectPresence(
    locator,
    input.target.ownerId,
  );
  if (!before.ok) {
    return { disposition: "probe_failed", failClass: "r2_presence_probe_failed" };
  }
  if (before.value === "absent") {
    return { disposition: "already_absent", failClass: null };
  }
  const deleted = await input.storage.deleteObject(locator, input.target.ownerId);
  if (!deleted.ok) {
    return { disposition: "delete_failed", failClass: "r2_delete_failed" };
  }
  const after = await input.storage.probeExactObjectPresence(
    locator,
    input.target.ownerId,
  );
  if (!after.ok) {
    return {
      disposition: "probe_failed",
      failClass: "r2_post_delete_probe_failed",
    };
  }
  if (after.value !== "absent") {
    return {
      disposition: "delete_failed",
      failClass: "r2_post_delete_still_present",
    };
  }
  return { disposition: "deleted_confirmed", failClass: null };
}

async function mutateNeonExactRows(input: {
  readonly sql: HeadlessSqlExecutor;
  readonly target: FlyVerifyCleanupRecoveryTarget;
}): Promise<{
  readonly disposition: FlyVerifyCleanupRecoveryProviderDisposition;
  readonly failClass: string | null;
}> {
  try {
    await input.sql.withTransaction(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      const objects = await client.query<{ n: string }>(
        `
DELETE FROM public.headless_owned_objects
WHERE owner_id = $1 AND job_id = $2 AND object_id = $3
RETURNING 1 AS n
`,
        [input.target.ownerId, input.target.jobId, input.target.objectId],
      );
      if (objects.rowCount !== 1) {
        throw new Error("neon_owned_object_delete_count");
      }
      const jobs = await client.query<{ n: string }>(
        `
DELETE FROM public.headless_jobs
WHERE owner_id = $1 AND job_id = $2
RETURNING 1 AS n
`,
        [input.target.ownerId, input.target.jobId],
      );
      if (jobs.rowCount !== 1) {
        throw new Error("neon_job_delete_count");
      }
      const ownership = await client.query<{ n: string }>(
        `
DELETE FROM public.headless_project_ownership
WHERE owner_id = $1 AND project_id = $2
RETURNING 1 AS n
`,
        [input.target.ownerId, input.target.projectId],
      );
      if (ownership.rowCount !== 1) {
        throw new Error("neon_ownership_delete_count");
      }
    });
    return { disposition: "deleted_confirmed", failClass: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "neon_delete_failed";
    if (message.startsWith("neon_")) {
      return { disposition: "delete_failed", failClass: message };
    }
    return { disposition: "delete_failed", failClass: "neon_delete_failed" };
  }
}

async function verifyPostMutationAbsence(input: {
  readonly sql: HeadlessSqlExecutor;
  readonly storage: R2StorageAdapter;
  readonly redis: FlyVerifyCleanupRecoveryRedisPort | null;
  readonly target: FlyVerifyCleanupRecoveryTarget;
  readonly trackedStreamId: string | null;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
}): Promise<FlyVerifyCleanupRecoveryAbsenceVerification | null> {
  const neon = await countFlyVerifyCleanupRecoveryNeonLeftovers({
    sql: input.sql,
    ownerId: input.target.ownerId,
    jobId: input.target.jobId,
  });
  if (neon == null) {
    return null;
  }
  const locator: HeadlessR2ObjectLocator = {
    storeId: input.target.storeId,
    objectKey: input.target.objectKey,
  };
  const r2Probe = await input.storage.probeExactObjectPresence(
    locator,
    input.target.ownerId,
  );
  if (!r2Probe.ok) {
    return null;
  }
  let redisStreamAbsent = true;
  let redisPendingAbsent = true;
  if (input.redis != null) {
    const names = deriveHeadlessQueueStreamNames("staging");
    const deliveryId = stableHeadlessVerifyDeliveryId(
      input.target.objectId,
      input.target.verifyAttempt,
    );
    if (input.trackedStreamId != null) {
      const redisAbsent = await verifyRedisRunOwnedAbsent({
        redis: input.redis,
        verifyStream: names.verifyStream,
        verifyGroup: names.verifyGroup,
        streamId: input.trackedStreamId,
      });
      if (!redisAbsent.ok) {
        return null;
      }
      redisStreamAbsent = redisAbsent.streamAbsent;
      redisPendingAbsent = redisAbsent.pendingAbsent;
    } else {
      const found = await findRunOwnedVerifyStreamIds({
        redis: input.redis,
        verifyStream: names.verifyStream,
        verifyGroup: names.verifyGroup,
        deliveryId,
        ownedObjectId: input.target.objectId,
        ownerId: input.target.ownerId,
        windowStartMs: input.windowStartMs,
        windowEndMs: input.windowEndMs,
      });
      if (!found.ok || found.streamIds.length !== 0) {
        return null;
      }
    }
  }
  return {
    neonJobCount: neon.jobCount,
    neonObjectCount: neon.objectCount,
    neonOwnershipCount: neon.projectOwnershipCount,
    r2Absent: r2Probe.value === "absent",
    redisStreamAbsent,
    redisPendingAbsent,
  };
}

export async function executeFlyVerifyCleanupRecoveryMutation(input: {
  readonly sql: HeadlessSqlExecutor;
  readonly storage: R2StorageAdapter;
  readonly redis: FlyVerifyCleanupRecoveryRedisPort | null;
  readonly target: FlyVerifyCleanupRecoveryTarget;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
}): Promise<FlyVerifyCleanupRecoveryMutationResult> {
  const dispositions = initialFlyVerifyCleanupRecoveryMutationDispositions();

  if (input.redis == null) {
    dispositions.redis = "probe_failed";
    return {
      ok: false,
      overall: "FAIL",
      failClass: "redis_consumer_unavailable",
      dispositions: freezeFlyVerifyCleanupRecoveryMutationDispositions(dispositions),
      absence: null,
    };
  }

  const redisResult = await mutateRedisRunOwned({
    redis: input.redis,
    target: input.target,
    windowStartMs: input.windowStartMs,
    windowEndMs: input.windowEndMs,
  });
  dispositions.redis = redisResult.disposition;
  if (
    redisResult.disposition === "probe_failed" ||
    redisResult.disposition === "ambiguous" ||
    redisResult.disposition === "delete_failed"
  ) {
    return {
      ok: false,
      overall: "FAIL",
      failClass: redisResult.failClass ?? "redis_mutation_failed",
      dispositions: freezeFlyVerifyCleanupRecoveryMutationDispositions(dispositions),
      absence: null,
    };
  }

  const r2Result = await mutateR2ExactLocator({
    storage: input.storage,
    target: input.target,
  });
  dispositions.r2 = r2Result.disposition;
  if (
    r2Result.disposition === "probe_failed" ||
    r2Result.disposition === "delete_failed"
  ) {
    return {
      ok: false,
      overall: "PARTIAL",
      failClass: r2Result.failClass ?? "r2_mutation_failed",
      dispositions: freezeFlyVerifyCleanupRecoveryMutationDispositions(dispositions),
      absence: null,
    };
  }

  const neonResult = await mutateNeonExactRows({
    sql: input.sql,
    target: input.target,
  });
  dispositions.neon = neonResult.disposition;
  if (neonResult.disposition === "delete_failed") {
    return {
      ok: false,
      overall: "PARTIAL",
      failClass: neonResult.failClass ?? "neon_mutation_failed",
      dispositions: freezeFlyVerifyCleanupRecoveryMutationDispositions(dispositions),
      absence: null,
    };
  }

  const absence = await verifyPostMutationAbsence({
    sql: input.sql,
    storage: input.storage,
    redis: input.redis,
    target: input.target,
    trackedStreamId: redisResult.trackedStreamId,
    windowStartMs: input.windowStartMs,
    windowEndMs: input.windowEndMs,
  });
  if (absence == null) {
    return {
      ok: false,
      overall: "PARTIAL",
      failClass: "post_mutation_verify_read_failed",
      dispositions: freezeFlyVerifyCleanupRecoveryMutationDispositions(dispositions),
      absence: null,
    };
  }

  const allAbsent =
    absence.neonJobCount === 0 &&
    absence.neonObjectCount === 0 &&
    absence.neonOwnershipCount === 0 &&
    absence.r2Absent &&
    absence.redisStreamAbsent &&
    absence.redisPendingAbsent;

  if (!allAbsent) {
    return {
      ok: false,
      overall: "PARTIAL",
      failClass: "post_mutation_absence_incomplete",
      dispositions: freezeFlyVerifyCleanupRecoveryMutationDispositions(dispositions),
      absence,
    };
  }

  return {
    ok: true,
    dispositions: freezeFlyVerifyCleanupRecoveryMutationDispositions(dispositions),
    absence,
  };
}
