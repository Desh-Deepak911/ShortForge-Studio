/**
 * Exact pending-entry probe authority (Sprint 11E 2D.1D.2).
 *
 * Redis: XPENDING <stream> <group> <streamId> <streamId> 1
 * Never scan "-" "+" 100. Never map exceptions to pending=false.
 */

export type HeadlessPendingProbeResult =
  | {
      readonly ok: true;
      readonly pending: true;
      readonly consumerMatched?: boolean;
    }
  | { readonly ok: true; readonly pending: false }
  | { readonly ok: false; readonly reasonId: "pending_probe_failed" };

/**
 * Interpret an exact-range XPENDING response for one expected stream ID.
 * Does not echo consumer names, stream IDs, idle, or delivery counts.
 */
export function interpretExactXpendingResponse(
  raw: unknown,
  expectedStreamId: string,
): HeadlessPendingProbeResult {
  if (expectedStreamId.length === 0) {
    return { ok: false, reasonId: "pending_probe_failed" };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, reasonId: "pending_probe_failed" };
  }
  if (raw.length === 0) {
    return { ok: true, pending: false };
  }
  if (raw.length !== 1) {
    return { ok: false, reasonId: "pending_probe_failed" };
  }
  const row = raw[0];
  if (!Array.isArray(row) || row.length < 1) {
    return { ok: false, reasonId: "pending_probe_failed" };
  }
  const returnedId = String(row[0] ?? "");
  if (returnedId.length === 0) {
    return { ok: false, reasonId: "pending_probe_failed" };
  }
  if (returnedId !== expectedStreamId) {
    return { ok: false, reasonId: "pending_probe_failed" };
  }
  return { ok: true, pending: true };
}

/** Fail-closed boolean: only true when probe confirms pending. Errors → false. */
export function pendingProbeToDeprecatedBoolean(
  result: HeadlessPendingProbeResult,
): boolean {
  return result.ok === true && result.pending === true;
}
