/**
 * Sprint 11E Phase 2E.2D.8A — canonical render-first orchestrator authority (local).
 */

export const HEADLESS_FLY_STAGING_RENDER_FIRST_ENTRYPOINT_RELATIVE_PATH =
  "scripts/fly-staging/fly-staging-render-first.sh" as const;

export const HEADLESS_FLY_STAGING_RENDER_FIRST_DEPLOY_STEP_RELATIVE_PATH =
  "scripts/fly-staging/fly-staging-render-scale-up.sh" as const;

export const HEADLESS_FLY_STAGING_RENDER_FIRST_ROLLBACK_STEP_RELATIVE_PATH =
  "scripts/fly-staging/fly-staging-render-rollback.sh" as const;

export const HEADLESS_FLY_STAGING_RENDER_FIRST_FORBIDDEN_WRAPPER_RE =
  /\.tmp\/run-2e2d[a-z0-9-]*-render-first\.sh$/i;

export const HEADLESS_FLY_STAGING_RENDER_FIRST_REQUIRED_FUNCTIONS = Object.freeze([
  "fly_staging_die",
  "fly_staging_require_gate",
  "fly_staging_forbid_env_local",
  "fly_staging_require_app_name",
  "fly_staging_assert_no_public_services_text",
  "fly_staging_orchestrator_rollback_render_only",
  "fly_staging_observe_render_runtime_logs",
  "fly_staging_provider_fly",
] as const);

export type HeadlessFlyStagingRenderFirstOrchestratorPhase =
  | "bootstrap"
  | "read_only_readiness_pass"
  | "local_preflight_pass"
  | "render_scale_up_complete"
  | "post_activation_inventory_proven"
  | "render_runtime_observation_pass"
  | "render_rollback_complete";

export type HeadlessFlyStagingRenderFirstDryRunInput = {
  readonly dryRun: boolean;
  readonly invokedPath: string;
  readonly logLines: readonly string[];
  readonly providerFlyInvoked: boolean;
  readonly phasesReached: readonly HeadlessFlyStagingRenderFirstOrchestratorPhase[];
  readonly rollbackRenderOnly: boolean;
};

export type HeadlessFlyStagingRenderFirstDryRunClassification = {
  readonly status: "ok" | "invalid";
  readonly reasonId:
    | "ok_dry_run_complete"
    | "ok_readiness_fail_render_rollback"
    | "forbidden_tmp_wrapper"
    | "provider_fly_invoked_in_dry_run"
    | "rollback_destroyed_verify"
    | "missing_required_phase"
    | "hostile_input";
};

const REQUIRED_SUCCESS_PHASES: readonly HeadlessFlyStagingRenderFirstOrchestratorPhase[] =
  Object.freeze([
    "bootstrap",
    "read_only_readiness_pass",
    "local_preflight_pass",
    "render_scale_up_complete",
    "post_activation_inventory_proven",
    "render_runtime_observation_pass",
  ] as const);

export function classifyHeadlessFlyStagingRenderFirstInvokedPath(
  invokedPath: unknown,
): {
  readonly status: "ok" | "invalid";
  readonly reasonId: "ok_canonical" | "forbidden_tmp_wrapper" | "hostile_input";
} {
  if (typeof invokedPath !== "string" || invokedPath.length === 0) {
    return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
  }
  if (
    HEADLESS_FLY_STAGING_RENDER_FIRST_FORBIDDEN_WRAPPER_RE.test(invokedPath)
  ) {
    return Object.freeze({ status: "invalid", reasonId: "forbidden_tmp_wrapper" });
  }
  if (
    !invokedPath.endsWith(
      HEADLESS_FLY_STAGING_RENDER_FIRST_ENTRYPOINT_RELATIVE_PATH,
    )
  ) {
    if (!invokedPath.includes("fly-staging-render-first.sh")) {
      return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
    }
  }
  return Object.freeze({ status: "ok", reasonId: "ok_canonical" });
}

export function classifyHeadlessFlyStagingRenderFirstDryRun(
  input: HeadlessFlyStagingRenderFirstDryRunInput,
): HeadlessFlyStagingRenderFirstDryRunClassification {
  try {
    if (!input.dryRun) {
      return Object.freeze({
        status: "invalid",
        reasonId: "hostile_input",
      });
    }
    const pathCls = classifyHeadlessFlyStagingRenderFirstInvokedPath(
      input.invokedPath,
    );
    if (pathCls.status !== "ok") {
      return Object.freeze({
        status: "invalid",
        reasonId: pathCls.reasonId as "forbidden_tmp_wrapper",
      });
    }
    if (input.providerFlyInvoked) {
      return Object.freeze({
        status: "invalid",
        reasonId: "provider_fly_invoked_in_dry_run",
      });
    }
    const joined = input.logLines.join("\n");
    if (
      joined.includes("phase=readiness_fail") &&
      joined.includes("phase=render_rollback_complete")
    ) {
      if (joined.includes("rollback=confirmed") && input.rollbackRenderOnly) {
        return Object.freeze({
          status: "ok",
          reasonId: "ok_readiness_fail_render_rollback",
        });
      }
      if (joined.includes("verify_lost=1")) {
        return Object.freeze({
          status: "invalid",
          reasonId: "rollback_destroyed_verify",
        });
      }
    }
    for (const phase of REQUIRED_SUCCESS_PHASES) {
      if (!input.phasesReached.includes(phase)) {
        return Object.freeze({
          status: "invalid",
          reasonId: "missing_required_phase",
        });
      }
    }
    if (!joined.includes("result=PASS")) {
      return Object.freeze({
        status: "invalid",
        reasonId: "missing_required_phase",
      });
    }
    return Object.freeze({
      status: "ok",
      reasonId: "ok_dry_run_complete",
    });
  } catch {
    return Object.freeze({
      status: "invalid",
      reasonId: "hostile_input",
    });
  }
}

export const HEADLESS_FLY_STAGING_RENDER_FIRST_ORCHESTRATOR_CONTRACT = Object.freeze({
  entrypoint: HEADLESS_FLY_STAGING_RENDER_FIRST_ENTRYPOINT_RELATIVE_PATH,
  deployStep: HEADLESS_FLY_STAGING_RENDER_FIRST_DEPLOY_STEP_RELATIVE_PATH,
  rollbackStep: HEADLESS_FLY_STAGING_RENDER_FIRST_ROLLBACK_STEP_RELATIVE_PATH,
  forbiddenWrapperRe: HEADLESS_FLY_STAGING_RENDER_FIRST_FORBIDDEN_WRAPPER_RE,
  requiredFunctions: HEADLESS_FLY_STAGING_RENDER_FIRST_REQUIRED_FUNCTIONS,
  readOnlyReadinessBeforeActivation: true,
  boundedRollbackToRenderZero: true,
  rollbackDestroysRenderOnly: true,
  operationalHeartbeatWhenStartupLogsExpire: true,
  separateActivationAndQaGates: true,
} as const);
