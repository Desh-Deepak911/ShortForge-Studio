export type {
  HookSelectableStrategyId,
  HookStyleCatalogEntry,
  HookStyleSelection,
} from "./hook-style-selection";

export {
  HOOK_INTERNAL_ONLY_STRATEGY_IDS,
  HOOK_STYLE_CATALOG,
  assertRequestedStrategyAllowed,
  getHookStyleCatalogEntry,
  hookStyleDescription,
  hookStyleLabel,
  isHookSelectableStrategyId,
  isHookStyleCompatibleWithScriptMode,
  isHookStyleSelection,
  isInternalOnlyHookStrategyId,
  listCompatibleHookStyleSelections,
  parseHookStyleSelection,
  requestedStrategyIdFromHookStyle,
} from "./hook-style-selection";

export type { PredictedAutoHookStrategy } from "./predict-auto-hook-strategy";
export { predictAutoHookStrategy } from "./predict-auto-hook-strategy";

export type { HookStyleReconciliationResult } from "./reconcile-hook-style-selection";
export {
  HOOK_STYLE_INCOMPATIBLE_RESET_NOTICE,
  reconcileHookStyleSelection,
} from "./reconcile-hook-style-selection";

export type {
  WriteMyOwnOpeningFailureReason,
  WriteMyOwnOpeningValidation,
} from "./validate-write-my-own-opening";
export {
  formatWriteMyOwnCounter,
  validateWriteMyOwnOpening,
} from "./validate-write-my-own-opening";

/** Re-export client-safe contract limits + shared word count (no generation/repair graph). */
export {
  HOOK_MAX_USER_AUTHORED_HOOK_CHARS,
  HOOK_MAX_USER_AUTHORED_HOOK_WORDS,
} from "../domain/hook-contract.constants";
export { countHookWords } from "../domain/hook-word-count";
