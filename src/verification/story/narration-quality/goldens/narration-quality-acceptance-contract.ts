/**
 * Sprint 13A — universal narration-quality acceptance contract.
 *
 * Verification-only and provider-free. Production generation must not import
 * this module. Later Sprint 13 slices may implement equivalent production
 * responsibilities without making this golden corpus runtime authority.
 */

import type { HookStyleSelection } from "@/features/hook-engine/presentation/hook-style-selection";
import type { ScriptMode, Tone } from "@/types/footiebitz";

export const NARRATION_QUALITY_ACCEPTANCE_CONTRACT_VERSION =
  "narration-quality-acceptance/1" as const;

export type NarrationQualityFactImportance = "essential" | "optional";

export interface NarrationQualitySignalGroup {
  /** At least one normalized phrase must appear. */
  readonly anyOf: readonly string[];
}

export interface NarrationQualityFactExpectation {
  readonly id: string;
  readonly importance: NarrationQualityFactImportance;
  readonly description: string;
  readonly signals: readonly NarrationQualitySignalGroup[];
}

export interface NarrationQualityUncertaintyExpectation {
  readonly factId: string;
  readonly requiredSignals: readonly NarrationQualitySignalGroup[];
}

export type NarrationQualityFlowStageId =
  "hook" | "evidence" | "escalation" | "payoff";

export interface NarrationQualityFlowStage {
  readonly id: NarrationQualityFlowStageId;
  readonly signals: readonly NarrationQualitySignalGroup[];
}

export interface NarrationQualityAcceptanceContract {
  readonly version: typeof NARRATION_QUALITY_ACCEPTANCE_CONTRACT_VERSION;
  readonly centralSubject: {
    readonly description: string;
    readonly signals: readonly NarrationQualitySignalGroup[];
  };
  readonly controllingIdea: {
    readonly description: string;
    readonly signals: readonly NarrationQualitySignalGroup[];
  };
  readonly facts: readonly NarrationQualityFactExpectation[];
  readonly requiredUncertainty: readonly NarrationQualityUncertaintyExpectation[];
  readonly conflict: {
    readonly description: string;
    readonly signals: readonly NarrationQualitySignalGroup[];
  };
  readonly consequence: {
    readonly description: string;
    readonly signals: readonly NarrationQualitySignalGroup[];
  };
  readonly selection: {
    readonly durationSec: number;
    readonly scriptMode: ScriptMode;
    readonly tone: Tone;
    readonly hookStyle: HookStyleSelection;
  };
  readonly forbiddenInventions: readonly {
    readonly description: string;
    readonly signals: readonly NarrationQualitySignalGroup[];
  }[];
  readonly narrativeFlow: readonly NarrationQualityFlowStage[];
  readonly hookBodyPromise: {
    readonly hookSignals: readonly NarrationQualitySignalGroup[];
    readonly bodyPayoffSignals: readonly NarrationQualitySignalGroup[];
  };
  readonly minimumDurationUtilization: number;
  readonly requiredEntities: readonly {
    readonly description: string;
    readonly signals: readonly NarrationQualitySignalGroup[];
  }[];
}

export type NarrationQualityRejectionReason =
  | "empty_narration"
  | "central_subject_missing"
  | "controlling_idea_missing"
  | "essential_fact_missing"
  | "required_uncertainty_missing"
  | "conflict_missing"
  | "consequence_missing"
  | "forbidden_invention"
  | "narrative_flow_broken"
  | "hook_body_payoff_missing"
  | "duration_underutilized"
  | "brief_entity_coverage_missing"
  | "disconnected_checklist"
  | "generic_filler";

export interface NarrationQualityAcceptanceResult {
  readonly ok: boolean;
  readonly reasons: readonly NarrationQualityRejectionReason[];
  readonly wordCount: number;
  readonly targetWordCount: number;
  readonly durationUtilization: number;
}

export type NarrationQualityDeliveryProfile =
  "requested_quality" | "basic_fallback" | "emergency_fallback";

