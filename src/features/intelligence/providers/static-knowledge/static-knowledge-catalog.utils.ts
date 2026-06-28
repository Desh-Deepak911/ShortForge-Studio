import type { FootballResearchPlayer } from "@/features/research/types/football-research.types";

import ballonDorWinners from "./data/ballon-dor-winners.json";
import championsLeagueWinners from "./data/champions-league-winners.json";
import competitionAliases from "./data/competition-aliases.json";
import footballNicknames from "./data/football-nicknames.json";
import worldCupAllTimeTopScorers from "./data/world-cup-all-time-top-scorers.json";
import worldCupWinners from "./data/world-cup-winners.json";
import type {
  StaticKnowledgeCompetitionAlias,
  StaticKnowledgeCompetitionAliasesDataset,
  StaticKnowledgeDatasetId,
  StaticKnowledgeHistoricWinnersDataset,
  StaticKnowledgeNicknameEntry,
  StaticKnowledgeNicknamesDataset,
  StaticKnowledgeRankedListDataset,
} from "./static-knowledge.types";

/** API-Football league id for the FIFA World Cup — shared with research hints. */
export const FIFA_WORLD_CUP_LEAGUE_ID = 1;

const RANKED_LISTS: Record<string, StaticKnowledgeRankedListDataset> = {
  [worldCupAllTimeTopScorers.id]: worldCupAllTimeTopScorers as StaticKnowledgeRankedListDataset,
};

const HISTORIC_WINNERS: Record<string, StaticKnowledgeHistoricWinnersDataset> = {
  [ballonDorWinners.id]: ballonDorWinners as StaticKnowledgeHistoricWinnersDataset,
  [worldCupWinners.id]: worldCupWinners as StaticKnowledgeHistoricWinnersDataset,
  [championsLeagueWinners.id]: championsLeagueWinners as StaticKnowledgeHistoricWinnersDataset,
};

const COMPETITION_ALIASES = competitionAliases as StaticKnowledgeCompetitionAliasesDataset;
const FOOTBALL_NICKNAMES = footballNicknames as StaticKnowledgeNicknamesDataset;

function normalizeLookupTerm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function listStaticKnowledgeDatasetIds(): StaticKnowledgeDatasetId[] {
  return [
    "world-cup-all-time-top-scorers",
    "ballon-dor-winners",
    "world-cup-winners",
    "champions-league-winners",
    "competition-aliases",
    "football-nicknames",
  ];
}

export function getStaticKnowledgeRankedList(
  datasetId: StaticKnowledgeDatasetId,
): StaticKnowledgeRankedListDataset | undefined {
  return RANKED_LISTS[datasetId];
}

export function getStaticKnowledgeHistoricWinners(
  datasetId: StaticKnowledgeDatasetId,
): StaticKnowledgeHistoricWinnersDataset | undefined {
  return HISTORIC_WINNERS[datasetId];
}

export function getWorldCupAllTimeTopScorersPlayers(limit: number): FootballResearchPlayer[] {
  const dataset = RANKED_LISTS["world-cup-all-time-top-scorers"];
  if (!dataset) {
    return [];
  }

  return dataset.entries.slice(0, Math.max(1, limit)).map((entry) => ({
    id: entry.rank,
    name: entry.name,
    nationality: entry.nationality,
    league: "FIFA World Cup",
    goals: entry.value,
    assists: null,
  }));
}

export function lookupCompetitionAlias(term: string): StaticKnowledgeCompetitionAlias | undefined {
  const normalized = normalizeLookupTerm(term);
  return COMPETITION_ALIASES.aliases.find(
    (entry) => normalizeLookupTerm(entry.alias) === normalized,
  );
}

export function findCompetitionAliasesInTopic(topic: string): StaticKnowledgeCompetitionAlias[] {
  const normalizedTopic = normalizeLookupTerm(topic);
  return COMPETITION_ALIASES.aliases.filter((entry) =>
    normalizedTopic.includes(normalizeLookupTerm(entry.alias)),
  );
}

export function lookupFootballNickname(term: string): StaticKnowledgeNicknameEntry | undefined {
  const normalized = normalizeLookupTerm(term);
  return FOOTBALL_NICKNAMES.nicknames.find(
    (entry) => normalizeLookupTerm(entry.nickname) === normalized,
  );
}

export function findFootballNicknamesInTopic(topic: string): StaticKnowledgeNicknameEntry[] {
  const normalizedTopic = normalizeLookupTerm(topic);
  return FOOTBALL_NICKNAMES.nicknames.filter((entry) =>
    normalizedTopic.includes(normalizeLookupTerm(entry.nickname)),
  );
}

export function getCompetitionAliasesDataset(): StaticKnowledgeCompetitionAliasesDataset {
  return COMPETITION_ALIASES;
}

export function getFootballNicknamesDataset(): StaticKnowledgeNicknamesDataset {
  return FOOTBALL_NICKNAMES;
}

export function getWorldCupHosts(): Array<{
  year: number;
  host: string;
  winner: string;
  runnerUp?: string;
}> {
  const dataset = HISTORIC_WINNERS["world-cup-winners"];
  if (!dataset) {
    return [];
  }

  return dataset.entries
    .filter((entry): entry is typeof entry & { host: string } => Boolean(entry.host))
    .map((entry) => ({
      year: entry.year,
      host: entry.host,
      winner: entry.winner,
      ...(entry.runnerUp ? { runnerUp: entry.runnerUp } : {}),
    }));
}
