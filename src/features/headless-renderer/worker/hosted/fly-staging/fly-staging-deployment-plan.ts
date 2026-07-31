/**
 * Sprint 11E Phase 2E.2D.4 / 2E.2D.5C — fail-closed Fly staging deployment plan.
 *
 * Scripts require explicit per-gate authorization env vars. Default: blocked.
 * Pre-first-deploy authority uses exact Machine lists, not Launch scale metadata.
 */

import {
  HEADLESS_FLY_STAGING_ZERO_CONSUMER_MECHANISM,
  HEADLESS_FLY_STAGING_PREFLIGHT_PROCESS,
} from "./fly-staging-topology";
import {
  HEADLESS_FLY_STAGING_VERIFY_FIRST_ACTIVATION_MODEL,
  classifyHeadlessFlyStagingProcessInventory,
} from "./fly-staging-machine-authority";

/** Ordered deployment stages. Verify-first activation is intentionally late. */
export const HEADLESS_FLY_STAGING_DEPLOYMENT_ORDER = Object.freeze([
  "local_gates",
  "artifact_hashes",
  "app_create",
  "secrets_install",
  "build_only_image_push_zero_machines",
  "image_runtime_inspection",
  "schema_preflight",
  "verify_first_activation",
  "verifier_evidence",
  "render_activation",
] as const);

export type HeadlessFlyStagingDeploymentStage =
  (typeof HEADLESS_FLY_STAGING_DEPLOYMENT_ORDER)[number];

export const HEADLESS_FLY_STAGING_GATE_IDS = Object.freeze([
  "app_create",
  "secrets_install",
  "image_deploy",
  "bridge_build_only",
  "verify_scale_up",
  "render_scale_up",
  "rollback",
  "teardown",
] as const);

export type HeadlessFlyStagingGateId =
  (typeof HEADLESS_FLY_STAGING_GATE_IDS)[number];

/** Env var that must equal `1` for a gate script to contact Fly. */
export function headlessFlyStagingGateEnvName(
  gate: HeadlessFlyStagingGateId,
): string {
  switch (gate) {
    case "app_create":
      return "HEADLESS_FLY_STAGING_AUTHORIZE_APP_CREATE";
    case "secrets_install":
      return "HEADLESS_FLY_STAGING_AUTHORIZE_SECRETS_INSTALL";
    case "image_deploy":
      return "HEADLESS_FLY_STAGING_AUTHORIZE_IMAGE_DEPLOY";
    case "bridge_build_only":
      return "HEADLESS_FLY_STAGING_AUTHORIZE_BRIDGE_BUILD_ONLY";
    case "verify_scale_up":
      return "HEADLESS_FLY_STAGING_AUTHORIZE_VERIFY_SCALE_UP";
    case "render_scale_up":
      return "HEADLESS_FLY_STAGING_AUTHORIZE_RENDER_SCALE_UP";
    case "rollback":
      return "HEADLESS_FLY_STAGING_AUTHORIZE_ROLLBACK";
    case "teardown":
      return "HEADLESS_FLY_STAGING_AUTHORIZE_TEARDOWN";
    default: {
      const _exhaustive: never = gate;
      return _exhaustive;
    }
  }
}

/**
 * Master execution switch — still insufficient alone; each gate needs its own
 * authorize var.
 */
export const HEADLESS_FLY_STAGING_MASTER_EXECUTION_ENV =
  "HEADLESS_FLY_STAGING_EXECUTION_AUTHORIZED" as const;

export type HeadlessFlyStagingGateClassification = {
  readonly gate: HeadlessFlyStagingGateId;
  readonly authorized: boolean;
  readonly reasonId:
    | "authorized"
    | "master_execution_blocked"
    | "gate_blocked"
    | "hostile_input";
  /** True when Fly CLI must not be invoked. */
  readonly blockProviderContact: boolean;
};

