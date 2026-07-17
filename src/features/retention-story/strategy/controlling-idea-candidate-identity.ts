/**
 * Canonical controlling-idea candidate identity / coherence — Sprint 10C.1.
 * The public selector must not trust caller-supplied candidate metadata.
 */

import { RetentionStoryError } from "../domain/retention-story-errors";
import { assembleDeterministicControllingIdeaStatement } from "./controlling-idea.registry";
import {
  canonicalizeControllingIdeaClaimRefs,
  claimRefSupportsControllingIdeaStatement,
  isClaimEligibleForControllingIdeaSupport,
  normalizeRetentionControllingIdeaStatement,
} from "./retention-claim-support";
import { detectRetentionFactualRisk } from "./retention-factual-risk";
import { buildControllingIdeaCandidateId } from "./retention-strategy-fingerprints";
import type {
  ControllingIdeaCandidate,
  RetentionStrategyPlanningContext,
} from "./retention-strategy.types";
import { statementPreservesRetentionSubject } from "./retention-subject-tokens";
import { validateControllingIdea } from "./validate-controlling-idea";

function throwCandidateMismatch(): never {
  throw new RetentionStoryError(
    "controlling_idea_candidate_mismatch",
    "Controlling idea candidate failed canonical Retention identity checks.",
  );
}

function isRuntimeCandidate(value: unknown): value is ControllingIdeaCandidate {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const c = value as Record<string, unknown>;
  return (
    typeof c.candidateId === "string" &&
    typeof c.contractFingerprint === "string" &&
    typeof c.statement === "string" &&
    (c.source === "grounded_claim" ||
      c.source === "deterministic_mode_strategy" ||
      c.source === "planner_model_proposal") &&
    Array.isArray(c.claimRefs) &&
    typeof c.factualRisk === "boolean" &&
    typeof c.subjectAnchored === "boolean"
  );
}

/**
 * Assert a candidate is coherent with the active planning context.
 * Returns a deeply frozen canonical candidate on success.
 */
export function assertCanonicalControllingIdeaCandidate(
  raw: unknown,
  context: RetentionStrategyPlanningContext,
): ControllingIdeaCandidate {
  if (!isRuntimeCandidate(raw)) {
    throwCandidateMismatch();
  }

  if (raw.contractFingerprint !== context.contract.contractFingerprint) {
    throwCandidateMismatch();
  }

  // Deterministic selector must not accept planner proposals (seed path uses normalizer).
  if (raw.source === "planner_model_proposal") {
    throwCandidateMismatch();
  }

  const canonicalStatement = normalizeRetentionControllingIdeaStatement(
    raw.statement,
  );
  if (!canonicalStatement || raw.statement !== canonicalStatement) {
    throwCandidateMismatch();
  }

  const claimRefs = canonicalizeControllingIdeaClaimRefs(raw.claimRefs);
  if (claimRefs == null) throwCandidateMismatch();
  if (raw.claimRefs.length !== claimRefs.length) throwCandidateMismatch();
  for (let i = 0; i < claimRefs.length; i++) {
    if (raw.claimRefs[i] !== claimRefs[i]) throwCandidateMismatch();
  }

  const factualRisk = detectRetentionFactualRisk(canonicalStatement).risky;
  if (raw.factualRisk !== factualRisk) throwCandidateMismatch();

  const subjectAnchored = statementPreservesRetentionSubject(
    context.contract.topic,
    canonicalStatement,
  );
  if (!subjectAnchored || raw.subjectAnchored !== true) {
    throwCandidateMismatch();
  }

  if (raw.source === "grounded_claim") {
    if (claimRefs.length !== 1) throwCandidateMismatch();
    const claimId = claimRefs[0]!;
    if (!isClaimEligibleForControllingIdeaSupport(context.grounding, claimId)) {
      throwCandidateMismatch();
    }
    if (
      !claimRefSupportsControllingIdeaStatement(
        context.grounding,
        claimId,
        canonicalStatement,
      )
    ) {
      throwCandidateMismatch();
    }
  }

  if (raw.source === "deterministic_mode_strategy") {
    if (claimRefs.length !== 0) throwCandidateMismatch();
    const expected = assembleDeterministicControllingIdeaStatement(
      context.contract.scriptMode,
      context.contract.topic,
    );
    if (canonicalStatement !== expected) throwCandidateMismatch();
  }

  const expectedId = buildControllingIdeaCandidateId({
    contractFingerprint: context.contract.contractFingerprint,
    source: raw.source,
    statement: canonicalStatement,
    claimRefs,
    factualRisk,
  });
  if (raw.candidateId !== expectedId) throwCandidateMismatch();

  const validation = validateControllingIdea({
    statement: canonicalStatement,
    topic: context.contract.topic,
    claimRefs,
    grounding: context.grounding,
    mustPreserveThroughCompression: true,
  });
  if (!validation.ok) throwCandidateMismatch();

  return Object.freeze({
    candidateId: expectedId,
    contractFingerprint: context.contract.contractFingerprint,
    statement: canonicalStatement,
    source: raw.source,
    claimRefs,
    factualRisk,
    subjectAnchored: true as const,
  });
}

/**
 * Assert an entire candidate list: runtime shape, unique IDs, no conflicts.
 * Returns frozen canonical candidates in stable ID order.
 */
export function assertCanonicalControllingIdeaCandidates(
  candidates: unknown,
  context: RetentionStrategyPlanningContext,
): readonly ControllingIdeaCandidate[] {
  if (!Array.isArray(candidates)) {
    throwCandidateMismatch();
  }

  const canonical: ControllingIdeaCandidate[] = [];
  const seenIds = new Set<string>();
  const byStatement = new Map<string, ControllingIdeaCandidate>();

  for (const entry of candidates) {
    const next = assertCanonicalControllingIdeaCandidate(entry, context);
    if (seenIds.has(next.candidateId)) {
      throwCandidateMismatch();
    }
    seenIds.add(next.candidateId);

    const prior = byStatement.get(next.statement);
    if (
      prior &&
      (prior.source !== next.source ||
        prior.claimRefs.join("|") !== next.claimRefs.join("|"))
    ) {
      throwCandidateMismatch();
    }
    byStatement.set(next.statement, next);
    canonical.push(next);
  }

  canonical.sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  return Object.freeze(canonical);
}
