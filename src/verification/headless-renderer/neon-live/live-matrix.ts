/**
 * Canonical Neon live matrix — exact required case IDs only.
 */

import type {
  HeadlessProvisionalStoredJobRecord,
  HeadlessProvisionalStoreWrite,
} from "@/features/headless-renderer/control-plane";
import { appendProvisionalStagingObjectRefs } from "@/features/headless-renderer/control-plane";
import { applyHeadlessJobTransition } from "@/features/headless-renderer/domain/headless-job-lifecycle";

import {
  NeonLiveCaseSession,
  type NeonLiveSessionAttribution,
} from "./case-step";
import type { NeonLiveCaseEvidence } from "./evidence";
import { maybeInjectThrow } from "./injection";
import {
  buildLiveCanonicalPair,
  buildLiveDraft,
  buildLiveIdempotencyKey,
  casLiveCoverage,
  LIVE_CLOCK_MS,
  type LiveDraftContext,
} from "./live-fixtures";
import { caseDiagnosticFromPromotionAttribution } from "./promotion-diagnostic";
import type { NeonLiveFailureCategory } from "./required-cases";
import type { NeonLiveMatrixContext } from "./types";

export type NeonLiveMatrixRun = {
  readonly cases: readonly NeonLiveCaseEvidence[];
  readonly attribution: NeonLiveSessionAttribution;
};

function trackJob(ctx: NeonLiveMatrixContext, jobId: string): void {
  if (!ctx.createdJobIds.includes(jobId)) ctx.createdJobIds.push(jobId);
}

function trackProject(ctx: NeonLiveMatrixContext, projectId: string): void {
  if (!ctx.createdProjectIds.includes(projectId)) {
    ctx.createdProjectIds.push(projectId);
  }
}

async function materializeQueuedJob(
  ctx: NeonLiveMatrixContext,
  projectId: string,
): Promise<{
  jobId: string;
  storeVersion: number;
  claimToken: string | null;
  claimedAtMs: number | null;
  operationId: string;
  idempotencyAuthorityKey: string;
} | null> {
  try {
    maybeInjectThrow(ctx.injectThrowAt, "live_fixture_construction");
    const draftCtx = await buildLiveDraft({
      runId: ctx.runId,
      ownerId: ctx.ownerId,
      projectId,
      randomUUID: ctx.uuid,
      injectThrowAt: ctx.injectThrowAt,
    });
    trackJob(ctx, draftCtx.jobId);
    const created = await ctx.store.createProvisionalIfAbsent({
      idempotencyAuthorityKey: draftCtx.idempotencyAuthorityKey,
      record: draftCtx.draft,
    });
    if (!created.ok || created.value.kind !== "created") return null;
    let provisional = created.value.record as HeadlessProvisionalStoredJobRecord;
    maybeInjectThrow(ctx.injectThrowAt, "provisional_cas");
    const coverage = await casLiveCoverage(
      ctx.store,
      provisional,
      provisional.verificationCoverage.requiredTargets,
    );
    if (!coverage.ok) return null;
    provisional = coverage.record;
    maybeInjectThrow(ctx.injectThrowAt, "canonical_pair_construction");
    const pairResult = buildLiveCanonicalPair(
      draftCtx.manifest,
      draftCtx.seeded.bundle,
      provisional,
    );
    if (!pairResult.ok) return null;
    maybeInjectThrow(ctx.injectThrowAt, "promotion");
    const promoted = await ctx.store.promoteProvisionalToCanonical({
      jobId: provisional.jobId,
      ownerId: provisional.ownerId,
      expectedStoreVersion: provisional.storeVersion,
      expectedOperationId: provisional.operationId,
      canonicalJob: pairResult.job,
      canonicalRequest: pairResult.request,
    });
    if (!promoted.ok || promoted.value.kind !== "updated") return null;
    return {
      jobId: promoted.value.record.jobId,
      storeVersion: promoted.value.record.storeVersion,
      claimToken: promoted.value.record.claimToken,
      claimedAtMs: promoted.value.record.claimedAtMs,
      operationId: promoted.value.record.operationId,
      idempotencyAuthorityKey: promoted.value.record.idempotencyAuthorityKey,
    };
  } catch {
    return null;
  }
}

