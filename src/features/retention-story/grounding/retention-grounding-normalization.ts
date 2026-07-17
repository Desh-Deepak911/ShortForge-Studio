/**
 * Retention grounding claim sanitization and merge — Sprint 10B.1 / 10B.1A.
 */

import {
  RETENTION_MAX_CLAIM_ID_CHARS,
  RETENTION_MAX_CLAIM_SOURCE_REF_CHARS,
  RETENTION_MAX_CLAIM_TEXT_CHARS,
  RETENTION_MAX_GROUNDING_CLAIMS,
  RETENTION_MAX_PI_BEAT_ID_CHARS,
  RETENTION_MAX_PI_FACT_ROLE_CHARS,
} from "../domain/retention-story-contract.constants";
import { assertRetentionResearchIdentity } from "../domain/retention-research-identity";
import { RetentionStoryError } from "../domain/retention-story-errors";
import {
  buildResearchIdentityFromClaims,
  retentionStableHash,
  retentionStableStringify,
} from "../domain/retention-story-fingerprint";
import { sanitizeRetentionText } from "../domain/normalize-story-contract";
import type {
  RetentionClaimProvenance,
  RetentionClaimVerification,
  RetentionGroundingClaim,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";

const PROVENANCES = new Set<RetentionClaimProvenance>([
  "research_graph",
  "research_provider",
  "manual_user",
  "inferred",
  "unknown",
]);

const VERIFICATIONS = new Set<RetentionClaimVerification>([
  "verified",
  "unverified",
  "rejected",
  "forbidden",
]);

export interface RetentionGroundingClaimDraft {
  readonly claimId?: string | null;
  readonly text: string;
  readonly provenance: RetentionClaimProvenance;
  readonly verification: RetentionClaimVerification;
  readonly permittedFactualUse: boolean;
  readonly forbidden: boolean;
  readonly sourceRef?: string | null;
  readonly piBeatId?: string | null;
  readonly piFactRole?: string | null;
  /**
   * Structured content identity for generated IDs (no delimiter-joined strings).
   * Must not include query IDs, timestamps, array positions, or request IDs.
   */
  readonly contentIdentity?: unknown;
  /** True when claimId came from an authoritative PI/research source record. */
  readonly hasAuthoritativeId?: boolean;
}

const VERIFICATION_RANK: Record<RetentionClaimVerification, number> = {
  verified: 0,
  unverified: 1,
  rejected: 2,
  forbidden: 3,
};

/** Lower = less trusted. Fail-closed merges take the minimum. */
const PROVENANCE_TRUST: Record<RetentionClaimProvenance, number> = {
  research_graph: 4,
  research_provider: 3,
  manual_user: 2,
  inferred: 1,
  unknown: 0,
};

function deepFreezeClaims(
  claims: readonly RetentionGroundingClaim[],
): readonly RetentionGroundingClaim[] {
  return Object.freeze(claims.map((c) => Object.freeze({ ...c })));
}

export function buildRetentionContentDerivedClaimId(input: {
  readonly kind: string;
  readonly contentIdentity?: unknown;
  readonly text: string;
  readonly provenance: RetentionClaimProvenance;
}): string {
  const digest = retentionStableHash(
    retentionStableStringify({
      kind: input.kind,
      contentIdentity: input.contentIdentity ?? null,
      text: sanitizeRetentionText(input.text, RETENTION_MAX_CLAIM_TEXT_CHARS),
      provenance: input.provenance,
    }),
  );
  return sanitizeRetentionText(`rs:c:${digest}`, RETENTION_MAX_CLAIM_ID_CHARS);
}

function sanitizeClaimId(raw: string | null | undefined): string {
  return sanitizeRetentionText(raw ?? "", RETENTION_MAX_CLAIM_ID_CHARS);
}

function mostRestrictiveVerification(
  a: RetentionClaimVerification,
  b: RetentionClaimVerification,
): RetentionClaimVerification {
  return VERIFICATION_RANK[a] >= VERIFICATION_RANK[b] ? a : b;
}

function leastTrustedProvenance(
  a: RetentionClaimProvenance,
  b: RetentionClaimProvenance,
): RetentionClaimProvenance {
  return PROVENANCE_TRUST[a] <= PROVENANCE_TRUST[b] ? a : b;
}

function mergeSourceRefs(
  a?: string,
  b?: string,
): string | undefined {
  const parts = new Set<string>();
  for (const value of [a, b]) {
    if (!value) continue;
    for (const part of value.split("|")) {
      const trimmed = part.trim();
      if (trimmed) parts.add(trimmed);
    }
  }
  if (parts.size === 0) return undefined;
  // Sort → join → re-bound (order-independent after truncation).
  const joined = [...parts].sort((x, y) => x.localeCompare(y)).join("|");
  const bounded = sanitizeRetentionText(joined, RETENTION_MAX_CLAIM_SOURCE_REF_CHARS);
  return bounded || undefined;
}

function mergePiRoles(a?: string, b?: string): string | undefined {
  const roles = new Set<string>();
  for (const value of [a, b]) {
    if (!value) continue;
    for (const part of value.split("+")) {
      const trimmed = part.trim();
      if (trimmed) roles.add(trimmed);
    }
  }
  if (roles.size === 0) return undefined;
  const joined = [...roles].sort((x, y) => x.localeCompare(y)).join("+");
  const bounded = sanitizeRetentionText(joined, RETENTION_MAX_PI_FACT_ROLE_CHARS);
  return bounded || undefined;
}

function mergePiBeatIds(a?: string, b?: string): string | undefined {
  const ids = [a, b].filter((v): v is string => Boolean(v && v.trim()));
  if (ids.length === 0) return undefined;
  // Singular field: lexicographically smallest, then re-bound.
  const selected = [...ids].sort((x, y) => x.localeCompare(y))[0]!;
  const bounded = sanitizeRetentionText(selected, RETENTION_MAX_PI_BEAT_ID_CHARS);
  return bounded || undefined;
}

function reapplyEligibility(claim: {
  readonly claimId: string;
  readonly text: string;
  readonly provenance: RetentionClaimProvenance;
  readonly verification: RetentionClaimVerification;
  readonly permittedFactualUse: boolean;
  readonly forbidden: boolean;
  readonly sourceRef?: string;
  readonly piBeatId?: string;
  readonly piFactRole?: string;
}): RetentionGroundingClaim {
  let verification = claim.verification;
  if (claim.verification === "rejected") {
    verification = "rejected";
  } else if (claim.forbidden || claim.verification === "forbidden") {
    verification = "forbidden";
  }

  const forbidden =
    claim.forbidden ||
    verification === "forbidden" ||
    verification === "rejected";

  const providerBacked =
    claim.provenance === "research_graph" ||
    claim.provenance === "research_provider";

  let permittedFactualUse =
    !forbidden &&
    verification === "verified" &&
    claim.permittedFactualUse &&
    providerBacked;

  // Sprint 10H.3 — Creative Premise creator-asserted facts stay unverified
  // but may retain permittedFactualUse under creative_premise mode.
  if (
    !forbidden &&
    claim.sourceRef === "creative_premise" &&
    claim.provenance === "manual_user" &&
    claim.permittedFactualUse === true
  ) {
    permittedFactualUse = true;
    if (verification === "verified") {
      verification = "unverified";
    }
  }

  if (forbidden) {
    permittedFactualUse = false;
    verification = verification === "rejected" ? "rejected" : "forbidden";
  } else if (verification === "verified" && !permittedFactualUse) {
    verification = "unverified";
  }

  return Object.freeze({
    claimId: claim.claimId,
    text: claim.text,
    provenance: claim.provenance,
    verification,
    permittedFactualUse: Boolean(permittedFactualUse),
    forbidden: Boolean(forbidden),
    ...(claim.sourceRef ? { sourceRef: claim.sourceRef } : {}),
    ...(claim.piBeatId ? { piBeatId: claim.piBeatId } : {}),
    ...(claim.piFactRole ? { piFactRole: claim.piFactRole } : {}),
  });
}

/**
 * Fail-closed, order-independent merge for same claimId + same text.
 */
function mergeSameIdClaims(
  a: RetentionGroundingClaim,
  b: RetentionGroundingClaim,
): RetentionGroundingClaim {
  if (a.text !== b.text) {
    throw new RetentionStoryError(
      "grounding_claim_conflict",
      "Conflicting grounding claims share an ID with different semantic text.",
    );
  }

  const forbidden = a.forbidden || b.forbidden;
  const verification = mostRestrictiveVerification(a.verification, b.verification);
  const provenance = leastTrustedProvenance(a.provenance, b.provenance);
  const sourceRef = mergeSourceRefs(a.sourceRef, b.sourceRef);
  const piBeatId = mergePiBeatIds(a.piBeatId, b.piBeatId);
  const piFactRole = mergePiRoles(a.piFactRole, b.piFactRole);

  return reapplyEligibility({
    claimId: a.claimId,
    text: a.text,
    provenance,
    verification,
    permittedFactualUse: a.permittedFactualUse && b.permittedFactualUse,
    forbidden,
    ...(sourceRef ? { sourceRef } : {}),
    ...(piBeatId ? { piBeatId } : {}),
    ...(piFactRole ? { piFactRole } : {}),
  });
}

export function normalizeRetentionGroundingClaimDraft(
  draft: RetentionGroundingClaimDraft,
): RetentionGroundingClaim | null {
  const text = sanitizeRetentionText(draft.text, RETENTION_MAX_CLAIM_TEXT_CHARS);
  if (!text) return null;

  let claimId = sanitizeClaimId(draft.claimId);
  if (!claimId) {
    claimId = buildRetentionContentDerivedClaimId({
      kind: draft.contentIdentity != null ? "content_identity" : "text",
      contentIdentity: draft.contentIdentity ?? null,
      text,
      provenance: draft.provenance,
    });
  }
  if (!claimId) return null;

  const sourceRef = sanitizeRetentionText(
    draft.sourceRef ?? "",
    RETENTION_MAX_CLAIM_SOURCE_REF_CHARS,
  );
  const piBeatId = sanitizeRetentionText(
    draft.piBeatId ?? "",
    RETENTION_MAX_PI_BEAT_ID_CHARS,
  );
  const piFactRole = sanitizeRetentionText(
    draft.piFactRole ?? "",
    RETENTION_MAX_PI_FACT_ROLE_CHARS,
  );

  let verification: RetentionClaimVerification = draft.verification;
  if (draft.verification === "rejected") {
    verification = "rejected";
  } else if (draft.forbidden || draft.verification === "forbidden") {
    verification = "forbidden";
  }

  return reapplyEligibility({
    claimId,
    text,
    provenance: draft.provenance,
    verification,
    permittedFactualUse: draft.permittedFactualUse,
    forbidden:
      draft.forbidden ||
      verification === "forbidden" ||
      verification === "rejected",
    ...(sourceRef ? { sourceRef } : {}),
    ...(piBeatId ? { piBeatId } : {}),
    ...(piFactRole ? { piFactRole } : {}),
  });
}

function applyForbiddenTextDominance(
  claims: readonly RetentionGroundingClaim[],
): RetentionGroundingClaim[] {
  const forbiddenTexts = new Set(
    claims
      .filter((c) => c.forbidden || c.verification === "forbidden" || c.verification === "rejected")
      .map((c) => c.text),
  );
  if (forbiddenTexts.size === 0) return [...claims];

  return claims.map((claim) => {
    if (!forbiddenTexts.has(claim.text)) return claim;
    return reapplyEligibility({
      ...claim,
      forbidden: true,
      verification:
        claim.verification === "rejected" ? "rejected" : "forbidden",
      permittedFactualUse: false,
    });
  });
}

function collapseGeneratedManualDuplicates(
  claims: readonly RetentionGroundingClaim[],
  authoritativeIds: ReadonlySet<string>,
): RetentionGroundingClaim[] {
  const byText = new Map<string, RetentionGroundingClaim[]>();
  for (const claim of claims) {
    if (claim.provenance !== "manual_user") continue;
    if (authoritativeIds.has(claim.claimId)) continue;
    const list = byText.get(claim.text) ?? [];
    list.push(claim);
    byText.set(claim.text, list);
  }

  const drop = new Set<string>();
  for (const group of byText.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.claimId.localeCompare(b.claimId));
    const keep = sorted[0]!;
    let merged = keep;
    for (let i = 1; i < sorted.length; i++) {
      merged = mergeSameIdClaims(
        { ...merged, claimId: keep.claimId },
        { ...sorted[i]!, claimId: keep.claimId },
      );
      drop.add(sorted[i]!.claimId);
    }
    // Replace keep with merged via map later
    byText.set(keep.text, [merged]);
  }

  const replacements = new Map<string, RetentionGroundingClaim>();
  for (const [text, group] of byText) {
    if (group.length === 1 && drop.size >= 0) {
      const claim = group[0]!;
      // Only replace if we collapsed
      const originals = claims.filter(
        (c) => c.provenance === "manual_user" && c.text === text && !authoritativeIds.has(c.claimId),
      );
      if (originals.length > 1) {
        replacements.set(claim.claimId, claim);
      }
    }
  }

  const out: RetentionGroundingClaim[] = [];
  const seenManualText = new Set<string>();
  for (const claim of claims) {
    if (drop.has(claim.claimId)) continue;
    if (
      claim.provenance === "manual_user" &&
      !authoritativeIds.has(claim.claimId)
    ) {
      if (seenManualText.has(claim.text)) continue;
      seenManualText.add(claim.text);
      const replacement = [...replacements.values()].find((c) => c.text === claim.text);
      out.push(replacement ?? claim);
      continue;
    }
    out.push(claim);
  }
  return out;
}

