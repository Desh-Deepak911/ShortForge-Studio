/**
 * Build FFmpeg filter_complex fragments from a validated HeadlessAudioPlan only.
 * Timing literals come exclusively from plan fields — never raw manifest.
 */

import { EXPORT_FFMPEG_PEAK_LIMITER_FILTER } from "@/features/audio-mixer/audio-mixer.peak-protection.utils";
import { assertExportDoesNotApplyVoiceSpeed } from "@/features/export/audio";
import { EXPORT_FFMPEG_AUDIO_FORMAT_FILTERS } from "@/features/export/utils/export-background-music.utils";
import {
  resolveExportMusicEnvelopeGainAtSec,
  type ExportMusicEnvelopeInput,
} from "@/features/export/utils/export-music-envelope.utils";

import type {
  HeadlessAudioPlan,
  HeadlessMusicPlan,
  HeadlessVoiceoverPlan,
} from "./audio-plan.types";

function formatSec(ms: number): string {
  return (ms / 1000).toFixed(3);
}

function formatGain(gain: number): string {
  return gain.toFixed(4);
}

function musicEnvelopeInput(music: HeadlessMusicPlan): ExportMusicEnvelopeInput {
  return {
    exportDurationMs: music.loopUntilOutputMs,
    musicGain: music.volumeGain,
    fadeIn: music.fadeInMs > 0,
    fadeOut: music.fadeOutMs > 0,
    fadeInSec: music.fadeInMs / 1000,
    fadeOutSec: music.fadeOutMs / 1000,
    duckingEnabled: music.applyDucking,
    duckingStrength:
      music.volumeGain > 0 ? music.duckedVolumeGain / music.volumeGain : 0,
    voiceoverDurationSec: music.duckUntilMs / 1000,
    applyDucking: music.applyDucking,
  };
}

/**
 * Closed-form FFmpeg volume expression matching
 * `resolveExportMusicEnvelopeGainAtSec` algebra.
 */
export function buildMusicVolumeExpression(music: HeadlessMusicPlan): string {
  const full = formatGain(music.volumeGain);
  const ducked = formatGain(music.duckedVolumeGain);
  const durationSec = formatSec(music.loopUntilOutputMs);
  const voiceDur = formatSec(music.duckUntilMs);
  const fadeInSec = formatSec(music.fadeInMs);
  const fadeOutSec = formatSec(music.fadeOutMs);

  const base =
    music.applyDucking && music.duckUntilMs > 0
      ? `if(lt(t\\,${voiceDur})\\,${ducked}\\,${full})`
      : full;

  const fadeIn =
    music.fadeInMs > 0
      ? `*if(lt(t\\,${fadeInSec})\\,t/${fadeInSec}\\,1)`
      : "";

  const fadeOutStartMs = music.loopUntilOutputMs - music.fadeOutMs;
  const fadeOut =
    music.fadeOutMs > 0 && fadeOutStartMs > 0
      ? `*if(gt(t\\,${formatSec(fadeOutStartMs)})\\,(${durationSec}-t)/${fadeOutSec}\\,1)`
      : "";

  return `${base}${fadeIn}${fadeOut}`;
}

/** Sample canonical envelope at a checkpoint (for parity fixtures). */
export function sampleHeadlessMusicEnvelopeGain(
  music: HeadlessMusicPlan,
  timeSec: number,
): number {
  return resolveExportMusicEnvelopeGainAtSec(musicEnvelopeInput(music), timeSec);
}

function buildVoiceFilterChain(
  inputIndex: number,
  voice: HeadlessVoiceoverPlan,
  outputDurationMs: number,
): string {
  const trimStart = formatSec(voice.sourceTrimStartMs);
  const trimEnd = formatSec(voice.sourceTrimEndMs);
  const outDur = formatSec(outputDurationMs);
  const gain = formatGain(voice.volumeGain);
  const filters: string[] = [
    ...EXPORT_FFMPEG_AUDIO_FORMAT_FILTERS,
    `atrim=${trimStart}:${trimEnd}`,
    "asetpts=PTS-STARTPTS",
  ];
  if (voice.requireDelayMs > 0) {
    // adelay is milliseconds per channel for stereo.
    const d = Math.round(voice.requireDelayMs);
    filters.push(`adelay=${d}|${d}`);
  }
  filters.push(`apad=whole_dur=${outDur}`);
  filters.push(`atrim=0:${outDur}`);
  filters.push(`volume=${gain}`);
  return `[${inputIndex}:a]${filters.join(",")}[voice]`;
}

