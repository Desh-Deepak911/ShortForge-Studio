/**
 * Client-safe Story Strategy selection — Sprint 10G.
 * Allowlisted presentation catalog only. Does not expose long-form or
 * Auto-only extended_short as explicit creator selections.
 */

import type { StoryFormatStrategyId } from "../domain/retention-story-contract.types";

/**
 * Creator / brief selection.
 * - auto — omit or default; preserve Auto resolution (legacy absence)
 * - short_retention — Retention-first
 * - short_standard — Standard
 */
export type StoryStrategySelection =
  | "auto"
  | "short_retention"
  | "short_standard";

/** Explicit creator options (excludes Auto). */
export type StoryStrategyExplicitSelection = Exclude<
  StoryStrategySelection,
  "auto"
>;

export interface StoryStrategyCatalogEntry {
  readonly selection: StoryStrategySelection;
  readonly label: string;
  readonly description: string;
  /** Inclusive duration envelope; Auto uses the full production envelope. */
  readonly minDurationSec: number;
  readonly maxDurationSec: number;
}

/** Never accept these as explicit Create / API selections. */
export const STORY_STRATEGY_NON_SELECTABLE_IDS = Object.freeze([
  "extended_short",
  "long_form_explainer",
  "long_form_documentary",
] as const);

const EXPLICIT_SELECTIONS: readonly StoryStrategyExplicitSelection[] =
  Object.freeze(["short_retention", "short_standard"]);

export const STORY_STRATEGY_CATALOG: readonly StoryStrategyCatalogEntry[] =
  Object.freeze([
    {
      selection: "auto",
      label: "Auto — Recommended",
      description: "Chooses the best strategy for the selected duration.",
      minDurationSec: 15,
      maxDurationSec: 60,
    },
    {
      selection: "short_retention",
      label: "Retention-first",
      description:
        "Faster pacing, denser information, and a stronger payoff.",
      minDurationSec: 15,
      maxDurationSec: 35,
    },
    {
      selection: "short_standard",
      label: "Standard",
      description:
        "More balanced pacing and a conventional resolution.",
      minDurationSec: 25,
      maxDurationSec: 35,
    },
  ]);

const CATALOG_BY_SELECTION = new Map(
  STORY_STRATEGY_CATALOG.map((entry) => [entry.selection, entry]),
);

export function isStoryStrategyExplicitSelection(
  value: unknown,
): value is StoryStrategyExplicitSelection {
  return (
    typeof value === "string" &&
    (EXPLICIT_SELECTIONS as readonly string[]).includes(value)
  );
}

export function isStoryStrategySelection(
  value: unknown,
): value is StoryStrategySelection {
  return value === "auto" || isStoryStrategyExplicitSelection(value);
}

/** Parse browser/API input — unknown values become undefined (treat as Auto). */
export function parseStoryStrategySelection(
  value: unknown,
): StoryStrategySelection | undefined {
  if (value == null || value === "") return undefined;
  if (isStoryStrategySelection(value)) return value;
  return undefined;
}

export function getStoryStrategyCatalogEntry(
  selection: StoryStrategySelection,
): StoryStrategyCatalogEntry | undefined {
  return CATALOG_BY_SELECTION.get(selection);
}

export function isStoryStrategyCompatibleWithDuration(
  selection: StoryStrategySelection,
  durationSec: number,
): boolean {
  const entry = getStoryStrategyCatalogEntry(selection);
  if (!entry) return false;
  if (!Number.isFinite(durationSec)) return false;
  const duration = Math.round(durationSec);
  return duration >= entry.minDurationSec && duration <= entry.maxDurationSec;
}

export function listCompatibleStoryStrategySelections(
  durationSec: number,
): readonly StoryStrategySelection[] {
  return STORY_STRATEGY_CATALOG.filter((entry) =>
    isStoryStrategyCompatibleWithDuration(entry.selection, durationSec),
  ).map((entry) => entry.selection);
}

export function isNonSelectableStoryStrategyId(strategyId: string): boolean {
  return (STORY_STRATEGY_NON_SELECTABLE_IDS as readonly string[]).includes(
    strategyId,
  );
}

/**
 * Server-side validation for an explicit format strategy from Create.
 * Rejects unknown, non-selectable (extended_short / long-form), and
 * duration-incompatible values. Does not silently rewrite to Auto.
 */
export function assertStoryStrategyAllowed(
  selection: string,
  durationSec: number,
): asserts selection is StoryStrategySelection {
  if (selection === "auto") {
    if (!isStoryStrategyCompatibleWithDuration("auto", durationSec)) {
      throw new Error(
        "Story strategy Auto is incompatible with the selected duration.",
      );
    }
    return;
  }
  if (isNonSelectableStoryStrategyId(selection)) {
    throw new Error(
      `Story strategy "${selection}" cannot be requested explicitly.`,
    );
  }
  if (!isStoryStrategyExplicitSelection(selection)) {
    throw new Error(`Unknown or non-selectable Story strategy "${selection}".`);
  }
  if (!isStoryStrategyCompatibleWithDuration(selection, durationSec)) {
    throw new Error(
      `Story strategy "${selection}" is incompatible with the selected duration.`,
    );
  }
}

/**
 * Map GenerateScriptRequest.formatStrategyId → contract selection.
 * Auto / omitted → "auto" (legacy default).
 */
export function formatStrategyIdFromStoryStrategy(
  selection: StoryStrategySelection | undefined,
): "auto" | StoryStrategyExplicitSelection {
  if (!selection || selection === "auto") return "auto";
  return selection;
}

/** Creator-facing label for a selection (not an internal ID dump). */
export function storyStrategyLabel(selection: StoryStrategySelection): string {
  return getStoryStrategyCatalogEntry(selection)?.label ?? selection;
}

export function storyStrategyDescription(
  selection: StoryStrategySelection,
): string {
  return getStoryStrategyCatalogEntry(selection)?.description ?? "";
}

/** Map resolved plan strategy id → creator-facing label. */
export function resolvedFormatStrategyLabel(
  formatStrategyId: StoryFormatStrategyId | string,
): string {
  switch (formatStrategyId) {
    case "short_retention":
      return "Retention-first";
    case "short_standard":
      return "Standard";
    case "extended_short":
      return "Extended short";
    default:
      return "Custom";
  }
}

/**
 * Predict Auto resolution for creator status copy (no forged silent swap).
 */
export function predictAutoStoryStrategy(durationSec: number): {
  readonly resolvedId: StoryFormatStrategyId | null;
  readonly summary: string;
} {
  const duration = Math.round(durationSec);
  if (duration >= 15 && duration <= 35) {
    return {
      resolvedId: "short_retention",
      summary: `Auto will use Retention-first for ${duration}s videos.`,
    };
  }
  if (duration >= 36 && duration <= 60) {
    return {
      resolvedId: "extended_short",
      summary: `Auto will use Extended short for ${duration}s videos.`,
    };
  }
  return {
    resolvedId: null,
    summary: "Auto needs a duration between 15 and 60 seconds.",
  };
}
