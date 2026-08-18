/**
 * Phase 3.1 capability gate — reject unsupported/malformed profiles before Chromium.
 * Proves selected encoders exist — no silent fallback.
 */

import type { HeadlessRenderJobRequestV1 } from "../../domain";
import { buildHeadlessAudioPlan } from "../audio/build-headless-audio-plan";
import { scrubWorkerMessage } from "../diagnostics/scrub-worker-message";
import { assertFfmpegEncodersPresent } from "../ffmpeg/list-ffmpeg-encoders";
import { resolveNativeFfmpegBinaries } from "../ffmpeg/resolve-ffmpeg-binaries";
import type { HeadlessOutputProfile } from "./output-profiles";
import { assertHeadlessManifestTargetCompatibility } from "./render-target";
import { isAcceptedHeadlessWorkerRendererBuildId } from "./renderer-build-id";
import {
  HEADLESS_WORKER_PHASE3_SUPPORTED,
  type HeadlessWorkerRunFailure,
} from "./worker-types";

export function assertPhase3WorkerCapability(input: {
  request: HeadlessRenderJobRequestV1;
  /** When omitted, resolves native ffmpeg for encoder presence checks. */
  ffmpegExecutable?: string;
}): HeadlessWorkerRunFailure | null {
  const profile = input.request.rendererProfile;
  const manifest = input.request.manifest;

  if (!isAcceptedHeadlessWorkerRendererBuildId(input.request.rendererBuildId)) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      message: scrubWorkerMessage("capability"),
      retryable: false,
    };
  }

  if (
    !(HEADLESS_WORKER_PHASE3_SUPPORTED.resolutions as readonly string[]).includes(
      profile.resolution,
    ) ||
    !(HEADLESS_WORKER_PHASE3_SUPPORTED.formats as readonly string[]).includes(
      profile.format,
    )
  ) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      message: scrubWorkerMessage("capability"),
      retryable: false,
    };
  }

  if (profile.fps !== 30 || manifest.output.fps !== 30) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      message: scrubWorkerMessage("capability"),
      retryable: false,
    };
  }

  const compatibility = assertHeadlessManifestTargetCompatibility({
    manifest,
    rendererProfile: profile,
  });
  if (!compatibility.ok) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      message: scrubWorkerMessage("capability"),
      retryable: false,
    };
  }

  if (
    "requiredCapabilities" in manifest &&
    manifest.requiredCapabilities.some(
      (capability) =>
        !(HEADLESS_WORKER_PHASE3_SUPPORTED.rendererCapabilities as readonly string[]).includes(
          capability,
        ),
    )
  ) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      message: scrubWorkerMessage("capability"),
      retryable: false,
    };
  }

  if (
    !(HEADLESS_WORKER_PHASE3_SUPPORTED.audioModes as readonly string[]).includes(
      manifest.audio.mode,
    )
  ) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      message: scrubWorkerMessage("capability"),
      retryable: false,
    };
  }

  const audioPlan = buildHeadlessAudioPlan(manifest);
  if (!audioPlan.ok) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      message: scrubWorkerMessage("capability"),
      retryable: false,
    };
  }

  if (
    !(
      HEADLESS_WORKER_PHASE3_SUPPORTED.audioCombinations as readonly string[]
    ).includes(audioPlan.plan.combination)
  ) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      message: scrubWorkerMessage("capability"),
      retryable: false,
    };
  }

  const encoderCheck = assertOutputProfileEncoders({
    outputProfile: compatibility.target.profile,
    ffmpegExecutable: input.ffmpegExecutable,
  });
  if (encoderCheck) return encoderCheck;

  return null;
}

export function assertOutputProfileEncoders(input: {
  outputProfile: HeadlessOutputProfile;
  ffmpegExecutable?: string;
}): HeadlessWorkerRunFailure | null {
  let ffmpegExecutable = input.ffmpegExecutable;
  if (!ffmpegExecutable) {
    const bins = resolveNativeFfmpegBinaries();
    if (!bins.ok) {
      return {
        ok: false,
        reasonId: "UNSUPPORTED_CAPABILITY",
        message: scrubWorkerMessage("capability"),
        retryable: false,
      };
    }
    ffmpegExecutable = bins.ffmpegExecutable;
  }

  const required = [
    input.outputProfile.videoEncoder,
    input.outputProfile.audioEncoder,
  ];
  const present = assertFfmpegEncodersPresent({
    ffmpegExecutable,
    required,
  });
  if (!present.ok) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      message: scrubWorkerMessage("capability"),
      retryable: false,
    };
  }
  return null;
}

/** @deprecated Prefer assertPhase3WorkerCapability */
export function assertPhase2WorkerCapability(input: {
  request: HeadlessRenderJobRequestV1;
  ffmpegExecutable?: string;
}): HeadlessWorkerRunFailure | null {
  return assertPhase3WorkerCapability(input);
}

/** @deprecated Prefer assertPhase3WorkerCapability */
export function assertPhase1WorkerCapability(input: {
  request: HeadlessRenderJobRequestV1;
  ffmpegExecutable?: string;
}): HeadlessWorkerRunFailure | null {
  return assertPhase3WorkerCapability(input);
}
