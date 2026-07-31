/**
 * Sprint 11E Phase 2E.2D.8C.2A / 8F.1 / 8F.2 — immutable versioned Fly staging accepted-image authority.
 * QA / deployment authority only — never used by hosted worker runtime.
 */

import { HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT } from "@/features/headless-renderer/control-plane/migrations/embedded-schema-fingerprint";

import { HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_IMAGE_DIGEST } from "./fly-staging-verify-first-pass-evidence";
import {
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_BUILD_INFO_SHA256,
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_PAGE_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_CORE_SCHEMA_FINGERPRINT,
} from "./fly-staging-rollback-bridge-authority";

/** Frozen authority schema version — bump only when record shape or selection rules change. */
export const HEADLESS_FLY_STAGING_VERSIONED_IMAGE_AUTHORITY_VERSION = 34 as const;

export type HeadlessFlyStagingImageLifecycle = "historical" | "current";

export type HeadlessFlyStagingVersionedImageRecordId =
  | "pre_007_historical"
  | "post_007_pre_telemetry_historical"
  | "post_007_8f_telemetry_historical"
  | "post_007_8f2_page_telemetry_historical"
  | "post_007_8f4_page_materialization_historical"
  | "post_007_8f5_page_attribution_historical"
  | "post_007_8f51_real_shape_attribution_historical"
  | "post_007_8f7_boundary_telemetry_historical"
  | "post_007_8f71_profile_boundary_continuity_historical"
  | "post_007_8g1_durable_source_identity_historical"
  | "post_007_8h_bootstrap_coherence_historical"
  | "post_007_8i_post_frame_correction_historical"
  | "post_007_8i2_post_frame_attribution_historical"
  | "post_007_8i3_artifact_binding_coherence_historical"
  | "post_007_8i4_artifact_binding_cleanup_correction_historical"
  | "post_007_8i5_object_key_binding_validation_historical"
  | "post_007_staging_runtime_observed_baseline_historical"
  | "post_007_2g12_real_video_motion_historical"
  | "post_007_2g20_manifest_contract_alignment_historical"
  | "post_007_2g23_frame_progress_prospective"
  | "post_007_2g23_frame_progress_current"
  | "post_007_2g24_export_correctness_prospective"
  | "post_007_2g24_export_correctness_current"
  | "post_007_2g24e_bridge008_rollback_bridge";

export type HeadlessFlyStagingVersionedImageSchemaFingerprint = {
  readonly migrationIds: readonly string[];
  readonly checksumSha256: readonly string[];
};

export type HeadlessFlyStagingVersionedImageRecord = {
  readonly recordId: HeadlessFlyStagingVersionedImageRecordId;
  readonly lifecycle: HeadlessFlyStagingImageLifecycle;
  readonly imageDigestSha256: string;
  readonly schemaFingerprint: HeadlessFlyStagingVersionedImageSchemaFingerprint;
  /** Null for historical pre-007 — artifact identity was not versioned in authority. */
  readonly hostedWorkerArtifactSha256: string | null;
  /** Null when image predates granular page substage telemetry (8F.2). */
  readonly hostedPageArtifactSha256: string | null;
  /** Null when image predates claimed-render execution telemetry (8F). */
  readonly telemetryCapabilityVersion: string | null;
  /** Null when image predates granular page substage/reason telemetry (8F.2). */
  readonly pageTelemetryCapabilityVersion: string | null;
  readonly eligibleForVerifyLiveHarness: boolean;
  readonly eligibleForRenderLiveHarness: boolean;
  readonly eligibleForCurrentStagingReadiness: boolean;
};

export type HeadlessFlyStagingVersionedImageIneligibilityReasonId =
  | "unknown_digest"
  | "pre_007_digest_with_seven_migrations"
  | "post_007_digest_with_six_migrations"
  | "schema_fingerprint_migration_mismatch"
  | "schema_fingerprint_count_mismatch"
  | "historical_lifecycle_not_current_ready"
  | "cross_bound_digest_mismatch"
  | "operator_digest_override_forbidden"
  | "wrong_hosted_worker_artifact"
  | "wrong_hosted_page_artifact"
  | "missing_telemetry_capability"
  | "missing_page_telemetry_capability"
  | "non_telemetry_render_image"
  | "hostile_input";

const DIGEST_RE = /^[a-f0-9]{64}$/;

/** Pre-007 historical immutable digest (six-migration embedded fingerprint). */
export const HEADLESS_FLY_STAGING_PRE_007_HISTORICAL_IMAGE_DIGEST =
  HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_IMAGE_DIGEST;

/** Post-007 pre-telemetry historical immutable digest (seven migrations, no 8F telemetry). */
export const HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_DIGEST =
  "28d60fb525c71f06ae46de0948c44be37f6c9c38557a3fbecb1e0db7cfb016a8" as const;

/** Post-007 8F telemetry historical immutable digest (seven migrations + 8F, no 8F.2 page substages). */
export const HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_DIGEST =
  "9b97b63e3d21886e59574e14f9eaae8961c3609cec1a4fb0463dd9fd02386b0e" as const;

/** Post-007 8F.2 page-telemetry current immutable digest (build-only push 8F.2). */
export const HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_IMAGE_DIGEST =
  "2d3b8d07c2f39006e1d6d16e9438fd0cba7a03a2e0784c309fc1df0fefe99f8c" as const;

/** Post-007 8F.4 page-materialization immutable digest (build-only push 8F.4A; deployed 8F.4B). */
export const HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_PROSPECTIVE_IMAGE_DIGEST =
  "20049795130e54227805fa3968da8a4c43ac125232538ef262d32574afa5d2d9" as const;

/** Post-007 8F.4 page-materialization current immutable digest (controlled rollout 8F.4B). */
export const HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_CURRENT_IMAGE_DIGEST =
  HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_PROSPECTIVE_IMAGE_DIGEST;

/** Post-007 8F.5 page-attribution immutable digest (build-only push 8F.5A; deployed 8F.5B). */
export const HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST =
  "7a5c7eccb9a0691f390a22719823ac2502cc210d830025d124c6c4b897341d52" as const;

/** Post-007 8F.5.1 real-shape attribution immutable digest (build-only push 8F.5.1A). */
export const HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST =
  "975a60bedc8ded413cc87db663ecfa1a0a6a0b749c1313ac97e862e42e641b58" as const;

/** Post-007 8F.7 boundary-telemetry immutable digest (build-only push 8F.7A; deployed 8F.7B). */
export const HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_PROSPECTIVE_IMAGE_DIGEST =
  "b61ed496d9cb0a8430f591a7322bb097af9f6a00d47901dda4a74aa998f67ebb" as const;

/** Post-007 8F.7.1 profile/boundary-continuity immutable digest (build-only push 8F.7.1A). */
export const HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_PROSPECTIVE_IMAGE_DIGEST =
  "df3f77255296648eff6f4706199c8f6985458669c44297f8384be1c4b15d7640" as const;

/** Post-007 8G.1 durable source-identity immutable digest (build-only push 8G.1A). */
export const HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_PROSPECTIVE_IMAGE_DIGEST =
  "c3707b93908d32b745dde383d3340909be32e569eb4fa5edb1860cdd9a9d8fbe" as const;

