/**
 * Structural privacy authority for Upstash live evidence fixtures.
 * Hostile-input-safe. Exact-key allowlists + value pattern scanning.
 */

import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

const FORBIDDEN_EXACT_KEYS = Object.freeze(
  new Set([
    "restUrl",
    "restToken",
    "tcpUrl",
    "password",
    "token",
    "authorization",
    "DATABASE_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "UPSTASH_REDIS_TCP_URL",
    "UPSTASH_REDIS_REST_URL",
    "connectionString",
    "credential",
    "secret",
    "putUrl",
    "signedUrl",
    "url",
  ]),
);

const FORBIDDEN_VALUE_PATTERNS = Object.freeze([
  /https?:\/\//i,
  /rediss?:\/\//i,
  /postgresql:\/\//i,
  /UPSTASH_REDIS_/i,
  /eyJ[A-Za-z0-9_-]{10,}\./, // JWT-like
  /^sk_/i,
]);

const SAFE_TOP_LEVEL_KEYS = Object.freeze(
  new Set([
    "caseId",
    "status",
    "failureCategory",
    "failureReasonId",
    "protocolVersion",
    "action",
  ]),
);

export type UpstashEvidencePrivacyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

function scanStringValue(value: string): UpstashEvidencePrivacyResult | null {
  for (const re of FORBIDDEN_VALUE_PATTERNS) {
    if (re.test(value)) {
      return {
        ok: false,
        message: "Forbidden URL/credential pattern in evidence.",
      };
    }
  }
  return null;
}

function walk(
  node: unknown,
  depth: number,
  parentAllowlist: ReadonlySet<string> | null,
): UpstashEvidencePrivacyResult {
  if (depth > 16) {
    return { ok: false, message: "Evidence structure exceeds depth." };
  }
  if (node === null || typeof node === "boolean" || typeof node === "number") {
    return { ok: true };
  }
  if (typeof node === "string") {
    const scanned = scanStringValue(node);
    if (scanned) return scanned;
    return { ok: true };
  }
  if (typeof node !== "object") {
    return { ok: false, message: "Unsupported evidence value type." };
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const nested = walk(item, depth + 1, null);
      if (!nested.ok) return nested;
    }
    return { ok: true };
  }

  let keys: string[];
  try {
    keys = Reflect.ownKeys(node as object).filter(
      (k): k is string => typeof k === "string",
    );
  } catch {
    return { ok: false, message: "Hostile evidence keys rejected." };
  }

  for (const key of keys) {
    if (FORBIDDEN_EXACT_KEYS.has(key)) {
      return { ok: false, message: `Forbidden evidence key: ${key}.` };
    }
    if (parentAllowlist != null && !parentAllowlist.has(key)) {
      return { ok: false, message: `Unknown evidence field: ${key}.` };
    }
    let child: unknown;
    try {
      child = (node as Record<string, unknown>)[key];
    } catch {
      return { ok: false, message: "Hostile evidence getter rejected." };
    }
    const nested = walk(child, depth + 1, null);
    if (!nested.ok) return nested;
  }
  return { ok: true };
}

export function assertUpstashEvidencePrivacyStructure(
  value: unknown,
): UpstashEvidencePrivacyResult {
  try {
    if (guardHeadlessStructure(value)) {
      return { ok: false, message: "Hostile evidence structure rejected." };
    }
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, message: "Evidence must be a plain object." };
    }
    return walk(value, 0, SAFE_TOP_LEVEL_KEYS);
  } catch {
    return { ok: false, message: "Hostile evidence traversal rejected." };
  }
}
