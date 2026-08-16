/**
 * Zero-model participant-coverage body reconciliation — Sprint 10H.4B.
 *
 * Preserves the approved opening span. Inserts a qualitative body sentence that
 * names missing matchup participants without adding scores/results/stats.
 * No model call. No ledger consume.
 */

import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import {
  buildRetentionParticipantCoverage,
  evaluateRetentionParticipantCoverage,
  narrationCoversRetentionParticipantGroup,
  type RetentionParticipantCoverage,
  type RetentionParticipantGroup,
} from "../strategy/retention-matchup-participant-coverage";
import { detectRetentionFactualRisk } from "../strategy/retention-factual-risk";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import {
  assembleRetentionNarrationCandidate,
  detectRetentionNarrationAssemblyGap,
  type RetentionSegmentDraft,
} from "./assemble-retention-narration-candidate";
import { assertRetentionNarrationCandidateCoherence } from "./assert-retention-narration-candidate-coherence";
import type { RetentionNarrationCandidate } from "./retention-narration-candidate.types";
import {
  enforceRetentionCandidateWordBudget,
  extractFirstSpokenSentence,
} from "./enforce-retention-candidate-word-budget";

function ensureTerminalPunctuation(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/[.!?…]$/u.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

/** Generic qualitative meeting language — labels come from the creator topic only. */
function qualitativeCoverageSentence(
  covered: RetentionParticipantGroup,
  missing: readonly RetentionParticipantGroup[],
): string {
  if (missing.length === 1) {
    return ensureTerminalPunctuation(
      `${covered.displayLabel} met ${missing[0]!.displayLabel}`,
    );
  }
  const names = missing.map((g) => g.displayLabel).join(" and ");
  return ensureTerminalPunctuation(`${covered.displayLabel} faced ${names}`);
}

function pickCoveredGroup(
  coverage: RetentionParticipantCoverage,
  narration: string,
): RetentionParticipantGroup | null {
  for (const group of coverage.groups) {
    if (narrationCoversRetentionParticipantGroup(narration, group)) {
      return group;
    }
  }
  // Prefer a side that has any required identity token present (partial cover).
  for (const group of coverage.groups) {
    const narrationTokens = new Set(
      narration
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean),
    );
    if (
      group.requiredIdentityTokens.some((t) => narrationTokens.has(t)) ||
      group.tokens.some((t) => narrationTokens.has(t))
    ) {
      return group;
    }
  }
  return coverage.groups[0] ?? null;
}

export type ReconcileParticipantCoverageResult =
  | {
      readonly ok: true;
      readonly candidate: RetentionNarrationCandidate;
    }
  | {
      readonly ok: false;
      readonly reason: "not_required" | "already_covered" | "rebuild_failed";
    };

/**
 * Deterministically reconcile missing matchup participants into the body.
 */
export function reconcileRetentionParticipantCoverageZeroModel(input: {
  readonly contract: NormalizedStoryContract;
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly candidate: RetentionNarrationCandidate;
}): ReconcileParticipantCoverageResult {
  const coverage = buildRetentionParticipantCoverage(input.contract);
  const evaluation = evaluateRetentionParticipantCoverage({
    coverage,
    narration: input.candidate.assembledNarration,
  });
  if (!evaluation.required) {
    return Object.freeze({ ok: false as const, reason: "not_required" as const });
  }
  if (evaluation.passed) {
    return Object.freeze({
      ok: false as const,
      reason: "already_covered" as const,
    });
  }

  const missingGroups = coverage.groups.filter((g) =>
    evaluation.missingGroupIds.includes(g.groupId),
  );
  if (missingGroups.length === 0) {
    return Object.freeze({
      ok: false as const,
      reason: "already_covered" as const,
    });
  }

  const opening = extractFirstSpokenSentence(input.candidate.assembledNarration);
  const covered =
    pickCoveredGroup(coverage, input.candidate.assembledNarration) ??
    coverage.groups.find((g) => !evaluation.missingGroupIds.includes(g.groupId)) ??
    coverage.groups[0]!;

  const insert = qualitativeCoverageSentence(covered, missingGroups);
  // Never invent factual-risk wording beyond qualitative meeting language.
  if (detectRetentionFactualRisk(insert).risky) {
    return Object.freeze({ ok: false as const, reason: "rebuild_failed" as const });
  }

  const texts = input.candidate.segments.map((segment, index) => {
    if (index === 0) {
      // Keep opening; append coverage into first-beat body when possible.
      const text = segment.text;
      if (opening && text.startsWith(opening)) {
        const body = text.slice(opening.length).trim();
        return body
          ? ensureTerminalPunctuation(`${opening} ${body} ${insert}`)
          : ensureTerminalPunctuation(`${opening} ${insert}`);
      }
      return ensureTerminalPunctuation(`${text} ${insert}`);
    }
    if (index === 1) {
      // Prefer body beat for the opposing participant.
      return ensureTerminalPunctuation(`${insert} ${segment.text}`);
    }
    return segment.text;
  });

  // If we have 2+ beats, prefer inserting only on beat 1 (not duplicated on 0).
  if (texts.length >= 2) {
    const first = input.candidate.segments[0]!.text;
    texts[0] = first;
    texts[1] = ensureTerminalPunctuation(
      `${insert} ${input.candidate.segments[1]!.text}`,
    );
  }

  try {
    const drafts: RetentionSegmentDraft[] = input.candidate.segments.map(
      (segment, index) =>
        Object.freeze({
          beatId: segment.beatId,
          text: texts[index]!,
          claimRefs: segment.claimRefs,
          factualRisk: detectRetentionFactualRisk(texts[index]!).risky,
        }),
    );
    const assembled = assembleRetentionNarrationCandidate({
      origin: "after_hook_approval",
      planFingerprint: input.plan.planFingerprint,
      orderedBeatIds: input.candidate.orderedBeatIds,
      segments: drafts,
      assemblyGap: detectRetentionNarrationAssemblyGap(input.candidate),
    });
    let candidate = assertRetentionNarrationCandidateCoherence(assembled, {
      plan: input.plan,
      grounding: input.grounding,
      strategySeed: input.strategySeed,
    });

    const recheck = evaluateRetentionParticipantCoverage({
      coverage,
      narration: candidate.assembledNarration,
    });
    if (!recheck.passed) {
      return Object.freeze({
        ok: false as const,
        reason: "rebuild_failed" as const,
      });
    }

    // Fit word budget without dropping sole participant coverage.
    candidate = enforceRetentionCandidateWordBudget({
      candidate,
      plan: input.plan,
      grounding: input.grounding,
      strategySeed: input.strategySeed,
      contract: input.contract,
      ...(opening ? { approvedOpeningText: opening } : {}),
    });

    const finalCheck = evaluateRetentionParticipantCoverage({
      coverage,
      narration: candidate.assembledNarration,
    });
    if (!finalCheck.passed) {
      return Object.freeze({
        ok: false as const,
        reason: "rebuild_failed" as const,
      });
    }

    return Object.freeze({ ok: true as const, candidate });
  } catch {
    return Object.freeze({ ok: false as const, reason: "rebuild_failed" as const });
  }
}
