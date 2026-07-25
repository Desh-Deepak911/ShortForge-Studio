/**
 * SHA-256 authority fingerprints for bundle / request / job / artifact / idempotency.
 */

import type { ExportManifest } from "@/features/export/domain/headless-safe";

import {
  HEADLESS_RENDER_CONTRACT_VERSION,
  type HeadlessAssetBundleV1,
  type HeadlessAssetDescriptorV1,
  type HeadlessOwnershipBinding,
  type HeadlessRenderArtifactV1,
  type HeadlessRendererProfile,
} from "./headless-render.types";
import {
  buildHeadlessAuthorityFingerprint,
  headlessSha256OfCanonical,
  isHeadlessAuthorityFingerprint,
} from "./headless-stable-hash";
import type { HeadlessIntegrityIssue } from "./headless-render.types";

function assetDescriptorFingerprintPayload(asset: HeadlessAssetDescriptorV1) {
  return {
    version: asset.version,
    assetId: asset.assetId,
    sourceIdentity: {
      role: asset.sourceIdentity.role,
      sceneId: asset.sourceIdentity.sceneId,
      mediaItemId: asset.sourceIdentity.mediaItemId,
      sourceDigest: asset.sourceIdentity.sourceDigest,
      classification: asset.sourceIdentity.classification,
    },
    contentDigest: asset.contentDigest,
    byteLength: asset.byteLength,
    mimeType: asset.mimeType,
    mediaKind: asset.mediaKind,
    // storageLocator excluded — durable owned-object identity is not semantic content.
    // expiresAtMs excluded — mutable retention policy, not semantic content identity
  };
}

export function buildHeadlessAssetBundleFingerprint(
  bundleId: string,
  assets: readonly HeadlessAssetDescriptorV1[],
):
  | { readonly ok: true; readonly fingerprint: string }
  | { readonly ok: false; readonly issues: readonly HeadlessIntegrityIssue[] } {
  const sorted = [...assets]
    .map(assetDescriptorFingerprintPayload)
    .sort((a, b) => {
      if (a.assetId < b.assetId) return -1;
      if (a.assetId > b.assetId) return 1;
      const ak = `${a.sourceIdentity.role}|${a.sourceIdentity.sourceDigest}`;
      const bk = `${b.sourceIdentity.role}|${b.sourceIdentity.sourceDigest}`;
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });

  return buildHeadlessAuthorityFingerprint("hab", {
    version: 1,
    bundleId,
    assets: sorted,
  });
}

/** Cryptographic digest of the exact validated ExportManifest payload. */
export function buildHeadlessManifestPayloadDigest(
  manifest: ExportManifest,
):
  | { readonly ok: true; readonly digest: string }
  | { readonly ok: false; readonly issues: readonly HeadlessIntegrityIssue[] } {
  const hashed = headlessSha256OfCanonical({
    kind: "manifest-payload",
    version: 1,
    manifest,
  });
  if (!hashed.ok) return hashed;
  return { ok: true, digest: `sha256:${hashed.hex}` };
}

export function buildHeadlessRenderJobRequestFingerprint(input: {
  ownership: HeadlessOwnershipBinding;
  manifestFingerprint: string;
  manifestPayloadDigest: string;
  assetBundleFingerprint: string;
  rendererProfile: HeadlessRendererProfile;
  rendererBuildId: string;
  idempotencyKey: string;
}):
  | { readonly ok: true; readonly fingerprint: string }
  | { readonly ok: false; readonly issues: readonly HeadlessIntegrityIssue[] } {
  return buildHeadlessAuthorityFingerprint("hrr", {
    version: 1,
    kind: "render-request",
    ownership: {
      ownerId: input.ownership.ownerId,
      projectId: input.ownership.projectId,
    },
    manifestFingerprint: input.manifestFingerprint,
    manifestPayloadDigest: input.manifestPayloadDigest,
    assetBundleFingerprint: input.assetBundleFingerprint,
    rendererProfile: {
      resolution: input.rendererProfile.resolution,
      format: input.rendererProfile.format,
      fps: input.rendererProfile.fps,
      quality: input.rendererProfile.quality,
    },
    rendererBuildId: input.rendererBuildId,
    idempotencyKey: input.idempotencyKey,
  });
}

export function buildHeadlessRenderJobFingerprint(input: {
  requestFingerprint: string;
  attempt: number;
  rendererBuildId: string;
  contractVersion?: number;
}):
  | { readonly ok: true; readonly fingerprint: string }
  | { readonly ok: false; readonly issues: readonly HeadlessIntegrityIssue[] } {
  return buildHeadlessAuthorityFingerprint("hrj", {
    version: 1,
    kind: "render-job",
    contractVersion: input.contractVersion ?? HEADLESS_RENDER_CONTRACT_VERSION,
    requestFingerprint: input.requestFingerprint,
    attempt: input.attempt,
    rendererBuildId: input.rendererBuildId,
  });
}

export function buildHeadlessArtifactMetadataFingerprint(
  artifact: Omit<HeadlessRenderArtifactV1, "fingerprint">,
):
  | { readonly ok: true; readonly fingerprint: string }
  | { readonly ok: false; readonly issues: readonly HeadlessIntegrityIssue[] } {
  return buildHeadlessAuthorityFingerprint("hra", {
    version: artifact.version,
    artifactId: artifact.artifactId,
    contentDigest: artifact.contentDigest,
    byteLength: artifact.byteLength,
    mimeType: artifact.mimeType,
    format: artifact.format,
    width: artifact.width,
    height: artifact.height,
    fps: artifact.fps,
    durationMs: artifact.durationMs,
    audio: artifact.audio,
    video: artifact.video,
    rendererBuildId: artifact.rendererBuildId,
    manifestFingerprint: artifact.manifestFingerprint,
    assetBundleFingerprint: artifact.assetBundleFingerprint,
    renderJobFingerprint: artifact.renderJobFingerprint,
    // expiresAtMs excluded — mutable retention policy
  });
}

/**
 * Structured length-safe idempotency authority (SHA-256).
 * Delimiter-like owner/project strings cannot collide.
 */
export function buildHeadlessIdempotencyAuthorityKey(input: {
  ownerId: string;
  projectId: string;
  requestFingerprint: string;
}):
  | { readonly ok: true; readonly key: string }
  | { readonly ok: false; readonly issues: readonly HeadlessIntegrityIssue[] } {
  const built = buildHeadlessAuthorityFingerprint("hid", {
    version: 1,
    kind: "idempotency",
    ownership: {
      ownerId: input.ownerId,
      projectId: input.projectId,
    },
    requestFingerprint: input.requestFingerprint,
  });
  if (!built.ok) return built;
  return { ok: true, key: built.fingerprint };
}

export function verifyHeadlessAssetBundleFingerprintCoherence(
  bundle: HeadlessAssetBundleV1,
): boolean {
  const expected = buildHeadlessAssetBundleFingerprint(
    bundle.bundleId,
    bundle.assets,
  );
  return expected.ok && expected.fingerprint === bundle.fingerprint;
}

export function assertHeadlessFingerprintKind(
  value: unknown,
  kind: "hab" | "hrr" | "hrj" | "hra" | "hid" | "hsrc",
): boolean {
  return isHeadlessAuthorityFingerprint(value, kind);
}
