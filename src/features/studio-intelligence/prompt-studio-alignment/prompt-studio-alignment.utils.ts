import {
  resolveStoryStructureForMode,
  type StoryStructureArc,
} from "@/features/intelligence/prompts/story-structure-intelligence.utils";
import type { ScriptMode } from "@/types/footiebitz";

import { resolveModeTemplate } from "../mode-templates/mode-template.utils";
import { SCRIPT_MODE_TO_STORY_STRATEGY_ID } from "../story-strategy/story-strategy.constants";
import { getStoryStrategyById } from "../story-strategy/story-strategy.registry";
import type { StoryStrategyId } from "../story-strategy/story-strategy.types";
import { mapModeToStoryStrategyId, resolveStoryStrategy } from "../story-strategy/story-strategy.utils";
import type {
  PromptStudioAlignmentDiagnostics,
  PromptStudioAlignmentInput,
  PromptStudioAlignmentStatus,
  PromptStudioModeProfile,
} from "./prompt-studio-alignment.types";

const HEAD_TO_HEAD_TOPIC_PATTERN = /\bvs\.?\b|\bversus\b/i;

/** Canonical ScriptMode profiles shared by Prompt Intelligence and Studio Intelligence. */
export const PROMPT_STUDIO_MODE_PROFILES: Readonly<Record<ScriptMode, PromptStudioModeProfile>> = {
  top_5: {
    scriptMode: "top_5",
    defaultStudioStrategyId: "countdown",
    allowedStudioStrategyIds: ["countdown"],
    promptStructureArc: "countdown_ranked_reveal",
  },
  opinion_debate: {
    scriptMode: "opinion_debate",
    defaultStudioStrategyId: "debate",
    allowedStudioStrategyIds: ["debate", "comparison"],
    promptStructureArc: "debate_argument_counterpoint_takeaway",
  },
  historical_explainer: {
    scriptMode: "historical_explainer",
    defaultStudioStrategyId: "history",
    allowedStudioStrategyIds: ["history"],
    promptStructureArc: "curiosity_explanation_example_payoff",
  },
  player_analysis: {
    scriptMode: "player_analysis",
    defaultStudioStrategyId: "biography",
    allowedStudioStrategyIds: ["biography"],
    promptStructureArc: "hook_story_payoff",
  },
  tactical_review: {
    scriptMode: "tactical_review",
    defaultStudioStrategyId: "tactical_analysis",
    allowedStudioStrategyIds: ["tactical_analysis"],
    promptStructureArc: "bold_claim_explanation_evidence_takeaway",
  },
  match_preview: {
    scriptMode: "match_preview",
    defaultStudioStrategyId: "match_preview",
    allowedStudioStrategyIds: ["match_preview"],
    promptStructureArc: "question_stakes_battle_cta",
  },
  match_recap: {
    scriptMode: "match_recap",
    defaultStudioStrategyId: "news",
    allowedStudioStrategyIds: ["news"],
    promptStructureArc: "result_turning_hero_impact",
  },
  story: {
    scriptMode: "story",
    defaultStudioStrategyId: "default",
    allowedStudioStrategyIds: ["default"],
    promptStructureArc: "cold_open_context_payoff",
    knownPartialAlignment: true,
  },
};

/** Maps a ScriptMode to its Prompt Intelligence story structure arc. */
export function resolvePromptStructureArcForMode(mode: ScriptMode): StoryStructureArc {
  return resolveStoryStructureForMode(mode).arc;
}

/** Returns the shared mode profile for a ScriptMode. */
export function getPromptStudioModeProfile(mode: ScriptMode): PromptStudioModeProfile {
  return PROMPT_STUDIO_MODE_PROFILES[mode];
}

/** Detects head-to-head comparison phrasing in a topic label. */
export function topicSuggestsHeadToHeadComparison(topic: string | undefined): boolean {
  if (!topic?.trim()) {
    return false;
  }

  return HEAD_TO_HEAD_TOPIC_PATTERN.test(topic);
}

/**
 * Resolves the Studio Intelligence strategy for a script mode.
 * Opinion debate with X-vs-Y topics may resolve to comparison instead of debate.
 */
export function resolveStudioStrategyForScriptMode(
  mode: ScriptMode,
  topic?: string,
): StoryStrategyId {
  if (mode === "opinion_debate" && topicSuggestsHeadToHeadComparison(topic)) {
    return "comparison";
  }

  return mapModeToStoryStrategyId(mode) ?? SCRIPT_MODE_TO_STORY_STRATEGY_ID[mode] ?? "default";
}

