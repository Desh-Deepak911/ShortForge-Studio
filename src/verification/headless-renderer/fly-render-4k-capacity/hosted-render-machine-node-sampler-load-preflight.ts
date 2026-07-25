/**
 * Sprint 11E Phase 2E.2D.8K.4.1 — bounded provider-free sampler load preflight.
 */

import { HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-verify-first-pass-evidence";

import {
  completeHosted4kDetachedSamplerLifecycle,
  generateHosted4kSamplerRunToken,
  HOSTED_4K_SAMPLER_STATE_ROOT,
  startHosted4kDetachedSamplerRemote,
} from "./hosted-render-machine-process-tree-lifecycle";
import {
  evaluateHosted4kSamplerPreflightCadenceAcceptance,
  HOSTED_4K_SAMPLER_PREFLIGHT_MAX_GAP_MS,
  HOSTED_4K_SAMPLER_PREFLIGHT_MIN_SAMPLES,
} from "./hosted-render-machine-process-tree-cadence";
import { HOSTED_4K_RENDER_MACHINE_ID } from "./hosted-render-machine-process-tree-remote";
import type { FlySpawnFn } from "./hosted-render-machine-fly-spawn";
import { runFlySpawnDefault } from "./hosted-render-machine-fly-spawn";

export const HEADLESS_FLY_RENDER_4K_SAMPLER_LOAD_PREFLIGHT_GATE_ENV =
  "HEADLESS_FLY_RENDER_4K_SAMPLER_LOAD_PREFLIGHT" as const;

export const HOSTED_4K_SAMPLER_LOAD_PREFLIGHT_DURATION_MS = 35_000 as const;

export const HOSTED_4K_SAMPLER_LOAD_STRESS_DURATION_MS = 28_000 as const;

function encodeScript(script: string): string {
  return Buffer.from(script, "utf8").toString("base64");
}

function buildBoundedLoadStressCommand(): string {
  const script = [
    "STRESS_PID_FILE=/tmp/shortforge-4k-sampler-load-stress.pid",
    "node -e \"const end=Date.now()+" + HOSTED_4K_SAMPLER_LOAD_STRESS_DURATION_MS + ";while(Date.now()<end){let x=0;for(let i=0;i<2000000;i++)x+=Math.sqrt(i);} \" >/dev/null 2>&1 &",
    "echo $! > \"$STRESS_PID_FILE\"",
    'echo \'{"load_started":true}\'',
  ].join("\n");
  const encoded = encodeScript(script);
  return `sh -c 'echo ${encoded} | base64 -d | sh'`;
}

function buildLoadStressCleanupCommand(): string {
  const script = [
    "STRESS_PID_FILE=/tmp/shortforge-4k-sampler-load-stress.pid",
    "if [ -f \"$STRESS_PID_FILE\" ]; then",
    '  spid=$(cat "$STRESS_PID_FILE" 2>/dev/null || echo "")',
    '  [ -n "$spid" ] && kill "$spid" 2>/dev/null || true',
    "fi",
    "rm -f \"$STRESS_PID_FILE\"",
    `ROOT=${HOSTED_4K_SAMPLER_STATE_ROOT}`,
    'if [ -d "$ROOT" ]; then rm -rf "$ROOT"; fi',
    'echo \'{"load_cleaned":true}\'',
  ].join("\n");
  const encoded = encodeScript(script);
  return `sh -c 'echo ${encoded} | base64 -d | sh'`;
}

export type FlyRender4kNodeSamplerLoadPreflightResult = {
  readonly exitCode: number;
  readonly overall: "NOT_TESTED" | "PASS" | "FAIL";
  readonly sampleCount: number;
  readonly observationDurationMs: number | null;
  readonly averageIntervalMs: number | null;
  readonly maximumObservedGapMs: number | null;
  readonly peakProcessTreeRssBytes: number | null;
  readonly cgroupReconciliationClass: string | null;
  readonly renderMachineId: string;
  readonly failClass: string | null;
};

async function runFly(input: {
  readonly args: readonly string[];
  readonly spawn?: FlySpawnFn;
}) {
  const spawnFn = input.spawn ?? runFlySpawnDefault;
  return spawnFn({ args: input.args });
}

export async function runHosted4kNodeSamplerLoadPreflight(
  deps: {
    readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
    readonly forceGateOn?: boolean;
    readonly flyAppName?: string;
    readonly renderMachineId?: string;
    readonly sampleDurationMs?: number;
    readonly spawn?: FlySpawnFn;
  } = {},
): Promise<FlyRender4kNodeSamplerLoadPreflightResult> {
  const env = deps.env ?? process.env;
  const gateOn =
    deps.forceGateOn === true ||
    (env as Record<string, unknown>)[
      HEADLESS_FLY_RENDER_4K_SAMPLER_LOAD_PREFLIGHT_GATE_ENV
    ] === "1";
  const renderMachineId = deps.renderMachineId ?? HOSTED_4K_RENDER_MACHINE_ID;
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
      cgroupReconciliationClass: null,
      renderMachineId,
      failClass: null,
    };
  }

  const runToken = generateHosted4kSamplerRunToken();
  const sampleDurationMs =
    deps.sampleDurationMs ?? HOSTED_4K_SAMPLER_LOAD_PREFLIGHT_DURATION_MS;

  try {
    const started = await startHosted4kDetachedSamplerRemote({
      flyAppName,
      renderMachineId,
      runToken,
      spawn: deps.spawn,
    });
    if (!started.ok) {
      return {
        exitCode: 1,
        overall: "FAIL",
        sampleCount: 0,
        observationDurationMs: null,
        averageIntervalMs: null,
        maximumObservedGapMs: null,
        peakProcessTreeRssBytes: null,
        cgroupReconciliationClass: null,
        renderMachineId,
        failClass: started.failClass,
      };
    }

    await runFly({
      args: [
        "machine",
        "exec",
        renderMachineId,
        "-a",
        flyAppName,
        "--timeout",
        "20",
        buildBoundedLoadStressCommand(),
      ],
      spawn: deps.spawn,
    });

    await new Promise((r) => setTimeout(r, sampleDurationMs));

    const completed = await completeHosted4kDetachedSamplerLifecycle({
      flyAppName,
      renderMachineId,
      runToken,
      minObservationMs: 30_000,
      spawn: deps.spawn,
    });

    await runFly({
      args: [
        "machine",
        "exec",
        renderMachineId,
        "-a",
        flyAppName,
        "--timeout",
        "20",
        buildLoadStressCleanupCommand(),
      ],
      spawn: deps.spawn,
    });

    if (!completed.ok) {
      return {
        exitCode: 1,
        overall: "FAIL",
        sampleCount: 0,
        observationDurationMs: null,
        averageIntervalMs: null,
        maximumObservedGapMs: null,
        peakProcessTreeRssBytes: null,
        cgroupReconciliationClass: null,
        renderMachineId,
        failClass: completed.failClass,
      };
    }

    const observation = completed.observation;
    const cadence = observation.cadence;
    const acceptance =
      cadence != null
        ? evaluateHosted4kSamplerPreflightCadenceAcceptance({
            cadence,
            peakProcessTreeRssBytes: observation.peakProcessTreeRssBytes,
          })
        : { ok: false as const, failClass: "preflight_cadence_missing" };

    if (
      observation.sampleCount < HOSTED_4K_SAMPLER_PREFLIGHT_MIN_SAMPLES ||
      (cadence?.maximumObservedGapMs ?? Infinity) > HOSTED_4K_SAMPLER_PREFLIGHT_MAX_GAP_MS
    ) {
      return {
        exitCode: 1,
        overall: "FAIL",
        sampleCount: observation.sampleCount,
        observationDurationMs: observation.observationDurationMs,
        averageIntervalMs: cadence?.averageIntervalMs ?? null,
        maximumObservedGapMs: cadence?.maximumObservedGapMs ?? null,
        peakProcessTreeRssBytes: observation.peakProcessTreeRssBytes,
        cgroupReconciliationClass: null,
        renderMachineId,
        failClass: acceptance.ok ? "load_preflight_threshold" : acceptance.failClass,
      };
    }

    return {
      exitCode: acceptance.ok ? 0 : 1,
      overall: acceptance.ok ? "PASS" : "FAIL",
      sampleCount: observation.sampleCount,
      observationDurationMs: observation.observationDurationMs,
      averageIntervalMs: cadence?.averageIntervalMs ?? null,
      maximumObservedGapMs: cadence?.maximumObservedGapMs ?? null,
      peakProcessTreeRssBytes: observation.peakProcessTreeRssBytes,
      cgroupReconciliationClass: "reconciled_or_unavailable",
      renderMachineId,
      failClass: acceptance.ok ? null : acceptance.failClass,
    };
  } catch {
    await runFly({
      args: [
        "machine",
        "exec",
        renderMachineId,
        "-a",
        flyAppName,
        "--timeout",
        "20",
        buildLoadStressCleanupCommand(),
      ],
      spawn: deps.spawn,
    }).catch(() => undefined);
    return {
      exitCode: 1,
      overall: "FAIL",
      sampleCount: 0,
      observationDurationMs: null,
      averageIntervalMs: null,
      maximumObservedGapMs: null,
      peakProcessTreeRssBytes: null,
      cgroupReconciliationClass: null,
      renderMachineId,
      failClass: "load_preflight_exception",
    };
  }
}
