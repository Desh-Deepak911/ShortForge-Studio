/**
 * Retention Story Contract types — Sprint 10B.
 * Implements accepted shapes from docs/RETENTION_STORY_CONTRACT.md.
 */

import type { CreatorTemplateId } from "@/features/creator-templates/creator-template.types";
import type { HookStyleSelection } from "@/features/hook-engine/presentation/hook-style-selection";
import type {
  GenerateScriptMode,
  QualityMode,
  ScriptMode,
  Tone,
} from "@/types/footiebitz";

import type { RETENTION_STORY_CONTRACT_VERSION } from "./retention-story-contract.constants";

export type StoryContractVersion = typeof RETENTION_STORY_CONTRACT_VERSION;

export type RetentionGenerationPath =
  | "script_only"
  | "audio_first_full"
  | "scenes_only";

export type StoryFormatStrategyId =
  | "short_retention"
  | "short_standard"
  | "extended_short"
  | "long_form_explainer"
  | "long_form_documentary";

export type StoryFormatStrategySelection = StoryFormatStrategyId | "auto";

export type StoryDurationClass =
  | "ultra_short"
  | "short"
  | "extended"
  | "long_form";

export type AudienceIntent =
  | "general_audience"
  | "enthusiast"
  | "expert"
  | "community";

export type DesiredViewerReaction =
  | "curiosity"
  | "surprise"
  | "debate"
  | "awe"
  | "satisfaction"
  | "urgency";

export type InformationDensity = "sparse" | "balanced" | "dense";
export type VisualDensity = "low" | "medium" | "high";
export type PacingProfile = "front_loaded" | "escalating" | "reveal_late";
export type EndingStrategy =
  | "payoff_reveal"
  | "challenge"
  | "resolution"
  | "open_loop";

/** Sprint 10H.3 — how creator-supplied and research facts may enter narration. */
export type RetentionFactHandlingMode =
  | "verified_facts_only"
  | "creative_premise";

export type RetentionClaimProvenance =
  | "research_graph"
  | "research_provider"
  | "manual_user"
  | "inferred"
  | "unknown";

export type RetentionClaimVerification =
  | "verified"
  | "unverified"
  | "rejected"
  | "forbidden";

export interface RetentionGroundingClaim {
  readonly claimId: string;
  readonly text: string;
  readonly provenance: RetentionClaimProvenance;
  readonly verification: RetentionClaimVerification;
  readonly permittedFactualUse: boolean;
  readonly forbidden: boolean;
  readonly sourceRef?: string;
  readonly piBeatId?: string;
  readonly piFactRole?: string;
}

export interface RetentionGroundingContext {
  readonly version: 1;
  readonly claims: readonly RetentionGroundingClaim[];
  readonly researchIdentity: string | null;
}

export interface StoryContractSemanticIdentities {
  readonly topicNormalized: string;
  readonly manualContextIdentity: string | null;
  readonly userInstructionsIdentity: string | null;
  readonly hookStyleIdentity: string;
  readonly userAuthoredHookIdentity: string | null;
  readonly researchContextIdentity: string | null;
}

export interface StoryContractConstraints {
  readonly forbidGenericIntro: boolean;
  readonly requirePayoff: boolean;
}

export interface StoryContractGroundingSummary {
  readonly claimCount: number;
  readonly eligibleClaimCount: number;
  readonly forbiddenClaimCount: number;
  readonly researchIdentity: string | null;
}

/**
 * Raw adapter input — tolerant of legacy absence.
 * Prefer apiMode and/or generationPath; neither defaults to audio_first_full.
 */
export interface StoryContractInput {
  readonly version?: StoryContractVersion;
  readonly topic: string;
  readonly durationSec?: number;
  readonly scriptMode?: ScriptMode | string;
  readonly tone?: Tone | string;
  readonly qualityMode?: QualityMode | string;
  readonly formatStrategyId?: StoryFormatStrategySelection;
  readonly audienceIntent?: AudienceIntent | string;
  readonly desiredReaction?: DesiredViewerReaction | string;
  readonly templateId?: CreatorTemplateId | string | null;
  readonly userInstructions?: string | null;
  readonly hookStyle?: HookStyleSelection | string;
  readonly userAuthoredHook?: string | null;
  /** Optional precomputed identity — normally derived from grounding. */
  readonly researchIdentity?: string | null;
  readonly manualContext?: string | null;
  /** Creative Premise details (one fact per line). Ephemeral — not fingerprinted as free text. */
  readonly premiseDetails?: string | null;
  readonly factHandlingMode?: RetentionFactHandlingMode | string;
  readonly generationPath?: RetentionGenerationPath;
  readonly apiMode?: GenerateScriptMode;
  readonly constraints?: {
    readonly forbidGenericIntro?: boolean;
    readonly requirePayoff?: boolean;
  };
  /** Ephemeral grounding — full claim text never enters NormalizedStoryContract. */
  readonly grounding?: RetentionGroundingContext | null;
}

export interface NormalizedStoryContract {
  readonly version: StoryContractVersion;
  readonly topic: string;
  readonly durationSec: number;
  readonly durationClass: StoryDurationClass;
  readonly scriptMode: ScriptMode;
  readonly tone: Tone;
  readonly qualityMode: QualityMode;
  readonly formatStrategyId: StoryFormatStrategyId;
  readonly factHandlingMode: RetentionFactHandlingMode;
  readonly audienceIntent: AudienceIntent;
  readonly desiredReaction: DesiredViewerReaction;
  readonly informationDensity: InformationDensity;
  readonly visualDensity: VisualDensity;
  readonly pacingProfile: PacingProfile;
  readonly endingStrategy: EndingStrategy;
  readonly templateId: CreatorTemplateId | null;
  readonly templateInfluence: "none" | "advisory";
  readonly generationPath: RetentionGenerationPath;
  readonly constraints: StoryContractConstraints;
  readonly identities: StoryContractSemanticIdentities;
  readonly groundingSummary: StoryContractGroundingSummary;
  readonly contractFingerprint: string;
}

export interface RetentionFormatStrategyProfile {
  readonly id: StoryFormatStrategyId;
  readonly productionCapable: boolean;
  readonly informationDensity: InformationDensity;
  readonly visualDensity: VisualDensity;
  readonly pacingProfile: PacingProfile;
  readonly endingStrategy: EndingStrategy;
  readonly minDurationSec: number;
  readonly maxDurationSec: number;
}

export type RetentionFormatCapabilityResult =
  | { readonly ok: true; readonly profile: RetentionFormatStrategyProfile }
  | {
      readonly ok: false;
      readonly reason: "long_form_not_supported" | "unknown_format_strategy";
      readonly strategyId: string;
    };
