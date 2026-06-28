import type { ScriptMode } from "@/types/footiebitz";

import {
  buildFifaWorldCup2026ContextRules,
  mentionsFifaWorldCup2026,
} from "@/features/research/utils/research-grounding.utils";

import type {
  GraphContext,
  GraphContextEntitySummary,
  GraphContextFact,
  GraphContextPrimaryEntity,
} from "./graph-context.types";

interface PromptBlock {
  title: string;
  lines: string[];
}

function block(title: string, lines: string[]): PromptBlock {
  return {
    title,
    lines: lines.filter((line) => line.trim().length > 0),
  };
}

function pushBlock(blocks: PromptBlock[], next: PromptBlock): void {
  if (next.lines.length === 0) {
    return;
  }
  blocks.push(next);
}

function formatModeLabel(mode: ScriptMode): string {
  return mode.replace(/_/g, " ");
}

function formatProvenanceLabel(source: GraphContext["provenance"]["source"]): string {
  return source.replace(/-/g, " ");
}

function formatFactLine(fact: GraphContextFact): string {
  return `- ${fact.text.trim()}`;
}

function formatPrimaryEntityLine(entity: GraphContextPrimaryEntity): string {
  const kind = entity.kind ? ` (${entity.kind})` : "";
  return `- ${entity.label}${kind}`;
}

function formatEntitySummaryLines(summary: GraphContextEntitySummary): string[] {
  const kind = summary.kind ? ` (${summary.kind})` : "";
  const lines = [`- ${summary.label}${kind}`];

  for (const line of summary.lines) {
    lines.push(`  - ${line.trim()}`);
  }

  return lines.filter((line) => line.trim().length > 0);
}

function splitManualNotes(facts: GraphContextFact[]): {
  manualNotes: GraphContextFact[];
  otherFacts: GraphContextFact[];
} {
  const manualNotes = facts.filter((fact) => fact.type === "manual_note");
  const otherFacts = facts.filter((fact) => fact.type !== "manual_note");
  return { manualNotes, otherFacts };
}

function partitionGroundingRules(rules: string[]): string[] {
  return rules
    .map((rule) => rule.trim())
    .filter(Boolean)
    .filter((rule) => !rule.startsWith("Grounding constraint:"));
}

function hasStructuredGraphResearch(context: GraphContext): boolean {
  const { otherFacts } = splitManualNotes(context.verifiedFacts);

  return (
    context.rankedFacts.length > 0 ||
    context.fixtureFacts.length > 0 ||
    context.statisticFacts.length > 0 ||
    context.timelineFacts.length > 0 ||
    otherFacts.length > 0
  );
}

function isSparseOpinionDebateContext(context: GraphContext): boolean {
  return context.selectedMode === "opinion_debate" && !hasStructuredGraphResearch(context);
}

function resolveGraphSummary(context: GraphContext): string {
  const { otherFacts } = splitManualNotes(context.verifiedFacts);
  const firstFact = otherFacts.find((fact) => fact.text.trim().length > 0);
  if (firstFact) {
    return firstFact.text.trim();
  }

  const fixture = context.fixtureFacts[0];
  if (fixture) {
    return fixture.text.trim();
  }

  return `Research brief: ${context.topic}`;
}

function buildMetadataBlock(context: GraphContext): PromptBlock {
  const lines = [
    `Mode: ${formatModeLabel(context.selectedMode)}`,
    `Topic: ${context.topic}`,
  ];

  if (isSparseOpinionDebateContext(context)) {
    lines.push(`Summary: ${resolveGraphSummary(context)}`);
  }

  lines.push(
    `Research source: ${formatProvenanceLabel(context.provenance.source)}`,
    `Research confidence: ${context.confidence.tier} (${context.confidence.percent}%)`,
  );

  return block("RESEARCHED FOOTBALL CONTEXT", lines);
}

function buildRankedFactsBlock(context: GraphContext): PromptBlock | null {
  if (context.rankedFacts.length === 0) {
    return null;
  }

  return block("RANKED FACTS:", [
    "- Exact order and values below must be preserved in the script.",
    ...context.rankedFacts.map(formatFactLine),
  ]);
}

function buildPrimaryEntityBlock(context: GraphContext): PromptBlock | null {
  if (context.entitySummaries.length > 0) {
    return block(
      "PRIMARY ENTITY:",
      context.entitySummaries.flatMap(formatEntitySummaryLines),
    );
  }

  if (context.primaryEntities.length === 0) {
    return null;
  }

  return block("PRIMARY ENTITY:", context.primaryEntities.map(formatPrimaryEntityLine));
}

