/**
 * Spawn with writable stdin — shell:false, process-group kill, backpressure.
 * Used by PNG image2pipe encode. Never network input.
 *
 * Peak writable buffering is measured from authoritative stream state
 * (writableLength) at the moment backpressure occurs — before drain clears it.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import {
  redactSpawnDiagnostics,
  terminateProcessTree,
  type SpawnExitClass,
  type SpawnProcessResult,
} from "./spawn-process";

export type StdinWriteFailReason =
  | "aborted"
  | "epipe"
  | "drain_timeout"
  | "closed"
  | "buffer_overflow";

export interface StdinSpawnHandle {
  readonly pid: number | null;
  write(
    chunk: Uint8Array,
    options?: {
      readonly signal?: AbortSignal;
      readonly drainTimeoutMs?: number;
      /** Fail closed if buffered bytes exceed this while write is pending. */
      readonly maxWritableBufferedBytes?: number;
    },
  ): Promise<
    | {
        readonly ok: true;
        /** Peak buffered bytes observed for this write (may be 0 if no backpressure). */
        readonly bufferedBytes: number;
      }
    | {
        readonly ok: false;
        readonly reason: StdinWriteFailReason;
        readonly bufferedBytes?: number;
      }
  >;
  endStdin(): void;
  /** Current authoritative buffered bytes awaiting drain (writableLength). */
  getBufferedBytes(): number;
  /** Peak buffered bytes observed across all writes on this handle. */
  getPeakBufferedBytes(): number;
  wait(): Promise<SpawnProcessResult>;
  kill(signal?: NodeJS.Signals): void;
}

const DEFAULT_PROCESS_GRACE_MS = 1_500;

function readWritableLength(stdin: NodeJS.WritableStream): number {
  const len = (stdin as { writableLength?: unknown }).writableLength;
  if (typeof len === "number" && Number.isSafeInteger(len) && len >= 0) {
    return len;
  }
  return 0;
}

