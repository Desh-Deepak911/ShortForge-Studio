/**
 * R2 object IO adapter — HeadObject / streamed GetObject / Put stream / Delete.
 * Server-only. Import from this path in compose/tests — not re-exported from production barrel.
 * Never buffers whole large objects; never leaks bucket/key/provider messages.
 *
 * Artifact / upload PutObject uses a Node Readable body with known ContentLength.
 * Chunks are consumed incrementally under SDK backpressure — never accumulated then
 * concatenated before PutObject.
 */

import { Readable } from "node:stream";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  classifyHeadlessR2Environment,
  readConfiguredHeadlessR2Config,
  type HeadlessConfiguredR2Config,
} from "../runtime/r2-environment";
import type { HeadlessOwnedObjectStoreId } from "../types/owned-object-record";
import { cpFail, cpOk } from "../types/control-plane.types";
import type { HeadlessControlPlaneResult } from "../types/control-plane.types";
import type {
  HeadlessR2ObjectIOPort,
  HeadlessR2ObjectLocator,
  HeadlessR2ObjectMetadata,
} from "../ports/r2-object-io.port";

/** Individual upload chunk ceiling (matches worker maxChunkBytes upper bound). */
const HEADLESS_R2_MAX_UPLOAD_CHUNK_BYTES = 1024 * 1024;

export type {
  HeadlessR2ObjectIOPort,
  HeadlessR2ObjectLocator,
  HeadlessR2ObjectMetadata,
} from "../ports/r2-object-io.port";

/** Minimal S3 client surface for FakeS3Client injection. */
export type HeadlessS3ClientLike = {
  send(
    command: unknown,
    options?: { abortSignal?: AbortSignal },
  ): Promise<unknown>;
};

export type R2StorageAdapterOptions = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly configOverride?: HeadlessConfiguredR2Config;
  readonly s3Client?: HeadlessS3ClientLike;
  /**
   * Optional owner allowlist for test fixtures when durable metadata store
   * is not wired into this adapter. Production compose should authorize
   * via owned-object store before calling IO.
   */
  readonly authorizeOwner?: (
    ownerId: string,
    locator: HeadlessR2ObjectLocator,
  ) => boolean | Promise<boolean>;
};

function stripEtagQuotes(etag: string): string {
  return etag.replace(/^"+|"+$/g, "");
}

function resolveRevision(result: {
  ETag?: string;
  VersionId?: string;
}): {
  providerRevisionId: string | null;
  revisionAuthority: "etag" | "version_id" | "unavailable";
} {
  if (typeof result.VersionId === "string" && result.VersionId.length > 0) {
    return {
      providerRevisionId: result.VersionId,
      revisionAuthority: "version_id",
    };
  }
  if (typeof result.ETag === "string" && result.ETag.length > 0) {
    const stripped = stripEtagQuotes(result.ETag);
    if (stripped.length > 0) {
      return {
        providerRevisionId: stripped,
        revisionAuthority: "etag",
      };
    }
  }
  return {
    providerRevisionId: null,
    revisionAuthority: "unavailable",
  };
}

function mapS3Error(error: unknown): HeadlessControlPlaneResult<never> {
  if (error && typeof error === "object") {
    const name = (error as { name?: string }).name;
    if (name === "AbortError" || name === "TimeoutError") {
      return cpFail("OPERATION_ABORTED", "Storage operation aborted.");
    }
    if (
      name === "PreconditionFailed" ||
      name === "412" ||
      name === "NotModified"
    ) {
      return cpFail(
        "OBJECT_REVISION_MISMATCH",
        "Object revision precondition failed.",
      );
    }
    if (name === "NotFound" || name === "NoSuchKey" || name === "NotFound") {
      return cpFail("REMOTE_FETCH_FORBIDDEN", "Owned object is not readable.");
    }
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (status === 412) {
      return cpFail(
        "OBJECT_REVISION_MISMATCH",
        "Object revision precondition failed.",
      );
    }
    if (status === 403 || status === 401) {
      return cpFail("REMOTE_FETCH_FORBIDDEN", "Owned object is not readable.");
    }
    if (status === 404) {
      return cpFail("REMOTE_FETCH_FORBIDDEN", "Owned object is not readable.");
    }
  }
  return cpFail("INTERNAL_ERROR", "Storage operation failed.");
}

