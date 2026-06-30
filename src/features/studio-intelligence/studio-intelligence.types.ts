import type { ScriptMode } from "@/types/footiebitz";

import type { SceneBlueprintCollection } from "./scene-blueprint.types";
import type { StoryStrategy, StoryStrategyId } from "./story-strategy/story-strategy.types";

import type { StoryValidationResult } from "./story-validator/story-validator.types";

/** High-level narrative beat categories for planning — not spoken labels. */
export type NarrativeBeatType =
  | "hook"
  | "setup"
  | "context"
  | "conflict"
  | "evidence"
  | "turning_point"
  | "reveal"
  | "payoff"
  | "conclusion"
  | "cta"
  | "question"
  | "stakes"
  | "climax"
  | "hero_moment"
  | "counterpoint"
  | "takeaway"
  | "transition";

/** Planned role for a future scene — maps conceptually to editor scene types later. */
export type ScenePlanRole =
  | "intro"
  | "context"
  | "match"
  | "transition"
  | "ending";

/** Visual treatment intent for a planned scene. */
export type VisualIntentType =
  | "player_portrait"
  | "match_action"
  | "stat_overlay"
  | "timeline_graphic"
  | "team_crest"
  | "crowd_atmosphere"
  | "archive_footage"
  | "text_card"
  | "comparison_split"
  | "neutral_broll";

/** Asset class required to fulfill a scene plan. */
export type AssetRequirementType =
  | "image"
  | "video_clip"
  | "stat_card"
  | "logo"
  | "generated_graphic"
  | "user_upload"
  | "placeholder";

/** Canonical short-form story arcs for Studio Intelligence planning. */
export type StoryStructureArcId =
  | "hook_story_payoff"
  | "question_stakes_battle_cta"
  | "result_turning_hero_impact"
  | "bold_claim_explanation_evidence_takeaway"
  | "countdown_ranked_reveal"
  | "debate_argument_counterpoint_takeaway"
  | "curiosity_explanation_example_payoff"
  | "cold_open_context_payoff";

/** Input to the Studio Intelligence planning layer (pre-scene pipeline). */
export interface StudioIntelligenceInput {
  topic: string;
  narration: string;
  targetDurationSec: number;
  /** Optional explicit target duration override in milliseconds. */
  targetDurationMs?: number;
  mode?: ScriptMode;
  /** Optional named entities (players, teams, competitions) for visual/asset planning. */
  entities?: string[];
  /** Optional research or graph context reference — opaque at this layer. */
  researchContextId?: string;
}

/** Relative importance of a planned scene within the short. */
export interface SceneImportanceScore {
  /** Normalized score in `[0, 1]`. */
  value: number;
  tier: "low" | "medium" | "high" | "critical";
  rationale?: string;
}

/** Suggested timing for a beat or scene plan. */
export interface TimingSuggestion {
  durationMs: number;
  weight: number;
  rationale?: string;
}

/** Visual direction for a scene plan — planning metadata only. */
export interface VisualIntent {
  type: VisualIntentType;
  label: string;
  description?: string;
  priority: "primary" | "secondary" | "optional";
}

/** Asset needed to realize a scene plan. */
export interface AssetRequirement {
  type: AssetRequirementType;
  label: string;
  required: boolean;
  notes?: string;
}

/** A narrative beat derived from structure + narration analysis. */
export interface NarrativeBeat {
  id: string;
  type: NarrativeBeatType;
  label: string;
  text: string;
  order: number;
  timing: TimingSuggestion;
  importance: SceneImportanceScore;
  /** Heuristic tone label from beat detection (planning only). */
  emotion?: string;
  /** Heuristic narrative purpose from beat detection (planning only). */
  purpose?: string;
}

/** High-level narrative arc grouping beat clusters for scene planning. */
export type NarrativeArcType =
  | "opening"
  | "setup"
  | "development"
  | "conflict"
  | "climax"
  | "resolution"
  | "ending";

/** A grouped narrative arc spanning one or more detected beats. */
export interface NarrativeArc {
  id: string;
  type: NarrativeArcType;
  title: string;
  beatIds: string[];
  beats: NarrativeBeat[];
  startBeatIndex: number;
  endBeatIndex: number;
  estimatedDurationMs: number;
  averageImportance: number;
  dominantEmotion?: string;
  dominantPurpose?: string;
  suggestedSceneCount: number;
}

