/**
 * Pure provisional stored-record lifecycle helpers.
 * Returns store writes without storeVersion — CAS remains store-owned.
 */

import { parseHeadlessTerminalReason } from "../../domain/headless-field-validators";
import type { HeadlessTerminalReason } from "../../domain/headless-render.types";
import {
  HEADLESS_STORED_JOB_RECORD_VERSION,
  type HeadlessProvisionalStoreWrite,
  type HeadlessProvisionalStoredJobRecord,
  type HeadlessProvisionalVerificationCoverageV1,
} from "../types/stored-job-record";
import {
  validateHeadlessProvisionalStoredJobRecord,
  validateHeadlessProvisionalVerificationCoverage,
  validateHeadlessProvisionalSnapshotClaim,
  validateHeadlessProvisionalStagingObjectRefs,
} from "./validate-provisional-stored-job";
import { emptyVerificationCoverage } from "./provisional-verification-targets";
import {
  assertCoverageMonotonicAndBound,
  assertProvisionalStagingRefsMonotonic,
} from "./provisional-staging-monotonicity";

export type ProvisionalLifecycleResult =
  | { readonly ok: true; readonly record: HeadlessProvisionalStoreWrite }
  | { readonly ok: false; readonly message: string };

function toStoreWrite(
  record: HeadlessProvisionalStoredJobRecord,
): HeadlessProvisionalStoreWrite {
  return {
    version: record.version,
    stage: record.stage,
    jobId: record.jobId,
    ownerId: record.ownerId,
    projectId: record.projectId,
    createdAtMs: record.createdAtMs,
    updatedAtMs: record.updatedAtMs,
    idempotencyAuthorityKey: record.idempotencyAuthorityKey,
    state: record.state,
    operationId: record.operationId,
    creatorIdempotencyKey: record.creatorIdempotencyKey,
    requestedRendererProfile: record.requestedRendererProfile,
    requestedRendererBuildId: record.requestedRendererBuildId,
    snapshotClaim: record.snapshotClaim,
    stagingObjectRefs: record.stagingObjectRefs,
    verificationCoverage: record.verificationCoverage,
    verificationClaimToken: record.verificationClaimToken,
    verificationClaimedAtMs: record.verificationClaimedAtMs,
    expiresAtMs: record.expiresAtMs,
    progress: record.progress,
    terminalReason: record.terminalReason,
    canonicalJob: null,
    canonicalRequest: null,
    artifactObjectBinding: null,
    claimToken: null,
    claimedAtMs: null,
  };
}

function assertMaterializingActive(
  current: HeadlessProvisionalStoredJobRecord,
): ProvisionalLifecycleResult | null {
  if (current.state !== "materializing") {
    return {
      ok: false,
      message: "Only materializing provisional records are active.",
    };
  }
  return null;
}

function assertMonotonicTimestamp(
  current: HeadlessProvisionalStoredJobRecord,
  nowMs: number,
): ProvisionalLifecycleResult | null {
  if (
    typeof nowMs !== "number" ||
    !Number.isSafeInteger(nowMs) ||
    nowMs < current.updatedAtMs
  ) {
    return {
      ok: false,
      message: "updatedAtMs must be >= current updatedAtMs.",
    };
  }
  return null;
}

function validateWrite(
  draft: HeadlessProvisionalStoreWrite,
): ProvisionalLifecycleResult {
  const validated = validateHeadlessProvisionalStoredJobRecord(draft, {
    requireStoreVersion: false,
  });
  if (!validated.ok) return validated;
  return { ok: true, record: toStoreWrite(validated.record) };
}

function preserveCoreIdentity(
  current: HeadlessProvisionalStoredJobRecord,
  next: HeadlessProvisionalStoreWrite,
): ProvisionalLifecycleResult | null {
  if (
    next.version !== current.version ||
    next.stage !== current.stage ||
    next.jobId !== current.jobId ||
    next.ownerId !== current.ownerId ||
    next.projectId !== current.projectId ||
    next.createdAtMs !== current.createdAtMs ||
    next.idempotencyAuthorityKey !== current.idempotencyAuthorityKey ||
    next.operationId !== current.operationId ||
    next.creatorIdempotencyKey !== current.creatorIdempotencyKey ||
    next.requestedRendererBuildId !== current.requestedRendererBuildId ||
    next.expiresAtMs !== current.expiresAtMs
  ) {
    return {
      ok: false,
      message: "Provisional identity fields are immutable after create.",
    };
  }
  const profile = current.requestedRendererProfile;
  const nextProfile = next.requestedRendererProfile;
  if (
    nextProfile.resolution !== profile.resolution ||
    nextProfile.format !== profile.format ||
    nextProfile.fps !== profile.fps ||
    nextProfile.quality !== profile.quality
  ) {
    return {
      ok: false,
      message: "requestedRendererProfile is immutable after create.",
    };
  }
  return null;
}