function isAbortError(error: unknown): boolean {
  return (
    error != null &&
    typeof error === "object" &&
    ((error as { name?: string }).name === "AbortError" ||
      (error as { code?: string }).code === "ABORT_ERR")
  );
}

export class R2StorageAdapter implements HeadlessR2ObjectIOPort {
  private readonly env: NodeJS.ProcessEnv | Record<string, unknown>;
  private readonly configOverride: HeadlessConfiguredR2Config | undefined;
  private readonly injectedClient: HeadlessS3ClientLike | undefined;
  /**
   * Test/fixture only: peak concurrent chunk references retained during the
   * last writeUploadStream. Production callers must ignore this field.
   */
  testingLastPeakRetainedChunks = 0;
  private readonly authorizeOwner:
    | ((
        ownerId: string,
        locator: HeadlessR2ObjectLocator,
      ) => boolean | Promise<boolean>)
    | undefined;

  constructor(options: R2StorageAdapterOptions = {}) {
    this.env = options.env ?? process.env;
    this.configOverride = options.configOverride;
    this.injectedClient = options.s3Client;
    this.authorizeOwner = options.authorizeOwner;
  }

  private resolveConfig(): HeadlessConfiguredR2Config | null {
    if (this.configOverride) return this.configOverride;
    if (classifyHeadlessR2Environment(this.env) !== "configured") return null;
    return readConfiguredHeadlessR2Config(this.env);
  }

  private bucketFor(
    config: HeadlessConfiguredR2Config,
    storeId: HeadlessOwnedObjectStoreId,
  ): string {
    return storeId === "artifacts"
      ? config.bucketArtifacts
      : config.bucketAssets;
  }

  private clientFor(config: HeadlessConfiguredR2Config): {
    client: HeadlessS3ClientLike;
    owned: boolean;
  } {
    if (this.injectedClient) {
      return { client: this.injectedClient, owned: false };
    }
    const client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
    return { client, owned: true };
  }

  private async assertOwner(
    ownerId: string,
    locator: HeadlessR2ObjectLocator,
  ): Promise<HeadlessControlPlaneResult<true>> {
    if (typeof ownerId !== "string" || ownerId.length === 0) {
      return cpFail("HOSTILE_INPUT", "Owner identity rejected.");
    }
    if (this.authorizeOwner) {
      const ok = await this.authorizeOwner(ownerId, locator);
      if (!ok) {
        return cpFail("FORBIDDEN", "Owned object access denied.");
      }
    }
    return cpOk(true);
  }

  async readObjectMetadata(
    locator: HeadlessR2ObjectLocator,
    ownerId: string,
  ): Promise<HeadlessControlPlaneResult<HeadlessR2ObjectMetadata>> {
    try {
      const config = this.resolveConfig();
      if (config == null) {
        return cpFail(
          "CONFIGURATION_UNAVAILABLE",
          "Headless object storage is not configured.",
        );
      }
      const auth = await this.assertOwner(ownerId, locator);
      if (!auth.ok) return auth;

      const { client, owned } = this.clientFor(config);
      try {
        const bucket = this.bucketFor(config, locator.storeId);
        const result = (await client.send(
          this.injectedClient
            ? { name: "HeadObject", input: { Bucket: bucket, Key: locator.objectKey } }
            : new HeadObjectCommand({
                Bucket: bucket,
                Key: locator.objectKey,
              }),
        )) as {
          ContentLength?: number;
          ContentType?: string;
          ETag?: string;
          VersionId?: string;
        };
        const byteLength = result.ContentLength;
        const mimeType = result.ContentType;
        if (
          typeof byteLength !== "number" ||
          !Number.isSafeInteger(byteLength) ||
          byteLength < 0
        ) {
          return cpFail(
            "OBJECT_INTEGRITY_FAILED",
            "Object metadata length rejected.",
          );
        }
        if (typeof mimeType !== "string" || mimeType.length === 0) {
          return cpFail(
            "OBJECT_INTEGRITY_FAILED",
            "Object metadata MIME rejected.",
          );
        }
        const revision = resolveRevision(result);
        return cpOk(
          Object.freeze({
            storeId: locator.storeId,
            objectKey: locator.objectKey,
            byteLength,
            mimeType,
            providerRevisionId: revision.providerRevisionId,
            revisionAuthority: revision.revisionAuthority,
          }),
        );
      } catch (error) {
        return mapS3Error(error);
      } finally {
        if (owned && "destroy" in client) {
          (client as S3Client).destroy();
        }
      }
    } catch {
      return cpFail("INTERNAL_ERROR", "Storage operation failed.");
    }
  }

