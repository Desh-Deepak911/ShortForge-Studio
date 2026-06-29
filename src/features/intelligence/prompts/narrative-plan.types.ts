import type { Tone } from "@/types/footiebitz";

import type { StoryStructureArc } from "./story-structure-intelligence.utils";

/** Story arc selected for the script mode — guides beat pacing and fact usage. */
export type NarrativeStructure = StoryStructureArc;

/** Single beat in the narrative plan — guides script section pacing and fact usage. */
export interface NarrativeBeat {
  id: string;
  label: string;
  purpose: string;
  targetWordCount: number;
  requiredFactIds: string[];
  tone: Tone;
  /** When true, this beat is the opening grab (~1–2 spoken seconds). */
  openingHook?: boolean;
}

/** Mode-aware narrative blueprint derived from GraphContext. */
export interface NarrativePlan {
  structure: NarrativeStructure;
  /** Human-readable arc label for prompts (planning only — not spoken). */
  structureLabel: string;
  beats: NarrativeBeat[];
  requiredFacts: string[];
  optionalFacts: string[];
  forbiddenClaims: string[];
  modeSpecificRules: string[];
}
