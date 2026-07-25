/**
 * Structural validation for durable render-dispatch outbox records.
 */

import { HEADLESS_MAX_ID_LENGTH } from "../../domain/headless-render-constants";
import {
  HEADLESS_RENDER_DISPATCH_OUTBOX_VERSION,
  type HeadlessRenderDispatchOutboxState,
  type HeadlessRenderDispatchRejectReasonId,
  type HeadlessStoredRenderDispatchOutbox,
} from "../types/render-dispatch-outbox";

const REJECT_REASONS = new Set<HeadlessRenderDispatchRejectReasonId>([
  "JOB_TERMINAL",
  "JOB_NOT_QUEUED",
  "JOB_CLAIMED",
  "JOB_MISMATCH",
  "JOB_NOT_FOUND",
  "DELIVERY_MISMATCH",
]);

function boundedId(value: unknown, max = HEADLESS_MAX_ID_LENGTH): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value === value.trim() &&
    value.length <= max
  );
}

function safeMs(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

export function validateHeadlessStoredRenderDispatchOutbox(
  value: unknown,
):
  | { readonly ok: true; readonly record: HeadlessStoredRenderDispatchOutbox }
  | { readonly ok: false; readonly message: string } {
  if (value == null || typeof value !== "object") {
    return { ok: false, message: "Dispatch outbox record rejected." };
  }
  const v = value as Record<string, unknown>;
  const intent = v.intent;
  if (intent == null || typeof intent !== "object") {
    return { ok: false, message: "Dispatch outbox intent rejected." };
  }
  const i = intent as Record<string, unknown>;
  if (i.version !== HEADLESS_RENDER_DISPATCH_OUTBOX_VERSION) {
    return { ok: false, message: "Dispatch outbox version rejected." };
  }
  if (
    !boundedId(i.dispatchId, 256) ||
    !boundedId(i.jobId) ||
    !boundedId(i.ownerId) ||
    !boundedId(i.projectId) ||
    !boundedId(i.deliveryId, 256)
  ) {
    return { ok: false, message: "Dispatch outbox identity rejected." };
  }
  if (
    typeof i.attempt !== "number" ||
    !Number.isSafeInteger(i.attempt) ||
    i.attempt < 1 ||
    i.attempt > 1_000_000
  ) {
    return { ok: false, message: "Dispatch outbox attempt rejected." };
  }
  if (!safeMs(i.createdAtMs)) {
    return { ok: false, message: "Dispatch outbox createdAtMs rejected." };
  }

  const state = v.state;
  if (
    state !== "pending" &&
    state !== "claimed" &&
    state !== "dispatched" &&
    state !== "rejected"
  ) {
    return { ok: false, message: "Dispatch outbox state rejected." };
  }

  if (
    typeof v.storeVersion !== "number" ||
    !Number.isSafeInteger(v.storeVersion) ||
    v.storeVersion < 1
  ) {
    return { ok: false, message: "Dispatch outbox storeVersion rejected." };
  }
  if (
    typeof v.retryCount !== "number" ||
    !Number.isSafeInteger(v.retryCount) ||
    v.retryCount < 0
  ) {
    return { ok: false, message: "Dispatch outbox retryCount rejected." };
  }
  if (!safeMs(v.nextAttemptAtMs) || !safeMs(v.updatedAtMs)) {
    return { ok: false, message: "Dispatch outbox timestamps rejected." };
  }

  const claimToken = v.claimToken;
  const claimedAtMs = v.claimedAtMs;
  const dispatchedAtMs = v.dispatchedAtMs;
  const rejectReasonId = v.rejectReasonId;

  if (state === "pending") {
    if (claimToken != null || claimedAtMs != null || dispatchedAtMs != null) {
      return { ok: false, message: "Pending dispatch payload rejected." };
    }
    if (rejectReasonId != null) {
      return { ok: false, message: "Pending dispatch payload rejected." };
    }
  }
  if (state === "claimed") {
    if (
      typeof claimToken !== "string" ||
      claimToken.trim().length === 0 ||
      !safeMs(claimedAtMs) ||
      dispatchedAtMs != null ||
      rejectReasonId != null
    ) {
      return { ok: false, message: "Claimed dispatch payload rejected." };
    }
  }
  if (state === "dispatched") {
    if (
      claimToken != null ||
      claimedAtMs != null ||
      !safeMs(dispatchedAtMs) ||
      rejectReasonId != null
    ) {
      return { ok: false, message: "Dispatched payload rejected." };
    }
  }
  if (state === "rejected") {
    if (
      claimToken != null ||
      claimedAtMs != null ||
      dispatchedAtMs != null ||
      typeof rejectReasonId !== "string" ||
      !REJECT_REASONS.has(rejectReasonId as HeadlessRenderDispatchRejectReasonId)
    ) {
      return { ok: false, message: "Rejected dispatch payload rejected." };
    }
  }

  // deliveryId must match stable form for job/attempt (checked at write sites too).
  const expected = `dlv:${i.jobId}:${i.attempt}`;
  if (i.deliveryId !== expected || i.dispatchId !== expected) {
    return { ok: false, message: "Dispatch delivery identity rejected." };
  }

  return {
    ok: true,
    record: Object.freeze({
      intent: Object.freeze({
        version: HEADLESS_RENDER_DISPATCH_OUTBOX_VERSION,
        dispatchId: i.dispatchId,
        jobId: i.jobId,
        attempt: i.attempt,
        ownerId: i.ownerId,
        projectId: i.projectId,
        deliveryId: i.deliveryId,
        createdAtMs: i.createdAtMs,
      }),
      state: state as HeadlessRenderDispatchOutboxState,
      claimToken:
        typeof claimToken === "string" ? claimToken : null,
      claimedAtMs: typeof claimedAtMs === "number" ? claimedAtMs : null,
      retryCount: v.retryCount,
      nextAttemptAtMs: v.nextAttemptAtMs,
      storeVersion: v.storeVersion,
      updatedAtMs: v.updatedAtMs,
      dispatchedAtMs:
        typeof dispatchedAtMs === "number" ? dispatchedAtMs : null,
      rejectReasonId:
        typeof rejectReasonId === "string"
          ? (rejectReasonId as HeadlessRenderDispatchRejectReasonId)
          : null,
    }),
  };
}
