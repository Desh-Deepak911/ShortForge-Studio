/**
 * Observable exclusive pointer interaction lock for the studio timeline.
 * Lets Inspector affordances honor the same mutually exclusive ops as the lane
 * (reorder drag, scene resize, video trim, media-boundary drag).
 *
 * Pure store — no React. Client consumers use useTimelineExclusiveInteractionLocked.
 */

export type TimelineExclusiveInteractionOwner =
  | "reorder"
  | "scene-resize"
  | "video-trim"
  | "media-boundary"
  | null;

type Listener = () => void;

let exclusiveOwner: TimelineExclusiveInteractionOwner = null;
const listeners = new Set<Listener>();

function notifyOwnerChanged(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Current owner snapshot (pure). */
export function getTimelineExclusiveInteractionSnapshot(): TimelineExclusiveInteractionOwner {
  return exclusiveOwner;
}

/** Subscribe to owner changes. Notifies only when the owner value changes. */
export function subscribeTimelineExclusiveInteraction(onStoreChange: Listener): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

/**
 * Set the exclusive owner. No-op (no notification) when unchanged.
 * Passing null clears the lock unconditionally (prefer release* for stale-safe clear).
 */
export function setTimelineExclusiveInteraction(
  owner: TimelineExclusiveInteractionOwner,
): void {
  if (exclusiveOwner === owner) {
    return;
  }
  exclusiveOwner = owner;
  notifyOwnerChanged();
}

/**
 * Release only if `owner` still holds the lock.
 * Stale releases against a newer owner are no-ops.
 */
export function releaseTimelineExclusiveInteraction(
  owner: Exclude<TimelineExclusiveInteractionOwner, null>,
): void {
  if (exclusiveOwner !== owner) {
    return;
  }
  exclusiveOwner = null;
  notifyOwnerChanged();
}

export function getTimelineExclusiveInteraction(): TimelineExclusiveInteractionOwner {
  return exclusiveOwner;
}

export function isTimelineExclusiveInteractionActive(): boolean {
  return exclusiveOwner != null;
}

/** Test helper — clears owner and listeners without asserting stale ownership. */
export function resetTimelineExclusiveInteractionForTests(): void {
  exclusiveOwner = null;
  listeners.clear();
}
