/**
 * Promote a canonical rescue candidate with one remapping retry — Prompt 5.
 * Never silently returns a shortened or fact-losing promotion.
 */

import type { HookGenerationContext } from "@/features/hook-engine/integration/build-hook-generation-context";

import type { RetentionModelCallLedger } from "../budget/create-retention-model-call-ledger";
import { assembleRetentionNarrationCandidate } from "../composition/assemble-retention-narration-candidate";
import { assertRetentionRescuePromotionFidelity } from "../composition/assert-retention-rescue-promotion-fidelity";
import type { DeterministicFallbackBuildResult } from "../composition/build-retention-coherent-deterministic-rescue";
import { mapRetentionNarrationToBeats } from "../composition/map-retention-narration-to-beats";
import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import { rebuildRetentionReadyBridgeFromCandidate } from "./rebuild-retention-ready-bridge-from-candidate";
import type { RetentionHookBridgeResult } from "./retention-hook-bridge.types";

function fidelityOk(
  built: DeterministicFallbackBuildResult,
  promoted: Extract<RetentionHookBridgeResult, { status: "ready" }>,
  authorisedHookReplacement: boolean,
): boolean {
  return assertRetentionRescuePromotionFidelity({
    canonicalNarration: built.candidate.assembledNarration,
    promotedNarration: promoted.approvedNarration,
    authorisedHookReplacement,
    canonicalUsedContentIds: built.usedContentUnitIds,
    promotedUsedContentIds: built.usedContentUnitIds,
    essentialContentIds: built.usedContentUnitIds,
    requiredUncertaintyMarkers: ["may", "might"],
  }).ok;
}

function remapCanonicalOnce(input: {
  readonly built: DeterministicFallbackBuildResult;
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
}): DeterministicFallbackBuildResult["candidate"] {
  const mapped = mapRetentionNarrationToBeats({
    narration: input.built.candidate.assembledNarration,
    plan: input.plan,
    grounding: input.grounding,
    strategySeed: input.strategySeed,
    usedClaimIds: input.built.usedClaimIds,
    hookOpening: input.built.hookOpening,
    payoffClosing: input.built.payoffClosing,
    allowEmptyInternalBeats: true,
  });
  return assembleRetentionNarrationCandidate({
    origin: "final",
    planFingerprint: input.plan.planFingerprint,
    orderedBeatIds: input.plan.beatPlan.beats.map((beat) => beat.id),
    segments: mapped.segments,
    assemblyGap: " ",
  });
}

export function promoteRetentionRescueWithFidelity(input: {
  readonly contract: NormalizedStoryContract;
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly ledger: RetentionModelCallLedger;
  readonly built: DeterministicFallbackBuildResult;
  readonly hookContext: HookGenerationContext;
  readonly authorisedHookReplacement?: boolean;
}): RetentionHookBridgeResult {
  const authorisedHookReplacement = input.authorisedHookReplacement === true;
  const first = rebuildRetentionReadyBridgeFromCandidate({
    contract: input.contract,
    plan: input.plan,
    grounding: input.grounding,
    strategySeed: input.strategySeed,
    ledger: input.ledger,
    sourceCandidate: input.built.candidate,
    title: input.built.title,
    hookContext: input.hookContext,
    compositionAuthority: "deterministic_rescue",
  });
  if (first.status === "ready" && fidelityOk(input.built, first, authorisedHookReplacement)) {
    return first;
  }

  const remapped = remapCanonicalOnce({
    built: input.built,
    plan: input.plan,
    grounding: input.grounding,
    strategySeed: input.strategySeed,
  });
  const retry = rebuildRetentionReadyBridgeFromCandidate({
    contract: input.contract,
    plan: input.plan,
    grounding: input.grounding,
    strategySeed: input.strategySeed,
    ledger: input.ledger,
    sourceCandidate: remapped,
    title: input.built.title,
    hookContext: input.hookContext,
    compositionAuthority: "deterministic_rescue",
  });
  if (retry.status === "ready" && fidelityOk(input.built, retry, authorisedHookReplacement)) {
    return retry;
  }

  if (first.status === "ready" || retry.status === "ready") {
    const source = first.status === "ready" ? first : retry;
    return Object.freeze({
      status: "failed" as const,
      reason: "candidate_reconciliation_failed" as const,
      diagnostics: {
        ...source.diagnostics,
        outcome: "failed" as const,
      },
    });
  }
  return first;
}

export function rescuePromotionPreservesCanonical(
  built: DeterministicFallbackBuildResult,
  promotedNarration: string,
  authorisedHookReplacement = false,
): boolean {
  return assertRetentionRescuePromotionFidelity({
    canonicalNarration: built.candidate.assembledNarration,
    promotedNarration,
    authorisedHookReplacement,
    canonicalUsedContentIds: built.usedContentUnitIds,
    promotedUsedContentIds: built.usedContentUnitIds,
    essentialContentIds: built.usedContentUnitIds,
    requiredUncertaintyMarkers: ["may", "might"],
  }).ok;
}
