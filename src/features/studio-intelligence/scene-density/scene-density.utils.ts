import {
  STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS,
} from "../studio-intelligence.constants";
import type { SceneBlueprint, SceneBlueprintCollection } from "../scene-blueprint.types";
import type { SceneImportanceScore } from "../studio-intelligence.types";
import {
  normalizeNarrationText,
  resolveSceneImportanceTier,
  splitNarrationIntoSentences,
} from "../studio-intelligence.utils";
import {
  clampBlueprintConfidence,
  createSceneBlueprintId,
} from "../scene-blueprint.utils";

export const SCENE_DENSITY_ADAPTER_VERSION = "0.1.0";

const HIGH_IMPORTANCE_THRESHOLD = 0.65;
const LOW_IMPORTANCE_THRESHOLD = 0.5;

export function cloneSceneBlueprintCollection(
  collection: SceneBlueprintCollection,
): SceneBlueprintCollection {
  return {
    ...collection,
    sourceArcIds: [...collection.sourceArcIds],
    warnings: [...collection.warnings],
    blueprints: collection.blueprints.map((blueprint) => cloneSceneBlueprint(blueprint)),
  };
}

export function cloneSceneBlueprint(blueprint: SceneBlueprint): SceneBlueprint {
  return {
    ...blueprint,
    beatIds: [...blueprint.beatIds],
    importance: { ...blueprint.importance },
    timing: { ...blueprint.timing },
    visual: { ...blueprint.visual },
    asset: { ...blueprint.asset },
    motion: { ...blueprint.motion },
    caption: {
      ...blueprint.caption,
      highlightWords: [...blueprint.caption.highlightWords],
    },
  };
}

export function isLowImportanceBlueprint(blueprint: SceneBlueprint): boolean {
  return (
    blueprint.importance.value < LOW_IMPORTANCE_THRESHOLD ||
    blueprint.importance.tier === "low"
  );
}

export function isHighImportanceBlueprint(blueprint: SceneBlueprint): boolean {
  return (
    blueprint.importance.value >= HIGH_IMPORTANCE_THRESHOLD ||
    blueprint.importance.tier === "high" ||
    blueprint.importance.tier === "critical"
  );
}

export function isSplittableBlueprint(blueprint: SceneBlueprint): boolean {
  if (!isHighImportanceBlueprint(blueprint)) {
    return false;
  }

  return blueprint.timing.suggestedDurationMs >= STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS * 2;
}

export function sumBlueprintDurationMs(blueprints: readonly SceneBlueprint[]): number {
  return blueprints.reduce(
    (total, blueprint) => total + Math.round(blueprint.timing.suggestedDurationMs),
    0,
  );
}

export function collectBlueprintBeatIds(blueprints: readonly SceneBlueprint[]): Set<string> {
  const beatIds = new Set<string>();

  for (const blueprint of blueprints) {
    for (const beatId of blueprint.beatIds) {
      beatIds.add(beatId);
    }
  }

  return beatIds;
}

export function collectNormalizedSummaries(blueprints: readonly SceneBlueprint[]): string[] {
  return blueprints
    .map((blueprint) => normalizeNarrationText(blueprint.summary))
    .filter(Boolean);
}

export function narrationCoveragePreserved(
  before: readonly SceneBlueprint[],
  after: readonly SceneBlueprint[],
): boolean {
  const beforeSummaries = collectNormalizedSummaries(before);
  const afterCombined = normalizeNarrationText(
    after.map((blueprint) => blueprint.summary).join(" "),
  );

  if (beforeSummaries.length === 0) {
    return true;
  }

  return beforeSummaries.every((summary) => afterCombined.includes(summary));
}

export function maxImportancePreserved(
  before: readonly SceneBlueprint[],
  after: readonly SceneBlueprint[],
): boolean {
  const beforeMax = before.reduce(
    (max, blueprint) => Math.max(max, blueprint.importance.value),
    0,
  );
  const afterMax = after.reduce(
    (max, blueprint) => Math.max(max, blueprint.importance.value),
    0,
  );

  return afterMax + 0.001 >= beforeMax;
}

export function lineagePreserved(
  before: readonly SceneBlueprint[],
  after: readonly SceneBlueprint[],
): boolean {
  const beforeBeatIds = collectBlueprintBeatIds(before);
  const afterBeatIds = collectBlueprintBeatIds(after);

  if (beforeBeatIds.size !== afterBeatIds.size) {
    return false;
  }

  for (const beatId of beforeBeatIds) {
    if (!afterBeatIds.has(beatId)) {
      return false;
    }
  }

  return true;
}

export function durationPreserved(
  before: readonly SceneBlueprint[],
  after: readonly SceneBlueprint[],
): boolean {
  return sumBlueprintDurationMs(before) === sumBlueprintDurationMs(after);
}

function mergeImportance(
  left: SceneImportanceScore,
  right: SceneImportanceScore,
): SceneImportanceScore {
  const value = Math.max(left.value, right.value);

  return {
    value,
    tier: resolveSceneImportanceTier(value),
    rationale: "Merged importance preserves the higher scene weight.",
  };
}

function mergeConfidence(left: SceneBlueprint, right: SceneBlueprint): number {
  const leftWeight = Math.max(1, left.timing.suggestedDurationMs);
  const rightWeight = Math.max(1, right.timing.suggestedDurationMs);
  const total = leftWeight + rightWeight;

  return clampBlueprintConfidence(
    (left.confidence * leftWeight + right.confidence * rightWeight) / total,
  );
}

