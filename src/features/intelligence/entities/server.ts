import "server-only";

export {
  resolveCompetition,
  resolveCountry,
  resolvePlayer,
  resolveSeason,
  resolveTeam,
} from "./entity-api-football.resolver";
export {
  EntityCache,
  buildEntityResolutionCacheKey,
  getEntityCache,
  isEntityCacheEntryValid,
  resetEntityCache,
} from "./entity-cache";
export { resolveWithEntityCache } from "./entity-cache-resolver.utils";
export { DEFAULT_ENTITY_CACHE_TTL_MS } from "./entity-cache.types";
export type {
  EntityCacheEntry,
  EntityCacheGetInput,
  EntityCacheSetInput,
} from "./entity-cache.types";
export type {
  EntityProviderResolution,
  EntityProviderResolutionKind,
  EntityResolveOptions,
  ScoredResolvedEntity,
} from "./entity-provider.types";
export {
  DEFAULT_AMBIGUITY_GAP,
  DEFAULT_MIN_RESOLVE_PERCENT,
} from "./entity-provider.types";
