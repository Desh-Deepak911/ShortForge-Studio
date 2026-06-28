import type {
  FootballResearchContext,
  FootballResearchEvent,
  FootballResearchFixture,
  FootballResearchLineup,
  FootballResearchMode,
  FootballResearchPlayer,
  FootballResearchStandings,
  FootballResearchStatistic,
  FootballResearchTeam,
} from "@/features/research/types/football-research.types";
import {
  buildFifaWorldCup2026ContextRules,
  mentionsFifaWorldCup2026,
} from "@/features/research/utils/research-grounding.utils";
import {
  buildVerifiedPlayerFactLines,
  buildVerifiedPlayerFactStrings,
  collectPlayerAnalysisUnknowns,
} from "@/features/research/utils/player-analysis.utils";

const HEADER = "RESEARCHED FOOTBALL CONTEXT";

function pushSection(lines: string[], title: string, body: string[]): void {
  const content = body.filter((line) => line.trim().length > 0);
  if (content.length === 0) {
    return;
  }

  lines.push("", title, ...content);
}

function formatModeLabel(mode: FootballResearchMode): string {
  return mode.replace(/_/g, " ");
}

function formatTeams(teams: FootballResearchTeam[] | undefined): string[] {
  if (!teams?.length) {
    return [];
  }

  return teams.map((team) => `- ${team.name}${team.country ? ` (${team.country})` : ""}`);
}

function formatFixture(fixture: FootballResearchFixture | undefined, label = "Fixture"): string[] {
  if (!fixture) {
    return [];
  }

  const score =
    fixture.homeGoals != null && fixture.awayGoals != null
      ? `${fixture.homeGoals}-${fixture.awayGoals}`
      : "TBD";
  const status = fixture.status ? ` · ${fixture.status}` : "";
  const round = fixture.round ? ` · ${fixture.round}` : "";

  return [
    `- ${label}: ${fixture.homeTeam} ${score} ${fixture.awayTeam}`,
    `  ${fixture.league}${fixture.season ? ` · season ${fixture.season}` : ""} · ${fixture.date.slice(0, 10)}${status}${round}`,
  ];
}

