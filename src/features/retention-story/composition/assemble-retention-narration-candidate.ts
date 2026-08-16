/**
 * Deterministic Retention narration assembly + fingerprint — Sprint 10E / 10E.1.
 */

import { RetentionStoryError } from "../domain/retention-story-errors";
import { buildRetentionSemanticIdentity } from "../domain/retention-story-fingerprint";
import { RETENTION_STORY_PLAN_FINGERPRINT_PREFIX } from "../planning/retention-story-plan.constants";
import {
  RETENTION_CANDIDATE_FINGERPRINT_PREFIX,
  RETENTION_NARRATION_CANDIDATE_VERSION,
  RETENTION_SEGMENT_SEPARATOR,
} from "./retention-narration-candidate.constants";
import { assertRetentionNarrationCandidateOrigin } from "./retention-narration-candidate-origin";
import type {
  RetentionNarrationCandidate,
  RetentionNarrationCandidateOrigin,
  RetentionNarrationSegment,
} from "./retention-narration-candidate.types";
import type { RetentionNarrationAssemblyGap } from "./retention-narration-first.types";

export function isPermittedRetentionNarrationAssemblyGap(
  gap: string,
): gap is RetentionNarrationAssemblyGap {
  return gap === RETENTION_SEGMENT_SEPARATOR || gap === " " || gap === "";
}

export function detectRetentionNarrationAssemblyGap(candidate: {
  readonly segments: readonly { readonly startOffset: number; readonly endOffset: number }[];
  readonly assembledNarration: string;
}): RetentionNarrationAssemblyGap {
  const spoken = candidate.segments.filter(
    (segment) => segment.endOffset > segment.startOffset,
  );
  if (spoken.length < 2) return "";
  const gap = candidate.assembledNarration.slice(
    spoken[0]!.endOffset,
    spoken[1]!.startOffset,
  );
  if (isPermittedRetentionNarrationAssemblyGap(gap)) return gap;
  return RETENTION_SEGMENT_SEPARATOR;
}

