/**
 * One-use artifact-file lease.
 *
 * Ownership model (Sprint 11D Phase 3.3):
 * - `executeHeadlessRenderJob` validates/hashes the workspace artifact and
 *   returns this lease on success (workspace cleanup is deferred).
 * - `LocalHeadlessWorkerRunner` is the sole consumer: it streams upload, then
 *   MUST `dispose()` in `finally` (success, cancel, upload/finalization
 *   failure, stale CAS, or thrown exception).
 * - Exactly one owner may consume chunks; dispose is idempotent; after dispose
 *   the path is gone and further open/upload fails closed.
 */

import {
  assertSameArtifactFileIdentity,
  type ArtifactFileIdentity,
} from "./artifact-file-authority";
import { openArtifactFileChunkStream } from "./incremental-sha256";

export interface HeadlessArtifactFileLease {
  readonly byteLength: number;
  readonly contentDigest: string;
  readonly mimeType: string;
  readonly disposed: boolean;
  /**
   * One-shot chunk stream bound to the validated file identity.
   * Second call fails closed.
   */
  openUploadChunks(options: {
    readonly maxChunkBytes: number;
    readonly signal?: AbortSignal;
  }): AsyncIterable<Uint8Array>;
  /** Cleanup workspace / release file. Idempotent. */
  dispose(): void;
}

export function createArtifactFileLease(input: {
  identity: ArtifactFileIdentity;
  contentDigest: string;
  mimeType: string;
  /** Called once on first dispose — typically workspace.cleanup(). */
  onDispose: () => void;
}): HeadlessArtifactFileLease {
  let disposed = false;
  let consumed = false;
  const identity = input.identity;

  const lease: HeadlessArtifactFileLease = {
    byteLength: identity.byteLength,
    contentDigest: input.contentDigest,
    mimeType: input.mimeType,
    get disposed() {
      return disposed;
    },
    openUploadChunks(options) {
      if (disposed) {
        throw new Error("Artifact lease disposed.");
      }
      if (consumed) {
        throw new Error("Artifact lease already consumed.");
      }
      const same = assertSameArtifactFileIdentity(identity);
      if (!same.ok) {
        throw new Error(same.message);
      }
      consumed = true;
      return openArtifactFileChunkStream({
        identity,
        maxChunkBytes: options.maxChunkBytes,
        signal: options.signal,
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        input.onDispose();
      } catch {
        /* cleanup best-effort */
      }
    },
  };

  return lease;
}
