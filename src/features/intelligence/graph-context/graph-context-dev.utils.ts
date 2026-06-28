import type { AssembledContext } from "../context/assembled-context.types";
import {
  buildGraphContext,
  serializeGraphContextForDev,
  type GraphContextDevSnapshot,
} from "../graph-context";
import type { KnowledgeGraph } from "../knowledge/knowledge-graph.types";
import type { KnowledgeGraphDevSnapshot } from "../knowledge/serialize-knowledge-graph.utils";
import type { ConfidenceScore } from "../shared/confidence.types";

function confidenceFromPercent(percent: number): ConfidenceScore {
  return {
    tier: percent >= 80 ? "high" : percent >= 68 ? "medium" : "low",
    percent,
  };
}

/** Reconstructs a knowledge graph from a dev snapshot for graph-context derivation. */
export function knowledgeGraphFromDevSnapshot(
  snapshot: KnowledgeGraphDevSnapshot,
): KnowledgeGraph {
  return {
    queryId: snapshot.queryId,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    facts: snapshot.facts.map((fact) => ({
      id: fact.id,
      text: fact.text,
      type: fact.type,
      ...(fact.subjectNodeId ? { subjectNodeId: fact.subjectNodeId } : {}),
      ...(fact.objectNodeId ? { objectNodeId: fact.objectNodeId } : {}),
      value: fact.value,
      unit: fact.unit,
      confidence: confidenceFromPercent(fact.confidencePercent),
      provenance: { source: fact.source as KnowledgeGraph["facts"][number]["provenance"]["source"] },
      sourceProviderId: fact.source as KnowledgeGraph["facts"][number]["sourceProviderId"],
    })),
    warnings: [],
    confidence: snapshot.confidence,
    provenance: snapshot.provenance,
    diagnostics: [],
  };
}

/** Dev-only graph context derived from existing preview payloads (no route changes). */
export function buildGraphContextDevSnapshot(input: {
  assembledContext?: AssembledContext;
  knowledgeGraph?: KnowledgeGraphDevSnapshot;
}): GraphContextDevSnapshot | undefined {
  if (!input.assembledContext || !input.knowledgeGraph) {
    return undefined;
  }

  const knowledgeGraph = knowledgeGraphFromDevSnapshot(input.knowledgeGraph);
  const graphContext = buildGraphContext(
    knowledgeGraph,
    input.assembledContext,
  );

  return serializeGraphContextForDev(graphContext);
}
