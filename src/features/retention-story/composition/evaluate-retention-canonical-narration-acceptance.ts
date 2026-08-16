/**
 * Canonical spoken-narration acceptance — story-quality Prompt 8.
 * One decision from the final narration and the Creator Content Contract.
 * Model metadata cannot overturn accepted speech.
 */

import type { RetentionCreatorContentContract } from "../domain/retention-creator-content-contract.types";
import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import { evaluateRetentionDurationFit } from "./evaluate-retention-duration-fit";
import type { RetentionCompositionBrief } from "./retention-composition-brief.types";
import {
  evaluateRetentionHookBodyPayoff,
  type RetentionHookQualityWarningId,
} from "./evaluate-retention-hook-body-payoff";
import { evaluateRetentionSpokenClaimGrounding } from "./evaluate-retention-spoken-claim-grounding";
import { rebindRetentionComposerContentIds } from "./rebind-retention-composer-content-ids";
import { RETENTION_MAX_COMPOSER_TITLE_CHARS } from "./retention-narration-candidate.constants";
import type { RetentionNarrationFirstProposal } from "./retention-narration-first.types";

const SCAFFOLD = [
  /\bcentral idea\b/iu,
  /\bthat connection\b/iu,
  /\bnext part\b/iu,
  /\bnext beat\b/iu,
  /\bwhat decides\b/iu,
  /\bconsequence keeps growing\b/iu,
];

const CHECKLIST = [/(?:^|\n)\s*[-*•]\s+/u, /(?:^|\n)\s*#{1,6}\s+/u];

export type RetentionCanonicalAcceptanceDecision =
  | "accept"
  | "textual_repair"
  | "reject";

export type RetentionCanonicalRejectionStage =
  | "malformed_composer_proposal"
  | "unsupported_claim_or_claim_reference_rejection"
  | "hook_body_relationship_rejection"
  | "duration_or_compression_rejection"
  | "narration_hard_gate_rejection";

export interface RetentionCanonicalNarrationAcceptance {
  readonly decision: RetentionCanonicalAcceptanceDecision;
  readonly stage: RetentionCanonicalRejectionStage | null;
  readonly textualRepairEligible: boolean;
  readonly metadataNormalized: boolean;
  readonly narration: string;
  readonly spokenOpening: string;
  readonly spokenBody: string;
  readonly spokenPayoff: string;
  readonly title: string;
  readonly usedContentIds: readonly string[];
  readonly omittedContentIds: readonly string[];
  readonly hookClaimRefs: readonly string[];
  readonly qualityWarningIds: readonly RetentionHookQualityWarningId[];
  readonly proposal: RetentionNarrationFirstProposal | null;
}

function tokenize(text: string): string[] {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/u)
    .filter((token) => token.length >= 3);
}

function isNarrationFirstRecord(
  raw: unknown,
): raw is Record<string, unknown> & { narration: string } {
  return (
    raw != null &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    typeof (raw as { narration?: unknown }).narration === "string" &&
    (raw as { narration: string }).narration.trim().length > 0
  );
}

function rejected(
  stage: RetentionCanonicalRejectionStage,
  extras: Partial<RetentionCanonicalNarrationAcceptance> & {
    readonly textualRepairEligible?: boolean;
  },
): RetentionCanonicalNarrationAcceptance {
  return Object.freeze({
    decision: extras.textualRepairEligible === true ? "textual_repair" : "reject",
    stage,
    textualRepairEligible: extras.textualRepairEligible === true,
    metadataNormalized: extras.metadataNormalized === true,
    narration: extras.narration ?? "",
    spokenOpening: extras.spokenOpening ?? "",
    spokenBody: extras.spokenBody ?? "",
    spokenPayoff: extras.spokenPayoff ?? "",
    title: extras.title ?? "",
    usedContentIds: Object.freeze([...(extras.usedContentIds ?? [])]),
    omittedContentIds: Object.freeze([...(extras.omittedContentIds ?? [])]),
    hookClaimRefs: Object.freeze([...(extras.hookClaimRefs ?? [])]),
    qualityWarningIds: Object.freeze([...(extras.qualityWarningIds ?? [])]),
    proposal: extras.proposal ?? null,
  });
}

