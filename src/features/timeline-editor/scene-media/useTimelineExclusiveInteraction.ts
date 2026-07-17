"use client";

import { useSyncExternalStore } from "react";

import {
  getTimelineExclusiveInteractionSnapshot,
  isTimelineExclusiveInteractionActive,
  subscribeTimelineExclusiveInteraction,
} from "./timeline-exclusive-interaction.lock";

/** Stable server snapshot — timeline exclusivity is client-only. */
function getServerExclusiveLockedSnapshot(): boolean {
  return false;
}

function getClientExclusiveLockedSnapshot(): boolean {
  return getTimelineExclusiveInteractionSnapshot() != null;
}

/**
 * Reactive exclusive-interaction lock for Inspector controls.
 * Re-renders when the global timeline owner changes.
 */
export function useTimelineExclusiveInteractionLocked(): boolean {
  return useSyncExternalStore(
    subscribeTimelineExclusiveInteraction,
    getClientExclusiveLockedSnapshot,
    getServerExclusiveLockedSnapshot,
  );
}

export { isTimelineExclusiveInteractionActive };