function claimCapTier(claim: RetentionGroundingClaim): number {
  if (claim.forbidden || claim.verification === "forbidden" || claim.verification === "rejected") {
    return 1;
  }
  const roles = new Set((claim.piFactRole ?? "").split("+").filter(Boolean));
  if (roles.has("opening_intent") || roles.has("required") || roles.has("opening_hook")) {
    return 2;
  }
  if (claim.permittedFactualUse && claim.verification === "verified") {
    return 3;
  }
  if (roles.has("optional")) {
    return 4;
  }
  return 5;
}

function boundClaimsByAuthority(
  claims: readonly RetentionGroundingClaim[],
): RetentionGroundingClaim[] {
  if (claims.length <= RETENTION_MAX_GROUNDING_CLAIMS) {
    return [...claims].sort((a, b) => {
      const byId = a.claimId.localeCompare(b.claimId);
      return byId !== 0 ? byId : a.text.localeCompare(b.text);
    });
  }

  const sorted = [...claims].sort((a, b) => {
    const tier = claimCapTier(a) - claimCapTier(b);
    if (tier !== 0) return tier;
    const byId = a.claimId.localeCompare(b.claimId);
    return byId !== 0 ? byId : a.text.localeCompare(b.text);
  });
  return sorted.slice(0, RETENTION_MAX_GROUNDING_CLAIMS);
}

