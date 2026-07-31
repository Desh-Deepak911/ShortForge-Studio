/**
 * Persistent one-forward-attempt budget for cleanup-runtime rollout targets.
 * Binds attempt state to app + rollout identity + target digest outside ephemeral logs.
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";

import {
  HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_AUTHORIZED_FORWARD_LIMIT,
  HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_INCIDENT_RECORD,
  buildHeadlessFlyStaging2G25DCleanupRuntimeRolloutIncidentLedger,
} from "./fly-staging-cleanup-runtime-rollout-incident-authority";
import {
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
  isHeadlessFlyStagingPermanentlyRejectedCleanupRuntimeDigest,
  isHeadlessFlyStagingPlaceholderCleanupRuntimeDigest,
} from "./fly-staging-cleanup-runtime-authority";

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_ATTEMPT_BUDGET_AUTHORITY_VERSION =
  1 as const;

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_IDENTITY =
  "post_007_2g25d_cleanup_runtime_rollout" as const;

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_ATTEMPT_STATE_RELATIVE_PATH =
  "docs/evidence/headless/operational/fly-staging-cleanup-runtime-rollout-attempt-state.json" as const;

export type HeadlessFlyStagingCleanupRuntimeRolloutAttemptKind =
  | "read_only_preflight"
  | "forward"
  | "rollback"
  | "manual_recovery";

export type HeadlessFlyStagingCleanupRuntimeRolloutAttemptStateEntry =
  Readonly<{
    readonly kind: HeadlessFlyStagingCleanupRuntimeRolloutAttemptKind;
    readonly targetDigestSha256: string;
    readonly sequence: number;
    readonly recordedAtIso: string;
    readonly deployPerformed: boolean;
    readonly acceptancePassed: boolean | null;
    readonly protocolDeviation: boolean;
    readonly sanitizedNote: string;
  }>;

export type HeadlessFlyStagingCleanupRuntimeRolloutAttemptState =
  Readonly<{
    readonly authorityVersion: typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_ATTEMPT_BUDGET_AUTHORITY_VERSION;
    readonly rolloutIdentity: typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_IDENTITY;
    readonly appName: string;
    readonly authorizedForwardLimitPerDigest: typeof HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_AUTHORIZED_FORWARD_LIMIT;
    readonly incidentSealed: boolean;
    readonly entries: readonly HeadlessFlyStagingCleanupRuntimeRolloutAttemptStateEntry[];
  }>;

const DIGEST_RE = /^[a-f0-9]{64}$/;

export type HeadlessFlyStagingCleanupRuntimeRolloutAttemptBudgetReasonId =
  | "ok"
  | "hostile_input"
  | "missing_attempt_state"
  | "incoherent_attempt_state"
  | "rejected_target_digest"
  | "forward_budget_exhausted"
  | "forward_after_known_deployment_without_state"
  | "new_target_digest_requires_new_authorization";

export function resolveHeadlessFlyStagingCleanupRuntimeRolloutAttemptStatePath(
  footiebitzRoot: string,
): string {
  return path.join(
    footiebitzRoot,
    HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_ATTEMPT_STATE_RELATIVE_PATH,
  );
}

export function buildInitialHeadlessFlyStagingCleanupRuntimeRolloutAttemptState(input: {
  readonly appName: string;
}): HeadlessFlyStagingCleanupRuntimeRolloutAttemptState {
  const incidentEntries = buildHeadlessFlyStaging2G25DCleanupRuntimeRolloutIncidentLedger();
  const entries: HeadlessFlyStagingCleanupRuntimeRolloutAttemptStateEntry[] = [];
  let forwardSequence = 0;
  let rollbackSequence = 0;
  for (const entry of incidentEntries) {
    if (entry.attemptKind === "forward") {
      forwardSequence += 1;
      entries.push(
        Object.freeze({
          kind: "forward",
          targetDigestSha256: entry.imageDigestSha256,
          sequence: forwardSequence,
          recordedAtIso: "2026-07-31T12:39:33.000Z",
          deployPerformed: entry.providerContactPerformed,
          acceptancePassed: entry.acceptancePassed,
          protocolDeviation: entry.protocolDeviation,
          sanitizedNote: "recovered_part_b_incident",
        }),
      );
    }
    if (entry.attemptKind === "rollback") {
      rollbackSequence += 1;
      entries.push(
        Object.freeze({
          kind: "rollback",
          targetDigestSha256: entry.imageDigestSha256,
          sequence: rollbackSequence,
          recordedAtIso: "2026-07-31T12:44:09.000Z",
          deployPerformed: entry.providerContactPerformed,
          acceptancePassed: entry.acceptancePassed,
          protocolDeviation: entry.protocolDeviation,
          sanitizedNote: "recovered_part_b_incident",
        }),
      );
    }
    if (entry.attemptKind === "manual_recovery") {
      entries.push(
        Object.freeze({
          kind: "manual_recovery",
          targetDigestSha256: entry.imageDigestSha256,
          sequence: 1,
          recordedAtIso: "2026-07-31T12:48:21.000Z",
          deployPerformed: true,
          acceptancePassed: true,
          protocolDeviation: false,
          sanitizedNote: "manual_bridge_recovery_v49",
        }),
      );
    }
  }
  entries.push(
    Object.freeze({
      kind: "read_only_preflight",
      targetDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
      sequence: 1,
      recordedAtIso: "2026-07-31T12:36:11.000Z",
      deployPerformed: false,
      acceptancePassed: null,
      protocolDeviation: false,
      sanitizedNote: "live4_topology_classification_failed",
    }),
  );
  return Object.freeze({
    authorityVersion:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_ATTEMPT_BUDGET_AUTHORITY_VERSION,
    rolloutIdentity: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_IDENTITY,
    appName: input.appName,
    authorizedForwardLimitPerDigest:
      HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_AUTHORIZED_FORWARD_LIMIT,
    incidentSealed: true,
    entries: Object.freeze(entries),
  });
}

export function parseHeadlessFlyStagingCleanupRuntimeRolloutAttemptState(
  raw: unknown,
): HeadlessFlyStagingCleanupRuntimeRolloutAttemptState | null {
  if (raw == null || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (
    value.authorityVersion !==
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_ATTEMPT_BUDGET_AUTHORITY_VERSION ||
    value.rolloutIdentity !== HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_IDENTITY ||
    typeof value.appName !== "string" ||
    value.appName.trim().length === 0 ||
    value.authorizedForwardLimitPerDigest !==
      HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_AUTHORIZED_FORWARD_LIMIT ||
    typeof value.incidentSealed !== "boolean" ||
    !Array.isArray(value.entries)
  ) {
    return null;
  }
  const entries: HeadlessFlyStagingCleanupRuntimeRolloutAttemptStateEntry[] = [];
  for (const entry of value.entries) {
    if (entry == null || typeof entry !== "object") return null;
    const row = entry as Record<string, unknown>;
    if (
      (row.kind !== "read_only_preflight" &&
        row.kind !== "forward" &&
        row.kind !== "rollback" &&
        row.kind !== "manual_recovery") ||
      typeof row.targetDigestSha256 !== "string" ||
      !DIGEST_RE.test(row.targetDigestSha256) ||
      typeof row.sequence !== "number" ||
      !Number.isInteger(row.sequence) ||
      row.sequence < 1 ||
      typeof row.recordedAtIso !== "string" ||
      typeof row.deployPerformed !== "boolean" ||
      (row.acceptancePassed !== null && typeof row.acceptancePassed !== "boolean") ||
      typeof row.protocolDeviation !== "boolean" ||
      typeof row.sanitizedNote !== "string"
    ) {
      return null;
    }
    entries.push(
      Object.freeze({
        kind: row.kind,
        targetDigestSha256: row.targetDigestSha256,
        sequence: row.sequence,
        recordedAtIso: row.recordedAtIso,
        deployPerformed: row.deployPerformed,
        acceptancePassed: row.acceptancePassed as boolean | null,
        protocolDeviation: row.protocolDeviation,
        sanitizedNote: row.sanitizedNote,
      }),
    );
  }
  return Object.freeze({
    authorityVersion:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_ATTEMPT_BUDGET_AUTHORITY_VERSION,
    rolloutIdentity: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_ROLLOUT_IDENTITY,
    appName: value.appName,
    authorizedForwardLimitPerDigest:
      HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_AUTHORIZED_FORWARD_LIMIT,
    incidentSealed: value.incidentSealed,
    entries: Object.freeze(entries),
  });
}

export function loadHeadlessFlyStagingCleanupRuntimeRolloutAttemptState(input: {
  readonly footiebitzRoot: string;
  readonly appName: string;
}):
  | { readonly ok: true; readonly state: HeadlessFlyStagingCleanupRuntimeRolloutAttemptState }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingCleanupRuntimeRolloutAttemptBudgetReasonId;
    } {
  const statePath = resolveHeadlessFlyStagingCleanupRuntimeRolloutAttemptStatePath(
    input.footiebitzRoot,
  );
  try {
    const parsed = parseHeadlessFlyStagingCleanupRuntimeRolloutAttemptState(
      JSON.parse(readFileSync(statePath, "utf8")),
    );
    if (parsed == null) {
      return Object.freeze({ ok: false, reasonId: "incoherent_attempt_state" });
    }
    if (parsed.appName !== input.appName) {
      return Object.freeze({ ok: false, reasonId: "incoherent_attempt_state" });
    }
    return Object.freeze({ ok: true, state: parsed });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return Object.freeze({ ok: false, reasonId: "missing_attempt_state" });
    }
    return Object.freeze({ ok: false, reasonId: "incoherent_attempt_state" });
  }
}

export function persistHeadlessFlyStagingCleanupRuntimeRolloutAttemptState(input: {
  readonly footiebitzRoot: string;
  readonly state: HeadlessFlyStagingCleanupRuntimeRolloutAttemptState;
}): void {
  const statePath = resolveHeadlessFlyStagingCleanupRuntimeRolloutAttemptStatePath(
    input.footiebitzRoot,
  );
  mkdirSync(path.dirname(statePath), { recursive: true });
  const tmpPath = `${statePath}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(input.state, null, 2)}\n`, "utf8");
  renameSync(tmpPath, statePath);
}

export function countForwardAttemptsForDigest(
  state: HeadlessFlyStagingCleanupRuntimeRolloutAttemptState,
  targetDigestSha256: string,
): number {
  return state.entries.filter(
    (entry) =>
      entry.kind === "forward" &&
      entry.targetDigestSha256 === targetDigestSha256 &&
      entry.deployPerformed,
  ).length;
}

export function classifyHeadlessFlyStagingCleanupRuntimeForwardAttemptBudget(input: {
  readonly state: HeadlessFlyStagingCleanupRuntimeRolloutAttemptState | null;
  readonly appName: string;
  readonly targetDigestSha256: unknown;
  readonly forwardDeployKnownCompleted?: boolean;
  readonly newTargetAuthorizationPresent?: boolean;
}):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingCleanupRuntimeRolloutAttemptBudgetReasonId;
    } {
  if (
    typeof input.targetDigestSha256 !== "string" ||
    !DIGEST_RE.test(input.targetDigestSha256)
  ) {
    return Object.freeze({ ok: false, reasonId: "hostile_input" });
  }
  if (isHeadlessFlyStagingPermanentlyRejectedCleanupRuntimeDigest(input.targetDigestSha256)) {
    return Object.freeze({ ok: false, reasonId: "rejected_target_digest" });
  }
  if (input.state == null) {
    if (input.forwardDeployKnownCompleted) {
      return Object.freeze({
        ok: false,
        reasonId: "forward_after_known_deployment_without_state",
      });
    }
    return Object.freeze({ ok: false, reasonId: "missing_attempt_state" });
  }
  if (input.state.appName !== input.appName) {
    return Object.freeze({ ok: false, reasonId: "incoherent_attempt_state" });
  }
  const used = countForwardAttemptsForDigest(input.state, input.targetDigestSha256);
  if (used >= input.state.authorizedForwardLimitPerDigest) {
    return Object.freeze({ ok: false, reasonId: "forward_budget_exhausted" });
  }
  if (
    used === 0 &&
    input.targetDigestSha256 ===
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST &&
    !isHeadlessFlyStagingPlaceholderCleanupRuntimeDigest(
      input.targetDigestSha256,
    ) &&
    input.state.incidentSealed &&
    input.newTargetAuthorizationPresent !== true
  ) {
    return Object.freeze({
      ok: false,
      reasonId: "new_target_digest_requires_new_authorization",
    });
  }
  return Object.freeze({ ok: true });
}

export function appendHeadlessFlyStagingCleanupRuntimeRolloutAttemptEntry(input: {
  readonly state: HeadlessFlyStagingCleanupRuntimeRolloutAttemptState;
  readonly entry: HeadlessFlyStagingCleanupRuntimeRolloutAttemptStateEntry;
}): HeadlessFlyStagingCleanupRuntimeRolloutAttemptState {
  return Object.freeze({
    ...input.state,
    entries: Object.freeze([...input.state.entries, input.entry]),
  });
}

export function sealHeadlessFlyStagingCleanupRuntimeRolloutIncidentState(input: {
  readonly appName: string;
}): HeadlessFlyStagingCleanupRuntimeRolloutAttemptState {
  return buildInitialHeadlessFlyStagingCleanupRuntimeRolloutAttemptState(input);
}

export function reconcileHeadlessFlyStagingCleanupRuntimeRolloutAttemptBudgetWithIncident(): {
  readonly incident: typeof HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_INCIDENT_RECORD;
  readonly forwardAttemptsForRejectedDigest: number;
  readonly protocolCompliance: "deviated";
} {
  const forwardAttemptsForRejectedDigest = countForwardAttemptsForDigest(
    buildInitialHeadlessFlyStagingCleanupRuntimeRolloutAttemptState({
      appName: "shortforge-hw-staging-4def8fa0",
    }),
    HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
  );
  return Object.freeze({
    incident: HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_INCIDENT_RECORD,
    forwardAttemptsForRejectedDigest,
    protocolCompliance: "deviated",
  });
}
