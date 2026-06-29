import type { ScriptMode, Tone } from "@/types/footiebitz";

import type { GraphContext, GraphContextFact } from "../context/graph-context.types";
import { getNarrationWordBudget } from "@/features/story/utils/narration-duration-budget.utils";

import type { NarrativeBeat, NarrativePlan, NarrativeStructure } from "./narrative-plan.types";
import {
  resolveStoryStructureForMode,
  type StoryStructureBeatTemplate,
} from "./story-structure-intelligence.utils";

const DEFAULT_TARGET_DURATION_SECONDS = 30;
const OPENING_HOOK_MAX_WORDS = 8;

export interface BuildNarrativePlanInput {
  graphContext: GraphContext;
  /** When set, beat target word counts are derived from narration budget. */
  targetDurationSeconds?: number;
}

interface FactPool {
  ranked: GraphContextFact[];
  verified: GraphContextFact[];
  statistics: GraphContextFact[];
  timeline: GraphContextFact[];
  fixtures: GraphContextFact[];
}

const MODE_TONE: Record<ScriptMode, Tone> = {
  top_5: "dramatic",
  player_analysis: "dramatic",
  tactical_review: "tactical",
  match_preview: "news",
  match_recap: "dramatic",
  story: "emotional",
  historical_explainer: "dramatic",
  opinion_debate: "dramatic",
};

function resolveBeatTemplates(mode: ScriptMode): StoryStructureBeatTemplate[] {
  return resolveStoryStructureForMode(mode).beats;
}

function collectFactPool(context: GraphContext): FactPool {
  const verified = context.verifiedFacts.filter((fact) => fact.type !== "manual_note");

  return {
    ranked: [...context.rankedFacts].sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0)),
    verified,
    statistics: [...context.statisticFacts],
    timeline: [...context.timelineFacts],
    fixtures: [...context.fixtureFacts],
  };
}

function allocateBeatWordCounts(
  templates: StoryStructureBeatTemplate[],
  targetDurationSeconds?: number,
): number[] {
  const budget = getNarrationWordBudget(targetDurationSeconds ?? DEFAULT_TARGET_DURATION_SECONDS);
  const totalWeight = templates.reduce((sum, template) => sum + template.weight, 0);

  return templates.map((template) => {
    const raw = Math.max(8, Math.round((template.weight / totalWeight) * budget.idealMaxWords));

    if (template.openingHook) {
      return Math.min(raw, OPENING_HOOK_MAX_WORDS);
    }

    return raw;
  });
}

function takeFacts(facts: GraphContextFact[], count: number): GraphContextFact[] {
  return facts.splice(0, Math.max(0, count));
}

function factIds(facts: GraphContextFact[]): string[] {
  return facts.map((fact) => fact.id);
}

function assignRankBeatFacts(pool: FactPool, templates: StoryStructureBeatTemplate[]): Map<string, string[]> {
  const assignments = new Map<string, string[]>();
  const rankTemplates = templates.filter((template) => template.id.startsWith("rank-"));

  for (const template of rankTemplates) {
    const rankNumber = Number.parseInt(template.id.replace("rank-", ""), 10);
    const match = pool.ranked.find((fact) => fact.rank === rankNumber);
    assignments.set(template.id, match ? [match.id] : []);
  }

  return assignments;
}

function assignBeatFacts(context: GraphContext, templates: StoryStructureBeatTemplate[]): Map<string, string[]> {
  const pool = collectFactPool(context);
  const assignments = new Map<string, string[]>();
  const mode = context.selectedMode;

  if (mode === "top_5") {
    const rankAssignments = assignRankBeatFacts(pool, templates);
    for (const [beatId, ids] of rankAssignments) {
      assignments.set(beatId, ids);
    }

    assignments.set(
      "countdown-opening",
      factIds([...takeFacts(pool.fixtures, 1), ...takeFacts(pool.verified, 1)]),
    );

    return assignments;
  }

  if (mode === "player_analysis") {
    const entityFactIds = context.entitySummaries.flatMap((summary) => summary.factIds);
    assignments.set("opening-grab", entityFactIds.slice(0, 1));
    assignments.set("performance-story", [
      ...factIds(takeFacts(pool.statistics, 2)),
      ...factIds(takeFacts(pool.verified, 2)),
      ...entityFactIds.slice(1, 3),
    ]);
    assignments.set("legacy-impact", factIds(takeFacts(pool.verified, 1)));
    return assignments;
  }

  if (mode === "tactical_review") {
    assignments.set("bold-claim", factIds(takeFacts(pool.fixtures, 1)));
    assignments.set("tactical-explanation", factIds([...takeFacts(pool.fixtures, 1), ...takeFacts(pool.statistics, 1)]));
    assignments.set("evidence", factIds([...takeFacts(pool.statistics, 1), ...takeFacts(pool.timeline, 1)]));
    assignments.set("takeaway", factIds(takeFacts(pool.verified, 1)));
    return assignments;
  }

  if (mode === "match_preview") {
    assignments.set("question-opening", factIds(takeFacts(pool.fixtures, 1)));
    assignments.set("stakes", factIds(takeFacts(pool.verified, 1)));
    assignments.set("key-battle", factIds(takeFacts(pool.verified, 1)));
    assignments.set(
      "prediction-cta",
      factIds([...takeFacts(pool.timeline, 1), ...takeFacts(pool.verified, 1)]),
    );
    return assignments;
  }

  if (mode === "match_recap") {
    assignments.set("result-opening", factIds(takeFacts(pool.fixtures, 1)));
    assignments.set("turning-point", factIds(takeFacts(pool.timeline, 1)));
    assignments.set("hero-or-failure", factIds(takeFacts(pool.verified, 1)));
    assignments.set(
      "impact",
      factIds([...takeFacts(pool.statistics, 1), ...takeFacts(pool.verified, 1)]),
    );
    return assignments;
  }

  if (mode === "opinion_debate") {
    assignments.set("debate-opening", factIds(takeFacts(pool.verified, 1)));
    assignments.set("argument", factIds(takeFacts(pool.verified, 1)));
    assignments.set("counterpoint", factIds(takeFacts(pool.verified, 1)));
    assignments.set("takeaway", factIds(takeFacts(pool.verified, 1)));
    return assignments;
  }

  if (mode === "historical_explainer") {
    assignments.set("curiosity-opening", factIds(takeFacts(pool.verified, 1)));
    assignments.set("explanation", factIds([...takeFacts(pool.fixtures, 1), ...takeFacts(pool.verified, 1)]));
    assignments.set("example", factIds([...takeFacts(pool.statistics, 1), ...takeFacts(pool.timeline, 1)]));
    assignments.set("payoff", factIds(takeFacts(pool.verified, 1)));
    return assignments;
  }

  if (mode === "story") {
    assignments.set("cold-open", factIds(takeFacts(pool.verified, 1)));
    assignments.set("context", factIds([...takeFacts(pool.fixtures, 1), ...takeFacts(pool.verified, 1)]));
    assignments.set("emotional-payoff", factIds(takeFacts(pool.verified, 1)));
    return assignments;
  }

  return assignments;
}

