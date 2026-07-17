/**
 * Predicted Auto strategy for UI copy — Sprint 7E.6.
 * Mirrors Auto resolution without research evidence (template → mode default).
 */

import type { CreatorTemplateId } from "@/features/creator-templates/creator-template.types";
import type { ScriptMode } from "@/types/footiebitz";
import { SCRIPT_MODE_OPTIONS } from "@/types/footiebitz";

import {
  getHookStrategy,
  HOOK_SCRIPT_MODE_DEFAULT_STRATEGIES,
  HOOK_TEMPLATE_STRATEGY_PREFERENCES,
} from "../strategies/hook-strategy.registry";
import type { HookSelectableStrategyId } from "./hook-style-selection";
import { isHookSelectableStrategyId, isHookStyleCompatibleWithScriptMode } from "./hook-style-selection";

export interface PredictedAutoHookStrategy {
  readonly strategyId: HookSelectableStrategyId;
  readonly label: string;
  readonly scriptModeLabel: string;
  /** Truthful Auto copy — research-aware (7E.6A). */
  readonly summary: string;
}

export function predictAutoHookStrategy(
  scriptMode: ScriptMode,
  templateId?: CreatorTemplateId | "",
  enableResearch = false,
): PredictedAutoHookStrategy {
  const modeLabel =
    SCRIPT_MODE_OPTIONS.find((option) => option.value === scriptMode)?.label ?? scriptMode;

  let strategyId: string | undefined;
  if (templateId) {
    const preferred = HOOK_TEMPLATE_STRATEGY_PREFERENCES[templateId];
    if (
      preferred &&
      isHookSelectableStrategyId(preferred) &&
      isHookStyleCompatibleWithScriptMode(preferred, scriptMode)
    ) {
      strategyId = preferred;
    }
  }

  if (!strategyId) {
    strategyId = HOOK_SCRIPT_MODE_DEFAULT_STRATEGIES[scriptMode];
  }

  const resolvedId = isHookSelectableStrategyId(strategyId)
    ? strategyId
    : ("cold_open" as const);
  const definition = getHookStrategy(resolvedId);
  const label = definition?.label ?? resolvedId;

  const summary = enableResearch
    ? `Auto currently prefers ${label}. Verified research may select Evidence Surprise.`
    : `Auto will use ${label} for ${modeLabel}.`;

  return {
    strategyId: resolvedId,
    label,
    scriptModeLabel: modeLabel,
    summary,
  };
}
