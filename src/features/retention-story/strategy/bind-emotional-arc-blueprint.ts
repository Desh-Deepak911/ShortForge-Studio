/**
 * 10D-facing EmotionalArc binding seam — Sprint 10C / 10C.1.
 *
 * EmotionalArcBlueprint uses semantic phases only. This helper maps those
 * phases onto caller-supplied ordered RetentionBeat IDs. It never invents
 * placeholder beat IDs. Prefer calling this from 10D after beats exist.
 */

import { RetentionStoryError } from "../domain/retention-story-errors";
import { validateEmotionalArcBlueprint } from "./build-emotional-arc-blueprint";
import type {
  EmotionalArc,
  EmotionalArcBlueprint,
  EmotionalArcPhase,
} from "./retention-strategy.types";

const PHASES: readonly EmotionalArcPhase[] = [
  "opening",
  "build",
  "turn",
  "payoff",
];

/**
 * Bind a pre-beat EmotionalArcBlueprint to real ordered beat IDs.
 * Requires at least four distinct non-empty beat IDs from the caller.
 */
export function bindEmotionalArcBlueprintToBeatIds(
  blueprint: unknown,
  orderedBeatIds: readonly string[],
): EmotionalArc {
  const reasons = validateEmotionalArcBlueprint(blueprint);
  if (reasons.length > 0) {
    throw new RetentionStoryError(
      "invalid_emotional_arc_blueprint",
      "Emotional arc blueprint is invalid for beat binding.",
    );
  }

  const valid = blueprint as EmotionalArcBlueprint;

  const ids = orderedBeatIds
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter(Boolean);
  if (ids.length < 4) {
    throw new RetentionStoryError(
      "invalid_emotional_arc_blueprint",
      "Beat binding requires at least four ordered RetentionBeat IDs.",
    );
  }
  if (new Set(ids).size !== ids.length) {
    throw new RetentionStoryError(
      "invalid_emotional_arc_blueprint",
      "Beat binding requires distinct RetentionBeat IDs.",
    );
  }

  const last = ids.length - 1;
  const buildIndex = Math.max(1, Math.floor(last / 3));
  const turnIndex = Math.max(buildIndex + 1, Math.floor((2 * last) / 3));
  const mappedIds = Object.freeze([
    ids[0]!,
    ids[Math.min(buildIndex, last - 2)]!,
    ids[Math.min(turnIndex, last - 1)]!,
    ids[last]!,
  ]);

  if (new Set(mappedIds).size !== 4) {
    throw new RetentionStoryError(
      "invalid_emotional_arc_blueprint",
      "Beat binding could not map four distinct phase beat IDs.",
    );
  }

  const byPhase = new Map(
    valid.curve.map((point) => [point.phase, point] as const),
  );
  const curve = Object.freeze(
    PHASES.map((phase, index) => {
      const point = byPhase.get(phase);
      if (!point) {
        throw new RetentionStoryError(
          "invalid_emotional_arc_blueprint",
          "Emotional arc blueprint is missing a phase for beat binding.",
        );
      }
      return Object.freeze({
        atBeatId: mappedIds[index]!,
        emotion: point.emotion,
        intensity: point.intensity,
      });
    }),
  );

  return Object.freeze({
    primaryEmotion: valid.primaryEmotion,
    ...(valid.secondaryEmotion
      ? { secondaryEmotion: valid.secondaryEmotion }
      : {}),
    curve,
  });
}
