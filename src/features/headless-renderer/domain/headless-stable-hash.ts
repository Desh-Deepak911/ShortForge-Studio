/**
 * Deterministic canonical encoding + SHA-256 authority fingerprints.
 * Path-stack cycle detection (shared DAGs OK; true cycles fail closed).
 * Functions/symbols/bigints are rejected — never serialized into authority text.
 */

import { headlessIssue } from "./headless-diagnostics";
import type { HeadlessIntegrityIssue } from "./headless-render.types";
import { headlessSha256Hex } from "./headless-sha256";

export type HeadlessCanonicalEncodeResult =
  | { readonly ok: true; readonly text: string }
  | {
      readonly ok: false;
      readonly issues: readonly HeadlessIntegrityIssue[];
    };

/**
 * Canonical JSON-like encoding with sorted object keys.
 * Shared references produce identical text to independently copied graphs
 * because encoding is structural (values), not identity-based — except true
 * cycles on the current path fail closed.
 */
export function headlessCanonicalEncode(
  value: unknown,
): HeadlessCanonicalEncodeResult {
  try {
    const stack = new WeakSet<object>();
    const text = encodeInternal(value, stack);
    return { ok: true, text };
  } catch (error) {
    if (error instanceof CanonicalEncodeError) {
      return {
        ok: false,
        issues: [headlessIssue(error.code, error.message)],
      };
    }
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_CANONICAL_ENCODING",
          "Canonical encoding failed.",
        ),
      ],
    };
  }
}

class CanonicalEncodeError extends Error {
  readonly code: "INVALID_CANONICAL_ENCODING" | "HOSTILE_INPUT";
  constructor(
    code: "INVALID_CANONICAL_ENCODING" | "HOSTILE_INPUT",
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

function encodeInternal(value: unknown, stack: WeakSet<object>): string {
  if (value === null) return "null";
  if (value === undefined) {
    throw new CanonicalEncodeError(
      "INVALID_CANONICAL_ENCODING",
      "undefined is not allowed in authority encoding.",
    );
  }
  const t = typeof value;
  if (t === "boolean") return value ? "true" : "false";
  if (t === "number") {
    if (!Number.isFinite(value as number)) {
      throw new CanonicalEncodeError(
        "INVALID_CANONICAL_ENCODING",
        "Non-finite numbers are not allowed in authority encoding.",
      );
    }
    return String(value);
  }
  if (t === "string") return JSON.stringify(value);
  if (t === "bigint" || t === "symbol" || t === "function") {
    throw new CanonicalEncodeError(
      "INVALID_CANONICAL_ENCODING",
      "Unsupported value type in authority encoding.",
    );
  }

  if (t === "object") {
    const obj = value as object;
    if (stack.has(obj)) {
      throw new CanonicalEncodeError(
        "HOSTILE_INPUT",
        "Cyclic object graph rejected.",
      );
    }
    stack.add(obj);
    try {
      if (Array.isArray(value)) {
        const parts = value.map((item) => encodeInternal(item, stack));
        return `[${parts.join(",")}]`;
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      const parts = keys.map(
        (key) =>
          `${JSON.stringify(key)}:${encodeInternal(record[key], stack)}`,
      );
      return `{${parts.join(",")}}`;
    } finally {
      stack.delete(obj);
    }
  }

  throw new CanonicalEncodeError(
    "INVALID_CANONICAL_ENCODING",
    "Unsupported value in authority encoding.",
  );
}

/** @deprecated Use headlessCanonicalEncode — kept for tests that expect text or throw. */
export function headlessStableStringify(value: unknown): string {
  const encoded = headlessCanonicalEncode(value);
  if (!encoded.ok) {
    throw new Error(encoded.issues[0]?.message ?? "Canonical encode failed.");
  }
  return encoded.text;
}

export function headlessSha256OfCanonical(payload: unknown): HeadlessCanonicalEncodeResult & {
  hex?: string;
} {
  const encoded = headlessCanonicalEncode(payload);
  if (!encoded.ok) return encoded;
  try {
    return { ok: true, text: encoded.text, hex: headlessSha256Hex(encoded.text) };
  } catch {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_CANONICAL_ENCODING",
          "SHA-256 input length is unsupported for safe authority hashing.",
        ),
      ],
    };
  }
}

export type HeadlessAuthorityKind =
  | "hsrc"
  | "hab"
  | "hrr"
  | "hrj"
  | "hra"
  | "hid";

export const HEADLESS_AUTHORITY_PREFIX: Readonly<
  Record<HeadlessAuthorityKind, string>
> = {
  hsrc: "hsrc:sha256:",
  hab: "hab:sha256:",
  hrr: "hrr:sha256:",
  hrj: "hrj:sha256:",
  hra: "hra:sha256:",
  hid: "hid:sha256:",
};

const AUTHORITY_RE =
  /^(hsrc|hab|hrr|hrj|hra|hid):sha256:[a-f0-9]{64}$/;

export function isHeadlessAuthorityFingerprint(
  value: unknown,
  kind?: HeadlessAuthorityKind,
): value is string {
  if (typeof value !== "string" || !AUTHORITY_RE.test(value)) return false;
  if (kind) return value.startsWith(HEADLESS_AUTHORITY_PREFIX[kind]);
  return true;
}

export function buildHeadlessAuthorityFingerprint(
  kind: HeadlessAuthorityKind,
  payload: unknown,
):
  | { readonly ok: true; readonly fingerprint: string }
  | { readonly ok: false; readonly issues: readonly HeadlessIntegrityIssue[] } {
  const hashed = headlessSha256OfCanonical(payload);
  if (!hashed.ok) return hashed;
  return {
    ok: true,
    fingerprint: `${HEADLESS_AUTHORITY_PREFIX[kind]}${hashed.hex}`,
  };
}

/** Digest of an exact manifest source string for coverage matching. */
export function headlessSourceDigest(source: string): string {
  const built = buildHeadlessAuthorityFingerprint("hsrc", {
    version: 1,
    source,
  });
  if (!built.ok) {
    throw new Error("Failed to digest source.");
  }
  return built.fingerprint;
}

/** Content byte digest format (file bytes) — not an authority kind prefix. */
export const HEADLESS_CONTENT_DIGEST_RE = /^sha256:[a-f0-9]{64}$/;
