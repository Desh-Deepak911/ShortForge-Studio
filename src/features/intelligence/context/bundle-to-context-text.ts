import type {
  FootballResearchEvent,
  FootballResearchFixture,
  FootballResearchLineup,
  FootballResearchStatistic,
} from "@/features/research/types/football-research.types";
import {
  buildFifaWorldCup2026ContextRules,
  mentionsFifaWorldCup2026,
} from "@/features/research/utils/research-grounding.utils";
import type { ScriptMode } from "@/types/footiebitz";

import type { IntelligenceResearchRanking } from "../providers/provider-result.types";
import type { IntelligenceFact } from "../shared/knowledge.types";

import type { CanonicalResearchBundle } from "./canonical-research.types";

const HEADER = "RESEARCHED FOOTBALL CONTEXT";

function pushSection(lines: string[], title: string, body: string[]): void {
  const content = body.filter((line) => line.trim().length > 0);
  if (content.length === 0) {
    return;
  }

  lines.push("", title, ...content);
}

function formatModeLabel(mode: ScriptMode): string {
  return mode.replace(/_/g, " ");
}

function formatProvenanceLabel(source: CanonicalResearchBundle["provenance"]["source"]): string {
  return source.replace(/-/g, " ");
}

function resolveSummary(bundle: CanonicalResearchBundle): string {
  const firstFact = bundle.mergedFacts.find((fact) => fact.text.trim().length > 0);
  if (firstFact) {
    return firstFact.text.trim();
  }

  const fixture = bundle.fixtures[0];
  if (fixture) {
    return `${fixture.homeTeam} vs ${fixture.awayTeam}`;
  }

  return `Research brief: ${bundle.query.input.topic.trim()}`;
}

function resolveEntryTeamOrNation(
  bundle: CanonicalResearchBundle,
  label: string,
): string {
  const entity = bundle.mergedEntities.find((candidate) => candidate.label === label);
  const team =
    typeof entity?.metadata?.team === "string" ? entity.metadata.team.trim() : undefined;
  const nationality =
    typeof entity?.metadata?.nationality === "string"
      ? entity.metadata.nationality.trim()
      : undefined;

  return team || nationality || "—";
}

function formatRankingMetricValue(
  metric: IntelligenceResearchRanking["metric"],
  value: number | null | undefined,
): string {
  if (value == null) {
    return "—";
  }

  if (metric === "goals") {
    return `${value} goals`;
  }

  if (metric === "assists") {
    return `${value} assists`;
  }

  return String(value);
}

function formatRankedPlayerData(bundle: CanonicalResearchBundle): string[] {
  const primaryRanking = bundle.rankings[0];
  if (!primaryRanking?.entries.length) {
    return [];
  }

  return primaryRanking.entries
    .filter((entry) => entry.label.trim().length > 0)
    .map((entry, index) => {
      const teamOrNation = resolveEntryTeamOrNation(bundle, entry.label);
      const metricValue = formatRankingMetricValue(primaryRanking.metric, entry.value);
      return `${index + 1}. ${entry.label.trim()} — ${teamOrNation} — ${metricValue}`;
    });
}

function hasRankedPlayerData(bundle: CanonicalResearchBundle): boolean {
  return formatRankedPlayerData(bundle).length > 0;
}

function formatVerifiedFacts(facts: IntelligenceFact[]): string[] {
  const sources = new Set(
    facts.map((fact) => fact.provenance.source).filter((source) => source !== "inferred"),
  );
  const showSourceTags = sources.size > 1;

  return facts
    .map((fact) => {
      const text = fact.text.trim();
      if (!text) {
        return null;
      }

      if (showSourceTags && fact.provenance.source !== "inferred") {
        return `- ${text} [${formatProvenanceLabel(fact.provenance.source)}]`;
      }

      return `- ${text}`;
    })
    .filter((line): line is string => line != null);
}

function formatManualNotes(manualNotes: string | undefined): string[] {
  const trimmed = manualNotes?.trim();
  if (!trimmed) {
    return [];
  }

  return trimmed
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `- ${line}`);
}

function formatFixture(fixture: FootballResearchFixture, label = "Fixture"): string[] {
  const score =
    fixture.homeGoals != null && fixture.awayGoals != null
      ? `${fixture.homeGoals}-${fixture.awayGoals}`
      : "TBD";
  const status = fixture.status ? ` · ${fixture.status}` : "";

  return [
    `- ${label}: ${fixture.homeTeam} ${score} ${fixture.awayTeam}`,
    `  ${fixture.league}${fixture.season ? ` · season ${fixture.season}` : ""} · ${fixture.date.slice(0, 10)}${status}`,
  ];
}

