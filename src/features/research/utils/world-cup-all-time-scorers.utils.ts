import type { FootballResearchPlayer } from "@/features/research/types/football-research.types";
import {
  FIFA_WORLD_CUP_LEAGUE_ID,
  getWorldCupAllTimeTopScorersPlayers,
} from "@/features/intelligence/providers/static-knowledge/static-knowledge-catalog.utils";

export { FIFA_WORLD_CUP_LEAGUE_ID };

/** @deprecated Data lives in static-knowledge JSON — use catalog helpers directly. */
export function getAllTimeWorldCupTopScorers(limit: number): FootballResearchPlayer[] {
  return getWorldCupAllTimeTopScorersPlayers(limit);
}
