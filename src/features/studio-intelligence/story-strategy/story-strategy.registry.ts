import type { StoryStrategy, StoryStrategyId } from "./story-strategy.types";

function freezeStrategy(strategy: StoryStrategy): StoryStrategy {
  return Object.freeze({
    ...strategy,
    hookStrategy: Object.freeze({ ...strategy.hookStrategy }),
    arcStrategy: Object.freeze({
      ...strategy.arcStrategy,
      preferredArcSequence: Object.freeze([...strategy.arcStrategy.preferredArcSequence]),
    }),
    sceneDensity: Object.freeze({ ...strategy.sceneDensity }),
    timingBias: Object.freeze({ ...strategy.timingBias }),
    visualBias: Object.freeze({ ...strategy.visualBias }),
    motionBias: Object.freeze({ ...strategy.motionBias }),
    assetBias: Object.freeze({
      ...strategy.assetBias,
      preferredAssetTypes: Object.freeze([...strategy.assetBias.preferredAssetTypes]),
    }),
    captionBias: Object.freeze({ ...strategy.captionBias }),
    plannerHints: Object.freeze([...strategy.plannerHints]),
    scriptModes: strategy.scriptModes ? Object.freeze([...strategy.scriptModes]) : undefined,
  });
}

const DEFAULT_STRATEGY = freezeStrategy({
  id: "default",
  displayName: "Default Story",
  preferredStructure: "hook_story_payoff",
  scriptModes: ["story"],
  hookStrategy: {
    emphasis: "punchy",
    maxOpeningBeats: 2,
    timingWeight: 0.9,
    preferPortraitVisual: true,
  },
  arcStrategy: {
    preferredArcSequence: ["opening", "development", "ending"],
    prioritizeConflictArc: false,
    prioritizeDevelopmentArc: true,
    endingArcWeight: 1,
  },
  sceneDensity: {
    minScenesPerArc: 1,
    maxScenesPerArc: 3,
    isolateHighImportanceBeats: true,
    groupLowImportanceBeats: true,
  },
  timingBias: {
    hookMultiplier: 0.75,
    evidenceMultiplier: 1,
    climaxMultiplier: 1.15,
    ctaMultiplier: 0.65,
    preferredPacing: "normal",
  },
  visualBias: {
    primaryIntent: "player_portrait",
    secondaryIntent: "match_action",
    favorComparisonSplit: false,
    favorStatOverlay: false,
    favorArchiveFootage: false,
  },
  motionBias: {
    defaultIntensity: "medium",
    boostHighImportance: true,
    preferPushInOnHook: true,
  },
  assetBias: {
    preferredAssetTypes: ["image", "video_clip"],
    preferredOrientation: "landscape",
    favorEntityQueries: true,
  },
  captionBias: {
    defaultEmphasis: "phrase",
    styleHint: "bold_hook",
    highlightStats: false,
  },
  plannerHints: [
    "Lead with a punchy hook and keep the opening concise.",
    "Give development beats medium weight before landing the payoff.",
  ],
});

const HISTORY_STRATEGY = freezeStrategy({
  id: "history",
  displayName: "History",
  preferredStructure: "curiosity_explanation_example_payoff",
  scriptModes: ["historical_explainer"],
  hookStrategy: {
    emphasis: "cold_open",
    maxOpeningBeats: 2,
    timingWeight: 0.95,
    preferPortraitVisual: false,
  },
  arcStrategy: {
    preferredArcSequence: ["opening", "development", "resolution", "ending"],
    prioritizeConflictArc: false,
    prioritizeDevelopmentArc: true,
    endingArcWeight: 1.1,
  },
  sceneDensity: {
    minScenesPerArc: 1,
    maxScenesPerArc: 4,
    isolateHighImportanceBeats: true,
    groupLowImportanceBeats: true,
  },
  timingBias: {
    hookMultiplier: 0.85,
    evidenceMultiplier: 1.05,
    climaxMultiplier: 1.1,
    ctaMultiplier: 0.7,
    preferredPacing: "slow",
  },
  visualBias: {
    primaryIntent: "archive_footage",
    secondaryIntent: "timeline_graphic",
    favorComparisonSplit: false,
    favorStatOverlay: false,
    favorArchiveFootage: true,
  },
  motionBias: {
    defaultIntensity: "low",
    boostHighImportance: false,
    preferPushInOnHook: false,
  },
  assetBias: {
    preferredAssetTypes: ["video_clip", "image", "generated_graphic"],
    preferredOrientation: "landscape",
    favorEntityQueries: false,
  },
  captionBias: {
    defaultEmphasis: "phrase",
    styleHint: "default",
    highlightStats: false,
  },
  plannerHints: [
    "Use archival visuals and context-heavy development beats.",
    "Favor slower pacing to support legacy storytelling.",
  ],
});

