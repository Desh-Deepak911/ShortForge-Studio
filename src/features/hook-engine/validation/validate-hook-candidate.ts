/**
 * Pure HookCandidate validator — Sprint 7C.1.
 * No models, network, or environment-dependent services.
 */

import { HOOK_SPEAKING_WORDS_PER_SECOND } from "../domain/hook-contract.constants";
import { extractHookSubjectTokens } from "../domain/hook-subject-tokens";
import {
  assertHookPlanFingerprint,
  assertHookRequestFingerprint,
} from "../domain/hook-fingerprint";
import {
  isEligibleVerifiedFactualClaim,
} from "../domain/normalize-hook-request";
import { countHookWords } from "../domain/hook-word-count";
import type {
  HookCandidate,
  HookPlan,
  HookValidationResult,
  HookValidationScores,
  NormalizedHookRequest,
} from "../domain/hook-contract.types";
import { assertHookCandidateId } from "./build-hook-candidate";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function analysisText(candidate: HookCandidate): string {
  return candidate.openingTextNormalized ?? candidate.openingText;
}

function countWords(text: string): number {
  return countHookWords(text);
}

function estimatedSpokenSeconds(wordCount: number): number {
  return wordCount / HOOK_SPEAKING_WORDS_PER_SECOND;
}

const WORD_NUMBERS =
  /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|hundred|thousand|million)\b/i;

/** Factual-risk signals — detect need for claim-trace, not truth. */
export interface HookFactualRiskSignals {
  readonly statistics: boolean;
  readonly dates: boolean;
  readonly money: boolean;
  readonly quotations: boolean;
  readonly rankings: boolean;
  readonly matchResults: boolean;
  readonly factualSuperlatives: boolean;
  readonly numericalClaims: boolean;
  readonly required: boolean;
}

export function detectFactualRiskSignals(text: string): HookFactualRiskSignals {
  const t = text;
  const hasDigit = /\b\d+(\.\d+)?\b/.test(t);
  const hasWordNumber = WORD_NUMBERS.test(t);
  const hasCount = hasDigit || hasWordNumber;

  const statistics =
    /\b\d+(\.\d+)?\s*%/.test(t) ||
    /\b\d+(\.\d+)?\s*(percent|percentage|pp|pts?)\b/i.test(t) ||
    (/\b(goals?|assists?|clean sheets?|win rate)\b/i.test(t) && hasCount);

  const dates =
    /\b(19|20)\d{2}\b/.test(t) ||
    /\b\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?\b/.test(t) ||
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
      t,
    );

  const money =
    /[$€£]\s?\d/.test(t) ||
    /\b\d+(\.\d+)?\s*(million|billion|m|bn)\b/i.test(t) ||
    /\b(transfer fee|wage|salary)\b/i.test(t);

  const quotations =
    /["“”«»].{1,120}["“”«»]/.test(t) ||
    /\b(said|says|claimed|according to)\b/i.test(t);

  const rankings =
    /\b(top\s+\d+|number\s+#?\d+|ranked\s+#?\d+|#\d+|world'?s?\s+best)\b/i.test(t) ||
    /\b(1st|2nd|3rd|\d+th)\b/i.test(t);

  const matchResults =
    /\b\d+\s*[-–—]\s*\d+\b/.test(t) ||
    (/\b(won|beat|defeated|drew|lost)\b/i.test(t) && hasCount) ||
    (/\b(straight|matches?|wins?|losses?|draws?)\b/i.test(t) &&
      hasWordNumber &&
      /\b(won|beat|defeated|drew|lost|made)\b/i.test(t));

  const factualSuperlatives =
    /\b(most|least|best|worst|greatest|fastest|highest|lowest|only player|record|unprecedented)\b/i.test(
      t,
    );

  const numericalClaims = hasCount;

  const required =
    statistics ||
    dates ||
    money ||
    quotations ||
    rankings ||
    matchResults ||
    factualSuperlatives ||
    (numericalClaims &&
      /\b(scored|goals?|assists?|titles?|trophies?|appearances?|caps?|fee|signed|matches?|straight)\b/i.test(
        t,
      ));

  return Object.freeze({
    statistics,
    dates,
    money,
    quotations,
    rankings,
    matchResults,
    factualSuperlatives,
    numericalClaims,
    required,
  });
}

