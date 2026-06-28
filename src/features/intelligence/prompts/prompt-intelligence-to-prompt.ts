import {
  buildFifaWorldCup2026ContextRules,
  mentionsFifaWorldCup2026,
} from "@/features/research/utils/research-grounding.utils";

import type { GraphContext, GraphContextFact } from "../context/graph-context.types";
import { graphContextToPromptText } from "../context/graph-context-to-prompt";

import {
  hasStructuredGraphResearch,
  resolvePromptCompressionLevel,
  resolveSparseGraphSummary,
  type PromptCompressionLevel,
} from "./graph-context-sparse.utils";
import type { PromptIntelligenceResult } from "./prompt-intelligence.types";

export interface PromptIntelligenceToPromptTextInput {
  result: PromptIntelligenceResult;
  graphContext: GraphContext;
}

function formatModeLabel(mode: GraphContext["selectedMode"]): string {
  return mode.replace(/_/g, " ");
}

function pushBlock(lines: string[], block: string[]): void {
  const filtered = block.map((line) => line.trim()).filter(Boolean);
  if (filtered.length === 0) {
    return;
  }

  if (lines.length > 0) {
    lines.push("");
  }

  lines.push(...filtered);
}

function collectSelectedFacts(
  graphContext: GraphContext,
  result: PromptIntelligenceResult,
): GraphContextFact[] {
  const selectedIds = new Set([
    ...result.factUsagePlan.requiredFactIds,
    ...result.factUsagePlan.optionalFactIds,
  ]);
  const facts: GraphContextFact[] = [];

  for (const collection of [
    graphContext.rankedFacts,
    graphContext.verifiedFacts,
    graphContext.statisticFacts,
    graphContext.timelineFacts,
    graphContext.fixtureFacts,
  ]) {
    for (const fact of collection) {
      if (fact.type === "manual_note") {
        continue;
      }

      if (selectedIds.size === 0 || selectedIds.has(fact.id)) {
        facts.push(fact);
      }
    }
  }

  return facts;
}

function formatProvenanceLabel(source: GraphContext["provenance"]["source"]): string {
  return source.replace(/-/g, " ");
}

function partitionGroundingRules(rules: string[]): string[] {
  return rules
    .map((rule) => rule.trim())
    .filter(Boolean)
    .filter((rule) => !rule.startsWith("Grounding constraint:"));
}

function buildMetadataBlock(
  result: PromptIntelligenceResult,
  graphContext: GraphContext,
  compression: PromptCompressionLevel,
): string[] {
  const lines = [
    "RESEARCHED FOOTBALL CONTEXT",
    `Mode: ${formatModeLabel(result.selectedMode)}`,
    `Topic: ${graphContext.topic}`,
  ];

  if (compression === "opinion-sparse" && !hasStructuredGraphResearch(graphContext)) {
    lines.push(`Summary: ${resolveSparseGraphSummary(graphContext)}`);
  }

  lines.push(
    `Research source: ${formatProvenanceLabel(graphContext.provenance.source)}`,
    `Research confidence: ${result.confidence.tier} (${result.confidence.percent}%)`,
  );

  return lines;
}

function buildLengthBudgetBlock(result: PromptIntelligenceResult): string[] {
  const totalRule = result.lengthRules.find((rule) => rule.id === "total-budget");
  if (!totalRule) {
    return [];
  }

  const lines = [
    "LENGTH BUDGET",
    `- Target narration: ~${totalRule.targetWordCount} words (${totalRule.minWordCount}-${totalRule.maxWordCount} acceptable).`,
    totalRule.guidance,
  ];

  const beatRules = result.lengthRules.filter((rule) => rule.id.startsWith("beat-"));
  if (beatRules.length > 0) {
    lines.push("- Beat targets:");
    for (const rule of beatRules) {
      lines.push(`  - ${rule.label}: ~${rule.targetWordCount ?? "?"} words`);
    }
  }

  return lines;
}

function buildStyleBlock(result: PromptIntelligenceResult): string[] {
  if (result.styleRules.length === 0) {
    return [];
  }

  return ["STYLE", ...result.styleRules.map((rule) => `- ${rule.text}`)];
}