const DEBATE_STRATEGY = freezeStrategy({
  id: "debate",
  displayName: "Debate",
  preferredStructure: "debate_argument_counterpoint_takeaway",
  scriptModes: ["opinion_debate"],
  hookStrategy: {
    emphasis: "stakes",
    maxOpeningBeats: 2,
    timingWeight: 0.88,
    preferPortraitVisual: true,
  },
  arcStrategy: {
    preferredArcSequence: ["opening", "conflict", "ending"],
    prioritizeConflictArc: true,
    prioritizeDevelopmentArc: false,
    endingArcWeight: 1.05,
  },
  sceneDensity: {
    minScenesPerArc: 1,
    maxScenesPerArc: 3,
    isolateHighImportanceBeats: true,
    groupLowImportanceBeats: false,
  },
  timingBias: {
    hookMultiplier: 0.8,
    evidenceMultiplier: 1.1,
    climaxMultiplier: 1.2,
    ctaMultiplier: 0.65,
    preferredPacing: "fast",
  },
  visualBias: {
    primaryIntent: "comparison_split",
    secondaryIntent: "text_card",
    favorComparisonSplit: true,
    favorStatOverlay: true,
    favorArchiveFootage: false,
  },
  motionBias: {
    defaultIntensity: "medium",
    boostHighImportance: true,
    preferPushInOnHook: true,
  },
  assetBias: {
    preferredAssetTypes: ["image", "stat_card", "generated_graphic"],
    preferredOrientation: "landscape",
    favorEntityQueries: true,
  },
  captionBias: {
    defaultEmphasis: "phrase",
    styleHint: "debate",
    highlightStats: true,
  },
  plannerHints: [
    "Surface tension early and keep a dedicated conflict arc.",
    "Use split-screen or comparison visuals for opposing points.",
  ],
});

const COMPARISON_STRATEGY = freezeStrategy({
  id: "comparison",
  displayName: "Comparison",
  preferredStructure: "bold_claim_explanation_evidence_takeaway",
  hookStrategy: {
    emphasis: "question",
    maxOpeningBeats: 1,
    timingWeight: 0.85,
    preferPortraitVisual: false,
  },
  arcStrategy: {
    preferredArcSequence: ["opening", "development", "conflict", "ending"],
    prioritizeConflictArc: true,
    prioritizeDevelopmentArc: true,
    endingArcWeight: 1,
  },
  sceneDensity: {
    minScenesPerArc: 1,
    maxScenesPerArc: 3,
    isolateHighImportanceBeats: true,
    groupLowImportanceBeats: true,
  },
  timingBias: {
    hookMultiplier: 0.78,
    evidenceMultiplier: 1.15,
    climaxMultiplier: 1.18,
    ctaMultiplier: 0.68,
    preferredPacing: "fast",
  },
  visualBias: {
    primaryIntent: "comparison_split",
    secondaryIntent: "stat_overlay",
    favorComparisonSplit: true,
    favorStatOverlay: true,
    favorArchiveFootage: false,
  },
  motionBias: {
    defaultIntensity: "medium",
    boostHighImportance: true,
    preferPushInOnHook: false,
  },
  assetBias: {
    preferredAssetTypes: ["image", "stat_card"],
    preferredOrientation: "landscape",
    favorEntityQueries: true,
  },
  captionBias: {
    defaultEmphasis: "stat",
    styleHint: "stat_highlight",
    highlightStats: true,
  },
  plannerHints: [
    "Frame the short as a side-by-side comparison with evidence support.",
    "Prioritize stat overlays and split-screen compositions.",
  ],
});

