/**
 * Shared helpers for R2 live matrix runners (no remote I/O by themselves).
 * Phase 2C.1B: same-snapshot authority — one payload, one digest, shared claims.
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  createProvisionalMaterializingRecord,
  deriveHeadlessR2ObjectKey,
  type HeadlessOwnedObjectPurpose,
} from "@/features/headless-renderer/control-plane";
import { parseHeadlessSourceSlotKey } from "@/features/headless-renderer/domain/headless-source-slot-key";
import { buildHeadlessAuthorityFingerprint } from "@/features/headless-renderer/domain";

import type { R2LiveMatrixContext } from "./types";

export function digestOf(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/**
 * Generate exact synthetic manifest bytes for a run.
 * Callers must digest these bytes once and reuse that digest for both
 * provisional snapshotClaim and owned-object expected claim.
 */
export function makeSyntheticJsonBytes(runId: string): Uint8Array {
  const payload = JSON.stringify({
    kind: "r2-live-fixture",
    runId,
    nonce: randomBytes(8).toString("hex"),
  });
  return new TextEncoder().encode(payload);
}

export async function* singleChunk(
  bytes: Uint8Array,
): AsyncGenerator<Uint8Array> {
  yield bytes;
}

export function trackObjectId(ctx: R2LiveMatrixContext, objectId: string): void {
  if (!ctx.createdObjectIds.includes(objectId)) {
    ctx.createdObjectIds.push(objectId);
  }
}

export function trackJobId(ctx: R2LiveMatrixContext, jobId: string): void {
  if (!ctx.createdJobIds.includes(jobId)) {
    ctx.createdJobIds.push(jobId);
  }
}

export function trackProjectId(
  ctx: R2LiveMatrixContext,
  projectId: string,
): void {
  if (!ctx.createdProjectIds.includes(projectId)) {
    ctx.createdProjectIds.push(projectId);
  }
}

export function trackR2Locator(
  ctx: R2LiveMatrixContext,
  locator: { storeId: "assets" | "artifacts"; objectKey: string },
): void {
  const exists = ctx.createdR2Locators.some(
    (l) => l.storeId === locator.storeId && l.objectKey === locator.objectKey,
  );
  if (!exists) {
    ctx.createdR2Locators.push(locator);
  }
}

/**
 * QA staging key for live/targeted fixtures.
 *
 * Full `deriveHeadlessR2ObjectKey` paths are ~133 chars and exceed the
 * provisional staging-ref locator cap (`HEADLESS_MAX_ID_LENGTH` = 128), which
 * would fail-closed on coverage reconcile even with correct digests.
 * Fixture keys stay ≤128 while remaining opaque path-shaped identities.
 */
