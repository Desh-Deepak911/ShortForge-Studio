import type { ScriptMode, Tone } from "@/types/footiebitz";

import type { GraphContext, GraphContextFact } from "../context/graph-context.types";
import { getNarrationWordBudget } from "@/features/story/utils/narration-duration-budget.utils";

import type { NarrativeBeat, NarrativePlan, NarrativeStructure } from "./narrative-plan.types";

const DEFAULT_TARGET_DURATION_SECONDS = 30;

interface BeatTemplate {
  id: string;
  label: string;
  purpose: string;
  weight: number;
}

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

const MODE_STRUCTURE: Record<ScriptMode, NarrativeStructure> = {
  top_5: "ranked_countdown",
  player_analysis: "player_profile",
  tactical_review: "tactical_breakdown",
  match_preview: "match_preview",
  match_recap: "match_recap",
  story: "story_arc",
  historical_explainer: "historical_explainer",
  opinion_debate: "debate",
};

const TOP_5_BEATS: BeatTemplate[] = [
  { id: "hook", label: "Hook", purpose: "Open with stakes and why this ranking matters.", weight: 1.2 },
  { id: "rank-5", label: "Rank 5", purpose: "Introduce the fifth-ranked entry using verified ranking data.", weight: 1 },
  { id: "rank-4", label: "Rank 4", purpose: "Cover the fourth-ranked entry without changing order.", weight: 1 },
  { id: "rank-3", label: "Rank 3", purpose: "Cover the third-ranked entry without changing order.", weight: 1 },
  { id: "rank-2", label: "Rank 2", purpose: "Build tension toward the top spot.", weight: 1 },
  { id: "rank-1", label: "Rank 1", purpose: "Reveal the top-ranked entry with exact values from context.", weight: 1.1 },
  { id: "closing-line", label: "Closing line", purpose: "Land a concise takeaway tied to verified facts only.", weight: 0.9 },
];

const PLAYER_BEATS: BeatTemplate[] = [
  { id: "hook", label: "Hook", purpose: "Open on the player and central question.", weight: 1.1 },
  { id: "context", label: "Context", purpose: "Set team, competition, and role from verified context.", weight: 1 },
  { id: "strength", label: "Strength", purpose: "Highlight a verified strength or standout trait.", weight: 1.1 },
  { id: "concern", label: "Concern/limitation", purpose: "Note a verified limitation or caveat if present.", weight: 0.9 },
  { id: "evidence", label: "Evidence", purpose: "Support claims with verified stats or facts.", weight: 1.2 },
  { id: "future-angle", label: "Future angle", purpose: "Forward-looking angle only when supported by context.", weight: 0.9 },
  { id: "closing-line", label: "Closing line", purpose: "Close with a grounded summary.", weight: 0.8 },
];

const TACTICAL_BEATS: BeatTemplate[] = [
  { id: "hook", label: "Hook", purpose: "Open on the tactical story of the match.", weight: 1.1 },
  { id: "shape", label: "Shape/formation", purpose: "Describe verified shape or lineup context.", weight: 1.1 },
  { id: "key-pattern", label: "Key pattern", purpose: "Explain a recurring pattern supported by facts.", weight: 1.2 },
  { id: "turning-point", label: "Turning point", purpose: "Identify a verified turning point or key event.", weight: 1.1 },
  { id: "player-zone-focus", label: "Player/zone focus", purpose: "Zoom in on a player or zone with verified detail.", weight: 1 },
  { id: "why-it-mattered", label: "Why it mattered", purpose: "Connect tactics to outcome using verified evidence.", weight: 1.1 },
  { id: "closing-line", label: "Closing line", purpose: "Close with a tactical takeaway from context.", weight: 0.8 },
];

const PREVIEW_BEATS: BeatTemplate[] = [
  { id: "hook", label: "Hook", purpose: "Open with why this fixture matters.", weight: 1.1 },
  { id: "stakes", label: "Stakes", purpose: "Frame stakes from verified fixture and context.", weight: 1.1 },
  { id: "form-context", label: "Form/context", purpose: "Summarize verified form or pre-match context.", weight: 1 },
  { id: "key-battle", label: "Key battle", purpose: "Highlight a matchup or battle supported by facts.", weight: 1.1 },
  { id: "what-to-watch", label: "What to watch", purpose: "Call out watch points grounded in research.", weight: 1.1 },
  { id: "prediction-closing", label: "Prediction/closing angle", purpose: "Close with a cautious angle — no invented predictions.", weight: 0.9 },
];

