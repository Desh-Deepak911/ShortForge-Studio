/**
 * Normalize raw HookRequestInput → NormalizedHookRequest — Sprint 7B.1.
 */

import { SCRIPT_MODES, type ScriptMode, type Tone } from "@/types/footiebitz";

import {
  HOOK_CONTRACT_VERSION,
  HOOK_DEFAULT_DURATION_SECONDS,
  HOOK_MAX_CLAIM_ID_CHARS,
  HOOK_MAX_CLAIM_TEXT_CHARS,
  HOOK_MAX_DURATION_SECONDS,
  HOOK_MAX_OPENING_STYLE_ADVISORY_CHARS,
  HOOK_MAX_USER_AUTHORED_HOOK_CHARS,
  HOOK_MIN_DURATION_SECONDS,
  HOOK_OPENING_INTENT_EVIDENCE_LED_SURPRISE,
} from "./hook-contract.constants";
import { assertRequestedStrategyAllowed } from "../presentation/hook-style-selection";
import { buildHookRequestFingerprint } from "./hook-fingerprint";
import type {
  HookGroundingClaim,
  HookGroundingContext,
  HookNormalizedGroundingStatus,
  HookOpeningIntent,
  HookRequestInput,
  NormalizedHookRequest,
} from "./hook-contract.types";

const TONES: readonly Tone[] = ["dramatic", "funny", "tactical", "news", "emotional"];

const CLAIM_ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;

export class HookNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HookNormalizationError";
  }
}

function sanitizeText(value: string | undefined, maxChars: number): string | undefined {
  if (value == null) return undefined;
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars)
    .trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function normalizeTopic(topic: string): string {
  const cleaned = sanitizeText(topic, 240);
  if (!cleaned) {
    throw new HookNormalizationError(
      "HookRequestInput.topic must be a non-empty string after normalization.",
    );
  }
  return cleaned;
}

function isScriptMode(value: unknown): value is ScriptMode {
  return typeof value === "string" && (SCRIPT_MODES as readonly string[]).includes(value);
}

function isTone(value: unknown): value is Tone {
  return typeof value === "string" && (TONES as readonly string[]).includes(value);
}

function normalizeDurationSeconds(value: unknown): number {
  const raw =
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : HOOK_DEFAULT_DURATION_SECONDS;
  const rounded = Math.round(raw);
  return Math.max(HOOK_MIN_DURATION_SECONDS, Math.min(HOOK_MAX_DURATION_SECONDS, rounded));
}

function sanitizeClaimId(claimId: string): string {
  const cleaned = sanitizeText(claimId, HOOK_MAX_CLAIM_ID_CHARS);
  if (!cleaned || !CLAIM_ID_PATTERN.test(cleaned)) {
    throw new HookNormalizationError(
      `Invalid grounding claimId "${claimId}". Use non-empty sanitized IDs.`,
    );
  }
  return cleaned;
}

function normalizeClaim(raw: HookGroundingClaim): HookGroundingClaim {
  const claimId = sanitizeClaimId(raw.claimId);
  const text = sanitizeText(raw.text, HOOK_MAX_CLAIM_TEXT_CHARS);
  if (!text) {
    throw new HookNormalizationError(`Grounding claim "${claimId}" text must be non-empty.`);
  }

  const provenance = raw.provenance;
  let verificationStatus = raw.verificationStatus;
  let permittedForFactualHookUse = raw.permittedForFactualHookUse === true;

  if (provenance === "forbidden" || verificationStatus === "forbidden") {
    if (permittedForFactualHookUse) {
      throw new HookNormalizationError(
        `Forbidden claim "${claimId}" cannot be permitted for factual hook use.`,
      );
    }
    permittedForFactualHookUse = false;
    verificationStatus = "forbidden";
  }

  // User/qualitative context can never be independently research-verified.
  if (
    provenance === "user_provided_unverified" ||
    provenance === "qualitative_context"
  ) {
    if (verificationStatus === "verified") {
      verificationStatus = "unverified";
    }
    permittedForFactualHookUse = false;
  }

  // permittedForFactualHookUse is valid only for verified research_verified claims.
  if (
    !(
      provenance === "research_verified" &&
      verificationStatus === "verified" &&
      permittedForFactualHookUse
    )
  ) {
    permittedForFactualHookUse = false;
  }

  const sourceRef = sanitizeText(raw.sourceRef, HOOK_MAX_CLAIM_TEXT_CHARS);

  return Object.freeze({
    claimId,
    text,
    provenance,
    verificationStatus,
    ...(sourceRef ? { sourceRef } : {}),
    permittedForFactualHookUse,
  });
}

export function resolveNormalizedGroundingStatus(input: {
  readonly claims: readonly HookGroundingClaim[];
  readonly unavailableResearch: boolean;
}): HookNormalizedGroundingStatus {
  const { claims, unavailableResearch } = input;

  if (unavailableResearch) {
    return "research_unavailable";
  }

  const hasVerifiedResearch = claims.some(
    (claim) =>
      claim.provenance === "research_verified" && claim.verificationStatus === "verified",
  );
  const hasUserOrQualitative = claims.some(
    (claim) =>
      claim.provenance === "user_provided_unverified" ||
      claim.provenance === "qualitative_context",
  );

  if (hasVerifiedResearch && hasUserOrQualitative) {
    return "mixed";
  }
  if (hasVerifiedResearch) {
    return "research_verified_available";
  }
  return "user_context_only";
}

export function isEligibleVerifiedFactualClaim(claim: HookGroundingClaim): boolean {
  return (
    claim.provenance === "research_verified" &&
    claim.verificationStatus === "verified" &&
    claim.permittedForFactualHookUse === true
  );
}

