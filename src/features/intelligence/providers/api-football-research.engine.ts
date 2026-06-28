import "server-only";

import type { IntelligenceAnalysis } from "@/features/intelligence/shared/intelligence-analysis.types";
import type { EntityResearchHints } from "@/features/intelligence/entities/entity-research-hints.types";
import {
  getFixtureEvents,
  getFixtureLineups,
  getFixtureStatistics,
  getPlayerSearch,
  getPlayerStatistics,
  getStandings,
  getTopScorers,
  searchFixturesByTeam,
  searchTeams,
  type ApiFootballFixtureItem,
  type ApiFootballPlayerSearchItem,
  type ApiFootballTopScorerRanking,
} from "@/lib/football";

import type { ApiFootballResearchState } from "./api-football-research-state.types";
import {
  buildApiFootballResearchResult,
  type ApiFootballResearchResultQuery,
} from "./build-api-football-research-result.utils";
import type { ApiFootballResearchInput } from "./api-football-research.types";
import type { IntelligenceResearchResult } from "./provider-result.types";
import type { RankingIntent } from "@/features/research/types/ranking-intent.types";
import type {
  FootballResearchMode,
  FootballResearchPlayer,
  FootballResearchSource,
} from "@/features/research/types/football-research.types";
import type { PlayerAnalysisIntent } from "@/features/research/types/player-analysis.types";
import { FIFA_WORLD_CUP_2026_NOT_QATAR_FACT } from "@/features/research/utils/research-grounding.utils";
import {
  buildFixtureFact,
  buildPlayerFact,
  fixtureInvolvesTeams,
  mapApiEvents,
  mapApiFixture,
  mapApiLineups,
  mapApiPlayers,
  mapApiStandings,
  mapApiStatistics,
  mapApiTeam,
} from "@/features/research/utils/api-football-mappers.utils";
import { parseManualFacts } from "@/features/research/utils/topic-inference.utils";
import { getCompetitionLabel } from "@/features/research/utils/competition-resolver.utils";
import { isTopScorersRankingIntent } from "@/features/research/utils/ranking-intent.utils";
import {
  resolveMatchTeamQueries,
  resolvePlayerAnalysisTopic,
  resolvePlayerStatsSeason,
  resolveResearchRankingIntent,
  resolveResearchTopicKind,
} from "@/features/research/utils/intelligence-analysis-research.utils";
import { buildTopScorersUnavailableWarning } from "@/features/research/utils/top-scorers-research.utils";
import { attachRankingSeasonStatus, RANKING_SEASON_REQUIRED_WARNING } from "@/features/research/utils/season-resolution.utils";
import {
  buildPlayerAnalysisIntent,
  buildVerifiedPlayerFactStrings,
  pickBestPlayerSearchMatch,
} from "@/features/research/utils/player-analysis.utils";
import { buildPlayerSearchQueries } from "@/features/research/utils/player-topic-parser.utils";
import {
  applyEntityHintsToRankingIntent,
  resolveLeagueIdFromHintsOrIntent,
  resolveRankingSeasonFromHintsOrIntent,
} from "@/features/research/utils/entity-research-hints.utils";
import { resolveEntityHintsForResearch } from "@/features/research/utils/resolved-entities-research.utils";

function appendFifaWorldCup2026TournamentFacts(
  state: ApiFootballResearchState,
  intent: PlayerAnalysisIntent,
): void {
  intent.competitionKey = "fifa_world_cup_2026";
  intent.competitionLabel = "FIFA World Cup 2026";
  intent.year = 2026;
  intent.squadStatus = "unknown";

  const tournamentFacts = [
    "Competition: FIFA World Cup 2026",
    "Tournament year: 2026",
    "Host nations: USA, Canada, Mexico",
    FIFA_WORLD_CUP_2026_NOT_QATAR_FACT,
  ];

  const seen = new Set(state.facts);
  for (const fact of tournamentFacts) {
    if (!seen.has(fact)) {
      seen.add(fact);
      state.facts.push(fact);
    }
  }

  if (!state.warnings.some((warning) => /2026 World Cup squad/i.test(warning))) {
    state.warnings.push(
      "2026 World Cup squad selection/participation: unknown — not confirmed by API.",
    );
  }
}

