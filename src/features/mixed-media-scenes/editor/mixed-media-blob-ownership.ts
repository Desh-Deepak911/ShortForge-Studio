/**
 * Pure helpers for mixed-media upload session ownership tests and callers.
 * Policy matches Sprint 8B: revoke only owned blob URLs on failed append or
 * explicit owned-item removal — never on unmount.
 *
 * Draft JSON may still store blob: URLs; binary rehydration after reload is an
 * existing limitation and is intentionally out of scope for this capability.
 */

import {
  isOwnedBlobUrl,
  revokeOwnedBlobUrlIfPresent,
  shouldRevokeOnOwnerUnmount,
} from "@/features/timeline-editor/scene-media/blob-url-ownership";

export {
  isOwnedBlobUrl,
  revokeOwnedBlobUrlIfPresent,
  shouldRevokeOnOwnerUnmount,
};

/** Tracks a newly created object URL in the session ownership set. */
export function trackOwnedObjectUrl(
  url: string,
  owned: Set<string>,
): void {
  if (url.startsWith("blob:")) {
    owned.add(url);
  }
}

/**
 * Revokes a URL created for an append that failed before the scene accepted it.
 * No-op for external / unowned URLs.
 */
export function revokeFailedAppendObjectUrl(
  url: string | undefined,
  owned: Set<string>,
): boolean {
  return revokeOwnedBlobUrlIfPresent(url, owned);
}

/**
 * Revokes an owned media URL after explicit item removal.
 * Never revokes asset-library or duplicated-scene URLs that were not tracked.
 */
export function revokeRemovedOwnedMediaUrl(
  url: string | undefined,
  owned: Set<string>,
): boolean {
  return revokeOwnedBlobUrlIfPresent(url, owned);
}
