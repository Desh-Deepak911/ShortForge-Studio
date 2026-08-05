/**
 * Strict Retention composer proposal normalization — Sprint 10E / 10E.1 / 10E.1A.
 */

import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import { RetentionStoryError } from "../domain/retention-story-errors";
import { sanitizeRetentionText } from "../domain/normalize-story-contract";
import {
  canonicalizeControllingIdeaClaimRefs,
  isClaimEligibleForNarrationSupport,
} from "../strategy/retention-claim-support";
import type { RetentionFactHandlingMode } from "../domain/retention-story-contract.types";
import { detectRetentionFactualRisk } from "../strategy/retention-factual-risk";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import {
  RETENTION_MAX_COMPOSER_TITLE_CHARS,
  RETENTION_MAX_SEGMENT_CLAIM_REFS,
} from "./retention-narration-candidate.constants";
import type { RetentionSegmentDraft } from "./assemble-retention-narration-candidate";
import { canonicalizeRetentionSegmentText } from "./canonicalize-retention-segment-text";
import {
  resolveAuthorizedClaimIdsForBeat,
  resolvePlanAuthorizedOpeningClaimIds,
} from "./retention-opening-claim-authority";

export interface NormalizedRetentionComposerProposal {
  readonly title: string;
  readonly hookClaimRefs: readonly string[];
  readonly segments: readonly RetentionSegmentDraft[];
}

function throwProposalInvalid(): never {
  throw new RetentionStoryError(
    "composer_proposal_invalid",
    "Retention composer proposal is malformed.",
  );
}

function throwSegmentMismatch(): never {
  throw new RetentionStoryError(
    "composer_segment_mismatch",
    "Retention composer segments do not match the Retention plan beats.",
  );
}

function throwGroundingInvalid(): never {
  throw new RetentionStoryError(
    "composer_grounding_invalid",
    "Retention composer segment grounding is invalid.",
  );
}

/**
 * Normalize a raw composer proposal against an asserted Retention plan + seed.
 */
function resolveNarrationFactHandlingMode(
  grounding: RetentionGroundingContext,
  factHandlingMode?: RetentionFactHandlingMode,
): RetentionFactHandlingMode {
  if (factHandlingMode === "creative_premise") return "creative_premise";
  if (factHandlingMode === "verified_facts_only") return "verified_facts_only";
  // Infer from grounding when callers omit mode (premise claims only exist under Creative Premise).
  const hasPremise = grounding.claims.some(
    (c) =>
      c.sourceRef === "creative_premise" &&
      c.permittedFactualUse &&
      !c.forbidden,
  );
  return hasPremise ? "creative_premise" : "verified_facts_only";
}

