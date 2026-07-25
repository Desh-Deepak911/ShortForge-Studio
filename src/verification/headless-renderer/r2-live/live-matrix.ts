/**
 * Ordered R2 live matrix runners.
 * Case runners accept injected deps (fakes for gate-off authority tests).
 * Real gate-on path constructs Neon + R2 adapters in the harness runner.
 *
 * Default runners call real ports on ctx. LIVE against remote is NOT run unless
 * HEADLESS_R2_QA=1 with configured Neon+R2 (authorized operator action).
 */

import { randomUUID } from "node:crypto";

import {
  HEADLESS_VERIFICATION_TARGET_ASSET_BUNDLE_RECORD,
  HEADLESS_VERIFICATION_TARGET_MANIFEST,
  isProvisionalStoredJobRecord,
  toHeadlessPublicOwnedObjectView,
  verifyAndFinalizeR2OwnedObject,
} from "@/features/headless-renderer/control-plane";
import { R2DownloadCapabilityAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-download-capability.adapter";
import { reconcileFinalizedOwnedObjectCoverage } from "@/features/headless-renderer/control-plane/services/reconcile-finalized-owned-object-coverage";
import type { HeadlessJobStorePort } from "@/features/headless-renderer/control-plane/ports/job-store.port";
import { cpFail, cpOk } from "@/features/headless-renderer/control-plane";

import type { R2LiveCaseEvidence } from "./evidence";
import { assertR2EvidencePrivacyStructure } from "./evidence-privacy-authority";
import {
  createMinimalProvisionalJob,
  createStagingObject,
  digestOf,
  issueCode,
  makeSyntheticJsonBytes,
  putObjectBytes,
  trackObjectId,
  trackProjectId,
  trackR2Locator,
} from "./live-fixtures";
import {
  REQUIRED_R2_LIVE_CASE_IDS,
  type R2LiveFailureCategory,
} from "./required-cases";
import type { R2LiveMatrixContext } from "./types";

function pass(caseId: string): R2LiveCaseEvidence {
  return { caseId, status: "PASS" };
}

function fail(
  caseId: string,
  category: R2LiveFailureCategory,
): R2LiveCaseEvidence {
  return { caseId, status: "FAIL", failureCategory: category };
}

export type R2LiveCaseRunner = (
  ctx: R2LiveMatrixContext,
) => Promise<R2LiveCaseEvidence>;

function requireSessionHappyPath(
  ctx: R2LiveMatrixContext,
):
  | {
      ok: true;
      objectId: string;
      objectKey: string;
      storeId: "assets" | "artifacts";
      bytes: Uint8Array;
      digest: string;
      mime: string;
      jobId: string;
      operationId: string;
    }
  | { ok: false } {
  const s = ctx.session;
  if (
    s.objectId == null ||
    s.objectKey == null ||
    s.storeId == null ||
    s.bytes == null ||
    s.digest == null ||
    s.jobId == null ||
    s.operationId == null
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    objectId: s.objectId,
    objectKey: s.objectKey,
    storeId: s.storeId,
    bytes: s.bytes,
    digest: s.digest,
    mime: s.mime,
    jobId: s.jobId,
    operationId: s.operationId,
  };
}

/**
 * Default runners for gate-on live path — real port calls against injected ctx.
 * Injected `caseRunners` in harness deps replace these for unit authority tests.
 */
export const DEFAULT_R2_LIVE_CASE_RUNNERS: Readonly<
  Record<(typeof REQUIRED_R2_LIVE_CASE_IDS)[number], R2LiveCaseRunner>
> = Object.freeze({
  "env.config": async (ctx) => {
    try {
      const cfg = ctx.r2Config;
      if (
        typeof cfg.endpoint !== "string" ||
        !cfg.endpoint.startsWith("https://")
      ) {
        return fail("env.config", "ENV_CONFIG_FAILED");
      }
      if (
        typeof cfg.bucketAssets !== "string" ||
        typeof cfg.bucketArtifacts !== "string" ||
        cfg.bucketAssets.length === 0 ||
        cfg.bucketArtifacts.length === 0 ||
        cfg.bucketAssets === cfg.bucketArtifacts
      ) {
        return fail("env.config", "ENV_CONFIG_FAILED");
      }
      if (
        !Array.isArray(cfg.allowedOrigins) ||
        cfg.allowedOrigins.length === 0
      ) {
        return fail("env.config", "ENV_CONFIG_FAILED");
      }
      if (ctx.sql == null || ctx.ownedObjectStore == null || ctx.io == null) {
        return fail("env.config", "ENV_CONFIG_FAILED");
      }
      return pass("env.config");
    } catch {
      return fail("env.config", "ENV_CONFIG_FAILED");
    }
  },

  "staging.create": async (ctx) => {
    try {
      trackProjectId(ctx, ctx.projectId);
      const principal = { ownerId: ctx.ownerId, sessionId: "r2qa" };
      const claimed = await ctx.projectAuthorization.claimUnownedProject(
        principal,
        ctx.projectId,
      );
      if (!claimed.ok) {
        return fail("staging.create", "STAGING_CREATE_FAILED");
      }

      const otherProjectId = randomUUID();
      trackProjectId(ctx, otherProjectId);
      const otherClaimed = await ctx.projectAuthorization.claimUnownedProject(
        { ownerId: ctx.otherOwnerId, sessionId: "r2qa" },
        otherProjectId,
      );
      if (!otherClaimed.ok) {
        return fail("staging.create", "STAGING_CREATE_FAILED");
      }

      const jobId = randomUUID();
      const operationId = randomUUID();

      // Same-snapshot authority (2C.1B):
      // generate bytes → digest once → provisional claim → staging claim.
      const bytes = makeSyntheticJsonBytes(ctx.runId);
      const digest = digestOf(bytes);
      const mime = "application/json";

      const provisional = await createMinimalProvisionalJob(ctx, {
        jobId,
        operationId,
        creatorKey: `r2qa-idem-${ctx.runId}`,
        manifestPayloadDigestClaim: digest,
      });
      if (!provisional.ok) {
        return fail("staging.create", "STAGING_CREATE_FAILED");
      }

      const staging = await createStagingObject(ctx, {
        jobId,
        operationId,
        purpose: "manifest",
        bytes,
        digest,
        mime,
        expectedByteLength: bytes.byteLength,
      });
      if (!staging.ok) {
        return fail("staging.create", "STAGING_CREATE_FAILED");
      }
      if (
        staging.digest !== digest ||
        staging.expectedByteLength !== bytes.byteLength
      ) {
        return fail("staging.create", "STAGING_CREATE_FAILED");
      }

      ctx.session.jobId = jobId;
      ctx.session.operationId = operationId;
      ctx.session.objectId = staging.objectId;
      ctx.session.objectKey = staging.objectKey;
      ctx.session.storeId = staging.storeId;
      ctx.session.bytes = bytes;
      ctx.session.digest = digest;
      ctx.session.mime = mime;
      ctx.session.expectedByteLength = bytes.byteLength;
      return pass("staging.create");
    } catch {
      return fail("staging.create", "STAGING_CREATE_FAILED");
    }
  },

  "upload.capability_issue": async (ctx) => {
    try {
      const s = requireSessionHappyPath(ctx);
      if (!s.ok) return fail("upload.capability_issue", "UPLOAD_CAPABILITY_FAILED");
      const origin = ctx.r2Config.allowedOrigins[0];
      if (origin == null) {
        return fail("upload.capability_issue", "UPLOAD_CAPABILITY_FAILED");
      }
      const issued = await ctx.uploadCapability.issueDirectPutCapability({
        ownerId: ctx.ownerId,
        projectId: ctx.projectId,
        jobId: s.jobId,
        operationId: s.operationId,
        objectId: s.objectId,
        expectedByteLength: s.bytes.byteLength,
        expectedMimeType: s.mime,
        allowedOrigin: origin,
        nowMs: ctx.nowMs,
      });
      if (!issued.ok) {
        return fail("upload.capability_issue", "UPLOAD_CAPABILITY_FAILED");
      }
      if (
        typeof issued.value.putUrl !== "string" ||
        issued.value.putUrl.length === 0
      ) {
        return fail("upload.capability_issue", "UPLOAD_CAPABILITY_FAILED");
      }
      // Never persist the URL on session — only the issuance flag.
      ctx.session.uploadCapabilityIssued = true;
      return pass("upload.capability_issue");
    } catch {
      return fail("upload.capability_issue", "UPLOAD_CAPABILITY_FAILED");
    }
  },

  "upload.put_bytes": async (ctx) => {
    try {
      const s = requireSessionHappyPath(ctx);
      if (!s.ok) return fail("upload.put_bytes", "UPLOAD_PUT_FAILED");
      const written = await putObjectBytes(ctx, {
        storeId: s.storeId,
        objectKey: s.objectKey,
        bytes: s.bytes,
        mime: s.mime,
      });
      if (!written.ok) {
        return fail("upload.put_bytes", "UPLOAD_PUT_FAILED");
      }
      const loaded = await ctx.ownedObjectStore.getByObjectIdAndOwner({
        objectId: s.objectId,
        ownerId: ctx.ownerId,
      });
      if (
        loaded.ok &&
        loaded.value != null &&
        typeof ctx.ownedObjectStore.markUploadedObserved === "function"
      ) {
        await ctx.ownedObjectStore.markUploadedObserved({
          objectId: s.objectId,
          ownerId: ctx.ownerId,
          expectedStoreVersion: loaded.value.storeVersion,
          uploadedObservedAtMs: ctx.nowMs,
          nowMs: ctx.nowMs,
        });
      }
      return pass("upload.put_bytes");
    } catch {
      return fail("upload.put_bytes", "UPLOAD_PUT_FAILED");
    }
  },

  "metadata.head": async (ctx) => {
    try {
      const s = requireSessionHappyPath(ctx);
      if (!s.ok) return fail("metadata.head", "METADATA_HEAD_FAILED");
      const meta = await ctx.io.readObjectMetadata(
        { storeId: s.storeId, objectKey: s.objectKey },
        ctx.ownerId,
      );
      if (!meta.ok) {
        return fail("metadata.head", "METADATA_HEAD_FAILED");
      }
      if (
        meta.value.revisionAuthority === "unavailable" ||
        typeof meta.value.providerRevisionId !== "string" ||
        meta.value.providerRevisionId.length === 0
      ) {
        return fail("metadata.head", "METADATA_HEAD_FAILED");
      }
      return pass("metadata.head");
    } catch {
      return fail("metadata.head", "METADATA_HEAD_FAILED");
    }
  },

  "verify.conditional_stream": async (ctx) => {
    try {
      const s = requireSessionHappyPath(ctx);
      if (!s.ok) {
        return fail("verify.conditional_stream", "CONDITIONAL_STREAM_FAILED");
      }
      const result = await verifyAndFinalizeR2OwnedObject({
        objectId: s.objectId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs,
        store: ctx.ownedObjectStore,
        io: ctx.io,
      });
      if (!result.ok) {
        return fail("verify.conditional_stream", "CONDITIONAL_STREAM_FAILED");
      }
      if (result.value.record.stage !== "finalized") {
        return fail("verify.conditional_stream", "CONDITIONAL_STREAM_FAILED");
      }
      return pass("verify.conditional_stream");
    } catch {
      return fail("verify.conditional_stream", "CONDITIONAL_STREAM_FAILED");
    }
  },

  "verify.sha256_length_mime": async (ctx) => {
    try {
      const s = requireSessionHappyPath(ctx);
      if (!s.ok) return fail("verify.sha256_length_mime", "VERIFY_FACTS_FAILED");
      const loaded = await ctx.ownedObjectStore.getByObjectIdAndOwner({
        objectId: s.objectId,
        ownerId: ctx.ownerId,
      });
      if (!loaded.ok || loaded.value == null) {
        return fail("verify.sha256_length_mime", "VERIFY_FACTS_FAILED");
      }
      const rec = loaded.value.record;
      if (
        rec.stage !== "finalized" ||
        rec.contentDigest !== s.digest ||
        rec.byteLength !== s.bytes.byteLength ||
        rec.mimeType !== s.mime
      ) {
        return fail("verify.sha256_length_mime", "VERIFY_FACTS_FAILED");
      }
      return pass("verify.sha256_length_mime");
    } catch {
      return fail("verify.sha256_length_mime", "VERIFY_FACTS_FAILED");
    }
  },

  "finalize.neon_atomic": async (ctx) => {
    try {
      const s = requireSessionHappyPath(ctx);
      if (!s.ok) return fail("finalize.neon_atomic", "FINALIZE_FAILED");
      const loaded = await ctx.ownedObjectStore.getByObjectIdAndOwner({
        objectId: s.objectId,
        ownerId: ctx.ownerId,
      });
      if (!loaded.ok || loaded.value == null) {
        return fail("finalize.neon_atomic", "FINALIZE_FAILED");
      }
      if (
        loaded.value.record.stage !== "finalized" ||
        loaded.value.storeVersion < 2
      ) {
        return fail("finalize.neon_atomic", "FINALIZE_FAILED");
      }
      return pass("finalize.neon_atomic");
    } catch {
      return fail("finalize.neon_atomic", "FINALIZE_FAILED");
    }
  },

  "coverage.reconcile": async (ctx) => {
    try {
      const s = requireSessionHappyPath(ctx);
      if (!s.ok) return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");

      const owned = await ctx.ownedObjectStore.getByObjectIdAndOwner({
        objectId: s.objectId,
        ownerId: ctx.ownerId,
      });
      if (!owned.ok || owned.value == null || owned.value.record.stage !== "finalized") {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }
      const finalized = owned.value.record;

      const before = await ctx.jobStore.getByJobIdAndOwner(s.jobId, ctx.ownerId);
      if (!before.ok || !isProvisionalStoredJobRecord(before.value)) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }
      const beforeVersion = before.value.storeVersion;
      const requiredBefore = before.value.verificationCoverage.requiredTargets.slice();

      const result = await reconcileFinalizedOwnedObjectCoverage({
        jobStore: ctx.jobStore,
        ownedObjectStore: ctx.ownedObjectStore,
        objectId: s.objectId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs,
      });
      if (!result.ok) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }
      // Single-object fixture: manifest reconciled; bundle still required → incomplete.
      if (
        result.value.status !== "applied" &&
        result.value.status !== "already_complete" &&
        result.value.status !== "blocked_incomplete"
      ) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }
      if (result.value.coverageComplete === true) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }

      const after = await ctx.jobStore.getByJobIdAndOwner(s.jobId, ctx.ownerId);
      if (!after.ok || !isProvisionalStoredJobRecord(after.value)) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }
      const job = after.value;
      const manifestRefs = job.stagingObjectRefs.filter(
        (r) => r.purpose === "manifest",
      );
      if (manifestRefs.length !== 1) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }
      const ref = manifestRefs[0]!;
      if (
        ref.locator.kind !== "object_storage" ||
        ref.locator.storeId !== finalized.storeId ||
        ref.locator.objectKey !== finalized.objectKey ||
        ref.contentDigestClaim !== finalized.contentDigest ||
        ref.byteLengthClaim !== finalized.byteLength ||
        ref.mimeTypeClaim !== finalized.mimeType
      ) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }
      if (
        job.snapshotClaim.manifestPayloadDigestClaim !== finalized.contentDigest
      ) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }
      if (
        !job.verificationCoverage.verifiedTargets.includes(
          HEADLESS_VERIFICATION_TARGET_MANIFEST,
        )
      ) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }
      if (
        !job.verificationCoverage.requiredTargets.includes(
          HEADLESS_VERIFICATION_TARGET_MANIFEST,
        ) ||
        !job.verificationCoverage.requiredTargets.includes(
          HEADLESS_VERIFICATION_TARGET_ASSET_BUNDLE_RECORD,
        )
      ) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }
      if (
        job.verificationCoverage.requiredTargets.length !== requiredBefore.length ||
        !requiredBefore.every((t, i) => t === job.verificationCoverage.requiredTargets[i])
      ) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }
      if (job.verificationCoverage.complete !== false) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }
      if (result.value.status === "applied" && job.storeVersion <= beforeVersion) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }

      // Idempotent replay
      const replay = await reconcileFinalizedOwnedObjectCoverage({
        jobStore: ctx.jobStore,
        ownedObjectStore: ctx.ownedObjectStore,
        objectId: s.objectId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs + 1,
      });
      if (!replay.ok) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }
      const afterReplay = await ctx.jobStore.getByJobIdAndOwner(
        s.jobId,
        ctx.ownerId,
      );
      if (!afterReplay.ok || !isProvisionalStoredJobRecord(afterReplay.value)) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }
      const manifestAfterReplay = afterReplay.value.stagingObjectRefs.filter(
        (r) => r.purpose === "manifest",
      );
      if (manifestAfterReplay.length !== 1) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }

      return pass("coverage.reconcile");
    } catch {
      return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
    }
  },

  "replay.idempotent": async (ctx) => {
    try {
      const s = requireSessionHappyPath(ctx);
      if (!s.ok) return fail("replay.idempotent", "REPLAY_FAILED");

      const replayStaging = await ctx.ownedObjectStore.createStagingRecord({
        objectId: s.objectId,
        ownerId: ctx.ownerId,
        projectId: ctx.projectId,
        jobId: s.jobId,
        operationId: s.operationId,
        purpose: "manifest",
        slotKey: null,
        storeId: s.storeId,
        objectKey: s.objectKey,
        expectedContentDigestClaim: s.digest,
        expectedByteLength: s.bytes.byteLength,
        expectedMimeType: s.mime,
        uploadCapabilityIssuedAtMs: ctx.nowMs,
        uploadCapabilityExpiresAtMs: ctx.nowMs + 600_000,
        expiresAtMs: ctx.nowMs + 3_600_000,
        createdAtMs: ctx.nowMs,
      });
      const stagingIdempotent =
        !replayStaging.ok &&
        (issueCode(replayStaging) === "IDEMPOTENCY_CONFLICT" ||
          issueCode(replayStaging) === "TERMINAL_IMMUTABLE");

      const replayVerify = await verifyAndFinalizeR2OwnedObject({
        objectId: s.objectId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs + 1,
        store: ctx.ownedObjectStore,
        io: ctx.io,
      });
      const verifyIdempotent =
        !replayVerify.ok && issueCode(replayVerify) === "TERMINAL_IMMUTABLE";

      if (!stagingIdempotent && !verifyIdempotent) {
        return fail("replay.idempotent", "REPLAY_FAILED");
      }

      // Ensure finalized object was not corrupted.
      const loaded = await ctx.ownedObjectStore.getByObjectIdAndOwner({
        objectId: s.objectId,
        ownerId: ctx.ownerId,
      });
      if (
        !loaded.ok ||
        loaded.value == null ||
        loaded.value.record.stage !== "finalized" ||
        loaded.value.record.contentDigest !== s.digest
      ) {
        return fail("replay.idempotent", "REPLAY_FAILED");
      }
      return pass("replay.idempotent");
    } catch {
      return fail("replay.idempotent", "REPLAY_FAILED");
    }
  },

  "mutate.precondition_reject": async (ctx) => {
    try {
      const jobId = ctx.session.jobId ?? randomUUID();
      const operationId = randomUUID();
      const bytes = makeSyntheticJsonBytes(`${ctx.runId}-mutate`);
      const staging = await createStagingObject(ctx, {
        jobId,
        operationId,
        bytes,
      });
      if (!staging.ok) {
        return fail("mutate.precondition_reject", "PRECONDITION_NOT_REJECTED");
      }
      const put = await putObjectBytes(ctx, {
        storeId: staging.storeId,
        objectKey: staging.objectKey,
        bytes,
        mime: staging.mime,
      });
      if (!put.ok) {
        return fail("mutate.precondition_reject", "PRECONDITION_NOT_REJECTED");
      }
      const head = await ctx.io.readObjectMetadata(
        { storeId: staging.storeId, objectKey: staging.objectKey },
        ctx.ownerId,
      );
      if (!head.ok) {
        return fail("mutate.precondition_reject", "PRECONDITION_NOT_REJECTED");
      }
      const mutated = new TextEncoder().encode(
        JSON.stringify({ mutated: true, runId: ctx.runId }),
      );
      // Keep length match so digest/revision path is exercised after overwrite.
      const padded =
        mutated.byteLength === bytes.byteLength
          ? mutated
          : (() => {
              const out = new Uint8Array(bytes.byteLength);
              out.set(mutated.subarray(0, Math.min(mutated.byteLength, out.byteLength)));
              return out;
            })();
      const overwrite = await putObjectBytes(ctx, {
        storeId: staging.storeId,
        objectKey: staging.objectKey,
        bytes: padded,
        mime: staging.mime,
      });
      if (!overwrite.ok) {
        return fail("mutate.precondition_reject", "PRECONDITION_NOT_REJECTED");
      }
      const verified = await verifyAndFinalizeR2OwnedObject({
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs,
        store: ctx.ownedObjectStore,
        io: ctx.io,
        deleteOnReject: false,
      });
      if (verified.ok) {
        return fail("mutate.precondition_reject", "PRECONDITION_NOT_REJECTED");
      }
      const code = issueCode(verified);
      if (
        code !== "OBJECT_REVISION_MISMATCH" &&
        code !== "OBJECT_INTEGRITY_FAILED" &&
        code !== "ASSET_DIGEST_MISMATCH"
      ) {
        return fail("mutate.precondition_reject", "PRECONDITION_NOT_REJECTED");
      }
      return pass("mutate.precondition_reject");
    } catch {
      return fail("mutate.precondition_reject", "PRECONDITION_NOT_REJECTED");
    }
  },

  "digest.mismatch": async (ctx) => {
    try {
      const jobId = ctx.session.jobId ?? randomUUID();
      const operationId = randomUUID();
      const bytes = makeSyntheticJsonBytes(`${ctx.runId}-digest`);
      const staging = await createStagingObject(ctx, {
        jobId,
        operationId,
        bytes,
        digest: `sha256:${"00".repeat(32)}`,
      });
      if (!staging.ok) {
        return fail("digest.mismatch", "DIGEST_MISMATCH_FAILED");
      }
      const put = await putObjectBytes(ctx, {
        storeId: staging.storeId,
        objectKey: staging.objectKey,
        bytes,
        mime: staging.mime,
      });
      if (!put.ok) {
        return fail("digest.mismatch", "DIGEST_MISMATCH_FAILED");
      }
      const verified = await verifyAndFinalizeR2OwnedObject({
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs,
        store: ctx.ownedObjectStore,
        io: ctx.io,
        deleteOnReject: false,
      });
      if (verified.ok || issueCode(verified) !== "ASSET_DIGEST_MISMATCH") {
        return fail("digest.mismatch", "DIGEST_MISMATCH_FAILED");
      }
      return pass("digest.mismatch");
    } catch {
      return fail("digest.mismatch", "DIGEST_MISMATCH_FAILED");
    }
  },

  "length.mismatch": async (ctx) => {
    try {
      const jobId = ctx.session.jobId ?? randomUUID();
      const operationId = randomUUID();
      const bytes = makeSyntheticJsonBytes(`${ctx.runId}-length`);
      const staging = await createStagingObject(ctx, {
        jobId,
        operationId,
        bytes,
        expectedByteLength: bytes.byteLength + 17,
      });
      if (!staging.ok) {
        return fail("length.mismatch", "LENGTH_MISMATCH_FAILED");
      }
      const put = await putObjectBytes(ctx, {
        storeId: staging.storeId,
        objectKey: staging.objectKey,
        bytes,
        mime: staging.mime,
      });
      if (!put.ok) {
        return fail("length.mismatch", "LENGTH_MISMATCH_FAILED");
      }
      const verified = await verifyAndFinalizeR2OwnedObject({
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs,
        store: ctx.ownedObjectStore,
        io: ctx.io,
        deleteOnReject: false,
      });
      if (verified.ok) {
        return fail("length.mismatch", "LENGTH_MISMATCH_FAILED");
      }
      const code = issueCode(verified);
      if (
        code !== "ASSET_LENGTH_MISMATCH" &&
        code !== "OBJECT_INTEGRITY_FAILED"
      ) {
        return fail("length.mismatch", "LENGTH_MISMATCH_FAILED");
      }
      return pass("length.mismatch");
    } catch {
      return fail("length.mismatch", "LENGTH_MISMATCH_FAILED");
    }
  },

  "mime.mismatch": async (ctx) => {
    try {
      const jobId = ctx.session.jobId ?? randomUUID();
      const operationId = randomUUID();
      const bytes = makeSyntheticJsonBytes(`${ctx.runId}-mime`);
      const staging = await createStagingObject(ctx, {
        jobId,
        operationId,
        bytes,
        mime: "application/json",
      });
      if (!staging.ok) {
        return fail("mime.mismatch", "MIME_MISMATCH_FAILED");
      }
      const put = await putObjectBytes(ctx, {
        storeId: staging.storeId,
        objectKey: staging.objectKey,
        bytes,
        mime: "text/html",
      });
      if (!put.ok) {
        return fail("mime.mismatch", "MIME_MISMATCH_FAILED");
      }
      const verified = await verifyAndFinalizeR2OwnedObject({
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs,
        store: ctx.ownedObjectStore,
        io: ctx.io,
        deleteOnReject: false,
      });
      if (verified.ok || issueCode(verified) !== "ASSET_MIME_MISMATCH") {
        return fail("mime.mismatch", "MIME_MISMATCH_FAILED");
      }
      return pass("mime.mismatch");
    } catch {
      return fail("mime.mismatch", "MIME_MISMATCH_FAILED");
    }
  },

  "expiry.reject": async (ctx) => {
    try {
      const jobId = ctx.session.jobId ?? randomUUID();
      const operationId = randomUUID();
      const bytes = makeSyntheticJsonBytes(`${ctx.runId}-expiry`);
      const staging = await createStagingObject(ctx, {
        jobId,
        operationId,
        bytes,
        expiresAtMs: ctx.nowMs - 1,
      });
      if (!staging.ok) {
        return fail("expiry.reject", "EXPIRY_REJECT_FAILED");
      }
      const put = await putObjectBytes(ctx, {
        storeId: staging.storeId,
        objectKey: staging.objectKey,
        bytes,
        mime: staging.mime,
      });
      if (!put.ok) {
        return fail("expiry.reject", "EXPIRY_REJECT_FAILED");
      }
      const verified = await verifyAndFinalizeR2OwnedObject({
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs,
        store: ctx.ownedObjectStore,
        io: ctx.io,
        deleteOnReject: false,
      });
      if (verified.ok || issueCode(verified) !== "ASSET_EXPIRED") {
        return fail("expiry.reject", "EXPIRY_REJECT_FAILED");
      }
      return pass("expiry.reject");
    } catch {
      return fail("expiry.reject", "EXPIRY_REJECT_FAILED");
    }
  },

  "claim.race": async (ctx) => {
    try {
      const jobId = ctx.session.jobId ?? randomUUID();
      const operationId = randomUUID();
      const bytes = makeSyntheticJsonBytes(`${ctx.runId}-claim-race`);
      const staging = await createStagingObject(ctx, {
        jobId,
        operationId,
        bytes,
      });
      if (!staging.ok) {
        return fail("claim.race", "CLAIM_RACE_FAILED");
      }
      const put = await putObjectBytes(ctx, {
        storeId: staging.storeId,
        objectKey: staging.objectKey,
        bytes,
        mime: staging.mime,
      });
      if (!put.ok) {
        return fail("claim.race", "CLAIM_RACE_FAILED");
      }
      const loaded = await ctx.ownedObjectStore.getByObjectIdAndOwner({
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
      });
      if (!loaded.ok || loaded.value == null) {
        return fail("claim.race", "CLAIM_RACE_FAILED");
      }
      const claimed = await ctx.ownedObjectStore.acquireVerificationClaim({
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
        claimToken: `race-${ctx.runId.slice(0, 8)}`,
        nowMs: ctx.nowMs,
        expectedStoreVersion: loaded.value.storeVersion,
        claimLeaseMs: 120_000,
      });
      if (!claimed.ok) {
        return fail("claim.race", "CLAIM_RACE_FAILED");
      }
      const verified = await verifyAndFinalizeR2OwnedObject({
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs + 1,
        store: ctx.ownedObjectStore,
        io: ctx.io,
        deleteOnReject: false,
        claimLeaseMs: 120_000,
      });
      if (verified.ok || issueCode(verified) !== "CLAIM_REJECTED") {
        return fail("claim.race", "CLAIM_RACE_FAILED");
      }
      return pass("claim.race");
    } catch {
      return fail("claim.race", "CLAIM_RACE_FAILED");
    }
  },

  "claim.stale_reclaim": async (ctx) => {
    try {
      const jobId = ctx.session.jobId ?? randomUUID();
      const operationId = randomUUID();
      const bytes = makeSyntheticJsonBytes(`${ctx.runId}-stale`);
      const staging = await createStagingObject(ctx, {
        jobId,
        operationId,
        bytes,
      });
      if (!staging.ok) {
        return fail("claim.stale_reclaim", "STALE_RECLAIM_FAILED");
      }
      const put = await putObjectBytes(ctx, {
        storeId: staging.storeId,
        objectKey: staging.objectKey,
        bytes,
        mime: staging.mime,
      });
      if (!put.ok) {
        return fail("claim.stale_reclaim", "STALE_RECLAIM_FAILED");
      }
      const loaded = await ctx.ownedObjectStore.getByObjectIdAndOwner({
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
      });
      if (!loaded.ok || loaded.value == null) {
        return fail("claim.stale_reclaim", "STALE_RECLAIM_FAILED");
      }
      const claimedAt = ctx.nowMs;
      const claimed = await ctx.ownedObjectStore.acquireVerificationClaim({
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
        claimToken: `stale-${ctx.runId.slice(0, 8)}`,
        nowMs: claimedAt,
        expectedStoreVersion: loaded.value.storeVersion,
        claimLeaseMs: 1,
      });
      if (!claimed.ok) {
        return fail("claim.stale_reclaim", "STALE_RECLAIM_FAILED");
      }
      const verified = await verifyAndFinalizeR2OwnedObject({
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
        nowMs: claimedAt + 60_000,
        store: ctx.ownedObjectStore,
        io: ctx.io,
        claimLeaseMs: 1,
      });
      if (!verified.ok || verified.value.record.stage !== "finalized") {
        return fail("claim.stale_reclaim", "STALE_RECLAIM_FAILED");
      }
      return pass("claim.stale_reclaim");
    } catch {
      return fail("claim.stale_reclaim", "STALE_RECLAIM_FAILED");
    }
  },

  "cross_owner.denied": async (ctx) => {
    try {
      const s = requireSessionHappyPath(ctx);
      if (!s.ok) return fail("cross_owner.denied", "CROSS_OWNER_NOT_FORBIDDEN");
      const denied = await ctx.ownedObjectStore.getByObjectIdAndOwner({
        objectId: s.objectId,
        ownerId: ctx.otherOwnerId,
      });
      if (!denied.ok) {
        if (issueCode(denied) === "FORBIDDEN") {
          return pass("cross_owner.denied");
        }
        return fail("cross_owner.denied", "CROSS_OWNER_NOT_FORBIDDEN");
      }
      if (denied.value === null) {
        return pass("cross_owner.denied");
      }
      return fail("cross_owner.denied", "CROSS_OWNER_NOT_FORBIDDEN");
    } catch {
      return fail("cross_owner.denied", "CROSS_OWNER_NOT_FORBIDDEN");
    }
  },

  "cleanup.delete": async (ctx) => {
    try {
      const jobId = ctx.session.jobId ?? randomUUID();
      const operationId = randomUUID();
      const bytes = makeSyntheticJsonBytes(`${ctx.runId}-cleanup`);
      const staging = await createStagingObject(ctx, {
        jobId,
        operationId,
        bytes,
      });
      if (!staging.ok) {
        return fail("cleanup.delete", "CLEANUP_FAILED");
      }
      const put = await putObjectBytes(ctx, {
        storeId: staging.storeId,
        objectKey: staging.objectKey,
        bytes,
        mime: staging.mime,
      });
      if (!put.ok) {
        return fail("cleanup.delete", "CLEANUP_FAILED");
      }
      const loaded = await ctx.ownedObjectStore.getByObjectIdAndOwner({
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
      });
      if (!loaded.ok || loaded.value == null) {
        return fail("cleanup.delete", "CLEANUP_FAILED");
      }
      const pending = await ctx.ownedObjectStore.markCleanupPending({
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
        expectedStoreVersion: loaded.value.storeVersion,
        terminalReason: "r2_live_cleanup_case",
        cleanupScheduledAtMs: ctx.nowMs,
        nowMs: ctx.nowMs,
      });
      if (!pending.ok) {
        return fail("cleanup.delete", "CLEANUP_FAILED");
      }
      const deleted = await ctx.io.deleteObject(
        { storeId: staging.storeId, objectKey: staging.objectKey },
        ctx.ownerId,
      );
      if (!deleted.ok) {
        return fail("cleanup.delete", "CLEANUP_FAILED");
      }
      const completed = await ctx.ownedObjectStore.completeCleanup({
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
        expectedStoreVersion: pending.value.storeVersion,
        nowMs: ctx.nowMs,
      });
      if (!completed.ok) {
        return fail("cleanup.delete", "CLEANUP_FAILED");
      }
      return pass("cleanup.delete");
    } catch {
      return fail("cleanup.delete", "CLEANUP_FAILED");
    }
  },

  "download.artifact_only": async (ctx) => {
    try {
      // Source / provisional job must not issue artifact download.
      if (ctx.downloadCapability != null && ctx.session.jobId != null) {
        const sourceDenied = await ctx.downloadCapability.issueArtifactGetCapability({
          ownerId: ctx.ownerId,
          jobId: ctx.session.jobId,
          nowMs: ctx.nowMs,
        });
        if (sourceDenied.ok) {
          return fail("download.artifact_only", "DOWNLOAD_ARTIFACT_FAILED");
        }
      }

      const artifactJobId = randomUUID();
      const artifactOpId = randomUUID();
      const artifactObjectId = randomUUID();
      const bytes = new TextEncoder().encode("r2-live-artifact");
      const digest = digestOf(bytes);
      const staging = await createStagingObject(ctx, {
        objectId: artifactObjectId,
        jobId: artifactJobId,
        operationId: artifactOpId,
        purpose: "artifact",
        bytes,
        mime: "video/webm",
      });
      if (!staging.ok) {
        return fail("download.artifact_only", "DOWNLOAD_ARTIFACT_FAILED");
      }
      trackObjectId(ctx, artifactObjectId);
      trackR2Locator(ctx, {
        storeId: staging.storeId,
        objectKey: staging.objectKey,
      });

      const claimed = await ctx.ownedObjectStore.acquireVerificationClaim({
        objectId: artifactObjectId,
        ownerId: ctx.ownerId,
        claimToken: `dl-${ctx.runId.slice(0, 8)}`,
        nowMs: ctx.nowMs,
        expectedStoreVersion: 1,
      });
      if (!claimed.ok) {
        return fail("download.artifact_only", "DOWNLOAD_ARTIFACT_FAILED");
      }
      const finalized = await ctx.ownedObjectStore.finalizeStagingRecord({
        objectId: artifactObjectId,
        ownerId: ctx.ownerId,
        expectedStoreVersion: claimed.value.storeVersion,
        verificationClaimToken: `dl-${ctx.runId.slice(0, 8)}`,
        contentDigest: digest,
        byteLength: bytes.byteLength,
        mimeType: "video/webm",
        verifiedAtMs: ctx.nowMs,
        expiresAtMs: ctx.nowMs + 3_600_000,
        nowMs: ctx.nowMs,
      });
      if (!finalized.ok) {
        return fail("download.artifact_only", "DOWNLOAD_ARTIFACT_FAILED");
      }

      ctx.session.artifactObjectId = artifactObjectId;
      ctx.session.artifactObjectKey = staging.objectKey;

      const stubJobStore = {
        async getByJobIdAndOwner(jobId: string, ownerId: string) {
          if (jobId !== artifactJobId || ownerId !== ctx.ownerId) {
            return cpFail("JOB_NOT_FOUND", "Job not found for owner.");
          }
          return cpOk({
            version: 1,
            stage: "canonical" as const,
            storeVersion: 1,
            jobId,
            ownerId,
            projectId: ctx.projectId,
            createdAtMs: ctx.nowMs,
            updatedAtMs: ctx.nowMs,
            idempotencyAuthorityKey: `hid:sha256:${"ab".repeat(32)}`,
            operationId: artifactOpId,
            canonicalJob: { state: "succeeded" } as never,
            canonicalRequest: {} as never,
            claimToken: null,
            claimedAtMs: null,
            artifactObjectBinding: {
              version: 1 as const,
              jobId,
              attempt: 1,
              ownerId,
              projectId: ctx.projectId,
              storageLocator: {
                kind: "object_storage" as const,
                storeId: staging.storeId,
                objectKey: staging.objectKey,
              },
              contentDigest: digest,
              byteLength: bytes.byteLength,
              mimeType: "video/webm",
              artifactFingerprint: `hra:sha256:${"cd".repeat(32)}`,
              requestFingerprint: `hrr:sha256:${"ef".repeat(32)}`,
              expiresAtMs: ctx.nowMs + 3_600_000,
            },
          });
        },
      } as unknown as HeadlessJobStorePort;

      const adapter = new R2DownloadCapabilityAdapter({
        ownedObjectStore: ctx.ownedObjectStore,
        jobStore: stubJobStore,
        configOverride: ctx.r2Config,
        createPresignedGetUrl: async () =>
          "https://example.invalid/r2-live-injected-get",
      });
      const issued = await adapter.issueArtifactGetCapability({
        ownerId: ctx.ownerId,
        jobId: artifactJobId,
        nowMs: ctx.nowMs,
        ttlMs: 60_000,
      });
      if (!issued.ok || typeof issued.value.getUrl !== "string") {
        return fail("download.artifact_only", "DOWNLOAD_ARTIFACT_FAILED");
      }
      return pass("download.artifact_only");
    } catch {
      return fail("download.artifact_only", "DOWNLOAD_ARTIFACT_FAILED");
    }
  },

  "evidence.privacy": async (ctx) => {
    try {
      const s = requireSessionHappyPath(ctx);
      if (!s.ok) return fail("evidence.privacy", "EVIDENCE_PRIVACY_FAILED");
      const loaded = await ctx.ownedObjectStore.getByObjectIdAndOwner({
        objectId: s.objectId,
        ownerId: ctx.ownerId,
      });
      if (!loaded.ok || loaded.value == null) {
        return fail("evidence.privacy", "EVIDENCE_PRIVACY_FAILED");
      }
      const publicView = toHeadlessPublicOwnedObjectView(loaded.value.record);
      const safeEvidence = {
        caseId: "evidence.privacy",
        status: "PASS" as const,
        uploadCapabilityIssued: ctx.session.uploadCapabilityIssued,
        publicObject: publicView,
      };
      const privacy = assertR2EvidencePrivacyStructure(safeEvidence);
      if (!privacy.ok) {
        return fail("evidence.privacy", "EVIDENCE_PRIVACY_FAILED");
      }
      // Negative: actual putUrl field must fail structural privacy.
      const leak = assertR2EvidencePrivacyStructure({
        caseId: "evidence.privacy",
        status: "PASS",
        putUrl: "https://example.invalid/presigned",
        publicObject: publicView,
      });
      if (leak.ok) {
        return fail("evidence.privacy", "EVIDENCE_PRIVACY_FAILED");
      }
      return pass("evidence.privacy");
    } catch {
      return fail("evidence.privacy", "EVIDENCE_PRIVACY_FAILED");
    }
  },
});

