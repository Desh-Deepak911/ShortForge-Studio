/**
 * Sprint 11E Phase 2E.2D.8F.6G — safe capability-boundary attribution for claimed-render diagnostic.
 * Allowlisted enums only — never paths, codec probe text, IDs, URLs, or credentials.
 */

import type { HeadlessRenderJobRequestV1 } from "../../domain";
import type { HeadlessStoragePort } from "../../control-plane/ports/storage.port";
import { buildHeadlessAudioPlan } from "../audio/build-headless-audio-plan";
import {
  assertOutputProfileEncoders,
  assertPhase3WorkerCapability,
} from "../runtime/capability-preflight";
import type { HeadlessOutputProfile } from "../runtime/output-profiles";
import { HEADLESS_OUTPUT_PROFILES } from "../runtime/output-profiles";
import { resolveNativeFfmpegBinaries } from "../ffmpeg/resolve-ffmpeg-binaries";
import { assertHeadlessManifestTargetCompatibility } from "../runtime/render-target";
import { resolveEffectiveWorkerLimits } from "../runtime/resolve-worker-limits";
import { resolveSystemChromeExecutable } from "../chromium/chrome-executable";
import { isAcceptedHeadlessWorkerRendererBuildId } from "../runtime/renderer-build-id";
import {
  DEFAULT_HEADLESS_WORKER_LIMITS,
  HEADLESS_WORKER_PHASE3_SUPPORTED,
  type HeadlessWorkerLimits,
} from "../runtime/worker-types";

export const CLAIMED_RENDER_DIAGNOSTIC_CAPABILITY_SUBSTAGES = Object.freeze([
  "renderer_build_id_gate",
  "resolution_format_gate",
  "fps_gate",
  "manifest_target_compatibility_gate",
  "audio_mode_gate",
  "audio_plan_gate",
  "audio_combination_gate",
  "ffmpeg_encoder_gate",
  "provider_capacity_gate",
  "source_storage_gate",
  "artifact_storage_gate",
  "browser_runtime_gate",
  "ffmpeg_runtime_gate",
  "audio_pipeline_gate",
  "workspace_contract_gate",
  "materializer_entry_gate",
] as const);

export type ClaimedRenderDiagnosticCapabilitySubstage =
  (typeof CLAIMED_RENDER_DIAGNOSTIC_CAPABILITY_SUBSTAGES)[number];

export const CLAIMED_RENDER_DIAGNOSTIC_CAPABILITY_CLASSES = Object.freeze([
  "supported",
  "unsupported",
  "not_evaluated",
  "degraded",
] as const);

export type ClaimedRenderDiagnosticCapabilityClass =
  (typeof CLAIMED_RENDER_DIAGNOSTIC_CAPABILITY_CLASSES)[number];

export const CLAIMED_RENDER_DIAGNOSTIC_CODEC_CONTAINER_CLASSES = Object.freeze([
  "webm",
  "mp4",
  "matroska",
  "unknown",
  "not_applicable",
] as const);

export type ClaimedRenderDiagnosticCodecContainerClass =
  (typeof CLAIMED_RENDER_DIAGNOSTIC_CODEC_CONTAINER_CLASSES)[number];

export const CLAIMED_RENDER_DIAGNOSTIC_VIDEO_CODEC_CLASSES = Object.freeze([
  "vp9",
  "h264",
  "unknown",
  "not_applicable",
] as const);

export type ClaimedRenderDiagnosticVideoCodecClass =
  (typeof CLAIMED_RENDER_DIAGNOSTIC_VIDEO_CODEC_CLASSES)[number];

export const CLAIMED_RENDER_DIAGNOSTIC_AUDIO_CODEC_CLASSES = Object.freeze([
  "opus",
  "aac",
  "silent",
  "unknown",
  "not_applicable",
] as const);

export type ClaimedRenderDiagnosticAudioCodecClass =
  (typeof CLAIMED_RENDER_DIAGNOSTIC_AUDIO_CODEC_CLASSES)[number];

export const CLAIMED_RENDER_DIAGNOSTIC_STORAGE_CAPABILITY_CLASSES = Object.freeze([
  "memory_owned_object",
  "memory_upload_finalize",
  "provider_bound",
  "unsupported",
  "not_evaluated",
] as const);

