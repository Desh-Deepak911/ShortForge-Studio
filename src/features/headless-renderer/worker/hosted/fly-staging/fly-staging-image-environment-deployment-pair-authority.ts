/**
 * Sprint 11E Phase 2G.24G.1 — immutable image digest ↔ renderer environment deployment pairs.
 * QA / rollout authority only — never used by hosted worker runtime.
 */

import {
  HEADLESS_FLY_STAGING_PUBLIC_ENV,
  type HeadlessFlyStagingPublicEnvKey,
} from "./fly-staging-env-ledger";
import {
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_BUILD_INFO_SHA256,
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_PAGE_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
  buildHeadlessFlyStagingRollbackBridgePublicEnvironment,
} from "./fly-staging-rollback-bridge-authority";
import {
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_INFO_SHA256,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PAGE_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
  buildHeadlessFlyStagingCleanupRuntimePublicEnvironment,
  isHeadlessFlyStagingPermanentlyRejectedCleanupRuntimeDigest,
  isHeadlessFlyStagingPlaceholderCleanupRuntimeDigest,
} from "./fly-staging-cleanup-runtime-authority";
import {
  materializeHeadlessFlyStagingToml,
  type HeadlessFlyStagingMaterializeResult,
} from "./fly-staging-template";
import {
  HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_BUILD_INFO_SHA256,
  HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_PAGE_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_BUILD_INFO_SHA256,
  HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_PAGE_ARTIFACT_SHA256,
  resolveCurrentFlyStagingAcceptedImageDigestSha256,
  resolveFlyStagingImageRecordByDigest,
  type HeadlessFlyStagingVersionedImageRecord,
  type HeadlessFlyStagingVersionedImageRecordId,
} from "./fly-staging-versioned-image-authority";

export const HEADLESS_FLY_STAGING_IMAGE_ENVIRONMENT_DEPLOYMENT_PAIR_AUTHORITY_VERSION =
  3 as const;

const DIGEST_RE = /^[a-f0-9]{64}$/;

/** Renderer build identity bundled in the Phase 2G.23 rollback image. */
export const HEADLESS_FLY_STAGING_2G23_ROLLBACK_RENDERER_BUILD_ID =
  "headless-local-chromium-ffmpeg-11e-phase2g.13" as const;

/** Renderer build identity bundled in the Phase 2G.24 export-correctness image. */
export const HEADLESS_FLY_STAGING_2G24_FORWARD_RENDERER_BUILD_ID =
  "headless-local-chromium-ffmpeg-11e-phase2g.24e" as const;

export type HeadlessFlyStagingImageEnvironmentDeploymentPairId =
  | "post_007_2g23_frame_progress_rollback_pair"
  | "post_007_2g24_export_correctness_forward_pair"
  | "post_007_2g24e_bridge008_rollback_bridge_pair"
  | "post_007_2g25_cleanup_runtime_prospective_pair"
  | "post_007_2g25_cleanup_runtime_rejected_pair"
  | "post_007_2g25_cleanup_runtime_replacement_prospective_pair";

export type HeadlessFlyStagingImageEnvironmentDeploymentPairRole =
  | "rollback_anchor"
  | "forward_target"
  | "temporary_rollback_bridge"
  | "prospective_cleanup_runtime"
  | "rejected_cleanup_runtime";

export type HeadlessFlyStagingImageEnvironmentDeploymentPair = {
  readonly pairId: HeadlessFlyStagingImageEnvironmentDeploymentPairId;
  readonly role: HeadlessFlyStagingImageEnvironmentDeploymentPairRole;
  readonly imageRecordId: HeadlessFlyStagingVersionedImageRecordId;
  readonly imageDigestSha256: string;
  readonly rendererBuildId: string;
  readonly hostedWorkerArtifactSha256: string;
  readonly hostedPageArtifactSha256: string;
  readonly buildInfoSha256: string;
};

export type HeadlessFlyStagingImageEnvironmentCoherenceReasonId =
  | "ok"
  | "unknown_digest"
  | "missing_renderer_build_id"
  | "image_environment_authority_incoherent"
  | "digest_record_binding_mismatch"
  | "duplicate_digest_authority"
  | "rejected_permanent_digest"
  | "replacement_placeholder_digest"
  | "hostile_input";