function buildMusicFilterChain(
  inputIndex: number,
  music: HeadlessMusicPlan,
): string {
  const loopEnd = formatSec(music.loopUntilOutputMs);
  const expr = buildMusicVolumeExpression(music);
  const filters: string[] = [
    ...EXPORT_FFMPEG_AUDIO_FORMAT_FILTERS,
  ];
  if (music.looping) {
    filters.push("aloop=loop=-1:size=2e+09");
  }
  filters.push(`atrim=0:${loopEnd}`);
  filters.push("asetpts=PTS-STARTPTS");
  if (music.requireDelayMs > 0) {
    const d = Math.round(music.requireDelayMs);
    filters.push(`adelay=${d}|${d}`);
    // After delay, hard-cap to loop end on the output timeline.
    filters.push(`apad=whole_dur=${loopEnd}`);
    filters.push(`atrim=0:${loopEnd}`);
  }
  filters.push(`volume='${expr}':eval=frame`);
  return `[${inputIndex}:a]${filters.join(",")}[music]`;
}

export interface HeadlessAudioFilterBuild {
  readonly filterComplex: string | null;
  /** Output label mapped with `-map` when non-null. */
  readonly audioMapLabel: string | null;
}

export function buildHeadlessAudioFilterComplex(input: {
  plan: HeadlessAudioPlan;
  /** FFmpeg input index for voiceover file, or null. */
  voiceInputIndex: number | null;
  /** FFmpeg input index for music file, or null. */
  musicInputIndex: number | null;
}):
  | { readonly ok: true; readonly build: HeadlessAudioFilterBuild }
  | { readonly ok: false; readonly message: string } {
  const { plan, voiceInputIndex, musicInputIndex } = input;

  if (plan.combination === "silent") {
    if (voiceInputIndex != null || musicInputIndex != null) {
      return { ok: false, message: "Silent plan must not bind audio inputs." };
    }
    return {
      ok: true,
      build: { filterComplex: null, audioMapLabel: null },
    };
  }

  if (plan.voiceover) {
    const v = plan.voiceover;
    if (
      v.sourceTrimEndMs < v.sourceTrimStartMs ||
      v.requireDelayMs !== v.timelineStartMs ||
      v.padToOutputMs !==
        Math.max(
          0,
          plan.outputDurationMs -
            (v.sourceTrimEndMs - v.sourceTrimStartMs) -
            v.requireDelayMs,
        )
    ) {
      return { ok: false, message: "Voiceover plan timing inconsistent." };
    }
  }

  if (plan.music) {
    const m = plan.music;
    if (
      m.requireDelayMs !== m.timelineStartMs ||
      m.loopUntilOutputMs !== plan.outputDurationMs
    ) {
      return { ok: false, message: "Music plan timing inconsistent." };
    }
  }

  const parts: string[] = [];

  if (plan.voiceover && voiceInputIndex != null) {
    parts.push(
      buildVoiceFilterChain(
        voiceInputIndex,
        plan.voiceover,
        plan.outputDurationMs,
      ),
    );
  } else if (plan.voiceover) {
    return { ok: false, message: "Voiceover plan missing input index." };
  }

  if (plan.music && musicInputIndex != null) {
    parts.push(buildMusicFilterChain(musicInputIndex, plan.music));
  } else if (plan.music) {
    return { ok: false, message: "Music plan missing input index." };
  }

  let mixedLabel: string;
  if (plan.combination === "voiceover+music") {
    parts.push(
      "[voice][music]amix=inputs=2:duration=first:dropout_transition=0,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[mixed]",
    );
    mixedLabel = "mixed";
  } else if (plan.combination === "voiceover") {
    mixedLabel = "voice";
  } else if (plan.combination === "music") {
    mixedLabel = "music";
  } else {
    return { ok: false, message: "Unexpected combination." };
  }

  let audioMapLabel = mixedLabel;
  if (plan.applyPeakProtection) {
    parts.push(`[${mixedLabel}]${EXPORT_FFMPEG_PEAK_LIMITER_FILTER}[aout]`);
    audioMapLabel = "aout";
  } else {
    parts.push(`[${mixedLabel}]anull[aout]`);
    audioMapLabel = "aout";
  }

  const filterComplex = parts.join(";");
  try {
    assertExportDoesNotApplyVoiceSpeed([filterComplex]);
  } catch {
    return { ok: false, message: "Voice-speed filters forbidden." };
  }

  // Guard: no output-duration atrim on voice that bypasses source trim.
  if (
    plan.voiceover &&
    filterComplex.includes(
      `atrim=0:${formatSec(plan.outputDurationMs)},apad`,
    )
  ) {
    return { ok: false, message: "Voice filter must trim source before pad." };
  }

  return {
    ok: true,
    build: { filterComplex, audioMapLabel },
  };
}
