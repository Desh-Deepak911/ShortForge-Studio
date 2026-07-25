/**
 * Total mapper for headless_owned_objects rows → validated frozen stored records.
 * Explicit columns only; JSONB is untrusted and revalidated in TypeScript.
 * BIGINT columns accept PostgreSQL decimal-string wire form.
 */

import { deepFreezeHeadlessValue } from "../../domain/headless-deep-freeze";
import { guardHeadlessStructure, isPlainObject } from "../../domain/headless-hostile-guard";
import {
  parseHeadlessPgSafeInteger,
  parseHeadlessPgSafeIntegerOrNull,
} from "./parse-headless-pg-safe-integer";
import { validateHeadlessOwnedObjectRecord } from "./validate-owned-object-record";
import type { HeadlessStoredOwnedObject } from "../ports/owned-object-store.port";
import { HEADLESS_OWNED_OBJECT_RECORD_VERSION } from "../types/owned-object-record";

/** Explicit selected columns — never SELECT *. */
export const HEADLESS_OWNED_OBJECT_SELECT_COLUMNS = [
  "object_id",
  "owner_id",
  "project_id",
  "job_id",
  "operation_id",
  "purpose",
  "slot_key",
  "stage",
  "store_id",
  "object_key",
  "store_version",
  "expected_content_digest_claim",
  "expected_byte_length",
  "expected_mime_type",
  "content_digest",
  "byte_length",
  "mime_type",
  "upload_capability_issued_at_ms",
  "upload_capability_expires_at_ms",
  "uploaded_observed_at_ms",
  "verification_state",
  "verification_claim_token",
  "verification_claimed_at_ms",
  "verified_at_ms",
  "expires_at_ms",
  "finalized_metadata",
  "terminal_reason",
  "cleanup_scheduled_at_ms",
  "created_at_ms",
  "updated_at_ms",
] as const;

export const HEADLESS_OWNED_OBJECT_SELECT_SQL =
  HEADLESS_OWNED_OBJECT_SELECT_COLUMNS.join(", ");

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

function parseTerminalReason(
  value: unknown,
): { readonly ok: true; readonly value: string | null } | { readonly ok: false } {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }
  if (typeof value === "string") {
    // Drivers may return JSONB string as a quoted JSON string or bare text.
    const trimmed = value.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (typeof parsed === "string") {
          return { ok: true, value: parsed };
        }
      } catch {
        return { ok: false };
      }
    }
    return { ok: true, value };
  }
  if (isPlainObject(value)) {
    if (guardHeadlessStructure(value)) return { ok: false };
    const code = (value as Record<string, unknown>).code;
    if (typeof code === "string") return { ok: true, value: code };
    return { ok: false };
  }
  return { ok: false };
}

function parseFinalizedMetadata(
  value: unknown,
):
  | {
      readonly ok: true;
      readonly value: {
        readonly verifiedBy:
          | "full_object_stream"
          | "trusted_worker_upload_stream";
        readonly sourceStage: "staging";
      } | null;
    }
  | { readonly ok: false } {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }
  let obj: unknown = value;
  if (typeof value === "string") {
    try {
      obj = JSON.parse(value) as unknown;
    } catch {
      return { ok: false };
    }
  }
  if (!isPlainObject(obj) || guardHeadlessStructure(obj)) {
    return { ok: false };
  }
  const r = obj as Record<string, unknown>;
  if (
    (r.verifiedBy !== "full_object_stream" &&
      r.verifiedBy !== "trusted_worker_upload_stream") ||
    r.sourceStage !== "staging"
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      verifiedBy: r.verifiedBy,
      sourceStage: "staging",
    },
  };
}

/**
 * Reconstruct exactly one owned-object stored record variant.
 * Rejects mixed-stage payloads, column/JSON disagreement, hostile JSON,
 * unsafe timestamps, claim mismatch, and unknown fields (via validator).
 */
