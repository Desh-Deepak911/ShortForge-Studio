/**
 * Total validation for the narrow ClerkAuthSnapshot — hostile-input safe.
 * Distinguishes signed-out/pending from malformed authority.
 */

import { deepFreezeHeadlessValue } from "../../domain/headless-deep-freeze";
import {
  guardHeadlessStructure,
  hasUnknownFields,
  isPlainObject,
} from "../../domain/headless-hostile-guard";
import { HEADLESS_MAX_ID_LENGTH } from "../../domain/headless-render-constants";

const SNAPSHOT_FIELDS = Object.freeze([
  "userId",
  "sessionId",
  "sessionStatus",
] as const);

/** Statuses consumed by ClerkHeadlessPrincipalAdapter. */
export const CLERK_SNAPSHOT_SESSION_STATUSES = Object.freeze([
  "active",
  "pending",
] as const);

export type ClerkSnapshotSessionStatus =
  | (typeof CLERK_SNAPSHOT_SESSION_STATUSES)[number]
  | null;

/** Narrow snapshot from Clerk — no token/claims objects. */
export interface ClerkAuthSnapshot {
  readonly userId: string | null;
  readonly sessionId: string | null;
  readonly sessionStatus: ClerkSnapshotSessionStatus;
}

export type ValidateClerkAuthSnapshotResult =
  | { readonly ok: true; readonly snapshot: ClerkAuthSnapshot }
  | { readonly ok: false; readonly reason: "malformed" };

function isBoundedIdOrNull(value: unknown): value is string | null {
  if (value === null) return true;
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= HEADLESS_MAX_ID_LENGTH &&
    value === value.trim() &&
    !/\s/.test(value)
  );
}

function isAllowedSessionStatus(
  value: unknown,
): value is ClerkSnapshotSessionStatus {
  if (value === null) return true;
  return (
    typeof value === "string" &&
    (CLERK_SNAPSHOT_SESSION_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Validate, detach, and deep-freeze a ClerkAuthSnapshot.
 * Never accepts tokens, claims, org, user, or session objects.
 */
export function validateClerkAuthSnapshot(
  value: unknown,
): ValidateClerkAuthSnapshotResult {
  try {
    const hostile = guardHeadlessStructure(value);
    if (hostile) {
      return { ok: false, reason: "malformed" };
    }
    if (!isPlainObject(value)) {
      return { ok: false, reason: "malformed" };
    }
    if (hasUnknownFields(value, SNAPSHOT_FIELDS) != null) {
      return { ok: false, reason: "malformed" };
    }
    for (const field of SNAPSHOT_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        return { ok: false, reason: "malformed" };
      }
    }
    if (!isBoundedIdOrNull(value.userId)) {
      return { ok: false, reason: "malformed" };
    }
    if (!isBoundedIdOrNull(value.sessionId)) {
      return { ok: false, reason: "malformed" };
    }
    if (!isAllowedSessionStatus(value.sessionStatus)) {
      return { ok: false, reason: "malformed" };
    }

    const snapshot = deepFreezeHeadlessValue({
      userId: value.userId,
      sessionId: value.sessionId,
      sessionStatus: value.sessionStatus,
    } satisfies ClerkAuthSnapshot);

    return { ok: true, snapshot };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}
