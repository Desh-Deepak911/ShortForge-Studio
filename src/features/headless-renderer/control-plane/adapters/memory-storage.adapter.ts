/**
 * Deterministic in-memory storage adapter — verification / QA only.
 * Not a production durable provider.
 *
 * Hardening (11C.1 / 11C.1A):
 * - collision-safe structured locator keys
 * - byte copies on write/open (caller mutation cannot alter store)
 * - finalized objects fail closed on byte/metadata drift (no silent rewrite)
 */

import { createHash, randomUUID } from "node:crypto";

import type { HeadlessStorageLocatorIdentity } from "../../domain/headless-render.types";
import { HEADLESS_CONTENT_DIGEST_RE } from "../../domain/headless-stable-hash";
import { cpFail, cpOk } from "../types/control-plane.types";
import type {
  HeadlessObjectMetadata,
  HeadlessOwnedObjectBytes,
  HeadlessStoragePort,
  HeadlessUploadSession,
} from "../ports/storage.port";

interface StoredObject {
  metadata: HeadlessObjectMetadata;
  bytes: Uint8Array | null;
  capabilityToken: string | null;
  /** Trusted worker claims for artifacts — fail-closed on stream/write. */
  expectedContentDigest: string | null;
  expectedByteLength: number | null;
}

function digestOf(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/** Collision-safe structured key — not delimiter concatenation. */
export function memoryStorageLocatorKey(
  locator: HeadlessStorageLocatorIdentity,
): string {
  return JSON.stringify({
    kind: locator.kind,
    storeId: locator.storeId,
    objectKey: locator.objectKey,
  });
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function freezeMetadata(meta: HeadlessObjectMetadata): HeadlessObjectMetadata {
  return Object.freeze({
    ...meta,
    locator: Object.freeze({ ...meta.locator }),
  });
}

export class MemoryHeadlessStorageAdapter implements HeadlessStoragePort {
  private readonly objects = new Map<string, StoredObject>();
  private readonly capabilities = new Map<string, string>(); // token → locatorKey
  /** Test-only: artificial delay inside openOwnedObject for cancel races. */
  openDelayMs = 0;
  /** Test-only: force deleteObject to fail (post-finalization cleanup fixtures). */
  testingDeleteFail = false;
  /** Test-only: force presence probe failure (unknown — not absent). */
  testingProbeFail = false;

  async createUploadSession(input: {
    ownerId: string;
    projectId: string;
    purpose: HeadlessUploadSession["purpose"];
    mimeType: string;
    expiresAtMs: number;
    expectedContentDigest?: string;
    expectedByteLength?: number;
  }) {
    if (input.purpose === "artifact") {
      if (
        typeof input.expectedContentDigest !== "string" ||
        !HEADLESS_CONTENT_DIGEST_RE.test(input.expectedContentDigest)
      ) {
        return cpFail(
          "HOSTILE_INPUT",
          "Artifact upload requires trusted expectedContentDigest.",
        );
      }
      if (
        typeof input.expectedByteLength !== "number" ||
        !Number.isSafeInteger(input.expectedByteLength) ||
        input.expectedByteLength < 1
      ) {
        return cpFail(
          "HOSTILE_INPUT",
          "Artifact upload requires trusted expectedByteLength.",
        );
      }
    }
    const locator: HeadlessStorageLocatorIdentity = {
      kind: "object_storage",
      // Artifact purpose uses the opaque artifacts store role (parity with production).
      storeId: input.purpose === "artifact" ? "artifacts" : "memory-store",
      objectKey: `${input.purpose}/${input.ownerId}/${input.projectId}/${randomUUID()}`,
    };
    const capabilityToken = `cap_${randomUUID()}`;
    const key = memoryStorageLocatorKey(locator);
    const metadata = freezeMetadata({
      locator,
      ownerId: input.ownerId,
      projectId: input.projectId,
      purpose: input.purpose,
      contentDigest: "sha256:" + "0".repeat(64),
      byteLength: 0,
      mimeType: input.mimeType,
      expiresAtMs: input.expiresAtMs,
      finalized: false,
    });
    this.objects.set(key, {
      metadata,
      bytes: null,
      capabilityToken,
      expectedContentDigest:
        input.purpose === "artifact" ? input.expectedContentDigest! : null,
      expectedByteLength:
        input.purpose === "artifact" ? input.expectedByteLength! : null,
    });
    this.capabilities.set(capabilityToken, key);
    return cpOk({
      capabilityToken,
      locator: Object.freeze({ ...locator }),
      ownerId: input.ownerId,
      projectId: input.projectId,
      purpose: input.purpose,
      expiresAtMs: input.expiresAtMs,
    } satisfies HeadlessUploadSession);
  }

  async writeUploadBytes(input: { capabilityToken: string; bytes: Uint8Array }) {
    const key = this.capabilities.get(input.capabilityToken);
    if (!key) return cpFail("MANIFEST_NOT_FOUND", "Upload session not found.");
    const obj = this.objects.get(key);
    if (!obj || obj.metadata.finalized) {
      return cpFail("MANIFEST_NOT_FOUND", "Upload session not writable.");
    }
    if (obj.bytes != null) {
      return cpFail("HOSTILE_INPUT", "Upload session already has bytes.");
    }
    if (
      obj.expectedByteLength != null &&
      input.bytes.byteLength !== obj.expectedByteLength
    ) {
      return cpFail("HOSTILE_INPUT", "Upload length does not match session claim.");
    }
    const stored = copyBytes(input.bytes);
    const digest = digestOf(stored);
    if (
      obj.expectedContentDigest != null &&
      digest !== obj.expectedContentDigest
    ) {
      return cpFail("MANIFEST_DIGEST_MISMATCH", "Uploaded digest mismatch.");
    }
    obj.bytes = stored;
    obj.metadata = freezeMetadata({
      ...obj.metadata,
      byteLength: stored.byteLength,
      contentDigest: digest,
    });
    return cpOk({ byteLength: stored.byteLength });
  }

  /**
   * Test adapter may accumulate bytes internally — production code must not
   * depend on that accumulation behavior.
   */
  async writeUploadStream(input: {
    capabilityToken: string;
    expectedByteLength: number;
    maxBytes: number;
    signal?: AbortSignal;
    chunks: AsyncIterable<Uint8Array>;
  }) {
    const key = this.capabilities.get(input.capabilityToken);
    if (!key) return cpFail("MANIFEST_NOT_FOUND", "Upload session not found.");
    const obj = this.objects.get(key);
    if (!obj || obj.metadata.finalized) {
      return cpFail("MANIFEST_NOT_FOUND", "Upload session not writable.");
    }
    if (obj.bytes != null) {
      return cpFail("HOSTILE_INPUT", "Upload session already has bytes.");
    }
    if (
      !Number.isSafeInteger(input.expectedByteLength) ||
      input.expectedByteLength < 1 ||
      !Number.isSafeInteger(input.maxBytes) ||
      input.maxBytes < 1 ||
      input.expectedByteLength > input.maxBytes
    ) {
      return cpFail("HOSTILE_INPUT", "Invalid streamed upload length bounds.");
    }
    if (
      obj.expectedByteLength != null &&
      input.expectedByteLength !== obj.expectedByteLength
    ) {
      return cpFail(
        "HOSTILE_INPUT",
        "Streamed upload length does not match session claim.",
      );
    }
    if (input.signal?.aborted) {
      return cpFail("OPERATION_ABORTED", "Streamed upload aborted before start.");
    }

    const parts: Uint8Array[] = [];
    let byteLength = 0;
    let chunkCount = 0;
    let peakChunkBytes = 0;

    try {
      for await (const chunk of input.chunks) {
        if (input.signal?.aborted) {
          return cpFail("OPERATION_ABORTED", "Streamed upload aborted.");
        }
        if (!(chunk instanceof Uint8Array)) {
          return cpFail("HOSTILE_INPUT", "Upload chunk must be Uint8Array.");
        }
        const len = chunk.byteLength;
        if (len < 1) continue;
        chunkCount += 1;
        if (len > peakChunkBytes) peakChunkBytes = len;
        if (byteLength + len > input.maxBytes) {
          return cpFail("BODY_TOO_LARGE", "Upload exceeded maxBytes.");
        }
        if (byteLength + len > input.expectedByteLength) {
          return cpFail("BODY_TOO_LARGE", "Upload exceeded expectedByteLength.");
        }
        parts.push(copyBytes(chunk));
        byteLength += len;
      }
    } catch {
      if (input.signal?.aborted) {
        return cpFail("OPERATION_ABORTED", "Streamed upload aborted.");
      }
      return cpFail("INTERNAL_ERROR", "Streamed upload source failed.");
    }

    if (obj.bytes != null) {
      return cpFail("HOSTILE_INPUT", "Duplicate streamed upload completion.");
    }
    if (byteLength < 1) {
      return cpFail("HOSTILE_INPUT", "Zero-byte streamed upload rejected.");
    }
    if (byteLength !== input.expectedByteLength) {
      return cpFail(
        "HOSTILE_INPUT",
        "Streamed upload byte count does not match expectedByteLength.",
      );
    }

    const stored = new Uint8Array(byteLength);
    let offset = 0;
    for (const part of parts) {
      stored.set(part, offset);
      offset += part.byteLength;
    }
    const digest = digestOf(stored);
    if (
      obj.expectedContentDigest != null &&
      digest !== obj.expectedContentDigest
    ) {
      return cpFail("MANIFEST_DIGEST_MISMATCH", "Uploaded digest mismatch.");
    }
    obj.bytes = stored;
    obj.metadata = freezeMetadata({
      ...obj.metadata,
      byteLength: stored.byteLength,
      contentDigest: digest,
    });
    return cpOk({
      byteLength: stored.byteLength,
      chunkCount,
      peakChunkBytes,
    });
  }

  async finalizeUploadedObject(input: {
    capabilityToken: string;
    expectedContentDigest: string;
  }) {
    const key = this.capabilities.get(input.capabilityToken);
    if (!key) return cpFail("MANIFEST_NOT_FOUND", "Upload session not found.");
    const obj = this.objects.get(key);
    if (!obj || !obj.bytes) {
      return cpFail("MANIFEST_NOT_FOUND", "No uploaded bytes to finalize.");
    }
    const digest = digestOf(obj.bytes);
    if (digest !== input.expectedContentDigest) {
      return cpFail("MANIFEST_DIGEST_MISMATCH", "Uploaded digest mismatch.");
    }
    obj.metadata = freezeMetadata({
      ...obj.metadata,
      contentDigest: digest,
      byteLength: obj.bytes.byteLength,
      finalized: true,
    });
    obj.capabilityToken = null;
    this.capabilities.delete(input.capabilityToken);
    return cpOk(freezeMetadata(obj.metadata));
  }

  async readObjectMetadata(
    locator: HeadlessStorageLocatorIdentity,
    ownerId: string,
  ) {
    const obj = this.objects.get(memoryStorageLocatorKey(locator));
    if (!obj || !obj.metadata.finalized) {
      return cpFail("MANIFEST_NOT_FOUND", "Owned object not found.");
    }
    if (obj.metadata.ownerId !== ownerId) {
      return cpFail("OBJECT_OWNERSHIP_MISMATCH", "Object ownership mismatch.");
    }
    // Finalized objects: recompute digest/length; fail closed on drift — never rewrite metadata.
    if (obj.bytes) {
      const actual = digestOf(obj.bytes);
      if (
        obj.metadata.contentDigest !== actual ||
        obj.metadata.byteLength !== obj.bytes.byteLength
      ) {
        return cpFail(
          "OBJECT_INTEGRITY_FAILED",
          "Finalized object metadata does not match stored bytes.",
        );
      }
    }
    return cpOk(freezeMetadata(obj.metadata));
  }

  async openOwnedObject(
    locator: HeadlessStorageLocatorIdentity,
    ownerId: string,
    nowMs?: number,
    options?: {
      readonly signal?: AbortSignal;
      readonly maxBytes?: number;
    },
  ) {
    if (options?.signal?.aborted) {
      return cpFail("OPERATION_ABORTED", "Open aborted before read.");
    }
    const meta = await this.readObjectMetadata(locator, ownerId);
    if (!meta.ok) return meta;
    if (options?.signal?.aborted) {
      return cpFail("OPERATION_ABORTED", "Open aborted after metadata.");
    }
    if (nowMs != null && nowMs > meta.value.expiresAtMs) {
      return cpFail("MANIFEST_EXPIRED", "Owned object expired.");
    }
    if (
      options?.maxBytes != null &&
      Number.isSafeInteger(options.maxBytes) &&
      meta.value.byteLength > options.maxBytes
    ) {
      return cpFail("BODY_TOO_LARGE", "Owned object exceeds maxBytes.");
    }
    const obj = this.objects.get(memoryStorageLocatorKey(locator));
    if (!obj?.bytes) return cpFail("MANIFEST_NOT_FOUND", "Object bytes missing.");
    if (this.openDelayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.openDelayMs));
    }
    if (options?.signal?.aborted) {
      return cpFail("OPERATION_ABORTED", "Open aborted before bytes return.");
    }
    return cpOk({
      metadata: freezeMetadata(obj.metadata),
      bytes: copyBytes(obj.bytes),
    } satisfies HeadlessOwnedObjectBytes);
  }

  async verifyObjectDigest(input: {
    locator: HeadlessStorageLocatorIdentity;
    ownerId: string;
    expectedContentDigest: string;
    nowMs: number;
  }) {
    const opened = await this.openOwnedObject(
      input.locator,
      input.ownerId,
      input.nowMs,
    );
    if (!opened.ok) return opened;
    const actual = digestOf(opened.value.bytes);
    if (actual !== input.expectedContentDigest) {
      return cpFail("MANIFEST_DIGEST_MISMATCH", "Object digest mismatch.");
    }
    if (opened.value.metadata.contentDigest !== actual) {
      return cpFail("MANIFEST_DIGEST_MISMATCH", "Metadata digest drift.");
    }
    return cpOk(freezeMetadata(opened.value.metadata));
  }

  async deleteObject(locator: HeadlessStorageLocatorIdentity, ownerId: string) {
    if (this.testingDeleteFail) {
      return cpFail("INTERNAL_ERROR", "forced delete failure");
    }
    const key = memoryStorageLocatorKey(locator);
    const obj = this.objects.get(key);
    if (!obj) return cpOk(true as const);
    if (obj.metadata.ownerId !== ownerId) {
      return cpFail("OBJECT_OWNERSHIP_MISMATCH", "Object ownership mismatch.");
    }
    this.objects.delete(key);
    return cpOk(true as const);
  }

  /**
   * Test-only: mutate stored bytes in place to simulate digest drift.
   * Not part of HeadlessStoragePort.
   */
  testingMutateStoredBytes(
    locator: HeadlessStorageLocatorIdentity,
    mutator: (bytes: Uint8Array) => void,
  ): boolean {
    const obj = this.objects.get(memoryStorageLocatorKey(locator));
    if (!obj?.bytes) return false;
    mutator(obj.bytes);
    return true;
  }

  /**
   * Test-only: peek finalized metadata + byte copy without integrity healing.
   * Used to prove fail-closed drift leaves store contents unchanged.
   */
  testingPeekStoredObject(locator: HeadlessStorageLocatorIdentity): {
    readonly metadata: HeadlessObjectMetadata;
    readonly bytes: Uint8Array;
  } | null {
    const obj = this.objects.get(memoryStorageLocatorKey(locator));
    if (!obj?.bytes || !obj.metadata.finalized) return null;
    return {
      metadata: freezeMetadata(obj.metadata),
      bytes: copyBytes(obj.bytes),
    };
  }

  /** Test-only: rewrite finalized expiry without changing bytes (coherence fixtures). */
  testingRewriteFinalizedExpiresAt(
    locator: HeadlessStorageLocatorIdentity,
    expiresAtMs: number,
  ): boolean {
    const obj = this.objects.get(memoryStorageLocatorKey(locator));
    if (!obj?.metadata.finalized) return false;
    obj.metadata = freezeMetadata({
      ...obj.metadata,
      expiresAtMs,
    });
    return true;
  }

  /** Test-only: count finalized artifact objects for an owner. */
  testingCountFinalizedArtifacts(ownerId: string): number {
    let n = 0;
    for (const obj of this.objects.values()) {
      if (
        obj.metadata.finalized &&
        obj.metadata.purpose === "artifact" &&
        obj.metadata.ownerId === ownerId
      ) {
        n += 1;
      }
    }
    return n;
  }

  /** Test-only: whether a locator still exists (finalized or not). */
  testingHasObject(locator: HeadlessStorageLocatorIdentity): boolean {
    return this.objects.has(memoryStorageLocatorKey(locator));
  }
}
