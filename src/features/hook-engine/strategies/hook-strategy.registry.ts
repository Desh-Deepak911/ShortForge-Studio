/**
 * Immutable Hook Strategy Library registry — Sprint 7B.
 * Must not import Studio Intelligence.
 */

import type { CreatorTemplateId } from "@/features/creator-templates/creator-template.types";
import type { ScriptMode } from "@/types/footiebitz";

import {
  HOOK_COMPATIBILITY_FALLBACK_STRATEGY_ID,
  HOOK_EVIDENCE_SURPRISE_STRATEGY_ID,
  HOOK_SPEAKING_WORDS_PER_SECOND,
  HOOK_USER_DIRECTED_STRATEGY_ID,
} from "../domain/hook-contract.constants";
import type { HookResolvedConstraints, HookStrategyId } from "../domain/hook-contract.types";
import type { HookStrategyDefinition } from "./hook-strategy.types";

function freezeConstraints(constraints: HookResolvedConstraints): HookResolvedConstraints {
  return Object.freeze({ ...constraints });
}

function freezeStrategy(strategy: HookStrategyDefinition): HookStrategyDefinition {
  return Object.freeze({
    ...strategy,
    preferredScriptModes: Object.freeze([...strategy.preferredScriptModes]),
    preferredTemplateIds: Object.freeze([...strategy.preferredTemplateIds]),
    constraints: freezeConstraints(strategy.constraints),
  });
}

/**
 * Opening word/time pairs must be achievable at HOOK_SPEAKING_WORDS_PER_SECOND (2.4).
 * Rule: maxOpeningWords <= maxOpeningSpokenSecondsHint * HOOK_SPEAKING_WORDS_PER_SECOND
 *
 * Defaults (~2s punchy window with headroom): 5 words / 3 seconds.
 * Compatibility fallback is tighter: 4 words / 2 seconds.
 */
function baseSafety(overrides: Partial<HookResolvedConstraints> = {}): HookResolvedConstraints {
  return freezeConstraints({
    maxOpeningWords: 5,
    maxOpeningSpokenSecondsHint: 3,
    mustPreserveSubject: true,
    allowQuestionForm: true,
    allowStatisticClaim: false,
    forbidUnverifiedSuperlatives: true,
    minProvocativeness: 0.45,
    minClarity: 0.55,
    ...overrides,
  });
}

/** Registry / QA helper — speaking-rate coherence for constraint pairs. */
export function isOpeningConstraintPairCoherent(
  constraints: HookResolvedConstraints,
): boolean {
  const { maxOpeningWords, maxOpeningSpokenSecondsHint } = constraints;
  if (
    !Number.isFinite(maxOpeningWords) ||
    !Number.isFinite(maxOpeningSpokenSecondsHint) ||
    maxOpeningWords <= 0 ||
    maxOpeningSpokenSecondsHint <= 0
  ) {
    return false;
  }
  return maxOpeningWords <= maxOpeningSpokenSecondsHint * HOOK_SPEAKING_WORDS_PER_SECOND;
}

