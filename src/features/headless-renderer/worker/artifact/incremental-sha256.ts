/**
 * Incremental SHA-256 over a bounded file stream.
 * Never loads the whole artifact into a Node buffer.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

import {
  assertSameArtifactFileIdentity,
  type ArtifactFileIdentity,
} from "./artifact-file-authority";

const HEADLESS_CONTENT_DIGEST_RE = /^sha256:[a-f0-9]{64}$/;

export function formatHeadlessContentDigest(hex: string): string {
  const normalized = hex.toLowerCase();
  const digest = `sha256:${normalized}`;
  if (!HEADLESS_CONTENT_DIGEST_RE.test(digest)) {
    throw new Error("Invalid SHA-256 hex.");
  }
  return digest;
}

export type IncrementalHashFailReason =
  | "aborted"
  | "timeout"
  | "stream_error"
  | "size_drift"
  | "identity_mismatch"
  | "empty";

/**
 * Hash `identity` incrementally. Byte count must match authorized length.
 */
export async function hashArtifactFileIncremental(input: {
  identity: ArtifactFileIdentity;
  maxChunkBytes: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<
  | {
      readonly ok: true;
      readonly contentDigest: string;
      readonly bytesHashed: number;
      readonly chunkCount: number;
      readonly peakChunkBytes: number;
      readonly elapsedMs: number;
    }
  | {
      readonly ok: false;
      readonly reason: IncrementalHashFailReason;
      readonly message: string;
      readonly bytesHashed: number;
      readonly elapsedMs: number;
    }
> {
  const started = Date.now();
  if (
    !Number.isSafeInteger(input.maxChunkBytes) ||
    input.maxChunkBytes < 1
  ) {
    return {
      ok: false,
      reason: "stream_error",
      message: "Invalid hash chunk size.",
      bytesHashed: 0,
      elapsedMs: 0,
    };
  }
  if (input.signal?.aborted) {
    return {
      ok: false,
      reason: "aborted",
      message: "Hash aborted before start.",
      bytesHashed: 0,
      elapsedMs: 0,
    };
  }

  const same = assertSameArtifactFileIdentity(input.identity);
  if (!same.ok) {
    return {
      ok: false,
      reason: "identity_mismatch",
      message: same.message,
      bytesHashed: 0,
      elapsedMs: Date.now() - started,
    };
  }

  const hash = createHash("sha256");
  let bytesHashed = 0;
  let chunkCount = 0;
  let peakChunkBytes = 0;
  const timeoutMs = input.timeoutMs;
  let timedOut = false;

  const stream = createReadStream(input.identity.absolutePath, {
    highWaterMark: input.maxChunkBytes,
  });

  const onAbort = () => {
    stream.destroy(new Error("aborted"));
  };
  input.signal?.addEventListener("abort", onAbort, { once: true });

  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  if (timeoutMs != null && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      stream.destroy(new Error("timeout"));
    }, timeoutMs);
    timeoutTimer.unref?.();
  }

  try {
    for await (const chunk of stream) {
      if (input.signal?.aborted) {
        return {
          ok: false,
          reason: "aborted",
          message: "Hash aborted mid-stream.",
          bytesHashed,
          elapsedMs: Date.now() - started,
        };
      }
      if (timedOut) {
        return {
          ok: false,
          reason: "timeout",
          message: "Hash timed out.",
          bytesHashed,
          elapsedMs: Date.now() - started,
        };
      }
      const buf = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as Uint8Array);
      const len = buf.byteLength;
      if (len < 1) continue;
      chunkCount += 1;
      if (len > peakChunkBytes) peakChunkBytes = len;
      bytesHashed += len;
      if (bytesHashed > input.identity.byteLength) {
        stream.destroy();
        return {
          ok: false,
          reason: "size_drift",
          message: "Hashed bytes exceeded authorized file length.",
          bytesHashed,
          elapsedMs: Date.now() - started,
        };
      }
      hash.update(buf);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "stream error";
    if (input.signal?.aborted || message === "aborted") {
      return {
        ok: false,
        reason: "aborted",
        message: "Hash aborted.",
        bytesHashed,
        elapsedMs: Date.now() - started,
      };
    }
    if (timedOut || message === "timeout") {
      return {
        ok: false,
        reason: "timeout",
        message: "Hash timed out.",
        bytesHashed,
        elapsedMs: Date.now() - started,
      };
    }
    return {
      ok: false,
      reason: "stream_error",
      message: "Artifact hash stream failed.",
      bytesHashed,
      elapsedMs: Date.now() - started,
    };
  } finally {
    input.signal?.removeEventListener("abort", onAbort);
    if (timeoutTimer) clearTimeout(timeoutTimer);
  }

  if (bytesHashed < 1) {
    return {
      ok: false,
      reason: "empty",
      message: "Artifact hash produced zero bytes.",
      bytesHashed,
      elapsedMs: Date.now() - started,
    };
  }
  if (bytesHashed !== input.identity.byteLength) {
    return {
      ok: false,
      reason: "size_drift",
      message: "Hashed byte count does not match authorized file length.",
      bytesHashed,
      elapsedMs: Date.now() - started,
    };
  }

  // Final identity check — reject replacement during/after hash.
  const after = assertSameArtifactFileIdentity(input.identity);
  if (!after.ok) {
    return {
      ok: false,
      reason: "identity_mismatch",
      message: after.message,
      bytesHashed,
      elapsedMs: Date.now() - started,
    };
  }

  return {
    ok: true,
    contentDigest: formatHeadlessContentDigest(hash.digest("hex")),
    bytesHashed,
    chunkCount,
    peakChunkBytes,
    elapsedMs: Date.now() - started,
  };
}

/** Open a bounded AsyncIterable of file chunks bound to a validated identity. */
export async function* openArtifactFileChunkStream(input: {
  identity: ArtifactFileIdentity;
  maxChunkBytes: number;
  signal?: AbortSignal;
}): AsyncGenerator<Uint8Array, void, void> {
  const same = assertSameArtifactFileIdentity(input.identity);
  if (!same.ok) {
    throw new Error(same.message);
  }
  if (
    !Number.isSafeInteger(input.maxChunkBytes) ||
    input.maxChunkBytes < 1
  ) {
    throw new Error("Invalid upload chunk size.");
  }
  if (input.signal?.aborted) {
    throw new Error("aborted");
  }

  const stream = createReadStream(input.identity.absolutePath, {
    highWaterMark: input.maxChunkBytes,
  });
  const onAbort = () => {
    stream.destroy(new Error("aborted"));
  };
  input.signal?.addEventListener("abort", onAbort, { once: true });

  let bytesRead = 0;
  try {
    for await (const chunk of stream) {
      if (input.signal?.aborted) {
        throw new Error("aborted");
      }
      const buf = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as Uint8Array);
      if (buf.byteLength < 1) continue;
      bytesRead += buf.byteLength;
      if (bytesRead > input.identity.byteLength) {
        throw new Error("size_drift");
      }
      // Defensive copy — callers must not mutate the stream buffer.
      yield new Uint8Array(buf);
    }
  } finally {
    input.signal?.removeEventListener("abort", onAbort);
    stream.destroy();
  }

  if (bytesRead !== input.identity.byteLength) {
    throw new Error("size_drift");
  }
  const after = assertSameArtifactFileIdentity(input.identity);
  if (!after.ok) {
    throw new Error(after.message);
  }
}
