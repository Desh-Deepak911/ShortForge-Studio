import { equalSubtitleTimingStrategy } from "./subtitle-timing.equal-strategy";
import { wordWeightedSubtitleTimingStrategy } from "./subtitle-timing.word-weighted-strategy";
import type {
  SubtitleTimingBuildInput,
  SubtitleTimingBuildOptions,
  SubtitleTimingMap,
  SubtitleTimingStrategy,
  SubtitleTimingStrategyId,
} from "./subtitle-timing.types";
import {
  resolveDefaultSceneSubtitleChunks,
  resolveDefaultSubtitleText,
  splitSubtitleChunks,
} from "./subtitle-timing.utils";

const STRATEGIES: Partial<Record<SubtitleTimingStrategyId, SubtitleTimingStrategy>> = {
  equal: equalSubtitleTimingStrategy,
  word_weighted: wordWeightedSubtitleTimingStrategy,
};

function resolveStrategy(strategyId: SubtitleTimingStrategyId | undefined): SubtitleTimingStrategy {
  if (!strategyId) {
    return equalSubtitleTimingStrategy;
  }

  return STRATEGIES[strategyId] ?? equalSubtitleTimingStrategy;
}

/** Builds a subtitle timing map using the selected strategy (defaults to equal). */
export function buildSubtitleTimingMap(
  input: Partial<SubtitleTimingBuildInput> & Pick<SubtitleTimingBuildInput, "scenes" | "sceneEvents">,
  options: SubtitleTimingBuildOptions = {},
): SubtitleTimingMap {
  const strategy = resolveStrategy(options.strategy);
  const resolvedInput: SubtitleTimingBuildInput = {
    scenes: input.scenes,
    sceneEvents: input.sceneEvents,
    totalDurationMs: input.totalDurationMs ?? 0,
    resolveSceneChunks: input.resolveSceneChunks ?? resolveDefaultSceneSubtitleChunks,
    resolveSubtitleText: input.resolveSubtitleText ?? resolveDefaultSubtitleText,
    splitSubtitleChunks: input.splitSubtitleChunks ?? splitSubtitleChunks,
  };

  const map = strategy.build(resolvedInput);

  return {
    ...map,
    strategy: strategy.id,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
  };
}

export function getSubtitleTimingStrategy(
  strategyId: SubtitleTimingStrategyId,
): SubtitleTimingStrategy {
  return resolveStrategy(strategyId);
}
