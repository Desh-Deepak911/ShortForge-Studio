import type { AssembledContext } from "../context/assembled-context.types";
import type { GraphContext } from "../context/graph-context.types";
import {
  formatScriptPromptSourceForDev,
  resolveResearchPromptText,
  type ScriptPromptSource,
} from "../context/resolve-research-prompt-text";

import { buildPromptIntelligence } from "./build-prompt-intelligence";

export interface PromptIntelligenceDevBeatSummary {
  id: string;
  label: string;
  targetWordCount: number;
  requiredFactCount: number;
}

/** Dev-only production Prompt Intelligence summary (no graph comparison). */
export interface PromptIntelligenceDevSummary {
  narrativePlan: {
    structure: string;
    beats: PromptIntelligenceDevBeatSummary[];
  };
  beatCount: number;
  factUsage: {
    requiredFactCount: number;
    optionalFactCount: number;
    suppressedFactCount: number;
    beatAssignments: Array<{ beatId: string; factCount: number }>;
  };
  promptLength: number;
  confidence: string;
  promptSource: string;
  promptSourceId: ScriptPromptSource;
}

export function buildPromptIntelligenceDevSummary(input: {
  graphContext: GraphContext;
  assembledContext: AssembledContext;
}): PromptIntelligenceDevSummary {
  const result = buildPromptIntelligence({ graphContext: input.graphContext });
  const resolved = resolveResearchPromptText({
    assembled: input.assembledContext,
    graphContext: input.graphContext,
  });

  return {
    narrativePlan: {
      structure: result.narrativePlan.structure,
      beats: result.narrativePlan.beats.map((beat) => ({
        id: beat.id,
        label: beat.label,
        targetWordCount: beat.targetWordCount,
        requiredFactCount: beat.requiredFactIds.length,
      })),
    },
    beatCount: result.narrativePlan.beats.length,
    factUsage: {
      requiredFactCount: result.factUsagePlan.requiredFactIds.length,
      optionalFactCount: result.factUsagePlan.optionalFactIds.length,
      suppressedFactCount: result.factUsagePlan.suppressedFactIds.length,
      beatAssignments: result.factUsagePlan.beatAssignments.map((assignment) => ({
        beatId: assignment.beatId,
        factCount: assignment.factIds.length,
      })),
    },
    promptLength: resolved.promptText.length,
    confidence: `${result.confidence.tier} (${result.confidence.percent}%)`,
    promptSource: formatScriptPromptSourceForDev(resolved.promptSource),
    promptSourceId: resolved.promptSource,
  };
}

export function formatPromptIntelligenceDevSummaryForDev(
  summary?: PromptIntelligenceDevSummary,
): string {
  if (!summary) {
    return "No Prompt Intelligence summary yet.";
  }

  return JSON.stringify(
    {
      narrativePlan: summary.narrativePlan,
      beatCount: summary.beatCount,
      factUsage: summary.factUsage,
      promptLength: summary.promptLength,
      confidence: summary.confidence,
      promptSource: summary.promptSource,
    },
    null,
    2,
  );
}
