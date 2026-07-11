/**
 * Stable Golden A–G ExportManifest fixtures (Sprint 6F).
 * Immutable manifests — do not depend on mutable editor state.
 */

import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
  type ExportManifest,
} from "@/features/export/domain";
import {
  EXPORT_GOLDEN_PROJECTS,
  getExportGoldenProject,
  type ExportGoldenId,
} from "@/features/export/qa";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

export const GOLDEN_CAPABLE_ENV: Partial<ExportEnvironmentSnapshot> = {
  browserName: "chrome",
  supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true,
  supportsMediaRecorder: true,
  supportsRequestVideoFrameCallback: true,
  supportsWebAssembly: true,
  serverRendererAvailable: false,
  ffmpegRuntimePoisoned: false,
  estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
  mp4EncoderAvailable: true,
};

function mkScene(
  id: string,
  startMs: number,
  durationMs: number,
  subtitle: string,
  kind: "image" | "video",
) {
  if (kind === "video") {
    return {
      id,
      start: startMs / 1000,
      end: (startMs + durationMs) / 1000,
      duration: durationMs / 1000,
      startMs,
      endMs: startMs + durationMs,
      durationMs,
      subtitle,
      captionMode: "subtitles" as const,
      media: {
        type: "video" as const,
        url: `https://example.com/goldens/${id}.mp4`,
        source: "upload" as const,
        durationMs: 15_000,
        trimStartMs: 0,
        trimEndMs: durationMs,
        playbackRate: 1,
        muted: true,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      },
      image: {
        url: `https://example.com/goldens/${id}-poster.jpg`,
        scale: 1,
        x: 0,
        y: 0,
        rotation: 0,
        fitMode: "fill" as const,
      },
      transition: { type: "fade" as const, durationMs: 400 },
    };
  }
  return {
    id,
    start: startMs / 1000,
    end: (startMs + durationMs) / 1000,
    duration: durationMs / 1000,
    startMs,
    endMs: startMs + durationMs,
    durationMs,
    subtitle,
    captionMode: "subtitles" as const,
    media: {
      type: "image" as const,
      url: `https://example.com/goldens/${id}.jpg`,
      source: "upload" as const,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      motion: {
        version: 1 as const,
        preset: "slow-zoom-in" as const,
        intensity: 0.3,
        startMs: 0,
        endMs: durationMs,
      },
    },
    image: {
      url: `https://example.com/goldens/${id}.jpg`,
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      fitMode: id.includes("fill") ? ("fill" as const) : ("fit" as const),
    },
    transition: { type: "fade" as const, durationMs: 400 },
  };
}

export function buildExportGoldenStory(
  goldenId: ExportGoldenId,
  formatOverride?: "webm" | "mp4",
): FootieScript {
  const def = getExportGoldenProject(goldenId);
  const format =
    formatOverride ??
    (def.format === "both" ? "webm" : def.format);

  let cursor = 0;
  const scenes = def.scenePlan.map((plan) => {
    const scene = mkScene(plan.id, cursor, plan.durationMs, plan.subtitle, plan.kind);
    cursor += plan.durationMs;
    return scene;
  });

  return syncFootieScript({
    title: def.title,
    narration: scenes.map((s) => s.subtitle).join(". "),
    totalDuration: scenes.reduce((n, s) => n + s.duration, 0),
    exportSettings: {
      fileName: goldenId,
      format,
      quality: "standard",
      resolution: "720x1280",
    },
    scenes,
    timelineItems: scenes.map((scene) => ({
      id: `ti-${scene.id}`,
      type: "scene" as const,
      scene,
    })),
    ...(def.audioMode === "voice" || def.audioMode === "voice-with-music"
      ? {
          voiceoverUrl: "https://example.com/goldens/voice.mp3",
          voiceoverDurationMs: Math.max(1000, cursor - 600),
        }
      : {}),
    ...(def.audioMode === "voice-with-music"
      ? {
          backgroundMusic: {
            enabled: true,
            source: "upload" as const,
            fileUrl: "https://example.com/goldens/music.mp3",
            fileName: "music.mp3",
            volume: 0.35,
            fadeIn: true,
            fadeOut: true,
            duckingEnabled: true,
          },
        }
      : {}),
  });
}

export function buildExportGoldenManifest(
  goldenId: ExportGoldenId,
  options?: {
    readonly format?: "webm" | "mp4";
    readonly environment?: Partial<ExportEnvironmentSnapshot>;
  },
): ExportManifest {
  const def = getExportGoldenProject(goldenId);
  const story = buildExportGoldenStory(goldenId, options?.format);
  const wantsVoice =
    def.audioMode === "voice" || def.audioMode === "voice-with-music";
  const wantsMusic = def.audioMode === "voice-with-music";

  let manifest = buildExportManifest({
    story,
    audioMode: wantsVoice ? "with-voice" : "silent",
    includeBackgroundMusic: wantsMusic,
    environment: { ...GOLDEN_CAPABLE_ENV, ...options?.environment },
  });

  if (def.audioMode === "silent") {
    manifest = {
      ...manifest,
      audio: {
        ...manifest.audio,
        mode: "silent",
        voiceover: null,
        music: null,
      },
    };
  }

  return manifest;
}

export function listExportGoldenIds(): readonly ExportGoldenId[] {
  return EXPORT_GOLDEN_PROJECTS.map((g) => g.id);
}

export { EXPORT_GOLDEN_PROJECTS, getExportGoldenProject };
