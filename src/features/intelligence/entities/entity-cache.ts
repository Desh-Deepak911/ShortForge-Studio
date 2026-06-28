import type { EntityType, ResolvedEntity } from "./entity-types";
import type { EntityProviderResolutionKind } from "./entity-provider.types";
import { normalizeEntityName } from "./entity-utils";
import type {
  EntityCacheEntry,
  EntityCacheGetInput,
  EntityCacheSetInput,
} from "./entity-cache.types";
import { DEFAULT_ENTITY_CACHE_TTL_MS } from "./entity-cache.types";

export function buildEntityResolutionCacheKey(
  kind: EntityProviderResolutionKind,
  query: string,
  scope?: string,
): string {
  const normalizedText = normalizeEntityName(query);

  if (!normalizedText) {
    return `${kind}:empty`;
  }

  return scope ? `${kind}:${scope}:${normalizedText}` : `${kind}:${normalizedText}`;
}

export function isEntityCacheEntryValid(
  entry: EntityCacheEntry,
  now = Date.now(),
): boolean {
  return now - entry.timestamp < entry.ttlMs;
}

const RESOLUTION_KINDS = new Set<EntityProviderResolutionKind>([
  "player",
  "team",
  "competition",
  "country",
  "season",
]);

function entityTypeToCacheLookup(
  type: EntityType,
): { kind: EntityProviderResolutionKind; scope?: string } | null {
  if (type === "club" || type === "national_team") {
    return { kind: "team", scope: type };
  }

  if (type === "league") {
    return { kind: "competition" };
  }

  if (RESOLUTION_KINDS.has(type as EntityProviderResolutionKind)) {
    return { kind: type as EntityProviderResolutionKind };
  }

  return null;
}

/**
 * Process-local in-memory entity cache.
 * Entries expire by TTL and are not persisted across sessions or restarts.
 */
export class EntityCache {
  private readonly store = new Map<string, EntityCacheEntry>();

  getEntry(key: string, now = Date.now()): EntityCacheEntry | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }

    if (!isEntityCacheEntryValid(entry, now)) {
      this.store.delete(key);
      return undefined;
    }

    return entry;
  }

  setEntry(entry: EntityCacheEntry): void {
    this.store.set(entry.key, entry);
  }

  getResolution(input: EntityCacheGetInput, now = Date.now()): EntityCacheEntry | undefined {
    const key = buildEntityResolutionCacheKey(input.kind, input.query, input.scope);
    return this.getEntry(key, now);
  }

  setResolution(input: EntityCacheSetInput): EntityCacheEntry {
    const key = buildEntityResolutionCacheKey(input.kind, input.query, input.scope);
    const entry: EntityCacheEntry = {
      key,
      resolved: input.resolved,
      provider: input.provider ?? input.resolved.provider,
      timestamp: Date.now(),
      ttlMs: input.ttlMs ?? DEFAULT_ENTITY_CACHE_TTL_MS,
    };

    this.setEntry(entry);
    return entry;
  }

  delete(kind: EntityProviderResolutionKind, query: string, scope?: string): boolean {
    const key = buildEntityResolutionCacheKey(kind, query, scope);
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  values(): EntityCacheEntry[] {
    const now = Date.now();
    const entries: EntityCacheEntry[] = [];

    for (const entry of this.store.values()) {
      if (isEntityCacheEntryValid(entry, now)) {
        entries.push(entry);
      }
    }

    return entries;
  }

  /** @deprecated Use `getResolution()` — retained for transitional callers. */
  get(type: EntityType, name: string): ResolvedEntity | undefined {
    const lookup = entityTypeToCacheLookup(type);
    if (!lookup) {
      return undefined;
    }

    return this.getResolution({
      kind: lookup.kind,
      query: name,
      scope: lookup.scope,
    })?.resolved;
  }

  /** @deprecated Use `setResolution()` — retained for transitional callers. */
  set(entity: ResolvedEntity): void {
    const lookup = entityTypeToCacheLookup(entity.type);
    if (!lookup) {
      return;
    }

    this.setResolution({
      kind: lookup.kind,
      query: entity.name,
      scope: lookup.scope,
      resolved: entity,
      provider: entity.provider,
    });
  }
}

/** Process-local singleton — cleared on restart; not browser-persisted. */
let defaultEntityCache: EntityCache | null = null;

export function getEntityCache(): EntityCache {
  if (!defaultEntityCache) {
    defaultEntityCache = new EntityCache();
  }

  return defaultEntityCache;
}

export function resetEntityCache(): void {
  defaultEntityCache?.clear();
  defaultEntityCache = null;
}
