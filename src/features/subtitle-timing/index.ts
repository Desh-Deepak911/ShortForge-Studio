export type {
  SubtitleTimingBuildInput,
  SubtitleTimingBuildOptions,
  SubtitleTimingChunk,
  SubtitleTimingChunkSource,
  SubtitleTimingMap,
  SubtitleTimingMapSource,
  SubtitleTimingSceneEvent,
  SubtitleTimingStrategy,
  SubtitleTimingStrategyId,
} from "./subtitle-timing.types";

export {
  buildSubtitleTimingMap,
  getSubtitleTimingStrategy,
} from "./subtitle-timing.engine";

export { resolveSubtitleTimingStrategy } from "./subtitle-timing.resolver";

export { equalSubtitleTimingStrategy } from "./subtitle-timing.equal-strategy";

export { wordWeightedSubtitleTimingStrategy } from "./subtitle-timing.word-weighted-strategy";

export {
  allocateWordWeightedChunkWindows,
  countTimingWords,
  isNarratedSubtitlesScene,
  mapSubtitleTimingChunksToEvents,
  normalizeWeightedDurations,
  resolveDefaultSceneSubtitleChunks,
  resolveDefaultSubtitleText,
  splitSubtitleChunks,
  SUBTITLE_TIMING_MIN_CHUNK_MS,
  toSubtitleTimingSceneEvents,
} from "./subtitle-timing.utils";

export type { SubtitleTimingEventConversionDiagnostics, WordWeightedChunkAllocation } from "./subtitle-timing.utils";
