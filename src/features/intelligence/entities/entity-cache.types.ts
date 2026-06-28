import type { EntityProvider, ResolvedEntity } from "./entity-types";
import type { EntityProviderResolutionKind } from "./entity-provider.types";

/** In-memory cache record for a provider-resolved entity. */
export interface EntityCacheEntry {
  /** Normalized lookup key (`kind` + optional scope + normalized query text). */
  key: string;
  resolved: ResolvedEntity;
  provider: EntityProvider;
  /** Unix epoch ms when the entry was stored. */
  timestamp: number;
  /** Entry lifetime in milliseconds. */
  ttlMs: number;
}

export interface EntityCacheSetInput {
  kind: EntityProviderResolutionKind;
  query: string;
  resolved: ResolvedEntity;
  provider?: EntityProvider;
  ttlMs?: number;
  /** Optional disambiguator (e.g. club vs national team). */
  scope?: string;
}

export interface EntityCacheGetInput {
  kind: EntityProviderResolutionKind;
  query: string;
  scope?: string;
}

/** Default in-memory TTL — not persisted across browser/process restarts. */
export const DEFAULT_ENTITY_CACHE_TTL_MS = 30 * 60 * 1000;
