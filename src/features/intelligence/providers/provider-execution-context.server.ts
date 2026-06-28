import "server-only";

import type { ProviderResearchInput } from "./provider-research.types";

const executionContexts = new Map<string, ProviderResearchInput>();

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

/** Clears research input after registry execution completes. */
export function clearProviderExecutionContext(queryId: string): void {
  executionContexts.delete(queryId);
}
