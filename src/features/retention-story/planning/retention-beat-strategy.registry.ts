/**
 * Immutable ScriptMode → Retention beat-purpose strategy registry — Sprint 10D.
 *
 * Each strategy declares a fixed opening (exactly one hook_handoff), an ordered
 * body emphasis, and defers the terminal purpose to the contract endingStrategy.
 * Deterministic, domain-neutral, topic-anchored. No invented facts, no model calls.
 */

import type { ScriptMode } from "@/types/footiebitz";
import type { EndingStrategy } from "../domain/retention-story-contract.types";
import { sanitizeRetentionBeatText } from "./retention-beat-semantics";
import {
  RETENTION_BEAT_STRATEGY_REGISTRY_VERSION,
  RETENTION_MAX_BEAT_EMOTIONAL_INTENT_CHARS,
  RETENTION_MAX_BEAT_INFORMATION_CONTRIBUTION_CHARS,
  RETENTION_MAX_BEAT_NARRATION_GOAL_CHARS,
  RETENTION_MAX_BEAT_VIEWER_QUESTION_CHARS,
  RETENTION_MAX_BEAT_VISUAL_OPPORTUNITY_CHARS,
} from "./retention-story-plan.constants";
import type {
  RetentionBeatControllingIdeaRelation,
  RetentionBeatNoveltyRole,
  RetentionBeatPayoffRelation,
  RetentionBeatPurpose,
  RetentionBeatSemanticFields,
} from "./retention-story-plan.types";

export interface RetentionBeatStrategy {
  readonly scriptMode: ScriptMode;
  /** Always exactly one hook_handoff at index 0. */
  readonly openingPurpose: "hook_handoff";
  /** Ordered body emphasis expanded/cycled to fit the resolved beat count. */
  readonly bodyPurposes: readonly RetentionBeatPurpose[];
}

const MODE_STRATEGIES: readonly RetentionBeatStrategy[] = Object.freeze([
  Object.freeze({
    scriptMode: "story" as ScriptMode,
    openingPurpose: "hook_handoff" as const,
    bodyPurposes: Object.freeze([
      "curiosity",
      "reframe",
      "escalation",
      "conflict",
      "reveal",
    ] as RetentionBeatPurpose[]),
  }),
  Object.freeze({
    scriptMode: "tactical_review" as ScriptMode,
    openingPurpose: "hook_handoff" as const,
    bodyPurposes: Object.freeze([
      "curiosity",
      "reframe",
      "proof",
      "escalation",
      "reveal",
    ] as RetentionBeatPurpose[]),
  }),
  Object.freeze({
    scriptMode: "match_preview" as ScriptMode,
    openingPurpose: "hook_handoff" as const,
    bodyPurposes: Object.freeze([
      "curiosity",
      "escalation",
      "conflict",
      "reframe",
      "proof",
    ] as RetentionBeatPurpose[]),
  }),
  Object.freeze({
    scriptMode: "match_recap" as ScriptMode,
    openingPurpose: "hook_handoff" as const,
    bodyPurposes: Object.freeze([
      "curiosity",
      "escalation",
      "conflict",
      "reveal",
      "reframe",
    ] as RetentionBeatPurpose[]),
  }),
  Object.freeze({
    scriptMode: "player_analysis" as ScriptMode,
    openingPurpose: "hook_handoff" as const,
    bodyPurposes: Object.freeze([
      "curiosity",
      "proof",
      "reframe",
      "escalation",
      "reveal",
    ] as RetentionBeatPurpose[]),
  }),
  Object.freeze({
    scriptMode: "top_5" as ScriptMode,
    openingPurpose: "hook_handoff" as const,
    bodyPurposes: Object.freeze([
      "curiosity",
      "escalation",
      "proof",
      "escalation",
      "reveal",
    ] as RetentionBeatPurpose[]),
  }),
  Object.freeze({
    scriptMode: "historical_explainer" as ScriptMode,
    openingPurpose: "hook_handoff" as const,
    bodyPurposes: Object.freeze([
      "curiosity",
      "reframe",
      "proof",
      "escalation",
      "reveal",
    ] as RetentionBeatPurpose[]),
  }),
  Object.freeze({
    scriptMode: "opinion_debate" as ScriptMode,
    openingPurpose: "hook_handoff" as const,
    bodyPurposes: Object.freeze([
      "curiosity",
      "reframe",
      "conflict",
      "escalation",
      "proof",
    ] as RetentionBeatPurpose[]),
  }),
]);