/** Post-007 8H bootstrap-coherence immutable digest (build-only push 8H.2A). */
export const HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_IMAGE_DIGEST =
  "211d6a711aab442a31886e37d5278cc82d93f230e0623d3fe8a4841d40680758" as const;

/** Post-007 8I post-frame correction immutable digest (build-only push 8I.1A). */
export const HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_PROSPECTIVE_IMAGE_DIGEST =
  "71b6d9dddc71f8046aa91754b6a665985a2c4437145814a09842057c7c5fd572" as const;

/** Post-007 8I.2 post-frame attribution immutable digest (build-only push 8I.2A). */
export const HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST =
  "f583f189adc2c59638cbe93d8caf9ee85f7df5ffe0ad218eaaac3f69d089cd36" as const;

/** Post-007 8I.3 artifact-binding coherence immutable digest (build-only push 8I.3A). */
export const HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_IMAGE_DIGEST =
  "cd1e31436855f8750c927c4896a5fe115c0966b737b609601a71122052517eaa" as const;

/** Post-007 8I.4 artifact-binding cleanup correction immutable digest (build-only push 8I.4A). */
export const HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_IMAGE_DIGEST =
  "cc04b6d7dc1591102e04970b6e91b9f45a7dad34ea67331c83065ccba2b0b2a4" as const;

/** Post-007 8I.5 object-key binding validation immutable digest (build-only push 8I.5.2A). */
export const HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_IMAGE_DIGEST =
  "7a97f472859f5f8071d0311ee4d77c29f44ff44cb402aa57eed8f13872a74794" as const;

/** Post-007 2G.12 real-video range/motion correction immutable digest (build-only push 2G.12B Part A; deployed 2G.12B-R). */
export const HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_PROSPECTIVE_IMAGE_DIGEST =
  "69219707052de2db2fe10cadc39a96dafac6eab4d88ce8efc4146959a9bb1891" as const;

/** Post-007 2G.20 manifest-contract alignment immutable digest (build-only push 2G.20). */
export const HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_IMAGE_DIGEST =
  "8a72c2d551881244d44566c6860212cca071dbaf410c262c40731ec2e1d80e61" as const;

/** Post-007 2G.23 frame-progress immutable digest (build-only push 2G.23B). */
export const HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST =
  "a1e26d4bc92497ee21e68fc1924efeafd80e250dc1f28628dbc49abcd5a9bf3e" as const;

/** Post-007 2G.24 export-correctness immutable digest (build-only push 2G.24F). */
export const HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST =
  "d38e45e24c579f56960611d48c15c92e38968d7290dbf04f926e0e572c56bd68" as const;

/** Post-007 observed staging runtime baseline immutable digest (Fly release v25 pre-2G.12B-R rollout). */
export const HEADLESS_FLY_STAGING_POST_007_STAGING_RUNTIME_OBSERVED_BASELINE_IMAGE_DIGEST =
  "1aa65f6721b5fc6f9d35f97a2679fbaf117fe4ef0d585d0ed97d532591634fc0" as const;

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_DIGEST */
export const HEADLESS_FLY_STAGING_POST_007_TELEMETRY_CURRENT_IMAGE_DIGEST =
  HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_DIGEST;

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_DIGEST */
export const HEADLESS_FLY_STAGING_POST_007_CURRENT_IMAGE_DIGEST =
  HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_DIGEST;

/** Post-007 pre-telemetry hosted-worker.js SHA-256 from accepted deterministic build boundary. */
export const HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HOSTED_WORKER_ARTIFACT_SHA256 =
  "f88f5834df37908686312828ef925ef1701d3c00aff1ca406bb9ba2d9737b19d" as const;

/** Post-007 8F telemetry historical hosted-worker.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_HOSTED_WORKER_ARTIFACT_SHA256 =
  "a685ba95ac8276da85d85da90d9b744bb65c210f005890027a218361f08d3afb" as const;

/** Post-007 8F.2 page-telemetry current hosted-worker.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_HOSTED_WORKER_ARTIFACT_SHA256 =
  "d16ef3a4d437a5b90da48978ad850e88135a290a71128a7396c806ee84b21635" as const;

/** Post-007 8F.4 page-materialization hosted-worker.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256 =
  "7f7bae129c79e71c5169f8ad652282f18e39a615424acf1be376c37cfbd6047b" as const;

/** Post-007 8F.4 page-materialization current hosted-worker.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_CURRENT_HOSTED_WORKER_ARTIFACT_SHA256 =
  HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256;

/** Post-007 8F.5 page-attribution prospective hosted-worker.js SHA-256 (deployed 8F.5B). */
export const HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256 =
  "3a57ddcfd3f39348ba9af08739593d4c5cf1c2368c06e84e5a1c4d0362765522" as const;

/** Post-007 8F.5.1 real-shape attribution prospective hosted-worker.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256 =
  "ef9c43b8b8e27f6a53359939d4fc6b3939dd41f9ab8e069671eca8c02f928e2a" as const;

/** Post-007 8F.7 boundary-telemetry deployed hosted-worker.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256 =
  "aa96973cc46baeeff945ad28f15f35906890aa734857879fd985eaac2b7adb2f" as const;

/** Post-007 8F.7.1 profile/boundary-continuity prospective hosted-worker.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256 =
  "ae04b7ebb37e34c4399454a25d9635694573b6651dd60148cba4cd91c4af0f0a" as const;

/** Post-007 8G.1 durable source-identity prospective hosted-worker.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256 =
  "9b25a3ab00bb9b911380974b729d4fd854edb3465c2da38a2daa0d3736d3f09d" as const;

/** Post-007 8H bootstrap-coherence prospective hosted-worker.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256 =
  "6f43d464cd282d17aba31ab0ffcf95dbc0d5beedd8a1094e95d2a86f8f7db212" as const;

/** Post-007 8I post-frame correction prospective hosted-worker.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256 =
  "131192204fa4f2a9e05deb4ac76208f79d7432975405ad1c87a6acc242b36acf" as const;

/** Post-007 8I.2 post-frame attribution prospective hosted-worker.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256 =
  "da6fc99a83192709f605e3f130c62cbd6a1b95999fbd5f1515e1b0e8223559e2" as const;

/** Post-007 8I.3 artifact-binding coherence prospective hosted-worker.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256 =
  "d5ecba4d9a3412963156572525d442ae611de6371527ea50d7081afb45062153" as const;

/** Post-007 8I.4 artifact-binding cleanup correction prospective hosted-worker.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256 =
  "49ff267305c50cbe2dc7e6addb129ee7507e5be5445f2ea649e733eb057a8a67" as const;

/** Post-007 8I.5 object-key binding validation prospective hosted-worker.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256 =
  "79852daa3fc005e41968bd4a3b3d942be3ab4f094243c42caf9cc2834e3ab1fb" as const;

/** Post-007 2G.12 real-video range/motion correction prospective hosted-worker.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256 =
  "733c57c0235f56d986b1c6456fd13573d5c9c6a87d314294557cf387ad535c20" as const;

/** Post-007 2G.20 v4/9D + terminal materialization hosted-worker.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_HOSTED_WORKER_ARTIFACT_SHA256 =
  "0bcd9a7936532719a3de2b01643b8754d08a39525733f100a17b51ec25ebec53" as const;

/** Post-007 2G.23 frame-progress hosted-worker.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_HOSTED_WORKER_ARTIFACT_SHA256 =
  "e8fc49559265c8f82ac3ff36913512baab29df4159feab3e1e9933f079efdaee" as const;

/** Post-007 2G.24 export-correctness hosted-worker.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_HOSTED_WORKER_ARTIFACT_SHA256 =
  "c425cd5d4ffd94279bab75c325bd06a9dadaed6ee3e8fe04dab3e8146b12a9ca" as const;

/** Post-007 observed staging runtime baseline hosted-worker.js SHA-256 (remote inspection 2G.12B-R). */
export const HEADLESS_FLY_STAGING_POST_007_STAGING_RUNTIME_OBSERVED_BASELINE_HOSTED_WORKER_ARTIFACT_SHA256 =
  "245f6f4d43ffc2e7bdb71d5f913326397add7c1e72e89fdf0ee03f9ed6f5a63d" as const;