function formatStatistics(statistics: FootballResearchStatistic[]): string[] {
  if (statistics.length === 0) {
    return [];
  }

  const byType = new Map<string, FootballResearchStatistic[]>();
  for (const stat of statistics) {
    const group = byType.get(stat.type) ?? [];
    group.push(stat);
    byType.set(stat.type, group);
  }

  const lines: string[] = [];
  for (const [type, entries] of byType) {
    const values = entries
      .map((entry) => `${entry.team} ${entry.value ?? "—"}`)
      .join(" · ");
    lines.push(`- ${type}: ${values}`);
  }

  return lines;
}

function formatEventMinute(event: FootballResearchEvent): string {
  if (event.minute == null) {
    return "?";
  }

  if (event.extraMinute != null && event.extraMinute > 0) {
    return `${event.minute}+${event.extraMinute}'`;
  }

  return `${event.minute}'`;
}

function formatEvents(events: FootballResearchEvent[], limit = 12): string[] {
  return events.slice(0, limit).map((event) => {
    const minute = formatEventMinute(event);
    const player = event.player ? ` ${event.player}` : "";
    const assist = event.assist ? ` (assist: ${event.assist})` : "";
    const detail = event.detail ? ` — ${event.detail}` : "";
    const type = event.type ? `${event.type}` : "Event";
    return `- ${minute} ${event.team}: ${type}${player}${assist}${detail}`;
  });
}

function formatLineups(lineups: FootballResearchLineup[]): string[] {
  const lines: string[] = [];

  for (const lineup of lineups) {
    lines.push(`- ${lineup.team}${lineup.formation ? ` (${lineup.formation})` : ""}`);
    if (lineup.startingXi.length > 0) {
      lines.push(`  Starting XI: ${lineup.startingXi.join(", ")}`);
    }
    if (lineup.substitutes.length > 0) {
      lines.push(`  Substitutes: ${lineup.substitutes.join(", ")}`);
    }
  }

  return lines;
}

function isRankingRelatedFact(text: string): boolean {
  return /#\d|rank|top \d|countdown|scorer|goal/i.test(text);
}

function appendTopFiveContext(
  lines: string[],
  bundle: CanonicalResearchBundle,
  warnings: string[],
): void {
  const rankedLines = formatRankedPlayerData(bundle);

  if (rankedLines.length > 0) {
    lines.push(
      "",
      "RANKING SCRIPT RULES (mandatory):",
      "- This is a ranked countdown script. RANKED PLAYER DATA below is the sole source for named players and goal totals.",
      "- Use the exact player names, team/nation labels, and goal totals from RANKED PLAYER DATA — do not change spelling, order, or numbers.",
      "- Do NOT write a generic story, filler list, or qualitative roundup when RANKED PLAYER DATA is present.",
      "- Do NOT introduce, mention, or invent any player beyond the ranked list below.",
    );
    pushSection(lines, "RANKED PLAYER DATA:", rankedLines);

    const rankingFacts = bundle.mergedFacts
      .filter((fact) => isRankingRelatedFact(fact.text))
      .map((fact) => `- ${fact.text.trim()}`);
    pushSection(lines, "Ranking notes:", rankingFacts);
    return;
  }

  warnings.push("No ranking data available from provider — use qualitative framing only.");
  pushSection(
    lines,
    "Available context (fallback):",
    formatVerifiedFacts(bundle.mergedFacts),
  );
}

function appendMatchPreviewContext(lines: string[], bundle: CanonicalResearchBundle): void {
  const fixture = bundle.fixtures[0];
  if (fixture) {
    pushSection(lines, "Upcoming fixture:", formatFixture(fixture, "Upcoming match"));
  }

  pushSection(lines, "Key players:", formatVerifiedFacts(
    bundle.mergedFacts.filter((fact) => /player|scorer|form/i.test(fact.text)),
  ));
}

function appendMatchRecapContext(lines: string[], bundle: CanonicalResearchBundle): void {
  const fixture = bundle.fixtures[0];
  if (fixture) {
    pushSection(lines, "Final score:", formatFixture(fixture, "Final"));
  }

  if (bundle.events.length > 0) {
    pushSection(lines, "Key events:", formatEvents(bundle.events));
  }

  if (bundle.statistics.length > 0) {
    pushSection(lines, "Match statistics:", formatStatistics(bundle.statistics));
  }
}

function appendTacticalReviewContext(lines: string[], bundle: CanonicalResearchBundle): void {
  if (bundle.lineups.length > 0) {
    pushSection(lines, "Formations & lineups:", formatLineups(bundle.lineups));
  }

  if (bundle.statistics.length > 0) {
    pushSection(lines, "Team statistics:", formatStatistics(bundle.statistics));
  }

  if (bundle.events.length > 0) {
    pushSection(lines, "In-match events:", formatEvents(bundle.events));
  }
}

