/**
 * Safe Retention persistence shapes — Sprint 10F.3 / 10G.1.
 * Persist only after successful narration commit. Never include candidate text,
 * prompts, claim text, ledger events, or terminal Hook authority.
 */

import type {
  EndingStrategy,
  InformationDensity,
  PacingProfile,
  StoryFormatStrategyId,
  VisualDensity,
} from "../domain/retention-story-contract.types";

/** Terminal pass states safe to persist beside validation (Sprint 10G.1). */
export type RetentionPersistedTerminalState =
  | "pass_without_rewrite"
  | "pass_after_rewrite";

/** Persisted only after successful narration commit. No retentionReadiness here. */
export interface RetentionStoryPlanSnapshot {
  readonly version: 1;
  readonly formatStrategyId: StoryFormatStrategyId;
  readonly controllingIdea: string;
  readonly primaryEmotion: string;
  readonly secondaryEmotion?: string;
  readonly beatCount: number;
  readonly pacingProfile: PacingProfile;
  readonly endingStrategy: EndingStrategy;
  readonly informationDensity: InformationDensity;
  readonly visualDensity: VisualDensity;
  readonly claimIdCount: number;
  readonly contractFingerprint: string;
  readonly planFingerprint: string;
  readonly strategyRegistryVersion: string;
}

/**
 * Persisted beside plan snapshot after successful narration commit.
 * Linkage fields (contract/plan fingerprints + rewrite evidence) prove the
 * validation belongs to the same accepted generation (Sprint 10G.1).
 */
export interface RetentionValidationSummary {
  readonly version: 1;
  readonly ok: true;
  readonly retentionReadiness: number;
  readonly storyQualityConfidence: number;
  readonly frameworkCompliance: number;
  readonly failedHardGateIds: readonly [];
  readonly warningNotes: readonly string[];
  readonly validationFingerprint: string;
  readonly candidateFingerprint: string;
  /** Same generation as the paired plan snapshot. */
  readonly contractFingerprint: string;
  /** Same generation as the paired plan snapshot. */
  readonly planFingerprint: string;
  /** Canonical pass terminal for rewrite authority. */
  readonly terminalState: RetentionPersistedTerminalState;
  /** Bound to terminalState — not an independent creator boolean. */
  readonly rewriteUsed: boolean;
}

/** Commit-path linkage required to build a new validation summary. */
export interface RetentionValidationSummaryLinkage {
  readonly contractFingerprint: string;
  readonly planFingerprint: string;
  readonly terminalState: RetentionPersistedTerminalState;
}