const STRATEGIES: readonly HookStrategyDefinition[] = Object.freeze([
  freezeStrategy({
    id: HOOK_USER_DIRECTED_STRATEGY_ID,
    version: "1.0.0",
    label: "User Directed",
    description: "Prefer a sanitized user-authored opening when provided.",
    rhetoricalIntent: "Honor explicit creator opening intent subject to later validation.",
    promptGuidance:
      "Use the creator-provided opening as the first spoken sentence. Preserve the user's subject. Do not invent stats, quotes, or unverified superlatives. Selection does not declare the text safe — validation still applies.",
    preferredScriptModes: [],
    preferredTemplateIds: [],
    groundingRequirement: "none",
    requiresVerifiedFactualClaim: false,
    constraints: baseSafety({ minProvocativeness: 0.35, minClarity: 0.5 }),
  }),
  freezeStrategy({
    id: HOOK_COMPATIBILITY_FALLBACK_STRATEGY_ID,
    version: "1.0.0",
    label: "Compatibility Punchy",
    description: "Safe deterministic fallback matching today's generic punchy opening behavior.",
    rhetoricalIntent: "Short, clear, immediately understandable opening without risky claims.",
    promptGuidance:
      "Open with a short, punchy first line (~1–2 spoken seconds). Stay subject-faithful. Prefer clarity over controversy. Do not invent statistics, quotes, or unsupported factual superlatives.",
    preferredScriptModes: [],
    preferredTemplateIds: [],
    groundingRequirement: "none",
    requiresVerifiedFactualClaim: false,
    constraints: baseSafety({
      maxOpeningWords: 4,
      maxOpeningSpokenSecondsHint: 2,
      minProvocativeness: 0.3,
      minClarity: 0.6,
      allowQuestionForm: true,
      allowStatisticClaim: false,
    }),
  }),
  freezeStrategy({
    id: "curiosity_gap",
    version: "1.0.0",
    label: "Curiosity Gap",
    description: "Tease a missing piece of knowledge the narration will fill.",
    rhetoricalIntent: "Create curiosity without fabricating the missing fact.",
    promptGuidance:
      "Open by naming a gap, question, or incomplete picture the viewer wants answered. Do not invent the missing detail. Preserve the user's subject.",
    preferredScriptModes: ["story", "historical_explainer", "player_analysis"],
    preferredTemplateIds: ["educational_bullet_points", "history_explained"],
    groundingRequirement: "none",
    requiresVerifiedFactualClaim: false,
    constraints: baseSafety({ minProvocativeness: 0.5, minClarity: 0.55 }),
  }),
  freezeStrategy({
    id: "stakes_first",
    version: "1.0.0",
    label: "Stakes First",
    description: "Lead with why the fixture, decision, or moment matters now.",
    rhetoricalIntent: "Foreground stakes and urgency without invented certainty.",
    promptGuidance:
      "Open on the stake: what is at risk, on the line, or about to change. Keep the subject intact. Avoid unsupported certainty and invented stats.",
    preferredScriptModes: ["match_preview", "story", "tactical_review"],
    preferredTemplateIds: ["football_match_preview"],
    groundingRequirement: "none",
    requiresVerifiedFactualClaim: false,
    constraints: baseSafety({ minProvocativeness: 0.5, minClarity: 0.55 }),
  }),
  freezeStrategy({
    id: "provocative_question",
    version: "1.0.0",
    label: "Provocative Question",
    description: "Open with a sharp question that the narration must answer.",
    rhetoricalIntent: "Challenge attention with a focused question, not a loaded false claim.",
    promptGuidance:
      "Open with one sharp question about the subject. The body must answer it. Do not smuggle unverified facts into the question.",
    preferredScriptModes: [
      "tactical_review",
      "player_analysis",
      "opinion_debate",
      "story",
    ],
    preferredTemplateIds: ["player_analysis", "tactical_breakdown"],
    groundingRequirement: "none",
    requiresVerifiedFactualClaim: false,
    constraints: baseSafety({
      allowQuestionForm: true,
      minProvocativeness: 0.55,
      minClarity: 0.55,
    }),
  }),
  freezeStrategy({
    id: "contrarian_claim",
    version: "1.0.0",
    label: "Contrarian Claim",
    description: "Challenge a popular assumption without inventing evidence.",
    rhetoricalIntent: "Productive disagreement that stays grounded and subject-faithful.",
    promptGuidance:
      "Open by challenging a common assumption about the subject. Label opinion as opinion. Do not invent supporting stats or quotes.",
    preferredScriptModes: ["opinion_debate", "story", "player_analysis"],
    preferredTemplateIds: [],
    groundingRequirement: "none",
    requiresVerifiedFactualClaim: false,
    constraints: baseSafety({
      minProvocativeness: 0.6,
      minClarity: 0.5,
      allowStatisticClaim: false,
    }),
  }),
  freezeStrategy({
    id: "myth_challenge",
    version: "1.0.0",
    label: "Myth Challenge",
    description: "Quote or name a popular myth, then set up the correction.",
    rhetoricalIntent: "Surface a misconception without endorsing it as fact.",
    promptGuidance:
      "Open on the popular myth or misconception, clearly framed as contested. Do not present rumor as confirmed news. Preserve the user's subject.",
    preferredScriptModes: ["historical_explainer", "opinion_debate", "story"],
    preferredTemplateIds: ["myth_vs_reality"],
    groundingRequirement: "none",
    requiresVerifiedFactualClaim: false,
    constraints: baseSafety({ minProvocativeness: 0.55, minClarity: 0.55 }),
  }),
  freezeStrategy({
    id: "countdown_tease",
    version: "1.0.0",
    label: "Countdown Tease",
    description: "Tease a ranked reveal without spoiling the #1 pick immediately.",
    rhetoricalIntent: "List energy with delayed payoff.",
    promptGuidance:
      "Open by teasing the countdown or ranking without revealing the top pick. Stay subject-faithful. Do not invent ranks or stats.",
    preferredScriptModes: ["top_5", "story"],
    preferredTemplateIds: ["top_10_countdown"],
    groundingRequirement: "none",
    requiresVerifiedFactualClaim: false,
    constraints: baseSafety({ minProvocativeness: 0.5, minClarity: 0.55 }),
  }),
  freezeStrategy({
    id: "headline_first",
    version: "1.0.0",
    label: "Headline First",
    description: "Lead with the biggest newsworthy beat in plain language.",
    rhetoricalIntent: "News-style clarity first; provocation second.",
    promptGuidance:
      "Open like a headline: the biggest confirmed beat in one clear line. Distinguish rumor from confirmed news. Do not invent fees, dates, or quotes.",
    preferredScriptModes: ["match_recap", "story"],
    preferredTemplateIds: ["transfer_news"],
    groundingRequirement: "none",
    requiresVerifiedFactualClaim: false,
    constraints: baseSafety({
      minProvocativeness: 0.4,
      minClarity: 0.65,
      allowStatisticClaim: false,
    }),
  }),
  freezeStrategy({
    id: "cold_open",
    version: "1.0.0",
    label: "Cold Open",
    description: "Drop into a vivid moment before explaining the frame.",
    rhetoricalIntent: "Immersive sensory or situational entry.",
    promptGuidance:
      "Open in media res on a concrete moment or detail, then the narration can widen. Do not invent events, quotes, or stats.",
    preferredScriptModes: ["story", "historical_explainer"],
    preferredTemplateIds: ["documentary"],
    groundingRequirement: "none",
    requiresVerifiedFactualClaim: false,
    constraints: baseSafety({ minProvocativeness: 0.5, minClarity: 0.5 }),
  }),
  freezeStrategy({
    id: HOOK_EVIDENCE_SURPRISE_STRATEGY_ID,
    version: "1.0.0",
    label: "Evidence Surprise",
    description: "Lead with a surprising verified research fact.",
    rhetoricalIntent: "Surprise grounded in permitted research-verified claims only.",
    promptGuidance:
      "Open with one surprising claim that is research-verified and permitted for factual hook use. Never invent statistics. Never use unverified user context as verified evidence.",
    preferredScriptModes: [],
    preferredTemplateIds: [],
    groundingRequirement: "verified_factual",
    requiresVerifiedFactualClaim: true,
    constraints: baseSafety({
      allowStatisticClaim: true,
      minProvocativeness: 0.55,
      minClarity: 0.6,
    }),
  }),
]);

