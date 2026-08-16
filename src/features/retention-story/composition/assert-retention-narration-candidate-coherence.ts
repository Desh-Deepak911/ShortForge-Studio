/**
 * Retention narration candidate coherence assertion — Sprint 10E / 10E.1.
 */

import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import { RetentionStoryError } from "../domain/retention-story-errors";
import { retentionStableStringify } from "../domain/retention-story-fingerprint";
import {
  canonicalizeControllingIdeaClaimRefs,
  isClaimEligibleForNarrationSupport,
} from "../strategy/retention-claim-support";
import { detectRetentionFactualRisk } from "../strategy/retention-factual-risk";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import { RETENTION_STORY_PLAN_FINGERPRINT_PREFIX } from "../planning/retention-story-plan.constants";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import {
  assembleRetentionNarrationCandidate,
  buildRetentionNarrationCandidateFingerprint,
  detectRetentionNarrationAssemblyGap,
  isPermittedRetentionNarrationAssemblyGap,
} from "./assemble-retention-narration-candidate";
import { canonicalizeRetentionSegmentText } from "./canonicalize-retention-segment-text";
import {
  RETENTION_CANDIDATE_FINGERPRINT_PREFIX,
  RETENTION_MAX_SEGMENT_CLAIM_REFS,
  RETENTION_NARRATION_CANDIDATE_VERSION,
} from "./retention-narration-candidate.constants";
import { isRetentionNarrationCandidateOrigin } from "./retention-narration-candidate-origin";
import { resolveAuthorizedClaimIdsForBeat } from "./retention-opening-claim-authority";
import type { RetentionNarrationCandidate } from "./retention-narration-candidate.types";

export interface AssertRetentionNarrationCandidateContext {
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  /** Exact asserted strategy seed — sole controlling-idea claim authority. */
  readonly strategySeed: RetentionStrategySeed;
}

const CANDIDATE_KEYS = new Set([
  "version",
  "origin",
  "planFingerprint",
  "orderedBeatIds",
  "segments",
  "assembledNarration",
  "candidateFingerprint",
]);

const SEGMENT_KEYS = new Set([
  "beatId",
  "text",
  "startOffset",
  "endOffset",
  "claimRefs",
  "factualRisk",
]);

function throwMismatch(): never {
  throw new RetentionStoryError(
    "candidate_fingerprint_mismatch",
    "Retention narration candidate failed coherence checks.",
  );
}

/**
 * Total structural validator — never throws.
 */
