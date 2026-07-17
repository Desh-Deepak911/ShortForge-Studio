/**
 * Retention Story Plan fingerprint — Sprint 10D.
 *
 * Deterministic over plan semantics: contract fingerprint, registry versions,
 * constraints, controlling idea, emotional arc, ordered beats + fields, pacing /
 * density / ending, compression goals, claim relationships, and hook handoff.
 * Excludes timestamps, prompts, chain-of-thought, and raw provider dumps.
 */

import { buildRetentionSemanticIdentity } from "../domain/retention-story-fingerprint";
import { getRetentionControllingIdeaRegistryVersion } from "../strategy/controlling-idea.registry";
import { getRetentionEmotionStrategyRegistryVersion } from "../strategy/emotion-strategy.registry";
import { getRetentionBeatStrategyRegistryVersion } from "./retention-beat-strategy.registry";
import {
  RETENTION_BEAT_DENSITY_REGISTRY_VERSION,
  RETENTION_STORY_PLAN_FINGERPRINT_PREFIX,
  RETENTION_STORY_PLAN_VERSION,
} from "./retention-story-plan.constants";
import type {
  RetentionBeatPlan,
  RetentionCompressionGoals,
  RetentionHookHandoff,
} from "./retention-story-plan.types";
import type {
  ControllingIdea,
  EmotionalArc,
} from "../strategy/retention-strategy.types";
import type {
  EndingStrategy,
  InformationDensity,
  PacingProfile,
  VisualDensity,
} from "../domain/retention-story-contract.types";

/** Composite registry version stamped into the plan and its fingerprint. */
export function getRetentionStoryPlanRegistryVersion(): string {
  return [
    getRetentionBeatStrategyRegistryVersion(),
    RETENTION_BEAT_DENSITY_REGISTRY_VERSION,
    getRetentionControllingIdeaRegistryVersion(),
    getRetentionEmotionStrategyRegistryVersion(),
  ].join("+");
}

export interface RetentionStoryPlanFingerprintPayload {
  readonly contractFingerprint: string;
  readonly strategySeedFingerprint: string;
  readonly strategyRegistryVersion: string;
  readonly forbidGenericIntro: boolean;
  readonly requirePayoff: boolean;
  readonly controllingIdea: ControllingIdea;
  readonly controllingIdeaClaimRefs: readonly string[];
  readonly emotionalArc: EmotionalArc;
  readonly beatPlan: RetentionBeatPlan;
  readonly pacingProfile: PacingProfile;
  readonly informationDensity: InformationDensity;
  readonly visualDensity: VisualDensity;
  readonly endingStrategy: EndingStrategy;
  readonly compressionGoals: RetentionCompressionGoals;
  readonly claimIdRelationships: readonly string[];
  readonly hookHandoff: RetentionHookHandoff;
  /** Sprint 10H.4B — participant-coverage policy + canonical group token sets. */
  readonly participantCoverage: {
    readonly policyVersion: string;
    readonly required: boolean;
    readonly groupTokenSets: readonly (readonly string[])[];
  };
}

export function buildRetentionStoryPlanFingerprint(
  payload: RetentionStoryPlanFingerprintPayload,
): string {
  return buildRetentionSemanticIdentity(
    {
      planVersion: RETENTION_STORY_PLAN_VERSION,
      contractFingerprint: payload.contractFingerprint,
      strategySeedFingerprint: payload.strategySeedFingerprint,
      strategyRegistryVersion: payload.strategyRegistryVersion,
      constraints: {
        forbidGenericIntro: payload.forbidGenericIntro,
        requirePayoff: payload.requirePayoff,
      },
      controllingIdea: {
        statement: payload.controllingIdea.statement,
        mustPreserveThroughCompression:
          payload.controllingIdea.mustPreserveThroughCompression,
      },
      controllingIdeaClaimRefs: [...payload.controllingIdeaClaimRefs].sort(
        (a, b) => a.localeCompare(b),
      ),
      emotionalArc: {
        primaryEmotion: payload.emotionalArc.primaryEmotion,
        secondaryEmotion: payload.emotionalArc.secondaryEmotion ?? null,
        curve: payload.emotionalArc.curve.map((point) => ({
          atBeatId: point.atBeatId,
          emotion: point.emotion,
          intensity: point.intensity,
        })),
      },
      targetBeatCountRange: {
        min: payload.beatPlan.targetBeatCountRange.min,
        max: payload.beatPlan.targetBeatCountRange.max,
      },
      beats: payload.beatPlan.beats.map((beat) => ({
        id: beat.id,
        purpose: beat.purpose,
        emotionalIntent: beat.emotionalIntent,
        viewerQuestion: beat.viewerQuestion,
        informationContribution: beat.informationContribution,
        narrationGoal: beat.narrationGoal,
        visualOpportunity: beat.visualOpportunity,
        estimatedStartMs: beat.estimatedStartMs,
        estimatedEndMs: beat.estimatedEndMs,
        noveltyRole: beat.noveltyRole,
        groundingClaimRefs: [...beat.groundingClaimRefs].sort((a, b) =>
          a.localeCompare(b),
        ),
        controllingIdeaRelation: beat.controllingIdeaRelation,
        payoffRelation: beat.payoffRelation,
      })),
      pacingProfile: payload.pacingProfile,
      informationDensity: payload.informationDensity,
      visualDensity: payload.visualDensity,
      endingStrategy: payload.endingStrategy,
      compressionGoals: {
        targetWordBudget: payload.compressionGoals.targetWordBudget,
        preserveControllingIdea: payload.compressionGoals.preserveControllingIdea,
        preservePayoff: payload.compressionGoals.preservePayoff,
        maxDeadAirSec: payload.compressionGoals.maxDeadAirSec,
      },
      claimIdRelationships: [...payload.claimIdRelationships].sort((a, b) =>
        a.localeCompare(b),
      ),
      hookHandoff: {
        openingPsychologicalFunction:
          payload.hookHandoff.openingPsychologicalFunction,
        controllingIdeaRelation: payload.hookHandoff.controllingIdeaRelation,
        nextBeatPurpose: payload.hookHandoff.nextBeatPurpose,
        desiredTransitionIntoBody: payload.hookHandoff.desiredTransitionIntoBody,
        groundingRequirements: {
          requireEligibleClaimRefs:
            payload.hookHandoff.groundingRequirements.requireEligibleClaimRefs,
          claimIds: [...payload.hookHandoff.groundingRequirements.claimIds].sort(
            (a, b) => a.localeCompare(b),
          ),
        },
      },
      participantCoverage: {
        policyVersion: payload.participantCoverage.policyVersion,
        required: payload.participantCoverage.required,
        groupTokenSets: payload.participantCoverage.groupTokenSets.map((set) =>
          [...set].sort((a, b) => a.localeCompare(b)),
        ),
      },
    },
    RETENTION_STORY_PLAN_FINGERPRINT_PREFIX,
  );
}
