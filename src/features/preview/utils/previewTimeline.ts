import {
  resolveTransitionEffectLayers,
  transitionStateToPreviewLayerStyles,
  type TransitionPreviewLayerStyles,
} from "@/features/timeline-intelligence/resolve-transition-state.utils";
import {
  ensureTimelineItems,
  getActiveSceneAtTime,
  getTransitionsFromTimeline,
} from "@/features/story/utils";
import type {
  FootieScene,
  TimelineItem,
  TransitionEffect,
  TransitionTimelineItem,
} from "@/features/story/types";

export type PreviewSceneFrame = {
  kind: "scene";
  scene: FootieScene;
  sceneIndex: number;
};

export type PreviewTransitionFrame = {
  kind: "transition";
  transition: TransitionTimelineItem;
  fromScene: FootieScene;
  toScene: FootieScene;
  fromSceneIndex: number;
  toSceneIndex: number;
  progress: number;
};

export type PreviewFrame = PreviewSceneFrame | PreviewTransitionFrame;

export type TransitionLayerStyles = TransitionPreviewLayerStyles;

/** Finds the transition item between two adjacent scenes, if present. */
export function getTransitionBetweenScenes(
  timelineItems: TimelineItem[],
  fromSceneId: string,
  toSceneId: string,
): TransitionTimelineItem | undefined {
  return getTransitionsFromTimeline(timelineItems).find(
    (item) => item.fromSceneId === fromSceneId && item.toSceneId === toSceneId,
  );
}

/**
 * Resolves the preview frame at a given time (seconds).
 * Scene timing map is the only playback authority — transition items are overlay
 * metadata and never become their own preview segment.
 */
export function getPreviewFrameAtTime(
  _timelineItems: TimelineItem[],
  scenes: FootieScene[],
  timeSec: number,
): PreviewSceneFrame {

  if (scenes.length === 0) {
    throw new Error("Cannot resolve preview frame without scenes");
  }

  const activeSlot = getActiveSceneAtTime(scenes, timeSec * 1000);
  const sceneIndex = activeSlot?.index ?? 0;
  const scene = scenes[sceneIndex] ?? scenes[0]!;

  return {
    kind: "scene",
    scene,
    sceneIndex: scenes[sceneIndex] ? sceneIndex : 0,
  };
}

/** CSS styles for from/to layers during a transition preview. */
export function getTransitionLayerStyles(
  effect: TransitionEffect,
  progress: number,
): TransitionLayerStyles {
  const layers = resolveTransitionEffectLayers(effect, progress);
  return transitionStateToPreviewLayerStyles(effect, {
    opacityFrom: layers.opacityFrom,
    opacityTo: layers.opacityTo,
    transformFrom: layers.transformFrom,
    transformTo: layers.transformTo,
    progress,
  });
}

/** Runs a transition animation; returns a cancel function. */
export function animateTransitionProgress(
  durationMs: number,
  onProgress: (progress: number) => void,
  onComplete: () => void,
): () => void {
  if (durationMs <= 0) {
    onProgress(1);
    onComplete();
    return () => {};
  }

  const start = performance.now();
  let frameId = 0;

  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / durationMs);
    onProgress(progress);

    if (progress < 1) {
      frameId = requestAnimationFrame(tick);
    } else {
      onComplete();
    }
  };

  frameId = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frameId);
  };
}

/** Builds a transition frame for manual/browser playback between two scenes. */
export function buildTransitionFrame(
  timelineItems: TimelineItem[],
  scenes: FootieScene[],
  fromSceneIndex: number,
  toSceneIndex: number,
  progress: number,
): PreviewFrame {
  const fromScene = scenes[fromSceneIndex];
  const toScene = scenes[toSceneIndex];
  const transition = getTransitionBetweenScenes(timelineItems, fromScene.id, toScene.id);

  if (!transition) {
    return { kind: "scene", scene: toScene, sceneIndex: toSceneIndex };
  }

  return {
    kind: "transition",
    transition,
    fromScene,
    toScene,
    fromSceneIndex,
    toSceneIndex,
    progress,
  };
}

/** Ensures a valid timeline, upgrading legacy scene-only stories when needed. */
export function resolveTimelineItems(
  timelineItems: TimelineItem[] | undefined,
  scenes: FootieScene[],
): TimelineItem[] {
  return ensureTimelineItems(scenes, timelineItems);
}

export function isPreviewTransitionFrame(frame: PreviewFrame): frame is PreviewTransitionFrame {
  return frame.kind === "transition";
}
