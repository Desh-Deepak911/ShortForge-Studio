/**
 * Post-Hook Retention candidate reconciliation — Sprint 10E / 10E.1.
 *
 * Hook owns the approved opening text and offsets. Retention rebuilds a new
 * after_hook_approval candidate or fails closed when mapping is dishonest.
 */

import { extractOpeningSpan } from "@/features/hook-engine/validation/extract-opening-span";

import { RetentionStoryError } from "../domain/retention-story-errors";
import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import { detectRetentionFactualRisk } from "../strategy/retention-factual-risk";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import {
  assembleRetentionNarrationCandidate,
  detectRetentionNarrationAssemblyGap,
} from "./assemble-retention-narration-candidate";
import { assertRetentionNarrationCandidateCoherence } from "./assert-retention-narration-candidate-coherence";
import type { RetentionNarrationCandidate } from "./retention-narration-candidate.types";

export interface HookApprovedOpening {
  readonly openingText: string;
  readonly openingStartOffset: number;
  readonly openingEndOffset: number;
}

export interface ReconcileRetentionCandidateAfterHookInput {
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  /** Exact asserted strategy seed — sole controlling-idea claim authority. */
  readonly strategySeed: RetentionStrategySeed;
  /** Structured candidate corresponding to the narration Hook considered. */
  readonly sourceCandidate: RetentionNarrationCandidate;
  readonly approvedNarration: string;
  readonly approvedOpening: HookApprovedOpening;
}

function failReconciliation(message: string): never {
  throw new RetentionStoryError("candidate_reconciliation_failed", message);
}

/**
 * Reconcile Hook-approved narration into an after_hook_approval candidate.
 */
export function reconcileRetentionCandidateAfterHook(
  input: ReconcileRetentionCandidateAfterHookInput,
): RetentionNarrationCandidate {
  const {
    plan,
    grounding,
    strategySeed,
    sourceCandidate,
    approvedNarration,
    approvedOpening,
  } = input;

  if (typeof approvedNarration !== "string" || !approvedNarration) {
    failReconciliation("Hook-approved narration is missing.");
  }

  const { openingText, openingStartOffset, openingEndOffset } = approvedOpening;
  if (
    typeof openingText !== "string" ||
    typeof openingStartOffset !== "number" ||
    typeof openingEndOffset !== "number" ||
    openingStartOffset < 0 ||
    openingEndOffset <= openingStartOffset
  ) {
    failReconciliation("Hook-approved opening offsets are invalid.");
  }

  if (
    approvedNarration.slice(openingStartOffset, openingEndOffset) !==
    openingText
  ) {
    failReconciliation(
      "Hook-approved opening text does not match approved narration offsets.",
    );
  }

  const leading = approvedNarration.slice(0, openingStartOffset);
  if (leading.trim() !== "") {
    failReconciliation(
      "Hook-approved narration has non-whitespace content before the opening.",
    );
  }

  const openingPrefix = approvedNarration.slice(0, openingEndOffset);
  const sourceFirst = sourceCandidate.segments[0];
  if (!sourceFirst) {
    failReconciliation("Source Retention candidate has no segments.");
  }

  // Unchanged approval — re-origin and recompute derived fields.
  if (approvedNarration === sourceCandidate.assembledNarration) {
    const unchanged = assembleRetentionNarrationCandidate({
      origin: "after_hook_approval",
      planFingerprint: plan.planFingerprint,
      orderedBeatIds: sourceCandidate.orderedBeatIds,
      segments: sourceCandidate.segments.map((s) =>
        Object.freeze({
          beatId: s.beatId,
          text: s.text,
          claimRefs: s.claimRefs,
          factualRisk: detectRetentionFactualRisk(s.text).risky,
        }),
      ),
      assemblyGap: detectRetentionNarrationAssemblyGap(sourceCandidate),
    });
    try {
    return assertRetentionNarrationCandidateCoherence(unchanged, {
      plan,
      grounding,
      strategySeed,
    });
    } catch {
      failReconciliation(
        "Unchanged Hook-approved candidate failed Retention coherence.",
      );
    }
  }

  // Opening-only mutation: deterministic source opening via Hook extractor.
  const sourceSpan = extractOpeningSpan(sourceCandidate.assembledNarration);
  if (sourceSpan == null) {
    failReconciliation(
      "Source Retention candidate opening span could not be extracted.",
    );
  }

  const sourceTail = sourceCandidate.assembledNarration.slice(
    sourceSpan.openingEndOffset,
  );
  const approvedTail = approvedNarration.slice(openingEndOffset);
  if (sourceTail !== approvedTail) {
    failReconciliation(
      "Hook-approved narration body tail does not match the source candidate.",
    );
  }

  const sourceOpeningPrefix = sourceCandidate.assembledNarration.slice(
    0,
    sourceSpan.openingEndOffset,
  );
  if (
    !sourceFirst.text.startsWith(sourceOpeningPrefix) &&
    sourceFirst.text !== sourceOpeningPrefix
  ) {
    failReconciliation(
      "Source opening does not align with the first Retention segment.",
    );
  }

  const firstRemainder = sourceFirst.text.startsWith(sourceOpeningPrefix)
    ? sourceFirst.text.slice(sourceOpeningPrefix.length)
    : "";
  const newFirstText = openingPrefix + firstRemainder;

  const drafts = sourceCandidate.segments.map((segment, index) => {
    if (index === 0) {
      return Object.freeze({
        beatId: segment.beatId,
        text: newFirstText,
        claimRefs: segment.claimRefs,
        factualRisk: detectRetentionFactualRisk(newFirstText).risky,
      });
    }
    return Object.freeze({
      beatId: segment.beatId,
      text: segment.text,
      claimRefs: segment.claimRefs,
      factualRisk: detectRetentionFactualRisk(segment.text).risky,
    });
  });

  const assemblyGap = detectRetentionNarrationAssemblyGap(sourceCandidate);
  const rebuiltAssembled = drafts.map((d) => d.text).join(assemblyGap);
  if (rebuiltAssembled !== approvedNarration) {
    failReconciliation(
      "Opening-only reconciliation could not rebuild the approved narration.",
    );
  }

  try {
    const reconciled = assembleRetentionNarrationCandidate({
      origin: "after_hook_approval",
      planFingerprint: plan.planFingerprint,
      orderedBeatIds: sourceCandidate.orderedBeatIds,
      segments: drafts,
      assemblyGap,
    });
    return assertRetentionNarrationCandidateCoherence(reconciled, {
      plan,
      grounding,
      strategySeed,
    });
  } catch (error) {
    if (
      error instanceof RetentionStoryError &&
      error.reason === "candidate_reconciliation_failed"
    ) {
      throw error;
    }
    failReconciliation(
      "Hook-approved narration cannot be mapped to Retention segments.",
    );
  }
}
