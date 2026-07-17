/**
 * Model-call bridge for Hooked narration (Sprint 7D.1).
 * Uses raw story-script generation so Hook Engine owns length enforcement.
 */

import "server-only";

import type { HookedNarrationModelCall } from "@/features/hook-engine/integration";
import { generateRawStoryScript } from "./script-generation.service";

/**
 * Builds a HookedNarrationModelCall that uses generateRawStoryScript.
 * Repair/fallback/compress kinds reuse the same raw generator with directive guidance.
 */
export function createHookedNarrationModelCall(): HookedNarrationModelCall {
  return async (input) => {
    const kindNote =
      input.kind === "repair"
        ? "\nREPAIR PASS: Rewrite only the first spoken sentence to fix validation failures while preserving the narration body and subject. The opening must obey the Opening word maximum (hard) from the HOOK DIRECTIVE. Return complete narration."
        : input.kind === "length_compress"
          ? "\nLENGTH COMPRESSION: Shorten the narration to fit the duration budget. Preserve the opening subject and factual accuracy. Do not add new facts. Return updated hookClaimRefs for claims still used in the opening."
          : input.kind === "compatibility_fallback"
            ? "\nCOMPATIBILITY FALLBACK: Rewrite with a short, clear, subject-faithful opening. The first spoken sentence MUST be at or under the Opening word maximum (hard) in the HOOK DIRECTIVE — count words. Avoid questions if the directive forbids them. Avoid risky factual claims, stats, fees, and unverified superlatives."
            : input.kind === "safe_fallback"
              ? "\nSAFE FALLBACK: Prefer a safe subject-preserving opening within the Opening word maximum (hard). Do not fabricate facts, stats, quotes, or rankings."
              : "";

    const reasons =
      input.validationReasons?.length
        ? `\nValidation reasons to address: ${input.validationReasons.join("; ")}`
        : "";

    const previous =
      input.previousNarration?.trim()
        ? `\nPrevious narration:\n${input.previousNarration.trim()}`
        : "";

    const directive = `${input.hookDirectiveBlock}${kindNote}${reasons}${previous}`;

    const result = await generateRawStoryScript(input.topic, {
      tone: input.tone,
      duration: input.duration,
      scriptMode: input.scriptMode,
      context: input.context,
      templatePromptBlock: input.templatePromptBlock,
      hookDirectiveBlock: directive,
      requireHookClaimRefs: true,
      qualityMode: input.qualityMode,
      model: input.model,
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      title: result.data.title,
      narration: result.data.narration,
      hookClaimRefs: result.hookClaimRefs ?? [],
    };
  };
}
