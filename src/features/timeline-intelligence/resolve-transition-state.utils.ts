import type { TransitionEffect } from "@/features/story/types";
import { normalizeTransitionEffect } from "@/features/story/utils/timeline.utils";

import type { TransitionTimelineEvent } from "./timeline.types";
import { getTimelineProgress } from "./timeline-playback.utils";

export interface TransitionEffectLayers {
  opacityFrom: number;
  opacityTo: number;
  transformFrom: string;
  transformTo: string;
  shouldRenderBothScenes: boolean;
}

export interface TransitionState extends TransitionEffectLayers {
  isActive: boolean;
  /** Linear progress through the transition event window (0–1). */
  progress: number;
}

const INACTIVE_TRANSITION_STATE: TransitionState = {
  isActive: false,
  progress: 0,
  opacityFrom: 1,
  opacityTo: 0,
  transformFrom: "none",
  transformTo: "none",
  shouldRenderBothScenes: false,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function withBothScenes(
  layers: Omit<TransitionEffectLayers, "shouldRenderBothScenes">,
  progress: number,
): TransitionEffectLayers {
  return {
    ...layers,
    shouldRenderBothScenes: progress > 0 || layers.opacityTo > 0,
  };
}

/** Shared preview/export transition layer math for one effect and progress value. */
export function resolveTransitionEffectLayers(
  effect: TransitionEffect,
  progress: number,
): TransitionEffectLayers {
  const transitionType = normalizeTransitionEffect(effect);
  const p = clamp01(progress);

  switch (transitionType) {
    case "cut":
      return {
        opacityFrom: 0,
        opacityTo: 1,
        transformFrom: "none",
        transformTo: "none",
        shouldRenderBothScenes: true,
      };
    case "fade":
      return withBothScenes(
        {
          opacityFrom: 1 - p,
          opacityTo: p,
          transformFrom: "none",
          transformTo: "none",
        },
        p,
      );
    case "slide-left":
      return withBothScenes(
        {
          opacityFrom: 1,
          opacityTo: 1,
          transformFrom: `translateX(${-p * 100}%)`,
          transformTo: `translateX(${(1 - p) * 100}%)`,
        },
        p,
      );
    case "slide-right":
      return withBothScenes(
        {
          opacityFrom: 1,
          opacityTo: 1,
          transformFrom: `translateX(${p * 100}%)`,
          transformTo: `translateX(${-(1 - p) * 100}%)`,
        },
        p,
      );
    case "zoom-in":
      return withBothScenes(
        {
          opacityFrom: 1 - p,
          opacityTo: p,
          transformFrom: "none",
          transformTo: `scale(${1.08 - p * 0.08})`,
        },
        p,
      );
    case "zoom-out":
      return withBothScenes(
        {
          opacityFrom: 1 - p,
          opacityTo: p,
          transformFrom: `scale(${1 - p * 0.08})`,
          transformTo: "none",
        },
        p,
      );
    case "blur":
      return withBothScenes(
        {
          opacityFrom: 1 - p * 0.25,
          opacityTo: p,
          transformFrom: "none",
          transformTo: "none",
        },
        p,
      );
    default:
      return withBothScenes(
        {
          opacityFrom: 1 - p,
          opacityTo: p,
          transformFrom: "none",
          transformTo: "none",
        },
        p,
      );
  }
}

/** Resolves preview/export transition compositing state from a timeline event and absolute time. */
export function resolveTransitionState(
  event: TransitionTimelineEvent,
  timeMs: number,
): TransitionState {
  const timelineProgress = getTimelineProgress(event, timeMs);

  if (!timelineProgress.isWithinWindow) {
    return {
      ...INACTIVE_TRANSITION_STATE,
      progress: timelineProgress.progress,
    };
  }

  const transitionType = normalizeTransitionEffect(
    event.metadata.transitionType ?? event.metadata.effect,
  );
  let progress = timelineProgress.progress;

  if (transitionType === "cut") {
    progress = 1;
  }

  const layers = resolveTransitionEffectLayers(transitionType, progress);

  return {
    isActive: true,
    progress,
    ...layers,
    shouldRenderBothScenes: true,
  };
}

export interface TransitionPreviewLayerStyle {
  opacity?: number;
  transform?: string;
  filter?: string;
  zIndex?: number;
}

export interface TransitionPreviewLayerStyles {
  from: TransitionPreviewLayerStyle;
  to: TransitionPreviewLayerStyle;
}

/** Maps shared transition state to preview CSS layer styles. */
export function transitionStateToPreviewLayerStyles(
  effect: TransitionEffect,
  state: Pick<
    TransitionState,
    "opacityFrom" | "opacityTo" | "transformFrom" | "transformTo" | "progress"
  >,
): TransitionPreviewLayerStyles {
  const filters = resolveTransitionPreviewFilters(effect, state.progress);

  return {
    from: {
      opacity: state.opacityFrom,
      ...(state.transformFrom !== "none" ? { transform: state.transformFrom } : {}),
      ...(filters.filterFrom ? { filter: filters.filterFrom } : {}),
      zIndex: 1,
    },
    to: {
      opacity: state.opacityTo,
      ...(state.transformTo !== "none" ? { transform: state.transformTo } : {}),
      ...(filters.filterTo ? { filter: filters.filterTo } : {}),
      zIndex: 2,
    },
  };
}

/** Optional CSS blur filters for preview — not part of canvas transform parity. */
export function resolveTransitionPreviewFilters(
  effect: TransitionEffect,
  progress: number,
): { filterFrom?: string; filterTo?: string } {
  const transitionType = normalizeTransitionEffect(effect);
  const p = clamp01(progress);

  if (transitionType !== "blur") {
    return {};
  }

  return {
    filterFrom: `blur(${p * 8}px)`,
    filterTo: `blur(${(1 - p) * 8}px)`,
  };
}