export interface NarrationQualityDeliveryResult {
  /** Candidate rejection is internal; a validated narration is always delivered. */
  readonly status: "delivered";
  readonly narration: string;
  readonly qualityProfile: NarrationQualityDeliveryProfile;
  readonly assessment: NarrationQualityAcceptanceResult;
  readonly advisoryReasons: readonly NarrationQualityRejectionReason[];
}

const WORDS_PER_SECOND = 2.4;
const GENERIC_FILLER_PATTERNS = [
  /\bin (?:the )?world of football\b/iu,
  /\banything can happen\b/iu,
  /\bthe beautiful game\b/iu,
  /\bpassion(?:,| and)? determination(?:,| and)? (?:heart|desire)\b/iu,
  /\btime will tell\b/iu,
  /\bone thing is (?:for sure|certain)\b/iu,
  /\bthis is (?:more than|not just) (?:a )?(?:game|match)\b/iu,
] as const;

function normalize(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’‘]/gu, "'")
    .replace(/[^\p{L}\p{N}'%+\-\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(value: string): number {
  return normalize(value).split(/\s+/).filter(Boolean).length;
}

function matchesGroup(
  text: string,
  group: NarrationQualitySignalGroup,
): boolean {
  const normalized = normalize(text);
  return group.anyOf.some((signal) => normalized.includes(normalize(signal)));
}

function matchesAllGroups(
  text: string,
  groups: readonly NarrationQualitySignalGroup[],
): boolean {
  return groups.every((group) => matchesGroup(text, group));
}

function splitSentences(text: string): readonly string[] {
  return text
    .trim()
    .split(/(?<=[.!?…])(?:["”’)\]]+)?\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function hasOrderedNarrativeFlow(
  sentences: readonly string[],
  stages: readonly NarrationQualityFlowStage[],
): boolean {
  let cursor = 0;
  for (const stage of stages) {
    let found = false;
    for (let index = cursor; index < sentences.length; index += 1) {
      if (matchesAllGroups(sentences[index]!, stage.signals)) {
        cursor = index + 1;
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

function looksLikeDisconnectedChecklist(sentences: readonly string[]): boolean {
  if (sentences.length < 4) return false;
  const shortSentences = sentences.filter(
    (sentence) => countWords(sentence) <= 8,
  );
  const connectiveSentences = sentences.filter((sentence) =>
    /\b(?:but|because|which|while|yet|so|meaning|instead|therefore|unless|after|before|that leaves|the result)\b/iu.test(
      sentence,
    ),
  );
  return (
    shortSentences.length / sentences.length >= 0.75 &&
    connectiveSentences.length === 0
  );
}

function looksLikeGenericFiller(text: string): boolean {
  const hits = GENERIC_FILLER_PATTERNS.filter((pattern) => pattern.test(text));
  return hits.length >= 2;
}

/** Deterministic, provider-free evaluation of one narration against one brief. */
export function evaluateNarrationQualityAcceptance(
  contract: NarrationQualityAcceptanceContract,
  narration: string,
): NarrationQualityAcceptanceResult {
  const reasons = new Set<NarrationQualityRejectionReason>();
  const trimmed = narration.trim();
  const wordCount = countWords(trimmed);
  const targetWordCount = Math.max(
    1,
    Math.round(contract.selection.durationSec * WORDS_PER_SECOND),
  );
  const durationUtilization = wordCount / targetWordCount;

  if (!trimmed) reasons.add("empty_narration");
  if (!matchesAllGroups(trimmed, contract.centralSubject.signals)) {
    reasons.add("central_subject_missing");
  }
  if (!matchesAllGroups(trimmed, contract.controllingIdea.signals)) {
    reasons.add("controlling_idea_missing");
  }

  for (const fact of contract.facts) {
    if (
      fact.importance === "essential" &&
      !matchesAllGroups(trimmed, fact.signals)
    ) {
      reasons.add("essential_fact_missing");
    }
  }

  for (const uncertainty of contract.requiredUncertainty) {
    const fact = contract.facts.find(
      (candidate) => candidate.id === uncertainty.factId,
    );
    const factIsUsed = fact ? matchesAllGroups(trimmed, fact.signals) : false;
    if (factIsUsed && !matchesAllGroups(trimmed, uncertainty.requiredSignals)) {
      reasons.add("required_uncertainty_missing");
    }
  }

  if (!matchesAllGroups(trimmed, contract.conflict.signals)) {
    reasons.add("conflict_missing");
  }
  if (!matchesAllGroups(trimmed, contract.consequence.signals)) {
    reasons.add("consequence_missing");
  }
  if (
    contract.forbiddenInventions.some((invention) =>
      matchesAllGroups(trimmed, invention.signals),
    )
  ) {
    reasons.add("forbidden_invention");
  }

  const sentences = splitSentences(trimmed);
  if (!hasOrderedNarrativeFlow(sentences, contract.narrativeFlow)) {
    reasons.add("narrative_flow_broken");
  }

  const opening = sentences[0] ?? "";
  const body = sentences.slice(1).join(" ");
  if (
    !matchesAllGroups(opening, contract.hookBodyPromise.hookSignals) ||
    !matchesAllGroups(body, contract.hookBodyPromise.bodyPayoffSignals)
  ) {
    reasons.add("hook_body_payoff_missing");
  }

  if (durationUtilization < contract.minimumDurationUtilization) {
    reasons.add("duration_underutilized");
  }
  if (
    contract.requiredEntities.some(
      (entity) => !matchesAllGroups(trimmed, entity.signals),
    )
  ) {
    reasons.add("brief_entity_coverage_missing");
  }
  if (looksLikeDisconnectedChecklist(sentences)) {
    reasons.add("disconnected_checklist");
  }
  if (looksLikeGenericFiller(trimmed)) {
    reasons.add("generic_filler");
  }

  return Object.freeze({
    ok: reasons.size === 0,
    reasons: Object.freeze([...reasons]),
    wordCount,
    targetWordCount,
    durationUtilization,
  });
}

/**
 * Fail-soft delivery policy for the quality contract.
 *
 * Production must supply a deterministic, brief-grounded basic fallback. The
 * fallback is verified with the same contract, so a rejected model candidate
 * never becomes the user-visible story and never turns into a content error.
 */
export function resolveNarrationQualityDelivery(input: {
  readonly contract: NarrationQualityAcceptanceContract;
  readonly requestedCandidate: string;
  readonly basicFallback: string;
}): NarrationQualityDeliveryResult {
  const requested = evaluateNarrationQualityAcceptance(
    input.contract,
    input.requestedCandidate,
  );
  if (requested.ok) {
    return Object.freeze({
      status: "delivered",
      narration: input.requestedCandidate,
      qualityProfile: "requested_quality",
      assessment: requested,
      advisoryReasons: Object.freeze([]),
    });
  }

  const fallback = evaluateNarrationQualityAcceptance(
    input.contract,
    input.basicFallback,
  );
  if (fallback.ok) {
    return Object.freeze({
      status: "delivered",
      narration: input.basicFallback,
      qualityProfile: "basic_fallback",
      assessment: fallback,
      advisoryReasons: requested.reasons,
    });
  }

  const essentialFacts = input.contract.facts
    .filter((fact) => fact.importance === "essential")
    .map((fact) => fact.description);
  const emergencyNarration = [
    input.contract.centralSubject.description,
    essentialFacts.join(". "),
    input.contract.conflict.description,
    input.contract.consequence.description,
  ]
    .filter(Boolean)
    .map((sentence) => sentence.replace(/[.!?…]+$/u, ""))
    .map((sentence) => `${sentence}.`)
    .join(" ");
  const emergency = evaluateNarrationQualityAcceptance(
    input.contract,
    emergencyNarration,
  );

  return Object.freeze({
    status: "delivered",
    narration: emergencyNarration,
    qualityProfile: "emergency_fallback",
    assessment: emergency,
    advisoryReasons: Object.freeze([
      ...new Set([...requested.reasons, ...fallback.reasons]),
    ]),
  });
}
