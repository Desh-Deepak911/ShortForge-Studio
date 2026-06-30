import type { SceneBlueprint, SceneBlueprintCollection } from "../scene-blueprint.types";
import type { NarrativeArc, NarrativeArcType, StudioIntelligenceResult } from "../studio-intelligence.types";
import { getModeTemplateById } from "../mode-templates/mode-template.registry";
import { isDefaultModeTemplate } from "../mode-templates/mode-template.utils";
import type {
  StoryCoherenceRuleResult,
  StoryRepairCandidate,
  StoryRepairSuggestion,
  StoryValidatorContext,
} from "./story-validator.types";

export const STORY_VALIDATOR_VERSION = "0.1.0";

const ARC_TYPE_ORDER: Record<NarrativeArcType, number> = {
  opening: 0,
  setup: 1,
  development: 2,
  conflict: 3,
  climax: 4,
  resolution: 5,
  ending: 6,
};

const INTRO_ROLES = new Set(["intro"]);
const ENDING_ROLES = new Set(["payoff", "ending", "cta"]);
const HOOK_KINDS = new Set(["hook_opener", "text_card", "player_spotlight"]);
const PAYOFF_KINDS = new Set(["closing_moment", "cta_card"]);

export function clampValidatorScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

export function resolveTargetDurationMs(result: StudioIntelligenceResult): number {
  return (
    result.input.targetDurationMs ??
    Math.max(1, Math.round(result.input.targetDurationSec)) * 1000
  );
}

export function buildValidatorContext(result: StudioIntelligenceResult): StoryValidatorContext {
  return {
    targetDurationMs: resolveTargetDurationMs(result),
    modeTemplateId: result.diagnostics.modeTemplateId,
    templateSlotsMatched: result.diagnostics.templateSlotsMatched,
    templateFallbacks: result.diagnostics.templateFallbacks,
  };
}

export function computeDiversityRatio(values: readonly string[]): number {
  if (values.length === 0) {
    return 0;
  }

  return new Set(values).size / values.length;
}

export function countRoleOccurrences(
  blueprints: readonly SceneBlueprint[],
  roles: ReadonlySet<string>,
): SceneBlueprint[] {
  return blueprints.filter((blueprint) => roles.has(blueprint.role));
}

export function isHookBlueprint(blueprint: SceneBlueprint): boolean {
  return blueprint.role === "intro" || HOOK_KINDS.has(blueprint.kind);
}

export function isPayoffBlueprint(blueprint: SceneBlueprint): boolean {
  return ENDING_ROLES.has(blueprint.role) || PAYOFF_KINDS.has(blueprint.kind);
}

export function scoreArcOrder(arcs: readonly NarrativeArc[]): number {
  if (arcs.length <= 1) {
    return arcs.length === 1 ? 1 : 0.5;
  }

  let regressions = 0;

  for (let index = 1; index < arcs.length; index += 1) {
    const previous = ARC_TYPE_ORDER[arcs[index - 1].type];
    const current = ARC_TYPE_ORDER[arcs[index].type];

    if (current < previous) {
      regressions += 1;
    }
  }

  return clampValidatorScore(1 - regressions / (arcs.length - 1));
}

export function scoreSceneDensity(
  collection: SceneBlueprintCollection,
  targetDurationMs: number,
): number {
  const count = collection.blueprints.length;

  if (count === 0) {
    return 0;
  }

  const targetSec = targetDurationMs / 1000;
  const idealMin = targetSec <= 30 ? 3 : 4;
  const idealMax = targetSec <= 45 ? 7 : 9;

  if (count >= idealMin && count <= idealMax) {
    return 1;
  }

  if (count < idealMin) {
    return clampValidatorScore(count / idealMin);
  }

  return clampValidatorScore(idealMax / count);
}

export function scoreDurationConsistency(
  collection: SceneBlueprintCollection,
  targetDurationMs: number,
): number {
  if (collection.blueprints.length === 0) {
    return 0;
  }

  const total = collection.totalSuggestedDurationMs;
  const drift = Math.abs(total - targetDurationMs);
  const allowedDrift = Math.max(1500, targetDurationMs * 0.15);
  const totalScore = clampValidatorScore(1 - drift / allowedDrift);

  const perSceneIssues = collection.blueprints.filter(
    (blueprint) =>
      blueprint.timing.suggestedDurationMs < blueprint.timing.minDurationMs ||
      blueprint.timing.suggestedDurationMs > blueprint.timing.maxDurationMs,
  ).length;

  const perSceneScore = clampValidatorScore(
    1 - perSceneIssues / collection.blueprints.length,
  );

  return clampValidatorScore(totalScore * 0.6 + perSceneScore * 0.4);
}