function terminalWrite(
  current: HeadlessProvisionalStoredJobRecord,
  input: {
    readonly nowMs: number;
    readonly state: "failed" | "cancelled" | "expired";
    readonly terminalReason: HeadlessTerminalReason;
  },
): ProvisionalLifecycleResult {
  const active = assertMaterializingActive(current);
  if (active) return active;
  const monotonic = assertMonotonicTimestamp(current, input.nowMs);
  if (monotonic) return monotonic;

  const draft: HeadlessProvisionalStoreWrite = {
    ...toStoreWrite(current),
    updatedAtMs: input.nowMs,
    state: input.state,
    progress: null,
    terminalReason: input.terminalReason,
  };

  const identity = preserveCoreIdentity(current, draft);
  if (identity) return identity;
  return validateWrite(draft);
}

export interface CreateProvisionalMaterializingRecordInput {
  readonly jobId: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly idempotencyAuthorityKey: string;
  readonly operationId: string;
  readonly creatorIdempotencyKey: string;
  readonly requestedRendererProfile: unknown;
  readonly requestedRendererBuildId: string;
  readonly snapshotClaim: unknown;
  readonly stagingObjectRefs: unknown;
  readonly expiresAtMs: number;
  readonly progress?: unknown;
}

export function createProvisionalMaterializingRecord(
  input: CreateProvisionalMaterializingRecordInput,
): ProvisionalLifecycleResult {
  try {
    if (
      typeof input.createdAtMs !== "number" ||
      typeof input.updatedAtMs !== "number" ||
      !Number.isSafeInteger(input.createdAtMs) ||
      !Number.isSafeInteger(input.updatedAtMs) ||
      input.updatedAtMs < input.createdAtMs
    ) {
      return { ok: false, message: "Create timestamps invalid." };
    }

    const snapshotParsed = validateHeadlessProvisionalSnapshotClaim(
      input.snapshotClaim,
    );
    if (!snapshotParsed.ok) return snapshotParsed;

    const expectedSlotKeySet = new Set(
      snapshotParsed.claim.expectedSlotClaims.map((slot) => slot.slotKey),
    );
    const stagingParsed = validateHeadlessProvisionalStagingObjectRefs(
      input.stagingObjectRefs,
      expectedSlotKeySet,
    );
    if (!stagingParsed.ok) return stagingParsed;

    const coverage = emptyVerificationCoverage(snapshotParsed.claim);

    const draft = {
      version: HEADLESS_STORED_JOB_RECORD_VERSION,
      stage: "provisional" as const,
      jobId: input.jobId,
      ownerId: input.ownerId,
      projectId: input.projectId,
      createdAtMs: input.createdAtMs,
      updatedAtMs: input.updatedAtMs,
      idempotencyAuthorityKey: input.idempotencyAuthorityKey,
      state: "materializing" as const,
      operationId: input.operationId,
      creatorIdempotencyKey: input.creatorIdempotencyKey,
      requestedRendererProfile: input.requestedRendererProfile,
      requestedRendererBuildId: input.requestedRendererBuildId,
      snapshotClaim: snapshotParsed.claim,
      stagingObjectRefs: stagingParsed.refs,
      verificationCoverage: coverage,
      verificationClaimToken: null,
      verificationClaimedAtMs: null,
      expiresAtMs: input.expiresAtMs,
      progress: input.progress ?? null,
      terminalReason: null,
      canonicalJob: null,
      canonicalRequest: null,
      artifactObjectBinding: null,
      claimToken: null,
      claimedAtMs: null,
    };

    const validated = validateHeadlessProvisionalStoredJobRecord(draft, {
      requireStoreVersion: false,
    });
    if (!validated.ok) return validated;
    return { ok: true, record: toStoreWrite(validated.record) };
  } catch {
    return { ok: false, message: "Hostile or unreadable input rejected." };
  }
}

export function cancelProvisionalRecord(
  current: HeadlessProvisionalStoredJobRecord,
  nowMs: number,
  reason?: HeadlessTerminalReason,
): ProvisionalLifecycleResult {
  try {
    const terminalReason =
      reason ?? ({ reasonId: "CANCELLED_BY_USER", retryable: false } as const);
    const parsed = parseHeadlessTerminalReason(terminalReason);
    if (!parsed.ok) {
      return {
        ok: false,
        message: parsed.issues[0]?.message ?? "Invalid cancel terminal reason.",
      };
    }
    if (parsed.reason.reasonId !== "CANCELLED_BY_USER") {
      return {
        ok: false,
        message: "Provisional cancel requires CANCELLED_BY_USER.",
      };
    }
    return terminalWrite(current, {
      nowMs,
      state: "cancelled",
      terminalReason: parsed.reason,
    });
  } catch {
    return { ok: false, message: "Hostile or unreadable input rejected." };
  }
}

