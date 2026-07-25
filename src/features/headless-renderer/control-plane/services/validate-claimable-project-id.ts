/**
 * Production-claimable project identity — lowercase RFC 4122 UUID v4 only.
 *
 * `crypto.randomUUID()` produces UUID v4. First-claim ownership depends on
 * unguessable project IDs. Short human-readable IDs such as `project-1` fail
 * closed at the production first-claim boundary.
 *
 * Testing-only authorization adapters may accept explicit fixture IDs via their
 * own allowlists; they must not be used as production authority.
 *
 * Future migration seam: already-owned legacy (non-UUID) project IDs must be
 * handled by an explicit ownership migration — this validator does not invent
 * remapping or reassignment.
 */

import { HEADLESS_MAX_ID_LENGTH } from "../../domain/headless-render-constants";
import {
  guardHeadlessStructure,
  isPlainObject,
} from "../../domain/headless-hostile-guard";

/**
 * Canonical lowercase UUID v4 (RFC 4122):
 * xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
 */
const CLAIMABLE_PROJECT_UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isHeadlessClaimableProjectId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === 36 &&
    value.length <= HEADLESS_MAX_ID_LENGTH &&
    value === value.trim() &&
    CLAIMABLE_PROJECT_UUID_V4_RE.test(value)
  );
}

export function validateHeadlessClaimableProjectId(
  value: unknown,
):
  | { readonly ok: true; readonly projectId: string }
  | { readonly ok: false; readonly message: string } {
  try {
    const hostile = guardHeadlessStructure(value);
    if (hostile) {
      return { ok: false, message: "Hostile or unreadable projectId rejected." };
    }
    if (isPlainObject(value) || Array.isArray(value)) {
      return { ok: false, message: "projectId must be a string UUID v4." };
    }
    if (typeof value !== "string") {
      return { ok: false, message: "projectId must be a string UUID v4." };
    }
    if (value.trim().length === 0 || value !== value.trim()) {
      return {
        ok: false,
        message: "projectId must be a non-empty trimmed UUID v4.",
      };
    }
    if (value.length > HEADLESS_MAX_ID_LENGTH) {
      return { ok: false, message: "projectId exceeds maximum length." };
    }
    if (/[A-F]/.test(value)) {
      return {
        ok: false,
        message: "projectId must be lowercase UUID v4.",
      };
    }
    if (!isHeadlessClaimableProjectId(value)) {
      return {
        ok: false,
        message:
          "projectId must be a lowercase UUID v4 (crypto.randomUUID() form).",
      };
    }
    return { ok: true, projectId: value };
  } catch {
    return { ok: false, message: "Hostile or unreadable projectId rejected." };
  }
}
