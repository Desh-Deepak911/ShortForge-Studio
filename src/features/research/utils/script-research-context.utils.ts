import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import type { GraphContext } from "@/features/intelligence/context/graph-context.types";
import {
  resolveResearchPromptText,
  type ScriptPromptSource,
  usesGraphDerivedPromptSource,
} from "@/features/intelligence/context/resolve-research-prompt-text";
import { isResearchContextTextUseful } from "@/features/research/utils/research-context-pass.utils";
import { hasRankedPlayerDataInContextText } from "@/lib/ai/top5-script-prompt.utils";
import type { GenerateScriptResearchPreview, ScriptMode } from "@/types/footiebitz";

export interface ResolveScriptResearchContextInput {
  topic: string;
  scriptMode: ScriptMode;
  manualContext?: string;
  enableResearch?: boolean;
  researchPreview?: GenerateScriptResearchPreview;
}

export interface ResolvedScriptResearchContext {
  context?: string;
  researchApplied: boolean;
  researchWarning?: string;
  usedResearchPreview?: boolean;
  top5RankedDataAvailable?: boolean;
  /** Dev diagnostics — Prompt Intelligence primary, graph/assembled fallback. */
  promptSource?: ScriptPromptSource;
}

function withSupplementalManualNotes(
  assembled: AssembledContext,
  manualContext?: string,
): AssembledContext {
  const manual = manualContext?.trim();
  if (!manual) {
    return assembled;
  }

  const existing = assembled.manualNotes?.trim();
  if (!existing) {
    return { ...assembled, manualNotes: manual };
  }

  if (existing.includes(manual)) {
    return assembled;
  }

  return { ...assembled, manualNotes: `${existing}\n${manual}` };
}

function hasAssembledResearchContent(assembled: AssembledContext): boolean {
  if (assembled.verifiedFacts.some((fact) => fact.text.trim().length > 0)) {
    return true;
  }

  if (assembled.rankings.some((ranking) => ranking.entries.length > 0)) {
    return true;
  }

  return (
    assembled.fixtures.length > 0 ||
    assembled.statistics.length > 0 ||
    assembled.events.length > 0 ||
    assembled.lineups.length > 0
  );
}

function appendSupplementalManualNotes(promptText: string, manualContext?: string): string {
  const manual = manualContext?.trim();
  if (!manual || promptText.includes(manual)) {
    return promptText;
  }

  return `${promptText}\n\nCREATOR NOTES (manual — not provider-verified):\n- ${manual}`;
}

function resolveTop5RankedDataFromAssembled(input: {
  scriptMode: ScriptMode;
  assembled: AssembledContext;
  graphContext?: GraphContext;
  promptSource: ScriptPromptSource;
  promptText?: string;
  researchApplied: boolean;
}): boolean {
  if (input.scriptMode !== "top_5" || !input.researchApplied) {
    return false;
  }

  if (
    usesGraphDerivedPromptSource(input.promptSource) &&
    (input.graphContext?.rankedFacts.length ?? 0) > 0
  ) {
    return true;
  }

  if (input.assembled.rankings.some((ranking) => ranking.entries.length > 0)) {
    return true;
  }

  return hasRankedPlayerDataInContextText(input.promptText);
}

function buildCautiousResearchFallback(input: {
  manualContext?: string;
  promptText?: string;
  warnings?: string[];
}): string | undefined {
  const manual = input.manualContext?.trim();
  const partial = input.promptText?.trim();
  const parts: string[] = [];

  if (partial) {
    if (isResearchContextTextUseful(partial)) {
      parts.push(partial);
    } else if (/Warnings:/i.test(partial)) {
      parts.push(partial);
    }
  }

  if (manual && !partial?.includes("CREATOR NOTES (manual")) {
    parts.push(manual);
  }

  const warningText = input.warnings?.map((warning) => warning.trim()).filter(Boolean).join(" ");
  if (warningText && !parts.some((part) => part.includes(warningText))) {
    parts.push(`Research note (cautious): ${warningText}`);
  }

  if (parts.length > 0) {
    return parts.join("\n\n");
  }

  return manual;
}

