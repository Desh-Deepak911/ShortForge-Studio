/**
 * Sprint 11E Phase 2E.2D.6H — bounded verify-first orchestrator evidence axes.
 * Never includes URLs, credentials, decoded values, or provider messages.
 */

import type { HeadlessFlyStagingSecretFlyStatus } from "./fly-staging-secret-activation";

export type HeadlessFlyStagingSecretsSyncStatus =
  | "not_run"
  | "synced_from_decoded_values"
  | "sync_failed";

export type HeadlessFlyStagingRemoteSchemaPreflightStatus =
  | "not_observed"
  | "pass"
  | "fail_database_unavailable"
  | "fail_other"
  | "unknown";

export type HeadlessFlyStagingLoopReadinessStatus =
  | "not_observed"
  | "started"
  | "not_started"
  | "unknown";

export type HeadlessFlyStagingRollbackResultStatus =
  | "not_run"
  | "confirmed_exact_zero"
  | "unconfirmed";

export type HeadlessFlyStagingOrchestratorEvidenceInput = {
  readonly secretsSyncStatus: HeadlessFlyStagingSecretsSyncStatus;
  readonly secretDeployAggregateStatus:
    | HeadlessFlyStagingSecretFlyStatus
    | "not_observed";
  readonly remoteSchemaPreflightStatus: HeadlessFlyStagingRemoteSchemaPreflightStatus;
  readonly loopReadinessStatus: HeadlessFlyStagingLoopReadinessStatus;
  readonly rollbackResultStatus: HeadlessFlyStagingRollbackResultStatus;
};

export type HeadlessFlyStagingOrchestratorEvidenceReasonId =
  | "ok"
  | "secrets_sync_missing_before_deploy"
  | "rollback_unconfirmed_claimed_clean"
  | "hostile_input";

export type HeadlessFlyStagingOrchestratorEvidenceDocument = {
  readonly status: "ok" | "invalid";
  readonly reasonId: HeadlessFlyStagingOrchestratorEvidenceReasonId;
  readonly secretsSyncStatus: HeadlessFlyStagingSecretsSyncStatus | null;
  readonly secretDeployAggregateStatus:
    | HeadlessFlyStagingSecretFlyStatus
    | "not_observed"
    | null;
  readonly remoteSchemaPreflightStatus: HeadlessFlyStagingRemoteSchemaPreflightStatus | null;
  readonly loopReadinessStatus: HeadlessFlyStagingLoopReadinessStatus | null;
  readonly rollbackResultStatus: HeadlessFlyStagingRollbackResultStatus | null;
  readonly secretValuesIncluded: false;
};

export function buildHeadlessFlyStagingOrchestratorEvidenceDocument(
  input: unknown,
): HeadlessFlyStagingOrchestratorEvidenceDocument {
  const empty = (
    reasonId: HeadlessFlyStagingOrchestratorEvidenceReasonId,
  ): HeadlessFlyStagingOrchestratorEvidenceDocument =>
    Object.freeze({
      status: "invalid",
      reasonId,
      secretsSyncStatus: null,
      secretDeployAggregateStatus: null,
      remoteSchemaPreflightStatus: null,
      loopReadinessStatus: null,
      rollbackResultStatus: null,
      secretValuesIncluded: false,
    });

  try {
    if (input == null || typeof input !== "object") {
      return empty("hostile_input");
    }
    const raw = input as HeadlessFlyStagingOrchestratorEvidenceInput;
    const allowedSync = new Set([
      "not_run",
      "synced_from_decoded_values",
      "sync_failed",
    ]);
    const allowedDeploy = new Set([
      "not_observed",
      "staged",
      "partial",
      "deployed",
      "unknown",
    ]);
    const allowedSchema = new Set([
      "not_observed",
      "pass",
      "fail_database_unavailable",
      "fail_other",
      "unknown",
    ]);
    const allowedLoop = new Set([
      "not_observed",
      "started",
      "not_started",
      "unknown",
    ]);
    const allowedRollback = new Set([
      "not_run",
      "confirmed_exact_zero",
      "unconfirmed",
    ]);
    if (!allowedSync.has(raw.secretsSyncStatus)) return empty("hostile_input");
    if (!allowedDeploy.has(raw.secretDeployAggregateStatus)) {
      return empty("hostile_input");
    }
    if (!allowedSchema.has(raw.remoteSchemaPreflightStatus)) {
      return empty("hostile_input");
    }
    if (!allowedLoop.has(raw.loopReadinessStatus)) return empty("hostile_input");
    if (!allowedRollback.has(raw.rollbackResultStatus)) {
      return empty("hostile_input");
    }
    if (
      raw.loopReadinessStatus === "started" &&
      raw.rollbackResultStatus === "confirmed_exact_zero"
    ) {
      return empty("rollback_unconfirmed_claimed_clean");
    }
    if (
      raw.secretsSyncStatus !== "synced_from_decoded_values" &&
      raw.secretDeployAggregateStatus === "deployed" &&
      raw.loopReadinessStatus === "started"
    ) {
      return empty("secrets_sync_missing_before_deploy");
    }
    return Object.freeze({
      status: "ok",
      reasonId: "ok",
      secretsSyncStatus: raw.secretsSyncStatus,
      secretDeployAggregateStatus: raw.secretDeployAggregateStatus,
      remoteSchemaPreflightStatus: raw.remoteSchemaPreflightStatus,
      loopReadinessStatus: raw.loopReadinessStatus,
      rollbackResultStatus: raw.rollbackResultStatus,
      secretValuesIncluded: false,
    });
  } catch {
    return empty("hostile_input");
  }
}

export const HEADLESS_FLY_STAGING_ORCHESTRATOR_EVIDENCE_CONTRACT = Object.freeze({
  distinguishesSecretsSyncFromDeploy: true,
  distinguishesRemoteSchemaPreflight: true,
  distinguishesLoopReadiness: true,
  distinguishesRollbackResult: true,
  neverIncludesSecretValues: true,
} as const);
