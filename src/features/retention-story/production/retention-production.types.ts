/**
 * Retention production orchestration types — Sprint 10F.3.
 */

import type {
  HookDiagnostics,
  HookPlanSnapshot,
  HookSelectableStrategyId,
  HookStyleSelection,
} from "@/features/hook-engine";
import type { CreatorTemplateId } from "@/features/creator-templates/creator-template.types";
import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import type { GraphContext } from "@/features/intelligence/context/graph-context.types";
import type { NarrativePlan } from "@/features/intelligence/prompts/narrative-plan.types";
import type {
  GenerateScriptMode,
  QualityMode,
  ScriptMode,
  Tone,
} from "@/types/footiebitz";
import type { HookNeutralResearchEvidence } from "@/features/hook-engine/integration/neutral-research-evidence.types";

import type { RetentionModelCallLedgerSnapshot } from "../budget/retention-model-call-budget.types";
import type {
  RetentionFactHandlingMode,
  RetentionGenerationPath,
} from "../domain/retention-story-contract.types";
import type {
  RetentionStoryPlanSnapshot,
  RetentionValidationSummary,
} from "./retention-persistence.types";
import type { RetentionGenerationDispositionSummary } from "./retention-generation-disposition.types";

/** Creator-safe failure categories — never echo provider/model internals. */
export type RetentionProductionFailureCategory =
  | "contract_normalization_failure"
  | "grounding_failure"
  | "planner_unavailable"
  | "planner_failed"
  | "planner_invalid"
  | "composer_unavailable"
  | "composer_failed"
  | "composer_invalid"
  | "hook_terminal_failure"
  | "retention_hard_gate_failure"
  | "quality_failure"
  /** Sprint 10H.4A — authority-input corruption (not editorial quality). */
  | "validation_authority_mismatch"
  | "rewrite_failure"
  | "length_enforcement_failure"
  | "budget_ledger_failure"
  | "commit_gate_coherence_failure"
  | "production_internal_failure"
  | "scenes_only_not_applicable";

/** Privacy-safe validation failure detail (failures only; scores/IDs, never narration). */
export interface RetentionProductionValidationFailureSummary {
  readonly failureClass: "hard_gate" | "quality_threshold";
  readonly readinessScore: number;
  readonly activeThreshold: number;
  readonly failedHardGateIds: readonly string[];
  readonly editorialScores: Readonly<Record<string, number>>;
  readonly qualityDiagnosticIds: readonly string[];
}

/** Safe Retention diagnostics for JSON/NDJSON (no private evidence). */
export interface RetentionProductionSafeDiagnostics {
  readonly version: 1;
  readonly terminalState: string;
  readonly qualityMode: string;
  readonly contractFingerprint: string | null;
  readonly planFingerprint: string | null;
  readonly candidateFingerprint: string | null;
  readonly validationFingerprint: string | null;
  readonly rewriteUsed: boolean;
  readonly failureCategory?: RetentionProductionFailureCategory;
  readonly safeReasonIds: readonly string[];
  readonly budget?: {
    readonly total: number;
    readonly totalCeiling: number;
    readonly planner: number;
    readonly initialNarration: number;
    readonly lengthCompression: number;
    readonly hookRepair: number;
    readonly hookFallback: number;
    readonly retentionBodyRewrite: number;
  };
  /** Present only on Retention validation failures (canonical validation authority). */
  readonly validationFailureSummary?: RetentionProductionValidationFailureSummary;
  /** Safe acceptance/rejection provenance when generation completed or failed after attempts. */
  readonly acceptanceTrace?: import("./retention-generation-acceptance-trace.types").RetentionGenerationAcceptanceTrace;
}

export interface RetentionApprovedNarrationResult {
  readonly title: string;
  readonly narration: string;
  readonly planSnapshot: RetentionStoryPlanSnapshot;
  readonly validationSummary: RetentionValidationSummary;
  readonly hookPlan: HookPlanSnapshot;
  readonly hookDiagnostics: HookDiagnostics;
  readonly lengthWarning?: string;
  readonly contractFingerprint: string;
  readonly planFingerprint: string;
  readonly candidateFingerprint: string;
  readonly validationFingerprint: string;
  readonly terminalState: "pass_without_rewrite" | "pass_after_rewrite";
  readonly qualityMode: QualityMode;
  readonly generationPath: RetentionGenerationPath;
  readonly safeDiagnostics: RetentionProductionSafeDiagnostics;
  /** Sprint 10H.3 — creator-safe disposition / adaptations (no private evidence). */
  readonly generationDisposition?: RetentionGenerationDispositionSummary;
}

