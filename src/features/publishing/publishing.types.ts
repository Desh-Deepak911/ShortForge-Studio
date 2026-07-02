import type { PlatformExportPresetId } from "@/features/export-profiles/export-profile.types";
import type { CreatorTemplateId } from "@/features/creator-templates/creator-template.types";
import type { ScriptMode } from "@/types/footiebitz";

/** Re-export for publishing workflows — aligns with export profile platforms. */
export type { PublishingPlatform } from "@/features/export-profiles/export-profile.types";

import type { PublishingPlatform } from "@/features/export-profiles/export-profile.types";

export type PublishingPackageId = string;

export type PublishingPlatformStatus =
  | "pending"
  | "ready_to_publish"
  | "published"
  | "skipped";

export type PublishingPackageStatus =
  | "draft"
  | "exported"
  | "ready"
  | "partially_published"
  | "published"
  | "archived";

export interface PublishingMetadataCommon {
  hook: string;
  keywords: string[];
  thumbnailText: string;
  callToAction: string;
}

export interface YoutubePublishingMetadata {
  title: string;
  description: string;
  tags: string[];
}

export interface InstagramPublishingMetadata {
  caption: string;
  hashtags: string[];
}

export interface XPublishingMetadata {
  post: string;
  hashtags: string[];
}

/** Platform-scoped metadata slice for copy/checklist helpers. */
export type PlatformPublishingMetadata =
  | { platform: "youtube_shorts"; metadata: YoutubePublishingMetadata }
  | { platform: "instagram_reels"; metadata: InstagramPublishingMetadata }
  | { platform: "x_video"; metadata: XPublishingMetadata }
  | { platform: "generic"; metadata: PublishingMetadataCommon };

export interface PublishingMetadata {
  common: PublishingMetadataCommon;
  youtube: YoutubePublishingMetadata;
  instagram: InstagramPublishingMetadata;
  x: XPublishingMetadata;
}

export type PublishingScheduleRecurrence = "none" | "daily" | "weekly";

/** Reminder-only scheduling for v1 — no automated publish. */
export interface PublishingSchedule {
  scheduledForIso: string;
  timezone: string;
  recurrence?: PublishingScheduleRecurrence;
  reminderOnly: true;
}

export type ManualPublishChecklistItemId =
  | "download_mp4"
  | "copy_title_caption"
  | "copy_description_tags"
  | "open_platform"
  | "upload_manually"
  | "mark_published";

export interface ManualPublishChecklistItem {
  id: ManualPublishChecklistItemId;
  label: string;
  completed: boolean;
}

export interface ManualPublishChecklist {
  platform: PublishingPlatform;
  items: ManualPublishChecklistItem[];
}

/** Lightweight reference to an exported file — no video blob persistence. */
export interface PublishingAssetReference {
  fileName?: string;
  objectUrl?: string;
  /** True when objectUrl is a session blob URL that may expire after reload. */
  objectUrlTemporary?: boolean;
  exportId?: string;
  mimeType?: string;
  durationSec?: number;
}

export interface PublishingPackageSource {
  templateId?: CreatorTemplateId;
  scriptMode?: ScriptMode;
  topic?: string;
  exportProfileId?: PlatformExportPresetId;
}

export interface PlatformPublishingStatusEntry {
  platform: PublishingPlatform;
  status: PublishingPlatformStatus;
}

/** Clipboard-ready metadata field for manual publishing. */
export interface PublishingCopyAsset {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
}

export interface PublishingCopyAssetBundle {
  platform: PublishingPlatform;
  assets: PublishingCopyAsset[];
}

export interface PublishingPackage {
  id: PublishingPackageId;
  draftId: string;
  storyTitle: string;
  exportProfileId: PlatformExportPresetId;
  platforms: PublishingPlatform[];
  exportedAsset?: PublishingAssetReference;
  metadata: PublishingMetadata;
  checklist: ManualPublishChecklist[];
  platformStatuses: PlatformPublishingStatusEntry[];
  schedule?: PublishingSchedule;
  status: PublishingPackageStatus;
  createdAt: string;
  updatedAt: string;
  source: PublishingPackageSource;
}

export interface CreatePublishingPackageInput {
  draftId: string;
  storyTitle: string;
  topic?: string;
  scriptMode?: ScriptMode;
  templateId?: CreatorTemplateId;
  exportProfileId?: PlatformExportPresetId;
  platforms: PublishingPlatform[];
  exportedAsset?: PublishingAssetReference;
  metadata?: Partial<PublishingMetadata>;
  schedule?: PublishingSchedule;
}
