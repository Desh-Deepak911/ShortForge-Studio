/**
 * Ordered R2 targeted matrix runners — STOP ON FIRST FAILURE.
 * Reuses r2-live/live-fixtures helpers; same-snapshot staging; coverage accepts
 * blocked_incomplete; evidence privacy uses structural authority.
 */

import { randomUUID } from "node:crypto";

import {
  HEADLESS_VERIFICATION_TARGET_ASSET_BUNDLE_RECORD,
  HEADLESS_VERIFICATION_TARGET_MANIFEST,
  isProvisionalStoredJobRecord,
  toHeadlessPublicOwnedObjectView,
  verifyAndFinalizeR2OwnedObject,
} from "@/features/headless-renderer/control-plane";
import { reconcileFinalizedOwnedObjectCoverage } from "@/features/headless-renderer/control-plane/services/reconcile-finalized-owned-object-coverage";

import { assertR2EvidencePrivacyStructure } from "../r2-live/evidence-privacy-authority";
import {
  createMinimalProvisionalJob,
  createStagingObject,
  digestOf,
  makeSyntheticJsonBytes,
  putObjectBytes,
  trackProjectId,
} from "../r2-live/live-fixtures";
import type { R2LiveMatrixContext } from "../r2-live/types";

import type { R2TargetedCaseEvidence } from "./evidence";
import {
  REQUIRED_R2_TARGETED_CASE_IDS,
  type R2TargetedFailureCategory,
} from "./required-cases";

function pass(caseId: string): R2TargetedCaseEvidence {
  return { caseId, status: "PASS" };
}

function fail(
  caseId: string,
  category: R2TargetedFailureCategory,
): R2TargetedCaseEvidence {
  return { caseId, status: "FAIL", failureCategory: category };
}

function notTested(caseId: string): R2TargetedCaseEvidence {
  return { caseId, status: "NOT_TESTED" };
}

export type R2TargetedCaseRunner = (
  ctx: R2LiveMatrixContext,
) => Promise<R2TargetedCaseEvidence>;

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
 * Default runners for gate-on targeted path — real port calls against injected ctx.
 */