const COUNTDOWN_STRATEGY = freezeStrategy({
  id: "countdown",
  displayName: "Countdown",
  preferredStructure: "countdown_ranked_reveal",
  scriptModes: ["top_5"],
  hookStrategy: {
    emphasis: "punchy",
    maxOpeningBeats: 1,
    timingWeight: 0.82,
    preferPortraitVisual: false,
  },
  arcStrategy: {
    preferredArcSequence: ["opening", "development", "ending"],
    prioritizeConflictArc: false,
    prioritizeDevelopmentArc: true,
    endingArcWeight: 1.15,
  },
  sceneDensity: {
    minScenesPerArc: 2,
    maxScenesPerArc: 5,
    isolateHighImportanceBeats: true,
    groupLowImportanceBeats: false,
  },
  timingBias: {
    hookMultiplier: 0.7,
    evidenceMultiplier: 1.2,
    climaxMultiplier: 1.25,
    ctaMultiplier: 0.6,
    preferredPacing: "punchy",
  },
  visualBias: {
    primaryIntent: "text_card",
    secondaryIntent: "stat_overlay",
    favorComparisonSplit: false,
    favorStatOverlay: true,
    favorArchiveFootage: false,
  },
  motionBias: {
    defaultIntensity: "high",
    boostHighImportance: true,
    preferPushInOnHook: true,
  },
  assetBias: {
    preferredAssetTypes: ["stat_card", "generated_graphic", "image"],
    preferredOrientation: "square",
    favorEntityQueries: true,
  },
  captionBias: {
    defaultEmphasis: "stat",
    styleHint: "stat_highlight",
    highlightStats: true,
  },
  plannerHints: [
    "Treat each ranked reveal as its own evidence beat where possible.",
    "Keep the hook short and escalate pacing toward the final reveal.",
  ],
});

const BIOGRAPHY_STRATEGY = freezeStrategy({
  id: "biography",
  displayName: "Biography",
  preferredStructure: "hook_story_payoff",
  scriptModes: ["player_analysis"],
  hookStrategy: {
    emphasis: "punchy",
    maxOpeningBeats: 2,
    timingWeight: 0.92,
    preferPortraitVisual: true,
  },
  arcStrategy: {
    preferredArcSequence: ["opening", "development", "climax", "ending"],
    prioritizeConflictArc: false,
    prioritizeDevelopmentArc: true,
    endingArcWeight: 1.12,
  },
  sceneDensity: {
    minScenesPerArc: 1,
    maxScenesPerArc: 4,
    isolateHighImportanceBeats: true,
    groupLowImportanceBeats: true,
  },
  timingBias: {
    hookMultiplier: 0.8,
    evidenceMultiplier: 1.08,
    climaxMultiplier: 1.22,
    ctaMultiplier: 0.66,
    preferredPacing: "normal",
  },
  visualBias: {
    primaryIntent: "player_portrait",
    secondaryIntent: "match_action",
    favorComparisonSplit: false,
    favorStatOverlay: true,
    favorArchiveFootage: true,
  },
  motionBias: {
    defaultIntensity: "medium",
    boostHighImportance: true,
    preferPushInOnHook: true,
  },
  assetBias: {
    preferredAssetTypes: ["image", "video_clip", "stat_card"],
    preferredOrientation: "portrait",
    favorEntityQueries: true,
  },
  captionBias: {
    defaultEmphasis: "phrase",
    styleHint: "bold_hook",
    highlightStats: true,
  },
  plannerHints: [
    "Center the player as the visual subject from the opening beat.",
    "Use performance evidence before the legacy-style ending.",
  ],
});

const MATCH_PREVIEW_STRATEGY = freezeStrategy({
  id: "match_preview",
  displayName: "Match Preview",
  preferredStructure: "question_stakes_battle_cta",
  scriptModes: ["match_preview"],
  hookStrategy: {
    emphasis: "stakes",
    maxOpeningBeats: 2,
    timingWeight: 0.9,
    preferPortraitVisual: false,
  },
  arcStrategy: {
    preferredArcSequence: ["opening", "development", "conflict", "ending"],
    prioritizeConflictArc: true,
    prioritizeDevelopmentArc: true,
    endingArcWeight: 0.95,
  },
  sceneDensity: {
    minScenesPerArc: 1,
    maxScenesPerArc: 3,
    isolateHighImportanceBeats: true,
    groupLowImportanceBeats: true,
  },
  timingBias: {
    hookMultiplier: 0.82,
    evidenceMultiplier: 1.05,
    climaxMultiplier: 1.12,
    ctaMultiplier: 0.72,
    preferredPacing: "fast",
  },
  visualBias: {
    primaryIntent: "match_action",
    secondaryIntent: "team_crest",
    favorComparisonSplit: true,
    favorStatOverlay: false,
    favorArchiveFootage: false,
  },
  motionBias: {
    defaultIntensity: "medium",
    boostHighImportance: true,
    preferPushInOnHook: false,
  },
  assetBias: {
    preferredAssetTypes: ["video_clip", "logo", "image"],
    preferredOrientation: "landscape",
    favorEntityQueries: true,
  },
  captionBias: {
    defaultEmphasis: "phrase",
    styleHint: "default",
    highlightStats: false,
  },
  plannerHints: [
    "Emphasize stakes and watch-for angles without inventing results.",
    "Use crests, lineups, and atmosphere before the CTA.",
  ],
});

