/**
 * Internal field-match helpers for job/request/artifact coherence.
 * Operate only on already-canonical (runtime-validated) values — no revalidation.
 */

import {
  HEADLESS_ARTIFACT_DURATION_TOLERANCE_MS,
  HEADLESS_RESOLUTION_PIXELS,
} from "./headless-render-constants";
import { headlessFail, headlessIssue } from "./headless-diagnostics";
import { buildHeadlessRenderJobFingerprint } from "./headless-fingerprints";
import { HEADLESS_RENDER_CONTRACT_VERSION } from "./headless-render.types";
import type {
  HeadlessRenderArtifactV1,
  HeadlessRenderJobRequestV1,
  HeadlessRenderJobV1,
} from "./headless-render.types";

export function matchJobToCanonicalRequest(
  job: HeadlessRenderJobV1,
  request: HeadlessRenderJobRequestV1,
):
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: ReturnType<typeof headlessFail>["issues"] } {
  if (
    job.ownership.ownerId !== request.ownership.ownerId ||
    job.ownership.projectId !== request.ownership.projectId ||
    job.manifestFingerprint !== request.manifestFingerprint ||
    job.assetBundleFingerprint !== request.assetBundle.fingerprint ||
    job.requestFingerprint !== request.requestFingerprint ||
    job.rendererBuildId !== request.rendererBuildId ||
    job.idempotencyKey !== request.idempotencyKey ||
    job.rendererProfile.resolution !== request.rendererProfile.resolution ||
    job.rendererProfile.format !== request.rendererProfile.format ||
    job.rendererProfile.fps !== request.rendererProfile.fps ||
    job.rendererProfile.quality !== request.rendererProfile.quality ||
    job.contractVersion !== HEADLESS_RENDER_CONTRACT_VERSION
  ) {
    return headlessFail(
      headlessIssue(
        "JOB_REQUEST_COHERENCE_MISMATCH",
        "Job fields do not match asserted canonical request.",
      ),
    );
  }

  const expectedJobFp = buildHeadlessRenderJobFingerprint({
    requestFingerprint: request.requestFingerprint,
    attempt: job.attempt,
    rendererBuildId: request.rendererBuildId,
  });
  if (!expectedJobFp.ok) return expectedJobFp;
  if (job.renderJobFingerprint !== expectedJobFp.fingerprint) {
    return headlessFail(
      headlessIssue(
        "JOB_REQUEST_COHERENCE_MISMATCH",
        "Job renderJobFingerprint does not match request authority.",
      ),
    );
  }

  return { ok: true };
}

export function matchArtifactToCanonicalJobRequest(
  artifact: HeadlessRenderArtifactV1,
  job: HeadlessRenderJobV1,
  request: HeadlessRenderJobRequestV1,
):
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: ReturnType<typeof headlessFail>["issues"] } {
  const profile = request.rendererProfile;
  const output = request.manifest.output;
  const expectedPixels = HEADLESS_RESOLUTION_PIXELS[profile.resolution];

  if (
    artifact.format !== profile.format ||
    artifact.format !== output.format ||
    artifact.mimeType !==
      (artifact.format === "webm" ? "video/webm" : "video/mp4")
  ) {
    return headlessFail(
      headlessIssue(
        "ARTIFACT_REQUEST_COHERENCE_MISMATCH",
        "Artifact format/MIME does not match request/manifest output.",
      ),
    );
  }
  // Artifact pixels follow the headless target (may elevate 1080p → 4K).
  if (
    artifact.width !== expectedPixels.width ||
    artifact.height !== expectedPixels.height
  ) {
    return headlessFail(
      headlessIssue(
        "ARTIFACT_REQUEST_COHERENCE_MISMATCH",
        "Artifact dimensions do not match headless render target.",
      ),
    );
  }
  if (profile.resolution !== "4k") {
    if (
      artifact.width !== output.width ||
      artifact.height !== output.height
    ) {
      return headlessFail(
        headlessIssue(
          "ARTIFACT_REQUEST_COHERENCE_MISMATCH",
          "Artifact dimensions do not match frozen manifest output.",
        ),
      );
    }
  } else if (
    output.resolution !== "1080p" ||
    output.width !== 1080 ||
    output.height !== 1920
  ) {
    return headlessFail(
      headlessIssue(
        "ARTIFACT_REQUEST_COHERENCE_MISMATCH",
        "4K artifact requires a frozen 1080p ExportManifest snapshot.",
      ),
    );
  }
  if (artifact.fps !== profile.fps || artifact.fps !== output.fps) {
    return headlessFail(
      headlessIssue(
        "ARTIFACT_REQUEST_COHERENCE_MISMATCH",
        "Artifact fps does not match request/manifest.",
      ),
    );
  }
  const expectedDuration = request.manifest.project.renderDurationMs;
  if (
    Math.abs(artifact.durationMs - expectedDuration) >
    HEADLESS_ARTIFACT_DURATION_TOLERANCE_MS
  ) {
    return headlessFail(
      headlessIssue(
        "ARTIFACT_REQUEST_COHERENCE_MISMATCH",
        "Artifact duration outside frozen tolerance of manifest renderDurationMs.",
      ),
    );
  }
  const expectAudio = request.manifest.audio.mode !== "silent";
  if (artifact.audio.present !== expectAudio) {
    return headlessFail(
      headlessIssue(
        "ARTIFACT_REQUEST_COHERENCE_MISMATCH",
        "Artifact audio presence does not match manifest audio mode.",
      ),
    );
  }
  if (
    artifact.rendererBuildId !== job.rendererBuildId ||
    artifact.rendererBuildId !== request.rendererBuildId ||
    artifact.manifestFingerprint !== job.manifestFingerprint ||
    artifact.manifestFingerprint !== request.manifestFingerprint ||
    artifact.assetBundleFingerprint !== job.assetBundleFingerprint ||
    artifact.assetBundleFingerprint !== request.assetBundle.fingerprint ||
    artifact.renderJobFingerprint !== job.renderJobFingerprint
  ) {
    return headlessFail(
      headlessIssue(
        "ARTIFACT_REQUEST_COHERENCE_MISMATCH",
        "Artifact fingerprints do not match job/request authority.",
      ),
    );
  }
  return { ok: true };
}