/** Post-007 8I.3 artifact-binding coherence prospective BUILD_INFO.json SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_BUILD_INFO_SHA256 =
  "6b2285c3245e29b26c9b212bd35032dfcf2333d89b329a710803c243d2a0411a" as const;

/** Post-007 8I.4 artifact-binding cleanup correction prospective BUILD_INFO.json SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_BUILD_INFO_SHA256 =
  HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_BUILD_INFO_SHA256;

/** Post-007 8I.5 object-key binding validation prospective BUILD_INFO.json SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_BUILD_INFO_SHA256 =
  HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_BUILD_INFO_SHA256;

/** Post-007 2G.12 real-video range/motion correction prospective BUILD_INFO.json SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_PROSPECTIVE_BUILD_INFO_SHA256 =
  "6b2285c3245e29b26c9b212bd35032dfcf2333d89b329a710803c243d2a0411a" as const;

/** Post-007 2G.20 BUILD_INFO.json SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_BUILD_INFO_SHA256 =
  HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_PROSPECTIVE_BUILD_INFO_SHA256;

/** Post-007 2G.23 frame-progress BUILD_INFO.json SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_BUILD_INFO_SHA256 =
  HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_PROSPECTIVE_BUILD_INFO_SHA256;

/** Post-007 2G.24 export-correctness BUILD_INFO.json SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_BUILD_INFO_SHA256 =
  HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_PROSPECTIVE_BUILD_INFO_SHA256;

/** Post-007 2G.12 real-video range/motion correction prospective page-render.iife.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_PROSPECTIVE_PAGE_ARTIFACT_SHA256 =
  "a7dda28554a76d98e4c8009244ad7d35f64d2be982cab99bbf8c328c177a6314" as const;

/** Post-007 2G.20 page-render.iife.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_PAGE_ARTIFACT_SHA256 =
  "7a5c3e20c9ae6ce4aa3064a371eb445f52e9871f6303ecd481a43417b4fc2372" as const;

/** Post-007 2G.23 frame-progress page-render.iife.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_PAGE_ARTIFACT_SHA256 =
  HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_PAGE_ARTIFACT_SHA256;

/** Post-007 2G.24 export-correctness page-render.iife.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_PAGE_ARTIFACT_SHA256 =
  "e0c6fd819d6b2c6738e0cba1971a320fefda281c3ef5798cd011bf6fab981d2c" as const;

/** Post-007 8H bootstrap-coherence prospective page-render.iife.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_PAGE_ARTIFACT_SHA256 =
  "677bd1a8e01c7ebf7c97500e70d78da89892c7c72c09b689d6fcd9c4436c5efe" as const;

/** Post-007 8F.2 page-telemetry current page-render.iife.js SHA-256. */
export const HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_PAGE_ARTIFACT_SHA256 =
  "424ad4a06e374162c1052682aa626126840dbcf3c54464d64719527fa7b7ea7d" as const;

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_HOSTED_WORKER_ARTIFACT_SHA256 */
export const HEADLESS_FLY_STAGING_POST_007_TELEMETRY_CURRENT_HOSTED_WORKER_ARTIFACT_SHA256 =
  HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_HOSTED_WORKER_ARTIFACT_SHA256;

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HOSTED_WORKER_ARTIFACT_SHA256 */
export const HEADLESS_FLY_STAGING_POST_007_HOSTED_WORKER_ARTIFACT_SHA256 =
  HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HOSTED_WORKER_ARTIFACT_SHA256;

/** Claimed-render execution telemetry capability bound to 8F+ images. */
export const HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION = "8F" as const;

/** Granular page substage/reason telemetry capability bound to 8F.2+ images. */
export const HEADLESS_FLY_STAGING_PAGE_TELEMETRY_CAPABILITY_VERSION =
  "8F.2" as const;

/** Page workspace materialization capability bound to 8F.4+ images. */
export const HEADLESS_FLY_STAGING_PAGE_MATERIALIZATION_CAPABILITY_VERSION =
  "8F.4" as const;

/** Page workspace attribution propagation capability bound to 8F.5 deployed images. */
export const HEADLESS_FLY_STAGING_PAGE_ATTRIBUTION_CAPABILITY_VERSION =
  "8F.5" as const;

/** Real-shape page workspace attribution invariant capability bound to 8F.5.1 prospective images. */
export const HEADLESS_FLY_STAGING_PAGE_ATTRIBUTION_REAL_SHAPE_CAPABILITY_VERSION =
  "8F.5.1" as const;

/** Provider-backed owning-boundary telemetry capability bound to 8F.7 deployed images. */
export const HEADLESS_FLY_STAGING_BOUNDARY_TELEMETRY_CAPABILITY_VERSION =
  "8F.7" as const;

/** Profile/boundary-continuity authority capability bound to 8F.7.1 prospective images. */
export const HEADLESS_FLY_STAGING_PROFILE_BOUNDARY_CONTINUITY_CAPABILITY_VERSION =
  "8F.7.1" as const;

/** Durable source-identity + source-binding attribution capability bound to 8G.1 prospective images. */
export const HEADLESS_FLY_STAGING_DURABLE_SOURCE_IDENTITY_CAPABILITY_VERSION =
  "8G.1" as const;

/** Bootstrap coherence + semantic fingerprint + success source-binding capability bound to 8H prospective images. */
export const HEADLESS_FLY_STAGING_BOOTSTRAP_COHERENCE_CAPABILITY_VERSION =
  "8H" as const;

/** Post-frame smoke duration + observer/cleanup correction capability bound to 8I prospective images. */
export const HEADLESS_FLY_STAGING_POST_FRAME_CORRECTION_CAPABILITY_VERSION =
  "8I" as const;

/** Post-frame failure attribution/containment capability bound to 8I.2 prospective images. */
export const HEADLESS_FLY_STAGING_POST_FRAME_ATTRIBUTION_CAPABILITY_VERSION =
  "8I.2" as const;

