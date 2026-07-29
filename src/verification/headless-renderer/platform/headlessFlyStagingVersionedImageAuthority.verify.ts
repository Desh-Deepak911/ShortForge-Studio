/**
 * Sprint 11E Phase 2E.2D.8C.2A / 8F.1 / 8F.2 — versioned Fly staging accepted-image authority.
 * Run: npm run test:headless-fly-staging-versioned-image-authority
 */

import assert from "node:assert/strict";
import { sha256FileSync } from "../../support/evidence-hash";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  HEADLESS_FLY_STAGING_PAGE_MATERIALIZATION_CAPABILITY_VERSION,
  HEADLESS_FLY_STAGING_PAGE_TELEMETRY_CAPABILITY_VERSION,
  HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_PAGE_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_CURRENT_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_CURRENT_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_CURRENT_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_PROSPECTIVE_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_PROSPECTIVE_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_PAGE_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_BUILD_INFO_SHA256,
  HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_BUILD_INFO_SHA256,
  HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_BUILD_INFO_SHA256,
  HEADLESS_FLY_STAGING_POST_007_STAGING_RUNTIME_OBSERVED_BASELINE_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_STAGING_RUNTIME_OBSERVED_BASELINE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_STAGING_RUNTIME_OBSERVED_BASELINE_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_CURRENT_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_PROSPECTIVE_BUILD_INFO_SHA256,
  HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_PROSPECTIVE_PAGE_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_REAL_VIDEO_MOTION_CAPABILITY_VERSION,
  HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_BUILD_INFO_SHA256,
  HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_CURRENT_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_PAGE_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_BUILD_INFO_SHA256,
  HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_CURRENT_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_PAGE_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_PROSPECTIVE_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_FRAME_PROGRESS_CAPABILITY_VERSION,
  HEADLESS_FLY_STAGING_MANIFEST_CONTRACT_ALIGNMENT_CAPABILITY_VERSION,
  HEADLESS_FLY_STAGING_ARTIFACT_BINDING_COHERENCE_CAPABILITY_VERSION,
  HEADLESS_FLY_STAGING_ARTIFACT_BINDING_CLEANUP_CORRECTION_CAPABILITY_VERSION,
  HEADLESS_FLY_STAGING_OBJECT_KEY_BINDING_VALIDATION_CAPABILITY_VERSION,
  HEADLESS_FLY_STAGING_POST_FRAME_ATTRIBUTION_CAPABILITY_VERSION,
  HEADLESS_FLY_STAGING_POST_FRAME_CORRECTION_CAPABILITY_VERSION,
  HEADLESS_FLY_STAGING_BOOTSTRAP_COHERENCE_CAPABILITY_VERSION,
  HEADLESS_FLY_STAGING_DURABLE_SOURCE_IDENTITY_CAPABILITY_VERSION,
  HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_PROSPECTIVE_IMAGE_DIGEST,
    HEADLESS_FLY_STAGING_PROFILE_BOUNDARY_CONTINUITY_CAPABILITY_VERSION,
  HEADLESS_FLY_STAGING_BOUNDARY_TELEMETRY_CAPABILITY_VERSION,
  HEADLESS_FLY_STAGING_PAGE_ATTRIBUTION_REAL_SHAPE_CAPABILITY_VERSION,
  HEADLESS_FLY_STAGING_PAGE_ATTRIBUTION_CAPABILITY_VERSION,
  HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_PROSPECTIVE_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_CURRENT_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_MIGRATION_CHECKSUM_SHA256,
  HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_PRE_007_HISTORICAL_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_PRE_007_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
  HEADLESS_FLY_STAGING_VERSIONED_IMAGE_AUTHORITY_VERSION,
  HEADLESS_FLY_STAGING_VERSIONED_IMAGE_RECORDS,
  classifyCurrentFlyStagingImageEligibility,
  classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority,
  classifyFlyStagingCrossBoundImageDigestMatch,
  classifyFlyStagingImagePageArtifactEligibility,
  classifyFlyStagingImageWorkerArtifactEligibility,
  rejectOperatorSuppliedFlyStagingImageDigestOverride,
  resolveCurrentFlyStagingAcceptedImageDigestSha256,
  resolveCurrentFlyStagingAcceptedImageRecord,
  resolveHistoricalPost0078f2PageTelemetryFlyStagingImageRecord,
  resolveHistoricalPost0078f4PageMaterializationFlyStagingImageRecord,
  resolveHistoricalPost0078f5PageAttributionFlyStagingImageRecord,
  resolveHistoricalPost0078f7BoundaryTelemetryFlyStagingImageRecord,
  resolveProspectiveFlyStaging8f5AttributionImageRecord,
  resolveProspectiveFlyStaging8f51RealShapeAttributionImageRecord,
  resolveProspectiveFlyStaging8f71ProfileBoundaryContinuityImageRecord,
  resolveHistoricalPost0078f71ProfileBoundaryContinuityFlyStagingImageRecord,
  resolveProspectiveFlyStaging8g1DurableSourceIdentityImageRecord,
  resolveHistoricalPost0078hBootstrapCoherenceFlyStagingImageRecord,
  resolveProspectiveFlyStaging8hBootstrapCoherenceImageRecord,
  resolveHistoricalPost0078iPostFrameCorrectionFlyStagingImageRecord,
  resolveProspectiveFlyStaging8iPostFrameCorrectionImageRecord,
  resolveProspectiveFlyStaging8i2PostFrameAttributionImageRecord,
  resolveHistoricalPost0078i3ArtifactBindingCoherenceFlyStagingImageRecord,
  resolveProspectiveFlyStaging8i3ArtifactBindingCoherenceImageRecord,
  resolveHistoricalPost0078i4ArtifactBindingCleanupCorrectionFlyStagingImageRecord,
  resolveProspectiveFlyStaging8i4ArtifactBindingCleanupCorrectionImageRecord,
  resolveProspectiveFlyStaging8i5ObjectKeyBindingValidationImageRecord,
  resolveProspectiveFlyStaging2g12RealVideoMotionImageRecord,
  resolveProspectiveFlyStaging8f7BoundaryTelemetryImageRecord,
  resolveProspectiveFlyStagingRolloutImageRecord,
  validateCurrentFlyLivePassImageAuthority,
  validateFlyRenderLiveAcceptedImageDigestAuthority,
  validateHistoricalFlyVerifyLivePassImageAuthority,
  validateHistoricalPost0078fTelemetryFlyLiveImageAuthority,
  validateHistoricalPost007PreTelemetryFlyLiveImageAuthority,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";
