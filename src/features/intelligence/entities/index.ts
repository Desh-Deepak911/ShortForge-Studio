export {
  applyProviderEnrichmentToOwners,
  createOwnedEntity,
  createOwnedEntityId,
  createProviderEntityEnrichment,
  ensureOwnedEntities,
  ensureOwnedEntity,
  enrichOwnedEntity,
  findMatchingOwnedEntityForHint,
} from "./entity-ownership.utils";
export { resolveEntities } from "./entity-resolver";
export {
  extractEntityCandidates,
  extractEntityCandidatesWithMeta,
} from "./entity-extractor";
export {
  EntityCache,
  buildEntityResolutionCacheKey,
  getEntityCache,
  isEntityCacheEntryValid,
  resetEntityCache,
} from "./entity-cache";
export type {
  EntityCacheEntry,
  EntityCacheGetInput,
  EntityCacheSetInput,
} from "./entity-cache.types";
export { DEFAULT_ENTITY_CACHE_TTL_MS } from "./entity-cache.types";
export {
  buildEntityCacheKey,
  createEmptyEntityResolution,
  createEntityCandidate,
  createEntityConfidence,
  createResolvedEntity,
  formatEntityTypeLabel,
  isEntityType,
  mergeEntityResolutionText,
  normalizeEntityName,
  normalizeEntityText,
} from "./entity-utils";
export type {
  EntityCandidate,
  EntityConfidence,
  EntityMetadata,
  EntityProvider,
  EntityRecord,
  EntityResolution,
  EntityResolverInput,
  EntityType,
  ResolvedEntity,
} from "./entity-types";
export { ENTITY_TYPES } from "./entity-types";
export type {
  EntityResearchHints,
  ResolvedEntitiesPayload,
  ResolvedEntityPreviewField,
} from "./entity-research-hints.types";

/** @deprecated Use `EntityType` from `./entity-types`. */
export type { EntityType as EntityKind } from "./entity-types";

/** @deprecated Use `ResolvedEntity` from `./entity-types`. */
export type { ResolvedEntity as EntityReference } from "./entity-types";

/** @deprecated Use `EntityResolution` from `./entity-types`. */
export type { EntityResolution as EntityResolutionResult } from "./entity-types";