export function matchesResearchPreviewHandoff(
  preview: Pick<GenerateScriptResearchPreview, "queryId" | "topic" | "mode">,
  params: { topic: string; scriptMode: ScriptMode },
): boolean {
  const queryId = preview.queryId?.trim();
  if (!queryId) {
    return false;
  }

  const trimmedTopic = params.topic.trim();
  return preview.topic.trim() === trimmedTopic && preview.mode === params.scriptMode;
}

export function isReusableResearchPreview(
  preview: GenerateScriptResearchPreview | undefined,
  params: { topic: string; scriptMode: ScriptMode },
): boolean {
  if (!preview?.queryId?.trim()) {
    return false;
  }

  return matchesResearchPreviewHandoff(preview, params);
}

/** @deprecated Use `matchesResearchPreviewHandoff`. */
export function matchesForwardedIntelligenceQuery(
  preview: Pick<GenerateScriptResearchPreview, "queryId" | "topic" | "mode">,
  params: { topic: string; scriptMode: ScriptMode },
): boolean {
  return matchesResearchPreviewHandoff(preview, params);
}

/**
 * Applies researched context to script generation.
 * Primary prompt source: GraphContext → Prompt Intelligence → `promptIntelligenceToPromptText()`.
 * Fallback: GraphContext → `graphContextToPromptText()`, then AssembledContext.
 */
export function applyAssembledResearchContext(input: {
  scriptMode: ScriptMode;
  manualContext?: string;
  assembled: AssembledContext;
  graphContext?: GraphContext;
  usedResearchPreview?: boolean;
}): ResolvedScriptResearchContext {
  const assembled = withSupplementalManualNotes(input.assembled, input.manualContext);
  const { promptText: resolvedPromptText, promptSource } = resolveResearchPromptText({
    assembled,
    graphContext: input.graphContext,
  });
  const promptText = usesGraphDerivedPromptSource(promptSource)
    ? appendSupplementalManualNotes(resolvedPromptText, input.manualContext)
    : resolvedPromptText;
  const researchWarning = assembled.warnings.filter(Boolean).join(" ") || undefined;
  const hasResearchContent = usesGraphDerivedPromptSource(promptSource)
    ? Boolean(input.graphContext?.rankedFacts.length) ||
      Boolean(input.graphContext?.verifiedFacts.length) ||
      Boolean(input.graphContext?.fixtureFacts.length) ||
      Boolean(input.graphContext?.statisticFacts.length) ||
      Boolean(input.graphContext?.timelineFacts.length) ||
      hasAssembledResearchContent(assembled)
    : hasAssembledResearchContent(assembled);
  const researchApplied =
    isResearchContextTextUseful(promptText) &&
    (hasResearchContent || hasRankedPlayerDataInContextText(promptText));
  const top5RankedDataAvailable = resolveTop5RankedDataFromAssembled({
    scriptMode: input.scriptMode,
    assembled,
    graphContext: input.graphContext,
    promptSource,
    promptText,
    researchApplied,
  });

  if (researchApplied) {
    return {
      context: promptText,
      researchApplied: true,
      researchWarning,
      usedResearchPreview: input.usedResearchPreview,
      top5RankedDataAvailable,
      promptSource,
    };
  }

  if (researchWarning) {
    console.warn("football research:", researchWarning);
  }

  return {
    context: buildCautiousResearchFallback({
      manualContext: input.manualContext,
      promptText,
      warnings: assembled.warnings,
    }),
    researchApplied: false,
    researchWarning,
    usedResearchPreview: input.usedResearchPreview,
    top5RankedDataAvailable: false,
    promptSource,
  };
}

/** @deprecated Use `applyAssembledResearchContext`. */
export const applyPreviewResearchContext = applyAssembledResearchContext;
