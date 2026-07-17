/**
 * Format-strategy registry and resolution — Sprint 10B.
 */

import {
  RETENTION_DEFAULT_DURATION_SEC,
  RETENTION_FORMAT_STRATEGY_REGISTRY_VERSION,
  RETENTION_MAX_DURATION_SEC,
  RETENTION_MIN_DURATION_SEC,
} from "./retention-story-contract.constants";
import { RetentionStoryError } from "./retention-story-errors";
import type {
  RetentionFormatCapabilityResult,
  RetentionFormatStrategyProfile,
  StoryDurationClass,
  StoryFormatStrategyId,
  StoryFormatStrategySelection,
} from "./retention-story-contract.types";

const PROFILES: readonly RetentionFormatStrategyProfile[] = Object.freeze([
  Object.freeze({
    id: "short_retention",
    productionCapable: true,
    informationDensity: "dense",
    visualDensity: "high",
    pacingProfile: "front_loaded",
    endingStrategy: "payoff_reveal",
    minDurationSec: 15,
    maxDurationSec: 35,
  }),
  Object.freeze({
    id: "short_standard",
    productionCapable: true,
    informationDensity: "balanced",
    visualDensity: "medium",
    pacingProfile: "escalating",
    endingStrategy: "resolution",
    minDurationSec: 25,
    maxDurationSec: 35,
  }),
  Object.freeze({
    id: "extended_short",
    productionCapable: true,
    informationDensity: "balanced",
    visualDensity: "high",
    pacingProfile: "escalating",
    endingStrategy: "payoff_reveal",
    minDurationSec: 36,
    maxDurationSec: 60,
  }),
  Object.freeze({
    id: "long_form_explainer",
    productionCapable: false,
    informationDensity: "balanced",
    visualDensity: "medium",
    pacingProfile: "escalating",
    endingStrategy: "resolution",
    minDurationSec: 61,
    maxDurationSec: 600,
  }),
  Object.freeze({
    id: "long_form_documentary",
    productionCapable: false,
    informationDensity: "sparse",
    visualDensity: "high",
    pacingProfile: "reveal_late",
    endingStrategy: "payoff_reveal",
    minDurationSec: 61,
    maxDurationSec: 600,
  }),
]);

const PROFILE_BY_ID = new Map<StoryFormatStrategyId, RetentionFormatStrategyProfile>(
  PROFILES.map((profile) => [profile.id, profile]),
);

export function getRetentionFormatStrategyRegistryVersion(): string {
  return RETENTION_FORMAT_STRATEGY_REGISTRY_VERSION;
}

export function listRetentionFormatStrategyProfiles(): readonly RetentionFormatStrategyProfile[] {
  return PROFILES;
}

export function getRetentionFormatStrategyProfile(
  id: StoryFormatStrategyId,
): RetentionFormatStrategyProfile | undefined {
  return PROFILE_BY_ID.get(id);
}

export function assertRetentionFormatStrategyProductionCapable(
  id: string,
): RetentionFormatCapabilityResult {
  const profile = PROFILE_BY_ID.get(id as StoryFormatStrategyId);
  if (!profile) {
    return { ok: false, reason: "unknown_format_strategy", strategyId: id };
  }
  if (!profile.productionCapable) {
    return { ok: false, reason: "long_form_not_supported", strategyId: id };
  }
  return { ok: true, profile };
}

/** Normalize duration to whole seconds; missing/non-finite → 30. */
export function normalizeRetentionDurationSec(raw: unknown): number {
  if (raw == null || raw === "") {
    return RETENTION_DEFAULT_DURATION_SEC;
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    return RETENTION_DEFAULT_DURATION_SEC;
  }
  return Math.round(n);
}

export function resolveStoryDurationClass(durationSec: number): StoryDurationClass {
  if (durationSec < 25) return "ultra_short";
  if (durationSec <= 35) return "short";
  if (durationSec <= 60) return "extended";
  return "long_form";
}

export function resolveAutoFormatStrategyId(
  durationSec: number,
): StoryFormatStrategyId {
  if (durationSec >= 15 && durationSec <= 35) return "short_retention";
  if (durationSec >= 36 && durationSec <= 60) return "extended_short";
  throw new RetentionStoryError(
    "long_form_not_supported",
    "Auto format strategy is not available outside the 15–60 second envelope.",
  );
}

function assertDurationInProductionEnvelope(durationSec: number): void {
  if (
    durationSec < RETENTION_MIN_DURATION_SEC ||
    durationSec > RETENTION_MAX_DURATION_SEC
  ) {
    throw new RetentionStoryError(
      "invalid_duration",
      "Duration must be within the current 15–60 second production envelope.",
    );
  }
}

function assertStrategyCompatibleWithDuration(
  strategyId: StoryFormatStrategyId,
  durationSec: number,
): void {
  const profile = PROFILE_BY_ID.get(strategyId);
  if (!profile) {
    throw new RetentionStoryError(
      "unknown_format_strategy",
      "Format strategy is not recognized.",
    );
  }
  if (!profile.productionCapable) {
    throw new RetentionStoryError(
      "long_form_not_supported",
      "Long-form format strategies are not enabled for production.",
    );
  }
  if (durationSec < profile.minDurationSec || durationSec > profile.maxDurationSec) {
    throw new RetentionStoryError(
      "incompatible_format_strategy",
      "Explicit format strategy is incompatible with the selected duration.",
    );
  }
}

/**
 * Resolve format strategy from Auto or explicit selection.
 * Does not silently replace incompatible explicit intent with Auto.
 */
export function resolveFormatStrategy(input: {
  readonly durationSec: number;
  readonly selection?: StoryFormatStrategySelection | string | null;
}): {
  readonly formatStrategyId: StoryFormatStrategyId;
  readonly durationClass: StoryDurationClass;
  readonly profile: RetentionFormatStrategyProfile;
} {
  assertDurationInProductionEnvelope(input.durationSec);
  const durationClass = resolveStoryDurationClass(input.durationSec);
  const raw = input.selection == null || input.selection === "" ? "auto" : input.selection;

  if (raw === "auto") {
    const formatStrategyId = resolveAutoFormatStrategyId(input.durationSec);
    const profile = PROFILE_BY_ID.get(formatStrategyId)!;
    return { formatStrategyId, durationClass, profile };
  }

  if (!PROFILE_BY_ID.has(raw as StoryFormatStrategyId)) {
    throw new RetentionStoryError(
      "unknown_format_strategy",
      "Format strategy is not recognized.",
    );
  }

  const formatStrategyId = raw as StoryFormatStrategyId;
  assertStrategyCompatibleWithDuration(formatStrategyId, input.durationSec);
  const profile = PROFILE_BY_ID.get(formatStrategyId)!;
  return { formatStrategyId, durationClass, profile };
}
