/**
 * Fake S3-compatible client for unit tests — verification/QA only.
 * In-memory objects by bucket/key; supports HeadObject, GetObject, PutObject, DeleteObject.
 * Supports ETag / VersionId revision authority and IfMatch precondition for TOCTOU tests.
 * PutObject accepts Uint8Array, string, Node Readable, or AsyncIterable bodies and
 * consumes them incrementally (optional per-chunk delay for backpressure fixtures).
 * Do NOT export from the production control-plane barrel.
 */

import { createHash } from "node:crypto";
import { Readable } from "node:stream";

export type FakeS3Object = {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly contentLength: number;
  readonly etag: string;
  readonly versionId: string | null;
};

export type FakeS3Command =
  | {
      readonly name: "HeadObject";
      readonly input: { Bucket: string; Key: string };
    }
  | {
      readonly name: "GetObject";
      readonly input: {
        Bucket: string;
        Key: string;
        Range?: string;
        IfMatch?: string;
        VersionId?: string;
      };
    }
  | {
      readonly name: "PutObject";
      readonly input: {
        Bucket: string;
        Key: string;
        Body?: Uint8Array | string | Readable | AsyncIterable<Uint8Array>;
        ContentType?: string;
        ContentLength?: number;
      };
    }
  | {
      readonly name: "DeleteObject";
      readonly input: { Bucket: string; Key: string };
    };

function storageKey(bucket: string, key: string): string {
  return JSON.stringify({ bucket, key });
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function etagFor(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("hex");
}

async function* bytesAsAsyncIterable(
  bytes: Uint8Array,
  chunkSize = 64 * 1024,
  signal?: AbortSignal,
): AsyncGenerator<Uint8Array, void, unknown> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    if (signal?.aborted) {
      const err = new Error("AbortError");
      err.name = "AbortError";
      throw err;
    }
    const end = Math.min(offset + chunkSize, bytes.byteLength);
    yield bytes.subarray(offset, end);
    offset = end;
  }
}

export class FakeS3Client {
  private readonly objects = new Map<string, FakeS3Object>();
  /** Test hook: delay inside GetObject body iteration. */
  getObjectDelayMs = 0;
  /**
   * Test hook: delay after each PutObject body chunk (slow sink / backpressure).
   * Does not accumulate the source adapter's chunks — only the fake store.
   */
  putObjectChunkDelayMs = 0;
  /** Test hook: max concurrent unread PutObject chunks observed by the sink. */
  testingPeakInflightPutChunks = 0;
  /** Test hook: force send() to throw a generic error. */
  forceSendError: Error | null = null;
  /** Test hook: count DeleteObject invocations. */
  testingDeleteObjectCalls = 0;
  /** Test hook: force only HeadObject (presence probe) to fail. */
  forceHeadError: Error | null = null;
  /**
   * When true, omit ETag and VersionId from HeadObject (revision unavailable).
   */
  omitRevisionOnHead = false;
  /**
   * Optional mutation between HeadObject and subsequent GetObject for the same key.
   * Invoked once on the first GetObject after a HeadObject for that key.
   */
  mutateBetweenHeadAndGet:
    | ((bucket: string, key: string) => void)
    | null = null;
  private readonly headedKeys = new Set<string>();

  putFixture(
    bucket: string,
    key: string,
    body: Uint8Array,
    contentType = "application/octet-stream",
    options?: { versionId?: string | null; etag?: string },
  ): void {
    this.objects.set(storageKey(bucket, key), {
      body: copyBytes(body),
      contentType,
      contentLength: body.byteLength,
      etag: options?.etag ?? etagFor(body),
      versionId: options?.versionId === undefined ? null : options.versionId,
    });
  }

  getFixture(bucket: string, key: string): FakeS3Object | undefined {
    const obj = this.objects.get(storageKey(bucket, key));
    if (!obj) return undefined;
    return {
      body: copyBytes(obj.body),
      contentType: obj.contentType,
      contentLength: obj.contentLength,
      etag: obj.etag,
      versionId: obj.versionId,
    };
  }

