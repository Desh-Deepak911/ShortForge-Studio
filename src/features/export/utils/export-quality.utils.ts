import type { FootieScript } from "@/features/story/types";
import type { ExportSettings } from "@/features/story/types";

import { getStoryVoiceoverDurationSec } from "@/lib/utils/voiceover";

export type ExportQualityId = "720p" | "1080p" | "1440p" | "4k";

export interface ExportQualityPreset {
  id: ExportQualityId;
  label: string;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
}

export const EXPORT_QUALITY_PRESETS: ExportQualityPreset[] = [
  {
    id: "720p",
    label: "720p vertical",
    width: 720,
    height: 1280,
    fps: 30,
    bitrate: 4_000_000,
  },
  {
    id: "1080p",
    label: "1080p vertical",
    width: 1080,
    height: 1920,
    fps: 30,
    bitrate: 8_000_000,
  },
  {
    id: "1440p",
    label: "1440p vertical",
    width: 1440,
    height: 2560,
    fps: 30,
    bitrate: 12_000_000,
  },
  {
    id: "4k",
    label: "4K vertical",
    width: 2160,
    height: 3840,
    fps: 30,
    bitrate: 20_000_000,
  },
];

export const DEFAULT_EXPORT_QUALITY: ExportQualityId = "1080p";

export type ExportAudioMode = "silent" | "with-voice";

export function getDefaultExportAudioMode(hasVoiceover: boolean): ExportAudioMode {
  return hasVoiceover ? "with-voice" : "silent";
}

export interface FootieExportOptions {
  /** @deprecated Prefer `exportSettings` on the script or in options. */
  qualityId?: ExportQualityId;
  audioMode?: ExportAudioMode;
  exportSettings?: Partial<ExportSettings>;
  /**
   * Sprint 6E: explicit user-chosen fallback after mux failure.
   * Without this, capability-reducing fallbacks are not applied automatically.
   */
  audioFallback?: "voice-only" | "silent" | "webm";
  /**
   * Explicit `mixed-media-scenes-v1` decision.
   * Default false (fail-closed) when omitted by prepareExportRequest.
   */
  mixedMediaScenesEnabled?: boolean;
  /**
   * Explicit Visual pacing authoring capability.
   * Guidance only — never a renderer requirement. Default ignored/fail-closed.
   */
  visualBeatDensityEnabled?: boolean;
  /**
   * Explicit source-quality authoring capability.
   * Guidance only — never a renderer requirement. Default ignored/fail-closed.
   */
  sourceQualityIntelligenceEnabled?: boolean;
  /**
   * Explicit keyframed visual-effects capability.
   * When true and usable keyframes exist, ExportManifest v5 freezes them.
   * Default false (fail-closed).
   */
  keyframedVisualEffectsEnabled?: boolean;
  /**
   * Actual requested output target for source-quality guidance.
   * Headless 4K must pass "4k" even when ExportManifest stays 1080p.
   */
  sourceQualityExportTarget?: "720p" | "1080p" | "4k";
}

export function getExportQualityPreset(id: ExportQualityId): ExportQualityPreset {
  return (
    EXPORT_QUALITY_PRESETS.find((preset) => preset.id === id) ??
    EXPORT_QUALITY_PRESETS.find((preset) => preset.id === DEFAULT_EXPORT_QUALITY)!
  );
}

export function isExportQualityId(value: string): value is ExportQualityId {
  return EXPORT_QUALITY_PRESETS.some((preset) => preset.id === value);
}

export function isHighQualityExport(qualityId: ExportQualityId): boolean {
  return qualityId !== "720p";
}

export interface ExportProgress {
  status:
    | "preparing"
    | "rendering"
    | "loading-voiceover"
    | "combining"
    | "finalizing"
    | "done"
    | "error";
  progress: number;
  message: string;
  warning?: string;
  /** Drives post-export UI tone when audio mux fallbacks are used. */
  resultKind?: "audio-full" | "audio-voice-only" | "audio-silent" | "default";
}

export function getScriptVideoDuration(script: FootieScript): number {
  return getStoryVoiceoverDurationSec(script);
}
