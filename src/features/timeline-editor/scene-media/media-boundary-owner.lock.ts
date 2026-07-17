/**
 * Pure global owner lock for scene-media boundary interactions.
 * Verifiable without React timing.
 */

export type MediaBoundaryOwnerSceneId = string | null;

export function isMediaBoundaryGlobalLockActive(
  ownerSceneId: MediaBoundaryOwnerSceneId,
): boolean {
  return ownerSceneId != null;
}

/** True when this lane must not start or continue a new boundary interaction. */
export function isMediaBoundaryLaneLocked(
  ownerSceneId: MediaBoundaryOwnerSceneId,
  laneSceneId: string,
): boolean {
  return ownerSceneId != null && ownerSceneId !== laneSceneId;
}

/**
 * Acquire ownership for `sceneId`.
 * Rejects when another scene already owns the lock.
 * Re-acquiring the same owner is allowed (idempotent).
 */
export function tryAcquireMediaBoundaryOwner(
  currentOwner: MediaBoundaryOwnerSceneId,
  sceneId: string,
): { ok: true; owner: string } | { ok: false; owner: MediaBoundaryOwnerSceneId } {
  const trimmed = sceneId.trim();
  if (!trimmed) {
    return { ok: false, owner: currentOwner };
  }
  if (currentOwner != null && currentOwner !== trimmed) {
    return { ok: false, owner: currentOwner };
  }
  return { ok: true, owner: trimmed };
}

/**
 * Release ownership only when the caller still owns it.
 * A stale lane must not clear a newer owner's lock.
 */
export function releaseMediaBoundaryOwner(
  currentOwner: MediaBoundaryOwnerSceneId,
  sceneId: string,
): MediaBoundaryOwnerSceneId {
  return currentOwner === sceneId ? null : currentOwner;
}
