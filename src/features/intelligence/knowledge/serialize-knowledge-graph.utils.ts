import type { KnowledgeGraph } from "./knowledge-graph.types";
import type { KnowledgeProvenance } from "./knowledge-provenance.types";

/** Compact dev/diagnostics snapshot — safe for logs and Research Preview dev panels. */
export interface KnowledgeGraphDevSnapshot {
  queryId: string;
  nodeCount: number;
  edgeCount: number;
  factCount: number;
  warningCount: number;
  confidence: KnowledgeGraph["confidence"];
  provenance: KnowledgeProvenance;
  nodes: KnowledgeGraph["nodes"];
  edges: KnowledgeGraph["edges"];
  facts: Array<{
    id: string;
    text: string;
    type: string;
    subjectNodeId?: string;
    objectNodeId?: string;
    value?: KnowledgeGraph["facts"][number]["value"];
    unit?: string;
    confidencePercent: number;
    source: string;
  }>;
}

export function serializeKnowledgeGraphForDev(graph: KnowledgeGraph): KnowledgeGraphDevSnapshot {
  return {
    queryId: graph.queryId,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    factCount: graph.facts.length,
    warningCount: graph.warnings.length,
    confidence: graph.confidence,
    provenance: graph.provenance,
    nodes: graph.nodes,
    edges: graph.edges,
    facts: graph.facts.map((fact) => ({
      id: fact.id,
      text: fact.text,
      type: fact.type,
      ...(fact.subjectNodeId ? { subjectNodeId: fact.subjectNodeId } : {}),
      ...(fact.objectNodeId ? { objectNodeId: fact.objectNodeId } : {}),
      value: fact.value,
      unit: fact.unit,
      confidencePercent: fact.confidence.percent,
      source: fact.provenance.source,
    })),
  };
}
