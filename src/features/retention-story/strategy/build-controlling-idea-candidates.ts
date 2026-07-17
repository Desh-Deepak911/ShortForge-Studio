/**
 * Build deterministic controlling-idea candidates — Sprint 10C / 10C.1.
 */

import type { RetentionGroundingClaim } from "../domain/retention-story-contract.types";
import { assembleDeterministicControllingIdeaStatement } from "./controlling-idea.registry";
import {
  isClaimEligibleForControllingIdeaSupport,
  normalizeRetentionControllingIdeaStatement,
} from "./retention-claim-support";
import { detectRetentionFactualRisk } from "./retention-factual-risk";
import { buildControllingIdeaCandidateId } from "./retention-strategy-fingerprints";
import {
  RETENTION_MAX_CONTROLLING_IDEA_CANDIDATES,
  RETENTION_MAX_CONTROLLING_IDEA_CHARS,
  RETENTION_MAX_CONTROLLING_IDEA_WORDS,
} from "./retention-strategy.constants";
import type {
  ControllingIdeaCandidate,
  RetentionStrategyPlanningContext,
} from "./retention-strategy.types";
import { claimRelevantToRetentionTopic } from "./retention-subject-tokens";
import { validateControllingIdea } from "./validate-controlling-idea";

function deepFreezeCandidate(
  candidate: ControllingIdeaCandidate,
): ControllingIdeaCandidate {
  return Object.freeze({
    ...candidate,
    claimRefs: Object.freeze([...candidate.claimRefs]),
  });
}

function piRoleSet(claim: RetentionGroundingClaim): Set<string> {
  return new Set((claim.piFactRole ?? "").split("+").filter(Boolean));
}

function groundedPriority(claim: RetentionGroundingClaim): number {
  const roles = piRoleSet(claim);
  if (roles.has("required")) return 1;
  if (roles.has("opening_intent") || roles.has("opening_hook")) return 2;
  return 3;
}

function claimFitsControllingProposition(text: string): boolean {
  const cleaned = normalizeRetentionControllingIdeaStatement(text);
  if (!cleaned) return false;
  if (cleaned.length > RETENTION_MAX_CONTROLLING_IDEA_CHARS) return false;
  const words = cleaned.split(/\s+/).filter(Boolean).length;
  if (words > RETENTION_MAX_CONTROLLING_IDEA_WORDS) return false;
  const body = cleaned.replace(/[.!?]+$/u, "");
  if (/[.!?]/.test(body)) return false;
  return true;
}

function hasPiRequiredOrOpening(claim: RetentionGroundingClaim): boolean {
  const roles = piRoleSet(claim);
  return (
    roles.has("required") ||
    roles.has("opening_intent") ||
    roles.has("opening_hook")
  );
}

/**
 * Build an immutable candidate set: grounded (when eligible) + mode fallback.
 * Does not mutate grounding or planning context.
 */
export function buildControllingIdeaCandidates(
  context: RetentionStrategyPlanningContext,
): readonly ControllingIdeaCandidate[] {
  const { contract, grounding } = context;
  const topic = contract.topic;
  const out: ControllingIdeaCandidate[] = [];

  const eligible = grounding.claims.filter((claim) =>
    isClaimEligibleForControllingIdeaSupport(grounding, claim.claimId),
  );

  const groundedPool = eligible
    .filter((claim) => claimFitsControllingProposition(claim.text))
    .filter((claim) => {
      return (
        claimRelevantToRetentionTopic(topic, claim.text) ||
        hasPiRequiredOrOpening(claim)
      );
    })
    .sort((a, b) => {
      const byPriority = groundedPriority(a) - groundedPriority(b);
      if (byPriority !== 0) return byPriority;
      return a.claimId.localeCompare(b.claimId);
    });

  for (const claim of groundedPool) {
    if (out.length >= RETENTION_MAX_CONTROLLING_IDEA_CANDIDATES - 1) break;
    const statement = normalizeRetentionControllingIdeaStatement(claim.text);
    const claimRefs = Object.freeze([claim.claimId]);
    const factualRisk = detectRetentionFactualRisk(statement).risky;
    const validation = validateControllingIdea({
      statement,
      topic,
      claimRefs,
      grounding,
      mustPreserveThroughCompression: true,
    });
    if (!validation.ok) continue;

    out.push(
      deepFreezeCandidate({
        candidateId: buildControllingIdeaCandidateId({
          contractFingerprint: contract.contractFingerprint,
          source: "grounded_claim",
          statement,
          claimRefs,
          factualRisk,
        }),
        contractFingerprint: contract.contractFingerprint,
        statement,
        source: "grounded_claim",
        claimRefs,
        factualRisk,
        subjectAnchored: true,
      }),
    );
  }

  const fallbackStatement = assembleDeterministicControllingIdeaStatement(
    contract.scriptMode,
    topic,
  );
  const fallbackRisk = detectRetentionFactualRisk(fallbackStatement).risky;
  const fallbackValidation = validateControllingIdea({
    statement: fallbackStatement,
    topic,
    claimRefs: [],
    grounding,
    mustPreserveThroughCompression: true,
  });
  if (fallbackValidation.ok) {
    out.push(
      deepFreezeCandidate({
        candidateId: buildControllingIdeaCandidateId({
          contractFingerprint: contract.contractFingerprint,
          source: "deterministic_mode_strategy",
          statement: fallbackStatement,
          claimRefs: [],
          factualRisk: fallbackRisk,
        }),
        contractFingerprint: contract.contractFingerprint,
        statement: fallbackStatement,
        source: "deterministic_mode_strategy",
        claimRefs: Object.freeze([]),
        factualRisk: fallbackRisk,
        subjectAnchored: true,
      }),
    );
  }

  out.sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  return Object.freeze(out.slice(0, RETENTION_MAX_CONTROLLING_IDEA_CANDIDATES));
}