const RECAP_BEATS: BeatTemplate[] = [
  { id: "hook", label: "Hook", purpose: "Open on the result and headline story.", weight: 1.1 },
  { id: "score-story", label: "Score/story", purpose: "State verified scoreline and match story.", weight: 1.2 },
  { id: "turning-point", label: "Turning point", purpose: "Cover the decisive moment from verified events.", weight: 1.1 },
  { id: "standout-performer", label: "Standout performer", purpose: "Highlight a performer backed by verified facts.", weight: 1 },
  { id: "tactical-stat-reason", label: "Tactical/stat reason", purpose: "Explain why the result happened using stats/events.", weight: 1.1 },
  { id: "closing-line", label: "Closing line", purpose: "Close with a grounded recap takeaway.", weight: 0.8 },
];

const GENERIC_BEATS: BeatTemplate[] = [
  { id: "hook", label: "Hook", purpose: "Open with the central question or tension.", weight: 1.1 },
  { id: "context", label: "Context", purpose: "Establish background from verified context only.", weight: 1.1 },
  { id: "core-argument", label: "Core argument", purpose: "State the main claim supported by available facts.", weight: 1.2 },
  { id: "evidence", label: "Evidence", purpose: "Present verified facts that support the argument.", weight: 1.2 },
  { id: "tension", label: "Tension", purpose: "Introduce contrast, debate, or unresolved angle from context.", weight: 1 },
  { id: "closing-line", label: "Closing line", purpose: "Close with a grounded takeaway.", weight: 0.8 },
];

