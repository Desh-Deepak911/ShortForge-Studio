import type { ScriptMode } from "@/types/footiebitz";

import type { ProviderDiagnosticEntry } from "../providers/provider-diagnostics.types";
import type { ResearchResultProvenance } from "../providers/provider-result.types";
import type { ConfidenceScore } from "../shared/confidence.types";
import type { EntityKind } from "../shared/entity.types";

import type { KnowledgeProvenance } from "../knowledge/knowledge-provenance.types";

/** Canonical section kinds for graph-aware context assembly. */
export type GraphContextSectionType =
  | "query"
  | "intent"
  | "entity"
  | "ranking"
  | "fixture"
  | "timeline"
  | "statistics"
  | "verified_facts"
  | "grounding_rules"
  | "manual_notes"
  | "warnings"
  | "relationships"
  | "custom";

/** Structured fact in graph context — linked to knowledge graph nodes. */
export interface GraphContextFact {
  id: string;
  text: string;
  type: string;
  subjectNodeId?: string;
  objectNodeId?: string;
  value?: string | number | boolean | null;
  unit?: string;
  rank?: number;
  occurredAt?: string;
  confidence: ConfidenceScore;
  provenance: KnowledgeProvenance;
}

/** Primary entity focus for the query — resolved from graph and assembly. */
export interface GraphContextPrimaryEntity {
  nodeId: string;
  label: string;
  kind?: EntityKind;
  entityId?: string;
  externalId?: string | number;
}

/** Entity-centric summary with linked facts and graph neighbours. */
export interface GraphContextEntitySummary {
  nodeId: string;
  label: string;
  kind?: EntityKind;
  factIds: string[];
  relatedNodeIds: string[];
  lines: string[];
}

/** Directed graph relationship for diagnostics and future prompt ordering. */
export interface GraphContextRelationshipSummary {
  edgeId: string;
  type: string;
  label: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceLabel: string;
  targetLabel: string;
}

/** Build/runtime diagnostics for graph context. */
export interface GraphContextDiagnostics {
  nodeCount: number;
  edgeCount: number;
  factCount: number;
  verifiedFactCount: number;
  rankedFactCount: number;
  timelineFactCount: number;
  statisticFactCount: number;
  fixtureFactCount: number;
  entitySummaryCount: number;
  relationshipSummaryCount: number;
  providerDiagnostics: ProviderDiagnosticEntry[];
}

/** Named section of graph-linked facts for future prompt assembly. */
export interface GraphContextSection {
  id: string;
  title: string;
  type: GraphContextSectionType | string;
  priority: number;
  facts: GraphContextFact[];
  sourceNodeIds: string[];
  confidence: ConfidenceScore;
  provenance: KnowledgeProvenance;
}

/**
 * Graph-aware research context built from KnowledgeGraph + AssembledContext.
 * Primary script prompt source when construction succeeds.
 */
export interface GraphContext {
  queryId: string;
  topic: string;
  selectedMode: ScriptMode;
  primaryEntities: GraphContextPrimaryEntity[];
  verifiedFacts: GraphContextFact[];
  rankedFacts: GraphContextFact[];
  timelineFacts: GraphContextFact[];
  statisticFacts: GraphContextFact[];
  fixtureFacts: GraphContextFact[];
  entitySummaries: GraphContextEntitySummary[];
  relationshipSummaries: GraphContextRelationshipSummary[];
  groundingRules: string[];
  warnings: string[];
  confidence: ConfidenceScore;
  provenance: ResearchResultProvenance;
  diagnostics: GraphContextDiagnostics;
}