export const HEADLESS_FLY_STAGING_POST_007_2G23_ROLLBACK_DEPLOYMENT_PAIR =
  Object.freeze({
    pairId: "post_007_2g23_frame_progress_rollback_pair",
    role: "rollback_anchor",
    imageRecordId: "post_007_2g23_frame_progress_current",
    imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
    rendererBuildId: HEADLESS_FLY_STAGING_2G23_ROLLBACK_RENDERER_BUILD_ID,
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_PAGE_ARTIFACT_SHA256,
    buildInfoSha256: HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_BUILD_INFO_SHA256,
  } satisfies HeadlessFlyStagingImageEnvironmentDeploymentPair);

export const HEADLESS_FLY_STAGING_POST_007_2G24_FORWARD_DEPLOYMENT_PAIR =
  Object.freeze({
    pairId: "post_007_2g24_export_correctness_forward_pair",
    role: "forward_target",
    imageRecordId: "post_007_2g24_export_correctness_current",
    imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
    rendererBuildId: HEADLESS_FLY_STAGING_2G24_FORWARD_RENDERER_BUILD_ID,
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_PAGE_ARTIFACT_SHA256,
    buildInfoSha256:
      HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_BUILD_INFO_SHA256,
  } satisfies HeadlessFlyStagingImageEnvironmentDeploymentPair);

export const HEADLESS_FLY_STAGING_POST_007_2G24E_BRIDGE008_ROLLBACK_BRIDGE_DEPLOYMENT_PAIR =
  Object.freeze({
    pairId: "post_007_2g24e_bridge008_rollback_bridge_pair",
    role: "temporary_rollback_bridge",
    imageRecordId: "post_007_2g24e_bridge008_rollback_bridge",
    imageDigestSha256: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
    rendererBuildId: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_PAGE_ARTIFACT_SHA256,
    buildInfoSha256: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_BUILD_INFO_SHA256,
  } satisfies HeadlessFlyStagingImageEnvironmentDeploymentPair);

export const HEADLESS_FLY_STAGING_POST_007_2G25_CLEANUP_RUNTIME_REJECTED_DEPLOYMENT_PAIR =
  Object.freeze({
    pairId: "post_007_2g25_cleanup_runtime_rejected_pair",
    role: "rejected_cleanup_runtime",
    imageRecordId: "post_007_2g25_cleanup_runtime_rejected",
    imageDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
    rendererBuildId: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PAGE_ARTIFACT_SHA256,
    buildInfoSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_INFO_SHA256,
  } satisfies HeadlessFlyStagingImageEnvironmentDeploymentPair);

export const HEADLESS_FLY_STAGING_POST_007_2G25_CLEANUP_RUNTIME_REPLACEMENT_DEPLOYMENT_PAIR =
  Object.freeze({
    pairId: "post_007_2g25_cleanup_runtime_replacement_prospective_pair",
    role: "prospective_cleanup_runtime",
    imageRecordId: "post_007_2g25_cleanup_runtime_replacement_prospective",
    imageDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
    rendererBuildId: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
    hostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_HOSTED_WORKER_ARTIFACT_SHA256,
    hostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PAGE_ARTIFACT_SHA256,
    buildInfoSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_INFO_SHA256,
  } satisfies HeadlessFlyStagingImageEnvironmentDeploymentPair);

/** @deprecated Prefer HEADLESS_FLY_STAGING_POST_007_2G25_CLEANUP_RUNTIME_REPLACEMENT_DEPLOYMENT_PAIR */
export const HEADLESS_FLY_STAGING_POST_007_2G25_CLEANUP_RUNTIME_DEPLOYMENT_PAIR =
  HEADLESS_FLY_STAGING_POST_007_2G25_CLEANUP_RUNTIME_REPLACEMENT_DEPLOYMENT_PAIR;

export const HEADLESS_FLY_STAGING_IMAGE_ENVIRONMENT_DEPLOYMENT_PAIRS = Object.freeze([
  HEADLESS_FLY_STAGING_POST_007_2G23_ROLLBACK_DEPLOYMENT_PAIR,
  HEADLESS_FLY_STAGING_POST_007_2G24_FORWARD_DEPLOYMENT_PAIR,
  HEADLESS_FLY_STAGING_POST_007_2G24E_BRIDGE008_ROLLBACK_BRIDGE_DEPLOYMENT_PAIR,
  HEADLESS_FLY_STAGING_POST_007_2G25_CLEANUP_RUNTIME_REJECTED_DEPLOYMENT_PAIR,
  HEADLESS_FLY_STAGING_POST_007_2G25_CLEANUP_RUNTIME_REPLACEMENT_DEPLOYMENT_PAIR,
] as const);

