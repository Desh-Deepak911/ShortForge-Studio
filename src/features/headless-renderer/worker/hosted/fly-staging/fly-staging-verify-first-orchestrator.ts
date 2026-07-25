/**
 * Sprint 11E Phase 2E.2D.6G — canonical verify-first orchestrator authority (local).
 * Provider-free dry-run classification and required-function registry.
 */

export const HEADLESS_FLY_STAGING_VERIFY_FIRST_ENTRYPOINT_RELATIVE_PATH =
  "scripts/fly-staging/fly-staging-verify-first.sh" as const;

export const HEADLESS_FLY_STAGING_VERIFY_FIRST_DEPLOY_STEP_RELATIVE_PATH =
  "scripts/fly-staging/fly-staging-verify-scale-up.sh" as const;

/** Forbidden temporary wrapper pattern — remote runs must use the checked-in entrypoint. */
export const HEADLESS_FLY_STAGING_VERIFY_FIRST_FORBIDDEN_WRAPPER_RE =
  /\.tmp\/run-2e2d[a-z0-9-]*-verify-first\.sh$/i;

/** Nonexistent aliases that must never be invoked. */
export const HEADLESS_FLY_STAGING_VERIFY_FIRST_FORBIDDEN_FUNCTION_ALIASES =
  Object.freeze(["fly_staging_source_bridge"] as const);

/** Required shell functions from fly-staging-common.sh (exact names). */
export const HEADLESS_FLY_STAGING_VERIFY_FIRST_REQUIRED_FUNCTIONS = Object.freeze([
  "fly_staging_die",
  "fly_staging_require_gate",
  "fly_staging_forbid_env_local",
  "fly_staging_require_app_name",
  "fly_staging_assert_required_functions",
  "fly_staging_bootstrap_verify_first",
  "fly_staging_validate_bridge_surface",
  "fly_staging_accept_bridge",
  "fly_staging_orchestrator_exit_cleanup",
  "fly_staging_load_bridge",
  "fly_staging_bridge_cleanup",
  "fly_staging_apply_public_environment",
  "fly_staging_unset_public_environment",
  "fly_staging_assert_bridge_has_no_public_keys",
  "fly_staging_assert_exact_zero_machines",
  "fly_staging_classify_secrets_json_file",
  "fly_staging_verify_first_activate_staged_secrets",
  "fly_staging_emit_decoded_secrets_import_stream",
  "fly_staging_sync_decoded_secrets",
  "fly_staging_assert_post_sync_secrets_ledger",
  "fly_staging_orchestrator_rollback_to_zero",
  "fly_staging_destroy_all_app_machines",
  "fly_staging_assert_no_public_services_text",
  "fly_staging_provider_fly",
] as const);

export type HeadlessFlyStagingVerifyFirstOrchestratorPhase =
  | "bootstrap"
  | "bridge_surface_validated"
  | "bridge_accepted"
  | "bridge_loaded"
  | "public_environment_applied"
  | "local_preflight_pass"
  | "zero_machines_confirmed"
  | "secrets_synced"
  | "secrets_post_sync_classified"
  | "deploy_complete"
  | "topology_proven"
  | "secrets_activated"
  | "runtime_observation_pass"
  | "rollback_complete";

export type HeadlessFlyStagingVerifyFirstDryRunInput = {
  readonly dryRun: boolean;
  readonly invokedPath: string;
  readonly logLines: readonly string[];
  readonly bridgeExistsAfterExit: boolean;
  readonly bridgeAccepted: boolean;
  readonly bridgeLoaded: boolean;
  readonly providerFlyInvoked: boolean;
  readonly phasesReached: readonly HeadlessFlyStagingVerifyFirstOrchestratorPhase[];
};

export type HeadlessFlyStagingVerifyFirstDryRunClassification = {
  readonly status: "ok" | "invalid";
  readonly reasonId:
    | "ok_dry_run_complete"
    | "ok_bootstrap_fail_bridge_preserved"
    | "ok_load_fail_bridge_consumed"
    | "forbidden_tmp_wrapper"
    | "forbidden_function_alias"
    | "provider_fly_invoked_in_dry_run"
    | "bridge_consumed_before_accept"
    | "bridge_not_deleted_after_accept"
    | "missing_required_phase"
    | "hostile_input";
  readonly secretsDeployCount: number;
};

const REQUIRED_SUCCESS_PHASES: readonly HeadlessFlyStagingVerifyFirstOrchestratorPhase[] =
  Object.freeze([
    "bootstrap",
    "bridge_surface_validated",
    "bridge_accepted",
    "bridge_loaded",
    "public_environment_applied",
    "local_preflight_pass",
    "zero_machines_confirmed",
    "secrets_synced",
    "secrets_post_sync_classified",
    "deploy_complete",
    "topology_proven",
    "secrets_activated",
    "runtime_observation_pass",
  ] as const);

