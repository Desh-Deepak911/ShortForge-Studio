/**
 * Build StoryContractInput from the real creator request — Sprint 10F.3 / 10H.3A.
 * Retention grounding uses Retention-owned adapter over resolved research context.
 * Does not reuse Hook buildNeutralResearchEvidence as Retention grounding authority.
 */

import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import type { GraphContext } from "@/features/intelligence/context/graph-context.types";
import type { NarrativePlan } from "@/features/intelligence/prompts/narrative-plan.types";
import type { CreatorTemplateId } from "@/features/creator-templates/creator-template.types";
import type { HookStyleSelection } from "@/features/hook-engine";
import type {
  GenerateScriptMode,
  QualityMode,
  ScriptMode,
  Tone,
} from "@/types/footiebitz";

import { buildRetentionGroundingContext } from "../grounding/build-retention-grounding-context";
import { parseCreativePremiseFacts } from "../grounding/parse-creative-premise-facts";
import {
  finalizeRetentionGroundingClaims,
  type RetentionGroundingClaimDraft,
} from "../grounding/retention-grounding-normalization";
import type {
  RetentionFactHandlingMode,
  RetentionGenerationPath,
  RetentionGroundingClaim,
  RetentionGroundingContext,
  StoryContractInput,
} from "../domain/retention-story-contract.types";

export interface BuildProductionStoryContractInputArgs {
  readonly topic: string;
  readonly durationSec: number;
  readonly generationPath: RetentionGenerationPath;
  readonly apiMode?: GenerateScriptMode;
  readonly scriptMode?: ScriptMode;
  readonly tone?: Tone;
  /** Explicit only — omit for Retention balanced default. */
  readonly qualityMode?: QualityMode;
  readonly templateId?: CreatorTemplateId;
  readonly userInstructions?: string | null;
  readonly hookStyle?: HookStyleSelection;
  readonly userAuthoredHook?: string | null;
  readonly manualContext?: string | null;
  /** Creative Premise details (one fact per line). */
  readonly premiseDetails?: string | null;
  readonly factHandlingMode?: RetentionFactHandlingMode | string;
  readonly graphContext?: GraphContext | null;
  readonly assembledContext?: AssembledContext | null;
  readonly narrativePlan?: NarrativePlan | null;
  /**
   * Creator Story Strategy selection (Sprint 10G).
   * Omit / `auto` preserves legacy Auto resolution.
   */
  readonly formatStrategyId?: import("../domain/retention-story-contract.types").StoryFormatStrategySelection;
}

function claimToDraft(
  claim: RetentionGroundingClaim,
): RetentionGroundingClaimDraft {
  return {
    claimId: claim.claimId,
    text: claim.text,
    provenance: claim.provenance,
    verification: claim.verification,
    permittedFactualUse: claim.permittedFactualUse,
    forbidden: claim.forbidden,
    ...(claim.sourceRef ? { sourceRef: claim.sourceRef } : {}),
    ...(claim.piBeatId ? { piBeatId: claim.piBeatId } : {}),
    ...(claim.piFactRole ? { piFactRole: claim.piFactRole } : {}),
    hasAuthoritativeId: true,
  };
}

/**
 * Canonical Creative Premise merge — Sprint 10H.3A.
 * Recomputes researchIdentity from the final bounded claim set via finalize.
 */
export function mergeGroundingWithPremise(input: {
  readonly base: RetentionGroundingContext;
  readonly factHandlingMode: RetentionFactHandlingMode;
  readonly premiseDetails: string | null | undefined;
}): RetentionGroundingContext {
  if (input.factHandlingMode !== "creative_premise") {
    return input.base;
  }
  const premiseClaims = parseCreativePremiseFacts(input.premiseDetails);
  if (premiseClaims.length === 0) return input.base;

  // Research must never overwrite creator-premise claim IDs.
  const premiseIds = new Set(premiseClaims.map((c) => c.claimId));
  const retained = input.base.claims.filter((c) => !premiseIds.has(c.claimId));

  // Premise drafts first so same-ID collisions keep premise authority before
  // finalize merges; retained research/manual follow.
  const drafts: RetentionGroundingClaimDraft[] = [
    ...premiseClaims.map(claimToDraft),
    ...retained.map(claimToDraft),
  ];

  return finalizeRetentionGroundingClaims(drafts);
}

/**
 * Assemble raw StoryContractInput + ephemeral Retention grounding.
 */
export function buildProductionStoryContractInput(
  args: BuildProductionStoryContractInputArgs,
): StoryContractInput {
  const factHandlingMode: RetentionFactHandlingMode =
    args.factHandlingMode === "creative_premise"
      ? "creative_premise"
      : "verified_facts_only";

  const baseGrounding = buildRetentionGroundingContext({
    graphContext: args.graphContext ?? null,
    assembledContext: args.assembledContext ?? null,
    narrativePlan: args.narrativePlan ?? null,
    manualContext: args.manualContext ?? null,
  });

  const grounding = mergeGroundingWithPremise({
    base: baseGrounding,
    factHandlingMode,
    premiseDetails: args.premiseDetails,
  });

  return Object.freeze({
    topic: args.topic,
    durationSec: args.durationSec,
    generationPath: args.generationPath,
    factHandlingMode,
    ...(args.apiMode ? { apiMode: args.apiMode } : {}),
    ...(args.scriptMode ? { scriptMode: args.scriptMode } : {}),
    ...(args.tone ? { tone: args.tone } : {}),
    ...(args.qualityMode ? { qualityMode: args.qualityMode } : {}),
    formatStrategyId: args.formatStrategyId ?? "auto",
    ...(args.templateId ? { templateId: args.templateId } : {}),
    ...(args.userInstructions != null
      ? { userInstructions: args.userInstructions }
      : {}),
    ...(args.hookStyle ? { hookStyle: args.hookStyle } : {}),
    ...(args.userAuthoredHook != null
      ? { userAuthoredHook: args.userAuthoredHook }
      : {}),
    ...(args.manualContext != null ? { manualContext: args.manualContext } : {}),
    ...(args.premiseDetails != null
      ? { premiseDetails: args.premiseDetails }
      : {}),
    grounding,
    constraints: Object.freeze({
      forbidGenericIntro: true,
      requirePayoff: true,
    }),
  });
}