function buildForbiddenClaims(context: GraphContext): string[] {
  const claims = new Set<string>();

  for (const rule of context.groundingRules) {
    const trimmed = rule.trim();
    if (!trimmed) {
      continue;
    }

    if (/do not invent|must not|not confirmed|never call|if selected|if he appears/i.test(trimmed)) {
      claims.add(trimmed.replace(/^Grounding constraint:\s*/i, ""));
    }
  }

  for (const warning of context.warnings) {
    const trimmed = warning.trim();
    if (trimmed) {
      claims.add(trimmed);
    }
  }

  return [...claims];
}

function buildModeSpecificRules(context: GraphContext, structure: NarrativeStructure): string[] {
  const rules = new Set<string>();

  for (const rule of context.groundingRules) {
    const trimmed = rule.trim();
    if (trimmed && !trimmed.startsWith("Grounding constraint:")) {
      rules.add(trimmed.replace(/^-\s*/, ""));
    }
  }

  if (structure === "countdown_ranked_reveal") {
    rules.add("Preserve exact ranking order and values from ranked facts.");
  }

  if (structure === "hook_story_payoff") {
    rules.add("Keep the player as the primary focus throughout the script.");
  }

  if (structure === "bold_claim_explanation_evidence_takeaway") {
    rules.add("Explain tactics using verified events, statistics, and fixture context only.");
  }

  if (structure === "question_stakes_battle_cta") {
    rules.add("Avoid definitive predictions unless explicitly supported by context.");
  }

  if (structure === "debate_argument_counterpoint_takeaway") {
    rules.add("Present contrasting angles without inventing unsupported claims.");
  }

  if (context.warnings.length > 0) {
    rules.add("Treat warnings as grounding constraints — do not override them.");
  }

  return [...rules];
}

function allGraphFactIds(context: GraphContext): string[] {
  const ids = new Set<string>();

  for (const collection of [
    context.rankedFacts,
    context.verifiedFacts,
    context.statisticFacts,
    context.timelineFacts,
    context.fixtureFacts,
  ]) {
    for (const fact of collection) {
      if (fact.type !== "manual_note") {
        ids.add(fact.id);
      }
    }
  }

  return [...ids];
}

/**
 * Builds a mode-aware narrative plan from GraphContext.
 *
 * Uses only facts present in the graph — does not invent missing data.
 */
export function buildNarrativePlan(input: BuildNarrativePlanInput): NarrativePlan {
  const { graphContext, targetDurationSeconds } = input;
  const storyStructure = resolveStoryStructureForMode(graphContext.selectedMode);
  const structure = storyStructure.arc;
  const templates = resolveBeatTemplates(graphContext.selectedMode);
  const wordCounts = allocateBeatWordCounts(templates, targetDurationSeconds);
  const factAssignments = assignBeatFacts(graphContext, templates);
  const tone = MODE_TONE[graphContext.selectedMode];

  const beats: NarrativeBeat[] = templates.map((template, index) => ({
    id: template.id,
    label: template.label,
    purpose: template.purpose,
    targetWordCount: wordCounts[index] ?? 20,
    requiredFactIds: factAssignments.get(template.id) ?? [],
    tone,
    ...(template.openingHook ? { openingHook: true } : {}),
  }));

  const requiredFacts = [...new Set(beats.flatMap((beat) => beat.requiredFactIds))];
  const availableFacts = allGraphFactIds(graphContext);
  const optionalFacts = availableFacts.filter((factId) => !requiredFacts.includes(factId));

  return {
    structure,
    structureLabel: storyStructure.arcLabel,
    beats,
    requiredFacts,
    optionalFacts,
    forbiddenClaims: buildForbiddenClaims(graphContext),
    modeSpecificRules: buildModeSpecificRules(graphContext, structure),
  };
}
