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

import type { IntelligenceResearchRanking } from "../providers/provider-result.types";
import type { IntelligenceFact } from "../shared/knowledge.types";

import type {
  AssembledPromptSection,
  AssembledPromptSectionKind,
} from "./assembled-context.types";
import type { CanonicalResearchBundle } from "./canonical-research.types";

function pushSection(
  sections: AssembledPromptSection[],
  section: AssembledPromptSection,
): void {
  if (section.lines.length === 0) {
    return;
  }

  sections.push(section);
}

function section(
  kind: AssembledPromptSectionKind,
  title: string,
  lines: string[],
  verified = true,
): AssembledPromptSection {
  return {
    kind,
    title,
    lines: lines.filter((line) => line.trim().length > 0),
    verified,
  };
}

function formatModeLabel(mode: CanonicalResearchBundle["query"]["input"]["selectedMode"]): string {
  return mode.replace(/_/g, " ");
}

function formatProvenanceLabel(
  source: CanonicalResearchBundle["provenance"]["source"],
): string {
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

function resolveEntryTeamOrNation(bundle: CanonicalResearchBundle, label: string): string {
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

function formatRankedPlayerLines(bundle: CanonicalResearchBundle): string[] {
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

function appendModeSections(
  sections: AssembledPromptSection[],
  bundle: CanonicalResearchBundle,
): void {
  const mode = bundle.query.input.selectedMode;
  const rankedLines = formatRankedPlayerLines(bundle);

  switch (mode) {
    case "top_5":
      if (rankedLines.length > 0) {
        pushSection(
          sections,
          section("ranking_script_rules", "RANKING SCRIPT RULES (mandatory):", [
            "- This is a ranked countdown script. RANKED PLAYER DATA below is the sole source for named players and goal totals.",
            "- Use the exact player names, team/nation labels, and goal totals from RANKED PLAYER DATA — do not change spelling, order, or numbers.",
            "- Do NOT write a generic story, filler list, or qualitative roundup when RANKED PLAYER DATA is present.",
            "- Do NOT introduce, mention, or invent any player beyond the ranked list below.",
          ]),
        );
        pushSection(sections, section("ranked_player_data", "RANKED PLAYER DATA:", rankedLines));
        pushSection(
          sections,
          section(
            "ranking_notes",
            "Ranking notes:",
            formatVerifiedFactLines(
              bundle.mergedFacts.filter((fact) => isRankingRelatedFact(fact.text)),
            ),
          ),
        );
      } else {
        pushSection(
          sections,
          section(
            "verified_facts",
            "Available context (fallback):",
            formatVerifiedFactLines(bundle.mergedFacts),
          ),
        );
      }
      break;
    case "match_preview": {
      const fixture = bundle.fixtures[0];
      if (fixture) {
        pushSection(
          sections,
          section("fixture", "Upcoming fixture:", formatFixture(fixture, "Upcoming match")),
        );
      }
      pushSection(
        sections,
        section(
          "verified_facts",
          "Key players:",
          formatVerifiedFactLines(
            bundle.mergedFacts.filter((fact) => /player|scorer|form/i.test(fact.text)),
          ),
        ),
      );
      if (bundle.statistics.length > 0) {
        pushSection(
          sections,
          section("statistics", "Match statistics:", formatStatistics(bundle.statistics)),
        );
      }
      break;
    }
    case "match_recap": {
      const fixture = bundle.fixtures[0];
      if (fixture) {
        pushSection(
          sections,
          section("fixture", "Final score:", formatFixture(fixture, "Final")),
        );
      }
      if (bundle.events.length > 0) {
        pushSection(sections, section("events", "Key events:", formatEvents(bundle.events)));
      }
      if (bundle.statistics.length > 0) {
        pushSection(
          sections,
          section("statistics", "Match statistics:", formatStatistics(bundle.statistics)),
        );
      }
      break;
    }
    case "tactical_review":
      if (bundle.lineups.length > 0) {
        pushSection(
          sections,
          section("lineups", "Formations & lineups:", formatLineups(bundle.lineups)),
        );
      }
      if (bundle.statistics.length > 0) {
        pushSection(
          sections,
          section("statistics", "Match statistics:", formatStatistics(bundle.statistics)),
        );
      }
      pushSection(
        sections,
        section("verified_facts", "Known facts:", formatVerifiedFactLines(bundle.mergedFacts)),
      );
      break;
    case "player_analysis":
      pushSection(
        sections,
        section("verified_facts", "Verified player facts:", formatVerifiedFactLines(bundle.mergedFacts)),
      );
      break;
    default:
      if (rankedLines.length > 0) {
        pushSection(sections, section("ranked_player_data", "RANKED PLAYER DATA:", rankedLines));
      }
      if (bundle.fixtures.length === 1) {
        pushSection(
          sections,
          section("fixture", "Fixture:", formatFixture(bundle.fixtures[0]!)),
        );
      }
      pushSection(
        sections,
        section("verified_facts", "Verified facts:", formatVerifiedFactLines(bundle.mergedFacts)),
      );
      break;
  }
}

/** @deprecated Test/legacy only — production uses `assembledContextToPrompt()`. */
export function buildPromptSectionsFromBundle(
  bundle: CanonicalResearchBundle,
): AssembledPromptSection[] {
  const mode = bundle.query.input.selectedMode;
  const topic = bundle.query.input.topic.trim();
  const rankedLines = formatRankedPlayerLines(bundle);
  const provenanceOperations = bundle.provenance.operations?.filter(Boolean) ?? [];
  const sections: AssembledPromptSection[] = [];

  pushSection(
    sections,
    section("metadata", "RESEARCHED FOOTBALL CONTEXT", [
      `Mode: ${formatModeLabel(mode)}`,
      `Topic: ${topic}`,
      `Summary: ${resolveSummary(bundle)}`,
      `Research source: ${formatProvenanceLabel(bundle.provenance.source)}`,
      ...(provenanceOperations.length
        ? [`Data operations: ${provenanceOperations.join(", ")}`]
        : []),
      `Research confidence: ${bundle.confidence.tier} (${bundle.confidence.percent}%)`,
    ]),
  );

  const groundingRule =
    rankedLines.length > 0 && mode === "top_5"
      ? "Use only the ranked players and goal totals in RANKED PLAYER DATA. Do not invent players, scores, or stats beyond this context."
      : "Use only the verified facts below. Do not invent exact scores, stats, dates, or records beyond this context.";

  pushSection(sections, section("grounding_rules", "Grounding rules:", [groundingRule]));

  if (mentionsFifaWorldCup2026(topic)) {
    const hasVerifiedPlayerProfile = bundle.mergedEntities.some(
      (entity) => entity.kind === "player",
    );
    pushSection(
      sections,
      section(
        "grounding_rules",
        "FIFA WORLD CUP 2026 GROUNDING (mandatory):",
        buildFifaWorldCup2026ContextRules(hasVerifiedPlayerProfile),
      ),
    );
  }

  appendModeSections(sections, bundle);

  const manualNotes = bundle.query.input.manualNotes?.trim();
  if (manualNotes) {
    pushSection(
      sections,
      section(
        "manual_notes",
        "CREATOR NOTES (manual — not provider-verified):",
        manualNotes
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => `- ${line}`),
        false,
      ),
    );
  }

  const uniqueWarnings = [
    ...new Set(bundle.warnings.map((warning) => warning.trim()).filter(Boolean)),
  ];
  if (uniqueWarnings.length > 0) {
    pushSection(
      sections,
      section(
        "warnings",
        "Warnings (grounding constraints):",
        uniqueWarnings.map((warning) => `- ${warning}`),
        false,
      ),
    );
  }

  return sections;
}

/** @deprecated Test/legacy only — production uses `assembledContextToPrompt()`. */
export function renderAssembledPromptSections(sections: AssembledPromptSection[]): string {
  const lines: string[] = [];

  for (const [index, block] of sections.entries()) {
    if (index > 0) {
      lines.push("");
    }

    lines.push(block.title);
    lines.push(...block.lines);
  }

  return lines.join("\n").trim();
}
