/**
 * Gated cleanup recovery for a prior hosted Fly verifier live FAIL run.
 * Sprint 11E Phase 2E.2D.7A.2 — separate from official live evidence.
 */

import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import type { HeadlessOwnedObjectStoreId } from "@/features/headless-renderer/control-plane/types/owned-object-record";

export const FLY_VERIFY_LIVE_ARCHIVED_FAIL_EVIDENCE_SHA =
  "0617b7daa538620713d50e6d8c94c9a40434d5d464be6417507bbdb8a4edd292" as const;

export const FLY_VERIFY_LIVE_ARCHIVED_FAIL_STARTED_MS = Date.parse(
  "2026-07-22T18:47:09.813Z",
);
export const FLY_VERIFY_LIVE_ARCHIVED_FAIL_ENDED_MS = Date.parse(
  "2026-07-22T18:47:54.750Z",
);

export const FLY_VERIFY_CLEANUP_RECOVERY_EVIDENCE_RELATIVE_PATH =
  "docs/HEADLESS_11E_FLY_VERIFY_LIVE_CLEANUP_RECOVERY_EVIDENCE.md";

export type FlyVerifyCleanupRecoveryTarget = {
  readonly ownerId: string;
  readonly jobId: string;
  readonly projectId: string;
  readonly objectId: string;
  readonly storeId: HeadlessOwnedObjectStoreId;
  readonly objectKey: string;
  readonly verifyAttempt: number;
};

const OWNED_OBJECT_STORE_IDS = Object.freeze(["assets", "artifacts"] as const);

export function parseFlyVerifyCleanupRecoveryOwnedObjectStoreId(
  value: unknown,
): HeadlessOwnedObjectStoreId | null {
  if (typeof value !== "string") return null;
  return (OWNED_OBJECT_STORE_IDS as readonly string[]).includes(value)
    ? (value as HeadlessOwnedObjectStoreId)
    : null;
}

export type FlyVerifyCleanupRecoveryPreview = {
  readonly ownerId: string;
  readonly jobId: string;
  readonly objectCount: number;
  readonly projectCount: number;
  readonly r2LocatorCount: number;
  readonly redisStreamIdCount: number;
};

export type FlyVerifyCleanupRecoveryDiscoveryResult =
  | {
      readonly ok: true;
      readonly preview: FlyVerifyCleanupRecoveryPreview;
      readonly target: FlyVerifyCleanupRecoveryTarget;
    }
  | { readonly ok: false; readonly failClass: string };

/** Fail closed unless preview matches exactly one coherent archived run. */
export function assertFlyVerifyCleanupRecoveryPreviewUnchanged(
  preview: FlyVerifyCleanupRecoveryPreview,
): { readonly ok: true } | { readonly ok: false; readonly failClass: string } {
  if (
    preview.objectCount !== 1 ||
    preview.projectCount !== 1 ||
    preview.r2LocatorCount !== 1
  ) {
    return { ok: false, failClass: "discovery_preview_drift" };
  }
  return { ok: true };
}

type DiscoveredJobRow = {
  readonly job_id: string;
  readonly owner_id: string;
  readonly creator_idempotency_key: string | null;
  readonly created_at_ms: string;
};

type DiscoveredObjectRow = {
  readonly object_id: string;
  readonly store_id: string;
  readonly object_key: string;
};

function isFlyVerifyLiveOwnerId(ownerId: string): boolean {
  return ownerId.startsWith("fvl_owner_");
}

function isFlyVerifyLiveCreatorKey(key: string | null): boolean {
  return key != null && key.startsWith("fly-verify-live-");
}

