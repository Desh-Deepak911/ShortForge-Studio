/**
 * Client-safe Hook Style selection contract — Sprint 7E.6.
 * Allowlisted presentation catalog only. Does not expose internal registry IDs
 * (evidence_surprise, compatibility_punchy, user_directed) as selectable values.
 */

import type { ScriptMode } from "@/types/footiebitz";

/** Manually selectable library strategies (excludes internal-only IDs). */
export type HookSelectableStrategyId =
  | "cold_open"
  | "curiosity_gap"
  | "provocative_question"
  | "stakes_first"
  | "headline_first"
  | "countdown_tease"
  | "contrarian_claim"
  | "myth_challenge";

/**
 * Client / brief selection.
 * - auto — omit requestedStrategyId; preserve existing resolution
 * - user_written — Write My Own → userAuthoredHook → user_directed
 * - strategy id — explicit user_selected resolution
 */
export type HookStyleSelection = "auto" | "user_written" | HookSelectableStrategyId;

export interface HookStyleCatalogEntry {
  readonly selection: HookStyleSelection;
  readonly label: string;
  readonly description: string;
  /** Empty array means all ScriptModes. */
  readonly compatibleScriptModes: readonly ScriptMode[];
}

/** Local list — avoid value import from footiebitz (breaks GenerateScriptRequest cycle). */
const ALL_MODES: readonly ScriptMode[] = Object.freeze([
  "story",
  "tactical_review",
  "match_preview",
  "match_recap",
  "player_analysis",
  "top_5",
  "historical_explainer",
  "opinion_debate",
]);

const SELECTABLE_STRATEGY_IDS: readonly HookSelectableStrategyId[] = Object.freeze([
  "cold_open",
  "curiosity_gap",
  "provocative_question",
  "stakes_first",
  "headline_first",
  "countdown_tease",
  "contrarian_claim",
  "myth_challenge",
]);

/** Internal-only — never accept from the browser as an explicit selection. */
export const HOOK_INTERNAL_ONLY_STRATEGY_IDS = Object.freeze([
  "evidence_surprise",
  "compatibility_punchy",
  "user_directed",
] as const);

export const HOOK_STYLE_CATALOG: readonly HookStyleCatalogEntry[] = Object.freeze([
  {
    selection: "auto",
    label: "Auto — Recommended",
    description: "ShortForge chooses the best hook for your content type and template.",
    compatibleScriptModes: ALL_MODES,
  },
  {
    selection: "cold_open",
    label: "Cold Open",
    description: "Drop into a vivid moment before explaining the frame.",
    compatibleScriptModes: Object.freeze(["story", "historical_explainer"] as const),
  },
  {
    selection: "curiosity_gap",
    label: "Curiosity Gap",
    description: "Tease a missing piece of knowledge the narration will fill.",
    compatibleScriptModes: Object.freeze([
      "story",
      "historical_explainer",
      "player_analysis",
    ] as const),
  },
  {
    selection: "provocative_question",
    label: "Provocative Question",
    description: "Open with a sharp question that the narration must answer.",
    compatibleScriptModes: Object.freeze([
      "tactical_review",
      "player_analysis",
      "opinion_debate",
      "story",
    ] as const),
  },
  {
    selection: "stakes_first",
    label: "Stakes First",
    description: "Lead with why the fixture, decision, or moment matters now.",
    compatibleScriptModes: Object.freeze([
      "match_preview",
      "story",
      "tactical_review",
    ] as const),
  },
  {
    selection: "headline_first",
    label: "Headline First",
    description: "Lead with the biggest newsworthy beat in plain language.",
    compatibleScriptModes: Object.freeze(["match_recap", "story"] as const),
  },
  {
    selection: "countdown_tease",
    label: "Countdown Tease",
    description: "Tease a ranked reveal without spoiling the top pick immediately.",
    compatibleScriptModes: Object.freeze(["top_5", "story"] as const),
  },
  {
    selection: "contrarian_claim",
    label: "Contrarian Take",
    description: "Challenge a popular assumption without inventing evidence.",
    compatibleScriptModes: Object.freeze([
      "opinion_debate",
      "story",
      "player_analysis",
    ] as const),
  },
  {
    selection: "myth_challenge",
    label: "Myth Challenge",
    description: "Name a popular myth, then set up the correction.",
    compatibleScriptModes: Object.freeze([
      "historical_explainer",
      "opinion_debate",
      "story",
    ] as const),
  },
  {
    selection: "user_written",
    label: "Write My Own",
    description: "Provide your opening sentence. Normal Hook safety and grounding still apply.",
    compatibleScriptModes: ALL_MODES,
  },
]);

