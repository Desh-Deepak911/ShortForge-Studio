/** Static knowledge dataset kinds — extend when adding JSON resources. */
export type StaticKnowledgeDatasetKind =
  | "ranked_list"
  | "historic_winners"
  | "reference";

export type StaticKnowledgeDatasetId =
  | "world-cup-all-time-top-scorers"
  | "ballon-dor-winners"
  | "world-cup-winners"
  | "champions-league-winners"
  | "competition-aliases"
  | "football-nicknames";

export interface StaticKnowledgeRankedEntry {
  rank: number;
  name: string;
  value: number;
  nationality?: string;
}

export interface StaticKnowledgeRankedListDataset {
  id: "world-cup-all-time-top-scorers";
  kind: "ranked_list";
  title: string;
  competition: string;
  metric: string;
  sourceNote?: string;
  entries: StaticKnowledgeRankedEntry[];
}

export interface StaticKnowledgeHistoricWinnerEntry {
  year: number;
  winner: string;
  country?: string;
  club?: string;
  host?: string;
  runnerUp?: string;
}

export interface StaticKnowledgeHistoricWinnersDataset {
  id: Exclude<
    StaticKnowledgeDatasetId,
    "world-cup-all-time-top-scorers" | "competition-aliases" | "football-nicknames"
  >;
  kind: "historic_winners";
  title: string;
  category: string;
  sourceNote?: string;
  entries: StaticKnowledgeHistoricWinnerEntry[];
}

export interface StaticKnowledgeCompetitionAlias {
  alias: string;
  canonical: string;
  scope: string;
}

export interface StaticKnowledgeCompetitionAliasesDataset {
  id: "competition-aliases";
  kind: "reference";
  title: string;
  sourceNote?: string;
  aliases: StaticKnowledgeCompetitionAlias[];
}

export interface StaticKnowledgeNicknameEntry {
  nickname: string;
  type: "fixture" | "club" | "competition";
  label: string;
  entities: string[];
}

export interface StaticKnowledgeNicknamesDataset {
  id: "football-nicknames";
  kind: "reference";
  title: string;
  sourceNote?: string;
  nicknames: StaticKnowledgeNicknameEntry[];
}

export interface StaticKnowledgeMatch {
  datasetId: StaticKnowledgeDatasetId;
  reason: string;
  limit?: number;
}