export function classifyHeadlessFlyStagingGateAuthorization(
  gate: HeadlessFlyStagingGateId,
  env: NodeJS.ProcessEnv | Record<string, unknown> = {},
): HeadlessFlyStagingGateClassification {
  try {
    const master = env[HEADLESS_FLY_STAGING_MASTER_EXECUTION_ENV];
    const gateVal = env[headlessFlyStagingGateEnvName(gate)];
    if (master !== "1") {
      return Object.freeze({
        gate,
        authorized: false,
        reasonId: "master_execution_blocked",
        blockProviderContact: true,
      });
    }
    if (gateVal !== "1") {
      return Object.freeze({
        gate,
        authorized: false,
        reasonId: "gate_blocked",
        blockProviderContact: true,
      });
    }
    return Object.freeze({
      gate,
      authorized: true,
      reasonId: "authorized",
      blockProviderContact: false,
    });
  } catch {
    return Object.freeze({
      gate,
      authorized: false,
      reasonId: "hostile_input",
      blockProviderContact: true,
    });
  }
}

/**
 * Logical process-group Machine counts (from Machine list inventory).
 * Not Fly Launch scale metadata.
 */
export type HeadlessFlyStagingScaleState = {
  readonly verifyCount: number;
  readonly renderCount: number;
};

export type HeadlessFlyStagingScaleReasonId =
  | "ok_zero_consumer"
  | "ok_verify_only"
  | "ok_verify_and_render"
  | "accidental_consumer_start"
  | "render_before_verify"
  | "invalid_count"
  | "hostile_input";

export type HeadlessFlyStagingScaleClassification = {
  readonly status: "ok" | "invalid";
  readonly reasonId: HeadlessFlyStagingScaleReasonId;
  readonly scale: HeadlessFlyStagingScaleState | null;
};

/**
 * Classify process-group Machine counts for a phase.
 * Prefers exact Machine inventory semantics (2E.2D.5C).
 */
export function classifyHeadlessFlyStagingScaleState(
  scale: unknown,
  phase:
    | "post_secrets_or_deploy"
    | "post_verify_scale_up"
    | "post_render_scale_up",
): HeadlessFlyStagingScaleClassification {
  const inventoryPhase =
    phase === "post_secrets_or_deploy"
      ? "post_secrets_or_image_deploy"
      : phase === "post_verify_scale_up"
        ? "post_verify_first_activation"
        : "post_render_activation";
  try {
    if (scale == null || typeof scale !== "object") {
      return Object.freeze({
        status: "invalid",
        reasonId: "hostile_input",
        scale: null,
      });
    }
    const verifyCount = (scale as { verifyCount?: unknown }).verifyCount;
    const renderCount = (scale as { renderCount?: unknown }).renderCount;
    const inventory = classifyHeadlessFlyStagingProcessInventory(
      {
        verifyCount,
        renderCount,
        otherCount: 0,
        machineIds: Array.from(
          { length: (Number(verifyCount) || 0) + (Number(renderCount) || 0) },
          (_, i) => `fixture${i}abcd`,
        ),
      },
      inventoryPhase,
    );
    if (inventory.status !== "ok" || inventory.inventory == null) {
      const reasonId =
        inventory.reasonId === "render_without_verify"
          ? "render_before_verify"
          : inventory.reasonId === "unexpected_machine"
            ? phase === "post_secrets_or_deploy"
              ? "accidental_consumer_start"
              : "invalid_count"
            : inventory.reasonId === "hostile_input"
              ? "hostile_input"
              : "invalid_count";
      return Object.freeze({
        status: "invalid",
        reasonId,
        scale:
          typeof verifyCount === "number" && typeof renderCount === "number"
            ? Object.freeze({ verifyCount, renderCount })
            : null,
      });
    }
    const mapped =
      inventory.reasonId === "ok_zero_machines"
        ? "ok_zero_consumer"
        : inventory.reasonId === "ok_verify_only"
          ? "ok_verify_only"
          : "ok_verify_and_render";
    return Object.freeze({
      status: "ok",
      reasonId: mapped,
      scale: Object.freeze({
        verifyCount: inventory.inventory.verifyCount,
        renderCount: inventory.inventory.renderCount,
      }),
    });
  } catch {
    return Object.freeze({
      status: "invalid",
      reasonId: "hostile_input",
      scale: null,
    });
  }
}