export function scoreTemplateSlotCoverage(
  result: StudioIntelligenceResult,
  context: StoryValidatorContext,
): number {
  const templateId = context.modeTemplateId ?? result.strategyId;
  const template = getModeTemplateById(templateId);
  const slotCount = template.targetSceneSlots.length;

  if (slotCount === 0) {
    return 1;
  }

  const matched = context.templateSlotsMatched ?? 0;
  const blueprintCount = result.sceneBlueprintCollection.blueprints.length;

  if (blueprintCount === 0) {
    return 0;
  }

  const coverageRatio = matched / slotCount;
  const densityRatio = clampValidatorScore(blueprintCount / slotCount);

  return clampValidatorScore(coverageRatio * 0.7 + densityRatio * 0.3);
}

export function scoreHookStrength(firstBlueprint: SceneBlueprint | undefined): number {
  if (!firstBlueprint) {
    return 0;
  }

  let score = 0.35;

  if (isHookBlueprint(firstBlueprint)) {
    score += 0.25;
  }

  if (firstBlueprint.importance.value >= 0.65) {
    score += 0.2;
  }

  if (firstBlueprint.timing.pacing === "punchy" || firstBlueprint.timing.pacing === "fast") {
    score += 0.1;
  }

  if (firstBlueprint.confidence >= 0.7) {
    score += 0.1;
  }

  return clampValidatorScore(score);
}

export function scorePayoffStrength(lastBlueprint: SceneBlueprint | undefined): number {
  if (!lastBlueprint) {
    return 0;
  }

  let score = 0.35;

  if (isPayoffBlueprint(lastBlueprint)) {
    score += 0.25;
  }

  if (lastBlueprint.importance.value >= 0.6) {
    score += 0.2;
  }

  if (lastBlueprint.role === "cta" || lastBlueprint.kind === "cta_card") {
    score += 0.1;
  }

  if (lastBlueprint.confidence >= 0.65) {
    score += 0.1;
  }

  return clampValidatorScore(score);
}

export function aggregateRuleScore(
  ruleResults: readonly StoryCoherenceRuleResult[],
  ruleIds: readonly StoryCoherenceRuleResult["ruleId"][],
): number {
  const scores = ruleResults
    .filter((result) => ruleIds.includes(result.ruleId))
    .map((result) => result.score);

  if (scores.length === 0) {
    return 0;
  }

  return clampValidatorScore(scores.reduce((total, score) => total + score, 0) / scores.length);
}

export function buildRepairSuggestions(
  result: StudioIntelligenceResult,
  ruleResults: readonly StoryCoherenceRuleResult[],
): StoryRepairSuggestion[] {
  const suggestions: StoryRepairSuggestion[] = [];
  const blueprints = result.sceneBlueprintCollection.blueprints;
  const first = blueprints[0];
  const last = blueprints[blueprints.length - 1];

  const failed = new Map(ruleResults.filter((rule) => !rule.passed).map((rule) => [rule.ruleId, rule]));

  if (failed.has("duplicate_intro")) {
    const introBlueprints = countRoleOccurrences(blueprints, INTRO_ROLES);
    suggestions.push({
      id: "replace-duplicate-intro",
      category: "hook",
      message: "Replace duplicate intro — keep one opening hook scene.",
      targetBlueprintIds: introBlueprints.slice(1).map((blueprint) => blueprint.id),
      priority: "high",
    });
  }

  if (failed.has("hook_strength") || failed.has("hook_opener")) {
    suggestions.push({
      id: "strengthen-hook",
      category: "hook",
      message: "Strengthen hook — increase opening importance and punchy pacing.",
      targetBlueprintIds: first ? [first.id] : undefined,
      priority: "high",
    });
  }

  if (failed.has("payoff_strength") || failed.has("payoff_closer")) {
    suggestions.push({
      id: "improve-payoff",
      category: "payoff",
      message: "Improve CTA or closing payoff — strengthen final scene importance.",
      targetBlueprintIds: last ? [last.id] : undefined,
      priority: "high",
    });

    if (last) {
      suggestions.push({
        id: "increase-payoff-duration",
        category: "timing",
        message: "Increase payoff duration to let the ending land.",
        targetBlueprintIds: [last.id],
        priority: "medium",
      });
    }
  }

  if (failed.has("duplicate_ending")) {
    const endingBlueprints = countRoleOccurrences(blueprints, ENDING_ROLES);
    suggestions.push({
      id: "replace-duplicate-ending",
      category: "payoff",
      message: "Replace duplicate ending — consolidate to one payoff scene.",
      targetBlueprintIds: endingBlueprints.slice(0, -1).map((blueprint) => blueprint.id),
      priority: "medium",
    });
  }

  if (failed.has("mode_template_consistency") || failed.has("template_slot_coverage")) {
    suggestions.push({
      id: "align-mode-template",
      category: "template",
      message: "Align scene slots with the active mode template structure.",
      priority: "medium",
    });
  }

  if (failed.has("arc_order")) {
    suggestions.push({
      id: "strengthen-turning-point",
      category: "arc",
      message: "Strengthen turning point — reorder arcs toward opening → development → ending.",
      priority: "medium",
    });
  }

  if (failed.has("scene_density")) {
    if (blueprints.length > 7) {
      suggestions.push({
        id: "merge-adjacent-scenes",
        category: "merge",
        message: "Merge scene 2 and 3 — reduce density for clearer pacing.",
        targetBlueprintIds: blueprints.slice(1, 3).map((blueprint) => blueprint.id),
        priority: "medium",
      });
    } else if (blueprints.length < 3) {
      suggestions.push({
        id: "split-ranking-scene",
        category: "split",
        message: "Split ranking scene — add evidence beats for fuller coverage.",
        priority: "medium",
      });
    }
  }

  if (failed.has("visual_diversity")) {
    suggestions.push({
      id: "insert-comparison-scene",
      category: "visual",
      message: "Insert comparison scene — diversify visual intent across body beats.",
      priority: "low",
    });
  }

  if (
    result.strategyId === "debate" &&
    !blueprints.some((blueprint) => blueprint.kind === "debate_split" || blueprint.kind === "comparison")
  ) {
    suggestions.push({
      id: "insert-debate-comparison",
      category: "visual",
      message: "Insert comparison scene — surface argument/counter split for debate mode.",
      priority: "low",
    });
  }

  return suggestions;
}

