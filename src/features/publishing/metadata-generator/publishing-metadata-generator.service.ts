import { normalizePublishingMetadata } from "@/features/publishing/publishing-package.utils";
import type { PublishingMetadata, PublishingPackage } from "@/features/publishing/publishing.types";

import type {
  PublishingMetadataGenerationDiagnostics,
  PublishingMetadataGeneratorInput,
  PublishingMetadataGeneratorResult,
} from "./publishing-metadata-generator.types";
import {
  buildInstagramCaption,
  buildStyleCallToAction,
  buildStyleHashtags,
  buildStyleHook,
  buildStyleTags,
  buildStyleTitle,
  buildThumbnailText,
  buildXHashtags,
  buildXPost,
  buildYoutubeDescription,
  extractNarrationExcerpt,
  resolvePublishingMetadataStyle,
  tokenizeKeywords,
  trimText,
} from "./publishing-metadata-generator.utils";

function nowIso(): string {
  return new Date().toISOString();
}

function buildDiagnostics(
  input: PublishingMetadataGeneratorInput,
  style: ReturnType<typeof resolvePublishingMetadataStyle>,
  narrationAvailable: boolean,
): PublishingMetadataGenerationDiagnostics {
  const warnings: string[] = [];
  const notes: string[] = [];

  if (!narrationAvailable) {
    warnings.push("Narration missing — metadata uses title and topic only.");
  }

  if (!trimText(input.title) && !trimText(input.topic)) {
    warnings.push("Title and topic missing — output may be sparse.");
  }

  if (style.hints) {
    notes.push("Applied template prompt hints for tone and CTA.");
  } else if (style.templateId) {
    notes.push(`Used template style mapping for ${style.templateId}.`);
  } else if (style.scriptMode) {
    notes.push(`Used script mode style mapping for ${style.scriptMode}.`);
  }

  notes.push(`Resolved metadata style: ${style.kind}.`);

  return {
    usedTemplateId: style.templateId,
    usedScriptMode: style.scriptMode,
    usedTemplatePromptHints: Boolean(style.hints),
    narrationAvailable,
    warnings,
    notes,
  };
}

/** Generates deterministic platform publishing metadata from story context. */
export function generatePublishingMetadata(
  input: PublishingMetadataGeneratorInput,
): PublishingMetadataGeneratorResult {
  const title = trimText(input.title);
  const topic = trimText(input.topic);
  const narration = trimText(input.narration);
  const narrationAvailable = narration.length > 0;
  const style = resolvePublishingMetadataStyle(input);

  const keywords = tokenizeKeywords(title, topic, narration, ...(input.keywords ?? []));
  const hook = buildStyleHook(style, title, topic, narration);
  const callToAction = buildStyleCallToAction(style);
  const thumbnailText = buildThumbnailText(title, topic);
  const narrationExcerpt = extractNarrationExcerpt(narration);

  const metadata = normalizePublishingMetadata({
    common: {
      hook,
      keywords,
      thumbnailText,
      callToAction,
    },
    youtube: {
      title: buildStyleTitle(style, title, topic),
      description: buildYoutubeDescription(hook, topic, narrationExcerpt, callToAction, style),
      tags: buildStyleTags(style, keywords),
    },
    instagram: {
      caption: buildInstagramCaption(hook, narrationExcerpt, callToAction),
      hashtags: buildStyleHashtags(style, keywords),
    },
    x: {
      post: buildXPost(hook, title, topic, style),
      hashtags: buildXHashtags(style, keywords),
    },
  });

  return {
    metadata,
    diagnostics: buildDiagnostics(input, style, narrationAvailable),
  };
}

/** Applies generated metadata to a publishing package immutably. */
export function applyPublishingMetadataToPackage(
  pkg: PublishingPackage,
  metadata: PublishingMetadata,
): PublishingPackage {
  const next = structuredClone(pkg);
  next.metadata = normalizePublishingMetadata(metadata);
  next.updatedAt = nowIso();
  return next;
}