function appendPlayerAnalysisContext(lines: string[], bundle: CanonicalResearchBundle): void {
  const playerEntity =
    bundle.mergedEntities.find((entity) => entity.kind === "player") ??
    bundle.mergedEntities[0];

  if (playerEntity) {
    pushSection(lines, "Player:", [`- ${playerEntity.label}`]);
  }

  pushSection(lines, "Known facts:", formatVerifiedFacts(bundle.mergedFacts));
}

function appendGeneralContext(lines: string[], bundle: CanonicalResearchBundle): void {
  const rankedLines = formatRankedPlayerData(bundle);
  if (rankedLines.length > 0) {
    pushSection(lines, "RANKED PLAYER DATA:", rankedLines);
  }

  if (bundle.fixtures.length === 1) {
    pushSection(lines, "Fixture:", formatFixture(bundle.fixtures[0]!));
  }

  pushSection(lines, "Verified facts:", formatVerifiedFacts(bundle.mergedFacts));
}

function appendWorldCup2026Grounding(lines: string[], bundle: CanonicalResearchBundle): void {
  if (!mentionsFifaWorldCup2026(bundle.query.input.topic)) {
    return;
  }

  const hasVerifiedPlayerProfile = bundle.mergedEntities.some(
    (entity) => entity.kind === "player",
  );

  pushSection(
    lines,
    "FIFA WORLD CUP 2026 GROUNDING (mandatory):",
    buildFifaWorldCup2026ContextRules(hasVerifiedPlayerProfile),
  );
}

/**
 * Converts a canonical research bundle into prompt-ready context text for script
 * generation. Structured bundle fields stay typed until the final string output.
 *
 * @deprecated test/legacy only — do not use in production path.
 */
export function bundleToResearchContextText(bundle: CanonicalResearchBundle): string {
  const mode = bundle.query.input.selectedMode;
  const topic = bundle.query.input.topic.trim();
  const hasRankedPlayers = hasRankedPlayerData(bundle);
  const groundingRule =
    hasRankedPlayers && mode === "top_5"
      ? "Use only the ranked players and goal totals in RANKED PLAYER DATA. Do not invent players, scores, or stats beyond this context."
      : "Use only the verified facts below. Do not invent exact scores, stats, dates, or records beyond this context.";

  const provenanceOperations = bundle.provenance.operations?.filter(Boolean) ?? [];
  const provenanceLine = [
    `Research source: ${formatProvenanceLabel(bundle.provenance.source)}`,
    ...(provenanceOperations.length
      ? [`Data operations: ${provenanceOperations.join(", ")}`]
      : []),
    `Research confidence: ${bundle.confidence.tier} (${bundle.confidence.percent}%)`,
  ];

  const lines: string[] = [
    HEADER,
    "",
    `Mode: ${formatModeLabel(mode)}`,
    `Topic: ${topic}`,
    `Summary: ${resolveSummary(bundle)}`,
    ...provenanceLine,
    "",
    groundingRule,
  ];

  const warnings = [...bundle.warnings];

  appendWorldCup2026Grounding(lines, bundle);

  switch (mode) {
    case "tactical_review":
      appendTacticalReviewContext(lines, bundle);
      break;
    case "match_preview":
      appendMatchPreviewContext(lines, bundle);
      if (bundle.statistics.length > 0) {
        pushSection(lines, "Match statistics:", formatStatistics(bundle.statistics));
      }
      break;
    case "match_recap":
      appendMatchRecapContext(lines, bundle);
      break;
    case "player_analysis":
      appendPlayerAnalysisContext(lines, bundle);
      break;
    case "top_5":
      appendTopFiveContext(lines, bundle, warnings);
      break;
    case "historical_explainer":
    case "opinion_debate":
    case "story":
    default:
      appendGeneralContext(lines, bundle);
      break;
  }

  const manualNotes = formatManualNotes(bundle.query.input.manualNotes);
  if (manualNotes.length > 0) {
    pushSection(
      lines,
      "CREATOR NOTES (manual — not provider-verified):",
      manualNotes,
    );
  }

  const uniqueWarnings = [...new Set(warnings.map((warning) => warning.trim()).filter(Boolean))];
  if (uniqueWarnings.length > 0) {
    pushSection(
      lines,
      "Warnings (grounding constraints):",
      uniqueWarnings.map((warning) => `- ${warning}`),
    );
  }

  return lines.join("\n").trim();
}
