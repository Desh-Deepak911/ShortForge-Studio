import { normalizeCaptionMode } from "@/features/story/utils/caption.utils";
import {
  getSubtitleDisplayChunks,
  getSubtitlesCaptionSource,
  splitSubtitleChunks,
  SUBTITLE_ESTIMATED_CHARS_PER_LINE,
  SUBTITLE_MAX_VISIBLE_LINES,
} from "@/features/story/utils/subtitle.utils";
import type { FootieScene } from "@/features/story/types";

import type { SubtitleTimingSceneEvent } from "./subtitle-timing.types";

/** Resolves narrated subtitle chunks for a scene (persisted override or derived split). */
export function resolveDefaultSceneSubtitleChunks(scene: FootieScene): string[] {
  const persisted = (scene as FootieScene & { subtitleChunks?: string[] }).subtitleChunks;
  if (persisted && persisted.length > 0) {
    return persisted;
  }

  return getSubtitleDisplayChunks(scene);
}

/** Resolves narrated subtitle source text (`subtitleText` → `narration`, placeholders ignored). */
export function resolveDefaultSubtitleText(scene: FootieScene): string {
  return getSubtitlesCaptionSource(scene);
}

/** Adapts master-timeline scene events to subtitle timing engine input. */
export function toSubtitleTimingSceneEvents(
  scenes: FootieScene[],
  sceneEvents: Array<{
    metadata: { sceneId: string; sceneIndex?: number };
    startMs: number;
    endMs: number;
    durationMs: number;
  }>,
): SubtitleTimingSceneEvent[] {
  const sceneIndexById = new Map(scenes.map((scene, index) => [scene.id, index]));

  return sceneEvents.map((event) => ({
    sceneId: event.metadata.sceneId,
    sceneIndex: event.metadata.sceneIndex ?? sceneIndexById.get(event.metadata.sceneId) ?? 0,
    startMs: event.startMs,
    endMs: event.endMs,
    durationMs: event.durationMs,
  }));
}

export interface SubtitleTimingEventConversionDiagnostics {
  lineCapOverflowRisk: boolean;
  subtitleExtendsBeyondScene: boolean;
}

/** Converts engine chunks into master-timeline-compatible subtitle event payloads. */
export function mapSubtitleTimingChunksToEvents(
  chunks: Array<{
    sceneId: string;
    sceneIndex: number;
    chunkIndex: number;
    chunkCount: number;
    text: string;
    startMs: number;
    endMs: number;
  }>,
  sceneEndMsById: Map<string, number>,
): {
  events: Array<{
    id: string;
    startMs: number;
    endMs: number;
    durationMs: number;
    metadata: {
      sceneId: string;
      sceneIndex: number;
      chunkIndex: number;
      chunkCount: number;
      text: string;
      captionMode: "subtitles";
    };
  }>;
  diagnostics: SubtitleTimingEventConversionDiagnostics;
} {
  let lineCapOverflowRisk = false;
  let subtitleExtendsBeyondScene = false;

  const events = chunks.map((chunk) => {
    const text = chunk.text;

    if (text.trim()) {
      const estimatedLines = Math.max(
        1,
        Math.ceil(text.trim().length / SUBTITLE_ESTIMATED_CHARS_PER_LINE),
      );
      if (estimatedLines > SUBTITLE_MAX_VISIBLE_LINES) {
        lineCapOverflowRisk = true;
      }
    }

    const sceneEndMs = sceneEndMsById.get(chunk.sceneId);
    if (sceneEndMs != null && chunk.endMs > sceneEndMs) {
      subtitleExtendsBeyondScene = true;
    }

    return {
      id: `subtitle-${chunk.sceneId}-${chunk.chunkIndex}`,
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      durationMs: Math.max(0, chunk.endMs - chunk.startMs),
      metadata: {
        sceneId: chunk.sceneId,
        sceneIndex: chunk.sceneIndex,
        chunkIndex: chunk.chunkIndex,
        chunkCount: chunk.chunkCount,
        text,
        captionMode: "subtitles" as const,
      },
    };
  });

  return {
    events,
    diagnostics: {
      lineCapOverflowRisk,
      subtitleExtendsBeyondScene,
    },
  };
}

/** True when a scene uses narrated subtitles mode. */
export function isNarratedSubtitlesScene(scene: FootieScene): boolean {
  return normalizeCaptionMode(scene.captionMode) === "subtitles";
}

