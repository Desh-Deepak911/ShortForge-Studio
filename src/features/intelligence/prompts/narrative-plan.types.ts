import type { Tone } from "@/types/footiebitz";

/** High-level narrative structure selected for the script mode and query. */
export type NarrativeStructure =
  | "ranked_countdown"
  | "player_profile"
  | "match_preview"
  | "match_recap"
  | "tactical_breakdown"
  | "debate"
  | "story_arc"
  | "historical_explainer"
  | "generic";

/** Single beat in the narrative plan — guides script section pacing and fact usage. */
export interface NarrativeBeat {
  id: string;
  label: string;
  purpose: string;
  targetWordCount: number;
  requiredFactIds: string[];
  tone: Tone;
}

/** Mode-aware narrative blueprint derived from GraphContext. */
export interface NarrativePlan {
  structure: NarrativeStructure;
  beats: NarrativeBeat[];
  requiredFacts: string[];
  optionalFacts: string[];
  forbiddenClaims: string[];
  modeSpecificRules: string[];
}
