import type {
  ResearchPreviewConfidence,
  ResearchPreviewEntity,
  ResearchPreviewSourceDisplay,
} from "@/features/create/types/research-preview.types";
import type { FootballResearchContext } from "@/features/research/types/football-research.types";
import {
  hasRankedPlayerResearch,
  hasUsefulResearchContent,
} from "@/features/research/utils/research-context-pass.utils";

import { detectResearchEntity } from "@/features/create/utils/research-preview.legacy.utils";

/** @deprecated Legacy FootballResearchContext display — use assembled preview helpers. */
export function resolveResearchPreviewConfidence(
  context: FootballResearchContext,
): ResearchPreviewConfidence {
  if (!hasUsefulResearchContent(context) || context.source === "fallback") {
    return "Low";
  }

  const factCount = context.facts.filter((fact) => fact.trim().length > 0).length;
  const hasStrongSignal =
    hasRankedPlayerResearch(context) ||
    Boolean(context.fixture) ||
    (context.standings?.length ?? 0) > 0 ||
    (context.statistics?.length ?? 0) > 0;

  if (context.source === "api-football" && hasStrongSignal && factCount >= 2) {
    return "High";
  }

  if (
    context.source === "api-football" ||
    (context.source === "static-fallback" && hasStrongSignal) ||
    (context.source === "manual" && factCount >= 1)
  ) {
    return "Medium";
  }

  return "Low";
}

/** @deprecated Legacy FootballResearchContext display. */
export function resolveResearchPreviewSourceLabel(
  context: FootballResearchContext,
): ResearchPreviewSourceDisplay {
  if (!hasUsefulResearchContent(context)) {
    return "Prompt only";
  }

  switch (context.source) {
    case "manual":
      return "Manual notes";
    case "static-fallback":
      return "Static fallback";
    case "api-football":
      return "Smart Research";
    case "fallback":
      return "Prompt only";
    default:
      return "Prompt only";
  }
}

/** @deprecated Legacy FootballResearchContext display. */
export function resolveResearchPreviewSourceDetail(
  context: FootballResearchContext,
): string | undefined {
  if (!hasUsefulResearchContent(context)) {
    return undefined;
  }

  if (context.source === "api-football") {
    return "Live data via API-Football";
  }

  if (context.source === "static-fallback") {
    return "Curated reference notes";
  }

  if (context.source === "manual") {
    return "From your additional notes";
  }

  return undefined;
}

/** @deprecated Legacy FootballResearchContext display. */
export function detectResearchSeasonLabel(context: FootballResearchContext): string | undefined {
  const seasons = new Set<number>();

  if (context.fixture?.season != null) {
    seasons.add(context.fixture.season);
  }

  if (context.rankingIntent?.season != null) {
    seasons.add(context.rankingIntent.season);
  }

  for (const table of context.standings ?? []) {
    if (table.season != null) {
      seasons.add(table.season);
    }
  }

  for (const player of context.players ?? []) {
    if (player.season != null) {
      seasons.add(player.season);
    }
  }

  if (seasons.size === 0) {
    return undefined;
  }

  return [...seasons].sort((a, b) => b - a).join(", ");
}

/** @deprecated Legacy FootballResearchContext display. */
export function detectResearchTags(context: FootballResearchContext): ResearchPreviewEntity[] {
  const tags = new Set<ResearchPreviewEntity>();
  const primary = detectResearchEntity(context);

  if (primary !== "unknown") {
    tags.add(primary);
  }

  if (detectResearchSeasonLabel(context)) {
    tags.add("year_season");
  }

  if (context.teams?.length && primary !== "team") {
    tags.add("team");
  }

  if (context.players?.length && primary !== "player" && primary !== "ranking") {
    tags.add("player");
  }

  if (context.standings?.length && primary !== "competition") {
    tags.add("competition");
  }

  if (tags.size === 0) {
    tags.add("unknown");
  }

  return [...tags];
}

/** @deprecated Legacy FootballResearchContext display. */
export function selectResearchPreviewFacts(context: FootballResearchContext): string[] {
  const facts = context.facts.filter((fact) => fact.trim().length > 0);
  if (facts.length <= 6) {
    return facts;
  }
  return facts.slice(0, 6);
}
