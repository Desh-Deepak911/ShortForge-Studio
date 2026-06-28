/**
 * Fallback-only FootballResearchContext ↔ IntelligenceResearchResult adapters.
 * TODO(phase-5): remove once all callers consume CanonicalResearchBundle directly.
 */
import type { FootballResearchContext } from "@/features/research/types/football-research.types";

import {
  footballContextToResearchResult,
  researchResultToFootballContext,
} from "./legacy/football-research-to-result.legacy.utils";
import type { IntelligenceResearchResult } from "./provider-result.types";
import type { ProviderQuery, ResearchProviderId } from "./provider.types";

function mapResearchSource(source: FootballResearchContext["source"]): ResearchProviderId {
  if (source === "api-football" || source === "static-fallback" || source === "manual") {
    return source;
  }

  return "fallback";
}

/**
 * Maps legacy `FootballResearchContext` into canonical `IntelligenceResearchResult`.
 *
 * @deprecated Prefer `footballContextToResearchResult`.
 */
export function normalizeFootballResearchContext(
  context: FootballResearchContext,
  query?: ProviderQuery,
): IntelligenceResearchResult {
  return footballContextToResearchResult(
    context,
    query ?? {
      id: `legacy-${context.topic.trim() || "research"}`,
      entities: [],
    },
    mapResearchSource(context.source),
  );
}

/**
 * Restores full legacy research context from a normalized provider result.
 *
 * @deprecated Prefer `researchResultToFootballContext`.
 */
export function denormalizeFootballResearchContext(
  result: IntelligenceResearchResult,
  fallback: FootballResearchContext,
): FootballResearchContext {
  return researchResultToFootballContext(result, {
    mode: fallback.mode,
    topic: fallback.topic,
  });
}
