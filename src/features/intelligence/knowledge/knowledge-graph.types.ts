import type { ConfidenceScore } from "../shared/confidence.types";
import type { ProviderDiagnosticEntry } from "../providers/provider-diagnostics.types";

import type { KnowledgeEdge } from "./knowledge-edge.types";
import type { KnowledgeFact } from "./knowledge-fact.types";
import type { KnowledgeNode } from "./knowledge-node.types";
import type { KnowledgeProvenance } from "./knowledge-provenance.types";

/** Canonical knowledge graph assembled after context assembly. */
export interface KnowledgeGraph {
  queryId: string;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  facts: KnowledgeFact[];
  warnings: string[];
  confidence: ConfidenceScore;
  provenance: KnowledgeProvenance;
  diagnostics: ProviderDiagnosticEntry[];
}
