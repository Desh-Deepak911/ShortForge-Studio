import type { SceneBlueprint } from "../scene-blueprint.types";
import { normalizeNarrationText, splitNarrationIntoSentences } from "../studio-intelligence.utils";
import type {
  BlueprintAdapterInput,
  BlueprintAdapterWarning,
  BlueprintMappedScene,
  BlueprintSceneNarrationMetadata,
  NarrationSlicingStrategy,
} from "./blueprint-adapter.types";
import { clampAdapterConfidence, createBlueprintAdapterWarning } from "./blueprint-adapter.utils";

const SUMMARY_MIN_LENGTH = 12;

export interface NarrationEnrichmentContext {
  warnings: BlueprintAdapterWarning[];
  fallbacksUsed: string[];
}

function createDefaultNarrationMetadata(
  strategy: BlueprintSceneNarrationMetadata["slicingStrategy"] = "topic_fallback",
  confidence = 0.4,
): BlueprintSceneNarrationMetadata {
  return {
    narrationStartIndex: -1,
    sentenceRange: { start: -1, end: -1 },
    slicingStrategy: strategy,
    narrationConfidence: clampAdapterConfidence(confidence),
  };
}

function findNarrationStartIndex(narration: string, excerpt: string): number {
  const normalizedExcerpt = normalizeNarrationText(excerpt);
  if (!normalizedExcerpt) {
    return -1;
  }

  const index = narration.indexOf(normalizedExcerpt);
  return index >= 0 ? index : -1;
}

function findSentenceRange(narration: string, excerpt: string): { start: number; end: number } {
  const sentences = splitNarrationIntoSentences(narration);
  const normalizedExcerpt = normalizeNarrationText(excerpt).toLowerCase();

  if (!normalizedExcerpt || sentences.length === 0) {
    return { start: -1, end: -1 };
  }

  for (let index = 0; index < sentences.length; index += 1) {
    if (sentences[index]?.toLowerCase().includes(normalizedExcerpt)) {
      return { start: index, end: index };
    }
  }

  for (let start = 0; start < sentences.length; start += 1) {
    for (let end = start; end < sentences.length; end += 1) {
      const combined = sentences.slice(start, end + 1).join(" ").toLowerCase();
      if (combined.includes(normalizedExcerpt) || normalizedExcerpt.includes(combined)) {
        return { start, end };
      }
    }
  }

  return { start: -1, end: -1 };
}

function hasMeaningfulSummary(blueprint: SceneBlueprint): boolean {
  const summary = normalizeNarrationText(blueprint.summary);
  return summary.length >= SUMMARY_MIN_LENGTH;
}

function distributeSentenceRanges(
  sentenceCount: number,
  sceneCount: number,
  durationWeights: readonly number[],
): Array<{ start: number; end: number }> {
  if (sentenceCount <= 0 || sceneCount <= 0) {
    return Array.from({ length: sceneCount }, () => ({ start: -1, end: -1 }));
  }

  const totalWeight = durationWeights.reduce((total, weight) => total + weight, 0) || sceneCount;
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  for (let index = 0; index < sceneCount; index += 1) {
    const isLast = index === sceneCount - 1;
    const weight = durationWeights[index] ?? 1;
    const remainingScenes = sceneCount - index;
    const remainingSentences = sentenceCount - cursor;

    let allocated = isLast
      ? remainingSentences
      : Math.max(1, Math.round((weight / totalWeight) * sentenceCount));

    allocated = Math.min(allocated, Math.max(remainingSentences - (remainingScenes - 1), 1));

    if (remainingSentences <= 0) {
      ranges.push({ start: -1, end: -1 });
      continue;
    }

    const start = cursor;
    const end = Math.min(sentenceCount - 1, cursor + Math.max(allocated, 1) - 1);
    ranges.push({ start, end });
    cursor = end + 1;
  }

  return ranges;
}

function resolveOverallNarrationStrategy(
  sceneStrategies: readonly BlueprintSceneNarrationMetadata["slicingStrategy"][],
): NarrationSlicingStrategy {
  if (sceneStrategies.length === 0) {
    return "none";
  }

  const unique = new Set(sceneStrategies);
  if (unique.size === 1) {
    return sceneStrategies[0] ?? "none";
  }

  return "mixed";
}

/** Applies blueprint-summary narration when summary text is available. */
export function sliceNarrationFromBlueprintSummary(
  blueprint: SceneBlueprint,
  normalizedNarration?: string,
): BlueprintSceneNarrationMetadata & { excerpt: string } {
  const excerpt = normalizeNarrationText(blueprint.summary);
  const narration = normalizeNarrationText(normalizedNarration);
  const sentenceRange = narration ? findSentenceRange(narration, excerpt) : { start: -1, end: -1 };

  return {
    excerpt,
    narrationStartIndex: narration ? findNarrationStartIndex(narration, excerpt) : -1,
    sentenceRange,
    slicingStrategy: "blueprint_summary",
    narrationConfidence: blueprint.beatIds.length > 0 ? 0.95 : 0.88,
  };
}

/** Applies proportional sentence slicing for scenes without meaningful summaries. */
export function sliceNarrationProportionally(
  sentences: readonly string[],
  sentenceRange: { start: number; end: number },
): BlueprintSceneNarrationMetadata & { excerpt: string } {
  if (
    sentenceRange.start < 0 ||
    sentenceRange.end < 0 ||
    sentenceRange.start >= sentences.length
  ) {
    return {
      excerpt: "",
      ...createDefaultNarrationMetadata("proportional_sentences", 0.35),
    };
  }

  const end = Math.min(sentenceRange.end, sentences.length - 1);
  const excerpt = sentences.slice(sentenceRange.start, end + 1).join(" ").trim();
  const narrationStartIndex =
    sentenceRange.start === 0
      ? 0
      : sentences.slice(0, sentenceRange.start).join(" ").length + (sentenceRange.start > 0 ? 1 : 0);

  return {
    excerpt,
    narrationStartIndex,
    sentenceRange: { start: sentenceRange.start, end },
    slicingStrategy: "proportional_sentences",
    narrationConfidence: excerpt.length > 0 ? 0.78 : 0.35,
  };
}

