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

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_AUTHORITY_VERSION = 4 as const;

/** Rejected by fail-closed gates until replaced by a real registry manifest digest. */
export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PLACEHOLDER_IMAGE_DIGEST =
  "0000000000000000000000000000000000000000000000000000000000000000" as const;

/** Part A / Part B rejected image — packaged worker rejected cleanup build ID at runtime. */
export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST =
  "9570e9d9137683c0aed1de990c55747ccfa111ba42acea3c6c3e592ee5cd7c60" as const;

/** @deprecated Prefer HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST */
export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_IMAGE_DIGEST =
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST;

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_HOSTED_WORKER_ARTIFACT_SHA256 =
  "c8061aeeb90d8d69b3350aaf273a045d3bb428d8e41a9251edaf654632ef7b51" as const;

/** @deprecated Prefer rejected worker artifact constant */
export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_HOSTED_WORKER_ARTIFACT_SHA256 =
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_HOSTED_WORKER_ARTIFACT_SHA256;

/**
 * Replacement build-only image digest — live finalization failed on schema 008.
 * Permanently rejected; no forward budget remains.
 */
export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST =
  "e0224b93f12113e922d21e99e702bd6d333eb3997076b005700623837d837916" as const;

/** @deprecated Prefer HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST */
export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_LIVE_FINALIZATION_FAILED_IMAGE_DIGEST =
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST;

/** Replacement worker artifact with hosted-environment cleanup build ID acceptance baked in. */
export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_HOSTED_WORKER_ARTIFACT_SHA256 =
  "3226970b12e6f1e5296a82ffc42e375a66b3a4cc7a12acfc5dba4ef3c2c6a878" as const;

/**
 * Corrected finalization cleanup-runtime image digest (build-only push Part E).
 * Permanently rejected after Part F probe eligibility closed before job creation
 * (`FAIL_TELEMETRY_IMAGE` / `historical_lifecycle_not_current_ready`).
 * Forward budget exhausted; no second forward authorized.
 */
export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST =
  "41df9b444a5ac84d6401af8b4a62b58546088397fa740bdf763b69e1b7e0acde" as const;

/** Corrected worker artifact after schema-008 finalization + cleanup release-authority commits. */
export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_HOSTED_WORKER_ARTIFACT_SHA256 =
  "a9baf3ea910eeae41b4eadfb10d9dfb100b74042500884c761a8c5b946774e1b" as const;

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PAGE_ARTIFACT_SHA256 =
  "e0c6fd819d6b2c6738e0cba1971a320fefda281c3ef5798cd011bf6fab981d2c" as const;

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_INFO_SHA256 =
  "815d289dcbe71a5fd3192da59bad12462c914e20362f6fe5f71bfacc39ab9b9d" as const;

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID =
  HEADLESS_CLEANUP_RUNTIME_RENDERER_BUILD_ID;

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_CAPABILITY_VERSION =
  "2G.25-cleanup-runtime" as const;

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_CAPABILITY_VERSION =
  "2G.25-cleanup-runtime-finalization-correction" as const;

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_REASON_ID =
  "invalid_renderer_build_id_packaged_worker" as const;

/** Live probe finalization failure on schema-008 cleanup-runtime worker. */
export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_LIVE_FINALIZATION_FAILED_REASON_ID =
  "live_owned_object_finalization_failure" as const;

/**
 * Part F execution probe closed before job creation because the correction image
 * remained historical / not probe-eligible (`FAIL_TELEMETRY_IMAGE`).
 */
export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PROBE_INELIGIBLE_REASON_ID =
  "probe_ineligible_historical_lifecycle" as const;

const ACCEPTED_MIGRATION_SOURCES = embeddedSchemaFingerprintAsPreflightSources();

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_SCHEMA_FINGERPRINT =
  Object.freeze({
    migrationIds: ACCEPTED_MIGRATION_SOURCES.map((entry) => entry.migrationId),
    checksumSha256: ACCEPTED_MIGRATION_SOURCES.map(
      (entry) => entry.checksumSha256,
    ),
  });

export type HeadlessFlyStagingCleanupRuntimeLifecycle =
  | "prospective"
  | "historical"
  | "rejected";

