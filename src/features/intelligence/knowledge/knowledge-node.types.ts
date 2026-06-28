import type { ConfidenceScore } from "../shared/confidence.types";
import type { EntityKind } from "../shared/entity.types";

import type { KnowledgeProvenance } from "./knowledge-provenance.types";

/** Canonical node categories in the knowledge graph. */
export type KnowledgeNodeType =
  | "query"
  | "intent"
  | "entity"
  | "player"
  | "club"
  | "national_team"
  | "competition"
  | "season"
  | "match"
  | "fixture"
  | "ranking"
  | "ranking_entry"
  | "venue"
  | "manager"
  | "formation"
  | "warning"
  | "fact"
  | "custom";

/** Optional link back to a resolved intelligence entity. */
export interface KnowledgeEntityRef {
  entityId?: string;
  kind?: EntityKind;
  externalId?: string | number;
  label?: string;
}

/** A node in the knowledge graph. */
export interface KnowledgeNode {
  id: string;
  type: KnowledgeNodeType | string;
  label: string;
  aliases: string[];
  entityRef?: KnowledgeEntityRef;
  confidence: ConfidenceScore;
  provenance: KnowledgeProvenance;
}