  async *streamFullObject(input: {
    locator: HeadlessR2ObjectLocator;
    ownerId: string;
    signal?: AbortSignal;
    maxBytes: number;
    requiredProviderRevisionId?: string;
    requiredRevisionAuthority?: "etag" | "version_id";
  }): AsyncGenerator<
    Uint8Array,
    HeadlessControlPlaneResult<{
      readonly byteLength: number;
      readonly mimeType: string;
    }>,
    unknown
  > {
    try {
      const config = this.resolveConfig();
      if (config == null) {
        return cpFail(
          "CONFIGURATION_UNAVAILABLE",
          "Headless object storage is not configured.",
        );
      }
      if (
        !Number.isSafeInteger(input.maxBytes) ||
        input.maxBytes < 1
      ) {
        return cpFail("HOSTILE_INPUT", "Stream maxBytes rejected.");
      }
      const auth = await this.assertOwner(input.ownerId, input.locator);
      if (!auth.ok) return auth;

      if (input.signal?.aborted) {
        return cpFail("OPERATION_ABORTED", "Storage operation aborted.");
      }

      const requireRevision =
        typeof input.requiredProviderRevisionId === "string" &&
        input.requiredProviderRevisionId.length > 0;
      if (requireRevision) {
        if (
          input.requiredRevisionAuthority !== "etag" &&
          input.requiredRevisionAuthority !== "version_id"
        ) {
          return cpFail(
            "OBJECT_REVISION_UNAVAILABLE",
            "Object revision authority unavailable.",
          );
        }
      }

      const { client, owned } = this.clientFor(config);
      try {
        const bucket = this.bucketFor(config, input.locator.storeId);
        // ETag If-Match for TOCTOU bind. VersionId precondition is not
        // universally available on GetObject; etag is the signed-path authority.
        const ifMatch =
          requireRevision &&
          input.requiredRevisionAuthority === "etag"
            ? input.requiredProviderRevisionId
            : undefined;
        const getInput = {
          Bucket: bucket,
          Key: input.locator.objectKey,
          ...(ifMatch != null ? { IfMatch: ifMatch } : {}),
          ...(requireRevision &&
          input.requiredRevisionAuthority === "version_id" &&
          input.requiredProviderRevisionId
            ? { VersionId: input.requiredProviderRevisionId }
            : {}),
        };
        const result = (await client.send(
          this.injectedClient
            ? {
                name: "GetObject",
                input: getInput,
              }
            : new GetObjectCommand(getInput),
          { abortSignal: input.signal },
        )) as {
          Body?: AsyncIterable<Uint8Array> | ReadableStream | unknown;
          ContentLength?: number;
          ContentType?: string;
        };

        const mimeType =
          typeof result.ContentType === "string" && result.ContentType.length > 0
            ? result.ContentType
            : "application/octet-stream";

        if (
          typeof result.ContentLength === "number" &&
          result.ContentLength > input.maxBytes
        ) {
          return cpFail(
            "ASSET_BYTES_OVERFLOW",
            "Object exceeds allowed byte ceiling.",
          );
        }

        const body = result.Body;
        if (body == null) {
          return cpFail(
            "OBJECT_INTEGRITY_FAILED",
            "Object stream body missing.",
          );
        }

        let total = 0;
        const iterable = asAsyncUint8Iterable(body);
        for await (const chunk of iterable) {
          if (input.signal?.aborted) {
            return cpFail("OPERATION_ABORTED", "Storage operation aborted.");
          }
          if (!(chunk instanceof Uint8Array)) {
            return cpFail(
              "OBJECT_INTEGRITY_FAILED",
              "Object stream chunk rejected.",
            );
          }
          total += chunk.byteLength;
          if (total > input.maxBytes) {
            return cpFail(
              "ASSET_BYTES_OVERFLOW",
              "Object exceeds allowed byte ceiling.",
            );
          }
          yield chunk;
        }

        if (
          typeof result.ContentLength === "number" &&
          result.ContentLength !== total
        ) {
          return cpFail(
            "OBJECT_INTEGRITY_FAILED",
            "Object stream length mismatch.",
          );
        }

        return cpOk(
          Object.freeze({
            byteLength: total,
            mimeType,
          }),
        );
      } catch (error) {
        if (isAbortError(error)) {
          return cpFail("OPERATION_ABORTED", "Storage operation aborted.");
        }
        return mapS3Error(error);
      } finally {
        if (owned && "destroy" in client) {
          (client as S3Client).destroy();
        }
      }
    } catch (error) {
      if (isAbortError(error)) {
        return cpFail("OPERATION_ABORTED", "Storage operation aborted.");
      }
      return cpFail("INTERNAL_ERROR", "Storage operation failed.");
    }
  }