export function failProvisionalRecord(
  current: HeadlessProvisionalStoredJobRecord,
  nowMs: number,
  terminalReason: HeadlessTerminalReason,
): ProvisionalLifecycleResult {
  try {
    const parsed = parseHeadlessTerminalReason(terminalReason);
    if (!parsed.ok) {
      return {
        ok: false,
        message: parsed.issues[0]?.message ?? "Invalid fail terminal reason.",
      };
    }
    return terminalWrite(current, {
      nowMs,
      state: "failed",
      terminalReason: parsed.reason,
    });
  } catch {
    return { ok: false, message: "Hostile or unreadable input rejected." };
  }
}

export function expireProvisionalRecord(
  current: HeadlessProvisionalStoredJobRecord,
  nowMs: number,
): ProvisionalLifecycleResult {
  try {
    return terminalWrite(current, {
      nowMs,
      state: "expired",
      terminalReason: { reasonId: "EXPIRED", retryable: true },
    });
  } catch {
    return { ok: false, message: "Hostile or unreadable input rejected." };
  }
}

/**
 * Append-only staging reference update for previously unbound required targets.
 */
export function appendProvisionalStagingObjectRefs(
  current: HeadlessProvisionalStoredJobRecord,
  nextStagingObjectRefs: unknown,
  nowMs: number,
): ProvisionalLifecycleResult {
  try {
    const active = assertMaterializingActive(current);
    if (active) return active;
    const monotonic = assertMonotonicTimestamp(current, nowMs);
    if (monotonic) return monotonic;

    const expectedSlotKeySet = new Set(
      current.snapshotClaim.expectedSlotClaims.map((slot) => slot.slotKey),
    );
    const stagingParsed = validateHeadlessProvisionalStagingObjectRefs(
      nextStagingObjectRefs,
      expectedSlotKeySet,
    );
    if (!stagingParsed.ok) return stagingParsed;

    const stagingRules = assertProvisionalStagingRefsMonotonic({
      current: current.stagingObjectRefs,
      next: stagingParsed.refs,
      snapshot: current.snapshotClaim,
    });
    if (!stagingRules.ok) return stagingRules;

    const draft: HeadlessProvisionalStoreWrite = {
      ...toStoreWrite(current),
      updatedAtMs: nowMs,
      stagingObjectRefs: stagingParsed.refs,
    };
    const identity = preserveCoreIdentity(current, draft);
    if (identity) return identity;
    return validateWrite(draft);
  } catch {
    return { ok: false, message: "Hostile or unreadable input rejected." };
  }
}

export function updateProvisionalVerificationCoverage(
  current: HeadlessProvisionalStoredJobRecord,
  coverage: unknown,
  verificationClaimToken: string,
  claimedAtMs: number,
  nowMs: number,
): ProvisionalLifecycleResult {
  try {
    const active = assertMaterializingActive(current);
    if (active) return active;
    const monotonic = assertMonotonicTimestamp(current, nowMs);
    if (monotonic) return monotonic;

    if (
      current.verificationClaimToken != null &&
      current.verificationClaimToken !== verificationClaimToken
    ) {
      return {
        ok: false,
        message: "verificationClaimToken mismatch.",
      };
    }

    if (
      typeof claimedAtMs !== "number" ||
      !Number.isSafeInteger(claimedAtMs) ||
      claimedAtMs < current.createdAtMs ||
      claimedAtMs > nowMs
    ) {
      return { ok: false, message: "verificationClaimedAtMs invalid." };
    }

    const coverageValidated = validateHeadlessProvisionalVerificationCoverage(
      coverage,
      current.snapshotClaim,
      current.stagingObjectRefs,
    );
    if (!coverageValidated.ok) return coverageValidated;

    const monotonicCoverage = assertCoverageMonotonicAndBound({
      current: current.verificationCoverage,
      next: coverageValidated.coverage,
      snapshot: current.snapshotClaim,
      stagingObjectRefs: current.stagingObjectRefs,
    });
    if (!monotonicCoverage.ok) return monotonicCoverage;

    const draft: HeadlessProvisionalStoreWrite = {
      ...toStoreWrite(current),
      updatedAtMs: nowMs,
      verificationCoverage: coverageValidated.coverage,
      verificationClaimToken,
      verificationClaimedAtMs: claimedAtMs,
    };

    const identity = preserveCoreIdentity(current, draft);
    if (identity) return identity;
    return validateWrite(draft);
  } catch {
    return { ok: false, message: "Hostile or unreadable input rejected." };
  }
}

/** @internal test helper type re-export */
export type { HeadlessProvisionalVerificationCoverageV1 };
