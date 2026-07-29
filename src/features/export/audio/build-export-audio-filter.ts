/**
 * Semantic audio filter graph description (Sprint 6E).
 * Format adapters choose codecs; this defines shared mix semantics.
 */

import type { ExportManifest } from "@/features/export/domain/export-manifest.types";

import type {
  ExportAudioFilterGraph,
  PreparedExportAudio,
} from "./export-audio.types";

export const EXPORT_AUDIO_TARGET_SAMPLE_RATE_HZ = 48000 as const;
export const EXPORT_AUDIO_TARGET_CHANNELS = 2 as const;

/**
 * Build a format-independent semantic description of the export audio graph.
 * Does not emit FFmpeg args — those stay in background-music / ffmpeg utils.
 */
export function buildExportAudioFilterGraph(
  manifest: ExportManifest,
  prepared: PreparedExportAudio,
): ExportAudioFilterGraph {
  const description: string[] = [];
  const projectEndMs = prepared.durationMs;

  description.push(`project-end=${projectEndMs}ms (manifest.project.renderDurationMs)`);
  description.push("source-video-audio=muted");
  description.push(
    `normalize=${EXPORT_AUDIO_TARGET_SAMPLE_RATE_HZ}Hz stereo fltp`,
  );

  if (prepared.mode === "silent") {
    description.push("mode=silent — no voice/music stems");
    return {
      description,
      forbidsVoiceSpeedFilters: true,
      sampleRateHz: EXPORT_AUDIO_TARGET_SAMPLE_RATE_HZ,
      channels: EXPORT_AUDIO_TARGET_CHANNELS,
      projectEndMs,
    };
  }

  if (prepared.voiceover) {
    description.push("voiceover: atrim + apad to project end");
    description.push(`voiceover.volume=${prepared.voiceover.volume}`);
    description.push(
      "voiceover.speed=baked (generatedPlaybackRate=1; no atempo)",
    );
    if (prepared.endPolicy.voiceover.action === "pad") {
      description.push(
        `voiceover.pad=${prepared.endPolicy.voiceover.padDurationMs ?? 0}ms silence`,
      );
    }
  }

  if (prepared.music) {
    const music = manifest.audio.music;
    if (prepared.endPolicy.music.action === "loop-and-trim") {
      description.push("music: loop input then atrim to project end");
    } else if (prepared.endPolicy.music.action === "trim") {
      description.push("music: atrim to project end");
    } else {
      description.push("music: end naturally / pad");
    }
    description.push(`music.volume=${prepared.music.volume}`);
    if (music?.duckingEnabled) {
      description.push(
        `music.ducking=release-ramped strength=${music.duckingStrength} while voice active`,
      );
    }
    if ((music?.fadeInMs ?? 0) > 0) {
      description.push(
        `music.fadeIn=${music!.fadeInMs}ms (canonical envelope; browser + FFmpeg paths)`,
      );
    }
    if ((music?.fadeOutMs ?? 0) > 0) {
      description.push(
        `music.fadeOut=${music!.fadeOutMs}ms anchored to project end=${projectEndMs}ms`,
      );
    }
  }

  if (prepared.voiceover && prepared.music) {
    description.push("mix: amix duration=first (project-length stems)");
  }

  description.push("final: duration enforced by -t = projectEndSec (not -shortest)");
  description.push("forbids: atempo, asetrate, voice loop, mixed-output loop");

  return {
    description,
    forbidsVoiceSpeedFilters: true,
    sampleRateHz: EXPORT_AUDIO_TARGET_SAMPLE_RATE_HZ,
    channels: EXPORT_AUDIO_TARGET_CHANNELS,
    projectEndMs,
  };
}

/** Clamp music fade durations so they never exceed project length. */
export function resolveClampedMusicFadeMs(
  fadeMs: number,
  projectEndMs: number,
): number {
  if (!Number.isFinite(fadeMs) || fadeMs <= 0) return 0;
  if (projectEndMs <= 0) return 0;
  return Math.min(fadeMs, Math.max(0, projectEndMs));
}
