import type { IntelligenceResearchResult } from "../providers/provider-result.types";

import type { CanonicalResearchBundle } from "./canonical-research.types";

function stripRawFromProviderResult(
  result: IntelligenceResearchResult,
): IntelligenceResearchResult {
  const sanitized = { ...result };
  delete sanitized.raw;
  return sanitized;
}

/** Removes dev-only raw payloads before serializing bundles to clients. */
export function serializeCanonicalResearchBundleForDev(
  bundle: CanonicalResearchBundle,
): CanonicalResearchBundle {
  return {
    ...bundle,
    providerResults: bundle.providerResults.map(stripRawFromProviderResult),
  };
}
