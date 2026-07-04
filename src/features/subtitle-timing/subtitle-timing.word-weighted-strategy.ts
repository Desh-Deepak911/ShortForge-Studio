import type {
  SubtitleTimingBuildInput,
  SubtitleTimingMap,
  SubtitleTimingStrategy,
} from "./subtitle-timing.types";
import {
  allocateWordWeightedChunkWindows,
  isNarratedSubtitlesScene,
} from "./subtitle-timing.utils";

function resolveTotalDurationMs(input: SubtitleTimingBuildInput): number {
  if (input.totalDurationMs > 0) {
    return input.totalDurationMs;
  }

  const lastEvent = input.sceneEvents[input.sceneEvents.length - 1];
  return lastEvent?.endMs ?? 0;
}

/** Allocates subtitle windows by word count within each scene event. */
export const wordWeightedSubtitleTimingStrategy: SubtitleTimingStrategy = {
  id: "word_weighted",
  build(input: SubtitleTimingBuildInput): SubtitleTimingMap {
    const sceneById = new Map(input.scenes.map((scene, index) => [scene.id, { scene, index }]));
    const chunks: SubtitleTimingMap["chunks"] = [];

    for (const sceneEvent of input.sceneEvents) {
      const entry = sceneById.get(sceneEvent.sceneId);
      if (!entry) {
        continue;
      }

      const { scene, index: sceneIndex } = entry;
      if (!isNarratedSubtitlesScene(scene)) {
        continue;
      }

      const textChunks = input.resolveSceneChunks(scene).filter((text) => text.trim().length > 0);
      if (textChunks.length === 0) {
        continue;
      }

      const allocation = allocateWordWeightedChunkWindows(
        textChunks,
        sceneEvent.startMs,
        sceneEvent.endMs,
      );
      const chunkCount = textChunks.length;

      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
        const window = allocation.windows[chunkIndex];
        if (!window) {
          continue;
        }

        chunks.push({
          sceneId: scene.id,
          sceneIndex,
          chunkIndex,
          chunkCount,
          text: textChunks[chunkIndex] ?? "",
          startMs: window.startMs,
          endMs: window.endMs,
          source: allocation.usedEqualFallback ? "fallback" : "word_weighted",
        });
      }
    }

    return {
      strategy: "word_weighted",
      source: "estimated",
      generatedAt: new Date(0).toISOString(),
      durationMs: resolveTotalDurationMs(input),
      chunks,
    };
  },
};