  async writeUploadStream(input: {
    locator: HeadlessR2ObjectLocator;
    ownerId: string;
    contentType: string;
    expectedByteLength: number;
    maxBytes: number;
    signal?: AbortSignal;
    chunks: AsyncIterable<Uint8Array>;
  }) {
    try {
      const config = this.resolveConfig();
      if (config == null) {
        return cpFail(
          "CONFIGURATION_UNAVAILABLE",
          "Headless object storage is not configured.",
        );
      }
      const auth = await this.assertOwner(input.ownerId, input.locator);
      if (!auth.ok) return auth;

      if (
        !Number.isSafeInteger(input.expectedByteLength) ||
        input.expectedByteLength < 1 ||
        !Number.isSafeInteger(input.maxBytes) ||
        input.maxBytes < 1 ||
        input.expectedByteLength > input.maxBytes
      ) {
        return cpFail("HOSTILE_INPUT", "Upload length rejected.");
      }
      if (input.signal?.aborted) {
        return cpFail("OPERATION_ABORTED", "Storage operation aborted.");
      }

      const metrics = {
        byteLength: 0,
        chunkCount: 0,
        peakChunkBytes: 0,
        /** Test/fixture: peak concurrent chunk refs retained (must stay ≤ 1). */
        peakRetainedChunks: 0,
      };
      type TerminalReason =
        | { readonly kind: "ok" }
        | {
            readonly kind: "fail";
            readonly result: HeadlessControlPlaneResult<never>;
          };
      /** Box avoids TS control-flow narrowing across the async generator closure. */
      const terminal: { reason: TerminalReason | null } = { reason: null };

      const validatedChunks = async function* (): AsyncGenerator<
        Uint8Array,
        void,
        unknown
      > {
        let retained = 0;
        try {
          for await (const chunk of input.chunks) {
            if (input.signal?.aborted) {
              terminal.reason = {
                kind: "fail",
                result: cpFail(
                  "OPERATION_ABORTED",
                  "Storage operation aborted.",
                ),
              };
              return;
            }
            if (!(chunk instanceof Uint8Array)) {
              terminal.reason = {
                kind: "fail",
                result: cpFail("HOSTILE_INPUT", "Upload chunk rejected."),
              };
              return;
            }
            const len = chunk.byteLength;
            if (len < 1) continue;
            if (len > HEADLESS_R2_MAX_UPLOAD_CHUNK_BYTES) {
              terminal.reason = {
                kind: "fail",
                result: cpFail("HOSTILE_INPUT", "Upload chunk rejected."),
              };
              return;
            }
            if (
              !Number.isSafeInteger(metrics.byteLength + len) ||
              metrics.byteLength + len > input.maxBytes ||
              metrics.byteLength + len > input.expectedByteLength
            ) {
              terminal.reason = {
                kind: "fail",
                result: cpFail(
                  "ASSET_BYTES_OVERFLOW",
                  "Upload exceeds allowed byte ceiling.",
                ),
              };
              return;
            }
            metrics.chunkCount += 1;
            if (len > metrics.peakChunkBytes) {
              metrics.peakChunkBytes = len;
            }
            metrics.byteLength += len;
            retained = 1;
            if (retained > metrics.peakRetainedChunks) {
              metrics.peakRetainedChunks = retained;
            }
            // Yield the chunk reference once; do not accumulate into an array.
            yield chunk;
            retained = 0;
          }
        } catch (error) {
          if (input.signal?.aborted || isAbortError(error)) {
            terminal.reason = {
              kind: "fail",
              result: cpFail(
                "OPERATION_ABORTED",
                "Storage operation aborted.",
              ),
            };
            return;
          }
          terminal.reason = {
            kind: "fail",
            result: cpFail("INTERNAL_ERROR", "Storage operation failed."),
          };
          return;
        }

        if (metrics.byteLength < 1) {
          terminal.reason = {
            kind: "fail",
            result: cpFail("HOSTILE_INPUT", "Zero-byte upload rejected."),
          };
          return;
        }
        if (metrics.byteLength !== input.expectedByteLength) {
          terminal.reason = {
            kind: "fail",
            result: cpFail(
              "OBJECT_INTEGRITY_FAILED",
              "Upload length mismatch.",
            ),
          };
          return;
        }
        if (terminal.reason == null) {
          terminal.reason = { kind: "ok" };
        }
      };

      const body = Readable.from(validatedChunks(), {
        objectMode: false,
        highWaterMark: 64 * 1024,
      });

      const { client, owned } = this.clientFor(config);
      try {
        const bucket = this.bucketFor(config, input.locator.storeId);
        await client.send(
          this.injectedClient
            ? {
                name: "PutObject",
                input: {
                  Bucket: bucket,
                  Key: input.locator.objectKey,
                  Body: body,
                  ContentType: input.contentType,
                  ContentLength: input.expectedByteLength,
                },
              }
            : new PutObjectCommand({
                Bucket: bucket,
                Key: input.locator.objectKey,
                Body: body,
                ContentType: input.contentType,
                ContentLength: input.expectedByteLength,
              }),
          { abortSignal: input.signal },
        );

        if (terminal.reason == null) {
          return cpFail(
            "INTERNAL_ERROR",
            "Upload completed without terminal accounting.",
          );
        }
        if (terminal.reason.kind === "fail") {
          return terminal.reason.result;
        }
        if (metrics.byteLength !== input.expectedByteLength) {
          return cpFail(
            "OBJECT_INTEGRITY_FAILED",
            "Upload length mismatch.",
          );
        }
        this.testingLastPeakRetainedChunks = metrics.peakRetainedChunks;
        return cpOk(
          Object.freeze({
            byteLength: metrics.byteLength,
            chunkCount: metrics.chunkCount,
            peakChunkBytes: metrics.peakChunkBytes,
          }),
        );
      } catch (error) {
        if (terminal.reason?.kind === "fail") {
          return terminal.reason.result;
        }
        if (isAbortError(error) || input.signal?.aborted) {
          return cpFail("OPERATION_ABORTED", "Storage operation aborted.");
        }
        return mapS3Error(error);
      } finally {
        if (!body.destroyed) {
          body.destroy();
        }
        if (owned && "destroy" in client) {
          (client as S3Client).destroy();
        }
      }
    } catch {
      return cpFail("INTERNAL_ERROR", "Storage operation failed.");
    }
  }