/** Artifact-binding coherence + monotonic lifecycle capability bound to 8I.3 prospective images. */
export const HEADLESS_FLY_STAGING_ARTIFACT_BINDING_COHERENCE_CAPABILITY_VERSION =
  "8I.3" as const;

/** Artifact-binding validation, cleanup recovery, and stage-attribution capability bound to 8I.4 prospective images. */
export const HEADLESS_FLY_STAGING_ARTIFACT_BINDING_CLEANUP_CORRECTION_CAPABILITY_VERSION =
  "8I.4" as const;

/** Object-key binding validation, structured comparison, evidence-reason, and cleanup capability bound to 8I.5 prospective images. */
export const HEADLESS_FLY_STAGING_OBJECT_KEY_BINDING_VALIDATION_CAPABILITY_VERSION =
  "8I.5" as const;

/** Asset-server byte-range + decoded-frame motion parity capability bound to 2G.12 prospective images. */
export const HEADLESS_FLY_STAGING_REAL_VIDEO_MOTION_CAPABILITY_VERSION =
  "2G.12" as const;

/** Website/worker v4/9D alignment + terminal materialization rejection capability. */
export const HEADLESS_FLY_STAGING_MANIFEST_CONTRACT_ALIGNMENT_CAPABILITY_VERSION =
  "2G.20" as const;

/** Throttled CAS frame render progress capability bound to 2G.23 images. */
export const HEADLESS_FLY_STAGING_FRAME_PROGRESS_CAPABILITY_VERSION =
  "2G.23-frame-progress" as const;

/** Export-correctness bundle capability bound to 2G.24 prospective images. */
export const HEADLESS_FLY_STAGING_EXPORT_CORRECTNESS_CAPABILITY_VERSION =
  "2G.24" as const;

/** Migration 007 checksum — bound to post-007 records (historical + current). */
export const HEADLESS_FLY_STAGING_POST_007_MIGRATION_CHECKSUM_SHA256 =
  "699a3565d7e12bf9245891e47a1a20a425a0d266fcdaf4b03bd9515611c60244" as const;

const OPERATOR_DIGEST_OVERRIDE_ENV_KEYS = Object.freeze([
  "HEADLESS_FLY_STAGING_ACCEPTED_IMAGE_DIGEST_OVERRIDE",
  "HEADLESS_FLY_VERIFY_LIVE_ACCEPTED_IMAGE_DIGEST",
  "HEADLESS_FLY_RENDER_LIVE_ACCEPTED_IMAGE_DIGEST",
] as const);

function buildSchemaFingerprint(
  migrations: readonly {
    readonly migrationId: string;
    readonly checksumSha256: string;
  }[],
): HeadlessFlyStagingVersionedImageSchemaFingerprint {
  return Object.freeze({
    migrationIds: Object.freeze(migrations.map((m) => m.migrationId)),
    checksumSha256: Object.freeze(migrations.map((m) => m.checksumSha256)),
  });
}

const PRE_007_MIGRATIONS = Object.freeze(
  HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT.migrations.filter(
    (m) => m.migrationId !== "007_headless_owned_object_slot_key_capacity",
  ),
);

const POST_007_MIGRATIONS = HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT.migrations;

export const HEADLESS_FLY_STAGING_PRE_007_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "pre_007_historical",
    lifecycle: "historical",
    imageDigestSha256: HEADLESS_FLY_STAGING_PRE_007_HISTORICAL_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(PRE_007_MIGRATIONS),
    hostedWorkerArtifactSha256: null,
    hostedPageArtifactSha256: null,
    telemetryCapabilityVersion: null,
    pageTelemetryCapabilityVersion: null,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

export const HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_pre_telemetry_historical",
    lifecycle: "historical",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256: null,
    telemetryCapabilityVersion: null,
    pageTelemetryCapabilityVersion: null,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

export const HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_8f_telemetry_historical",
    lifecycle: "historical",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256: null,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion: null,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_TELEMETRY_CURRENT_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_RECORD;

export const HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_8f2_page_telemetry_historical",
    lifecycle: "historical",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion:
      HEADLESS_FLY_STAGING_PAGE_TELEMETRY_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_HISTORICAL_IMAGE_RECORD;

/** Post-007 8F.4 page-materialization historical — superseded by 8F.5 attribution rollout. */
export const HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_8f4_page_materialization_historical",
    lifecycle: "historical",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_PROSPECTIVE_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion:
      HEADLESS_FLY_STAGING_PAGE_MATERIALIZATION_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_CURRENT_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_HISTORICAL_IMAGE_RECORD;

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_PROSPECTIVE_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_HISTORICAL_IMAGE_RECORD;

/** Post-007 8F.5 page-attribution historical — superseded by 8F.5.1 real-shape rollout. */
export const HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_8f5_page_attribution_historical",
    lifecycle: "historical",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion:
      HEADLESS_FLY_STAGING_PAGE_ATTRIBUTION_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_CURRENT_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD;

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_PROSPECTIVE_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD;

/** Post-007 8F.5.1 real-shape attribution historical — superseded by 8F.7 boundary-telemetry rollout. */
export const HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_8f51_real_shape_attribution_historical",
    lifecycle: "historical",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion:
      HEADLESS_FLY_STAGING_PAGE_ATTRIBUTION_REAL_SHAPE_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_CURRENT_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD;

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_PROSPECTIVE_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD;

/** Post-007 8F.7 boundary-telemetry historical — superseded by 8F.7.1 profile/boundary rollout. */
export const HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_8f7_boundary_telemetry_historical",
    lifecycle: "historical",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_PROSPECTIVE_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion:
      HEADLESS_FLY_STAGING_BOUNDARY_TELEMETRY_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_CURRENT_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_HISTORICAL_IMAGE_RECORD;

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_PROSPECTIVE_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_HISTORICAL_IMAGE_RECORD;

/** Post-007 8F.7.1 profile/boundary-continuity historical — superseded by 8G.1 durable source-identity rollout. */
export const HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_8f71_profile_boundary_continuity_historical",
    lifecycle: "historical",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_PROSPECTIVE_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion:
      HEADLESS_FLY_STAGING_PROFILE_BOUNDARY_CONTINUITY_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_CURRENT_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_HISTORICAL_IMAGE_RECORD;

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_PROSPECTIVE_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_HISTORICAL_IMAGE_RECORD;

/** Post-007 8G.1 durable source-identity historical — superseded by 8H bootstrap-coherence rollout (8H.2B). */
export const HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_8g1_durable_source_identity_historical",
    lifecycle: "historical",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_PROSPECTIVE_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion:
      HEADLESS_FLY_STAGING_DURABLE_SOURCE_IDENTITY_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_CURRENT_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_HISTORICAL_IMAGE_RECORD;

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_PROSPECTIVE_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_HISTORICAL_IMAGE_RECORD;

