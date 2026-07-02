import type { ExportSettings } from "@/features/export/utils/export-settings.utils";

export type PublishingPlatform = "generic" | "youtube_shorts" | "instagram_reels" | "x_video";

export type PlatformExportPresetId =
  | "generic_mp4"
  | "youtube_shorts"
  | "instagram_reels"
  | "x_video";

export type PlatformExportNoticeKind = "safe_area" | "duration" | "upload" | "format" | "general";

/** Non-blocking export guidance shown in the Export panel. */
export interface PlatformExportNotice {
  id: string;
  kind: PlatformExportNoticeKind;
  message: string;
}

/** Platform-oriented export preset — maps to existing ExportSettings only. */
export interface PlatformExportPreset {
  id: PlatformExportPresetId;
  platform: PublishingPlatform;
  label: string;
  description: string;
  recommendedSettings: Partial<ExportSettings>;
  aspectRatio: "9:16";
  resolution: "1080x1920" | "720x1280";
  fps: number;
  /** Informational — actual bitrate comes from ExportSettings quality/resolution mapping. */
  bitrateHintMbps: number;
  maxDurationSec: number;
  safeAreaNotices: string[];
  fileNamingPattern: string;
  manualUploadNotes: string[];
}
