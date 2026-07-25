/**
 * Total decoder for PostgreSQL BIGINT / int8 wire values.
 *
 * node-postgres-compatible drivers commonly return BIGINT as decimal strings.
 * Canonical TypeScript records still use safe JavaScript numbers.
 */

import { guardHeadlessStructure } from "../../domain/headless-hostile-guard";

export type ParseHeadlessPgSafeIntegerResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly message: string };

const CANONICAL_INT_STRING_RE = /^-?[0-9]+$/;

/**
 * Accept only safe integer numbers or canonical base-10 integer strings.
 */
export function parseHeadlessPgSafeInteger(
  value: unknown,
  options: {
    readonly min: number;
    readonly max?: number;
  },
): ParseHeadlessPgSafeIntegerResult {
  try {
    if (guardHeadlessStructure(value)) {
      return { ok: false, message: "Hostile integer value rejected." };
    }
    if (value === null || value === undefined) {
      return { ok: false, message: "Integer value missing." };
    }
    if (typeof value === "boolean" || typeof value === "bigint") {
      return { ok: false, message: "Integer value type rejected." };
    }
    if (typeof value === "object") {
      return { ok: false, message: "Integer value must be a scalar." };
    }

    let n: number;
    if (typeof value === "number") {
      if (!Number.isInteger(value) || !Number.isSafeInteger(value)) {
        return { ok: false, message: "Integer value is not a safe integer." };
      }
      n = value;
    } else if (typeof value === "string") {
      if (value.length === 0 || value !== value.trim()) {
        return { ok: false, message: "Integer string is empty or has whitespace." };
      }
      if (!CANONICAL_INT_STRING_RE.test(value)) {
        return {
          ok: false,
          message: "Integer string must be canonical base-10 digits.",
        };
      }
      // Reject leading junk / scientific notation already covered by regex.
      // Number() on huge ints loses precision — gate with safe-integer check.
      if (value.length > 16 && value.replace(/^-/, "").length > 15) {
        // Still parse carefully: compare against MAX_SAFE_INTEGER digit string.
        const abs = value.startsWith("-") ? value.slice(1) : value;
        const maxAbs = String(Number.MAX_SAFE_INTEGER);
        if (abs.length > maxAbs.length || (abs.length === maxAbs.length && abs > maxAbs)) {
          return { ok: false, message: "Integer string exceeds safe range." };
        }
      }
      n = Number(value);
      if (!Number.isInteger(n) || !Number.isSafeInteger(n)) {
        return { ok: false, message: "Integer string is not a safe integer." };
      }
      // Reject signed zero variants inconsistently represented? "-0" → 0 OK.
      if (String(n) !== value && !(n === 0 && (value === "0" || value === "-0"))) {
        // Canonical form: disallow leading zeros like "01" except for 0 itself.
        if (/^-?0[0-9]/.test(value)) {
          return { ok: false, message: "Integer string has leading zeros." };
        }
        // For normal values String(n) should match unless -0.
        if (!(n === 0 && value === "-0")) {
          return { ok: false, message: "Integer string is not canonical." };
        }
      }
    } else {
      return { ok: false, message: "Integer value type rejected." };
    }

    if (n < options.min) {
      return { ok: false, message: "Integer value below field minimum." };
    }
    if (options.max !== undefined && n > options.max) {
      return { ok: false, message: "Integer value above field maximum." };
    }
    if (n < Number.MIN_SAFE_INTEGER || n > Number.MAX_SAFE_INTEGER) {
      return { ok: false, message: "Integer value outside safe range." };
    }
    return { ok: true, value: n };
  } catch {
    return { ok: false, message: "Hostile integer value rejected." };
  }
}

/** Nullable BIGINT column — SQL NULL stays null; otherwise decode. */
export function parseHeadlessPgSafeIntegerOrNull(
  value: unknown,
  options: {
    readonly min: number;
    readonly max?: number;
  },
):
  | { readonly ok: true; readonly value: number | null }
  | { readonly ok: false; readonly message: string } {
  if (value === null) {
    return { ok: true, value: null };
  }
  const parsed = parseHeadlessPgSafeInteger(value, options);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value };
}
