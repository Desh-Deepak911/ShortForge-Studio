import "server-only";

import { buildIntelligenceQuery } from "./query-orchestrator";
import { enrichQueryWithProviderRouting } from "./query-orchestrator-provider-routing.server";
export {
  executeIntelligenceQuery,
  type ExecuteIntelligenceQueryInput,
  type ExecuteIntelligenceQueryResult,
} from "./execute-intelligence-query";
import type { IntelligenceQuery, IntelligenceQueryInput } from "./query-orchestrator.types";

/** Builds an intelligence query and resolves provider routing through the registry. */
export async function buildIntelligenceQueryWithProviderRouting(
  input: IntelligenceQueryInput,
): Promise<IntelligenceQuery> {
  const query = await buildIntelligenceQuery(input);
  return enrichQueryWithProviderRouting(query);
}
