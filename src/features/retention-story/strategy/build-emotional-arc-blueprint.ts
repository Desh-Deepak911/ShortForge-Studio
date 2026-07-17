/**
 * Build and validate EmotionalArcBlueprint — Sprint 10C / 10C.1.
 * Pre-beat intermediate: phases only, never beat IDs.
 * validateEmotionalArcBlueprint is total over unknown and never throws.
 */

import { RetentionStoryError } from "../domain/retention-story-errors";
import type { NormalizedStoryContract } from "../domain/retention-story-contract.types";
import {
  isRetentionEmotion,
  resolveEmotionalCurve,
  resolvePrimaryEmotion,
  resolveSecondaryEmotion,
} from "./emotion-strategy.registry";
import { RETENTION_EMOTION_BLUEPRINT_FINGERPRINT_PREFIX } from "./retention-strategy.constants";
import { buildEmotionalArcBlueprintFingerprint } from "./retention-strategy-fingerprints";
import type {
  EmotionalArcBlueprint,
  EmotionalArcBlueprintPoint,
  EmotionalArcPhase,
  EmotionalIntensity,
  RetentionEmotion,
} from "./retention-strategy.types";

const PHASES: readonly EmotionalArcPhase[] = Object.freeze([
  "opening",
  "build",
  "turn",
  "payoff",
]);

function isPhase(value: unknown): value is EmotionalArcPhase {
  return typeof value === "string" && (PHASES as readonly string[]).includes(value);
}

function isIntensity(value: unknown): value is EmotionalIntensity {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}

/**
 * Total runtime validator for emotional blueprints. Never throws.
 */
export function validateEmotionalArcBlueprint(
  blueprint: unknown,
): readonly string[] {
  const reasons: string[] = [];
  try {
    if (blueprint == null || typeof blueprint !== "object" || Array.isArray(blueprint)) {
      return Object.freeze(["invalid_shape"]);
    }
    const record = blueprint as Record<string, unknown>;

    if (record.version !== 1) reasons.push("invalid_version");

    if (!isRetentionEmotion(record.primaryEmotion)) {
      reasons.push("invalid_primary_emotion");
    }

    if (record.secondaryEmotion != null) {
      if (!isRetentionEmotion(record.secondaryEmotion)) {
        reasons.push("invalid_secondary_emotion");
      } else if (
        isRetentionEmotion(record.primaryEmotion) &&
        record.secondaryEmotion === record.primaryEmotion
      ) {
        reasons.push("duplicate_primary_secondary");
      }
    }

    if (!Array.isArray(record.curve)) {
      reasons.push("curve_not_array");
      return Object.freeze([...new Set(reasons)]);
    }
    if (record.curve.length !== 4) reasons.push("curve_length");

    const seen = new Set<string>();
    for (let i = 0; i < record.curve.length; i++) {
      const point = record.curve[i];
      if (point == null || typeof point !== "object" || Array.isArray(point)) {
        reasons.push("invalid_curve_entry");
        continue;
      }
      const entry = point as Record<string, unknown>;
      if (!isPhase(entry.phase)) reasons.push("unknown_phase");
      else {
        if (seen.has(entry.phase)) reasons.push("duplicate_phase");
        seen.add(entry.phase);
        if (PHASES[i] !== undefined && entry.phase !== PHASES[i]) {
          reasons.push("phase_order");
        }
      }
      if (!isRetentionEmotion(entry.emotion)) reasons.push("invalid_curve_emotion");
      if (!isIntensity(entry.intensity)) reasons.push("invalid_intensity");
    }

    for (const phase of PHASES) {
      if (!seen.has(phase)) reasons.push(`missing_phase_${phase}`);
    }

    if (record.curve.length === 4) {
      const signatures = record.curve.map((p) => {
        if (p == null || typeof p !== "object") return "invalid";
        const entry = p as Record<string, unknown>;
        return `${String(entry.emotion)}:${String(entry.intensity)}`;
      });
      if (new Set(signatures).size === 1) reasons.push("no_progression");

      const payoff = record.curve[3] as Record<string, unknown> | null;
      if (
        payoff &&
        typeof payoff === "object" &&
        isIntensity(payoff.intensity) &&
        payoff.intensity < 4
      ) {
        reasons.push("payoff_intensity");
      }
    }

    if (
      typeof record.blueprintFingerprint !== "string" ||
      record.blueprintFingerprint.length === 0 ||
      !record.blueprintFingerprint.startsWith(
        RETENTION_EMOTION_BLUEPRINT_FINGERPRINT_PREFIX,
      )
    ) {
      reasons.push("invalid_fingerprint");
    }
  } catch {
    reasons.push("invalid_shape");
  }

  return Object.freeze([...new Set(reasons)]);
}

/**
 * Build a deterministic EmotionalArcBlueprint from a normalized contract.
 */
export function buildEmotionalArcBlueprint(
  contract: NormalizedStoryContract,
): EmotionalArcBlueprint {
  const primaryEmotion = resolvePrimaryEmotion(contract.desiredReaction);
  const secondaryEmotion = resolveSecondaryEmotion(
    contract.tone,
    primaryEmotion,
  );
  const curve = resolveEmotionalCurve({
    primary: primaryEmotion,
    secondary: secondaryEmotion,
    formatStrategyId: contract.formatStrategyId,
    endingStrategy: contract.endingStrategy,
  }) as readonly EmotionalArcBlueprintPoint[];

  const blueprintFingerprint = buildEmotionalArcBlueprintFingerprint({
    contractFingerprint: contract.contractFingerprint,
    primaryEmotion,
    secondaryEmotion,
    curve,
  });

  const blueprint: EmotionalArcBlueprint = Object.freeze({
    version: 1 as const,
    primaryEmotion,
    ...(secondaryEmotion ? { secondaryEmotion } : {}),
    curve,
    blueprintFingerprint,
  });

  const reasons = validateEmotionalArcBlueprint(blueprint);
  if (reasons.length > 0) {
    throw new RetentionStoryError(
      "invalid_emotional_arc_blueprint",
      "Emotional arc blueprint failed Retention strategy validation.",
    );
  }

  return blueprint;
}

export function recomputeEmotionalArcBlueprintFingerprint(
  blueprint: EmotionalArcBlueprint,
  contractFingerprint: string,
): string {
  return buildEmotionalArcBlueprintFingerprint({
    contractFingerprint,
    primaryEmotion: blueprint.primaryEmotion,
    secondaryEmotion: blueprint.secondaryEmotion,
    curve: blueprint.curve,
  });
}

export type { RetentionEmotion };
