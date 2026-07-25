/**
 * Control-plane-private durable render-dispatch outbox intent.
 * Never projected into safe job views, diagnostics, or creator-visible API JSON.
 */

export const HEADLESS_RENDER_DISPATCH_OUTBOX_VERSION = 1 as const;

export type HeadlessRenderDispatchOutboxState =
  | "pending"
  | "claimed"
  | "dispatched"
  | "rejected";

export type HeadlessRenderDispatchRejectReasonId =
  | "JOB_TERMINAL"
  | "JOB_NOT_QUEUED"
  | "JOB_CLAIMED"
  | "JOB_MISMATCH"
  | "JOB_NOT_FOUND"
  | "DELIVERY_MISMATCH";

export interface HeadlessRenderDispatchOutboxIntentV1 {
  readonly version: typeof HEADLESS_RENDER_DISPATCH_OUTBOX_VERSION;
  readonly dispatchId: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly ownerId: string;
  readonly projectId: string;
  readonly deliveryId: string;
  readonly createdAtMs: number;
}

export type HeadlessStoredRenderDispatchOutbox = {
  readonly intent: HeadlessRenderDispatchOutboxIntentV1;
  readonly state: HeadlessRenderDispatchOutboxState;
  readonly claimToken: string | null;
  readonly claimedAtMs: number | null;
  readonly retryCount: number;
  readonly nextAttemptAtMs: number;
  readonly storeVersion: number;
  readonly updatedAtMs: number;
  readonly dispatchedAtMs: number | null;
  readonly rejectReasonId: HeadlessRenderDispatchRejectReasonId | null;
};

export const HEADLESS_RENDER_DISPATCH_OUTBOX_TERMINAL_STATES = Object.freeze([
  "dispatched",
  "rejected",
] as const satisfies readonly HeadlessRenderDispatchOutboxState[]);

export function isHeadlessRenderDispatchTerminalState(
  state: HeadlessRenderDispatchOutboxState,
): boolean {
  return state === "dispatched" || state === "rejected";
}

/** Bounded exponential backoff schedule (ms). */
export const HEADLESS_DISPATCH_BACKOFF_MS = Object.freeze([
  1_000,
  2_000,
  5_000,
  15_000,
  30_000,
  60_000,
  120_000,
  300_000,
] as const);

export function headlessDispatchBackoffMs(retryCount: number): number {
  const idx = Math.min(
    Math.max(0, retryCount),
    HEADLESS_DISPATCH_BACKOFF_MS.length - 1,
  );
  return HEADLESS_DISPATCH_BACKOFF_MS[idx]!;
}