/**
 * Prompt-injection requires instruction/prompt manipulation context.
 * Ordinary narration like "You are now watching…" is not injection.
 */
function hasPromptInjection(text: string): boolean {
  return (
    /\bignore (all |previous |prior )?(instructions|prompts)\b/i.test(text) ||
    /\bsystem\s*:\s*/i.test(text) ||
    /\byou are now (an? |my )?(ai|assistant|system)\b/i.test(text) ||
    /\byou are now .{0,40}\b(ignore|disregard|override)\b/i.test(text) ||
    (/\bdo not follow\b/i.test(text) && /\b(safety|instructions|prompts)\b/i.test(text)) ||
    /\b(jailbreak|dan mode|developer mode)\b/i.test(text)
  );
}

/**
 * Harmful personal targeting — not ordinary football tactical language
 * such as "attack him down the left".
 */
function hasHarmfulPersonalTargeting(text: string): boolean {
  return (
    /\b(kill|murder|assault|rape)\b/i.test(text) ||
    /\b(hate)\s+(him|her|them|fans?)\b/i.test(text) ||
    /\b(physically attack|violently attack|attack personally)\b/i.test(text) ||
    /\b(should die|deserves to die)\b/i.test(text)
  );
}

function scoreProvocativeness(text: string, origin: HookCandidate["origin"]): number {
  let score = 0.4;
  if (/\?$/.test(text.trim())) score += 0.18;
  if (/!$/.test(text.trim())) score += 0.08;
  if (/\b(what if|nobody|never|secret|twist|shock|wait|but)\b/i.test(text)) score += 0.12;
  if (/\b(most|best|worst|only|never)\b/i.test(text)) score += 0.08;
  if (text.length >= 20 && text.length <= 90) score += 0.1;
  if (origin === "compatibility_fallback") score -= 0.05;
  if (countWords(text) <= 2) score -= 0.2;
  return clamp01(score);
}

