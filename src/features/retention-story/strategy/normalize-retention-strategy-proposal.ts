/**
 * Planner-model proposal normalization seam — Sprint 10C / 10C.1.
 * Pure validation only. Does not call a model or spend planner budget.
 */

import { RetentionStoryError } from "../domain/retention-story-errors";
import { assertRetentionStrategySeedCoherence } from "./assert-retention-strategy-seed-coherence";
import {
  buildEmotionalArcBlueprint,
  validateEmotionalArcBlueprint,
} from "./build-emotional-arc-blueprint";
import {
  isRetentionEmotion,
  resolveEmotionalCurve,
  resolveSecondaryEmotion,
} from "./emotion-strategy.registry";
import {
  canonicalizeControllingIdeaClaimRefs,
  normalizeRetentionControllingIdeaStatement,
} from "./retention-claim-support";
import {
  buildEmotionalArcBlueprintFingerprint,
  buildRetentionStrategySeedFingerprint,
} from "./retention-strategy-fingerprints";
import { RETENTION_STRATEGY_SEED_VERSION } from "./retention-strategy.constants";
import type {
  EmotionalArcBlueprint,
  EmotionalArcBlueprintPoint,
  EmotionalArcPhase,
  EmotionalIntensity,
  RetentionEmotion,
  RetentionStrategyPlanningContext,
  RetentionStrategyProposalInput,
  RetentionStrategySeed,
} from "./retention-strategy.types";
import { validateControllingIdea } from "./validate-controlling-idea";

const PHASES: readonly EmotionalArcPhase[] = [
  "opening",
  "build",
  "turn",
  "payoff",
];

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

function normalizeProposalCurve(
  raw: RetentionStrategyProposalInput["curve"],
  defaults: EmotionalArcBlueprint,
): readonly EmotionalArcBlueprintPoint[] {
  if (raw == null) {
    return defaults.curve;
  }
  if (!Array.isArray(raw) || raw.length !== 4) {
    throw new RetentionStoryError(
      "invalid_strategy_proposal",
      "Strategy proposal curve must include exactly four phase points.",
    );
  }

  const points: EmotionalArcBlueprintPoint[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (entry == null || typeof entry !== "object") {
      throw new RetentionStoryError(
        "invalid_strategy_proposal",
        "Strategy proposal curve entries are malformed.",
      );
    }
    if (
      !isPhase(entry.phase) ||
      !isRetentionEmotion(entry.emotion) ||
      !isIntensity(entry.intensity)
    ) {
      throw new RetentionStoryError(
        "invalid_strategy_proposal",
        "Strategy proposal curve values are invalid.",
      );
    }
    if (seen.has(entry.phase)) {
      throw new RetentionStoryError(
        "invalid_strategy_proposal",
        "Strategy proposal curve has duplicate phases.",
      );
    }
    seen.add(entry.phase);
    // Deterministic contract-preserving floor: payoff intensity must be ≥4
    // (matches resolveEmotionalCurve). Other phases keep supplied intensity.
    const intensity =
      entry.phase === "payoff" && entry.intensity < 4
        ? (4 as EmotionalIntensity)
        : entry.intensity;
    points.push(
      Object.freeze({
        phase: entry.phase,
        emotion: entry.emotion,
        intensity,
      }),
    );
  }

  for (const phase of PHASES) {
    if (!seen.has(phase)) {
      throw new RetentionStoryError(
        "invalid_strategy_proposal",
        "Strategy proposal curve is missing a required phase.",
      );
    }
  }

  return Object.freeze(
    PHASES.map((phase) => points.find((p) => p.phase === phase)!),
  );
}

/**
 * Normalize an unknown planner-model proposal into a RetentionStrategySeed.
 * Extra reasoning/diagnostic fields on the raw object are ignored and never persisted.
 */
