/**
 * Enqueue / delivery port — fake worker consumes for QA.
 * Stream dual-lease entries extend the same render message fields.
 */

import { deepFreezeHeadlessValue } from "../../domain/headless-deep-freeze";
import { guardHeadlessStructure } from "../../domain/headless-hostile-guard";
import type { HeadlessControlPlaneResult } from "../types/control-plane.types";
import { stableHeadlessDeliveryId } from "../services/stable-delivery-id";
import { stableHeadlessVerifyDeliveryId } from "../services/stable-delivery-id";

export interface HeadlessQueueMessage {
  readonly jobId: string;
  readonly ownerId: string;
  readonly attempt: number;
  readonly deliveryId: string;
  readonly enqueuedAtMs: number;
}

export type HeadlessDeliveryKind = "render" | "verify";

export type HeadlessVerifyQueueMessage = {
  readonly deliveryId: string;
  readonly ownedObjectId: string;
  readonly ownerId: string;
  readonly attempt: number;
  readonly enqueuedAtMs: number;
  readonly deliveryKind: "verify";
};

export type HeadlessRenderQueueMessage = HeadlessQueueMessage & {
  readonly deliveryKind: "render";
};

export type HeadlessStreamQueueEntry =
  | HeadlessRenderQueueMessage
  | HeadlessVerifyQueueMessage;

export interface HeadlessQueuePort {
  enqueue(message: HeadlessQueueMessage): Promise<HeadlessControlPlaneResult<true>>;
  /** Deterministic drain for fake worker — not a production broker API. */
  drain(limit: number): Promise<readonly HeadlessQueueMessage[]>;
  /** Record a delivery attempt id to detect duplicates. */
  markDelivered(deliveryId: string): Promise<boolean>;
  wasDelivered(deliveryId: string): Promise<boolean>;
}

const RENDER_KEYS = Object.freeze([
  "deliveryId",
  "jobId",
  "ownerId",
  "attempt",
  "enqueuedAtMs",
  "deliveryKind",
] as const);

const VERIFY_KEYS = Object.freeze([
  "deliveryId",
  "ownedObjectId",
  "ownerId",
  "attempt",
  "enqueuedAtMs",
  "deliveryKind",
] as const);

function isSafeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value === value.trim() &&
    !/\s/.test(value)
  );
}

function isSafeAttempt(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= 1_000_000
  );
}

function isSafeEnqueuedAtMs(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
  );
}

function exactKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const keys = Object.keys(obj);
  if (keys.length !== allowed.length) return false;
  const set = new Set(allowed);
  for (const k of keys) {
    if (!set.has(k)) return false;
  }
  return true;
}

/**
 * Hostile-safe stream entry validator.
 * Exact keys only; rebuilds detached frozen record.
 */
export function validateHeadlessStreamQueueEntry(
  value: unknown,
):
  | { readonly ok: true; readonly entry: HeadlessStreamQueueEntry }
  | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(value)) {
      return { ok: false, message: "Hostile stream queue entry rejected." };
    }
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, message: "Stream queue entry must be a plain object." };
    }
    const o = value as Record<string, unknown>;
    if (o.deliveryKind === "render") {
      if (!exactKeys(o, RENDER_KEYS)) {
        return { ok: false, message: "Render entry has unexpected keys." };
      }
      if (!isSafeId(o.jobId) || !isSafeId(o.ownerId) || !isSafeId(o.deliveryId)) {
        return { ok: false, message: "Render entry ids invalid." };
      }
      if (!isSafeAttempt(o.attempt) || !isSafeEnqueuedAtMs(o.enqueuedAtMs)) {
        return { ok: false, message: "Render entry numerics invalid." };
      }
      const expected = stableHeadlessDeliveryId(o.jobId, o.attempt);
      if (o.deliveryId !== expected) {
        return { ok: false, message: "Render deliveryId mismatch." };
      }
      const entry = deepFreezeHeadlessValue({
        deliveryId: o.deliveryId,
        jobId: o.jobId,
        ownerId: o.ownerId,
        attempt: o.attempt,
        enqueuedAtMs: o.enqueuedAtMs,
        deliveryKind: "render" as const,
      });
      return { ok: true, entry };
    }
    if (o.deliveryKind === "verify") {
      if (!exactKeys(o, VERIFY_KEYS)) {
        return { ok: false, message: "Verify entry has unexpected keys." };
      }
      if (
        !isSafeId(o.ownedObjectId) ||
        !isSafeId(o.ownerId) ||
        !isSafeId(o.deliveryId)
      ) {
        return { ok: false, message: "Verify entry ids invalid." };
      }
      if (!isSafeAttempt(o.attempt) || !isSafeEnqueuedAtMs(o.enqueuedAtMs)) {
        return { ok: false, message: "Verify entry numerics invalid." };
      }
      const expected = stableHeadlessVerifyDeliveryId(o.ownedObjectId, o.attempt);
      if (o.deliveryId !== expected) {
        return { ok: false, message: "Verify deliveryId mismatch." };
      }
      const entry = deepFreezeHeadlessValue({
        deliveryId: o.deliveryId,
        ownedObjectId: o.ownedObjectId,
        ownerId: o.ownerId,
        attempt: o.attempt,
        enqueuedAtMs: o.enqueuedAtMs,
        deliveryKind: "verify" as const,
      });
      return { ok: true, entry };
    }
    return { ok: false, message: "deliveryKind must be render|verify." };
  } catch {
    return { ok: false, message: "Stream queue entry validation failed." };
  }
}
