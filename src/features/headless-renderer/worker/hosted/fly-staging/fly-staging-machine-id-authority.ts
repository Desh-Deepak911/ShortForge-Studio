/**
 * Sprint 11E Phase 2E.2D.8A.2 — canonical bounded Fly Machine ID authority (local).
 *
 * Single parser for quiet list lines, machine list JSON rows, and dual inventory.
 * Compatible with accepted fly-staging-machine-authority `[a-z0-9]{8,}` semantics
 * with an explicit upper bound and hostile-input rejection.
 */

import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

/** Minimum length — matches pre-2E.2D.8A.2 fly-staging-machine-authority. */
export const HEADLESS_FLY_STAGING_MACHINE_ID_MIN_LENGTH = 8 as const;

/** Maximum length — bounds provider/hostile oversized identifiers. */
export const HEADLESS_FLY_STAGING_MACHINE_ID_MAX_LENGTH = 32 as const;

/** Canonical bounded pattern: lowercase hexadecimal-ish Fly machine ids. */
export const HEADLESS_FLY_STAGING_MACHINE_ID_RE = /^[a-z0-9]{8,32}$/i;

export type HeadlessFlyStagingMachineIdReasonId =
  | "ok"
  | "blank"
  | "short"
  | "oversized"
  | "non_alphanumeric"
  | "whitespace"
  | "control_character"
  | "hostile_input";

export type HeadlessFlyStagingMachineIdParse =
  | {
      readonly ok: true;
      readonly machineId: string;
      readonly reasonId: "ok";
    }
  | {
      readonly ok: false;
      readonly machineId: null;
      readonly reasonId: Exclude<
        HeadlessFlyStagingMachineIdReasonId,
        "ok"
      >;
    };

function reject(
  reasonId: Exclude<HeadlessFlyStagingMachineIdReasonId, "ok">,
): HeadlessFlyStagingMachineIdParse {
  return Object.freeze({ ok: false, machineId: null, reasonId });
}

/**
 * Parse and validate a detached Fly Machine identifier.
 * Never throws; returns null machineId when invalid.
 */
export function parseHeadlessFlyStagingMachineId(
  value: unknown,
): HeadlessFlyStagingMachineIdParse {
  try {
    if (guardHeadlessStructure(value) != null) {
      return reject("hostile_input");
    }
    if (value == null) {
      return reject("blank");
    }
    if (typeof value !== "string") {
      return reject("hostile_input");
    }
    if (value.length === 0) {
      return reject("blank");
    }
    if (/[\u0000-\u001F\u007F]/.test(value)) {
      return reject("control_character");
    }
    if (/\s/.test(value)) {
      return reject("whitespace");
    }
    if (value.length < HEADLESS_FLY_STAGING_MACHINE_ID_MIN_LENGTH) {
      return reject("short");
    }
    if (value.length > HEADLESS_FLY_STAGING_MACHINE_ID_MAX_LENGTH) {
      return reject("oversized");
    }
    if (!HEADLESS_FLY_STAGING_MACHINE_ID_RE.test(value)) {
      return reject("non_alphanumeric");
    }
    return Object.freeze({
      ok: true,
      machineId: value,
      reasonId: "ok",
    });
  } catch {
    return reject("hostile_input");
  }
}

export function isHeadlessFlyStagingMachineId(value: unknown): value is string {
  return parseHeadlessFlyStagingMachineId(value).ok;
}
