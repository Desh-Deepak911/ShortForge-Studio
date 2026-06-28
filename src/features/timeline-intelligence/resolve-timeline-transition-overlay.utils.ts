import type { FootieScene, TransitionEffect } from "@/features/story/types";
import { normalizeTransitionEffect } from "@/features/story/utils/timeline.utils";

import { resolveTransitionState } from "./resolve-transition-state.utils";
import type { TransitionState } from "./resolve-transition-state.utils";
import type { MasterTimeline, TransitionTimelineEvent } from "./timeline.types";
import { getActiveTransitionAtTime } from "./timeline-playback.utils";

/** Active transition overlay resolved from MasterTimeline absolute time. */
export interface TimelineTransitionOverlay {
  event: TransitionTimelineEvent;
  fromScene: FootieScene;
  toScene: FootieScene;
  fromSceneIndex: number;
  toSceneIndex: number;
  effect: TransitionEffect;
  progress: number;
  transitionState: TransitionState;
}

/** Resolves preview/export transition overlay from a timeline event and absolute time. */
export function resolveTimelineTransitionOverlay(
  masterTimeline: MasterTimeline,
  scenes: FootieScene[],
  timeMs: number,
): TimelineTransitionOverlay | null {
  const active = getActiveTransitionAtTime(masterTimeline, timeMs);
  if (!active) {
    return null;
  }

  const transitionState = resolveTransitionState(active.event, timeMs);
  if (!transitionState.isActive || !transitionState.shouldRenderBothScenes) {
    return null;
  }

  const meta = active.event.metadata;
  const fromScene =
    scenes[meta.fromSceneIndex] ?? scenes.find((scene) => scene.id === meta.fromSceneId);
  const toScene =
    scenes[meta.toSceneIndex] ?? scenes.find((scene) => scene.id === meta.toSceneId);

  if (!fromScene || !toScene) {
    return null;
  }

  const effect = normalizeTransitionEffect(meta.transitionType ?? meta.effect);

  return {
    event: active.event,
    fromScene,
    toScene,
    fromSceneIndex: meta.fromSceneIndex,
    toSceneIndex: meta.toSceneIndex,
    effect,
    progress: transitionState.progress,
    transitionState,
  };
}
