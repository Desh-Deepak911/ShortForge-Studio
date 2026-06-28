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
import type { IntelligenceEntity } from "../shared/entity.types";
import type { IntelligenceFact } from "../shared/knowledge.types";

import type { AssembledContext } from "./assembled-context.types";

interface PromptBlock {
  title: string;
  lines: string[];
}

function pushBlock(blocks: PromptBlock[], block: PromptBlock): void {
  if (block.lines.length === 0) {
    return;
  }

  blocks.push(block);
}

function block(title: string, lines: string[]): PromptBlock {
  return {
    title,
    lines: lines.filter((line) => line.trim().length > 0),
  };
}

function formatModeLabel(mode: ScriptMode): string {
  return mode.replace(/_/g, " ");
}

function formatProvenanceLabel(source: AssembledContext["provenance"]["source"]): string {
  return source.replace(/-/g, " ");
}

function resolveSummary(assembled: AssembledContext): string {
  const firstFact = assembled.verifiedFacts.find((fact) => fact.text.trim().length > 0);
  if (firstFact) {
    return firstFact.text.trim();
  }

  const fixture = assembled.fixtures[0];
  if (fixture) {
    return `${fixture.homeTeam} vs ${fixture.awayTeam}`;
  }

  return `Research brief: ${assembled.topic}`;
}

