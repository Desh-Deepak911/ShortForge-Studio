/**
 * Canonical audio end policy vs manifest.project.renderDurationMs (Sprint 6E).
 */

import {
  isExportManifestV5,
  type ExportManifest,
} from "@/features/export/domain/export-manifest.types";
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
  // Music/narration content ends at brandStingStartMs; silence may pad the container.
  const brandStingStartMs =
    isExportManifestV5(manifest) && manifest.brandSting
      ? Math.max(0, Math.round(manifest.brandSting.startMs))
      : null;
  const musicEndMs =
    brandStingStartMs != null ? Math.max(1, brandStingStartMs) : projectEndMs;
  const voiceContentEndMs =
    brandStingStartMs != null ? Math.max(1, brandStingStartMs) : projectEndMs;
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
    } else if (
      voiceDurationMs + EXPORT_VOICEOVER_OVERRUN_TOLERANCE_MS <
      voiceContentEndMs
    ) {
      voiceover = {
        action: "pad",
        padDurationMs: projectEndMs - voiceDurationMs,
        detail:
          brandStingStartMs != null
            ? "Voice ends before narration/sting boundary — pad remaining timeline with silence (no voice repeat)."
            : "Voice ends before project end — pad with silence.",
      };
    } else if (
      voiceDurationMs >
      voiceContentEndMs + EXPORT_VOICEOVER_OVERRUN_TOLERANCE_MS
    ) {
      // With a sting, overruns past narration end are trimmed in the mix plan
      // (silence fills the sting/container); beyond full project end remains blocked.
      if (
        brandStingStartMs != null &&
        voiceDurationMs <= projectEndMs + EXPORT_VOICEOVER_OVERRUN_TOLERANCE_MS
      ) {
        voiceover = {
          action: "pad",
          padDurationMs: Math.max(0, projectEndMs - voiceContentEndMs),
          detail:
            "Voice trimmed at brand-sting start; silence pads container duration.",
        };
      } else {
        voiceover = {
          action: "block",
          detail:
            "Voiceover is longer than the project timeline beyond tolerance. Rebuild voiceover or adjust scene timing.",
        };
      }
    } else {
      voiceover = {
        action: "none",
        detail:
          brandStingStartMs != null
            ? "Voiceover fits narration boundary; silence may pad sting/end buffer."
            : "Voiceover fits within project end tolerance.",
      };
      // Still pad silence through sting + end buffer when container is longer.
      if (
        brandStingStartMs != null &&
        voiceDurationMs + EXPORT_VOICEOVER_OVERRUN_TOLERANCE_MS < projectEndMs
      ) {
        voiceover = {
          action: "pad",
          padDurationMs: projectEndMs - Math.min(voiceDurationMs, voiceContentEndMs),
          detail:
            "Voice ends at narration boundary — pad sting/end buffer with silence.",
        };
      }
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
        detail:
          musicEndMs < projectEndMs
            ? "Loop music input and trim before the silent brand-sting segment."
            : "Loop music input and trim to project end (never loop mixed output).",
      };
    } else if (musicDurationMs != null && musicDurationMs < musicEndMs) {
      music = {
        action: "pad",
        detail:
          brandStingStartMs != null
            ? "Music shorter than brand-sting start — end naturally then silence."
            : "Music shorter than project — end naturally then silence.",
      };
    } else {
      music = {
        action: "trim",
        detail:
          brandStingStartMs != null
            ? "Trim music to brand-sting start with fade-out anchored there (not into the sting)."
            : "Trim music to project end with fade-out anchored to project end.",
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