export function evaluateRetentionCanonicalNarrationAcceptance(input: {
  readonly raw: unknown;
  readonly contentContract: RetentionCreatorContentContract;
  readonly brief: RetentionCompositionBrief;
  readonly eligibleClaimIds: ReadonlySet<string>;
  readonly grounding?: RetentionGroundingContext | null;
  readonly userWrittenHookAccepted?: boolean;
}): RetentionCanonicalNarrationAcceptance {
  const { raw, contentContract, brief, eligibleClaimIds } = input;
  if (!isNarrationFirstRecord(raw)) {
    return rejected("malformed_composer_proposal", {});
  }
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title || title.length > RETENTION_MAX_COMPOSER_TITLE_CHARS) {
    return rejected("malformed_composer_proposal", {});
  }
  const titleTokens = tokenize(title);
  const subjectTokens = tokenize(contentContract.centralSubject);
  if (!titleTokens.some((token) => subjectTokens.includes(token))) {
    return rejected("malformed_composer_proposal", { title });
  }

  const narration = raw.narration.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!narration || /[\n\r]/.test(raw.narration)) {
    return rejected("malformed_composer_proposal", { title, narration });
  }
  if (CHECKLIST.some((pattern) => pattern.test(raw.narration))) {
    return rejected("narration_hard_gate_rejection", { title, narration });
  }
  if (SCAFFOLD.some((pattern) => pattern.test(narration))) {
    return rejected("narration_hard_gate_rejection", { title, narration });
  }

  const supportIds = Array.isArray(raw.support)
    ? raw.support
        .map((entry) =>
          entry != null &&
          typeof entry === "object" &&
          typeof (entry as { contentUnitId?: unknown }).contentUnitId === "string"
            ? (entry as { contentUnitId: string }).contentUnitId
            : null,
        )
        .filter((id): id is string => id != null)
    : [];
  const modelUsed = [
    ...(Array.isArray(raw.usedContentIds)
      ? raw.usedContentIds.filter((id): id is string => typeof id === "string")
      : []),
    ...supportIds,
  ];
  const modelOmitted = Array.isArray(raw.omittedContentIds)
    ? raw.omittedContentIds.filter((id): id is string => typeof id === "string")
    : [];
  const modelHook = Array.isArray(raw.hookClaimRefs)
    ? raw.hookClaimRefs.filter((id): id is string => typeof id === "string")
    : [];
  const modelSupport = Array.isArray(raw.factualSupport)
    ? raw.factualSupport.filter(
        (entry): entry is { claimId: string } =>
          entry != null &&
          typeof entry === "object" &&
          typeof (entry as { claimId?: unknown }).claimId === "string",
      )
    : [];

  const rebound = rebindRetentionComposerContentIds({
    usedContentIds: modelUsed,
    omittedContentIds: modelOmitted,
    hookClaimRefs: modelHook,
    factualSupport: modelSupport,
    narration,
    contentContract,
    eligibleClaimIds,
    grounding: input.grounding,
    factHandlingMode: contentContract.presentationSettings.factHandlingMode,
  });

  const spokenGrounding = evaluateRetentionSpokenClaimGrounding({
    narration,
    contentContract,
    eligibleClaimIds,
    modelUsedContentIds: modelUsed,
    grounding: input.grounding,
  });

  const metadataNormalized =
    rebound.droppedUnknownIds.length > 0 ||
    rebound.provenance !== "model_supplied" ||
    (typeof raw.hookOpening === "string" &&
      raw.hookOpening.trim() !== "" &&
      !narration.startsWith(raw.hookOpening.trim())) ||
    (typeof raw.payoffClosing === "string" &&
      raw.payoffClosing.trim() !== "" &&
      !narration.includes(raw.payoffClosing.trim()));

  for (const participant of brief.requiredParticipants) {
    const token = participant.split(/\s+/u)[0] ?? "";
    if (
      token &&
      !new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(narration)
    ) {
      return rejected("narration_hard_gate_rejection", {
        title,
        narration,
        metadataNormalized,
        usedContentIds: rebound.usedContentIds,
      });
    }
  }
  if (brief.requiredRankingMembership.length === 5) {
    const seen = brief.requiredRankingMembership.filter((name) =>
      narration.includes(name.split(" ")[0] ?? name),
    );
    if (new Set(seen).size !== 5) {
      return rejected("narration_hard_gate_rejection", {
        title,
        narration,
        metadataNormalized,
      });
    }
  }

  if (!spokenGrounding.ok) {
    return rejected("unsupported_claim_or_claim_reference_rejection", {
      title,
      narration,
      metadataNormalized,
      usedContentIds: spokenGrounding.supportingKnownIds,
      textualRepairEligible: true,
    });
  }

  const relationship = evaluateRetentionHookBodyPayoff({
    narration,
    contentContract,
    brief,
    userWrittenHookAccepted: input.userWrittenHookAccepted,
  });
  if (!relationship.ok) {
    return rejected("hook_body_relationship_rejection", {
      title,
      narration,
      metadataNormalized,
      spokenOpening: relationship.opening,
      spokenBody: relationship.body,
      spokenPayoff: relationship.payoff,
      usedContentIds: spokenGrounding.supportingKnownIds,
      qualityWarningIds: relationship.qualityWarningIds,
      textualRepairEligible: true,
    });
  }

  for (const marker of brief.requiredUncertaintyLanguage) {
    if (!new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(narration)) {
      return rejected("narration_hard_gate_rejection", {
        title,
        narration,
        metadataNormalized,
        spokenOpening: relationship.opening,
        spokenPayoff: relationship.payoff,
        textualRepairEligible: true,
      });
    }
  }

  const numberOne = brief.rankingNumberOneMember ?? brief.requiredRankingOrder[0];
  const rankingComplete =
    brief.requiredRankingMembership.length >= 2 &&
    brief.requiredRankingMembership.every((name) =>
      narration.includes(name.split(" ")[0] ?? name),
    ) &&
    Boolean(numberOne) &&
    narration.includes((numberOne ?? "").split(" ")[0] ?? "") &&
    /\b(?:number one|no\.?\s*1|stands last|decisive name|#1)\b/iu.test(narration) &&
    (!numberOne ||
      new RegExp(
        `${numberOne.split(" ")[0] ?? numberOne}[\\s\\S]{0,80}(?:number one|no\\.?\\s*1|stands last|decisive name|#1)`,
        "iu",
      ).test(narration));
  const durationFit = evaluateRetentionDurationFit({
    narration,
    hardWordBudget: brief.durationUtilisation.storyHardWordBudget,
    targetWordBudget: brief.durationUtilisation.storyTargetWordBudget,
    minimumUsefulWords: brief.durationUtilisation.minimumUsefulWords,
    durationSec: brief.durationUtilisation.durationSec,
    preserveCompleteRanking: rankingComplete,
  });
  if (!durationFit.acceptable) {
    return rejected("duration_or_compression_rejection", {
      title,
      narration,
      metadataNormalized,
      spokenOpening: relationship.opening,
      spokenPayoff: relationship.payoff,
      qualityWarningIds: durationFit.warningIds,
      textualRepairEligible: true,
    });
  }

  if (!/[.!?…]["”’)»\]]*$/u.test(narration)) {
    return rejected("narration_hard_gate_rejection", {
      title,
      narration,
      metadataNormalized,
      spokenOpening: relationship.opening,
      spokenPayoff: relationship.payoff,
      textualRepairEligible: true,
    });
  }

  const used = spokenGrounding.supportingKnownIds.length
    ? spokenGrounding.supportingKnownIds
    : rebound.usedContentIds;
  const proposal: RetentionNarrationFirstProposal = Object.freeze({
    title,
    narration,
    usedContentIds: Object.freeze([...used]),
    omittedContentIds: Object.freeze([...rebound.omittedContentIds]),
    hookClaimRefs: Object.freeze([...rebound.hookClaimRefs]),
    hookOpening: relationship.opening,
    payoffClosing: relationship.payoff,
    requiredUncertaintyMarkersUsed: Object.freeze(
      Array.isArray(raw.requiredUncertaintyMarkersUsed)
        ? raw.requiredUncertaintyMarkersUsed.filter(
            (id): id is string => typeof id === "string",
          )
        : [...brief.requiredUncertaintyLanguage],
    ),
    factualSupport: Object.freeze(
      used.map((claimId) => Object.freeze({ claimId })),
    ),
  });

  return Object.freeze({
    decision: "accept",
    stage: null,
    textualRepairEligible: false,
    metadataNormalized,
    narration,
    spokenOpening: relationship.opening,
    spokenBody: relationship.body,
    spokenPayoff: relationship.payoff,
    title,
    usedContentIds: proposal.usedContentIds,
    omittedContentIds: proposal.omittedContentIds,
    hookClaimRefs: proposal.hookClaimRefs,
    qualityWarningIds: Object.freeze([
      ...relationship.qualityWarningIds,
      ...durationFit.warningIds,
    ]),
    proposal,
  });
}
