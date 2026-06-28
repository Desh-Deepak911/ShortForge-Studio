import type { ScriptMode } from "@/types/footiebitz";

import type { GraphContext } from "../context/graph-context.types";
import type { ResearchResultProvenance } from "../providers/provider-result.types";
import type { ConfidenceScore } from "../shared/confidence.types";

/** Lifecycle status for a Prompt Intelligence artifact. */
export type PromptIntelligenceStatus = "ready" | "sparse" | "fallback";

/** Emphasis tier for a prompt section when assembling final LLM context. */
export type PromptIntelligenceSectionEmphasis = "required" | "recommended" | "optional";

/** Canonical section kinds for Prompt Intelligence assembly. */
export type PromptIntelligenceSectionKind =
  | "metadata"
  | "grounding"
  | "ranked_facts"
  | "primary_entity"
  | "verified_facts"
  | "fixture"
  | "statistics"
  | "timeline"
  | "warnings"
  | "manual_notes"
  | "narrative_directive"
  | "custom";

/** Grounding strictness derived from graph context and mode. */
export type PromptIntelligenceGroundingStrictness = "strict" | "standard" | "cautious";

/** Ordered section payload selected for final prompt assembly. */
export interface PromptIntelligenceSection {
  id: string;
  kind: PromptIntelligenceSectionKind;
  title: string;
  priority: number;
  lines: string[];
  emphasis: PromptIntelligenceSectionEmphasis;
  sourceFactIds?: string[];
}

/** Mode-aware rendering strategy for Prompt Intelligence. */
export interface PromptIntelligenceStrategy {
  id: string;
  scriptMode: ScriptMode;
  sectionOrder: PromptIntelligenceSectionKind[];
  leadWithRankings: boolean;
  leadWithPrimaryEntity: boolean;
  compressSparseContext: boolean;
}

/** Grounding policy applied before LLM prompt rendering. */
export interface PromptIntelligenceGrounding {
  rules: string[];
  constraints: string[];
  strictness: PromptIntelligenceGroundingStrictness;
}

/** Build/runtime diagnostics for Prompt Intelligence (dev/QA only). */
export interface PromptIntelligenceDiagnostics {
  graphQueryId: string;
  inputFactCount: number;
  selectedSectionCount: number;
  selectedLineCount: number;
  strategyId: string;
  sparseContext: boolean;
  warnings: string[];
}

/**
 * Canonical output of the Prompt Intelligence layer.
 *
 * Sits between `GraphContext` and final LLM research prompt text.
 * Not wired into production script generation yet.
 */
export interface PromptIntelligence {
  queryId: string;
  topic: string;
  selectedMode: ScriptMode;
  status: PromptIntelligenceStatus;
  strategy: PromptIntelligenceStrategy;
  grounding: PromptIntelligenceGrounding;
  sections: PromptIntelligenceSection[];
  confidence: ConfidenceScore;
  provenance: ResearchResultProvenance;
  diagnostics: PromptIntelligenceDiagnostics;
}

/**
 * Final prompt context produced by Prompt Intelligence.
 *
 * Target production handoff to `generateStoryScript` — not wired yet.
 */
export interface PromptIntelligenceContext {
  promptIntelligence: PromptIntelligence;
  /** Rendered research context text for LLM prompt injection. */
  promptText: string;
  sourceGraphContextId: string;
}

export interface BuildPromptIntelligenceInput {
  graphContext: GraphContext;
}

export interface BuildPromptIntelligenceResult {
  promptIntelligence: PromptIntelligence;
}
