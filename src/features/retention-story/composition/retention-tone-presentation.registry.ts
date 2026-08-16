/**
 * Presentational tone guidance — story-quality Prompt 3.
 * Tone changes language and cadence, never facts, structure, or rankings.
 */

import type { Tone } from "@/types/footiebitz";

export const RETENTION_TONE_PRESENTATION_REGISTRY_VERSION =
  "retention-tone-presentation/1" as const;

export interface RetentionTonePresentationDefinition {
  readonly tone: Tone;
  readonly cadenceGuidance: string;
  readonly languageGuidance: string;
  readonly forbiddenPresentationalMoves: readonly string[];
}

const FORBIDDEN_SHARED = Object.freeze([
  "Do not add unsupported certainty.",
  "Do not add facts, entities, results, or rankings.",
  "Do not change participant identity.",
  "Do not reorder explicit rankings.",
  "Do not replace the selected Script Mode.",
  "Do not introduce exaggerated superlatives without authority.",
]);

const DEFINITIONS: Record<Tone, RetentionTonePresentationDefinition> = {
  dramatic: {
    tone: "dramatic",
    cadenceGuidance: "Shorter punches around the tension, then a held payoff.",
    languageGuidance:
      "Heighten existing stakes with concrete verbs already licensed by the contract.",
    forbiddenPresentationalMoves: FORBIDDEN_SHARED,
  },
  funny: {
    tone: "funny",
    cadenceGuidance: "Lighter conversational rhythm without turning beats into punchlines.",
    languageGuidance:
      "Use wry phrasing only when it restates a supplied fact; never invent a gag that adds events.",
    forbiddenPresentationalMoves: FORBIDDEN_SHARED,
  },
  tactical: {
    tone: "tactical",
    cadenceGuidance: "Measured analytical cadence that follows mechanism then evidence.",
    languageGuidance:
      "Prefer shape, trigger, and adjustment language already present in the contract.",
    forbiddenPresentationalMoves: FORBIDDEN_SHARED,
  },
  news: {
    tone: "news",
    cadenceGuidance: "Neutral declarative cadence; no manufactured urgency.",
    languageGuidance:
      "Report supplied facts plainly and keep uncertainty markers audible.",
    forbiddenPresentationalMoves: FORBIDDEN_SHARED,
  },
  emotional: {
    tone: "emotional",
    cadenceGuidance: "Warmer held phrases around support, pressure, or consequence.",
    languageGuidance:
      "Name feelings only when the contract already frames them; do not invent inner states.",
    forbiddenPresentationalMoves: FORBIDDEN_SHARED,
  },
};

export function getRetentionTonePresentation(
  tone: Tone,
): RetentionTonePresentationDefinition {
  const definition = DEFINITIONS[tone];
  return Object.freeze({
    ...definition,
    forbiddenPresentationalMoves: Object.freeze([
      ...definition.forbiddenPresentationalMoves,
    ]),
  });
}