/** Post-007 8H bootstrap-coherence historical — superseded by 8I post-frame correction rollout (8I.1B). */
export const HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_8h_bootstrap_coherence_historical",
    lifecycle: "historical",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion:
      HEADLESS_FLY_STAGING_BOOTSTRAP_COHERENCE_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_CURRENT_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_HISTORICAL_IMAGE_RECORD;

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_HISTORICAL_IMAGE_RECORD;

/** Post-007 8I post-frame correction historical — superseded by 8I.2 post-frame attribution rollout (8I.2B). */
export const HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_8i_post_frame_correction_historical",
    lifecycle: "historical",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_PROSPECTIVE_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion:
      HEADLESS_FLY_STAGING_POST_FRAME_CORRECTION_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_CURRENT_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_HISTORICAL_IMAGE_RECORD;

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_PROSPECTIVE_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_HISTORICAL_IMAGE_RECORD;

/** Post-007 8I.2 post-frame attribution historical — superseded by 8I.3 artifact-binding rollout (8I.3B). */
export const HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_8i2_post_frame_attribution_historical",
    lifecycle: "historical",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion:
      HEADLESS_FLY_STAGING_POST_FRAME_ATTRIBUTION_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_CURRENT_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_HISTORICAL_IMAGE_RECORD;

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_PROSPECTIVE_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_HISTORICAL_IMAGE_RECORD;

/** Post-007 8I.3 artifact-binding coherence historical — superseded by 8I.4 cleanup correction rollout (8I.4B). */
export const HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_8i3_artifact_binding_coherence_historical",
    lifecycle: "historical",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion:
      HEADLESS_FLY_STAGING_ARTIFACT_BINDING_COHERENCE_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_CURRENT_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_HISTORICAL_IMAGE_RECORD;

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_HISTORICAL_IMAGE_RECORD;

/** Post-007 8I.4 artifact-binding cleanup correction historical — superseded by 8I.5 object-key validation rollout (8I.5.2B). */
export const HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_8i4_artifact_binding_cleanup_correction_historical",
    lifecycle: "historical",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion:
      HEADLESS_FLY_STAGING_ARTIFACT_BINDING_CLEANUP_CORRECTION_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_CURRENT_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_HISTORICAL_IMAGE_RECORD;

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_PROSPECTIVE_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_HISTORICAL_IMAGE_RECORD;

/** Post-007 8I.5 object-key binding validation historical — authority-only; never deployed on staging runtime. */
export const HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_8i5_object_key_binding_validation_historical",
    lifecycle: "historical",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion:
      HEADLESS_FLY_STAGING_OBJECT_KEY_BINDING_VALIDATION_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_CURRENT_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_HISTORICAL_IMAGE_RECORD;

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_HISTORICAL_IMAGE_RECORD;

/** Post-007 observed staging runtime baseline historical — Fly release v25 rollback pin (2G.12B-R). */
export const HEADLESS_FLY_STAGING_POST_007_STAGING_RUNTIME_OBSERVED_BASELINE_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_staging_runtime_observed_baseline_historical",
    lifecycle: "historical",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_STAGING_RUNTIME_OBSERVED_BASELINE_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_STAGING_RUNTIME_OBSERVED_BASELINE_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion: null,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** Post-007 2G.12 real-video range/motion correction historical — superseded by 2G.20. */
export const HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_2g12_real_video_motion_historical",
    lifecycle: "historical",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_PROSPECTIVE_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_PROSPECTIVE_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_PROSPECTIVE_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion:
      HEADLESS_FLY_STAGING_REAL_VIDEO_MOTION_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_CURRENT_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_HISTORICAL_IMAGE_RECORD;

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_PROSPECTIVE_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_HISTORICAL_IMAGE_RECORD;

/** Post-007 2G.20 v4/9D contract-aligned worker historical — superseded by 2G.23. */
export const HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_HISTORICAL_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_2g20_manifest_contract_alignment_historical",
    lifecycle: "historical",
    imageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion:
      HEADLESS_FLY_STAGING_MANIFEST_CONTRACT_ALIGNMENT_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_HISTORICAL_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_CURRENT_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_HISTORICAL_IMAGE_RECORD;

/** Post-007 2G.23 frame-progress prospective — pre-promotion selector; not deployment-eligible. */
export const HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_PROSPECTIVE_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_2g23_frame_progress_prospective",
    lifecycle: "historical",
    imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion: HEADLESS_FLY_STAGING_FRAME_PROGRESS_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** Post-007 2G.23 frame-progress current — superseded by 2G.24 export-correctness rollout. */
export const HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_CURRENT_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_2g23_frame_progress_current",
    lifecycle: "historical",
    imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion: HEADLESS_FLY_STAGING_FRAME_PROGRESS_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** Post-007 2G.24 export-correctness prospective — pre-rollout; not deployment-eligible. */
export const HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_PROSPECTIVE_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_2g24_export_correctness_prospective",
    lifecycle: "historical",
    imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion:
      HEADLESS_FLY_STAGING_EXPORT_CORRECTNESS_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** Post-007 2G.24 export-correctness current — deployed runtime-ready (rollout 2G.24G). */
export const HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_CURRENT_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_2g24_export_correctness_current",
    lifecycle: "current",
    imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
    schemaFingerprint: buildSchemaFingerprint(POST_007_MIGRATIONS),
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion:
      HEADLESS_FLY_STAGING_EXPORT_CORRECTNESS_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: true,
    eligibleForRenderLiveHarness: true,
    eligibleForCurrentStagingReadiness: true,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** Schema-008 rollback bridge — prospective until build-only push and rollout acceptance. */
export const HEADLESS_FLY_STAGING_POST_007_2G24E_BRIDGE008_ROLLBACK_BRIDGE_IMAGE_RECORD =
  Object.freeze({
    recordId: "post_007_2g24e_bridge008_rollback_bridge",
    lifecycle: "historical",
    imageDigestSha256: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
    schemaFingerprint: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_CORE_SCHEMA_FINGERPRINT,
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_PAGE_ARTIFACT_SHA256,
    telemetryCapabilityVersion: HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION,
    pageTelemetryCapabilityVersion:
      HEADLESS_FLY_STAGING_EXPORT_CORRECTNESS_CAPABILITY_VERSION,
    eligibleForVerifyLiveHarness: false,
    eligibleForRenderLiveHarness: false,
    eligibleForCurrentStagingReadiness: false,
  } satisfies HeadlessFlyStagingVersionedImageRecord);

/** @deprecated Use HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_CURRENT_IMAGE_RECORD */
export const HEADLESS_FLY_STAGING_POST_007_CURRENT_IMAGE_RECORD =
  HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_RECORD;

export const HEADLESS_FLY_STAGING_VERSIONED_IMAGE_RECORDS = Object.freeze([
  HEADLESS_FLY_STAGING_PRE_007_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_STAGING_RUNTIME_OBSERVED_BASELINE_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_HISTORICAL_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_PROSPECTIVE_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_CURRENT_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_PROSPECTIVE_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_CURRENT_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_POST_007_2G24E_BRIDGE008_ROLLBACK_BRIDGE_IMAGE_RECORD,
] as const);

