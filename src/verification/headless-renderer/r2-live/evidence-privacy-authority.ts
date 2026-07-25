/**
 * Structural privacy authority for R2 live / targeted evidence fixtures.
 * Hostile-input-safe. Exact-key allowlists + value pattern scanning.
 * Does NOT reject safe booleans such as uploadCapabilityIssued.
 */

import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

const FORBIDDEN_EXACT_KEYS = Object.freeze(
  new Set([
    "putUrl",
    "getUrl",
    "downloadUrl",
    "presignedUrl",
    "signedUrl",
    "url",
    "objectKey",
    "bucket",
    "bucketName",
    "storeId",
    "contentDigest",
    "secretAccessKey",
    "accessKeyId",
    "endpoint",
    "providerRevisionId",
    "capabilityToken",
    "signature",
    "credential",
  ]),
);

const FORBIDDEN_VALUE_PATTERNS = Object.freeze([
  /https?:\/\//i,
  /X-Amz-Signature/i,
  /X-Amz-Credential/i,
  /X-Amz-Security-Token/i,
  /\.r2\.cloudflarestorage\.com/i,
  /sha256:[0-9a-f]{64}/i,
  /^sk_/i,
  /^AKIA/i,
]);

const SAFE_TOP_LEVEL_KEYS = Object.freeze(
  new Set([
    "caseId",
    "status",
    "failureCategory",
    "uploadCapabilityIssued",
    "publicObject",
  ]),
);

const SAFE_PUBLIC_OBJECT_KEYS = Object.freeze(
  new Set(["objectId", "purpose", "slotKey", "stage", "expiresAtMs"]),
);

export type R2EvidencePrivacyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

function scanStringValue(value: string): R2EvidencePrivacyResult | null {
  for (const re of FORBIDDEN_VALUE_PATTERNS) {
    if (re.test(value)) {
      return { ok: false, message: "Forbidden URL/signature/credential pattern." };
    }
  }
  return null;
}

function walk(
  node: unknown,
  depth: number,
  pathKey: string | null,
  parentAllowlist: ReadonlySet<string> | null,
): R2EvidencePrivacyResult {
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
    for (let i = 0; i < node.length; i++) {
      const nested = walk(node[i], depth + 1, pathKey, null);
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
    const childAllow =
      key === "publicObject" ? SAFE_PUBLIC_OBJECT_KEYS : null;
    const nested = walk(child, depth + 1, key, childAllow);
    if (!nested.ok) return nested;
  }
  return { ok: true };
}

/**
 * Validate a bounded privacy fixture / evidence fragment.
 * Accepts uploadCapabilityIssued; rejects putUrl and secret-bearing material.
 */
export function assertR2EvidencePrivacyStructure(
  value: unknown,
): R2EvidencePrivacyResult {
  try {
    if (guardHeadlessStructure(value)) {
      return { ok: false, message: "Hostile evidence structure rejected." };
    }
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, message: "Evidence must be a plain object." };
    }
    return walk(value, 0, null, SAFE_TOP_LEVEL_KEYS);
  } catch {
    return { ok: false, message: "Hostile evidence traversal rejected." };
  }
}
