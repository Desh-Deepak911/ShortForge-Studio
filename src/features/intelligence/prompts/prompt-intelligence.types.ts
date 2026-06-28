import type { ScriptMode } from "@/types/footiebitz";

import type { ConfidenceScore } from "../shared/confidence.types";

import type { FactUsagePlan, PromptGroundingRule, PromptLengthRule, PromptStyleRule } from "./prompt-plan.types";
import type { NarrativePlan } from "./narrative-plan.types";
import type { PromptSection } from "./prompt-section.types";

/** Build/runtime diagnostics for Prompt Intelligence (dev/QA only). */
export interface PromptIntelligenceDiagnostics {
  graphQueryId: string;
  inputFactCount: number;
  selectedSectionCount: number;
  selectedLineCount: number;
  narrativeBeatCount: number;
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
export interface PromptIntelligenceResult {
  queryId: string;
  selectedMode: ScriptMode;
  narrativePlan: NarrativePlan;
  promptSections: PromptSection[];
  groundingRules: PromptGroundingRule[];
  styleRules: PromptStyleRule[];
  lengthRules: PromptLengthRule[];
  factUsagePlan: FactUsagePlan;
  warnings: string[];
  confidence: ConfidenceScore;
  diagnostics: PromptIntelligenceDiagnostics;
}