export function buildRepairCandidates(
  result: StudioIntelligenceResult,
  ruleResults: readonly StoryCoherenceRuleResult[],
): StoryRepairCandidate[] {
  const candidates: StoryRepairCandidate[] = [];
  const failedIds = new Set(
    ruleResults.filter((rule) => !rule.passed).map((rule) => rule.ruleId),
  );

  for (const [index, blueprint] of result.sceneBlueprintCollection.blueprints.entries()) {
    if (failedIds.has("duplicate_intro") && blueprint.role === "intro" && index > 0) {
      candidates.push({
        blueprintId: blueprint.id,
        sceneIndex: index,
        issue: "Duplicate intro scene",
        suggestedAction: "Merge or replace with a context/evidence scene.",
      });
    }

    if (failedIds.has("hook_strength") && index === 0) {
      candidates.push({
        blueprintId: blueprint.id,
        sceneIndex: index,
        issue: "Weak hook strength",
        suggestedAction: "Increase importance tier and use punchy hook opener pacing.",
      });
    }

    if (failedIds.has("payoff_strength") && index === result.sceneBlueprintCollection.blueprints.length - 1) {
      candidates.push({
        blueprintId: blueprint.id,
        sceneIndex: index,
        issue: "Weak payoff strength",
        suggestedAction: "Strengthen closing role and extend suggested duration.",
      });
    }

    if (
      failedIds.has("duration_consistency") &&
      (blueprint.timing.suggestedDurationMs < blueprint.timing.minDurationMs ||
        blueprint.timing.suggestedDurationMs > blueprint.timing.maxDurationMs)
    ) {
      candidates.push({
        blueprintId: blueprint.id,
        sceneIndex: index,
        issue: "Blueprint duration out of bounds",
        suggestedAction: "Rebalance timing to stay within min/max duration envelope.",
      });
    }
  }

  return candidates;
}

export function collectOverallWarnings(
  ruleResults: readonly StoryCoherenceRuleResult[],
): string[] {
  return ruleResults
    .filter((rule) => !rule.passed && rule.message)
    .map((rule) => rule.message as string);
}

export function modeTemplateConsistencyScore(result: StudioIntelligenceResult): number {
  const templateId = result.diagnostics.modeTemplateId ?? result.strategyId;
  const applied = result.diagnostics.modeTemplateApplied ?? !isDefaultModeTemplate(templateId);

  if (templateId !== result.strategyId) {
    return 0.2;
  }

  if (isDefaultModeTemplate(templateId)) {
    return applied ? 0.85 : 0.75;
  }

  if (!applied) {
    return 0.45;
  }

  const fallbacks = result.diagnostics.templateFallbacks ?? [];
  if (fallbacks.length > 0) {
    return clampValidatorScore(0.85 - fallbacks.length * 0.05);
  }

  return 1;
}