function formatStatistics(statistics: FootballResearchStatistic[] | undefined): string[] {
  if (!statistics?.length) {
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

function formatEvents(events: FootballResearchEvent[] | undefined, limit = 12): string[] {
  if (!events?.length) {
    return [];
  }

  return events.slice(0, limit).map((event) => {
    const minute = formatEventMinute(event);
    const player = event.player ? ` ${event.player}` : "";
    const assist = event.assist ? ` (assist: ${event.assist})` : "";
    const detail = event.detail ? ` — ${event.detail}` : "";
    const type = event.type ? `${event.type}` : "Event";
    return `- ${minute} ${event.team}: ${type}${player}${assist}${detail}`;
  });
}

function formatLineups(lineups: FootballResearchLineup[] | undefined): string[] {
  if (!lineups?.length) {
    return [];
  }

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

function formatSubstitutions(events: FootballResearchEvent[] | undefined): string[] {
  if (!events?.length) {
    return [];
  }

  return events
    .filter((event) => event.type?.toLowerCase() === "subst")
    .map((event) => {
      const minute = formatEventMinute(event);
      const detail = event.detail ? `: ${event.detail}` : "";
      return `- ${minute} ${event.team}${detail}`;
    });
}

function formatStandings(standings: FootballResearchStandings[] | undefined, limit = 10): string[] {
  if (!standings?.length) {
    return [];
  }

  const lines: string[] = [];
  for (const table of standings) {
    lines.push(`- ${table.league} · season ${table.season}`);
    for (const row of table.rows.slice(0, limit)) {
      const form = row.form ? ` · form ${row.form}` : "";
      lines.push(
        `  #${row.rank} ${row.team}: ${row.points} pts · ${row.played} played · GD ${row.goalDifference}${form}`,
      );
    }
  }

  return lines;
}

function formatPlayers(players: FootballResearchPlayer[] | undefined, limit = 5): string[] {
  if (!players?.length) {
    return [];
  }

  return players.slice(0, limit).map((player) => {
    const meta = [
      player.position,
      player.team,
      player.league,
      player.season ? `season ${player.season}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const stats = [
      player.appearances != null ? `${player.appearances} apps` : null,
      player.goals != null ? `${player.goals} goals` : null,
      player.assists != null ? `${player.assists} assists` : null,
      player.rating ? `rating ${player.rating}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const lines = [`- ${player.name}${player.nationality ? ` (${player.nationality})` : ""}`];
    if (meta) {
      lines.push(`  ${meta}`);
    }
    if (stats) {
      lines.push(`  Season stats: ${stats}`);
    }
    return lines.join("\n");
  });
}

function formatFacts(facts: string[]): string[] {
  return facts.map((fact) => `- ${fact}`);
}

function formatPlayerTeamOrNation(player: FootballResearchPlayer): string {
  return player.team?.trim() || player.nationality?.trim() || "—";
}

function getRankedPlayers(researchContext: FootballResearchContext): FootballResearchPlayer[] {
  const players = researchContext.players ?? [];
  const rankedPlayers = players.filter((player) => player.name.trim().length > 0 && player.goals != null);

  if (rankedPlayers.length === 0) {
    return [];
  }

  return [...rankedPlayers].sort((left, right) => (right.goals ?? 0) - (left.goals ?? 0));
}

function hasPlayerRankings(researchContext: FootballResearchContext): boolean {
  return getRankedPlayers(researchContext).length > 0;
}

function formatRankedPlayerData(players: FootballResearchPlayer[]): string[] {
  return players.map((player, index) => {
    const goals = player.goals ?? "—";
    return `${index + 1}. ${player.name} — ${formatPlayerTeamOrNation(player)} — ${goals}`;
  });
}

function appendRankedPlayerDataSection(
  lines: string[],
  researchContext: FootballResearchContext,
): boolean {
  const rankedPlayers = getRankedPlayers(researchContext);
  if (rankedPlayers.length === 0) {
    return false;
  }

  pushSection(lines, "RANKED PLAYER DATA:", formatRankedPlayerData(rankedPlayers));
  return true;
}

function hasRankingData(researchContext: FootballResearchContext): boolean {
  if (hasPlayerRankings(researchContext)) {
    return true;
  }

  const standingsRows = researchContext.standings?.some((table) => table.rows.length > 0) ?? false;
  const playerStats =
    researchContext.players?.some(
      (player) =>
        player.assists != null ||
        player.appearances != null ||
        Boolean(player.rating),
    ) ?? false;

  return standingsRows || playerStats;
}

function collectProviderWarnings(researchContext: FootballResearchContext): string[] {
  const warnings = [...researchContext.warnings];
  const statTypes =
    researchContext.statistics?.map((stat) => stat.type.toLowerCase()) ?? [];
  const hasExpectedGoals = statTypes.some(
    (type) => type.includes("expected goals") || type === "xg",
  );

  if (researchContext.statistics?.length && !hasExpectedGoals) {
    warnings.push("Exact xG unavailable from provider.");
  }

  return warnings;
}

function appendGeneralContext(lines: string[], researchContext: FootballResearchContext): void {
  appendRankedPlayerDataSection(lines, researchContext);
  pushSection(lines, "Teams:", formatTeams(researchContext.teams));
  pushSection(lines, "Players:", formatPlayers(researchContext.players));
  pushSection(lines, "Fixture:", formatFixture(researchContext.fixture));
  pushSection(lines, "Match statistics:", formatStatistics(researchContext.statistics));
  pushSection(lines, "Events:", formatEvents(researchContext.events));
  pushSection(lines, "Lineups:", formatLineups(researchContext.lineups));
  pushSection(lines, "Standings:", formatStandings(researchContext.standings));
}

function appendTacticalReview(lines: string[], researchContext: FootballResearchContext): void {
  pushSection(lines, "Formations & lineups:", formatLineups(researchContext.lineups));
  pushSection(lines, "Team statistics:", formatStatistics(researchContext.statistics));
  pushSection(lines, "In-match events:", formatEvents(researchContext.events));
  pushSection(lines, "Substitutions:", formatSubstitutions(researchContext.events));

  const tacticalFacts = researchContext.facts.filter((fact) =>
    /press|shape|block|transition|formation|pattern|midfield|wide|build-up|line/i.test(fact),
  );
  if (tacticalFacts.length > 0) {
    pushSection(lines, "Key tactical patterns:", formatFacts(tacticalFacts));
  } else if (researchContext.facts.length > 0) {
    pushSection(lines, "Key tactical patterns:", formatFacts(researchContext.facts));
  }
}

function appendMatchPreview(lines: string[], researchContext: FootballResearchContext): void {
  pushSection(
    lines,
    "Upcoming fixture:",
    formatFixture(researchContext.fixture, "Upcoming match"),
  );
  pushSection(lines, "Standings:", formatStandings(researchContext.standings));

  const formFacts = researchContext.facts.filter((fact) => /form|streak| unbeaten| winless/i.test(fact));
  if (formFacts.length > 0) {
    pushSection(lines, "Recent form:", formatFacts(formFacts));
  } else {
    const formFromStandings =
      researchContext.standings?.flatMap((table) =>
        table.rows
          .filter((row) => row.form)
          .slice(0, 6)
          .map((row) => `- ${row.team}: form ${row.form}`),
      ) ?? [];
    pushSection(lines, "Recent form:", formFromStandings);
  }

  pushSection(lines, "Key players:", formatPlayers(researchContext.players));

  const stakeFacts = researchContext.facts.filter((fact) =>
    /stake|title|race|relegation|qualification|derby|cup|knockout|top four|survival|pressure/i.test(
      fact,
    ),
  );
  if (stakeFacts.length > 0) {
    pushSection(lines, "Stakes:", formatFacts(stakeFacts));
  }
}

function appendMatchRecap(lines: string[], researchContext: FootballResearchContext): void {
  pushSection(lines, "Final score:", formatFixture(researchContext.fixture, "Final"));
  pushSection(lines, "Key events:", formatEvents(researchContext.events));
  pushSection(lines, "Match statistics:", formatStatistics(researchContext.statistics));

  const turningPointFacts = researchContext.facts.filter((fact) =>
    /turning point|momentum|shift|decisive|changed the game|breakthrough|comeback|red card|penalty|goal/i.test(
      fact,
    ),
  );
  if (turningPointFacts.length > 0) {
    pushSection(lines, "Turning points:", formatFacts(turningPointFacts));
  }

  pushSection(lines, "Player impact:", formatPlayers(researchContext.players));
}

function appendPlayerAnalysis(lines: string[], researchContext: FootballResearchContext): void {
  const intent = researchContext.playerAnalysisIntent;
  const player = researchContext.players?.[0];
  const playerLabel = player?.name ?? intent?.playerName ?? researchContext.topic.trim();

  pushSection(lines, "Player:", [`- ${playerLabel}`]);

  const teamNationLines: string[] = [];
  if (player?.team) {
    teamNationLines.push(`- Club: ${player.team}`);
  }
  if (player?.nationality) {
    teamNationLines.push(`- Nationality: ${player.nationality}`);
  }
  pushSection(lines, "Team/Nation:", teamNationLines);

  const competitionLines: string[] = [];
  if (intent?.competitionLabel) {
    competitionLines.push(`- ${intent.competitionLabel}`);
  }
  if (intent?.year != null) {
    competitionLines.push(`- Year: ${intent.year}`);
  }
  if (intent?.competitionKey === "fifa_world_cup_2026") {
    competitionLines.push("- Host nations: USA, Canada, Mexico");
  }
  pushSection(lines, "Competition:", competitionLines);

  const apiFactLines = player ? buildVerifiedPlayerFactLines(player) : [];
  const apiFactStrings = new Set(player ? buildVerifiedPlayerFactStrings(player) : []);
  const tournamentFacts = researchContext.facts
    .filter((fact) => !apiFactStrings.has(fact))
    .map((fact) => `- ${fact}`);
  const knownFacts = [...new Set([...apiFactLines, ...tournamentFacts])];
  pushSection(lines, "Known facts:", knownFacts);

  const unknownLines = collectPlayerAnalysisUnknowns(researchContext).map(
    (unknown) => `- ${unknown}`,
  );
  pushSection(lines, "Unknowns:", unknownLines);
}

function appendTopFive(
  lines: string[],
  researchContext: FootballResearchContext,
  warnings: string[],
): void {
  const rankedPlayers = getRankedPlayers(researchContext);

  if (rankedPlayers.length > 0) {
    lines.push(
      "",
      "RANKING SCRIPT RULES (mandatory):",
      "- This is a ranked countdown script. RANKED PLAYER DATA below is the sole source for named players and goal totals.",
      "- Use the exact player names, team/nation labels, and goal totals from RANKED PLAYER DATA — do not change spelling, order, or numbers.",
      "- Do NOT write a generic story, filler list, or qualitative roundup when RANKED PLAYER DATA is present.",
      "- Do NOT introduce, mention, or invent any player beyond the ranked list below.",
    );
    pushSection(lines, "RANKED PLAYER DATA:", formatRankedPlayerData(rankedPlayers));

    const rankingFacts = researchContext.facts.filter((fact) => /#\d|rank|top \d|countdown/i.test(fact));
    if (rankingFacts.length > 0) {
      pushSection(lines, "Ranking notes:", formatFacts(rankingFacts));
    }

    return;
  }

  if (!hasRankingData(researchContext)) {
    warnings.push("No ranking data available from provider — use qualitative framing only.");
    pushSection(lines, "Available context (fallback):", [
      ...formatTeams(researchContext.teams),
      ...formatFixture(researchContext.fixture),
      ...formatFacts(researchContext.facts),
    ]);
    return;
  }

  pushSection(lines, "Rankings:", formatStandings(researchContext.standings, 5));
  pushSection(lines, "Players:", formatPlayers(researchContext.players, 5));

  const rankingFacts = researchContext.facts.filter((fact) => /#\d|rank|top \d|countdown/i.test(fact));
  if (rankingFacts.length > 0) {
    pushSection(lines, "Ranking notes:", formatFacts(rankingFacts));
  }
}

function appendWorldCup2026Grounding(
  lines: string[],
  researchContext: FootballResearchContext,
): void {
  if (!mentionsFifaWorldCup2026(researchContext.topic)) {
    return;
  }

  const hasVerifiedPlayerProfile = (researchContext.players?.length ?? 0) > 0;
  pushSection(
    lines,
    "FIFA WORLD CUP 2026 GROUNDING (mandatory):",
    buildFifaWorldCup2026ContextRules(hasVerifiedPlayerProfile),
  );
}

function appendGeneralModes(lines: string[], researchContext: FootballResearchContext): void {
  appendGeneralContext(lines, researchContext);
  pushSection(lines, "Supporting facts:", formatFacts(researchContext.facts));
}

/**
 * Converts structured football research into a prompt-ready text block.
 * Does not generate narration — only formats verified research for script generation.
 *
 * @deprecated Prefer `assembledContextToPrompt` — tests and legacy adapters only.
 * @deprecated test/legacy only — do not use in production path.
 */
export function buildFootballResearchContextText(
  researchContext: FootballResearchContext,
): string {
  const hasRankedPlayers = hasPlayerRankings(researchContext);
  const groundingRule = hasRankedPlayers && researchContext.mode === "top_5"
    ? "Use only the ranked players and goal totals in RANKED PLAYER DATA. Do not invent players, scores, or stats beyond this context."
    : "Use only the facts below. Do not invent exact scores, stats, dates, or records beyond this context.";

  const lines: string[] = [
    HEADER,
    "",
    `Mode: ${formatModeLabel(researchContext.mode)}`,
    `Topic: ${researchContext.topic.trim()}`,
    `Summary: ${researchContext.summary.trim()}`,
    `Source: ${researchContext.source}`,
    "",
    groundingRule,
  ];

  const warnings = collectProviderWarnings(researchContext);

  appendWorldCup2026Grounding(lines, researchContext);

  switch (researchContext.mode) {
    case "tactical_review":
      appendTacticalReview(lines, researchContext);
      break;
    case "match_preview":
      appendMatchPreview(lines, researchContext);
      break;
    case "match_recap":
      appendMatchRecap(lines, researchContext);
      break;
    case "player_analysis":
      appendPlayerAnalysis(lines, researchContext);
      break;
    case "top_5":
      appendTopFive(lines, researchContext, warnings);
      break;
    case "historical_explainer":
    case "opinion_debate":
    case "story":
    default:
      appendGeneralModes(lines, researchContext);
      break;
  }

  const uniqueWarnings = [...new Set(warnings.map((warning) => warning.trim()).filter(Boolean))];
  if (uniqueWarnings.length > 0) {
    pushSection(lines, "Warnings:", uniqueWarnings.map((warning) => `- ${warning}`));
  }

  return lines.join("\n").trim();
}
