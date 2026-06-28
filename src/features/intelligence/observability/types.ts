export type IntelligenceStage =
  | "intent"
  | "entities"
  | "competitions"
  | "research"
  | "context"
  | "prompt"
  | "validation"
  | "planner";

export interface IntelligenceEvent {
  stage: IntelligenceStage;
  name: string;
  durationMs?: number;
  metadata?: Record<string, string | number | boolean>;
}