const BY_MODE = Object.freeze(
  Object.fromEntries(
    MODE_STRATEGIES.map((entry) => [entry.scriptMode, entry]),
  ) as Record<ScriptMode, RetentionBeatStrategy>,
);

export function getRetentionBeatStrategyRegistryVersion(): string {
  return RETENTION_BEAT_STRATEGY_REGISTRY_VERSION;
}

export function listRetentionBeatStrategies(): readonly RetentionBeatStrategy[] {
  return MODE_STRATEGIES;
}

export function getRetentionBeatStrategy(
  scriptMode: ScriptMode,
): RetentionBeatStrategy {
  return BY_MODE[scriptMode] ?? BY_MODE.story;
}

/** Terminal beat purpose is governed by the contract endingStrategy, not the mode. */
export function mapEndingStrategyToTerminalPurpose(
  ending: EndingStrategy,
): RetentionBeatPurpose {
  switch (ending) {
    case "payoff_reveal":
      return "payoff";
    case "challenge":
      return "challenge";
    case "resolution":
      return "resolution";
    case "open_loop":
      return "twist";
    default:
      return "payoff";
  }
}

/**
 * Resolve the ordered purpose sequence for a plan.
 * Index 0 is always hook_handoff; the last index is the ending-mapped terminal.
 * Middle purposes are cycled from the mode body emphasis (never duplicating the
 * terminal payoff purpose, which is not part of any body emphasis).
 */
export function resolveRetentionBeatPurposeSequence(
  scriptMode: ScriptMode,
  ending: EndingStrategy,
  beatCount: number,
): readonly RetentionBeatPurpose[] {
  const strategy = getRetentionBeatStrategy(scriptMode);
  const terminal = mapEndingStrategyToTerminalPurpose(ending);
  const n = Math.max(2, Math.floor(beatCount));

  const sequence: RetentionBeatPurpose[] = [strategy.openingPurpose];
  const middleCount = n - 2;
  for (let i = 0; i < middleCount; i++) {
    sequence.push(strategy.bodyPurposes[i % strategy.bodyPurposes.length]!);
  }
  sequence.push(terminal);
  return Object.freeze(sequence);
}

export function resolveRetentionBeatControllingIdeaRelation(
  index: number,
  count: number,
): RetentionBeatControllingIdeaRelation {
  if (index === 0) return "establishes";
  if (index === count - 1) return "pays_off";
  return "supports";
}

/**
 * Exactly one "deliver" (terminal) when payoff is required, with a single "setup"
 * on the beat preceding it. Otherwise every beat is "none".
 */
export function resolveRetentionBeatPayoffRelations(
  count: number,
  requirePayoff: boolean,
): readonly RetentionBeatPayoffRelation[] {
  const relations: RetentionBeatPayoffRelation[] = new Array(count).fill("none");
  if (requirePayoff && count >= 2) {
    relations[count - 1] = "deliver";
    relations[count - 2] = "setup";
  }
  return Object.freeze(relations);
}

const ESCALATING_PURPOSES: ReadonlySet<RetentionBeatPurpose> = new Set([
  "escalation",
  "conflict",
  "twist",
  "reveal",
]);

export function resolveRetentionBeatNoveltyRole(
  purpose: RetentionBeatPurpose,
  index: number,
  count: number,
): RetentionBeatNoveltyRole {
  if (index === 0) return "setup";
  if (index === count - 1) return "payoff";
  return ESCALATING_PURPOSES.has(purpose) ? "escalate" : "bridge";
}

/**
 * Deterministic, non-factual, topic-anchored templates per purpose.
 * Text deliberately avoids numbers/stats/superlatives so it carries no factual risk.
 */
const PURPOSE_TEMPLATES: Record<
  RetentionBeatPurpose,
  RetentionBeatSemanticFields
