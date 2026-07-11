/** How block widths were derived for the current timeline view. */
export type TimelineLayoutSource = "master-timeline" | "equal-fallback";

/** View model for one duration-proportional scene block. */
export interface TimelineSceneBlockVM {
  sceneId: string;
  sceneIndex: number;
  sceneNumber: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  /** Share of total timeline width (0–100). */
  widthPercent: number;
  durationLabelSec: number;
}

/** View model for a transition marker between two scene blocks. */
export interface TimelineTransitionMarkerVM {
  id: string;
  fromSceneId: string;
  toSceneId: string;
  afterSceneIndex: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  transitionType?: string;
}

export type TimelineLayoutSegment =
  | { type: "scene"; block: TimelineSceneBlockVM }
  | { type: "transition"; marker: TimelineTransitionMarkerVM };

/** Derived timeline strip layout — presentation only. */
export interface TimelineLayoutVM {
  segments: TimelineLayoutSegment[];
  totalDurationMs: number;
  layoutSource: TimelineLayoutSource;
  devWarning?: string;
}

/** Local-only drag reorder state — never persisted. */
export interface TimelineDragState {
  draggedSceneId: string;
  sourceIndex: number;
  hoverTargetIndex: number;
  previewSceneIds: string[];
}

/** Local-only right-edge duration resize state — never persisted. */
export interface TimelineResizeState {
  sceneId: string;
  startDurationMs: number;
  startClientX: number;
  railWidthPx: number;
  totalDurationMs: number;
  /** Live preview duration in whole seconds (snapped/clamped). */
  previewDurationSec: number;
}

/** Local-only video clip trim session — never persisted; does not affect scene duration. */
export interface TimelineVideoTrimState {
  sceneId: string;
  activeHandle: "start" | "end";
  pointerId: number;
  sourceDurationMs: number;
  committedTrimStartMs: number;
  committedTrimEndMs: number;
  previewTrimStartMs: number;
  previewTrimEndMs: number;
  stripLeftPx: number;
  stripWidthPx: number;
  pointerStartX: number;
  isActive: boolean;
  /** Media URL snapshot at session start — used to cancel on replace/remove. */
  mediaUrl: string;
}