const DEPLOYMENT_PAIR_BY_DIGEST = new Map<
  string,
  HeadlessFlyStagingImageEnvironmentDeploymentPair
>(
  HEADLESS_FLY_STAGING_IMAGE_ENVIRONMENT_DEPLOYMENT_PAIRS.map((pair) => [
    pair.imageDigestSha256,
    pair,
  ]),
);

export function validateHeadlessFlyStagingImageEnvironmentDeploymentPairTable(): {
  readonly ok: boolean;
  readonly reasonId: HeadlessFlyStagingImageEnvironmentCoherenceReasonId;
} {
  const seen = new Set<string>();
  for (const pair of HEADLESS_FLY_STAGING_IMAGE_ENVIRONMENT_DEPLOYMENT_PAIRS) {
    if (seen.has(pair.imageDigestSha256)) {
      return Object.freeze({
        ok: false,
        reasonId: "duplicate_digest_authority",
      });
    }
    seen.add(pair.imageDigestSha256);
  }
  return Object.freeze({ ok: true, reasonId: "ok" });
}

export function resolveHeadlessFlyStagingDeploymentPairByImageDigestSha256(
  imageDigestSha256: unknown,
):
  | {
      readonly ok: true;
      readonly pair: HeadlessFlyStagingImageEnvironmentDeploymentPair;
    }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingImageEnvironmentCoherenceReasonId;
    } {
  if (typeof imageDigestSha256 !== "string" || !DIGEST_RE.test(imageDigestSha256)) {
    return Object.freeze({ ok: false, reasonId: "hostile_input" });
  }
  if (isHeadlessFlyStagingPermanentlyRejectedCleanupRuntimeDigest(imageDigestSha256)) {
    return Object.freeze({ ok: false, reasonId: "rejected_permanent_digest" });
  }
  if (isHeadlessFlyStagingPlaceholderCleanupRuntimeDigest(imageDigestSha256)) {
    return Object.freeze({ ok: false, reasonId: "replacement_placeholder_digest" });
  }
  const pair = DEPLOYMENT_PAIR_BY_DIGEST.get(imageDigestSha256);
  if (pair == null) {
    return Object.freeze({ ok: false, reasonId: "unknown_digest" });
  }
  return Object.freeze({ ok: true, pair });
}

export function resolveHeadlessFlyStagingDeploymentPairFromImageRecord(
  record: HeadlessFlyStagingVersionedImageRecord,
):
  | {
      readonly ok: true;
      readonly pair: HeadlessFlyStagingImageEnvironmentDeploymentPair;
    }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingImageEnvironmentCoherenceReasonId;
    } {
  return resolveHeadlessFlyStagingDeploymentPairByImageDigestSha256(
    record.imageDigestSha256,
  );
}

export function resolveHeadlessFlyStagingCurrentForwardDeploymentPair(): HeadlessFlyStagingImageEnvironmentDeploymentPair {
  return HEADLESS_FLY_STAGING_POST_007_2G24E_BRIDGE008_ROLLBACK_BRIDGE_DEPLOYMENT_PAIR;
}

export function resolveHeadlessFlyStagingRollbackDeploymentPair(): HeadlessFlyStagingImageEnvironmentDeploymentPair {
  return HEADLESS_FLY_STAGING_POST_007_2G23_ROLLBACK_DEPLOYMENT_PAIR;
}

export function buildHeadlessFlyStagingPublicEnvironmentForDeploymentPair(
  pair: HeadlessFlyStagingImageEnvironmentDeploymentPair,
): Readonly<Record<string, string>> {
  if (pair.pairId === "post_007_2g24e_bridge008_rollback_bridge_pair") {
    return buildHeadlessFlyStagingRollbackBridgePublicEnvironment();
  }
  if (
    pair.pairId === "post_007_2g25_cleanup_runtime_replacement_prospective_pair" ||
    pair.pairId === "post_007_2g25_cleanup_runtime_prospective_pair"
  ) {
    return buildHeadlessFlyStagingCleanupRuntimePublicEnvironment();
  }
  return Object.freeze({
    ...HEADLESS_FLY_STAGING_PUBLIC_ENV,
    HEADLESS_RENDERER_BUILD_ID: pair.rendererBuildId,
  });
}

