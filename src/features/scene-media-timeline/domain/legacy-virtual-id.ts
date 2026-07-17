/**
 * Deterministic virtual timeline item IDs for legacy single-media scenes.
 * Never random — safe for read normalization and draft loading.
 */

/** Virtual item id for a legacy/single-media scene projection. */
export function buildLegacyVirtualMediaItemId(sceneId: string): string {
  const trimmed = typeof sceneId === "string" ? sceneId.trim() : "";
  const safe = trimmed.length > 0 ? trimmed : "unknown";
  return `legacy-media:${safe}`;
}