function buildFixtureFactsBlock(context: GraphContext): PromptBlock | null {
  if (context.fixtureFacts.length === 0) {
    return null;
  }

  return block("FIXTURE:", context.fixtureFacts.map(formatFactLine));
}

function buildStatisticFactsBlock(context: GraphContext): PromptBlock | null {
  if (context.statisticFacts.length === 0) {
    return null;
  }

  return block("STATISTICS:", context.statisticFacts.map(formatFactLine));
}

function buildTimelineFactsBlock(context: GraphContext): PromptBlock | null {
  if (context.timelineFacts.length === 0) {
    return null;
  }

  return block("EVENTS:", context.timelineFacts.map(formatFactLine));
}

function buildVerifiedFactsBlock(facts: GraphContextFact[]): PromptBlock | null {
  if (facts.length === 0) {
    return null;
  }

  return block("VERIFIED FACTS:", facts.map(formatFactLine));
}

function buildGroundingRulesBlock(context: GraphContext): PromptBlock | null {
  if (isSparseOpinionDebateContext(context)) {
    return buildSparseOpinionGroundingBlock(context);
  }

  const rules = [...partitionGroundingRules(context.groundingRules)];

  if (rules.length === 0) {
    if (isRankedListContext(context)) {
      rules.push(
        "Use only the ranked entries and values in RANKED FACTS. Do not invent players, scores, or stats beyond this context.",
      );
    } else if (
      context.verifiedFacts.length > 0 ||
      context.fixtureFacts.length > 0 ||
      context.statisticFacts.length > 0 ||
      context.timelineFacts.length > 0 ||
      context.primaryEntities.length > 0 ||
      context.entitySummaries.length > 0
    ) {
      rules.push(
        "Use only the verified facts below. Do not invent exact scores, stats, dates, or records beyond this context.",
      );
    }
  }

  if (mentionsFifaWorldCup2026(context.topic)) {
    const hasVerifiedPlayer =
      context.primaryEntities.some((entity) => entity.kind === "player") ||
      context.entitySummaries.some((summary) => summary.kind === "player");

    for (const rule of buildFifaWorldCup2026ContextRules(hasVerifiedPlayer)) {
      rules.push(rule.replace(/^-\s*/, ""));
    }
  }

  if (rules.length === 0) {
    return null;
  }

  return block("Grounding rules:", [...new Set(rules)].map((rule) => `- ${rule}`));
}

function buildSparseOpinionGroundingBlock(context: GraphContext): PromptBlock {
  const partitioned = partitionGroundingRules(context.groundingRules);
  const lines: string[] =
    partitioned.length > 0
      ? [...new Set(partitioned)]
      : [
          "Use only the verified facts below. Do not invent exact scores, stats, dates, or records beyond this context.",
        ];

  if (mentionsFifaWorldCup2026(context.topic)) {
    const hasVerifiedPlayer =
      context.primaryEntities.some((entity) => entity.kind === "player") ||
      context.entitySummaries.some((summary) => summary.kind === "player");

    lines.push(...buildFifaWorldCup2026ContextRules(hasVerifiedPlayer));
  }

  return block("Grounding rules:", lines);
}

function buildManualNotesBlock(notes: GraphContextFact[]): PromptBlock | null {
  if (notes.length === 0) {
    return null;
  }

  return block(
    "CREATOR NOTES (manual — not provider-verified):",
    notes.map(formatFactLine),
  );
}

function buildWarningsBlock(context: GraphContext): PromptBlock | null {
  const uniqueWarnings = [...new Set(context.warnings.map((warning) => warning.trim()))].filter(
    Boolean,
  );

  if (uniqueWarnings.length === 0) {
    return null;
  }

  return block(
    "Warnings (grounding constraints):",
    uniqueWarnings.map((warning) => `- ${warning}`),
  );
}

function isRankedListContext(context: GraphContext): boolean {
  return context.selectedMode === "top_5" || context.rankedFacts.length > 0;
}

function appendRankedListBlocks(blocks: PromptBlock[], context: GraphContext): void {
  const ranked = buildRankedFactsBlock(context);
  if (ranked) {
    pushBlock(blocks, ranked);
  }

  const { otherFacts } = splitManualNotes(context.verifiedFacts);
  const verified = buildVerifiedFactsBlock(otherFacts);
  if (verified) {
    pushBlock(blocks, verified);
  }
}

