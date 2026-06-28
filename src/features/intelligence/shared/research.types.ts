import type { IntelligenceResearchResult } from "../providers/provider-result.types";

/** Outcome of merging manual notes with research for script generation. */
export interface ResolvedResearchContext {
  mergedContext?: string;
  researchApplied: boolean;
  researchWarning?: string;
  usedCachedPreview?: boolean;
  result: IntelligenceResearchResult;
}
