import type { ScriptMode } from "@/types/footiebitz";

import type { AssembledContext } from "../context/assembled-context.types";
import type {
  GraphContext,
  GraphContextEntitySummary,
  GraphContextFact,
  GraphContextPrimaryEntity,
  GraphContextRelationshipSummary,
} from "../context/graph-context.types";
import type { KnowledgeEdge } from "../knowledge/knowledge-edge.types";
import type { KnowledgeFact } from "../knowledge/knowledge-fact.types";
import type { KnowledgeGraph } from "../knowledge/knowledge-graph.types";
import type { KnowledgeNode } from "../knowledge/knowledge-node.types";
import type { IntelligenceEntity } from "../shared/entity.types";

const ENTITY_NODE_TYPES = new Set([
  "entity",
  "player",
  "club",
  "national_team",
  "competition",
  "team",
]);

interface ModeFactFocus {
  rankedFacts: boolean;
  verifiedFacts: boolean;
  timelineFacts: boolean;
  statisticFacts: boolean;
  fixtureFacts: boolean;
}

const MODE_FACT_FOCUS: Record<ScriptMode, ModeFactFocus> = {
  top_5: {
    rankedFacts: true,
    verifiedFacts: true,
    timelineFacts: false,
    statisticFacts: false,
    fixtureFacts: false,
  },
  player_analysis: {
    rankedFacts: false,
    verifiedFacts: true,
    timelineFacts: false,
    statisticFacts: true,
    fixtureFacts: false,
  },
  match_preview: {
    rankedFacts: false,
    verifiedFacts: true,
    timelineFacts: false,
    statisticFacts: true,
    fixtureFacts: true,
  },
  match_recap: {
    rankedFacts: false,
    verifiedFacts: true,
    timelineFacts: true,
    statisticFacts: true,
    fixtureFacts: true,
  },
  tactical_review: {
    rankedFacts: false,
    verifiedFacts: true,
    timelineFacts: true,
    statisticFacts: true,
    fixtureFacts: true,
  },
  story: {
    rankedFacts: true,
    verifiedFacts: true,
    timelineFacts: true,
    statisticFacts: true,
    fixtureFacts: true,
  },
  historical_explainer: {
    rankedFacts: true,
    verifiedFacts: true,
    timelineFacts: true,
    statisticFacts: false,
    fixtureFacts: false,
  },
  opinion_debate: {
    rankedFacts: false,
    verifiedFacts: true,
    timelineFacts: false,
    statisticFacts: false,
    fixtureFacts: false,
  },
};

function nodeMap(nodes: KnowledgeNode[]): Map<string, KnowledgeNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

function factsForNode(facts: KnowledgeFact[], nodeId: string): KnowledgeFact[] {
  return facts.filter(
    (fact) => fact.subjectNodeId === nodeId || fact.objectNodeId === nodeId,
  );
}

function relatedNodeIds(edges: KnowledgeEdge[], nodeId: string): string[] {
  const ids = new Set<string>();
  for (const edge of edges) {
    if (edge.sourceNodeId === nodeId) {
      ids.add(edge.targetNodeId);
    }
    if (edge.targetNodeId === nodeId) {
      ids.add(edge.sourceNodeId);
    }
  }
  return [...ids];
}