export function deriveStagingKey(input: {
  ownerId: string;
  projectId: string;
  jobId: string;
  operationId: string;
  purpose: HeadlessOwnedObjectPurpose;
  slotKey?: string | null;
}):
  | { ok: true; objectKey: string; storeId: "assets" | "artifacts" }
  | { ok: false; message: string } {
  const slotKey = input.slotKey;
  if (slotKey != null && slotKey !== "") {
    const slotParsed = parseHeadlessSourceSlotKey(slotKey);
    if (!slotParsed.ok) {
      const shortSlotOk =
        slotKey.length > 0 &&
        slotKey.length <= 128 &&
        slotKey === slotKey.trim() &&
        !/\s/.test(slotKey) &&
        !slotKey.includes("..") &&
        !slotKey.includes("/") &&
        !slotKey.includes("\\");
      if (!shortSlotOk) {
        return { ok: false, message: "Object key derivation rejected slot identity." };
      }
    }
  }
  // hslot:v2 keys may exceed HEADLESS_MAX_ID_LENGTH; QA keys hash the slot segment.
  const slotKeyForDeriver =
    input.slotKey != null && input.slotKey.length > 128
      ? null
      : (input.slotKey ?? null);
  // Validate identities via the production deriver, then emit a short QA key.
  const derived = deriveHeadlessR2ObjectKey({
    environmentNamespace: "test",
    objectNamespace: "staging",
    ownerId: input.ownerId,
    projectId: input.projectId,
    jobId: input.jobId,
    operationId: input.operationId,
    purpose: input.purpose,
    slotKey: slotKeyForDeriver,
    nonce: randomBytes(16).toString("hex"),
  });
  if (!derived.ok) {
    return { ok: false, message: derived.message };
  }

  const purposeSeg =
    input.purpose === "asset_bundle_record"
      ? "bundle"
      : input.purpose === "asset_bytes"
        ? "bytes"
        : input.purpose;
  const slotSeg =
    input.slotKey == null || input.slotKey === ""
      ? "none"
      : createHash("sha256").update(input.slotKey, "utf8").digest("hex").slice(0, 8);
  const ownerSeg = createHash("sha256")
    .update(input.ownerId, "utf8")
    .digest("hex")
    .slice(0, 8);
  const jobSeg = createHash("sha256")
    .update(input.jobId, "utf8")
    .digest("hex")
    .slice(0, 8);
  const opSeg = createHash("sha256")
    .update(input.operationId, "utf8")
    .digest("hex")
    .slice(0, 8);
  const nonce = randomBytes(8).toString("hex");
  const objectKey = `qa/stg/${derived.storeId}/${purposeSeg}/${ownerSeg}/${jobSeg}/${opSeg}/${slotSeg}/${nonce}`;
  if (objectKey.length > 128) {
    return { ok: false, message: "QA staging object key exceeds locator cap." };
  }
  return { ok: true, objectKey, storeId: derived.storeId };
}

export type CreateMinimalProvisionalJobInput = {
  readonly jobId: string;
  readonly operationId: string;
  readonly creatorKey: string;
  /**
   * Required explicit snapshot digest — must equal digestOf(uploaded bytes).
   * No silent fallback digest is derived.
   */
  readonly manifestPayloadDigestClaim: string;
  /** Optional; defaults to a stable fixture bundle fingerprint claim. */
  readonly assetBundleFingerprintClaim?: string;
};

/**
 * Create a minimal provisional materializing job bound to an explicit
 * manifest digest claim. Callers must supply the same digest used for the
 * owned-object staging expected claim.
 */
export async function createMinimalProvisionalJob(
  ctx: R2LiveMatrixContext,
  input: CreateMinimalProvisionalJobInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (
    typeof input.manifestPayloadDigestClaim !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(input.manifestPayloadDigestClaim)
  ) {
    return {
      ok: false,
      message: "manifestPayloadDigestClaim must be an exact sha256 claim",
    };
  }

  const idem = buildHeadlessAuthorityFingerprint("hid", {
    version: 1,
    kind: "control-plane-idempotency",
    ownership: { ownerId: ctx.ownerId, projectId: ctx.projectId },
    idempotencyKey: input.creatorKey,
  });
  if (!idem.ok) {
    return { ok: false, message: "idempotency fingerprint failed" };
  }

  const bundleClaim =
    input.assetBundleFingerprintClaim ?? `hab:sha256:${"ab".repeat(32)}`;

  const provisional = createProvisionalMaterializingRecord({
    jobId: input.jobId,
    ownerId: ctx.ownerId,
    projectId: ctx.projectId,
    operationId: input.operationId,
    creatorIdempotencyKey: input.creatorKey,
    idempotencyAuthorityKey: idem.fingerprint,
    requestedRendererProfile: {
      resolution: "720p",
      format: "webm",
      fps: 30,
      quality: "standard",
    },
    requestedRendererBuildId: `r2qa-build-${ctx.runId.slice(0, 8)}`,
    snapshotClaim: {
      manifestPayloadDigestClaim: input.manifestPayloadDigestClaim,
      assetBundleFingerprintClaim: bundleClaim,
      expectedSlotClaims: [],
    },
    stagingObjectRefs: [],
    createdAtMs: ctx.nowMs,
    updatedAtMs: ctx.nowMs,
    expiresAtMs: ctx.nowMs + 3_600_000,
  });
  if (!provisional.ok) {
    return { ok: false, message: provisional.message };
  }

  const created = await ctx.jobStore.createProvisionalIfAbsent({
    idempotencyAuthorityKey: idem.fingerprint,
    record: provisional.record,
  });
  if (!created.ok) {
    return {
      ok: false,
      message: created.issues[0]?.message ?? "provisional create failed",
    };
  }
  trackJobId(ctx, input.jobId);
  return { ok: true };
}

