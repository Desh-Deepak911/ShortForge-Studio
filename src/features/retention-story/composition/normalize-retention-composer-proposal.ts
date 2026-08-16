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
import { claimRefsSupportLinkedNarrationStatement } from "../strategy/retention-claim-linked-support";
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
import { adaptRetentionComposerProposal } from "./adapt-retention-composer-proposal";
import type { RetentionCreatorContentContract } from "../domain/retention-creator-content-contract.types";
import type { RetentionCompositionBrief } from "./retention-composition-brief.types";
import type { RetentionNarrationAssemblyGap } from "./retention-narration-first.types";
import {
  resolveAuthorizedClaimIdsForBeat,
  resolvePlanAuthorizedOpeningClaimIds,
} from "./retention-opening-claim-authority";
import { RETENTION_SEGMENT_SEPARATOR } from "./retention-narration-candidate.constants";

export interface NormalizedRetentionComposerProposal {
  readonly title: string;
  readonly hookClaimRefs: readonly string[];
  readonly segments: readonly RetentionSegmentDraft[];
  readonly assemblyGap: RetentionNarrationAssemblyGap;
}

export interface NormalizeRetentionComposerProposalExtras {
  readonly contentContract?: RetentionCreatorContentContract | null;
  readonly brief?: RetentionCompositionBrief | null;
  readonly eligibleClaimIds?: ReadonlySet<string>;
  readonly userWrittenHookAccepted?: boolean;
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
  extras?: NormalizeRetentionComposerProposalExtras,
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

  const adapted = adaptRetentionComposerProposal({
    raw: record,
    plan,
    grounding,
    strategySeed,
    contentContract: extras?.contentContract,
    brief: extras?.brief,
    eligibleClaimIds: extras?.eligibleClaimIds,
    userWrittenHookAccepted: extras?.userWrittenHookAccepted,
  });
  const working = adapted
    ? {
        ...record,
        title: adapted.title,
        segments: adapted.segments,
        hookClaimRefs: adapted.hookClaimRefs,
      }
    : record;
  const requestedGap =
    record.assemblyGap === " " || record.assemblyGap === ""
      ? record.assemblyGap
      : null;
  const assemblyGap: RetentionNarrationAssemblyGap =
    adapted?.assemblyGap ?? requestedGap ?? RETENTION_SEGMENT_SEPARATOR;

  const orderedBeatIds = plan.beatPlan.beats.map((b) => b.id);
  const segmentsRaw = working.segments;
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
    const keepAcceptedSpeech = extras?.contentContract != null && adapted != null;
    const metadataSafeRefs = refs.filter((ref) => {
      if (!isClaimEligibleForNarrationSupport(grounding, ref, narrationMode)) {
        return false;
      }
      return authorized.has(ref);
    });
    if (metadataSafeRefs.length !== refs.length && !keepAcceptedSpeech) {
      throwGroundingInvalid();
    }

    let spoken = text;
    let keptRefs = keepAcceptedSpeech ? metadataSafeRefs : refs;
    if (refs.length > 0) {
      const supported = claimRefsSupportLinkedNarrationStatement(
        grounding,
        refs,
        spoken,
        narrationMode,
      );
      if (!supported) {
        if (adapted != null) {
          const individuallySupported = refs.filter((ref) =>
            claimRefsSupportLinkedNarrationStatement(
              grounding,
              [ref],
              spoken,
              narrationMode,
            ),
          );
          keptRefs =
            individuallySupported.length > 0 &&
            claimRefsSupportLinkedNarrationStatement(
              grounding,
              individuallySupported,
              spoken,
              narrationMode,
            )
              ? individuallySupported
              : [];
        } else {
          const rewritten = refs
            .map((ref) => grounding.claims.find((claim) => claim.claimId === ref))
            .filter((claim): claim is NonNullable<typeof claim> => claim != null)
            .map((claim) => claim.text.trim())
            .filter(Boolean)
            .join(" ");
          const canonicalRewritten = canonicalizeRetentionSegmentText(rewritten);
          if (
            canonicalRewritten &&
            claimRefsSupportLinkedNarrationStatement(
              grounding,
              refs,
              canonicalRewritten,
              narrationMode,
            )
          ) {
            spoken = canonicalRewritten;
          } else if (detectRetentionFactualRisk(spoken).risky) {
            throwGroundingInvalid();
          }
        }
      }
    }

    const factualRisk = detectRetentionFactualRisk(spoken).risky;
    if (factualRisk && keptRefs.length === 0 && !keepAcceptedSpeech) {
      throwGroundingInvalid();
    }

    drafts.push(
      Object.freeze({
        beatId: expectedBeatId,
        text: spoken,
        claimRefs: Object.freeze(keptRefs),
        factualRisk,
      }),
    );
  }

  if (seen.size !== orderedBeatIds.length) throwSegmentMismatch();

  const keepAcceptedSpeech = extras?.contentContract != null && adapted != null;
  const hookClaimRefs = canonicalizeControllingIdeaClaimRefs(
    working.hookClaimRefs ?? [],
  );
  if (hookClaimRefs == null && !keepAcceptedSpeech) throwGroundingInvalid();
  if (
    hookClaimRefs != null &&
    hookClaimRefs.length > RETENTION_MAX_SEGMENT_CLAIM_REFS &&
    !keepAcceptedSpeech
  ) {
    throwGroundingInvalid();
  }

  const permitted = new Set(permittedHookClaimIds);
  let safeHookClaimRefs =
    hookClaimRefs == null ||
    hookClaimRefs.length > RETENTION_MAX_SEGMENT_CLAIM_REFS
      ? []
      : [...hookClaimRefs];
  if (permitted.size === 0 && safeHookClaimRefs.length > 0) {
    if (!keepAcceptedSpeech) throwGroundingInvalid();
    safeHookClaimRefs = [];
  }

  const planOpening = resolvePlanAuthorizedOpeningClaimIds(plan, strategySeed);
  const firstSegmentRefs = new Set(drafts[0]!.claimRefs);

  for (const ref of safeHookClaimRefs) {
    if (typeof ref !== "string") {
      if (!keepAcceptedSpeech) throwGroundingInvalid();
      safeHookClaimRefs = [];
      break;
    }
    if (
      !permitted.has(ref) ||
      !planOpening.has(ref) ||
      !firstSegmentRefs.has(ref) ||
      !isClaimEligibleForNarrationSupport(grounding, ref, narrationMode)
    ) {
      if (!keepAcceptedSpeech) throwGroundingInvalid();
      safeHookClaimRefs = [];
      break;
    }
  }

  return Object.freeze({
    title,
    hookClaimRefs: Object.freeze(safeHookClaimRefs),
    segments: Object.freeze(drafts),
    assemblyGap,
  });
}
