/**
 * Sprint 11E Phase 2E.2D.8A — Hosted Fly render QA secret contract.
 * Reuses eleven-key verify bridge membership; separate QA gate env.
 */

export {
  FLY_VERIFY_LIVE_QA_SECRET_KEYS,
  FLY_VERIFY_LIVE_QA_FORBIDDEN_SECRET_KEYS,
  FLY_VERIFY_LIVE_QA_FORBIDDEN_BRIDGE_EXACT_KEYS,
  FLY_VERIFY_LIVE_QA_FORBIDDEN_BRIDGE_PREFIXES,
  attributeFlyVerifyLiveEnvironment,
  isFlyVerifyLiveConfigAttributionEligible,
  isFlyVerifyLiveGateEnvironmentEligible,
  isFlyVerifyLiveInjectedProvidersOnly,
  validateFlyVerifyLiveQaEnvContract,
  type FlyVerifyLiveConfigAttribution,
  type FlyVerifyLiveQaBridgeValidationResult,
  type FlyVerifyLiveProviderAttributionStatus,
} from "../fly-verify-live/qa-secret-contract";

import {
  attributeFlyVerifyLiveEnvironment,
  isFlyVerifyLiveConfigAttributionEligible,
  isFlyVerifyLiveGateEnvironmentEligible,
  validateFlyVerifyLiveQaEnvContract,
  type FlyVerifyLiveConfigAttribution,
} from "../fly-verify-live/qa-secret-contract";

export const HEADLESS_FLY_RENDER_QA_GATE_ENV = "HEADLESS_FLY_RENDER_QA" as const;
export const HEADLESS_FLY_RENDER_QA_PRESERVE_ENV =
  "HEADLESS_FLY_RENDER_QA_PRESERVE" as const;

export type FlyRenderLiveConfigAttribution = FlyVerifyLiveConfigAttribution;

export function isFlyRenderLiveGateOn(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): boolean {
  try {
    return (env as Record<string, unknown>)[HEADLESS_FLY_RENDER_QA_GATE_ENV] === "1";
  } catch {
    return false;
  }
}

export function attributeFlyRenderLiveEnvironment(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): FlyRenderLiveConfigAttribution {
  return attributeFlyVerifyLiveEnvironment(env);
}

export function isFlyRenderLiveConfigAttributionEligible(
  attribution: FlyRenderLiveConfigAttribution,
): boolean {
  return isFlyVerifyLiveConfigAttributionEligible(attribution);
}

export function isFlyRenderLiveGateEnvironmentEligible(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): boolean {
  if (!isFlyRenderLiveGateOn(env)) return false;
  return isFlyVerifyLiveGateEnvironmentEligible(env);
}

export function validateFlyRenderLiveQaEnvContract(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
) {
  return validateFlyVerifyLiveQaEnvContract(env);
}

export function isFlyRenderLiveInjectedProvidersOnly(deps: {
  readonly injectedSql?: unknown;
  readonly injectedRestProducer?: unknown;
  readonly injectedTcpConsumer?: unknown;
}): boolean {
  return (
    deps.injectedSql != null &&
    deps.injectedRestProducer != null &&
    deps.injectedTcpConsumer != null
  );
}
