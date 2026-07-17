import type { TransitionEffect } from "@/features/story/types";
import { getTransitionEffectLabel } from "@/features/story/utils/transition-vocabulary";

export function formatMediaTransitionPairLabel(
  fromIndex: number,
  toIndex: number,
): string {
  return `Media ${fromIndex + 1} → Media ${toIndex + 1}`;
}

export function formatMediaTransitionEffectChip(effect: TransitionEffect): string {
  if (effect === "cut") {
    return "Cut";
  }
  return getTransitionEffectLabel(effect);
}

export function formatMediaTransitionAffordanceLabel(
  fromIndex: number,
  toIndex: number,
  effect?: TransitionEffect,
): string {
  const base = `Transition between Media ${fromIndex + 1} and Media ${toIndex + 1}`;
  if (effect == null) {
    return base;
  }
  return `${base}: ${formatMediaTransitionEffectChip(effect)}`;
}

/** Truthful editor notice — Preview and Export both compose intra-scene transitions. */
export const INTRA_SCENE_TRANSITION_EDITOR_NOTICE =
  "Intra-scene transitions play in Preview and Export.";

export const INTRA_SCENE_TRANSITION_SINGLE_ITEM_GUIDANCE =
  "Add another image to create an intra-scene transition.";

export const INTRA_SCENE_TRANSITION_MULTI_ITEM_GUIDANCE =
  "Choose Cut or an effect between media items to edit the transition.";
