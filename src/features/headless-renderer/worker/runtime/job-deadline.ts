/**
 * Single job-wide deadline shared across Chromium, FFmpeg, probe, and upload.
 * Timeout is distinct from creator cancellation (parent AbortSignal).
 */

export type JobDeadlineAbortKind = "timeout" | "cancelled" | null;

export interface JobDeadlineController {
  readonly signal: AbortSignal;
  /** Why the combined signal aborted (null if still live). */
  abortKind(): JobDeadlineAbortKind;
  /** Remaining ms until the job deadline (never negative). */
  remainingMs(): number;
  dispose(): void;
}

export function createJobDeadline(input: {
  timeoutMs: number;
  parentSignal?: AbortSignal;
  nowMs?: () => number;
}): JobDeadlineController {
  const now = input.nowMs ?? Date.now;
  const started = now();
  const deadlineAt = started + input.timeoutMs;
  const ac = new AbortController();
  let kind: JobDeadlineAbortKind = null;

  const mark = (next: Exclude<JobDeadlineAbortKind, null>) => {
    if (kind != null) return;
    kind = next;
    try {
      ac.abort(next);
    } catch {
      /* already aborted */
    }
  };

  const timer = setTimeout(() => mark("timeout"), Math.max(1, input.timeoutMs));
  // Unref so a leaked controller cannot keep the process alive in tests.
  timer.unref?.();

  const onParentAbort = () => mark("cancelled");
  if (input.parentSignal) {
    if (input.parentSignal.aborted) {
      mark("cancelled");
    } else {
      input.parentSignal.addEventListener("abort", onParentAbort, { once: true });
    }
  }

  return {
    signal: ac.signal,
    abortKind() {
      return kind;
    },
    remainingMs() {
      return Math.max(0, deadlineAt - now());
    },
    dispose() {
      clearTimeout(timer);
      input.parentSignal?.removeEventListener("abort", onParentAbort);
    },
  };
}

export function failureReasonForDeadline(
  kind: JobDeadlineAbortKind,
): "WORKER_TIMEOUT" | "CANCELLED_BY_USER" | null {
  if (kind === "timeout") return "WORKER_TIMEOUT";
  if (kind === "cancelled") return "CANCELLED_BY_USER";
  return null;
}
