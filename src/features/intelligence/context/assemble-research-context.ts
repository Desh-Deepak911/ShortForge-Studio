import type { FootballResearchContext } from "@/features/research/types/football-research.types";
import { applyFifaWorldCup2026Grounding } from "@/features/research/legacy/research-grounding.legacy.utils";
import {
  hasRankedPlayerResearch,
  isResearchContextTextUseful,
  shouldPassResearchContextToScript,
} from "@/features/research/utils/research-context-pass.utils";
import type { RankingIntent } from "@/features/research/types/ranking-intent.types";
import { hasRankedPlayerDataInContextText } from "@/lib/ai/top5-script-prompt.utils";

import type { IntelligenceAnalysis } from "../shared/intelligence-analysis.types";

import type { AssembledContext } from "./assembled-context.types";
import {
  assembleContextFromBundle,
  hasUsableStructuredPayload,
} from "./assemble-context";
import { assembledContextToPrompt } from "./assembled-context-to-prompt";
import { canonicalResearchBundleToFootballContext } from "./canonical-research-bundle.adapter";
import type { CanonicalResearchBundle } from "./canonical-research.types";

export interface AssembleResearchContextInput {
  bundle: CanonicalResearchBundle;
  rankingIntent?: RankingIntent;
  intelligenceAnalysis?: IntelligenceAnalysis;
}

export interface AssembledResearchContext {
  assembled: AssembledContext;
  body: string;
  researchApplied: boolean;
  top5RankedDataAvailable: boolean;
  /** @deprecated Legacy FootballResearchContext — migration adapter output only. */
  context: FootballResearchContext;
}

/**
 * @deprecated Legacy adapter — prefer `assembleContextFromBundle` + `assembledContextToPrompt`.
 * @deprecated test/legacy only — do not use in production path.
 *
 * Legacy `FootballResearchContext` is derived for display only — never replaces
 * canonical `AssembledContext` on hot paths.
 */
export function assembleResearchContextFromBundle(
  input: AssembleResearchContextInput,
): AssembledResearchContext {
  const { bundle } = input;
  const analysis = input.intelligenceAnalysis ?? bundle.intelligenceAnalysis;
  const assembled = assembleContextFromBundle(bundle);
  const context = applyFifaWorldCup2026Grounding(
    canonicalResearchBundleToFootballContext(bundle, {
      rankingIntent: input.rankingIntent,
      intelligenceAnalysis: analysis,
    }),
  );
  const body = assembledContextToPrompt(assembled);
  const researchApplied =
    hasUsableStructuredPayload(bundle) &&
    shouldPassResearchContextToScript(context) &&
    isResearchContextTextUseful(body);
  const top5RankedDataAvailable =
    assembled.selectedMode === "top_5" &&
    researchApplied &&
    (hasRankedPlayerResearch(context) ||
      assembled.rankings.some((ranking) => ranking.entries.length > 0) ||
      hasRankedPlayerDataInContextText(body));

  return {
    assembled,
    body,
    researchApplied,
    top5RankedDataAvailable,
    context: {
      ...context,
      warnings: assembled.warnings,
    },
  };
}
