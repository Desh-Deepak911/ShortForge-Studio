import {
  STUDIO_INTELLIGENCE_MAX_SCENE_DURATION_MS,
  STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS,
} from "./studio-intelligence.constants";
import type {
  AssetRequirementType,
  SceneImportanceScore,
  VisualIntentType,
} from "./studio-intelligence.types";
import type {
  MotionBlueprintIntensity,
  SceneBlueprint,
  SceneBlueprintCollection,
} from "./scene-blueprint.types";

let sceneBlueprintIdCounter = 0;

/** Creates a stable scene blueprint identifier for planning metadata. */
export function createSceneBlueprintId(order?: number): string {
  if (order != null && Number.isFinite(order)) {
    return `blueprint-${Math.max(0, Math.floor(order)) + 1}`;
  }

  sceneBlueprintIdCounter += 1;
  return `blueprint-${sceneBlueprintIdCounter}`;
}

/** Returns an empty blueprint collection shell. */
export function createEmptySceneBlueprintCollection(): SceneBlueprintCollection {
  return {
    blueprints: [],
    sourceArcIds: [],
    totalSuggestedDurationMs: 0,
    averageImportance: 0,
    confidence: 1,
    warnings: [],
  };
}

function roundNormalized(value: number): number {
  return Math.min(1, Math.max(0, Math.round(value * 1000) / 1000));
}

/** Clamps blueprint confidence to `[0, 1]`. */
export function clampBlueprintConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return roundNormalized(value);
}

/** Normalizes asset search queries for planning lookups. */
export function normalizeAssetSearchQuery(value: string | undefined | null): string {
  if (value == null) {
    return "";
  }

  return value
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Maps a visual intent to a default asset requirement class. */
export function mapVisualIntentToAssetRequirement(
  visualIntentType: VisualIntentType,
): AssetRequirementType {
  switch (visualIntentType) {
    case "player_portrait":
    case "comparison_split":
      return "image";
    case "match_action":
    case "crowd_atmosphere":
    case "archive_footage":
      return "video_clip";
    case "stat_overlay":
      return "stat_card";
    case "timeline_graphic":
    case "text_card":
      return "generated_graphic";
    case "team_crest":
      return "logo";
    case "neutral_broll":
      return "video_clip";
    default:
      return "placeholder";
  }
}

/** Maps scene importance to a motion intensity recommendation. */
export function mapImportanceToMotionIntensity(
  importance: SceneImportanceScore | number,
): MotionBlueprintIntensity {
  const value = typeof importance === "number" ? importance : importance.value;
  const tier = typeof importance === "number" ? undefined : importance.tier;

  if (tier === "critical" || value >= 0.85) {
    return "high";
  }

  if (tier === "high" || value >= 0.65) {
    return "medium";
  }

  return "low";
}

function clampDurationMs(durationMs: number): number {
  if (!Number.isFinite(durationMs)) {
    return STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS;
  }

  return Math.min(
    STUDIO_INTELLIGENCE_MAX_SCENE_DURATION_MS,
    Math.max(STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS, Math.round(durationMs)),
  );
}

/** Calculates aggregate stats for a blueprint collection. */
export function calculateBlueprintCollectionStats(
  blueprints: SceneBlueprint[],
): Pick<
  SceneBlueprintCollection,
  "sourceArcIds" | "totalSuggestedDurationMs" | "averageImportance" | "confidence"
> {
  if (blueprints.length === 0) {
    return {
      sourceArcIds: [],
      totalSuggestedDurationMs: 0,
      averageImportance: 0,
      confidence: 1,
    };
  }

  const sourceArcIds = [...new Set(blueprints.map((blueprint) => blueprint.arcId).filter(Boolean))] as string[];

  const totalSuggestedDurationMs = blueprints.reduce(
    (total, blueprint) => total + clampDurationMs(blueprint.timing.suggestedDurationMs),
    0,
  );

  const averageImportance = roundNormalized(
    blueprints.reduce((total, blueprint) => total + blueprint.importance.value, 0) / blueprints.length,
  );

  const confidence = roundNormalized(
    blueprints.reduce((total, blueprint) => total + clampBlueprintConfidence(blueprint.confidence), 0) /
      blueprints.length,
  );

  return {
    sourceArcIds,
    totalSuggestedDurationMs,
    averageImportance,
    confidence,
  };
}

/** Applies aggregate stats to an existing blueprint collection without mutating blueprints. */
export function refreshBlueprintCollectionStats(
  collection: SceneBlueprintCollection,
): SceneBlueprintCollection {
  const stats = calculateBlueprintCollectionStats(collection.blueprints);

  return {
    ...collection,
    ...stats,
    warnings: [...collection.warnings],
    blueprints: [...collection.blueprints],
  };
}
