/**
 * Deterministic ScriptMode controlling-idea strategy registry — Sprint 10C.
 * Domain-neutral, topic-anchored, qualitative templates. No invented facts.
 */

import type { ScriptMode } from "@/types/footiebitz";

import { RETENTION_CONTROLLING_IDEA_REGISTRY_VERSION } from "./retention-strategy.constants";
import { resolveRetentionDeterministicSubjectAnchor } from "./resolve-retention-deterministic-subject-anchor";

export interface ControllingIdeaModeStrategy {
  readonly scriptMode: ScriptMode;
  /** Template with `{topic}` placeholder; assembled within known bounds. */
  readonly statementTemplate: string;
}

const MODE_STRATEGIES: readonly ControllingIdeaModeStrategy[] = Object.freeze([
  Object.freeze({
    scriptMode: "story",
    statementTemplate:
      "The real story of {topic} is the pressure shaping its defining change.",
  }),
  Object.freeze({
    scriptMode: "tactical_review",
    statementTemplate: "{topic} turns on the pattern that changes control.",
  }),
  Object.freeze({
    scriptMode: "match_preview",
    statementTemplate:
      "{topic} matters because one key contest can shape what follows.",
  }),
  Object.freeze({
    scriptMode: "match_recap",
    statementTemplate:
      "{topic} is best understood through the moment the balance changes.",
  }),
  Object.freeze({
    scriptMode: "player_analysis",
    statementTemplate:
      "{topic} is about how one role changes the wider contest.",
  }),
  Object.freeze({
    scriptMode: "top_5",
    statementTemplate:
      "{topic} builds toward the choice that defines the shortlist.",
  }),
  Object.freeze({
    scriptMode: "historical_explainer",
    statementTemplate:
      "{topic} connects one turning point to its lasting impact.",
  }),
  Object.freeze({
    scriptMode: "opinion_debate",
    statementTemplate:
      "{topic} turns on the assumption most worth challenging.",
  }),
]);

const BY_MODE = Object.freeze(
  Object.fromEntries(
    MODE_STRATEGIES.map((entry) => [entry.scriptMode, entry]),
  ) as Record<ScriptMode, ControllingIdeaModeStrategy>,
);

export function getRetentionControllingIdeaRegistryVersion(): string {
  return RETENTION_CONTROLLING_IDEA_REGISTRY_VERSION;
}

export function listControllingIdeaModeStrategies(): readonly ControllingIdeaModeStrategy[] {
  return MODE_STRATEGIES;
}

export function getControllingIdeaModeStrategy(
  scriptMode: ScriptMode,
): ControllingIdeaModeStrategy {
  const entry = BY_MODE[scriptMode];
  if (!entry) {
    // Exhaustive ScriptMode set — defensive for future modes.
    return BY_MODE.story;
  }
  return entry;
}

/**
 * Assemble a deterministic mode fallback statement.
 * Inserts a safe qualitative subject anchor — never unverified factual-risk topic text.
 */
export function assembleDeterministicControllingIdeaStatement(
  scriptMode: ScriptMode,
  topic: string,
): string {
  const strategy = getControllingIdeaModeStrategy(scriptMode);
  const subject =
    resolveRetentionDeterministicSubjectAnchor(topic) ?? "this contest";
  return strategy.statementTemplate.replaceAll("{topic}", subject).trim();
}