function resolveEntryTeamOrNation(assembled: AssembledContext, label: string): string {
  const entity = assembled.entities.find((candidate) => candidate.label === label);
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

function formatRankingMetricLabel(metric: IntelligenceResearchRanking["metric"]): string {
  switch (metric) {
    case "goals":
      return "Goals";
    case "assists":
      return "Assists";
    default:
      return "Value";
  }
}

function formatRankingLines(assembled: AssembledContext): string[] {
  const lines: string[] = [];

  for (const ranking of assembled.rankings) {
    const entries = ranking.entries.filter((entry) => entry.label.trim().length > 0);
    if (entries.length === 0) {
      continue;
    }

    if (assembled.rankings.length > 1) {
      lines.push(`- ${formatRankingMetricLabel(ranking.metric)}:`);
    }

    for (const [index, entry] of entries.entries()) {
      const rank = entry.rank > 0 ? entry.rank : index + 1;
      const teamOrNation = resolveEntryTeamOrNation(assembled, entry.label);
      const metricValue = formatRankingMetricValue(ranking.metric, entry.value);
      lines.push(`${rank}. ${entry.label.trim()} — ${teamOrNation} — ${metricValue}`);
    }
  }

  return lines;
}

function hasRankings(assembled: AssembledContext): boolean {
  return assembled.rankings.some((ranking) =>
    ranking.entries.some((entry) => entry.label.trim().length > 0),
  );
}

function formatVerifiedFactLines(facts: IntelligenceFact[]): string[] {
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

function formatEntityLines(entities: IntelligenceEntity[]): string[] {
  return entities
    .filter((entity) => entity.label.trim().length > 0)
    .map((entity) => {
      const status =
        entity.status !== "resolved" ? ` (${entity.status.replace(/_/g, " ")})` : "";
      return `- ${entity.kind.replace(/_/g, " ")}: ${entity.label.trim()}${status}`;
    });
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

function buildMetadataBlock(assembled: AssembledContext): PromptBlock {
  const lines = [
    `Mode: ${formatModeLabel(assembled.selectedMode)}`,
    `Topic: ${assembled.topic}`,
    `Summary: ${resolveSummary(assembled)}`,
    ...(assembled.competition?.label ? [`Competition: ${assembled.competition.label}`] : []),
    ...(assembled.season != null ? [`Season: ${assembled.season}`] : []),
    `Research source: ${formatProvenanceLabel(assembled.provenance.source)}`,
    ...(assembled.provenance.operations?.length
      ? [`Data operations: ${assembled.provenance.operations.join(", ")}`]
      : []),
    `Research confidence: ${assembled.confidence.tier} (${assembled.confidence.percent}%)`,
  ];

  return block("RESEARCHED FOOTBALL CONTEXT", lines);
}

function buildGroundingRulesBlock(assembled: AssembledContext): PromptBlock {
  const ranked = hasRankings(assembled);
  const lines = [
    ranked && assembled.selectedMode === "top_5"
      ? "Use only the ranked entries and values in RANKINGS. Do not invent players, scores, or stats beyond this context."
      : "Use only the verified facts below. Do not invent exact scores, stats, dates, or records beyond this context.",
  ];

  if (mentionsFifaWorldCup2026(assembled.topic)) {
    const hasVerifiedPlayer = assembled.entities.some((entity) => entity.kind === "player");
    lines.push(...buildFifaWorldCup2026ContextRules(hasVerifiedPlayer));
  }

  return block("Grounding rules:", lines);
}

function appendTop5Blocks(blocks: PromptBlock[], assembled: AssembledContext): void {
  const rankingLines = formatRankingLines(assembled);

  if (rankingLines.length > 0) {
    pushBlock(
      blocks,
      block("RANKINGS:", [
        "- Exact order and values below must be preserved in the script.",
        ...rankingLines,
      ]),
    );

    const rankingFacts = formatVerifiedFactLines(
      assembled.verifiedFacts.filter((fact) => isRankingRelatedFact(fact.text)),
    );
    if (rankingFacts.length > 0) {
      pushBlock(blocks, block("Ranking notes:", rankingFacts));
    }

    return;
  }

  const fallbackFacts = formatVerifiedFactLines(assembled.verifiedFacts);
  if (fallbackFacts.length > 0) {
    pushBlock(blocks, block("Available context (fallback):", fallbackFacts));
  }
}

function appendPlayerAnalysisBlocks(blocks: PromptBlock[], assembled: AssembledContext): void {
  const entityLines = formatEntityLines(assembled.entities);
  if (entityLines.length > 0) {
    pushBlock(blocks, block("Resolved entities:", entityLines));
  }

  const factLines = formatVerifiedFactLines(assembled.verifiedFacts);
  if (factLines.length > 0) {
    pushBlock(blocks, block("Verified player facts:", factLines));
  }
}

function appendMatchPreviewBlocks(blocks: PromptBlock[], assembled: AssembledContext): void {
  const fixture = assembled.fixtures[0];
  if (fixture) {
    pushBlock(
      blocks,
      block("Upcoming fixture:", formatFixture(fixture, "Upcoming match")),
    );
  }

  const playerFacts = formatVerifiedFactLines(
    assembled.verifiedFacts.filter((fact) => /player|scorer|form/i.test(fact.text)),
  );
  if (playerFacts.length > 0) {
    pushBlock(blocks, block("Key players:", playerFacts));
  }

  if (assembled.statistics.length > 0) {
    pushBlock(
      blocks,
      block("Match statistics:", formatStatistics(assembled.statistics)),
    );
  }
}

function appendMatchRecapBlocks(blocks: PromptBlock[], assembled: AssembledContext): void {
  const fixture = assembled.fixtures[0];
  if (fixture) {
    pushBlock(blocks, block("Final score:", formatFixture(fixture, "Final")));
  }

  if (assembled.events.length > 0) {
    pushBlock(blocks, block("Key events:", formatEvents(assembled.events)));
  }

  if (assembled.statistics.length > 0) {
    pushBlock(
      blocks,
      block("Match statistics:", formatStatistics(assembled.statistics)),
    );
  }
}

function appendTacticalReviewBlocks(blocks: PromptBlock[], assembled: AssembledContext): void {
  if (assembled.lineups.length > 0) {
    pushBlock(blocks, block("Formations & lineups:", formatLineups(assembled.lineups)));
  }

  if (assembled.statistics.length > 0) {
    pushBlock(
      blocks,
      block("Match statistics:", formatStatistics(assembled.statistics)),
    );
  }

  if (assembled.events.length > 0) {
    pushBlock(blocks, block("Key events:", formatEvents(assembled.events)));
  }

  const factLines = formatVerifiedFactLines(assembled.verifiedFacts);
  if (factLines.length > 0) {
    pushBlock(blocks, block("Known facts:", factLines));
  }
}

function appendDefaultBlocks(blocks: PromptBlock[], assembled: AssembledContext): void {
  const rankingLines = formatRankingLines(assembled);
  if (rankingLines.length > 0) {
    pushBlock(blocks, block("RANKINGS:", rankingLines));
  }

  if (assembled.fixtures.length === 1) {
    pushBlock(
      blocks,
      block("Fixture:", formatFixture(assembled.fixtures[0]!)),
    );
  }

  const factLines = formatVerifiedFactLines(assembled.verifiedFacts);
  if (factLines.length > 0) {
    pushBlock(blocks, block("Verified facts:", factLines));
  }
}

function appendModeBlocks(blocks: PromptBlock[], assembled: AssembledContext): void {
  switch (assembled.selectedMode) {
    case "top_5":
      appendTop5Blocks(blocks, assembled);
      break;
    case "player_analysis":
      appendPlayerAnalysisBlocks(blocks, assembled);
      break;
    case "match_preview":
      appendMatchPreviewBlocks(blocks, assembled);
      break;
    case "match_recap":
      appendMatchRecapBlocks(blocks, assembled);
      break;
    case "tactical_review":
      appendTacticalReviewBlocks(blocks, assembled);
      break;
    default:
      appendDefaultBlocks(blocks, assembled);
      break;
  }
}

function buildManualNotesBlock(assembled: AssembledContext): PromptBlock | null {
  const manualNotes = assembled.manualNotes?.trim();
  if (!manualNotes) {
    return null;
  }

  return block(
    "CREATOR NOTES (manual — not provider-verified):",
    manualNotes
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `- ${line}`),
  );
}

function buildWarningsBlock(assembled: AssembledContext): PromptBlock | null {
  const uniqueWarnings = [
    ...new Set(assembled.warnings.map((warning) => warning.trim()).filter(Boolean)),
  ];

  if (uniqueWarnings.length === 0) {
    return null;
  }

  return block(
    "Warnings (grounding constraints):",
    uniqueWarnings.map((warning) => `- ${warning}`),
  );
}

function renderPromptBlocks(blocks: PromptBlock[]): string {
  const lines: string[] = [];

  for (const [index, promptBlock] of blocks.entries()) {
    if (index > 0) {
      lines.push("");
    }

    lines.push(promptBlock.title);
    lines.push(...promptBlock.lines);
  }

  return lines.join("\n").trim();
}

/**
 * Converts structured assembled research into prompt-ready text.
 *
 * Only verified provider data is included — nothing is invented when fields are absent.
 */
export function assembledContextToPrompt(assembled: AssembledContext): string {
  const blocks: PromptBlock[] = [];

  pushBlock(blocks, buildMetadataBlock(assembled));
  pushBlock(blocks, buildGroundingRulesBlock(assembled));
  appendModeBlocks(blocks, assembled);

  const manualNotesBlock = buildManualNotesBlock(assembled);
  if (manualNotesBlock) {
    pushBlock(blocks, manualNotesBlock);
  }

  const warningsBlock = buildWarningsBlock(assembled);
  if (warningsBlock) {
    pushBlock(blocks, warningsBlock);
  }

  return renderPromptBlocks(blocks);
}

/** @deprecated Use `assembledContextToPrompt`. test/legacy only — do not use in production path. */
export const assembledContextToPromptText = assembledContextToPrompt;
