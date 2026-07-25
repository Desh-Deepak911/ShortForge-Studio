/**
 * Shared helpers for hosted Fly verifier live matrix.
 */

import { randomUUID } from "node:crypto";

import {
  createMinimalProvisionalJob,
  createStagingObject,
  digestOf,
  makeSyntheticJsonBytes,
  putObjectBytes,
  trackJobId,
  trackObjectId,
  trackProjectId,
  trackR2Locator,
} from "../r2-live/live-fixtures";

import {
  HEADLESS_VERIFICATION_TARGET_ASSET_BUNDLE_RECORD,
  HEADLESS_VERIFICATION_TARGET_MANIFEST,
} from "@/features/headless-renderer/control-plane";

import {
  observeHostedVerifierState,
  type HostedVerifierObservedState,
} from "./hosted-verifier-observer";
import type { FlyVerifyLiveMatrixContext } from "./types";

export type { HostedVerifierObservedState };

export async function pollHostedVerifierState(
  ctx: FlyVerifyLiveMatrixContext,
): Promise<HostedVerifierObservedState> {
  return observeHostedVerifierState(ctx);
}

export async function waitForHostedVerifierState(
  ctx: FlyVerifyLiveMatrixContext,
  predicate: (
    state: Awaited<ReturnType<typeof pollHostedVerifierState>>,
  ) => boolean,
  options: { readonly timeoutMs?: number; readonly intervalMs?: number } = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 3_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await pollHostedVerifierState(ctx);
    if (predicate(state)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export async function seedFlyVerifyLiveProvisionalChain(
  ctx: FlyVerifyLiveMatrixContext,
): Promise<{ ok: true } | { ok: false }> {
  trackProjectId(ctx, ctx.projectId);
  const principal = { ownerId: ctx.ownerId, sessionId: "fly-verify-live" };
  const claimed = await ctx.projectAuthorization.claimUnownedProject(
    principal,
    ctx.projectId,
  );
  if (!claimed.ok) return { ok: false };

  const jobId = randomUUID();
  const operationId = randomUUID();
  const bytes = makeSyntheticJsonBytes(ctx.runId);
  const digest = digestOf(bytes);
  const mime = "application/json";

  const provisional = await createMinimalProvisionalJob(ctx, {
    jobId,
    operationId,
    creatorKey: `fly-verify-live-${ctx.runId}`,
    manifestPayloadDigestClaim: digest,
  });
  if (!provisional.ok) return { ok: false };

  const staging = await createStagingObject(ctx, {
    jobId,
    operationId,
    purpose: "manifest",
    bytes,
    digest,
    mime,
    expectedByteLength: bytes.byteLength,
  });
  if (!staging.ok) return { ok: false };

  ctx.session.jobId = jobId;
  ctx.session.operationId = operationId;
  ctx.session.objectId = staging.objectId;
  ctx.session.objectKey = staging.objectKey;
  ctx.session.storeId = staging.storeId;
  ctx.session.bytes = bytes;
  ctx.session.digest = digest;
  ctx.session.mime = mime;
  ctx.session.expectedByteLength = bytes.byteLength;
  trackJobId(ctx, jobId);
  trackObjectId(ctx, staging.objectId);
  trackR2Locator(ctx, {
    storeId: staging.storeId,
    objectKey: staging.objectKey,
  });
  return { ok: true };
}

export async function uploadManifestOnly(
  ctx: FlyVerifyLiveMatrixContext,
): Promise<{ ok: true } | { ok: false }> {
  if (
    ctx.session.objectId == null ||
    ctx.session.objectKey == null ||
    ctx.session.storeId == null ||
    ctx.session.bytes == null ||
    ctx.session.jobId == null ||
    ctx.session.operationId == null
  ) {
    return { ok: false };
  }
  const origin = ctx.r2Config.allowedOrigins[0];
  if (origin == null) return { ok: false };
  const issued = await ctx.uploadCapability.issueDirectPutCapability({
    ownerId: ctx.ownerId,
    projectId: ctx.projectId,
    jobId: ctx.session.jobId,
    operationId: ctx.session.operationId,
    objectId: ctx.session.objectId,
    expectedByteLength: ctx.session.bytes.byteLength,
    expectedMimeType: ctx.session.mime,
    allowedOrigin: origin,
    nowMs: ctx.nowMs,
  });
  if (!issued.ok) return { ok: false };
  ctx.session.uploadCapabilityIssued = true;
  const written = await putObjectBytes(ctx, {
    storeId: ctx.session.storeId,
    objectKey: ctx.session.objectKey,
    bytes: ctx.session.bytes,
    mime: ctx.session.mime,
  });
  return written.ok ? { ok: true } : { ok: false };
}

export function requiredVerificationTargetsPresent(): boolean {
  return (
    HEADLESS_VERIFICATION_TARGET_MANIFEST.length > 0 &&
    HEADLESS_VERIFICATION_TARGET_ASSET_BUNDLE_RECORD.length > 0
  );
}