export type HeadlessFlyStagingRollbackAction =
  | "destroy_all_machines_to_zero"
  | "redeploy_prior_image_label_build_only"
  | "destroy_staging_app";

export const HEADLESS_FLY_STAGING_ROLLBACK_ORDER = Object.freeze([
  "destroy_all_machines_to_zero",
  "redeploy_prior_image_label_build_only",
] as const);

export const HEADLESS_FLY_STAGING_TEARDOWN_ORDER = Object.freeze([
  "destroy_all_machines_to_zero",
  "destroy_staging_app",
] as const);

export const HEADLESS_FLY_STAGING_DEPLOYMENT_CONTRACT = Object.freeze({
  order: HEADLESS_FLY_STAGING_DEPLOYMENT_ORDER,
  zeroConsumerMechanism: HEADLESS_FLY_STAGING_ZERO_CONSUMER_MECHANISM,
  preflightProcess: HEADLESS_FLY_STAGING_PREFLIGHT_PROCESS,
  secretsMustNotStartConsumers: true,
  imageDeployMustLeaveExactZeroMachines: true,
  /** @deprecated false claim — Launch scale is not authority pre-first-deploy */
  imageDeployMustLeaveScaleZero: false,
  preFirstDeployForbidsFlyScaleCountShow: true,
  /** Phase 2E.2D.5E — pre-first-Machine `fly config show` is not authority. */
  preFirstDeployForbidsFlyConfigShow: true,
  zeroConsumerRegionAuthority: "configured_local_not_remotely_observed" as const,
  remoteRegionObservationPhase: "verify_first_machine_status" as const,
  verifyFirstActivationModel: HEADLESS_FLY_STAGING_VERIFY_FIRST_ACTIVATION_MODEL,
  verifyScaleRequiresSeparateAuthorization: true,
  renderScaleRequiresSeparateAuthorization: true,
  renderScaleRequiresPriorVerifyScale: true,
  rollbackDestroyUsesForceNotYes: true,
  rollbackUnconfirmedNeverClean: true,
  /** Phase 2E.2D.6E — staged exact-nine valid pre-first Machine; deploy required at verify-first. */
  preFirstMachineSecretSurfaceAllowsStaged: true,
  stagedSecretsNeverRuntimeReady: true,
  verifyFirstRequiresSecretsDeployWhenStaged: true,
  verifyFirstSecretsDeployMaxAttempts: 1,
  runtimeSecretReadinessRequiresDeployedLedger: true,
  /** Phase 2E.2D.6G — canonical verify-first orchestrator; no .tmp wrappers. */
  verifyFirstCanonicalOrchestratorOnly: true,
  verifyFirstOrchestratorEntrypoint:
    "scripts/fly-staging/fly-staging-verify-first.sh" as const,
  verifyFirstDryRunSupported: true,
  /** Phase 2E.2D.6H — decoded secret sync before Machine; dedicated install gate. */
  verifyFirstRequiresDecodedSecretsSync: true,
  secretsImportForbidsBridgeFilePipe: true,
  observeRuntimeLogsNeverDies: true,
  orchestratorOnlyRollbackTerminalization: true,
  /** Phase 2E.2D.8A — canonical render-first orchestrator; separate QA gate. */
  renderFirstCanonicalOrchestratorOnly: true,
  renderFirstOrchestratorEntrypoint:
    "scripts/fly-staging/fly-staging-render-first.sh" as const,
  renderActivationRequiresSeparateAuthorization: true,
  renderQaGateEnv: "HEADLESS_FLY_RENDER_QA" as const,
  renderQaNeverActivatesRender: true,
  renderRollbackDestroysRenderOnly: true,
  renderRollbackPreservesVerify: true,
} as const);
