import type { Intent } from "../intent/intent-types";
import type { AssembledContext } from "../context/assembled-context.types";

export interface PromptBuildRequest {
  topic: string;
  intent: Intent;
  tone: string;
  durationSeconds: number;
  context?: AssembledContext;
}

export interface BuiltPrompt {
  systemPrefix: string;
  body: string;
}
