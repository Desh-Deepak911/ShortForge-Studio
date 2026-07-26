/**
 * R2 presigned GET download capability issuer for succeeded-job artifacts.
 * Server-only. Import from this path in compose/tests — not re-exported from production barrel.
 * Production composition remains unavailable until full durable stack is wired.
 */

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  classifyHeadlessR2Environment,
  readConfiguredHeadlessR2Config,
  type HeadlessConfiguredR2Config,
} from "../runtime/r2-environment";
import type { HeadlessJobStorePort } from "../ports/job-store.port";
import type { HeadlessOwnedObjectStorePort } from "../ports/owned-object-store.port";
import type {
  HeadlessDownloadCapabilityPort,
  HeadlessIssuedDownloadCapabilityV1,
} from "../ports/download-capability.port";
import { cpFail, cpOk } from "../types/control-plane.types";
import {
  contentDispositionForHeadlessDownload,
  resolveHeadlessDownloadFilename,
} from "../services/headless-download-filename";

export const HEADLESS_DOWNLOAD_CAPABILITY_DEFAULT_TTL_MS = 120_000;
export const HEADLESS_DOWNLOAD_CAPABILITY_MAX_TTL_MS = 300_000;

export type CreatePresignedGetUrl = (input: {
  bucket: string;
  objectKey: string;
  expiresInSeconds: number;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  filename: string;
}) => Promise<string>;

export type R2DownloadCapabilityAdapterOptions = {
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly jobStore: HeadlessJobStorePort;
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly createPresignedGetUrl?: CreatePresignedGetUrl;
  readonly configOverride?: HeadlessConfiguredR2Config;
};

async function defaultCreatePresignedGetUrl(input: {
  bucket: string;
  objectKey: string;
  expiresInSeconds: number;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  filename: string;
}): Promise<string> {
  const client = new S3Client({
    region: "auto",
    endpoint: input.endpoint,
    credentials: {
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
    },
    forcePathStyle: true,
  });
  try {
    const command = new GetObjectCommand({
      Bucket: input.bucket,
      Key: input.objectKey,
      ResponseContentDisposition:
        contentDispositionForHeadlessDownload(input.filename),
    });
    return await getSignedUrl(client, command, {
      expiresIn: input.expiresInSeconds,
    });
  } finally {
    client.destroy();
  }
}

export class R2DownloadCapabilityAdapter
  implements HeadlessDownloadCapabilityPort
{
  private readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  private readonly jobStore: HeadlessJobStorePort;
  private readonly env: NodeJS.ProcessEnv | Record<string, unknown>;
  private readonly createPresignedGetUrl: CreatePresignedGetUrl;
  private readonly configOverride: HeadlessConfiguredR2Config | undefined;

  constructor(options: R2DownloadCapabilityAdapterOptions) {
    this.ownedObjectStore = options.ownedObjectStore;
    this.jobStore = options.jobStore;
    this.env = options.env ?? process.env;
    this.createPresignedGetUrl =
      options.createPresignedGetUrl ?? defaultCreatePresignedGetUrl;
    this.configOverride = options.configOverride;
  }

  async issueArtifactGetCapability(input: {
    ownerId: string;
    jobId: string;
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
          "Headless download capability issuance is not configured.",
        );
      }

      const ttlMs = input.ttlMs ?? HEADLESS_DOWNLOAD_CAPABILITY_DEFAULT_TTL_MS;
      if (
        !Number.isSafeInteger(ttlMs) ||
        ttlMs < 1_000 ||
        ttlMs > HEADLESS_DOWNLOAD_CAPABILITY_MAX_TTL_MS
      ) {
        return cpFail("HOSTILE_INPUT", "Download capability TTL rejected.");
      }

      const job = await this.jobStore.getByJobIdAndOwner(
        input.jobId,
        input.ownerId,
      );
      if (!job.ok) return job;
      if (job.value.stage !== "canonical") {
        return cpFail("FORBIDDEN", "Download requires a succeeded canonical job.");
      }
      const state = job.value.canonicalJob.state;
      if (state !== "succeeded") {
        return cpFail("FORBIDDEN", "Download requires a succeeded job.");
      }
      const binding = job.value.artifactObjectBinding;
      if (binding == null) {
        return cpFail(
          "JOB_STORE_COHERENCE_REJECTED",
          "Succeeded job missing artifact binding.",
        );
      }

      const listed = await this.ownedObjectStore.listByJobIdAndOwner({
        jobId: input.jobId,
        ownerId: input.ownerId,
      });
      if (!listed.ok) return listed;

      const bindingStoreId = binding.storageLocator.storeId;
      const artifact = listed.value.find(
        (entry) =>
          entry.record.purpose === "artifact" &&
          entry.record.stage === "finalized" &&
          entry.record.objectKey === binding.storageLocator.objectKey &&
          (bindingStoreId === "artifacts" || bindingStoreId === "assets"
            ? entry.record.storeId === bindingStoreId
            : true),
      );

      // Prefer binding locator identity; fall back to single finalized artifact.
      let record = artifact?.record ?? null;
      if (record == null) {
        const finalizedArtifacts = listed.value.filter(
          (e) =>
            e.record.purpose === "artifact" && e.record.stage === "finalized",
        );
        if (finalizedArtifacts.length !== 1) {
          return cpFail(
            "JOB_STORE_COHERENCE_REJECTED",
            "Artifact object binding could not be resolved.",
          );
        }
        record = finalizedArtifacts[0]!.record;
      }

      if (record.stage !== "finalized") {
        return cpFail("FORBIDDEN", "Artifact is not finalized.");
      }
      if (record.expiresAtMs < input.nowMs) {
        return cpFail("ASSET_EXPIRED", "Artifact lease expired.");
      }

      const bucket =
        record.storeId === "artifacts"
          ? config.bucketArtifacts
          : config.bucketAssets;
      const expiresInSeconds = Math.max(1, Math.floor(ttlMs / 1000));
      const expiresAtMs = input.nowMs + expiresInSeconds * 1000;

      let getUrl: string;
      const filename = resolveHeadlessDownloadFilename({
        requestedFilename: job.value.canonicalRequest.manifest.output.filename,
        format: job.value.canonicalJob.rendererProfile.format,
      });
      try {
        getUrl = await this.createPresignedGetUrl({
          bucket,
          objectKey: record.objectKey,
          expiresInSeconds,
          endpoint: config.endpoint,
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
          filename,
        });
      } catch {
        return cpFail(
          "INTERNAL_ERROR",
          "Download capability issuance failed.",
        );
      }

      if (typeof getUrl !== "string" || getUrl.length === 0) {
        return cpFail(
          "INTERNAL_ERROR",
          "Download capability issuance failed.",
        );
      }

      const issued: HeadlessIssuedDownloadCapabilityV1 = Object.freeze({
        jobId: input.jobId,
        expiresAtMs,
        getUrl,
      });
      return cpOk(issued);
    } catch {
      return cpFail(
        "INTERNAL_ERROR",
        "Download capability issuance failed.",
      );
    }
  }
}