const CATALOG_BY_SELECTION = new Map(
  HOOK_STYLE_CATALOG.map((entry) => [entry.selection, entry]),
);

export function isHookSelectableStrategyId(
  value: unknown,
): value is HookSelectableStrategyId {
  return (
    typeof value === "string" &&
    (SELECTABLE_STRATEGY_IDS as readonly string[]).includes(value)
  );
}

export function isHookStyleSelection(value: unknown): value is HookStyleSelection {
  return (
    value === "auto" ||
    value === "user_written" ||
    isHookSelectableStrategyId(value)
  );
}

/** Parse browser/API input — unknown values become undefined (treat as Auto). */
export function parseHookStyleSelection(value: unknown): HookStyleSelection | undefined {
  if (value == null || value === "") return undefined;
  if (isHookStyleSelection(value)) return value;
  return undefined;
}

export function getHookStyleCatalogEntry(
  selection: HookStyleSelection,
): HookStyleCatalogEntry | undefined {
  return CATALOG_BY_SELECTION.get(selection);
}

export function isHookStyleCompatibleWithScriptMode(
  selection: HookStyleSelection,
  scriptMode: ScriptMode,
): boolean {
  const entry = getHookStyleCatalogEntry(selection);
  if (!entry) return false;
  if (entry.compatibleScriptModes.length === 0) return true;
  return entry.compatibleScriptModes.includes(scriptMode);
}

export function listCompatibleHookStyleSelections(
  scriptMode: ScriptMode,
): readonly HookStyleSelection[] {
  return HOOK_STYLE_CATALOG.filter((entry) =>
    isHookStyleCompatibleWithScriptMode(entry.selection, scriptMode),
  ).map((entry) => entry.selection);
}

export function isInternalOnlyHookStrategyId(strategyId: string): boolean {
  return (HOOK_INTERNAL_ONLY_STRATEGY_IDS as readonly string[]).includes(strategyId);
}

/**
 * Server-side validation for an explicit requested strategy.
 * Rejects unknown, internal-only, and ScriptMode-incompatible IDs.
 */
export function assertRequestedStrategyAllowed(
  strategyId: string,
  scriptMode: ScriptMode,
): asserts strategyId is HookSelectableStrategyId {
  if (isInternalOnlyHookStrategyId(strategyId)) {
    throw new Error(
      `Hook strategy "${strategyId}" is internal-only and cannot be requested explicitly.`,
    );
  }
  if (!isHookSelectableStrategyId(strategyId)) {
    throw new Error(`Unknown or non-selectable Hook strategy "${strategyId}".`);
  }
  if (!isHookStyleCompatibleWithScriptMode(strategyId, scriptMode)) {
    throw new Error(
      `Hook strategy "${strategyId}" is incompatible with scriptMode "${scriptMode}".`,
    );
  }
}

/** Map GenerateScriptRequest.hookStyle → internal requestedStrategyId (Auto = omit). */
export function requestedStrategyIdFromHookStyle(
  selection: HookStyleSelection | undefined,
): HookSelectableStrategyId | undefined {
  if (!selection || selection === "auto" || selection === "user_written") {
    return undefined;
  }
  return selection;
}

export function hookStyleLabel(selection: HookStyleSelection): string {
  return getHookStyleCatalogEntry(selection)?.label ?? selection;
}

export function hookStyleDescription(selection: HookStyleSelection): string {
  return getHookStyleCatalogEntry(selection)?.description ?? "";
}