const RECORD_BY_DIGEST = new Map<string, HeadlessFlyStagingVersionedImageRecord>(
  HEADLESS_FLY_STAGING_VERSIONED_IMAGE_RECORDS.map((record) => [
    record.imageDigestSha256,
    record,
  ]),
);

export function resolveCurrentFlyStagingAcceptedImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_CURRENT_IMAGE_RECORD;
}

/** Pre-rollout prospective selector for the next controlled image rollout. */
export function resolveProspectiveFlyStagingRolloutImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_CURRENT_IMAGE_RECORD;
}

export function resolveProspectiveFlyStaging8f5AttributionImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD;
}

export function resolveProspectiveFlyStaging8f51RealShapeAttributionImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD;
}

export function resolveProspectiveFlyStaging8f7BoundaryTelemetryImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_HISTORICAL_IMAGE_RECORD;
}

export function resolveProspectiveFlyStaging8f71ProfileBoundaryContinuityImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_HISTORICAL_IMAGE_RECORD;
}

export function resolveProspectiveFlyStaging8g1DurableSourceIdentityImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_HISTORICAL_IMAGE_RECORD;
}

export function resolveProspectiveFlyStaging8hBootstrapCoherenceImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_HISTORICAL_IMAGE_RECORD;
}

export function resolveProspectiveFlyStaging8iPostFrameCorrectionImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_HISTORICAL_IMAGE_RECORD;
}

export function resolveProspectiveFlyStaging8i2PostFrameAttributionImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_HISTORICAL_IMAGE_RECORD;
}

export function resolveProspectiveFlyStaging8i3ArtifactBindingCoherenceImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_HISTORICAL_IMAGE_RECORD;
}

export function resolveProspectiveFlyStaging8i4ArtifactBindingCleanupCorrectionImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_HISTORICAL_IMAGE_RECORD;
}

export function resolveProspectiveFlyStaging8i5ObjectKeyBindingValidationImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_HISTORICAL_IMAGE_RECORD;
}

export function resolveProspectiveFlyStaging2g12RealVideoMotionImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_2G12_REAL_VIDEO_MOTION_HISTORICAL_IMAGE_RECORD;
}

export function resolveHistoricalPost0078i4ArtifactBindingCleanupCorrectionFlyStagingImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8I4_ARTIFACT_BINDING_CLEANUP_CORRECTION_HISTORICAL_IMAGE_RECORD;
}

export function resolveHistoricalPost0078i3ArtifactBindingCoherenceFlyStagingImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_HISTORICAL_IMAGE_RECORD;
}

export function resolveHistoricalPost0078i2PostFrameAttributionFlyStagingImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_HISTORICAL_IMAGE_RECORD;
}

export function resolveHistoricalPost0078iPostFrameCorrectionFlyStagingImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_HISTORICAL_IMAGE_RECORD;
}

export function resolveHistoricalPost0078hBootstrapCoherenceFlyStagingImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_HISTORICAL_IMAGE_RECORD;
}

export function resolveHistoricalPost0078f71ProfileBoundaryContinuityFlyStagingImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_HISTORICAL_IMAGE_RECORD;
}

export function resolveHistoricalPost0078f7BoundaryTelemetryFlyStagingImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_HISTORICAL_IMAGE_RECORD;
}

export function resolveHistoricalPost0078f51RealShapeAttributionFlyStagingImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD;
}

export function resolveHistoricalPost0078f5PageAttributionFlyStagingImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_HISTORICAL_IMAGE_RECORD;
}

export function resolveHistoricalPost0078f4PageMaterializationFlyStagingImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_HISTORICAL_IMAGE_RECORD;
}

export function resolveHistoricalPost0078f2PageTelemetryFlyStagingImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_HISTORICAL_IMAGE_RECORD;
}

export function resolveHistoricalPre007FlyStagingImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_PRE_007_HISTORICAL_IMAGE_RECORD;
}

export function resolveHistoricalPost007PreTelemetryFlyStagingImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_RECORD;
}

export function resolveHistoricalPost0078fTelemetryFlyStagingImageRecord(): HeadlessFlyStagingVersionedImageRecord {
  return HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_RECORD;
}

export function resolveCurrentFlyStagingAcceptedImageDigestSha256(): string {
  return resolveCurrentFlyStagingAcceptedImageRecord().imageDigestSha256;
}

export function resolveFlyStagingImageRecordByDigest(
  digest: unknown,
): HeadlessFlyStagingVersionedImageRecord | null {
  if (typeof digest !== "string" || !DIGEST_RE.test(digest)) {
    return null;
  }
  return RECORD_BY_DIGEST.get(digest) ?? null;
}

function migrationIdsMatch(
  observed: readonly string[],
  expected: readonly string[],
): boolean {
  if (observed.length !== expected.length) return false;
  for (let i = 0; i < expected.length; i += 1) {
    if (observed[i] !== expected[i]) return false;
  }
  return true;
}

function isPost007VersionedImageRecord(
  record: HeadlessFlyStagingVersionedImageRecord,
): boolean {
  return (
    record.recordId === "post_007_pre_telemetry_historical" ||
    record.recordId === "post_007_8f_telemetry_historical" ||
    record.recordId === "post_007_8f2_page_telemetry_historical" ||
    record.recordId === "post_007_8f4_page_materialization_historical" ||
    record.recordId === "post_007_8f5_page_attribution_historical" ||
    record.recordId === "post_007_8f51_real_shape_attribution_historical" ||
    record.recordId === "post_007_8f7_boundary_telemetry_historical" ||
    record.recordId === "post_007_8f71_profile_boundary_continuity_historical" ||
    record.recordId === "post_007_8g1_durable_source_identity_historical" ||
    record.recordId === "post_007_8h_bootstrap_coherence_historical" ||
    record.recordId === "post_007_8i_post_frame_correction_historical" ||
    record.recordId === "post_007_8i2_post_frame_attribution_historical" ||
    record.recordId === "post_007_8i3_artifact_binding_coherence_historical" ||
    record.recordId === "post_007_8i4_artifact_binding_cleanup_correction_historical" ||
    record.recordId === "post_007_8i5_object_key_binding_validation_historical" ||
    record.recordId === "post_007_staging_runtime_observed_baseline_historical" ||
    record.recordId === "post_007_2g12_real_video_motion_historical" ||
    record.recordId === "post_007_2g20_manifest_contract_alignment_historical" ||
    record.recordId === "post_007_2g23_frame_progress_prospective" ||
    record.recordId === "post_007_2g23_frame_progress_current" ||
    record.recordId === "post_007_2g24_export_correctness_prospective" ||
    record.recordId === "post_007_2g24_export_correctness_current"
  );
}

export function assertFlyStagingSchemaFingerprintMatchesRecord(input: {
  readonly record: HeadlessFlyStagingVersionedImageRecord;
  readonly schemaMigrationIds: readonly string[];
}):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingVersionedImageIneligibilityReasonId;
    } {
  const expected = input.record.schemaFingerprint.migrationIds;
  if (input.schemaMigrationIds.length !== expected.length) {
    return {
      ok: false,
      reasonId: "schema_fingerprint_count_mismatch",
    };
  }
  if (!migrationIdsMatch(input.schemaMigrationIds, expected)) {
    return {
      ok: false,
      reasonId: "schema_fingerprint_migration_mismatch",
    };
  }
  return { ok: true };
}