export function normalizeRetentionComposerProposal(
  raw: unknown,
  plan: RetentionStoryPlan,
  grounding: RetentionGroundingContext,
  strategySeed: RetentionStrategySeed,
  permittedHookClaimIds: readonly string[] = [],
  factHandlingMode?: RetentionFactHandlingMode,
): NormalizedRetentionComposerProposal {
  const narrationMode = resolveNarrationFactHandlingMode(
    grounding,
    factHandlingMode,
  );
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throwProposalInvalid();
  }
  const record = raw as Record<string, unknown>;
  void record.reasoning;
  void record.chainOfThought;
  void record.diagnostics;

  if (typeof record.title !== "string") throwProposalInvalid();
  const sanitizedTitle = sanitizeRetentionText(
    record.title,
    RETENTION_MAX_COMPOSER_TITLE_CHARS,
  );
  if (!sanitizedTitle) throwProposalInvalid();
  if (
    sanitizedTitle !== record.title.normalize("NFC").replace(/\s+/g, " ").trim()
  ) {
    throwProposalInvalid();
  }
  // A provider can return question-shaped fragments such as "Why Brighton
  // are?". Keep generation fail-soft, but never present broken grammar as the
  // creator's title. This is subject-agnostic and only repairs the malformed
  // auxiliary-at-the-end shape.
  const malformedQuestion = sanitizedTitle.match(
    /^(?:why|how|what|when|where|who)\s+(.+?)\s+(?:am|is|are|was|were|do|does|did|can|could|will|would|has|have|had)\?$/iu,
  );
  const title = malformedQuestion
    ? sanitizeRetentionText(
        `${malformedQuestion[1]!.trim()}: What Happens Next`,
        RETENTION_MAX_COMPOSER_TITLE_CHARS,
      )
    : sanitizedTitle;

  const orderedBeatIds = plan.beatPlan.beats.map((b) => b.id);
  const segmentsRaw = record.segments;
  if (!Array.isArray(segmentsRaw) || segmentsRaw.length === 0) {
    throwProposalInvalid();
  }
  if (segmentsRaw.length !== orderedBeatIds.length) throwSegmentMismatch();

  const seen = new Set<string>();
  const drafts: RetentionSegmentDraft[] = [];

  for (let i = 0; i < segmentsRaw.length; i++) {
    const expectedBeatId = orderedBeatIds[i]!;
    const rawSeg = segmentsRaw[i];
    if (rawSeg == null || typeof rawSeg !== "object" || Array.isArray(rawSeg)) {
      throwProposalInvalid();
    }
    const seg = rawSeg as Record<string, unknown>;
    void seg.startOffset;
    void seg.endOffset;
    void seg.factualRisk;
    void seg.candidateFingerprint;

    if (seg.beatId !== expectedBeatId) throwSegmentMismatch();
    if (seen.has(expectedBeatId)) throwSegmentMismatch();
    seen.add(expectedBeatId);

    const text = canonicalizeRetentionSegmentText(seg.text);
    if (text == null) throwProposalInvalid();
    const refs = canonicalizeControllingIdeaClaimRefs(seg.claimRefs ?? []);
    if (refs == null) throwGroundingInvalid();
    if (refs.length > RETENTION_MAX_SEGMENT_CLAIM_REFS) throwGroundingInvalid();

    const authorized = resolveAuthorizedClaimIdsForBeat(
      expectedBeatId,
      plan,
      strategySeed,
    );
    for (const ref of refs) {
      if (!isClaimEligibleForNarrationSupport(grounding, ref, narrationMode)) {
        throwGroundingInvalid();
      }
      if (!authorized.has(ref)) throwGroundingInvalid();
    }

    const factualRisk = detectRetentionFactualRisk(text).risky;
    if (factualRisk && refs.length === 0) throwGroundingInvalid();

    drafts.push(
      Object.freeze({
        beatId: expectedBeatId,
        text,
        claimRefs: refs,
        factualRisk,
      }),
    );
  }

  if (seen.size !== orderedBeatIds.length) throwSegmentMismatch();

  const hookClaimRefs = canonicalizeControllingIdeaClaimRefs(
    record.hookClaimRefs ?? [],
  );
  if (hookClaimRefs == null) throwGroundingInvalid();
  if (hookClaimRefs.length > RETENTION_MAX_SEGMENT_CLAIM_REFS) {
    throwGroundingInvalid();
  }

  const permitted = new Set(permittedHookClaimIds);
  if (permitted.size === 0 && hookClaimRefs.length > 0) {
    throwGroundingInvalid();
  }

  const planOpening = resolvePlanAuthorizedOpeningClaimIds(plan, strategySeed);
  const firstSegmentRefs = new Set(drafts[0]!.claimRefs);

  for (const ref of hookClaimRefs) {
    if (typeof ref !== "string") throwGroundingInvalid();
    if (!permitted.has(ref)) throwGroundingInvalid();
    if (!planOpening.has(ref)) throwGroundingInvalid();
    if (!firstSegmentRefs.has(ref)) throwGroundingInvalid();
    if (!isClaimEligibleForNarrationSupport(grounding, ref, narrationMode)) {
      throwGroundingInvalid();
    }
  }

  return Object.freeze({
    title,
    hookClaimRefs,
    segments: Object.freeze(drafts),
  });
}