export function buildHeadlessFlyStagingPublicEnvironmentForImageDigestSha256(
  imageDigestSha256: unknown,
):
  | {
      readonly ok: true;
      readonly publicEnvironment: Readonly<
        Record<HeadlessFlyStagingPublicEnvKey, string>
      >;
      readonly pair: HeadlessFlyStagingImageEnvironmentDeploymentPair;
    }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingImageEnvironmentCoherenceReasonId;
    } {
  const resolved = resolveHeadlessFlyStagingDeploymentPairByImageDigestSha256(
    imageDigestSha256,
  );
  if (!resolved.ok) {
    return resolved;
  }
  return Object.freeze({
    ok: true,
    publicEnvironment: buildHeadlessFlyStagingPublicEnvironmentForDeploymentPair(
      resolved.pair,
    ),
    pair: resolved.pair,
  });
}

function validateDeploymentPairRecordBindings(
  pair: HeadlessFlyStagingImageEnvironmentDeploymentPair,
  record: HeadlessFlyStagingVersionedImageRecord,
): boolean {
  return (
    record.recordId === pair.imageRecordId &&
    record.imageDigestSha256 === pair.imageDigestSha256 &&
    record.hostedWorkerArtifactSha256 === pair.hostedWorkerArtifactSha256 &&
    record.hostedPageArtifactSha256 === pair.hostedPageArtifactSha256
  );
}

export function classifyHeadlessFlyStagingImageEnvironmentDeploymentCoherence(input: {
  readonly imageDigestSha256: unknown;
  readonly rendererBuildId: unknown;
  readonly materializedRendererBuildId?: unknown;
}):
  | {
      readonly ok: true;
      readonly pair: HeadlessFlyStagingImageEnvironmentDeploymentPair;
    }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingImageEnvironmentCoherenceReasonId;
    } {
  try {
    if (input.rendererBuildId == null) {
      return Object.freeze({ ok: false, reasonId: "missing_renderer_build_id" });
    }
    if (
      typeof input.rendererBuildId !== "string" ||
      input.rendererBuildId.trim().length === 0
    ) {
      return Object.freeze({ ok: false, reasonId: "missing_renderer_build_id" });
    }

    const resolved = resolveHeadlessFlyStagingDeploymentPairByImageDigestSha256(
      input.imageDigestSha256,
    );
    if (!resolved.ok) {
      return resolved;
    }

    const record = resolveFlyStagingImageRecordByDigest(resolved.pair.imageDigestSha256);
    if (
      record == null ||
      !validateDeploymentPairRecordBindings(resolved.pair, record)
    ) {
      return Object.freeze({
        ok: false,
        reasonId: "digest_record_binding_mismatch",
      });
    }

    const candidateBuildId =
      input.materializedRendererBuildId ?? input.rendererBuildId;
    if (
      candidateBuildId !== resolved.pair.rendererBuildId ||
      input.rendererBuildId !== resolved.pair.rendererBuildId
    ) {
      return Object.freeze({
        ok: false,
        reasonId: "image_environment_authority_incoherent",
      });
    }

    return Object.freeze({ ok: true, pair: resolved.pair });
  } catch {
    return Object.freeze({ ok: false, reasonId: "hostile_input" });
  }
}

export function classifyHeadlessFlyStagingDeploymentProviderContactGate(input: {
  readonly coherence: ReturnType<
    typeof classifyHeadlessFlyStagingImageEnvironmentDeploymentCoherence
  >;
  readonly providerContactAttempted: boolean;
}): {
  readonly ok: boolean;
  readonly reasonId:
    | "ok"
    | "image_environment_authority_incoherent"
    | "provider_contact_forbidden_before_coherence";
} {
  if (input.coherence.ok) {
    return Object.freeze({ ok: true, reasonId: "ok" });
  }
  if (input.providerContactAttempted) {
    return Object.freeze({
      ok: false,
      reasonId: "provider_contact_forbidden_before_coherence",
    });
  }
  return Object.freeze({
    ok: false,
    reasonId: "image_environment_authority_incoherent",
  });
}

const RENDERER_BUILD_ID_TOML_RE =
  /HEADLESS_RENDERER_BUILD_ID\s*=\s*"([^"]+)"/;