function resolveBeatTemplates(mode: ScriptMode): BeatTemplate[] {
  switch (mode) {
    case "top_5":
      return TOP_5_BEATS;
    case "player_analysis":
      return PLAYER_BEATS;
    case "tactical_review":
      return TACTICAL_BEATS;
    case "match_preview":
      return PREVIEW_BEATS;
    case "match_recap":
      return RECAP_BEATS;
    case "story":
    case "historical_explainer":
    case "opinion_debate":
      return GENERIC_BEATS;
    default:
      return GENERIC_BEATS;
  }
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

function allocateBeatWordCounts(templates: BeatTemplate[], targetDurationSeconds?: number): number[] {
  const budget = getNarrationWordBudget(targetDurationSeconds ?? DEFAULT_TARGET_DURATION_SECONDS);
  const totalWeight = templates.reduce((sum, template) => sum + template.weight, 0);

  return templates.map((template) =>
    Math.max(8, Math.round((template.weight / totalWeight) * budget.idealMaxWords)),
  );
}

function takeFacts(facts: GraphContextFact[], count: number): GraphContextFact[] {
  return facts.splice(0, Math.max(0, count));
}

function factIds(facts: GraphContextFact[]): string[] {
  return facts.map((fact) => fact.id);
}

function assignRankBeatFacts(pool: FactPool, templates: BeatTemplate[]): Map<string, string[]> {
  const assignments = new Map<string, string[]>();
  const rankTemplates = templates.filter((template) => template.id.startsWith("rank-"));

  for (const template of rankTemplates) {
    const rankNumber = Number.parseInt(template.id.replace("rank-", ""), 10);
    const match = pool.ranked.find((fact) => fact.rank === rankNumber);
    assignments.set(template.id, match ? [match.id] : []);
  }

  return assignments;
}

function assignBeatFacts(context: GraphContext, templates: BeatTemplate[]): Map<string, string[]> {
  const pool = collectFactPool(context);
  const assignments = new Map<string, string[]>();

  if (context.selectedMode === "top_5") {
    const rankAssignments = assignRankBeatFacts(pool, templates);
    for (const [beatId, ids] of rankAssignments) {
      assignments.set(beatId, ids);
    }

    const hookFacts = [
      ...takeFacts(pool.fixtures, 1),
      ...takeFacts(pool.verified, 1),
    ];
    assignments.set("hook", factIds(hookFacts));
    assignments.set(
      "closing-line",
      factIds([...takeFacts(pool.verified, 1), ...takeFacts(pool.ranked, 1)]),
    );

    return assignments;
  }

  if (context.selectedMode === "player_analysis") {
    const entityFactIds = context.entitySummaries.flatMap((summary) => summary.factIds);
    assignments.set("hook", entityFactIds.slice(0, 1));
    assignments.set("context", entityFactIds.slice(1, 2));
    assignments.set("strength", factIds(takeFacts(pool.verified, 1)));
    assignments.set("concern", factIds(takeFacts(pool.verified, 1)));
    assignments.set("evidence", factIds([...takeFacts(pool.statistics, 2), ...takeFacts(pool.verified, 1)]));
    assignments.set("future-angle", factIds(takeFacts(pool.verified, 1)));
    assignments.set("closing-line", factIds(takeFacts(pool.verified, 1)));
    return assignments;
  }

  if (context.selectedMode === "tactical_review") {
    assignments.set("hook", factIds(takeFacts(pool.fixtures, 1)));
    assignments.set("shape", factIds(takeFacts(pool.fixtures, 1)));
    assignments.set("key-pattern", factIds(takeFacts(pool.statistics, 1)));
    assignments.set("turning-point", factIds(takeFacts(pool.timeline, 1)));
    assignments.set("player-zone-focus", factIds(takeFacts(pool.verified, 1)));
    assignments.set("why-it-mattered", factIds([...takeFacts(pool.statistics, 1), ...takeFacts(pool.timeline, 1)]));
    assignments.set("closing-line", factIds(takeFacts(pool.verified, 1)));
    return assignments;
  }

  if (context.selectedMode === "match_preview") {
    assignments.set("hook", factIds(takeFacts(pool.fixtures, 1)));
    assignments.set("stakes", factIds(takeFacts(pool.verified, 1)));
    assignments.set("form-context", factIds([...takeFacts(pool.statistics, 1), ...takeFacts(pool.verified, 1)]));
    assignments.set("key-battle", factIds(takeFacts(pool.verified, 1)));
    assignments.set("what-to-watch", factIds([...takeFacts(pool.timeline, 1), ...takeFacts(pool.verified, 1)]));
    assignments.set("prediction-closing", factIds(takeFacts(pool.verified, 1)));
    return assignments;
  }

  if (context.selectedMode === "match_recap") {
    assignments.set("hook", factIds(takeFacts(pool.fixtures, 1)));
    assignments.set("score-story", factIds([...takeFacts(pool.fixtures, 1), ...takeFacts(pool.timeline, 1)]));
    assignments.set("turning-point", factIds(takeFacts(pool.timeline, 1)));
    assignments.set("standout-performer", factIds(takeFacts(pool.verified, 1)));
    assignments.set("tactical-stat-reason", factIds([...takeFacts(pool.statistics, 1), ...takeFacts(pool.timeline, 1)]));
    assignments.set("closing-line", factIds(takeFacts(pool.verified, 1)));
    return assignments;
  }

  assignments.set("hook", factIds(takeFacts(pool.verified, 1)));
  assignments.set("context", factIds([...takeFacts(pool.fixtures, 1), ...takeFacts(pool.verified, 1)]));
  assignments.set("core-argument", factIds(takeFacts(pool.verified, 1)));
  assignments.set("evidence", factIds([...takeFacts(pool.verified, 2), ...takeFacts(pool.statistics, 1), ...takeFacts(pool.ranked, 1)]));
  assignments.set("tension", factIds(takeFacts(pool.verified, 1)));
  assignments.set("closing-line", factIds(takeFacts(pool.verified, 1)));

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

  if (structure === "ranked_countdown") {
    rules.add("Preserve exact ranking order and values from ranked facts.");
  }

  if (structure === "player_profile") {
    rules.add("Keep the player as the primary focus throughout the script.");
  }

  if (structure === "tactical_breakdown") {
    rules.add("Explain tactics using verified events, statistics, and fixture context only.");
  }

  if (structure === "match_preview") {
    rules.add("Avoid definitive predictions unless explicitly supported by context.");
  }

  if (structure === "debate") {
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
 * Not wired into production script generation yet.
 */
export function buildNarrativePlan(input: BuildNarrativePlanInput): NarrativePlan {
  const { graphContext, targetDurationSeconds } = input;
  const structure = MODE_STRUCTURE[graphContext.selectedMode];
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
  }));

  const requiredFacts = [...new Set(beats.flatMap((beat) => beat.requiredFactIds))];
  const availableFacts = allGraphFactIds(graphContext);
  const optionalFacts = availableFacts.filter((factId) => !requiredFacts.includes(factId));

  return {
    structure,
    beats,
    requiredFacts,
    optionalFacts,
    forbiddenClaims: buildForbiddenClaims(graphContext),
    modeSpecificRules: buildModeSpecificRules(graphContext, structure),
  };
}
