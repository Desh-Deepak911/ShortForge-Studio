import type { AssembledContext } from "./assembled-context.types";
import { assembledContextToPrompt } from "./assembled-context-to-prompt";
import type { GraphContext } from "./graph-context.types";
import { graphContextToPromptText } from "./graph-context-to-prompt";
import { buildPromptIntelligence } from "../prompts/build-prompt-intelligence";
import type { NarrativePlan } from "../prompts/narrative-plan.types";
import { promptIntelligenceToPromptText } from "../prompts/prompt-intelligence-to-prompt";
import { resolveEvidenceLedSurprisePreference } from "../prompts/resolve-evidence-led-surprise-preference";
import type { EvidenceLedSurprisePreferenceKind } from "../prompts/resolve-evidence-led-surprise-preference";

export type ScriptPromptSource = "prompt-intelligence" | "graph" | "assembled";

export interface ResolvedResearchPromptText {
  promptText: string;
  promptSource: ScriptPromptSource;
  /**
   * Prompt Intelligence narrative plan when PI successfully built the prompt.
   * Hook-type-free — consumers map via Hook integration.
   */
  narrativePlan?: NarrativePlan;
}

function hasGraphContextContent(context: GraphContext): boolean {
  return (
    context.rankedFacts.length > 0 ||
    context.verifiedFacts.length > 0 ||
    context.fixtureFacts.length > 0 ||
    context.statisticFacts.length > 0 ||
    context.timelineFacts.length > 0 ||
    context.primaryEntities.length > 0 ||
    context.entitySummaries.length > 0 ||
    context.groundingRules.length > 0 ||
    context.warnings.length > 0
  );
}

function tryPromptIntelligence(
  context: GraphContext,
  evidenceLedSurprisePreference?: EvidenceLedSurprisePreferenceKind,
): { promptText: string; narrativePlan: NarrativePlan } | null {
  try {
    const result = buildPromptIntelligence({
      graphContext: context,
      ...(evidenceLedSurprisePreference
        ? { evidenceLedSurprisePreference }
        : {}),
    });

    if (result.narrativePlan.beats.length === 0) {
      return null;
    }

    const promptText = promptIntelligenceToPromptText({
      result,
      graphContext: context,
    }).trim();

    if (!promptText) {
      return null;
    }

    return {
      promptText,
      narrativePlan: result.narrativePlan,
    };
  } catch {
    return null;
  }
}

/** Returns true when GraphContext can safely drive script prompt text. */
export function isGraphContextReadyForPrompt(
  context: GraphContext | undefined,
  assembled?: AssembledContext,
): context is GraphContext {
  if (!context) {
    return false;
  }

  if (context.queryId.trim().length === 0 || context.topic.trim().length === 0) {
    return false;
  }

  if (assembled && context.queryId !== assembled.queryId) {
    return false;
  }

  if (!hasGraphContextContent(context)) {
    return false;
  }

  const promptText = graphContextToPromptText(context).trim();
  return promptText.length > 0;
}

/**
 * Primary production prompt resolver — Prompt Intelligence first, graph fallback,
 * assembled fallback when GraphContext is unavailable.
 * Propagates explicit evidence-led-surprise creator preference into NarrativePlan (Sprint 7D.3).
 */
export function resolveResearchPromptText(input: {
  assembled: AssembledContext;
  graphContext?: GraphContext;
}): ResolvedResearchPromptText {
  const evidenceLedSurprisePreference = resolveEvidenceLedSurprisePreference({
    topic: input.graphContext?.topic ?? input.assembled.topic,
    context: input.assembled.manualNotes,
  });

  if (isGraphContextReadyForPrompt(input.graphContext, input.assembled)) {
    const promptIntelligence = tryPromptIntelligence(
      input.graphContext,
      evidenceLedSurprisePreference,
    );

    if (promptIntelligence) {
      return {
        promptText: promptIntelligence.promptText,
        promptSource: "prompt-intelligence",
        narrativePlan: promptIntelligence.narrativePlan,
      };
    }

    return {
      promptText: graphContextToPromptText(input.graphContext),
      promptSource: "graph",
    };
  }

  return {
    promptText: assembledContextToPrompt(input.assembled),
    promptSource: "assembled",
  };
}

export function formatScriptPromptSourceForDev(source: ScriptPromptSource): string {
  if (source === "prompt-intelligence") {
    return "Prompt Intelligence";
  }

  if (source === "graph") {
    return "GraphContext (fallback)";
  }

  return "AssembledContext (fallback)";
}

export function usesGraphDerivedPromptSource(source: ScriptPromptSource): boolean {
  return source === "prompt-intelligence" || source === "graph";
}
