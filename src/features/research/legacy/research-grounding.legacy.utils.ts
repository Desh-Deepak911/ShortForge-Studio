import type { FootballResearchContext } from "@/features/research/types/football-research.types";
import { hasUsefulResearchContent } from "@/features/research/utils/research-context-pass.utils";
import { inferFootballTopicKind } from "@/features/research/utils/topic-inference.utils";

import {
  FIFA_WORLD_CUP_2026_HOST_FACT,
  FIFA_WORLD_CUP_2026_NOT_QATAR_FACT,
  FIFA_WORLD_CUP_2026_PARTICIPATION_FACT,
  mentionsFifaWorldCup2026,
} from "../utils/research-grounding.utils";

/** @deprecated Legacy FootballResearchContext grounding — use AssembledContext prompt sections. */
export function hasNoUsefulResearchForGrounding(context: FootballResearchContext): boolean {
  return !hasUsefulResearchContent(context);
}

/** @deprecated Legacy FootballResearchContext grounding — use AssembledContext prompt sections. */
export function shouldShowNoReliableDataWarning(context: FootballResearchContext): boolean {
  return hasNoUsefulResearchForGrounding(context);
}

function appendUniqueFacts(facts: string[], nextFacts: string[]): string[] {
  const seen = new Set(facts);
  for (const fact of nextFacts) {
    if (!seen.has(fact)) {
      seen.add(fact);
      facts.push(fact);
    }
  }
  return facts;
}

/**
 * @deprecated Legacy FootballResearchContext grounding — use AssembledContext prompt sections.
 */
export function applyFifaWorldCup2026Grounding(
  context: FootballResearchContext,
): FootballResearchContext {
  if (!mentionsFifaWorldCup2026(context.topic)) {
    return context;
  }

  if (
    context.mode === "player_analysis" &&
    context.playerAnalysisIntent?.competitionKey === "fifa_world_cup_2026"
  ) {
    if (context.source === "fallback" && hasUsefulResearchContent(context)) {
      return { ...context, source: "static-fallback" };
    }
    return context;
  }

  const facts = appendUniqueFacts([...context.facts], [
    FIFA_WORLD_CUP_2026_HOST_FACT,
    FIFA_WORLD_CUP_2026_NOT_QATAR_FACT,
  ]);

  const warnings = [...context.warnings];
  const topicKind = inferFootballTopicKind(context.topic, context.mode);
  const hasVerifiedPlayerProfile = (context.players?.length ?? 0) > 0;

  if (topicKind === "player" && !hasVerifiedPlayerProfile) {
    facts.push(FIFA_WORLD_CUP_2026_PARTICIPATION_FACT);
    warnings.push(
      "No verified player data for this brief — use conditional language for 2026 participation.",
    );
  } else if (topicKind === "player") {
    warnings.push(
      "2026 squad selection may be unconfirmed — prefer \"if selected\" unless context confirms participation.",
    );
  }

  const hadUsefulContent = hasUsefulResearchContent(context);
  const source =
    context.source === "fallback" || (!hadUsefulContent && facts.length > 0)
      ? "static-fallback"
      : context.source;

  return {
    ...context,
    facts,
    warnings: [...new Set(warnings.map((warning) => warning.trim()).filter(Boolean))],
    source,
    summary: context.summary.trim().startsWith("Research brief:")
      ? `FIFA World Cup 2026 — ${context.topic.trim()}`
      : context.summary,
  };
}
