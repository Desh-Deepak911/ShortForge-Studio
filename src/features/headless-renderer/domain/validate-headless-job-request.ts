/**
 * Total validation for HeadlessRenderJobRequest v1.
 * Returns a detached deeply frozen canonical graph — never freezes caller input.
 */

import {
  validateExportManifest,
  type ExportManifest,
} from "@/features/export/domain/headless-safe";

import { deepFreezeHeadlessValue } from "./headless-deep-freeze";
import { headlessFail, headlessIssue } from "./headless-diagnostics";
import {
  parseHeadlessOwnership,
  parseHeadlessRendererProfile,
  isNonEmptyId,
} from "./headless-field-validators";
import {
  buildHeadlessManifestPayloadDigest,
  buildHeadlessRenderJobFingerprint,
  buildHeadlessRenderJobRequestFingerprint,
} from "./headless-fingerprints";
import {
  guardHeadlessStructure,
  hasUnknownFields,
  isPlainObject,
} from "./headless-hostile-guard";
import {
  HEADLESS_RENDER_JOB_REQUEST_VERSION,
  type HeadlessOwnershipBinding,
  type HeadlessRenderJobRequestV1,
  type HeadlessRendererProfile,
} from "./headless-render.types";
import { isHeadlessAuthorityFingerprint } from "./headless-stable-hash";
import { validateHeadlessAssetBundle } from "./validate-headless-asset-bundle";

const REQUEST_FIELDS = [
  "version",
  "ownership",
  "manifest",
  "manifestFingerprint",
  "assetBundle",
  "rendererProfile",
  "rendererBuildId",
  "idempotencyKey",
  "requestFingerprint",
] as const;

export type ValidateHeadlessRenderJobRequestResult =
  | {
      readonly ok: true;
      readonly issues: readonly [];
      readonly request: HeadlessRenderJobRequestV1;
      readonly renderJobFingerprint: string;
      readonly manifestPayloadDigest: string;
    }
  | { readonly ok: false; readonly issues: ReturnType<typeof headlessFail>["issues"] };