export function extractHeadlessFlyStagingMaterializedRendererBuildId(
  materializedToml: unknown,
): string | null {
  if (typeof materializedToml !== "string" || materializedToml.length === 0) {
    return null;
  }
  const match = materializedToml.match(RENDERER_BUILD_ID_TOML_RE);
  return match?.[1] ?? null;
}

export function materializeHeadlessFlyStagingTomlForDeploymentPair(input: {
  readonly templateToml: unknown;
  readonly appName: unknown;
  readonly pair: HeadlessFlyStagingImageEnvironmentDeploymentPair;
}): HeadlessFlyStagingMaterializeResult & {
  readonly rendererBuildId: string | null;
} {
  if (typeof input.templateToml !== "string") {
    return Object.freeze({
      status: "invalid",
      reasonId: "template_invalid",
      toml: null,
      appName: null,
      rendererBuildId: null,
    });
  }
  const replacedBuildId = input.templateToml.replace(
    RENDERER_BUILD_ID_TOML_RE,
    `HEADLESS_RENDERER_BUILD_ID = "${input.pair.rendererBuildId}"`,
  );
  const materialized = materializeHeadlessFlyStagingToml(
    replacedBuildId,
    input.appName,
  );
  return Object.freeze({
    ...materialized,
    rendererBuildId: extractHeadlessFlyStagingMaterializedRendererBuildId(
      materialized.toml,
    ),
  });
}

export function materializeHeadlessFlyStagingTomlForImageDigestSha256(input: {
  readonly templateToml: unknown;
  readonly appName: unknown;
  readonly imageDigestSha256: unknown;
}):
  | {
      readonly ok: true;
      readonly pair: HeadlessFlyStagingImageEnvironmentDeploymentPair;
      readonly toml: string;
      readonly appName: string;
      readonly rendererBuildId: string;
    }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingImageEnvironmentCoherenceReasonId;
    } {
  const resolved = resolveHeadlessFlyStagingDeploymentPairByImageDigestSha256(
    input.imageDigestSha256,
  );
  if (!resolved.ok) {
    return resolved;
  }
  const materialized = materializeHeadlessFlyStagingTomlForDeploymentPair({
    templateToml: input.templateToml,
    appName: input.appName,
    pair: resolved.pair,
  });
  if (materialized.status !== "ok" || materialized.toml == null || materialized.appName == null) {
    return Object.freeze({
      ok: false,
      reasonId: "image_environment_authority_incoherent",
    });
  }
  const coherence = classifyHeadlessFlyStagingImageEnvironmentDeploymentCoherence({
    imageDigestSha256: resolved.pair.imageDigestSha256,
    rendererBuildId: resolved.pair.rendererBuildId,
    materializedRendererBuildId: materialized.rendererBuildId,
  });
  if (!coherence.ok) {
    return coherence;
  }
  return Object.freeze({
    ok: true,
    pair: resolved.pair,
    toml: materialized.toml,
    appName: materialized.appName,
    rendererBuildId: resolved.pair.rendererBuildId,
  });
}

export function resolveHeadlessFlyStagingCurrentDeploymentPairDigestSha256(): string {
  return resolveCurrentFlyStagingAcceptedImageDigestSha256();
}

export const HEADLESS_FLY_STAGING_IMAGE_ENVIRONMENT_DEPLOYMENT_PAIR_CONTRACT =
  Object.freeze({
    authorityVersion:
      HEADLESS_FLY_STAGING_IMAGE_ENVIRONMENT_DEPLOYMENT_PAIR_AUTHORITY_VERSION,
    pairCount: HEADLESS_FLY_STAGING_IMAGE_ENVIRONMENT_DEPLOYMENT_PAIRS.length,
    deriveEnvironmentFromImageDigest: true,
    deriveEnvironmentFromCurrentRecordOnly: false,
    deriveEnvironmentFromShell: false,
    deriveEnvironmentFromStaleMaterializedToml: false,
    deriveEnvironmentFromManualBuildIdWithoutDigest: false,
    failClosedReasonId: "image_environment_authority_incoherent",
    rollbackPairRecordId:
      HEADLESS_FLY_STAGING_POST_007_2G23_ROLLBACK_DEPLOYMENT_PAIR.imageRecordId,
    forwardPairRecordId:
      HEADLESS_FLY_STAGING_POST_007_2G24_FORWARD_DEPLOYMENT_PAIR.imageRecordId,
  } as const);
