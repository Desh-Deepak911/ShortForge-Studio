import type { EntityResolution, EntityResolverInput } from "./entity-types";
import { extractEntityCandidatesWithMeta } from "./entity-extractor";
import { mergeEntityResolutionText } from "./entity-utils";
import { SEASON_REQUIRED_WARNING } from "@/features/intelligence/competitions";
import { parseRankingIntent } from "@/features/research/utils/ranking-intent.utils";

/**
 * Resolves football entities from a creator brief.
 *
 * Phase 2 Prompt 2 — heuristic extraction only (no provider/API calls).
 * `resolved` remains empty until lookup is wired in a later prompt.
 */
export function resolveEntities(input: EntityResolverInput | string): EntityResolution {
  const normalizedInput: EntityResolverInput =
    typeof input === "string" ? { topic: input } : input;

  const mergedText = mergeEntityResolutionText(
    normalizedInput.topic,
    normalizedInput.manualContext,
  );

  const extraction = extractEntityCandidatesWithMeta(mergedText, {
    mode: normalizedInput.mode,
  });

  const ambiguities = [...extraction.ambiguities];
  if (normalizedInput.mode === "top_5") {
    const rankingIntent = parseRankingIntent(normalizedInput.topic, 5, "top_5");
    if (rankingIntent.seasonStatus === "missing_required") {
      ambiguities.push(SEASON_REQUIRED_WARNING);
    }
  }

  return {
    topic: normalizedInput.topic,
    normalizedText: mergedText,
    resolved: [],
    candidates: extraction.candidates,
    ambiguities,
  };
}