export function classifyFlyStagingImageWorkerArtifactEligibility(input: {
  readonly imageDigestSha256: unknown;
  readonly hostedWorkerArtifactSha256: unknown;
}):
  | { readonly ok: true; readonly record: HeadlessFlyStagingVersionedImageRecord }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingVersionedImageIneligibilityReasonId;
    } {
  if (
    typeof input.imageDigestSha256 !== "string" ||
    typeof input.hostedWorkerArtifactSha256 !== "string"
  ) {
    return { ok: false, reasonId: "hostile_input" };
  }
  const record = resolveFlyStagingImageRecordByDigest(input.imageDigestSha256);
  if (record == null) {
    return { ok: false, reasonId: "unknown_digest" };
  }
  if (record.hostedWorkerArtifactSha256 == null) {
    return { ok: true, record };
  }
  if (input.hostedWorkerArtifactSha256 !== record.hostedWorkerArtifactSha256) {
    return { ok: false, reasonId: "wrong_hosted_worker_artifact" };
  }
  return { ok: true, record };
}

export function classifyFlyStagingImagePageArtifactEligibility(input: {
  readonly imageDigestSha256: unknown;
  readonly hostedPageArtifactSha256: unknown;
}):
  | { readonly ok: true; readonly record: HeadlessFlyStagingVersionedImageRecord }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingVersionedImageIneligibilityReasonId;
    } {
  if (
    typeof input.imageDigestSha256 !== "string" ||
    typeof input.hostedPageArtifactSha256 !== "string"
  ) {
    return { ok: false, reasonId: "hostile_input" };
  }
  const record = resolveFlyStagingImageRecordByDigest(input.imageDigestSha256);
  if (record == null) {
    return { ok: false, reasonId: "unknown_digest" };
  }
  if (record.hostedPageArtifactSha256 == null) {
    return { ok: true, record };
  }
  if (input.hostedPageArtifactSha256 !== record.hostedPageArtifactSha256) {
    return { ok: false, reasonId: "wrong_hosted_page_artifact" };
  }
  return { ok: true, record };
}

/**
 * Fail-closed current staging eligibility — exact digest + schema + lifecycle current.
 * Never falls back to pre-007 when schema includes migration 007.
 */
export function classifyCurrentFlyStagingImageEligibility(input: {
  readonly imageDigestSha256: unknown;
  readonly schemaMigrationIds: readonly string[];
}):
  | { readonly eligible: true; readonly record: HeadlessFlyStagingVersionedImageRecord }
  | {
      readonly eligible: false;
      readonly reasonId: HeadlessFlyStagingVersionedImageIneligibilityReasonId;
    } {
  try {
    if (typeof input.imageDigestSha256 !== "string") {
      return { eligible: false, reasonId: "hostile_input" };
    }
    const includes007 = input.schemaMigrationIds.includes(
      "007_headless_owned_object_slot_key_capacity",
    );
    const record = resolveFlyStagingImageRecordByDigest(input.imageDigestSha256);
    if (record == null) {
      return { eligible: false, reasonId: "unknown_digest" };
    }
    if (record.lifecycle !== "current") {
      return { eligible: false, reasonId: "historical_lifecycle_not_current_ready" };
    }
    if (record.recordId === "pre_007_historical" && includes007) {
      return { eligible: false, reasonId: "pre_007_digest_with_seven_migrations" };
    }
    if (isPost007VersionedImageRecord(record) && !includes007) {
      return { eligible: false, reasonId: "post_007_digest_with_six_migrations" };
    }
    const fp = assertFlyStagingSchemaFingerprintMatchesRecord({
      record,
      schemaMigrationIds: input.schemaMigrationIds,
    });
    if (!fp.ok) {
      return { eligible: false, reasonId: fp.reasonId };
    }
    if (!record.eligibleForCurrentStagingReadiness) {
      return {
        eligible: false,
        reasonId: "historical_lifecycle_not_current_ready",
      };
    }
    return { eligible: true, record };
  } catch {
    return { eligible: false, reasonId: "hostile_input" };
  }
}

/** Verify and render Machines must share the same current accepted digest. */
export function classifyFlyStagingCrossBoundImageDigestMatch(input: {
  readonly verifyImageDigestSha256: unknown;
  readonly renderImageDigestSha256: unknown;
}):
  | { readonly ok: true; readonly digestSha256: string }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingVersionedImageIneligibilityReasonId;
    } {
  if (
    typeof input.verifyImageDigestSha256 !== "string" ||
    typeof input.renderImageDigestSha256 !== "string"
  ) {
    return { ok: false, reasonId: "hostile_input" };
  }
  if (input.verifyImageDigestSha256 !== input.renderImageDigestSha256) {
    return { ok: false, reasonId: "cross_bound_digest_mismatch" };
  }
  const current = resolveCurrentFlyStagingAcceptedImageRecord();
  if (input.verifyImageDigestSha256 !== current.imageDigestSha256) {
    return { ok: false, reasonId: "unknown_digest" };
  }
  return { ok: true, digestSha256: current.imageDigestSha256 };
}

/**
 * Execution probe requires 8F.2 page-telemetry current render Machine image before provider contact.
 */
