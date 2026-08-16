/**
 * Immutable settings-driven composition brief — story-quality Prompt 3.
 * Creator Content Contract owns substance. Settings own presentation only.
 */

import type { QualityMode, ScriptMode, Tone } from "@/types/footiebitz";
import type { RetentionCreatorPresentationSettings } from "../domain/retention-creator-content-contract.types";

import type { StoryDurationClass } from "../domain/retention-story-contract.types";
import type { RetentionModeArchitecturePhaseId } from "./retention-mode-architecture.registry";

export const RETENTION_COMPOSITION_BRIEF_VERSION = 1 as const;

export type RetentionHookStrategyId =
  RetentionCreatorPresentationSettings["hookStyle"];

export interface RetentionCompositionQualityEffortPolicy {
  readonly qualityMode: QualityMode;
  readonly plannerCalls: 0 | 1;
  readonly narrationFirstComposerCalls: 1;
  readonly boundedRepairWhenPermitted: boolean;
  readonly targetedBodyRewrite: boolean;
  readonly automaticRewriteUnlessSafetyRescue: boolean;
}

export interface RetentionDurationUtilisationPolicy {
  readonly durationClass: StoryDurationClass;
  readonly durationSec: number;
  readonly storyTargetWordBudget: number;
  readonly storyHardWordBudget: number;
  readonly minimumUtilisation: number;
  readonly minimumUsefulWords: number;
  readonly rationale: string;
}

export interface RetentionModeArchitectureBrief {
  readonly scriptMode: ScriptMode;
  readonly phaseIds: readonly RetentionModeArchitecturePhaseId[];
  readonly phaseIntents: readonly string[];
}

export interface RetentionTonePresentationBrief {
  readonly tone: Tone;
  readonly cadenceGuidance: string;
  readonly languageGuidance: string;
  readonly forbiddenPresentationalMoves: readonly string[];
}

export interface RetentionCompositionBrief {
  readonly version: typeof RETENTION_COMPOSITION_BRIEF_VERSION;
  readonly centralSubject: string;
  readonly controllingIdea: string;
  readonly intendedConflict: string | null;
  readonly intendedConsequence: string | null;
  readonly orderedEssentialUnitIds: readonly string[];
  readonly orderedOptionalUnitIds: readonly string[];
  readonly structuralObligations: readonly string[];
  readonly requiredParticipants: readonly string[];
  readonly requiredRankingMembership: readonly string[];
  readonly requiredRankingOrder: readonly string[];
  /** Exact number-one member. Null when the mode has no ordered ranking. */
  readonly rankingNumberOneMember: string | null;
  readonly rankingSpeakDirection:
    | "listed_order_to_number_one"
    | "number_one_first"
    | "unordered";
  readonly rankingPresentationInstruction: string;
  readonly requiredUncertaintyLanguage: readonly string[];
  readonly forbiddenInventionIds: readonly string[];
  readonly hookStrategy: RetentionHookStrategyId;
  readonly hookStrategyRationale: string;
  readonly narrativeArchitecture: RetentionModeArchitectureBrief;
  readonly toneGuidance: RetentionTonePresentationBrief;
  readonly durationUtilisation: RetentionDurationUtilisationPolicy;
  readonly qualityEffort: RetentionCompositionQualityEffortPolicy;
  readonly reliabilityMode: "flexible" | "precise";
  readonly excludedOptionalClaimIds: readonly string[];
  readonly lowContextWarning: boolean;
}
