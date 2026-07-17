export {
  runBoundedHookRepair,
  assertTerminalPlanCoherence,
  HookTerminalCoherenceError,
  type RunBoundedHookRepairInput,
  type RunBoundedHookRepairResult,
} from "./run-bounded-hook-repair";

export {
  HOOK_USABLE_NARRATION_BODY_MIN_WORDS,
  applyDeterministicCompatibilityOpening,
  buildDeterministicCompatibilityOpening,
  hasUsableHookNarrationBody,
  replaceNarrationOpeningExact,
  type ReplaceNarrationOpeningResult,
} from "./deterministic-compatibility-opening";
