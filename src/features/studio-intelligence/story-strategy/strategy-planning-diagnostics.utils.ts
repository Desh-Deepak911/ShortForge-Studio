import type { StoryStrategyId } from "./story-strategy.types";

/** Per-planner strategy influence report for developer diagnostics. */
export interface PlannerStrategyDiagnostics {
  strategyId: StoryStrategyId;
  strategyInfluenceApplied: string[];
  strategyDecisions: string[];
  fallbackReasons: string[];
}

/** Aggregated strategy planning diagnostics across the SI pipeline. */
export interface StrategyPlanningDiagnostics {
  beatDetector: PlannerStrategyDiagnostics;
  arcBuilder: PlannerStrategyDiagnostics;
  scenePlanner: PlannerStrategyDiagnostics;
  visualPlanner: PlannerStrategyDiagnostics;
  dynamicTiming: PlannerStrategyDiagnostics;
  strategyApplicationScore: number;
}

export function createPlannerDiagnostics(strategyId: StoryStrategyId): PlannerStrategyDiagnostics {
  return {
    strategyId,
    strategyInfluenceApplied: [],
    strategyDecisions: [],
    fallbackReasons: [],
  };
}

export function createEmptyStrategyPlanningDiagnostics(
  strategyId: StoryStrategyId,
): StrategyPlanningDiagnostics {
  return {
    beatDetector: createPlannerDiagnostics(strategyId),
    arcBuilder: createPlannerDiagnostics(strategyId),
    scenePlanner: createPlannerDiagnostics(strategyId),
    visualPlanner: createPlannerDiagnostics(strategyId),
    dynamicTiming: createPlannerDiagnostics(strategyId),
    strategyApplicationScore: 0,
  };
}

export function recordStrategyInfluence(
  diagnostics: PlannerStrategyDiagnostics,
  influence: string,
): void {
  if (!diagnostics.strategyInfluenceApplied.includes(influence)) {
    diagnostics.strategyInfluenceApplied.push(influence);
  }
}

export function recordStrategyDecision(
  diagnostics: PlannerStrategyDiagnostics,
  decision: string,
): void {
  diagnostics.strategyDecisions.push(decision);
}

export function recordStrategyFallback(
  diagnostics: PlannerStrategyDiagnostics,
  reason: string,
): void {
  diagnostics.fallbackReasons.push(reason);
}

export function isDefaultStoryStrategy(strategyId: StoryStrategyId): boolean {
  return strategyId === "default";
}

export function computeStrategyApplicationScore(
  diagnostics: Omit<StrategyPlanningDiagnostics, "strategyApplicationScore">,
): number {
  const planners = [
    diagnostics.beatDetector,
    diagnostics.arcBuilder,
    diagnostics.scenePlanner,
    diagnostics.visualPlanner,
    diagnostics.dynamicTiming,
  ];

  const influenceCount = planners.reduce(
    (total, planner) => total + planner.strategyInfluenceApplied.length,
    0,
  );
  const decisionCount = planners.reduce(
    (total, planner) => total + planner.strategyDecisions.length,
    0,
  );

  if (influenceCount === 0 && decisionCount === 0) {
    return 0;
  }

  const raw = 0.35 + influenceCount * 0.08 + decisionCount * 0.04;
  return Math.min(1, Math.round(raw * 1000) / 1000);
}

export function flattenStrategyInfluenceApplied(
  diagnostics: Omit<StrategyPlanningDiagnostics, "strategyApplicationScore">,
): string[] {
  return [
    ...diagnostics.beatDetector.strategyInfluenceApplied.map((item) => `beat:${item}`),
    ...diagnostics.arcBuilder.strategyInfluenceApplied.map((item) => `arc:${item}`),
    ...diagnostics.scenePlanner.strategyInfluenceApplied.map((item) => `scene:${item}`),
    ...diagnostics.visualPlanner.strategyInfluenceApplied.map((item) => `visual:${item}`),
    ...diagnostics.dynamicTiming.strategyInfluenceApplied.map((item) => `timing:${item}`),
  ];
}

export function flattenStrategyDecisions(
  diagnostics: Omit<StrategyPlanningDiagnostics, "strategyApplicationScore">,
): string[] {
  return [
    ...diagnostics.beatDetector.strategyDecisions,
    ...diagnostics.arcBuilder.strategyDecisions,
    ...diagnostics.scenePlanner.strategyDecisions,
    ...diagnostics.visualPlanner.strategyDecisions,
    ...diagnostics.dynamicTiming.strategyDecisions,
  ];
}

export function flattenStrategyFallbackReasons(
  diagnostics: Omit<StrategyPlanningDiagnostics, "strategyApplicationScore">,
): string[] {
  return [
    ...diagnostics.beatDetector.fallbackReasons,
    ...diagnostics.arcBuilder.fallbackReasons,
    ...diagnostics.scenePlanner.fallbackReasons,
    ...diagnostics.visualPlanner.fallbackReasons,
    ...diagnostics.dynamicTiming.fallbackReasons,
  ];
}
