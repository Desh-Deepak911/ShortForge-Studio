import type { StoryStructureArc } from "@/features/intelligence/prompts/story-structure-intelligence.utils";
import type { ScriptMode } from "@/types/footiebitz";

import type { ModeTemplateId } from "../mode-templates/mode-template.types";
import type { StoryStrategyId } from "../story-strategy/story-strategy.types";

/** Alignment status between Prompt Intelligence structure and Studio Intelligence strategy. */
export type PromptStudioAlignmentStatus = "aligned" | "partial" | "mismatch";

/** Shared mode-structure profile linking ScriptMode to PI and SI registries. */
export interface PromptStudioModeProfile {
  scriptMode: ScriptMode;
  defaultStudioStrategyId: StoryStrategyId;
  allowedStudioStrategyIds: readonly StoryStrategyId[];
  promptStructureArc: StoryStructureArc;
  /** Known intentional arc divergence — e.g. generic story cold-open vs hook payoff. */
  knownPartialAlignment?: boolean;
}

/** Diagnostics describing cross-layer mode structure alignment. */
export interface PromptStudioAlignmentDiagnostics {
  scriptMode: ScriptMode;
  promptStructureId: StoryStructureArc;
  studioStrategyId: StoryStrategyId;
  modeTemplateId: ModeTemplateId;
  alignmentStatus: PromptStudioAlignmentStatus;
  mismatchWarnings: readonly string[];
}

/** Input to the prompt ↔ studio alignment resolver. */
export interface PromptStudioAlignmentInput {
  mode: ScriptMode;
  topic?: string;
  /** Optional override when caller already resolved a studio strategy. */
  studioStrategyId?: StoryStrategyId;
}
