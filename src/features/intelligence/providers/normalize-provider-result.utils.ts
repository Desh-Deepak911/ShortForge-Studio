import type { IntelligenceQuery, ResearchCall } from "../planner/query-orchestrator.types";

import type { ProviderDiagnosticEntry } from "./provider-diagnostics.types";
import {
  createIntelligenceResearchResult,
  type IntelligenceResearchResult,
  type IntelligenceResearchResultStatus,
} from "./provider-result.types";
import type { ProviderExecutionResult, ResearchProviderId } from "./provider.types";

function mapExecutionStatus(
  status: ProviderExecutionResult["status"],
): IntelligenceResearchResultStatus {
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

/** Attaches call-level provenance when execution already returns canonical results. */
export function normalizeProviderExecutionToResearchResult(
  query: IntelligenceQuery,
  call: ResearchCall,
  execution: ProviderExecutionResult,
  diagnostic?: ProviderDiagnosticEntry,
): IntelligenceResearchResult {
  const warnings = [...execution.result.warnings];
  if (execution.errorMessage && !warnings.includes(execution.errorMessage)) {
    warnings.push(execution.errorMessage);
  }

  return createIntelligenceResearchResult({
    ...execution.result,
    queryId: query.id,
    status: execution.result.status ?? mapExecutionStatus(execution.status),
    warnings,
    provenance: {
      ...execution.result.provenance,
      operations: [call.operation, ...(execution.result.provenance.operations ?? [])],
    },
    diagnostics: diagnostic ? [diagnostic] : execution.result.diagnostics,
    raw:
      process.env.NODE_ENV === "development"
        ? { call, execution: execution.result.raw ?? execution.result }
        : undefined,
  });
}

export function createEmptyResearchResultForCall(
  query: IntelligenceQuery,
  call: ResearchCall,
  status: IntelligenceResearchResultStatus,
  warnings: string[],
  diagnostic?: ProviderDiagnosticEntry,
): IntelligenceResearchResult {
  return createIntelligenceResearchResult({
    queryId: query.id,
    providerId: call.provider as ResearchProviderId,
    status,
    warnings,
    entities: [...query.entities],
    confidence: query.confidence,
    provenance: {
      source: call.provider as ResearchProviderId,
      fetchedAt: new Date().toISOString(),
      operations: [call.operation],
    },
    diagnostics: diagnostic ? [diagnostic] : undefined,
  });
}
