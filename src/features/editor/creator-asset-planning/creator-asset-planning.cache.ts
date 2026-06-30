import type {
  CreatorAssetPlanningCache,
  CreatorAssetPlanningCacheEntry,
  CreatorAssetStudioPlanningData,
} from "./creator-asset-planning.types";

const planningCaches = new Map<string, CreatorAssetPlanningCache>();

function clonePlanningData(
  planning: CreatorAssetStudioPlanningData,
): CreatorAssetStudioPlanningData {
  return structuredClone(planning);
}

function cloneCacheEntry(entry: CreatorAssetPlanningCacheEntry): CreatorAssetPlanningCacheEntry {
  return {
    ...entry,
    planning: clonePlanningData(entry.planning),
  };
}

/** Creates or returns the planning cache handle for a story. */
export function createPlanningCache(storyId: string): CreatorAssetPlanningCache {
  const existing = planningCaches.get(storyId);
  if (existing) {
    return existing;
  }

  const created: CreatorAssetPlanningCache = {
    storyId,
    entry: null,
  };
  planningCaches.set(storyId, created);
  return created;
}

/** Stores or replaces cached planning for a story. */
export function updatePlanningCache(
  storyId: string,
  entry: CreatorAssetPlanningCacheEntry,
): CreatorAssetPlanningCache {
  const cache = createPlanningCache(storyId);
  cache.entry = cloneCacheEntry({ ...entry, storyId });
  planningCaches.set(storyId, cache);
  return cache;
}

/** Clears cached planning for a story. */
export function invalidatePlanningCache(storyId: string): void {
  const cache = planningCaches.get(storyId);
  if (!cache) {
    return;
  }

  cache.entry = null;
  planningCaches.set(storyId, cache);
}

/** Returns a cloned cache entry without mutating the stored snapshot. */
export function readPlanningCache(storyId: string): CreatorAssetPlanningCacheEntry | null {
  const entry = planningCaches.get(storyId)?.entry;
  return entry ? cloneCacheEntry(entry) : null;
}

/** Returns cloned planning data for a story when cache metadata still matches. */
export function readPlanningData(
  storyId: string,
  metadata: Pick<CreatorAssetPlanningCacheEntry, "scriptHash" | "sceneCount" | "storyMode">,
): CreatorAssetStudioPlanningData | null {
  const entry = planningCaches.get(storyId)?.entry;
  if (!entry) {
    return null;
  }

  if (
    entry.scriptHash !== metadata.scriptHash ||
    entry.sceneCount !== metadata.sceneCount ||
    entry.storyMode !== metadata.storyMode
  ) {
    return null;
  }

  return clonePlanningData(entry.planning);
}

/** Clears all in-memory planning caches — test helper only. */
export function resetPlanningCachesForTests(): void {
  planningCaches.clear();
}

/** Returns whether a cache entry exists for a story id. */
export function hasPlanningCache(storyId: string): boolean {
  return Boolean(planningCaches.get(storyId)?.entry);
}
