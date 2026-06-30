import type { StoryStrategyId } from "@/features/studio-intelligence/story-strategy/story-strategy.types";
import type { StudioIntelligenceInput } from "@/features/studio-intelligence/studio-intelligence.types";

/** Expected planning thresholds for a golden Studio Intelligence fixture. */
export interface GoldenFixtureExpectations {
  expectedMinimumBeats: number;
  expectedMinimumArcs: number;
  expectedMinimumScenes: number;
  expectedStrategyId: StoryStrategyId;
  expectedVisualIntentCoverage: number;
  expectedAssetQueryCoverage: number;
  expectedNarrationCoverage: number;
}

/** Realistic end-to-end planning fixture for golden validation. */
export interface StudioIntelligenceGoldenFixture extends GoldenFixtureExpectations {
  name: string;
  input: StudioIntelligenceInput;
}

/** Timing tolerance when comparing adapter duration to target. */
export interface GoldenFixtureTimingTolerance {
  /** Maximum absolute drift in milliseconds. */
  maxDriftMs: number;
  /** Maximum relative drift as a ratio of target duration. */
  maxDriftRatio: number;
}
