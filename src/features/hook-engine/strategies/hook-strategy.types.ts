/**
 * Hook Strategy Library types — Sprint 7B.
 * Independent of Studio Intelligence StoryStrategyHookStrategy.
 */

import type { CreatorTemplateId } from "@/features/creator-templates/creator-template.types";
import type { ScriptMode } from "@/types/footiebitz";

import type {
  HookResolvedConstraints,
  HookStrategyId,
  HookStrategySource,
} from "../domain/hook-contract.types";

export type HookStrategyGroundingRequirement = "none" | "verified_factual";

/**
 * Immutable strategy registry entry.
 * Declarative only — no prompt assembly or model calls.
 */
export interface HookStrategyDefinition {
  readonly id: HookStrategyId;
  readonly version: string;
  readonly label: string;
  readonly description: string;
  readonly rhetoricalIntent: string;
  /** Declarative guidance for later Sprint 7D prompt compilation. */
  readonly promptGuidance: string;
  /** Empty means compatible with all script modes. */
  readonly preferredScriptModes: readonly ScriptMode[];
  readonly preferredTemplateIds: readonly CreatorTemplateId[];
  readonly groundingRequirement: HookStrategyGroundingRequirement;
  readonly requiresVerifiedFactualClaim: boolean;
  readonly constraints: HookResolvedConstraints;
}

export interface HookStrategyResolution {
  readonly strategy: HookStrategyDefinition;
  readonly strategySource: HookStrategySource;
  readonly selectionReason: string;
  readonly rejectedPreferenceReason?: string;
  readonly fallbackReason?: string;
}
