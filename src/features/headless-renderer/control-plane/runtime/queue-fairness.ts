/**
 * Multi-user headless queue capacity. Server-only; never logged as secrets.
 */

export const HEADLESS_DEFAULT_MAX_ACTIVE_RENDERS_PER_OWNER = 1;
export const HEADLESS_DEFAULT_MAX_GLOBAL_RENDER_WORKERS = 2;
export const HEADLESS_HEARTBEAT_MS = 12_000;
export const HEADLESS_PROGRESS_PERSIST_MIN_MS = 3_000;
export const HEADLESS_IDLE_GRACE_MS = 15_000;

function readBoundedInt(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
):
  | { readonly kind: "ok"; readonly value: number }
  | { readonly kind: "invalid" } {
  try {
    const raw = (env as Record<string, unknown>)[key];
    if (raw === undefined || raw === null) {
      return { kind: "ok", value: fallback };
    }
    if (typeof raw !== "string" || raw.trim() !== raw || !/^\d+$/.test(raw)) {
      return { kind: "invalid" };
    }
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < min || n > max) {
      return { kind: "invalid" };
    }
    return { kind: "ok", value: n };
  } catch {
    return { kind: "invalid" };
  }
}

export type HeadlessQueueFairnessSettings = {
  readonly maxActiveRendersPerOwner: number;
  readonly maxGlobalRenderWorkers: number;
};

export function readHeadlessQueueFairnessSettings(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
):
  | { readonly ok: true; readonly settings: HeadlessQueueFairnessSettings }
  | { readonly ok: false; readonly status: "invalid" } {
  const perOwner = readBoundedInt(
    env,
    "HEADLESS_MAX_ACTIVE_RENDERS_PER_OWNER",
    HEADLESS_DEFAULT_MAX_ACTIVE_RENDERS_PER_OWNER,
    1,
    8,
  );
  const globalWorkers = readBoundedInt(
    env,
    "HEADLESS_MAX_GLOBAL_RENDER_WORKERS",
    HEADLESS_DEFAULT_MAX_GLOBAL_RENDER_WORKERS,
    1,
    16,
  );
  if (perOwner.kind === "invalid" || globalWorkers.kind === "invalid") {
    return { ok: false, status: "invalid" };
  }
  return {
    ok: true,
    settings: {
      maxActiveRendersPerOwner: perOwner.value,
      maxGlobalRenderWorkers: globalWorkers.value,
    },
  };
}

export function shouldPersistHeadlessProgress(input: {
  readonly lastPersistAtMs: number | null;
  readonly lastPercent: number | null;
  readonly nextPercent: number | null;
  readonly nowMs: number;
  readonly minIntervalMs?: number;
}): boolean {
  const minInterval = input.minIntervalMs ?? HEADLESS_PROGRESS_PERSIST_MIN_MS;
  if (input.lastPersistAtMs == null) return true;
  if (input.nowMs - input.lastPersistAtMs >= minInterval) return true;
  if (
    input.lastPercent != null &&
    input.nextPercent != null &&
    Math.abs(input.nextPercent - input.lastPercent) >= 2
  ) {
    return true;
  }
  return false;
}