const TACTICAL_ANALYSIS_STRATEGY = freezeStrategy({
  id: "tactical_analysis",
  displayName: "Tactical Analysis",
  preferredStructure: "bold_claim_explanation_evidence_takeaway",
  scriptModes: ["tactical_review"],
  hookStrategy: {
    emphasis: "question",
    maxOpeningBeats: 1,
    timingWeight: 0.86,
    preferPortraitVisual: false,
  },
  arcStrategy: {
    preferredArcSequence: ["opening", "development", "conflict", "ending"],
    prioritizeConflictArc: false,
    prioritizeDevelopmentArc: true,
    endingArcWeight: 1.05,
  },
  sceneDensity: {
    minScenesPerArc: 1,
    maxScenesPerArc: 4,
    isolateHighImportanceBeats: true,
    groupLowImportanceBeats: true,
  },
  timingBias: {
    hookMultiplier: 0.76,
    evidenceMultiplier: 1.18,
    climaxMultiplier: 1.16,
    ctaMultiplier: 0.64,
    preferredPacing: "normal",
  },
  visualBias: {
    primaryIntent: "stat_overlay",
    secondaryIntent: "timeline_graphic",
    favorComparisonSplit: false,
    favorStatOverlay: true,
    favorArchiveFootage: false,
  },
  motionBias: {
    defaultIntensity: "low",
    boostHighImportance: false,
    preferPushInOnHook: false,
  },
  assetBias: {
    preferredAssetTypes: ["stat_card", "generated_graphic", "video_clip"],
    preferredOrientation: "square",
    favorEntityQueries: false,
  },
  captionBias: {
    defaultEmphasis: "stat",
    styleHint: "stat_highlight",
    highlightStats: true,
  },
  plannerHints: [
    "Lead with a tactical claim and support it with diagram-friendly evidence.",
    "Prefer overlays and graphics over emotional b-roll.",
  ],
});

const NEWS_STRATEGY = freezeStrategy({
  id: "news",
  displayName: "News",
  preferredStructure: "result_turning_hero_impact",
  scriptModes: ["match_recap"],
  hookStrategy: {
    emphasis: "cold_open",
    maxOpeningBeats: 1,
    timingWeight: 0.88,
    preferPortraitVisual: false,
  },
  arcStrategy: {
    preferredArcSequence: ["opening", "development", "climax", "ending"],
    prioritizeConflictArc: false,
    prioritizeDevelopmentArc: true,
    endingArcWeight: 1,
  },
  sceneDensity: {
    minScenesPerArc: 1,
    maxScenesPerArc: 3,
    isolateHighImportanceBeats: true,
    groupLowImportanceBeats: true,
  },
  timingBias: {
    hookMultiplier: 0.74,
    evidenceMultiplier: 1.02,
    climaxMultiplier: 1.2,
    ctaMultiplier: 0.62,
    preferredPacing: "fast",
  },
  visualBias: {
    primaryIntent: "match_action",
    secondaryIntent: "crowd_atmosphere",
    favorComparisonSplit: false,
    favorStatOverlay: false,
    favorArchiveFootage: false,
  },
  motionBias: {
    defaultIntensity: "high",
    boostHighImportance: true,
    preferPushInOnHook: false,
  },
  assetBias: {
    preferredAssetTypes: ["video_clip", "image"],
    preferredOrientation: "landscape",
    favorEntityQueries: false,
  },
  captionBias: {
    defaultEmphasis: "word",
    styleHint: "default",
    highlightStats: false,
  },
  plannerHints: [
    "Open with the result or headline moment, then unpack the impact quickly.",
    "Keep the pacing newsroom-fast and concise through the ending.",
  ],
});

export const STORY_STRATEGY_REGISTRY: Readonly<Record<StoryStrategyId, StoryStrategy>> = Object.freeze({
  default: DEFAULT_STRATEGY,
  history: HISTORY_STRATEGY,
  debate: DEBATE_STRATEGY,
  comparison: COMPARISON_STRATEGY,
  countdown: COUNTDOWN_STRATEGY,
  biography: BIOGRAPHY_STRATEGY,
  match_preview: MATCH_PREVIEW_STRATEGY,
  tactical_analysis: TACTICAL_ANALYSIS_STRATEGY,
  news: NEWS_STRATEGY,
});

export function getStoryStrategyById(id: StoryStrategyId): StoryStrategy {
  return STORY_STRATEGY_REGISTRY[id];
}

export function listStoryStrategies(): readonly StoryStrategy[] {
  return Object.freeze(Object.values(STORY_STRATEGY_REGISTRY));
}
