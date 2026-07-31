/**
 * Append-only one-time candidate recovery ledger.
 *
 * Preserves the sealed cleanup-runtime incident ledger. Recovery deploys and
 * candidate probes are recorded here as `one_time_candidate_recovery` actions
 * and never rewrite original forward/rollback entries.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
} from "./fly-staging-cleanup-runtime-authority";
import {
  HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_PROTOCOL_RECOVERY_AUTHORIZATION,
  HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_RECOVERY_DECISION,
} from "./fly-staging-deployed-validation-candidate-authority";
import {
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
} from "./fly-staging-rollback-bridge-authority";

export const HEADLESS_FLY_STAGING_CANDIDATE_RECOVERY_LEDGER_AUTHORITY_VERSION =
  1 as const;

export const HEADLESS_FLY_STAGING_CANDIDATE_RECOVERY_LEDGER_RELATIVE_PATH =
  "docs/evidence/headless/operational/fly-staging-candidate-recovery-ledger.json" as const;

export const HEADLESS_FLY_STAGING_CANDIDATE_VALIDATION_CYCLE_STATE_RELATIVE_PATH =
  "docs/evidence/headless/operational/fly-staging-candidate-validation-cycle-state.json" as const;

export type HeadlessFlyStagingCandidateRecoveryActionKind =
  | "one_time_candidate_recovery"
  | "candidate_validation_probe"
  | "candidate_rollback"
  | "candidate_promotion";

export type HeadlessFlyStagingCandidateRecoveryLedgerEntry = Readonly<{
  readonly kind: HeadlessFlyStagingCandidateRecoveryActionKind;
  readonly targetDigestSha256: string;
  readonly sequence: number;
  readonly recordedAtIso: string;
  readonly deployPerformed: boolean;
  readonly acceptancePassed: boolean | null;
  readonly probeJobCreated: boolean | null;
  readonly sanitizedNote: string;
}>;

export type HeadlessFlyStagingCandidateRecoveryLedger = Readonly<{
  readonly authorityVersion: typeof HEADLESS_FLY_STAGING_CANDIDATE_RECOVERY_LEDGER_AUTHORITY_VERSION;
  readonly appName: string;
  readonly candidateDigestSha256: typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST;
  readonly rollbackDigestSha256: typeof HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST;
  readonly incidentCommitSha: "7bd84c355163f5238242d0ee7945c56778b981da";
  readonly candidateAuthorityCommitSha: "36dba1c0240a091b63f1ad2bdd48f33974c84503";
  readonly recoveryDecision: typeof HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_RECOVERY_DECISION;
  readonly recoveryAuthorizationConsumed: boolean;
  readonly candidateProbeAuthorizationConsumed: boolean;
  readonly promoted: boolean;
  readonly entries: readonly HeadlessFlyStagingCandidateRecoveryLedgerEntry[];
}>;

export type HeadlessFlyStagingCandidateValidationCyclePersistedState =
  Readonly<{
    readonly authorityVersion: 1;
    readonly candidateDigestSha256: string;
    readonly lifecycle:
      | "deployed_validation_candidate"
      | "promoted_current"
      | "rejected"
      | "expired"
      | "protocol_incident_blocked";
    readonly probeAttemptCount: 0 | 1;
    readonly forwardAttemptCountForCandidate: 1;
    readonly rolloutAcceptanceBoundaryIso: string;
    readonly authorizedUntilIso: string;
    readonly verifyMachineId: string;
    readonly renderMachineId: string;
    readonly verifyLoopAccepted: boolean;
    readonly renderLoopAccepted: boolean;
    readonly protocolRecoveryAuthorizationPresent: true;
    readonly maintenanceEnabled: false;
  }>;

const DIGEST_RE = /^[a-f0-9]{64}$/;

export function resolveHeadlessFlyStagingCandidateRecoveryLedgerPath(
  footiebitzRoot: string,
): string {
  return path.join(
    footiebitzRoot,
    HEADLESS_FLY_STAGING_CANDIDATE_RECOVERY_LEDGER_RELATIVE_PATH,
  );
}

export function resolveHeadlessFlyStagingCandidateValidationCycleStatePath(
  footiebitzRoot: string,
): string {
  return path.join(
    footiebitzRoot,
    HEADLESS_FLY_STAGING_CANDIDATE_VALIDATION_CYCLE_STATE_RELATIVE_PATH,
  );
}

export function buildInitialHeadlessFlyStagingCandidateRecoveryLedger(input: {
  readonly appName: string;
}): HeadlessFlyStagingCandidateRecoveryLedger {
  return Object.freeze({
    authorityVersion:
      HEADLESS_FLY_STAGING_CANDIDATE_RECOVERY_LEDGER_AUTHORITY_VERSION,
    appName: input.appName,
    candidateDigestSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
    rollbackDigestSha256: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
    incidentCommitSha: "7bd84c355163f5238242d0ee7945c56778b981da",
    candidateAuthorityCommitSha: "36dba1c0240a091b63f1ad2bdd48f33974c84503",
    recoveryDecision:
      HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_RECOVERY_DECISION,
    recoveryAuthorizationConsumed: false,
    candidateProbeAuthorizationConsumed: false,
    promoted: false,
    entries: Object.freeze([]),
  });
}

export function parseHeadlessFlyStagingCandidateRecoveryLedger(
  raw: unknown,
): HeadlessFlyStagingCandidateRecoveryLedger | null {
  if (raw == null || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (
    value.authorityVersion !==
      HEADLESS_FLY_STAGING_CANDIDATE_RECOVERY_LEDGER_AUTHORITY_VERSION ||
    typeof value.appName !== "string" ||
    value.candidateDigestSha256 !==
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST ||
    value.rollbackDigestSha256 !==
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST ||
    value.incidentCommitSha !== "7bd84c355163f5238242d0ee7945c56778b981da" ||
    value.candidateAuthorityCommitSha !==
      "36dba1c0240a091b63f1ad2bdd48f33974c84503" ||
    value.recoveryDecision !==
      HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_RECOVERY_DECISION ||
    typeof value.recoveryAuthorizationConsumed !== "boolean" ||
    typeof value.candidateProbeAuthorizationConsumed !== "boolean" ||
    typeof value.promoted !== "boolean" ||
    !Array.isArray(value.entries)
  ) {
    return null;
  }
  const entries: HeadlessFlyStagingCandidateRecoveryLedgerEntry[] = [];
  for (const entry of value.entries) {
    if (entry == null || typeof entry !== "object") return null;
    const row = entry as Record<string, unknown>;
    if (
      (row.kind !== "one_time_candidate_recovery" &&
        row.kind !== "candidate_validation_probe" &&
        row.kind !== "candidate_rollback" &&
        row.kind !== "candidate_promotion") ||
      typeof row.targetDigestSha256 !== "string" ||
      !DIGEST_RE.test(row.targetDigestSha256) ||
      typeof row.sequence !== "number" ||
      !Number.isInteger(row.sequence) ||
      row.sequence < 1 ||
      typeof row.recordedAtIso !== "string" ||
      typeof row.deployPerformed !== "boolean" ||
      (row.acceptancePassed !== null &&
        typeof row.acceptancePassed !== "boolean") ||
      (row.probeJobCreated !== null &&
        typeof row.probeJobCreated !== "boolean") ||
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
        probeJobCreated: row.probeJobCreated as boolean | null,
        sanitizedNote: row.sanitizedNote,
      }),
    );
  }
  return Object.freeze({
    authorityVersion:
      HEADLESS_FLY_STAGING_CANDIDATE_RECOVERY_LEDGER_AUTHORITY_VERSION,
    appName: value.appName,
    candidateDigestSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
    rollbackDigestSha256: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
    incidentCommitSha: "7bd84c355163f5238242d0ee7945c56778b981da",
    candidateAuthorityCommitSha: "36dba1c0240a091b63f1ad2bdd48f33974c84503",
    recoveryDecision:
      HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_RECOVERY_DECISION,
    recoveryAuthorizationConsumed: value.recoveryAuthorizationConsumed,
    candidateProbeAuthorizationConsumed:
      value.candidateProbeAuthorizationConsumed,
    promoted: value.promoted,
    entries: Object.freeze(entries),
  });
}

export function loadHeadlessFlyStagingCandidateRecoveryLedger(input: {
  readonly footiebitzRoot: string;
  readonly appName: string;
}): HeadlessFlyStagingCandidateRecoveryLedger {
  const filePath = resolveHeadlessFlyStagingCandidateRecoveryLedgerPath(
    input.footiebitzRoot,
  );
  try {
    const parsed = parseHeadlessFlyStagingCandidateRecoveryLedger(
      JSON.parse(readFileSync(filePath, "utf8")),
    );
    if (parsed == null || parsed.appName !== input.appName) {
      return buildInitialHeadlessFlyStagingCandidateRecoveryLedger({
        appName: input.appName,
      });
    }
    return parsed;
  } catch {
    return buildInitialHeadlessFlyStagingCandidateRecoveryLedger({
      appName: input.appName,
    });
  }
}

function atomicWriteJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(tmp, filePath);
}

export function persistHeadlessFlyStagingCandidateRecoveryLedger(input: {
  readonly footiebitzRoot: string;
  readonly ledger: HeadlessFlyStagingCandidateRecoveryLedger;
}): void {
  atomicWriteJson(
    resolveHeadlessFlyStagingCandidateRecoveryLedgerPath(input.footiebitzRoot),
    input.ledger,
  );
}

export function classifyHeadlessFlyStagingCandidateRecoveryDeployBudget(input: {
  readonly ledger: HeadlessFlyStagingCandidateRecoveryLedger;
}):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reasonId:
        | "recovery_authorization_consumed"
        | "recovery_decision_mismatch"
        | "recovery_already_promoted";
    } {
  if (
    input.ledger.recoveryDecision !==
    HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_RECOVERY_DECISION
  ) {
    return Object.freeze({
      ok: false,
      reasonId: "recovery_decision_mismatch",
    });
  }
  if (input.ledger.promoted) {
    return Object.freeze({
      ok: false,
      reasonId: "recovery_already_promoted",
    });
  }
  if (input.ledger.recoveryAuthorizationConsumed) {
    return Object.freeze({
      ok: false,
      reasonId: "recovery_authorization_consumed",
    });
  }
  const recoveryDeploys = input.ledger.entries.filter(
    (entry) => entry.kind === "one_time_candidate_recovery",
  );
  if (recoveryDeploys.length > 0) {
    return Object.freeze({
      ok: false,
      reasonId: "recovery_authorization_consumed",
    });
  }
  // Authorization record itself remains the grant source of truth.
  void HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_PROTOCOL_RECOVERY_AUTHORIZATION;
  return Object.freeze({ ok: true });
}

export function classifyHeadlessFlyStagingCandidateRecoveryProbeBudget(input: {
  readonly ledger: HeadlessFlyStagingCandidateRecoveryLedger;
}):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reasonId:
        | "candidate_probe_authorization_consumed"
        | "recovery_deploy_missing"
        | "recovery_already_promoted";
    } {
  if (input.ledger.promoted) {
    return Object.freeze({
      ok: false,
      reasonId: "recovery_already_promoted",
    });
  }
  if (input.ledger.candidateProbeAuthorizationConsumed) {
    return Object.freeze({
      ok: false,
      reasonId: "candidate_probe_authorization_consumed",
    });
  }
  const recoveryAccepted = input.ledger.entries.some(
    (entry) =>
      entry.kind === "one_time_candidate_recovery" &&
      entry.acceptancePassed === true,
  );
  if (!recoveryAccepted) {
    return Object.freeze({
      ok: false,
      reasonId: "recovery_deploy_missing",
    });
  }
  return Object.freeze({ ok: true });
}

export function appendHeadlessFlyStagingCandidateRecoveryLedgerEntry(input: {
  readonly ledger: HeadlessFlyStagingCandidateRecoveryLedger;
  readonly entry: Omit<HeadlessFlyStagingCandidateRecoveryLedgerEntry, "sequence"> & {
    readonly sequence?: number;
  };
  readonly consumeRecoveryAuthorization?: boolean;
  readonly consumeProbeAuthorization?: boolean;
  readonly markPromoted?: boolean;
}): HeadlessFlyStagingCandidateRecoveryLedger {
  const sameKind = input.ledger.entries.filter(
    (entry) => entry.kind === input.entry.kind,
  );
  const sequence = input.entry.sequence ?? sameKind.length + 1;
  return Object.freeze({
    ...input.ledger,
    recoveryAuthorizationConsumed:
      input.consumeRecoveryAuthorization === true
        ? true
        : input.ledger.recoveryAuthorizationConsumed,
    candidateProbeAuthorizationConsumed:
      input.consumeProbeAuthorization === true
        ? true
        : input.ledger.candidateProbeAuthorizationConsumed,
    promoted:
      input.markPromoted === true ? true : input.ledger.promoted,
    entries: Object.freeze([
      ...input.ledger.entries,
      Object.freeze({
        kind: input.entry.kind,
        targetDigestSha256: input.entry.targetDigestSha256,
        sequence,
        recordedAtIso: input.entry.recordedAtIso,
        deployPerformed: input.entry.deployPerformed,
        acceptancePassed: input.entry.acceptancePassed,
        probeJobCreated: input.entry.probeJobCreated,
        sanitizedNote: input.entry.sanitizedNote,
      }),
    ]),
  });
}

export function persistHeadlessFlyStagingCandidateValidationCycleState(input: {
  readonly footiebitzRoot: string;
  readonly state: HeadlessFlyStagingCandidateValidationCyclePersistedState;
}): void {
  atomicWriteJson(
    resolveHeadlessFlyStagingCandidateValidationCycleStatePath(
      input.footiebitzRoot,
    ),
    input.state,
  );
}

export function loadHeadlessFlyStagingCandidateValidationCycleState(input: {
  readonly footiebitzRoot: string;
}): HeadlessFlyStagingCandidateValidationCyclePersistedState | null {
  try {
    const raw = JSON.parse(
      readFileSync(
        resolveHeadlessFlyStagingCandidateValidationCycleStatePath(
          input.footiebitzRoot,
        ),
        "utf8",
      ),
    ) as HeadlessFlyStagingCandidateValidationCyclePersistedState;
    if (
      raw.authorityVersion !== 1 ||
      typeof raw.candidateDigestSha256 !== "string" ||
      !DIGEST_RE.test(raw.candidateDigestSha256)
    ) {
      return null;
    }
    return Object.freeze(raw);
  } catch {
    return null;
  }
}