import { classifyPost007WorkerImageEligibility } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-slot-key-007-authority";
import {
  classifyFlyVerifyLiveAmendedReadiness,
} from "../fly-verify-live/fly-verify-live-readiness";
import { validatePassFlyVerifyLiveEvidence } from "../fly-verify-live/evidence-authority";
import {
  createExactPassFlyVerifyLiveCaseResults,
  REQUIRED_FLY_VERIFY_LIVE_CASE_IDS,
} from "../fly-verify-live/required-cases";
import { buildFlyVerifyLiveSchemaFingerprint } from "../fly-verify-live/evidence-authority";
import { HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_IMAGE_DIGEST } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-verify-first-pass-evidence";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const HISTORICAL_PASS_PATH =
  "docs/evidence/headless/archive/HEADLESS_11E_FLY_VERIFY_LIVE_EVIDENCE.pre-007-historical-pass-93c402510d234340cd7d21904d9c49295e88c06fb4a3709a73fc794b92769e88.md";

const OFFICIAL_EVIDENCE_SHAS = Object.freeze({
  verifyLivePass: "b75d4f2d9799ef75afbbbbfb6aa0f1b5b0b27f8c3d0edb937940912d57f0b6b4",
  ownedObjectStagingPass: "8a01a93fd9e90de4a02dc0a74a112f7993d16f61eabf2c7473473b3bb68e8ca2",
  ownedObjectFinalizePass: "b892b98f205610bf3cb32410414265ae3c087239b3a95f02392d95a847676a96",
  renderLivePass: "f808db98a4925057e235dbda9f212232959b66089d4bce1e0476e52f9468f693",
  renderLiveFailArchived8J: "2e6942334843b664e7089d13bfca488c29f888bfac897e89aceb2fb1768feb01",
} as const);

const SEVEN_MIGRATION_IDS =
  HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_HISTORICAL_IMAGE_RECORD.schemaFingerprint
    .migrationIds;
const SIX_MIGRATION_IDS =
  HEADLESS_FLY_STAGING_PRE_007_HISTORICAL_IMAGE_RECORD.schemaFingerprint
    .migrationIds;

let passed = 0;