export interface RetentionSegmentDraft {
  readonly beatId: string;
  readonly text: string;
  readonly claimRefs: readonly string[];
  readonly factualRisk: boolean;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

/**
 * Assemble ordered segment drafts into a canonical candidate with exact UTF-16 offsets.
 */
export function assembleRetentionNarrationCandidate(input: {
  readonly origin: RetentionNarrationCandidateOrigin;
  readonly planFingerprint: string;
  readonly orderedBeatIds: readonly string[];
  readonly segments: readonly RetentionSegmentDraft[];
  readonly assemblyGap?: RetentionNarrationAssemblyGap;
}): RetentionNarrationCandidate {
  const origin = assertRetentionNarrationCandidateOrigin(input.origin);
  const { planFingerprint, orderedBeatIds, segments } = input;

  if (
    typeof planFingerprint !== "string" ||
    !planFingerprint.startsWith(RETENTION_STORY_PLAN_FINGERPRINT_PREFIX)
  ) {
    throw new RetentionStoryError(
      "candidate_fingerprint_mismatch",
      "Retention narration candidate plan fingerprint is invalid.",
    );
  }

  if (orderedBeatIds.length === 0 || segments.length === 0) {
    throw new RetentionStoryError(
      "composer_segment_mismatch",
      "Retention narration candidate requires at least one segment.",
    );
  }
  if (segments.length !== orderedBeatIds.length) {
    throw new RetentionStoryError(
      "composer_segment_mismatch",
      "Retention narration segment count does not match ordered beat IDs.",
    );
  }

  const uniqueBeats = new Set(orderedBeatIds);
  if (uniqueBeats.size !== orderedBeatIds.length) {
    throw new RetentionStoryError(
      "composer_segment_mismatch",
      "Retention narration ordered beat IDs are not unique.",
    );
  }

  const assemblyGap: RetentionNarrationAssemblyGap =
    input.assemblyGap ?? RETENTION_SEGMENT_SEPARATOR;
  if (!isPermittedRetentionNarrationAssemblyGap(assemblyGap)) {
    throw new RetentionStoryError(
      "composer_segment_mismatch",
      "Retention narration assembly gap is not permitted.",
    );
  }

  const built: RetentionNarrationSegment[] = [];
  let cursor = 0;
  let assembled = "";

  for (let i = 0; i < segments.length; i++) {
    const draft = segments[i]!;
    if (draft.beatId !== orderedBeatIds[i]) {
      throw new RetentionStoryError(
        "composer_segment_mismatch",
        "Retention narration segment beat ordering is invalid.",
      );
    }
    const text = draft.text;
    if (typeof text !== "string") {
      throw new RetentionStoryError(
        "composer_proposal_invalid",
        "Retention narration segment text is invalid.",
      );
    }
    const mappingOnlyEmpty = text.length === 0;
    if (mappingOnlyEmpty && i === 0) {
      throw new RetentionStoryError(
        "composer_proposal_invalid",
        "Retention narration opening segment cannot be empty.",
      );
    }
    if (!mappingOnlyEmpty && i > 0 && assembled.length > 0) {
      assembled += assemblyGap;
      cursor += assemblyGap.length;
    }
    const startOffset = cursor;
    const endOffset = startOffset + text.length;
    assembled += text;
    if (assembled.slice(startOffset, endOffset) !== text) {
      throw new RetentionStoryError(
        "composer_segment_mismatch",
        "Retention narration segment offset assembly failed.",
      );
    }
    built.push(
      Object.freeze({
        beatId: draft.beatId,
        text,
        startOffset,
        endOffset,
        claimRefs: Object.freeze([...draft.claimRefs]),
        factualRisk: draft.factualRisk === true,
      }),
    );
    cursor = endOffset;
  }

  if (!assembled || assembled !== assembled.trim()) {
    if (assembled !== assembled.replace(/^\s+|\s+$/g, "")) {
      throw new RetentionStoryError(
        "composer_proposal_invalid",
        "Retention narration assembly has leading or trailing whitespace.",
      );
    }
  }
  if (!assembled) {
    throw new RetentionStoryError(
      "composer_proposal_invalid",
      "Retention narration assembly is empty.",
    );
  }

  for (let i = 0; i < built.length; i++) {
    const segment = built[i]!;
    if (
      !Number.isInteger(segment.startOffset) ||
      !Number.isInteger(segment.endOffset) ||
      !Number.isFinite(segment.startOffset) ||
      !Number.isFinite(segment.endOffset)
    ) {
      throw new RetentionStoryError(
        "composer_segment_mismatch",
        "Retention narration segment offsets must be finite integers.",
      );
    }
    if (
      assembled.slice(segment.startOffset, segment.endOffset) !== segment.text
    ) {
      throw new RetentionStoryError(
        "composer_segment_mismatch",
        "Retention narration segment offsets do not match assembled text.",
      );
    }
    if (i > 0) {
      const prev = built[i - 1]!;
      const gap = assembled.slice(prev.endOffset, segment.startOffset);
      const expectedGap =
        segment.text.length === 0
          ? ""
          : prev.text.length === 0
            ? assemblyGap
            : assemblyGap;
      if (gap !== expectedGap) {
        throw new RetentionStoryError(
          "composer_segment_mismatch",
          "Retention narration segment boundaries are not contiguous.",
        );
      }
    } else if (segment.startOffset !== 0) {
      throw new RetentionStoryError(
        "composer_segment_mismatch",
        "Retention narration first segment must start at offset zero.",
      );
    }
  }

  const candidateFingerprint = buildRetentionNarrationCandidateFingerprint({
    origin,
    planFingerprint,
    orderedBeatIds,
    segments: built,
    assembledNarration: assembled,
  });

  const candidate: RetentionNarrationCandidate = {
    version: RETENTION_NARRATION_CANDIDATE_VERSION,
    origin,
    planFingerprint,
    orderedBeatIds: Object.freeze([...orderedBeatIds]),
    segments: Object.freeze(built),
    assembledNarration: assembled,
    candidateFingerprint,
  };

  return deepFreeze(candidate);
}

export function buildRetentionNarrationCandidateFingerprint(input: {
  readonly origin: RetentionNarrationCandidateOrigin;
  readonly planFingerprint: string;
  readonly orderedBeatIds: readonly string[];
  readonly segments: readonly RetentionNarrationSegment[];
  readonly assembledNarration: string;
}): string {
  assertRetentionNarrationCandidateOrigin(input.origin);
  return buildRetentionSemanticIdentity(
    {
      version: RETENTION_NARRATION_CANDIDATE_VERSION,
      origin: input.origin,
      planFingerprint: input.planFingerprint,
      orderedBeatIds: [...input.orderedBeatIds],
      segments: input.segments.map((segment) => ({
        beatId: segment.beatId,
        text: segment.text,
        startOffset: segment.startOffset,
        endOffset: segment.endOffset,
        claimRefs: [...segment.claimRefs].sort((a, b) => a.localeCompare(b)),
        factualRisk: segment.factualRisk,
      })),
      assembledNarration: input.assembledNarration,
    },
    RETENTION_CANDIDATE_FINGERPRINT_PREFIX,
  );
}
