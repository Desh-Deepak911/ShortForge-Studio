/**
 * Bounded per-case execution for Neon live / progressive matrices.
 * Exceptions attribute to the active required case — never collapse prior results.
 */

import type { NeonLiveCaseEvidence } from "./evidence";
import {
  defaultSafeStageForCase,
  INJECTION_SAFE_STAGE,
  isProgressiveSafeStage,
  type NeonLiveInjectionPoint,
  type ProgressiveSafeStage,
} from "./injection";
import {
  sanitizeProgressiveConstraintId,
  sanitizeProgressiveControlPlaneCode,
  sanitizeProgressiveSqlState,
} from "./progressive-diagnostic-allowlists";
import {
  emptyPromotionDiagnosticFields,
  sanitizePromotionDiagnosticFields,
  type PromotionDiagnosticFields,
} from "./promotion-diagnostic";
import {
  type NeonLiveFailureCategory,
  type RequiredNeonLiveCaseId,
} from "./required-cases";

export type CaseStepDiagnostic = {
  readonly safeOperationStage: ProgressiveSafeStage;
  readonly safeControlPlaneCode?: string | null;
  readonly allowlistedSqlState?: string | null;
  readonly allowlistedConstraint?: string | null;
} & Partial<PromotionDiagnosticFields>;

export type CaseStepOutcome =
  | { readonly kind: "pass" }
  | {
      readonly kind: "fail";
      readonly category: NeonLiveFailureCategory;
      readonly diagnostic?: CaseStepDiagnostic;
    };

export type NeonLiveSessionAttribution = {
  readonly lastCompletedRequiredCase: string | null;
  readonly activeFailedCase: string | null;
  readonly safeOperationStage: ProgressiveSafeStage | null;
  readonly safeControlPlaneCode: string | null;
  readonly allowlistedSqlState: string | null;
  readonly allowlistedConstraint: string | null;
} & PromotionDiagnosticFields;

function caseFail(
  caseId: string,
  category: NeonLiveFailureCategory,
): NeonLiveCaseEvidence {
  return { caseId, status: "FAIL", failureCategory: category };
}

function casePass(caseId: string): NeonLiveCaseEvidence {
  return { caseId, status: "PASS" };
}

function sanitizeDiagnostic(
  caseId: string,
  diagnostic: CaseStepDiagnostic | undefined,
): CaseStepDiagnostic {
  const stage =
    diagnostic != null && isProgressiveSafeStage(diagnostic.safeOperationStage)
      ? diagnostic.safeOperationStage
      : defaultSafeStageForCase(caseId);
  return {
    safeOperationStage: stage,
    safeControlPlaneCode: sanitizeProgressiveControlPlaneCode(
      diagnostic?.safeControlPlaneCode,
    ),
    allowlistedSqlState: sanitizeProgressiveSqlState(
      diagnostic?.allowlistedSqlState,
    ),
    allowlistedConstraint: sanitizeProgressiveConstraintId(
      diagnostic?.allowlistedConstraint,
    ),
    ...sanitizePromotionDiagnosticFields(diagnostic),
  };
}

export class NeonLiveCaseSession {
  readonly results: NeonLiveCaseEvidence[] = [];
  private stopped = false;
  private activeCaseId: RequiredNeonLiveCaseId | null = null;
  private lastDiagnostic: CaseStepDiagnostic | null = null;
  private readonly injectThrowAt: NeonLiveInjectionPoint | undefined;
  private readonly stopAfterCaseId: RequiredNeonLiveCaseId | undefined;

  constructor(options?: {
    readonly injectThrowAt?: NeonLiveInjectionPoint;
    readonly stopAfterCaseId?: RequiredNeonLiveCaseId;
  }) {
    this.injectThrowAt = options?.injectThrowAt;
    this.stopAfterCaseId = options?.stopAfterCaseId;
  }

  get stoppedEarly(): boolean {
    return this.stopped;
  }

  get activeCase(): RequiredNeonLiveCaseId | null {
    return this.activeCaseId;
  }

  get lastCompletedCaseId(): string | null {
    for (let i = this.results.length - 1; i >= 0; i--) {
      if (this.results[i]!.status === "PASS") return this.results[i]!.caseId;
    }
    return null;
  }

  get failedCaseId(): string | null {
    for (let i = this.results.length - 1; i >= 0; i--) {
      if (this.results[i]!.status === "FAIL") return this.results[i]!.caseId;
    }
    return null;
  }

  attribution(): NeonLiveSessionAttribution {
    const failed = this.failedCaseId;
    const diag = this.lastDiagnostic;
    return {
      lastCompletedRequiredCase: this.lastCompletedCaseId,
      activeFailedCase: failed,
      safeOperationStage: diag?.safeOperationStage ?? null,
      safeControlPlaneCode: diag?.safeControlPlaneCode ?? null,
      allowlistedSqlState: diag?.allowlistedSqlState ?? null,
      allowlistedConstraint: diag?.allowlistedConstraint ?? null,
      ...sanitizePromotionDiagnosticFields(diag),
    };
  }

  private recordException(caseId: RequiredNeonLiveCaseId): void {
    const stage =
      this.injectThrowAt != null
        ? INJECTION_SAFE_STAGE[this.injectThrowAt]
        : defaultSafeStageForCase(caseId);
    this.lastDiagnostic = {
      safeOperationStage: stage,
      safeControlPlaneCode: null,
      allowlistedSqlState: null,
      allowlistedConstraint: null,
      ...emptyPromotionDiagnosticFields(),
    };
    this.results.push(caseFail(caseId, "CASE_STEP_EXCEPTION"));
    this.stopped = true;
  }

  /**
   * Execute one required case. On throw → CASE_STEP_EXCEPTION for this case, stop.
   * On fail → record FAIL and stop. On pass → continue.
   */
  async run(
    caseId: RequiredNeonLiveCaseId,
    step: () => Promise<CaseStepOutcome>,
  ): Promise<"continue" | "stop"> {
    if (this.stopped) return "stop";
    this.activeCaseId = caseId;
    try {
      const outcome = await step();
      if (outcome.kind === "pass") {
        this.results.push(casePass(caseId));
        if (this.stopAfterCaseId === caseId) {
          this.stopped = true;
          return "stop";
        }
        return "continue";
      }
      this.lastDiagnostic = sanitizeDiagnostic(caseId, outcome.diagnostic);
      this.results.push(caseFail(caseId, outcome.category));
      this.stopped = true;
      return "stop";
    } catch {
      this.recordException(caseId);
      return "stop";
    }
  }

  /**
   * Setup attributed to the next required case (before that case's body).
   */
  async prepare(
    nextCaseId: RequiredNeonLiveCaseId,
    setup: () => Promise<void>,
  ): Promise<"continue" | "stop"> {
    if (this.stopped) return "stop";
    this.activeCaseId = nextCaseId;
    try {
      await setup();
      return "continue";
    } catch {
      this.recordException(nextCaseId);
      return "stop";
    }
  }
}

export { caseFail, casePass };