  hasObject(bucket: string, key: string): boolean {
    return this.objects.has(storageKey(bucket, key));
  }

  exactByteLength(bucket: string, key: string): number | null {
    const obj = this.objects.get(storageKey(bucket, key));
    return obj ? obj.contentLength : null;
  }

  async send(
    command: FakeS3Command,
    options?: { abortSignal?: AbortSignal },
  ): Promise<unknown> {
    if (this.forceSendError) {
      throw this.forceSendError;
    }
    if (options?.abortSignal?.aborted) {
      const err = new Error("AbortError");
      err.name = "AbortError";
      throw err;
    }

    switch (command.name) {
      case "HeadObject": {
        if (this.forceHeadError) {
          throw this.forceHeadError;
        }
        const sk = storageKey(command.input.Bucket, command.input.Key);
        const obj = this.objects.get(sk);
        if (!obj) {
          const err = new Error("NotFound");
          err.name = "NotFound";
          (err as { $metadata?: { httpStatusCode: number } }).$metadata = {
            httpStatusCode: 404,
          };
          throw err;
        }
        this.headedKeys.add(sk);
        const base = {
          ContentLength: obj.contentLength,
          ContentType: obj.contentType,
          $metadata: { httpStatusCode: 200 },
        };
        if (this.omitRevisionOnHead) {
          return base;
        }
        return {
          ...base,
          ETag: `"${obj.etag}"`,
          ...(obj.versionId != null ? { VersionId: obj.versionId } : {}),
        };
      }
      case "GetObject": {
        const sk = storageKey(command.input.Bucket, command.input.Key);
        if (
          this.mutateBetweenHeadAndGet &&
          this.headedKeys.has(sk)
        ) {
          this.mutateBetweenHeadAndGet(
            command.input.Bucket,
            command.input.Key,
          );
          this.headedKeys.delete(sk);
        }
        const obj = this.objects.get(sk);
        if (!obj) {
          const err = new Error("NoSuchKey");
          err.name = "NoSuchKey";
          (err as { $metadata?: { httpStatusCode: number } }).$metadata = {
            httpStatusCode: 404,
          };
          throw err;
        }
        if (command.input.Range) {
          const err = new Error("RangeNotSupportedInDefaultPath");
          err.name = "InvalidRange";
          throw err;
        }
        if (command.input.IfMatch != null) {
          const expected = command.input.IfMatch.replace(/^"+|"+$/g, "");
          if (expected !== obj.etag) {
            const err = new Error("PreconditionFailed");
            err.name = "PreconditionFailed";
            (err as { $metadata?: { httpStatusCode: number } }).$metadata = {
              httpStatusCode: 412,
            };
            throw err;
          }
        }
        if (
          command.input.VersionId != null &&
          command.input.VersionId !== obj.versionId
        ) {
          const err = new Error("PreconditionFailed");
          err.name = "PreconditionFailed";
          (err as { $metadata?: { httpStatusCode: number } }).$metadata = {
            httpStatusCode: 412,
          };
          throw err;
        }
        const delay = this.getObjectDelayMs;
        const signal = options?.abortSignal;
        const bodyBytes = obj.body;
        return {
          ContentLength: obj.contentLength,
          ContentType: obj.contentType,
          ETag: `"${obj.etag}"`,
          ...(obj.versionId != null ? { VersionId: obj.versionId } : {}),
          Body: {
            async *[Symbol.asyncIterator]() {
              if (delay > 0) {
                await new Promise<void>((resolve, reject) => {
                  const t = setTimeout(resolve, delay);
                  if (signal) {
                    const onAbort = () => {
                      clearTimeout(t);
                      const err = new Error("AbortError");
                      err.name = "AbortError";
                      reject(err);
                    };
                    if (signal.aborted) {
                      onAbort();
                      return;
                    }
                    signal.addEventListener("abort", onAbort, { once: true });
                  }
                });
              }
              yield* bytesAsAsyncIterable(bodyBytes, 64 * 1024, signal);
            },
          },
          $metadata: { httpStatusCode: 200 },
        };
      }
      case "PutObject": {
        const body = await consumePutObjectBody(
          command.input.Body,
          this.putObjectChunkDelayMs,
          (inflight) => {
            if (inflight > this.testingPeakInflightPutChunks) {
              this.testingPeakInflightPutChunks = inflight;
            }
          },
        );
        const contentLength =
          command.input.ContentLength ?? body.byteLength;
        if (contentLength !== body.byteLength) {
          const err = new Error("ContentLengthMismatch");
          err.name = "InvalidRequest";
          throw err;
        }
        this.objects.set(storageKey(command.input.Bucket, command.input.Key), {
          body,
          contentType: command.input.ContentType ?? "application/octet-stream",
          contentLength,
          etag: etagFor(body),
          versionId: null,
        });
        return { $metadata: { httpStatusCode: 200 } };
      }
      case "DeleteObject": {
        this.testingDeleteObjectCalls += 1;
        this.objects.delete(storageKey(command.input.Bucket, command.input.Key));
        return { $metadata: { httpStatusCode: 204 } };
      }
      default: {
        const _exhaustive: never = command;
        void _exhaustive;
        throw new Error("UnsupportedCommand");
      }
    }
  }
}

