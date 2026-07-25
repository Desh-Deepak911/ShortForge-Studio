/**
 * Sprint 11E Phase 2E.2D.8F.7 — provider-backed render context classifications.
 */

import type { HeadlessAssetBundleV1, HeadlessRenderJobRequestV1 } from "../../domain";
import { classifySourceAssetCountClass } from "./provider-backed-boundary-telemetry";
import type {
  ProviderContextClassifications,
  StorageAdapterClass,
} from "./provider-backed-boundary-telemetry";
import { classifyProductionRenderProfileClass } from "./classify-production-render-profile-authority";
import { assertHeadlessManifestTargetCompatibility } from "./render-target";

export function classifyProviderRenderContext(input: {
  readonly request: HeadlessRenderJobRequestV1;
  readonly bundle: HeadlessAssetBundleV1;
  readonly storageAdapterClass: StorageAdapterClass;
  readonly identityCoherent: boolean;
  readonly ffmpegExecutable?: string;
}): ProviderContextClassifications {
  const base = {
    renderRequestSchemaClass: "not_reached" as const,
    renderProfileClass: "not_reached" as const,
    manifestValidationClass: "not_reached" as const,
    bundleValidationClass: "not_reached" as const,
    expectedSlotCoverageClass: "not_applicable" as const,
    finalizedSourceObjectCoverageClass: "not_applicable" as const,
    sourceAssetCountClass: classifySourceAssetCountClass(0),
    sourceAssetMaterializationClass: "not_started" as const,
    sourceAssetByteVerificationClass: "not_reached" as const,
    sourceWorkspaceCollisionClass: "none" as const,
    pageReservedPathIntegrityClass: "intact" as const,
    storageAdapterClass: input.storageAdapterClass,
    canonicalJobIdentityCoherenceClass: input.identityCoherent
      ? ("coherent" as const)
      : ("incoherent" as const),
  };

  const schemaValid =
    input.request != null &&
    typeof input.request.rendererBuildId === "string" &&
    input.request.manifest != null &&
    input.request.assetBundle != null &&
    input.request.rendererProfile != null;

  if (!schemaValid) {
    return Object.freeze({
      ...base,
      renderRequestSchemaClass: "invalid",
    });
  }

  const manifestTarget = assertHeadlessManifestTargetCompatibility({
    manifest: input.request.manifest,
    rendererProfile: input.request.rendererProfile,
  });

  const bundleAssets = input.bundle.assets ?? [];
  const assetCount = bundleAssets.length;

  const renderProfileClass = classifyProductionRenderProfileClass({
    request: input.request,
    ffmpegExecutable: input.ffmpegExecutable,
  });

  return Object.freeze({
    ...base,
    renderRequestSchemaClass: "valid_v1",
    renderProfileClass,
    manifestValidationClass: manifestTarget.ok ? "valid" : "invalid",
    bundleValidationClass:
      assetCount > 0 && bundleAssets.every((a) => a.contentDigest.length > 0)
        ? "valid"
        : "invalid",
    expectedSlotCoverageClass: assetCount > 0 ? "complete" : "not_applicable",
    finalizedSourceObjectCoverageClass:
      assetCount > 0 ? "complete" : "not_applicable",
    sourceAssetCountClass: classifySourceAssetCountClass(assetCount),
  });
}

export function withSourceMaterializationContext(
  ctx: ProviderContextClassifications,
  input: {
    readonly ok: boolean;
    readonly assetCount: number;
    readonly byteVerificationFailed: boolean;
    readonly reservedPathCollision: boolean;
    readonly pageIntegrityIntact: boolean;
  },
): ProviderContextClassifications {
  return Object.freeze({
    ...ctx,
    sourceAssetCountClass: classifySourceAssetCountClass(input.assetCount),
    sourceAssetMaterializationClass: input.ok ? "complete" : "failed",
    sourceAssetByteVerificationClass: input.byteVerificationFailed
      ? "verification_failed"
      : input.ok
        ? "all_verified"
        : "not_reached",
    sourceWorkspaceCollisionClass: input.reservedPathCollision
      ? "reserved_path_collision"
      : "none",
    pageReservedPathIntegrityClass: input.pageIntegrityIntact
      ? "intact"
      : "post_materialization_mismatch",
  });
}
