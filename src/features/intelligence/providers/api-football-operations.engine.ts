import "server-only";

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
  type ApiFootballTopScorerRanking,
} from "@/lib/football";

import type { ProviderQuery } from "./provider.types";
import {
  createProviderEntityEnrichment,
  findMatchingOwnedEntityForHint,
} from "../entities/entity-ownership.utils";
import type { IntelligenceEntity } from "../shared/entity.types";
import type { IntelligenceFact } from "../shared/knowledge.types";
import type {
  FootballResearchFixture,
  FootballResearchTeam,
} from "@/features/research/types/football-research.types";
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
import { pickBestPlayerSearchMatch } from "@/features/research/utils/player-analysis.utils";
import { buildPlayerSearchQueries } from "@/features/research/utils/player-topic-parser.utils";
import { resolvePlayerAnalysisTopic } from "@/features/research/utils/intelligence-analysis-research.utils";

import type { ApiFootballNormalizedOperation } from "./api-football-operation-names.utils";
import type {
  IntelligenceResearchRanking,
  IntelligenceResearchResultStatus,
} from "./provider-result.types";
import type {
  FootballResearchEvent,
  FootballResearchLineup,
  FootballResearchStatistic,
} from "@/features/research/types/football-research.types";

export interface ApiFootballExecutionState {
  teams: FootballResearchTeam[];
  fixtureId?: number;
  fixture?: FootballResearchFixture;
}

export interface ApiFootballOperationOutput {
  status: IntelligenceResearchResultStatus;
  facts: IntelligenceFact[];
  entities: IntelligenceEntity[];
  rankings: IntelligenceResearchRanking[];
  fixtures: FootballResearchFixture[];
  statistics: FootballResearchStatistic[];
  events: FootballResearchEvent[];
  lineups: FootballResearchLineup[];
  warnings: string[];
  raw?: unknown;
}

