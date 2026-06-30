import type { ProviderRecommendation } from "@/features/asset-intelligence/providers/asset-provider.types";
import type {
  AssetRecommendation,
  RecommendationReason,
  SceneRecommendation,
} from "@/features/asset-intelligence/recommendation-engine/recommendation-engine.types";
import type { FootieScene } from "@/features/story/types";

import {
  formatImportanceLabel,
  formatProviderLabel,
} from "./creator-asset-studio.formatters";

export type SceneIntelligenceChip =
  | "Hook"
  | "Context"
  | "Evidence"
  | "Conflict"
  | "Climax"
  | "Payoff"
  | "CTA"
  | "Countdown"
  | "Biography"
  | "History"
  | "Debate"
  | "Comparison"
  | "Tactical"
  | "News";

export type VisualIntentLabel =
  | "Portrait"
  | "Action"
  | "Celebration"
  | "Archive"
  | "Comparison"
  | "Formation"
  | "Crowd"
  | "Stadium"
  | "Statistics"
  | "Graphic";

export type RecommendationContextLabel =
  | "Supports narration"
  | "Supports story structure"
  | "Improves diversity"
  | "Historical relevance"
  | "Visual contrast";

export interface SceneIntelligenceViewModel {
  sceneNumber: number;
  sceneCount: number;
  sceneTitle: string;
  narrativeRole: string | null;
  templateSlot: string | null;
  importance: ReturnType<typeof formatImportanceLabel>;
  intelligenceChips: SceneIntelligenceChip[];
  visualIntents: VisualIntentLabel[];
  importanceExplanation: string;
  providerContext: string | null;
  recommendationContexts: RecommendationContextLabel[];
}

const ROLE_CHIPS: Record<string, SceneIntelligenceChip> = {
  hook: "Hook",
  intro: "Hook",
  context: "Context",
  evidence: "Evidence",
  conflict: "Conflict",
  climax: "Climax",
  payoff: "Payoff",
  ending: "Payoff",
  cta: "CTA",
};

const VISUAL_INTENT_MAP: Record<string, VisualIntentLabel> = {
  player_portrait: "Portrait",
  portrait: "Portrait",
  match_action: "Action",
  action: "Action",
  celebration: "Celebration",
  archive_footage: "Archive",
  archive: "Archive",
  comparison_split: "Comparison",
  comparison: "Comparison",
  formation: "Formation",
  tactic: "Formation",
  tactical: "Formation",
  crowd_atmosphere: "Crowd",
  crowd: "Crowd",
  stadium: "Stadium",
  stat_overlay: "Statistics",
  timeline_graphic: "Statistics",
  statistics: "Statistics",
  text_card: "Graphic",
  stat_card: "Graphic",
  generated_graphic: "Graphic",
  graphic: "Graphic",
};

const REASON_CONTEXT_MAP: Partial<Record<RecommendationReason, RecommendationContextLabel>> = {
  highest_narrative_impact: "Supports narration",
  caption_emphasis_match: "Supports narration",
  timing_importance: "Supports narration",
  template_slot_alignment: "Supports story structure",
  matches_scene_role: "Supports story structure",
  strong_visual_diversity: "Improves diversity",
  diversity_alternate: "Improves diversity",
  best_historical_context: "Historical relevance",
  matches_visual_intent: "Visual contrast",
  best_portrait_opportunity: "Visual contrast",
};

const IMPORTANCE_EXPLANATIONS: Record<
  ReturnType<typeof formatImportanceLabel>,
  string
> = {
  Critical: "This scene carries one of the highest narrative impacts.",
  High: "This scene plays a major role in advancing the story.",
  Medium: "This scene supports pacing and context between key beats.",
  Low: "This scene provides supporting visual context.",
};

