import type { Tone } from "@/types/footiebitz";

import type { StoryStructureArc } from "./story-structure-intelligence.utils";

/** Story arc selected for the script mode — guides beat pacing and fact usage. */
export type NarrativeStructure = StoryStructureArc;

/**
 * Prompt Intelligence–owned opening intention (Hook-type-free).
 * Explicit evidence-led surprise — never implied by research availability alone.
 */
export type NarrativeOpeningIntentKind = "evidence_led_surprise";

export interface NarrativeOpeningIntent {
  kind: NarrativeOpeningIntentKind;
  /** Opening-beat fact IDs eligible to drive an evidence-led opening. */
  factIds: string[];
}

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
  /**
   * Explicit evidence-led surprise request from the story-structure template.
   * Never inferred from fact kind alone.
   */
  evidenceLedSurprise?: boolean;
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
  /**
   * Explicit evidence-led opening semantic.
   * Omitted when openingHook alone has no eligible evidence-bearing fact refs.
   */
  openingIntent?: NarrativeOpeningIntent;
}
