export type {
  KnowledgeGraph,
} from "./knowledge-graph.types";
export type {
  KnowledgeNode,
  KnowledgeNodeType,
  KnowledgeEntityRef,
} from "./knowledge-node.types";
export type {
  KnowledgeEdge,
  KnowledgeEdgeType,
} from "./knowledge-edge.types";
export type {
  KnowledgeFact,
  KnowledgeFactType,
} from "./knowledge-fact.types";
export type {
  KnowledgeProvenance,
  KnowledgeProvenanceSource,
} from "./knowledge-provenance.types";

export { buildKnowledgeGraphFromAssembledContext } from "./build-knowledge-graph";
export {
  serializeKnowledgeGraphForDev,
  type KnowledgeGraphDevSnapshot,
} from "./serialize-knowledge-graph.utils";

/** @deprecated Scaffold fact type — use `KnowledgeFact` from `./knowledge-fact.types`. */
export type { KnowledgeFact as ScaffoldKnowledgeFact } from "./types";
