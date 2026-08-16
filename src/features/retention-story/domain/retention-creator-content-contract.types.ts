/**
 * Ephemeral Creator Content Contract — story-quality Prompt 2.
 * Substance authority for composition. Never persist raw unit text in drafts,
 * diagnostics, or JSON/NDJSON. IDs and settings only if a summary is stored.
 */

import type { HookStyleSelection } from "@/features/hook-engine/presentation/hook-style-selection";
import type { QualityMode, ScriptMode, Tone } from "@/types/footiebitz";

import type { RetentionFactHandlingMode } from "./retention-story-contract.types";

export const RETENTION_CREATOR_CONTENT_CONTRACT_VERSION = 1 as const;

export type RetentionContentUnitKind =
  | "factual"
  | "interpretive"
  | "uncertain"
  | "forbidden"
  | "instruction";

export type RetentionContentUnitRole = "essential" | "optional";

export type RetentionContentUnitSourceField =
  | "topic"
  | "creator_brief"
  | "manual_context"
  | "manual_notes"
  | "creative_premise"
  | "research";

export type RetentionContentUnitAuthority =
  | "creator_supplied_unverified"
  | "research_verified"
  | "forbidden";

export interface RetentionContentUnitSourceSpan {
  readonly start: number;
  readonly end: number;
}

export interface RetentionCreatorContentUnit {
  readonly contentUnitId: string;
  /** Linked grounding claim when this unit entered the fact ledger. */
  readonly claimId: string | null;
  readonly sourceField: RetentionContentUnitSourceField;
  readonly creatorOrder: number;
  readonly sourceSpan: RetentionContentUnitSourceSpan;
  readonly role: RetentionContentUnitRole;
  readonly kind: RetentionContentUnitKind;
  readonly authority: RetentionContentUnitAuthority;
  readonly entityTokens: readonly string[];
  readonly parentContentUnitId: string | null;
  readonly requiresUncertainty: boolean;
  /** Runtime-only source text. Do not persist. */
  readonly text: string;
}

export interface RetentionCreatorPresentationSettings {
  readonly scriptMode: ScriptMode;
  readonly tone: Tone;
  readonly hookStyle: HookStyleSelection | "auto";
  readonly factHandlingMode: RetentionFactHandlingMode;
  readonly qualityMode: QualityMode;
  readonly reliabilityMode: "flexible" | "precise";
  readonly durationSec: number;
}

export interface RetentionCreatorContentContract {
  readonly version: typeof RETENTION_CREATOR_CONTENT_CONTRACT_VERSION;
  readonly centralSubject: string;
  readonly controllingIdea: string;
  readonly intendedConflict: string | null;
  readonly intendedConsequence: string | null;
  readonly orderedUnits: readonly RetentionCreatorContentUnit[];
  readonly essentialContentUnitIds: readonly string[];
  readonly optionalContentUnitIds: readonly string[];
  readonly requiredUncertaintyLanguage: readonly string[];
  readonly forbiddenInventionIds: readonly string[];
  readonly requestedStructuralObligations: readonly string[];
  readonly presentationSettings: RetentionCreatorPresentationSettings;
  readonly storyWordBudget: number;
}

export interface RetentionCreatorContentAllocation {
  readonly usedEssentialContentUnitIds: readonly string[];
  readonly usedOptionalContentUnitIds: readonly string[];
  readonly omittedOptionalContentUnitIds: readonly string[];
  readonly omittedEssentialContentUnitIds: readonly string[];
  readonly coverageWarning: boolean;
  /** Beat index → content-unit IDs that may influence that beat. */
  readonly beatAssignments: readonly {
    readonly beatIndex: number;
    readonly contentUnitIds: readonly string[];
  }[];
}
