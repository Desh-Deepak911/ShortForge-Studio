/** Raw API-Football envelope — https://www.api-football.com/documentation-v3 */
export interface ApiFootballEnvelope<T> {
  get?: string;
  parameters?: Record<string, string | number>;
  errors?: Record<string, string> | string[];
  results?: number;
  response?: T[];
}

export interface ApiFootballTeam {
  team: {
    id: number;
    name: string;
    country?: string;
  };
}

export interface ApiFootballLeagueItem {
  league: {
    id: number;
    name: string;
    type?: string;
  };
  country?: {
    name?: string;
    code?: string | null;
  };
}

export interface ApiFootballFixtureGoals {
  home: number | null;
  away: number | null;
}

export interface ApiFootballFixtureTeams {
  home: { id: number; name: string; winner?: boolean | null };
  away: { id: number; name: string; winner?: boolean | null };
}

export interface ApiFootballFixtureItem {
  fixture: {
    id: number;
    date: string;
    status?: { short?: string; long?: string };
  };
  league: {
    id?: number;
    name: string;
    season?: number;
    round?: string;
  };
  goals: ApiFootballFixtureGoals;
  teams: ApiFootballFixtureTeams;
}

export interface ApiFootballStatistic {
  type: string;
  value: number | string | null;
}

export interface ApiFootballFixtureStatistics {
  team: { id: number; name: string };
  statistics: ApiFootballStatistic[];
}

export interface ApiFootballFixtureEvent {
  time: { elapsed?: number | null; extra?: number | null };
  team: { id: number; name: string };
  player?: { id?: number | null; name?: string | null };
  assist?: { id?: number | null; name?: string | null };
  type?: string;
  detail?: string | null;
  comments?: string | null;
}

export interface ApiFootballFixtureEventsResponse {
  fixture: { id: number };
  events: ApiFootballFixtureEvent[];
}

export interface ApiFootballLineupPlayer {
  player: {
    id: number;
    name: string;
    number?: number | null;
    pos?: string | null;
  };
}

export interface ApiFootballFixtureLineup {
  team: { id: number; name: string };
  formation?: string | null;
  startXI: ApiFootballLineupPlayer[];
  substitutes: ApiFootballLineupPlayer[];
}

export interface ApiFootballFixturePlayerStat {
  player: {
    id: number;
    name: string;
  };
  statistics: Array<Record<string, unknown>>;
}

export interface ApiFootballFixturePlayersResponse {
  team: { id: number; name: string };
  players: ApiFootballFixturePlayerStat[];
}

export interface ApiFootballStandingRow {
  rank: number;
  team: { id: number; name: string };
  points: number;
  goalsDiff: number;
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
  form?: string | null;
}

export interface ApiFootballStandingsResponse {
  league: {
    id: number;
    name: string;
    season: number;
  };
  standings: ApiFootballStandingRow[][];
}

export interface ApiFootballPlayerSearchItem {
  player: {
    id: number;
    name: string;
    age?: number;
    nationality?: string;
  };
  statistics?: Array<{
    team?: { name?: string };
    league?: { name?: string; season?: number };
    games?: {
      appearences?: number;
      minutes?: number;
      position?: string;
      rating?: string;
    };
    goals?: {
      total?: number | null;
      assists?: number | null;
    };
  }>;
}

/** Raw topscorers row — same shape as player search statistics entries. */
export type ApiFootballTopScorerItem = ApiFootballPlayerSearchItem;

export interface GetTopScorersParams {
  leagueId: number;
  season: number;
}

export interface ApiFootballTopScorerRanking {
  rank: number;
  playerName: string;
  teamName: string;
  goals: number | null;
  assists?: number | null;
  appearances?: number | null;
  raw: ApiFootballTopScorerItem;
}

export interface SearchFixturesByTeamOptions {
  last?: number;
  next?: number;
  season?: number;
  league?: number;
}
