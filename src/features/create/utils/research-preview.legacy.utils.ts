import type {
  ResearchPreviewEntity,
  ResearchPreviewStatus,
} from "@/features/create/types/research-preview.types";
import type { FootballResearchContext, FootballResearchSource } from "@/features/research/types/football-research.types";
import { getCompetitionLabel } from "@/features/research/utils/competition-resolver.utils";
import { hasRankedPlayerResearch, hasUsefulResearchContent } from "@/features/research/utils/research-context-pass.utils";

const SOURCE_LABELS: Record<FootballResearchSource, string> = {
  "api-football": "API-Football",
  "static-fallback": "Static fallback",
  manual: "Manual",
  fallback: "Fallback",
};

/** @deprecated Legacy FootballResearchContext display. */
export function formatResearchSourceLabel(source: FootballResearchSource): string {
  return SOURCE_LABELS[source];
}

/** @deprecated Legacy FootballResearchContext display — use assembled preview helpers. */
export function detectResearchEntity(context: FootballResearchContext): ResearchPreviewEntity {
  if (context.rankingIntent || context.mode === "top_5" || hasRankedPlayerResearch(context)) {
    return "ranking";
  }

  if (context.fixture) {
    return "match";
  }

  if (context.mode === "player_analysis" && context.players?.length) {
    return "player";
  }

  if (context.players?.length) {
    return "player";
  }

  if (context.standings?.length) {
    return "competition";
  }

  if (context.teams?.length) {
    return "team";
  }

  return "unknown";
}

/** @deprecated Legacy FootballResearchContext status — use `resolveResearchPreviewStatusFromPreview`. */
export function resolveResearchPreviewStatus(
  context: FootballResearchContext,
  httpOk: boolean,
): ResearchPreviewStatus {
  if (!httpOk) {
    return "error";
  }

  if (
    hasUsefulResearchContent(context) &&
    (context.source === "api-football" ||
      context.source === "static-fallback" ||
      context.source === "manual")
  ) {
    return "success";
  }

  if (context.source === "fallback" || !hasUsefulResearchContent(context)) {
    return "fallback";
  }

  return "success";
}

/** @deprecated Legacy FootballResearchContext display. */
export function formatRankingIntentSummary(context: FootballResearchContext): string | undefined {
  const intent = context.rankingIntent;
  if (!intent) {
    return undefined;
  }

  const competition = getCompetitionLabel(intent.competition);
  const scope = intent.timeScope === "all_time" ? "all-time" : "season";
  const season = intent.season != null ? ` · ${intent.season}` : "";
  return `${intent.rankingType.replace(/_/g, " ")} · ${competition} · ${scope}${season} · top ${intent.limit}`;
}