function createEmptyContext(input: {
  topic: string;
  mode: FootballResearchMode;
  manualContext?: string;
  source: FootballResearchSource;
  warnings?: string[];
  summary?: string;
}): ApiFootballResearchState {
  const facts = parseManualFacts(input.manualContext);

  return {
    mode: input.mode,
    topic: input.topic.trim(),
    summary: input.summary ?? `Research brief: ${input.topic.trim()}`,
    facts,
    warnings: input.warnings ?? [],
    source: input.source,
  };
}

function buildSummary(state: ApiFootballResearchState): string {
  if (state.rankingIntent?.rankingType === "top_scorers" && state.players?.length) {
    const competitionLabel = getCompetitionLabel(state.rankingIntent.competition);
    const timeLabel =
      state.rankingIntent.timeScope === "season" && state.rankingIntent.season
        ? `${state.rankingIntent.season}`
        : "all-time";
    return `Top ${state.players.length} goal scorers — ${competitionLabel} (${timeLabel})`;
  }

  if (state.fixture) {
    return `${state.fixture.homeTeam} vs ${state.fixture.awayTeam} — ${state.fixture.league}`;
  }

  if (state.players?.length) {
    return `Player focus: ${state.players[0]!.name}`;
  }

  if (state.teams?.length) {
    return `Team focus: ${state.teams.map((team) => team.name).join(" vs ")}`;
  }

  return `Research brief: ${state.topic}`;
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

async function resolveTeamsFromQueries(
  queries: string[],
): Promise<Array<{ id: number; name: string; country?: string }>> {
  const teams: Array<{ id: number; name: string; country?: string }> = [];

  for (const query of queries.slice(0, 2)) {
    const results = await searchTeams(query);
    const team = results?.[0]?.team;
    if (!team) {
      continue;
    }

    if (!teams.some((entry) => entry.id === team.id)) {
      teams.push({
        id: team.id,
        name: team.name,
        country: team.country,
      });
    }
  }

  return teams;
}

function pickBestFixture(
  fixtures: ApiFootballFixtureItem[],
  teamIds: number[],
): ApiFootballFixtureItem | null {
  if (fixtures.length === 0) {
    return null;
  }

  if (teamIds.length >= 2) {
    const matched = fixtures.find((fixture) => fixtureInvolvesTeams(fixture, teamIds));
    if (matched) {
      return matched;
    }
  }

  return fixtures[0] ?? null;
}

async function fetchFixtureBundle(
  fixtureId: number,
  mode: FootballResearchMode,
): Promise<{
  statistics?: ApiFootballResearchState["statistics"];
  events?: ApiFootballResearchState["events"];
  lineups?: ApiFootballResearchState["lineups"];
}> {
  const needsStatistics =
    mode === "tactical_review" || mode === "match_recap" || mode === "match_preview";
  const needsEvents = mode === "tactical_review" || mode === "match_recap";
  const needsLineups = mode === "tactical_review";

  const [statisticsResult, eventsResult, lineupsResult] = await Promise.all([
    needsStatistics ? getFixtureStatistics(fixtureId) : Promise.resolve(null),
    needsEvents ? getFixtureEvents(fixtureId) : Promise.resolve(null),
    needsLineups ? getFixtureLineups(fixtureId) : Promise.resolve(null),
  ]);

  return {
    statistics: statisticsResult ? mapApiStatistics(statisticsResult) : undefined,
    events: eventsResult ? mapApiEvents(eventsResult) : undefined,
    lineups: lineupsResult ? mapApiLineups(lineupsResult) : undefined,
  };
}

async function researchMatchTopic(
  topic: string,
  mode: FootballResearchMode,
  manualContext?: string,
  entityHints?: EntityResearchHints,
  intelligenceAnalysis?: IntelligenceAnalysis,
): Promise<ApiFootballResearchState> {
  let teams: Array<{ id: number; name: string; country?: string }> = [];

  if (entityHints?.teams?.length) {
    teams = entityHints.teams.map((team) => ({
      id: team.id,
      name: team.name,
    }));
  } else if (
    entityHints?.fixture?.homeTeamId != null &&
    entityHints.fixture.awayTeamId != null
  ) {
    teams = [
      {
        id: entityHints.fixture.homeTeamId,
        name: entityHints.fixture.homeTeam,
      },
      {
        id: entityHints.fixture.awayTeamId,
        name: entityHints.fixture.awayTeam,
      },
    ];
  } else {
    const queries = resolveMatchTeamQueries({ topic, intelligenceAnalysis });
    teams = await resolveTeamsFromQueries(queries);
  }
  const warnings: string[] = [];

  if (teams.length === 0) {
    return createEmptyContext({
      topic,
      mode,
      manualContext,
      source: "fallback",
      warnings: ["No matching teams found in API-Football."],
    });
  }

  const primaryTeamId = teams[0]!.id;
  const teamIds = teams.map((team) => team.id);
  const fixtureDirection = mode === "match_preview" ? "next" : "last";
  const fixtures =
    (await searchFixturesByTeam(primaryTeamId, {
      [fixtureDirection]: mode === "match_preview" ? 3 : 1,
    })) ?? [];

  const selectedFixture = pickBestFixture(fixtures, teamIds);
  const context = createEmptyContext({
    topic,
    mode,
    manualContext,
    source: "api-football",
    warnings,
  });

  context.teams = teams.map((team) => ({
    id: team.id,
    name: team.name,
    country: team.country,
  }));

  if (!selectedFixture) {
    context.warnings.push("No recent fixture found for the matched teams.");
    context.summary = buildSummary(context);
    return context;
  }

  context.fixture = mapApiFixture(selectedFixture);
  appendUniqueFacts(context.facts, [buildFixtureFact(context.fixture)]);

  const bundle = await fetchFixtureBundle(selectedFixture.fixture.id, mode);
  context.statistics = bundle.statistics;
  context.events = bundle.events;
  context.lineups = bundle.lineups;

  if (bundle.events?.length) {
    appendUniqueFacts(
      context.facts,
      bundle.events
        .filter((event) => event.type?.toLowerCase() === "goal")
        .slice(0, 5)
        .map((event) => {
          const minute = event.minute != null ? `${event.minute}'` : "";
          return `${minute} ${event.team}${event.player ? `: ${event.player}` : ""} (${event.type})`.trim();
        }),
    );
  }

  const leagueId = selectedFixture.league.id;
  const season = selectedFixture.league.season;
  if ((mode === "match_preview" || mode === "top_5") && leagueId && season) {
    const standingsResult = await getStandings(leagueId, season);
    if (standingsResult?.[0]) {
      context.standings = [mapApiStandings(standingsResult[0])];
    } else {
      context.warnings.push("Standings unavailable from provider.");
    }
  }

  context.summary = buildSummary(context);
  return context;
}

function resolveExplicitPlayerStatsSeason(
  topic: string,
  entityHints?: EntityResearchHints,
  intelligenceAnalysis?: IntelligenceAnalysis,
): number | undefined {
  if (entityHints?.season != null) {
    return entityHints.season;
  }

  return resolvePlayerStatsSeason({ topic, intelligenceAnalysis });
}

async function fetchPlayerStatisticsWhenSeasonExplicit(
  playerId: number,
  topic: string,
  entityHints?: EntityResearchHints,
  intelligenceAnalysis?: IntelligenceAnalysis,
): Promise<ApiFootballPlayerSearchItem[] | null> {
  const season = resolveExplicitPlayerStatsSeason(topic, entityHints, intelligenceAnalysis);
  if (season == null) {
    return null;
  }

  return getPlayerStatistics(playerId, season);
}

async function researchPlayerTopic(
  topic: string,
  mode: FootballResearchMode,
  manualContext?: string,
  entityHints?: EntityResearchHints,
  intelligenceAnalysis?: IntelligenceAnalysis,
): Promise<ApiFootballResearchState> {
  const parsed = resolvePlayerAnalysisTopic({ topic, intelligenceAnalysis });
  const playerAnalysisIntent = buildPlayerAnalysisIntent(parsed);

  const context = createEmptyContext({
    topic,
    mode,
    manualContext,
    source: "api-football",
  });
  context.playerAnalysisIntent = playerAnalysisIntent;

  if (playerAnalysisIntent.competitionKey === "fifa_world_cup_2026") {
    appendFifaWorldCup2026TournamentFacts(context, playerAnalysisIntent);
  }

  const searchQueries = buildPlayerSearchQueries(parsed.playerName);
  let matchedItem: ApiFootballPlayerSearchItem | null = null;

  if (entityHints?.player?.id) {
    const statsResult = await fetchPlayerStatisticsWhenSeasonExplicit(
      entityHints.player.id,
      topic,
      entityHints,
      intelligenceAnalysis,
    );
    matchedItem = statsResult?.[0] ?? null;
  }

  if (!matchedItem) {
    for (const query of searchQueries) {
      const playersResult = await getPlayerSearch(query);
      if (!playersResult?.length) {
        continue;
      }

      matchedItem = pickBestPlayerSearchMatch(parsed.playerName, playersResult);
      if (matchedItem) {
        break;
      }
    }
  }

  if (!matchedItem) {
    context.source = context.facts.length > 0 ? "static-fallback" : "fallback";
    context.warnings.push(
      parsed.playerName
        ? `No matching players found in API-Football for "${parsed.playerName}".`
        : "No player name detected in topic.",
    );
    context.summary = parsed.playerName
      ? `Player focus: ${parsed.playerName}`
      : buildSummary(context);
    return context;
  }

  const [primaryPlayer] = mapApiPlayers([matchedItem]);
  if (!primaryPlayer) {
    context.source = context.facts.length > 0 ? "static-fallback" : "fallback";
    context.warnings.push("Player search returned an unreadable profile.");
    context.summary = parsed.playerName
      ? `Player focus: ${parsed.playerName}`
      : buildSummary(context);
    return context;
  }

  context.players = [primaryPlayer];
  appendUniqueFacts(context.facts, buildVerifiedPlayerFactStrings(primaryPlayer));
  context.summary = `Player focus: ${primaryPlayer.name}`;
  return context;
}

function mapTopScorerRankingsToPlayers(
  rankings: ApiFootballTopScorerRanking[],
  limit: number,
  leagueLabel: string,
  season: number,
): FootballResearchPlayer[] {
  return rankings.slice(0, limit).map((entry) => ({
    id: entry.rank,
    name: entry.playerName,
    team: entry.teamName || undefined,
    league: leagueLabel,
    season,
    goals: entry.goals,
    assists: entry.assists ?? null,
    ...(entry.appearances != null ? { appearances: entry.appearances } : {}),
    ...(entry.raw.player.nationality ? { nationality: entry.raw.player.nationality } : {}),
  }));
}

async function researchTopScorersRanking(
  intent: RankingIntent,
  topic: string,
  mode: FootballResearchMode,
  manualContext?: string,
  entityHints?: EntityResearchHints,
): Promise<ApiFootballResearchState | null> {
  const effectiveIntent = applyEntityHintsToRankingIntent(intent, entityHints);

  if (effectiveIntent.competition === "unknown") {
    return null;
  }

  const leagueId = resolveLeagueIdFromHintsOrIntent(effectiveIntent, entityHints);
  if (leagueId == null) {
    return null;
  }

  const season = resolveRankingSeasonFromHintsOrIntent(effectiveIntent, entityHints);
  if (season == null) {
    const context = createEmptyContext({
      topic,
      mode,
      manualContext,
      source: "fallback",
      warnings: [RANKING_SEASON_REQUIRED_WARNING],
    });
    context.rankingIntent = attachRankingSeasonStatus({
      ...effectiveIntent,
      seasonStatus: "missing_required",
    });
    context.summary = buildSummary(context);
    return context;
  }

  const competitionLabel = getCompetitionLabel(effectiveIntent.competition);
  const resolvedIntent: RankingIntent = attachRankingSeasonStatus({
    ...effectiveIntent,
    timeScope: "season",
    season,
  });

  const topscorersResult = await getTopScorers({ leagueId, season });
  const context = createEmptyContext({
    topic,
    mode,
    manualContext,
    source: "api-football",
  });
  context.rankingIntent = resolvedIntent;

  if (topscorersResult?.length) {
    const rankedPlayers = mapTopScorerRankingsToPlayers(
      topscorersResult,
      effectiveIntent.limit,
      competitionLabel,
      season,
    );
    context.players = rankedPlayers;
    appendUniqueFacts(
      context.facts,
      rankedPlayers.map((player, index) => `#${index + 1} ${buildPlayerFact(player)}`),
    );
    context.summary = buildSummary(context);
    return context;
  }

  context.source = "fallback";
  context.warnings.push(buildTopScorersUnavailableWarning(resolvedIntent));
  context.summary = buildSummary(context);
  return context;
}

async function researchLegacyTopListTopic(
  topic: string,
  mode: FootballResearchMode,
  manualContext?: string,
  rankingIntent?: RankingIntent,
  entityHints?: EntityResearchHints,
  intelligenceAnalysis?: IntelligenceAnalysis,
): Promise<ApiFootballResearchState> {
  const context = createEmptyContext({
    topic,
    mode,
    manualContext,
    source: "api-football",
  });
  if (rankingIntent) {
    context.rankingIntent = rankingIntent;
  }

  const primaryTeamId = entityHints?.teams?.[0]?.id;

  if (entityHints?.teams?.length) {
    context.teams = entityHints.teams.map((team) => ({
      id: team.id,
      name: team.name,
    }));
  } else {
    const teamsResult = await searchTeams(topic);
    if (teamsResult?.[0]) {
      context.teams = [mapApiTeam(teamsResult[0])];
    }
  }

  const resolvedPrimaryTeamId = primaryTeamId ?? context.teams?.[0]?.id;
  if (resolvedPrimaryTeamId) {
    const fixtures =
      (await searchFixturesByTeam(resolvedPrimaryTeamId, { last: 1 })) ?? [];
    const latestFixture = fixtures[0];

    if (latestFixture) {
      context.fixture = mapApiFixture(latestFixture);
      appendUniqueFacts(context.facts, [buildFixtureFact(context.fixture)]);

      const leagueId = latestFixture.league.id;
      const season = latestFixture.league.season;
      if (leagueId && season) {
        const standingsResult = await getStandings(leagueId, season);
        if (standingsResult?.[0]) {
          context.standings = [mapApiStandings(standingsResult[0])];
        }
      }
    }
  }

  const playersResult = entityHints?.player?.id
    ? ((await fetchPlayerStatisticsWhenSeasonExplicit(
        entityHints.player.id,
        topic,
        entityHints,
        intelligenceAnalysis,
      )) ?? [])
    : ((await getPlayerSearch(topic)) ?? []);

  if (playersResult.length) {
    const rankedPlayers = mapApiPlayers(playersResult)
      .sort((left, right) => (right.goals ?? 0) - (left.goals ?? 0))
      .slice(0, 5);
    context.players = rankedPlayers;
    appendUniqueFacts(
      context.facts,
      rankedPlayers.map((player, index) => `#${index + 1} ${buildPlayerFact(player)}`),
    );
  }

  if (!context.standings?.length && !context.players?.length) {
    context.source = "fallback";
    context.warnings.push("No ranking data available from provider.");
  }

  context.summary = buildSummary(context);
  return context;
}

async function researchTopListTopic(
  topic: string,
  mode: FootballResearchMode,
  manualContext?: string,
  entityHints?: EntityResearchHints,
  intelligenceAnalysis?: IntelligenceAnalysis,
): Promise<ApiFootballResearchState> {
  const rankingIntent = resolveResearchRankingIntent({
    topic,
    mode,
    intelligenceAnalysis,
  });

  if (rankingIntent && isTopScorersRankingIntent(rankingIntent, mode)) {
    const rankedContext = await researchTopScorersRanking(
      rankingIntent,
      topic,
      mode,
      manualContext,
      entityHints,
    );
    if (rankedContext) {
      return rankedContext;
    }
  }

  return researchLegacyTopListTopic(
    topic,
    mode,
    manualContext,
    rankingIntent,
    entityHints,
    intelligenceAnalysis,
  );
}

async function researchGeneralTopic(
  topic: string,
  mode: FootballResearchMode,
  manualContext?: string,
  entityHints?: EntityResearchHints,
  intelligenceAnalysis?: IntelligenceAnalysis,
): Promise<ApiFootballResearchState> {
  const context = createEmptyContext({
    topic,
    mode,
    manualContext,
    source: "api-football",
  });

  if (entityHints?.teams?.length) {
    context.teams = entityHints.teams.map((team) => ({
      id: team.id,
      name: team.name,
    }));
    appendUniqueFacts(
      context.facts,
      context.teams.map((team) => team.name),
    );

    const fixtures =
      (await searchFixturesByTeam(context.teams[0]!.id, { last: 1 })) ?? [];
    if (fixtures[0]) {
      context.fixture = mapApiFixture(fixtures[0]);
      appendUniqueFacts(context.facts, [buildFixtureFact(context.fixture)]);
    }
  } else {
    const teamsResult = await searchTeams(topic);
    if (teamsResult?.length) {
      context.teams = teamsResult.slice(0, 2).map(mapApiTeam);
      appendUniqueFacts(
        context.facts,
        context.teams.map((team) => `${team.name}${team.country ? ` (${team.country})` : ""}`),
      );

      const fixtures =
        (await searchFixturesByTeam(context.teams[0]!.id, { last: 1 })) ?? [];
      if (fixtures[0]) {
        context.fixture = mapApiFixture(fixtures[0]);
        appendUniqueFacts(context.facts, [buildFixtureFact(context.fixture)]);
      }
    }
  }

  const playersResult = entityHints?.player?.id
    ? ((await fetchPlayerStatisticsWhenSeasonExplicit(
        entityHints.player.id,
        topic,
        entityHints,
        intelligenceAnalysis,
      )) ?? [])
    : ((await getPlayerSearch(topic)) ?? []);

  if (playersResult.length) {
    context.players = mapApiPlayers(playersResult.slice(0, 2));
    appendUniqueFacts(
      context.facts,
      context.players.map((player) => buildPlayerFact(player)),
    );
  }

  if (!context.teams?.length && !context.players?.length && !context.fixture) {
    return createEmptyContext({
      topic,
      mode,
      manualContext,
      source: "fallback",
      warnings: ["No matching teams or players found in API-Football."],
    });
  }

  context.summary = buildSummary(context);
  return context;
}

/**
 * Fallback-only legacy API-Football research engine (monolithic topic routing).
 *
 * Hot paths use `providerRegistry.executeResearchPlan()` → `mergeProviderResults()`.
 * TODO(phase-5): remove after all provider plans emit normalized operations.
 */
export async function executeApiFootballResearch(
  input: ApiFootballResearchInput,
  query: ApiFootballResearchResultQuery,
): Promise<IntelligenceResearchResult> {
  const topic = input.topic.trim();
  const manualContext = input.manualContext?.trim() || undefined;
  const entityHints = resolveEntityHintsForResearch({
    resolvedEntities: input.resolvedEntities,
    entityHints: input.entityHints,
  });

  const topicKind = resolveResearchTopicKind({
    topic,
    mode: input.mode,
    intelligenceAnalysis: input.intelligenceAnalysis,
  });

  let state: ApiFootballResearchState;

  switch (topicKind) {
    case "match":
      state = await researchMatchTopic(
        topic,
        input.mode,
        manualContext,
        entityHints,
        input.intelligenceAnalysis,
      );
      break;
    case "player":
      state = await researchPlayerTopic(
        topic,
        input.mode,
        manualContext,
        entityHints,
        input.intelligenceAnalysis,
      );
      break;
    case "top_list":
      state = await researchTopListTopic(
        topic,
        input.mode,
        manualContext,
        entityHints,
        input.intelligenceAnalysis,
      );
      break;
    case "team":
    default:
      state = await researchGeneralTopic(
        topic,
        input.mode,
        manualContext,
        entityHints,
        input.intelligenceAnalysis,
      );
  }

  return buildApiFootballResearchResult(state, query);
}