export const SUBTITLE_TIMING_MIN_CHUNK_MS = 500;

/** Counts spoken words in subtitle chunk text for timing weight. */
export function countTimingWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  return trimmed.split(/\s+/).filter(Boolean).length;
}

/** Normalizes weighted chunk durations to fill a scene window exactly. */
export function normalizeWeightedDurations(
  weights: number[],
  sceneDurationMs: number,
  minChunkDurationMs: number = SUBTITLE_TIMING_MIN_CHUNK_MS,
): number[] {
  const chunkCount = weights.length;
  if (chunkCount === 0) {
    return [];
  }

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const proportional = weights.map((weight) => (sceneDurationMs * weight) / totalWeight);
  let durations = proportional.map((duration) => Math.max(minChunkDurationMs, duration));
  let sum = durations.reduce((total, duration) => total + duration, 0);

  if (sum < sceneDurationMs) {
    const remainder = sceneDurationMs - sum;
    const extras = weights.map((weight) => (remainder * weight) / totalWeight);
    durations = durations.map((duration, index) => duration + (extras[index] ?? 0));
  }

  sum = durations.reduce((total, duration) => total + duration, 0);
  durations[chunkCount - 1] = (durations[chunkCount - 1] ?? 0) + (sceneDurationMs - sum);

  return durations;
}

export interface WordWeightedChunkAllocation {
  windows: Array<{ startMs: number; endMs: number }>;
  durations: number[];
  usedEqualFallback: boolean;
}

function buildEqualFallbackAllocation(
  chunkCount: number,
  sceneStartMs: number,
  sceneEndMs: number,
): WordWeightedChunkAllocation {
  const sceneDurationMs = sceneEndMs - sceneStartMs;
  const durations = Array.from({ length: chunkCount }, () => sceneDurationMs / chunkCount);

  return {
    windows: buildChunkWindowsFromDurations(sceneStartMs, sceneEndMs, durations),
    durations,
    usedEqualFallback: true,
  };
}

/** Allocates scene windows proportionally by word count, with minimum-duration safeguards. */
export function allocateWordWeightedChunkWindows(
  textChunks: string[],
  sceneStartMs: number,
  sceneEndMs: number,
  minChunkDurationMs: number = SUBTITLE_TIMING_MIN_CHUNK_MS,
): WordWeightedChunkAllocation {
  const nonEmptyChunks = textChunks.filter((text) => text.trim().length > 0);
  const chunkCount = nonEmptyChunks.length;
  const sceneDurationMs = sceneEndMs - sceneStartMs;

  if (chunkCount === 0 || sceneDurationMs <= 0) {
    return { windows: [], durations: [], usedEqualFallback: false };
  }

  if (chunkCount * minChunkDurationMs > sceneDurationMs) {
    return buildEqualFallbackAllocation(chunkCount, sceneStartMs, sceneEndMs);
  }

  const weights = nonEmptyChunks.map((text) => Math.max(1, countTimingWords(text)));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const proportional = weights.map((weight) => (sceneDurationMs * weight) / totalWeight);
  const clampedMinimum = proportional.map((duration) => Math.max(minChunkDurationMs, duration));

  if (clampedMinimum.reduce((total, duration) => total + duration, 0) > sceneDurationMs) {
    return buildEqualFallbackAllocation(chunkCount, sceneStartMs, sceneEndMs);
  }

  const durations = normalizeWeightedDurations(weights, sceneDurationMs, minChunkDurationMs);

  return {
    windows: buildChunkWindowsFromDurations(sceneStartMs, sceneEndMs, durations),
    durations,
    usedEqualFallback: false,
  };
}

function buildChunkWindowsFromDurations(
  sceneStartMs: number,
  sceneEndMs: number,
  durations: number[],
): Array<{ startMs: number; endMs: number }> {
  const windows: Array<{ startMs: number; endMs: number }> = [];
  let cursor = sceneStartMs;

  for (let chunkIndex = 0; chunkIndex < durations.length; chunkIndex++) {
    const startMs = cursor;
    const endMs =
      chunkIndex === durations.length - 1
        ? sceneEndMs
        : cursor + (durations[chunkIndex] ?? 0);

    windows.push({ startMs, endMs });
    cursor = endMs;
  }

  return windows;
}

export {
  getSubtitleDisplayChunks,
  getSubtitlesCaptionSource,
  splitSubtitleChunks,
};
