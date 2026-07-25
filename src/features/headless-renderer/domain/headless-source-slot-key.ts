/**
 * Canonical Headless source-slot identity (hslot:v2).
 *
 * Encoding: `hslot:v2:` + base64url(utf8(JSON.stringify([
 *   role, sceneId, mediaItemId, sourceDigest
 * ])))
 *
 * JSON null vs "" is preserved for sceneId/mediaItemId. Components may contain
 * any Unicode including U+0000/U+001F; the persisted key never contains raw NUL
 * and is PostgreSQL JSONB-safe. Delimiter joins are not used.
 */

import { HEADLESS_MAX_ID_LENGTH } from "./headless-render-constants";

export const HEADLESS_SOURCE_SLOT_KEY_VERSION = 2 as const;
export const HEADLESS_SOURCE_SLOT_KEY_PREFIX = "hslot:v2:" as const;

/** Absolute bound for a persisted slot-key string. */
export const HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH = 1024;

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

export type HeadlessSourceSlotKeyComponents = {
  readonly role: string;
  readonly sceneId: string | null;
  readonly mediaItemId: string | null;
  readonly sourceDigest: string;
};

export type HeadlessSourceSlotKeyParseResult =
  | { readonly ok: true; readonly components: HeadlessSourceSlotKeyComponents }
  | { readonly ok: false; readonly message: string };

function hasLoneSurrogate(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i += 1;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function isSafeComponentString(value: string, maxLen: number): boolean {
  return (
    typeof value === "string" &&
    value.length <= maxLen &&
    !hasLoneSurrogate(value)
  );
}

function validateComponents(
  slot: HeadlessSourceSlotKeyComponents,
): HeadlessSourceSlotKeyParseResult {
  if (
    !isSafeComponentString(slot.role, HEADLESS_MAX_ID_LENGTH) ||
    slot.role.length === 0
  ) {
    return { ok: false, message: "slot role invalid." };
  }
  if (slot.sceneId !== null && !isSafeComponentString(slot.sceneId, HEADLESS_MAX_ID_LENGTH)) {
    return { ok: false, message: "slot sceneId invalid." };
  }
  if (
    slot.mediaItemId !== null &&
    !isSafeComponentString(slot.mediaItemId, HEADLESS_MAX_ID_LENGTH)
  ) {
    return { ok: false, message: "slot mediaItemId invalid." };
  }
  if (
    !isSafeComponentString(slot.sourceDigest, HEADLESS_MAX_ID_LENGTH + 16) ||
    slot.sourceDigest.length === 0
  ) {
    return { ok: false, message: "slot sourceDigest invalid." };
  }
  return { ok: true, components: slot };
}

function utf8Encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const b64 =
    typeof globalThis.btoa === "function"
      ? globalThis.btoa(binary)
      : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!BASE64URL_RE.test(value) || value.length === 0) return null;
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    if (typeof globalThis.atob === "function") {
      const binary = globalThis.atob(b64);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
      }
      return out;
    }
    return new Uint8Array(Buffer.from(b64, "base64"));
  } catch {
    return null;
  }
}

/**
 * Build a canonical, collision-free, JSONB-safe source-slot key.
 * Distinguishes null versus empty string for sceneId/mediaItemId.
 */
export function headlessSourceSlotKey(
  slot: HeadlessSourceSlotKeyComponents,
): string {
  const validated = validateComponents(slot);
  if (!validated.ok) {
    throw new TypeError(validated.message);
  }
  // Exact tuple order — do not reorder. null remains JSON null.
  const json = JSON.stringify([
    slot.role,
    slot.sceneId,
    slot.mediaItemId,
    slot.sourceDigest,
  ]);
  const encoded = bytesToBase64Url(utf8Encode(json));
  const key = `${HEADLESS_SOURCE_SLOT_KEY_PREFIX}${encoded}`;
  if (
    key.length > HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH ||
    key.includes("\0") ||
    hasLoneSurrogate(key)
  ) {
    throw new TypeError("slot key encoding exceeded safe bounds.");
  }
  return key;
}

export function parseHeadlessSourceSlotKey(
  value: string,
): HeadlessSourceSlotKeyParseResult {
  try {
    if (typeof value !== "string" || value.length === 0) {
      return { ok: false, message: "slot key missing." };
    }
    if (
      value.length > HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH ||
      value.includes("\0") ||
      hasLoneSurrogate(value)
    ) {
      return { ok: false, message: "slot key bounds invalid." };
    }
    if (!value.startsWith(HEADLESS_SOURCE_SLOT_KEY_PREFIX)) {
      return { ok: false, message: "slot key prefix/version invalid." };
    }
    const payload = value.slice(HEADLESS_SOURCE_SLOT_KEY_PREFIX.length);
    const bytes = base64UrlToBytes(payload);
    if (bytes == null) {
      return { ok: false, message: "slot key payload encoding invalid." };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(utf8Decode(bytes)) as unknown;
    } catch {
      return { ok: false, message: "slot key payload JSON invalid." };
    }
    if (!Array.isArray(parsed) || parsed.length !== 4) {
      return { ok: false, message: "slot key tuple shape invalid." };
    }
    const [role, sceneId, mediaItemId, sourceDigest] = parsed;
    if (typeof role !== "string" || typeof sourceDigest !== "string") {
      return { ok: false, message: "slot key tuple types invalid." };
    }
    if (
      !(typeof sceneId === "string" || sceneId === null) ||
      !(typeof mediaItemId === "string" || mediaItemId === null)
    ) {
      return { ok: false, message: "slot key nullable fields invalid." };
    }
    return validateComponents({
      role,
      sceneId,
      mediaItemId,
      sourceDigest,
    });
  } catch {
    return { ok: false, message: "slot key hostile or unreadable." };
  }
}

export function isCanonicalHeadlessSourceSlotKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = parseHeadlessSourceSlotKey(value);
  if (!parsed.ok) return false;
  // Exact recomputation — forged legacy/delimiter keys fail.
  try {
    return headlessSourceSlotKey(parsed.components) === value;
  } catch {
    return false;
  }
}

/**
 * In-memory media-item dedupe identity (not persisted).
 * Same structured-tuple principle; distinguishes adversarial IDs.
 */
export const HEADLESS_MEDIA_ITEM_DEDUPE_PREFIX = "hmitem:v1:" as const;

export function headlessMediaItemDedupeKey(
  sceneId: string,
  mediaItemId: string,
): string {
  if (
    !isSafeComponentString(sceneId, HEADLESS_MAX_ID_LENGTH) ||
    !isSafeComponentString(mediaItemId, HEADLESS_MAX_ID_LENGTH)
  ) {
    throw new TypeError("media item dedupe identity invalid.");
  }
  const json = JSON.stringify([sceneId, mediaItemId]);
  return `${HEADLESS_MEDIA_ITEM_DEDUPE_PREFIX}${bytesToBase64Url(utf8Encode(json))}`;
}
