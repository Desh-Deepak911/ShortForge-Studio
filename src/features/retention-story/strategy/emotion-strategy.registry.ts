/**
 * Immutable emotional strategy registry — Sprint 10C.
 * Maps DesiredViewerReaction + Tone + EndingStrategy + format → blueprint curve.
 */

import type { Tone } from "@/types/footiebitz";

import type {
  DesiredViewerReaction,
  EndingStrategy,
  StoryFormatStrategyId,
} from "../domain/retention-story-contract.types";
import { RETENTION_EMOTION_STRATEGY_REGISTRY_VERSION } from "./retention-strategy.constants";
import type {
  EmotionalArcBlueprintPoint,
  EmotionalIntensity,
  RetentionEmotion,
} from "./retention-strategy.types";

const REACTION_PRIMARY: Record<DesiredViewerReaction, RetentionEmotion> =
  Object.freeze({
    curiosity: "curiosity",
    surprise: "surprise",
    debate: "conviction",
    awe: "awe",
    satisfaction: "satisfaction",
    urgency: "urgency",
  });

const TONE_SECONDARY: Record<Tone, RetentionEmotion> = Object.freeze({
  dramatic: "tension",
  funny: "delight",
  tactical: "admiration",
  news: "urgency",
  emotional: "empathy",
});

function intensity(n: number): EmotionalIntensity {
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  if (n === 4) return 4;
  return 5;
}

function point(
  phase: EmotionalArcBlueprintPoint["phase"],
  emotion: RetentionEmotion,
  value: number,
): EmotionalArcBlueprintPoint {
  return Object.freeze({
    phase,
    emotion,
    intensity: intensity(value),
  });
}

/**
 * Build a deterministic four-phase curve for the given strategy inputs.
 */
export function resolveEmotionalCurve(input: {
  readonly primary: RetentionEmotion;
  readonly secondary?: RetentionEmotion;
  readonly formatStrategyId: StoryFormatStrategyId;
  readonly endingStrategy: EndingStrategy;
}): readonly EmotionalArcBlueprintPoint[] {
  const primary = input.primary;
  const secondary = input.secondary;
  const openEmotion = primary;
  const buildEmotion = secondary ?? primary;
  const turnEmotion =
    primary === "surprise"
      ? "tension"
      : primary === "curiosity"
        ? secondary ?? "anticipation"
        : secondary ?? "tension";
  const payoffEmotion =
    input.endingStrategy === "challenge"
      ? primary === "conviction"
        ? "defiance"
        : primary
      : input.endingStrategy === "open_loop"
        ? "anticipation"
        : primary === "urgency"
          ? "satisfaction"
          : primary === "curiosity"
            ? "satisfaction"
            : primary;

  let openingI: number;
  let buildI: number;
  let turnI: number;
  let payoffI: number;

  switch (input.formatStrategyId) {
    case "short_retention":
      // Establish meaningful tension/curiosity early.
      openingI = 3;
      buildI = 4;
      turnI = 4;
      payoffI = 5;
      break;
    case "extended_short":
      openingI = 2;
      buildI = 3;
      turnI = 4;
      payoffI = 5;
      break;
    case "short_standard":
      openingI = 2;
      buildI = 2;
      turnI = 3;
      payoffI = 4;
      break;
    default:
      // Long-form not production-capable; still deterministic if reached.
      openingI = 2;
      buildI = 3;
      turnI = 4;
      payoffI = 4;
      break;
  }

  // Payoff phase must land at intensity 4–5 for Retention strategy v1.
  payoffI = Math.max(payoffI, 4);

  const curve = Object.freeze([
    point("opening", openEmotion, openingI),
    point("build", buildEmotion, buildI),
    point("turn", turnEmotion, turnI),
    point("payoff", payoffEmotion, payoffI),
  ]);

  return curve;
}

export function getRetentionEmotionStrategyRegistryVersion(): string {
  return RETENTION_EMOTION_STRATEGY_REGISTRY_VERSION;
}

export function resolvePrimaryEmotion(
  reaction: DesiredViewerReaction,
): RetentionEmotion {
  return REACTION_PRIMARY[reaction];
}

export function resolveSecondaryEmotion(
  tone: Tone,
  primary: RetentionEmotion,
): RetentionEmotion | undefined {
  const secondary = TONE_SECONDARY[tone];
  if (secondary === primary) return undefined;
  return secondary;
}

export function listRetentionEmotions(): readonly RetentionEmotion[] {
  return Object.freeze([
    "curiosity",
    "surprise",
    "tension",
    "anticipation",
    "urgency",
    "awe",
    "satisfaction",
    "admiration",
    "empathy",
    "defiance",
    "conviction",
    "delight",
  ]);
}

export function isRetentionEmotion(value: unknown): value is RetentionEmotion {
  return (
    typeof value === "string" &&
    (listRetentionEmotions() as readonly string[]).includes(value)
  );
}