/** Enriches mapped scenes with narration excerpts and metadata. */
export function enrichMappedScenesWithNarration(
  mappedScenes: readonly BlueprintMappedScene[],
  blueprints: readonly SceneBlueprint[],
  input: BlueprintAdapterInput,
  context: NarrationEnrichmentContext,
): BlueprintMappedScene[] {
  const normalizedNarration = normalizeNarrationText(input.normalizedNarration);
  const sentences = splitNarrationIntoSentences(normalizedNarration);
  const blueprintById = new Map(blueprints.map((blueprint) => [blueprint.id, blueprint]));
  const scenesNeedingProportional: number[] = [];
  const durationWeights = mappedScenes.map((scene) => scene.durationMs);

  if (!normalizedNarration) {
    context.warnings.push(
      createBlueprintAdapterWarning(
        "MISSING_NARRATION",
        "Normalized narration missing; using blueprint summaries or topic fallback for excerpts.",
        "warning",
      ),
    );
  }

  const preliminary = mappedScenes.map((scene, index) => {
    const blueprint = blueprintById.get(scene.sourceBlueprintId);

    if (blueprint && hasMeaningfulSummary(blueprint)) {
      const sliced = sliceNarrationFromBlueprintSummary(blueprint, normalizedNarration || undefined);
      return {
        ...scene,
        narrationExcerpt: sliced.excerpt,
        narrationMetadata: {
          narrationStartIndex: sliced.narrationStartIndex,
          sentenceRange: sliced.sentenceRange,
          slicingStrategy: sliced.slicingStrategy,
          narrationConfidence: sliced.narrationConfidence,
        },
      };
    }

    scenesNeedingProportional.push(index);
    return scene;
  });

  if (scenesNeedingProportional.length === 0) {
    return preliminary;
  }

  if (sentences.length > 0) {
    const proportionalRanges = distributeSentenceRanges(
      sentences.length,
      scenesNeedingProportional.length,
      scenesNeedingProportional.map((index) => durationWeights[index] ?? 1),
    );

    return preliminary.map((scene, index) => {
      const proportionalIndex = scenesNeedingProportional.indexOf(index);
      if (proportionalIndex < 0) {
        return scene;
      }

      const sliced = sliceNarrationProportionally(sentences, proportionalRanges[proportionalIndex] ?? {
        start: -1,
        end: -1,
      });

      if (!sliced.excerpt) {
        context.fallbacksUsed.push("narration.topic_fallback");
        context.warnings.push(
          createBlueprintAdapterWarning(
            "NARRATION_SLICE_FALLBACK",
            "Proportional narration slice unavailable; using topic fallback excerpt.",
            "warning",
            scene.sourceBlueprintId,
            "narrationExcerpt",
          ),
        );

        const fallbackExcerpt = normalizeNarrationText(input.topic) || scene.title;
        return {
          ...scene,
          narrationExcerpt: fallbackExcerpt,
          narrationMetadata: createDefaultNarrationMetadata("topic_fallback", 0.4),
        };
      }

      return {
        ...scene,
        narrationExcerpt: sliced.excerpt,
        narrationMetadata: {
          narrationStartIndex: sliced.narrationStartIndex,
          sentenceRange: sliced.sentenceRange,
          slicingStrategy: sliced.slicingStrategy,
          narrationConfidence: sliced.narrationConfidence,
        },
      };
    });
  }

  context.fallbacksUsed.push("narration.topic_fallback");
  return preliminary.map((scene, index) => {
    if (!scenesNeedingProportional.includes(index)) {
      return scene;
    }

    const blueprint = blueprintById.get(scene.sourceBlueprintId);
    const fallbackExcerpt =
      normalizeNarrationText(blueprint?.summary) ||
      normalizeNarrationText(input.topic) ||
      scene.title;

    context.warnings.push(
      createBlueprintAdapterWarning(
        "NARRATION_SLICE_FALLBACK",
        "Narration unavailable; using summary/topic fallback excerpt.",
        "warning",
        scene.sourceBlueprintId,
        "narrationExcerpt",
      ),
    );

    return {
      ...scene,
      narrationExcerpt: fallbackExcerpt,
      narrationMetadata: createDefaultNarrationMetadata("topic_fallback", 0.4),
    };
  });
}

/** Resolves the overall narration slicing strategy from mapped scenes. */
export function resolveNarrationSlicingStrategy(
  mappedScenes: readonly BlueprintMappedScene[],
): NarrationSlicingStrategy {
  return resolveOverallNarrationStrategy(
    mappedScenes.map((scene) => scene.narrationMetadata.slicingStrategy),
  );
}

/** Creates default narration metadata for pre-enrichment mapped scenes. */
export function createPlaceholderNarrationMetadata(
  blueprint: SceneBlueprint,
): BlueprintSceneNarrationMetadata {
  if (hasMeaningfulSummary(blueprint)) {
    return {
      narrationStartIndex: -1,
      sentenceRange: { start: -1, end: -1 },
      slicingStrategy: "blueprint_summary",
      narrationConfidence: 0.88,
    };
  }

  return createDefaultNarrationMetadata("proportional_sentences", 0.5);
}
