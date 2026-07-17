/**
 * 10D-facing RetentionStrategySeed coherence assertion — Sprint 10C.1 / 10C.1A.
 * Returns a deeply frozen canonical seed; never retains caller-owned nested refs.
 */

import { RetentionStoryError } from "../domain/retention-story-errors";
import {
  recomputeEmotionalArcBlueprintFingerprint,
  validateEmotionalArcBlueprint,
} from "./build-emotional-arc-blueprint";
import { assembleDeterministicControllingIdeaStatement } from "./controlling-idea.registry";
import {
  canonicalizeControllingIdeaClaimRefs,
  claimRefSupportsControllingIdeaStatement,
  isClaimEligibleForControllingIdeaSupport,
  normalizeRetentionControllingIdeaStatement,
} from "./retention-claim-support";
import { buildRetentionStrategySeedFingerprint } from "./retention-strategy-fingerprints";
import { RETENTION_STRATEGY_SEED_VERSION } from "./retention-strategy.constants";
import type {
  ControllingIdeaSource,
  EmotionalArcBlueprint,
  EmotionalArcBlueprintPoint,
  RetentionStrategyPlanningContext,
  RetentionStrategySeed,
} from "./retention-strategy.types";
import { validateControllingIdea } from "./validate-controlling-idea";

function throwSeedMismatch(): never {
  throw new RetentionStoryError(
    "strategy_seed_mismatch",
    "Retention strategy seed failed coherence checks against planning context.",
  );
}

function assertSourceClaimSemantics(
  source: ControllingIdeaSource,
  statement: string,
  claimRefs: readonly string[],
  context: RetentionStrategyPlanningContext,
): void {
  if (source === "deterministic_mode_strategy") {
    const expected = assembleDeterministicControllingIdeaStatement(
      context.contract.scriptMode,
      context.contract.topic,
    );
    if (statement !== expected || claimRefs.length !== 0) throwSeedMismatch();
    return;
  }

  if (source === "grounded_claim") {
    if (claimRefs.length !== 1) throwSeedMismatch();
    const claimId = claimRefs[0]!;
    if (!isClaimEligibleForControllingIdeaSupport(context.grounding, claimId)) {
      throwSeedMismatch();
    }
    if (
      !claimRefSupportsControllingIdeaStatement(
        context.grounding,
        claimId,
        statement,
      )
    ) {
      throwSeedMismatch();
    }
    return;
  }

  // planner_model_proposal
  if (claimRefs.length === 0) {
    return;
  }
  for (const claimId of claimRefs) {
    if (!isClaimEligibleForControllingIdeaSupport(context.grounding, claimId)) {
      throwSeedMismatch();
    }
    if (
      !claimRefSupportsControllingIdeaStatement(
        context.grounding,
        claimId,
        statement,
      )
    ) {
      throwSeedMismatch();
    }
  }
}

function rebuildCanonicalBlueprint(
  raw: unknown,
  contractFingerprint: string,
): EmotionalArcBlueprint {
  const reasons = validateEmotionalArcBlueprint(raw);
  if (reasons.length > 0) throwSeedMismatch();

  const blueprint = raw as EmotionalArcBlueprint;
  const expectedBlueprintFp = recomputeEmotionalArcBlueprintFingerprint(
    blueprint,
    contractFingerprint,
  );
  if (blueprint.blueprintFingerprint !== expectedBlueprintFp) {
    throwSeedMismatch();
  }

  const curve = Object.freeze(
    blueprint.curve.map(
      (point): EmotionalArcBlueprintPoint =>
        Object.freeze({
          phase: point.phase,
          emotion: point.emotion,
          intensity: point.intensity,
        }),
    ),
  );

  return Object.freeze({
    version: 1 as const,
    primaryEmotion: blueprint.primaryEmotion,
    ...(blueprint.secondaryEmotion
      ? { secondaryEmotion: blueprint.secondaryEmotion }
      : {}),
    curve,
    blueprintFingerprint: expectedBlueprintFp,
  });
}

/**
 * Assert a strategy seed matches the active planning context and recomputed fingerprints.
 * Returns a deeply frozen canonical authority result with no caller-owned nested refs.
 */
export function assertRetentionStrategySeedCoherence(
  seed: unknown,
  context: RetentionStrategyPlanningContext,
): RetentionStrategySeed {
  if (seed == null || typeof seed !== "object" || Array.isArray(seed)) {
    throwSeedMismatch();
  }
  const record = seed as Record<string, unknown>;

  if (record.version !== RETENTION_STRATEGY_SEED_VERSION) throwSeedMismatch();
  if (record.contractFingerprint !== context.contract.contractFingerprint) {
    throwSeedMismatch();
  }

  const idea = record.controllingIdea;
  if (idea == null || typeof idea !== "object" || Array.isArray(idea)) {
    throwSeedMismatch();
  }
  const ideaRecord = idea as Record<string, unknown>;
  if (typeof ideaRecord.statement !== "string") throwSeedMismatch();
  if (ideaRecord.mustPreserveThroughCompression !== true) throwSeedMismatch();

  const statement = normalizeRetentionControllingIdeaStatement(
    ideaRecord.statement,
  );
  if (!statement || statement !== ideaRecord.statement) throwSeedMismatch();

  const source = record.controllingIdeaSource;
  if (
    source !== "grounded_claim" &&
    source !== "deterministic_mode_strategy" &&
    source !== "planner_model_proposal"
  ) {
    throwSeedMismatch();
  }

  const claimRefs = canonicalizeControllingIdeaClaimRefs(
    record.controllingIdeaClaimRefs,
  );
  if (claimRefs == null) throwSeedMismatch();
  if (!Array.isArray(record.controllingIdeaClaimRefs)) throwSeedMismatch();
  if (record.controllingIdeaClaimRefs.length !== claimRefs.length) {
    throwSeedMismatch();
  }
  for (let i = 0; i < claimRefs.length; i++) {
    if (record.controllingIdeaClaimRefs[i] !== claimRefs[i]) {
      throwSeedMismatch();
    }
  }

  assertSourceClaimSemantics(source, statement, claimRefs, context);

  const validation = validateControllingIdea({
    statement,
    topic: context.contract.topic,
    claimRefs,
    grounding: context.grounding,
    mustPreserveThroughCompression: true,
  });
  if (!validation.ok) throwSeedMismatch();

  const emotionalArcBlueprint = rebuildCanonicalBlueprint(
    record.emotionalArcBlueprint,
    context.contract.contractFingerprint,
  );

  const expectedSeedFp = buildRetentionStrategySeedFingerprint({
    contractFingerprint: context.contract.contractFingerprint,
    statement,
    source,
    claimRefs,
    blueprintFingerprint: emotionalArcBlueprint.blueprintFingerprint,
  });
  if (record.strategySeedFingerprint !== expectedSeedFp) {
    throwSeedMismatch();
  }

  const controllingIdea = Object.freeze({
    statement,
    mustPreserveThroughCompression: true as const,
  });
  const frozenClaimRefs = Object.freeze([...claimRefs]);

  return Object.freeze({
    version: RETENTION_STRATEGY_SEED_VERSION,
    contractFingerprint: context.contract.contractFingerprint,
    controllingIdea,
    controllingIdeaSource: source,
    controllingIdeaClaimRefs: frozenClaimRefs,
    emotionalArcBlueprint,
    strategySeedFingerprint: expectedSeedFp,
  });
}