/** Narrow command constructors matching adapter injection shape. */
export function FakeHeadObjectCommand(input: {
  Bucket: string;
  Key: string;
}): FakeS3Command {
  return { name: "HeadObject", input };
}

export function FakeGetObjectCommand(input: {
  Bucket: string;
  Key: string;
  Range?: string;
  IfMatch?: string;
  VersionId?: string;
}): FakeS3Command {
  return { name: "GetObject", input };
}

export function FakePutObjectCommand(input: {
  Bucket: string;
  Key: string;
  Body?: Uint8Array | string | Readable | AsyncIterable<Uint8Array>;
  ContentType?: string;
  ContentLength?: number;
}): FakeS3Command {
  return { name: "PutObject", input };
}

async function consumePutObjectBody(
  body: Uint8Array | string | Readable | AsyncIterable<Uint8Array> | undefined,
  chunkDelayMs: number,
  onInflight: (inflight: number) => void,
): Promise<Uint8Array> {
  if (body == null) {
    return new Uint8Array(0);
  }
  if (typeof body === "string") {
    return new TextEncoder().encode(body);
  }
  if (body instanceof Uint8Array) {
    return copyBytes(body);
  }

  const parts: Uint8Array[] = [];
  let total = 0;
  const sinkChunk = async (chunk: Uint8Array) => {
    onInflight(1);
    if (chunkDelayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, chunkDelayMs));
    }
    parts.push(copyBytes(chunk));
    total += chunk.byteLength;
    onInflight(0);
  };

  if (body instanceof Readable || isNodeReadable(body)) {
    const readable = body as Readable;
    for await (const chunk of readable) {
      const bytes =
        chunk instanceof Uint8Array
          ? chunk
          : Buffer.isBuffer(chunk)
            ? new Uint8Array(chunk)
            : new TextEncoder().encode(String(chunk));
      if (bytes.byteLength > 0) {
        await sinkChunk(bytes);
      }
    }
  } else if (
    typeof body === "object" &&
    Symbol.asyncIterator in (body as object)
  ) {
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      if (!(chunk instanceof Uint8Array)) {
        const err = new Error("InvalidBodyChunk");
        err.name = "InvalidRequest";
        throw err;
      }
      if (chunk.byteLength > 0) {
        await sinkChunk(chunk);
      }
    }
  } else {
    const err = new Error("UnsupportedBody");
    err.name = "InvalidRequest";
    throw err;
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function isNodeReadable(value: unknown): value is Readable {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as Readable).read === "function" &&
    typeof (value as Readable).on === "function"
  );
}

export function FakeDeleteObjectCommand(input: {
  Bucket: string;
  Key: string;
}): FakeS3Command {
  return { name: "DeleteObject", input };
}
