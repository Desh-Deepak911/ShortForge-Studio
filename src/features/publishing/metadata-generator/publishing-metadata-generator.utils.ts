import { buildTemplatePromptHints, getCreatorTemplate } from "@/features/creator-templates";
import type { CreatorTemplateId } from "@/features/creator-templates/creator-template.types";
import type { ScriptMode } from "@/types/footiebitz";

import type {
  PublishingMetadataGeneratorInput,
  PublishingMetadataStyleKind,
  ResolvedPublishingMetadataStyle,
} from "./publishing-metadata-generator.types";

export const X_POST_CHAR_LIMIT = 280;
export const YOUTUBE_TITLE_MAX_CHARS = 70;
export const YOUTUBE_TAG_MIN = 5;
export const YOUTUBE_TAG_MAX = 10;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "with",
  "your",
]);

const TEMPLATE_STYLE_KIND: Partial<Record<CreatorTemplateId, PublishingMetadataStyleKind>> = {
  educational_bullet_points: "educational",
  top_10_countdown: "countdown",
  transfer_news: "news",
  football_match_preview: "preview",
  player_analysis: "analysis",
  history_explained: "history",
  tactical_breakdown: "tactical",
  documentary: "story",
  myth_vs_reality: "story",
};

const SCRIPT_MODE_STYLE_KIND: Partial<Record<ScriptMode, PublishingMetadataStyleKind>> = {
  story: "story",
  top_5: "countdown",
  match_recap: "news",
  match_preview: "preview",
  player_analysis: "analysis",
  historical_explainer: "history",
  tactical_review: "tactical",
  opinion_debate: "story",
};

export function trimText(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function truncateText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  if (maxLength <= 3) {
    return trimmed.slice(0, maxLength);
  }

  return `${trimmed.slice(0, maxLength - 3).trimEnd()}...`;
}

/** Returns the first sentence from narration without adding new claims. */
export function extractFirstSentence(text: string | undefined): string {
  const trimmed = trimText(text);
  if (!trimmed) {
    return "";
  }

  const match = trimmed.match(/^[^.!?]+[.!?]?/);
  return match ? match[0].trim() : truncateText(trimmed, 140);
}

/** Extracts short excerpt from narration for descriptions — source text only. */
export function extractNarrationExcerpt(text: string | undefined, maxLength = 180): string {
  const trimmed = trimText(text);
  if (!trimmed) {
    return "";
  }

  return truncateText(trimmed.replace(/\s+/g, " "), maxLength);
}

export function normalizeHashtag(value: string): string {
  const cleaned = value.replace(/^#+/, "").trim().toLowerCase();
  return cleaned ? `#${cleaned}` : "";
}

export function normalizeHashtags(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const tag = normalizeHashtag(value);
    if (!tag || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    result.push(tag);
  }

  return result;
}

export function tokenizeKeywords(...sources: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const source of sources) {
    const trimmed = trimText(source);
    if (!trimmed) {
      continue;
    }

    for (const rawToken of trimmed.toLowerCase().split(/[^a-z0-9]+/)) {
      const token = rawToken.trim();
      if (token.length < 3 || STOP_WORDS.has(token) || seen.has(token)) {
        continue;
      }
      seen.add(token);
      keywords.push(token);
    }
  }

  return keywords;
}

export function resolvePublishingMetadataStyle(
  input: Pick<
    PublishingMetadataGeneratorInput,
    "templateId" | "templatePromptHints" | "scriptMode"
  >,
): ResolvedPublishingMetadataStyle {
  const template =
    input.templateId !== undefined ? getCreatorTemplate(input.templateId) : null;
  const hints = input.templatePromptHints ?? buildTemplatePromptHints(template);
  const templateKind = input.templateId ? TEMPLATE_STYLE_KIND[input.templateId] : undefined;
  const scriptModeKind = input.scriptMode ? SCRIPT_MODE_STYLE_KIND[input.scriptMode] : undefined;

  return {
    kind: templateKind ?? scriptModeKind ?? "story",
    hints,
    templateId: input.templateId,
    scriptMode: input.scriptMode,
  };
}

export function buildThumbnailText(title: string, topic?: string): string {
  const source = trimText(title) || trimText(topic);
  if (!source) {
    return "";
  }

  const words = source.split(/\s+/).slice(0, 4);
  return truncateText(words.join(" "), 32);
}

export function buildStyleHook(
  style: ResolvedPublishingMetadataStyle,
  title: string,
  topic?: string,
  narration?: string,
): string {
  const subject = trimText(topic) || trimText(title);
  const opening = extractFirstSentence(narration);
  const hintOpening = trimText(style.hints?.openingStyle);

  switch (style.kind) {
    case "educational":
      return opening || (subject ? `Quick guide: ${subject}` : hintOpening || trimText(title));
    case "countdown":
      return opening || (subject ? `Counting down: ${subject}` : `Top picks: ${trimText(title)}`);
    case "news":
      return opening || (subject ? `${subject} — latest update` : trimText(title));
    case "preview":
      return opening || (subject ? `Match preview: ${subject}` : trimText(title));
    case "analysis":
      return opening || (subject ? `Breaking down: ${subject}` : trimText(title));
    case "history":
      return opening || (subject ? `The story behind ${subject}` : trimText(title));
    case "tactical":
      return opening || (subject ? `Tactical look: ${subject}` : trimText(title));
    case "story":
    default:
      return opening || trimText(title) || hintOpening;
  }
}