> = Object.freeze({
  hook_handoff: {
    emotionalIntent: "Open with a charged pull into {topic}.",
    viewerQuestion: "Why does {topic} matter right now?",
    informationContribution: "Frame the central tension of {topic} without resolving it.",
    narrationGoal: "Land a tight opening that hands into the body smoothly.",
    visualOpportunity: "A striking establishing shot that signals the stakes of {topic}.",
  },
  curiosity: {
    emotionalIntent: "Deepen curiosity about what shapes {topic}.",
    viewerQuestion: "What is really driving {topic}?",
    informationContribution: "Introduce the underlying pattern behind {topic}.",
    narrationGoal: "Raise an open question the viewer wants answered.",
    visualOpportunity: "A visual that hints at the hidden pattern in {topic}.",
  },
  reframe: {
    emotionalIntent: "Shift how the viewer sees {topic}.",
    viewerQuestion: "What if the usual view of {topic} is incomplete?",
    informationContribution: "Reframe {topic} around its decisive pressure.",
    narrationGoal: "Challenge the assumption and pivot the angle.",
    visualOpportunity: "A contrast visual that reframes {topic}.",
  },
  proof: {
    emotionalIntent: "Build conviction about the read on {topic}.",
    viewerQuestion: "What supports this read of {topic}?",
    informationContribution: "Support the central read of {topic} with grounding.",
    narrationGoal: "Deliver the supporting detail with clarity.",
    visualOpportunity: "A visual that illustrates the supporting detail for {topic}.",
  },
  escalation: {
    emotionalIntent: "Raise the stakes around {topic}.",
    viewerQuestion: "How high can the stakes on {topic} climb?",
    informationContribution: "Escalate the tension shaping {topic}.",
    narrationGoal: "Increase pace and intensity toward the turn.",
    visualOpportunity: "A quickening sequence that raises intensity for {topic}.",
  },
  conflict: {
    emotionalIntent: "Sharpen the central conflict in {topic}.",
    viewerQuestion: "What forces collide in {topic}?",
    informationContribution: "Expose the opposing pressures inside {topic}.",
    narrationGoal: "Stage the clash that defines the moment.",
    visualOpportunity: "A visual juxtaposition of the opposing sides of {topic}.",
  },
  twist: {
    emotionalIntent: "Surprise the viewer with a turn in {topic}.",
    viewerQuestion: "What changes everything about {topic}?",
    informationContribution: "Introduce the unexpected turn in {topic}.",
    narrationGoal: "Deliver a surprising pivot that resets expectations.",
    visualOpportunity: "A reveal visual that flips the read on {topic}.",
  },
  reveal: {
    emotionalIntent: "Unveil the key insight behind {topic}.",
    viewerQuestion: "What has been hidden in {topic}?",
    informationContribution: "Reveal the decisive insight about {topic}.",
    narrationGoal: "Expose the core insight the story has built toward.",
    visualOpportunity: "A clarifying visual that exposes the insight in {topic}.",
  },
  payoff: {
    emotionalIntent: "Deliver satisfying resolution for {topic}.",
    viewerQuestion: "So what does {topic} finally mean?",
    informationContribution: "Pay off the central read of {topic}.",
    narrationGoal: "Close the loop opened at the start with a firm payoff.",
    visualOpportunity: "A payoff visual that resolves the arc of {topic}.",
  },
  challenge: {
    emotionalIntent: "Provoke the viewer to act on {topic}.",
    viewerQuestion: "What will you decide about {topic}?",
    informationContribution: "Turn the central read of {topic} into a challenge.",
    narrationGoal: "Issue a pointed challenge that lingers.",
    visualOpportunity: "A direct visual that puts the challenge of {topic} forward.",
  },
  resolution: {
    emotionalIntent: "Settle the arc of {topic} with clarity.",
    viewerQuestion: "How does {topic} come together?",
    informationContribution: "Resolve the central read of {topic}.",
    narrationGoal: "Bring the threads together into a cohesive resolution.",
    visualOpportunity: "A closing visual that resolves {topic}.",
  },
});

/** Build canonical (bounded, non-factual) deterministic beat text for a purpose. */
export function buildRetentionBeatTemplateFields(
  purpose: RetentionBeatPurpose,
  topic: string,
): RetentionBeatSemanticFields {
  const template = PURPOSE_TEMPLATES[purpose];
  const fill = (text: string): string => text.replaceAll("{topic}", topic);
  return Object.freeze({
    emotionalIntent: sanitizeRetentionBeatText(
      fill(template.emotionalIntent),
      RETENTION_MAX_BEAT_EMOTIONAL_INTENT_CHARS,
    ),
    viewerQuestion: sanitizeRetentionBeatText(
      fill(template.viewerQuestion),
      RETENTION_MAX_BEAT_VIEWER_QUESTION_CHARS,
    ),
    informationContribution: sanitizeRetentionBeatText(
      fill(template.informationContribution),
      RETENTION_MAX_BEAT_INFORMATION_CONTRIBUTION_CHARS,
    ),
    narrationGoal: sanitizeRetentionBeatText(
      fill(template.narrationGoal),
      RETENTION_MAX_BEAT_NARRATION_GOAL_CHARS,
    ),
    visualOpportunity: sanitizeRetentionBeatText(
      fill(template.visualOpportunity),
      RETENTION_MAX_BEAT_VISUAL_OPPORTUNITY_CHARS,
    ),
  });
}