export function classifyHeadlessFlyStagingVerifyFirstInvokedPath(
  invokedPath: unknown,
): {
  readonly status: "ok" | "invalid";
  readonly reasonId: "ok_canonical" | "forbidden_tmp_wrapper" | "hostile_input";
} {
  if (typeof invokedPath !== "string" || invokedPath.length === 0) {
    return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
  }
  if (HEADLESS_FLY_STAGING_VERIFY_FIRST_FORBIDDEN_WRAPPER_RE.test(invokedPath)) {
    return Object.freeze({ status: "invalid", reasonId: "forbidden_tmp_wrapper" });
  }
  if (!invokedPath.endsWith(HEADLESS_FLY_STAGING_VERIFY_FIRST_ENTRYPOINT_RELATIVE_PATH)) {
    if (!invokedPath.includes("fly-staging-verify-first.sh")) {
      return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
    }
  }
  return Object.freeze({ status: "ok", reasonId: "ok_canonical" });
}

export function classifyHeadlessFlyStagingVerifyFirstDryRun(
  input: HeadlessFlyStagingVerifyFirstDryRunInput,
): HeadlessFlyStagingVerifyFirstDryRunClassification {
  try {
    if (!input.dryRun) {
      return Object.freeze({
        status: "invalid",
        reasonId: "hostile_input",
        secretsDeployCount: 0,
      });
    }
    const pathCls = classifyHeadlessFlyStagingVerifyFirstInvokedPath(
      input.invokedPath,
    );
    if (pathCls.status !== "ok") {
      return Object.freeze({
        status: "invalid",
        reasonId: pathCls.reasonId as "forbidden_tmp_wrapper",
        secretsDeployCount: 0,
      });
    }
    if (input.providerFlyInvoked) {
      return Object.freeze({
        status: "invalid",
        reasonId: "provider_fly_invoked_in_dry_run",
        secretsDeployCount: 0,
      });
    }
    const joined = input.logLines.join("\n");
    const secretsDeployCount = (joined.match(/secrets_deploy_invoked=1/g) ?? [])
      .length;

    if (
      joined.includes("phase=bootstrap_fail") &&
      !input.bridgeAccepted &&
      input.bridgeExistsAfterExit
    ) {
      return Object.freeze({
        status: "ok",
        reasonId: "ok_bootstrap_fail_bridge_preserved",
        secretsDeployCount: 0,
      });
    }

    if (
      input.bridgeAccepted &&
      input.bridgeLoaded &&
      joined.includes("phase=load_fail") &&
      !input.bridgeExistsAfterExit
    ) {
      return Object.freeze({
        status: "ok",
        reasonId: "ok_load_fail_bridge_consumed",
        secretsDeployCount: 0,
      });
    }

    if (input.bridgeAccepted && input.bridgeExistsAfterExit && joined.includes("result=PASS")) {
      return Object.freeze({
        status: "invalid",
        reasonId: "bridge_not_deleted_after_accept",
        secretsDeployCount,
      });
    }

    if (input.bridgeAccepted && !input.bridgeLoaded && !joined.includes("phase=bootstrap_fail")) {
      return Object.freeze({
        status: "invalid",
        reasonId: "bridge_consumed_before_accept",
        secretsDeployCount: 0,
      });
    }

    for (const phase of REQUIRED_SUCCESS_PHASES) {
      if (!input.phasesReached.includes(phase)) {
        return Object.freeze({
          status: "invalid",
          reasonId: "missing_required_phase",
          secretsDeployCount,
        });
      }
    }

    if (secretsDeployCount > 1) {
      return Object.freeze({
        status: "invalid",
        reasonId: "hostile_input",
        secretsDeployCount,
      });
    }

    return Object.freeze({
      status: "ok",
      reasonId: "ok_dry_run_complete",
      secretsDeployCount,
    });
  } catch {
    return Object.freeze({
      status: "invalid",
      reasonId: "hostile_input",
      secretsDeployCount: 0,
    });
  }
}

export const HEADLESS_FLY_STAGING_VERIFY_FIRST_ORCHESTRATOR_CONTRACT = Object.freeze({
  canonicalEntrypointOnly: true,
  forbiddenTmpWrappers: true,
  bootstrapBeforeBridgeConsumption: true,
  bridgeDeletedOnExitAfterAccept: true,
  bootstrapFailurePreservesBridge: true,
  loadBridgeExactName: "fly_staging_load_bridge",
  dryRunBlocksProviderFly: true,
  secretsDeployMaxAttempts: 1,
  rollbackUsesForceNotYes: true,
  decodedSecretsSyncBeforeMachine: true,
  secretsSyncRequiresInstallGate: true,
  observeRuntimeNeverDies: true,
  orchestratorOnlyTerminalizesRollback: true,
} as const);