export async function discoverFlyVerifyCleanupRecoveryTarget(input: {
  readonly sql: HeadlessSqlExecutor;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
}): Promise<FlyVerifyCleanupRecoveryDiscoveryResult> {
  try {
    const jobs = await input.sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      return client.query<DiscoveredJobRow>(
        `
SELECT job_id, owner_id, creator_idempotency_key, created_at_ms::text
FROM public.headless_jobs
WHERE owner_id LIKE 'fvl_owner_%'
  AND creator_idempotency_key LIKE 'fly-verify-live-%'
  AND created_at_ms >= $1
  AND created_at_ms <= $2
ORDER BY created_at_ms ASC
`,
        [input.windowStartMs, input.windowEndMs],
      );
    });

    const rows = jobs.rows;
    if (rows.length === 0) {
      return { ok: false, failClass: "discovery_zero_matches" };
    }
    if (rows.length !== 1) {
      return { ok: false, failClass: "discovery_multiple_matches" };
    }

    const job = rows[0]!;
    if (!isFlyVerifyLiveOwnerId(job.owner_id)) {
      return { ok: false, failClass: "discovery_owner_malformed" };
    }
    if (!isFlyVerifyLiveCreatorKey(job.creator_idempotency_key)) {
      return { ok: false, failClass: "discovery_creator_malformed" };
    }

    const objects = await input.sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      return client.query<DiscoveredObjectRow>(
        `
SELECT object_id, store_id, object_key
FROM public.headless_owned_objects
WHERE owner_id = $1
  AND job_id = $2
`,
        [job.owner_id, job.job_id],
      );
    });

    const ownership = await input.sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      return client.query<{ project_id: string }>(
        `
SELECT project_id
FROM public.headless_project_ownership
WHERE owner_id = $1
`,
        [job.owner_id],
      );
    });

    const objectRows = objects.rows;
    if (objectRows.length === 0) {
      return { ok: false, failClass: "discovery_no_owned_objects" };
    }
    if (objectRows.length !== 1) {
      return { ok: false, failClass: "discovery_object_count_mismatch" };
    }

    for (const obj of objectRows) {
      if (obj.object_id.length === 0 || obj.store_id.length === 0) {
        return { ok: false, failClass: "discovery_object_malformed" };
      }
    }

    const projectIds = new Set(ownership.rows.map((r) => r.project_id));
    if (projectIds.size === 0) {
      return { ok: false, failClass: "discovery_no_project_ownership" };
    }
    if (projectIds.size !== 1) {
      return { ok: false, failClass: "discovery_ambiguous_project_ownership" };
    }

    const obj = objectRows[0]!;
    const projectId = [...projectIds][0]!;
    if (obj.object_key.length === 0) {
      return { ok: false, failClass: "discovery_object_malformed" };
    }
    const storeId = parseFlyVerifyCleanupRecoveryOwnedObjectStoreId(obj.store_id);
    if (storeId == null) {
      return { ok: false, failClass: "discovery_store_id_invalid" };
    }

    return {
      ok: true,
      preview: {
        ownerId: job.owner_id,
        jobId: job.job_id,
        objectCount: 1,
        projectCount: 1,
        r2LocatorCount: 1,
        redisStreamIdCount: 0,
      },
      target: {
        ownerId: job.owner_id,
        jobId: job.job_id,
        projectId,
        objectId: obj.object_id,
        storeId,
        objectKey: obj.object_key,
        verifyAttempt: 1,
      },
    };
  } catch {
    return { ok: false, failClass: "discovery_read_failed" };
  }
}

export type FlyVerifyCleanupRecoveryNeonLeftovers = {
  readonly jobCount: number;
  readonly objectCount: number;
  readonly projectOwnershipCount: number;
  readonly totalCount: number;
};

export async function countFlyVerifyCleanupRecoveryNeonLeftovers(input: {
  readonly sql: HeadlessSqlExecutor;
  readonly ownerId: string;
  readonly jobId: string;
}): Promise<FlyVerifyCleanupRecoveryNeonLeftovers | null> {
  try {
    const remaining = await input.sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      const objects = await client.query<{ n: string }>(
        `
SELECT COUNT(*)::text AS n
FROM public.headless_owned_objects
WHERE owner_id = $1 AND job_id = $2
`,
        [input.ownerId, input.jobId],
      );
      const jobs = await client.query<{ n: string }>(
        `
SELECT COUNT(*)::text AS n
FROM public.headless_jobs
WHERE owner_id = $1 AND job_id = $2
`,
        [input.ownerId, input.jobId],
      );
      const ownership = await client.query<{ n: string }>(
        `
SELECT COUNT(*)::text AS n
FROM public.headless_project_ownership
WHERE owner_id = $1
`,
        [input.ownerId],
      );
      return {
        objects: Number(objects.rows[0]?.n ?? "0"),
        jobs: Number(jobs.rows[0]?.n ?? "0"),
        ownership: Number(ownership.rows[0]?.n ?? "0"),
      };
    });
    return {
      jobCount: remaining.jobs,
      objectCount: remaining.objects,
      projectOwnershipCount: remaining.ownership,
      totalCount: remaining.jobs + remaining.objects + remaining.ownership,
    };
  } catch {
    return null;
  }
}

export async function verifyFlyVerifyCleanupRecoveryZeroLeftovers(input: {
  readonly sql: HeadlessSqlExecutor;
  readonly ownerId: string;
  readonly jobId: string;
}): Promise<boolean> {
  const remaining = await countFlyVerifyCleanupRecoveryNeonLeftovers(input);
  if (remaining == null) return false;
  return remaining.totalCount === 0;
}

export function isFlyVerifyCleanupRecoveryGateOn(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): boolean {
  try {
    return (env as Record<string, unknown>).HEADLESS_FLY_VERIFY_QA_CLEANUP_RECOVERY ===
      "1";
  } catch {
    return false;
  }
}

export function isFlyVerifyCleanupRecoveryMutateGateOn(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): boolean {
  try {
    return (
      (env as Record<string, unknown>)
        .HEADLESS_FLY_VERIFY_QA_CLEANUP_RECOVERY_MUTATE === "1"
    );
  } catch {
    return false;
  }
}

/** Trusted public staging pins — never bridge secrets. */
export function mergeFlyVerifyCleanupRecoveryTrustedPublicEnv(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): Record<string, unknown> {
  return Object.freeze({
    ...(env as Record<string, unknown>),
    HEADLESS_ENV_NAME: "staging",
  });
}
