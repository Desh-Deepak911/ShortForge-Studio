/**
 * Pre-deployment execution-probe credential surface for cleanup-runtime rollout.
 * Provider-free — proves eleven-key QA contract before Fly mutation.
 */

import { classifyHeadlessNeonEnvironment } from "@/features/headless-renderer/control-plane/runtime/neon-environment";
import { classifyHeadlessR2Environment } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import {
  classifyHeadlessUpstashConsumerEnvironment,
  classifyHeadlessUpstashProducerEnvironment,
} from "@/features/headless-renderer/control-plane/runtime/upstash-environment";
import {
  attributeFlyRenderLiveEnvironment,
  isFlyRenderLiveConfigAttributionEligible,
  validateFlyRenderLiveQaEnvContract,
} from "@/verification/headless-renderer/fly-render-live/qa-secret-contract";
import { HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE_GATE } from "@/verification/headless-renderer/fly-render-live/claimed-render-execution-probe";

import {
  deriveHostedWorkerBridgeLinesFromQaMaster,
  deriveQaProbeBridgeLinesFromQaMaster,
  FLY_STAGING_BRIDGE_ROLLOUT_PUBLIC_PINS,
  parseEnvFileAssignments,
  validateBridgeRolloutQaMasterBody,
  validateHostedWorkerBridgeKeyNames,
} from "./fly-staging-bridge-rollout-credential-authority";

export type HeadlessFlyStagingCleanupRuntimeRolloutProbeConfigReasonId =
  | "ok"
  | "hostile_input"
  | "qa_master_invalid"
  | "worker_bridge_invalid"
  | "probe_contract_failed"
  | "worker_bridge_passes_probe_contract"
  | "probe_gate_missing"
  | "probe_gate_leaked_into_worker_bridge"
  | "public_pin_invalid"
  | "deployment_toml_credential_leak";

export function parseEnvBridgeLinesToRecord(
  lines: readonly string[],
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of lines) {
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export function buildCleanupRuntimeRolloutProbeProcessEnvironment(input: {
  readonly qaMasterBody: string;
  readonly includeProbeGate?: boolean;
}): Record<string, string> {
  const bridge = parseEnvBridgeLinesToRecord(
    deriveQaProbeBridgeLinesFromQaMaster(input.qaMasterBody),
  );
  const env: Record<string, string> = {
    ...bridge,
    HEADLESS_ENV_NAME: FLY_STAGING_BRIDGE_ROLLOUT_PUBLIC_PINS.HEADLESS_ENV_NAME,
    HEADLESS_FLY_STAGING_APP_NAME:
      FLY_STAGING_BRIDGE_ROLLOUT_PUBLIC_PINS.HEADLESS_FLY_STAGING_APP_NAME,
  };
  if (input.includeProbeGate !== false) {
    env[HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE_GATE] = "1";
  }
  return env;
}

export function classifyCleanupRuntimeRolloutProbeConfig(input: {
  readonly qaMasterBody: unknown;
  readonly workerBridgeLines: readonly string[];
  readonly deploymentToml?: string | null;
}):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingCleanupRuntimeRolloutProbeConfigReasonId;
    } {
  if (typeof input.qaMasterBody !== "string") {
    return Object.freeze({ ok: false, reasonId: "hostile_input" });
  }
  const qa = validateBridgeRolloutQaMasterBody(input.qaMasterBody);
  if (!qa.ok) {
    return Object.freeze({ ok: false, reasonId: "qa_master_invalid" });
  }
  const workerKeyNames = input.workerBridgeLines.map((line) => line.split("=")[0] ?? "");
  const workerKeys = validateHostedWorkerBridgeKeyNames(workerKeyNames);
  if (!workerKeys.ok) {
    return Object.freeze({ ok: false, reasonId: "worker_bridge_invalid" });
  }
  if (
    input.workerBridgeLines.some((line) =>
      line.startsWith(`${HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE_GATE}=`),
    )
  ) {
    return Object.freeze({
      ok: false,
      reasonId: "probe_gate_leaked_into_worker_bridge",
    });
  }
  const workerEnv = parseEnvBridgeLinesToRecord(input.workerBridgeLines);
  const workerContract = validateFlyRenderLiveQaEnvContract(workerEnv);
  if (workerContract.ok) {
    return Object.freeze({
      ok: false,
      reasonId: "worker_bridge_passes_probe_contract",
    });
  }
  const probeEnv = buildCleanupRuntimeRolloutProbeProcessEnvironment({
    qaMasterBody: input.qaMasterBody,
    includeProbeGate: true,
  });
  const probeContract = validateFlyRenderLiveQaEnvContract(probeEnv);
  if (!probeContract.ok) {
    return Object.freeze({ ok: false, reasonId: "probe_contract_failed" });
  }
  const withoutGate = buildCleanupRuntimeRolloutProbeProcessEnvironment({
    qaMasterBody: input.qaMasterBody,
    includeProbeGate: false,
  });
  if (withoutGate[HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE_GATE] === "1") {
    return Object.freeze({ ok: false, reasonId: "probe_gate_missing" });
  }
  const attribution = attributeFlyRenderLiveEnvironment(probeEnv);
  if (!isFlyRenderLiveConfigAttributionEligible(attribution)) {
    return Object.freeze({ ok: false, reasonId: "public_pin_invalid" });
  }
  if (
    probeEnv.HEADLESS_ENV_NAME !==
      FLY_STAGING_BRIDGE_ROLLOUT_PUBLIC_PINS.HEADLESS_ENV_NAME ||
    probeEnv.HEADLESS_FLY_STAGING_APP_NAME !==
      FLY_STAGING_BRIDGE_ROLLOUT_PUBLIC_PINS.HEADLESS_FLY_STAGING_APP_NAME
  ) {
    return Object.freeze({ ok: false, reasonId: "public_pin_invalid" });
  }
  if (
    classifyHeadlessNeonEnvironment(probeEnv) !== "configured" ||
    classifyHeadlessR2Environment(probeEnv) !== "configured" ||
    classifyHeadlessUpstashProducerEnvironment(probeEnv) !== "configured" ||
    classifyHeadlessUpstashConsumerEnvironment(probeEnv) !== "configured"
  ) {
    return Object.freeze({ ok: false, reasonId: "probe_contract_failed" });
  }
  const toml = input.deploymentToml ?? "";
  for (const { key } of parseEnvFileAssignments(input.qaMasterBody)) {
    if (toml.includes(`${key} =`) || toml.includes(`${key}=`)) {
      return Object.freeze({
        ok: false,
        reasonId: "deployment_toml_credential_leak",
      });
    }
  }
  return Object.freeze({ ok: true });
}

export function buildCleanupRuntimeRolloutProbeConfigFixture(input: {
  readonly qaMasterBody: string;
}): {
  readonly workerBridgeLines: readonly string[];
  readonly probeEnv: Record<string, string>;
} {
  return Object.freeze({
    workerBridgeLines: deriveHostedWorkerBridgeLinesFromQaMaster(input.qaMasterBody),
    probeEnv: buildCleanupRuntimeRolloutProbeProcessEnvironment({
      qaMasterBody: input.qaMasterBody,
    }),
  });
}
