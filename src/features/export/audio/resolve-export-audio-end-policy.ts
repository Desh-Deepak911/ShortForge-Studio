/**
 * Canonical audio end policy vs manifest.project.renderDurationMs (Sprint 6E).
 */

import type { ExportManifest } from "@/features/export/domain/export-manifest.types";
import { resolveExportRenderEndMs } from "@/features/export/timing";

import {
  EXPORT_VOICEOVER_OVERRUN_TOLERANCE_MS,
  type ExportAudioEndPolicy,
  type ProbedExportAudioDurations,
} from "./export-audio.types";

/**
 * Resolve pad/trim/loop/block decisions for voice and music.
 * Project end is always manifest.project.renderDurationMs.
 */
export function resolveExportAudioEndPolicy(
  manifest: ExportManifest,
  probed: ProbedExportAudioDurations = {
    voiceoverProbeMs: null,
    musicProbeMs: null,
  },
): ExportAudioEndPolicy {
  const projectEndMs = resolveExportRenderEndMs(manifest);
  const mode = manifest.audio.mode;

  const voiceDurationMs =
    probed.voiceoverProbeMs ??
    manifest.audio.voiceover?.durationMs ??
    null;

  let voiceover: ExportAudioEndPolicy["voiceover"] = { action: "none" };
  if (mode === "voice" || mode === "voice-with-music") {
    if (voiceDurationMs == null || voiceDurationMs <= 0) {
      voiceover = {
        action: "block",
        detail: "Voice mode requires a measurable voiceover duration.",
      };
    } else if (voiceDurationMs + EXPORT_VOICEOVER_OVERRUN_TOLERANCE_MS < projectEndMs) {
      voiceover = {
        action: "pad",
        padDurationMs: projectEndMs - voiceDurationMs,
        detail: "Voice ends before project end — pad with silence.",
      };
    } else if (voiceDurationMs > projectEndMs + EXPORT_VOICEOVER_OVERRUN_TOLERANCE_MS) {
      voiceover = {
        action: "block",
        detail:
          "Voiceover is longer than the project timeline beyond tolerance. Rebuild voiceover or adjust scene timing.",
      };
    } else {
      voiceover = {
        action: "none",
        detail: "Voiceover fits within project end tolerance.",
      };
    }
  }

  let music: ExportAudioEndPolicy["music"] = { action: "none" };
  if (mode === "voice-with-music" && manifest.audio.music) {
    const looping = manifest.audio.music.looping;
    // Music duration is not on the frozen music manifest — probe optional.
    const musicDurationMs = probed.musicProbeMs;

    if (looping) {
      music = {
        action: "loop-and-trim",
        detail: "Loop music input and trim to project end (never loop mixed output).",
      };
    } else if (musicDurationMs != null && musicDurationMs < projectEndMs) {
      music = {
        action: "pad",
        detail: "Music shorter than project — end naturally then silence.",
      };
    } else {
      music = {
        action: "trim",
        detail: "Trim music to project end with fade-out anchored to project end.",
      };
    }
  }

  return {
    projectEndMs,
    voiceover,
    music,
  };
}

/** Assert Model A: export must never apply voice speed filters. */
export function assertExportDoesNotApplyVoiceSpeed(args: readonly string[]): void {
  const joined = args.join(" ");
  if (/\batempo=/.test(joined) || /\basetrate=/.test(joined)) {
    throw new Error(
      "Export must not apply voice speed (Model A: speed is baked into TTS audio).",
    );
  }
}

export function assertFilterGraphForbidsVoiceSpeed(
  filterComplex: string,
): void {
  if (/\batempo=/.test(filterComplex) || /\basetrate=/.test(filterComplex)) {
    throw new Error(
      "Export audio filter graph must not apply voice speed (Model A).",
    );
  }
}