export type ClaimedRenderDiagnosticStorageCapabilityClass =
  (typeof CLAIMED_RENDER_DIAGNOSTIC_STORAGE_CAPABILITY_CLASSES)[number];

export const CLAIMED_RENDER_DIAGNOSTIC_RUNTIME_CAPABILITY_CLASSES = Object.freeze([
  "present",
  "missing",
  "sandbox_blocked",
  "not_evaluated",
] as const);

export type ClaimedRenderDiagnosticRuntimeCapabilityClass =
  (typeof CLAIMED_RENDER_DIAGNOSTIC_RUNTIME_CAPABILITY_CLASSES)[number];

export const CLAIMED_RENDER_DIAGNOSTIC_AUDIO_PIPELINE_CLASSES = Object.freeze([
  "silent",
  "voiceover",
  "music",
  "voiceover_music",
  "unsupported",
  "not_evaluated",
] as const);

export type ClaimedRenderDiagnosticAudioPipelineClass =
  (typeof CLAIMED_RENDER_DIAGNOSTIC_AUDIO_PIPELINE_CLASSES)[number];

export const CLAIMED_RENDER_DIAGNOSTIC_WORKSPACE_CAPABILITY_CLASSES = Object.freeze([
  "profile_bounded",
  "provider_intersected",
  "insufficient_capacity",
  "not_reached",
] as const);

export type ClaimedRenderDiagnosticWorkspaceCapabilityClass =
  (typeof CLAIMED_RENDER_DIAGNOSTIC_WORKSPACE_CAPABILITY_CLASSES)[number];

export const CLAIMED_RENDER_DIAGNOSTIC_CAPABILITY_RESULT_CLASSES = Object.freeze([
  "capability_pass",
  "unsupported_before_materialization",
  "workspace_not_reached",
  "workspace_attribution_missing",
  "materializer_entered",
  "terminal_success",
  "terminal_failure",
] as const);

export type ClaimedRenderDiagnosticCapabilityResultClass =
  (typeof CLAIMED_RENDER_DIAGNOSTIC_CAPABILITY_RESULT_CLASSES)[number];

export type ClaimedRenderDiagnosticCapabilityAttribution = {
  readonly capabilitySubstage: ClaimedRenderDiagnosticCapabilitySubstage;
  readonly capabilityClass: ClaimedRenderDiagnosticCapabilityClass;
  readonly requestedOutputContainerClass: ClaimedRenderDiagnosticCodecContainerClass;
  readonly requestedVideoCodecClass: ClaimedRenderDiagnosticVideoCodecClass;
  readonly requestedAudioCodecClass: ClaimedRenderDiagnosticAudioCodecClass;
  readonly sourceStorageCapabilityClass: ClaimedRenderDiagnosticStorageCapabilityClass;
  readonly artifactStorageCapabilityClass: ClaimedRenderDiagnosticStorageCapabilityClass;
  readonly browserRuntimeCapabilityClass: ClaimedRenderDiagnosticRuntimeCapabilityClass;
  readonly ffmpegRuntimeCapabilityClass: ClaimedRenderDiagnosticRuntimeCapabilityClass;
  readonly audioPipelineCapabilityClass: ClaimedRenderDiagnosticAudioPipelineClass;
  readonly workspaceCapabilityClass: ClaimedRenderDiagnosticWorkspaceCapabilityClass;
  readonly resultClass: ClaimedRenderDiagnosticCapabilityResultClass;
};

function classifyContainer(profile: HeadlessOutputProfile): ClaimedRenderDiagnosticCodecContainerClass {
  if (profile.container === "webm") return "webm";
  if (profile.container === "mp4") return "mp4";
  if (profile.format === "webm") return "webm";
  if (profile.format === "mp4") return "mp4";
  return "unknown";
}

function classifyVideoCodec(
  profile: HeadlessOutputProfile,
): ClaimedRenderDiagnosticVideoCodecClass {
  if (profile.videoCodec === "vp9") return "vp9";
  if (profile.videoCodec === "h264") return "h264";
  return "unknown";
}

