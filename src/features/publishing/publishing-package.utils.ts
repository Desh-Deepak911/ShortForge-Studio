import { DEFAULT_EXPORT_PROFILE_ID, isExportProfileId } from "@/features/export-profiles";

import {
  createDefaultChecklistItems,
  createDefaultPlatformStatuses,
  DEFAULT_PUBLISHING_PACKAGE_STATUS,
} from "./publishing-package.defaults";
import type {
  CreatePublishingPackageInput,
  ManualPublishChecklist,
  PublishingCopyAsset,
  PublishingCopyAssetBundle,
  PublishingMetadata,
  PublishingPackage,
  PublishingPlatform,
  PublishingPlatformStatus,
  PublishingPackageStatus,
} from "./publishing.types";

function clonePublishingPackage(pkg: PublishingPackage): PublishingPackage {
  return structuredClone(pkg);
}

function nowIso(): string {
  return new Date().toISOString();
}

function createPublishingPackageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `pub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

/** Normalizes partial metadata to safe empty strings and arrays. */
export function normalizePublishingMetadata(
  partial?: Partial<PublishingMetadata>,
): PublishingMetadata {
  return {
    common: {
      hook: asString(partial?.common?.hook),
      keywords: asStringArray(partial?.common?.keywords),
      thumbnailText: asString(partial?.common?.thumbnailText),
      callToAction: asString(partial?.common?.callToAction),
    },
    youtube: {
      title: asString(partial?.youtube?.title),
      description: asString(partial?.youtube?.description),
      tags: asStringArray(partial?.youtube?.tags),
    },
    instagram: {
      caption: asString(partial?.instagram?.caption),
      hashtags: asStringArray(partial?.instagram?.hashtags),
    },
    x: {
      post: asString(partial?.x?.post),
      hashtags: asStringArray(partial?.x?.hashtags),
    },
  };
}

function resolveInitialPackageStatus(
  exportedAsset?: PublishingPackage["exportedAsset"],
): PublishingPackageStatus {
  return exportedAsset ? "exported" : DEFAULT_PUBLISHING_PACKAGE_STATUS;
}

function normalizePlatforms(platforms: PublishingPlatform[]): PublishingPlatform[] {
  return [...new Set(platforms)];
}

function resolveExportProfileId(
  exportProfileId: CreatePublishingPackageInput["exportProfileId"],
): PublishingPackage["exportProfileId"] {
  if (exportProfileId && isExportProfileId(exportProfileId)) {
    return exportProfileId;
  }

  return DEFAULT_EXPORT_PROFILE_ID;
}

/** Creates a new publishing package from draft/export context. */
export function createPublishingPackage(
  input: CreatePublishingPackageInput,
): PublishingPackage {
  const timestamp = nowIso();
  const platforms = normalizePlatforms(input.platforms);
  const exportProfileId = resolveExportProfileId(input.exportProfileId);

  return {
    id: createPublishingPackageId(),
    draftId: input.draftId.trim(),
    storyTitle: input.storyTitle.trim(),
    exportProfileId,
    platforms,
    exportedAsset: input.exportedAsset ? { ...input.exportedAsset } : undefined,
    metadata: normalizePublishingMetadata(input.metadata),
    checklist: platforms.map((platform) => buildManualChecklist(platform)),
    platformStatuses: createDefaultPlatformStatuses(platforms),
    schedule: input.schedule ? { ...input.schedule } : undefined,
    status: resolveInitialPackageStatus(input.exportedAsset),
    createdAt: timestamp,
    updatedAt: timestamp,
    source: {
      templateId: input.templateId,
      scriptMode: input.scriptMode,
      topic: input.topic?.trim() || undefined,
      exportProfileId,
    },
  };
}

/** Returns a new package with an updated overall status. */
export function updatePublishingPackageStatus(
  pkg: PublishingPackage,
  status: PublishingPackageStatus,
): PublishingPackage {
  const next = clonePublishingPackage(pkg);
  next.status = status;
  next.updatedAt = nowIso();
  return next;
}

/** Returns a new package with an updated per-platform status. */
export function updatePlatformStatus(
  pkg: PublishingPackage,
  platform: PublishingPlatform,
  status: PublishingPlatformStatus,
): PublishingPackage {
  const next = clonePublishingPackage(pkg);
  const existing = next.platformStatuses.find((entry) => entry.platform === platform);

  if (existing) {
    existing.status = status;
  } else {
    next.platformStatuses.push({ platform, status });
  }

  if (status === "published") {
    next.checklist = next.checklist.map((entry) =>
      entry.platform === platform ? markChecklistPublished(entry) : entry,
    );
  }

  next.updatedAt = nowIso();
  return next;
}

function markChecklistPublished(checklist: ManualPublishChecklist): ManualPublishChecklist {
  return {
    ...checklist,
    items: checklist.items.map((item) =>
      item.id === "mark_published" ? { ...item, completed: true } : item,
    ),
  };
}

/** Builds the default manual publish checklist for a platform. */
export function buildManualChecklist(platform: PublishingPlatform): ManualPublishChecklist {
  return {
    platform,
    items: createDefaultChecklistItems(platform),
  };
}

function joinList(values: string[]): string {
  return values.filter(Boolean).join(", ");
}

function joinHashtags(values: string[]): string {
  return values
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .join(" ");
}

function buildCommonCopyAssets(metadata: PublishingMetadata): PublishingCopyAsset[] {
  const { common } = metadata;

  return [
    { id: "hook", label: "Hook", value: common.hook, multiline: true },
    { id: "keywords", label: "Keywords", value: joinList(common.keywords) },
    { id: "thumbnailText", label: "Thumbnail text", value: common.thumbnailText },
    { id: "callToAction", label: "Call to action", value: common.callToAction },
  ].filter((asset) => asset.value.length > 0);
}

/** Returns clipboard-ready metadata fields for a platform. */
export function getCopyAssets(
  pkg: PublishingPackage,
  platform: PublishingPlatform,
): PublishingCopyAssetBundle {
  const metadata = normalizePublishingMetadata(pkg.metadata);
  const assets: PublishingCopyAsset[] = [...buildCommonCopyAssets(metadata)];

  switch (platform) {
    case "youtube_shorts":
      assets.push(
        { id: "title", label: "Title", value: metadata.youtube.title },
        {
          id: "description",
          label: "Description",
          value: metadata.youtube.description,
          multiline: true,
        },
        { id: "tags", label: "Tags", value: joinList(metadata.youtube.tags) },
      );
      break;
    case "instagram_reels":
      assets.push(
        {
          id: "caption",
          label: "Caption",
          value: metadata.instagram.caption,
          multiline: true,
        },
        {
          id: "hashtags",
          label: "Hashtags",
          value: joinHashtags(metadata.instagram.hashtags),
        },
      );
      break;
    case "x_video":
      assets.push(
        { id: "post", label: "Post", value: metadata.x.post, multiline: true },
        { id: "hashtags", label: "Hashtags", value: joinHashtags(metadata.x.hashtags) },
      );
      break;
    case "generic":
    default:
      break;
  }

  return {
    platform,
    assets: assets.filter((asset) => asset.value.length > 0),
  };
}

/** Looks up a platform status entry on a package. */
export function getPlatformStatus(
  pkg: PublishingPackage,
  platform: PublishingPlatform,
): PublishingPlatformStatus | undefined {
  return pkg.platformStatuses.find((entry) => entry.platform === platform)?.status;
}

/** Returns checklist for a platform on a package. */
export function getPlatformChecklist(
  pkg: PublishingPackage,
  platform: PublishingPlatform,
): ManualPublishChecklist | undefined {
  return pkg.checklist.find((entry) => entry.platform === platform);
}
