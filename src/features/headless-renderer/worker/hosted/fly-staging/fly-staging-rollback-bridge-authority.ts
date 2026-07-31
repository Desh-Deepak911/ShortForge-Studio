/**
 * Immutable rollback-bridge deployment authority for schema 007/008 compatibility.
 * QA / rollout authority only — never used by hosted worker runtime directly.
 *
 * The bridge recognizes one exact additive migration (008) while rejecting unknown
 * future migrations. This is rollback compatibility, not relaxed validation.
 * The mode is bound to a single immutable image/environment pair.
 */

import { embeddedSchemaFingerprintAsPreflightSources } from "@/features/headless-renderer/control-plane/migrations/embedded-schema-fingerprint";
import {
  HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE_ENV,
  HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_ID,
  HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_CHECKSUM_SHA256,
  HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
} from "@/features/headless-renderer/control-plane/runtime/headless-schema-preflight-compatibility-authority";
import { HEADLESS_ROLLBACK_BRIDGE_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/renderer-build-id";

import {
  HEADLESS_FLY_STAGING_PUBLIC_ENV,
} from "./fly-staging-env-ledger";

export const HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_AUTHORITY_VERSION = 3 as const;

/** Rejected by fail-closed gates until replaced by a real registry manifest digest. */
export const HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_PLACEHOLDER_IMAGE_DIGEST =
  "0000000000000000000000000000000000000000000000000000000000000000" as const;

/** Real immutable manifest digest from build-only push (registry-only; not deployed). */
export const HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST =
  "7de23dbdbeece30aaa35387609b6cd92829c81e3d567d865e018814382c1a206" as const;

export const HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_HOSTED_WORKER_ARTIFACT_SHA256 =
  "53a1bbf0815a6ca6a032f659efac708aa803447277e488d00d35c1c94c5834e2" as const;

export const HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_PAGE_ARTIFACT_SHA256 =
  "e0c6fd819d6b2c6738e0cba1971a320fefda281c3ef5798cd011bf6fab981d2c" as const;

export const HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_BUILD_INFO_SHA256 =
  "6b2285c3245e29b26c9b212bd35032dfcf2333d89b329a710803c243d2a0411a" as const;

export const HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID =
  HEADLESS_ROLLBACK_BRIDGE_RENDERER_BUILD_ID;

export const HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_COMPATIBILITY_MODE =
  HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE;

const ACCEPTED_MIGRATION_SOURCES = embeddedSchemaFingerprintAsPreflightSources();

export const HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_ACCEPTED_SCHEMA_FINGERPRINT =
  Object.freeze({
    migrationIds: ACCEPTED_MIGRATION_SOURCES.map((entry) => entry.migrationId),
    checksumSha256: ACCEPTED_MIGRATION_SOURCES.map(
      (entry) => entry.checksumSha256,
    ),
  });

const CORE_MIGRATION_SOURCES = Object.freeze(
  ACCEPTED_MIGRATION_SOURCES.filter(
    (entry) => entry.migrationId !== HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_ID,
  ),
);

export const HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_CORE_SCHEMA_FINGERPRINT =
  Object.freeze({
    migrationIds: CORE_MIGRATION_SOURCES.map((entry) => entry.migrationId),
    checksumSha256: CORE_MIGRATION_SOURCES.map(
      (entry) => entry.checksumSha256,
    ),
  });

export type HeadlessFlyStagingRollbackBridgeLifecycle =
  | "prospective"
  | "temporary_current"
  | "historical";

export type HeadlessFlyStagingRollbackBridgeImageRecord = {
  readonly recordId: "post_007_2g24e_bridge008_rollback_bridge";
  readonly lifecycle: HeadlessFlyStagingRollbackBridgeLifecycle;
  readonly imageDigestSha256: string;
  readonly rendererBuildId: typeof HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID;
  readonly schemaPreflightCompatibilityMode: typeof HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_COMPATIBILITY_MODE;
  readonly coreSchemaFingerprint: {
    readonly migrationIds: readonly string[];
    readonly checksumSha256: readonly string[];
  };
  readonly recognizedOptionalMigration008Id: typeof HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_ID;
  readonly recognizedOptionalMigration008ChecksumSha256: typeof HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_CHECKSUM_SHA256;
  readonly hostedWorkerArtifactSha256: string;
  readonly hostedPageArtifactSha256: string;
  readonly buildInfoSha256: string;
  readonly maintenanceEnabled: false;
  readonly eligibleForVerifyLiveHarness: boolean;
  readonly eligibleForRenderLiveHarness: boolean;
  readonly eligibleForCurrentStagingReadiness: boolean;
  readonly eligibleForRollbackSelection: boolean;
};

export const HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_PROSPECTIVE_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_2g24e_bridge008_rollback_bridge",
    lifecycle: "prospective",
    imageDigestSha256: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
    rendererBuildId: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
    schemaPreflightCompatibilityMode:
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_COMPATIBILITY_MODE,
    coreSchemaFingerprint: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_CORE_SCHEMA_FINGERPRINT,
    recognizedOptionalMigration008Id:
      HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_ID,
    recognizedOptionalMigration008ChecksumSha256:
      HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_CHECKSUM_SHA256,
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_PAGE_ARTIFACT_SHA256,
    buildInfoSha256: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_BUILD_INFO_SHA256,
    maintenanceEnabled: false,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
    eligibleForRollbackSelection: false,
  } satisfies HeadlessFlyStagingRollbackBridgeImageRecord);

