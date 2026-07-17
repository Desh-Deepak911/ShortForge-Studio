/**
 * Pure boundary-drag session machine.
 * Pointer-up commits only while status is "dragging".
 * Cancellation clears preview intent; late pointer-up cannot commit.
 */

import {
  releaseMediaBoundaryOwner,
  tryAcquireMediaBoundaryOwner,
  type MediaBoundaryOwnerSceneId,
} from "./media-boundary-owner.lock";

export type BoundaryInteractionStatus = "idle" | "dragging" | "cancelled";

export interface BoundaryInteractionState {
  status: BoundaryInteractionStatus;
  ownerSceneId: string | null;
  leftIndex: number;
  startClientX: number;
  trackWidthPx: number;
  sceneDurationMs: number;
  /** Preview delta only — never persisted until pointer-up commit. */
  previewDeltaMs: number | null;
}

export function createIdleBoundaryInteraction(): BoundaryInteractionState {
  return {
    status: "idle",
    ownerSceneId: null,
    leftIndex: 0,
    startClientX: 0,
    trackWidthPx: 0,
    sceneDurationMs: 0,
    previewDeltaMs: null,
  };
}

export function resolveBoundaryDeltaMs(
  state: Pick<BoundaryInteractionState, "startClientX" | "trackWidthPx" | "sceneDurationMs">,
  clientX: number,
): number {
  if (!(state.trackWidthPx > 0) || !(state.sceneDurationMs > 0)) {
    return 0;
  }
  const deltaPx = clientX - state.startClientX;
  return Math.round((deltaPx / state.trackWidthPx) * state.sceneDurationMs);
}

export function beginBoundaryInteraction(
  state: BoundaryInteractionState,
  globalOwner: MediaBoundaryOwnerSceneId,
  input: {
    sceneId: string;
    leftIndex: number;
    startClientX: number;
    trackWidthPx: number;
    sceneDurationMs: number;
  },
): {
  state: BoundaryInteractionState;
  acquired: boolean;
  nextGlobalOwner: MediaBoundaryOwnerSceneId;
} {
  if (state.status === "dragging") {
    return { state, acquired: false, nextGlobalOwner: globalOwner };
  }
  if (!(input.trackWidthPx > 0)) {
    return { state, acquired: false, nextGlobalOwner: globalOwner };
  }

  const acquire = tryAcquireMediaBoundaryOwner(globalOwner, input.sceneId);
  if (!acquire.ok) {
    return { state, acquired: false, nextGlobalOwner: globalOwner };
  }

  return {
    acquired: true,
    nextGlobalOwner: acquire.owner,
    state: {
      status: "dragging",
      ownerSceneId: acquire.owner,
      leftIndex: input.leftIndex,
      startClientX: input.startClientX,
      trackWidthPx: input.trackWidthPx,
      sceneDurationMs: input.sceneDurationMs,
      previewDeltaMs: 0,
    },
  };
}

export function previewBoundaryInteraction(
  state: BoundaryInteractionState,
  clientX: number,
): BoundaryInteractionState {
  if (state.status !== "dragging") {
    return state;
  }
  return {
    ...state,
    previewDeltaMs: resolveBoundaryDeltaMs(state, clientX),
  };
}

function clearToIdle(ownerSceneId: string | null): BoundaryInteractionState {
  return {
    ...createIdleBoundaryInteraction(),
    // Keep cancelled marker via status when needed by callers.
    ownerSceneId,
  };
}

export function cancelBoundaryInteraction(
  state: BoundaryInteractionState,
  globalOwner: MediaBoundaryOwnerSceneId,
): {
  state: BoundaryInteractionState;
  nextGlobalOwner: MediaBoundaryOwnerSceneId;
  didCancel: boolean;
} {
  if (state.status !== "dragging" || !state.ownerSceneId) {
    return { state: createIdleBoundaryInteraction(), nextGlobalOwner: globalOwner, didCancel: false };
  }
  const nextGlobalOwner = releaseMediaBoundaryOwner(globalOwner, state.ownerSceneId);
  return {
    didCancel: true,
    nextGlobalOwner,
    state: {
      ...clearToIdle(null),
      status: "cancelled",
    },
  };
}

/**
 * Cancels without commit when the selected scene is no longer the owner.
 */
export function cancelBoundaryInteractionOnSceneChange(
  state: BoundaryInteractionState,
  globalOwner: MediaBoundaryOwnerSceneId,
  selectedSceneId: string | null,
): {
  state: BoundaryInteractionState;
  nextGlobalOwner: MediaBoundaryOwnerSceneId;
  didCancel: boolean;
} {
  if (state.status !== "dragging" || !state.ownerSceneId) {
    return { state, nextGlobalOwner: globalOwner, didCancel: false };
  }
  if (selectedSceneId === state.ownerSceneId) {
    return { state, nextGlobalOwner: globalOwner, didCancel: false };
  }
  return cancelBoundaryInteraction(state, globalOwner);
}

/**
 * Pointer-up is the only pointer path that may commit.
 * Commit requires the local session to still own the global lock:
 *   status === "dragging" && ownerSceneId != null && globalOwner === ownerSceneId
 * If ownership was already released or transferred: no commit, clear stale
 * local session, leave global owner untouched.
 */
export function pointerUpBoundaryInteraction(
  state: BoundaryInteractionState,
  globalOwner: MediaBoundaryOwnerSceneId,
  clientX: number,
): {
  state: BoundaryInteractionState;
  nextGlobalOwner: MediaBoundaryOwnerSceneId;
  shouldCommit: boolean;
  deltaMs: number;
  ownerSceneId: string | null;
  leftIndex: number;
} {
  const ownsGlobalLock =
    state.status === "dragging" &&
    state.ownerSceneId != null &&
    globalOwner === state.ownerSceneId;

  if (!ownsGlobalLock) {
    return {
      state: createIdleBoundaryInteraction(),
      nextGlobalOwner: globalOwner,
      shouldCommit: false,
      deltaMs: 0,
      ownerSceneId: null,
      leftIndex: 0,
    };
  }

  const deltaMs = resolveBoundaryDeltaMs(state, clientX);
  const ownerSceneId = state.ownerSceneId!;
  const leftIndex = state.leftIndex;
  const nextGlobalOwner = releaseMediaBoundaryOwner(globalOwner, ownerSceneId);

  return {
    state: createIdleBoundaryInteraction(),
    nextGlobalOwner,
    shouldCommit: true,
    deltaMs,
    ownerSceneId,
    leftIndex,
  };
}