export type HeadlessFlyStagingCleanupRuntimeImageRecord = {
  readonly recordId:
    | "post_007_2g25_cleanup_runtime_rejected"
    | "post_007_2g25_cleanup_runtime_live_finalization_failed"
    | "post_008_2g25_cleanup_runtime_finalization_correction_prospective"
    | "post_008_2g25_cleanup_runtime_finalization_correction_rejected";
  readonly lifecycle: HeadlessFlyStagingCleanupRuntimeLifecycle;
  readonly imageDigestSha256: string;
  readonly rendererBuildId: typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID;
  readonly schemaFingerprint: {
    readonly migrationIds: readonly string[];
    readonly checksumSha256: readonly string[];
  };
  readonly cleanupCapabilityVersion:
    | typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_CAPABILITY_VERSION
    | typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_CAPABILITY_VERSION;
  readonly hostedWorkerArtifactSha256: string;
  readonly hostedPageArtifactSha256: string;
  readonly buildInfoSha256: string;
  readonly maintenanceEnabled: false;
  readonly eligibleForVerifyLiveHarness: boolean;
  readonly eligibleForRenderLiveHarness: boolean;
  readonly eligibleForCurrentStagingReadiness: boolean;
  readonly eligibleForRollbackSelection: boolean;
  readonly eligibleForDeploy: boolean;
  readonly eligibleForRuntimeReady: boolean;
  readonly eligibleForProbe: boolean;
  readonly rejectionReasonId?:
    | typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_REASON_ID
    | typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_LIVE_FINALIZATION_FAILED_REASON_ID
    | typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PROBE_INELIGIBLE_REASON_ID;
};

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_2g25_cleanup_runtime_rejected",
    lifecycle: "rejected",
    imageDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
    rendererBuildId: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
    schemaFingerprint: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_SCHEMA_FINGERPRINT,
    cleanupCapabilityVersion:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_CAPABILITY_VERSION,
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PAGE_ARTIFACT_SHA256,
    buildInfoSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_INFO_SHA256,
    maintenanceEnabled: false,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
    eligibleForRollbackSelection: false,
    eligibleForDeploy: false,
    eligibleForRuntimeReady: false,
    eligibleForProbe: false,
    rejectionReasonId: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_REASON_ID,
  } satisfies HeadlessFlyStagingCleanupRuntimeImageRecord);

export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_LIVE_FINALIZATION_FAILED_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_2g25_cleanup_runtime_live_finalization_failed",
    lifecycle: "rejected",
    imageDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
    rendererBuildId: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
    schemaFingerprint: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_SCHEMA_FINGERPRINT,
    cleanupCapabilityVersion:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_CAPABILITY_VERSION,
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PAGE_ARTIFACT_SHA256,
    buildInfoSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_INFO_SHA256,
    maintenanceEnabled: false,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
    eligibleForRollbackSelection: false,
    eligibleForDeploy: false,
    eligibleForRuntimeReady: false,
    eligibleForProbe: false,
    rejectionReasonId:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_LIVE_FINALIZATION_FAILED_REASON_ID,
  } satisfies HeadlessFlyStagingCleanupRuntimeImageRecord);

/**
 * Corrected cleanup-runtime — permanently rejected after Part F probe eligibility
 * closed before job creation. No second forward; no promotion.
 */
export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_REJECTED_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_008_2g25_cleanup_runtime_finalization_correction_rejected",
    lifecycle: "rejected",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
    rendererBuildId: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
    schemaFingerprint: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_SCHEMA_FINGERPRINT,
    cleanupCapabilityVersion:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_CAPABILITY_VERSION,
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PAGE_ARTIFACT_SHA256,
    buildInfoSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_INFO_SHA256,
    maintenanceEnabled: false,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
    eligibleForRollbackSelection: false,
    eligibleForDeploy: false,
    eligibleForRuntimeReady: false,
    eligibleForProbe: false,
    rejectionReasonId:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PROBE_INELIGIBLE_REASON_ID,
  } satisfies HeadlessFlyStagingCleanupRuntimeImageRecord);