function humanizeToken(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function resolveSceneTitle(scene: FootieScene | undefined, recommendation?: AssetRecommendation): string {
  const subtitle = scene?.subtitle?.trim();
  if (subtitle) {
    return subtitle;
  }

  const narration = scene?.narration?.trim();
  if (narration) {
    return narration.length > 72 ? `${narration.slice(0, 69).trim()}…` : narration;
  }

  const query = recommendation?.query?.trim();
  if (query) {
    return query.length > 72 ? `${query.slice(0, 69).trim()}…` : query;
  }

  return "Untitled scene";
}

function resolveTemplateSlot(recommendation?: AssetRecommendation): string | null {
  if (!recommendation) {
    return null;
  }

  const roleTagIndex = recommendation.tags.findIndex((tag) => tag === "role");
  if (roleTagIndex >= 0) {
    const slot = recommendation.tags[roleTagIndex + 1];
    if (slot && slot !== "role") {
      return humanizeToken(slot);
    }
  }

  const slotTag = recommendation.tags.find(
    (tag) => !["role", "fallback", "portrait", "action", "archive"].includes(tag),
  );

  if (recommendation.reasons.includes("template_slot_alignment")) {
    return slotTag ? humanizeToken(slotTag) : "Template Slot";
  }

  return slotTag ? humanizeToken(slotTag) : null;
}

function collectSearchText(
  scene: FootieScene | undefined,
  sceneRecommendation?: SceneRecommendation,
  recommendation?: AssetRecommendation,
): string {
  return [
    scene?.subtitle,
    scene?.narration,
    sceneRecommendation?.reasoning.join(" "),
    recommendation?.query,
    recommendation?.semanticRole,
    recommendation?.visualIntent,
    recommendation?.assetRequirementType,
    ...(recommendation?.tags ?? []),
    ...(recommendation?.reasonLabels ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function resolveRoleChip(value: string | undefined): SceneIntelligenceChip | null {
  if (!value?.trim()) {
    return null;
  }

  const normalized = normalizeText(value);
  for (const [key, chip] of Object.entries(ROLE_CHIPS)) {
    if (normalized.includes(key)) {
      return chip;
    }
  }

  return ROLE_CHIPS[normalized] ?? null;
}

function resolveIntelligenceChips(input: {
  recommendation?: AssetRecommendation;
  sceneRecommendation?: SceneRecommendation;
  scene?: FootieScene;
}): SceneIntelligenceChip[] {
  const chips = new Set<SceneIntelligenceChip>();
  const searchText = collectSearchText(input.scene, input.sceneRecommendation, input.recommendation);

  const roleCandidates = [
    input.recommendation?.semanticRole,
    input.scene?.sceneType,
    ...((input.recommendation?.tags ?? []).filter((tag) => tag !== "role")),
  ];

  for (const candidate of roleCandidates) {
    const chip = resolveRoleChip(candidate);
    if (chip) {
      chips.add(chip);
    }
  }

  if (searchText.includes("countdown") || searchText.includes("top 5") || searchText.includes("rank")) {
    chips.add("Countdown");
  }
  if (searchText.includes("biography") || searchText.includes("legacy") || searchText.includes("origin")) {
    chips.add("Biography");
  }
  if (
    searchText.includes("history") ||
    searchText.includes("archive") ||
    input.recommendation?.reasons.includes("best_historical_context")
  ) {
    chips.add("History");
  }
  if (searchText.includes("debate") || searchText.includes(" vs ")) {
    chips.add("Debate");
  }
  if (
    searchText.includes("comparison") ||
    input.recommendation?.visualIntent === "comparison_split"
  ) {
    chips.add("Comparison");
  }
  if (
    searchText.includes("tactic") ||
    searchText.includes("formation") ||
    input.recommendation?.reasons.includes("supports_tactical_explanation")
  ) {
    chips.add("Tactical");
  }
  if (searchText.includes("news") || searchText.includes("headline") || searchText.includes("breaking")) {
    chips.add("News");
  }

  if (input.recommendation?.reasons.includes("matches_climax_scene")) {
    chips.add("Climax");
  }

  return Array.from(chips);
}

function resolveVisualIntents(recommendation?: AssetRecommendation): VisualIntentLabel[] {
  if (!recommendation) {
    return [];
  }

  const intents = new Set<VisualIntentLabel>();
  const candidates = [
    recommendation.visualIntent,
    recommendation.assetRequirementType,
    ...recommendation.tags,
    ...recommendation.entityTypes,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    const mapped =
      VISUAL_INTENT_MAP[normalized] ??
      VISUAL_INTENT_MAP[normalized.replace(/\s+/g, "_")] ??
      (normalized.includes("portrait")
        ? "Portrait"
        : normalized.includes("stadium")
          ? "Stadium"
          : normalized.includes("crowd")
            ? "Crowd"
            : normalized.includes("stat")
              ? "Statistics"
              : normalized.includes("archive")
                ? "Archive"
                : normalized.includes("formation") || normalized.includes("tactic")
                  ? "Formation"
                  : undefined);

    if (mapped) {
      intents.add(mapped);
    }
  }

  if (intents.size === 0 && recommendation.tags.length > 0) {
    intents.add("Graphic");
  }

  return Array.from(intents);
}

function resolveRecommendationContexts(recommendation?: AssetRecommendation): RecommendationContextLabel[] {
  if (!recommendation) {
    return [];
  }

  const contexts = new Set<RecommendationContextLabel>();
  for (const reason of recommendation.reasons) {
    const mapped = REASON_CONTEXT_MAP[reason];
    if (mapped) {
      contexts.add(mapped);
    }
  }

  if (contexts.size === 0) {
    if (recommendation.reasonLabels.some((label) => label.toLowerCase().includes("narrative"))) {
      contexts.add("Supports narration");
    }
    if (recommendation.reasonLabels.some((label) => label.toLowerCase().includes("diversity"))) {
      contexts.add("Improves diversity");
    }
  }

  return Array.from(contexts);
}

function resolveProviderContext(primaryProvider?: ProviderRecommendation): string | null {
  if (!primaryProvider) {
    return null;
  }

  const providerLabel = formatProviderLabel(primaryProvider.providerId);
  const reason =
    primaryProvider.reasons.find(
      (entry) => !entry.toLowerCase().includes("base planning score"),
    ) ?? primaryProvider.reasons[0];

  if (!reason) {
    return `${providerLabel} is recommended for this scene based on planning metadata.`;
  }

  const normalizedReason = reason.replace(/\.$/, "").trim();
  if (normalizedReason.toLowerCase().startsWith("strong fit")) {
    return `${providerLabel} is recommended because this scene ${normalizedReason.replace(/^strong fit for /i, "represents a ").toLowerCase()}.`;
  }

  if (normalizedReason.toLowerCase().includes("historical")) {
    return `${providerLabel} is recommended because this scene represents a historical moment.`;
  }

  if (normalizedReason.toLowerCase().includes("portrait")) {
    return `${providerLabel} is recommended because this scene calls for portrait-first imagery.`;
  }

  if (normalizedReason.toLowerCase().includes("tactical") || normalizedReason.toLowerCase().includes("generated")) {
    return `${providerLabel} is recommended because this scene needs tactical or generated visuals.`;
  }

  return `${providerLabel} is recommended because ${normalizedReason.charAt(0).toLowerCase()}${normalizedReason.slice(1)}.`;
}

/** Builds a read-only scene intelligence view model from cached planning metadata. */
export function buildSceneIntelligenceViewModel(input: {
  sceneIndex: number;
  sceneCount: number;
  scene?: FootieScene;
  sceneRecommendation?: SceneRecommendation;
  primaryProvider?: ProviderRecommendation;
}): SceneIntelligenceViewModel {
  const recommendation = input.sceneRecommendation?.topRecommendation;
  const resolvedScore =
    recommendation?.score ??
    (input.sceneRecommendation?.confidence === "very_high"
      ? 0.88
      : input.sceneRecommendation?.confidence === "high"
        ? 0.72
        : input.sceneRecommendation?.confidence === "medium"
          ? 0.55
          : 0.35);
  const importance = formatImportanceLabel(resolvedScore);

  return {
    sceneNumber: input.sceneIndex + 1,
    sceneCount: Math.max(input.sceneCount, 1),
    sceneTitle: resolveSceneTitle(input.scene, recommendation),
    narrativeRole: recommendation?.semanticRole
      ? humanizeToken(recommendation.semanticRole)
      : input.scene?.sceneType
        ? humanizeToken(input.scene.sceneType)
        : null,
    templateSlot: resolveTemplateSlot(recommendation),
    importance,
    intelligenceChips: resolveIntelligenceChips({
      recommendation,
      sceneRecommendation: input.sceneRecommendation,
      scene: input.scene,
    }),
    visualIntents: resolveVisualIntents(recommendation),
    importanceExplanation: IMPORTANCE_EXPLANATIONS[importance],
    providerContext: resolveProviderContext(input.primaryProvider),
    recommendationContexts: resolveRecommendationContexts(recommendation),
  };
}
