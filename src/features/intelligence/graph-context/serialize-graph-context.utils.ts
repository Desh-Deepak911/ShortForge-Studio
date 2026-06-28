import type { GraphContext } from "../context/graph-context.types";

/** Compact dev/diagnostics snapshot for GraphContext. */
export interface GraphContextDevSnapshot {
  queryId: string;
  topic: string;
  selectedMode: GraphContext["selectedMode"];
  sectionCount: number;
  primaryEntityCount: number;
  verifiedFactCount: number;
  rankedFactCount: number;
  timelineFactCount: number;
  statisticFactCount: number;
  fixtureFactCount: number;
  entitySummaryCount: number;
  relationshipSummaryCount: number;
  groundingRuleCount: number;
  warningCount: number;
  confidence: GraphContext["confidence"];
  provenance: GraphContext["provenance"];
  primaryEntities: GraphContext["primaryEntities"];
  groundingRules: string[];
  topRankedFacts: GraphContext["rankedFacts"];
  topVerifiedFacts: GraphContext["verifiedFacts"];
  topEntitySummaries: Array<{
    nodeId: string;
    label: string;
    lineCount: number;
    lines: string[];
  }>;
}

function countGraphContextSections(context: GraphContext): number {
  let count = 0;
  if (context.primaryEntities.length > 0) count += 1;
  if (context.rankedFacts.length > 0) count += 1;
  if (context.verifiedFacts.length > 0) count += 1;
  if (context.timelineFacts.length > 0) count += 1;
  if (context.statisticFacts.length > 0) count += 1;
  if (context.fixtureFacts.length > 0) count += 1;
  if (context.entitySummaries.length > 0) count += 1;
  if (context.relationshipSummaries.length > 0) count += 1;
  if (context.groundingRules.length > 0) count += 1;
  if (context.warnings.length > 0) count += 1;
  return count;
}

export function serializeGraphContextForDev(context: GraphContext): GraphContextDevSnapshot {
  return {
    queryId: context.queryId,
    topic: context.topic,
    selectedMode: context.selectedMode,
    sectionCount: countGraphContextSections(context),
    primaryEntityCount: context.primaryEntities.length,
    verifiedFactCount: context.verifiedFacts.length,
    rankedFactCount: context.rankedFacts.length,
    timelineFactCount: context.timelineFacts.length,
    statisticFactCount: context.statisticFacts.length,
    fixtureFactCount: context.fixtureFacts.length,
    entitySummaryCount: context.entitySummaries.length,
    relationshipSummaryCount: context.relationshipSummaries.length,
    groundingRuleCount: context.groundingRules.length,
    warningCount: context.warnings.length,
    confidence: context.confidence,
    provenance: context.provenance,
    primaryEntities: context.primaryEntities.slice(0, 8),
    groundingRules: context.groundingRules.slice(0, 12),
    topRankedFacts: context.rankedFacts.slice(0, 10),
    topVerifiedFacts: context.verifiedFacts.slice(0, 8),
    topEntitySummaries: context.entitySummaries.slice(0, 6).map((summary) => ({
      nodeId: summary.nodeId,
      label: summary.label,
      lineCount: summary.lines.length,
      lines: summary.lines.slice(0, 4),
    })),
  };
}
