/**
 * Total mapper for headless_jobs rows → validated frozen stored records.
 * Explicit columns only; JSONB is untrusted and revalidated in TypeScript.
 * BIGINT columns accept PostgreSQL decimal-string wire form.
 */

import { deepFreezeHeadlessValue } from "../../domain/headless-deep-freeze";
import { guardHeadlessStructure, isPlainObject } from "../../domain/headless-hostile-guard";
import {
  parseHeadlessPgSafeInteger,
  parseHeadlessPgSafeIntegerOrNull,
} from "./parse-headless-pg-safe-integer";
import {
  validateHeadlessCanonicalStoredJobRecord,
  validateHeadlessProvisionalStoredJobRecord,
} from "./validate-provisional-stored-job";
import type {
  HeadlessCanonicalStoredJobRecord,
  HeadlessProvisionalStoredJobRecord,
  HeadlessStoredJobRecord,
} from "../types/stored-job-record";

/** Explicit selected columns — never SELECT *. */
export const HEADLESS_JOB_SELECT_COLUMNS = [
  "job_id",
  "stage",
  "state",
  "owner_id",
  "project_id",
  "store_version",
  "operation_id",
  "idempotency_authority_key",
  "creator_idempotency_key",
  "requested_renderer_profile",
  "requested_renderer_build_id",
  "provisional",
  "canonical_job",
  "canonical_request",
  "claim_token",
  "claimed_at_ms",
  "artifact_object_binding",
  "created_at_ms",
  "updated_at_ms",
  "expires_at_ms",
  "terminal_reason",
  "verification_claim_token",
  "verification_claimed_at_ms",
] as const;

export const HEADLESS_JOB_SELECT_SQL = HEADLESS_JOB_SELECT_COLUMNS.join(", ");

/** Fields stored inside provisional JSONB (not denormalized columns). */
export type HeadlessProvisionalJsonPayload = {
  readonly snapshotClaim: unknown;
  readonly stagingObjectRefs: unknown;
  readonly verificationCoverage: unknown;
  readonly progress: unknown;
};

