/**
 * Exact stream-entry presence probe (Sprint 11E 2D.1E).
 *
 * Redis: XRANGE <stream> <streamId> <streamId> COUNT 1
 * Never treat provider failure as absent.
 */

export type HeadlessStreamPresenceProbeResult =
  | { readonly ok: true; readonly present: true }
  | { readonly ok: true; readonly present: false }
  | { readonly ok: false; readonly reasonId: "stream_presence_probe_failed" };

/**
 * Interpret an exact-range XRANGE response for one expected stream ID.
 * Does not echo fields or stream IDs into evidence.
 */
export function interpretExactXrangeResponse(
  raw: unknown,
  expectedStreamId: string,
): HeadlessStreamPresenceProbeResult {
  if (expectedStreamId.length === 0) {
    return { ok: false, reasonId: "stream_presence_probe_failed" };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, reasonId: "stream_presence_probe_failed" };
  }
  if (raw.length === 0) {
    return { ok: true, present: false };
  }
  if (raw.length !== 1) {
    return { ok: false, reasonId: "stream_presence_probe_failed" };
  }
  const row = raw[0];
  if (!Array.isArray(row) || row.length < 1) {
    return { ok: false, reasonId: "stream_presence_probe_failed" };
  }
  const returnedId = String(row[0] ?? "");
  if (returnedId.length === 0 || returnedId !== expectedStreamId) {
    return { ok: false, reasonId: "stream_presence_probe_failed" };
  }
  return { ok: true, present: true };
}
