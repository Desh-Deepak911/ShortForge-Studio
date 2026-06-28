import type { ConfidenceScore } from "../shared/confidence.types";

import type { KnowledgeProvenance } from "./knowledge-provenance.types";

/** Canonical edge relation types. */
export type KnowledgeEdgeType =
  | "mentions_entity"
  | "classified_as"
  | "scoped_to_competition"
  | "scoped_to_season"
  | "references_fixture"
  | "includes_ranking"
  | "ranked_at"
  | "identifies_entity"
  | "associated_with"
  | "has_fact"
  | "supports_fact"
  | "has_warning"
  | "related_to"
  | "custom";

/** Directed relation between two knowledge graph nodes. */
export interface KnowledgeEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: KnowledgeEdgeType | string;
  label: string;
  confidence: ConfidenceScore;
  provenance: KnowledgeProvenance;
}
