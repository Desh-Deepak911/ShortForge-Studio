import type { GraphContext } from "../context/graph-context.types";

import { buildPromptIntelligence } from "./build-prompt-intelligence";
import { promptIntelligenceToPromptText } from "./prompt-intelligence-to-prompt";
import type { PromptIntelligenceContext } from "./prompt-intelligence.types";

/**
 * Prompt Intelligence pipeline entry point.
 *
 * Target production flow (not wired yet):
 *   GraphContext → buildPromptIntelligence() → promptIntelligenceToPromptText() → generateStoryScript
 *
 * Current production still uses:
 *   GraphContext → graphContextToPromptText() → generateStoryScript
 */
export function resolvePromptIntelligenceContext(input: {
  graphContext: GraphContext;
}): PromptIntelligenceContext {
  const { promptIntelligence } = buildPromptIntelligence({
    graphContext: input.graphContext,
  });

  return {
    promptIntelligence,
    promptText: promptIntelligenceToPromptText(promptIntelligence),
    sourceGraphContextId: input.graphContext.queryId,
  };
}
