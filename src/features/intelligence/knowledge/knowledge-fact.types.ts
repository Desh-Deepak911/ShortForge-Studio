import type { IntelligenceProviderId } from "../shared/provider.types";
import type { ConfidenceScore } from "../shared/confidence.types";

import type { KnowledgeProvenance } from "./knowledge-provenance.types";

/** Canonical fact categories. */
export type KnowledgeFactType =
  | "statistic"
  | "event"
  | "ranking_value"
  | "profile_attribute"
  | "grounding_rule"
  | "manual_note"
  | "warning"
  | "reference"
  | "custom";

/** Structured fact attached to the knowledge graph. */
export interface KnowledgeFact {
  id: string;
  text: string;
  type: KnowledgeFactType | string;
  subjectNodeId?: string;
  objectNodeId?: string;
  value?: string | number | boolean | null;
  unit?: string;
  confidence: ConfidenceScore;
  provenance: KnowledgeProvenance;
  sourceProviderId?: IntelligenceProviderId | "inferred" | "user" | "assembly";
}