export async function runNeonLiveMatrix(
  ctx: NeonLiveMatrixContext,
): Promise<NeonLiveMatrixRun> {
  const session = new NeonLiveCaseSession({
    injectThrowAt: ctx.injectThrowAt,
    stopAfterCaseId: ctx.stopAfterCaseId,
  });
  const done = (): NeonLiveMatrixRun => ({
    cases: session.results,
    attribution: session.attribution(),
  });
  const principal = {
    ownerId: ctx.ownerId,
    sessionId: `sess-${ctx.runId}`,
  };
  const otherPrincipal = {
    ownerId: ctx.otherOwnerId,
    sessionId: `sess-other-${ctx.runId}`,
  };

  const projectId = ctx.uuid();
  trackProject(ctx, projectId);

  if (
    (await session.run("ownership.first_claim", async () => {
      const claim = await ctx.auth.claimUnownedProject(principal, projectId);
      return claim.ok
        ? { kind: "pass" }
        : {
            kind: "fail",
            category:
              (claim.issues[0]?.code as NeonLiveFailureCategory) ?? "CLAIM_FAILED",
            diagnostic: {
              safeOperationStage: "ownership",
              safeControlPlaneCode: claim.issues[0]?.code ?? null,
            },
          };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("ownership.same_owner_access", async () => {
      const access = await ctx.auth.assertProjectAccess(principal, projectId);
      return access.ok
        ? { kind: "pass" }
        : {
            kind: "fail",
            category:
              (access.issues[0]?.code as NeonLiveFailureCategory) ?? "ACCESS_FAILED",
          };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("ownership.cross_owner_denied", async () => {
      const denied = await ctx.auth.claimUnownedProject(otherPrincipal, projectId);
      return !denied.ok && denied.issues[0]?.code === "FORBIDDEN"
        ? { kind: "pass" }
        : { kind: "fail", category: "CROSS_OWNER_NOT_FORBIDDEN" };
    })) === "stop"
  ) {
    return done();
  }

  let draftCtx: LiveDraftContext | null = null;
  if (
    (await session.prepare("job.provisional_create", async () => {
      maybeInjectThrow(ctx.injectThrowAt, "live_fixture_construction");
      draftCtx = await buildLiveDraft({
        runId: ctx.runId,
        ownerId: ctx.ownerId,
        projectId,
        randomUUID: ctx.uuid,
        injectThrowAt: ctx.injectThrowAt,
      });
      trackJob(ctx, draftCtx.jobId);
    })) === "stop"
  ) {
    return done();
  }

  let provisional: HeadlessProvisionalStoredJobRecord | null = null;
  if (
    (await session.run("job.provisional_create", async () => {
      const created = await ctx.store.createProvisionalIfAbsent({
        idempotencyAuthorityKey: draftCtx!.idempotencyAuthorityKey,
        record: draftCtx!.draft,
      });
      if (created.ok && created.value.kind === "created") {
        provisional = created.value.record as HeadlessProvisionalStoredJobRecord;
        return { kind: "pass" };
      }
      return {
        kind: "fail",
        category: "PROVISIONAL_CREATE_FAILED",
        diagnostic: {
          safeOperationStage: "provisional_create",
          safeControlPlaneCode: created.ok
            ? null
            : (created.issues[0]?.code ?? null),
        },
      };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.idempotent_replay", async () => {
      const replay = await ctx.store.createProvisionalIfAbsent({
        idempotencyAuthorityKey: draftCtx!.idempotencyAuthorityKey,
        record: draftCtx!.draft,
      });
      return replay.ok && replay.value.kind === "existing"
        ? { kind: "pass" }
        : { kind: "fail", category: "REPLAY_FAILED" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.semantic_conflict", async () => {
      const other = await buildLiveDraft({
        runId: ctx.runId,
        ownerId: ctx.ownerId,
        projectId,
        creatorKey: draftCtx!.creatorKey,
        randomUUID: ctx.uuid,
      });
      trackJob(ctx, other.jobId);
      const forged: HeadlessProvisionalStoreWrite = {
        ...other.draft,
        idempotencyAuthorityKey: draftCtx!.idempotencyAuthorityKey,
      };
      const conflict = await ctx.store.createProvisionalIfAbsent({
        idempotencyAuthorityKey: draftCtx!.idempotencyAuthorityKey,
        record: forged,
      });
      const ok =
        (conflict.ok && conflict.value.kind === "conflict") ||
        (!conflict.ok &&
          conflict.issues[0]?.code === "JOB_STORE_COHERENCE_REJECTED");
      return ok
        ? { kind: "pass" }
        : { kind: "fail", category: "SEMANTIC_CONFLICT_FAILED" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.pk_collision_savepoint", async () => {
      const colliding = await buildLiveDraft({
        runId: ctx.runId,
        ownerId: ctx.ownerId,
        projectId,
        jobId: draftCtx!.jobId,
        creatorKey: `creator-collision-${ctx.runId}-${ctx.uuid()}`,
        randomUUID: ctx.uuid,
      });
      const collision = await ctx.store.createProvisionalIfAbsent({
        idempotencyAuthorityKey: colliding.idempotencyAuthorityKey,
        record: colliding.draft,
      });
      const isInternal =
        !collision.ok && collision.issues[0]?.code === "INTERNAL_ERROR";
      const wronglyAccepted =
        collision.ok &&
        (collision.value.kind === "existing" ||
          collision.value.kind === "conflict" ||
          collision.value.kind === "created");
      if (!isInternal || wronglyAccepted) {
        return { kind: "fail", category: "PK_COLLISION_FAILED" };
      }
      const stillReadable = await ctx.store.getByJobIdAndOwner(
        draftCtx!.jobId,
        ctx.ownerId,
      );
      return stillReadable.ok && stillReadable.value.jobId === draftCtx!.jobId
        ? { kind: "pass" }
        : { kind: "fail", category: "PK_COLLISION_TX_UNUSABLE" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.provisional_cas_staging", async () => {
      // Single materialization: empty draft + authoritative same-snapshot refs.
      const emptyCtx = await buildLiveDraft({
        runId: ctx.runId,
        ownerId: ctx.ownerId,
        projectId,
        emptyStaging: true,
        randomUUID: ctx.uuid,
      });
      trackJob(ctx, emptyCtx.jobId);
      const created = await ctx.store.createProvisionalIfAbsent({
        idempotencyAuthorityKey: emptyCtx.idempotencyAuthorityKey,
        record: emptyCtx.draft,
      });
      if (!created.ok || created.value.kind !== "created") {
        return { kind: "fail", category: "EMPTY_STAGING_CREATE_FAILED" };
      }
      let record = created.value.record as HeadlessProvisionalStoredJobRecord;
      if (record.stagingObjectRefs.length !== 0) {
        return { kind: "fail", category: "EMPTY_STAGING_CREATE_FAILED" };
      }

      const fullRefs = emptyCtx.authoritativeStagingObjectRefs;
      if (fullRefs.length < 2) {
        return {
          kind: "fail",
          category: "STAGING_APPEND_FAILED",
          diagnostic: { safeOperationStage: "staging_append" },
        };
      }

      // Valid partial append (manifest only) from the same authoritative set.
      maybeInjectThrow(ctx.injectThrowAt, "staging_append");
      const partialAppend = appendProvisionalStagingObjectRefs(
        record,
        fullRefs.slice(0, 1),
        LIVE_CLOCK_MS + 500,
      );
      if (!partialAppend.ok) {
        return {
          kind: "fail",
          category: "STAGING_APPEND_FAILED",
          diagnostic: { safeOperationStage: "staging_append" },
        };
      }
      maybeInjectThrow(ctx.injectThrowAt, "provisional_cas");
      const partialCas = await ctx.store.compareAndSetProvisional({
        jobId: record.jobId,
        ownerId: record.ownerId,
        expectedStoreVersion: record.storeVersion,
        next: partialAppend.record,
      });
      if (!partialCas.ok || partialCas.value.kind !== "updated") {
        return {
          kind: "fail",
          category: "STAGING_CAS_FAILED",
          diagnostic: {
            safeOperationStage: "provisional_cas",
            safeControlPlaneCode: partialCas.ok
              ? null
              : (partialCas.issues[0]?.code ?? null),
          },
        };
      }
      record = partialCas.value.record as HeadlessProvisionalStoredJobRecord;

      // Complete append from the same authoritative materialization (no second build).
      const fullAppend = appendProvisionalStagingObjectRefs(
        record,
        fullRefs,
        LIVE_CLOCK_MS + 1000,
      );
      if (!fullAppend.ok) {
        return {
          kind: "fail",
          category: "STAGING_APPEND_FAILED",
          diagnostic: { safeOperationStage: "staging_append" },
        };
      }
      const fullCas = await ctx.store.compareAndSetProvisional({
        jobId: record.jobId,
        ownerId: record.ownerId,
        expectedStoreVersion: record.storeVersion,
        next: fullAppend.record,
      });
      if (!fullCas.ok || fullCas.value.kind !== "updated") {
        return {
          kind: "fail",
          category: "STAGING_CAS_FAILED",
          diagnostic: {
            safeOperationStage: "provisional_cas",
            safeControlPlaneCode: fullCas.ok
              ? null
              : (fullCas.issues[0]?.code ?? null),
          },
        };
      }
      record = fullCas.value.record as HeadlessProvisionalStoredJobRecord;

      // Authoritative reread + exact staging coherence with same-snapshot refs.
      const reread = await ctx.store.getByJobIdAndOwner(record.jobId, ctx.ownerId);
      if (
        !reread.ok ||
        reread.value.stage !== "provisional" ||
        reread.value.stagingObjectRefs.length !== fullRefs.length
      ) {
        return {
          kind: "fail",
          category: "STAGING_CAS_FAILED",
          diagnostic: { safeOperationStage: "provisional_cas" },
        };
      }
      for (let i = 0; i < fullRefs.length; i++) {
        const got = reread.value.stagingObjectRefs[i]!;
        const expected = fullRefs[i]!;
        if (
          got.purpose !== expected.purpose ||
          got.slotKey !== expected.slotKey ||
          got.contentDigestClaim !== expected.contentDigestClaim ||
          got.byteLengthClaim !== expected.byteLengthClaim ||
          got.mimeTypeClaim !== expected.mimeTypeClaim ||
          got.locator.kind !== expected.locator.kind ||
          got.locator.storeId !== expected.locator.storeId ||
          got.locator.objectKey !== expected.locator.objectKey
        ) {
          return {
            kind: "fail",
            category: "STAGING_CAS_FAILED",
            diagnostic: { safeOperationStage: "provisional_cas" },
          };
        }
      }
      return { kind: "pass" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.verification_coverage", async () => {
      if (provisional == null) {
        return { kind: "fail", category: "COVERAGE_INCOMPLETE" };
      }
      const partial = await casLiveCoverage(
        ctx.store,
        provisional,
        provisional.verificationCoverage.requiredTargets.slice(0, 1),
      );
      if (!partial.ok) {
        return { kind: "fail", category: "COVERAGE_CAS_FAILED" };
      }
      provisional = partial.record;
      const full = await casLiveCoverage(
        ctx.store,
        provisional,
        provisional.verificationCoverage.requiredTargets,
      );
      if (!full.ok) {
        return { kind: "fail", category: "COVERAGE_CAS_FAILED" };
      }
      provisional = full.record;
      return provisional.verificationCoverage.complete
        ? { kind: "pass" }
        : { kind: "fail", category: "COVERAGE_INCOMPLETE" };
    })) === "stop"
  ) {
    return done();
  }

  type LiveCanonicalPair = Extract<
    ReturnType<typeof buildLiveCanonicalPair>,
    { ok: true }
  >;
  let pair: { job: LiveCanonicalPair["job"]; request: LiveCanonicalPair["request"] } | null =
    null;

  if (
    (await session.run("job.promote_atomic", async () => {
      if (provisional == null) {
        return { kind: "fail", category: "PROMOTE_FAILED" };
      }
      maybeInjectThrow(ctx.injectThrowAt, "canonical_pair_construction");
      const built = buildLiveCanonicalPair(
        draftCtx!.manifest,
        draftCtx!.seeded.bundle,
        provisional,
      );
      if (!built.ok) {
        return {
          kind: "fail",
          category: "PROMOTE_FAILED",
          diagnostic: {
            safeOperationStage: "canonical_pair_construction",
            promotionResultKind: "rejected",
            promotionReasonId: "canonical_pair_invalid",
            durableCanonicalRowExists: false,
            storeVersionDelta: "unchanged",
            stageClassification: "provisional",
          },
        };
      }
      pair = { job: built.job, request: built.request };
      maybeInjectThrow(ctx.injectThrowAt, "promotion");
      const attributed =
        await ctx.store.promoteProvisionalToCanonicalAttributed({
          jobId: provisional.jobId,
          ownerId: provisional.ownerId,
          expectedStoreVersion: provisional.storeVersion,
          expectedOperationId: provisional.operationId,
          canonicalJob: built.job,
          canonicalRequest: built.request,
        });
      const promoted = attributed.result;
      if (promoted.ok && promoted.value.kind === "updated") {
        return { kind: "pass" };
      }
      return {
        kind: "fail",
        category: "PROMOTE_FAILED",
        diagnostic: caseDiagnosticFromPromotionAttribution(
          attributed.attribution,
        ),
      };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.already_promoted_replay", async () => {
      if (provisional == null || pair == null) {
        return { kind: "fail", category: "ALREADY_PROMOTED_FAILED" };
      }
      const replay = await ctx.store.promoteProvisionalToCanonical({
        jobId: provisional.jobId,
        ownerId: provisional.ownerId,
        expectedStoreVersion: provisional.storeVersion,
        expectedOperationId: provisional.operationId,
        canonicalJob: pair.job,
        canonicalRequest: pair.request,
      });
      return replay.ok && replay.value.kind === "already_promoted"
        ? { kind: "pass" }
        : { kind: "fail", category: "ALREADY_PROMOTED_FAILED" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.forged_job_fingerprint_rejected", async () => {
      if (provisional == null || pair == null) {
        return { kind: "fail", category: "FORGED_PROMOTE_NOT_REJECTED" };
      }
      const forgedJob = {
        ...pair.job,
        jobFingerprint: "hjr:sha256:" + "ab".repeat(32),
      };
      const forged = await ctx.store.promoteProvisionalToCanonical({
        jobId: provisional.jobId,
        ownerId: provisional.ownerId,
        expectedStoreVersion: provisional.storeVersion,
        expectedOperationId: provisional.operationId,
        canonicalJob: forgedJob,
        canonicalRequest: pair.request,
      });
      return forged.ok && forged.value.kind === "rejected"
        ? { kind: "pass" }
        : { kind: "fail", category: "FORGED_PROMOTE_NOT_REJECTED" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.forged_request_fingerprint_rejected", async () => {
      if (provisional == null || pair == null) {
        return { kind: "fail", category: "FORGED_PROMOTE_NOT_REJECTED" };
      }
      const forgedRequest = {
        ...pair.request,
        requestFingerprint: "hrr:sha256:" + "cd".repeat(32),
      };
      const forged = await ctx.store.promoteProvisionalToCanonical({
        jobId: provisional.jobId,
        ownerId: provisional.ownerId,
        expectedStoreVersion: provisional.storeVersion,
        expectedOperationId: provisional.operationId,
        canonicalJob: pair.job,
        canonicalRequest: forgedRequest,
      });
      return forged.ok && forged.value.kind === "rejected"
        ? { kind: "pass" }
        : { kind: "fail", category: "FORGED_PROMOTE_NOT_REJECTED" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.forged_operation_lineage_rejected", async () => {
      if (provisional == null || pair == null) {
        return { kind: "fail", category: "FORGED_PROMOTE_NOT_REJECTED" };
      }
      const forged = await ctx.store.promoteProvisionalToCanonical({
        jobId: provisional.jobId,
        ownerId: provisional.ownerId,
        expectedStoreVersion: provisional.storeVersion,
        expectedOperationId: `op_forged_${ctx.uuid()}`,
        canonicalJob: pair.job,
        canonicalRequest: pair.request,
      });
      return forged.ok && forged.value.kind === "rejected"
        ? { kind: "pass" }
        : { kind: "fail", category: "FORGED_PROMOTE_NOT_REJECTED" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.forged_profile_build_rejected", async () => {
      if (provisional == null || pair == null) {
        return { kind: "fail", category: "FORGED_PROMOTE_NOT_REJECTED" };
      }
      const forgedJob = {
        ...pair.job,
        rendererBuildId: "forged-build-id",
      };
      const forgedRequest = {
        ...pair.request,
        rendererBuildId: "forged-build-id",
      };
      const forged = await ctx.store.promoteProvisionalToCanonical({
        jobId: provisional.jobId,
        ownerId: provisional.ownerId,
        expectedStoreVersion: provisional.storeVersion,
        expectedOperationId: provisional.operationId,
        canonicalJob: forgedJob,
        canonicalRequest: forgedRequest,
      });
      return forged.ok && forged.value.kind === "rejected"
        ? { kind: "pass" }
        : { kind: "fail", category: "FORGED_PROMOTE_NOT_REJECTED" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.queue_listing", async () => {
      maybeInjectThrow(ctx.injectThrowAt, "queue_listing");
      const listed = await ctx.store.listCanonicalQueuedJobIds(50);
      return listed.ok && listed.value.includes(draftCtx!.jobId)
        ? { kind: "pass" }
        : { kind: "fail", category: "QUEUE_LIST_FAILED" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.claim_race", async () => {
      maybeInjectThrow(ctx.injectThrowAt, "claim");
      const got = await ctx.store.getByJobIdAndOwner(draftCtx!.jobId, ctx.ownerId);
      if (!got.ok || got.value.stage !== "canonical") {
        return { kind: "fail", category: "CLAIM_PRECONDITION_FAILED" };
      }
      const version = got.value.storeVersion;
      const [a, b] = await Promise.all([
        ctx.store.claimQueuedJob({
          jobId: draftCtx!.jobId,
          ownerId: ctx.ownerId,
          expectedStoreVersion: version,
          claimToken: `claim-a-${ctx.runId}`,
          nowMs: LIVE_CLOCK_MS + 10_000,
        }),
        ctx.store.claimQueuedJob({
          jobId: draftCtx!.jobId,
          ownerId: ctx.ownerId,
          expectedStoreVersion: version,
          claimToken: `claim-b-${ctx.runId}`,
          nowMs: LIVE_CLOCK_MS + 10_000,
        }),
      ]);
      const wins = [a, b].filter((r) => r.ok && r.value.kind === "claimed");
      const losses = [a, b].filter((r) => r.ok && r.value.kind === "rejected");
      return wins.length === 1 && losses.length === 1
        ? { kind: "pass" }
        : { kind: "fail", category: "CLAIM_RACE_FAILED" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.stale_cas", async () => {
      maybeInjectThrow(ctx.injectThrowAt, "transition");
      const got = await ctx.store.getByJobIdAndOwner(draftCtx!.jobId, ctx.ownerId);
      if (!got.ok || got.value.stage !== "canonical") {
        return { kind: "fail", category: "STALE_PRECONDITION_FAILED" };
      }
      const next = applyHeadlessJobTransition({
        jobValue: got.value.canonicalJob,
        requestValue: got.value.canonicalRequest,
        toState: "rendering",
        attempt: got.value.canonicalJob!.attempt,
        updatedAtMs: LIVE_CLOCK_MS + 20_000,
      });
      if (!next.ok) {
        return { kind: "fail", category: "STALE_TRANSITION_BUILD_FAILED" };
      }
      const stale = await ctx.store.compareAndSetTransition({
        jobId: draftCtx!.jobId,
        ownerId: ctx.ownerId,
        expectedStoreVersion: 1,
        next: {
          job: next.job,
          request: got.value.canonicalRequest,
          idempotencyAuthorityKey: got.value.idempotencyAuthorityKey,
          operationId: got.value.operationId,
          claimToken: got.value.claimToken,
          claimedAtMs: got.value.claimedAtMs,
          artifactObjectBinding: got.value.artifactObjectBinding,
        },
      });
      return stale.ok && stale.value.kind === "stale"
        ? { kind: "pass" }
        : { kind: "fail", category: "STALE_CAS_FAILED" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.terminal_immutability", async () => {
      const got = await ctx.store.getByJobIdAndOwner(draftCtx!.jobId, ctx.ownerId);
      if (!got.ok || got.value.stage !== "canonical") {
        return { kind: "fail", category: "TERMINAL_PRECONDITION_FAILED" };
      }
      const failed = applyHeadlessJobTransition({
        jobValue: got.value.canonicalJob,
        requestValue: got.value.canonicalRequest,
        toState: "failed",
        attempt: got.value.canonicalJob!.attempt,
        updatedAtMs: LIVE_CLOCK_MS + 30_000,
        terminalReason: { reasonId: "WORKER_FAILED", retryable: false },
      });
      if (!failed.ok) {
        return { kind: "fail", category: "TERMINAL_TRANSITION_BUILD_FAILED" };
      }
      const cas = await ctx.store.compareAndSetTransition({
        jobId: draftCtx!.jobId,
        ownerId: ctx.ownerId,
        expectedStoreVersion: got.value.storeVersion,
        next: {
          job: failed.job,
          request: got.value.canonicalRequest,
          idempotencyAuthorityKey: got.value.idempotencyAuthorityKey,
          operationId: got.value.operationId,
          claimToken: null,
          claimedAtMs: null,
          artifactObjectBinding: null,
        },
      });
      if (!cas.ok || cas.value.kind !== "updated") {
        return { kind: "fail", category: "TERMINAL_CAS_FAILED" };
      }
      const locked = await ctx.store.compareAndSetTransition({
        jobId: draftCtx!.jobId,
        ownerId: ctx.ownerId,
        expectedStoreVersion: cas.value.record.storeVersion,
        next: {
          job: failed.job,
          request: got.value.canonicalRequest,
          idempotencyAuthorityKey: got.value.idempotencyAuthorityKey,
          operationId: got.value.operationId,
          claimToken: null,
          claimedAtMs: null,
          artifactObjectBinding: null,
        },
      });
      return locked.ok && locked.value.kind === "terminal_locked"
        ? { kind: "pass" }
        : { kind: "fail", category: "TERMINAL_LOCK_FAILED" };
    })) === "stop"
  ) {
    return done();
  }

  const leaseMs = 5_000;
  const claimNow = LIVE_CLOCK_MS + 100_000;

  let liveJob: Awaited<ReturnType<typeof materializeQueuedJob>> = null;
  let expiredJob: Awaited<ReturnType<typeof materializeQueuedJob>> = null;
  let concurrentJob: Awaited<ReturnType<typeof materializeQueuedJob>> = null;
  let terminalRecoveryJob: Awaited<ReturnType<typeof materializeQueuedJob>> = null;
  let liveClaimToken: string | null = null;
  let liveStoreVersion = 0;
  let expiredClaimToken: string | null = null;
  let expiredBeforeVersion = 0;
  let expiredAfterVersion = 0;

  if (
    (await session.prepare("job.recovery_live_claim_not_stolen", async () => {
      maybeInjectThrow(ctx.injectThrowAt, "recovery_helper");
      const recoveryProjectId = ctx.uuid();
      trackProject(ctx, recoveryProjectId);
      await ctx.auth.claimUnownedProject(principal, recoveryProjectId);
      liveJob = await materializeQueuedJob(ctx, recoveryProjectId);
      expiredJob = await materializeQueuedJob(ctx, recoveryProjectId);
      concurrentJob = await materializeQueuedJob(ctx, recoveryProjectId);
      terminalRecoveryJob = await materializeQueuedJob(ctx, recoveryProjectId);
      if (liveJob) {
        const claimed = await ctx.store.claimQueuedJob({
          jobId: liveJob.jobId,
          ownerId: ctx.ownerId,
          expectedStoreVersion: liveJob.storeVersion,
          claimToken: `live-claim-${ctx.uuid()}`,
          nowMs: claimNow,
        });
        if (claimed.ok && claimed.value.kind === "claimed") {
          liveClaimToken = claimed.value.record.claimToken;
          liveStoreVersion = claimed.value.record.storeVersion;
        }
      }
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.recovery_live_claim_not_stolen", async () => {
      if (!liveJob || liveClaimToken == null) {
        return { kind: "fail", category: "RECOVERY_LIVE_STOLEN" };
      }
      const live = await ctx.store.recoverExpiredClaim({
        jobId: liveJob.jobId,
        ownerId: ctx.ownerId,
        nowMs: claimNow + 1,
        leaseMs,
        expectedClaimToken: liveClaimToken,
      });
      return live.ok && live.value.kind === "rejected_live_claim"
        ? { kind: "pass" }
        : { kind: "fail", category: "RECOVERY_LIVE_STOLEN" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.recovery_expired_claim", async () => {
      if (!expiredJob) {
        return { kind: "fail", category: "RECOVERY_EXPIRED_FAILED" };
      }
      const claimed = await ctx.store.claimQueuedJob({
        jobId: expiredJob.jobId,
        ownerId: ctx.ownerId,
        expectedStoreVersion: expiredJob.storeVersion,
        claimToken: `expired-claim-${ctx.uuid()}`,
        nowMs: claimNow,
      });
      if (!claimed.ok || claimed.value.kind !== "claimed") {
        return { kind: "fail", category: "RECOVERY_EXPIRED_FAILED" };
      }
      expiredClaimToken = claimed.value.record.claimToken;
      expiredBeforeVersion = claimed.value.record.storeVersion;
      const recovered = await ctx.store.recoverExpiredClaim({
        jobId: expiredJob.jobId,
        ownerId: ctx.ownerId,
        nowMs: claimNow + leaseMs + 1,
        leaseMs,
        expectedClaimToken: expiredClaimToken,
      });
      if (!recovered.ok || recovered.value.kind !== "failed_expired") {
        return { kind: "fail", category: "RECOVERY_EXPIRED_FAILED" };
      }
      expiredAfterVersion = recovered.value.record.storeVersion;
      return { kind: "pass" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.recovery_store_authority", async () => {
      if (!expiredJob || expiredAfterVersion === 0) {
        return { kind: "fail", category: "RECOVERY_STORE_AUTHORITY_FAILED" };
      }
      return expiredAfterVersion === expiredBeforeVersion + 1
        ? { kind: "pass" }
        : { kind: "fail", category: "RECOVERY_STORE_AUTHORITY_FAILED" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.recovery_old_token_rejected", async () => {
      if (!expiredJob || expiredClaimToken == null || expiredAfterVersion === 0) {
        return { kind: "fail", category: "RECOVERY_OLD_TOKEN_MUTATED" };
      }
      const got = await ctx.store.getByJobIdAndOwner(
        expiredJob.jobId,
        ctx.ownerId,
      );
      if (!got.ok || got.value.stage !== "canonical") {
        return { kind: "fail", category: "RECOVERY_OLD_TOKEN_MUTATED" };
      }
      const mutate = await ctx.store.compareAndSetTransition({
        jobId: expiredJob.jobId,
        ownerId: ctx.ownerId,
        expectedStoreVersion: expiredAfterVersion,
        next: {
          job: got.value.canonicalJob,
          request: got.value.canonicalRequest,
          idempotencyAuthorityKey: got.value.idempotencyAuthorityKey,
          operationId: got.value.operationId,
          claimToken: expiredClaimToken,
          claimedAtMs: claimNow,
          artifactObjectBinding: null,
        },
      });
      return mutate.ok &&
        (mutate.value.kind === "terminal_locked" ||
          mutate.value.kind === "stale")
        ? { kind: "pass" }
        : { kind: "fail", category: "RECOVERY_OLD_TOKEN_MUTATED" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.recovery_terminal_rejected", async () => {
      if (!terminalRecoveryJob) {
        return { kind: "fail", category: "RECOVERY_TERMINAL_NOT_REJECTED" };
      }
      const claimed = await ctx.store.claimQueuedJob({
        jobId: terminalRecoveryJob.jobId,
        ownerId: ctx.ownerId,
        expectedStoreVersion: terminalRecoveryJob.storeVersion,
        claimToken: `term-claim-${ctx.uuid()}`,
        nowMs: claimNow,
      });
      if (!claimed.ok || claimed.value.kind !== "claimed") {
        return { kind: "fail", category: "RECOVERY_TERMINAL_NOT_REJECTED" };
      }
      const failed = applyHeadlessJobTransition({
        jobValue: claimed.value.record.canonicalJob,
        requestValue: claimed.value.record.canonicalRequest,
        toState: "failed",
        attempt: claimed.value.record.canonicalJob!.attempt,
        updatedAtMs: claimNow + 1,
        terminalReason: { reasonId: "WORKER_FAILED", retryable: false },
      });
      if (!failed.ok) {
        return { kind: "fail", category: "RECOVERY_TERMINAL_NOT_REJECTED" };
      }
      await ctx.store.compareAndSetTransition({
        jobId: terminalRecoveryJob.jobId,
        ownerId: ctx.ownerId,
        expectedStoreVersion: claimed.value.record.storeVersion,
        next: {
          job: failed.job,
          request: claimed.value.record.canonicalRequest,
          idempotencyAuthorityKey: claimed.value.record.idempotencyAuthorityKey,
          operationId: claimed.value.record.operationId,
          claimToken: null,
          claimedAtMs: null,
          artifactObjectBinding: null,
        },
      });
      const recovered = await ctx.store.recoverExpiredClaim({
        jobId: terminalRecoveryJob.jobId,
        ownerId: ctx.ownerId,
        nowMs: claimNow + leaseMs + 1,
        leaseMs,
      });
      return recovered.ok && recovered.value.kind === "rejected_terminal"
        ? { kind: "pass" }
        : { kind: "fail", category: "RECOVERY_TERMINAL_NOT_REJECTED" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.recovery_concurrent_one_winner", async () => {
      if (!concurrentJob) {
        return { kind: "fail", category: "RECOVERY_CONCURRENT_FAILED" };
      }
      const claimed = await ctx.store.claimQueuedJob({
        jobId: concurrentJob.jobId,
        ownerId: ctx.ownerId,
        expectedStoreVersion: concurrentJob.storeVersion,
        claimToken: `conc-claim-${ctx.uuid()}`,
        nowMs: claimNow,
      });
      if (!claimed.ok || claimed.value.kind !== "claimed") {
        return { kind: "fail", category: "RECOVERY_CONCURRENT_FAILED" };
      }
      const token = claimed.value.record.claimToken;
      const [a, b] = await Promise.all([
        ctx.store.recoverExpiredClaim({
          jobId: concurrentJob.jobId,
          ownerId: ctx.ownerId,
          nowMs: claimNow + leaseMs + 1,
          leaseMs,
          expectedClaimToken: token,
        }),
        ctx.store.recoverExpiredClaim({
          jobId: concurrentJob.jobId,
          ownerId: ctx.ownerId,
          nowMs: claimNow + leaseMs + 1,
          leaseMs,
          expectedClaimToken: token,
        }),
      ]);
      const winners = [a, b].filter(
        (r) => r.ok && r.value.kind === "failed_expired",
      );
      const losers = [a, b].filter(
        (r) =>
          r.ok &&
          (r.value.kind === "rejected" ||
            r.value.kind === "rejected_terminal" ||
            r.value.kind === "rejected_live_claim"),
      );
      return winners.length === 1 && losers.length === 1
        ? { kind: "pass" }
        : { kind: "fail", category: "RECOVERY_CONCURRENT_FAILED" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.recovery_cross_owner_rejected", async () => {
      if (!liveJob) {
        return { kind: "fail", category: "RECOVERY_CROSS_OWNER_FAILED" };
      }
      const denied = await ctx.store.recoverExpiredClaim({
        jobId: liveJob.jobId,
        ownerId: ctx.otherOwnerId,
        nowMs: claimNow + leaseMs + 1,
        leaseMs,
      });
      return denied.ok &&
        (denied.value.kind === "rejected" ||
          denied.value.kind === "rejected_live_claim" ||
          denied.value.kind === "rejected_terminal")
        ? { kind: "pass" }
        : { kind: "fail", category: "RECOVERY_CROSS_OWNER_FAILED" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.bigint_decoding", async () => {
      const got = await ctx.store.getByJobIdAndOwner(draftCtx!.jobId, ctx.ownerId);
      return got.ok &&
        typeof got.value.storeVersion === "number" &&
        Number.isSafeInteger(got.value.storeVersion)
        ? { kind: "pass" }
        : { kind: "fail", category: "BIGINT_DECODE_FAILED" };
    })) === "stop"
  ) {
    return done();
  }

  if (
    (await session.run("job.cross_owner_read_rejected", async () => {
      const denied = await ctx.store.getByJobIdAndOwner(
        draftCtx!.jobId,
        ctx.otherOwnerId,
      );
      return !denied.ok && denied.issues[0]?.code === "JOB_NOT_FOUND"
        ? { kind: "pass" }
        : { kind: "fail", category: "CROSS_OWNER_READ_FAILED" };
    })) === "stop"
  ) {
    return done();
  }

  await session.run("job.malformed_json_fail_closed", async () => {
    maybeInjectThrow(ctx.injectThrowAt, "malformed_row_probe");
    const badJobId = `job_bad_${ctx.runId}_${ctx.uuid()}`;
    trackJob(ctx, badJobId);
    try {
      await ctx.sql.withClient(async (client) => {
        await client.query(
          `
INSERT INTO public.headless_jobs (
  job_id, stage, state, owner_id, project_id, store_version, operation_id,
  idempotency_authority_key, provisional, created_at_ms, updated_at_ms, expires_at_ms,
  requested_renderer_profile, requested_renderer_build_id, creator_idempotency_key
) VALUES (
  $1, 'provisional', 'materializing', $2, $3, 1, $4,
  $5, '{"not":"valid-provisional"}'::jsonb, $6, $6, $7,
  '{"resolution":"720p","format":"webm","fps":30,"quality":"standard"}'::jsonb,
  'renderer-build-live-1', $8
)
`,
          [
            badJobId,
            ctx.ownerId,
            projectId,
            `op_bad_${ctx.runId}`,
            buildLiveIdempotencyKey(ctx.ownerId, projectId, `bad-${ctx.runId}`),
            LIVE_CLOCK_MS,
            LIVE_CLOCK_MS + 60_000,
            `bad-${ctx.runId}`,
          ],
        );
      });
      const bad = await ctx.store.getByJobIdAndOwner(badJobId, ctx.ownerId);
      return !bad.ok &&
        (bad.issues[0]?.code === "JOB_STORE_COHERENCE_REJECTED" ||
          bad.issues[0]?.code === "JOB_NOT_FOUND")
        ? { kind: "pass" }
        : { kind: "fail", category: "MALFORMED_NOT_REJECTED" };
    } catch {
      return { kind: "fail", category: "MALFORMED_INSERT_UNAVAILABLE" };
    }
  });

  void liveStoreVersion;
  return done();
}