export function classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority(input: {
  readonly renderImageDigestSha256: unknown;
}):
  | {
      readonly ok: true;
      readonly record: HeadlessFlyStagingVersionedImageRecord;
    }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingVersionedImageIneligibilityReasonId;
    } {
  if (typeof input.renderImageDigestSha256 !== "string") {
    return { ok: false, reasonId: "hostile_input" };
  }
  const record = resolveFlyStagingImageRecordByDigest(input.renderImageDigestSha256);
  if (record == null) {
    return { ok: false, reasonId: "unknown_digest" };
  }
  if (record.recordId === "post_007_pre_telemetry_historical") {
    return { ok: false, reasonId: "non_telemetry_render_image" };
  }
  if (record.telemetryCapabilityVersion !== HEADLESS_FLY_STAGING_TELEMETRY_CAPABILITY_VERSION) {
    return { ok: false, reasonId: "missing_telemetry_capability" };
  }
  if (
    record.pageTelemetryCapabilityVersion !==
      HEADLESS_FLY_STAGING_PAGE_TELEMETRY_CAPABILITY_VERSION &&
    record.pageTelemetryCapabilityVersion !==
      HEADLESS_FLY_STAGING_PAGE_MATERIALIZATION_CAPABILITY_VERSION &&
    record.pageTelemetryCapabilityVersion !==
      HEADLESS_FLY_STAGING_PAGE_ATTRIBUTION_CAPABILITY_VERSION &&
    record.pageTelemetryCapabilityVersion !==
      HEADLESS_FLY_STAGING_PAGE_ATTRIBUTION_REAL_SHAPE_CAPABILITY_VERSION &&
    record.pageTelemetryCapabilityVersion !==
      HEADLESS_FLY_STAGING_BOUNDARY_TELEMETRY_CAPABILITY_VERSION &&
    record.pageTelemetryCapabilityVersion !==
      HEADLESS_FLY_STAGING_PROFILE_BOUNDARY_CONTINUITY_CAPABILITY_VERSION &&
    record.pageTelemetryCapabilityVersion !==
      HEADLESS_FLY_STAGING_DURABLE_SOURCE_IDENTITY_CAPABILITY_VERSION &&
    record.pageTelemetryCapabilityVersion !==
      HEADLESS_FLY_STAGING_BOOTSTRAP_COHERENCE_CAPABILITY_VERSION &&
    record.pageTelemetryCapabilityVersion !==
      HEADLESS_FLY_STAGING_POST_FRAME_CORRECTION_CAPABILITY_VERSION &&
    record.pageTelemetryCapabilityVersion !==
      HEADLESS_FLY_STAGING_POST_FRAME_ATTRIBUTION_CAPABILITY_VERSION &&
    record.pageTelemetryCapabilityVersion !==
      HEADLESS_FLY_STAGING_ARTIFACT_BINDING_COHERENCE_CAPABILITY_VERSION &&
    record.pageTelemetryCapabilityVersion !==
      HEADLESS_FLY_STAGING_ARTIFACT_BINDING_CLEANUP_CORRECTION_CAPABILITY_VERSION &&
    record.pageTelemetryCapabilityVersion !==
      HEADLESS_FLY_STAGING_OBJECT_KEY_BINDING_VALIDATION_CAPABILITY_VERSION &&
    record.pageTelemetryCapabilityVersion !==
      HEADLESS_FLY_STAGING_REAL_VIDEO_MOTION_CAPABILITY_VERSION &&
    record.pageTelemetryCapabilityVersion !==
      HEADLESS_FLY_STAGING_MANIFEST_CONTRACT_ALIGNMENT_CAPABILITY_VERSION &&
    record.pageTelemetryCapabilityVersion !==
      HEADLESS_FLY_STAGING_FRAME_PROGRESS_CAPABILITY_VERSION &&
    record.pageTelemetryCapabilityVersion !==
      HEADLESS_FLY_STAGING_EXPORT_CORRECTNESS_CAPABILITY_VERSION
  ) {
    return { ok: false, reasonId: "missing_page_telemetry_capability" };
  }
  if (record.lifecycle !== "current") {
    return { ok: false, reasonId: "historical_lifecycle_not_current_ready" };
  }
  return { ok: true, record };
}

export function rejectOperatorSuppliedFlyStagingImageDigestOverride(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reasonId: "operator_digest_override_forbidden";
    } {
  try {
    for (const key of OPERATOR_DIGEST_OVERRIDE_ENV_KEYS) {
      const raw = (env as Record<string, unknown>)[key];
      if (typeof raw === "string" && raw.trim().length > 0) {
        return { ok: false, reasonId: "operator_digest_override_forbidden" };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, reasonId: "operator_digest_override_forbidden" };
  }
}

export function buildHistoricalPre007SchemaFingerprintForEvidence(): {
  readonly migrationIds: readonly string[];
  readonly checksumPrefixes: readonly string[];
} {
  const ids: string[] = [];
  const prefixes: string[] = [];
  for (const entry of PRE_007_MIGRATIONS) {
    ids.push(entry.migrationId);
    prefixes.push(entry.checksumSha256.slice(0, 12));
  }
  return Object.freeze({
    migrationIds: Object.freeze(ids),
    checksumPrefixes: Object.freeze(prefixes),
  });
}

export function buildCurrentPost007SchemaFingerprintForEvidence(): {
  readonly migrationIds: readonly string[];
  readonly checksumPrefixes: readonly string[];
} {
  const ids: string[] = [];
  const prefixes: string[] = [];
  for (const entry of POST_007_MIGRATIONS) {
    ids.push(entry.migrationId);
    prefixes.push(entry.checksumSha256.slice(0, 12));
  }
  return Object.freeze({
    migrationIds: Object.freeze(ids),
    checksumPrefixes: Object.freeze(prefixes),
  });
}

/** Historical PASS evidence (pre-007 digest + six-migration fingerprint). */
export function validateHistoricalFlyVerifyLivePassImageAuthority(input: {
  readonly acceptedImageDigestSha256: unknown;
  readonly schemaMigrationIds: readonly string[];
}): boolean {
  const record = resolveHistoricalPre007FlyStagingImageRecord();
  if (input.acceptedImageDigestSha256 !== record.imageDigestSha256) {
    return false;
  }
  return assertFlyStagingSchemaFingerprintMatchesRecord({
    record,
    schemaMigrationIds: input.schemaMigrationIds,
  }).ok;
}

/** Historical post-007 pre-telemetry evidence (28d60fb5 + seven-migration fingerprint). */
export function validateHistoricalPost007PreTelemetryFlyLiveImageAuthority(input: {
  readonly acceptedImageDigestSha256: unknown;
  readonly schemaMigrationIds: readonly string[];
}): boolean {
  const record = resolveHistoricalPost007PreTelemetryFlyStagingImageRecord();
  if (input.acceptedImageDigestSha256 !== record.imageDigestSha256) {
    return false;
  }
  return assertFlyStagingSchemaFingerprintMatchesRecord({
    record,
    schemaMigrationIds: input.schemaMigrationIds,
  }).ok;
}

/** Historical post-007 8F telemetry evidence (9b97b63e + seven-migration fingerprint). */
export function validateHistoricalPost0078fTelemetryFlyLiveImageAuthority(input: {
  readonly acceptedImageDigestSha256: unknown;
  readonly schemaMigrationIds: readonly string[];
}): boolean {
  const record = resolveHistoricalPost0078fTelemetryFlyStagingImageRecord();
  if (input.acceptedImageDigestSha256 !== record.imageDigestSha256) {
    return false;
  }
  return assertFlyStagingSchemaFingerprintMatchesRecord({
    record,
    schemaMigrationIds: input.schemaMigrationIds,
  }).ok;
}

/** Current PASS evidence (8F.2 page-telemetry current digest + seven-migration fingerprint). */
export function validateCurrentFlyLivePassImageAuthority(input: {
  readonly acceptedImageDigestSha256: unknown;
  readonly schemaMigrationIds: readonly string[];
}): boolean {
  const eligibility = classifyCurrentFlyStagingImageEligibility({
    imageDigestSha256: input.acceptedImageDigestSha256,
    schemaMigrationIds: input.schemaMigrationIds,
  });
  return eligibility.eligible;
}

/** Accept current 8F.2 page-telemetry or historical post-007 pre-telemetry render live digests. */
export function validateFlyRenderLiveAcceptedImageDigestAuthority(input: {
  readonly acceptedImageDigestSha256: unknown;
  readonly schemaMigrationIds: readonly string[];
}): boolean {
  return (
    validateCurrentFlyLivePassImageAuthority(input) ||
    validateHistoricalPost007PreTelemetryFlyLiveImageAuthority(input)
  );
}
