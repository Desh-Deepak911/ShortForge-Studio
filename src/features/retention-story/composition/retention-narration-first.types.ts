/**
 * Narration-first composer protocol — story-quality Prompt 3.
 * The model writes one continuous narration before any beat segmentation.
 * Beat mapping is an invisible scaffold and must not rewrite spoken prose.
 */

export const RETENTION_NARRATION_FIRST_PROTOCOL_VERSION = 1 as const;

export type RetentionNarrationAssemblyGap = "\n\n" | " " | "";

export interface RetentionNarrationFirstFactualSupport {
  readonly claimId: string;
}

export interface RetentionNarrationFirstBeatCoverage {
  readonly beatId: string;
  readonly contentIds: readonly string[];
}

/**
 * Production composer proposal authority. Segment arrays are compatibility
 * only — narration is written first and mapped after acceptance.
 */
export interface RetentionNarrationFirstProposal {
  readonly title: string;
  readonly narration: string;
  readonly usedContentIds: readonly string[];
  readonly omittedContentIds: readonly string[];
  readonly hookClaimRefs: readonly string[];
  readonly hookOpening?: string;
  readonly payoffClosing?: string;
  readonly requiredUncertaintyMarkersUsed?: readonly string[];
  readonly factualSupport?: readonly RetentionNarrationFirstFactualSupport[];
  readonly beatCoverage?: readonly RetentionNarrationFirstBeatCoverage[];
}

export interface RetentionNarrationFirstMapping {
  readonly narration: string;
  readonly orderedBeatIds: readonly string[];
  readonly usedContentIds: readonly string[];
  readonly omittedContentIds: readonly string[];
  readonly hookOpening: string;
  readonly payoffClosing: string;
  readonly requiredUncertaintyMarkersUsed: readonly string[];
  readonly assemblyGap: " ";
}
