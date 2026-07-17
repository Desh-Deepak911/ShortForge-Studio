/**
 * Retention-owned stable serialization and hashing — Sprint 10B.
 * Does not import Hook or Export fingerprint helpers.
 */

import {
  RETENTION_CONTRACT_FINGERPRINT_PREFIX,
  RETENTION_IDENTITY_FINGERPRINT_PREFIX,
  RETENTION_MAX_RESEARCH_IDENTITY_CHARS,
  RETENTION_RESEARCH_FINGERPRINT_PREFIX,
} from "./retention-story-contract.constants";
import type {
  NormalizedStoryContract,
  RetentionGroundingClaim,
  StoryContractConstraints,
} from "./retention-story-contract.types";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

/** Stable structured serialization for fingerprints and identities. */
export function retentionStableStringify(value: unknown): string {
  return stableStringify(value);
}

/** FNV-1a 32-bit → base36. Retention-owned — not Hook/Export. */
export function retentionStableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function buildRetentionSemanticIdentity(
  payload: unknown,
  prefix: string = RETENTION_IDENTITY_FINGERPRINT_PREFIX,
): string {
  const digest = retentionStableHash(retentionStableStringify(payload));
  const identity = `${prefix}${digest}`;
  return identity.slice(0, RETENTION_MAX_RESEARCH_IDENTITY_CHARS);
}

export function buildResearchIdentityFromClaims(
  claims: readonly RetentionGroundingClaim[],
): string | null {
  if (claims.length === 0) return null;
  const sorted = [...claims]
    .map((claim) =>
      Object.freeze({
        claimId: claim.claimId,
        text: claim.text,
        provenance: claim.provenance,
        verification: claim.verification,
        permittedFactualUse: claim.permittedFactualUse,
        forbidden: claim.forbidden,
        ...(claim.sourceRef != null ? { sourceRef: claim.sourceRef } : {}),
      }),
    )
    .sort((a, b) => {
      const byId = a.claimId.localeCompare(b.claimId);
      if (byId !== 0) return byId;
      return a.text.localeCompare(b.text);
    });
  return buildRetentionSemanticIdentity(
    { claims: sorted },
    RETENTION_RESEARCH_FINGERPRINT_PREFIX,
  );
}

export interface ContractFingerprintPayload {
  readonly version: NormalizedStoryContract["version"];
  readonly topic: string;
  readonly durationSec: number;
  readonly scriptMode: NormalizedStoryContract["scriptMode"];
  readonly tone: NormalizedStoryContract["tone"];
  readonly qualityMode: NormalizedStoryContract["qualityMode"];
  readonly factHandlingMode?: NormalizedStoryContract["factHandlingMode"];
  readonly templateId: string | null;
  readonly hookStyleIdentity: string;
  readonly userAuthoredHookIdentity: string | null;
  readonly manualContextIdentity: string | null;
  readonly userInstructionsIdentity: string | null;
  readonly researchContextIdentity: string | null;
  readonly formatStrategyId: NormalizedStoryContract["formatStrategyId"];
  readonly audienceIntent: NormalizedStoryContract["audienceIntent"];
  readonly desiredReaction: NormalizedStoryContract["desiredReaction"];
  readonly constraints: StoryContractConstraints;
  readonly generationPath: NormalizedStoryContract["generationPath"];
}

export function buildContractFingerprint(payload: ContractFingerprintPayload): string {
  return buildRetentionSemanticIdentity(
    payload,
    RETENTION_CONTRACT_FINGERPRINT_PREFIX,
  );
}