function parseRankFromFact(fact: KnowledgeFact): number | undefined {
  const match = fact.text.match(/^#(\d+)/);
  return match ? Number(match[1]) : undefined;
}

function mapGraphContextFact(fact: KnowledgeFact): GraphContextFact {
  const rank = parseRankFromFact(fact);
  const occurredAt =
    fact.type === "event" && typeof fact.value === "string" ? fact.value : undefined;

  return {
    id: fact.id,
    text: fact.text,
    type: fact.type,
    ...(fact.subjectNodeId ? { subjectNodeId: fact.subjectNodeId } : {}),
    ...(fact.objectNodeId ? { objectNodeId: fact.objectNodeId } : {}),
    value: fact.value,
    ...(fact.unit ? { unit: fact.unit } : {}),
    ...(rank != null ? { rank } : {}),
    ...(occurredAt ? { occurredAt } : {}),
    confidence: fact.confidence,
    provenance: fact.provenance,
  };
}

function sortByConfidenceDesc(facts: GraphContextFact[]): GraphContextFact[] {
  return [...facts].sort((left, right) => right.confidence.percent - left.confidence.percent);
}

function sortRankedFacts(facts: GraphContextFact[]): GraphContextFact[] {
  return [...facts].sort((left, right) => {
    const leftRank = left.rank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.rank ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return right.confidence.percent - left.confidence.percent;
  });
}

function entityConfidencePercent(entity: IntelligenceEntity): number {
  return entity.confidencePercent ?? 0;
}

function buildPrimaryEntities(
  assembled: AssembledContext,
  graph: KnowledgeGraph,
): GraphContextPrimaryEntity[] {
  if (assembled.entities.length > 0) {
    return [...assembled.entities]
      .sort((left, right) => entityConfidencePercent(right) - entityConfidencePercent(left))
      .map((entity) => ({
        nodeId: entity.id,
        label: entity.label,
        kind: entity.kind,
        entityId: entity.id,
        ...(entity.externalId != null ? { externalId: entity.externalId } : {}),
      }));
  }

  const queryNode = graph.nodes.find((node) => node.type === "query");
  const mentionedNodeIds = new Set(
    queryNode
      ? graph.edges
          .filter(
            (edge) =>
              edge.sourceNodeId === queryNode.id &&
              (edge.type === "mentions_entity" || edge.type === "identifies_entity"),
          )
          .map((edge) => edge.targetNodeId)
      : [],
  );

  return graph.nodes
    .filter(
      (node) =>
        ENTITY_NODE_TYPES.has(node.type) &&
        (mentionedNodeIds.size === 0 || mentionedNodeIds.has(node.id)),
    )
    .sort((left, right) => right.confidence.percent - left.confidence.percent)
    .map((node) => ({
      nodeId: node.id,
      label: node.label,
      ...(node.entityRef?.kind ? { kind: node.entityRef.kind } : {}),
      ...(node.entityRef?.entityId ? { entityId: node.entityRef.entityId } : {}),
      ...(node.entityRef?.externalId != null
        ? { externalId: node.entityRef.externalId }
        : {}),
    }));
}

function buildEntitySummaries(
  graph: KnowledgeGraph,
  primaryEntityIds: Set<string>,
): GraphContextEntitySummary[] {
  return graph.nodes
    .filter(
      (node) =>
        ENTITY_NODE_TYPES.has(node.type) &&
        (primaryEntityIds.size === 0 || primaryEntityIds.has(node.id)),
    )
    .map((node) => {
      const nodeFacts = sortByConfidenceDesc(
        factsForNode(graph.facts, node.id).map(mapGraphContextFact),
      );
      return {
        nodeId: node.id,
        label: node.label,
        ...(node.entityRef?.kind ? { kind: node.entityRef.kind } : {}),
        factIds: nodeFacts.map((fact) => fact.id),
        relatedNodeIds: relatedNodeIds(graph.edges, node.id),
        lines: nodeFacts.map((fact) => fact.text),
      };
    })
    .filter(
      (summary) =>
        summary.lines.length > 0 ||
        summary.relatedNodeIds.length > 0 ||
        summary.kind != null,
    )
    .sort((left, right) => right.lines.length - left.lines.length);
}

function buildRelationshipSummaries(
  graph: KnowledgeGraph,
  nodesById: Map<string, KnowledgeNode>,
  primaryEntityIds: Set<string>,
): GraphContextRelationshipSummary[] {
  return graph.edges
    .filter((edge) => {
      if (primaryEntityIds.size === 0) {
        return true;
      }
      return (
        primaryEntityIds.has(edge.sourceNodeId) || primaryEntityIds.has(edge.targetNodeId)
      );
    })
    .map((edge) => ({
      edgeId: edge.id,
      type: edge.type,
      label: edge.label,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      sourceLabel: nodesById.get(edge.sourceNodeId)?.label ?? edge.sourceNodeId,
      targetLabel: nodesById.get(edge.targetNodeId)?.label ?? edge.targetNodeId,
    }));
}

function buildManualNoteFacts(
  graph: KnowledgeGraph,
  assembled: AssembledContext,
): GraphContextFact[] {
  const fromGraph = graph.facts
    .filter((fact) => fact.type === "manual_note")
    .map(mapGraphContextFact);

  if (fromGraph.length > 0) {
    return fromGraph;
  }

  const manualNotes = assembled.manualNotes?.trim();
  if (!manualNotes) {
    return [];
  }

  return [
    {
      id: `manual-note:${assembled.queryId}`,
      text: manualNotes,
      type: "manual_note",
      confidence: graph.confidence,
      provenance: {
        source: "user",
        fetchedAt: graph.provenance.fetchedAt,
      },
    },
  ];
}

function buildGroundingRules(graph: KnowledgeGraph, assembled: AssembledContext): string[] {
  const rules = graph.facts
    .filter((fact) => fact.type === "grounding_rule")
    .map((fact) => fact.text.trim())
    .filter(Boolean);

  for (const section of assembled.promptSections) {
    if (section.kind === "grounding_rules") {
      rules.push(...section.lines.filter(Boolean));
    }
  }

  const warningConstraints = [
    ...new Set([...graph.warnings, ...assembled.warnings].map((warning) => warning.trim())),
  ]
    .filter(Boolean)
    .map((warning) => `Grounding constraint: ${warning}`);

  return [...new Set([...rules, ...warningConstraints])];
}

function categorizeFacts(
  graph: KnowledgeGraph,
  nodesById: Map<string, KnowledgeNode>,
  manualNoteFacts: GraphContextFact[],
): Pick<
  GraphContext,
  "verifiedFacts" | "rankedFacts" | "timelineFacts" | "statisticFacts" | "fixtureFacts"
> {
  const fixtureNodeIds = new Set(
    graph.nodes.filter((node) => node.type === "fixture").map((node) => node.id),
  );

  const mapped = graph.facts
    .filter((fact) => fact.type !== "warning" && fact.type !== "grounding_rule")
    .map(mapGraphContextFact);

  const rankedFacts = sortRankedFacts(mapped.filter((fact) => fact.type === "ranking_value"));
  const timelineFacts = sortByConfidenceDesc(mapped.filter((fact) => fact.type === "event"));
  const statisticFacts = sortByConfidenceDesc(mapped.filter((fact) => fact.type === "statistic"));
  const fixtureFacts = sortByConfidenceDesc(
    mapped.filter(
      (fact) =>
        (fact.subjectNodeId != null && fixtureNodeIds.has(fact.subjectNodeId)) ||
        (fact.type === "reference" &&
          fact.subjectNodeId != null &&
          nodesById.get(fact.subjectNodeId)?.type === "fixture"),
    ),
  );
  const fixtureFactIds = new Set(fixtureFacts.map((fact) => fact.id));
  const verifiedFacts = sortByConfidenceDesc([
    ...mapped.filter(
      (fact) =>
        (fact.type === "reference" && !fixtureFactIds.has(fact.id)) ||
        fact.type === "profile_attribute",
    ),
    ...manualNoteFacts,
  ]);

  return {
    verifiedFacts,
    rankedFacts,
    timelineFacts,
    statisticFacts,
    fixtureFacts,
  };
}

function applyModeFactFocus(
  mode: ScriptMode,
  facts: Pick<
    GraphContext,
    "verifiedFacts" | "rankedFacts" | "timelineFacts" | "statisticFacts" | "fixtureFacts"
  >,
): Pick<
  GraphContext,
  "verifiedFacts" | "rankedFacts" | "timelineFacts" | "statisticFacts" | "fixtureFacts"
> {
  const focus = MODE_FACT_FOCUS[mode];

  return {
    rankedFacts: focus.rankedFacts ? facts.rankedFacts : [],
    verifiedFacts: [
      ...facts.verifiedFacts.filter((fact) => fact.type === "manual_note"),
      ...(focus.verifiedFacts
        ? facts.verifiedFacts.filter((fact) => fact.type !== "manual_note")
        : []),
    ],
    timelineFacts: focus.timelineFacts ? facts.timelineFacts : [],
    statisticFacts: focus.statisticFacts ? facts.statisticFacts : [],
    fixtureFacts: focus.fixtureFacts ? facts.fixtureFacts : [],
  };
}

/**
 * Builds graph-aware context from KnowledgeGraph + AssembledContext.
 *
 * Pure graph assembly — no providers, no OpenAI, no raw provider payloads.
 * Prompt generation does not consume this yet.
 */
export function buildGraphContext(
  knowledgeGraph: KnowledgeGraph,
  assembledContext: AssembledContext,
): GraphContext {
  const nodesById = nodeMap(knowledgeGraph.nodes);
  const primaryEntities = buildPrimaryEntities(assembledContext, knowledgeGraph);
  const primaryEntityIds = new Set(primaryEntities.map((entity) => entity.nodeId));
  const manualNoteFacts = buildManualNoteFacts(knowledgeGraph, assembledContext);
  const factGroups = applyModeFactFocus(
    assembledContext.selectedMode,
    categorizeFacts(knowledgeGraph, nodesById, manualNoteFacts),
  );
  const entitySummaries = buildEntitySummaries(knowledgeGraph, primaryEntityIds);
  const relationshipSummaries = buildRelationshipSummaries(
    knowledgeGraph,
    nodesById,
    primaryEntityIds,
  );
  const groundingRules = buildGroundingRules(knowledgeGraph, assembledContext);
  const warnings = [
    ...new Set([...knowledgeGraph.warnings, ...assembledContext.warnings].filter(Boolean)),
  ];

  return {
    queryId: assembledContext.queryId,
    topic: assembledContext.topic,
    selectedMode: assembledContext.selectedMode,
    primaryEntities,
    ...factGroups,
    entitySummaries,
    relationshipSummaries,
    groundingRules,
    warnings,
    confidence: assembledContext.confidence,
    provenance: assembledContext.provenance,
    diagnostics: {
      nodeCount: knowledgeGraph.nodes.length,
      edgeCount: knowledgeGraph.edges.length,
      factCount: knowledgeGraph.facts.length,
      verifiedFactCount: factGroups.verifiedFacts.length,
      rankedFactCount: factGroups.rankedFacts.length,
      timelineFactCount: factGroups.timelineFacts.length,
      statisticFactCount: factGroups.statisticFacts.length,
      fixtureFactCount: factGroups.fixtureFacts.length,
      entitySummaryCount: entitySummaries.length,
      relationshipSummaryCount: relationshipSummaries.length,
      providerDiagnostics: [...assembledContext.diagnostics],
    },
  };
}

/** @deprecated Use `buildGraphContext`. */
export const buildGraphContextFromKnowledgeGraph = buildGraphContext;

/** Returns undefined when GraphContext construction fails — script generation falls back to assembled. */
export function tryBuildGraphContext(
  knowledgeGraph: KnowledgeGraph,
  assembledContext: AssembledContext,
): GraphContext | undefined {
  try {
    return buildGraphContext(knowledgeGraph, assembledContext);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[GraphContext] construction failed — script generation will use assembled fallback",
        error,
      );
    }
    return undefined;
  }
}
