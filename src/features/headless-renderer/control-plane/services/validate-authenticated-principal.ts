/**
 * Total validation for HeadlessAuthenticatedPrincipal — hostile-input safe.
 */

import { deepFreezeHeadlessValue } from "../../domain/headless-deep-freeze";
import {
  guardHeadlessStructure,
  hasUnknownFields,
  isPlainObject,
} from "../../domain/headless-hostile-guard";
import { HEADLESS_MAX_ID_LENGTH } from "../../domain/headless-render-constants";
import {
  cpFail,
  cpOk,
  type HeadlessControlPlaneResult,
} from "../types/control-plane.types";
import type { HeadlessAuthenticatedPrincipal } from "../ports/principal.port";

const PRINCIPAL_FIELDS = Object.freeze(["ownerId", "sessionId"] as const);

const FORBIDDEN_PRINCIPAL_KEYS = Object.freeze([
  "projectIds",
  "draftIds",
  "role",
  "orgId",
  "orgRole",
  "orgSlug",
  "token",
  "sessionClaims",
  "actor",
  "user",
  "session",
  "getToken",
] as const);

function isBoundedId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= HEADLESS_MAX_ID_LENGTH &&
    value === value.trim()
  );
}

function isBoundedSessionId(value: unknown): value is string | null {
  if (value === null) return true;
  return isBoundedId(value);
}

/**
 * Validate, detach, and deep-freeze a narrow authenticated principal.
 * Never retains Clerk token/claims objects.
 */
export function validateHeadlessAuthenticatedPrincipal(
  value: unknown,
): HeadlessControlPlaneResult<HeadlessAuthenticatedPrincipal> {
  try {
    const hostile = guardHeadlessStructure(value);
    if (hostile) {
      return cpFail("HOSTILE_INPUT", "Principal structure rejected.");
    }
    if (!isPlainObject(value)) {
      return cpFail("HOSTILE_INPUT", "Principal must be a plain object.");
    }
    for (const key of Object.keys(value)) {
      if ((FORBIDDEN_PRINCIPAL_KEYS as readonly string[]).includes(key)) {
        return cpFail(
          "HOSTILE_INPUT",
          "Principal contains forbidden authority fields.",
        );
      }
    }
    if (hasUnknownFields(value, PRINCIPAL_FIELDS) != null) {
      return cpFail("UNKNOWN_FIELD", "Principal contains unknown fields.");
    }
    for (const field of PRINCIPAL_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        return cpFail("INVALID_TRANSPORT", "Principal missing required field.");
      }
    }
    if (!isBoundedId(value.ownerId)) {
      return cpFail("UNAUTHENTICATED", "Principal ownerId is invalid.");
    }
    if (!isBoundedSessionId(value.sessionId)) {
      return cpFail("UNAUTHENTICATED", "Principal sessionId is invalid.");
    }

    const detached = deepFreezeHeadlessValue({
      ownerId: value.ownerId,
      sessionId: value.sessionId,
    } satisfies HeadlessAuthenticatedPrincipal);

    return cpOk(detached);
  } catch {
    return cpFail("HOSTILE_INPUT", "Principal validation failed closed.");
  }
}
