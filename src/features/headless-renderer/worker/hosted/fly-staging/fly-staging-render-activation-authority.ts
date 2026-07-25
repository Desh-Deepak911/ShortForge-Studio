/**
 * Sprint 11E Phase 2E.2D.8A — Render activation topology + rollback authority (local).
 */

import {
  resolveCurrentFlyStagingAcceptedImageDigestSha256,
} from "./fly-staging-versioned-image-authority";
import {
  classifyHeadlessFlyStagingGateAuthorization,
  HEADLESS_FLY_STAGING_MASTER_EXECUTION_ENV,
  headlessFlyStagingGateEnvName,
} from "./fly-staging-deployment-plan";
import { HEADLESS_FLY_STAGING_TOPOLOGY } from "./fly-staging-topology";
import type { HeadlessFlyStagingSecretLedgerParse } from "./fly-staging-secret-activation";
import {
  classifyHeadlessFlyStagingRenderVmSpec,
  classifyHeadlessFlyStagingVerifyVmSpec,
  parseHeadlessFlyStagingDualMachineInventoryFromListJson,
  type HeadlessFlyStagingDualMachineInventory,
} from "./fly-staging-render-machine-authority";

/** Separate gate from hosted render QA matrix. */
export const HEADLESS_FLY_RENDER_ACTIVATION_GATE_ENV =
  "HEADLESS_FLY_STAGING_AUTHORIZE_RENDER_SCALE_UP" as const;

/** Hosted render live matrix gate — never sufficient for activation alone. */
export const HEADLESS_FLY_RENDER_QA_GATE_ENV = "HEADLESS_FLY_RENDER_QA" as const;

export const HEADLESS_FLY_RENDER_ACTIVATION_PREREQUISITE_TOPOLOGY = Object.freeze({
  verifyCount: 1,
  renderCount: 0,
} as const);

export const HEADLESS_FLY_RENDER_ACTIVATION_TARGET_TOPOLOGY = Object.freeze({
  verifyCount: 1,
  renderCount: 1,
} as const);

export type HeadlessFlyStagingRenderActivationPhase =
  | "prerequisite_topology"
  | "verify_machine_healthy"
  | "secrets_deployed"
  | "immutable_image_match"
  | "read_only_readiness"
  | "render_scale_up"
  | "post_activation_inventory"
  | "render_runtime_observation"
  | "render_rollback_render_only";

export type HeadlessFlyStagingRenderActivationReasonId =
  | "ok_prerequisite"
  | "ok_target"
  | "wrong_topology"
  | "render_before_verify"
  | "verify_unhealthy"
  | "render_unhealthy"
  | "secrets_not_deployed"
  | "image_mismatch"
  | "verify_vm_spec_invalid"
  | "render_vm_spec_invalid"
  | "activation_gate_blocked"
  | "qa_gate_is_not_activation"
  | "hostile_input";

export function classifyHeadlessFlyRenderActivationGate(
  env: NodeJS.ProcessEnv | Record<string, unknown> = {},
): {
  readonly authorized: boolean;
  readonly reasonId:
    | "authorized"
    | "master_execution_blocked"
    | "gate_blocked"
    | "hostile_input";
} {
  const cls = classifyHeadlessFlyStagingGateAuthorization("render_scale_up", env);
  return Object.freeze({
    authorized: cls.authorized,
    reasonId: cls.reasonId,
  });
}

/** QA gate must never authorize render Machine creation. */
export function classifyHeadlessFlyRenderQaGateOnly(
  env: NodeJS.ProcessEnv | Record<string, unknown> = {},
): {
  readonly qaGateOn: boolean;
  readonly activationAuthorized: boolean;
  readonly reasonId: "qa_only" | "activation_authorized" | "both_blocked";
} {
  try {
    const qaOn = (env as Record<string, unknown>)[HEADLESS_FLY_RENDER_QA_GATE_ENV] === "1";
    const activation = classifyHeadlessFlyRenderActivationGate(env);
    if (activation.authorized) {
      return Object.freeze({
        qaGateOn: qaOn,
        activationAuthorized: true,
        reasonId: "activation_authorized",
      });
    }
    if (qaOn) {
      return Object.freeze({
        qaGateOn: true,
        activationAuthorized: false,
        reasonId: "qa_only",
      });
    }
    return Object.freeze({
      qaGateOn: false,
      activationAuthorized: false,
      reasonId: "both_blocked",
    });
  } catch {
    return Object.freeze({
      qaGateOn: false,
      activationAuthorized: false,
      reasonId: "both_blocked",
    });
  }
}

