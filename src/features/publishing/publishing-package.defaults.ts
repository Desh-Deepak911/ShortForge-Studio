import type {
  ManualPublishChecklistItem,
  ManualPublishChecklistItemId,
  PublishingMetadata,
  PublishingPlatform,
  PublishingPlatformStatus,
  PublishingScheduleRecurrence,
} from "./publishing.types";

export const DEFAULT_PUBLISHING_PACKAGE_STATUS = "draft" as const;

export const DEFAULT_PLATFORM_STATUS: PublishingPlatformStatus = "pending";

export const DEFAULT_SCHEDULE_RECURRENCE: PublishingScheduleRecurrence = "none";

export const MANUAL_CHECKLIST_ITEM_ORDER: readonly ManualPublishChecklistItemId[] = [
  "download_mp4",
  "copy_title_caption",
  "copy_description_tags",
  "open_platform",
  "upload_manually",
  "mark_published",
] as const;

const CHECKLIST_ITEM_LABELS: Record<ManualPublishChecklistItemId, string> = {
  download_mp4: "Download MP4",
  copy_title_caption: "Copy title/caption",
  copy_description_tags: "Copy description/tags",
  open_platform: "Open platform",
  upload_manually: "Upload manually",
  mark_published: "Mark published",
};

const PLATFORM_OPEN_LABELS: Partial<Record<PublishingPlatform, string>> = {
  youtube_shorts: "Open YouTube Studio",
  instagram_reels: "Open Instagram",
  x_video: "Open X",
  generic: "Open destination platform",
};

export const EMPTY_PUBLISHING_METADATA: PublishingMetadata = {
  common: {
    hook: "",
    keywords: [],
    thumbnailText: "",
    callToAction: "",
  },
  youtube: {
    title: "",
    description: "",
    tags: [],
  },
  instagram: {
    caption: "",
    hashtags: [],
  },
  x: {
    post: "",
    hashtags: [],
  },
};

/** Builds unchecked manual checklist items for a platform. */
export function createDefaultChecklistItems(
  platform: PublishingPlatform,
): ManualPublishChecklistItem[] {
  return MANUAL_CHECKLIST_ITEM_ORDER.map((id) => ({
    id,
    label:
      id === "open_platform"
        ? (PLATFORM_OPEN_LABELS[platform] ?? CHECKLIST_ITEM_LABELS.open_platform)
        : CHECKLIST_ITEM_LABELS[id],
    completed: false,
  }));
}

/** Initializes per-platform status entries as pending. */
export function createDefaultPlatformStatuses(
  platforms: PublishingPlatform[],
): Array<{ platform: PublishingPlatform; status: PublishingPlatformStatus }> {
  return platforms.map((platform) => ({
    platform,
    status: DEFAULT_PLATFORM_STATUS,
  }));
}
