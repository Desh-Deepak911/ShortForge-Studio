/**
 * Retention strategy public surface — Sprint 10C / 10C.1.
 * Controlling idea + emotional arc blueprint. No beats, plan, Hook handoff, or generation.
 */

export {
  RETENTION_STRATEGY_SEED_VERSION,
  RETENTION_CONTROLLING_IDEA_REGISTRY_VERSION,
  RETENTION_EMOTION_STRATEGY_REGISTRY_VERSION,
  RETENTION_STRATEGY_SEED_FINGERPRINT_PREFIX,
  RETENTION_EMOTION_BLUEPRINT_FINGERPRINT_PREFIX,
  RETENTION_CONTROLLING_IDEA_CANDIDATE_ID_PREFIX,
  RETENTION_MAX_CONTROLLING_IDEA_CHARS,
  RETENTION_MAX_CONTROLLING_IDEA_WORDS,
  RETENTION_MIN_CONTROLLING_IDEA_WORDS,
  RETENTION_MAX_CONTROLLING_IDEA_CANDIDATES,
  RETENTION_MAX_CONTROLLING_IDEA_CLAIM_REFS,
} from "./retention-strategy.constants";

export type {
  RetentionStrategySeedVersion,
  RetentionEmotion,
  ControllingIdea,
  ControllingIdeaSource,
  ControllingIdeaCandidate,
  ControllingIdeaSelection,
  EmotionalArcPhase,
  EmotionalIntensity,
  EmotionalArcBlueprintPoint,
  EmotionalArcBlueprint,
  EmotionalArcPoint,
  EmotionalArc,
  RetentionStrategySeed,
  RetentionStrategySeedResult,
  BuildRetentionStrategySeedInput,
  RetentionStrategyPlanningContext,
  ControllingIdeaValidationReason,
  ControllingIdeaValidationResult,
  RetentionStrategyProposalInput,
} from "./retention-strategy.types";

export {
  RETENTION_PARTICIPANT_COVERAGE_POLICY_VERSION,
  parseRetentionMatchupParticipantGroups,
  buildRetentionParticipantCoverage,
  toRetentionParticipantCoverageSummary,
  evaluateRetentionParticipantCoverage,
  narrationCoversRetentionParticipantGroup,
  sentenceIsSoleParticipantCoverage,
  type RetentionParticipantGroup,
  type RetentionParticipantCoverage,
  type RetentionParticipantCoverageSummary,
} from "./retention-matchup-participant-coverage";

export {
  extractRetentionSubjectTokens,
  statementPreservesRetentionSubject,
  claimRelevantToRetentionTopic,
} from "./retention-subject-tokens";

export {
  resolveRetentionDeterministicSubjectAnchor,
  extractOrderedRetentionSubjectTokens,
} from "./resolve-retention-deterministic-subject-anchor";

export {
  detectRetentionFactualRisk,
  statementHasRetentionDateSignal,
  type RetentionFactualRiskResult,
} from "./retention-factual-risk";

export {
  getRetentionControllingIdeaRegistryVersion,
  listControllingIdeaModeStrategies,
  getControllingIdeaModeStrategy,
  assembleDeterministicControllingIdeaStatement,
  type ControllingIdeaModeStrategy,
} from "./controlling-idea.registry";

export {
  normalizeRetentionControllingIdeaStatement,
  canonicalizeControllingIdeaClaimRefs,
  claimRefSupportsControllingIdeaStatement,
  isClaimEligibleForControllingIdeaSupport,
} from "./retention-claim-support";

export {
  claimRefsSupportLinkedNarrationStatement,
  compressRetentionClaimLinkedNarration,
} from "./retention-claim-linked-support";

export {
  validateControllingIdea,
  type ValidateControllingIdeaInput,
} from "./validate-controlling-idea";

export {
  buildControllingIdeaCandidateId,
  buildEmotionalArcBlueprintFingerprint,
  buildRetentionStrategySeedFingerprint,
} from "./retention-strategy-fingerprints";

export {
  assertCanonicalControllingIdeaCandidate,
  assertCanonicalControllingIdeaCandidates,
} from "./controlling-idea-candidate-identity";

export { buildControllingIdeaCandidates } from "./build-controlling-idea-candidates";

export { selectControllingIdea } from "./select-controlling-idea";

export {
  getRetentionEmotionStrategyRegistryVersion,
  resolvePrimaryEmotion,
  resolveSecondaryEmotion,
  resolveEmotionalCurve,
  listRetentionEmotions,
  isRetentionEmotion,
} from "./emotion-strategy.registry";

export {
  buildEmotionalArcBlueprint,
  validateEmotionalArcBlueprint,
  recomputeEmotionalArcBlueprintFingerprint,
} from "./build-emotional-arc-blueprint";

export { validateRetentionStrategyPlanningInput } from "./validate-strategy-planning-input";

export { buildDeterministicRetentionStrategySeed } from "./build-retention-strategy-seed";

export { normalizeRetentionStrategyProposal } from "./normalize-retention-strategy-proposal";

export { assertRetentionStrategySeedCoherence } from "./assert-retention-strategy-seed-coherence";

export { bindEmotionalArcBlueprintToBeatIds } from "./bind-emotional-arc-blueprint";