function buildMismatchWarnings(options: {
  mode: ScriptMode;
  promptStructureId: StoryStructureArc;
  studioStrategyId: StoryStrategyId;
  profile: PromptStudioModeProfile;
  strategyPreferredStructure: StoryStructureArc;
}): string[] {
  const warnings: string[] = [];

  if (!options.profile.allowedStudioStrategyIds.includes(options.studioStrategyId)) {
    warnings.push(
      `ScriptMode "${options.mode}" does not allow studio strategy "${options.studioStrategyId}".`,
    );
  }

  if (options.promptStructureId !== options.strategyPreferredStructure) {
    if (
      options.mode === "story" &&
      options.promptStructureId === "cold_open_context_payoff" &&
      options.strategyPreferredStructure === "hook_story_payoff"
    ) {
      warnings.push(
        "Generic story uses cold-open prompt structure while default strategy prefers hook-story-payoff (known partial alignment).",
      );
    } else if (
      options.mode === "opinion_debate" &&
      options.studioStrategyId === "comparison" &&
      options.promptStructureId === "debate_argument_counterpoint_takeaway"
    ) {
      warnings.push(
        "Head-to-head topic resolved to comparison strategy while prompt structure remains debate arc (allowed partial alignment).",
      );
    } else if (options.promptStructureId !== options.profile.promptStructureArc) {
      warnings.push(
        `Prompt structure "${options.promptStructureId}" diverges from mode profile arc "${options.profile.promptStructureArc}".`,
      );
    } else {
      warnings.push(
        `Prompt structure "${options.promptStructureId}" differs from studio strategy preferred structure "${options.strategyPreferredStructure}".`,
      );
    }
  }

  if (
    options.mode === "match_preview" &&
    (options.studioStrategyId === "debate" || options.studioStrategyId === "comparison")
  ) {
    warnings.push("Match preview mode must not resolve to debate/comparison strategies.");
  }

  return warnings;
}

function resolveAlignmentStatus(options: {
  profile: PromptStudioModeProfile;
  promptStructureId: StoryStructureArc;
  studioStrategyId: StoryStrategyId;
  strategyPreferredStructure: StoryStructureArc;
  mismatchWarnings: readonly string[];
}): PromptStudioAlignmentStatus {
  if (
    !options.profile.allowedStudioStrategyIds.includes(options.studioStrategyId) ||
    options.mismatchWarnings.some((warning) => warning.includes("must not resolve"))
  ) {
    return "mismatch";
  }

  if (options.promptStructureId === options.strategyPreferredStructure) {
    return "aligned";
  }

  if (options.profile.knownPartialAlignment) {
    return "partial";
  }

  if (
    options.profile.scriptMode === "opinion_debate" &&
    options.studioStrategyId === "comparison" &&
    options.promptStructureId === "debate_argument_counterpoint_takeaway"
  ) {
    return "partial";
  }

  if (options.promptStructureId === options.profile.promptStructureArc) {
    return "partial";
  }

  return "mismatch";
}

/** Resolves cross-layer alignment diagnostics for a script mode and optional topic. */
export function resolvePromptStudioAlignment(
  input: PromptStudioAlignmentInput,
): PromptStudioAlignmentDiagnostics {
  const profile = getPromptStudioModeProfile(input.mode);
  const promptStructureId = resolvePromptStructureArcForMode(input.mode);
  const studioStrategyId =
    input.studioStrategyId ?? resolveStudioStrategyForScriptMode(input.mode, input.topic);
  const strategy = getStoryStrategyById(studioStrategyId);
  const modeTemplate = resolveModeTemplate(strategy);

  const mismatchWarnings = buildMismatchWarnings({
    mode: input.mode,
    promptStructureId,
    studioStrategyId,
    profile,
    strategyPreferredStructure: strategy.preferredStructure,
  });

  const alignmentStatus = resolveAlignmentStatus({
    profile,
    promptStructureId,
    studioStrategyId,
    strategyPreferredStructure: strategy.preferredStructure,
    mismatchWarnings,
  });

  return {
    scriptMode: input.mode,
    promptStructureId,
    studioStrategyId,
    modeTemplateId: modeTemplate.templateId,
    alignmentStatus,
    mismatchWarnings,
  };
}

/** Returns whether prompt and studio layers agree for a mode without hard conflicts. */
export function isPromptStudioAligned(input: PromptStudioAlignmentInput): boolean {
  const diagnostics = resolvePromptStudioAlignment(input);
  return diagnostics.alignmentStatus !== "mismatch";
}

/** Maps a studio strategy back to its primary script mode when available. */
export function resolveScriptModeForStudioStrategy(strategyId: StoryStrategyId): ScriptMode | undefined {
  const strategy = resolveStoryStrategy(strategyId);
  return strategy.scriptModes?.[0];
}