/** Mode-specific planning strategy — selects structure and pacing defaults. */
export interface StoryModeStrategy {
  id: ScriptMode;
  label: string;
  description: string;
  preferredStructureArc: StoryStructureArcId;
  hookTimingWeight: number;
  evidenceTimingWeight: number;
  payoffTimingWeight: number;
}

/** Story arc template with weighted beats for planning. */
export interface StoryStructurePlan {
  arc: StoryStructureArcId;
  arcLabel: string;
  modeStrategy?: StoryModeStrategy;
  beats: Array<{
    id: string;
    type: NarrativeBeatType;
    label: string;
    purpose: string;
    weight: number;
    openingHook?: boolean;
  }>;
  targetDurationSec: number;
}

/** Planned scene slot before FootieScript materialization. */
export interface ScenePlan {
  id: string;
  role: ScenePlanRole;
  order: number;
  title: string;
  narrationExcerpt: string;
  beatIds: string[];
  importance: SceneImportanceScore;
  timing: TimingSuggestion;
  visualIntent: VisualIntent;
  assetRequirements: AssetRequirement[];
  notes?: string;
}

/** Aggregate metrics from a Studio Intelligence planning run. */
export interface StudioIntelligenceMetrics {
  beatCount: number;
  arcCount: number;
  sceneBlueprintCount: number;
  averageImportance: number;
  estimatedDurationMs: number;
  hookDetected: boolean;
  ctaDetected: boolean;
  /** Normalized ratio of blueprints with enriched visual/asset planning in `[0, 1]`. */
  visualCoverage: number;
  confidence: number;
}

/** Diagnostics metadata for a Studio Intelligence planning run. */
export interface StudioIntelligenceDiagnostics {
  warnings: string[];
  plannerStepsExecuted: string[];
  plannerVersion: string;
  executionTimeEstimateMs: number;
  unsupportedPatterns: string[];
  /** Planning-only trace confirming one strategy object was propagated. */
  strategyHandoffTrace?: readonly StoryStrategyId[];
  /** Strategy bias fields applied during planning (developer diagnostics). */
  strategyInfluenceApplied?: readonly string[];
  /** Human-readable strategy-driven planner decisions. */
  strategyDecisions?: readonly string[];
  /** Reasons a planner fell back to heuristic defaults. */
  fallbackReasons?: readonly string[];
  /** Normalized score (0–1) indicating how much strategy shaped the plan. */
  strategyApplicationScore?: number;
  /** Whether a mode template normalization pass ran. */
  modeTemplateApplied?: boolean;
  /** Mode template id applied during normalization. */
  modeTemplateId?: StoryStrategyId;
  /** Number of blueprint slots matched to template semantics. */
  templateSlotsMatched?: number;
  /** Template normalization fallbacks or partial matches. */
  templateFallbacks?: readonly string[];
}

/** High-level summary of a Studio Intelligence planning run. */
export interface StudioIntelligenceSummary {
  storyStructure: string;
  estimatedScenes: number;
  estimatedDurationMs: number;
  dominantEmotion?: string;
  dominantVisualStyle?: string;
  recommendedStoryMode: ScriptMode;
}

/** Output of the Studio Intelligence planning layer. */
export interface StudioIntelligenceResult {
  version: string;
  /** Normalized planning input. */
  input: StudioIntelligenceInput;
  /** Original input before normalization (planning only). */
  originalInput: StudioIntelligenceInput;
  normalizedNarration: string;
  structure: StoryStructurePlan;
  beats: NarrativeBeat[];
  arcs: NarrativeArc[];
  sceneBlueprintCollection: SceneBlueprintCollection;
  summary: StudioIntelligenceSummary;
  metrics: StudioIntelligenceMetrics;
  diagnostics: StudioIntelligenceDiagnostics;
  /** Resolved immutable story strategy used for this planning run. */
  resolvedStrategy: StoryStrategy;
  strategyId: StoryStrategyId;
  plannerConfigurationVersion: string;
  scenePlans: ScenePlan[];
  /** Story coherence validation attached after planning — does not mutate blueprints. */
  storyValidation: StoryValidationResult;
  /** Asset Intelligence planning output — only when ASSET_INTELLIGENCE_ENABLED=true. */
  assetIntelligence?: import("@/features/asset-intelligence/asset-intelligence.types").AssetIntelligenceResult;
  /** ISO timestamp when the plan was produced. */
  generatedAt: string;
}
