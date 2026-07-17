/**
 * Honest Create brief recommendations — Sprint 10H.3 / universal reliability.
 * Editorial guidance only — never predicted retention percentages.
 * Recommendations are preferences; every compatible selection remains generatable.
 */

import type { QualityMode, ScriptMode, Tone } from "@/types/footiebitz";
import type { StoryStrategySelection } from "@/features/retention-story/presentation";
import type { HookStyleSelection } from "@/features/hook-engine/presentation";

export type FactHandlingMode = "verified_facts_only" | "creative_premise";
/** Flexible (default) vs Precise — Create UI + API contract. */
export type CreationReliabilityMode = "flexible" | "precise";

/** Pre-create compatibility tier — never discovered only after Create. */
export type SelectionCompatibilityTier =
  | "recommended"
  | "compatible"
  | "may_reduce_quality"
  | "requires_additional_input";

export interface CreateBriefSelectionAssessment {
  readonly id:
    | "story_strategy"
    | "quality"
    | "hook"
    | "fact_handling"
    | "smart_research"
    | "reliability_mode";
  readonly label: string;
  readonly valueLabel: string;
  readonly tier: SelectionCompatibilityTier;
  readonly note: string;
}

export interface CreateBriefRecommendation {
  readonly qualityMode: QualityMode;
  readonly storyStrategy: StoryStrategySelection;
  readonly hookStyle: HookStyleSelection;
  readonly likelyHookFamily: string;
  readonly approximateBeatCount: string;
  readonly targetNarrationWords: number;
  readonly factHandling: FactHandlingMode;
  readonly researchRecommended: boolean;
  readonly researchHint: string;
  readonly reliabilityMode: CreationReliabilityMode;
  readonly summary: string;
  readonly selectionAssessments: readonly CreateBriefSelectionAssessment[];
}

function targetWords(durationSec: number): number {
  return Math.round(durationSec * 2.4);
}

function beatBand(durationSec: number): string {
  if (durationSec <= 35) return "5–7";
  if (durationSec <= 45) return "6–8";
  return "7–9";
}

function likelyHook(scriptMode: ScriptMode, tone: Tone): string {
  if (scriptMode === "top_5") return "List / ranked open";
  if (tone === "funny") return "Curiosity / banter open";
  if (tone === "news") return "Headline cold open";
  if (tone === "tactical") return "Tension / insight open";
  return "Cold open / tension";
}

function factualAccuracyMatters(scriptMode: ScriptMode): boolean {
  return (
    scriptMode === "match_recap" ||
    scriptMode === "match_preview" ||
    scriptMode === "top_5" ||
    scriptMode === "player_analysis" ||
    scriptMode === "tactical_review"
  );
}

function qualityLabel(mode: QualityMode): string {
  if (mode === "cheap") return "Fast";
  if (mode === "best") return "Studio";
  return "Balanced";
}

function strategyLabel(strategy: StoryStrategySelection): string {
  if (strategy === "auto") return "Auto";
  if (strategy === "short_retention") return "Retention-first";
  if (strategy === "short_standard") return "Standard";
  return String(strategy);
}

function hookLabel(hook: HookStyleSelection): string {
  if (hook === "auto") return "Auto";
  if (hook === "user_written") return "Write My Own";
  return String(hook);
}

function tierLabel(tier: SelectionCompatibilityTier): string {
  if (tier === "recommended") return "Recommended";
  if (tier === "compatible") return "Compatible";
  if (tier === "may_reduce_quality") return "May reduce quality";
  return "Requires additional creator input";
}

/**
 * Recommend settings for the current brief. Does not mutate creator choices.
 */
