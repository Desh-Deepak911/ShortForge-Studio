/**
 * Full Retention validation-result coherence — Sprint 10F.1.
 * Fingerprint is identity only; this assertion is authority.
 */

import { RetentionStoryError } from "../domain/retention-story-errors";
import {
  assertRetentionCreatorContextAuthorityMatchesContract,
  buildRetentionCreatorContextAuthority,
} from "../domain/retention-creator-context-authority";
import { retentionStableStringify } from "../domain/retention-story-fingerprint";
import { assertRetentionNarrationCandidateCoherence } from "../composition/assert-retention-narration-candidate-coherence";
import { assertRetentionHookBridgeForValidation } from "../rewrite/assert-retention-hook-bridge-for-validation";
import { assertRetentionStoryPlanCoherence } from "../planning/assert-retention-story-plan-coherence";
import { assertRetentionStrategySeedCoherence } from "../strategy/assert-retention-strategy-seed-coherence";
import { validateRetentionStrategyPlanningInput } from "../strategy/validate-strategy-planning-input";
import {
  buildCanonicalRetentionValidationResult,
  deepFreezeRetentionValidationResult,
} from "./build-canonical-retention-validation-result";
import { RETENTION_HARD_GATE_IDS } from "./retention-validation.constants";
import { RetentionValidationError } from "./retention-validation-errors";
import type {
  RetentionValidationCoherenceInput,
  RetentionValidationResult,
} from "./retention-validation.types";

const RESULT_KEYS = new Set([
  "version",
  "ok",
  "failureClass",
  "hardGates",
  "editorial",
  "retentionReadiness",
  "storyQualityConfidence",
  "frameworkCompliance",
  "activeStrategyThreshold",
  "notes",
  "validationFingerprint",
  "candidateFingerprint",
]);

const EDITORIAL_KEYS = new Set([
  "clarity",
  "curiosity",
  "emotionalProgression",
  "compressionQuality",
  "novelty",
  "escalation",
  "payoffStrength",
  "visualPotential",
  "repetitionPenalty",
  "controllingIdeaAdherence",
  "genericIntroductionQuality",
]);

const GATE_KEYS = new Set(["id", "passed", "detail"]);

const FAILURE_CLASSES = new Set([
  "none",
  "hard_gate",
  "quality_threshold",
]);

function throwCoherence(): never {
  throw new RetentionValidationError(
    "validation_coherence_mismatch",
    "Retention validation result failed canonical coherence checks.",
  );
}

function assertFiniteUnit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throwCoherence();
  if (value < 0 || value > 1) throwCoherence();
  return value;
}

function assertResultShape(result: unknown): RetentionValidationResult {
  if (result == null || typeof result !== "object" || Array.isArray(result)) {
    throwCoherence();
  }
  const record = result as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!RESULT_KEYS.has(key)) throwCoherence();
  }
  if (record.version !== 1) throwCoherence();
  if (typeof record.ok !== "boolean") throwCoherence();
  if (
    typeof record.failureClass !== "string" ||
    !FAILURE_CLASSES.has(record.failureClass)
  ) {
    throwCoherence();
  }
  if (typeof record.validationFingerprint !== "string") throwCoherence();
  if (typeof record.candidateFingerprint !== "string") throwCoherence();
  if (typeof record.activeStrategyThreshold !== "number") throwCoherence();
  if (!Number.isFinite(record.activeStrategyThreshold)) throwCoherence();
  assertFiniteUnit(record.retentionReadiness);
  assertFiniteUnit(record.storyQualityConfidence);
  assertFiniteUnit(record.frameworkCompliance);

  if (!Array.isArray(record.notes)) throwCoherence();
  for (const note of record.notes) {
    if (typeof note !== "string") throwCoherence();
  }

  if (
    record.editorial == null ||
    typeof record.editorial !== "object" ||
    Array.isArray(record.editorial)
  ) {
    throwCoherence();
  }
  const editorial = record.editorial as Record<string, unknown>;
  for (const key of Object.keys(editorial)) {
    if (!EDITORIAL_KEYS.has(key)) throwCoherence();
  }
  for (const key of EDITORIAL_KEYS) {
    assertFiniteUnit(editorial[key]);
  }

  if (!Array.isArray(record.hardGates)) throwCoherence();
  if (record.hardGates.length !== RETENTION_HARD_GATE_IDS.length) {
    throwCoherence();
  }
  const seen = new Set<string>();
  for (let i = 0; i < record.hardGates.length; i++) {
    const gate = record.hardGates[i];
    if (gate == null || typeof gate !== "object" || Array.isArray(gate)) {
      throwCoherence();
    }
    const g = gate as Record<string, unknown>;
    for (const key of Object.keys(g)) {
      if (!GATE_KEYS.has(key)) throwCoherence();
    }
    if (g.id !== RETENTION_HARD_GATE_IDS[i]) throwCoherence();
    if (typeof g.passed !== "boolean") throwCoherence();
    if (typeof g.detail !== "string") throwCoherence();
    if (seen.has(g.id as string)) throwCoherence();
    seen.add(g.id as string);
  }
  for (const id of RETENTION_HARD_GATE_IDS) {
    if (!seen.has(id)) throwCoherence();
  }

  return result as RetentionValidationResult;
}

/**
 * Reassert authority, rebuild the canonical result, and reject any forged graph.
 * Returns a detached deeply frozen canonical result.
 */
export function assertRetentionValidationResultCoherence(
  input: RetentionValidationCoherenceInput,
): RetentionValidationResult {
  const supplied = assertResultShape(input.result);

  let planningContext;
  let strategySeed;
  let plan;
  let candidate;
  let hookBridge;
  try {
    const creatorAuthority = assertRetentionCreatorContextAuthorityMatchesContract(
      input.creatorContextAuthority ??
        buildRetentionCreatorContextAuthority({}),
      input.contract,
    );
    planningContext = validateRetentionStrategyPlanningInput({
      contract: input.contract,
      grounding: input.grounding,
      manualContext: creatorAuthority.manualContext || null,
      userInstructions: creatorAuthority.userInstructions || null,
    });
    strategySeed = assertRetentionStrategySeedCoherence(
      input.strategySeed,
      planningContext,
    );
    plan = assertRetentionStoryPlanCoherence(input.plan, {
      context: planningContext,
      strategySeed,
    });
    candidate = assertRetentionNarrationCandidateCoherence(input.candidate, {
      plan,
      grounding: planningContext.grounding,
      strategySeed,
    });
    hookBridge = assertRetentionHookBridgeForValidation(input.hookBridge, {
      contract: planningContext.contract,
      grounding: planningContext.grounding,
      strategySeed,
      plan,
      candidate,
    });
  } catch (err) {
    if (err instanceof RetentionValidationError) throw err;
    if (err instanceof RetentionStoryError) {
      throw new RetentionValidationError(
        "authority_mismatch",
        "Retention validation coherence failed authority reassert.",
      );
    }
    throw new RetentionValidationError(
      "validation_input_invalid",
      "Retention validation coherence received invalid authority inputs.",
    );
  }

  const canonical = buildCanonicalRetentionValidationResult({
    contract: planningContext.contract,
    grounding: planningContext.grounding,
    strategySeed,
    plan,
    candidate,
    hookBridge,
  });

  if (retentionStableStringify(supplied) !== retentionStableStringify(canonical)) {
    throwCoherence();
  }

  return deepFreezeRetentionValidationResult(canonical);
}
