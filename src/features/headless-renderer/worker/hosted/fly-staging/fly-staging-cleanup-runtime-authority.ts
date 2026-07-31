/**
 * Prospective cleanup-runtime Fly image authority for schema 008.
 * QA / rollout authority only — never used by hosted worker runtime directly.
 *
 * The cleanup worker runs on the exact eight-migration ledger (001–008) with
 * maintenance disabled until a separately gated rollout enables it.
 */

import { embeddedSchemaFingerprintAsPreflightSources } from "@/features/headless-renderer/control-plane/migrations/embedded-schema-fingerprint";
import { HEADLESS_CLEANUP_RUNTIME_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/renderer-build-id";

import { HEADLESS_FLY_STAGING_PUBLIC_ENV } from "./fly-staging-env-ledger";

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_AUTHORITY_VERSION = 1 as const;

/** Rejected by fail-closed gates until replaced by a real registry manifest digest. */
export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PLACEHOLDER_IMAGE_DIGEST =
  "0000000000000000000000000000000000000000000000000000000000000000" as const;

/** Real immutable manifest digest — populated after build-only push acceptance. */
export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_IMAGE_DIGEST =
  "9570e9d9137683c0aed1de990c55747ccfa111ba42acea3c6c3e592ee5cd7c60" as const;

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_HOSTED_WORKER_ARTIFACT_SHA256 =
  "c8061aeeb90d8d69b3350aaf273a045d3bb428d8e41a9251edaf654632ef7b51" as const;

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PAGE_ARTIFACT_SHA256 =
  "e0c6fd819d6b2c6738e0cba1971a320fefda281c3ef5798cd011bf6fab981d2c" as const;

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_INFO_SHA256 =
  "815d289dcbe71a5fd3192da59bad12462c914e20362f6fe5f71bfacc39ab9b9d" as const;

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID =
  HEADLESS_CLEANUP_RUNTIME_RENDERER_BUILD_ID;

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_CAPABILITY_VERSION =
  "2G.25-cleanup-runtime" as const;

const ACCEPTED_MIGRATION_SOURCES = embeddedSchemaFingerprintAsPreflightSources();

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_SCHEMA_FINGERPRINT =
  Object.freeze({
    migrationIds: ACCEPTED_MIGRATION_SOURCES.map((entry) => entry.migrationId),
    checksumSha256: ACCEPTED_MIGRATION_SOURCES.map(
      (entry) => entry.checksumSha256,
    ),
  });

export type HeadlessFlyStagingCleanupRuntimeLifecycle = "prospective" | "historical";

export type HeadlessFlyStagingCleanupRuntimeImageRecord = {
  readonly recordId: "post_007_2g25_cleanup_runtime_prospective";
  readonly lifecycle: HeadlessFlyStagingCleanupRuntimeLifecycle;
  readonly imageDigestSha256: string;
  readonly rendererBuildId: typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID;
  readonly schemaFingerprint: {
    readonly migrationIds: readonly string[];
    readonly checksumSha256: readonly string[];
  };
  readonly cleanupCapabilityVersion: typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_CAPABILITY_VERSION;
  readonly hostedWorkerArtifactSha256: string;
  readonly hostedPageArtifactSha256: string;
  readonly buildInfoSha256: string;
  readonly maintenanceEnabled: false;
  readonly eligibleForVerifyLiveHarness: boolean;
  readonly eligibleForRenderLiveHarness: boolean;
  readonly eligibleForCurrentStagingReadiness: boolean;
  readonly eligibleForRollbackSelection: boolean;
};

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PROSPECTIVE_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_2g25_cleanup_runtime_prospective",
    lifecycle: "prospective",
    imageDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_IMAGE_DIGEST,
    rendererBuildId: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
    schemaFingerprint: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_SCHEMA_FINGERPRINT,
    cleanupCapabilityVersion:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_CAPABILITY_VERSION,
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PAGE_ARTIFACT_SHA256,
    buildInfoSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_INFO_SHA256,
    maintenanceEnabled: false,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: true,
    eligibleForCurrentStagingReadiness: false,
    eligibleForRollbackSelection: false,
  } satisfies HeadlessFlyStagingCleanupRuntimeImageRecord);

export type HeadlessFlyStagingCleanupRuntimeCoherenceReasonId =
  | "ok"
  | "placeholder_digest"
  | "wrong_renderer_build_id"
  | "maintenance_enabled"
  | "wrong_worker_artifact"
  | "wrong_page_artifact"
  | "wrong_build_info"
  | "hostile_input";

const DIGEST_RE = /^[a-f0-9]{64}$/;

export function isHeadlessFlyStagingPlaceholderCleanupRuntimeDigest(
  digest: unknown,
): boolean {
  return (
    typeof digest === "string" &&
    digest === HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PLACEHOLDER_IMAGE_DIGEST
  );
}

export function buildHeadlessFlyStagingCleanupRuntimePublicEnvironment(): Readonly<
  Record<keyof typeof HEADLESS_FLY_STAGING_PUBLIC_ENV | "HEADLESS_RENDERER_BUILD_ID" | "HEADLESS_EXPORT_MAINTENANCE_ENABLED", string>
> {
  return Object.freeze({
    ...HEADLESS_FLY_STAGING_PUBLIC_ENV,
    HEADLESS_RENDERER_BUILD_ID:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
    HEADLESS_EXPORT_MAINTENANCE_ENABLED: "0",
  });
}

export function classifyHeadlessFlyStagingCleanupRuntimeImageRecord(
  record: HeadlessFlyStagingCleanupRuntimeImageRecord = HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PROSPECTIVE_IMAGE_RECORD,
):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingCleanupRuntimeCoherenceReasonId;
    } {
  try {
    if (
      !DIGEST_RE.test(record.imageDigestSha256) ||
      isHeadlessFlyStagingPlaceholderCleanupRuntimeDigest(record.imageDigestSha256)
    ) {
      return Object.freeze({ ok: false, reasonId: "placeholder_digest" });
    }
    if (
      record.rendererBuildId !==
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID
    ) {
      return Object.freeze({ ok: false, reasonId: "wrong_renderer_build_id" });
    }
    if (record.maintenanceEnabled !== false) {
      return Object.freeze({ ok: false, reasonId: "maintenance_enabled" });
    }
    if (
      record.hostedWorkerArtifactSha256 !==
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_HOSTED_WORKER_ARTIFACT_SHA256
    ) {
      return Object.freeze({ ok: false, reasonId: "wrong_worker_artifact" });
    }
    if (
      record.hostedPageArtifactSha256 !==
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PAGE_ARTIFACT_SHA256
    ) {
      return Object.freeze({ ok: false, reasonId: "wrong_page_artifact" });
    }
    if (
      record.buildInfoSha256 !==
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_INFO_SHA256
    ) {
      return Object.freeze({ ok: false, reasonId: "wrong_build_info" });
    }
    return Object.freeze({ ok: true });
  } catch {
    return Object.freeze({ ok: false, reasonId: "hostile_input" });
  }
}

export function resolveHeadlessFlyStagingCleanupRuntimeProspectiveImageRecord(): HeadlessFlyStagingCleanupRuntimeImageRecord {
  return HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PROSPECTIVE_IMAGE_RECORD;
}
