/**
 * Native process adapter — spawn only, never shell:true.
 * POSIX: isolated process group with graceful then escalate termination.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { kill } from "node:process";

export type SpawnExitClass =
  | "success"
  | "cancelled"
  | "timeout"
  | "non_zero"
  | "spawn_error";

export interface SpawnProcessResult {
  readonly exitClass: SpawnExitClass;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;
  readonly stdout: string;
  readonly elapsedMs: number;
  readonly pid: number | null;
}

const DEFAULT_PROCESS_GRACE_MS = 1_500;

export async function spawnFixedArgv(input: {
  executable: string;
  args: readonly string[];
  cwd?: string;
  timeoutMs: number;
  maxStderrBytes: number;
  signal?: AbortSignal;
  processGraceMs?: number;
}): Promise<SpawnProcessResult> {
  const started = Date.now();
  const graceMs = input.processGraceMs ?? DEFAULT_PROCESS_GRACE_MS;

  if (
    !Number.isFinite(input.timeoutMs) ||
    input.timeoutMs <= 0 ||
    !Number.isFinite(input.maxStderrBytes) ||
    input.maxStderrBytes <= 0
  ) {
    return {
      exitClass: "spawn_error",
      exitCode: null,
      signal: null,
      stderr: "invalid spawn limits",
      stdout: "",
      elapsedMs: 0,
      pid: null,
    };
  }

  if (input.signal?.aborted) {
    return {
      exitClass: "cancelled",
      exitCode: null,
      signal: null,
      stderr: "",
      stdout: "",
      elapsedMs: 0,
      pid: null,
    };
  }

  const useProcessGroup = process.platform !== "win32";
  let child: ChildProcess;
  try {
    child = spawn(input.executable, [...input.args], {
      cwd: input.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      // Detached + new process group on POSIX so descendants share a kill target.
      detached: useProcessGroup,
    });
  } catch (error) {
    return {
      exitClass: "spawn_error",
      exitCode: null,
      signal: null,
      stderr: error instanceof Error ? error.message : "spawn failed",
      stdout: "",
      elapsedMs: Date.now() - started,
      pid: null,
    };
  }

  let stderr = "";
  let stdout = "";
  const append = (buf: Buffer, which: "out" | "err") => {
    const chunk = buf.toString("utf8");
    if (which === "err") {
      stderr =
        (stderr + chunk).length > input.maxStderrBytes
          ? (stderr + chunk).slice(-input.maxStderrBytes)
          : stderr + chunk;
    } else {
      stdout =
        (stdout + chunk).length > input.maxStderrBytes
          ? (stdout + chunk).slice(-input.maxStderrBytes)
          : stdout + chunk;
    }
  };

  const onStderr = (b: Buffer) => append(b, "err");
  const onStdout = (b: Buffer) => append(b, "out");
  child.stderr?.on("data", onStderr);
  child.stdout?.on("data", onStdout);

  let timedOut = false;
  let cancelled = false;
  let settled = false;
  let escalateTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanupListeners = () => {
    clearTimeout(timer);
    if (escalateTimer) clearTimeout(escalateTimer);
    input.signal?.removeEventListener("abort", onAbort);
    child.stderr?.off("data", onStderr);
    child.stdout?.off("data", onStdout);
    child.removeAllListeners("error");
    child.removeAllListeners("close");
  };

  const beginTerminate = (why: "timeout" | "cancelled") => {
    if (settled) return;
    if (why === "timeout") timedOut = true;
    else cancelled = true;
    terminateProcessTree(child.pid, useProcessGroup, "SIGTERM");
    escalateTimer = setTimeout(() => {
      terminateProcessTree(child.pid, useProcessGroup, "SIGKILL");
    }, Math.max(1, graceMs));
    escalateTimer.unref?.();
  };

  const timer = setTimeout(() => beginTerminate("timeout"), input.timeoutMs);
  timer.unref?.();

  const onAbort = () => beginTerminate("cancelled");
  input.signal?.addEventListener("abort", onAbort, { once: true });

  const exit = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    spawnError: boolean;
  }>((resolve) => {
    const finish = (
      code: number | null,
      signal: NodeJS.Signals | null,
      spawnError: boolean,
    ) => {
      if (settled) return;
      settled = true;
      resolve({ code, signal, spawnError });
    };
    child.on("error", () => finish(null, null, true));
    child.on("close", (code, signal) => finish(code, signal, false));
  });

  cleanupListeners();

  // Ensure tree is gone after close (belt-and-suspenders for races).
  if (timedOut || cancelled) {
    terminateProcessTree(child.pid, useProcessGroup, "SIGKILL");
  }

  let exitClass: SpawnExitClass = "success";
  if (cancelled) exitClass = "cancelled";
  else if (timedOut) exitClass = "timeout";
  else if (exit.spawnError || (exit.code === null && exit.signal == null)) {
    exitClass = "spawn_error";
  } else if (exit.code !== 0) exitClass = "non_zero";

  return {
    exitClass,
    exitCode: exit.code,
    signal: exit.signal,
    stderr: redactSpawnDiagnostics(stderr),
    stdout: redactSpawnDiagnostics(stdout),
    elapsedMs: Date.now() - started,
    pid: child.pid ?? null,
  };
}

export function terminateProcessTree(
  pid: number | undefined | null,
  useProcessGroup: boolean,
  signal: NodeJS.Signals = "SIGKILL",
): void {
  if (pid == null || pid <= 0) return;
  try {
    if (useProcessGroup) {
      kill(-pid, signal);
      return;
    }
    kill(pid, signal);
  } catch {
    try {
      kill(pid, signal);
    } catch {
      /* already gone */
    }
  }
}

/** Strip absolute paths and URL-like tokens from process diagnostics. */
export function redactSpawnDiagnostics(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/file:\/\/\S+/gi, "[redacted-file-url]")
    .replace(/\/(?:Users|home|var|tmp|private)\/\S+/g, "[redacted-path]")
    .slice(0, 8_192);
}
