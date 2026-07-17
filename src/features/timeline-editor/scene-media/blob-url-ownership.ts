/**
 * Pure blob-URL ownership helpers for multi-image upload sessions.
 * Only URLs tracked in the owned set may be revoked.
 *
 * Sprint 8B policy: revoke only on failed append or explicit owned-item removal.
 * Do not revoke on lane/hook unmount — the same blob URL may still be referenced
 * by a duplicated scene. Browser reclaim handles document teardown; a future
 * story-level resource manager may add reference-counted cleanup.
 */

export function isOwnedBlobUrl(
  url: string | undefined,
  owned: ReadonlySet<string>,
): boolean {
  return Boolean(url && url.startsWith("blob:") && owned.has(url));
}

/**
 * Revokes `url` only when it is a blob: URL present in `owned`.
 * Mutates `owned` by deleting the revoked entry.
 * Returns true when a revoke occurred.
 */
export function revokeOwnedBlobUrlIfPresent(
  url: string | undefined,
  owned: Set<string>,
): boolean {
  if (!isOwnedBlobUrl(url, owned) || !url) {
    return false;
  }
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
  }
  owned.delete(url);
  return true;
}

/**
 * Lane/hook unmount must never revoke — URLs may be shared after scene duplication.
 * Always false under the Sprint 8B ownership policy.
 */
export function shouldRevokeOnOwnerUnmount(
  url: string,
  owned: ReadonlySet<string>,
): boolean {
  void url;
  void owned;
  return false;
}