export function buildStyleCallToAction(style: ResolvedPublishingMetadataStyle): string {
  const ctaHint = trimText(style.hints?.ctaStyle);
  if (ctaHint) {
    return truncateText(ctaHint, 120);
  }

  switch (style.kind) {
    case "educational":
      return "Save this for your next watch — follow for more football explainers.";
    case "countdown":
      return "Drop your ranking in the comments — agree or disagree?";
    case "news":
      return "Share your take on this update in the comments.";
    case "preview":
      return "Drop your score prediction below.";
    case "analysis":
      return "Tell us if you agree with this read.";
    case "history":
      return "Share your memory of this moment.";
    case "tactical":
      return "What would you change tactically?";
    case "story":
    default:
      return "Follow for more football shorts.";
  }
}

export function buildStyleTitle(
  style: ResolvedPublishingMetadataStyle,
  title: string,
  topic?: string,
): string {
  const base = trimText(title) || trimText(topic);
  if (!base) {
    return "";
  }

  switch (style.kind) {
    case "educational":
      return truncateText(`Football explained: ${base}`, YOUTUBE_TITLE_MAX_CHARS);
    case "countdown":
      return truncateText(`Top 10: ${base}`, YOUTUBE_TITLE_MAX_CHARS);
    case "news":
      return truncateText(`Transfer update: ${base}`, YOUTUBE_TITLE_MAX_CHARS);
    case "preview":
      return truncateText(`Match preview: ${base}`, YOUTUBE_TITLE_MAX_CHARS);
    case "analysis":
      return truncateText(`Player analysis: ${base}`, YOUTUBE_TITLE_MAX_CHARS);
    case "history":
      return truncateText(`History explained: ${base}`, YOUTUBE_TITLE_MAX_CHARS);
    case "tactical":
      return truncateText(`Tactical breakdown: ${base}`, YOUTUBE_TITLE_MAX_CHARS);
    case "story":
    default:
      return truncateText(base, YOUTUBE_TITLE_MAX_CHARS);
  }
}

export function buildStyleTags(
  style: ResolvedPublishingMetadataStyle,
  keywords: string[],
): string[] {
  const styleTags: Record<PublishingMetadataStyleKind, string[]> = {
    educational: ["football", "explained", "shorts", "learning", "guide"],
    countdown: ["football", "top10", "countdown", "shorts", "ranking"],
    news: ["football", "transfernews", "shorts", "news", "updates"],
    preview: ["football", "matchpreview", "shorts", "prematch"],
    analysis: ["football", "analysis", "shorts", "player"],
    history: ["football", "history", "shorts", "story"],
    tactical: ["football", "tactics", "shorts", "analysis"],
    story: ["football", "shorts", "story"],
  };

  const merged = [...styleTags[style.kind], ...keywords];
  const unique = [...new Set(merged.map((tag) => tag.toLowerCase()).filter(Boolean))];
  const sized = unique.slice(0, YOUTUBE_TAG_MAX);

  while (sized.length < YOUTUBE_TAG_MIN) {
    sized.push("football");
    if (sized.length >= YOUTUBE_TAG_MIN) {
      break;
    }
  }

  return sized.slice(0, YOUTUBE_TAG_MAX);
}

export function buildStyleHashtags(
  style: ResolvedPublishingMetadataStyle,
  keywords: string[],
): string[] {
  const styleTags: Record<PublishingMetadataStyleKind, string[]> = {
    educational: ["football", "explained", "reels", "learn"],
    countdown: ["football", "top10", "countdown", "reels"],
    news: ["football", "transfernews", "reels", "news"],
    preview: ["football", "matchday", "reels", "preview"],
    analysis: ["football", "analysis", "reels"],
    history: ["football", "history", "reels"],
    tactical: ["football", "tactics", "reels"],
    story: ["football", "reels", "shorts"],
  };

  return normalizeHashtags([...keywords.slice(0, 4), ...styleTags[style.kind], "footiebitz"]);
}

export function buildYoutubeDescription(
  hook: string,
  topic: string | undefined,
  narrationExcerpt: string,
  cta: string,
  style: ResolvedPublishingMetadataStyle,
): string {
  const lines = [hook];

  if (topic) {
    lines.push(`Topic: ${topic}`);
  }

  if (narrationExcerpt) {
    lines.push(narrationExcerpt);
  }

  if (style.hints?.structure) {
    lines.push(`Format: ${truncateText(style.hints.structure, 120)}`);
  }

  lines.push(cta);
  lines.push("#Shorts");

  return lines.filter(Boolean).join("\n\n");
}

export function buildInstagramCaption(hook: string, narrationExcerpt: string, cta: string): string {
  const parts = [hook];
  if (narrationExcerpt && narrationExcerpt !== hook) {
    parts.push(narrationExcerpt);
  }
  parts.push(cta);
  return parts.filter(Boolean).join("\n\n");
}

export function buildXPost(
  hook: string,
  title: string,
  topic: string | undefined,
  style: ResolvedPublishingMetadataStyle,
): string {
  const subject = trimText(topic) || trimText(title);
  let post = hook || subject;

  switch (style.kind) {
    case "countdown":
      post = hook || `Top 10 countdown: ${subject}`;
      break;
    case "news":
      post = hook || `Transfer update: ${subject}`;
      break;
    case "educational":
      post = hook || `Quick football guide: ${subject}`;
      break;
    default:
      post = hook || subject;
  }

  return truncateText(post, X_POST_CHAR_LIMIT);
}

export function buildXHashtags(style: ResolvedPublishingMetadataStyle, keywords: string[]): string[] {
  const base = style.kind === "news" ? ["football", "transfernews"] : ["football", "shorts"];
  return normalizeHashtags([...keywords.slice(0, 2), ...base]).slice(0, 4);
}