export const DEFAULT_R2_TARGETED_CASE_RUNNERS: Readonly<
  Record<(typeof REQUIRED_R2_TARGETED_CASE_IDS)[number], R2TargetedCaseRunner>
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

  "staging.same_snapshot_create": async (ctx) => {
    try {
      trackProjectId(ctx, ctx.projectId);
      const principal = { ownerId: ctx.ownerId, sessionId: "r2qa-targeted" };
      const claimed = await ctx.projectAuthorization.claimUnownedProject(
        principal,
        ctx.projectId,
      );
      if (!claimed.ok) {
        return fail("staging.same_snapshot_create", "STAGING_SAME_SNAPSHOT_FAILED");
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
        creatorKey: `r2qa-targeted-idem-${ctx.runId}`,
        manifestPayloadDigestClaim: digest,
      });
      if (!provisional.ok) {
        return fail("staging.same_snapshot_create", "STAGING_SAME_SNAPSHOT_FAILED");
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
        return fail("staging.same_snapshot_create", "STAGING_SAME_SNAPSHOT_FAILED");
      }
      if (
        staging.digest !== digest ||
        staging.expectedByteLength !== bytes.byteLength
      ) {
        return fail("staging.same_snapshot_create", "STAGING_SAME_SNAPSHOT_FAILED");
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
      return pass("staging.same_snapshot_create");
    } catch {
      return fail("staging.same_snapshot_create", "STAGING_SAME_SNAPSHOT_FAILED");
    }
  },

  "upload.put_bytes": async (ctx) => {
    try {
      const s = requireSessionHappyPath(ctx);
      if (!s.ok) return fail("upload.put_bytes", "UPLOAD_PUT_FAILED");

      // Targeted chain has no separate capability_issue case — issue once here
      // and persist only the boolean (never the URL).
      const origin = ctx.r2Config.allowedOrigins[0];
      if (origin == null) {
        return fail("upload.put_bytes", "UPLOAD_PUT_FAILED");
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
        return fail("upload.put_bytes", "UPLOAD_PUT_FAILED");
      }
      ctx.session.uploadCapabilityIssued = true;

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

  "verify.finalize": async (ctx) => {
    try {
      const s = requireSessionHappyPath(ctx);
      if (!s.ok) return fail("verify.finalize", "VERIFY_FINALIZE_FAILED");
      const result = await verifyAndFinalizeR2OwnedObject({
        objectId: s.objectId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs,
        store: ctx.ownedObjectStore,
        io: ctx.io,
      });
      if (!result.ok) {
        return fail("verify.finalize", "VERIFY_FINALIZE_FAILED");
      }
      if (result.value.record.stage !== "finalized") {
        return fail("verify.finalize", "VERIFY_FINALIZE_FAILED");
      }
      const loaded = await ctx.ownedObjectStore.getByObjectIdAndOwner({
        objectId: s.objectId,
        ownerId: ctx.ownerId,
      });
      if (!loaded.ok || loaded.value == null) {
        return fail("verify.finalize", "VERIFY_FINALIZE_FAILED");
      }
      const rec = loaded.value.record;
      if (
        rec.stage !== "finalized" ||
        rec.contentDigest !== s.digest ||
        rec.byteLength !== s.bytes.byteLength ||
        rec.mimeType !== s.mime ||
        loaded.value.storeVersion < 2
      ) {
        return fail("verify.finalize", "VERIFY_FINALIZE_FAILED");
      }
      return pass("verify.finalize");
    } catch {
      return fail("verify.finalize", "VERIFY_FINALIZE_FAILED");
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
      if (
        !owned.ok ||
        owned.value == null ||
        owned.value.record.stage !== "finalized"
      ) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }
      const finalized = owned.value.record;

      const before = await ctx.jobStore.getByJobIdAndOwner(s.jobId, ctx.ownerId);
      if (!before.ok || !isProvisionalStoredJobRecord(before.value)) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }
      const beforeVersion = before.value.storeVersion;
      const requiredBefore =
        before.value.verificationCoverage.requiredTargets.slice();

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
        job.verificationCoverage.requiredTargets.length !==
          requiredBefore.length ||
        !requiredBefore.every(
          (t, i) => t === job.verificationCoverage.requiredTargets[i],
        )
      ) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }
      if (job.verificationCoverage.complete !== false) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }
      if (result.value.status === "applied" && job.storeVersion <= beforeVersion) {
        return fail("coverage.reconcile", "COVERAGE_RECONCILE_FAILED");
      }

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

  "cleanup.verify": async (ctx) => {
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
        return fail("cleanup.verify", "CLEANUP_VERIFY_FAILED");
      }
      const put = await putObjectBytes(ctx, {
        storeId: staging.storeId,
        objectKey: staging.objectKey,
        bytes,
        mime: staging.mime,
      });
      if (!put.ok) {
        return fail("cleanup.verify", "CLEANUP_VERIFY_FAILED");
      }
      const loaded = await ctx.ownedObjectStore.getByObjectIdAndOwner({
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
      });
      if (!loaded.ok || loaded.value == null) {
        return fail("cleanup.verify", "CLEANUP_VERIFY_FAILED");
      }
      const pending = await ctx.ownedObjectStore.markCleanupPending({
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
        expectedStoreVersion: loaded.value.storeVersion,
        terminalReason: "r2_targeted_cleanup_case",
        cleanupScheduledAtMs: ctx.nowMs,
        nowMs: ctx.nowMs,
      });
      if (!pending.ok) {
        return fail("cleanup.verify", "CLEANUP_VERIFY_FAILED");
      }
      const deleted = await ctx.io.deleteObject(
        { storeId: staging.storeId, objectKey: staging.objectKey },
        ctx.ownerId,
      );
      if (!deleted.ok) {
        return fail("cleanup.verify", "CLEANUP_VERIFY_FAILED");
      }
      const completed = await ctx.ownedObjectStore.completeCleanup({
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
        expectedStoreVersion: pending.value.storeVersion,
        nowMs: ctx.nowMs,
      });
      if (!completed.ok) {
        return fail("cleanup.verify", "CLEANUP_VERIFY_FAILED");
      }
      return pass("cleanup.verify");
    } catch {
      return fail("cleanup.verify", "CLEANUP_VERIFY_FAILED");
    }
  },
});

/**
 * Run targeted matrix in frozen order. STOP ON FIRST FAILURE —
 * remaining cases are recorded as NOT_TESTED (not executed).
 */
export async function runR2TargetedMatrix(
  ctx: R2LiveMatrixContext,
  runners: Readonly<
    Partial<
      Record<(typeof REQUIRED_R2_TARGETED_CASE_IDS)[number], R2TargetedCaseRunner>
    >
  > = DEFAULT_R2_TARGETED_CASE_RUNNERS,
): Promise<readonly R2TargetedCaseEvidence[]> {
  const out: R2TargetedCaseEvidence[] = [];
  let stopped = false;
  for (const caseId of REQUIRED_R2_TARGETED_CASE_IDS) {
    if (stopped) {
      out.push(notTested(caseId));
      continue;
    }
    const runner = runners[caseId] ?? DEFAULT_R2_TARGETED_CASE_RUNNERS[caseId];
    try {
      const result = await runner(ctx);
      const shaped =
        result.caseId === caseId
          ? result
          : fail(caseId, "CASE_SHAPE_INVALID");
      out.push(shaped);
      if (shaped.status === "FAIL") {
        stopped = true;
      }
    } catch {
      out.push(fail(caseId, "MATRIX_EXCEPTION"));
      stopped = true;
    }
  }
  return Object.freeze(out);
}

/** Test helper — all cases PASS via injected runners. */
export function createPassingR2TargetedRunners(): Readonly<
  Record<(typeof REQUIRED_R2_TARGETED_CASE_IDS)[number], R2TargetedCaseRunner>
> {
  const out = {} as Record<
    (typeof REQUIRED_R2_TARGETED_CASE_IDS)[number],
    R2TargetedCaseRunner
  >;
  for (const id of REQUIRED_R2_TARGETED_CASE_IDS) {
    out[id] = async () => pass(id);
  }
  return Object.freeze(out);
}
