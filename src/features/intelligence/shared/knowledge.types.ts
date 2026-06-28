import type { IntelligenceProviderId } from "./provider.types";
import type { EntityKind } from "./entity.types";

/** Provenance for a knowledge fact. */
export interface FactProvenance {
  source: IntelligenceProviderId | "inferred" | "user";
  fetchedAt?: string;
  entityLabels?: string[];
}

/**
 * A structured football fact with provenance.
 * Canonical model — replace flat `facts: string[]` in later phases.
 */
export interface IntelligenceFact {
  id: string;
  text: string;
  provenance: FactProvenance;
  confidencePercent?: number;
  relatedEntityKinds?: EntityKind[];
}

/** Graph node for entity relationships. */
export interface KnowledgeNode {
  id: string;
  kind: EntityKind | string;
  label: string;
}

export interface KnowledgeEdge {
  fromId: string;
  toId: string;
  relation: string;
}

/**
 * Lightweight knowledge graph assembled from research providers.
 * Canonical model for context builder and validator phases.
 */
export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges?: KnowledgeEdge[];
  facts: IntelligenceFact[];
}
