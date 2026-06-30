import type {
  NarrativeArcType,
  NarrativeBeatType,
  StoryModeStrategy,
  StoryStructureArcId,
  VisualIntentType,
} from "./studio-intelligence.types";

export const STUDIO_INTELLIGENCE_VERSION = "0.1.0";

/** Spoken pacing assumption for reading-time estimates (planning only). */
export const STUDIO_INTELLIGENCE_WORDS_PER_SECOND = 2.4;

export const STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS = 1000;
export const STUDIO_INTELLIGENCE_MAX_SCENE_DURATION_MS = 20_000;

export const NARRATIVE_BEAT_TYPE_LABELS: Record<NarrativeBeatType, string> = {
  hook: "Hook",
  setup: "Setup",
  context: "Context",
  conflict: "Conflict",
  evidence: "Evidence",
  turning_point: "Turning point",
  reveal: "Reveal",
  payoff: "Payoff",
  conclusion: "Conclusion",
  cta: "Call to action",
  question: "Question",
  stakes: "Stakes",
  climax: "Climax",
  hero_moment: "Hero moment",
  counterpoint: "Counterpoint",
  takeaway: "Takeaway",
  transition: "Transition",
};

export const NARRATIVE_ARC_TYPE_LABELS: Record<NarrativeArcType, string> = {
  opening: "Opening",
  setup: "Setup",
  development: "Development",
  conflict: "Conflict",
  climax: "Climax",
  resolution: "Resolution",
  ending: "Ending",
};

export const NARRATIVE_ARC_SCENE_COUNT_RANGES: Record<
  NarrativeArcType,
  { min: number; max: number }
> = {
  opening: { min: 1, max: 2 },
  setup: { min: 1, max: 2 },
  development: { min: 2, max: 5 },
  conflict: { min: 1, max: 3 },
  climax: { min: 1, max: 2 },
  resolution: { min: 1, max: 2 },
  ending: { min: 1, max: 2 },
};

export const VISUAL_INTENT_TYPE_LABELS: Record<VisualIntentType, string> = {
  player_portrait: "Player portrait",
  match_action: "Match action",
  stat_overlay: "Stat overlay",
  timeline_graphic: "Timeline graphic",
  team_crest: "Team crest",
  crowd_atmosphere: "Crowd atmosphere",
  archive_footage: "Archive footage",
  text_card: "Text card",
  comparison_split: "Comparison split",
  neutral_broll: "Neutral b-roll",
};

/** Default importance tier thresholds (normalized `0–1`). */
export const DEFAULT_SCENE_IMPORTANCE_RANGES = {
  low: { min: 0, max: 0.34 },
  medium: { min: 0.35, max: 0.64 },
  high: { min: 0.65, max: 0.84 },
  critical: { min: 0.85, max: 1 },
} as const;

/** Default relative timing weights for structure planning. */
export const DEFAULT_TIMING_WEIGHTS = {
  hook: 0.9,
  setup: 0.85,
  opening: 0.9,
  context: 1,
  conflict: 1.15,
  evidence: 1.2,
  turning_point: 1.25,
  reveal: 1.2,
  climax: 1.3,
  payoff: 1,
  conclusion: 0.95,
  cta: 0.8,
  transition: 0.6,
} as const;

export interface SupportedStoryStructure {
  arc: StoryStructureArcId;
  label: string;
  description: string;
  beatCount: number;
}

export const STUDIO_INTELLIGENCE_SUPPORTED_STORY_STRUCTURES: readonly SupportedStoryStructure[] = [
  {
    arc: "hook_story_payoff",
    label: "Hook → Story → Payoff",
    description: "Sharp opening, performance narrative, legacy close.",
    beatCount: 3,
  },
  {
    arc: "question_stakes_battle_cta",
    label: "Question → Stakes → Battle → CTA",
    description: "Preview arc with tension and watch-for close.",
    beatCount: 4,
  },
  {
    arc: "result_turning_hero_impact",
    label: "Result → Turning Point → Hero → Impact",
    description: "Recap arc anchored on the decisive moment.",
    beatCount: 4,
  },
  {
    arc: "bold_claim_explanation_evidence_takeaway",
    label: "Claim → Explanation → Evidence → Takeaway",
    description: "Opinion or analysis arc with verified support.",
    beatCount: 4,
  },
  {
    arc: "countdown_ranked_reveal",
    label: "Countdown / Ranked Reveal",
    description: "Ordered list with escalating reveals.",
    beatCount: 5,
  },
  {
    arc: "debate_argument_counterpoint_takeaway",
    label: "Debate → Counterpoint → Takeaway",
    description: "Balanced argument with a clear landing.",
    beatCount: 4,
  },
  {
    arc: "curiosity_explanation_example_payoff",
    label: "Curiosity → Explanation → Example → Payoff",
    description: "Educational explainer arc for concepts or rules.",
    beatCount: 4,
  },
  {
    arc: "cold_open_context_payoff",
    label: "Cold Open → Context → Payoff",
    description: "Minimal three-beat arc for fast shorts.",
    beatCount: 3,
  },
] as const;

