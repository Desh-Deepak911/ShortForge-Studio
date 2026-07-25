/**
 * Exact Redis key existence probe (Sprint 11E 2D.1F.1).
 *
 * Redis: EXISTS <key>
 * Never encode provider/malformed/unconfigured failure as absence.
 */

export type HeadlessKeyProbeResult =
  | { readonly ok: true; readonly exists: true }
  | { readonly ok: true; readonly exists: false }
  | { readonly ok: false; readonly reasonId: "key_probe_failed" };

/**
 * Interpret EXISTS response for exactly one key.
 * Accepts only safe integer 0 or 1 (or equivalent bigint).
 */
export function interpretExistsResponse(raw: unknown): HeadlessKeyProbeResult {
  if (typeof raw === "bigint") {
    if (raw === BigInt(0)) return { ok: true, exists: false };
    if (raw === BigInt(1)) return { ok: true, exists: true };
    return { ok: false, reasonId: "key_probe_failed" };
  }
  if (typeof raw === "number") {
    if (!Number.isSafeInteger(raw)) {
      return { ok: false, reasonId: "key_probe_failed" };
    }
    if (raw === 0) return { ok: true, exists: false };
    if (raw === 1) return { ok: true, exists: true };
    return { ok: false, reasonId: "key_probe_failed" };
  }
  if (typeof raw === "string") {
    if (raw === "0") return { ok: true, exists: false };
    if (raw === "1") return { ok: true, exists: true };
    return { ok: false, reasonId: "key_probe_failed" };
  }
  return { ok: false, reasonId: "key_probe_failed" };
}

export type HeadlessKeyDeleteResult =
  | { readonly ok: true; readonly deletedCount: 0 | 1 }
  | { readonly ok: false; readonly reasonId: "key_delete_failed" };

/**
 * Interpret DEL response for exactly one key.
 * Accepts only safe integer 0 or 1.
 */
export function interpretDelResponse(raw: unknown): HeadlessKeyDeleteResult {
  let n: number;
  if (typeof raw === "bigint") {
    if (raw === BigInt(0)) n = 0;
    else if (raw === BigInt(1)) n = 1;
    else return { ok: false, reasonId: "key_delete_failed" };
  } else if (typeof raw === "number") {
    if (!Number.isSafeInteger(raw) || raw < 0 || raw > 1) {
      return { ok: false, reasonId: "key_delete_failed" };
    }
    n = raw;
  } else if (typeof raw === "string") {
    if (raw === "0") n = 0;
    else if (raw === "1") n = 1;
    else return { ok: false, reasonId: "key_delete_failed" };
  } else {
    return { ok: false, reasonId: "key_delete_failed" };
  }
  return { ok: true, deletedCount: n as 0 | 1 };
}
