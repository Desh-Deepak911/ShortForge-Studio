import type { GraphContext } from "../context/graph-context.types";

/** Whether GraphContext includes provider-verified structured research facts. */
export function hasStructuredGraphResearch(context: GraphContext): boolean {
  const verifiedWithoutManual = context.verifiedFacts.filter(
    (fact) => fact.type !== "manual_note",
  );

  return (
    context.rankedFacts.length > 0 ||
    context.fixtureFacts.length > 0 ||
    context.statisticFacts.length > 0 ||
    context.timelineFacts.length > 0 ||
    verifiedWithoutManual.length > 0
  );
}

/** Matches graph sparse opinion_debate path — metadata + grounding + warnings only. */
export function isSparseOpinionGraphContext(context: GraphContext): boolean {
  return context.selectedMode === "opinion_debate" && !hasStructuredGraphResearch(context);
}

/** Diagnostics flag — warnings-only grounding with no structured provider facts. */
export function isSparseGraphContext(context: GraphContext): boolean {
  if (isSparseOpinionGraphContext(context)) {
    return true;
  }

  return !hasStructuredGraphResearch(context) && context.warnings.length > 0;
}

export type PromptCompressionLevel = "full" | "compact" | "opinion-sparse";

export function resolvePromptCompressionLevel(context: GraphContext): PromptCompressionLevel {
  if (isSparseOpinionGraphContext(context)) {
    return "opinion-sparse";
  }

  if (!hasStructuredGraphResearch(context) && context.warnings.length > 0) {
    return "compact";
  }

  return "full";
}

export function resolveSparseGraphSummary(context: GraphContext): string {
  const verifiedWithoutManual = context.verifiedFacts.filter(
    (fact) => fact.type !== "manual_note",
  );
  const firstFact = verifiedWithoutManual.find((fact) => fact.text.trim().length > 0);
  if (firstFact) {
    return firstFact.text.trim();
  }

  const fixture = context.fixtureFacts[0];
  if (fixture) {
    return fixture.text.trim();
  }

  return `Research brief: ${context.topic}`;
}