function scoreClarity(text: string, wordCount: number, maxWords: number): number {
  let score = 0.7;
  const complete =
    /[.!?…。！？]["”’)»\]]*$/.test(text.trim()) || wordCount <= maxWords + 2;
  if (complete) score += 0.1;
  else score -= 0.15;

  if (wordCount === 0) return 0;
  if (wordCount > maxWords) {
    score -= Math.min(0.45, (wordCount - maxWords) * 0.08);
  }
  if (wordCount > maxWords * 2) score -= 0.2;

  const punctDensity = (text.match(/[,;:—\-]/g) ?? []).length / Math.max(1, wordCount);
  if (punctDensity > 0.45) score -= 0.15;

  if (/\s{2,}/.test(text)) score -= 0.05;
  if (/^[a-z]/.test(text.trim())) score -= 0.05;
  if (text.length < 8) score -= 0.1;

  return clamp01(score);
}

function scoreGrounding(
  signals: HookFactualRiskSignals,
  groundingPassed: boolean,
  claimCount: number,
): number {
  if (!signals.required) {
    return clamp01(0.85 + Math.min(0.1, claimCount * 0.02));
  }
  return groundingPassed ? clamp01(0.75 + Math.min(0.2, claimCount * 0.05)) : 0;
}

function scoreSafety(safetyPassed: boolean, reasons: readonly string[]): number {
  if (!safetyPassed) return 0;
  const soft = reasons.filter((r) => r.startsWith("safety.soft_")).length;
  return clamp01(0.9 - soft * 0.1);
}

export interface ValidateHookCandidateInput {
  readonly request: NormalizedHookRequest;
  readonly plan: HookPlan;
  readonly candidate: HookCandidate;
  readonly repairBoundExceeded?: boolean;
}

/**
 * Pure deterministic validator. Aggregate scores never override hard-gate failures.
 */
export function validateHookCandidate(
  input: ValidateHookCandidateInput,
): HookValidationResult {
  const { request, plan, candidate } = input;
  const reasons: string[] = [];

  assertHookRequestFingerprint(request);
  assertHookPlanFingerprint(plan);
  assertHookCandidateId(candidate);

  if (candidate.requestFingerprint !== request.requestFingerprint) {
    reasons.push("fingerprint.stale_request");
  }
  if (candidate.planFingerprint !== plan.planFingerprint) {
    reasons.push("fingerprint.stale_plan");
  }
  if (
    candidate.strategyId !== plan.strategyId ||
    candidate.strategyVersion !== plan.strategyVersion
  ) {
    reasons.push("fingerprint.candidate_plan_mismatch");
  }
  if (request.requestFingerprint !== plan.requestFingerprint) {
    reasons.push("fingerprint.request_plan_mismatch");
  }

  const text = analysisText(candidate);
  const wordCount = countWords(text);
  const spokenSeconds = estimatedSpokenSeconds(wordCount);
  const constraints = plan.constraints;
  const signals = detectFactualRiskSignals(text);

  // --- Hard grounding gate ---
  let groundingPassed = true;
  let groundingStatus: HookValidationResult["groundingStatus"] =
    request.grounding.normalizedGroundingStatus;

  if (reasons.some((r) => r.startsWith("fingerprint."))) {
    groundingPassed = false;
    groundingStatus = "failed";
  }

  const claimById = new Map(
    request.grounding.claims.map((c) => [c.claimId, c]),
  );
  let hasEligible = false;
  let hasIneligibleOnlyRefs = false;

  // Always validate explicitly supplied claim references.
  for (const ref of candidate.claimRefs) {
    const claim = claimById.get(ref);
    if (!claim) {
      groundingPassed = false;
      reasons.push("grounding.unknown_claim_ref");
      continue;
    }
    if (
      claim.provenance === "forbidden" ||
      claim.verificationStatus === "forbidden"
    ) {
      groundingPassed = false;
      reasons.push("grounding.forbidden_claim");
      continue;
    }
    if (isEligibleVerifiedFactualClaim(claim)) {
      hasEligible = true;
    } else {
      hasIneligibleOnlyRefs = true;
    }
  }

  if (signals.required) {
    if (candidate.claimRefs.length === 0) {
      groundingPassed = false;
      reasons.push("grounding.missing_claim_refs");
    }
    if (candidate.claimRefs.length > 0 && !hasEligible) {
      groundingPassed = false;
      reasons.push("grounding.ineligible_claims");
    }
    if (request.grounding.unavailableResearch) {
      groundingPassed = false;
      reasons.push("grounding.research_unavailable");
    }
    if (signals.statistics && !constraints.allowStatisticClaim) {
      groundingPassed = false;
      reasons.push("grounding.statistic_not_allowed");
    }
  } else if (
    candidate.claimRefs.length > 0 &&
    hasIneligibleOnlyRefs &&
    !hasEligible &&
    !reasons.includes("grounding.unknown_claim_ref") &&
    !reasons.includes("grounding.forbidden_claim")
  ) {
    // Supplied refs cannot provide factual authority when none are eligible.
    // Do not fail non-factual openings solely for unused ineligible refs —
    // but document that they confer no authority (no extra reason unless required).
  }

  if (!groundingPassed) {
    groundingStatus = "failed";
  }

  // --- Hard safety gate ---
  let safetyPassed = true;

  if (!text.trim() || wordCount === 0) {
    safetyPassed = false;
    reasons.push("safety.empty_opening");
  }

  if (constraints.mustPreserveSubject) {
    const tokens = extractHookSubjectTokens(request.topic);
    const lower = text.toLowerCase();
    const connected =
      tokens.length === 0 || tokens.some((token) => lower.includes(token));
    if (!connected) {
      safetyPassed = false;
      reasons.push("safety.subject_not_preserved");
    }
  }

  if (!constraints.allowQuestionForm && /\?/.test(text)) {
    safetyPassed = false;
    reasons.push("safety.question_not_allowed");
  }

  if (constraints.forbidUnverifiedSuperlatives && signals.factualSuperlatives) {
    if (!hasEligible) {
      safetyPassed = false;
      reasons.push("safety.unsupported_superlative");
    }
  }

  if (hasPromptInjection(text)) {
    safetyPassed = false;
    reasons.push("safety.prompt_injection");
  }

  if (hasHarmfulPersonalTargeting(text)) {
    safetyPassed = false;
    reasons.push("safety.harmful_targeting");
  }

  if (wordCount > constraints.maxOpeningWords * 3 && !/[.!?…]/.test(text)) {
    safetyPassed = false;
    reasons.push("safety.malformed_opening");
  }

  // --- Declared opening maxima (hard limits, not advisory) ---
  const wordLimitPassed = wordCount <= constraints.maxOpeningWords;
  const spokenDurationLimitPassed =
    spokenSeconds <= constraints.maxOpeningSpokenSecondsHint;

  if (!wordLimitPassed) {
    reasons.push("quality.over_word_limit");
  }
  if (!spokenDurationLimitPassed) {
    reasons.push("quality.over_spoken_duration");
  }

  const provocativeness = scoreProvocativeness(text, candidate.origin);
  const clarity = scoreClarity(text, wordCount, constraints.maxOpeningWords);
  const grounding = scoreGrounding(
    signals,
    groundingPassed,
    candidate.claimRefs.length,
  );
  const safety = scoreSafety(safetyPassed, reasons);

  const scores: HookValidationScores = Object.freeze({
    provocativeness,
    clarity,
    grounding,
    safety,
  });

  const provocativenessPassed = provocativeness >= constraints.minProvocativeness;
  const clarityPassed = clarity >= constraints.minClarity;

  if (!provocativenessPassed) {
    reasons.push("quality.provocativeness_below_threshold");
  }
  if (!clarityPassed) {
    reasons.push("quality.clarity_below_threshold");
  }

  const uniqueReasons = Object.freeze([...new Set(reasons)]);

  const fingerprintOk = !uniqueReasons.some((r) => r.startsWith("fingerprint."));
  const ok =
    fingerprintOk &&
    groundingPassed &&
    safetyPassed &&
    provocativenessPassed &&
    clarityPassed &&
    wordLimitPassed &&
    spokenDurationLimitPassed;

  const repairBoundExceeded = input.repairBoundExceeded === true;
  const repairRecommended = !ok && fingerprintOk && !repairBoundExceeded;

  return Object.freeze({
    ok,
    candidateId: candidate.candidateId,
    planFingerprint: plan.planFingerprint,
    scores,
    hardGatesPassed: Object.freeze({
      grounding: groundingPassed,
      safety: safetyPassed,
    }),
    strategyThresholdsPassed: Object.freeze({
      provocativeness: provocativenessPassed,
      clarity: clarityPassed,
    }),
    openingLimitsPassed: Object.freeze({
      wordLimit: wordLimitPassed,
      spokenDurationLimit: spokenDurationLimitPassed,
    }),
    reasons: uniqueReasons,
    groundingStatus,
    repairRecommended,
    ...(repairBoundExceeded ? { repairBoundExceeded: true } : {}),
  });
}

export function isQualityOnlyFailure(validation: HookValidationResult): boolean {
  return (
    !validation.ok &&
    validation.hardGatesPassed.grounding &&
    validation.hardGatesPassed.safety
  );
}

export function isHardGateFailure(validation: HookValidationResult): boolean {
  return (
    !validation.hardGatesPassed.grounding || !validation.hardGatesPassed.safety
  );
}