export async function runR2LiveMatrix(
  ctx: R2LiveMatrixContext,
  runners: Readonly<
    Partial<Record<(typeof REQUIRED_R2_LIVE_CASE_IDS)[number], R2LiveCaseRunner>>
  > = DEFAULT_R2_LIVE_CASE_RUNNERS,
): Promise<readonly R2LiveCaseEvidence[]> {
  const out: R2LiveCaseEvidence[] = [];
  for (const caseId of REQUIRED_R2_LIVE_CASE_IDS) {
    const runner = runners[caseId] ?? DEFAULT_R2_LIVE_CASE_RUNNERS[caseId];
    try {
      const result = await runner(ctx);
      out.push(result.caseId === caseId ? result : fail(caseId, "CASE_SHAPE_INVALID"));
    } catch {
      out.push(fail(caseId, "MATRIX_EXCEPTION"));
    }
  }
  return Object.freeze(out);
}

/** Test helper — all cases PASS via injected runners. */
export function createPassingR2LiveRunners(): Readonly<
  Record<(typeof REQUIRED_R2_LIVE_CASE_IDS)[number], R2LiveCaseRunner>
> {
  const out = {} as Record<
    (typeof REQUIRED_R2_LIVE_CASE_IDS)[number],
    R2LiveCaseRunner
  >;
  for (const id of REQUIRED_R2_LIVE_CASE_IDS) {
    out[id] = async () => pass(id);
  }
  return Object.freeze(out);
}
