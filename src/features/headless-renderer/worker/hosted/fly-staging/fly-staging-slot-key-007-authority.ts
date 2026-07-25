/**
 * Sprint 11E Phase 2E.2D.8C.2 — post-007 slot_key schema / image eligibility.
 * Delegates digest boundaries to versioned image authority (2E.2D.8C.2A).
 */

import { embeddedSchemaFingerprintMigrationIds } from "@/features/headless-renderer/control-plane/migrations/embedded-schema-fingerprint";

import {
  HEADLESS_FLY_STAGING_PRE_007_HISTORICAL_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
  classifyCurrentFlyStagingImageEligibility,
} from "./fly-staging-versioned-image-authority";

/** @deprecated Use HEADLESS_FLY_STAGING_PRE_007_HISTORICAL_IMAGE_DIGEST */
export const HEADLESS_FLY_STAGING_PRE_007_SLOT_KEY_IMAGE_DIGEST =
  HEADLESS_FLY_STAGING_PRE_007_HISTORICAL_IMAGE_DIGEST;

export const HEADLESS_FLY_STAGING_POST_007_REQUIRED_MIGRATION_IDS =
  embeddedSchemaFingerprintMigrationIds();

export type HeadlessFlyStagingPost007IneligibilityReasonId =
  | "pre_007_image_digest"
  | "schema_fingerprint_not_seven_migrations"
  | "schema_fingerprint_migration_mismatch"
  | "unknown_digest"
  | "post_007_digest_with_six_migrations";

export function isPre007SlotKeyImageDigest(digest: string): boolean {
  return digest === HEADLESS_FLY_STAGING_PRE_007_HISTORICAL_IMAGE_DIGEST;
}

export function assertPost007SchemaEligibleFingerprint(
  migrationIds: readonly string[],
):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingPost007IneligibilityReasonId;
    } {
  const expected = HEADLESS_FLY_STAGING_POST_007_REQUIRED_MIGRATION_IDS;
  if (migrationIds.length !== expected.length) {
    return {
      ok: false,
      reasonId: "schema_fingerprint_not_seven_migrations",
    };
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (migrationIds[i] !== expected[i]) {
      return {
        ok: false,
        reasonId: "schema_fingerprint_migration_mismatch",
      };
    }
  }
  return { ok: true };
}

/**
 * After remote migration 007, only the current post-007 image record is eligible.
 * Pre-007 digest remains valid for historical evidence only.
 */
export function classifyPost007WorkerImageEligibility(input: {
  readonly imageDigestSha256: string;
  readonly schemaMigrationIds: readonly string[];
}):
  | { readonly eligible: true }
  | {
      readonly eligible: false;
      readonly reasonId: HeadlessFlyStagingPost007IneligibilityReasonId;
    } {
  if (isPre007SlotKeyImageDigest(input.imageDigestSha256)) {
    return { eligible: false, reasonId: "pre_007_image_digest" };
  }
  if (
    input.imageDigestSha256 ===
    HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_DIGEST
  ) {
    const fp = assertPost007SchemaEligibleFingerprint(input.schemaMigrationIds);
    if (!fp.ok) {
      return { eligible: false, reasonId: fp.reasonId };
    }
    return { eligible: false, reasonId: "unknown_digest" };
  }
  const current = classifyCurrentFlyStagingImageEligibility({
    imageDigestSha256: input.imageDigestSha256,
    schemaMigrationIds: input.schemaMigrationIds,
  });
  if (current.eligible) {
    return { eligible: true };
  }
  if (current.reasonId === "post_007_digest_with_six_migrations") {
    return { eligible: false, reasonId: "post_007_digest_with_six_migrations" };
  }
  if (current.reasonId === "unknown_digest") {
    return { eligible: false, reasonId: "unknown_digest" };
  }
  const fp = assertPost007SchemaEligibleFingerprint(input.schemaMigrationIds);
  if (!fp.ok) {
    return { eligible: false, reasonId: fp.reasonId };
  }
  return { eligible: false, reasonId: "unknown_digest" };
}