function appendPlayerAnalysisBlocks(blocks: PromptBlock[], context: GraphContext): void {
  const primary = buildPrimaryEntityBlock(context);
  if (primary) {
    pushBlock(blocks, primary);
  }

  const { otherFacts } = splitManualNotes(context.verifiedFacts);
  const verified = buildVerifiedFactsBlock(otherFacts);
  if (verified) {
    pushBlock(blocks, verified);
  }
}

function appendMatchBlocks(blocks: PromptBlock[], context: GraphContext): void {
  const fixture = buildFixtureFactsBlock(context);
  if (fixture) {
    pushBlock(blocks, fixture);
  }

  const statistics = buildStatisticFactsBlock(context);
  if (statistics) {
    pushBlock(blocks, statistics);
  }

  const events = buildTimelineFactsBlock(context);
  if (events) {
    pushBlock(blocks, events);
  }

  const { otherFacts } = splitManualNotes(context.verifiedFacts);
  const verified = buildVerifiedFactsBlock(otherFacts);
  if (verified) {
    pushBlock(blocks, verified);
  }
}

function appendDefaultBlocks(blocks: PromptBlock[], context: GraphContext): void {
  if (context.rankedFacts.length > 0) {
    pushBlock(blocks, buildRankedFactsBlock(context)!);
  }

  if (context.fixtureFacts.length > 0) {
    pushBlock(blocks, buildFixtureFactsBlock(context)!);
  }

  if (context.statisticFacts.length > 0) {
    pushBlock(blocks, buildStatisticFactsBlock(context)!);
  }

  if (context.timelineFacts.length > 0) {
    pushBlock(blocks, buildTimelineFactsBlock(context)!);
  }

  if (context.primaryEntities.length > 0 || context.entitySummaries.length > 0) {
    pushBlock(blocks, buildPrimaryEntityBlock(context)!);
  }

  const { otherFacts } = splitManualNotes(context.verifiedFacts);
  const verified = buildVerifiedFactsBlock(otherFacts);
  if (verified) {
    pushBlock(blocks, verified);
  }
}

/** Sparse opinion_debate: metadata + grounding only — matches assembled default blocks. */
function appendOpinionDebateBlocks(blocks: PromptBlock[], context: GraphContext): void {
  if (!hasStructuredGraphResearch(context)) {
    return;
  }

  appendDefaultBlocks(blocks, context);
}

function appendModeBlocks(blocks: PromptBlock[], context: GraphContext): void {
  switch (context.selectedMode) {
    case "top_5":
      appendRankedListBlocks(blocks, context);
      break;
    case "player_analysis":
      appendPlayerAnalysisBlocks(blocks, context);
      break;
    case "match_preview":
    case "match_recap":
    case "tactical_review":
      appendMatchBlocks(blocks, context);
      break;
    case "historical_explainer":
      if (isRankedListContext(context)) {
        appendRankedListBlocks(blocks, context);
      } else {
        appendDefaultBlocks(blocks, context);
      }
      break;
    case "opinion_debate":
      appendOpinionDebateBlocks(blocks, context);
      break;
    default:
      appendDefaultBlocks(blocks, context);
      break;
  }
}

function renderPromptBlocks(blocks: PromptBlock[]): string {
  const lines: string[] = [];

  for (const [index, promptBlock] of blocks.entries()) {
    if (index > 0) {
      lines.push("");
    }
    lines.push(promptBlock.title);
    lines.push(...promptBlock.lines);
  }

  return lines.join("\n").trim();
}

/**
 * Converts graph-aware research context into prompt-ready text.
 * Fallback script prompt source when Prompt Intelligence is unavailable.
 */
export function graphContextToPromptText(context: GraphContext): string {
  const blocks: PromptBlock[] = [];
  const sparseOpinion = isSparseOpinionDebateContext(context);

  pushBlock(blocks, buildMetadataBlock(context));

  if (sparseOpinion) {
    pushBlock(blocks, buildGroundingRulesBlock(context)!);
  } else {
    appendModeBlocks(blocks, context);

    const grounding = buildGroundingRulesBlock(context);
    if (grounding) {
      pushBlock(blocks, grounding);
    }
  }

  const { manualNotes } = splitManualNotes(context.verifiedFacts);
  const manual = buildManualNotesBlock(manualNotes);
  if (manual) {
    pushBlock(blocks, manual);
  }

  const warnings = buildWarningsBlock(context);
  if (warnings) {
    pushBlock(blocks, warnings);
  }

  return renderPromptBlocks(blocks);
}
