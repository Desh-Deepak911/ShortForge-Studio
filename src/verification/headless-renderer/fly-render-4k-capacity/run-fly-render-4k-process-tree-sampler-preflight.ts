/**
 * Sprint 11E Phase 2E.2D.8K.2.1 — bounded read-only sampler preflight against idle render Machine.
 */

import { HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-verify-first-pass-evidence";

import {
  evaluateHosted4kSamplerPreflightCadenceAcceptance,
  HOSTED_4K_SAMPLER_PREFLIGHT_DURATION_MS,
  HOSTED_4K_SAMPLER_PREFLIGHT_MAX_AVERAGE_INTERVAL_MS,
  HOSTED_4K_SAMPLER_PREFLIGHT_MAX_GAP_MS,
  HOSTED_4K_SAMPLER_PREFLIGHT_MIN_SAMPLES,
  HOSTED_4K_SAMPLER_PREFLIGHT_TARGET_SAMPLES,
} from "./hosted-render-machine-process-tree-cadence";
import {
  HOSTED_4K_RENDER_MACHINE_ID,
  runHosted4kMachineLocalProcessTreeObservation,
} from "./hosted-render-machine-process-tree-sampler";

export const HEADLESS_FLY_RENDER_4K_SAMPLER_PREFLIGHT_GATE_ENV =
  "HEADLESS_FLY_RENDER_4K_SAMPLER_PREFLIGHT" as const;

export function isFlyRender4kSamplerPreflightGateOn(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): boolean {
  try {
    return (
      (env as Record<string, unknown>)[
        HEADLESS_FLY_RENDER_4K_SAMPLER_PREFLIGHT_GATE_ENV
      ] === "1"
    );
  } catch {
    return false;
  }
}

export type FlyRender4kSamplerPreflightResult = {
  readonly exitCode: number;
  readonly overall: "NOT_TESTED" | "PASS" | "FAIL";
  readonly sampleCount: number;
  readonly observationDurationMs: number | null;
  readonly averageIntervalMs: number | null;
  readonly maximumObservedGapMs: number | null;
  readonly peakProcessTreeRssBytes: number | null;
  readonly samplingCompletenessClass: string | null;
  readonly workerTreeCorrelationClass: string | null;
  readonly unavailableReason: string | null;
  readonly renderMachineId: string;
  readonly failClass: string | null;
};

export async function runFlyRender4kProcessTreeSamplerPreflight(
  deps: {
    readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
    readonly forceGateOn?: boolean;
    readonly flyAppName?: string;
    readonly renderMachineId?: string;
    readonly preflightDurationMs?: number;
    readonly runObservation?: typeof runHosted4kMachineLocalProcessTreeObservation;
  } = {},
): Promise<FlyRender4kSamplerPreflightResult> {
  const env = deps.env ?? process.env;
  const gateOn =
    deps.forceGateOn === true || isFlyRender4kSamplerPreflightGateOn(env);

  const renderMachineId = deps.renderMachineId ?? HOSTED_4K_RENDER_MACHINE_ID;
  // Frozen render Machine d895d16f264918 belongs to verify-first staging only.
  // QA bridge env may pin a different app name; never use it for sampler preflight.
  const flyAppName =
    deps.flyAppName ?? HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP;

  if (!gateOn) {
    return {
      exitCode: 0,
      overall: "NOT_TESTED",
      sampleCount: 0,
      observationDurationMs: null,
      averageIntervalMs: null,
      maximumObservedGapMs: null,
      peakProcessTreeRssBytes: null,
      samplingCompletenessClass: null,
      workerTreeCorrelationClass: null,
      unavailableReason: null,
      renderMachineId,
      failClass: null,
    };
  }

  const durationMs =
    deps.preflightDurationMs ?? HOSTED_4K_SAMPLER_PREFLIGHT_DURATION_MS;
  const runObservation =
    deps.runObservation ?? runHosted4kMachineLocalProcessTreeObservation;

  const observation = await runObservation({
    flyAppName,
    renderMachineId,
    durationMs,
    sampleIntervalMs: 250,
    minObservationMs: HOSTED_4K_SAMPLER_PREFLIGHT_DURATION_MS - 500,
  });

  const cadence = observation.cadence;
  const acceptance =
    cadence != null
      ? evaluateHosted4kSamplerPreflightCadenceAcceptance({
          cadence,
          peakProcessTreeRssBytes: observation.peakProcessTreeRssBytes,
        })
      : { ok: false as const, failClass: "preflight_cadence_missing" };

  const pass = acceptance.ok;

  return {
    exitCode: pass ? 0 : 1,
    overall: pass ? "PASS" : "FAIL",
    sampleCount: observation.sampleCount,
    observationDurationMs: observation.observationDurationMs,
    averageIntervalMs: cadence?.averageIntervalMs ?? null,
    maximumObservedGapMs: cadence?.maximumObservedGapMs ?? null,
    peakProcessTreeRssBytes: observation.peakProcessTreeRssBytes,
    samplingCompletenessClass: cadence?.samplingCompletenessClass ?? null,
    workerTreeCorrelationClass: cadence?.workerTreeCorrelationClass ?? null,
    unavailableReason: observation.unavailableReason,
    renderMachineId,
    failClass: pass ? null : acceptance.failClass,
  };
}

export const HOSTED_4K_SAMPLER_PREFLIGHT_ACCEPTANCE = Object.freeze({
  durationMs: HOSTED_4K_SAMPLER_PREFLIGHT_DURATION_MS,
  targetSamples: HOSTED_4K_SAMPLER_PREFLIGHT_TARGET_SAMPLES,
  minSamples: HOSTED_4K_SAMPLER_PREFLIGHT_MIN_SAMPLES,
  maxAverageIntervalMs: HOSTED_4K_SAMPLER_PREFLIGHT_MAX_AVERAGE_INTERVAL_MS,
  maxGapMs: HOSTED_4K_SAMPLER_PREFLIGHT_MAX_GAP_MS,
});
