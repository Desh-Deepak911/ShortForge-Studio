/**
 * Sprint 11E Phase 2E.2D.8K — separate 4K capacity QA gate (not render-live QA).
 */

export {
  FLY_VERIFY_LIVE_QA_SECRET_KEYS,
  FLY_VERIFY_LIVE_QA_FORBIDDEN_SECRET_KEYS,
  attributeFlyVerifyLiveEnvironment,
  isFlyVerifyLiveConfigAttributionEligible,
  isFlyVerifyLiveGateEnvironmentEligible,
  validateFlyVerifyLiveQaEnvContract,
  type FlyVerifyLiveConfigAttribution,
} from "../fly-verify-live/qa-secret-contract";

import {
  attributeFlyVerifyLiveEnvironment,
  isFlyVerifyLiveConfigAttributionEligible,
  isFlyVerifyLiveGateEnvironmentEligible,
  validateFlyVerifyLiveQaEnvContract,
  type FlyVerifyLiveConfigAttribution,
} from "../fly-verify-live/qa-secret-contract";

/** Separate gate — must not reuse HEADLESS_FLY_RENDER_QA. */
export const HEADLESS_FLY_RENDER_4K_QA_GATE_ENV =
  "HEADLESS_FLY_RENDER_4K_QA" as const;

export const HEADLESS_FLY_RENDER_4K_QA_PRESERVE_ENV =
  "HEADLESS_FLY_RENDER_4K_QA_PRESERVE" as const;

export type FlyRender4kCapacityConfigAttribution = FlyVerifyLiveConfigAttribution;

export function isFlyRender4kCapacityGateOn(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): boolean {
  try {
    return (env as Record<string, unknown>)[HEADLESS_FLY_RENDER_4K_QA_GATE_ENV] === "1";
  } catch {
    return false;
  }
}

export function attributeFlyRender4kCapacityEnvironment(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): FlyRender4kCapacityConfigAttribution {
  return attributeFlyVerifyLiveEnvironment(env);
}

export function isFlyRender4kCapacityConfigAttributionEligible(
  attribution: FlyRender4kCapacityConfigAttribution,
): boolean {
  return isFlyVerifyLiveConfigAttributionEligible(attribution);
}

export function isFlyRender4kCapacityGateEnvironmentEligible(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): boolean {
  if (!isFlyRender4kCapacityGateOn(env)) return false;
  return isFlyVerifyLiveGateEnvironmentEligible(env);
}

export function validateFlyRender4kCapacityQaEnvContract(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
) {
  return validateFlyVerifyLiveQaEnvContract(env);
}

export function isFlyRender4kCapacityInjectedProvidersOnly(deps: {
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
