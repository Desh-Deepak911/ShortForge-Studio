/** Normalized static knowledge provider operations. */
export type StaticKnowledgeNormalizedOperation =
  | "allTimeWorldCupTopScorers"
  | "competitionAliases"
  | "worldCupHosts"
  | "historicWinners";

const OPERATION_ALIASES: Record<string, StaticKnowledgeNormalizedOperation> = {
  allTimeWorldCupTopScorers: "allTimeWorldCupTopScorers",
  getAllTimeWorldCupTopScorers: "allTimeWorldCupTopScorers",
  competitionAliases: "competitionAliases",
  worldCupHosts: "worldCupHosts",
  historicWinners: "historicWinners",
};

const HISTORIC_WINNER_DATASET_IDS = new Set([
  "world-cup-winners",
  "ballon-dor-winners",
  "champions-league-winners",
]);

export function isStaticKnowledgeExecutionContextOperation(operation: string): boolean {
  return operation === "__staticExecutionContext";
}

export function normalizeStaticKnowledgeOperationName(
  operation: string,
): StaticKnowledgeNormalizedOperation | null {
  if (operation.startsWith("staticKnowledge:")) {
    const datasetId = operation.slice("staticKnowledge:".length);

    if (datasetId === "world-cup-all-time-top-scorers") {
      return "allTimeWorldCupTopScorers";
    }

    if (datasetId === "competition-aliases") {
      return "competitionAliases";
    }

    if (HISTORIC_WINNER_DATASET_IDS.has(datasetId)) {
      return "historicWinners";
    }

    return null;
  }

  return OPERATION_ALIASES[operation] ?? null;
}

export function resolveHistoricWinnersDatasetId(
  operation: string,
  params: Record<string, string | number | boolean | null | undefined>,
): string | undefined {
  if (operation.startsWith("staticKnowledge:")) {
    const datasetId = operation.slice("staticKnowledge:".length);
    if (HISTORIC_WINNER_DATASET_IDS.has(datasetId)) {
      return datasetId;
    }
  }

  const paramValue = params.datasetId;
  if (paramValue == null || paramValue === "") {
    return undefined;
  }

  return String(paramValue);
}
