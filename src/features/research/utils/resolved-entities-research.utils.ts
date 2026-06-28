import type { EntityResearchHints } from "@/features/intelligence/entities/entity-research-hints.types";
import type { ResolvedEntitiesPayload } from "@/features/intelligence/entities/entity-research-hints.types";
import { extractResearchHintsFromResolvedEntities } from "@/features/intelligence/entities/entity-resolved-payload.utils";

/**
 * Prefer high-confidence resolved entity IDs from the preview payload;
 * fall back to legacy entityHints or raw-string research behavior.
 */
export function resolveEntityHintsForResearch(input: {
  resolvedEntities?: ResolvedEntitiesPayload;
  entityHints?: EntityResearchHints;
}): EntityResearchHints | undefined {
  const fromResolved = extractResearchHintsFromResolvedEntities(input.resolvedEntities);
  if (fromResolved) {
    return fromResolved;
  }

  return input.entityHints;
}
