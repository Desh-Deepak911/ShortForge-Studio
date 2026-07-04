import { getSubtitleChunkDurationMs } from "@/features/story/utils/subtitle.utils";

import type {
  SubtitleTimingBuildInput,
  SubtitleTimingMap,
  SubtitleTimingStrategy,
} from "./subtitle-timing.types";
import { isNarratedSubtitlesScene } from "./subtitle-timing.utils";

function resolveTotalDurationMs(input: SubtitleTimingBuildInput): number {
  if (input.totalDurationMs > 0) {
    return input.totalDurationMs;
  }

  const lastEvent = input.sceneEvents[input.sceneEvents.length - 1];
  return lastEvent?.endMs ?? 0;
}

/** Reproduces legacy equal-split subtitle timing within each scene window. */
export const equalSubtitleTimingStrategy: SubtitleTimingStrategy = {
  id: "equal",
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

      const textChunks = input.resolveSceneChunks(scene);
      if (textChunks.length === 0) {
        continue;
      }

      const chunkCount = textChunks.length;
      const chunkDurationMs = getSubtitleChunkDurationMs(sceneEvent.durationMs, chunkCount);

      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
        const startMs = sceneEvent.startMs + chunkIndex * chunkDurationMs;
        const endMs =
          chunkIndex === chunkCount - 1
            ? sceneEvent.endMs
            : sceneEvent.startMs + (chunkIndex + 1) * chunkDurationMs;

        chunks.push({
          sceneId: scene.id,
          sceneIndex,
          chunkIndex,
          chunkCount,
          text: textChunks[chunkIndex] ?? "",
          startMs,
          endMs,
          source: "equal",
        });
      }
    }

    return {
      strategy: "equal",
      source: "legacy_equal",
      generatedAt: new Date(0).toISOString(),
      durationMs: resolveTotalDurationMs(input),
      chunks,
    };
  },
};
