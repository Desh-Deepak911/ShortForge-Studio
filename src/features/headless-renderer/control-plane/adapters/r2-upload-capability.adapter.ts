/**
 * R2 presigned PUT upload capability issuer (Design B staging).
 * Server-only. Import from this path in compose/tests — not re-exported from production barrel.
 *
 * ## AWS SigV4 PutObject signing truth
 *
 * When `PutObjectCommand` is constructed with `Bucket`, `Key`, `ContentType`, and
 * `ContentLength`, AWS SigV4 (via `@aws-sdk/s3-request-presigner` / `getSignedUrl`)
 * includes those headers in the signed canonical request. **ContentLength IS signed
 * when passed on the command** in this adapter path.
 *
 * Browser clients must send `Content-Type` and `Content-Length` matching the signed
 * values for R2 to accept the PUT. The issued capability returns those required headers;
 * the URL itself is **issuance-only and never persisted**.
 *
 * Trust policy (independent of signing):
 * - Content-Type on the capability is a **claim until trusted verify**.
 * - Byte length is **always revalidated from the full-object stream** at verify time.
 * - Client-supplied digests are **never trusted** — digest authority is stream sha256 only.
 *
 * If ContentLength signing behavior differs across SDK versions, stream length remains
 * the sole durable length authority (documented in HEADLESS_11E_R2_DURABILITY_EVIDENCE.md).
 */

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  classifyHeadlessR2Environment,
  readConfiguredHeadlessR2Config,
  type HeadlessConfiguredR2Config,
} from "../runtime/r2-environment";
import type { HeadlessOwnedObjectStorePort } from "../ports/owned-object-store.port";
import type {
  HeadlessIssuedUploadCapabilityV1,
  HeadlessUploadCapabilityPort,
} from "../ports/upload-capability.port";
import { cpFail, cpOk } from "../types/control-plane.types";

export const HEADLESS_UPLOAD_CAPABILITY_DEFAULT_TTL_MS = 120_000;
export const HEADLESS_UPLOAD_CAPABILITY_MAX_TTL_MS = 300_000;

export type CreatePresignedPutUrl = (input: {
  bucket: string;
  objectKey: string;
  contentType: string;
  contentLength?: number;
  expiresInSeconds: number;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}) => Promise<string>;

export type R2UploadCapabilityAdapterOptions = {
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  /** Inject for tests — avoids network and real credentials. */
  readonly createPresignedPutUrl?: CreatePresignedPutUrl;
  readonly configOverride?: HeadlessConfiguredR2Config;
  /** Browser fetch cannot set the forbidden Content-Length request header. */
  readonly browserCompatible?: boolean;
};

function normalizeOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (!parsed.hostname) return null;
    if (parsed.pathname !== "/" && parsed.pathname !== "") return null;
    if (parsed.search || parsed.hash) return null;
    const port = parsed.port ? `:${parsed.port}` : "";
    return `https://${parsed.hostname}${port}`;
  } catch {
    return null;
  }
}

async function defaultCreatePresignedPutUrl(input: {
  bucket: string;
  objectKey: string;
  contentType: string;
  contentLength?: number;
  expiresInSeconds: number;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}): Promise<string> {
  const client = new S3Client({
    region: "auto",
    endpoint: input.endpoint,
    credentials: {
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
    },
    forcePathStyle: true,
    // PutObject is presigned before the browser body exists. The SDK's
    // WHEN_SUPPORTED default otherwise adds an empty-body CRC32 query claim,
    // which R2 rejects when the browser uploads the real non-empty bytes.
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  try {
    const command = new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
      ...(input.contentLength != null
        ? { ContentLength: input.contentLength }
        : {}),
    });
    return await getSignedUrl(client, command, {
      expiresIn: input.expiresInSeconds,
    });
  } finally {
    client.destroy();
  }
}

export class R2UploadCapabilityAdapter implements HeadlessUploadCapabilityPort {
  private readonly store: HeadlessOwnedObjectStorePort;
  private readonly env: NodeJS.ProcessEnv | Record<string, unknown>;
  private readonly createPresignedPutUrl: CreatePresignedPutUrl;
  private readonly configOverride: HeadlessConfiguredR2Config | undefined;
  private readonly browserCompatible: boolean;

  constructor(options: R2UploadCapabilityAdapterOptions) {
    this.store = options.ownedObjectStore;
    this.env = options.env ?? process.env;
    this.createPresignedPutUrl =
      options.createPresignedPutUrl ?? defaultCreatePresignedPutUrl;
    this.configOverride = options.configOverride;
    this.browserCompatible = options.browserCompatible === true;
  }

