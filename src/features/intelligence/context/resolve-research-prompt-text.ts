import type { AssembledContext } from "./assembled-context.types";
import { assembledContextToPrompt } from "./assembled-context-to-prompt";
import type { GraphContext } from "./graph-context.types";
import { graphContextToPromptText } from "./graph-context-to-prompt";
import { buildPromptIntelligence } from "../prompts/build-prompt-intelligence";
import { promptIntelligenceToPromptText } from "../prompts/prompt-intelligence-to-prompt";

export type ScriptPromptSource = "prompt-intelligence" | "graph" | "assembled";

export interface ResolvedResearchPromptText {
  promptText: string;
  promptSource: ScriptPromptSource;
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

function tryPromptIntelligencePrompt(context: GraphContext): string | null {
  try {
    const result = buildPromptIntelligence({ graphContext: context });

    if (result.narrativePlan.beats.length === 0) {
      return null;
    }

    const promptText = promptIntelligenceToPromptText({
      result,
      graphContext: context,
    }).trim();

    return promptText.length > 0 ? promptText : null;
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
 */
export function resolveResearchPromptText(input: {
  assembled: AssembledContext;
  graphContext?: GraphContext;
}): ResolvedResearchPromptText {
  if (isGraphContextReadyForPrompt(input.graphContext, input.assembled)) {
    const promptIntelligencePrompt = tryPromptIntelligencePrompt(input.graphContext);

    if (promptIntelligencePrompt) {
      return {
        promptText: promptIntelligencePrompt,
        promptSource: "prompt-intelligence",
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
