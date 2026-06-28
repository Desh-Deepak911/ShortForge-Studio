import type { IntelligenceQuery, ResearchCall } from "../planner/query-orchestrator.types";

import type { ProviderQuery } from "./provider.types";

const HISTORIC_STATIC_OPERATIONS = new Set([
  "allTimeWorldCupTopScorers",
  "getAllTimeWorldCupTopScorers",
  "historicWinners",
  "worldCupHosts",
  "competitionAliases",
  "staticKnowledge:world-cup-all-time-top-scorers",
  "staticKnowledge:world-cup-winners",
  "staticKnowledge:ballon-dor-winners",
  "staticKnowledge:champions-league-winners",
  "staticKnowledge:competition-aliases",
]);

/** Whether static knowledge should remain in the fallback chain after live providers. */
export function shouldIncludeStaticKnowledgeFallback(query: ProviderQuery): boolean {
  if (query.researchPlan.fallbackStrategy === "static_fallback") {
    return true;
  }

  if (query.researchPlan.requiredProviders.includes("static-fallback")) {
    return true;
  }

  return query.researchPlan.requiredCalls.some(
    (call) =>
      call.provider === "static-fallback" ||
      HISTORIC_STATIC_OPERATIONS.has(call.operation) ||
      call.operation.startsWith("staticKnowledge:"),
  );
}

/** Whether a research call should offer static knowledge as fallback. */
export function shouldOfferStaticFallbackForCall(
  call: ResearchCall,
  query: IntelligenceQuery,
): boolean {
  if (call.provider === "static-fallback") {
    return false;
  }

  if (HISTORIC_STATIC_OPERATIONS.has(call.operation)) {
    return true;
  }

  return shouldIncludeStaticKnowledgeFallback(query);
}