function mergeTiming(left: SceneBlueprint, right: SceneBlueprint): SceneBlueprint["timing"] {
  const suggestedDurationMs = Math.round(
    left.timing.suggestedDurationMs + right.timing.suggestedDurationMs,
  );

  return {
    suggestedDurationMs: Math.max(STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS, suggestedDurationMs),
    minDurationMs: Math.min(left.timing.minDurationMs, right.timing.minDurationMs),
    maxDurationMs: left.timing.maxDurationMs + right.timing.maxDurationMs,
    pacing: left.importance.value >= right.importance.value ? left.timing.pacing : right.timing.pacing,
    reason: "Merged from adjacent low-importance blueprints.",
  };
}

function splitSummaryInHalf(summary: string): [string, string] {
  const normalized = normalizeNarrationText(summary);
  const sentences = splitNarrationIntoSentences(normalized);

  if (sentences.length >= 2) {
    const midpoint = Math.ceil(sentences.length / 2);
    return [
      sentences.slice(0, midpoint).join(" "),
      sentences.slice(midpoint).join(" "),
    ];
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const midpoint = Math.ceil(words.length / 2);
    return [
      words.slice(0, midpoint).join(" "),
      words.slice(midpoint).join(" "),
    ];
  }

  return [normalized, normalized];
}

function splitBeatIds(beatIds: readonly string[]): [string[], string[]] {
  if (beatIds.length >= 2) {
    const midpoint = Math.ceil(beatIds.length / 2);
    return [beatIds.slice(0, midpoint), beatIds.slice(midpoint)];
  }

  return [[...beatIds], [...beatIds]];
}

function splitTiming(durationMs: number): [number, number] {
  const first = Math.max(
    STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS,
    Math.floor(durationMs / 2),
  );
  const second = Math.max(STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS, durationMs - first);

  return [first, second];
}

export function mergeAdjacentBlueprints(
  left: SceneBlueprint,
  right: SceneBlueprint,
  order: number,
): SceneBlueprint {
  return {
    ...cloneSceneBlueprint(left),
    id: createSceneBlueprintId(order),
    arcId: left.arcId ?? right.arcId,
    beatIds: [...new Set([...left.beatIds, ...right.beatIds])],
    title: left.title.length >= right.title.length ? left.title : right.title,
    summary: normalizeNarrationText(`${left.summary} ${right.summary}`),
    importance: mergeImportance(left.importance, right.importance),
    timing: mergeTiming(left, right),
    confidence: mergeConfidence(left, right),
    caption: left.caption.emphasis !== "none" ? left.caption : right.caption,
  };
}

export function splitBlueprint(blueprint: SceneBlueprint, order: number): [SceneBlueprint, SceneBlueprint] {
  const [summaryA, summaryB] = splitSummaryInHalf(blueprint.summary);
  const [beatIdsA, beatIdsB] = splitBeatIds(blueprint.beatIds);
  const [durationA, durationB] = splitTiming(blueprint.timing.suggestedDurationMs);

  const buildHalf = (
    summary: string,
    beatIds: string[],
    durationMs: number,
    halfOrder: number,
  ): SceneBlueprint => ({
    ...cloneSceneBlueprint(blueprint),
    id: createSceneBlueprintId(halfOrder),
    beatIds,
    summary,
    timing: {
      ...blueprint.timing,
      suggestedDurationMs: durationMs,
      minDurationMs: Math.min(blueprint.timing.minDurationMs, durationMs),
      maxDurationMs: Math.max(blueprint.timing.maxDurationMs, durationMs),
      reason: "Split from long high-importance blueprint.",
    },
    confidence: clampBlueprintConfidence(blueprint.confidence),
  });

  return [
    buildHalf(summaryA, beatIdsA, durationA, order),
    buildHalf(summaryB, beatIdsB, durationB, order + 1),
  ];
}

export interface MergeCandidate {
  index: number;
  score: number;
  strictLowImportance: boolean;
}

function isPeakPreservingMergePair(
  left: SceneBlueprint,
  right: SceneBlueprint,
  peakImportance: number,
): boolean {
  if (left.importance.tier === "critical" || right.importance.tier === "critical") {
    return false;
  }

  return (
    left.importance.value + 0.001 < peakImportance &&
    right.importance.value + 0.001 < peakImportance
  );
}

export function findBestMergeCandidate(blueprints: readonly SceneBlueprint[]): MergeCandidate | null {
  const peakImportance = blueprints.reduce(
    (max, blueprint) => Math.max(max, blueprint.importance.value),
    0,
  );
  let best: MergeCandidate | null = null;

  for (let index = 0; index < blueprints.length - 1; index += 1) {
    const left = blueprints[index];
    const right = blueprints[index + 1];

    if (!left || !right) {
      continue;
    }

    const strictLowImportance =
      isLowImportanceBlueprint(left) && isLowImportanceBlueprint(right);
    const peakPreservingMerge =
      !strictLowImportance && isPeakPreservingMergePair(left, right, peakImportance);

    if (!strictLowImportance && !peakPreservingMerge) {
      continue;
    }

    const combinedImportance = left.importance.value + right.importance.value;
    const score = strictLowImportance ? combinedImportance : combinedImportance + 1;

    if (!best || score < best.score || (score === best.score && strictLowImportance && !best.strictLowImportance)) {
      best = { index, score, strictLowImportance };
    }
  }

  return best;
}

export function findBestSplitCandidate(blueprints: readonly SceneBlueprint[]): number | null {
  let bestIndex: number | null = null;
  let bestScore = -1;

  for (let index = 0; index < blueprints.length; index += 1) {
    const blueprint = blueprints[index];
    if (!blueprint || !isSplittableBlueprint(blueprint)) {
      continue;
    }

    const score = blueprint.importance.value * blueprint.timing.suggestedDurationMs;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}