function classifyAudioCodec(
  profile: HeadlessOutputProfile,
  combination: string | null,
): ClaimedRenderDiagnosticAudioCodecClass {
  if (combination === "silent") return "silent";
  if (profile.audioCodec === "opus") return "opus";
  if (profile.audioCodec === "aac") return "aac";
  return "not_applicable";
}

function classifyAudioPipeline(
  combination: string | null,
): ClaimedRenderDiagnosticAudioPipelineClass {
  if (combination == null) return "not_evaluated";
  if (combination === "silent") return "silent";
  if (combination === "voiceover") return "voiceover";
  if (combination === "music") return "music";
  if (combination === "voiceover+music") return "voiceover_music";
  return "unsupported";
}

function classifySourceStorage(
  storage: HeadlessStoragePort | undefined,
): ClaimedRenderDiagnosticStorageCapabilityClass {
  if (storage == null) return "not_evaluated";
  const ctor = storage.constructor?.name ?? "";
  if (ctor.includes("Memory")) return "memory_owned_object";
  return "provider_bound";
}

function baseAttribution(input: {
  readonly profile: HeadlessOutputProfile;
  readonly combination: string | null;
  readonly storage?: HeadlessStoragePort;
}): Omit<
  ClaimedRenderDiagnosticCapabilityAttribution,
  "capabilitySubstage" | "capabilityClass" | "resultClass" | "workspaceCapabilityClass"
> {
  const chrome = resolveSystemChromeExecutable();
  const ffmpeg = resolveNativeFfmpegBinaries();
  return {
    requestedOutputContainerClass: classifyContainer(input.profile),
    requestedVideoCodecClass: classifyVideoCodec(input.profile),
    requestedAudioCodecClass: classifyAudioCodec(input.profile, input.combination),
    sourceStorageCapabilityClass: classifySourceStorage(input.storage),
    artifactStorageCapabilityClass: classifySourceStorage(input.storage),
    browserRuntimeCapabilityClass: chrome.ok ? "present" : "missing",
    ffmpegRuntimeCapabilityClass: ffmpeg.ok ? "present" : "missing",
    audioPipelineCapabilityClass: classifyAudioPipeline(input.combination),
  };
}

function failAttribution(input: {
  readonly substage: ClaimedRenderDiagnosticCapabilitySubstage;
  readonly profile: HeadlessOutputProfile;
  readonly combination: string | null;
  readonly storage?: HeadlessStoragePort;
  readonly workspaceCapabilityClass?: ClaimedRenderDiagnosticWorkspaceCapabilityClass;
}): ClaimedRenderDiagnosticCapabilityAttribution {
  return {
    ...baseAttribution(input),
    capabilitySubstage: input.substage,
    capabilityClass: "unsupported",
    workspaceCapabilityClass:
      input.workspaceCapabilityClass ?? "not_reached",
    resultClass: "unsupported_before_materialization",
  };
}

function passAttribution(input: {
  readonly profile: HeadlessOutputProfile;
  readonly combination: string | null;
  readonly storage?: HeadlessStoragePort;
}): ClaimedRenderDiagnosticCapabilityAttribution {
  return {
    ...baseAttribution(input),
    capabilitySubstage: "materializer_entry_gate",
    capabilityClass: "supported",
    workspaceCapabilityClass: "provider_intersected",
    resultClass: "capability_pass",
  };
}