/**
 * Demoted to historical (Part 2G.25D Part F.2 Part K) after the cleanup-runtime
 * finalization correction was promoted to `current` on the versioned-image
 * authority. The bridge digest remains rollback-eligible as the designated
 * rollback anchor, but is no longer ordinary current staging authority.
 */
export const HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_2g24e_bridge008_rollback_bridge",
    lifecycle: "historical",
    imageDigestSha256: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
    rendererBuildId: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
    schemaPreflightCompatibilityMode:
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_COMPATIBILITY_MODE,
    coreSchemaFingerprint: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_CORE_SCHEMA_FINGERPRINT,
    recognizedOptionalMigration008Id:
      HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_ID,
    recognizedOptionalMigration008ChecksumSha256:
      HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_CHECKSUM_SHA256,
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_PAGE_ARTIFACT_SHA256,
    buildInfoSha256: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_BUILD_INFO_SHA256,
    maintenanceEnabled: false,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
    eligibleForRollbackSelection: true,
  } satisfies HeadlessFlyStagingRollbackBridgeImageRecord);

/** @deprecated Prefer HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_TEMPORARY_CURRENT_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_HISTORICAL_IMAGE_RECORD;

export function resolveHeadlessFlyStagingTemporaryCurrentRollbackBridgeImageRecord(): HeadlessFlyStagingRollbackBridgeImageRecord {
  return HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_HISTORICAL_IMAGE_RECORD;
}

export type HeadlessFlyStagingRollbackBridgeCoherenceReasonId =
  | "ok"
  | "placeholder_digest"
  | "wrong_renderer_build_id"
  | "maintenance_enabled"
  | "missing_compatibility_mode"
  | "compatibility_mode_on_non_bridge_image"
  | "unrecognized_migration_checksum"
  | "hostile_input";

const DIGEST_RE = /^[a-f0-9]{64}$/;

export type HeadlessFlyStagingRollbackBridgePublicEnvKey =
  | keyof typeof HEADLESS_FLY_STAGING_PUBLIC_ENV
  | typeof HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE_ENV;

export function buildHeadlessFlyStagingRollbackBridgePublicEnvironment(): Readonly<
  Record<HeadlessFlyStagingRollbackBridgePublicEnvKey, string>
> {
  return Object.freeze({
    ...HEADLESS_FLY_STAGING_PUBLIC_ENV,
    HEADLESS_RENDERER_BUILD_ID:
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
    [HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE_ENV]:
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_COMPATIBILITY_MODE,
  });
}

export function isHeadlessFlyStagingPlaceholderBridgeDigest(
  digest: unknown,
): boolean {
  return (
    typeof digest === "string" &&
    digest === HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_PLACEHOLDER_IMAGE_DIGEST
  );
}

export function classifyHeadlessFlyStagingRollbackBridgeImageRecord(
  record: HeadlessFlyStagingRollbackBridgeImageRecord = HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_PROSPECTIVE_IMAGE_RECORD,
):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingRollbackBridgeCoherenceReasonId;
    } {
  try {
    if (
      !DIGEST_RE.test(record.imageDigestSha256) ||
      isHeadlessFlyStagingPlaceholderBridgeDigest(record.imageDigestSha256)
    ) {
      return Object.freeze({ ok: false, reasonId: "placeholder_digest" });
    }
    if (
      record.rendererBuildId !==
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID
    ) {
      return Object.freeze({ ok: false, reasonId: "wrong_renderer_build_id" });
    }
    if (record.maintenanceEnabled !== false) {
      return Object.freeze({ ok: false, reasonId: "maintenance_enabled" });
    }
    if (
      record.schemaPreflightCompatibilityMode !==
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_COMPATIBILITY_MODE
    ) {
      return Object.freeze({ ok: false, reasonId: "missing_compatibility_mode" });
    }
    if (
      record.recognizedOptionalMigration008ChecksumSha256 !==
      HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_CHECKSUM_SHA256
    ) {
      return Object.freeze({
        ok: false,
        reasonId: "unrecognized_migration_checksum",
      });
    }
    return Object.freeze({ ok: true });
  } catch {
    return Object.freeze({ ok: false, reasonId: "hostile_input" });
  }
}

export function classifyHeadlessFlyStagingRollbackBridgeEnvironmentPair(input: {
  readonly imageDigestSha256: unknown;
  readonly rendererBuildId: unknown;
  readonly compatibilityMode: unknown;
  readonly maintenanceEnabledRaw?: unknown;
}):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingRollbackBridgeCoherenceReasonId;
    } {
  if (
    typeof input.imageDigestSha256 !== "string" ||
    !DIGEST_RE.test(input.imageDigestSha256)
  ) {
    return Object.freeze({ ok: false, reasonId: "hostile_input" });
  }
  if (
    isHeadlessFlyStagingPlaceholderBridgeDigest(input.imageDigestSha256) ||
    input.imageDigestSha256 !== HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST
  ) {
    return Object.freeze({ ok: false, reasonId: "placeholder_digest" });
  }
  if (
    input.rendererBuildId !== HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID
  ) {
    return Object.freeze({ ok: false, reasonId: "wrong_renderer_build_id" });
  }
  if (
    input.compatibilityMode !== HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_COMPATIBILITY_MODE
  ) {
    return Object.freeze({ ok: false, reasonId: "missing_compatibility_mode" });
  }
  if (
    input.maintenanceEnabledRaw === "1" ||
    input.maintenanceEnabledRaw === "true" ||
    input.maintenanceEnabledRaw === true
  ) {
    return Object.freeze({ ok: false, reasonId: "maintenance_enabled" });
  }
  return Object.freeze({ ok: true });
}

export function classifyHeadlessFlyStagingCompatibilityModeOnNonBridgeImage(input: {
  readonly imageDigestSha256: unknown;
  readonly compatibilityMode: unknown;
}):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reasonId: "compatibility_mode_on_non_bridge_image";
    } {
  if (
    input.compatibilityMode == null ||
    input.compatibilityMode === "" ||
    input.compatibilityMode === "strict"
  ) {
    return Object.freeze({ ok: true });
  }
  if (
    typeof input.imageDigestSha256 === "string" &&
    input.imageDigestSha256 === HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST &&
    !isHeadlessFlyStagingPlaceholderBridgeDigest(input.imageDigestSha256)
  ) {
    return Object.freeze({ ok: true });
  }
  return Object.freeze({
    ok: false,
    reasonId: "compatibility_mode_on_non_bridge_image",
  });
}

export const HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_CONTRACT = Object.freeze({
  authorityVersion: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_AUTHORITY_VERSION,
  compatibilityMode: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_COMPATIBILITY_MODE,
  maintenanceEnabled: false,
  coreMigrationCount: CORE_MIGRATION_SOURCES.length,
  recognizedOptionalMigrationId: HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_ID,
  failClosedOnPlaceholderDigest: true,
  boundToSingleImageEnvironmentPair: true,
} as const);