  async issueDirectPutCapability(input: {
    ownerId: string;
    projectId: string;
    jobId: string;
    operationId: string;
    objectId: string;
    expectedByteLength: number;
    expectedMimeType: string;
    allowedOrigin: string;
    nowMs: number;
    ttlMs?: number;
  }) {
    try {
      const config =
        this.configOverride ??
        (classifyHeadlessR2Environment(this.env) === "configured"
          ? readConfiguredHeadlessR2Config(this.env)
          : null);
      if (config == null) {
        return cpFail(
          "CONFIGURATION_UNAVAILABLE",
          "Headless upload capability issuance is not configured.",
        );
      }

      const origin = normalizeOrigin(input.allowedOrigin);
      if (origin == null) {
        return cpFail("HOSTILE_INPUT", "Upload origin rejected.");
      }
      if (!config.allowedOrigins.includes(origin)) {
        return cpFail("FORBIDDEN", "Upload origin is not allowed.");
      }

      const ttlMs = input.ttlMs ?? HEADLESS_UPLOAD_CAPABILITY_DEFAULT_TTL_MS;
      if (
        !Number.isSafeInteger(ttlMs) ||
        ttlMs < 1_000 ||
        ttlMs > HEADLESS_UPLOAD_CAPABILITY_MAX_TTL_MS
      ) {
        return cpFail("HOSTILE_INPUT", "Upload capability TTL rejected.");
      }
      if (
        !Number.isSafeInteger(input.expectedByteLength) ||
        input.expectedByteLength < 1
      ) {
        return cpFail("HOSTILE_INPUT", "Upload expected length rejected.");
      }
      if (
        typeof input.expectedMimeType !== "string" ||
        input.expectedMimeType.length === 0
      ) {
        return cpFail("HOSTILE_INPUT", "Upload expected MIME rejected.");
      }

      const loaded = await this.store.getByObjectIdAndOwner({
        objectId: input.objectId,
        ownerId: input.ownerId,
      });
      if (!loaded.ok) return loaded;
      if (loaded.value == null) {
        return cpFail("JOB_NOT_FOUND", "Staging owned object not found.");
      }
      const { record } = loaded.value;
      if (record.stage !== "staging") {
        return cpFail("TERMINAL_IMMUTABLE", "Upload requires staging object.");
      }
      if (
        record.projectId !== input.projectId ||
        record.jobId !== input.jobId ||
        record.operationId !== input.operationId
      ) {
        return cpFail("FORBIDDEN", "Upload capability binding mismatch.");
      }
      if (
        record.expectedByteLength !== input.expectedByteLength ||
        record.expectedMimeType !== input.expectedMimeType
      ) {
        return cpFail(
          "HOSTILE_INPUT",
          "Upload capability claims do not match staging record.",
        );
      }
      if (record.uploadCapabilityExpiresAtMs < input.nowMs) {
        return cpFail("FORBIDDEN", "Staging upload lease expired.");
      }

      const bucket =
        record.storeId === "artifacts"
          ? config.bucketArtifacts
          : config.bucketAssets;
      const expiresInSeconds = Math.max(1, Math.floor(ttlMs / 1000));
      const expiresAtMs = input.nowMs + expiresInSeconds * 1000;

      let putUrl: string;
      try {
        putUrl = await this.createPresignedPutUrl({
          bucket,
          objectKey: record.objectKey,
          contentType: input.expectedMimeType,
          ...(!this.browserCompatible
            ? { contentLength: input.expectedByteLength }
            : {}),
          expiresInSeconds,
          endpoint: config.endpoint,
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        });
      } catch {
        return cpFail(
          "INTERNAL_ERROR",
          "Upload capability issuance failed.",
        );
      }

      if (typeof putUrl !== "string" || putUrl.length === 0) {
        return cpFail(
          "INTERNAL_ERROR",
          "Upload capability issuance failed.",
        );
      }

      const issued: HeadlessIssuedUploadCapabilityV1 = Object.freeze({
        objectId: input.objectId,
        expiresAtMs,
        putUrl,
        requiredHeaders: Object.freeze({
          "Content-Type": input.expectedMimeType,
          ...(!this.browserCompatible
            ? { "Content-Length": String(input.expectedByteLength) }
            : {}),
        }),
      });
      return cpOk(issued);
    } catch {
      return cpFail(
        "INTERNAL_ERROR",
        "Upload capability issuance failed.",
      );
    }
  }
}
