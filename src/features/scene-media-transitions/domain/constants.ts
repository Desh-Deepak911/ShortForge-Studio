import type { TransitionEffect } from "@/features/story/types";
import {
  TRANSITION_DURATION_OPTIONS,
  TRANSITION_VISUAL_EFFECTS,
} from "@/features/story/utils/transition-vocabulary";

/** Supported non-Cut effects — alias of the shared visual vocabulary. */
export const INTRA_SCENE_TRANSITION_EFFECTS: readonly TransitionEffect[] =
  TRANSITION_VISUAL_EFFECTS;

/** Canonical duration registry (shared with scene-to-scene). */
export const INTRA_SCENE_TRANSITION_DURATION_OPTIONS = TRANSITION_DURATION_OPTIONS;

/** Max fraction of either adjacent window an overlay may occupy. */
export const INTRA_SCENE_TRANSITION_WINDOW_FRACTION = 0.4;

export type IntraSceneTransitionDiagnosticCode =
  | "invalid_track_shape"
  | "unsupported_version"
  | "invalid_boundaries_array"
  | "empty_item_id"
  | "same_from_to"
  | "unknown_item_id"
  | "non_adjacent_pair"
  | "reversed_or_unordered_pair"
  | "unsupported_effect"
  | "unsupported_duration"
  | "duplicate_pair"
  | "cut_not_persisted";

export interface IntraSceneTransitionDiagnostic {
  readonly code: IntraSceneTransitionDiagnosticCode;
  readonly message: string;
  readonly fromItemId?: string;
  readonly toItemId?: string;
  readonly boundaryIndex?: number;
}
