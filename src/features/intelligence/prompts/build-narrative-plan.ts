import type { ScriptMode, Tone } from "@/types/footiebitz";

import type { GraphContext, GraphContextFact } from "../context/graph-context.types";
import { getNarrationWordBudget } from "@/features/story/utils/narration-duration-budget.utils";

import type { NarrativeBeat, NarrativeOpeningIntent, NarrativePlan, NarrativeStructure } from "./narrative-plan.types";
import {
  resolveStoryStructureForMode,
  type StoryStructureBeatTemplate,
} from "./story-structure-intelligence.utils";
import {
  hasEvidenceLedSurprisePreference,
  normalizeEvidenceLedSurprisePreference,
  type EvidenceLedSurprisePreferenceKind,
} from "./resolve-evidence-led-surprise-preference";

const DEFAULT_TARGET_DURATION_SECONDS = 30;
const OPENING_HOOK_MAX_WORDS = 8;

export interface BuildNarrativePlanInput {
  graphContext: GraphContext;
  /** When set, beat target word counts are derived from narration budget. */
  targetDurationSeconds?: number;
  /**
   * Explicit creator preference for evidence-led surprise (Sprint 7D.3 / 7E).
   * `evidence_statistic` prefers eligible statistic facts on the opening beat.
   * `evidence_fact` (or legacy `true`) may use other eligible factual classes.
   */
  evidenceLedSurprisePreference?: boolean | EvidenceLedSurprisePreferenceKind;
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

function isEligibleProviderFact(fact: GraphContextFact): boolean {
  if (fact.type === "manual_note") {
    return false;
  }
  const source = fact.provenance?.source;
  return source !== "user" && source !== "inferred";
}

/**
 * When creator preference is evidence_statistic, pin the opening beat to eligible
 * statistic facts only — never fall back to an unrelated fixture/scoreline.
 */
function applyEvidenceSurpriseOpeningAssignments(
  assignments: Map<string, string[]>,
  templates: StoryStructureBeatTemplate[],
  graphContext: GraphContext,
  preference: EvidenceLedSurprisePreferenceKind | undefined,
): void {
  if (preference !== "evidence_statistic") {
    return;
  }

  const opening = templates.find((template) => template.openingHook === true);
  if (!opening) {
    return;
  }

  const eligibleStats = graphContext.statisticFacts
    .filter(isEligibleProviderFact)
    .map((fact) => fact.id);

  assignments.set(opening.id, eligibleStats.slice(0, 1));
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

function findGraphFact(
  context: GraphContext,
  factId: string,
): GraphContextFact | undefined {
  for (const collection of [
    context.rankedFacts,
    context.statisticFacts,
    context.fixtureFacts,
    context.timelineFacts,
    context.verifiedFacts,
  ]) {
    const match = collection.find((fact) => fact.id === factId);
    if (match) {
      return match;
    }
  }
  return undefined;
}

/**
 * Deterministic PI opening-intent resolution (Sprint 7D.2 / 7D.3).
 * Requires an openingHook beat that **explicitly** requests evidenceLedSurprise
 * AND has eligible provider-verified evidence-bearing fact IDs.
 * Mere presence of ranked/fixture/statistic/timeline facts is insufficient.
 */
export function resolveNarrativeOpeningIntent(
  beats: NarrativeBeat[],
  graphContext: GraphContext,
): NarrativeOpeningIntent | undefined {
  const openingFactIds = [
    ...new Set(
      beats
        .filter(
          (beat) =>
            beat.openingHook === true && beat.evidenceLedSurprise === true,
        )
        .flatMap((beat) => beat.requiredFactIds),
    ),
  ];

  if (openingFactIds.length === 0) {
    return undefined;
  }

  const evidenceBearingIds = new Set(
    [
      ...graphContext.rankedFacts,
      ...graphContext.statisticFacts,
      ...graphContext.fixtureFacts,
      ...graphContext.timelineFacts,
      ...graphContext.verifiedFacts,
    ].map((fact) => fact.id),
  );

  const eligible = openingFactIds
    .filter((factId) => evidenceBearingIds.has(factId))
    .filter((factId) => {
      const fact = findGraphFact(graphContext, factId);
      if (!fact) {
        return false;
      }
      if (fact.type === "manual_note") {
        return false;
      }
      const source = fact.provenance?.source;
      return source !== "user" && source !== "inferred";
    })
    .sort();

  if (eligible.length === 0) {
    return undefined;
  }

  return {
    kind: "evidence_led_surprise",
    factIds: eligible,
  };
}

/**
 * Builds a mode-aware narrative plan from GraphContext.
 *
 * Uses only facts present in the graph — does not invent missing data.
 * Evidence-led surprise is marked only when the creator preference is explicit
 * (Sprint 7D.3); openingIntent is omitted when eligible facts are unavailable.
 */
export function buildNarrativePlan(input: BuildNarrativePlanInput): NarrativePlan {
  const { graphContext, targetDurationSeconds } = input;
  const storyStructure = resolveStoryStructureForMode(graphContext.selectedMode);
  const structure = storyStructure.arc;
  const templates = resolveBeatTemplates(graphContext.selectedMode);
  const wordCounts = allocateBeatWordCounts(templates, targetDurationSeconds);
  const preference = normalizeEvidenceLedSurprisePreference(
    input.evidenceLedSurprisePreference,
  );
  const factAssignments = assignBeatFacts(graphContext, templates);
  applyEvidenceSurpriseOpeningAssignments(
    factAssignments,
    templates,
    graphContext,
    preference,
  );
  const tone = MODE_TONE[graphContext.selectedMode];
  const requestSurprise = hasEvidenceLedSurprisePreference(preference);

  const beats: NarrativeBeat[] = templates.map((template, index) => ({
    id: template.id,
    label: template.label,
    purpose: template.purpose,
    targetWordCount: wordCounts[index] ?? 20,
    requiredFactIds: factAssignments.get(template.id) ?? [],
    tone,
    ...(template.openingHook ? { openingHook: true } : {}),
    ...(requestSurprise && template.openingHook
      ? { evidenceLedSurprise: true }
      : {}),
  }));

  const requiredFacts = [...new Set(beats.flatMap((beat) => beat.requiredFactIds))];
  const availableFacts = allGraphFactIds(graphContext);
  const optionalFacts = availableFacts.filter((factId) => !requiredFacts.includes(factId));
  const openingIntent = resolveNarrativeOpeningIntent(beats, graphContext);

  return {
    structure,
    structureLabel: storyStructure.arcLabel,
    beats,
    requiredFacts,
    optionalFacts,
    forbiddenClaims: buildForbiddenClaims(graphContext),
    modeSpecificRules: buildModeSpecificRules(graphContext, structure),
    ...(openingIntent ? { openingIntent } : {}),
  };
}