async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function machinesJson(digest: string): string {
  return JSON.stringify([
    {
      id: "d895d12a240938",
      region: "iad",
      state: "started",
      config: {
        metadata: { fly_process_group: "verify" },
        guest: { cpu_kind: "shared", cpus: 1, memory_mb: 2048 },
        image: `registry.fly.io/app@sha256:${digest}`,
      },
    },
  ]);
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2G.20 — versioned Fly staging image authority\n",
  );

  await test("authority version is frozen at 31 with twenty-one immutable records", () => {
    assert.equal(HEADLESS_FLY_STAGING_VERSIONED_IMAGE_AUTHORITY_VERSION, 31);
    assert.equal(HEADLESS_FLY_STAGING_VERSIONED_IMAGE_RECORDS.length, 21);
    assert.deepEqual(
      HEADLESS_FLY_STAGING_VERSIONED_IMAGE_RECORDS.map((r) => r.recordId),
      [
        "pre_007_historical",
        "post_007_pre_telemetry_historical",
        "post_007_8f_telemetry_historical",
        "post_007_8f2_page_telemetry_historical",
        "post_007_8f4_page_materialization_historical",
        "post_007_8f5_page_attribution_historical",
        "post_007_8f51_real_shape_attribution_historical",
        "post_007_8f7_boundary_telemetry_historical",
        "post_007_8f71_profile_boundary_continuity_historical",
        "post_007_8g1_durable_source_identity_historical",
        "post_007_8h_bootstrap_coherence_historical",
        "post_007_8i_post_frame_correction_historical",
        "post_007_8i2_post_frame_attribution_historical",
        "post_007_8i3_artifact_binding_coherence_historical",
        "post_007_8i4_artifact_binding_cleanup_correction_historical",
        "post_007_8i5_object_key_binding_validation_historical",
        "post_007_staging_runtime_observed_baseline_historical",
        "post_007_2g12_real_video_motion_historical",
        "post_007_2g20_manifest_contract_alignment_historical",
        "post_007_2g23_frame_progress_prospective",
        "post_007_2g23_frame_progress_current",
      ],
    );
  });

  await test("2G.12 historical record remains immutable and ineligible", () => {
    const record =
      HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_CURRENT_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_PROSPECTIVE_IMAGE_DIGEST,
    );
    assert.equal(
      record.hostedWorkerArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    );
    assert.equal(
      record.hostedPageArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_PROSPECTIVE_PAGE_ARTIFACT_SHA256,
    );
    assert.equal(
      record.pageTelemetryCapabilityVersion,
      HEADLESS_FLY_STAGING_REAL_VIDEO_MOTION_CAPABILITY_VERSION,
    );
    assert.equal(record.lifecycle, "historical");
    assert.equal(record.eligibleForCurrentStagingReadiness, false);
    assert.equal(record.eligibleForRenderLiveHarness, false);
    assert.equal(record.eligibleForVerifyLiveHarness, false);
    assert.equal(
      resolveProspectiveFlyStaging2g12RealVideoMotionImageRecord().recordId,
      "post_007_2g12_real_video_motion_historical",
    );
    assert.equal(
      HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_PROSPECTIVE_BUILD_INFO_SHA256,
      "6b2285c3245e29b26c9b212bd35032dfcf2333d89b329a710803c243d2a0411a",
    );
    assert.equal(
      record.schemaFingerprint.checksumSha256.at(-1),
      HEADLESS_FLY_STAGING_POST_007_MIGRATION_CHECKSUM_SHA256,
    );
    assert.notEqual(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_IMAGE_DIGEST,
    );
  });

  await test("2G.20 historical record binds v4/9D worker and remains ineligible", () => {
    const record =
      HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_HISTORICAL_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_IMAGE_DIGEST,
    );
    assert.equal(
      record.hostedWorkerArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_HOSTED_WORKER_ARTIFACT_SHA256,
    );
    assert.equal(
      record.hostedPageArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_PAGE_ARTIFACT_SHA256,
    );
    assert.equal(
      record.pageTelemetryCapabilityVersion,
      HEADLESS_FLY_STAGING_MANIFEST_CONTRACT_ALIGNMENT_CAPABILITY_VERSION,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_BUILD_INFO_SHA256,
      "6b2285c3245e29b26c9b212bd35032dfcf2333d89b329a710803c243d2a0411a",
    );
    assert.equal(record.lifecycle, "historical");
    assert.equal(record.eligibleForCurrentStagingReadiness, false);
    assert.equal(record.eligibleForRenderLiveHarness, false);
    assert.equal(record.eligibleForVerifyLiveHarness, false);
  });

  await test("2G.23 current record binds frame-progress worker and runtime image", () => {
    const record =
      HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_CURRENT_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
    );
    assert.equal(
      record.hostedWorkerArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_HOSTED_WORKER_ARTIFACT_SHA256,
    );
    assert.equal(
      record.hostedPageArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_PAGE_ARTIFACT_SHA256,
    );
    assert.equal(
      record.pageTelemetryCapabilityVersion,
      HEADLESS_FLY_STAGING_FRAME_PROGRESS_CAPABILITY_VERSION,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_BUILD_INFO_SHA256,
      "6b2285c3245e29b26c9b212bd35032dfcf2333d89b329a710803c243d2a0411a",
    );
    assert.equal(record.lifecycle, "current");
    assert.equal(record.eligibleForCurrentStagingReadiness, true);
    assert.equal(record.eligibleForRenderLiveHarness, true);
    assert.equal(record.eligibleForVerifyLiveHarness, true);
  });

  await test("observed staging runtime baseline historical record binds rollback pin digest and remote artifacts", () => {
    const record =
      HEADLESS_FLY_STAGING_POST_007_STAGING_RUNTIME_OBSERVED_BASELINE_HISTORICAL_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_STAGING_RUNTIME_OBSERVED_BASELINE_IMAGE_DIGEST,
    );
    assert.equal(
      record.hostedWorkerArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_STAGING_RUNTIME_OBSERVED_BASELINE_HOSTED_WORKER_ARTIFACT_SHA256,
    );
    assert.equal(
      record.hostedPageArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_PAGE_ARTIFACT_SHA256,
    );
    assert.equal(record.lifecycle, "historical");
    assert.equal(record.eligibleForCurrentStagingReadiness, false);
    assert.notEqual(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_IMAGE_DIGEST,
    );
  });

  await test("8I.4 historical record binds cleanup-correction digest and artifacts — not runtime-ready", () => {
    const record =
      HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_HISTORICAL_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_IMAGE_DIGEST,
    );
    assert.equal(
      record.hostedWorkerArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    );
    assert.equal(
      record.hostedPageArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_PAGE_ARTIFACT_SHA256,
    );
    assert.equal(
      record.pageTelemetryCapabilityVersion,
      HEADLESS_FLY_STAGING_ARTIFACT_BINDING_CLEANUP_CORRECTION_CAPABILITY_VERSION,
    );
    assert.equal(record.lifecycle, "historical");
    assert.equal(record.eligibleForCurrentStagingReadiness, false);
    assert.equal(record.eligibleForRenderLiveHarness, false);
    assert.equal(record.eligibleForVerifyLiveHarness, false);
    assert.equal(
      resolveProspectiveFlyStaging8i4ArtifactBindingCleanupCorrectionImageRecord().recordId,
      "post_007_8i4_artifact_binding_cleanup_correction_historical",
    );
    assert.equal(
      HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_BUILD_INFO_SHA256,
      "6b2285c3245e29b26c9b212bd35032dfcf2333d89b329a710803c243d2a0411a",
    );
    assert.equal(
      record.schemaFingerprint.checksumSha256.at(-1),
      HEADLESS_FLY_STAGING_POST_007_MIGRATION_CHECKSUM_SHA256,
    );
    assert.notEqual(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_IMAGE_DIGEST,
    );
  });

  await test("8I.5 historical record binds object-key validation digest and artifacts — not runtime-ready", () => {
    const record =
      HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_HISTORICAL_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_IMAGE_DIGEST,
    );
    assert.equal(
      record.hostedWorkerArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    );
    assert.equal(
      record.hostedPageArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_PAGE_ARTIFACT_SHA256,
    );
    assert.equal(
      record.pageTelemetryCapabilityVersion,
      HEADLESS_FLY_STAGING_OBJECT_KEY_BINDING_VALIDATION_CAPABILITY_VERSION,
    );
    assert.equal(record.lifecycle, "historical");
    assert.equal(record.eligibleForCurrentStagingReadiness, false);
    assert.equal(record.eligibleForRenderLiveHarness, false);
    assert.equal(record.eligibleForVerifyLiveHarness, false);
    assert.equal(
      resolveProspectiveFlyStaging8i5ObjectKeyBindingValidationImageRecord().recordId,
      "post_007_8i5_object_key_binding_validation_historical",
    );
    assert.equal(
      HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_BUILD_INFO_SHA256,
      "6b2285c3245e29b26c9b212bd35032dfcf2333d89b329a710803c243d2a0411a",
    );
    assert.equal(
      record.schemaFingerprint.checksumSha256.at(-1),
      HEADLESS_FLY_STAGING_POST_007_MIGRATION_CHECKSUM_SHA256,
    );
    assert.notEqual(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_IMAGE_DIGEST,
    );
    assert.notEqual(
      resolveCurrentFlyStagingAcceptedImageRecord().imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_IMAGE_DIGEST,
    );
  });

  await test("8I.3 historical record binds artifact-binding digest and artifacts — not runtime-ready", () => {
    const record =
      HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_HISTORICAL_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_IMAGE_DIGEST,
    );
    assert.equal(
      record.hostedWorkerArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    );
    assert.equal(
      record.hostedPageArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_PAGE_ARTIFACT_SHA256,
    );
    assert.equal(
      record.pageTelemetryCapabilityVersion,
      HEADLESS_FLY_STAGING_ARTIFACT_BINDING_COHERENCE_CAPABILITY_VERSION,
    );
    assert.equal(record.lifecycle, "historical");
    assert.equal(record.eligibleForCurrentStagingReadiness, false);
    assert.equal(record.eligibleForRenderLiveHarness, false);
    assert.equal(record.eligibleForVerifyLiveHarness, false);
    assert.equal(
      resolveProspectiveFlyStaging8i3ArtifactBindingCoherenceImageRecord().recordId,
      "post_007_8i3_artifact_binding_coherence_historical",
    );
    assert.equal(
      HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_BUILD_INFO_SHA256,
      "6b2285c3245e29b26c9b212bd35032dfcf2333d89b329a710803c243d2a0411a",
    );
    assert.equal(
      record.schemaFingerprint.checksumSha256.at(-1),
      HEADLESS_FLY_STAGING_POST_007_MIGRATION_CHECKSUM_SHA256,
    );
    assert.equal(
      resolveHistoricalPost0078i3ArtifactBindingCoherenceFlyStagingImageRecord().recordId,
      "post_007_8i3_artifact_binding_coherence_historical",
    );
  });

  await test("8I.2 historical record binds post-frame attribution digest — not runtime-ready", () => {
    const record =
      HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_HISTORICAL_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
    );
    assert.equal(
      record.hostedWorkerArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    );
    assert.equal(
      record.hostedPageArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_PAGE_ARTIFACT_SHA256,
    );
    assert.equal(
      record.pageTelemetryCapabilityVersion,
      HEADLESS_FLY_STAGING_POST_FRAME_ATTRIBUTION_CAPABILITY_VERSION,
    );
    assert.equal(record.lifecycle, "historical");
    assert.equal(record.eligibleForCurrentStagingReadiness, false);
    assert.equal(record.eligibleForRenderLiveHarness, false);
    assert.equal(record.eligibleForVerifyLiveHarness, false);
    assert.equal(
      resolveProspectiveFlyStaging8i2PostFrameAttributionImageRecord().recordId,
      "post_007_8i2_post_frame_attribution_historical",
    );
    assert.notEqual(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_IMAGE_DIGEST,
    );
  });

  await test("8I historical record binds post-frame correction digest and artifacts — not runtime-ready", () => {
    const record =
      HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_HISTORICAL_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_PROSPECTIVE_IMAGE_DIGEST,
    );
    assert.equal(
      record.hostedWorkerArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    );
    assert.equal(
      record.hostedPageArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_PAGE_ARTIFACT_SHA256,
    );
    assert.equal(
      record.pageTelemetryCapabilityVersion,
      HEADLESS_FLY_STAGING_POST_FRAME_CORRECTION_CAPABILITY_VERSION,
    );
    assert.equal(record.lifecycle, "historical");
    assert.equal(record.eligibleForCurrentStagingReadiness, false);
    assert.equal(record.eligibleForRenderLiveHarness, false);
    assert.equal(record.eligibleForVerifyLiveHarness, false);
    assert.equal(
      resolveProspectiveFlyStaging8iPostFrameCorrectionImageRecord().recordId,
      "post_007_8i_post_frame_correction_historical",
    );
  });

  await test("8H historical record binds bootstrap-coherence digest — not runtime-ready", () => {
    const record =
      HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_HISTORICAL_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_IMAGE_DIGEST,
    );
    assert.equal(
      record.hostedWorkerArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    );
    assert.equal(
      record.pageTelemetryCapabilityVersion,
      HEADLESS_FLY_STAGING_BOOTSTRAP_COHERENCE_CAPABILITY_VERSION,
    );
    assert.equal(record.lifecycle, "historical");
    assert.equal(record.eligibleForCurrentStagingReadiness, false);
    assert.equal(record.eligibleForRenderLiveHarness, false);
    assert.equal(record.eligibleForVerifyLiveHarness, false);
    assert.equal(
      resolveProspectiveFlyStaging8hBootstrapCoherenceImageRecord().recordId,
      "post_007_8h_bootstrap_coherence_historical",
    );
    assert.notEqual(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_PROSPECTIVE_IMAGE_DIGEST,
    );
  });

  await test("8G.1 historical record binds durable source-identity digest — not runtime-ready", () => {
    const record =
      HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_HISTORICAL_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_PROSPECTIVE_IMAGE_DIGEST,
    );
    assert.equal(record.lifecycle, "historical");
    assert.equal(record.eligibleForCurrentStagingReadiness, false);
    assert.equal(record.eligibleForRenderLiveHarness, false);
    assert.equal(record.eligibleForVerifyLiveHarness, false);
  });


  await test("8F.7.1 historical record binds profile/boundary digest — not runtime-ready", () => {
    const record =
      HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_HISTORICAL_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_PROSPECTIVE_IMAGE_DIGEST,
    );
    assert.equal(record.lifecycle, "historical");
    assert.equal(record.eligibleForCurrentStagingReadiness, false);
    assert.equal(record.eligibleForRenderLiveHarness, false);
    assert.equal(record.eligibleForVerifyLiveHarness, false);
  });

  await test("8F.7 historical record binds boundary-telemetry digest — not runtime-ready", () => {
    const record =
      HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_HISTORICAL_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_PROSPECTIVE_IMAGE_DIGEST,
    );
    assert.equal(record.lifecycle, "historical");
    assert.equal(record.eligibleForCurrentStagingReadiness, false);
    assert.equal(record.eligibleForRenderLiveHarness, false);
    assert.equal(record.eligibleForVerifyLiveHarness, false);
  });

  await test("8F.5.1 historical record binds real-shape digest — not runtime-ready", () => {
    const record =
      HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
    );
    assert.equal(record.lifecycle, "historical");
    assert.equal(record.eligibleForCurrentStagingReadiness, false);
    assert.equal(record.eligibleForRenderLiveHarness, false);
    assert.equal(record.eligibleForVerifyLiveHarness, false);
  });

  await test("8F.5 historical record binds digest, worker, page artifact — not runtime-ready", () => {
    const record = HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
    );
    assert.equal(
      record.hostedWorkerArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    );
    assert.equal(
      record.pageTelemetryCapabilityVersion,
      HEADLESS_FLY_STAGING_PAGE_ATTRIBUTION_CAPABILITY_VERSION,
    );
    assert.equal(record.lifecycle, "historical");
    assert.equal(record.eligibleForCurrentStagingReadiness, false);
    assert.equal(record.eligibleForRenderLiveHarness, false);
    assert.equal(record.eligibleForVerifyLiveHarness, false);
  });

  await test("2G.23 prospective record binds frame-progress worker and is not deployment-eligible", () => {
    const record =
      HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_PROSPECTIVE_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
    );
    assert.equal(
      record.hostedWorkerArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_HOSTED_WORKER_ARTIFACT_SHA256,
    );
    assert.equal(
      record.hostedPageArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_PAGE_ARTIFACT_SHA256,
    );
    assert.equal(
      record.pageTelemetryCapabilityVersion,
      HEADLESS_FLY_STAGING_FRAME_PROGRESS_CAPABILITY_VERSION,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_BUILD_INFO_SHA256,
      "6b2285c3245e29b26c9b212bd35032dfcf2333d89b329a710803c243d2a0411a",
    );
    assert.equal(record.lifecycle, "historical");
    assert.equal(record.eligibleForCurrentStagingReadiness, false);
    assert.equal(record.eligibleForRenderLiveHarness, false);
    assert.equal(record.eligibleForVerifyLiveHarness, false);
    assert.notEqual(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_IMAGE_DIGEST,
    );
  });

  await test("current and prospective selectors resolve 2G.23 frame-progress current", () => {
    const current = resolveCurrentFlyStagingAcceptedImageRecord();
    const prospective = resolveProspectiveFlyStagingRolloutImageRecord();
    assert.equal(current.recordId, "post_007_2g23_frame_progress_current");
    assert.equal(prospective.recordId, "post_007_2g23_frame_progress_current");
    assert.equal(
      resolveProspectiveFlyStaging8i3ArtifactBindingCoherenceImageRecord().recordId,
      "post_007_8i3_artifact_binding_coherence_historical",
    );
    assert.equal(
      resolveProspectiveFlyStaging8i4ArtifactBindingCleanupCorrectionImageRecord().recordId,
      "post_007_8i4_artifact_binding_cleanup_correction_historical",
    );
    assert.equal(
      resolveProspectiveFlyStaging8i5ObjectKeyBindingValidationImageRecord().recordId,
      "post_007_8i5_object_key_binding_validation_historical",
    );
    assert.equal(
      resolveProspectiveFlyStaging8i2PostFrameAttributionImageRecord().recordId,
      "post_007_8i2_post_frame_attribution_historical",
    );
    assert.equal(
      resolveProspectiveFlyStaging8iPostFrameCorrectionImageRecord().recordId,
      "post_007_8i_post_frame_correction_historical",
    );
    assert.equal(
      resolveProspectiveFlyStaging8hBootstrapCoherenceImageRecord().recordId,
      "post_007_8h_bootstrap_coherence_historical",
    );
    assert.equal(
      resolveProspectiveFlyStaging8g1DurableSourceIdentityImageRecord().recordId,
      "post_007_8g1_durable_source_identity_historical",
    );
    assert.equal(
      resolveProspectiveFlyStaging8f71ProfileBoundaryContinuityImageRecord().recordId,
      "post_007_8f71_profile_boundary_continuity_historical",
    );
    assert.equal(
      resolveProspectiveFlyStaging8f7BoundaryTelemetryImageRecord().recordId,
      "post_007_8f7_boundary_telemetry_historical",
    );
    assert.equal(
      current.imageDigestSha256,
      resolveCurrentFlyStagingAcceptedImageDigestSha256(),
    );
  });



  await test("execution probe rejects 8F.5 historical render image", () => {
    const probe = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
    });
    assert.equal(probe.ok, false);
    assert.equal(probe.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("8F.4 historical digest rejected for current readiness and execution probe", () => {
    const readiness = classifyCurrentFlyStagingImageEligibility({
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_CURRENT_IMAGE_DIGEST,
      schemaMigrationIds: SEVEN_MIGRATION_IDS,
    });
    assert.equal(readiness.eligible, false);
    const probe = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_CURRENT_IMAGE_DIGEST,
    });
    assert.equal(probe.ok, false);
    assert.equal(probe.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("8F.2 historical record binds digest and remains not current-eligible", () => {
    const record = HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_HISTORICAL_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_IMAGE_DIGEST,
    );
    assert.equal(record.lifecycle, "historical");
    assert.equal(record.eligibleForCurrentStagingReadiness, false);
  });

  await test("8F.4 historical record binds digest, worker, page artifact, 8F.4 — not runtime-ready", () => {
    const record = HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_HISTORICAL_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_CURRENT_IMAGE_DIGEST,
    );
    assert.equal(
      record.hostedWorkerArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_CURRENT_HOSTED_WORKER_ARTIFACT_SHA256,
    );
    assert.equal(
      record.hostedPageArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_PAGE_ARTIFACT_SHA256,
    );
    assert.equal(
      record.pageTelemetryCapabilityVersion,
      HEADLESS_FLY_STAGING_PAGE_MATERIALIZATION_CAPABILITY_VERSION,
    );
    assert.equal(record.lifecycle, "historical");
    assert.equal(record.eligibleForVerifyLiveHarness, false);
    assert.equal(record.eligibleForRenderLiveHarness, false);
    assert.equal(record.eligibleForCurrentStagingReadiness, false);
  });

  await test("current selection resolves 2G.23 frame-progress digest a1e26d4b", () => {
    const current = resolveCurrentFlyStagingAcceptedImageRecord();
    assert.equal(current.recordId, "post_007_2g23_frame_progress_current");
    assert.equal(
      resolveCurrentFlyStagingAcceptedImageDigestSha256(),
      HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
    );
    const historical8i3 =
      resolveHistoricalPost0078i3ArtifactBindingCoherenceFlyStagingImageRecord();
    assert.equal(historical8i3.recordId, "post_007_8i3_artifact_binding_coherence_historical");
    assert.notEqual(historical8i3.imageDigestSha256, current.imageDigestSha256);
    const historical8i =
      resolveHistoricalPost0078iPostFrameCorrectionFlyStagingImageRecord();
    assert.equal(historical8i.recordId, "post_007_8i_post_frame_correction_historical");
    assert.notEqual(historical8i.imageDigestSha256, current.imageDigestSha256);
    const historical8h =
      resolveHistoricalPost0078hBootstrapCoherenceFlyStagingImageRecord();
    assert.equal(historical8h.recordId, "post_007_8h_bootstrap_coherence_historical");
    assert.notEqual(historical8h.imageDigestSha256, current.imageDigestSha256);
    const historical871 =
      resolveHistoricalPost0078f71ProfileBoundaryContinuityFlyStagingImageRecord();
    assert.equal(historical871.recordId, "post_007_8f71_profile_boundary_continuity_historical");
    assert.notEqual(historical871.imageDigestSha256, current.imageDigestSha256);
    const historical87 =
      resolveProspectiveFlyStaging8f7BoundaryTelemetryImageRecord();
    assert.equal(historical87.recordId, "post_007_8f7_boundary_telemetry_historical");
    assert.notEqual(historical87.imageDigestSha256, current.imageDigestSha256);
  });

  await test("8F telemetry historical record remains valid but not current-eligible", () => {
    const record = HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
    );
    assert.equal(
      record.hostedWorkerArtifactSha256,
      HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_HOSTED_WORKER_ARTIFACT_SHA256,
    );
    assert.equal(record.pageTelemetryCapabilityVersion, null);
    assert.equal(record.lifecycle, "historical");
  });

  await test("pre-telemetry historical record remains valid but not current-eligible", () => {
    const record = HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_RECORD;
    assert.equal(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
    );
    assert.equal(record.telemetryCapabilityVersion, null);
    assert.equal(record.lifecycle, "historical");
    assert.equal(
      HEADLESS_FLY_STAGING_POST_007_CURRENT_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
    );
  });

  await test("pre-007 historical digest aliases verify-first PASS evidence digest", () => {
    assert.equal(
      HEADLESS_FLY_STAGING_PRE_007_HISTORICAL_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_IMAGE_DIGEST,
    );
    assert.equal(SIX_MIGRATION_IDS.length, 6);
  });

  await test("2G.23 current image + seven migrations accepted for current readiness", () => {
    const result = classifyCurrentFlyStagingImageEligibility({
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
      schemaMigrationIds: SEVEN_MIGRATION_IDS,
    });
    assert.equal(result.eligible, true);
  });

  await test("2G.20 historical image rejected for current readiness", () => {
    const result = classifyCurrentFlyStagingImageEligibility({
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_IMAGE_DIGEST,
      schemaMigrationIds: SEVEN_MIGRATION_IDS,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("8I.5 authority-only historical digest rejected for current readiness", () => {
    const result = classifyCurrentFlyStagingImageEligibility({
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_IMAGE_DIGEST,
      schemaMigrationIds: SEVEN_MIGRATION_IDS,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("all historical digests rejected for current readiness", () => {
    for (const digest of [
      HEADLESS_FLY_STAGING_PRE_007_HISTORICAL_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_CURRENT_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_PROSPECTIVE_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_PROSPECTIVE_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_PROSPECTIVE_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_PROSPECTIVE_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_STAGING_RUNTIME_OBSERVED_BASELINE_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_IMAGE_DIGEST,
    ]) {
      const result = classifyCurrentFlyStagingImageEligibility({
        imageDigestSha256: digest,
        schemaMigrationIds: SEVEN_MIGRATION_IDS,
      });
      assert.equal(result.eligible, false, digest);
    }
  });

  await test("2G.23 current image + six migrations rejected", () => {
    const result = classifyCurrentFlyStagingImageEligibility({
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
      schemaMigrationIds: SIX_MIGRATION_IDS,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reasonId, "post_007_digest_with_six_migrations");
  });

  await test("unknown digest rejected", () => {
    const result = classifyCurrentFlyStagingImageEligibility({
      imageDigestSha256: "0".repeat(64),
      schemaMigrationIds: SEVEN_MIGRATION_IDS,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reasonId, "unknown_digest");
  });

  await test("2G.23 current digest with bound worker artifact accepted for artifact eligibility", () => {
    const result = classifyFlyStagingImageWorkerArtifactEligibility({
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
      hostedWorkerArtifactSha256:
        HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_HOSTED_WORKER_ARTIFACT_SHA256,
    });
    assert.equal(result.ok, true);
  });

  await test("2G.23 current digest with wrong worker artifact rejected", () => {
    const result = classifyFlyStagingImageWorkerArtifactEligibility({
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
      hostedWorkerArtifactSha256: HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HOSTED_WORKER_ARTIFACT_SHA256,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reasonId, "wrong_hosted_worker_artifact");
  });

  await test("2G.23 current digest with wrong page artifact rejected", () => {
    const result = classifyFlyStagingImagePageArtifactEligibility({
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
      hostedPageArtifactSha256: "0".repeat(64),
    });
    assert.equal(result.ok, false);
    assert.equal(result.reasonId, "wrong_hosted_page_artifact");
  });

  await test("cross-bound verify/render digest mismatch rejected", () => {
    const result = classifyFlyStagingCrossBoundImageDigestMatch({
      verifyImageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
      renderImageDigestSha256: HEADLESS_FLY_STAGING_PRE_007_HISTORICAL_IMAGE_DIGEST,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reasonId, "cross_bound_digest_mismatch");
  });

  await test("cross-bound matching 2G.23 current digest accepted", () => {
    const digest = HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST;
    const result = classifyFlyStagingCrossBoundImageDigestMatch({
      verifyImageDigestSha256: digest,
      renderImageDigestSha256: digest,
    });
    assert.equal(result.ok, true);
    assert.equal(result.digestSha256, digest);
  });

  await test("cross-bound historical digests rejected", () => {
    for (const digest of [
      HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
    ]) {
      const result = classifyFlyStagingCrossBoundImageDigestMatch({
        verifyImageDigestSha256: digest,
        renderImageDigestSha256: digest,
      });
      assert.equal(result.ok, false);
      assert.equal(result.reasonId, "unknown_digest");
    }
  });

  await test("operator digest override env rejected", () => {
    const result = rejectOperatorSuppliedFlyStagingImageDigestOverride({
      HEADLESS_FLY_STAGING_ACCEPTED_IMAGE_DIGEST_OVERRIDE: "deadbeef",
    });
    assert.equal(result.ok, false);
  });

  await test("execution probe rejects pre-telemetry and 8F historical render images", () => {
    const preTelemetry = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
    });
    assert.equal(preTelemetry.ok, false);
    assert.equal(preTelemetry.reasonId, "non_telemetry_render_image");

    const historical8f = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
    });
    assert.equal(historical8f.ok, false);
    assert.equal(historical8f.reasonId, "missing_page_telemetry_capability");
  });

  await test("execution probe accepts 2G.23 frame-progress current render image", () => {
    const telemetry = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
    });
    assert.equal(telemetry.ok, true);
  });

  await test("execution probe rejects 2G.20 historical render image", () => {
    const telemetry = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_IMAGE_DIGEST,
    });
    assert.equal(telemetry.ok, false);
    assert.equal(telemetry.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("execution probe rejects 8I.5 authority-only historical render image", () => {
    const telemetry = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_IMAGE_DIGEST,
    });
    assert.equal(telemetry.ok, false);
    assert.equal(telemetry.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("execution probe rejects 8I.4 artifact-binding cleanup correction historical render image", () => {
    const telemetry = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_IMAGE_DIGEST,
    });
    assert.equal(telemetry.ok, false);
    assert.equal(telemetry.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("execution probe rejects 8I.3 artifact-binding coherence historical render image", () => {
    const historical = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_IMAGE_DIGEST,
    });
    assert.equal(historical.ok, false);
    assert.equal(historical.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("execution probe rejects 8G.1 durable source-identity historical render image", () => {
    const historical = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_PROSPECTIVE_IMAGE_DIGEST,
    });
    assert.equal(historical.ok, false);
    assert.equal(historical.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("execution probe rejects 8I post-frame correction historical render image", () => {
    const historical = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_PROSPECTIVE_IMAGE_DIGEST,
    });
    assert.equal(historical.ok, false);
    assert.equal(historical.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("2G.23 current digest with bound worker and page artifacts accepted for artifact eligibility", () => {
    const worker = classifyFlyStagingImageWorkerArtifactEligibility({
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
      hostedWorkerArtifactSha256:
        HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_HOSTED_WORKER_ARTIFACT_SHA256,
    });
    assert.equal(worker.ok, true);
    const page = classifyFlyStagingImagePageArtifactEligibility({
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
      hostedPageArtifactSha256:
        HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_PAGE_ARTIFACT_SHA256,
    });
    assert.equal(page.ok, true);
  });

  await test("8I.2 historical digest rejected for current readiness", () => {
    const eligibility = classifyCurrentFlyStagingImageEligibility({
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
      schemaMigrationIds: SEVEN_MIGRATION_IDS,
    });
    assert.equal(eligibility.eligible, false);
    assert.equal(eligibility.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("execution probe rejects 8I.2 post-frame attribution historical render image", () => {
    const historical = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
    });
    assert.equal(historical.ok, false);
    assert.equal(historical.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("8H historical digest rejected for current readiness", () => {
    const eligibility = classifyCurrentFlyStagingImageEligibility({
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_IMAGE_DIGEST,
      schemaMigrationIds: SEVEN_MIGRATION_IDS,
    });
    assert.equal(eligibility.eligible, false);
    assert.equal(eligibility.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("execution probe rejects 8H bootstrap-coherence historical render image", () => {
    const historical = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_IMAGE_DIGEST,
    });
    assert.equal(historical.ok, false);
    assert.equal(historical.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("execution probe rejects 8F.7.1 historical render image", () => {
    const historical = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_PROSPECTIVE_IMAGE_DIGEST,
    });
    assert.equal(historical.ok, false);
    assert.equal(historical.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("execution probe rejects 8F.7 historical render image", () => {
    const historical = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_PROSPECTIVE_IMAGE_DIGEST,
    });
    assert.equal(historical.ok, false);
    assert.equal(historical.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("execution probe rejects 8F.5.1 historical render image", () => {
    const historical = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
    });
    assert.equal(historical.ok, false);
    assert.equal(historical.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("execution probe rejects 8F.5 historical render image", () => {
    const historical = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
    });
    assert.equal(historical.ok, false);
    assert.equal(historical.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("execution probe rejects 8F.4 historical render image", () => {
    const historical = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_CURRENT_IMAGE_DIGEST,
    });
    assert.equal(historical.ok, false);
    assert.equal(historical.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("execution probe rejects 8F.2 historical render image", () => {
    const historical = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_IMAGE_DIGEST,
    });
    assert.equal(historical.ok, false);
    assert.equal(historical.reasonId, "historical_lifecycle_not_current_ready");
  });

  await test("8I.3 historical digest with bound worker and page artifacts accepted for artifact eligibility", () => {
    const result = classifyFlyStagingImageWorkerArtifactEligibility({
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_IMAGE_DIGEST,
      hostedWorkerArtifactSha256:
        HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    });
    assert.equal(result.ok, true);
    const pageResult = classifyFlyStagingImagePageArtifactEligibility({
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_IMAGE_DIGEST,
      hostedPageArtifactSha256:
        HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_PAGE_ARTIFACT_SHA256,
    });
    assert.equal(pageResult.ok, true);
  });

  await test("execution probe rejects 8I.4 artifact-binding cleanup correction historical render image (duplicate guard)", () => {
    const result = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_IMAGE_DIGEST,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reasonId, "historical_lifecycle_not_current_ready");
    }
  });

  await test("8I.4 historical digest with bound worker and page artifacts accepted for artifact eligibility", () => {
    const result = classifyFlyStagingImageWorkerArtifactEligibility({
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_IMAGE_DIGEST,
      hostedWorkerArtifactSha256:
        HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    });
    assert.equal(result.ok, true);
    const pageResult = classifyFlyStagingImagePageArtifactEligibility({
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_IMAGE_DIGEST,
      hostedPageArtifactSha256:
        HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_PAGE_ARTIFACT_SHA256,
    });
    assert.equal(pageResult.ok, true);
  });

  await test("slot-key classifier rejects pre-007 and historical digests for worker eligibility", () => {
    for (const digest of [
      HEADLESS_FLY_STAGING_PRE_007_HISTORICAL_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
    ]) {
      const result = classifyPost007WorkerImageEligibility({
        imageDigestSha256: digest,
        schemaMigrationIds: SEVEN_MIGRATION_IDS,
      });
      assert.equal(result.eligible, false, digest);
    }
    const current = classifyPost007WorkerImageEligibility({
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
      schemaMigrationIds: SEVEN_MIGRATION_IDS,
    });
    assert.equal(current.eligible, true);
  });

  await test("current verifier topology with 2G.23 digest produces verify=1 readiness", () => {
    const digest = resolveCurrentFlyStagingAcceptedImageDigestSha256();
    assert.equal(digest, HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST);
    const readiness = classifyFlyVerifyLiveAmendedReadiness({
      machinesJson: machinesJson(digest),
      servicesJson: "[]",
      secretLedger: {
        status: "ok",
        aggregateStatus: "deployed",
        runtimeReady: true,
        entries: [],
        reasonId: "ok",
      },
      logsText: readFileSync(
        path.join(ROOT, "scripts/fly-staging/fixtures/runtime-logs-pass.txt"),
        "utf8",
      ),
      nowMs: Date.now(),
      expectedImageDigestSha256: digest,
    });
    assert.equal(readiness.ok, true);
  });

  await test("historical pre-007 PASS evidence archive remains valid", () => {
    const fp = buildFlyVerifyLiveSchemaFingerprint();
    const historicalFp = {
      migrationIds: fp.migrationIds.filter(
        (id) => id !== "007_headless_owned_object_slot_key_capacity",
      ),
      checksumPrefixes: fp.checksumPrefixes.filter((_, i) => i < 6),
    };
    const doc = {
      title: "historical",
      overall: "PASS" as const,
      eligibilityVerdict: "ELIGIBLE — six-migration historical",
      startedAtIso: "2026-07-22T19:19:50.847Z",
      endedAtIso: "2026-07-22T19:21:15.153Z",
      cases: createExactPassFlyVerifyLiveCaseResults(),
      schemaFingerprint: historicalFp,
      acceptedImageDigestSha256: HEADLESS_FLY_STAGING_PRE_007_HISTORICAL_IMAGE_DIGEST,
      flyVerifyTopology: { verifyCount: 1, renderCount: 0, observedRegion: "iad" },
      cleanupStatus: "ok" as const,
      configAttribution: {
        neon_status: "configured" as const,
        r2_status: "configured" as const,
        upstash_rest_status: "configured" as const,
        upstash_tcp_status: "configured" as const,
        env_name_status: "staging" as const,
        app_name_status: "accepted" as const,
      },
      notes: ["fixture"],
    };
    assert.equal(validatePassFlyVerifyLiveEvidence({ document: doc }).ok, true);
    assert.equal(
      validateHistoricalFlyVerifyLivePassImageAuthority({
        acceptedImageDigestSha256: doc.acceptedImageDigestSha256,
        schemaMigrationIds: historicalFp.migrationIds,
      }),
      true,
    );
    assert.equal(
      validateCurrentFlyLivePassImageAuthority({
        acceptedImageDigestSha256: doc.acceptedImageDigestSha256,
        schemaMigrationIds: historicalFp.migrationIds,
      }),
      false,
    );
    const archiveBytes = readFileSync(path.join(ROOT, HISTORICAL_PASS_PATH), "utf8");
    assert.match(archiveBytes, /ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e/);
    assert.equal(doc.cases.length, REQUIRED_FLY_VERIFY_LIVE_CASE_IDS.length);
  });

  await test("historical post-007 pre-telemetry and 8F evidence digests remain valid", () => {
    assert.equal(
      validateHistoricalPost007PreTelemetryFlyLiveImageAuthority({
        acceptedImageDigestSha256:
          HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
        schemaMigrationIds: SEVEN_MIGRATION_IDS,
      }),
      true,
    );
    assert.equal(
      validateHistoricalPost0078fTelemetryFlyLiveImageAuthority({
        acceptedImageDigestSha256:
          HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
        schemaMigrationIds: SEVEN_MIGRATION_IDS,
      }),
      true,
    );
    assert.equal(
      validateFlyRenderLiveAcceptedImageDigestAuthority({
        acceptedImageDigestSha256:
          HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
        schemaMigrationIds: SEVEN_MIGRATION_IDS,
      }),
      true,
    );
    assert.equal(
      validateCurrentFlyLivePassImageAuthority({
        acceptedImageDigestSha256:
          HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
        schemaMigrationIds: SEVEN_MIGRATION_IDS,
      }),
      false,
    );
  });

  await test("official evidence SHAs remain byte-identical", () => {
    assert.equal(
      sha256FileSync("docs/evidence/headless/current/HEADLESS_11E_FLY_VERIFY_LIVE_EVIDENCE.md", ROOT),
      OFFICIAL_EVIDENCE_SHAS.verifyLivePass,
    );
    assert.equal(
      sha256FileSync("docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md", ROOT),
      OFFICIAL_EVIDENCE_SHAS.renderLivePass,
    );
    assert.equal(
      sha256FileSync(
        "docs/evidence/headless/archive/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.pre-8j-2e6942334843b664e7089d13bfca488c29f888bfac897e89aceb2fb1768feb01.md",
      ),
      OFFICIAL_EVIDENCE_SHAS.renderLiveFailArchived8J,
    );
    assert.equal(
      sha256FileSync("docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_OWNED_OBJECT_STAGING_PROBE.md", ROOT),
      OFFICIAL_EVIDENCE_SHAS.ownedObjectStagingPass,
    );
    assert.equal(
      sha256FileSync("docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_OWNED_OBJECT_FINALIZE_PROBE.md", ROOT),
      OFFICIAL_EVIDENCE_SHAS.ownedObjectFinalizePass,
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