export function classifyHeadlessFlyRenderPrerequisiteTopology(
  inventory: HeadlessFlyStagingDualMachineInventory,
): {
  readonly status: "ok" | "invalid";
  readonly reasonId: HeadlessFlyStagingRenderActivationReasonId;
} {
  try {
    if (
      inventory.verifyCount === 0 &&
      inventory.renderCount >= 1
    ) {
      return Object.freeze({
        status: "invalid",
        reasonId: "render_before_verify",
      });
    }
    if (
      inventory.verifyCount !==
        HEADLESS_FLY_RENDER_ACTIVATION_PREREQUISITE_TOPOLOGY.verifyCount ||
      inventory.renderCount !==
        HEADLESS_FLY_RENDER_ACTIVATION_PREREQUISITE_TOPOLOGY.renderCount ||
      inventory.otherCount !== 0
    ) {
      return Object.freeze({
        status: "invalid",
        reasonId: "wrong_topology",
      });
    }
    if (inventory.verify == null) {
      return Object.freeze({ status: "invalid", reasonId: "verify_unhealthy" });
    }
    const verifySpec = classifyHeadlessFlyStagingVerifyVmSpec(inventory.verify);
    if (verifySpec.status !== "ok") {
      return Object.freeze({ status: "invalid", reasonId: "verify_vm_spec_invalid" });
    }
    return Object.freeze({ status: "ok", reasonId: "ok_prerequisite" });
  } catch {
    return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
  }
}

export function classifyHeadlessFlyRenderPostActivationTopology(
  inventory: HeadlessFlyStagingDualMachineInventory,
  acceptedImageDigestSha256: string = resolveCurrentFlyStagingAcceptedImageDigestSha256(),
): {
  readonly status: "ok" | "invalid";
  readonly reasonId: HeadlessFlyStagingRenderActivationReasonId;
} {
  try {
    if (
      inventory.verifyCount !==
        HEADLESS_FLY_RENDER_ACTIVATION_TARGET_TOPOLOGY.verifyCount ||
      inventory.renderCount !==
        HEADLESS_FLY_RENDER_ACTIVATION_TARGET_TOPOLOGY.renderCount ||
      inventory.otherCount !== 0
    ) {
      return Object.freeze({
        status: "invalid",
        reasonId: "wrong_topology",
      });
    }
    if (inventory.verify == null || inventory.render == null) {
      return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
    }
    const verifySpec = classifyHeadlessFlyStagingVerifyVmSpec(inventory.verify);
    const renderSpec = classifyHeadlessFlyStagingRenderVmSpec(inventory.render);
    if (verifySpec.status !== "ok") {
      return Object.freeze({ status: "invalid", reasonId: "verify_vm_spec_invalid" });
    }
    if (renderSpec.status !== "ok") {
      return Object.freeze({ status: "invalid", reasonId: "render_vm_spec_invalid" });
    }
    const verifyDigest = inventory.verify.imageDigestSha256;
    const renderDigest = inventory.render.imageDigestSha256;
    if (
      verifyDigest !== acceptedImageDigestSha256 ||
      renderDigest !== acceptedImageDigestSha256
    ) {
      return Object.freeze({ status: "invalid", reasonId: "image_mismatch" });
    }
    return Object.freeze({ status: "ok", reasonId: "ok_target" });
  } catch {
    return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
  }
}

