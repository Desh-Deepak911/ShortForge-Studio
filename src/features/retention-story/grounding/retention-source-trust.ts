/**
 * Retention-owned research source trust allowlist — Sprint 10B.1A / 10B.1B.
 * Future provider IDs must be added here explicitly; unknown strings are never verified.
 * Every authority mapping returned by mapRetentionSourceToAuthority is frozen.
 */

import type {
  RetentionClaimProvenance,
  RetentionClaimVerification,
} from "../domain/retention-story-contract.types";

export type RetentionSourceTrustChannel = "graph" | "assembled";

export interface RetentionSourceAuthorityMapping {
  readonly provenance: RetentionClaimProvenance;
  readonly verification: RetentionClaimVerification;
  readonly permittedFactualUse: boolean;
  readonly forbidden: boolean;
}

/** Explicit v1 trusted provider sources (curated research). */
export const RETENTION_TRUSTED_PROVIDER_SOURCES = Object.freeze([
  "api-football",
  "statsbomb",
  "static-fallback",
] as const);

export type RetentionTrustedProviderSource =
  (typeof RETENTION_TRUSTED_PROVIDER_SOURCES)[number];

const TRUSTED = new Set<string>(RETENTION_TRUSTED_PROVIDER_SOURCES);

const UNTRUSTED = Object.freeze({
  user: Object.freeze({
    provenance: "manual_user",
    verification: "unverified",
    permittedFactualUse: false,
    forbidden: false,
  }),
  manual: Object.freeze({
    provenance: "manual_user",
    verification: "unverified",
    permittedFactualUse: false,
    forbidden: false,
  }),
  inferred: Object.freeze({
    provenance: "inferred",
    verification: "unverified",
    permittedFactualUse: false,
    forbidden: false,
  }),
  assembly: Object.freeze({
    provenance: "inferred",
    verification: "unverified",
    permittedFactualUse: false,
    forbidden: false,
  }),
  fallback: Object.freeze({
    provenance: "unknown",
    verification: "unverified",
    permittedFactualUse: false,
    forbidden: false,
  }),
} as const satisfies Record<string, RetentionSourceAuthorityMapping>);

const UNKNOWN: RetentionSourceAuthorityMapping = Object.freeze({
  provenance: "unknown",
  verification: "unverified",
  permittedFactualUse: false,
  forbidden: false,
});

const TRUSTED_GRAPH: RetentionSourceAuthorityMapping = Object.freeze({
  provenance: "research_graph",
  verification: "verified",
  permittedFactualUse: true,
  forbidden: false,
});

const TRUSTED_ASSEMBLED: RetentionSourceAuthorityMapping = Object.freeze({
  provenance: "research_provider",
  verification: "verified",
  permittedFactualUse: true,
  forbidden: false,
});

export function isRetentionTrustedProviderSource(
  source: string | null | undefined,
): source is RetentionTrustedProviderSource {
  return typeof source === "string" && TRUSTED.has(source);
}

/**
 * Map a raw research/provenance source string to Retention claim authority.
 * Channel selects research_graph vs research_provider for trusted providers.
 * Always returns a frozen mapping; callers cannot mutate shared authority results.
 */
export function mapRetentionSourceToAuthority(
  source: string | null | undefined,
  channel: RetentionSourceTrustChannel,
): RetentionSourceAuthorityMapping {
  if (source == null || source === "") {
    return UNKNOWN;
  }

  if (TRUSTED.has(source)) {
    return channel === "graph" ? TRUSTED_GRAPH : TRUSTED_ASSEMBLED;
  }

  if (Object.prototype.hasOwnProperty.call(UNTRUSTED, source)) {
    return UNTRUSTED[source as keyof typeof UNTRUSTED];
  }

  return UNKNOWN;
}
