/**
 * Pure Hook Style ↔ ScriptMode reconciliation — Sprint 7E.6A.
 * No React state side effects.
 */

import type { ScriptMode } from "@/types/footiebitz";

import {
  isHookStyleCompatibleWithScriptMode,
  type HookStyleSelection,
} from "./hook-style-selection";

export interface HookStyleReconciliationResult {
  readonly selection: HookStyleSelection;
  /** Set when selection was reset to Auto; otherwise null. */
  readonly compatibilityNotice: string | null;
}

export const HOOK_STYLE_INCOMPATIBLE_RESET_NOTICE =
  "Hook style reset to Auto — the previous style isn’t available for this content type.";

/**
 * Pure: current Hook Style + next ScriptMode → compatible selection or Auto.
 */
export function reconcileHookStyleSelection(
  current: HookStyleSelection,
  nextScriptMode: ScriptMode,
): HookStyleReconciliationResult {
  if (current === "auto" || isHookStyleCompatibleWithScriptMode(current, nextScriptMode)) {
    return { selection: current, compatibilityNotice: null };
  }
  return {
    selection: "auto",
    compatibilityNotice: HOOK_STYLE_INCOMPATIBLE_RESET_NOTICE,
  };
}
