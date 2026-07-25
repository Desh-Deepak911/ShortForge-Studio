/**
 * Safe DLQ entry shape — identifiers only, no locators/digests/secrets.
 */

import { deepFreezeHeadlessValue } from "../../domain/headless-deep-freeze";
import { guardHeadlessStructure } from "../../domain/headless-hostile-guard";

export const HEADLESS_QUEUE_DLQ_CLASSES = Object.freeze([
  "malformed_unauthorized",
  "preclaim_loop_exhausted",
  "infrastructure_exhausted",
] as const);

export type HeadlessQueueDlqClass =
  (typeof HEADLESS_QUEUE_DLQ_CLASSES)[number];

export type HeadlessQueueDlqEntry = {
  readonly deliveryId: string;
  readonly jobId?: string;
  readonly ownedObjectId?: string;
  readonly ownerId: string;
  readonly attempt: number;
  readonly class: HeadlessQueueDlqClass;
  readonly enqueuedAtMs: number;
  readonly reasonId: string;
};

const CLASS_SET = new Set<string>(HEADLESS_QUEUE_DLQ_CLASSES);

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
    value >= 0
  );
}

function isSafeReasonId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Z][A-Z0-9_]*$/.test(value)
  );
}

/**
 * Hostile-safe DLQ entry validator.
 * Exactly one of jobId | ownedObjectId required (xor).
 */
export function validateHeadlessQueueDlqEntry(
  value: unknown,
):
  | { readonly ok: true; readonly entry: HeadlessQueueDlqEntry }
  | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(value)) {
      return { ok: false, message: "Hostile DLQ entry rejected." };
    }
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, message: "DLQ entry must be a plain object." };
    }
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o);
    const allowed = new Set([
      "deliveryId",
      "jobId",
      "ownedObjectId",
      "ownerId",
      "attempt",
      "class",
      "enqueuedAtMs",
      "reasonId",
    ]);
    for (const k of keys) {
      if (!allowed.has(k)) {
        return { ok: false, message: "DLQ entry has unexpected keys." };
      }
    }
    if (!isSafeId(o.deliveryId) || !isSafeId(o.ownerId)) {
      return { ok: false, message: "DLQ ids invalid." };
    }
    if (!isSafeAttempt(o.attempt) || !isSafeEnqueuedAtMs(o.enqueuedAtMs)) {
      return { ok: false, message: "DLQ numerics invalid." };
    }
    if (typeof o.class !== "string" || !CLASS_SET.has(o.class)) {
      return { ok: false, message: "DLQ class invalid." };
    }
    if (!isSafeReasonId(o.reasonId)) {
      return { ok: false, message: "DLQ reasonId invalid." };
    }
    const hasJob = o.jobId !== undefined;
    const hasOwned = o.ownedObjectId !== undefined;
    if (hasJob === hasOwned) {
      return {
        ok: false,
        message: "DLQ requires exactly one of jobId|ownedObjectId.",
      };
    }
    if (hasJob && !isSafeId(o.jobId)) {
      return { ok: false, message: "DLQ jobId invalid." };
    }
    if (hasOwned && !isSafeId(o.ownedObjectId)) {
      return { ok: false, message: "DLQ ownedObjectId invalid." };
    }
    const entry = deepFreezeHeadlessValue({
      deliveryId: o.deliveryId,
      ...(hasJob ? { jobId: o.jobId as string } : {}),
      ...(hasOwned ? { ownedObjectId: o.ownedObjectId as string } : {}),
      ownerId: o.ownerId,
      attempt: o.attempt,
      class: o.class as HeadlessQueueDlqClass,
      enqueuedAtMs: o.enqueuedAtMs,
      reasonId: o.reasonId,
    });
    return { ok: true, entry };
  } catch {
    return { ok: false, message: "DLQ entry validation failed." };
  }
}
