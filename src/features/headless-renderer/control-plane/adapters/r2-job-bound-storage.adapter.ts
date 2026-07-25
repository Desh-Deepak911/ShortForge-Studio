/**
 * Production job-bound HeadlessStoragePort over R2 + durable owned-object metadata.
 *
 * Authority (2E.2A.1 / 2E.2A.2):
 * - Durable staging record MUST exist before any PutObject bytes.
 * - Finalize writes durable owned-object finalized state (not process-memory maps).
 * - Delete runs the durable deletion saga (cleanup_pending CAS before R2 delete).
 * - Process-memory capability map is short-lived session mechanics only.
 *
 * Never imports memory/FakeS3/product UI. Never logs capability tokens or object keys.
 */

import { createHash, randomUUID } from "node:crypto";

import type { HeadlessStorageLocatorIdentity } from "../../domain/headless-render.types";
import { HEADLESS_CONTENT_DIGEST_RE } from "../../domain/headless-stable-hash";
import {
  deriveAttemptBoundArtifactLocator,
  deriveAttemptBoundArtifactObjectId,
} from "../services/attempt-bound-artifact-key";
import { createR2ArtifactObjectIO } from "./r2-artifact-object-io.adapter";
import { deleteArtifactUnderDurableAuthority } from "../services/delete-artifact-under-durable-authority";
import {
  stableHeadlessCleanupId,
} from "../services/stable-cleanup-id";
import type { HeadlessR2EnvironmentNamespace } from "../services/r2-object-key-authority";
import type { HeadlessJobStorePort } from "../ports/job-store.port";
import type { HeadlessOwnedObjectStorePort } from "../ports/owned-object-store.port";
import type {
  HeadlessObjectMetadata,
  HeadlessOwnedObjectBytes,
  HeadlessStoragePort,
  HeadlessUploadPurpose,
  HeadlessUploadSession,
} from "../ports/storage.port";
import type {
  HeadlessR2ObjectIOPort,
  HeadlessR2ObjectLocator,
} from "../ports/r2-object-io.port";
import { HEADLESS_ARTIFACT_CLEANUP_INTENT_VERSION } from "../types/artifact-cleanup-intent";
import { cpFail, cpOk } from "../types/control-plane.types";
import {
  buildSourceBindingAttribution,
  classifySourceBindingFailureFromControlPlaneCode,
  resolveProviderBackedSourceBinding,
  type SourceBindingAttributionSnapshot,
} from "../../worker/runtime/source-binding-resolution";

export type HostedJobBoundStorageContext = {
  readonly ownerId: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly operationId: string;
  readonly attempt: number;
  readonly environmentNamespace: HeadlessR2EnvironmentNamespace;
  readonly artifactExpiresAtMs: number;
  readonly allowedSourceLocators: readonly HeadlessStorageLocatorIdentity[];
  readonly nowMs: () => number;
};

/** Short-lived upload capability — not durable semantic authority. */
type UploadSessionState = {
  readonly capabilityToken: string;
  readonly objectId: string;
  readonly locator: HeadlessStorageLocatorIdentity;
  readonly purpose: HeadlessUploadPurpose;
  readonly mimeType: string;
  readonly expiresAtMs: number;
  readonly expectedContentDigest: string;
  readonly expectedByteLength: number;
  readonly ownerId: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly attempt: number;
  bytesWritten: number;
  contentDigest: string | null;
  uploaded: boolean;
  consumed: boolean;
};

function sameLocator(
  a: HeadlessStorageLocatorIdentity,
  b: HeadlessStorageLocatorIdentity,
): boolean {
  return (
    a.kind === b.kind &&
    a.storeId === b.storeId &&
    a.objectKey === b.objectKey
  );
}

function toR2Locator(
  locator: HeadlessStorageLocatorIdentity,
): HeadlessR2ObjectLocator | null {
  if (locator.kind !== "object_storage") return null;
  if (locator.storeId !== "assets" && locator.storeId !== "artifacts") {
    return null;
  }
  return { storeId: locator.storeId, objectKey: locator.objectKey };
}

