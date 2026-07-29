/**
 * Resolve normalized export audio mix plan from frozen ExportManifest (Sprint 11E 2G.24D).
 */

import {
  EXPORT_VOICEOVER_OVERRUN_TOLERANCE_MS,
} from "./export-audio.types";
import {
  resolveExportAudioEndPolicy,
} from "./resolve-export-audio-end-policy";
import { resolveClampedMusicFadeMs } from "./build-export-audio-filter";
import type { ExportManifest } from "@/features/export/domain/export-manifest.types";
import { resolveExportDuckedMusicGain } from "@/features/export/utils/export-background-music.utils";

import type {
  ExportAudioMixCombination,
  ExportAudioMixMusicPlan,
  ExportAudioMixPlan,
  ExportAudioMixVoicePlan,
} from "./export-audio-mix-plan.types";
import {
  EXPORT_AUDIO_MIX_TARGET_CHANNELS,
  EXPORT_AUDIO_MIX_TARGET_SAMPLE_RATE_HZ,
} from "./export-audio-mix-plan.types";

const MAX_STEM_GAIN = 4;
const MAX_RENDER_DURATION_MS = 10 * 60 * 1000;

export type ResolveExportAudioMixPlanResult =
  | { readonly ok: true; readonly plan: ExportAudioMixPlan }
  | { readonly ok: false; readonly message: string };

function isFiniteNonNeg(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isBoundedGain(value: unknown): value is number {
  return isFiniteNonNeg(value) && value <= MAX_STEM_GAIN;
}

function combinationFor(
  hasVoice: boolean,
  hasMusic: boolean,
): ExportAudioMixCombination {
  if (hasVoice && hasMusic) return "voiceover+music";
  if (hasVoice) return "voiceover";
  if (hasMusic) return "music";
  return "silent";
}

export function resolveExportAudioMixPlan(
  manifest: ExportManifest,
): ResolveExportAudioMixPlanResult {
  const mode = manifest.audio.mode;
  if (mode !== "silent" && mode !== "voice" && mode !== "voice-with-music") {
    return { ok: false, message: "Unsupported audio mode." };
  }

  const outputDurationMs = manifest.project.renderDurationMs;
  if (
    !Number.isInteger(outputDurationMs) ||
    outputDurationMs < 1 ||
    outputDurationMs > MAX_RENDER_DURATION_MS
  ) {
    return { ok: false, message: "Invalid render duration." };
  }

  const endPolicy = resolveExportAudioEndPolicy(manifest);
  if (endPolicy.voiceover.action === "block") {
    return { ok: false, message: "Voiceover end policy blocked." };
  }

  const wantVoice = mode === "voice" || mode === "voice-with-music";
  const wantMusic = mode === "voice-with-music";

  let voiceover: ExportAudioMixVoicePlan | null = null;
  if (wantVoice) {
    const voice = manifest.audio.voiceover;
    if (!voice?.source?.trim()) {
      return { ok: false, message: "Voice mode requires voiceover source." };
    }
    if (
      !isFiniteNonNeg(voice.durationMs) ||
      !Number.isInteger(voice.durationMs) ||
      voice.durationMs < 1
    ) {
      return { ok: false, message: "Invalid voiceover durationMs." };
    }
    if (
      voice.durationMs >
      outputDurationMs + EXPORT_VOICEOVER_OVERRUN_TOLERANCE_MS
    ) {
      return { ok: false, message: "Voiceover overrun beyond tolerance." };
    }
    if (!isBoundedGain(voice.volume)) {
      return { ok: false, message: "Invalid voiceover volume." };
    }

    const sourceTrimStartMs = 0;
    const sourceTrimEndMs = Math.min(voice.durationMs, outputDurationMs);
    const timelineStartMs = 0;
    const requireDelayMs = timelineStartMs;
    const padToOutputMs = Math.max(
      0,
      outputDurationMs - (sourceTrimEndMs - sourceTrimStartMs) - requireDelayMs,
    );
    voiceover = {
      sourceTrimStartMs,
      sourceTrimEndMs,
      timelineStartMs,
      requireDelayMs,
      sourceDurationMs: voice.durationMs,
      volumeGain: voice.volume,
      padToOutputMs,
    };
  }

  let music: ExportAudioMixMusicPlan | null = null;
  if (wantMusic) {
    const track = manifest.audio.music;
    if (!track?.source?.trim()) {
      return { ok: false, message: "Voice-with-music requires music source." };
    }
    if (track.looping !== true) {
      return { ok: false, message: "Music looping must be true." };
    }
    if (!isBoundedGain(track.volume)) {
      return { ok: false, message: "Invalid music volume." };
    }

    const fadeInMs = resolveClampedMusicFadeMs(track.fadeInMs, outputDurationMs);
    const fadeOutMs = resolveClampedMusicFadeMs(track.fadeOutMs, outputDurationMs);
    const voiceMs = voiceover?.sourceDurationMs ?? 0;
    const applyDucking =
      Boolean(voiceover) && track.duckingEnabled && voiceMs > 0;
    const duckedVolumeGain = applyDucking
      ? resolveExportDuckedMusicGain(track.volume, track.duckingStrength)
      : track.volume;

    music = {
      timelineStartMs: 0,
      requireDelayMs: 0,
      looping: true,
      loopUntilOutputMs: outputDurationMs,
      volumeGain: track.volume,
      duckedVolumeGain,
      applyDucking,
      duckUntilMs: applyDucking ? voiceMs : 0,
      fadeInMs,
      fadeOutMs,
    };
  }

  const combination = combinationFor(voiceover != null, music != null);

  return {
    ok: true,
    plan: {
      combination,
      outputDurationMs,
      outputDurationSec: outputDurationMs / 1000,
      sampleRateHz: EXPORT_AUDIO_MIX_TARGET_SAMPLE_RATE_HZ,
      channels: EXPORT_AUDIO_MIX_TARGET_CHANNELS,
      applyPeakProtection: manifest.audio.applyPeakProtection,
      limiterRequired: manifest.audio.applyPeakProtection,
      mixOrder: "amix-voice-first-duration-first",
      voiceover,
      music,
      captionsAffectMix: false,
    },
  };
}
