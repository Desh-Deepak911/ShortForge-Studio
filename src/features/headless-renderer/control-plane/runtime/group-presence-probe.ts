/**
 * Exact consumer-group list / presence probe authority (Sprint 11E 2D.1E.3).
 *
 * Redis: XINFO GROUPS <stream>
 * Never encode provider failure / malformed response as an empty group list.
 */

export type HeadlessQaGroupInfo = {
  readonly name: string;
  readonly lastDeliveredId: string;
  readonly pending: number;
  readonly consumers: number;
};

export type HeadlessGroupListProbeResult =
  | { readonly ok: true; readonly groups: readonly HeadlessQaGroupInfo[] }
  | { readonly ok: false; readonly reasonId: "group_probe_failed" };

export type HeadlessGroupPresenceProbeResult =
  | { readonly ok: true; readonly present: true }
  | { readonly ok: true; readonly present: false }
  | { readonly ok: false; readonly reasonId: "group_probe_failed" };

const MAX_GROUP_NAME_LEN = 256;
const MAX_STREAM_ID_LEN = 64;
const STREAM_ID_RE = /^\d+-\d+$/;

function isSafeNonNegInt(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0;
}

function isBoundedGroupName(name: string): boolean {
  if (name.length === 0 || name.length > MAX_GROUP_NAME_LEN) return false;
  if (/[\0-\x1f\x7f]/.test(name)) return false;
  return true;
}

function isBoundedStreamId(id: string): boolean {
  if (id.length === 0 || id.length > MAX_STREAM_ID_LEN) return false;
  return STREAM_ID_RE.test(id);
}

function parseXinfoGroupRow(row: unknown): HeadlessQaGroupInfo | null {
  if (!Array.isArray(row) || row.length < 2) return null;
  const map = new Map<string, unknown>();
  for (let i = 0; i + 1 < row.length; i += 2) {
    map.set(String(row[i]), row[i + 1]);
  }
  const name = map.get("name");
  const lastDelivered = map.get("last-delivered-id");
  const pendingRaw = map.get("pending");
  const consumersRaw = map.get("consumers");
  if (typeof name !== "string" && typeof name !== "number") return null;
  const nameStr = String(name);
  if (!isBoundedGroupName(nameStr)) return null;

  if (typeof lastDelivered !== "string" && typeof lastDelivered !== "number") {
    return null;
  }
  const lastDeliveredId = String(lastDelivered);
  if (!isBoundedStreamId(lastDeliveredId)) return null;

  const pending = Number(pendingRaw);
  const consumers = Number(consumersRaw);
  if (!isSafeNonNegInt(pending) || !isSafeNonNegInt(consumers)) return null;

  return Object.freeze({
    name: nameStr,
    lastDeliveredId,
    pending,
    consumers,
  });
}

/**
 * Interpret an XINFO GROUPS response into a result-bearing list.
 * Empty valid array → confirmed success with zero groups (not a probe failure).
 */
export function interpretXinfoGroupsResponse(
  raw: unknown,
): HeadlessGroupListProbeResult {
  if (!Array.isArray(raw)) {
    return { ok: false, reasonId: "group_probe_failed" };
  }
  const groups: HeadlessQaGroupInfo[] = [];
  for (const row of raw) {
    const parsed = parseXinfoGroupRow(row);
    if (parsed == null) {
      return { ok: false, reasonId: "group_probe_failed" };
    }
    groups.push(parsed);
  }
  return { ok: true, groups: Object.freeze(groups.slice()) };
}

/**
 * Exact presence of one group name against a list-probe result.
 * Propagates probe failure; never treats failure as absent.
 */
export function interpretGroupPresence(
  list: HeadlessGroupListProbeResult,
  groupName: string,
): HeadlessGroupPresenceProbeResult {
  if (!list.ok) {
    return { ok: false, reasonId: "group_probe_failed" };
  }
  if (!isBoundedGroupName(groupName)) {
    return { ok: false, reasonId: "group_probe_failed" };
  }
  const hits = list.groups.filter((g) => g.name === groupName);
  if (hits.length > 1) {
    return { ok: false, reasonId: "group_probe_failed" };
  }
  if (hits.length === 1) {
    return { ok: true, present: true };
  }
  return { ok: true, present: false };
}
