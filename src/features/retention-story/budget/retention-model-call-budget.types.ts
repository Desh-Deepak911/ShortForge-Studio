/**
 * Path-global Retention model-call budget types — Sprint 10E.
 */

import type { QualityMode } from "@/types/footiebitz";

export type RetentionModelCallCategory =
  | "planner"
  | "initial_narration"
  | "length_compression"
  | "hook_repair"
  | "hook_fallback"
  | "retention_body_rewrite";

export type RetentionModelCallOutcome =
  | "attempted"
  | "succeeded"
  | "failed"
  | "rejected"
  | "empty"
  | "malformed"
  | "skipped_deterministic";

export interface RetentionModelCallBudgetPolicy {
  readonly qualityMode: QualityMode | "scenes_only";
  readonly maxPlanner: number;
  readonly maxInitialNarration: number;
  readonly maxLengthCompression: number;
  readonly maxHookRepair: number;
  readonly maxHookFallback: number;
  readonly maxRetentionBodyRewrite: number;
  readonly totalCeiling: number;
}

export interface RetentionModelCallLedgerCounts {
  readonly planner: number;
  readonly initial_narration: number;
  readonly length_compression: number;
  readonly hook_repair: number;
  readonly hook_fallback: number;
  readonly retention_body_rewrite: number;
  readonly total: number;
}

export interface RetentionModelCallLedgerEvent {
  readonly category: RetentionModelCallCategory;
  readonly outcome: RetentionModelCallOutcome;
  readonly sequence: number;
}

export interface RetentionModelCallLedgerSnapshot {
  readonly version: 1;
  readonly qualityMode: QualityMode | "scenes_only";
  readonly policy: RetentionModelCallBudgetPolicy;
  readonly counts: RetentionModelCallLedgerCounts;
  readonly remaining: RetentionModelCallLedgerCounts;
  readonly events: readonly RetentionModelCallLedgerEvent[];
  readonly exhausted: boolean;
}