export async function createStagingObject(
  ctx: R2LiveMatrixContext,
  input: {
    objectId?: string;
    jobId: string;
    operationId: string;
    purpose?: HeadlessOwnedObjectPurpose;
    bytes: Uint8Array;
    digest?: string;
    mime?: string;
    expectedByteLength?: number;
    expiresAtMs?: number | null;
    slotKey?: string | null;
  },
): Promise<
  | {
      ok: true;
      objectId: string;
      objectKey: string;
      storeId: "assets" | "artifacts";
      digest: string;
      mime: string;
      expectedByteLength: number;
    }
  | { ok: false; message: string }
> {
  const objectId = input.objectId ?? randomUUID();
  const purpose = input.purpose ?? "manifest";
  const mime = input.mime ?? "application/json";
  const digest = input.digest ?? digestOf(input.bytes);
  const expectedByteLength = input.expectedByteLength ?? input.bytes.byteLength;
  const key = deriveStagingKey({
    ownerId: ctx.ownerId,
    projectId: ctx.projectId,
    jobId: input.jobId,
    operationId: input.operationId,
    purpose,
    slotKey: input.slotKey ?? null,
  });
  if (!key.ok) {
    return { ok: false, message: key.message };
  }

  const created = await ctx.ownedObjectStore.createStagingRecord({
    objectId,
    ownerId: ctx.ownerId,
    projectId: ctx.projectId,
    jobId: input.jobId,
    operationId: input.operationId,
    purpose,
    slotKey: input.slotKey ?? null,
    storeId: key.storeId,
    objectKey: key.objectKey,
    expectedContentDigestClaim: digest,
    expectedByteLength,
    expectedMimeType: mime,
    uploadCapabilityIssuedAtMs: ctx.nowMs,
    uploadCapabilityExpiresAtMs: ctx.nowMs + 600_000,
    expiresAtMs:
      input.expiresAtMs === undefined ? ctx.nowMs + 3_600_000 : input.expiresAtMs,
    createdAtMs: ctx.nowMs,
  });
  if (!created.ok) {
    return {
      ok: false,
      message: created.issues[0]?.message ?? "staging create failed",
    };
  }

  trackObjectId(ctx, objectId);
  trackR2Locator(ctx, { storeId: key.storeId, objectKey: key.objectKey });
  return {
    ok: true,
    objectId,
    objectKey: key.objectKey,
    storeId: key.storeId,
    digest,
    mime,
    expectedByteLength,
  };
}

export async function putObjectBytes(
  ctx: R2LiveMatrixContext,
  input: {
    storeId: "assets" | "artifacts";
    objectKey: string;
    bytes: Uint8Array;
    mime: string;
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const written = await ctx.io.writeUploadStream({
    locator: { storeId: input.storeId, objectKey: input.objectKey },
    ownerId: ctx.ownerId,
    contentType: input.mime,
    expectedByteLength: input.bytes.byteLength,
    maxBytes: Math.max(input.bytes.byteLength, 1024),
    chunks: singleChunk(input.bytes),
  });
  if (!written.ok) {
    return {
      ok: false,
      message: written.issues[0]?.message ?? "writeUploadStream failed",
    };
  }
  trackR2Locator(ctx, {
    storeId: input.storeId,
    objectKey: input.objectKey,
  });
  return { ok: true };
}

export function issueCode(
  result: { ok: false; issues: readonly { code: string }[] },
): string | undefined {
  return result.issues[0]?.code;
}
