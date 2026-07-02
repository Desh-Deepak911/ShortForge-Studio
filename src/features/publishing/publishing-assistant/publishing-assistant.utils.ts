import type { StoryCreationBrief } from "@/features/drafts/types";
import { resolveExportProfileId } from "@/features/export-profiles";
import type { ExportSettings, FootieScript } from "@/features/story/types";
import type { ScriptMode } from "@/types/footiebitz";

import {
  applyPublishingMetadataToPackage,
  generatePublishingMetadata,
} from "../metadata-generator";
import { createPublishingPackage } from "../publishing-package.utils";
import type { PublishingAssetReference, PublishingPackage, PublishingPlatform } from "../publishing.types";
import { addPublishingPackage } from "../queue/publishing-queue.utils";
import type { PublishingQueueStorageOptions } from "../queue/publishing-queue.types";

export const PUBLISHING_ASSISTANT_PLATFORMS = [
  "youtube_shorts",
  "instagram_reels",
  "x_video",
] as const satisfies readonly PublishingPlatform[];

export type PublishingAssistantPlatform = (typeof PUBLISHING_ASSISTANT_PLATFORMS)[number];

export interface PublishingAssistantExportContext {
  draftId: string;
  script: FootieScript;
  exportSettings: ExportSettings;
  exportFileName: string;
  durationSec: number;
  selectedPlatforms: PublishingPlatform[];
  creationBrief?: StoryCreationBrief;
  scriptMode?: ScriptMode;
  /** Optional session object URL — never a video blob. */
  objectUrl?: string;
}

export interface PublishingAssistantHandoffResult {
  ok: boolean;
  package?: PublishingPackage;
  error?: string;
  metadataWarnings?: string[];
}

const PLATFORM_LABELS: Record<PublishingAssistantPlatform, string> = {
  youtube_shorts: "YouTube Shorts",
  instagram_reels: "Instagram Reels",
  x_video: "X Video",
};

const PLATFORM_OPEN_LABELS: Record<PublishingAssistantPlatform, string> = {
  youtube_shorts: "Open YouTube Studio",
  instagram_reels: "Open Instagram",
  x_video: "Open X",
};

const PLATFORM_OPEN_URLS: Record<PublishingAssistantPlatform, string> = {
  youtube_shorts: "https://studio.youtube.com/",
  instagram_reels: "https://www.instagram.com/",
  x_video: "https://x.com/",
};

export function getPublishingAssistantPlatformOpenLabel(
  platform: PublishingAssistantPlatform,
): string {
  return PLATFORM_OPEN_LABELS[platform];
}

export function getPublishingAssistantPlatformUrl(platform: PublishingAssistantPlatform): string {
  return PLATFORM_OPEN_URLS[platform];
}

export function getPublishingAssistantPlatformLabel(platform: PublishingPlatform): string {
  if (platform === "youtube_shorts" || platform === "instagram_reels" || platform === "x_video") {
    return PLATFORM_LABELS[platform];
  }

  return platform;
}

/** Default platform selection from the active export profile. */
export function resolveDefaultPublishingAssistantPlatforms(
  exportSettings: Pick<ExportSettings, "exportProfileId">,
): PublishingAssistantPlatform[] {
  const profileId = resolveExportProfileId(exportSettings);

  switch (profileId) {
    case "youtube_shorts":
      return ["youtube_shorts"];
    case "instagram_reels":
      return ["instagram_reels"];
    case "x_video":
      return ["x_video"];
    case "generic_mp4":
    default:
      return [];
  }
}

function resolveScriptMode(
  scriptMode: ScriptMode | undefined,
  creationBrief: StoryCreationBrief | undefined,
): ScriptMode | undefined {
  return scriptMode ?? creationBrief?.scriptMode;
}

function buildExportMimeType(format: ExportSettings["format"]): string {
  return format === "webm" ? "video/webm" : "video/mp4";
}

/** Builds a lightweight exported asset reference — no blob or base64 persistence. */
export function buildPublishingExportedAssetReference(input: {
  exportFileName: string;
  durationSec: number;
  exportSettings: ExportSettings;
  draftId: string;
  objectUrl?: string;
}): PublishingAssetReference {
  const reference: PublishingAssetReference = {
    fileName: input.exportFileName,
    exportId: `export-${input.draftId}-${Date.now()}`,
    mimeType: buildExportMimeType(input.exportSettings.format),
    durationSec: Math.max(0, Math.round(input.durationSec)),
  };

  if (input.objectUrl?.trim()) {
    reference.objectUrl = input.objectUrl.trim();
    reference.objectUrlTemporary = input.objectUrl.startsWith("blob:");
  }

  return reference;
}

/** Creates a publishing package with generated metadata — does not enqueue. */
export function createPublishingPackageFromExport(
  context: PublishingAssistantExportContext,
): PublishingAssistantHandoffResult {
  if (context.selectedPlatforms.length === 0) {
    return { ok: false, error: "Select at least one platform." };
  }

  if (!context.draftId.trim()) {
    return { ok: false, error: "Draft id is required to create a publishing package." };
  }

  try {
    const scriptMode = resolveScriptMode(context.scriptMode, context.creationBrief);
    const metadataResult = generatePublishingMetadata({
      title: context.script.title,
      topic: context.creationBrief?.topic,
      narration: context.script.narration,
      scriptMode,
      templateId: context.creationBrief?.templateId,
      templatePromptHints: context.creationBrief?.templatePromptHints,
      platforms: context.selectedPlatforms,
      exportProfileId: resolveExportProfileId(context.exportSettings),
      durationSec: context.durationSec,
    });

    const exportedAsset = buildPublishingExportedAssetReference({
      exportFileName: context.exportFileName,
      durationSec: context.durationSec,
      exportSettings: context.exportSettings,
      draftId: context.draftId,
      objectUrl: context.objectUrl,
    });

    const basePackage = createPublishingPackage({
      draftId: context.draftId,
      storyTitle: context.script.title,
      topic: context.creationBrief?.topic,
      scriptMode,
      templateId: context.creationBrief?.templateId,
      exportProfileId: resolveExportProfileId(context.exportSettings),
      platforms: context.selectedPlatforms,
      exportedAsset,
    });

    const packageWithMetadata = applyPublishingMetadataToPackage(
      basePackage,
      metadataResult.metadata,
    );

    return {
      ok: true,
      package: packageWithMetadata,
      metadataWarnings: metadataResult.diagnostics.warnings,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Publishing package creation failed.",
    };
  }
}

/** Creates a publishing package with generated metadata and enqueues it locally. */
export function createAndEnqueuePublishingPackageFromExport(
  context: PublishingAssistantExportContext,
  options?: PublishingQueueStorageOptions,
): PublishingAssistantHandoffResult {
  const result = createPublishingPackageFromExport(context);
  if (!result.ok || !result.package) {
    return result;
  }

  const queued = addPublishingPackage(result.package, options);
  if (!queued.ok) {
    return {
      ok: false,
      error: queued.error ?? "Failed to add publishing package to the queue.",
    };
  }

  return {
    ok: true,
    package: queued.package ?? result.package,
    metadataWarnings: result.metadataWarnings,
  };
}
