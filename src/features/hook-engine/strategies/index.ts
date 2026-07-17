export type {
  HookStrategyDefinition,
  HookStrategyGroundingRequirement,
  HookStrategyResolution,
} from "./hook-strategy.types";

export {
  getCompatibilityFallbackStrategy,
  getHookStrategy,
  HOOK_SCRIPT_MODE_DEFAULT_STRATEGIES,
  HOOK_STRATEGY_IDS,
  HOOK_TEMPLATE_STRATEGY_PREFERENCES,
  isOpeningConstraintPairCoherent,
  listHookStrategies,
} from "./hook-strategy.registry";

export {
  evaluateEvidenceSurpriseEligibility,
  resolveHookStrategy,
} from "./resolve-hook-strategy";

export {
  buildCompatibilityFallbackPlan,
  buildHookPlan,
  buildHookPlanFromRequest,
  buildHookPlanSnapshot,
} from "./build-hook-plan";
