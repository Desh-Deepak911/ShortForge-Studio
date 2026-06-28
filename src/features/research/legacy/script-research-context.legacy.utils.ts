import type { FootballResearchContext } from "@/features/research/types/football-research.types";
import { isResearchContextTextUseful } from "@/features/research/utils/research-context-pass.utils";
import { hasRankedPlayerDataInContextText } from "@/lib/ai/top5-script-prompt.utils";
import type { ScriptMode } from "@/types/footiebitz";

import type { ResolvedScriptResearchContext } from "../utils/script-research-context.utils";

function mergeResearchContextText(
  manualContext: string | undefined,
  contextText: string,
): string | undefined {
  const trimmedText = contextText.trim();
  if (!trimmedText) {
    return manualContext?.trim() || undefined;
  }

  const manual = manualContext?.trim();
  if (!manual) {
    return trimmedText;
  }

  if (trimmedText.includes("CREATOR NOTES (manual")) {
    return trimmedText;
  }

  return `${manual}\n\n${trimmedText}`;
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

function resolveLegacyTop5RankedDataAvailable(input: {
  scriptMode: ScriptMode;
  contextText?: string;
  researchApplied?: boolean;
}): boolean {
  if (input.scriptMode !== "top_5" || !input.researchApplied) {
    return false;
  }

  return hasRankedPlayerDataInContextText(input.contextText);
}

/** @deprecated test/legacy only — do not use in production path. */
export function applyResolvedResearchContext(input: {
  scriptMode: ScriptMode;
  manualContext?: string;
  researchContext: FootballResearchContext;
  contextText: string;
  usedResearchPreview?: boolean;
}): ResolvedScriptResearchContext {
  const manualContext = input.manualContext?.trim() || undefined;
  const researchWarning =
    input.researchContext.warnings.filter(Boolean).join(" ") || undefined;
  const mergedContext = mergeResearchContextText(manualContext, input.contextText) ?? "";

  if (isResearchContextTextUseful(mergedContext)) {
    return {
      context: mergedContext,
      researchApplied: true,
      researchWarning,
      usedResearchPreview: input.usedResearchPreview,
      top5RankedDataAvailable: resolveLegacyTop5RankedDataAvailable({
        scriptMode: input.scriptMode,
        contextText: mergedContext,
        researchApplied: true,
      }),
    };
  }

  if (researchWarning) {
    console.warn("football research:", researchWarning);
  }

  return {
    context: buildCautiousResearchFallback({
      manualContext,
      promptText: input.contextText,
      warnings: input.researchContext.warnings,
    }),
    researchApplied: false,
    researchWarning,
    usedResearchPreview: input.usedResearchPreview,
    top5RankedDataAvailable: resolveLegacyTop5RankedDataAvailable({
      scriptMode: input.scriptMode,
      contextText: mergedContext,
      researchApplied: false,
    }),
  };
}