const BY_ID: ReadonlyMap<HookStrategyId, HookStrategyDefinition> = new Map(
  STRATEGIES.map((strategy) => [strategy.id, strategy]),
);

Object.freeze(BY_ID);

/** Declarative creator-template → preferred strategy (advisory). */
export const HOOK_TEMPLATE_STRATEGY_PREFERENCES: Readonly<
  Record<CreatorTemplateId, HookStrategyId>
> = Object.freeze({
  educational_bullet_points: "curiosity_gap",
  football_match_preview: "stakes_first",
  player_analysis: "provocative_question",
  top_10_countdown: "countdown_tease",
  history_explained: "curiosity_gap",
  transfer_news: "headline_first",
  tactical_breakdown: "provocative_question",
  documentary: "cold_open",
  myth_vs_reality: "myth_challenge",
});

/** Deterministic script-mode defaults. */
export const HOOK_SCRIPT_MODE_DEFAULT_STRATEGIES: Readonly<
  Record<ScriptMode, HookStrategyId>
> = Object.freeze({
  story: "cold_open",
  tactical_review: "provocative_question",
  match_preview: "stakes_first",
  match_recap: "headline_first",
  player_analysis: "provocative_question",
  top_5: "countdown_tease",
  historical_explainer: "curiosity_gap",
  opinion_debate: "contrarian_claim",
});

export const HOOK_STRATEGY_IDS: readonly HookStrategyId[] = Object.freeze(
  STRATEGIES.map((strategy) => strategy.id),
);

export function getHookStrategy(
  strategyId: HookStrategyId,
): HookStrategyDefinition | null {
  return BY_ID.get(strategyId) ?? null;
}

export function listHookStrategies(): readonly HookStrategyDefinition[] {
  return STRATEGIES;
}

export function getCompatibilityFallbackStrategy(): HookStrategyDefinition {
  const strategy = BY_ID.get(HOOK_COMPATIBILITY_FALLBACK_STRATEGY_ID);
  if (!strategy) {
    throw new Error("compatibility_punchy strategy missing from Hook Strategy Library.");
  }
  return strategy;
}
