/**
 * Server-side R2 object key derivation — never uses raw filenames or client keys.
 * Identity hashes are first 16 hex of sha256(id); slotSeg is "none" or hash(slotKey).
 */

import { createHash } from "node:crypto";

import type { HeadlessOwnedObjectPurpose } from "../types/owned-object-record";

export type HeadlessR2EnvironmentNamespace =
  | "staging"
  | "production"
  | "test";

export type HeadlessR2ObjectNamespace = "staging" | "finalized";

export type HeadlessR2ObjectKeyInput = {
  readonly environmentNamespace: HeadlessR2EnvironmentNamespace;
  readonly objectNamespace: HeadlessR2ObjectNamespace;
  readonly ownerId: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly operationId: string;
  readonly purpose: HeadlessOwnedObjectPurpose;
  readonly slotKey: string | null;
  /** 32 hex chars from randomBytes(16). */
  readonly nonce: string;
};

export type HeadlessR2ObjectKeyResult =
  | {
      readonly ok: true;
      readonly objectKey: string;
      readonly storeId: "assets" | "artifacts";
    }
  | { readonly ok: false; readonly message: string };

const MAX_ID_LENGTH = 128;
const MAX_OBJECT_KEY_LENGTH = 1024;
const NONCE_RE = /^[0-9a-f]{32}$/;
const PURPOSE_SET = new Set<string>([
  "manifest",
  "asset_bundle_record",
  "asset_bytes",
  "artifact",
]);
const ENV_SET = new Set<string>(["staging", "production", "test"]);
const OBJ_NS_SET = new Set<string>(["staging", "finalized"]);

function hashIdSegment(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function isBoundedId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    value === value.trim() &&
    !/\s/.test(value) &&
    !value.includes("..") &&
    !value.includes("/") &&
    !value.includes("\\")
  );
}

function reject(message: string): HeadlessR2ObjectKeyResult {
  return { ok: false, message };
}

function storeIdForPurpose(
  purpose: HeadlessOwnedObjectPurpose,
): "assets" | "artifacts" {
  return purpose === "artifact" ? "artifacts" : "assets";
}

/**
 * Derive a canonical private object key. Never embeds raw owner/project/job ids.
 */
export function deriveHeadlessR2ObjectKey(
  input: HeadlessR2ObjectKeyInput,
): HeadlessR2ObjectKeyResult {
  try {
    if (input == null || typeof input !== "object") {
      return reject("Object key derivation rejected hostile input.");
    }
    if (!ENV_SET.has(input.environmentNamespace)) {
      return reject("Object key derivation rejected unknown environment namespace.");
    }
    if (!OBJ_NS_SET.has(input.objectNamespace)) {
      return reject("Object key derivation rejected unknown object namespace.");
    }
    if (!PURPOSE_SET.has(input.purpose)) {
      return reject("Object key derivation rejected unknown purpose.");
    }
    if (!isBoundedId(input.ownerId)) {
      return reject("Object key derivation rejected owner identity.");
    }
    if (!isBoundedId(input.projectId)) {
      return reject("Object key derivation rejected project identity.");
    }
    if (!isBoundedId(input.jobId)) {
      return reject("Object key derivation rejected job identity.");
    }
    if (!isBoundedId(input.operationId)) {
      return reject("Object key derivation rejected operation identity.");
    }
    if (typeof input.nonce !== "string" || !NONCE_RE.test(input.nonce)) {
      return reject("Object key derivation rejected nonce.");
    }
    if (input.slotKey !== null) {
      if (
        typeof input.slotKey !== "string" ||
        input.slotKey.length === 0 ||
        input.slotKey.length > MAX_ID_LENGTH ||
        input.slotKey !== input.slotKey.trim() ||
        /\s/.test(input.slotKey) ||
        input.slotKey.includes("..") ||
        input.slotKey.includes("/") ||
        input.slotKey.includes("\\")
      ) {
        return reject("Object key derivation rejected slot identity.");
      }
    }

    const storeId = storeIdForPurpose(input.purpose);
    const hOwner = hashIdSegment(input.ownerId);
    const hProject = hashIdSegment(input.projectId);
    const hJob = hashIdSegment(input.jobId);
    const hOp = hashIdSegment(input.operationId);
    const slotSeg =
      input.slotKey == null ? "none" : hashIdSegment(input.slotKey);

    const objectKey = [
      input.environmentNamespace,
      input.objectNamespace,
      storeId,
      input.purpose,
      hOwner,
      hProject,
      hJob,
      hOp,
      slotSeg,
      input.nonce,
    ].join("/");

    if (
      objectKey.length === 0 ||
      objectKey.length > MAX_OBJECT_KEY_LENGTH ||
      objectKey.includes("//") ||
      objectKey.includes("..") ||
      objectKey.startsWith("/") ||
      objectKey.endsWith("/")
    ) {
      return reject("Object key derivation produced unsafe key.");
    }

    return Object.freeze({
      ok: true as const,
      objectKey,
      storeId,
    });
  } catch {
    return reject("Object key derivation rejected hostile input.");
  }
}

/**
 * Recompute canonical key for identity checks (same inputs → same key).
 */
export function recomputeHeadlessR2ObjectKey(
  input: HeadlessR2ObjectKeyInput,
): HeadlessR2ObjectKeyResult {
  return deriveHeadlessR2ObjectKey(input);
}
