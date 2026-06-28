/** Normalized API-Football provider operations. */
export type ApiFootballNormalizedOperation =
  | "topScorers"
  | "playerSearch"
  | "teamSearch"
  | "fixtureSearch"
  | "fixtureStats"
  | "fixtureEvents"
  | "fixtureLineups"
  | "standings";

const OPERATION_ALIASES: Record<string, ApiFootballNormalizedOperation> = {
  topScorers: "topScorers",
  playerSearch: "playerSearch",
  playerStats: "playerSearch",
  teamSearch: "teamSearch",
  searchTeams: "teamSearch",
  fixtureSearch: "fixtureSearch",
  fixtureStats: "fixtureStats",
  getFixtureStatistics: "fixtureStats",
  fixtureEvents: "fixtureEvents",
  getFixtureEvents: "fixtureEvents",
  fixtureLineups: "fixtureLineups",
  getFixtureLineups: "fixtureLineups",
  standings: "standings",
  getStandings: "standings",
};

export function normalizeApiFootballOperationName(
  operation: string,
): ApiFootballNormalizedOperation | null {
  return OPERATION_ALIASES[operation] ?? null;
}

export function isApiFootballExecutionContextOperation(operation: string): boolean {
  return operation === "__executionContext";
}