  async deleteObject(
    locator: HeadlessR2ObjectLocator,
    ownerId: string,
  ): Promise<HeadlessControlPlaneResult<true>> {
    try {
      const config = this.resolveConfig();
      if (config == null) {
        return cpFail(
          "CONFIGURATION_UNAVAILABLE",
          "Headless object storage is not configured.",
        );
      }
      const auth = await this.assertOwner(ownerId, locator);
      if (!auth.ok) return auth;

      const { client, owned } = this.clientFor(config);
      try {
        const bucket = this.bucketFor(config, locator.storeId);
        await client.send(
          this.injectedClient
            ? {
                name: "DeleteObject",
                input: { Bucket: bucket, Key: locator.objectKey },
              }
            : new DeleteObjectCommand({
                Bucket: bucket,
                Key: locator.objectKey,
              }),
        );
        return cpOk(true);
      } catch (error) {
        return mapS3Error(error);
      } finally {
        if (owned && "destroy" in client) {
          (client as S3Client).destroy();
        }
      }
    } catch {
      return cpFail("INTERNAL_ERROR", "Storage operation failed.");
    }
  }

  async probeExactObjectPresence(
    locator: HeadlessR2ObjectLocator,
    ownerId: string,
  ): Promise<HeadlessControlPlaneResult<"present" | "absent">> {
    try {
      const config = this.resolveConfig();
      if (config == null) {
        return cpFail(
          "CONFIGURATION_UNAVAILABLE",
          "Headless object storage is not configured.",
        );
      }
      const auth = await this.assertOwner(ownerId, locator);
      if (!auth.ok) return auth;

      const { client, owned } = this.clientFor(config);
      try {
        const bucket = this.bucketFor(config, locator.storeId);
        await client.send(
          this.injectedClient
            ? {
                name: "HeadObject",
                input: { Bucket: bucket, Key: locator.objectKey },
              }
            : new HeadObjectCommand({
                Bucket: bucket,
                Key: locator.objectKey,
              }),
        );
        return cpOk("present" as const);
      } catch (error) {
        if (isNotFoundPresence(error)) {
          return cpOk("absent" as const);
        }
        return mapS3Error(error);
      } finally {
        if (owned && "destroy" in client) {
          (client as S3Client).destroy();
        }
      }
    } catch {
      return cpFail("INTERNAL_ERROR", "Object presence probe failed.");
    }
  }
}