export function hasEligibleVerifiedFactualClaim(
  grounding: HookGroundingContext,
): boolean {
  if (grounding.unavailableResearch) {
    return false;
  }
  if (
    grounding.normalizedGroundingStatus !== "research_verified_available" &&
    grounding.normalizedGroundingStatus !== "mixed"
  ) {
    return false;
  }
  return grounding.claims.some(isEligibleVerifiedFactualClaim);
}

function buildGroundingContext(
  input: HookRequestInput["groundingInput"],
): HookGroundingContext {
  const seen = new Set<string>();
  const claims: HookGroundingClaim[] = [];
  for (const raw of input?.claims ?? []) {
    const claim = normalizeClaim(raw);
    if (seen.has(claim.claimId)) {
      throw new HookNormalizationError(`Duplicate grounding claimId "${claim.claimId}".`);
    }
    seen.add(claim.claimId);
    claims.push(claim);
  }

  const unavailableResearch = input?.unavailableResearch === true;
  const hasEligible = claims.some(isEligibleVerifiedFactualClaim);

  // unavailableResearch cannot coexist with an eligible verified research claim.
  if (unavailableResearch && hasEligible) {
    throw new HookNormalizationError(
      "unavailableResearch cannot coexist with an eligible verified research claim.",
    );
  }

  // If marked unavailable, drop eligibility by construction (no eligible claims remain).
  if (unavailableResearch) {
    for (let i = 0; i < claims.length; i++) {
      const claim = claims[i]!;
      if (claim.permittedForFactualHookUse) {
        claims[i] = Object.freeze({ ...claim, permittedForFactualHookUse: false });
      }
    }
  }

  const frozenClaims = Object.freeze(claims);
  const normalizedGroundingStatus = resolveNormalizedGroundingStatus({
    claims: frozenClaims,
    unavailableResearch,
  });

  // Status and eligibility must agree.
  if (
    hasEligibleVerifiedFactualClaim({
      claims: frozenClaims,
      unavailableResearch,
      normalizedGroundingStatus,
    }) &&
    normalizedGroundingStatus === "research_unavailable"
  ) {
    throw new HookNormalizationError(
      "Grounding status contradicts factual-claim eligibility.",
    );
  }

  const researchFingerprint = sanitizeText(input?.researchFingerprint, 128);

  return Object.freeze({
    claims: frozenClaims,
    unavailableResearch,
    ...(researchFingerprint ? { researchFingerprint } : {}),
    normalizedGroundingStatus,
  });
}

function normalizeOpeningIntent(
  raw: HookOpeningIntent | undefined,
): HookOpeningIntent | undefined {
  if (!raw) return undefined;

  if (raw.kind !== HOOK_OPENING_INTENT_EVIDENCE_LED_SURPRISE) {
    // Unknown kinds fall through safely — omit intent.
    return undefined;
  }

  const claimRefs = [
    ...new Set(
      (raw.claimRefs ?? [])
        .map((id) => sanitizeText(id, HOOK_MAX_CLAIM_ID_CHARS))
        .filter((id): id is string => Boolean(id && CLAIM_ID_PATTERN.test(id))),
    ),
  ].sort();

  return Object.freeze({
    kind: HOOK_OPENING_INTENT_EVIDENCE_LED_SURPRISE,
    claimRefs: Object.freeze(claimRefs),
  });
}

/**
 * Normalize adapter input. Strategy resolution must operate only on the result.
 */
export function normalizeHookRequest(input: HookRequestInput): NormalizedHookRequest {
  if (input.contractVersion != null && input.contractVersion !== HOOK_CONTRACT_VERSION) {
    throw new HookNormalizationError(
      `Unsupported Hook contract version "${input.contractVersion}". Only ${HOOK_CONTRACT_VERSION} is accepted.`,
    );
  }

  const topic = normalizeTopic(input.topic);
  const grounding = buildGroundingContext(input.groundingInput);
  const openingIntent = normalizeOpeningIntent(input.openingIntent);
  const scriptMode = isScriptMode(input.scriptMode) ? input.scriptMode : "story";

  const requestedStrategyId = input.requestedStrategyId;
  if (requestedStrategyId != null) {
    try {
      assertRequestedStrategyAllowed(requestedStrategyId, scriptMode);
    } catch (error) {
      throw new HookNormalizationError(
        error instanceof Error ? error.message : "Invalid requested Hook strategy.",
      );
    }
  }

  const draft: Omit<NormalizedHookRequest, "requestFingerprint"> = {
    contractVersion: HOOK_CONTRACT_VERSION,
    topic,
    scriptMode,
    tone: isTone(input.tone) ? input.tone : "dramatic",
    durationSeconds: normalizeDurationSeconds(input.durationSeconds),
    ...(input.templateId != null ? { templateId: input.templateId } : {}),
    ...(sanitizeText(input.openingStyleAdvisory, HOOK_MAX_OPENING_STYLE_ADVISORY_CHARS)
      ? {
          openingStyleAdvisory: sanitizeText(
            input.openingStyleAdvisory,
            HOOK_MAX_OPENING_STYLE_ADVISORY_CHARS,
          ),
        }
      : {}),
    ...(sanitizeText(input.userAuthoredHook, HOOK_MAX_USER_AUTHORED_HOOK_CHARS)
      ? {
          userAuthoredHook: sanitizeText(
            input.userAuthoredHook,
            HOOK_MAX_USER_AUTHORED_HOOK_CHARS,
          ),
        }
      : {}),
    ...(requestedStrategyId ? { requestedStrategyId } : {}),
    ...(openingIntent ? { openingIntent } : {}),
    grounding,
    generationPath: input.generationPath,
  };

  const requestFingerprint = buildHookRequestFingerprint(draft);
  return Object.freeze({
    ...draft,
    requestFingerprint,
  });
}