function buildGraphAlignedGroundingBlock(context: GraphContext): string[] {
  const lines = [...new Set(partitionGroundingRules(context.groundingRules))];

  if (lines.length === 0) {
    lines.push(
      "Use only the verified facts below. Do not invent exact scores, stats, dates, or records beyond this context.",
    );
  }

  if (mentionsFifaWorldCup2026(context.topic)) {
    const hasVerifiedPlayer =
      context.primaryEntities.some((entity) => entity.kind === "player") ||
      context.entitySummaries.some((summary) => summary.kind === "player");

    lines.push(...buildFifaWorldCup2026ContextRules(hasVerifiedPlayer));
  }

  return ["Grounding rules:", ...lines.map((line) => (line.startsWith("- ") ? line : `- ${line}`))];
}

function buildGraphAlignedWarningsBlock(context: GraphContext): string[] {
  const warnings = [...new Set(context.warnings.map((warning) => warning.trim()))].filter(Boolean);

  if (warnings.length === 0) {
    return [];
  }

  return [
    "Warnings (grounding constraints):",
    ...warnings.map((warning) => `- ${warning}`),
  ];
}

function buildNarrativePlanBlock(result: PromptIntelligenceResult): string[] {
  const { narrativePlan } = result;

  return [
    "NARRATIVE PLAN",
    `Structure: ${narrativePlan.structure.replace(/_/g, " ")}`,
    ...narrativePlan.beats.map(
      (beat) =>
        `- ${beat.label} (~${beat.targetWordCount} words, ${beat.tone}): ${beat.purpose}`,
    ),
  ];
}

function buildRankedFactsBlock(
  result: PromptIntelligenceResult,
  graphContext: GraphContext,
): string[] {
  if (result.narrativePlan.structure !== "ranked_countdown") {
    return [];
  }

  const selectedIds = new Set([
    ...result.factUsagePlan.requiredFactIds,
    ...result.factUsagePlan.optionalFactIds,
  ]);

  const rankedFacts = [...graphContext.rankedFacts]
    .filter((fact) => selectedIds.size === 0 || selectedIds.has(fact.id))
    .sort((left, right) => (right.rank ?? 0) - (left.rank ?? 0));

  if (rankedFacts.length === 0) {
    return [];
  }

  return [
    "RANKED FACTS (exact order — preserve countdown from highest rank number to #1)",
    "- Do not reorder, skip, or alter ranked entries or values.",
    ...rankedFacts.map((fact) => `- ${fact.text.trim()}`),
  ];
}

function buildSupportingFactsBlock(
  result: PromptIntelligenceResult,
  graphContext: GraphContext,
  excludedFactIds: Set<string>,
): string[] {
  const selectedFacts = collectSelectedFacts(graphContext, result).filter(
    (fact) => !excludedFactIds.has(fact.id),
  );

  const seenText = new Set<string>();
  const lines: string[] = [];

  for (const fact of selectedFacts) {
    const text = fact.text.trim();
    if (!text || seenText.has(text)) {
      continue;
    }

    seenText.add(text);
    lines.push(`- ${text}`);
  }

  if (lines.length === 0) {
    return [];
  }

  return ["SUPPORTING FACTS", ...lines];
}

function buildPrimaryEntityBlock(graphContext: GraphContext): string[] {
  const lines: string[] = [];

  for (const summary of graphContext.entitySummaries) {
    const kind = summary.kind ? ` (${summary.kind})` : "";
    lines.push(`- ${summary.label}${kind}`);
    for (const line of summary.lines.slice(0, 2)) {
      lines.push(`  - ${line.trim()}`);
    }
  }

  for (const entity of graphContext.primaryEntities) {
    const kind = entity.kind ? ` (${entity.kind})` : "";
    lines.push(`- ${entity.label}${kind}`);
  }

  if (lines.length === 0) {
    return [];
  }

  return ["PRIMARY ENTITY:", ...lines];
}