export function validateRetentionNarrationCandidate(
  value: unknown,
): value is RetentionNarrationCandidate {
  try {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    for (const key of Object.keys(candidate)) {
      if (!CANDIDATE_KEYS.has(key)) return false;
    }
    if (candidate.version !== RETENTION_NARRATION_CANDIDATE_VERSION) return false;
    if (!isRetentionNarrationCandidateOrigin(candidate.origin)) return false;
    if (typeof candidate.planFingerprint !== "string") return false;
    if (
      !candidate.planFingerprint.startsWith(RETENTION_STORY_PLAN_FINGERPRINT_PREFIX)
    ) {
      return false;
    }
    if (typeof candidate.assembledNarration !== "string") return false;
    if (typeof candidate.candidateFingerprint !== "string") return false;
    if (
      !candidate.candidateFingerprint.startsWith(
        RETENTION_CANDIDATE_FINGERPRINT_PREFIX,
      )
    ) {
      return false;
    }
    if (!Array.isArray(candidate.orderedBeatIds)) return false;
    if (!Array.isArray(candidate.segments)) return false;
    if (candidate.segments.length !== candidate.orderedBeatIds.length) {
      return false;
    }
    for (let i = 0; i < candidate.segments.length; i++) {
      const seg = candidate.segments[i] as Record<string, unknown> | null;
      if (seg == null || typeof seg !== "object") return false;
      for (const key of Object.keys(seg)) {
        if (!SEGMENT_KEYS.has(key)) return false;
      }
      if (seg.beatId !== candidate.orderedBeatIds[i]) return false;
      if (typeof seg.text !== "string") return false;
      if (seg.text.length === 0 && i === 0) return false;
      if (typeof seg.startOffset !== "number") return false;
      if (typeof seg.endOffset !== "number") return false;
      if (!Number.isInteger(seg.startOffset) || !Number.isInteger(seg.endOffset)) {
        return false;
      }
      if (!Array.isArray(seg.claimRefs)) return false;
      if (typeof seg.factualRisk !== "boolean") return false;
      if (
        (candidate.assembledNarration as string).slice(
          seg.startOffset as number,
          seg.endOffset as number,
        ) !== seg.text
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Rebuild and assert a detached deeply-frozen canonical candidate.
 */
export function assertRetentionNarrationCandidateCoherence(
  candidate: unknown,
  context: AssertRetentionNarrationCandidateContext,
): RetentionNarrationCandidate {
  if (!validateRetentionNarrationCandidate(candidate)) throwMismatch();
  const raw = candidate as RetentionNarrationCandidate;

  if (!isRetentionNarrationCandidateOrigin(raw.origin)) throwMismatch();
  if (raw.planFingerprint !== context.plan.planFingerprint) throwMismatch();
  if (
    !raw.planFingerprint.startsWith(RETENTION_STORY_PLAN_FINGERPRINT_PREFIX)
  ) {
    throwMismatch();
  }
  if (
    !raw.candidateFingerprint.startsWith(RETENTION_CANDIDATE_FINGERPRINT_PREFIX)
  ) {
    throwMismatch();
  }

  const orderedBeatIds = context.plan.beatPlan.beats.map((b) => b.id);
  if (
    retentionStableStringify(raw.orderedBeatIds) !==
    retentionStableStringify(orderedBeatIds)
  ) {
    throwMismatch();
  }
  if (new Set(orderedBeatIds).size !== orderedBeatIds.length) throwMismatch();

  const drafts = raw.segments.map((segment, index) => {
    const text =
      segment.text === "" && index > 0
        ? ""
        : canonicalizeRetentionSegmentText(segment.text);
    if (text == null || text !== segment.text) throwMismatch();

    const refs = canonicalizeControllingIdeaClaimRefs(segment.claimRefs);
    if (refs == null) throwMismatch();
    if (refs.length > RETENTION_MAX_SEGMENT_CLAIM_REFS) throwMismatch();
    if (
      retentionStableStringify(refs) !==
      retentionStableStringify(segment.claimRefs)
    ) {
      throwMismatch();
    }

    const authorized = resolveAuthorizedClaimIdsForBeat(
      segment.beatId,
      context.plan,
      context.strategySeed,
    );
    const narrationMode = context.grounding.claims.some(
      (c) =>
        c.sourceRef === "creative_premise" &&
        c.permittedFactualUse &&
        !c.forbidden,
    )
      ? ("creative_premise" as const)
      : ("verified_facts_only" as const);
    for (const ref of refs) {
      if (
        !isClaimEligibleForNarrationSupport(
          context.grounding,
          ref,
          narrationMode,
        )
      ) {
        throwMismatch();
      }
      if (!authorized.has(ref)) throwMismatch();
    }
    const factualRisk = detectRetentionFactualRisk(text).risky;
    if (factualRisk !== segment.factualRisk) throwMismatch();
    if (factualRisk && refs.length === 0) {
      const slice = raw.assembledNarration.slice(
        segment.startOffset,
        segment.endOffset,
      );
      // Spoken narration is the grounding authority. Missing segment refs are
      // metadata and must not reverse an already-accepted contiguous span.
      if (slice !== segment.text) throwMismatch();
    }

    if (
      !Number.isInteger(segment.startOffset) ||
      !Number.isInteger(segment.endOffset) ||
      !Number.isFinite(segment.startOffset) ||
      !Number.isFinite(segment.endOffset)
    ) {
      throwMismatch();
    }
    if (index > 0) {
      const prev = raw.segments[index - 1]!;
      const gap = raw.assembledNarration.slice(
        prev.endOffset,
        segment.startOffset,
      );
      if (segment.text.length === 0) {
        if (gap !== "") throwMismatch();
      } else {
        if (!isPermittedRetentionNarrationAssemblyGap(gap)) throwMismatch();
        const spokenGap = detectRetentionNarrationAssemblyGap(raw);
        if (spokenGap && gap !== spokenGap) throwMismatch();
      }
    } else if (segment.startOffset !== 0) {
      throwMismatch();
    }

    return Object.freeze({
      beatId: segment.beatId,
      text,
      claimRefs: refs,
      factualRisk,
    });
  });

  const rebuilt = assembleRetentionNarrationCandidate({
    origin: raw.origin,
    planFingerprint: context.plan.planFingerprint,
    orderedBeatIds,
    segments: drafts,
    assemblyGap: detectRetentionNarrationAssemblyGap(raw),
  });

  const expectedFp = buildRetentionNarrationCandidateFingerprint({
    origin: rebuilt.origin,
    planFingerprint: rebuilt.planFingerprint,
    orderedBeatIds: rebuilt.orderedBeatIds,
    segments: rebuilt.segments,
    assembledNarration: rebuilt.assembledNarration,
  });
  if (rebuilt.candidateFingerprint !== expectedFp) throwMismatch();
  if (raw.candidateFingerprint !== rebuilt.candidateFingerprint) throwMismatch();
  if (raw.assembledNarration !== rebuilt.assembledNarration) throwMismatch();
  if (retentionStableStringify(raw) !== retentionStableStringify(rebuilt)) {
    throwMismatch();
  }

  return rebuilt;
}
