/**
 * Deterministic RetentionBeat identity — Sprint 10D.
 * IDs are always recomputed from canonical beat content; planner-supplied IDs are ignored.
 */

import { buildRetentionSemanticIdentity } from "../domain/retention-story-fingerprint";
import { RETENTION_BEAT_ID_PREFIX } from "./retention-story-plan.constants";
import type {
  RetentionBeatControllingIdeaRelation,
  RetentionBeatNoveltyRole,
  RetentionBeatPayoffRelation,
  RetentionBeatPurpose,
} from "./retention-story-plan.types";

export interface RetentionBeatIdentityPayload {
  readonly contractFingerprint: string;
  readonly strategySeedFingerprint: string;
  readonly orderedIndex: number;
  readonly purpose: RetentionBeatPurpose;
  readonly emotionalIntent: string;
  readonly viewerQuestion: string;
  readonly informationContribution: string;
  readonly narrationGoal: string;
  readonly visualOpportunity: string;
  readonly groundingClaimRefs: readonly string[];
  readonly estimatedStartMs: number;
  readonly estimatedEndMs: number;
  readonly noveltyRole: RetentionBeatNoveltyRole;
  readonly controllingIdeaRelation: RetentionBeatControllingIdeaRelation;
  readonly payoffRelation: RetentionBeatPayoffRelation;
}

/** Build a canonical `rbeat:` identity from ordered beat content. */
export function buildRetentionBeatId(
  payload: RetentionBeatIdentityPayload,
): string {
  return buildRetentionSemanticIdentity(
    {
      contractFingerprint: payload.contractFingerprint,
      strategySeedFingerprint: payload.strategySeedFingerprint,
      orderedIndex: payload.orderedIndex,
      purpose: payload.purpose,
      emotionalIntent: payload.emotionalIntent,
      viewerQuestion: payload.viewerQuestion,
      informationContribution: payload.informationContribution,
      narrationGoal: payload.narrationGoal,
      visualOpportunity: payload.visualOpportunity,
      groundingClaimRefs: [...payload.groundingClaimRefs].sort((a, b) =>
        a.localeCompare(b),
      ),
      estimatedStartMs: payload.estimatedStartMs,
      estimatedEndMs: payload.estimatedEndMs,
      noveltyRole: payload.noveltyRole,
      controllingIdeaRelation: payload.controllingIdeaRelation,
      payoffRelation: payload.payoffRelation,
    },
    RETENTION_BEAT_ID_PREFIX,
  );
}
