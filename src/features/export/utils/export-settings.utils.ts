import type { FootieScript } from "@/features/story/types";

import type { ExportQualityPreset, FootieExportOptions } from "./export-quality.utils";
import { getExportQualityPreset } from "./export-quality.utils";

export type ExportFormat = "mp4" | "webm";
export type ExportQualityTier = "standard" | "high";
export type ExportResolution = "1080x1920" | "720x1280";

export type ExportProfileId =
  | "generic_mp4"
  | "youtube_shorts"
  | "instagram_reels"
  | "x_video";

const EXPORT_PROFILE_IDS: ExportProfileId[] = [
  "generic_mp4",
  "youtube_shorts",
  "instagram_reels",
  "x_video",
];

export function isExportProfileId(value: string): value is ExportProfileId {
  return EXPORT_PROFILE_IDS.includes(value as ExportProfileId);
}

export interface ExportSettings {
  fileName: string;
  format: ExportFormat;
  quality: ExportQualityTier;
  resolution: ExportResolution;
  /** Optional platform preset — omitted on legacy exports. */
  exportProfileId?: ExportProfileId;
}

export const DEFAULT_EXPORT_FORMAT: ExportFormat = "webm";
export const DEFAULT_EXPORT_QUALITY_TIER: ExportQualityTier = "high";
export const DEFAULT_EXPORT_RESOLUTION: ExportResolution = "1080x1920";
export const DEFAULT_EXPORT_FILE_NAME = "story-short";

/** Fast browser-native path — canvas captures WebM; MP4 requires a separate transcode pass. */
export const WEBM_EXPORT_AVAILABLE = true;

const EXPORT_FORMATS: ExportFormat[] = ["mp4", "webm"];
const EXPORT_QUALITY_TIERS: ExportQualityTier[] = ["standard", "high"];
const EXPORT_RESOLUTIONS: ExportResolution[] = ["1080x1920", "720x1280"];

export function slugifyStoryTitle(title: string): string {
  return sanitizeExportFileName(title);
}

/** Slugifies a base file name and strips invalid characters. No extension. */
export function sanitizeExportFileName(fileName: string): string {
  const withoutExtension = fileName.trim().replace(/\.(mp4|webm)$/i, "");
  const slug = withoutExtension
    .toLowerCase()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || DEFAULT_EXPORT_FILE_NAME;
}

export function resolveExportDownloadFormat(
  settings: Pick<ExportSettings, "format">,
  formatOverride?: ExportFormat,
): ExportFormat {
  if (formatOverride) {
    return formatOverride;
  }

  return settings.format === "webm" ? "webm" : "mp4";
}

/** Builds the downloaded file name from export settings. */
export function buildExportDownloadFileName(
  settings: Pick<ExportSettings, "fileName" | "format">,
  formatOverride?: ExportFormat,
): string {
  const extension = resolveExportDownloadFormat(settings, formatOverride);
  const base = sanitizeExportFileName(settings.fileName);

  return `${base}.${extension}`;
}

export function isExportFormat(value: string): value is ExportFormat {
  return EXPORT_FORMATS.includes(value as ExportFormat);
}

export function isExportQualityTier(value: string): value is ExportQualityTier {
  return EXPORT_QUALITY_TIERS.includes(value as ExportQualityTier);
}

export function isExportResolution(value: string): value is ExportResolution {
  return EXPORT_RESOLUTIONS.includes(value as ExportResolution);
}

export function isWebmExportAvailable(): boolean {
  return WEBM_EXPORT_AVAILABLE;
}

/**
 * Validates export format availability. Settings are never rewritten to another format.
 * Use {@link resolveExportPath} for pipeline selection.
 */
export function resolveEffectiveExportSettings(settings: ExportSettings): {
  settings: ExportSettings;
  /** @deprecated No silent format fallback — use `blocked` instead. */
  formatFallback: boolean;
  blocked: boolean;
  blockReason?: string;
} {
  if (settings.format === "webm" && !WEBM_EXPORT_AVAILABLE) {
    return {
      settings,
      formatFallback: false,
      blocked: true,
      blockReason:
        "WebM export is unavailable. Choose MP4 or try another browser.",
    };
  }

  return { settings, formatFallback: false, blocked: false };
}

/** Applies defaults and sanitizes partial export settings. */
export function normalizeExportSettings(
  partial: Partial<ExportSettings> | undefined,
  title?: string,
): ExportSettings {
  const fileName = sanitizeExportFileName(
    partial?.fileName?.trim() || slugifyStoryTitle(title ?? ""),
  );

  const format =
    partial?.format === "mp4" || partial?.format === "webm"
      ? partial.format
      : DEFAULT_EXPORT_FORMAT;

  const settings: ExportSettings = {
    fileName,
    format,
    quality:
      partial?.quality === "standard" ? "standard" : DEFAULT_EXPORT_QUALITY_TIER,
    resolution:
      partial?.resolution === "720x1280"
        ? "720x1280"
        : DEFAULT_EXPORT_RESOLUTION,
  };

  if (partial?.exportProfileId && isExportProfileId(partial.exportProfileId)) {
    settings.exportProfileId = partial.exportProfileId;
  }

  return settings;
}

export function resolveExportSettings(
  script: FootieScript,
  options: FootieExportOptions = {},
): ExportSettings {
  return normalizeExportSettings(
    options.exportSettings ?? script.exportSettings,
    script.title,
  );
}

/** Resolves canvas render dimensions and bitrate from export settings or legacy qualityId. */
export function resolveExportRenderPreset(
  script: FootieScript,
  options: FootieExportOptions = {},
): ExportQualityPreset {
  return resolveExportQualityPreset(script, options);
}

function getExportBitrate(
  resolution: ExportResolution,
  quality: ExportQualityTier,
): number {
  if (resolution === "720x1280") {
    return quality === "high" ? 6_000_000 : 4_000_000;
  }

  return quality === "high" ? 8_000_000 : 6_000_000;
}

export function exportSettingsToQualityPreset(
  settings: ExportSettings,
): ExportQualityPreset {
  const is720 = settings.resolution === "720x1280";

  return {
    id: is720 ? "720p" : "1080p",
    label: `${settings.quality} · ${settings.resolution}`,
    width: is720 ? 720 : 1080,
    height: is720 ? 1280 : 1920,
    fps: 30,
    bitrate: getExportBitrate(settings.resolution, settings.quality),
  };
}

/**
 * Resolves render dimensions/bitrate from export settings when present,
 * otherwise falls back to legacy qualityId presets for backward compatibility.
 */
export function resolveExportQualityPreset(
  script: FootieScript,
  options: FootieExportOptions = {},
): ExportQualityPreset {
  if (options.exportSettings || script.exportSettings) {
    return exportSettingsToQualityPreset(resolveExportSettings(script, options));
  }

  if (options.qualityId) {
    return getExportQualityPreset(options.qualityId);
  }

  return exportSettingsToQualityPreset(resolveExportSettings(script, options));
}

export function isHighQualityExportSettings(settings: ExportSettings): boolean {
  return settings.quality === "high" && settings.resolution === "1080x1920";
}
