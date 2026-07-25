/**
 * Sprint 11E Phase 2E.2D.8K — pre-contact readiness for hosted 4K capacity harness.
 * Fail closed unless all gates pass. Local authority only validates contract shape.
 */

import { HEADLESS_FLY_STAGING_RENDER_VM } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-topology";

import {
  attributeFlyRender4kCapacityEnvironment,
  isFlyRender4kCapacityConfigAttributionEligible,
  isFlyRender4kCapacityGateEnvironmentEligible,
  isFlyRender4kCapacityGateOn,
  validateFlyRender4kCapacityQaEnvContract,
} from "./capacity-4k-qa-gate";
import { FLY_RENDER_4K_CAPACITY_ACCEPTED_IMAGE_DIGEST } from "./capacity-4k-evidence-authority";

export type Capacity4kPrecontactBlockReason =
  | "gate_off"
  | "missing_4k_gate"
  | "env_config_ineligible"
  | "wrong_image_digest"
  | "wrong_render_vm_shape"
  | "wrong_machine_topology"
  | "active_claims_or_outbox_work"
  | "schema_secrets_loops_not_ready";

export type Capacity4kFlyTopologyObservation = {
  readonly verifyCount: number;
  readonly renderCount: number;
  readonly renderCpuKind: string | null;
  readonly renderCpus: number | null;
  readonly renderMemoryMb: number | null;
  readonly verifyImageDigestSha256: string | null;
  readonly renderImageDigestSha256: string | null;
  readonly pendingOutboxCount: number;
  readonly activeClaimCount: number;
};

export type Capacity4kPrecontactEvaluation = {
  readonly contactAllowed: boolean;
  readonly blockReason: Capacity4kPrecontactBlockReason | null;
};

export function evaluateCapacity4kRenderVmShape(input: {
  readonly renderCpuKind: string | null;
  readonly renderCpus: number | null;
  readonly renderMemoryMb: number | null;
}): { readonly ok: true } | { readonly ok: false; readonly failClass: "wrong_render_vm_shape" } {
  if (
    input.renderCpuKind !== HEADLESS_FLY_STAGING_RENDER_VM.cpuKind ||
    input.renderCpus !== HEADLESS_FLY_STAGING_RENDER_VM.cpus ||
    input.renderMemoryMb !== HEADLESS_FLY_STAGING_RENDER_VM.memoryMb
  ) {
    return { ok: false, failClass: "wrong_render_vm_shape" };
  }
  return { ok: true };
}

export function evaluateCapacity4kAcceptedImageDigest(input: {
  readonly verifyImageDigestSha256: string | null;
  readonly renderImageDigestSha256: string | null;
}): { readonly ok: true } | { readonly ok: false; readonly failClass: "wrong_image_digest" } {
  const digest = input.renderImageDigestSha256 ?? input.verifyImageDigestSha256;
  if (digest !== FLY_RENDER_4K_CAPACITY_ACCEPTED_IMAGE_DIGEST) {
    return { ok: false, failClass: "wrong_image_digest" };
  }
  return { ok: true };
}

export function evaluateCapacity4kPrecontactReadiness(input: {
  readonly env: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly topology: Capacity4kFlyTopologyObservation | null;
  readonly schemaReady: boolean;
  readonly forceGateOn?: boolean;
}): Capacity4kPrecontactEvaluation {
  const gateOn =
    input.forceGateOn === true || isFlyRender4kCapacityGateOn(input.env);
  if (!gateOn) {
    return { contactAllowed: false, blockReason: "gate_off" };
  }
  if (!isFlyRender4kCapacityGateOn(input.env) && input.forceGateOn !== true) {
    return { contactAllowed: false, blockReason: "missing_4k_gate" };
  }
  if (!isFlyRender4kCapacityGateEnvironmentEligible(input.env)) {
    return { contactAllowed: false, blockReason: "env_config_ineligible" };
  }
  const contract = validateFlyRender4kCapacityQaEnvContract(input.env);
  if (!contract.ok) {
    return { contactAllowed: false, blockReason: "env_config_ineligible" };
  }
  const attribution = attributeFlyRender4kCapacityEnvironment(input.env);
  if (!isFlyRender4kCapacityConfigAttributionEligible(attribution)) {
    return { contactAllowed: false, blockReason: "env_config_ineligible" };
  }
  if (!input.schemaReady) {
    return {
      contactAllowed: false,
      blockReason: "schema_secrets_loops_not_ready",
    };
  }
  if (input.topology == null) {
    return {
      contactAllowed: false,
      blockReason: "wrong_machine_topology",
    };
  }
  const t = input.topology;
  if (t.verifyCount !== 1 || t.renderCount !== 1) {
    return { contactAllowed: false, blockReason: "wrong_machine_topology" };
  }
  if (
    t.renderCpuKind !== HEADLESS_FLY_STAGING_RENDER_VM.cpuKind ||
    t.renderCpus !== HEADLESS_FLY_STAGING_RENDER_VM.cpus ||
    t.renderMemoryMb !== HEADLESS_FLY_STAGING_RENDER_VM.memoryMb
  ) {
    return { contactAllowed: false, blockReason: "wrong_render_vm_shape" };
  }
  const digestCheck = evaluateCapacity4kAcceptedImageDigest(t);
  if (!digestCheck.ok) {
    return { contactAllowed: false, blockReason: "wrong_image_digest" };
  }
  if (t.pendingOutboxCount > 0 || t.activeClaimCount > 0) {
    return {
      contactAllowed: false,
      blockReason: "active_claims_or_outbox_work",
    };
  }
  return { contactAllowed: true, blockReason: null };
}