export function spawnFixedArgvWithStdin(input: {
  executable: string;
  args: readonly string[];
  cwd?: string;
  timeoutMs: number;
  maxStderrBytes: number;
  signal?: AbortSignal;
  processGraceMs?: number;
}):
  | { readonly ok: true; readonly handle: StdinSpawnHandle }
  | { readonly ok: false; readonly message: string } {
  const started = Date.now();
  const graceMs = input.processGraceMs ?? DEFAULT_PROCESS_GRACE_MS;

  if (
    !Number.isFinite(input.timeoutMs) ||
    input.timeoutMs <= 0 ||
    !Number.isFinite(input.maxStderrBytes) ||
    input.maxStderrBytes <= 0
  ) {
    return { ok: false, message: "invalid spawn limits" };
  }
  if (input.signal?.aborted) {
    return { ok: false, message: "cancelled" };
  }

  const useProcessGroup = process.platform !== "win32";
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(input.executable, [...input.args], {
      cwd: input.cwd,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      detached: useProcessGroup,
    }) as ChildProcessWithoutNullStreams;
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "spawn failed",
    };
  }

  let stderr = "";
  let stdout = "";
  let peakBufferedBytes = 0;
  let stdinEnded = false;
  let stdinBroken = false;
  let timedOut = false;
  let cancelled = false;
  let settled = false;
  let escalateTimer: ReturnType<typeof setTimeout> | null = null;

  const notePeak = (bytes: number) => {
    if (Number.isSafeInteger(bytes) && bytes > peakBufferedBytes) {
      peakBufferedBytes = bytes;
    }
  };

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

  child.stderr.on("data", (b: Buffer) => append(b, "err"));
  child.stdout.on("data", (b: Buffer) => append(b, "out"));
  child.stdin.on("error", () => {
    stdinBroken = true;
  });

  const beginTerminate = (why: "timeout" | "cancelled") => {
    if (settled) return;
    if (why === "timeout") timedOut = true;
    else cancelled = true;
    try {
      if (!stdinEnded) {
        stdinEnded = true;
        child.stdin.destroy();
      }
    } catch {
      /* ignore */
    }
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

  const exitPromise = new Promise<{
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

  const handle: StdinSpawnHandle = {
    pid: child.pid ?? null,

    getBufferedBytes() {
      return readWritableLength(child.stdin);
    },

    getPeakBufferedBytes() {
      return peakBufferedBytes;
    },

    async write(chunk, options) {
      if (cancelled || input.signal?.aborted || options?.signal?.aborted) {
        return { ok: false, reason: "aborted" };
      }
      if (stdinEnded || stdinBroken || settled) {
        return { ok: false, reason: stdinBroken ? "epipe" : "closed" };
      }

      const maxBuffered = options?.maxWritableBufferedBytes;
      if (
        maxBuffered != null &&
        (!Number.isSafeInteger(maxBuffered) || maxBuffered < 1)
      ) {
        return { ok: false, reason: "buffer_overflow", bufferedBytes: 0 };
      }

      return await new Promise((resolve) => {
        const drainTimeoutMs = options?.drainTimeoutMs ?? 30_000;
        let drainTimer: ReturnType<typeof setTimeout> | null = null;
        let writePeak = 0;
        let settledWrite = false;

        const finish = (
          result:
            | { ok: true; bufferedBytes: number }
            | {
                ok: false;
                reason: StdinWriteFailReason;
                bufferedBytes?: number;
              },
        ) => {
          if (settledWrite) return;
          settledWrite = true;
          if (drainTimer) clearTimeout(drainTimer);
          drainTimer = null;
          options?.signal?.removeEventListener("abort", onWriteAbort);
          resolve(result);
        };

        const onWriteAbort = () => {
          finish({ ok: false, reason: "aborted", bufferedBytes: writePeak });
        };
        options?.signal?.addEventListener("abort", onWriteAbort, { once: true });

        try {
          const ok = child.stdin.write(Buffer.from(chunk), (err) => {
            if (err) {
              stdinBroken = true;
              finish({
                ok: false,
                reason: "epipe",
                bufferedBytes: writePeak,
              });
            }
          });

          // Authoritative buffered state immediately after write().
          const afterWrite = Math.max(
            readWritableLength(child.stdin),
            ok ? 0 : chunk.byteLength,
          );
          writePeak = Math.max(writePeak, afterWrite);
          notePeak(writePeak);

          if (
            maxBuffered != null &&
            writePeak > maxBuffered
          ) {
            finish({
              ok: false,
              reason: "buffer_overflow",
              bufferedBytes: writePeak,
            });
            return;
          }

          if (ok) {
            finish({ ok: true, bufferedBytes: writePeak });
            return;
          }

          // Backpressure: await drain; keep peak from the buffered moment.
          drainTimer = setTimeout(() => {
            finish({
              ok: false,
              reason: "drain_timeout",
              bufferedBytes: writePeak,
            });
          }, Math.max(1, drainTimeoutMs));
          drainTimer.unref?.();

          child.stdin.once("drain", () => {
            const duringDrain = readWritableLength(child.stdin);
            writePeak = Math.max(writePeak, duringDrain);
            notePeak(writePeak);
            // Return the peak observed while buffered — not the post-drain zero.
            finish({ ok: true, bufferedBytes: writePeak });
          });
        } catch {
          stdinBroken = true;
          finish({ ok: false, reason: "epipe", bufferedBytes: writePeak });
        }
      });
    },

    endStdin() {
      if (stdinEnded) return;
      stdinEnded = true;
      try {
        child.stdin.end();
      } catch {
        stdinBroken = true;
      }
    },

    kill(signal: NodeJS.Signals = "SIGKILL") {
      beginTerminate("cancelled");
      terminateProcessTree(child.pid, useProcessGroup, signal);
    },

    async wait() {
      const exit = await exitPromise;
      clearTimeout(timer);
      if (escalateTimer) clearTimeout(escalateTimer);
      input.signal?.removeEventListener("abort", onAbort);
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
    },
  };

  return { ok: true, handle };
}