/** Default mode strategies — planning metadata only, no runtime wiring. */
export const DEFAULT_STORY_MODE_STRATEGIES: readonly StoryModeStrategy[] = [
  {
    id: "story",
    label: "Story",
    description: "General football narrative with hook and payoff.",
    preferredStructureArc: "hook_story_payoff",
    hookTimingWeight: DEFAULT_TIMING_WEIGHTS.hook,
    evidenceTimingWeight: DEFAULT_TIMING_WEIGHTS.evidence,
    payoffTimingWeight: DEFAULT_TIMING_WEIGHTS.payoff,
  },
  {
    id: "player_analysis",
    label: "Player analysis",
    description: "Player-focused narrative with performance evidence.",
    preferredStructureArc: "hook_story_payoff",
    hookTimingWeight: DEFAULT_TIMING_WEIGHTS.hook,
    evidenceTimingWeight: DEFAULT_TIMING_WEIGHTS.evidence,
    payoffTimingWeight: DEFAULT_TIMING_WEIGHTS.payoff,
  },
  {
    id: "match_preview",
    label: "Match preview",
    description: "Stakes-first preview without invented results.",
    preferredStructureArc: "question_stakes_battle_cta",
    hookTimingWeight: DEFAULT_TIMING_WEIGHTS.hook,
    evidenceTimingWeight: DEFAULT_TIMING_WEIGHTS.context,
    payoffTimingWeight: DEFAULT_TIMING_WEIGHTS.payoff,
  },
  {
    id: "match_recap",
    label: "Match recap",
    description: "Result-led recap with turning point emphasis.",
    preferredStructureArc: "result_turning_hero_impact",
    hookTimingWeight: DEFAULT_TIMING_WEIGHTS.opening,
    evidenceTimingWeight: DEFAULT_TIMING_WEIGHTS.climax,
    payoffTimingWeight: DEFAULT_TIMING_WEIGHTS.payoff,
  },
  {
    id: "top_5",
    label: "Top 5",
    description: "Ordered countdown with ranked reveals.",
    preferredStructureArc: "countdown_ranked_reveal",
    hookTimingWeight: DEFAULT_TIMING_WEIGHTS.hook,
    evidenceTimingWeight: DEFAULT_TIMING_WEIGHTS.evidence,
    payoffTimingWeight: DEFAULT_TIMING_WEIGHTS.payoff,
  },
  {
    id: "opinion_debate",
    label: "Opinion / debate",
    description: "Argument and counterpoint with takeaway.",
    preferredStructureArc: "debate_argument_counterpoint_takeaway",
    hookTimingWeight: DEFAULT_TIMING_WEIGHTS.hook,
    evidenceTimingWeight: DEFAULT_TIMING_WEIGHTS.evidence,
    payoffTimingWeight: DEFAULT_TIMING_WEIGHTS.payoff,
  },
  {
    id: "historical_explainer",
    label: "Historical explainer",
    description: "Curiosity-led context and legacy breakdown.",
    preferredStructureArc: "curiosity_explanation_example_payoff",
    hookTimingWeight: DEFAULT_TIMING_WEIGHTS.hook,
    evidenceTimingWeight: DEFAULT_TIMING_WEIGHTS.context,
    payoffTimingWeight: DEFAULT_TIMING_WEIGHTS.payoff,
  },
  {
    id: "tactical_review",
    label: "Tactical review",
    description: "Claim-led tactical breakdown with evidence.",
    preferredStructureArc: "bold_claim_explanation_evidence_takeaway",
    hookTimingWeight: DEFAULT_TIMING_WEIGHTS.hook,
    evidenceTimingWeight: DEFAULT_TIMING_WEIGHTS.evidence,
    payoffTimingWeight: DEFAULT_TIMING_WEIGHTS.payoff,
  },
] as const;

export function resolveDefaultStoryModeStrategy(
  mode: StoryModeStrategy["id"],
): StoryModeStrategy | undefined {
  return DEFAULT_STORY_MODE_STRATEGIES.find((strategy) => strategy.id === mode);
}

export function resolveSupportedStoryStructure(
  arc: StoryStructureArcId,
): SupportedStoryStructure | undefined {
  return STUDIO_INTELLIGENCE_SUPPORTED_STORY_STRUCTURES.find((structure) => structure.arc === arc);
}
