import type { ScriptMode } from "@/types/footiebitz";

import type { GraphContext } from "../context/graph-context.types";

import type {
  PromptIntelligenceSectionKind,
  PromptIntelligenceStrategy,
} from "./prompt-intelligence.types";

const MODE_STRATEGY_ID: Record<ScriptMode, string> = {
  top_5: "top-5-ranked-lead",
  player_analysis: "player-primary-lead",
  match_preview: "match-fixture-lead",
  match_recap: "match-timeline-lead",
  tactical_review: "tactical-structure-lead",
  opinion_debate: "opinion-sparse-aware",
  story: "story-default",
  historical_explainer: "explainer-default",
};

const MODE_SECTION_ORDER: Record<ScriptMode, PromptIntelligenceSectionKind[]> = {
  top_5: [
    "metadata",
    "ranked_facts",
    "verified_facts",
    "grounding",
    "manual_notes",
    "warnings",
  ],
  player_analysis: [
    "metadata",
    "primary_entity",
    "verified_facts",
    "statistics",
    "grounding",
    "manual_notes",
    "warnings",
  ],
  match_preview: [
    "metadata",
    "fixture",
    "statistics",
    "timeline",
    "verified_facts",
    "grounding",
    "manual_notes",
    "warnings",
  ],
  match_recap: [
    "metadata",
    "fixture",
    "statistics",
    "timeline",
    "verified_facts",
    "grounding",
    "manual_notes",
    "warnings",
  ],
  tactical_review: [
    "metadata",
    "fixture",
    "statistics",
    "timeline",
    "verified_facts",
    "grounding",
    "manual_notes",
    "warnings",
  ],
  opinion_debate: ["metadata", "grounding", "primary_entity", "verified_facts", "warnings"],
  story: ["metadata", "grounding", "verified_facts", "primary_entity", "warnings"],
  historical_explainer: [
    "metadata",
    "ranked_facts",
    "verified_facts",
    "primary_entity",
    "grounding",
    "warnings",
  ],
};

function hasStructuredGraphResearch(context: GraphContext): boolean {
  const verifiedWithoutManual = context.verifiedFacts.filter(
    (fact) => fact.type !== "manual_note",
  );

  return (
    context.rankedFacts.length > 0 ||
    context.fixtureFacts.length > 0 ||
    context.statisticFacts.length > 0 ||
    context.timelineFacts.length > 0 ||
    verifiedWithoutManual.length > 0
  );
}

export function isSparseOpinionDebateGraphContext(context: GraphContext): boolean {
  return context.selectedMode === "opinion_debate" && !hasStructuredGraphResearch(context);
}

/** Resolves mode-aware Prompt Intelligence strategy from graph context. */
export function resolvePromptIntelligenceStrategy(
  context: GraphContext,
): PromptIntelligenceStrategy {
  const sparseOpinion = isSparseOpinionDebateGraphContext(context);

  return {
    id: MODE_STRATEGY_ID[context.selectedMode],
    scriptMode: context.selectedMode,
    sectionOrder: sparseOpinion
      ? ["metadata", "grounding", "warnings"]
      : MODE_SECTION_ORDER[context.selectedMode],
    leadWithRankings: context.selectedMode === "top_5",
    leadWithPrimaryEntity: context.selectedMode === "player_analysis",
    compressSparseContext: sparseOpinion,
  };
}
