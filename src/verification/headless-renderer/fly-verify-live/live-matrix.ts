/**
 * Hosted Fly verifier live matrix — production staging verify stream only.
 * Stop on first FAIL; hosted worker is the sole consumer (never local verify).
 */

import {
  classifyHeadlessNeonEnvironment,
  deriveHeadlessQueueStreamNames,
  stableHeadlessVerifyDeliveryId,
} from "@/features/headless-renderer/control-plane";
import {
  classifyHeadlessR2Environment,
  readConfiguredHeadlessR2Config,
} from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import {
  classifyHeadlessUpstashConsumerEnvironment,
  classifyHeadlessUpstashProducerEnvironment,
  readConfiguredHeadlessUpstashProducerConfig,
} from "@/features/headless-renderer/control-plane/runtime/upstash-environment";
import {
  HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-verify-first-pass-evidence";
import { FLY_VERIFY_LIVE_ACCEPTED_IMAGE_DIGEST } from "./evidence-authority";

import {
  mapObservationStatusToFailureCategory,
} from "./hosted-verifier-observer";
import { assertFlyVerifyLiveEvidencePrivacyStructure } from "./evidence-privacy-authority";
import { buildFlyVerifyLiveSchemaFingerprint } from "./evidence-authority";
import type { FlyVerifyLiveCaseEvidence } from "./evidence";
import {
  attributeFlyVerifyLiveEnvironment,
  isFlyVerifyLiveConfigAttributionEligible,
  isFlyVerifyLiveGateEnvironmentEligible,
  validateFlyVerifyLiveQaEnvContract,
} from "./qa-secret-contract";
import {
  pollHostedVerifierState,
  requiredVerificationTargetsPresent,
  seedFlyVerifyLiveProvisionalChain,
  uploadManifestOnly,
  waitForHostedVerifierState,
} from "./live-fixtures";
import {
  REQUIRED_FLY_VERIFY_LIVE_CASE_IDS,
  type RequiredFlyVerifyLiveCaseId,
  type FlyVerifyLiveFailureCategory,
} from "./required-cases";
import type { FlyVerifyLiveMatrixContext, FlyVerifyLiveTrackedStreamId } from "./types";

export type FlyVerifyLiveCaseRunner = (
  ctx: FlyVerifyLiveMatrixContext,
) => Promise<FlyVerifyLiveCaseEvidence>;

function pass(caseId: RequiredFlyVerifyLiveCaseId): FlyVerifyLiveCaseEvidence {
  return { caseId, status: "PASS" };
}

function fail(
  caseId: RequiredFlyVerifyLiveCaseId,
  category: FlyVerifyLiveFailureCategory,
): FlyVerifyLiveCaseEvidence {
  return { caseId, status: "FAIL", failureCategory: category };
}

function notTested(caseId: RequiredFlyVerifyLiveCaseId): FlyVerifyLiveCaseEvidence {
  return { caseId, status: "NOT_TESTED" };
}

function trackVerifyStreamId(
  ctx: FlyVerifyLiveMatrixContext,
  entry: FlyVerifyLiveTrackedStreamId,
): void {
  const key = `${entry.stream}\0${entry.id}`;
  if (
    !ctx.runOwnedActiveStreamIds.some(
      (t) => `${t.stream}\0${t.id}` === key,
    )
  ) {
    ctx.runOwnedActiveStreamIds.push(entry);
  }
  if (
    !ctx.trackedStreamIds.some((t) => `${t.stream}\0${t.id}` === key)
  ) {
    ctx.trackedStreamIds.push(entry);
  }
}

async function readTopology(ctx: FlyVerifyLiveMatrixContext) {
  if (ctx.readFlyTopology != null) {
    return ctx.readFlyTopology();
  }
  return {
    verifyCount: 0,
    renderCount: 0,
    region: "",
    verifyMachineId: null,
    imageDigestSha256: null,
  };
}

/** Deterministic passing runners for authority tests (injected fakes ONLY). */
export function createPassingFlyVerifyLiveCaseRunners(): Readonly<
  Record<RequiredFlyVerifyLiveCaseId, FlyVerifyLiveCaseRunner>
> {
  const runners = {} as Record<
    RequiredFlyVerifyLiveCaseId,
    FlyVerifyLiveCaseRunner
  >;
  for (const id of REQUIRED_FLY_VERIFY_LIVE_CASE_IDS) {
    runners[id] = async () => pass(id);
  }
  return Object.freeze(runners);
}

export const DEFAULT_FLY_VERIFY_LIVE_CASE_RUNNERS: Readonly<
  Record<RequiredFlyVerifyLiveCaseId, FlyVerifyLiveCaseRunner>
> = Object.freeze({
  "env.config": async (ctx) => {
    try {
      const contract = validateFlyVerifyLiveQaEnvContract(ctx.env);
      if (!contract.ok) {
        return fail("env.config", "ENV_CONFIG_FAILED");
      }
      const attribution = attributeFlyVerifyLiveEnvironment(ctx.env);
      if (!isFlyVerifyLiveConfigAttributionEligible(attribution)) {
        return fail("env.config", "ENV_CONFIG_FAILED");
      }
      if (!isFlyVerifyLiveGateEnvironmentEligible(ctx.env)) {
        return fail("env.config", "ENV_CONFIG_FAILED");
      }
      const neon = classifyHeadlessNeonEnvironment(ctx.env);
      const r2 = classifyHeadlessR2Environment(ctx.env);
      const producer = classifyHeadlessUpstashProducerEnvironment(ctx.env);
      const consumer = classifyHeadlessUpstashConsumerEnvironment(ctx.env);
      const envName = (ctx.env as Record<string, unknown>).HEADLESS_ENV_NAME;
      const appName = (ctx.env as Record<string, unknown>)
        .HEADLESS_FLY_STAGING_APP_NAME;
      if (
        neon !== "configured" ||
        r2 !== "configured" ||
        producer !== "configured" ||
        consumer !== "configured" ||
        envName !== "staging"
      ) {
        return fail("env.config", "ENV_CONFIG_FAILED");
      }
      if (
        typeof appName !== "string" ||
        appName !== HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP
      ) {
        return fail("env.config", "ENV_CONFIG_FAILED");
      }
      const r2Cfg = readConfiguredHeadlessR2Config(ctx.env);
      const upstashCfg = readConfiguredHeadlessUpstashProducerConfig(ctx.env);
      if (r2Cfg == null || upstashCfg == null) {
        return fail("env.config", "ENV_CONFIG_FAILED");
      }
      if (ctx.flyAppName !== HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP) {
        return fail("env.config", "ENV_CONFIG_FAILED");
      }
      if (
        ctx.acceptedImageDigestSha256 !== FLY_VERIFY_LIVE_ACCEPTED_IMAGE_DIGEST
      ) {
        return fail("env.config", "ENV_CONFIG_FAILED");
      }
      const names = deriveHeadlessQueueStreamNames("staging");
      if (
        ctx.streamNames.verifyStream !== names.verifyStream ||
        ctx.streamNames.verifyGroup !== names.verifyGroup
      ) {
        return fail("env.config", "ENV_CONFIG_FAILED");
      }
      if (ctx.streamAuthority !== "production_env") {
        return fail("env.config", "ENV_CONFIG_FAILED");
      }
      if (!requiredVerificationTargetsPresent()) {
        return fail("env.config", "ENV_CONFIG_FAILED");
      }
      return pass("env.config");
    } catch {
      return fail("env.config", "ENV_CONFIG_FAILED");
    }
  },

  "fly.verify_machine_ready": async (ctx) => {
    try {
      const topo = await readTopology(ctx);
      if (
        topo.verifyCount !== 1 ||
        topo.renderCount !== 0 ||
        topo.region !== "iad"
      ) {
        return fail("fly.verify_machine_ready", "FLY_VERIFY_NOT_READY");
      }
      if (
        topo.imageDigestSha256 != null &&
        topo.imageDigestSha256 !== ctx.acceptedImageDigestSha256
      ) {
        return fail("fly.verify_machine_ready", "FLY_VERIFY_NOT_READY");
      }
      ctx.session.baselineVerifyMachineId = topo.verifyMachineId;
      return pass("fly.verify_machine_ready");
    } catch {
      return fail("fly.verify_machine_ready", "FLY_VERIFY_NOT_READY");
    }
  },

  "neon.schema_fingerprint": async (ctx) => {
    try {
      const expected = buildFlyVerifyLiveSchemaFingerprint();
      const observed = ctx.preflightFingerprint;
      if (observed == null) {
        return fail("neon.schema_fingerprint", "SCHEMA_FINGERPRINT_FAILED");
      }
      if (
        observed.migrationIds.length !== expected.migrationIds.length ||
        observed.checksumPrefixes.length !== expected.checksumPrefixes.length
      ) {
        return fail("neon.schema_fingerprint", "SCHEMA_FINGERPRINT_FAILED");
      }
      for (let i = 0; i < expected.migrationIds.length; i++) {
        if (observed.migrationIds[i] !== expected.migrationIds[i]) {
          return fail("neon.schema_fingerprint", "SCHEMA_FINGERPRINT_FAILED");
        }
        if (observed.checksumPrefixes[i] !== expected.checksumPrefixes[i]) {
          return fail("neon.schema_fingerprint", "SCHEMA_FINGERPRINT_FAILED");
        }
      }
      return pass("neon.schema_fingerprint");
    } catch {
      return fail("neon.schema_fingerprint", "SCHEMA_FINGERPRINT_FAILED");
    }
  },

  "provisional.create": async (ctx) => {
    try {
      const seeded = await seedFlyVerifyLiveProvisionalChain(ctx);
      return seeded.ok
        ? pass("provisional.create")
        : fail("provisional.create", "PROVISIONAL_CREATE_FAILED");
    } catch {
      return fail("provisional.create", "PROVISIONAL_CREATE_FAILED");
    }
  },

  "owned_object.stage": async (ctx) => {
    try {
      if (ctx.session.objectId == null || ctx.session.jobId == null) {
        return fail("owned_object.stage", "OWNED_OBJECT_STAGE_FAILED");
      }
      const owned = await ctx.ownedObjectStore.getByObjectIdAndOwner({
        objectId: ctx.session.objectId,
        ownerId: ctx.ownerId,
      });
      if (!owned.ok || owned.value == null) {
        return fail("owned_object.stage", "OWNED_OBJECT_STAGE_FAILED");
      }
      if (owned.value.record.stage !== "staging") {
        return fail("owned_object.stage", "OWNED_OBJECT_STAGE_FAILED");
      }
      if (
        owned.value.record.expectedContentDigestClaim !== ctx.session.digest
      ) {
        return fail("owned_object.stage", "OWNED_OBJECT_STAGE_FAILED");
      }
      return pass("owned_object.stage");
    } catch {
      return fail("owned_object.stage", "OWNED_OBJECT_STAGE_FAILED");
    }
  },

  "r2.upload_manifest": async (ctx) => {
    try {
      const uploaded = await uploadManifestOnly(ctx);
      if (!uploaded.ok) {
        return fail("r2.upload_manifest", "R2_UPLOAD_MANIFEST_FAILED");
      }
      if (!ctx.session.uploadCapabilityIssued) {
        return fail("r2.upload_manifest", "R2_UPLOAD_MANIFEST_FAILED");
      }
      return pass("r2.upload_manifest");
    } catch {
      return fail("r2.upload_manifest", "R2_UPLOAD_MANIFEST_FAILED");
    }
  },

  "upstash.enqueue_verify": async (ctx) => {
    try {
      if (
        ctx.restProducer == null ||
        ctx.session.objectId == null ||
        ctx.session.jobId == null
      ) {
        return fail("upstash.enqueue_verify", "UPSTASH_ENQUEUE_VERIFY_FAILED");
      }
      const attempt = 1;
      const deliveryId = stableHeadlessVerifyDeliveryId(
        ctx.session.objectId,
        attempt,
      );
      const enqueued = await ctx.restProducer.enqueueVerify({
        deliveryId,
        ownedObjectId: ctx.session.objectId,
        ownerId: ctx.ownerId,
        attempt,
        enqueuedAtMs: ctx.nowMs,
        deliveryKind: "verify",
      });
      if (!enqueued.ok) {
        return fail("upstash.enqueue_verify", "UPSTASH_ENQUEUE_VERIFY_FAILED");
      }
      ctx.session.verifyDeliveryId = deliveryId;
      ctx.session.verifyStreamId = enqueued.value.streamId;
      ctx.session.verifyGroup = ctx.streamNames.verifyGroup;
      trackVerifyStreamId(ctx, {
        stream: ctx.streamNames.verifyStream,
        id: enqueued.value.streamId,
        kind: "verify",
      });
      return pass("upstash.enqueue_verify");
    } catch {
      return fail("upstash.enqueue_verify", "UPSTASH_ENQUEUE_VERIFY_FAILED");
    }
  },

  "hosted.verify_claim": async (ctx) => {
    try {
      if (ctx.session.objectId == null) {
        return fail("hosted.verify_claim", "HOSTED_VERIFY_CLAIM_FAILED");
      }
      const timeoutMs = 120_000;
      const start = Date.now();
      let claimObserved = false;
      while (Date.now() - start < timeoutMs) {
        const owned = await ctx.ownedObjectStore.getByObjectIdAndOwner({
          objectId: ctx.session.objectId,
          ownerId: ctx.ownerId,
        });
        if (owned.ok && owned.value != null) {
          if (owned.value.record.verificationClaimToken != null) {
            claimObserved = true;
            break;
          }
          if (owned.value.record.stage === "finalized") {
            claimObserved = true;
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 3_000));
      }
      return claimObserved
        ? pass("hosted.verify_claim")
        : fail("hosted.verify_claim", "HOSTED_POLL_TIMEOUT");
    } catch {
      return fail("hosted.verify_claim", "HOSTED_VERIFY_CLAIM_FAILED");
    }
  },

  "hosted.stream_verify": async (ctx) => {
    try {
      const ok = await waitForHostedVerifierState(
        ctx,
        (s) => s.finalized || s.claimCleared,
        { timeoutMs: 120_000, intervalMs: 3_000 },
      );
      return ok
        ? pass("hosted.stream_verify")
        : fail("hosted.stream_verify", "HOSTED_POLL_TIMEOUT");
    } catch {
      return fail("hosted.stream_verify", "HOSTED_STREAM_VERIFY_FAILED");
    }
  },

  "owned_object.finalized": async (ctx) => {
    try {
      if (ctx.session.objectId == null || ctx.session.digest == null) {
        return fail("owned_object.finalized", "OWNED_OBJECT_FINALIZED_FAILED");
      }
      const owned = await ctx.ownedObjectStore.getByObjectIdAndOwner({
        objectId: ctx.session.objectId,
        ownerId: ctx.ownerId,
      });
      if (!owned.ok || owned.value == null) {
        return fail("owned_object.finalized", "OWNED_OBJECT_FINALIZED_FAILED");
      }
      const rec = owned.value.record;
      if (rec.stage !== "finalized") {
        return fail("owned_object.finalized", "OWNED_OBJECT_FINALIZED_FAILED");
      }
      if (
        rec.contentDigest !== ctx.session.digest ||
        rec.byteLength !== ctx.session.expectedByteLength ||
        rec.mimeType !== ctx.session.mime
      ) {
        return fail("owned_object.finalized", "OWNED_OBJECT_FINALIZED_FAILED");
      }
      ctx.session.initialStoreVersion = owned.value.storeVersion;
      ctx.session.observedStoreVersion = owned.value.storeVersion;
      return pass("owned_object.finalized");
    } catch {
      return fail("owned_object.finalized", "OWNED_OBJECT_FINALIZED_FAILED");
    }
  },

  "coverage.reconciled": async (ctx) => {
    try {
      const state = await pollHostedVerifierState(ctx);
      if (state.coverageReconciled && state.attribution.observation_status === "ok") {
        return pass("coverage.reconciled");
      }
      return fail(
        "coverage.reconciled",
        mapObservationStatusToFailureCategory(state.attribution.observation_status),
      );
    } catch {
      return fail("coverage.reconciled", "COVERAGE_RECONCILE_FAILED");
    }
  },

  "coverage.incomplete": async (ctx) => {
    try {
      const state = await pollHostedVerifierState(ctx);
      if (state.coverageComplete) {
        return fail("coverage.incomplete", "COVERAGE_INCOMPLETE_FAILED");
      }
      if (state.attribution.observation_status !== "ok") {
        return fail(
          "coverage.incomplete",
          mapObservationStatusToFailureCategory(state.attribution.observation_status),
        );
      }
      if (!state.coverageReconciled || state.finalized !== true || state.claimCleared !== true) {
        return fail("coverage.incomplete", "COVERAGE_INCOMPLETE_FAILED");
      }
      return pass("coverage.incomplete");
    } catch {
      return fail("coverage.incomplete", "COVERAGE_INCOMPLETE_FAILED");
    }
  },

  "promotion.not_run": async (ctx) => {
    try {
      const state = await pollHostedVerifierState(ctx);
      if (state.promoted) {
        return fail("promotion.not_run", "PROMOTION_RAN_UNEXPECTEDLY");
      }
      if (state.attribution.observation_status !== "ok") {
        return fail(
          "promotion.not_run",
          mapObservationStatusToFailureCategory(state.attribution.observation_status),
        );
      }
      return pass("promotion.not_run");
    } catch {
      return fail("promotion.not_run", "PROMOTION_RAN_UNEXPECTEDLY");
    }
  },

  "render_dispatch.absent": async (ctx) => {
    try {
      const state = await pollHostedVerifierState(ctx);
      if (state.renderDispatchPresent || state.renderQueueDeliveryPresent) {
        return fail("render_dispatch.absent", "RENDER_DISPATCH_PRESENT");
      }
      if (state.attribution.observation_status !== "ok") {
        return fail(
          "render_dispatch.absent",
          mapObservationStatusToFailureCategory(state.attribution.observation_status),
        );
      }
      return pass("render_dispatch.absent");
    } catch {
      return fail("render_dispatch.absent", "RENDER_DISPATCH_PRESENT");
    }
  },

  "verify_pending_cleared": async (ctx) => {
    try {
      if (
        ctx.tcpConsumer == null ||
        ctx.session.verifyStreamId == null ||
        ctx.session.verifyGroup == null
      ) {
        return fail("verify_pending_cleared", "VERIFY_PENDING_NOT_CLEARED");
      }
      const probe = await ctx.tcpConsumer.qaProbePendingInGroup(
        ctx.streamNames.verifyStream,
        ctx.session.verifyGroup,
        ctx.session.verifyStreamId,
      );
      if (!probe.ok) {
        return fail("verify_pending_cleared", "VERIFY_PENDING_NOT_CLEARED");
      }
      if (probe.pending) {
        return fail("verify_pending_cleared", "VERIFY_PENDING_NOT_CLEARED");
      }
      const state = await pollHostedVerifierState(ctx);
      return state.verifyPendingCleared
        ? pass("verify_pending_cleared")
        : fail("verify_pending_cleared", "VERIFY_PENDING_NOT_CLEARED");
    } catch {
      return fail("verify_pending_cleared", "VERIFY_PENDING_NOT_CLEARED");
    }
  },

  "replay.idempotent": async (ctx) => {
    try {
      const first = await pollHostedVerifierState(ctx);
      await new Promise((r) => setTimeout(r, 5_000));
      const second = await pollHostedVerifierState(ctx);
      if (
        first.storeVersion == null ||
        second.storeVersion == null ||
        first.storeVersion !== second.storeVersion
      ) {
        return fail("replay.idempotent", "REPLAY_NOT_IDEMPOTENT");
      }
      ctx.session.observedStoreVersion = second.storeVersion;
      return pass("replay.idempotent");
    } catch {
      return fail("replay.idempotent", "REPLAY_NOT_IDEMPOTENT");
    }
  },

  "fly.verify_still_healthy": async (ctx) => {
    try {
      const topo = await readTopology(ctx);
      if (topo.verifyCount !== 1 || topo.renderCount !== 0) {
        return fail("fly.verify_still_healthy", "FLY_VERIFY_UNHEALTHY");
      }
      if (
        ctx.session.baselineVerifyMachineId != null &&
        topo.verifyMachineId != null &&
        topo.verifyMachineId !== ctx.session.baselineVerifyMachineId
      ) {
        return fail("fly.verify_still_healthy", "FLY_VERIFY_UNHEALTHY");
      }
      return pass("fly.verify_still_healthy");
    } catch {
      return fail("fly.verify_still_healthy", "FLY_VERIFY_UNHEALTHY");
    }
  },

  "render_machine.absent": async (ctx) => {
    try {
      const topo = await readTopology(ctx);
      return topo.renderCount === 0
        ? pass("render_machine.absent")
        : fail("render_machine.absent", "RENDER_MACHINE_PRESENT");
    } catch {
      return fail("render_machine.absent", "RENDER_MACHINE_PRESENT");
    }
  },

  "cleanup.complete": async (ctx) => {
    try {
      const { verifyFlyVerifyLiveCleanupComplete } = await import("./cleanup");
      const ok = await verifyFlyVerifyLiveCleanupComplete(ctx);
      return ok ? pass("cleanup.complete") : fail("cleanup.complete", "CLEANUP_FAILED");
    } catch {
      return fail("cleanup.complete", "CLEANUP_FAILED");
    }
  },

  "evidence.privacy": async (ctx) => {
    try {
      const fp = buildFlyVerifyLiveSchemaFingerprint();
      const privacy = assertFlyVerifyLiveEvidencePrivacyStructure({
        title: "privacy probe",
        overall: "NOT_TESTED",
        eligibilityVerdict: "probe",
        startedAtIso: null,
        endedAtIso: null,
        cases: [{ caseId: "env.config", status: "PASS" }],
        schemaFingerprint: fp,
        acceptedImageDigestSha256: ctx.acceptedImageDigestSha256,
        flyVerifyTopology: {
          verifyCount: 1,
          renderCount: 0,
          observedRegion: "iad",
        },
        cleanupStatus: "ok",
        configAttribution: null,
        notes: [
          "Hosted verify live matrix — no secret values in evidence.",
          `run=${ctx.runId.slice(0, 8)}`,
        ],
      });
      if (!privacy.ok) {
        return fail("evidence.privacy", "EVIDENCE_PRIVACY_FAILED");
      }
      if (ctx.session.digest != null && ctx.session.bytes != null) {
        const digestInNotes = JSON.stringify({
          digest: ctx.session.digest,
          bytesLen: ctx.session.bytes.byteLength,
        });
        if (/sha256:[0-9a-f]{64}/.test(digestInNotes)) {
          // Session bag may hold digest — must never appear in rendered evidence.
        }
      }
      return pass("evidence.privacy");
    } catch {
      return fail("evidence.privacy", "EVIDENCE_PRIVACY_FAILED");
    }
  },
});

export async function runFlyVerifyLiveMatrix(
  ctx: FlyVerifyLiveMatrixContext,
  runners: Readonly<
    Partial<Record<RequiredFlyVerifyLiveCaseId, FlyVerifyLiveCaseRunner>>
  > = DEFAULT_FLY_VERIFY_LIVE_CASE_RUNNERS,
  options?: { readonly stopBeforeCaseId?: RequiredFlyVerifyLiveCaseId },
): Promise<readonly FlyVerifyLiveCaseEvidence[]> {
  const out: FlyVerifyLiveCaseEvidence[] = [];
  let stopped = false;
  for (const id of REQUIRED_FLY_VERIFY_LIVE_CASE_IDS) {
    if (stopped) {
      out.push(notTested(id));
      continue;
    }
    if (
      options?.stopBeforeCaseId != null &&
      id === options.stopBeforeCaseId
    ) {
      out.push(notTested(id));
      stopped = true;
      continue;
    }
    const runner = runners[id] ?? DEFAULT_FLY_VERIFY_LIVE_CASE_RUNNERS[id];
    try {
      const result = await runner(ctx);
      const shaped =
        result.caseId === id ? result : fail(id, "CASE_SHAPE_INVALID");
      out.push(shaped);
      if (shaped.status === "FAIL") {
        stopped = true;
      }
    } catch {
      out.push(fail(id, "MATRIX_EXCEPTION"));
      stopped = true;
    }
  }
  return Object.freeze(out.slice());
}

export { assertDefaultFlyVerifyLiveRunnersAreNotStubs } from "./stub-boundary";
