import type {
  FootballResearchEvent,
  FootballResearchFixture,
  FootballResearchLineup,
  FootballResearchMode,
  FootballResearchPlayer,
  FootballResearchSource,
  FootballResearchStandings,
  FootballResearchStatistic,
  FootballResearchTeam,
} from "@/features/research/types/football-research.types";
import type { PlayerAnalysisIntent } from "@/features/research/types/player-analysis.types";
import type { RankingIntent } from "@/features/research/types/ranking-intent.types";

/** Mutable research state for the monolithic API-Football engine — not a legacy context type. */
export interface ApiFootballResearchState {
  mode: FootballResearchMode;
  topic: string;
  summary: string;
  facts: string[];
  warnings: string[];
  source: FootballResearchSource;
  fixture?: FootballResearchFixture;
  players?: FootballResearchPlayer[];
  teams?: FootballResearchTeam[];
  statistics?: FootballResearchStatistic[];
  events?: FootballResearchEvent[];
  lineups?: FootballResearchLineup[];
  standings?: FootballResearchStandings[];
  rankingIntent?: RankingIntent;
  playerAnalysisIntent?: PlayerAnalysisIntent;
}