function isNotFoundPresence(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const name = (error as { name?: string }).name;
  if (name === "NotFound" || name === "NoSuchKey") return true;
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata?.httpStatusCode;
  return status === 404;
}

async function* asAsyncUint8Iterable(
  body: AsyncIterable<Uint8Array> | ReadableStream | unknown,
): AsyncGenerator<Uint8Array, void, unknown> {
  if (
    body != null &&
    typeof body === "object" &&
    Symbol.asyncIterator in (body as object)
  ) {
    for await (const chunk of body as AsyncIterable<Uint8Array | Buffer>) {
      if (chunk instanceof Uint8Array) {
        yield chunk;
      } else if (Buffer.isBuffer(chunk)) {
        yield new Uint8Array(chunk);
      } else {
        yield new Uint8Array(chunk as ArrayBufferLike);
      }
    }
    return;
  }
  // Node.js SDK sometimes returns a readable with transformToByteArray.
  if (
    body != null &&
    typeof body === "object" &&
    typeof (body as { transformToByteArray?: unknown }).transformToByteArray ===
      "function"
  ) {
    // Avoid whole-object buffer path for large objects — reject when only
    // transformToByteArray is available without async iteration.
    throw Object.assign(new Error("StreamIterationRequired"), {
      name: "StreamIterationRequired",
    });
  }
  throw Object.assign(new Error("UnsupportedBody"), {
    name: "UnsupportedBody",
  });
}
