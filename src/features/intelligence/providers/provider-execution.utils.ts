import "server-only";

import type { IntelligenceResearchResult } from "./provider-result.types";
import type { ProviderExecutionResult } from "./provider.types";

/** Whether a canonical provider result contains usable research payload. */
export function isProviderResearchResultEmpty(result: IntelligenceResearchResult): boolean {
  return (
    result.facts.length === 0 &&
    result.rankings.length === 0 &&
    result.fixtures.length === 0 &&
    result.statistics.length === 0 &&
    result.events.length === 0 &&
    result.lineups.length === 0
  );
}

function mapEnvelopeStatus(
  status: ProviderExecutionResult["status"],
): IntelligenceResearchResult["status"] {
  switch (status) {
    case "success":
      return "success";
    case "partial":
      return "partial";
    case "unavailable":
      return "unsupported";
    case "error":
      return "failed";
  }
}

/** Whether a provider execution result should stop fallback chaining. */
export function shouldAcceptProviderExecution(
  execution: ProviderExecutionResult,
): boolean {
  const resultStatus = execution.result.status ?? mapEnvelopeStatus(execution.status);

  if (resultStatus === "unsupported" || resultStatus === "failed") {
    return false;
  }

  if (resultStatus !== "success" && resultStatus !== "partial") {
    return false;
  }

  return !isProviderResearchResultEmpty(execution.result);
}