export function validateHeadlessRenderJobRequest(
  value: unknown,
): ValidateHeadlessRenderJobRequestResult {
  try {
    const hostile = guardHeadlessStructure(value);
    if (hostile) return hostile;

    if (!isPlainObject(value)) {
      return headlessFail(
        headlessIssue("INVALID_REQUEST", "Job request must be a plain object."),
      );
    }

    if (hasUnknownFields(value, REQUEST_FIELDS)) {
      return headlessFail(
        headlessIssue("UNKNOWN_FIELD", "Job request has an unknown field."),
      );
    }

    if (value.version !== HEADLESS_RENDER_JOB_REQUEST_VERSION) {
      return headlessFail(
        headlessIssue("INVALID_REQUEST", "Unsupported job request version."),
      );
    }

    const ownershipParsed = parseHeadlessOwnership(value.ownership);
    if (!ownershipParsed.ok) return { ok: false, issues: ownershipParsed.issues };

    const manifestResult = validateExportManifest(value.manifest);
    if (!manifestResult.ok) {
      const code = manifestResult.issues[0]?.code;
      if (code === "UNSUPPORTED_MANIFEST_VERSION") {
        return headlessFail(
          headlessIssue(
            "UNSUPPORTED_MANIFEST_VERSION",
            "ExportManifest version is not accepted for headless jobs.",
          ),
        );
      }
      return headlessFail(
        headlessIssue(
          "INVALID_MANIFEST",
          "ExportManifest failed canonical integrity validation.",
        ),
      );
    }

    // Detach validated manifest — never freeze/mutate caller-owned input.
    const manifest = deepFreezeHeadlessValue(
      value.manifest as ExportManifest,
    );

    if (
      typeof value.manifestFingerprint !== "string" ||
      value.manifestFingerprint !== manifest.fingerprint
    ) {
      return headlessFail(
        headlessIssue(
          "MANIFEST_FINGERPRINT_MISMATCH",
          "Request manifestFingerprint does not match ExportManifest.fingerprint.",
        ),
      );
    }

    if (ownershipParsed.ownership.projectId !== manifest.project.projectId) {
      return headlessFail(
        headlessIssue(
          "INVALID_OWNERSHIP",
          "ownership.projectId must match manifest.project.projectId.",
        ),
      );
    }

    const payloadDigest = buildHeadlessManifestPayloadDigest(manifest);
    if (!payloadDigest.ok) return payloadDigest;

    const bundleResult = validateHeadlessAssetBundle(value.assetBundle, manifest);
    if (!bundleResult.ok) return bundleResult;

    const profileParsed = parseHeadlessRendererProfile(value.rendererProfile);
    if (!profileParsed.ok) return { ok: false, issues: profileParsed.issues };

    // Format/fps/quality must always match the frozen manifest.
    // Resolution: exact for 720p/1080p; 4k elevates pixels from a frozen 1080p snapshot.
    if (
      profileParsed.profile.format !== manifest.output.format ||
      profileParsed.profile.fps !== manifest.output.fps ||
      profileParsed.profile.quality !== manifest.output.quality
    ) {
      return headlessFail(
        headlessIssue(
          "INVALID_RENDERER_PROFILE",
          "rendererProfile conflicts with frozen ExportManifest.output.",
        ),
      );
    }
    if (profileParsed.profile.resolution === "4k") {
      if (
        manifest.output.resolution !== "1080p" ||
        manifest.output.width !== 1080 ||
        manifest.output.height !== 1920
      ) {
        return headlessFail(
          headlessIssue(
            "INVALID_RENDERER_PROFILE",
            "4K headless profile requires a frozen valid 1080p ExportManifest snapshot.",
          ),
        );
      }
    } else if (
      profileParsed.profile.resolution !== manifest.output.resolution
    ) {
      return headlessFail(
        headlessIssue(
          "INVALID_RENDERER_PROFILE",
          "rendererProfile resolution conflicts with frozen ExportManifest.output.",
        ),
      );
    }

    if (!isNonEmptyId(value.rendererBuildId)) {
      return headlessFail(
        headlessIssue("INVALID_RENDERER_BUILD", "Invalid rendererBuildId."),
      );
    }

    if (!isNonEmptyId(value.idempotencyKey)) {
      return headlessFail(
        headlessIssue("INVALID_IDEMPOTENCY_KEY", "Invalid idempotencyKey."),
      );
    }

    const requestFingerprintResult = buildHeadlessRenderJobRequestFingerprint({
      ownership: ownershipParsed.ownership,
      manifestFingerprint: manifest.fingerprint,
      manifestPayloadDigest: payloadDigest.digest,
      assetBundleFingerprint: bundleResult.bundle.fingerprint,
      rendererProfile: profileParsed.profile,
      rendererBuildId: value.rendererBuildId,
      idempotencyKey: value.idempotencyKey,
    });
    if (!requestFingerprintResult.ok) return requestFingerprintResult;

    if (
      !isHeadlessAuthorityFingerprint(value.requestFingerprint, "hrr") ||
      value.requestFingerprint !== requestFingerprintResult.fingerprint
    ) {
      return headlessFail(
        headlessIssue("INVALID_REQUEST", "requestFingerprint mismatch."),
      );
    }

    const request = deepFreezeHeadlessValue({
      version: HEADLESS_RENDER_JOB_REQUEST_VERSION,
      ownership: ownershipParsed.ownership,
      manifest,
      manifestFingerprint: manifest.fingerprint,
      assetBundle: bundleResult.bundle,
      rendererProfile: profileParsed.profile,
      rendererBuildId: value.rendererBuildId,
      idempotencyKey: value.idempotencyKey,
      requestFingerprint: requestFingerprintResult.fingerprint,
    } satisfies HeadlessRenderJobRequestV1);

    const jobFp = buildHeadlessRenderJobFingerprint({
      requestFingerprint: requestFingerprintResult.fingerprint,
      attempt: 1,
      rendererBuildId: value.rendererBuildId,
    });
    if (!jobFp.ok) return jobFp;

    return {
      ok: true,
      issues: [],
      request,
      renderJobFingerprint: jobFp.fingerprint,
      manifestPayloadDigest: payloadDigest.digest,
    };
  } catch {
    return headlessFail(
      headlessIssue("HOSTILE_INPUT", "Hostile job request input rejected."),
    );
  }
}

export function headlessRequestsSemanticallyEqual(
  left: HeadlessRenderJobRequestV1,
  right: HeadlessRenderJobRequestV1,
): boolean {
  return left.requestFingerprint === right.requestFingerprint;
}

/**
 * Validate all inputs and return a discriminated canonical request.
 * Never manufactures authority by fingerprint attachment alone.
 */
export function finalizeHeadlessRenderJobRequest(input: {
  ownership: HeadlessOwnershipBinding;
  manifest: ExportManifest;
  assetBundle: HeadlessRenderJobRequestV1["assetBundle"];
  rendererProfile: HeadlessRendererProfile;
  rendererBuildId: string;
  idempotencyKey: string;
}): ValidateHeadlessRenderJobRequestResult {
  const payloadDigest = buildHeadlessManifestPayloadDigest(input.manifest);
  if (!payloadDigest.ok) return payloadDigest;

  const requestFingerprintResult = buildHeadlessRenderJobRequestFingerprint({
    ownership: input.ownership,
    manifestFingerprint: input.manifest.fingerprint,
    manifestPayloadDigest: payloadDigest.digest,
    assetBundleFingerprint: input.assetBundle.fingerprint,
    rendererProfile: input.rendererProfile,
    rendererBuildId: input.rendererBuildId,
    idempotencyKey: input.idempotencyKey,
  });
  if (!requestFingerprintResult.ok) return requestFingerprintResult;

  return validateHeadlessRenderJobRequest({
    version: HEADLESS_RENDER_JOB_REQUEST_VERSION,
    ownership: input.ownership,
    manifest: input.manifest,
    manifestFingerprint: input.manifest.fingerprint,
    assetBundle: input.assetBundle,
    rendererProfile: input.rendererProfile,
    rendererBuildId: input.rendererBuildId,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: requestFingerprintResult.fingerprint,
  });
}