/**
 * Deduplicate, merge fail-closed, apply forbidden-text dominance, bound by authority, sort.
 */
export function finalizeRetentionGroundingClaims(
  drafts: readonly RetentionGroundingClaimDraft[],
): RetentionGroundingContext {
  const byId = new Map<string, RetentionGroundingClaim>();
  const authoritativeIds = new Set<string>();

  for (const draft of drafts) {
    const normalized = normalizeRetentionGroundingClaimDraft(draft);
    if (!normalized) continue;
    if (draft.hasAuthoritativeId && draft.claimId) {
      authoritativeIds.add(normalized.claimId);
    }
    const existing = byId.get(normalized.claimId);
    if (!existing) {
      byId.set(normalized.claimId, normalized);
      continue;
    }
    byId.set(normalized.claimId, mergeSameIdClaims(existing, normalized));
  }

  let claims = applyForbiddenTextDominance([...byId.values()]);
  claims = collapseGeneratedManualDuplicates(claims, authoritativeIds);
  claims = applyForbiddenTextDominance(claims);
  claims = boundClaimsByAuthority(claims);

  const frozen = deepFreezeClaims(claims);
  return Object.freeze({
    version: 1 as const,
    claims: frozen,
    researchIdentity: buildResearchIdentityFromClaims(frozen),
  });
}

