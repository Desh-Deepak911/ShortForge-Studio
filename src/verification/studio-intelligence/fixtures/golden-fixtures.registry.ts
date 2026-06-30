import type { StudioIntelligenceGoldenFixture } from "./golden-fixture.types";

/** Default timing tolerance for golden fixture validation. */
export const GOLDEN_FIXTURE_TIMING_TOLERANCE = {
  maxDriftMs: 750,
  maxDriftRatio: 0.05,
} as const;

/** Acceptable non-error warning codes during golden validation. */
export const ACCEPTABLE_GOLDEN_WARNING_CODES = new Set([
  "LOW_CONFIDENCE",
  "MISSING_TIMING",
  "MISSING_VISUAL",
  "MISSING_ASSET_QUERY",
  "MISSING_NARRATION",
  "DURATION_OUT_OF_BOUNDS",
  "NARRATION_SLICE_FALLBACK",
  "MAPPING_FALLBACK",
  "UNSUPPORTED_BLUEPRINT_KIND",
]);

/** Acceptable non-error warning codes during materializer golden validation. */
export const ACCEPTABLE_MATERIALIZER_GOLDEN_WARNING_CODES = new Set([
  "MISSING_NARRATION",
  "MISSING_SUBTITLE",
  "MISSING_SUBTITLE_FALLBACK",
  "MISSING_DURATION",
  "INVALID_DURATION",
  "UNSUPPORTED_SCENE_TYPE",
  "MISSING_LINEAGE",
]);

export const STUDIO_INTELLIGENCE_GOLDEN_FIXTURES: readonly StudioIntelligenceGoldenFixture[] = [
  {
    name: "Messi vs Ronaldo debate",
    input: {
      topic: "Messi vs Ronaldo GOAT debate",
      narration:
        "Who is the greatest of all time? Some say Messi changed the game with vision and consistency. However, Ronaldo's Champions League numbers and longevity are impossible to ignore. Critics argue the debate depends on era and league strength. Ultimately, both players defined a generation.",
      targetDurationSec: 45,
      targetDurationMs: 45_000,
      mode: "opinion_debate",
      entities: ["Lionel Messi", "Cristiano Ronaldo"],
    },
    expectedMinimumBeats: 4,
    expectedMinimumArcs: 2,
    expectedMinimumScenes: 4,
    expectedStrategyId: "debate",
    expectedVisualIntentCoverage: 0.8,
    expectedAssetQueryCoverage: 0.8,
    expectedNarrationCoverage: 1,
  },
  {
    name: "Top 5 World Cup moments",
    input: {
      topic: "Top 5 World Cup moments",
      narration:
        "These are the top 5 World Cup moments of all time. At number 5, Maradona's Hand of God shocked the world. At number 4, Zidane's headbutt changed the 2006 final. At number 3, Iniesta's winner in 2010. At number 2, Germany 7-1 Brazil stunned the planet. And at number 1, Pelé lifting the trophy in 1958.",
      targetDurationSec: 60,
      targetDurationMs: 60_000,
      mode: "top_5",
    },
    expectedMinimumBeats: 5,
    expectedMinimumArcs: 2,
    expectedMinimumScenes: 5,
    expectedStrategyId: "countdown",
    expectedVisualIntentCoverage: 0.8,
    expectedAssetQueryCoverage: 0.8,
    expectedNarrationCoverage: 1,
  },
  {
    name: "Tactical analysis",
    input: {
      topic: "Arsenal low block vs Manchester City",
      narration:
        "Arsenal sat in a compact 4-4-2 low block against Manchester City. The stats show they allowed just 0.8 xG in the first half. However, City's width eventually broke the press. The turning point came when Haaland dropped deeper. Ultimately, the tactical shift decided the match.",
      targetDurationSec: 40,
      targetDurationMs: 40_000,
      mode: "tactical_review",
      entities: ["Arsenal", "Manchester City", "Erling Haaland"],
    },
    expectedMinimumBeats: 4,
    expectedMinimumArcs: 2,
    expectedMinimumScenes: 4,
    expectedStrategyId: "tactical_analysis",
    expectedVisualIntentCoverage: 0.8,
    expectedAssetQueryCoverage: 0.8,
    expectedNarrationCoverage: 1,
  },
  {
    name: "Player biography",
    input: {
      topic: "Lamine Yamal breakthrough",
      narration:
        "Lamine Yamal was barely known two years ago. He broke through at Barcelona with 10 goals and 12 assists this season. The numbers prove he is already elite at 17. His legacy is only beginning.",
      targetDurationSec: 35,
      targetDurationMs: 35_000,
      mode: "player_analysis",
      entities: ["Lamine Yamal", "Barcelona"],
    },
    expectedMinimumBeats: 3,
    expectedMinimumArcs: 2,
    expectedMinimumScenes: 3,
    expectedStrategyId: "biography",
    expectedVisualIntentCoverage: 0.8,
    expectedAssetQueryCoverage: 0.8,
    expectedNarrationCoverage: 1,
  },
  {
    name: "Match preview",
    input: {
      topic: "El Clasico preview",
      narration:
        "El Clasico kicks off tonight at the Bernabeu. Watch for Vinicius against Barcelona's high defensive line. Real Madrid need a win to stay top of La Liga. This preview breaks down the key battles before kickoff.",
      targetDurationSec: 30,
      targetDurationMs: 30_000,
      mode: "match_preview",
      entities: ["Real Madrid", "Barcelona", "Vinicius Jr"],
    },
    expectedMinimumBeats: 3,
    expectedMinimumArcs: 2,
    expectedMinimumScenes: 3,
    expectedStrategyId: "match_preview",
    expectedVisualIntentCoverage: 0.8,
    expectedAssetQueryCoverage: 0.8,
    expectedNarrationCoverage: 1,
  },
  {
    name: "News recap",
    input: {
      topic: "Manchester City beat Arsenal",
      narration:
        "Final score: Manchester City 2, Arsenal 1. Haaland scored in the 78th minute after a chaotic first half. The full-time whistle confirmed City's title push. Subscribe for more match recaps.",
      targetDurationSec: 25,
      targetDurationMs: 25_000,
      mode: "match_recap",
      entities: ["Manchester City", "Arsenal", "Erling Haaland"],
    },
    expectedMinimumBeats: 3,
    expectedMinimumArcs: 2,
    expectedMinimumScenes: 3,
    expectedStrategyId: "news",
    expectedVisualIntentCoverage: 0.8,
    expectedAssetQueryCoverage: 0.8,
    expectedNarrationCoverage: 1,
  },
] as const;
