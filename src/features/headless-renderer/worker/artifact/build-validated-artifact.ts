/**
 * Build canonical HeadlessRenderArtifact from incremental digest + ffprobe facts.
 * Never requires whole artifact bytes in Node memory.
 * Never invent probe facts (no codec/channel/sample-rate fallbacks).
 */

import { HEADLESS_ARTIFACT_DURATION_TOLERANCE_MS } from "../../domain/headless-render-constants";
import {
  finalizeHeadlessRenderArtifact,
  type HeadlessRenderArtifactV1,
  type HeadlessRenderJobRequestV1,
  type HeadlessRenderJobV1,
} from "../../domain";
import { isCanonicalHeadlessFps30 } from "../ffmpeg/canonical-fps";
import type { HeadlessProbedArtifact } from "../ffmpeg/probe-artifact";
import {
  isAcceptedProbeContainer,
  resolveHeadlessOutputProfile,
  type HeadlessOutputProfile,
} from "../runtime/output-profiles";
import type { HeadlessRenderTarget } from "../runtime/render-target";
import { buildHeadlessRunMetrics } from "../runtime/run-metrics";
import {
  HEADLESS_WORKER_RENDERER_BUILD_ID,
  type HeadlessWorkerArtifactEvidence,
} from "../runtime/worker-types";

const CONTENT_DIGEST_RE = /^sha256:[a-f0-9]{64}$/;