export function normalizeRetentionStrategyProposal(
  raw: unknown,
  context: RetentionStrategyPlanningContext,
): RetentionStrategySeed {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RetentionStoryError(
      "invalid_strategy_proposal",
      "Strategy proposal must be a structured object.",
    );
  }

  const record = raw as Record<string, unknown>;
  void record.reasoning;
  void record.chainOfThought;
  void record.critique;
  void record.diagnostics;

  if (typeof record.controllingIdea !== "string") {
    throw new RetentionStoryError(
      "invalid_strategy_proposal",
      "Strategy proposal controlling idea is missing or invalid.",
    );
  }

  const claimRefs = canonicalizeControllingIdeaClaimRefs(
    record.controllingIdeaClaimRefs ?? [],
  );
  if (claimRefs == null) {
    throw new RetentionStoryError(
      "invalid_strategy_proposal",
      "Strategy proposal claim refs are malformed.",
    );
  }

  const statement = normalizeRetentionControllingIdeaStatement(
    record.controllingIdea,
  );
  const validation = validateControllingIdea({
    statement,
    topic: context.contract.topic,
    claimRefs,
    grounding: context.grounding,
    mustPreserveThroughCompression: true,
  });
  if (!validation.ok) {
    throw new RetentionStoryError(
      "invalid_strategy_proposal",
      "Strategy proposal controlling idea failed Retention validation.",
    );
  }

  const defaults = buildEmotionalArcBlueprint(context.contract);

  let primaryEmotion: RetentionEmotion = defaults.primaryEmotion;
  if (record.primaryEmotion != null) {
    if (!isRetentionEmotion(record.primaryEmotion)) {
      throw new RetentionStoryError(
        "invalid_strategy_proposal",
        "Strategy proposal primary emotion is invalid.",
      );
    }
    primaryEmotion = record.primaryEmotion;
  }

  let secondaryEmotion: RetentionEmotion | undefined = defaults.secondaryEmotion;
  if (record.secondaryEmotion != null) {
    if (!isRetentionEmotion(record.secondaryEmotion)) {
      throw new RetentionStoryError(
        "invalid_strategy_proposal",
        "Strategy proposal secondary emotion is invalid.",
      );
    }
    secondaryEmotion = record.secondaryEmotion;
  } else if (record.primaryEmotion != null) {
    secondaryEmotion = resolveSecondaryEmotion(
      context.contract.tone,
      primaryEmotion,
    );
  }

  if (secondaryEmotion === primaryEmotion) {
    secondaryEmotion = undefined;
  }

  const curveRaw = record.curve as RetentionStrategyProposalInput["curve"] | undefined;
  let curve: readonly EmotionalArcBlueprintPoint[];
  if (
    curveRaw == null &&
    record.primaryEmotion == null &&
    record.secondaryEmotion == null
  ) {
    curve = defaults.curve;
  } else if (curveRaw == null) {
    curve = resolveEmotionalCurve({
      primary: primaryEmotion,
      secondary: secondaryEmotion,
      formatStrategyId: context.contract.formatStrategyId,
      endingStrategy: context.contract.endingStrategy,
    });
  } else {
    curve = normalizeProposalCurve(curveRaw, defaults);
  }

  const blueprintFingerprint = buildEmotionalArcBlueprintFingerprint({
    contractFingerprint: context.contract.contractFingerprint,
    primaryEmotion,
    secondaryEmotion,
    curve,
  });

  const emotionalArcBlueprint: EmotionalArcBlueprint = Object.freeze({
    version: 1 as const,
    primaryEmotion,
    ...(secondaryEmotion ? { secondaryEmotion } : {}),
    curve,
    blueprintFingerprint,
  });

  const blueprintReasons = validateEmotionalArcBlueprint(emotionalArcBlueprint);
  if (blueprintReasons.length > 0) {
    throw new RetentionStoryError(
      "invalid_strategy_proposal",
      "Strategy proposal emotional blueprint failed validation.",
    );
  }

  const seed: RetentionStrategySeed = Object.freeze({
    version: RETENTION_STRATEGY_SEED_VERSION,
    contractFingerprint: context.contract.contractFingerprint,
    controllingIdea: Object.freeze({
      statement,
      mustPreserveThroughCompression: true as const,
    }),
    controllingIdeaSource: "planner_model_proposal" as const,
    controllingIdeaClaimRefs: claimRefs,
    emotionalArcBlueprint,
    strategySeedFingerprint: buildRetentionStrategySeedFingerprint({
      contractFingerprint: context.contract.contractFingerprint,
      statement,
      source: "planner_model_proposal",
      claimRefs,
      blueprintFingerprint,
    }),
  });

  return assertRetentionStrategySeedCoherence(seed, context);
}
