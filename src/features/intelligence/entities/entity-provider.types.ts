import type { EntityConfidence, EntityType, ResolvedEntity } from "./entity-types";

export type EntityProviderResolutionKind =
  | "player"
  | "team"
  | "competition"
  | "country"
  | "season";

export interface EntityResolveOptions {
  /** Distinguishes club vs national team lookups for `resolveTeam`. */
  entityType?: Extract<EntityType, "club" | "national_team">;
  seasonYear?: number;
  /** When true and no year is in text, fall back to configured season. */
  inferConfiguredSeason?: boolean;
  /** Minimum top-candidate percent required to auto-select `resolved`. */
  minResolvePercent?: number;
  /** Required gap to runner-up when multiple API candidates exist. */
  ambiguityGap?: number;
  /** Skip in-memory cache read/write for this lookup. */
  skipCache?: boolean;
  /** Override the process-local cache instance (testing). */
  cache?: import("./entity-cache").EntityCache;
  /** TTL for a newly cached resolved entity (ms). */
  cacheTtlMs?: number;
}

export interface ScoredResolvedEntity {
  entity: ResolvedEntity;
  score: number;
}

/**
 * Result of a provider lookup — never silently commits low-confidence matches.
 */
export interface EntityProviderResolution {
  query: string;
  kind: EntityProviderResolutionKind;
  /** Set only when confidence rules pass; otherwise undefined. */
  resolved?: ResolvedEntity;
  /** All scored provider candidates, highest score first. */
  candidates: ResolvedEntity[];
  confidence: EntityConfidence;
  reasoning: string;
  ambiguous: boolean;
  providerAvailable: boolean;
}

export const DEFAULT_MIN_RESOLVE_PERCENT = 72;
export const DEFAULT_AMBIGUITY_GAP = 12;
