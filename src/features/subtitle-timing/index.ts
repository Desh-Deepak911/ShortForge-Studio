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
  applyWordWeightedTimingFeel,
  capWeightedChunkDurations,
  countTimingWords,
  isNarratedSubtitlesScene,
  mapSubtitleTimingChunksToEvents,
  normalizeWeightedDurations,
  resolveDefaultSceneSubtitleChunks,
  resolveDefaultSubtitleText,
  splitSubtitleChunks,
  SUBTITLE_TIMING_END_PAD_MS,
  SUBTITLE_TIMING_LEAD_IN_MS,
  SUBTITLE_TIMING_MAX_CHUNK_DURATION_MS,
  SUBTITLE_TIMING_MIN_CHUNK_MS,
  toSubtitleTimingSceneEvents,
} from "./subtitle-timing.utils";

export {
  splitSubtitleChunksForWordWeightedTiming,
  SUBTITLE_TIMING_MAX_CHARS_PER_CHUNK,
  SUBTITLE_TIMING_MAX_WORDS_PER_CHUNK,
} from "./subtitle-timing.word-weighted-chunks";

export type { SubtitleTimingEventConversionDiagnostics, WordWeightedChunkAllocation } from "./subtitle-timing.utils";