/** @deprecated Prefer HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_REJECTED_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_PROSPECTIVE_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_REJECTED_IMAGE_RECORD;

/** @deprecated Prefer HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_LIVE_FINALIZATION_FAILED_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_PROSPECTIVE_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_LIVE_FINALIZATION_FAILED_IMAGE_RECORD;

/** @deprecated Prefer HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_REJECTED_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PROSPECTIVE_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_REJECTED_IMAGE_RECORD;

export type HeadlessFlyStagingCleanupRuntimeCoherenceReasonId =
  | "ok"
  | "placeholder_digest"
  | "rejected_digest"
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

export function isHeadlessFlyStagingPermanentlyRejectedCleanupRuntimeDigest(
  digest: unknown,
): boolean {
  return (
    typeof digest === "string" &&
    (digest === HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST ||
      digest === HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST ||
      digest ===
        HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST)
  );
}

export function classifyHeadlessFlyStagingPermanentlyRejectedCleanupRuntimeDigest(
  digest: unknown,
):
  | {
      readonly rejected: true;
      readonly reasonId:
        | typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_REASON_ID
        | typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_LIVE_FINALIZATION_FAILED_REASON_ID
        | typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PROBE_INELIGIBLE_REASON_ID;
      readonly record: HeadlessFlyStagingCleanupRuntimeImageRecord;
    }
  | { readonly rejected: false } {
  if (
    typeof digest === "string" &&
    digest === HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST
  ) {
    return Object.freeze({
      rejected: true,
      reasonId: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_REASON_ID,
      record: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_RECORD,
    });
  }
  if (
    typeof digest === "string" &&
    digest === HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST
  ) {
    return Object.freeze({
      rejected: true,
      reasonId:
        HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_LIVE_FINALIZATION_FAILED_REASON_ID,
      record: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_LIVE_FINALIZATION_FAILED_IMAGE_RECORD,
    });
  }
  if (
    typeof digest === "string" &&
    digest ===
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST
  ) {
    return Object.freeze({
      rejected: true,
      reasonId: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PROBE_INELIGIBLE_REASON_ID,
      record:
        HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_REJECTED_IMAGE_RECORD,
    });
  }
  return Object.freeze({ rejected: false });
}

export function buildHeadlessFlyStagingCleanupRuntimePublicEnvironment(): Readonly<
  Record<
    | keyof typeof HEADLESS_FLY_STAGING_PUBLIC_ENV
    | "HEADLESS_RENDERER_BUILD_ID"
    | "HEADLESS_EXPORT_MAINTENANCE_ENABLED",
    string
  >
> {
  return Object.freeze({
    ...HEADLESS_FLY_STAGING_PUBLIC_ENV,
    HEADLESS_RENDERER_BUILD_ID:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
    HEADLESS_EXPORT_MAINTENANCE_ENABLED: "0",
  });
}

export function classifyHeadlessFlyStagingCleanupRuntimeImageRecord(
  record: HeadlessFlyStagingCleanupRuntimeImageRecord = HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_REJECTED_IMAGE_RECORD,
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
      record.recordId === "post_007_2g25_cleanup_runtime_rejected" ||
      record.recordId === "post_007_2g25_cleanup_runtime_live_finalization_failed" ||
      record.recordId ===
        "post_008_2g25_cleanup_runtime_finalization_correction_rejected" ||
      record.recordId ===
        "post_008_2g25_cleanup_runtime_finalization_correction_prospective" ||
      isHeadlessFlyStagingPermanentlyRejectedCleanupRuntimeDigest(
        record.imageDigestSha256,
      )
    ) {
      return Object.freeze({ ok: false, reasonId: "rejected_digest" });
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
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_HOSTED_WORKER_ARTIFACT_SHA256
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
    if (
      record.cleanupCapabilityVersion !==
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_CAPABILITY_VERSION
    ) {
      return Object.freeze({ ok: false, reasonId: "hostile_input" });
    }
    if (
      record.eligibleForDeploy ||
      record.eligibleForProbe ||
      record.eligibleForRuntimeReady ||
      record.eligibleForCurrentStagingReadiness ||
      record.eligibleForRollbackSelection
    ) {
      return Object.freeze({ ok: false, reasonId: "hostile_input" });
    }
    return Object.freeze({ ok: true });
  } catch {
    return Object.freeze({ ok: false, reasonId: "hostile_input" });
  }
}

/** No deployable prospective cleanup-runtime digest remains after Part F rejection. */
export function resolveHeadlessFlyStagingCleanupRuntimeProspectiveImageRecord(): HeadlessFlyStagingCleanupRuntimeImageRecord {
  return HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_REJECTED_IMAGE_RECORD;
}

export function resolveHeadlessFlyStagingCleanupRuntimeRejectedImageRecord(): HeadlessFlyStagingCleanupRuntimeImageRecord {
  return HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_RECORD;
}