function throwInvalidGroundingContext(): never {
  throw new RetentionStoryError(
    "invalid_grounding_context",
    "Grounding context structure is invalid.",
  );
}

function assertGroundingContextStructure(
  input: unknown,
): asserts input is RetentionGroundingContext {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    throwInvalidGroundingContext();
  }
  const record = input as Record<string, unknown>;
  if (record.version !== 1) {
    throwInvalidGroundingContext();
  }
  if (!Array.isArray(record.claims)) {
    throwInvalidGroundingContext();
  }
}

function claimDraftFromRuntime(raw: unknown): RetentionGroundingClaimDraft {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throwInvalidGroundingContext();
  }
  const claim = raw as Record<string, unknown>;
  if (typeof claim.text !== "string") {
    throwInvalidGroundingContext();
  }
  if (
    typeof claim.provenance !== "string" ||
    !PROVENANCES.has(claim.provenance as RetentionClaimProvenance)
  ) {
    throwInvalidGroundingContext();
  }
  if (
    typeof claim.verification !== "string" ||
    !VERIFICATIONS.has(claim.verification as RetentionClaimVerification)
  ) {
    throwInvalidGroundingContext();
  }
  if (typeof claim.permittedFactualUse !== "boolean") {
    throwInvalidGroundingContext();
  }
  if (typeof claim.forbidden !== "boolean") {
    throwInvalidGroundingContext();
  }
  if (
    claim.claimId != null &&
    claim.claimId !== "" &&
    typeof claim.claimId !== "string"
  ) {
    throwInvalidGroundingContext();
  }
  if (
    claim.sourceRef != null &&
    claim.sourceRef !== "" &&
    typeof claim.sourceRef !== "string"
  ) {
    throwInvalidGroundingContext();
  }
  if (
    claim.piBeatId != null &&
    claim.piBeatId !== "" &&
    typeof claim.piBeatId !== "string"
  ) {
    throwInvalidGroundingContext();
  }
  if (
    claim.piFactRole != null &&
    claim.piFactRole !== "" &&
    typeof claim.piFactRole !== "string"
  ) {
    throwInvalidGroundingContext();
  }

  return {
    claimId: typeof claim.claimId === "string" ? claim.claimId : null,
    text: claim.text,
    provenance: claim.provenance as RetentionClaimProvenance,
    verification: claim.verification as RetentionClaimVerification,
    permittedFactualUse: claim.permittedFactualUse,
    forbidden: claim.forbidden,
    sourceRef: typeof claim.sourceRef === "string" ? claim.sourceRef : null,
    piBeatId: typeof claim.piBeatId === "string" ? claim.piBeatId : null,
    piFactRole: typeof claim.piFactRole === "string" ? claim.piFactRole : null,
    hasAuthoritativeId: Boolean(
      typeof claim.claimId === "string" && claim.claimId.trim(),
    ),
  };
}

/**
 * Canonical grounding normalization for Story Contract input.
 * Validates runtime structure; never trusts caller eligibility flags or identity.
 */
export function normalizeRetentionGroundingContext(
  input: RetentionGroundingContext | null | undefined,
): RetentionGroundingContext {
  if (input == null) {
    return Object.freeze({
      version: 1 as const,
      claims: Object.freeze([]),
      researchIdentity: null,
    });
  }

  assertGroundingContextStructure(input);

  const suppliedIdentity =
    input.researchIdentity == null || input.researchIdentity === ""
      ? null
      : assertRetentionResearchIdentity(input.researchIdentity);

  if (input.claims.length === 0) {
    return Object.freeze({
      version: 1 as const,
      claims: Object.freeze([]),
      researchIdentity: suppliedIdentity,
    });
  }

  const drafts = input.claims.map((claim) => claimDraftFromRuntime(claim));
  const canonical = finalizeRetentionGroundingClaims(drafts);

  if (
    suppliedIdentity != null &&
    suppliedIdentity !== canonical.researchIdentity
  ) {
    throw new RetentionStoryError(
      "grounding_identity_mismatch",
      "Supplied grounding research identity does not match canonical claims.",
    );
  }

  return canonical;
}
