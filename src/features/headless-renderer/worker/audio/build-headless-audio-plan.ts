/**
 * Pure audio-plan builder from canonical ExportManifest only.
 * Rejects incomplete/malformed contracts before Chromium.
 */

import {
  EXPORT_VOICEOVER_OVERRUN_TOLERANCE_MS,
  resolveClampedMusicFadeMs,
  resolveExportAudioEndPolicy,
} from "@/features/export/audio";
import type { ExportManifest } from "@/features/export/domain/headless-safe";
import { resolveExportDuckedMusicGain } from "@/features/export/utils/export-background-music.utils";

import {
  HEADLESS_AUDIO_OUTPUT_CODEC,
  HEADLESS_AUDIO_TARGET_CHANNELS,
  HEADLESS_AUDIO_TARGET_SAMPLE_RATE_HZ,
  type HeadlessAudioCombination,
  type HeadlessAudioMixPolicy,
  type HeadlessAudioPlan,
  type HeadlessMusicPlan,
  type HeadlessVoiceoverPlan,
} from "./audio-plan.types";

/** Stem gain ceiling: MAX_MIX_VOLUME² (bus × master). */
const MAX_STEM_GAIN = 4;
const MAX_RENDER_DURATION_MS = 10 * 60 * 1000;

function isFiniteNonNeg(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isBoundedGain(value: unknown): value is number {
  return isFiniteNonNeg(value) && value <= MAX_STEM_GAIN;
}

function isBoundedDucking(value: unknown): value is number {
  return isFiniteNonNeg(value) && value <= 1;
}

function combinationFor(
  hasVoice: boolean,
  hasMusic: boolean,
): HeadlessAudioCombination {
  if (hasVoice && hasMusic) return "voiceover+music";
  if (hasVoice) return "voiceover";
  if (hasMusic) return "music";
  return "silent";
}

function mixPolicyFor(
  combination: HeadlessAudioCombination,
): HeadlessAudioMixPolicy {
  switch (combination) {
    case "silent":
      return "none";
    case "voiceover":
      return "voice-only";
    case "music":
      return "music-only";
    case "voiceover+music":
      return "amix-voice-music";
  }
}

export type BuildHeadlessAudioPlanResult =
  | { readonly ok: true; readonly plan: HeadlessAudioPlan }
  | { readonly ok: false; readonly message: string; readonly reason: "malformed" | "unsupported" };

/**
 * Build a validated audio plan from the frozen manifest.
 * Does not resolve file paths — callers bind owned local paths separately.
 */
export function buildHeadlessAudioPlan(
  manifest: ExportManifest,
): BuildHeadlessAudioPlanResult {
  const mode = manifest.audio.mode;
  if (mode !== "silent" && mode !== "voice" && mode !== "voice-with-music") {
    return { ok: false, message: "Unsupported audio mode.", reason: "unsupported" };
  }

  const outputDurationMs = manifest.project.renderDurationMs;
  if (
    !Number.isInteger(outputDurationMs) ||
    outputDurationMs < 1 ||
    outputDurationMs > MAX_RENDER_DURATION_MS
  ) {
    return {
      ok: false,
      message: "Invalid render duration.",
      reason: "malformed",
    };
  }

  if (manifest.audio.sourceVideoAudioPolicy !== "muted") {
    return {
      ok: false,
      message: "Source video audio must remain muted.",
      reason: "malformed",
    };
  }

  if (typeof manifest.audio.applyPeakProtection !== "boolean") {
    return {
      ok: false,
      message: "Missing applyPeakProtection.",
      reason: "malformed",
    };
  }

  const endPolicy = resolveExportAudioEndPolicy(manifest);
  if (endPolicy.voiceover.action === "block") {
    return {
      ok: false,
      message: "Voiceover end policy blocked.",
      reason: "malformed",
    };
  }

  const wantVoice = mode === "voice" || mode === "voice-with-music";
  const wantMusic = mode === "voice-with-music";

  let voiceover: HeadlessVoiceoverPlan | null = null;
  if (wantVoice) {
    const voice = manifest.audio.voiceover;
    if (!voice?.source?.trim()) {
      return {
        ok: false,
        message: "Voice mode requires voiceover source.",
        reason: "malformed",
      };
    }
    if (
      !isFiniteNonNeg(voice.durationMs) ||
      !Number.isInteger(voice.durationMs) ||
      voice.durationMs < 1
    ) {
      return {
        ok: false,
        message: "Invalid voiceover durationMs.",
        reason: "malformed",
      };
    }
    if (
      voice.durationMs >
      outputDurationMs + EXPORT_VOICEOVER_OVERRUN_TOLERANCE_MS
    ) {
      return {
        ok: false,
        message: "Voiceover overrun beyond tolerance.",
        reason: "malformed",
      };
    }
    if (!isBoundedGain(voice.volume)) {
      return {
        ok: false,
        message: "Invalid voiceover volume.",
        reason: "malformed",
      };
    }
    if (voice.generatedPlaybackRate !== 1) {
      return {
        ok: false,
        message: "generatedPlaybackRate must be 1.",
        reason: "malformed",
      };
    }
    if (!isFiniteNonNeg(voice.sourceVoiceSpeed)) {
      return {
        ok: false,
        message: "Invalid sourceVoiceSpeed.",
        reason: "malformed",
      };
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
  } else if (manifest.audio.voiceover != null) {
    return {
      ok: false,
      message: "Unexpected voiceover on silent mode.",
      reason: "malformed",
    };
  }

  let music: HeadlessMusicPlan | null = null;
  if (wantMusic) {
    const track = manifest.audio.music;
    if (!track?.source?.trim()) {
      return {
        ok: false,
        message: "Voice-with-music requires music source.",
        reason: "malformed",
      };
    }
    if (track.looping !== true) {
      return {
        ok: false,
        message: "Music looping must be true.",
        reason: "malformed",
      };
    }
    if (!isBoundedGain(track.volume)) {
      return {
        ok: false,
        message: "Invalid music volume.",
        reason: "malformed",
      };
    }
    if (typeof track.duckingEnabled !== "boolean") {
      return {
        ok: false,
        message: "Invalid duckingEnabled.",
        reason: "malformed",
      };
    }
    if (!isBoundedDucking(track.duckingStrength)) {
      return {
        ok: false,
        message: "Invalid duckingStrength.",
        reason: "malformed",
      };
    }
    if (!isFiniteNonNeg(track.fadeInMs) || !isFiniteNonNeg(track.fadeOutMs)) {
      return {
        ok: false,
        message: "Invalid music fades.",
        reason: "malformed",
      };
    }

    const fadeInMs = resolveClampedMusicFadeMs(track.fadeInMs, outputDurationMs);
    const fadeOutMs = resolveClampedMusicFadeMs(track.fadeOutMs, outputDurationMs);
    const voiceMs = voiceover?.sourceDurationMs ?? 0;
    const applyDucking =
      Boolean(voiceover) && track.duckingEnabled && voiceMs > 0;
    const duckedVolumeGain = applyDucking
      ? resolveExportDuckedMusicGain(track.volume, track.duckingStrength)
      : track.volume;

    if (!isBoundedGain(duckedVolumeGain)) {
      return {
        ok: false,
        message: "Invalid ducked music gain.",
        reason: "malformed",
      };
    }

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
  } else if (manifest.audio.music != null && mode === "silent") {
    return {
      ok: false,
      message: "Unexpected music on silent mode.",
      reason: "malformed",
    };
  } else if (manifest.audio.music != null && mode === "voice") {
    // Frozen freeze path may attach null music only; stray music on voice is malformed.
    return {
      ok: false,
      message: "Unexpected music on voice-only mode.",
      reason: "malformed",
    };
  }

  const combination = combinationFor(voiceover != null, music != null);
  if (mode === "silent" && combination !== "silent") {
    return { ok: false, message: "Silent mode contract mismatch.", reason: "malformed" };
  }
  if (mode === "voice" && combination !== "voiceover") {
    return { ok: false, message: "Voice mode contract mismatch.", reason: "malformed" };
  }
  if (mode === "voice-with-music" && combination !== "voiceover+music") {
    return {
      ok: false,
      message: "Voice-with-music contract mismatch.",
      reason: "malformed",
    };
  }

  return {
    ok: true,
    plan: {
      combination,
      mixPolicy: mixPolicyFor(combination),
      outputDurationMs,
      outputDurationSec: outputDurationMs / 1000,
      sampleRateHz: HEADLESS_AUDIO_TARGET_SAMPLE_RATE_HZ,
      channels: HEADLESS_AUDIO_TARGET_CHANNELS,
      outputCodec: HEADLESS_AUDIO_OUTPUT_CODEC,
      applyPeakProtection: manifest.audio.applyPeakProtection,
      voiceover,
      music,
      captionsAffectMix: false,
    },
  };
}

/**
 * Construct a music-only plan for unit mux coverage.
 * Not produced by frozen ExportManifest modes — fixtures only.
 */
export function buildMusicOnlyAudioPlanForFixture(input: {
  outputDurationMs: number;
  volumeGain: number;
  duckedVolumeGain?: number;
  applyDucking?: boolean;
  duckUntilMs?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  applyPeakProtection?: boolean;
}): BuildHeadlessAudioPlanResult {
  const outputDurationMs = input.outputDurationMs;
  if (
    !Number.isInteger(outputDurationMs) ||
    outputDurationMs < 1 ||
    outputDurationMs > MAX_RENDER_DURATION_MS
  ) {
    return { ok: false, message: "Invalid render duration.", reason: "malformed" };
  }
  if (!isBoundedGain(input.volumeGain)) {
    return { ok: false, message: "Invalid music volume.", reason: "malformed" };
  }
  const fadeInMs = resolveClampedMusicFadeMs(input.fadeInMs ?? 0, outputDurationMs);
  const fadeOutMs = resolveClampedMusicFadeMs(input.fadeOutMs ?? 0, outputDurationMs);
  const applyDucking = input.applyDucking === true;
  const ducked = input.duckedVolumeGain ?? input.volumeGain;
  if (!isBoundedGain(ducked)) {
    return { ok: false, message: "Invalid ducked gain.", reason: "malformed" };
  }

  const music: HeadlessMusicPlan = {
    timelineStartMs: 0,
    requireDelayMs: 0,
    looping: true,
    loopUntilOutputMs: outputDurationMs,
    volumeGain: input.volumeGain,
    duckedVolumeGain: ducked,
    applyDucking,
    duckUntilMs: applyDucking ? Math.max(0, input.duckUntilMs ?? 0) : 0,
    fadeInMs,
    fadeOutMs,
  };

  return {
    ok: true,
    plan: {
      combination: "music",
      mixPolicy: "music-only",
      outputDurationMs,
      outputDurationSec: outputDurationMs / 1000,
      sampleRateHz: HEADLESS_AUDIO_TARGET_SAMPLE_RATE_HZ,
      channels: HEADLESS_AUDIO_TARGET_CHANNELS,
      outputCodec: HEADLESS_AUDIO_OUTPUT_CODEC,
      applyPeakProtection: input.applyPeakProtection === true,
      voiceover: null,
      music,
      captionsAffectMix: false,
    },
  };
}
