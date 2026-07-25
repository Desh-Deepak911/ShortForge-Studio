/**
 * Bounded, visibility-aware job polling. One in-flight request; terminal stop.
 */

export interface BoundedPollerOptions<T> {
  readonly runId: number;
  readonly isCurrentRun: (runId: number) => boolean;
  readonly fetchStatus: (signal: AbortSignal) => Promise<T>;
  readonly isTerminal: (value: T) => boolean;
  readonly onResult: (value: T, runId: number) => void;
  readonly onTransientFailure: (message: string, runId: number) => void;
  readonly onTerminalFailure: (message: string, runId: number) => void;
  readonly baseIntervalMs?: number;
  readonly maxIntervalMs?: number;
  readonly maxTransientFailures?: number;
  readonly jitterRatio?: number;
  readonly now?: () => number;
  readonly schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  readonly clearSchedule?: (id: ReturnType<typeof setTimeout>) => void;
  readonly getHidden?: () => boolean;
}

export interface BoundedPollerHandle {
  stop: () => void;
  /** Kick an immediate poll (e.g. after visibility return). */
  poke: () => void;
}

export function startBoundedJobPoller<T>(
  options: BoundedPollerOptions<T>,
): BoundedPollerHandle {
  const base = options.baseIntervalMs ?? 1_500;
  const maxInterval = options.maxIntervalMs ?? 8_000;
  const maxTransient = options.maxTransientFailures ?? 8;
  const jitter = options.jitterRatio ?? 0.2;
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const clearSchedule = options.clearSchedule ?? ((id) => clearTimeout(id));
  const getHidden =
    options.getHidden ??
    (() =>
      typeof document !== "undefined" ? document.visibilityState === "hidden" : false);

  let stopped = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let interval = base;
  let transientFailures = 0;
  let controller: AbortController | null = null;

  const clearTimer = () => {
    if (timer != null) {
      clearSchedule(timer);
      timer = null;
    }
  };

  const stop = () => {
    stopped = true;
    clearTimer();
    controller?.abort();
    controller = null;
  };

  const nextDelay = (): number => {
    const hidden = getHidden();
    const target = hidden ? Math.min(interval * 2, maxInterval) : interval;
    const spread = target * jitter;
    return Math.max(50, target + (Math.random() * 2 - 1) * spread);
  };

  const scheduleNext = () => {
    if (stopped) return;
    clearTimer();
    timer = schedule(() => {
      void tick();
    }, nextDelay());
  };

  const tick = async () => {
    if (stopped || inFlight) return;
    if (!options.isCurrentRun(options.runId)) {
      stop();
      return;
    }
    inFlight = true;
    controller = new AbortController();
    try {
      const value = await options.fetchStatus(controller.signal);
      if (stopped || !options.isCurrentRun(options.runId)) return;
      transientFailures = 0;
      interval = base;
      options.onResult(value, options.runId);
      if (options.isTerminal(value)) {
        stop();
        return;
      }
      scheduleNext();
    } catch (err) {
      if (stopped || !options.isCurrentRun(options.runId)) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      transientFailures += 1;
      interval = Math.min(interval * 1.5, maxInterval);
      if (transientFailures >= maxTransient) {
        options.onTerminalFailure(
          "Lost contact with server export status. Refresh to check again.",
          options.runId,
        );
        stop();
        return;
      }
      options.onTransientFailure(
        "Still checking export status…",
        options.runId,
      );
      scheduleNext();
    } finally {
      inFlight = false;
      controller = null;
      void now;
    }
  };

  // Immediate first status request.
  void tick();

  return {
    stop,
    poke: () => {
      if (stopped) return;
      clearTimer();
      void tick();
    },
  };
}
