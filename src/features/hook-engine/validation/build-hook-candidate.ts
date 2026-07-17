/**
 * Deterministic HookCandidate builder — Sprint 7C.1.
 */

import {
  HOOK_MAX_CLAIM_ID_CHARS,
} from "../domain/hook-contract.constants";
import {
  assertHookPlanFingerprint,
  assertHookRequestFingerprint,
  hookStableHash,
  hookStableStringify,
} from "../domain/hook-fingerprint";
import type {
  HookCandidate,
  HookCandidateOrigin,
  HookPlan,
  NormalizedHookRequest,
} from "../domain/hook-contract.types";
import { extractOpeningSpan } from "./extract-opening-span";

const CLAIM_ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;

export class HookCandidateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HookCandidateError";
  }
}

function sanitizeClaimRef(id: string): string | null {
  const cleaned = id
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, HOOK_MAX_CLAIM_ID_CHARS)
    .trim();
  if (!cleaned || !CLAIM_ID_PATTERN.test(cleaned)) return null;
  return cleaned;
}

export function normalizeClaimRefs(
  claimRefs: readonly string[] | undefined,
): readonly string[] {
  const unique = new Set<string>();
  for (const raw of claimRefs ?? []) {
    const id = sanitizeClaimRef(raw);
    if (id) unique.add(id);
  }
  return Object.freeze([...unique].sort());
}

/**
 * Deterministic candidate ID from structured semantic identity (no delimiter ambiguity).
 */
export function buildHookCandidateId(input: {
  readonly planFingerprint: string;
  readonly origin: HookCandidateOrigin;
  readonly openingText: string;
  readonly openingStartOffset: number;
  readonly openingEndOffset: number;
  readonly claimRefs: readonly string[];
}): string {
  const payload = hookStableStringify({
    planFingerprint: input.planFingerprint,
    origin: input.origin,
    openingText: input.openingText,
    openingStartOffset: input.openingStartOffset,
    openingEndOffset: input.openingEndOffset,
    claimRefs: [...input.claimRefs].sort(),
  });
  return `hc:${hookStableHash(payload)}`;
}

export function assertHookCandidateId(candidate: HookCandidate): void {
  const expected = buildHookCandidateId({
    planFingerprint: candidate.planFingerprint,
    origin: candidate.origin,
    openingText: candidate.openingText,
    openingStartOffset: candidate.openingStartOffset,
    openingEndOffset: candidate.openingEndOffset,
    claimRefs: candidate.claimRefs,
  });
  if (expected !== candidate.candidateId) {
    throw new HookCandidateError(
      "HookCandidate.candidateId does not match recomputed deterministic identity.",
    );
  }
}

export interface BuildHookCandidateInput {
  readonly narration: string;
  readonly request: NormalizedHookRequest;
  readonly plan: HookPlan;
  readonly origin: HookCandidateOrigin;
  readonly claimRefs?: readonly string[];
}

/**
 * Canonical candidate builder. Claim refs must be supplied by the adapter — never inferred.
 */
export function buildHookCandidate(input: BuildHookCandidateInput): HookCandidate {
  const { narration, request, plan, origin } = input;

  assertHookRequestFingerprint(request);
  assertHookPlanFingerprint(plan);

  if (request.requestFingerprint !== plan.requestFingerprint) {
    throw new HookCandidateError(
      "HookCandidate rejected: request and plan requestFingerprint mismatch.",
    );
  }

  if (typeof narration !== "string" || !narration.trim()) {
    throw new HookCandidateError("HookCandidate rejected: narration is empty.");
  }

  const span = extractOpeningSpan(narration);
  if (!span) {
    throw new HookCandidateError(
      "HookCandidate rejected: no opening span could be extracted.",
    );
  }

  if (narration.slice(span.openingStartOffset, span.openingEndOffset) !== span.openingText) {
    throw new HookCandidateError(
      "HookCandidate rejected: opening span offsets do not slice to openingText.",
    );
  }

  const claimRefs = normalizeClaimRefs(input.claimRefs);
  const candidateId = buildHookCandidateId({
    planFingerprint: plan.planFingerprint,
    origin,
    openingText: span.openingText,
    openingStartOffset: span.openingStartOffset,
    openingEndOffset: span.openingEndOffset,
    claimRefs,
  });

  return Object.freeze({
    candidateId,
    strategyId: plan.strategyId,
    strategyVersion: plan.strategyVersion,
    origin,
    openingText: span.openingText,
    openingTextNormalized: span.openingTextNormalized,
    openingStartOffset: span.openingStartOffset,
    openingEndOffset: span.openingEndOffset,
    claimRefs,
    requestFingerprint: request.requestFingerprint,
    planFingerprint: plan.planFingerprint,
  });
}