function buildManualNotesBlock(graphContext: GraphContext): string[] {
  const manualNotes = graphContext.verifiedFacts
    .filter((fact) => fact.type === "manual_note")
    .map((fact) => fact.text.trim())
    .filter(Boolean);

  if (manualNotes.length === 0) {
    return [];
  }

  return [
    "CREATOR NOTES (manual — not provider-verified)",
    ...manualNotes.map((note) => `- ${note}`),
  ];
}

function buildForbiddenClaimsBlock(result: PromptIntelligenceResult): string[] {
  const claims = [...new Set(result.narrativePlan.forbiddenClaims.map((claim) => claim.trim()))].filter(
    Boolean,
  );

  if (claims.length === 0) {
    return [];
  }

  return ["FORBIDDEN CLAIMS", ...claims.map((claim) => `- ${claim}`)];
}

function renderCompressedPrompt(
  result: PromptIntelligenceResult,
  context: GraphContext,
  compression: Exclude<PromptCompressionLevel, "full">,
): string {
  const lines: string[] = [];

  pushBlock(lines, buildMetadataBlock(result, context, compression));

  if (compression === "compact" && context.selectedMode === "player_analysis") {
    pushBlock(lines, buildPrimaryEntityBlock(context));
  }

  pushBlock(lines, buildGraphAlignedGroundingBlock(context));
  pushBlock(lines, buildManualNotesBlock(context));
  pushBlock(lines, buildGraphAlignedWarningsBlock(context));

  return lines.join("\n").trim();
}

function buildGroundingBlock(result: PromptIntelligenceResult): string[] {
  const rules = result.groundingRules
    .map((rule) => rule.text.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (rules.length === 0) {
    return ["GROUNDING", "- Use only verified facts below. Do not invent unsupported details."];
  }

  return ["GROUNDING", ...rules.map((rule) => (rule.startsWith("- ") ? rule : `- ${rule}`))];
}

function buildWarningsBlock(result: PromptIntelligenceResult): string[] {
  const warnings = [...new Set(result.warnings.map((warning) => warning.trim()))].filter(Boolean);

  if (warnings.length === 0) {
    return [];
  }

  return ["WARNINGS", ...warnings.map((warning) => `- ${warning}`)];
}

/**
 * Renders Prompt Intelligence into compact LLM-ready research context text.
 * Primary production script prompt source (via resolveResearchPromptText).
 */
export function promptIntelligenceToPromptText(
  input: PromptIntelligenceToPromptTextInput,
): string;
export function promptIntelligenceToPromptText(
  result: PromptIntelligenceResult,
  graphContext: GraphContext,
): string;
export function promptIntelligenceToPromptText(
  inputOrResult: PromptIntelligenceToPromptTextInput | PromptIntelligenceResult,
  graphContext?: GraphContext,
): string {
  const result =
    graphContext != null
      ? (inputOrResult as PromptIntelligenceResult)
      : (inputOrResult as PromptIntelligenceToPromptTextInput).result;
  const context =
    graphContext ??
    (inputOrResult as PromptIntelligenceToPromptTextInput).graphContext;

  const compression = resolvePromptCompressionLevel(context);

  if (compression === "opinion-sparse") {
    return graphContextToPromptText(context);
  }

  if (compression === "compact") {
    return renderCompressedPrompt(result, context, compression);
  }

  const lines: string[] = [];

  pushBlock(lines, buildMetadataBlock(result, context, compression));
  pushBlock(lines, buildLengthBudgetBlock(result));
  pushBlock(lines, buildStyleBlock(result));
  pushBlock(lines, buildNarrativePlanBlock(result));

  const rankedBlock = buildRankedFactsBlock(result, context);
  const rankedFactIds = new Set(context.rankedFacts.map((fact) => fact.id));

  pushBlock(lines, rankedBlock);

  if (result.selectedMode === "player_analysis") {
    pushBlock(lines, buildPrimaryEntityBlock(context));
  }

  pushBlock(lines, buildSupportingFactsBlock(result, context, rankedFactIds));
  pushBlock(lines, buildManualNotesBlock(context));
  pushBlock(lines, buildForbiddenClaimsBlock(result));
  pushBlock(lines, buildGroundingBlock(result));
  pushBlock(lines, buildWarningsBlock(result));

  return lines.join("\n").trim();
}
