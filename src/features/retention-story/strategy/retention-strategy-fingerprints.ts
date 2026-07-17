/**
 * Shared Retention strategy fingerprint builders — Sprint 10C.1.
 * Deterministic builder, proposal normalizer, and seed assertion must use these.
 */

import { buildRetentionSemanticIdentity } from "../domain/retention-story-fingerprint";
import { getRetentionControllingIdeaRegistryVersion } from "./controlling-idea.registry";
import { getRetentionEmotionStrategyRegistryVersion } from "./emotion-strategy.registry";
import {
  RETENTION_CONTROLLING_IDEA_CANDIDATE_ID_PREFIX,
  RETENTION_EMOTION_BLUEPRINT_FINGERPRINT_PREFIX,
  RETENTION_STRATEGY_SEED_FINGERPRINT_PREFIX,
  RETENTION_STRATEGY_SEED_VERSION,
} from "./retention-strategy.constants";
import type {
  ControllingIdeaSource,
  EmotionalArcBlueprintPoint,
  RetentionEmotion,
} from "./retention-strategy.types";

export function buildControllingIdeaCandidateId(input: {
  readonly contractFingerprint: string;
  readonly source: ControllingIdeaSource;
  readonly statement: string;
  readonly claimRefs: readonly string[];
  readonly factualRisk: boolean;
}): string {
  return buildRetentionSemanticIdentity(
    {
      contractFingerprint: input.contractFingerprint,
      source: input.source,
      statement: input.statement,
      claimRefs: [...input.claimRefs].sort((a, b) => a.localeCompare(b)),
      factualRisk: input.factualRisk,
    },
    RETENTION_CONTROLLING_IDEA_CANDIDATE_ID_PREFIX,
  );
}

export function buildEmotionalArcBlueprintFingerprint(input: {
  readonly contractFingerprint: string;
  readonly primaryEmotion: RetentionEmotion;
  readonly secondaryEmotion?: RetentionEmotion;
  readonly curve: readonly EmotionalArcBlueprintPoint[];
}): string {
  return buildRetentionSemanticIdentity(
    {
      contractFingerprint: input.contractFingerprint,
      primaryEmotion: input.primaryEmotion,
      secondaryEmotion: input.secondaryEmotion ?? null,
      curve: input.curve.map((p) =>
        Object.freeze({
          phase: p.phase,
          emotion: p.emotion,
          intensity: p.intensity,
        }),
      ),
      emotionRegistryVersion: getRetentionEmotionStrategyRegistryVersion(),
    },
    RETENTION_EMOTION_BLUEPRINT_FINGERPRINT_PREFIX,
  );
}

export function buildRetentionStrategySeedFingerprint(input: {
  readonly contractFingerprint: string;
  readonly statement: string;
  readonly source: ControllingIdeaSource;
  readonly claimRefs: readonly string[];
  readonly blueprintFingerprint: string;
}): string {
  return buildRetentionSemanticIdentity(
    {
      contractFingerprint: input.contractFingerprint,
      controllingIdeaStatement: input.statement,
      controllingIdeaSource: input.source,
      claimRefs: [...input.claimRefs].sort((a, b) => a.localeCompare(b)),
      emotionalBlueprintFingerprint: input.blueprintFingerprint,
      controllingIdeaRegistryVersion:
        getRetentionControllingIdeaRegistryVersion(),
      emotionRegistryVersion: getRetentionEmotionStrategyRegistryVersion(),
      strategySeedVersion: RETENTION_STRATEGY_SEED_VERSION,
    },
    RETENTION_STRATEGY_SEED_FINGERPRINT_PREFIX,
  );
}
