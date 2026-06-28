import type { IntelligenceProviderId } from "../shared/provider.types";

/** Source lineage for knowledge graph elements. */
export type KnowledgeProvenanceSource =
  | IntelligenceProviderId
  | "inferred"
  | "user"
  | "assembly";

/** Shared provenance model for graph, node, edge, and fact records. */
export interface KnowledgeProvenance {
  source: KnowledgeProvenanceSource;
  fetchedAt?: string;
  operations?: string[];
  metadata?: Record<string, string | number | boolean | null>;
}
