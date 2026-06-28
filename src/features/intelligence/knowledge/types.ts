import type { ResearchProviderId } from "../providers/types";

/** A single verified or sourced football fact. */
export interface KnowledgeFact {
  id: string;
  text: string;
  source: ResearchProviderId | "inferred";
  /** Entity labels this fact relates to. */
  entityLabels?: string[];
  confidencePercent?: number;
}

/** Lightweight graph node for entity relationships. */
export interface KnowledgeNode {
  id: string;
  kind: string;
  label: string;
}

export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  facts: KnowledgeFact[];
}