export function classifyHeadlessFlyRenderSecretsDeployed(
  ledger: HeadlessFlyStagingSecretLedgerParse | null,
): {
  readonly status: "ok" | "invalid";
  readonly reasonId: "ok" | "secrets_not_deployed" | "hostile_input";
} {
  try {
    if (ledger == null || ledger.status !== "ok" || ledger.entries == null) {
      return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
    }
    const allDeployed = ledger.entries.every((e) => e.flyStatus === "deployed");
    return allDeployed
      ? Object.freeze({ status: "ok", reasonId: "ok" })
      : Object.freeze({ status: "invalid", reasonId: "secrets_not_deployed" });
  } catch {
    return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
  }
}

export type HeadlessFlyStagingRenderRollbackInput = {
  readonly destroyRenderOnly: true;
  readonly destroyCommandsSucceeded: readonly boolean[];
  readonly renderDestroyCount: number;
  readonly finalInventory: HeadlessFlyStagingDualMachineInventory;
};

export function classifyHeadlessFlyRenderRollbackPreservesVerify(
  input: HeadlessFlyStagingRenderRollbackInput,
): {
  readonly status: "ok" | "unconfirmed" | "invalid";
  readonly reasonId:
    | "ok_verify_preserved"
    | "destroy_failed"
    | "verify_lost"
    | "render_still_present"
    | "hostile_input";
} {
  try {
    if (input.destroyRenderOnly !== true) {
      return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
    }
    if (input.destroyCommandsSucceeded.some((ok) => !ok)) {
      return Object.freeze({ status: "unconfirmed", reasonId: "destroy_failed" });
    }
    const inv = input.finalInventory;
    if (
      inv.verifyCount !== 1 ||
      inv.renderCount !== 0 ||
      inv.otherCount !== 0
    ) {
      if (inv.renderCount > 0) {
        return Object.freeze({ status: "unconfirmed", reasonId: "render_still_present" });
      }
      if (inv.verifyCount !== 1) {
        return Object.freeze({ status: "unconfirmed", reasonId: "verify_lost" });
      }
      return Object.freeze({ status: "unconfirmed", reasonId: "hostile_input" });
    }
    return Object.freeze({ status: "ok", reasonId: "ok_verify_preserved" });
  } catch {
    return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
  }
}

export const HEADLESS_FLY_RENDER_ACTIVATION_CONTRACT = Object.freeze({
  prerequisiteTopology: HEADLESS_FLY_RENDER_ACTIVATION_PREREQUISITE_TOPOLOGY,
  targetTopology: HEADLESS_FLY_RENDER_ACTIVATION_TARGET_TOPOLOGY,
  acceptedImageDigestSha256: resolveCurrentFlyStagingAcceptedImageDigestSha256(),
  renderVm: HEADLESS_FLY_STAGING_TOPOLOGY.renderVm,
  verifyVm: HEADLESS_FLY_STAGING_TOPOLOGY.verifyVm,
  concurrency: 1 as const,
  publicServicesAllowed: false,
  activationGateEnv: HEADLESS_FLY_RENDER_ACTIVATION_GATE_ENV,
  masterExecutionEnv: HEADLESS_FLY_STAGING_MASTER_EXECUTION_ENV,
  qaGateEnv: HEADLESS_FLY_RENDER_QA_GATE_ENV,
  qaGateNeverActivatesRender: true,
  rollbackDestroysRenderOnly: true,
  rollbackPreservesVerify: true,
  activationUsesSameImmutableImage: true,
  readOnlyReadinessBeforeActivation: true,
  renderOrchestratorEntrypoint:
    "scripts/fly-staging/fly-staging-render-first.sh" as const,
  renderScaleUpStep: "scripts/fly-staging/fly-staging-render-scale-up.sh" as const,
  renderRollbackStep: "scripts/fly-staging/fly-staging-render-rollback.sh" as const,
  parseInventory: parseHeadlessFlyStagingDualMachineInventoryFromListJson,
  activationGateEnvName: headlessFlyStagingGateEnvName("render_scale_up"),
} as const);