function freezeMetadata(meta: HeadlessObjectMetadata): HeadlessObjectMetadata {
  return Object.freeze({
    ...meta,
    locator: Object.freeze({ ...meta.locator }),
  });
}

function digestHex(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export type R2JobBoundStorageAdapterDeps = {
  readonly r2: HeadlessR2ObjectIOPort;
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly jobStore: HeadlessJobStorePort;
  readonly context: HostedJobBoundStorageContext;
};

/**
 * Factory: bind storage authority to one canonical job attempt.
 * Job identity comes from factory context; digest/length from trusted worker session input.
 */
export function createR2JobBoundStorageAdapter(
  deps: R2JobBoundStorageAdapterDeps,
): HeadlessStoragePort {
  return new R2JobBoundStorageAdapter(deps);
}

export class R2JobBoundStorageAdapter implements HeadlessStoragePort {
  private readonly r2: HeadlessR2ObjectIOPort;
  private readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  private readonly jobStore: HeadlessJobStorePort;
  private readonly ctx: HostedJobBoundStorageContext;
  /** Process-private short-lived capabilities only — never semantic finalize/delete authority. */
  private readonly capabilities = new Map<string, UploadSessionState>();
  private lastSourceBindingAttribution: SourceBindingAttributionSnapshot | null =
    null;

  /** Harness-only: last source-binding attribution from open/read resolution. */
  consumeLastSourceBindingAttribution(): SourceBindingAttributionSnapshot | null {
    const out = this.lastSourceBindingAttribution;
    this.lastSourceBindingAttribution = null;
    return out;
  }

  private recordSourceBindingAttribution(
    snapshot: SourceBindingAttributionSnapshot,
  ): void {
    this.lastSourceBindingAttribution = snapshot;
  }

  private recordSourceBindingFailure(input: {
    readonly code: string;
    readonly substage?: import("../../worker/runtime/source-binding-resolution").SourceBindingSubstageId;
    readonly locator?: HeadlessStorageLocatorIdentity;
  }): void {
    this.recordSourceBindingAttribution(
      classifySourceBindingFailureFromControlPlaneCode({
        code: input.code,
        substage: input.substage,
        locator: input.locator,
        allowlistedCount: this.ctx.allowedSourceLocators.length,
      }),
    );
  }

  constructor(deps: R2JobBoundStorageAdapterDeps) {
    this.r2 = deps.r2;
    this.ownedObjectStore = deps.ownedObjectStore;
    this.jobStore = deps.jobStore;
    this.ctx = deps.context;
  }

  async createUploadSession(input: {
    ownerId: string;
    projectId: string;
    purpose: HeadlessUploadPurpose;
    mimeType: string;
    expiresAtMs: number;
    expectedContentDigest?: string;
    expectedByteLength?: number;
  }) {
    if (
      input.ownerId !== this.ctx.ownerId ||
      input.projectId !== this.ctx.projectId
    ) {
      return cpFail("OBJECT_OWNERSHIP_MISMATCH", "Upload ownership mismatch.");
    }
    if (input.purpose !== "artifact") {
      return cpFail(
        "HOSTILE_INPUT",
        "Job-bound storage only creates artifact upload sessions.",
      );
    }
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
    if (
      typeof input.mimeType !== "string" ||
      input.mimeType.length < 3 ||
      input.mimeType.length > 128
    ) {
      return cpFail("HOSTILE_INPUT", "Upload mimeType rejected.");
    }
    if (
      !Number.isSafeInteger(input.expiresAtMs) ||
      input.expiresAtMs < this.ctx.nowMs()
    ) {
      return cpFail("HOSTILE_INPUT", "Upload expiry rejected.");
    }

    const objectId = deriveAttemptBoundArtifactObjectId({
      jobId: this.ctx.jobId,
      operationId: this.ctx.operationId,
      attempt: this.ctx.attempt,
    });
    if (objectId == null) {
      return cpFail("INTERNAL_ERROR", "Artifact object identity rejected.");
    }

    const derived = deriveAttemptBoundArtifactLocator({
      environmentNamespace: this.ctx.environmentNamespace,
      ownerId: this.ctx.ownerId,
      projectId: this.ctx.projectId,
      jobId: this.ctx.jobId,
      operationId: this.ctx.operationId,
      attempt: this.ctx.attempt,
    });
    if (!derived.ok) {
      return cpFail("INTERNAL_ERROR", "Artifact object identity rejected.");
    }

    const nowMs = this.ctx.nowMs();
    const staged = await this.ownedObjectStore.createStagingRecord({
      objectId,
      ownerId: this.ctx.ownerId,
      projectId: this.ctx.projectId,
      jobId: this.ctx.jobId,
      operationId: this.ctx.operationId,
      purpose: "artifact",
      slotKey: null,
      storeId: "artifacts",
      objectKey: derived.locator.objectKey,
      expectedContentDigestClaim: input.expectedContentDigest,
      expectedByteLength: input.expectedByteLength,
      expectedMimeType: input.mimeType,
      uploadCapabilityIssuedAtMs: nowMs,
      uploadCapabilityExpiresAtMs: input.expiresAtMs,
      expiresAtMs: input.expiresAtMs,
      createdAtMs: nowMs,
    });
    if (!staged.ok) return staged;
    if (staged.value.record.stage !== "staging") {
      return cpFail(
        "IDEMPOTENCY_CONFLICT",
        "Artifact durable identity is not staging.",
      );
    }

    const capabilityToken = `cap_${randomUUID()}`;
    const session: UploadSessionState = {
      capabilityToken,
      objectId,
      locator: derived.locator,
      purpose: "artifact",
      mimeType: input.mimeType,
      expiresAtMs: input.expiresAtMs,
      expectedContentDigest: input.expectedContentDigest,
      expectedByteLength: input.expectedByteLength,
      ownerId: this.ctx.ownerId,
      projectId: this.ctx.projectId,
      jobId: this.ctx.jobId,
      attempt: this.ctx.attempt,
      bytesWritten: 0,
      contentDigest: null,
      uploaded: false,
      consumed: false,
    };
    this.capabilities.set(capabilityToken, session);

    return cpOk({
      capabilityToken,
      locator: Object.freeze({ ...derived.locator }),
      ownerId: this.ctx.ownerId,
      projectId: this.ctx.projectId,
      purpose: "artifact",
      expiresAtMs: input.expiresAtMs,
    } satisfies HeadlessUploadSession);
  }

  async writeUploadBytes(input: {
    capabilityToken: string;
    bytes: Uint8Array;
  }) {
    if (!(input.bytes instanceof Uint8Array)) {
      return cpFail("HOSTILE_INPUT", "Upload bytes rejected.");
    }
    return this.writeUploadStream({
      capabilityToken: input.capabilityToken,
      expectedByteLength: input.bytes.byteLength,
      maxBytes: input.bytes.byteLength,
      chunks: (async function* () {
        if (input.bytes.byteLength > 0) yield input.bytes;
      })(),
    });
  }

  async writeUploadStream(input: {
    capabilityToken: string;
    expectedByteLength: number;
    maxBytes: number;
    signal?: AbortSignal;
    chunks: AsyncIterable<Uint8Array>;
  }) {
    const session = this.capabilities.get(input.capabilityToken);
    if (!session || session.consumed) {
      return cpFail("MANIFEST_NOT_FOUND", "Upload session not found.");
    }
    if (session.uploaded) {
      return cpFail("HOSTILE_INPUT", "Upload session already has bytes.");
    }
    if (
      session.ownerId !== this.ctx.ownerId ||
      session.jobId !== this.ctx.jobId ||
      session.attempt !== this.ctx.attempt
    ) {
      return cpFail("OBJECT_OWNERSHIP_MISMATCH", "Upload session mismatch.");
    }
    if (
      !Number.isSafeInteger(input.expectedByteLength) ||
      input.expectedByteLength < 1 ||
      !Number.isSafeInteger(input.maxBytes) ||
      input.maxBytes < 1 ||
      input.expectedByteLength > input.maxBytes ||
      input.expectedByteLength !== session.expectedByteLength
    ) {
      return cpFail("HOSTILE_INPUT", "Invalid streamed upload length bounds.");
    }
    if (input.signal?.aborted) {
      return cpFail("OPERATION_ABORTED", "Streamed upload aborted before start.");
    }

    // Durable identity must already exist — fail closed if missing (crash recovery path).
    const durable = await this.ownedObjectStore.getByObjectIdAndOwner({
      objectId: session.objectId,
      ownerId: this.ctx.ownerId,
    });
    if (!durable.ok) return durable;
    if (durable.value == null || durable.value.record.stage !== "staging") {
      return cpFail(
        "MANIFEST_NOT_FOUND",
        "Durable artifact staging record required before upload.",
      );
    }

    const r2Locator = toR2Locator(session.locator);
    if (r2Locator == null || r2Locator.storeId !== "artifacts") {
      return cpFail("INTERNAL_ERROR", "Artifact locator rejected.");
    }

    const hash = createHash("sha256");
    const hashingChunks = async function* (): AsyncGenerator<
      Uint8Array,
      void,
      unknown
    > {
      for await (const chunk of input.chunks) {
        if (!(chunk instanceof Uint8Array)) {
          throw Object.assign(new Error("UploadChunkRejected"), {
            name: "UploadChunkRejected",
          });
        }
        if (chunk.byteLength > 0) {
          hash.update(chunk);
        }
        yield chunk;
      }
    };

    const written = await this.r2.writeUploadStream({
      locator: r2Locator,
      ownerId: this.ctx.ownerId,
      contentType: session.mimeType,
      expectedByteLength: input.expectedByteLength,
      maxBytes: input.maxBytes,
      signal: input.signal,
      chunks: hashingChunks(),
    });
    if (!written.ok) return written;

    const contentDigest = `sha256:${hash.digest("hex")}`;
    if (contentDigest !== session.expectedContentDigest) {
      return cpFail("MANIFEST_DIGEST_MISMATCH", "Uploaded digest mismatch.");
    }

    const observedAt = this.ctx.nowMs();
    if (typeof this.ownedObjectStore.markUploadedObserved === "function") {
      const observed = await this.ownedObjectStore.markUploadedObserved({
        objectId: session.objectId,
        ownerId: this.ctx.ownerId,
        expectedStoreVersion: durable.value.storeVersion,
        uploadedObservedAtMs: observedAt,
        nowMs: observedAt,
      });
      if (!observed.ok) return observed;
    }

    session.bytesWritten = written.value.byteLength;
    session.contentDigest = contentDigest;
    session.uploaded = true;

    return cpOk({
      byteLength: written.value.byteLength,
      chunkCount: written.value.chunkCount,
      peakChunkBytes: written.value.peakChunkBytes,
    });
  }

  async finalizeUploadedObject(input: {
    capabilityToken: string;
    expectedContentDigest: string;
  }) {
    const session = this.capabilities.get(input.capabilityToken);
    if (!session || session.consumed) {
      return cpFail("MANIFEST_NOT_FOUND", "Upload session not found.");
    }
    if (!session.uploaded || session.contentDigest == null) {
      return cpFail("MANIFEST_NOT_FOUND", "No uploaded bytes to finalize.");
    }
    if (
      session.ownerId !== this.ctx.ownerId ||
      session.jobId !== this.ctx.jobId
    ) {
      return cpFail("OBJECT_OWNERSHIP_MISMATCH", "Upload session mismatch.");
    }
    if (
      session.contentDigest !== input.expectedContentDigest ||
      session.contentDigest !== session.expectedContentDigest
    ) {
      return cpFail("MANIFEST_DIGEST_MISMATCH", "Uploaded digest mismatch.");
    }

    const current = await this.ownedObjectStore.getByObjectIdAndOwner({
      objectId: session.objectId,
      ownerId: this.ctx.ownerId,
    });
    if (!current.ok) return current;
    if (current.value == null || current.value.record.stage !== "staging") {
      return cpFail("MANIFEST_NOT_FOUND", "Durable staging artifact missing.");
    }

    const claimToken = `vclaim_${randomUUID()}`;
    const nowMs = this.ctx.nowMs();
    const claimed = await this.ownedObjectStore.acquireVerificationClaim({
      objectId: session.objectId,
      ownerId: this.ctx.ownerId,
      claimToken,
      nowMs,
      expectedStoreVersion: current.value.storeVersion,
    });
    if (!claimed.ok) return claimed;

    const finalized = await this.ownedObjectStore.finalizeStagingRecord({
      objectId: session.objectId,
      ownerId: this.ctx.ownerId,
      expectedStoreVersion: claimed.value.storeVersion,
      verificationClaimToken: claimToken,
      contentDigest: session.contentDigest,
      byteLength: session.bytesWritten,
      mimeType: session.mimeType,
      verifiedAtMs: nowMs,
      expiresAtMs: session.expiresAtMs,
      nowMs,
      verifiedBy: "trusted_worker_upload_stream",
    });
    if (!finalized.ok) return finalized;

    session.consumed = true;
    this.capabilities.delete(input.capabilityToken);

    const record = finalized.value.record;
    if (record.stage !== "finalized") {
      return cpFail("INTERNAL_ERROR", "Finalize did not produce finalized stage.");
    }

    return cpOk(
      freezeMetadata({
        locator: session.locator,
        ownerId: record.ownerId,
        projectId: record.projectId,
        purpose: record.purpose,
        contentDigest: record.contentDigest,
        byteLength: record.byteLength,
        mimeType: record.mimeType,
        expiresAtMs: record.expiresAtMs,
        finalized: true,
      }),
    );
  }

  async readObjectMetadata(
    locator: HeadlessStorageLocatorIdentity,
    ownerId: string,
  ) {
    if (ownerId !== this.ctx.ownerId) {
      return cpFail("OBJECT_OWNERSHIP_MISMATCH", "Object ownership mismatch.");
    }
    const durable = await this.resolveFinalizedSource(locator, ownerId);
    if (!durable.ok) return durable;
    return cpOk(freezeMetadata(durable.value.metadata));
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
    if (ownerId !== this.ctx.ownerId) {
      return cpFail("OBJECT_OWNERSHIP_MISMATCH", "Object ownership mismatch.");
    }

    const resolved = await this.resolveFinalizedSource(locator, ownerId);
    if (!resolved.ok) return resolved;
    const meta = resolved.value.metadata;
    const clock = nowMs ?? this.ctx.nowMs();
    if (clock > meta.expiresAtMs) {
      this.recordSourceBindingFailure({
        code: "MANIFEST_EXPIRED",
        substage: "binding_authority_validation",
        locator,
      });
      return cpFail("MANIFEST_EXPIRED", "Owned object expired.");
    }
    if (
      options?.maxBytes != null &&
      Number.isSafeInteger(options.maxBytes) &&
      meta.byteLength > options.maxBytes
    ) {
      this.recordSourceBindingFailure({
        code: "BODY_TOO_LARGE",
        substage: "source_stream_open",
        locator,
      });
      return cpFail("BODY_TOO_LARGE", "Owned object exceeds maxBytes.");
    }
    if (options?.signal?.aborted) {
      this.recordSourceBindingFailure({
        code: "OPERATION_ABORTED",
        substage: "source_stream_open",
        locator,
      });
      return cpFail("OPERATION_ABORTED", "Open aborted after metadata.");
    }

    const r2Locator = toR2Locator(locator);
    if (r2Locator == null) {
      this.recordSourceBindingFailure({
        code: "MANIFEST_NOT_FOUND",
        substage: "locator_construction",
        locator,
      });
      return cpFail("MANIFEST_NOT_FOUND", "Owned object not found.");
    }

    const parts: Uint8Array[] = [];
    let total = 0;
    const stream = this.r2.streamFullObject({
      locator: r2Locator,
      ownerId,
      signal: options?.signal,
      maxBytes: options?.maxBytes ?? meta.byteLength,
    });
    let step = await stream.next();
    while (!step.done) {
      const chunk = step.value;
      parts.push(chunk);
      total += chunk.byteLength;
      step = await stream.next();
    }
    if (!step.value.ok) {
      const code = step.value.issues[0]?.code ?? "INTERNAL_ERROR";
      this.recordSourceBindingFailure({
        code,
        substage: "source_stream_open",
        locator,
      });
      return step.value;
    }
    if (total !== meta.byteLength) {
      this.recordSourceBindingFailure({
        code: "OBJECT_INTEGRITY_FAILED",
        substage: "source_stream_ready",
        locator,
      });
      return cpFail(
        "OBJECT_INTEGRITY_FAILED",
        "Owned object stream length mismatch.",
      );
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    if (digestHex(bytes) !== meta.contentDigest) {
      this.recordSourceBindingFailure({
        code: "OBJECT_INTEGRITY_FAILED",
        substage: "source_stream_ready",
        locator,
      });
      return cpFail(
        "OBJECT_INTEGRITY_FAILED",
        "Owned object digest mismatch.",
      );
    }
    if (options?.signal?.aborted) {
      this.recordSourceBindingFailure({
        code: "OPERATION_ABORTED",
        substage: "source_stream_ready",
        locator,
      });
      return cpFail("OPERATION_ABORTED", "Open aborted before bytes return.");
    }
    this.recordSourceBindingAttribution(
      buildSourceBindingAttribution({
        substage: "source_stream_ready",
        resultClass: "resolved",
        authorityClass: "canonical_bundle_allowlist",
        purpose: meta.purpose,
        storeId: meta.locator.storeId,
        objectStage: "finalized",
        allowlistedCount: this.ctx.allowedSourceLocators.length,
        slotCoverage: "complete",
        locator,
        digestClass: "matched",
        lengthClass: "matched",
        mimeClass: "matched",
        streamCapability: "ready",
      }),
    );
    return cpOk({
      metadata: freezeMetadata(meta),
      bytes,
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
    const actual = digestHex(opened.value.bytes);
    if (actual !== input.expectedContentDigest) {
      return cpFail("MANIFEST_DIGEST_MISMATCH", "Object digest mismatch.");
    }
    if (opened.value.metadata.contentDigest !== actual) {
      return cpFail("MANIFEST_DIGEST_MISMATCH", "Metadata digest drift.");
    }
    return cpOk(freezeMetadata(opened.value.metadata));
  }

  async deleteObject(
    locator: HeadlessStorageLocatorIdentity,
    ownerId: string,
  ) {
    if (ownerId !== this.ctx.ownerId) {
      return cpFail("OBJECT_OWNERSHIP_MISMATCH", "Object ownership mismatch.");
    }

    const objectId = deriveAttemptBoundArtifactObjectId({
      jobId: this.ctx.jobId,
      operationId: this.ctx.operationId,
      attempt: this.ctx.attempt,
    });
    if (objectId == null) {
      return cpFail("INTERNAL_ERROR", "Artifact object identity rejected.");
    }

    const attemptLocator = deriveAttemptBoundArtifactLocator({
      environmentNamespace: this.ctx.environmentNamespace,
      ownerId: this.ctx.ownerId,
      projectId: this.ctx.projectId,
      jobId: this.ctx.jobId,
      operationId: this.ctx.operationId,
      attempt: this.ctx.attempt,
    });
    if (!attemptLocator.ok || !sameLocator(attemptLocator.locator, locator)) {
      let sessionMatch = false;
      for (const session of this.capabilities.values()) {
        if (sameLocator(session.locator, locator)) {
          sessionMatch = true;
          break;
        }
      }
      if (!sessionMatch) {
        return cpFail(
          "OBJECT_OWNERSHIP_MISMATCH",
          "Object job binding mismatch.",
        );
      }
    }

    const durable = await this.ownedObjectStore.getByObjectIdAndOwner({
      objectId,
      ownerId,
    });
    if (!durable.ok) return durable;
    if (durable.value == null) {
      return cpFail(
        "MANIFEST_NOT_FOUND",
        "Durable artifact record required for delete.",
      );
    }

    const record = durable.value.record;
    const contentDigest =
      record.stage === "finalized"
        ? record.contentDigest
        : record.expectedContentDigestClaim;

    const nowMs = this.ctx.nowMs();
    const saga = await deleteArtifactUnderDurableAuthority({
      intent: {
        version: HEADLESS_ARTIFACT_CLEANUP_INTENT_VERSION,
        cleanupId: stableHeadlessCleanupId({
          jobId: this.ctx.jobId,
          attempt: this.ctx.attempt,
          storageLocator: locator,
        }),
        jobId: this.ctx.jobId,
        attempt: this.ctx.attempt,
        ownerId: this.ctx.ownerId,
        projectId: this.ctx.projectId,
        objectId,
        storageLocator: {
          kind: locator.kind,
          storeId: locator.storeId,
          objectKey: locator.objectKey,
        },
        contentDigest,
        reasonId: "UPLOAD_SESSION_ORPHAN",
        createdAtMs: nowMs,
        expiresAtMs: Math.max(nowMs + 60_000, record.expiresAtMs ?? nowMs + 60_000),
      },
      ownedObjectStore: this.ownedObjectStore,
      jobStore: this.jobStore,
      objectIo: createR2ArtifactObjectIO(this.r2),
      nowMs,
      allowLiveStagingCleanup: true,
    });

    if (saga.status === "completed") {
      for (const [token, session] of this.capabilities) {
        if (sameLocator(session.locator, locator)) {
          this.capabilities.delete(token);
        }
      }
      return cpOk(true as const);
    }
    if (saga.status === "protected") {
      return cpFail("FORBIDDEN", saga.message);
    }
    if (saga.status === "rejected") {
      return cpFail("OBJECT_OWNERSHIP_MISMATCH", saga.message);
    }
    if (saga.status === "stale") {
      return cpFail("STALE_TRANSITION", saga.message);
    }
    return cpFail("ARTIFACT_CLEANUP_UNCONFIRMED", saga.message);
  }

  /** Test/recovery: expose durable objectId for fixtures — not HeadlessStoragePort. */
  testingAttemptObjectId(): string | null {
    return deriveAttemptBoundArtifactObjectId({
      jobId: this.ctx.jobId,
      operationId: this.ctx.operationId,
      attempt: this.ctx.attempt,
    });
  }

  private async resolveFinalizedSource(
    locator: HeadlessStorageLocatorIdentity,
    ownerId: string,
  ): Promise<
    | {
        readonly ok: true;
        readonly value: { readonly metadata: HeadlessObjectMetadata };
      }
    | ReturnType<typeof cpFail>
  > {
    const resolved = await resolveProviderBackedSourceBinding({
      locator,
      ownerId,
      nowMs: this.ctx.nowMs(),
      ownedObjectStore: this.ownedObjectStore,
      context: {
        ownerId: this.ctx.ownerId,
        projectId: this.ctx.projectId,
        jobId: this.ctx.jobId,
        operationId: this.ctx.operationId,
        attempt: this.ctx.attempt,
        allowedSourceLocators: this.ctx.allowedSourceLocators,
        expectedPurpose: "asset_bytes",
      },
    });
    this.lastSourceBindingAttribution = resolved.attribution;
    if (!resolved.ok) {
      const code = resolved.attribution.safeControlPlaneCode ?? "INTERNAL_ERROR";
      return cpFail(code, "Owned object not found.");
    }
    return {
      ok: true,
      value: { metadata: resolved.metadata },
    };
  }
}