export function serializeProvisionalJsonPayload(
  record: HeadlessProvisionalStoredJobRecord | Omit<HeadlessProvisionalStoredJobRecord, "storeVersion">,
): HeadlessProvisionalJsonPayload {
  return {
    snapshotClaim: record.snapshotClaim,
    stagingObjectRefs: record.stagingObjectRefs,
    verificationCoverage: record.verificationCoverage,
    progress: record.progress,
  };
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

/**
 * Reconstruct exactly one provisional or canonical stored-record variant.
 * Rejects mixed-stage payloads and column/JSON state disagreement.
 */
export function mapHeadlessJobSqlRow(
  row: unknown,
):
  | { readonly ok: true; readonly record: HeadlessStoredJobRecord }
  | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(row)) {
      return { ok: false, message: "Hostile job row rejected." };
    }
    if (!isPlainObject(row)) {
      return { ok: false, message: "Job row must be a plain object." };
    }
    const r = row as Record<string, unknown>;

    const stage = r.stage;
    if (stage !== "provisional" && stage !== "canonical") {
      return { ok: false, message: "Job row stage invalid." };
    }

    if (
      typeof r.job_id !== "string" ||
      typeof r.owner_id !== "string" ||
      typeof r.project_id !== "string" ||
      typeof r.operation_id !== "string" ||
      typeof r.idempotency_authority_key !== "string" ||
      typeof r.state !== "string"
    ) {
      return { ok: false, message: "Job row scalar identity malformed." };
    }

    const storeVersion = parseHeadlessPgSafeInteger(r.store_version, { min: 1 });
    if (!storeVersion.ok) {
      return { ok: false, message: "Job row store_version unsafe." };
    }
    const createdAtMs = parseHeadlessPgSafeInteger(r.created_at_ms, { min: 0 });
    if (!createdAtMs.ok) {
      return { ok: false, message: "Job row created_at_ms unsafe." };
    }
    const updatedAtMs = parseHeadlessPgSafeInteger(r.updated_at_ms, { min: 0 });
    if (!updatedAtMs.ok) {
      return { ok: false, message: "Job row updated_at_ms unsafe." };
    }

    if (stage === "provisional") {
      if (r.canonical_job != null || r.canonical_request != null) {
        return { ok: false, message: "Mixed-stage provisional payload rejected." };
      }
      if (r.artifact_object_binding != null) {
        return { ok: false, message: "Provisional artifact binding rejected." };
      }
      if (r.claim_token != null || r.claimed_at_ms != null) {
        return { ok: false, message: "Provisional render claim rejected." };
      }
      if (!isPlainObject(r.provisional)) {
        return { ok: false, message: "Provisional JSONB missing or hostile." };
      }
      if (guardHeadlessStructure(r.provisional)) {
        return { ok: false, message: "Hostile provisional JSONB rejected." };
      }
      const payload = r.provisional as Record<string, unknown>;
      if (
        payload.state !== undefined ||
        payload.jobId !== undefined ||
        payload.stage !== undefined
      ) {
        return {
          ok: false,
          message: "Provisional JSONB must not duplicate denormalized identity.",
        };
      }
      const expiresAtMs = parseHeadlessPgSafeInteger(r.expires_at_ms, { min: 0 });
      if (!expiresAtMs.ok) {
        return { ok: false, message: "Provisional expires_at_ms unsafe." };
      }
      if (typeof r.creator_idempotency_key !== "string") {
        return { ok: false, message: "Provisional creator_idempotency_key malformed." };
      }
      if (typeof r.requested_renderer_build_id !== "string") {
        return {
          ok: false,
          message: "Provisional requested_renderer_build_id malformed.",
        };
      }
      if (!isPlainObject(r.requested_renderer_profile)) {
        return {
          ok: false,
          message: "Provisional requested_renderer_profile malformed.",
        };
      }

      const verificationClaimedAtMs = parseHeadlessPgSafeIntegerOrNull(
        r.verification_claimed_at_ms,
        { min: 0 },
      );
      if (!verificationClaimedAtMs.ok) {
        return {
          ok: false,
          message: "Provisional verification_claimed_at_ms unsafe.",
        };
      }

      const draft = {
        version: 1 as const,
        stage: "provisional" as const,
        storeVersion: storeVersion.value,
        jobId: r.job_id,
        ownerId: r.owner_id,
        projectId: r.project_id,
        createdAtMs: createdAtMs.value,
        updatedAtMs: updatedAtMs.value,
        idempotencyAuthorityKey: r.idempotency_authority_key,
        operationId: r.operation_id,
        state: r.state,
        creatorIdempotencyKey: r.creator_idempotency_key,
        requestedRendererProfile: r.requested_renderer_profile,
        requestedRendererBuildId: r.requested_renderer_build_id,
        snapshotClaim: payload.snapshotClaim,
        stagingObjectRefs: payload.stagingObjectRefs,
        verificationCoverage: payload.verificationCoverage,
        progress: payload.progress ?? null,
        verificationClaimToken: asNullableString(r.verification_claim_token),
        verificationClaimedAtMs: verificationClaimedAtMs.value,
        expiresAtMs: expiresAtMs.value,
        terminalReason: r.terminal_reason ?? null,
        canonicalJob: null,
        canonicalRequest: null,
        artifactObjectBinding: null,
        claimToken: null,
        claimedAtMs: null,
      };

      if (draft.verificationClaimToken === undefined) {
        return { ok: false, message: "Provisional verification claim scalars malformed." };
      }

      const validated = validateHeadlessProvisionalStoredJobRecord(draft, {
        requireStoreVersion: true,
      });
      if (!validated.ok) {
        return { ok: false, message: validated.message };
      }
      return {
        ok: true,
        record: deepFreezeHeadlessValue(validated.record),
      };
    }

    // canonical
    if (r.provisional != null) {
      return { ok: false, message: "Mixed-stage canonical payload rejected." };
    }
    if (!isPlainObject(r.canonical_job) || !isPlainObject(r.canonical_request)) {
      return { ok: false, message: "Canonical JSONB missing or hostile." };
    }
    if (guardHeadlessStructure(r.canonical_job) || guardHeadlessStructure(r.canonical_request)) {
      return { ok: false, message: "Hostile canonical JSONB rejected." };
    }

    const jsonState = (r.canonical_job as Record<string, unknown>).state;
    if (typeof jsonState !== "string" || jsonState !== r.state) {
      return {
        ok: false,
        message: "Canonical column state disagrees with JSON state.",
      };
    }

    const claimToken = asNullableString(r.claim_token);
    const claimedAtMs = parseHeadlessPgSafeIntegerOrNull(r.claimed_at_ms, {
      min: 0,
    });
    if (claimToken === undefined || !claimedAtMs.ok) {
      return { ok: false, message: "Canonical claim scalars malformed." };
    }

    const draft = {
      version: 1 as const,
      stage: "canonical" as const,
      storeVersion: storeVersion.value,
      jobId: r.job_id,
      ownerId: r.owner_id,
      projectId: r.project_id,
      createdAtMs: createdAtMs.value,
      updatedAtMs: updatedAtMs.value,
      idempotencyAuthorityKey: r.idempotency_authority_key,
      operationId: r.operation_id,
      canonicalJob: r.canonical_job,
      canonicalRequest: r.canonical_request,
      claimToken,
      claimedAtMs: claimedAtMs.value,
      artifactObjectBinding: r.artifact_object_binding ?? null,
    };

    const validated = validateHeadlessCanonicalStoredJobRecord(draft);
    if (!validated.ok) {
      return { ok: false, message: validated.message };
    }
    return {
      ok: true,
      record: deepFreezeHeadlessValue(validated.record),
    };
  } catch {
    return { ok: false, message: "Hostile job row rejected." };
  }
}

export function mapHeadlessJobSqlRowAsProvisional(
  row: unknown,
):
  | { readonly ok: true; readonly record: HeadlessProvisionalStoredJobRecord }
  | { readonly ok: false; readonly message: string } {
  const mapped = mapHeadlessJobSqlRow(row);
  if (!mapped.ok) return mapped;
  if (mapped.record.stage !== "provisional") {
    return { ok: false, message: "Expected provisional stored record." };
  }
  return { ok: true, record: mapped.record };
}

export function mapHeadlessJobSqlRowAsCanonical(
  row: unknown,
):
  | { readonly ok: true; readonly record: HeadlessCanonicalStoredJobRecord }
  | { readonly ok: false; readonly message: string } {
  const mapped = mapHeadlessJobSqlRow(row);
  if (!mapped.ok) return mapped;
  if (mapped.record.stage !== "canonical") {
    return { ok: false, message: "Expected canonical stored record." };
  }
  return { ok: true, record: mapped.record };
}
