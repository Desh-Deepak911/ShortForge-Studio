/** Canonical section kinds for Prompt Intelligence prompt assembly. */
export type PromptSectionKind =
  | "metadata"
  | "grounding"
  | "ranked_facts"
  | "primary_entity"
  | "verified_facts"
  | "fixture"
  | "statistics"
  | "timeline"
  | "narrative_directive"
  | "manual_notes"
  | "warnings"
  | "custom";

/** Emphasis tier when mapping facts into final LLM prompt sections. */
export type PromptSectionEmphasis = "required" | "recommended" | "optional";

/** Ordered prompt section selected for final LLM context rendering. */
export interface PromptSection {
  id: string;
  kind: PromptSectionKind;
  title: string;
  priority: number;
  lines: string[];
  emphasis: PromptSectionEmphasis;
  sourceFactIds?: string[];
}