export function buildValidatedHeadlessArtifact(input: {
  /** Canonical `sha256:<64 lowercase hex>` from incremental file hash. */
  contentDigest: string;
  byteLength: number;
  probe: HeadlessProbedArtifact;
  request: HeadlessRenderJobRequestV1;
  job: HeadlessRenderJobV1;
  nowMs: number;
  outputProfile?: HeadlessOutputProfile;
  renderTarget?: HeadlessRenderTarget;
  evidenceBase: Omit<
    HeadlessWorkerArtifactEvidence,
    | "contentDigest"
    | "byteLength"
    | "mimeType"
    | "audioPresent"
    | "audioCodec"
    | "videoCodec"
    | "durationMs"
    | "width"
    | "height"
    | "fps"
  > &
    Partial<HeadlessWorkerArtifactEvidence>;
}):
  | {
      readonly ok: true;
      readonly artifact: HeadlessRenderArtifactV1;
      readonly evidence: HeadlessWorkerArtifactEvidence;
    }
  | { readonly ok: false; readonly message: string } {
  if (
    !Number.isSafeInteger(input.byteLength) ||
    input.byteLength < 32
  ) {
    return { ok: false, message: "Artifact bytes empty/truncated." };
  }
  if (!CONTENT_DIGEST_RE.test(input.contentDigest)) {
    return { ok: false, message: "Invalid content digest." };
  }

  if (input.request.rendererBuildId !== HEADLESS_WORKER_RENDERER_BUILD_ID) {
    return { ok: false, message: "rendererBuildId mismatch." };
  }

  const resolved =
    input.outputProfile != null
      ? { ok: true as const, profile: input.outputProfile }
      : resolveHeadlessOutputProfile(input.request.rendererProfile);
  if (!resolved.ok) {
    return { ok: false, message: "Unknown output profile." };
  }
  const outputProfile = resolved.profile;

  if (!isAcceptedProbeContainer(input.probe.formatName, outputProfile)) {
    return { ok: false, message: "Unsupported container format." };
  }

  const expectAudio = input.request.manifest.audio.mode !== "silent";
  if (!input.probe.hasVideo) {
    return { ok: false, message: "Artifact missing video stream." };
  }
  if (expectAudio && !input.probe.hasAudio) {
    return { ok: false, message: "Artifact missing required audio stream." };
  }
  if (!expectAudio && input.probe.hasAudio) {
    return { ok: false, message: "Silent artifact unexpectedly contains audio." };
  }

  const width = input.probe.width;
  const height = input.probe.height;
  const fps = input.probe.fps;
  const durationMs = input.probe.durationMs;
  const targetWidth = input.renderTarget?.width ?? outputProfile.width;
  const targetHeight = input.renderTarget?.height ?? outputProfile.height;
  if (
    width == null ||
    height == null ||
    width !== targetWidth ||
    height !== targetHeight ||
    width !== outputProfile.width ||
    height !== outputProfile.height
  ) {
    return { ok: false, message: "Unexpected dimensions." };
  }
  // Non-4K: artifact must also match frozen manifest pixels.
  if (input.request.rendererProfile.resolution !== "4k") {
    if (
      width !== input.request.manifest.output.width ||
      height !== input.request.manifest.output.height
    ) {
      return { ok: false, message: "Unexpected dimensions." };
    }
  }
  if (!isCanonicalHeadlessFps30(fps)) {
    return { ok: false, message: "Unexpected fps." };
  }
  const acceptedFps = 30;
  const expectedDuration = input.request.manifest.project.renderDurationMs;
  if (
    durationMs == null ||
    !Number.isInteger(durationMs) ||
    Math.abs(durationMs - expectedDuration) >
      HEADLESS_ARTIFACT_DURATION_TOLERANCE_MS
  ) {
    return { ok: false, message: "Duration outside tolerance." };
  }

  const videoCodec = input.probe.videoCodec;
  if (
    videoCodec == null ||
    !(outputProfile.probeVideoCodecs as readonly string[]).includes(videoCodec)
  ) {
    return { ok: false, message: "Unsupported or missing video codec." };
  }

  if (
    input.probe.pixelFormat != null &&
    input.probe.pixelFormat !== outputProfile.pixelFormat
  ) {
    return { ok: false, message: "Unexpected pixel format." };
  }

  let audioCodec: string | null = null;
  let audioChannels: number | null = null;
  let audioSampleRateHz: number | null = null;
  if (expectAudio) {
    audioCodec = input.probe.audioCodec;
    audioChannels = input.probe.audioChannels;
    audioSampleRateHz = input.probe.audioSampleRateHz;
    if (
      audioCodec == null ||
      audioChannels == null ||
      audioSampleRateHz == null ||
      audioChannels < 1 ||
      audioSampleRateHz < 1
    ) {
      return { ok: false, message: "Missing required audio probe facts." };
    }
    if (
      !(outputProfile.probeAudioCodecs as readonly string[]).includes(audioCodec)
    ) {
      return { ok: false, message: "Unsupported or missing audio codec." };
    }
  }

  const finalized = finalizeHeadlessRenderArtifact({
    version: 1,
    artifactId: `art_${input.job.jobId}`,
    contentDigest: input.contentDigest,
    byteLength: input.byteLength,
    mimeType: outputProfile.mimeType,
    format: outputProfile.format,
    width,
    height,
    fps: acceptedFps,
    durationMs,
    audio: expectAudio
      ? {
          present: true,
          codec: audioCodec!,
          channels: audioChannels!,
          sampleRateHz: audioSampleRateHz!,
        }
      : {
          present: false,
          codec: null,
          channels: null,
          sampleRateHz: null,
        },
    video: {
      present: true,
      codec: videoCodec,
      width,
      height,
      fps: acceptedFps,
    },
    rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
    manifestFingerprint: input.request.manifestFingerprint,
    assetBundleFingerprint: input.request.assetBundle.fingerprint,
    renderJobFingerprint: input.job.renderJobFingerprint,
    expiresAtMs: input.nowMs + 86_400_000,
  });

  if (!finalized.ok) {
    return { ok: false, message: "Domain artifact validation failed." };
  }

  const metrics =
    input.evidenceBase.metrics ??
    buildHeadlessRunMetrics({
      renderStageMs: null,
      encodeStageMs: null,
      probeStageMs: null,
      uploadStageMs: null,
      totalElapsedMs: input.evidenceBase.elapsedRenderMs ?? null,
      budget: null,
      artifactBytes: input.byteLength,
      nodeCoordinatorPeakRssBytes:
        input.evidenceBase.nodeCoordinatorPeakRssBytes ?? null,
      frameCount: input.evidenceBase.frameCount ?? null,
    });

  const evidence: HeadlessWorkerArtifactEvidence = {
    contentDigest: input.contentDigest,
    byteLength: input.byteLength,
    mimeType: outputProfile.mimeType,
    width,
    height,
    fps: acceptedFps,
    durationMs,
    videoCodec,
    audioPresent: input.probe.hasAudio,
    audioCodec,
    audioChannels,
    audioSampleRateHz,
    rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
    chromeVersion: input.evidenceBase.chromeVersion ?? "unknown",
    ffmpegVersion: input.evidenceBase.ffmpegVersion ?? "unknown",
    ffprobeVersion: input.evidenceBase.ffprobeVersion ?? "unknown",
    elapsedRenderMs: input.evidenceBase.elapsedRenderMs ?? 0,
    frameCount: input.evidenceBase.frameCount ?? 0,
    nodeCoordinatorPeakRssBytes:
      input.evidenceBase.nodeCoordinatorPeakRssBytes ?? null,
    metrics,
    profileId:
      input.evidenceBase.profileId ??
      input.renderTarget?.profileId ??
      outputProfile.profileId,
  };

  return { ok: true, artifact: finalized.artifact, evidence };
}
