/**
 * Retention Story planning public surface — Sprint 10D.
 * Beat + pacing intelligence. No generation, Hook, narration, or Studio Intelligence wiring.
 */

export {
  RETENTION_STORY_PLAN_VERSION,
  RETENTION_BEAT_PLAN_VERSION,
  RETENTION_HOOK_HANDOFF_VERSION,
  RETENTION_BEAT_STRATEGY_REGISTRY_VERSION,
  RETENTION_BEAT_DENSITY_REGISTRY_VERSION,
  RETENTION_BEAT_ID_PREFIX,
  RETENTION_STORY_PLAN_FINGERPRINT_PREFIX,
  RETENTION_WORDS_PER_SECOND,
  RETENTION_MAX_BEAT_EMOTIONAL_INTENT_CHARS,
  RETENTION_MAX_BEAT_VIEWER_QUESTION_CHARS,
  RETENTION_MAX_BEAT_INFORMATION_CONTRIBUTION_CHARS,
  RETENTION_MAX_BEAT_NARRATION_GOAL_CHARS,
  RETENTION_MAX_BEAT_VISUAL_OPPORTUNITY_CHARS,
  RETENTION_MAX_HANDOFF_TEXT_CHARS,
  RETENTION_MAX_BEATS,
  RETENTION_MAX_PLANNER_REQUEST_CLAIMS,
  RETENTION_MAX_PLANNER_PROPOSAL_BEATS,
  RETENTION_BEAT_FORBIDDEN_LABELS,
  RETENTION_BEAT_DENSITY_PROFILES,
  RETENTION_MAX_DEAD_AIR_SEC,
  type RetentionBeatDensityProfile,
} from "./retention-story-plan.constants";

export type {
  RetentionStoryPlanVersion,
  RetentionBeatPlanVersion,
  RetentionHookHandoffVersion,
  RetentionBeatPurpose,
  RetentionBeatNoveltyRole,
  RetentionBeatControllingIdeaRelation,
  RetentionBeatPayoffRelation,
  RetentionBeat,
  RetentionBeatCountRange,
  RetentionBeatPlan,
  RetentionCompressionGoals,
  RetentionHookHandoffControllingIdeaRelation,
  RetentionHookHandoffGroundingRequirements,
  RetentionHookHandoff,
  RetentionStoryPlan,
  RetentionBeatBudget,
  RetentionBeatSemanticFields,
  NormalizedRetentionBeatProposal,
  NormalizedRetentionBeatProposalEntry,
  BuildRetentionBeatPlanOptions,
  RetentionBeatPlanResult,
} from "./retention-story-plan.types";

export {
  getRetentionBeatStrategyRegistryVersion,
  listRetentionBeatStrategies,
  getRetentionBeatStrategy,
  mapEndingStrategyToTerminalPurpose,
  resolveRetentionBeatPurposeSequence,
  resolveRetentionBeatControllingIdeaRelation,
  resolveRetentionBeatPayoffRelations,
  resolveRetentionBeatNoveltyRole,
  buildRetentionBeatTemplateFields,
  type RetentionBeatStrategy,
} from "./retention-beat-strategy.registry";

export {
  resolveRetentionBeatCountRange,
  getRetentionBeatDensityProfile,
  type RetentionBeatCountResolution,
} from "./resolve-retention-beat-count-range";

export {
  resolveAdaptiveRetentionBeatCount,
  type AdaptiveRetentionBeatCount,
} from "./resolve-adaptive-retention-beat-count";

export { allocateRetentionBeatBudgets } from "./allocate-retention-beat-budgets";

export {
  buildRetentionBeatId,
  type RetentionBeatIdentityPayload,
} from "./retention-beat-identity";

export { buildRetentionBeatPlan } from "./build-deterministic-retention-beat-plan";

export { normalizeRetentionBeatProposal } from "./normalize-retention-beat-proposal";

export { buildRetentionCompressionGoals } from "./build-retention-compression-goals";

export { buildRetentionHookHandoff } from "./build-retention-hook-handoff";

export { buildRetentionClaimIdRelationships } from "./retention-claim-relationships";

export {
  buildRetentionStoryPlanFingerprint,
  getRetentionStoryPlanRegistryVersion,
  type RetentionStoryPlanFingerprintPayload,
} from "./retention-story-plan-fingerprint";

export {
  assembleRetentionStoryPlan,
  assertRetentionStoryPlanCoherence,
  validateRetentionStoryPlan,
  reconstructPlannerBeatProposalFromPlan,
  type AssertRetentionStoryPlanContext,
} from "./assert-retention-story-plan-coherence";

export {
  isRetentionBeatPurpose,
  isValidRetentionPlannerPurposeSequence,
  assertValidRetentionPlannerPurposeSequence,
} from "./validate-retention-planner-purpose-sequence";

export {
  buildDeterministicRetentionStoryPlan,
  buildRetentionStoryPlan,
} from "./build-retention-story-plan";

export { buildRetentionPlannerRequest } from "./build-retention-planner-request";

export { runRetentionPlannerOnce } from "./run-retention-planner-once";

export {
  sanitizeRetentionBeatText,
  canonicalRetentionBeatText,
  retentionBeatTextHasForbiddenMarker,
} from "./retention-beat-semantics";

export type {
  RetentionPlannerClaimSummary,
  RetentionPlannerRequest,
  RetentionPlannerBeatProposal,
  RetentionPlannerProposal,
  RetentionPlannerCallback,
  RetentionPlannerRunOutcome,
  RetentionStoryPlanFailureReason,
  RetentionStoryPlanOutcome,
  RetentionStoryPlanDiagnostics,
  RetentionStoryPlanResult,
  BuildRetentionStoryPlanInput,
} from "./retention-planner.types";
