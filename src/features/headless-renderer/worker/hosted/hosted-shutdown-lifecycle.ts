/**
 * Signal-armed graceful shutdown deadline.
 *
 * Normal operation has no deadline timer. The first signal stops intake and,
 * when any unified busy work is active (claimed delivery execution and/or
 * dispatch-outbox sweep), arms gracefulShutdownDeadlineMs. A second signal
 * (or deadline expiry while busy) force-aborts both where supported.
 *
 * Multiple signals / timer callbacks are idempotent. Idle first-signal does
 * not wait for the full deadline.
 */

export type HostedShutdownLifecycle = {
  /** First call = graceful; second call = forced abort. */
  readonly handleSignal: () => void;
  readonly clearDeadline: () => void;
  readonly isDeadlineArmed: () => boolean;
  readonly signalCount: () => number;
  readonly wasForcedFromDeadline: () => boolean;
};

export function createHostedShutdownLifecycle(input: {
  readonly gracefulShutdownDeadlineMs: number;
  readonly requestShutdown: () => void;
  readonly requestForcedAbort: () => void;
  /**
   * Unified busy: claimed verify/render execution OR active dispatch sweep
   * OR startup dispatch attempt.
   */
  readonly isBusy: () => boolean;
  /** Invoked on first signal before intake stop (stop outbox scheduling). */
  readonly onFirstSignal?: () => void;
}): HostedShutdownLifecycle {
  let signals = 0;
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  let deadlineArmed = false;
  let forcedFromDeadline = false;

  const clearDeadline = () => {
    if (deadlineTimer != null) {
      clearTimeout(deadlineTimer);
      deadlineTimer = null;
    }
  };

  const armGracefulDeadline = () => {
    if (deadlineArmed) return;
    deadlineArmed = true;
    deadlineTimer = setTimeout(() => {
      if (forcedFromDeadline) return;
      forcedFromDeadline = true;
      // Only force-abort when claimed work remains; otherwise ensure intake stop.
      if (input.isBusy()) {
        input.requestForcedAbort();
      } else {
        input.requestShutdown();
      }
    }, input.gracefulShutdownDeadlineMs);
    deadlineTimer.unref?.();
  };

  const handleSignal = () => {
    signals += 1;
    if (signals === 1) {
      input.onFirstSignal?.();
      input.requestShutdown();
      // Idle exits promptly without waiting for the full deadline.
      if (input.isBusy()) {
        armGracefulDeadline();
      }
      return;
    }
    // Optional second signal → immediate forced abort.
    clearDeadline();
    input.requestForcedAbort();
  };

  return {
    handleSignal,
    clearDeadline,
    isDeadlineArmed: () => deadlineArmed,
    signalCount: () => signals,
    wasForcedFromDeadline: () => forcedFromDeadline,
  };
}
