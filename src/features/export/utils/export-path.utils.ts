import {
  EXPORT_BACKGROUND_MUSIC_MIXING_ENABLED,
} from "./export-background-music.utils";
import {
  type ExportFormat,
  type ExportSettings,
  WEBM_EXPORT_AVAILABLE,
} from "./export-settings.utils";

/** Browser export pipeline selected by `exportSettings.format`. */
export type ExportPath = ExportFormat;

export interface ResolvedExportPath {
  path: ExportPath;
  /** Original format from settings — never rewritten to another path. */
  format: ExportFormat;
  blocked: boolean;
  blockReason?: string;
}

export const EXPORT_PATH_WEBM_UNAVAILABLE_MESSAGE =
  "WebM export is unavailable. Choose MP4 or try another browser.";

export const EXPORT_PATH_WEBM_BACKGROUND_MUSIC_UNSUPPORTED_MESSAGE =
  "Background music cannot be merged into WebM exports yet. Disable background music or choose MP4 for a full audio mix.";

export const EXPORT_PATH_MP4_SLOW_NOTICE =
  "MP4 conversion runs in the browser and may take several minutes.";

export const EXPORT_PATH_WEBM_FAST_NOTICE =
  "WebM uses the fast browser-native export path.";

/** True when WebM exports can include merged background music via FFmpeg mux. */
export const WEBM_BACKGROUND_MUSIC_EXPORT_SUPPORTED =
  EXPORT_BACKGROUND_MUSIC_MIXING_ENABLED;

/**
 * Resolves the export pipeline from settings without rewriting the user's format.
 * WebM is never silently converted to MP4.
 */
export function resolveExportPath(settings: Pick<ExportSettings, "format">): ResolvedExportPath {
  if (settings.format === "webm") {
    if (!WEBM_EXPORT_AVAILABLE) {
      return {
        path: "webm",
        format: "webm",
        blocked: true,
        blockReason: EXPORT_PATH_WEBM_UNAVAILABLE_MESSAGE,
      };
    }

    return { path: "webm", format: "webm", blocked: false };
  }

  return { path: "mp4", format: "mp4", blocked: false };
}

export function isWebmExportPath(path: ExportPath): boolean {
  return path === "webm";
}

export function isMp4ExportPath(path: ExportPath): boolean {
  return path === "mp4";
}

/** User-facing notice when WebM is selected but background music cannot be merged. */
export function resolveWebmBackgroundMusicExportNotice(options: {
  exportPath: ExportPath;
  backgroundMusicActive: boolean;
}): string | undefined {
  if (!isWebmExportPath(options.exportPath) || !options.backgroundMusicActive) {
    return undefined;
  }

  if (WEBM_BACKGROUND_MUSIC_EXPORT_SUPPORTED) {
    return undefined;
  }

  return EXPORT_PATH_WEBM_BACKGROUND_MUSIC_UNSUPPORTED_MESSAGE;
}

export function resolveExportPathFormatNotice(path: ExportPath): string {
  return isMp4ExportPath(path)
    ? EXPORT_PATH_MP4_SLOW_NOTICE
    : EXPORT_PATH_WEBM_FAST_NOTICE;
}
