import type { Intent } from "../intent/intent-types";
import type { KnowledgeFact } from "../knowledge/types";

export interface ContextAssemblyInput {
  topic: string;
  manualContext?: string;
  intent: Intent;
  facts?: KnowledgeFact[];
}
