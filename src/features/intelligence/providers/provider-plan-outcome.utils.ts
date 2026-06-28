import type { ExecuteResearchPlanOutcome } from "./provider-execute-research-plan.server";
import { isProviderResearchResultEmpty } from "./provider-execution.utils";
import type {
  IntelligenceResearchResultStatus,
  IntelligenceResearchResult,
} from "./provider-result.types";
import type { ResearchProviderId } from "./provider.types";

export interface ProviderResultStatusEntry {
  providerId: ResearchProviderId;
  status: IntelligenceResearchResultStatus;
  factCount: number;
  rankingCount: number;
  fixtureCount: number;
  warningCount: number;
}

/** Dev-only summary of provider plan execution for Research Preview. */
export interface ProviderResearchExecutionSummary {
  path: "executeResearchPlan" | "registryFallback";
  combinedStatus: IntelligenceResearchResultStatus;
  combinedProviderId: ResearchProviderId;
  results: ProviderResultStatusEntry[];
}

function planOutcomeHasUsablePayload(outcome: ExecuteResearchPlanOutcome): boolean {
  if (!isProviderResearchResultEmpty(outcome.combined)) {
    return true;
  }

  return outcome.results.some((result) => !isProviderResearchResultEmpty(result));
}

export function shouldAcceptProviderPlanOutcome(
  outcome: ExecuteResearchPlanOutcome,
): boolean {
  if (!planOutcomeHasUsablePayload(outcome)) {
    return false;
  }

  const status = outcome.combined.status;

  if (status === "success" || status === "partial") {
    return true;
  }

  return planOutcomeHasUsablePayload(outcome);
}

function summarizeResult(result: IntelligenceResearchResult): ProviderResultStatusEntry {
  return {
    providerId: result.providerId,
    status: result.status,
    factCount: result.facts.length,
    rankingCount: result.rankings.length,
    fixtureCount: result.fixtures.length,
    warningCount: result.warnings.length,
  };
}

export function buildProviderResearchExecutionSummary(
  path: ProviderResearchExecutionSummary["path"],
  outcome: ExecuteResearchPlanOutcome,
): ProviderResearchExecutionSummary {
  return {
    path,
    combinedStatus: outcome.combined.status,
    combinedProviderId: outcome.combined.providerId,
    results: outcome.results.map(summarizeResult),
  };
}