export type RetentionProductionNarrationResult =
  | {
      readonly ok: true;
      readonly approved: RetentionApprovedNarrationResult;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly failureCategory: RetentionProductionFailureCategory;
      readonly hookPlan?: HookPlanSnapshot;
      readonly hookDiagnostics?: HookDiagnostics;
      readonly retentionDiagnostics: RetentionProductionSafeDiagnostics;
    };

export interface RunRetentionProductionNarrationInput {
  readonly topic: string;
  readonly durationSec: number;
  readonly scriptMode?: ScriptMode;
  readonly tone?: Tone;
  /**
   * Explicit creator quality selection. When omitted, Retention contract
   * defaults to balanced (not lib/ai cheap default).
   */
  readonly qualityMode?: QualityMode;
  readonly generationPath: Exclude<RetentionGenerationPath, "scenes_only">;
  readonly apiMode?: GenerateScriptMode;
  readonly templateId?: CreatorTemplateId;
  readonly templatePromptBlock?: string;
  readonly openingStyleAdvisory?: string;
  readonly userInstructions?: string | null;
  readonly hookStyle?: HookStyleSelection;
  /**
   * Creator Story Strategy (Sprint 10G). Omit / auto = legacy Auto default.
   * Explicit values must already be allowlisted + duration-compatible.
   */
  readonly formatStrategyId?: import("../domain/retention-story-contract.types").StoryFormatStrategySelection;
  readonly userAuthoredHook?: string;
  readonly requestedStrategyId?: HookSelectableStrategyId;
  /**
   * Creator-authored manual notes only. Must never be assembled/research prose.
   * Research authority uses structured grounding / researchIdentity.
   */
  readonly manualContext?: string;
  /**
   * Combined generation prose for Hook/advisory consumers only.
   * Not creator-context identity authority.
   */
  readonly generationContext?: string | null;
  readonly premiseDetails?: string;
  readonly factHandlingMode?: RetentionFactHandlingMode | string;
  /**
   * Flexible (default): safe Auto adaptations allowed.
   * Precise: no silent Hook Auto reconcile / Auto-context rescue for explicit styles.
   */
  readonly creationReliabilityMode?: "flexible" | "precise";
  readonly researchApplied?: boolean;
  readonly researchAttemptedWithoutData?: boolean;
  /** Hook-owned evidence — not Retention grounding authority. */
  readonly researchEvidence?: HookNeutralResearchEvidence;
  readonly graphContext?: GraphContext | null;
  readonly assembledContext?: AssembledContext | null;
  readonly narrativePlan?: NarrativePlan | null;
  readonly model?: string;
  /** Injected doubles for verification — production leaves unset. */
  readonly planner?: import("../planning/retention-planner.types").RetentionPlannerCallback | null;
  readonly composer?: import("../composition/retention-narration-candidate.types").RetentionComposerCallback | null;
  readonly rewriteComposer?: import("../rewrite/retention-rewrite.types").RetentionBodyRewriteCallback | null;
  readonly lengthComposer?: import("../composition/retention-narration-candidate.types").RetentionComposerCallback | null;
  readonly hookRunner?: import("../integration/run-retention-hook-bridge").RetentionHookRunner;
  /**
   * Certification/development-only. Ignored when NODE_ENV is production.
   * Writes rejected proposals under gitignored `.tmp/` only.
   */
  readonly captureRejectedProposals?: boolean;
  readonly rejectedProposalCaptureCaseId?: string;
}

export function summarizeLedgerBudget(
  snap: RetentionModelCallLedgerSnapshot | null | undefined,
): RetentionProductionSafeDiagnostics["budget"] | undefined {
  if (!snap) return undefined;
  return Object.freeze({
    total: snap.counts.total,
    totalCeiling: snap.policy.totalCeiling,
    planner: snap.counts.planner,
    initialNarration: snap.counts.initial_narration,
    lengthCompression: snap.counts.length_compression,
    hookRepair: snap.counts.hook_repair,
    hookFallback: snap.counts.hook_fallback,
    retentionBodyRewrite: snap.counts.retention_body_rewrite,
  });
}