function readStringParam(
  params: Record<string, string | number | boolean | null | undefined>,
  key: string,
): string | undefined {
  const value = params[key];
  if (value == null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readNumberParam(
  params: Record<string, string | number | boolean | null | undefined>,
  key: string,
): number | undefined {
  const value = params[key];
  if (value == null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function createFact(text: string, id: string): IntelligenceFact {
  return {
    id,
    text,
    provenance: {
      source: "api-football",
      fetchedAt: new Date().toISOString(),
    },
  };
}

function emptyOutput(
  status: IntelligenceResearchResultStatus,
  warnings: string[] = [],
): ApiFootballOperationOutput {
  return {
    status,
    facts: [],
    entities: [],
    rankings: [],
    fixtures: [],
    statistics: [],
    events: [],
    lineups: [],
    warnings,
  };
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

function mapTopScorerRankings(
  rankings: ApiFootballTopScorerRanking[],
  limit: number,
): IntelligenceResearchRanking {
  return {
    metric: "goals",
    limit,
    entries: rankings.slice(0, limit).map((entry, index) => ({
      rank: index + 1,
      label: entry.playerName,
      value: entry.goals,
      entityId: entry.raw.player.id,
    })),
  };
}

async function executeTopScorers(
  params: Record<string, string | number | boolean | null | undefined>,
  query: ProviderQuery,
): Promise<ApiFootballOperationOutput> {
  const leagueId = readNumberParam(params, "leagueId");
  const season = readNumberParam(params, "season");
  const limit = readNumberParam(params, "limit") ?? 5;

  if (leagueId == null || season == null) {
    return emptyOutput("failed", ["topScorers requires leagueId and season."]);
  }

  const rankingsResult = await getTopScorers({ leagueId, season });
  if (!rankingsResult?.length) {
    return emptyOutput("partial", ["Top scorers unavailable from API-Football."]);
  }

  const leagueLabel = query.competition?.label ?? "League";
  const ranking = mapTopScorerRankings(rankingsResult, limit);
  const facts = ranking.entries.map((entry, index) =>
    createFact(
      `#${entry.rank} ${entry.label}: ${entry.value ?? 0} goals (${leagueLabel})`,
      `topScorers-${index}`,
    ),
  );

  return {
    status: "success",
    facts,
    entities: [],
    rankings: [ranking],
    fixtures: [],
    statistics: [],
    events: [],
    lineups: [],
    warnings: [],
    raw: process.env.NODE_ENV === "development" ? rankingsResult : undefined,
  };
}

async function executePlayerSearch(
  params: Record<string, string | number | boolean | null | undefined>,
  query: ProviderQuery,
): Promise<ApiFootballOperationOutput> {
  const playerId = readNumberParam(params, "playerId");
  const season = readNumberParam(params, "season");
  const queryText =
    readStringParam(params, "query") ??
    resolvePlayerAnalysisTopic({
      topic: query.input.topic,
      intelligenceAnalysis: undefined,
    }).playerName;

  let playersResult = null;

  if (playerId != null && season != null) {
    playersResult = await getPlayerStatistics(playerId, season);
  } else if (queryText) {
    for (const searchQuery of buildPlayerSearchQueries(queryText)) {
      playersResult = await getPlayerSearch(searchQuery);
      if (playersResult?.length) {
        break;
      }
    }
  }

  if (!playersResult?.length) {
    return emptyOutput("partial", [
      queryText
        ? `No matching players found in API-Football for "${queryText}".`
        : "playerSearch requires a query or playerId.",
    ]);
  }

  const parsed = resolvePlayerAnalysisTopic({ topic: query.input.topic });
  const matched =
    pickBestPlayerSearchMatch(parsed.playerName ?? queryText ?? "", playersResult) ??
    playersResult[0]!;
  const mappedPlayers = mapApiPlayers([matched]);
  const primaryPlayer = mappedPlayers[0];

  if (!primaryPlayer) {
    return emptyOutput("failed", ["Player search returned an unreadable profile."]);
  }

  const entity = createProviderEntityEnrichment({
    owner: findMatchingOwnedEntityForHint({
      owners: query.entities,
      kind: "player",
      label: parsed.playerName ?? queryText ?? primaryPlayer.name,
    }),
    kind: "player",
    canonicalLabel: primaryPlayer.name,
    externalId: primaryPlayer.id,
    ...(primaryPlayer.team ? { parentLabel: primaryPlayer.team } : {}),
    status: "resolved",
  });

  return {
    status: "success",
    facts: [createFact(buildPlayerFact(primaryPlayer), "playerSearch-0")],
    entities: [entity],
    rankings: [],
    fixtures: [],
    statistics: [],
    events: [],
    lineups: [],
    warnings: [],
    raw: process.env.NODE_ENV === "development" ? matched : undefined,
  };
}

async function executeTeamSearch(
  params: Record<string, string | number | boolean | null | undefined>,
  state: ApiFootballExecutionState,
  query: ProviderQuery,
): Promise<ApiFootballOperationOutput> {
  const queryText = readStringParam(params, "query");
  if (!queryText) {
    return emptyOutput("failed", ["teamSearch requires a query."]);
  }

  const teamsResult = await searchTeams(queryText);
  const team = teamsResult?.[0]?.team;
  if (!team) {
    return emptyOutput("partial", [`No matching teams found for "${queryText}".`]);
  }

  const mappedTeam = mapApiTeam(teamsResult[0]!);
  if (!state.teams.some((entry) => entry.id === mappedTeam.id)) {
    state.teams.push(mappedTeam);
  }

  const entity = createProviderEntityEnrichment({
    owner: findMatchingOwnedEntityForHint({
      owners: query.entities,
      kind: "club",
      label: queryText,
    }),
    kind: "club",
    canonicalLabel: mappedTeam.name,
    externalId: mappedTeam.id,
    status: "resolved",
    ...(mappedTeam.country ? { metadata: { country: mappedTeam.country } } : {}),
  });

  return {
    status: "success",
    facts: [
      createFact(
        `${mappedTeam.name}${mappedTeam.country ? ` (${mappedTeam.country})` : ""}`,
        `teamSearch-${mappedTeam.id}`,
      ),
    ],
    entities: [entity],
    rankings: [],
    fixtures: [],
    statistics: [],
    events: [],
    lineups: [],
    warnings: [],
    raw: process.env.NODE_ENV === "development" ? teamsResult[0] : undefined,
  };
}

async function executeFixtureSearch(
  params: Record<string, string | number | boolean | null | undefined>,
  state: ApiFootballExecutionState,
): Promise<ApiFootballOperationOutput> {
  const direction = readStringParam(params, "direction") === "next" ? "next" : "last";
  const teamIds = state.teams.map((team) => team.id);

  if (teamIds.length === 0) {
    return emptyOutput("failed", ["fixtureSearch requires resolved teams from teamSearch."]);
  }

  const fixtures =
    (await searchFixturesByTeam(teamIds[0]!, {
      [direction]: direction === "next" ? 3 : 1,
    })) ?? [];
  const selectedFixture = pickBestFixture(fixtures, teamIds);

  if (!selectedFixture) {
    return emptyOutput("partial", ["No fixture found for the resolved teams."]);
  }

  const fixture = mapApiFixture(selectedFixture);
  state.fixtureId = fixture.id;
  state.fixture = fixture;

  return {
    status: "success",
    facts: [createFact(buildFixtureFact(fixture), `fixtureSearch-${fixture.id}`)],
    entities: [],
    rankings: [],
    fixtures: [fixture],
    statistics: [],
    events: [],
    lineups: [],
    warnings: [],
    raw: process.env.NODE_ENV === "development" ? selectedFixture : undefined,
  };
}

async function executeFixtureStats(
  params: Record<string, string | number | boolean | null | undefined>,
  state: ApiFootballExecutionState,
): Promise<ApiFootballOperationOutput> {
  const fixtureId = readNumberParam(params, "fixtureId") ?? state.fixtureId;
  if (fixtureId == null) {
    return emptyOutput("failed", ["fixtureStats requires a resolved fixtureId."]);
  }

  const statisticsResult = await getFixtureStatistics(fixtureId);
  if (!statisticsResult?.length) {
    return emptyOutput("partial", ["Fixture statistics unavailable from API-Football."]);
  }

  const statistics = mapApiStatistics(statisticsResult);

  return {
    status: "success",
    facts: statistics.slice(0, 6).map((stat, index) =>
      createFact(`${stat.team} ${stat.type}: ${stat.value ?? "n/a"}`, `fixtureStats-${index}`),
    ),
    entities: [],
    rankings: [],
    fixtures: state.fixture ? [state.fixture] : [],
    statistics,
    events: [],
    lineups: [],
    warnings: [],
    raw: process.env.NODE_ENV === "development" ? statisticsResult : undefined,
  };
}

async function executeFixtureEvents(
  params: Record<string, string | number | boolean | null | undefined>,
  state: ApiFootballExecutionState,
): Promise<ApiFootballOperationOutput> {
  const fixtureId = readNumberParam(params, "fixtureId") ?? state.fixtureId;
  if (fixtureId == null) {
    return emptyOutput("failed", ["fixtureEvents requires a resolved fixtureId."]);
  }

  const eventsResult = await getFixtureEvents(fixtureId);
  if (!eventsResult?.length) {
    return emptyOutput("partial", ["Fixture events unavailable from API-Football."]);
  }

  const events = mapApiEvents(eventsResult);
  const goalFacts = events
    .filter((event) => event.type?.toLowerCase() === "goal")
    .slice(0, 5)
    .map((event, index) => {
      const minute = event.minute != null ? `${event.minute}'` : "";
      return createFact(
        `${minute} ${event.team}${event.player ? `: ${event.player}` : ""} (${event.type})`.trim(),
        `fixtureEvents-${index}`,
      );
    });

  return {
    status: "success",
    facts: goalFacts,
    entities: [],
    rankings: [],
    fixtures: state.fixture ? [state.fixture] : [],
    statistics: [],
    events,
    lineups: [],
    warnings: [],
    raw: process.env.NODE_ENV === "development" ? eventsResult : undefined,
  };
}

async function executeFixtureLineups(
  params: Record<string, string | number | boolean | null | undefined>,
  state: ApiFootballExecutionState,
): Promise<ApiFootballOperationOutput> {
  const fixtureId = readNumberParam(params, "fixtureId") ?? state.fixtureId;
  if (fixtureId == null) {
    return emptyOutput("failed", ["fixtureLineups requires a resolved fixtureId."]);
  }

  const lineupsResult = await getFixtureLineups(fixtureId);
  if (!lineupsResult?.length) {
    return emptyOutput("partial", ["Fixture lineups unavailable from API-Football."]);
  }

  const lineups = mapApiLineups(lineupsResult);

  return {
    status: "success",
    facts: lineups.map((lineup, index) =>
      createFact(
        `${lineup.team}${lineup.formation ? ` (${lineup.formation})` : ""}: ${lineup.startingXi.slice(0, 3).join(", ")}…`,
        `fixtureLineups-${index}`,
      ),
    ),
    entities: [],
    rankings: [],
    fixtures: state.fixture ? [state.fixture] : [],
    statistics: [],
    events: [],
    lineups,
    warnings: [],
    raw: process.env.NODE_ENV === "development" ? lineupsResult : undefined,
  };
}

async function executeStandings(
  params: Record<string, string | number | boolean | null | undefined>,
): Promise<ApiFootballOperationOutput> {
  const leagueId = readNumberParam(params, "leagueId");
  const season = readNumberParam(params, "season");

  if (leagueId == null || season == null) {
    return emptyOutput("failed", ["standings requires leagueId and season."]);
  }

  const standingsResult = await getStandings(leagueId, season);
  const table = standingsResult?.[0];
  if (!table) {
    return emptyOutput("partial", ["Standings unavailable from API-Football."]);
  }

  const standings = mapApiStandings(table);
  const facts = standings.rows.slice(0, 10).map((row, index) =>
    createFact(
      `#${row.rank} ${row.team} — ${row.points} pts (${row.played} played)`,
      `standings-${index}`,
    ),
  );

  return {
    status: "success",
    facts,
    entities: [],
    rankings: [],
    fixtures: [],
    statistics: [],
    events: [],
    lineups: [],
    warnings: [],
    raw: process.env.NODE_ENV === "development" ? table : undefined,
  };
}

export async function executeApiFootballOperation(
  operation: ApiFootballNormalizedOperation,
  params: Record<string, string | number | boolean | null | undefined>,
  query: ProviderQuery,
  state: ApiFootballExecutionState,
): Promise<ApiFootballOperationOutput> {
  switch (operation) {
    case "topScorers":
      return executeTopScorers(params, query);
    case "playerSearch":
      return executePlayerSearch(params, query);
    case "teamSearch":
      return executeTeamSearch(params, state, query);
    case "fixtureSearch":
      return executeFixtureSearch(params, state);
    case "fixtureStats":
      return executeFixtureStats(params, state);
    case "fixtureEvents":
      return executeFixtureEvents(params, state);
    case "fixtureLineups":
      return executeFixtureLineups(params, state);
    case "standings":
      return executeStandings(params);
  }
}

export function mergeApiFootballOperationOutputs(
  outputs: ApiFootballOperationOutput[],
): ApiFootballOperationOutput {
  if (outputs.length === 0) {
    return emptyOutput("unsupported");
  }

  const merged = emptyOutput("success");
  const seenFacts = new Set<string>();
  const seenWarnings = new Set<string>();
  const seenFixtureIds = new Set<number>();
  const seenEntities = new Set<string>();

  for (const output of outputs) {
    if (output.status === "failed") {
      merged.status = merged.status === "success" ? "partial" : merged.status;
    } else if (output.status === "partial" && merged.status === "success") {
      merged.status = "partial";
    } else if (output.status === "unsupported" && merged.status === "success") {
      merged.status = "unsupported";
    }

    for (const fact of output.facts) {
      if (!seenFacts.has(fact.text)) {
        seenFacts.add(fact.text);
        merged.facts.push(fact);
      }
    }

    for (const warning of output.warnings) {
      if (!seenWarnings.has(warning)) {
        seenWarnings.add(warning);
        merged.warnings.push(warning);
      }
    }

    for (const entity of output.entities) {
      const key = `${entity.kind}:${entity.label.toLowerCase()}`;
      if (!seenEntities.has(key)) {
        seenEntities.add(key);
        merged.entities.push(entity);
      }
    }

    merged.rankings.push(...output.rankings);

    for (const fixture of output.fixtures) {
      if (!seenFixtureIds.has(fixture.id)) {
        seenFixtureIds.add(fixture.id);
        merged.fixtures.push(fixture);
      }
    }

    merged.statistics.push(...output.statistics);
    merged.events.push(...output.events);
    merged.lineups.push(...output.lineups);
  }

  if (merged.facts.length === 0 && merged.status === "success") {
    merged.status = "partial";
  }

  return merged;
}
