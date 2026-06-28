import type { EntityProviderResolution } from "./entity-provider.types";
import type { EntityResolveOptions } from "./entity-provider.types";
import { getEntityCache, isEntityCacheEntryValid, type EntityCache } from "./entity-cache";
import type { EntityProviderResolutionKind } from "./entity-provider.types";

export interface ResolveWithEntityCacheInput {
  kind: EntityProviderResolutionKind;
  query: string;
  scope?: string;
  cache?: EntityCache;
  skipCache?: boolean;
  cacheTtlMs?: number;
  resolve: () => Promise<EntityProviderResolution>;
}

function resolutionFromCache(
  cached: ReturnType<EntityCache["getResolution"]>,
  query: string,
  kind: EntityProviderResolutionKind,
): EntityProviderResolution {
  const entry = cached!;
  const remainingMs = entry.ttlMs - (Date.now() - entry.timestamp);
  const remainingMinutes = Math.max(1, Math.round(remainingMs / 60_000));

  return {
    query,
    kind,
    resolved: entry.resolved,
    candidates: [entry.resolved],
    confidence: entry.resolved.confidence,
    ambiguous: false,
    providerAvailable: true,
    reasoning: `Served from in-memory entity cache (provider: ${entry.provider}, expires in ~${remainingMinutes} min).`,
  };
}

/**
 * Read cache first, fallback to provider lookup, then update cache on success.
 * Only resolved entities are cached — ambiguous or low-confidence results are not stored.
 */
export async function resolveWithEntityCache(
  input: ResolveWithEntityCacheInput,
): Promise<EntityProviderResolution> {
  const cache = input.cache ?? getEntityCache();

  if (!input.skipCache) {
    const cached = cache.getResolution({
      kind: input.kind,
      query: input.query,
      scope: input.scope,
    });

    if (cached && isEntityCacheEntryValid(cached)) {
      return resolutionFromCache(cached, input.query, input.kind);
    }
  }

  const result = await input.resolve();

  if (result.resolved) {
    cache.setResolution({
      kind: input.kind,
      query: input.query,
      scope: input.scope,
      resolved: result.resolved,
      provider: result.resolved.provider,
      ttlMs: input.cacheTtlMs,
    });
  }

  return result;
}

export function cacheScopeFromOptions(
  kind: EntityProviderResolutionKind,
  options?: EntityResolveOptions,
): string | undefined {
  if (kind === "team" && options?.entityType) {
    return options.entityType;
  }

  if (kind === "season" && options?.seasonYear != null) {
    return String(options.seasonYear);
  }

  return undefined;
}
