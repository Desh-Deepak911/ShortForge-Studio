import type { FootieScene } from "@/features/story/types";

export type SubtitleTimingStrategyId = "equal" | "word_weighted" | "aligned";

export type SubtitleTimingChunkSource = "equal" | "word_weighted" | "aligned" | "fallback";

export type SubtitleTimingMapSource = "legacy_equal" | "estimated" | "aligned" | "fallback";

export interface SubtitleTimingChunk {
  sceneId: string;
  sceneIndex: number;
  chunkIndex: number;
  chunkCount: number;
  text: string;
  startMs: number;
  endMs: number;
  source: SubtitleTimingChunkSource;
}

export interface SubtitleTimingMap {
  strategy: SubtitleTimingStrategyId;
  source: SubtitleTimingMapSource;
  generatedAt: string;
  durationMs: number;
  chunks: SubtitleTimingChunk[];
}

/** Scene window input for subtitle timing strategies. */
export interface SubtitleTimingSceneEvent {
  sceneId: string;
  sceneIndex: number;
  startMs: number;
  endMs: number;
  durationMs: number;
}

export interface SubtitleTimingBuildInput {
  scenes: FootieScene[];
  sceneEvents: SubtitleTimingSceneEvent[];
  totalDurationMs: number;
  resolveSceneChunks: (scene: FootieScene) => string[];
  resolveSubtitleText: (scene: FootieScene) => string;
  splitSubtitleChunks: (text: string) => string[];
}

export interface SubtitleTimingStrategy {
  id: SubtitleTimingStrategyId;
  build(input: SubtitleTimingBuildInput): SubtitleTimingMap;
}

export interface SubtitleTimingBuildOptions {
  strategy?: SubtitleTimingStrategyId;
  generatedAt?: string;
}