export function recommendCreateBrief(input: {
  readonly topic: string;
  readonly durationSec: number;
  readonly scriptMode: ScriptMode;
  readonly tone: Tone;
  readonly enableResearch: boolean;
  readonly factHandlingMode: FactHandlingMode;
  readonly hasPremiseDetails: boolean;
  readonly hasManualContext: boolean;
  readonly storyStrategy?: StoryStrategySelection;
  readonly qualityMode?: QualityMode;
  readonly hookStyle?: HookStyleSelection;
  readonly userAuthoredHook?: string;
  readonly reliabilityMode?: CreationReliabilityMode;
}): CreateBriefRecommendation {
  const detailed =
    input.topic.trim().length > 80 ||
    input.hasManualContext ||
    input.hasPremiseDetails;
  const recommendedQuality: QualityMode =
    input.durationSec >= 35 && detailed ? "best" : detailed ? "balanced" : "cheap";
  const recommendedStrategy: StoryStrategySelection =
    input.durationSec <= 35 ? "short_retention" : "auto";
  const recommendedFactHandling: FactHandlingMode =
    input.factHandlingMode === "creative_premise" || input.hasPremiseDetails
      ? "creative_premise"
      : "verified_facts_only";
  const researchRecommended =
    recommendedFactHandling === "verified_facts_only" &&
    factualAccuracyMatters(input.scriptMode);
  const researchHint =
    recommendedFactHandling === "creative_premise"
      ? input.enableResearch
        ? "Smart Research may enrich or cross-check; premise facts stay creator-supplied"
        : "Optional — turn on Smart Research to enrich without overwriting premise facts"
      : researchRecommended
        ? input.enableResearch
          ? "Recommended when factual accuracy matters"
          : "Recommended when factual accuracy matters — currently off"
        : input.enableResearch
          ? "Keep Smart Research on for verified support when available"
          : "Turn on Smart Research when you want verified support";

  const currentStrategy = input.storyStrategy ?? "auto";
  const currentQuality = input.qualityMode ?? "balanced";
  const currentHook = input.hookStyle ?? "auto";
  const currentReliability = input.reliabilityMode ?? "flexible";

  const assessments: CreateBriefSelectionAssessment[] = [
    {
      id: "story_strategy",
      label: "Story strategy",
      valueLabel: strategyLabel(currentStrategy),
      tier:
        currentStrategy === recommendedStrategy
          ? "recommended"
          : currentStrategy === "auto" || currentStrategy === "short_retention"
            ? "compatible"
            : "may_reduce_quality",
      note:
        currentStrategy === recommendedStrategy
          ? "Best fit for this duration and brief."
          : "Still generatable; Auto/Retention-first remain safest for short formats.",
    },
    {
      id: "quality",
      label: "Quality",
      valueLabel: qualityLabel(currentQuality),
      tier:
        currentQuality === recommendedQuality
          ? "recommended"
          : currentQuality === "cheap" && recommendedQuality !== "cheap"
            ? "may_reduce_quality"
            : "compatible",
      note:
        currentQuality === recommendedQuality
          ? "Recommended polish for this brief."
          : "Quality controls effort — it does not block a usable draft.",
    },
    {
      id: "hook",
      label: "Hook",
      valueLabel: hookLabel(currentHook),
      tier:
        currentHook === "auto"
          ? "recommended"
          : currentHook === "user_written"
            ? input.userAuthoredHook?.trim()
              ? "compatible"
              : "requires_additional_input"
            : "compatible",
      note:
        currentHook === "auto"
          ? "Auto picks the strongest compatible opening."
          : currentHook === "user_written" && !input.userAuthoredHook?.trim()
            ? "Write My Own needs an opening before Create."
            : "Selectable Hook styles are preferences; Flexible mode may adapt safely.",
    },
    {
      id: "fact_handling",
      label: "Fact handling",
      valueLabel:
        input.factHandlingMode === "creative_premise"
          ? "Creative Premise"
          : "Verified Facts",
      tier:
        input.factHandlingMode === "creative_premise" && !input.hasPremiseDetails
          ? "requires_additional_input"
          : input.factHandlingMode === recommendedFactHandling
            ? "recommended"
            : "compatible",
      note:
        input.factHandlingMode === "creative_premise" && !input.hasPremiseDetails
          ? "Add premise details, or switch to Verified Facts."
          : "Unsupported research claims stay omitted; premise facts stay creator-asserted.",
    },
    {
      id: "smart_research",
      label: "Smart Research",
      valueLabel: input.enableResearch ? "On" : "Off",
      tier: researchRecommended
        ? input.enableResearch
          ? "recommended"
          : "may_reduce_quality"
        : "compatible",
      note: researchHint,
    },
    {
      id: "reliability_mode",
      label: "Generation mode",
      valueLabel: currentReliability === "precise" ? "Precise" : "Flexible",
      tier: currentReliability === "flexible" ? "recommended" : "compatible",
      note:
        currentReliability === "flexible"
          ? "Best-effort generation with safe adaptations and warnings."
          : "Precise avoids silent Hook/strategy alteration; unmet requirements explain before or instead of adapting.",
    },
  ];

  return Object.freeze({
    qualityMode: recommendedQuality,
    storyStrategy: recommendedStrategy,
    hookStyle: "auto" as const,
    likelyHookFamily: likelyHook(input.scriptMode, input.tone),
    approximateBeatCount: beatBand(input.durationSec),
    targetNarrationWords: targetWords(input.durationSec),
    factHandling: recommendedFactHandling,
    researchRecommended,
    researchHint,
    reliabilityMode: "flexible",
    summary:
      "Recommended settings for this story. You can ignore them — every compatible selection remains generatable.",
    selectionAssessments: Object.freeze(assessments),
  });
}

export function selectionCompatibilityLabel(
  tier: SelectionCompatibilityTier,
): string {
  return tierLabel(tier);
}

export { qualityLabel };

export function factHandlingLabel(mode: FactHandlingMode): string {
  return mode === "creative_premise"
    ? "Creative premise"
    : "Verified facts only";
}

export type { HookStyleSelection };
