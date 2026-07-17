/**
 * Deterministic Retention strategy seed builder — Sprint 10C / 10C.1 / 10C.1A.
 * No model calls. Returns the asserted canonical seed authority result.
 */

import { assertRetentionStrategySeedCoherence } from "./assert-retention-strategy-seed-coherence";
import { buildControllingIdeaCandidates } from "./build-controlling-idea-candidates";
import { buildEmotionalArcBlueprint } from "./build-emotional-arc-blueprint";
import { getControllingIdeaModeStrategy } from "./controlling-idea.registry";
import { buildRetentionStrategySeedFingerprint } from "./retention-strategy-fingerprints";
import { RETENTION_STRATEGY_SEED_VERSION } from "./retention-strategy.constants";
import type {
  BuildRetentionStrategySeedInput,
  RetentionStrategySeed,
  RetentionStrategySeedResult,
} from "./retention-strategy.types";
import { selectControllingIdea } from "./select-controlling-idea";
import { validateRetentionStrategyPlanningInput } from "./validate-strategy-planning-input";

/**
 * Build a deterministic RetentionStrategySeed (Fast-mode path).
 * Scenes-only → skipped. Other paths → ready canonical seed or typed error.
 */
export function buildDeterministicRetentionStrategySeed(
  input: BuildRetentionStrategySeedInput,
): RetentionStrategySeedResult {
  if (input.contract.generationPath === "scenes_only") {
    return Object.freeze({
      status: "skipped" as const,
      reason: "scenes_only" as const,
    });
  }

  const context = validateRetentionStrategyPlanningInput(input);
  void getControllingIdeaModeStrategy(context.contract.scriptMode);

  const candidates = buildControllingIdeaCandidates(context);
  const selection = selectControllingIdea(candidates, context);
  const emotionalArcBlueprint = buildEmotionalArcBlueprint(context.contract);

  const provisional: RetentionStrategySeed = {
    version: RETENTION_STRATEGY_SEED_VERSION,
    contractFingerprint: context.contract.contractFingerprint,
    controllingIdea: selection.controllingIdea,
    controllingIdeaSource: selection.source,
    controllingIdeaClaimRefs: selection.claimRefs,
    emotionalArcBlueprint,
    strategySeedFingerprint: buildRetentionStrategySeedFingerprint({
      contractFingerprint: context.contract.contractFingerprint,
      statement: selection.controllingIdea.statement,
      source: selection.source,
      claimRefs: selection.claimRefs,
      blueprintFingerprint: emotionalArcBlueprint.blueprintFingerprint,
    }),
  };

  const seed = assertRetentionStrategySeedCoherence(provisional, context);

  return Object.freeze({
    status: "ready" as const,
    seed,
  });
}