export function mapHeadlessOwnedObjectSqlRow(
  row: unknown,
):
  | { readonly ok: true; readonly stored: HeadlessStoredOwnedObject }
  | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(row)) {
      return { ok: false, message: "Hostile owned-object row rejected." };
    }
    if (!isPlainObject(row)) {
      return { ok: false, message: "Owned-object row must be a plain object." };
    }
    const r = row as Record<string, unknown>;

    const stage = r.stage;
    if (
      stage !== "staging" &&
      stage !== "finalized" &&
      stage !== "rejected" &&
      stage !== "cleanup_pending"
    ) {
      return { ok: false, message: "Owned-object row stage invalid." };
    }

    if (
      typeof r.object_id !== "string" ||
      typeof r.owner_id !== "string" ||
      typeof r.project_id !== "string" ||
      typeof r.job_id !== "string" ||
      typeof r.operation_id !== "string" ||
      typeof r.purpose !== "string" ||
      typeof r.store_id !== "string" ||
      typeof r.object_key !== "string" ||
      typeof r.expected_content_digest_claim !== "string" ||
      typeof r.expected_mime_type !== "string" ||
      typeof r.verification_state !== "string"
    ) {
      return { ok: false, message: "Owned-object row scalar identity malformed." };
    }

    const storeVersion = parseHeadlessPgSafeInteger(r.store_version, { min: 1 });
    if (!storeVersion.ok) {
      return { ok: false, message: "Owned-object store_version unsafe." };
    }
    const createdAtMs = parseHeadlessPgSafeInteger(r.created_at_ms, { min: 0 });
    if (!createdAtMs.ok) {
      return { ok: false, message: "Owned-object created_at_ms unsafe." };
    }
    const updatedAtMs = parseHeadlessPgSafeInteger(r.updated_at_ms, { min: 0 });
    if (!updatedAtMs.ok) {
      return { ok: false, message: "Owned-object updated_at_ms unsafe." };
    }
    const expectedByteLength = parseHeadlessPgSafeInteger(
      r.expected_byte_length,
      { min: 1 },
    );
    if (!expectedByteLength.ok) {
      return { ok: false, message: "Owned-object expected_byte_length unsafe." };
    }
    const uploadIssued = parseHeadlessPgSafeInteger(
      r.upload_capability_issued_at_ms,
      { min: 0 },
    );
    if (!uploadIssued.ok) {
      return {
        ok: false,
        message: "Owned-object upload_capability_issued_at_ms unsafe.",
      };
    }
    const uploadExpires = parseHeadlessPgSafeInteger(
      r.upload_capability_expires_at_ms,
      { min: 0 },
    );
    if (!uploadExpires.ok) {
      return {
        ok: false,
        message: "Owned-object upload_capability_expires_at_ms unsafe.",
      };
    }

    const uploadedObservedAtMs = parseHeadlessPgSafeIntegerOrNull(
      r.uploaded_observed_at_ms,
      { min: 0 },
    );
    if (!uploadedObservedAtMs.ok) {
      return {
        ok: false,
        message: "Owned-object uploaded_observed_at_ms unsafe.",
      };
    }
    const verificationClaimedAtMs = parseHeadlessPgSafeIntegerOrNull(
      r.verification_claimed_at_ms,
      { min: 0 },
    );
    if (!verificationClaimedAtMs.ok) {
      return {
        ok: false,
        message: "Owned-object verification_claimed_at_ms unsafe.",
      };
    }
    const verifiedAtMs = parseHeadlessPgSafeIntegerOrNull(r.verified_at_ms, {
      min: 0,
    });
    if (!verifiedAtMs.ok) {
      return { ok: false, message: "Owned-object verified_at_ms unsafe." };
    }
    const expiresAtMs = parseHeadlessPgSafeIntegerOrNull(r.expires_at_ms, {
      min: 0,
    });
    if (!expiresAtMs.ok) {
      return { ok: false, message: "Owned-object expires_at_ms unsafe." };
    }
    const cleanupScheduledAtMs = parseHeadlessPgSafeIntegerOrNull(
      r.cleanup_scheduled_at_ms,
      { min: 0 },
    );
    if (!cleanupScheduledAtMs.ok) {
      return {
        ok: false,
        message: "Owned-object cleanup_scheduled_at_ms unsafe.",
      };
    }
    const byteLength = parseHeadlessPgSafeIntegerOrNull(r.byte_length, {
      min: 1,
    });
    if (!byteLength.ok) {
      return { ok: false, message: "Owned-object byte_length unsafe." };
    }

    const verificationClaimToken = asNullableString(r.verification_claim_token);
    if (verificationClaimToken === undefined) {
      return {
        ok: false,
        message: "Owned-object verification_claim_token malformed.",
      };
    }
    const contentDigest = asNullableString(r.content_digest);
    if (contentDigest === undefined) {
      return { ok: false, message: "Owned-object content_digest malformed." };
    }
    const mimeType = asNullableString(r.mime_type);
    if (mimeType === undefined) {
      return { ok: false, message: "Owned-object mime_type malformed." };
    }
    const slotKey = asNullableString(r.slot_key);
    if (slotKey === undefined) {
      return { ok: false, message: "Owned-object slot_key malformed." };
    }

    const terminalReason = parseTerminalReason(r.terminal_reason);
    if (!terminalReason.ok) {
      return { ok: false, message: "Owned-object terminal_reason hostile." };
    }
    const finalizedMetadata = parseFinalizedMetadata(r.finalized_metadata);
    if (!finalizedMetadata.ok) {
      return { ok: false, message: "Owned-object finalized_metadata hostile." };
    }

    // Mixed-stage / column disagreement guards before validator.
    if (stage === "staging") {
      if (
        contentDigest != null ||
        byteLength.value != null ||
        mimeType != null ||
        verifiedAtMs.value != null ||
        finalizedMetadata.value != null ||
        terminalReason.value != null ||
        cleanupScheduledAtMs.value != null
      ) {
        return {
          ok: false,
          message: "Staging row must not carry trusted or terminal facts.",
        };
      }
      if (
        r.verification_state !== "unclaimed" &&
        r.verification_state !== "claimed" &&
        r.verification_state !== "failed"
      ) {
        return { ok: false, message: "Staging verification_state invalid." };
      }
    }

    if (stage === "finalized") {
      if (
        contentDigest == null ||
        byteLength.value == null ||
        mimeType == null ||
        verifiedAtMs.value == null ||
        expiresAtMs.value == null ||
        finalizedMetadata.value == null ||
        terminalReason.value != null ||
        cleanupScheduledAtMs.value != null ||
        verificationClaimToken != null ||
        verificationClaimedAtMs.value != null
      ) {
        return {
          ok: false,
          message: "Finalized row missing trusted metadata or carries claims.",
        };
      }
      if (
        contentDigest !== r.expected_content_digest_claim ||
        byteLength.value !== expectedByteLength.value ||
        mimeType !== r.expected_mime_type
      ) {
        return {
          ok: false,
          message: "Finalized trusted facts disagree with staging claims.",
        };
      }
      if (r.verification_state !== "verified") {
        return {
          ok: false,
          message: "Finalized verification_state must be verified.",
        };
      }
    }

    if (stage === "rejected" || stage === "cleanup_pending") {
      if (
        contentDigest != null ||
        byteLength.value != null ||
        mimeType != null ||
        verifiedAtMs.value != null ||
        finalizedMetadata.value != null ||
        verificationClaimToken != null ||
        verificationClaimedAtMs.value != null
      ) {
        return {
          ok: false,
          message: "Terminal row must not carry trusted facts or claims.",
        };
      }
      if (terminalReason.value == null) {
        return { ok: false, message: "Terminal row requires terminal_reason." };
      }
      if (stage === "cleanup_pending" && cleanupScheduledAtMs.value == null) {
        return {
          ok: false,
          message: "cleanup_pending requires cleanup_scheduled_at_ms.",
        };
      }
      if (stage === "rejected" && cleanupScheduledAtMs.value != null) {
        return {
          ok: false,
          message: "rejected must not carry cleanup_scheduled_at_ms.",
        };
      }
    }

    // Claim pairing mismatch
    if (
      (verificationClaimToken == null) !==
      (verificationClaimedAtMs.value == null)
    ) {
      return { ok: false, message: "Verification claim pair mismatch." };
    }
    if (
      r.verification_state === "claimed" &&
      (verificationClaimToken == null || verificationClaimedAtMs.value == null)
    ) {
      return { ok: false, message: "Claimed state requires claim pair." };
    }
    if (
      r.verification_state === "unclaimed" &&
      (verificationClaimToken != null || verificationClaimedAtMs.value != null)
    ) {
      return { ok: false, message: "Unclaimed state must clear claim pair." };
    }

    const draft = {
      version: HEADLESS_OWNED_OBJECT_RECORD_VERSION,
      objectId: r.object_id,
      ownerId: r.owner_id,
      projectId: r.project_id,
      jobId: r.job_id,
      operationId: r.operation_id,
      purpose: r.purpose,
      slotKey,
      provider: "r2",
      storeId: r.store_id,
      objectKey: r.object_key,
      createdAtMs: createdAtMs.value,
      updatedAtMs: updatedAtMs.value,
      stage,
      expectedContentDigestClaim: r.expected_content_digest_claim,
      expectedByteLength: expectedByteLength.value,
      expectedMimeType: r.expected_mime_type,
      uploadCapabilityIssuedAtMs: uploadIssued.value,
      uploadCapabilityExpiresAtMs: uploadExpires.value,
      uploadedObservedAtMs: uploadedObservedAtMs.value,
      verificationState: r.verification_state,
      verificationClaimToken,
      verificationClaimedAtMs: verificationClaimedAtMs.value,
      verifiedAtMs: verifiedAtMs.value,
      expiresAtMs: expiresAtMs.value,
      contentDigest,
      byteLength: byteLength.value,
      mimeType,
      finalizedMetadata: finalizedMetadata.value,
      terminalReason: terminalReason.value,
      cleanupScheduledAtMs: cleanupScheduledAtMs.value,
    };

    const validated = validateHeadlessOwnedObjectRecord(draft);
    if (!validated.ok) {
      return { ok: false, message: validated.message };
    }

    return {
      ok: true,
      stored: deepFreezeHeadlessValue({
        record: validated.record,
        storeVersion: storeVersion.value,
      }),
    };
  } catch {
    return { ok: false, message: "Hostile owned-object row rejected." };
  }
}
