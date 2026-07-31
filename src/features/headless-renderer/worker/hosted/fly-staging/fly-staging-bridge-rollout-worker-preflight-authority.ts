/**
 * Bridge rollout worker preflight credential surface.
 *
 * Hosted worker classification rejects QA-only Upstash REST credentials that
 * must never appear in a nine-key worker bridge. After an execution probe the
 * orchestrator shell may still export eleven-key QA material; this authority
 * strips probe-only keys before bridge worker preflight without mutating the
 * on-disk QA master.
 */

import { classifyHeadlessHostedWorkerEnvironment } from "../hosted-environment";
import {
  classifyHeadlessFlyStagingOperatorPreflight,
  mergeHeadlessFlyStagingOperatorPreflightEnvironment,
  type HeadlessFlyStagingPreflightClassification,
  type HeadlessFlyStagingWorkerModeBoundary,
} from "./fly-staging-public-environment";

/** Keys allowed only in QA probe / job-create surfaces — never worker bridge. */
export const HEADLESS_FLY_STAGING_QA_ONLY_WORKER_PREFLIGHT_KEYS = Object.freeze([
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE",
  "HEADLESS_FLY_RENDER_LIVE_QA",
  "HEADLESS_FLY_RENDER_4K_QA",
] as const);

export type HeadlessFlyStagingBridgeRolloutWorkerPreflightReasonId =
  | "ok"
  | "operator_preflight_surface_mismatch"
  | "hosted_unconfigured"
  | "hostile_input";

export type HeadlessFlyStagingBridgeRolloutWorkerPreflightClassification =
  | {
      readonly ok: true;
      readonly hostedStatus: "configured";
      readonly preflight: HeadlessFlyStagingPreflightClassification;
    }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingBridgeRolloutWorkerPreflightReasonId;
      readonly hostedStatus: string;
      readonly hostedReasonId: string;
      readonly pollutedQaOnlyKeys: readonly string[];
    };

function readPollutedQaOnlyKeys(
  env: Record<string, unknown>,
): readonly string[] {
  const polluted: string[] = [];
  for (const key of HEADLESS_FLY_STAGING_QA_ONLY_WORKER_PREFLIGHT_KEYS) {
    const value = env[key];
    if (value == null) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    polluted.push(key);
  }
  return Object.freeze(polluted);
}

/**
 * Removes QA-only keys from a shallow env clone for worker-bridge preflight.
 * The caller's live process env is never mutated.
 */
export function isolateHeadlessFlyStagingWorkerBridgePreflightEnvironment(
  env: Record<string, unknown>,
): Record<string, unknown> {
  const isolated = { ...env };
  for (const key of HEADLESS_FLY_STAGING_QA_ONLY_WORKER_PREFLIGHT_KEYS) {
    delete isolated[key];
  }
  return isolated;
}

/**
 * Classifies bridge worker preflight using nine-key worker material only.
 * Detects the post-probe operator surface mismatch that falsely reports
 * hosted_status=invalid while Fly machines remain healthy.
 */
export function classifyHeadlessFlyStagingBridgeRolloutWorkerPreflight(input: {
  readonly env: Record<string, unknown>;
  readonly workerMode: HeadlessFlyStagingWorkerModeBoundary;
}): HeadlessFlyStagingBridgeRolloutWorkerPreflightClassification {
  try {
    const polluted = readPollutedQaOnlyKeys(input.env);
    const isolated = isolateHeadlessFlyStagingWorkerBridgePreflightEnvironment(
      input.env,
    );
    const pollutedHosted = classifyHeadlessHostedWorkerEnvironment({
      ...mergeHeadlessFlyStagingOperatorPreflightEnvironment(isolated, {
        workerMode: input.workerMode,
        applyPublicEnvironment: false,
      }),
    });
    if (
      polluted.length > 0 &&
      pollutedHosted.status !== "configured"
    ) {
      return Object.freeze({
        ok: false,
        reasonId: "operator_preflight_surface_mismatch",
        hostedStatus: pollutedHosted.status,
        hostedReasonId: pollutedHosted.reasonId,
        pollutedQaOnlyKeys: polluted,
      });
    }

    const merged = mergeHeadlessFlyStagingOperatorPreflightEnvironment(isolated, {
      workerMode: input.workerMode,
      applyPublicEnvironment: false,
    });
    const preflight = classifyHeadlessFlyStagingOperatorPreflight(merged);
    if (preflight.status !== "ok" || preflight.hostedStatus !== "configured") {
      return Object.freeze({
        ok: false,
        reasonId: "hosted_unconfigured",
        hostedStatus: preflight.hostedStatus,
        hostedReasonId: preflight.hostedReasonId,
        pollutedQaOnlyKeys: polluted,
      });
    }
    return Object.freeze({
      ok: true,
      hostedStatus: "configured",
      preflight,
    });
  } catch {
    return Object.freeze({
      ok: false,
      reasonId: "hostile_input",
      hostedStatus: "invalid",
      hostedReasonId: "hostile_input",
      pollutedQaOnlyKeys: Object.freeze([]),
    });
  }
}
