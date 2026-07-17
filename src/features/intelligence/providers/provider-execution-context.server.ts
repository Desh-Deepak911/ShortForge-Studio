import "server-only";

import type { ApiFootballExecutionState } from "./api-football-operations.engine";
import type { ProviderResearchInput } from "./provider-research.types";

const executionContexts = new Map<string, ProviderResearchInput>();

/**
 * Query-scoped API-Football operation session (Sprint 7E.4A).
 * Keyed by intelligenceQuery.id so searchTeams → fixtureSearch → fixture*
 * share teams/fixtureId across per-call provider.execute invocations.
 * Never use unkeyed module-global mutable state.
 */
const apiFootballSessions = new Map<string, ApiFootballExecutionState>();

/** Registers research input for provider `execute()` calls on a query id. */
export function registerProviderExecutionContext(
  queryId: string,
  input: ProviderResearchInput,
): void {
  executionContexts.set(queryId, input);
}

/** Reads research input without removing it — supports fallback chaining. */
export function peekProviderExecutionContext(
  queryId: string,
): ProviderResearchInput | undefined {
  return executionContexts.get(queryId);
}

/**
 * Returns the mutable API-Football session for this query id.
 * Creates an empty session on first use within the plan lifetime.
 */
export function getOrCreateApiFootballExecutionSession(
  queryId: string,
): ApiFootballExecutionState {
  let session = apiFootballSessions.get(queryId);
  if (!session) {
    session = { teams: [] };
    apiFootballSessions.set(queryId, session);
  }
  return session;
}

/** Peek without creating — used by deterministic isolation QA. */
export function peekApiFootballExecutionSession(
  queryId: string,
): ApiFootballExecutionState | undefined {
  return apiFootballSessions.get(queryId);
}

/** Clears API-Football session for one query id. */
export function clearApiFootballExecutionSession(queryId: string): void {
  apiFootballSessions.delete(queryId);
}

/**
 * Clears research input and API-Football session after registry execution.
 * Always call from executeResearchPlan finally (success or failure).
 */
export function clearProviderExecutionContext(queryId: string): void {
  executionContexts.delete(queryId);
  apiFootballSessions.delete(queryId);
}