export function evaluateClaimedRenderDiagnosticCapabilityBoundary(input: {
  readonly request: HeadlessRenderJobRequestV1;
  readonly storage?: HeadlessStoragePort;
  readonly limitsOverrides?: Partial<HeadlessWorkerLimits>;
}):
  | {
      readonly ok: true;
      readonly attribution: ClaimedRenderDiagnosticCapabilityAttribution;
      readonly limits: HeadlessWorkerLimits;
    }
  | {
      readonly ok: false;
      readonly reasonId: "UNSUPPORTED_CAPABILITY";
      readonly attribution: ClaimedRenderDiagnosticCapabilityAttribution;
    } {
  const profile = input.request.rendererProfile;
  const manifest = input.request.manifest;
  const targetResolved = assertHeadlessManifestTargetCompatibility({
    manifest,
    rendererProfile: profile,
  });
  const fallbackProfile: HeadlessOutputProfile =
    HEADLESS_OUTPUT_PROFILES["720p-webm-30"];
  const audioPlanEarly = buildHeadlessAudioPlan(manifest);
  const combination = audioPlanEarly.ok ? audioPlanEarly.plan.combination : null;

  const profileForAttribution = (): HeadlessOutputProfile =>
    targetResolved.ok ? targetResolved.target.profile : fallbackProfile;

  if (!isAcceptedHeadlessWorkerRendererBuildId(input.request.rendererBuildId)) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      attribution: failAttribution({
        substage: "renderer_build_id_gate",
        profile: profileForAttribution(),
        combination,
        storage: input.storage,
      }),
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
      attribution: failAttribution({
        substage: "resolution_format_gate",
        profile: profileForAttribution(),
        combination,
        storage: input.storage,
      }),
    };
  }

  if (profile.fps !== 30 || manifest.output.fps !== 30) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      attribution: failAttribution({
        substage: "fps_gate",
        profile: profileForAttribution(),
        combination,
        storage: input.storage,
      }),
    };
  }

  if (!targetResolved.ok) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      attribution: failAttribution({
        substage: "manifest_target_compatibility_gate",
        profile: profileForAttribution(),
        combination,
        storage: input.storage,
      }),
    };
  }

  const outputProfile = targetResolved.target.profile;

  if (
    !(HEADLESS_WORKER_PHASE3_SUPPORTED.audioModes as readonly string[]).includes(
      manifest.audio.mode,
    )
  ) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      attribution: failAttribution({
        substage: "audio_mode_gate",
        profile: outputProfile,
        combination,
        storage: input.storage,
      }),
    };
  }

  if (!audioPlanEarly.ok) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      attribution: failAttribution({
        substage: "audio_plan_gate",
        profile: outputProfile,
        combination,
        storage: input.storage,
      }),
    };
  }

  if (
    !(
      HEADLESS_WORKER_PHASE3_SUPPORTED.audioCombinations as readonly string[]
    ).includes(audioPlanEarly.plan.combination)
  ) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      attribution: failAttribution({
        substage: "audio_combination_gate",
        profile: outputProfile,
        combination: audioPlanEarly.plan.combination,
        storage: input.storage,
      }),
    };
  }

  const ffmpegBins = resolveNativeFfmpegBinaries();
  const encoderCheck = assertOutputProfileEncoders({
    outputProfile: outputProfile,
    ffmpegExecutable: ffmpegBins.ok ? ffmpegBins.ffmpegExecutable : undefined,
  });
  if (encoderCheck) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      attribution: failAttribution({
        substage: ffmpegBins.ok ? "ffmpeg_encoder_gate" : "ffmpeg_runtime_gate",
        profile: outputProfile,
        combination: audioPlanEarly.plan.combination,
        storage: input.storage,
      }),
    };
  }

  const chrome = resolveSystemChromeExecutable();
  if (!chrome.ok) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      attribution: failAttribution({
        substage: "browser_runtime_gate",
        profile: outputProfile,
        combination: audioPlanEarly.plan.combination,
        storage: input.storage,
      }),
    };
  }

  if (input.storage != null) {
    const sourceClass = classifySourceStorage(input.storage);
    if (sourceClass === "unsupported") {
      return {
        ok: false,
        reasonId: "UNSUPPORTED_CAPABILITY",
        attribution: failAttribution({
          substage: "source_storage_gate",
          profile: outputProfile,
          combination: audioPlanEarly.plan.combination,
          storage: input.storage,
        }),
      };
    }
  }

  const resolvedLimits = resolveEffectiveWorkerLimits({
    profile: outputProfile,
    overrides: {
      jobTimeoutMs: 120_000,
      ...input.limitsOverrides,
    },
    defaults: DEFAULT_HEADLESS_WORKER_LIMITS,
  });
  if (!resolvedLimits.ok) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      attribution: failAttribution({
        substage: "provider_capacity_gate",
        profile: outputProfile,
        combination: audioPlanEarly.plan.combination,
        storage: input.storage,
        workspaceCapabilityClass: "insufficient_capacity",
      }),
    };
  }

  const phase3 = assertPhase3WorkerCapability({
    request: input.request,
    ffmpegExecutable: ffmpegBins.ok ? ffmpegBins.ffmpegExecutable : undefined,
  });
  if (phase3) {
    return {
      ok: false,
      reasonId: "UNSUPPORTED_CAPABILITY",
      attribution: failAttribution({
        substage: "workspace_contract_gate",
        profile: outputProfile,
        combination: audioPlanEarly.plan.combination,
        storage: input.storage,
      }),
    };
  }

  return {
    ok: true,
    limits: resolvedLimits.limits,
    attribution: passAttribution({
      profile: outputProfile,
      combination: audioPlanEarly.plan.combination,
      storage: input.storage,
    }),
  };
}

export function capabilityAttributionToSafeFacts(
  attribution: ClaimedRenderDiagnosticCapabilityAttribution,
): Record<string, string> {
  return Object.freeze({
    capability_substage: attribution.capabilitySubstage,
    capability_class: attribution.capabilityClass,
    requested_output_container_class: attribution.requestedOutputContainerClass,
    requested_video_codec_class: attribution.requestedVideoCodecClass,
    requested_audio_codec_class: attribution.requestedAudioCodecClass,
    source_storage_capability_class: attribution.sourceStorageCapabilityClass,
    artifact_storage_capability_class: attribution.artifactStorageCapabilityClass,
    browser_runtime_capability_class: attribution.browserRuntimeCapabilityClass,
    ffmpeg_runtime_capability_class: attribution.ffmpegRuntimeCapabilityClass,
    audio_pipeline_capability_class: attribution.audioPipelineCapabilityClass,
    workspace_capability_class: attribution.workspaceCapabilityClass,
    result_class: attribution.resultClass,
  });
}

const EXECUTION_SUBSTAGES_AFTER_MATERIALIZER = Object.freeze([
  "source_binding_resolution",
  "workspace_prepare",
  "chromium_preflight",
  "chromium_launch",
  "browser_context_create",
  "page_create",
  "page_navigation_or_content_load",
  "page_bundle_injection",
  "page_contract_ready",
  "page_request_submit",
  "page_response_wait",
  "page_response_validate",
  "page_cleanup",
  "ffmpeg_preflight",
  "ffmpeg_execution",
  "artifact_upload",
  "artifact_finalize",
] as const);

export function inferMaterializerEntered(input: {
  readonly executedOk: boolean;
  readonly reasonId: string | null;
  readonly executionSubstage: string | null;
  readonly hasPageWorkspaceAttribution: boolean;
  readonly capabilityPreflightPassed: boolean;
}): boolean {
  if (!input.capabilityPreflightPassed) return false;
  if (input.executedOk) return true;
  if (input.hasPageWorkspaceAttribution) return true;
  if (
    input.executionSubstage != null &&
    (EXECUTION_SUBSTAGES_AFTER_MATERIALIZER as readonly string[]).includes(
      input.executionSubstage,
    )
  ) {
    return true;
  }
  if (input.reasonId === "UNSUPPORTED_CAPABILITY") return false;
  return false;
}

export function assertCapabilityReachabilityInvariant(input: {
  readonly boundaryPresence: Readonly<
    Record<string, "observed" | "not_observed" | "not_applicable">
  >;
}): { readonly ok: true } | { readonly ok: false; readonly reasonId: string } {
  const materializerEntered =
    input.boundaryPresence.materializer_entered === "observed";
  const pageLifecycleIds = [
    "page_navigation_started",
    "page_script_loaded",
    "contract_globals_observed",
    "bootstrap_invoked",
    "frame_requested",
  ] as const;
  if (!materializerEntered) {
    for (const id of pageLifecycleIds) {
      if (input.boundaryPresence[id] === "observed") {
        return { ok: false, reasonId: "page_lifecycle_without_materializer" };
      }
    }
  }
  return { ok: true };
}

export function classifyWorkspaceAttributionResult(input: {
  readonly materializerEntered: boolean;
  readonly workspaceClassificationCount: number;
  readonly attributionComplete: boolean;
}): ClaimedRenderDiagnosticCapabilityResultClass {
  if (!input.materializerEntered) {
    return "workspace_not_reached";
  }
  if (input.workspaceClassificationCount === 0) {
    return "workspace_attribution_missing";
  }
  if (!input.attributionComplete) {
    return "workspace_attribution_missing";
  }
  return "materializer_entered";
}
