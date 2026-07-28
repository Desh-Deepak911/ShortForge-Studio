/**
 * Sprint 11E Phase 2B.2 — Neon job store adapter parity.
 * Run: npm run test:headless-neon-job-store
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
  type ExportManifestV4,
} from "@/features/export/domain";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";
import {
  appendProvisionalStagingObjectRefs,
  createProvisionalMaterializingRecord,
  updateProvisionalVerificationCoverage,
  type HeadlessProvisionalStoredJobRecord,
  type HeadlessProvisionalStoreWrite,
} from "@/features/headless-renderer/control-plane";
import {
  composeTestHeadlessControlPlane,
  InMemoryHeadlessSqlFixture,
  NeonHeadlessJobStoreAdapter,
  seedOwnedManifestAndBundle,
} from "@/features/headless-renderer/control-plane/testing";
import {
  buildHeadlessAuthorityFingerprint,
  createAcceptedHeadlessRenderJob,
  extractRequiredHeadlessSourceSlots,
  finalizeHeadlessRenderJobRequest,
  headlessSourceSlotKey,
} from "@/features/headless-renderer/domain";
import { applyHeadlessJobTransition } from "@/features/headless-renderer/domain/headless-job-lifecycle";

const CLOCK = 1_700_000_000_000;

const CAPABLE_ENV: Partial<ExportEnvironmentSnapshot> = {
  browserName: "chrome",
  supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true,
  supportsMediaRecorder: true,
  supportsRequestVideoFrameCallback: true,
  supportsWebAssembly: true,
  serverRendererAvailable: false,
  ffmpegRuntimePoisoned: false,
  estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
  mp4EncoderAvailable: true,
};

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fixStory(): FootieScript {
  return syncFootieScript({
    title: "Neon Store Verify",
    narration: "Hello world narration for export.",
    totalDuration: 6,
    voiceoverUrl: "https://example.com/voice.mp3",
    voiceoverDurationMs: 6000,
    scenes: [
      {
        id: "scene-1",
        start: 0,
        end: 3,
        duration: 3,
        startMs: 0,
        endMs: 3000,
        durationMs: 3000,
        subtitle: "Hello",
        captionMode: "generated",
        media: {
          type: "image",
          url: "https://example.com/a.jpg",
          source: "upload",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        },
      },
      {
        id: "scene-2",
        start: 3,
        end: 6,
        duration: 3,
        startMs: 3000,
        endMs: 6000,
        durationMs: 3000,
        subtitle: "World",
        captionMode: "generated",
        media: {
          type: "image",
          url: "https://example.com/b.jpg",
          source: "upload",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        },
      },
    ],
  });
}

function buildV3Manifest(): ExportManifestV4 {
  const manifest = buildExportManifest({
    story: fixStory(),
    environment: CAPABLE_ENV,
    audioMode: "with-voice",
  });
  assert.equal(manifest.version, 4);
  return manifest;
}

function buildIdempotencyKey(
  ownerId: string,
  projectId: string,
  creatorIdempotencyKey: string,
): string {
  const built = buildHeadlessAuthorityFingerprint("hid", {
    version: 1,
    kind: "control-plane-idempotency",
    ownership: { ownerId, projectId },
    idempotencyKey: creatorIdempotencyKey,
  });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("idempotency build failed");
  return built.fingerprint;
}

async function buildDraft(input?: {
  creatorKey?: string;
  emptyStaging?: boolean;
}) {
  const ownerId = "owner-neon-1";
  const manifest = buildV3Manifest();
  const projectId = manifest.project.projectId;
  const stack = composeTestHeadlessControlPlane({
    principal: { ownerId, sessionId: "sess-1" },
    authorizedProjectIds: [projectId],
    nowMs: () => CLOCK,
  });
  const seeded = await seedOwnedManifestAndBundle({
    storage: stack.storage,
    ownerId,
    projectId,
    manifest,
    nowMs: CLOCK,
  });
  assert.equal(seeded.ok, true);
  if (!seeded.ok) throw new Error("seed failed");

  const slots = extractRequiredHeadlessSourceSlots(manifest);
  const expectedSlotClaims = seeded.value.bundle.assets.map((asset) => {
    const slot = slots.find(
      (s) =>
        s.role === asset.sourceIdentity.role &&
        s.sceneId === asset.sourceIdentity.sceneId &&
        s.mediaItemId === asset.sourceIdentity.mediaItemId &&
        s.sourceDigest === asset.sourceIdentity.sourceDigest,
    );
    assert.ok(slot);
    return {
      slotKey: headlessSourceSlotKey(slot!),
      role: slot!.role,
      sceneId: slot!.sceneId,
      mediaItemId: slot!.mediaItemId,
      sourceDigestClaim: slot!.sourceDigest,
      contentDigestClaim: asset.contentDigest,
      byteLengthClaim: asset.byteLength,
      mimeTypeClaim: asset.mimeType,
    };
  });

  const fullStaging = [
    {
      purpose: "manifest" as const,
      slotKey: null,
      locator: seeded.value.manifestLocator,
      contentDigestClaim: seeded.value.manifestPayloadDigest,
      byteLengthClaim: 100,
      mimeTypeClaim: "application/json",
    },
    {
      purpose: "asset_bundle_record" as const,
      slotKey: null,
      locator: seeded.value.bundleLocator,
      contentDigestClaim: "sha256:" + "cc".repeat(32),
      byteLengthClaim: 200,
      mimeTypeClaim: "application/json",
    },
    ...seeded.value.bundle.assets.map((asset) => ({
      purpose: "asset_bytes" as const,
      slotKey: headlessSourceSlotKey({
        role: asset.sourceIdentity.role,
        sceneId: asset.sourceIdentity.sceneId,
        mediaItemId: asset.sourceIdentity.mediaItemId,
        sourceDigest: asset.sourceIdentity.sourceDigest,
      }),
      locator: asset.storageLocator,
      contentDigestClaim: asset.contentDigest,
      byteLengthClaim: asset.byteLength,
      mimeTypeClaim: asset.mimeType,
    })),
  ];

  const creatorKey = input?.creatorKey ?? `creator-${randomUUID()}`;
  const idempotencyAuthorityKey = buildIdempotencyKey(
    ownerId,
    projectId,
    creatorKey,
  );
  const materialize = createProvisionalMaterializingRecord({
    jobId: `job_${randomUUID()}`,
    ownerId,
    projectId,
    createdAtMs: CLOCK,
    updatedAtMs: CLOCK,
    idempotencyAuthorityKey,
    operationId: `op_${randomUUID()}`,
    creatorIdempotencyKey: creatorKey,
    requestedRendererProfile: {
      resolution: manifest.output.resolution,
      format: manifest.output.format,
      fps: 30,
      quality: manifest.output.quality,
    },
    requestedRendererBuildId: "renderer-build-1",
    snapshotClaim: {
      manifestPayloadDigestClaim: seeded.value.manifestPayloadDigest,
      assetBundleFingerprintClaim: seeded.value.bundle.fingerprint,
      expectedSlotClaims,
    },
    stagingObjectRefs: input?.emptyStaging ? [] : fullStaging,
    expiresAtMs: CLOCK + 60 * 60 * 1000,
  });
  assert.equal(materialize.ok, true, materialize.ok ? "" : materialize.message);
  if (!materialize.ok) throw new Error(materialize.message);

  return {
    ownerId,
    projectId,
    manifest,
    seeded: seeded.value,
    draft: materialize.record,
    idempotencyAuthorityKey,
    fullStaging,
  };
}

async function casCoverage(
  store: NeonHeadlessJobStoreAdapter,
  record: HeadlessProvisionalStoredJobRecord,
  verifiedTargets: readonly string[],
) {
  const requiredTargets = [...record.verificationCoverage.requiredTargets];
  const complete =
    requiredTargets.length === verifiedTargets.length &&
    requiredTargets.every((t) => verifiedTargets.includes(t));
  const next = updateProvisionalVerificationCoverage(
    record,
    { requiredTargets, verifiedTargets: [...verifiedTargets], complete },
    "verify-claim-1",
    CLOCK + 1000,
    CLOCK + 2000,
  );
  assert.equal(next.ok, true, next.ok ? "" : next.message);
  if (!next.ok) throw new Error(next.message);
  const cas = await store.compareAndSetProvisional({
    jobId: record.jobId,
    ownerId: record.ownerId,
    expectedStoreVersion: record.storeVersion,
    next: next.record,
  });
  assert.equal(cas.ok && cas.value.kind === "updated", true);
  if (!cas.ok || cas.value.kind !== "updated") throw new Error("cas");
  return cas.value.record as HeadlessProvisionalStoredJobRecord;
}

function buildCanonicalPair(
  manifest: ExportManifestV4,
  bundle: (Awaited<ReturnType<typeof buildDraft>>)["seeded"]["bundle"],
  record: HeadlessProvisionalStoredJobRecord,
) {
  const requestResult = finalizeHeadlessRenderJobRequest({
    ownership: { ownerId: record.ownerId, projectId: record.projectId },
    manifest,
    assetBundle: bundle,
    rendererProfile: record.requestedRendererProfile,
    rendererBuildId: record.requestedRendererBuildId,
    idempotencyKey: record.creatorIdempotencyKey,
  });
  assert.equal(requestResult.ok, true);
  if (!requestResult.ok) throw new Error("request failed");
  const accepted = createAcceptedHeadlessRenderJob({
    jobId: record.jobId,
    requestValue: requestResult.request,
    createdAtMs: record.createdAtMs,
  });
  assert.equal(accepted.ok, true);
  if (!accepted.ok) throw new Error("accept failed");
  // Promote expects queued/created/materializing — transition accepted job to queued.
  const queued = applyHeadlessJobTransition({
    jobValue: accepted.job,
    requestValue: accepted.request,
    toState: "queued",
    attempt: accepted.job.attempt,
    updatedAtMs: record.updatedAtMs + 1,
  });
  assert.equal(queued.ok, true);
  if (!queued.ok) throw new Error("queue transition failed");
  return { job: queued.job, request: accepted.request };
}

async function main() {
  console.log("\nSprint 11E Phase 2B.2 — Neon job store\n");

  await test("provisional create / replay / semantic conflict", async () => {
    const store = new NeonHeadlessJobStoreAdapter(new InMemoryHeadlessSqlFixture());
    const ctx = await buildDraft();
    const created = await store.createProvisionalIfAbsent({
      idempotencyAuthorityKey: ctx.idempotencyAuthorityKey,
      record: ctx.draft,
    });
    assert.equal(created.ok && created.value.kind === "created", true);

    const replay = await store.createProvisionalIfAbsent({
      idempotencyAuthorityKey: ctx.idempotencyAuthorityKey,
      record: ctx.draft,
    });
    assert.equal(replay.ok && replay.value.kind === "existing", true);

    const other = await buildDraft({ creatorKey: ctx.draft.creatorIdempotencyKey });
    const forged: HeadlessProvisionalStoreWrite = {
      ...other.draft,
      idempotencyAuthorityKey: ctx.idempotencyAuthorityKey,
      jobId: `job_${randomUUID()}`,
    };
    const conflict = await store.createProvisionalIfAbsent({
      idempotencyAuthorityKey: ctx.idempotencyAuthorityKey,
      record: forged,
    });
    if (conflict.ok) {
      assert.equal(conflict.value.kind, "conflict");
    } else {
      assert.equal(conflict.issues[0]?.code, "JOB_STORE_COHERENCE_REJECTED");
    }
  });

  await test("empty staging accepted; later append accepted", async () => {
    const store = new NeonHeadlessJobStoreAdapter(new InMemoryHeadlessSqlFixture());
    const ctx = await buildDraft({ emptyStaging: true });
    const created = await store.createProvisionalIfAbsent({
      idempotencyAuthorityKey: ctx.idempotencyAuthorityKey,
      record: ctx.draft,
    });
    assert.equal(created.ok && created.value.kind === "created", true);
    if (!created.ok || created.value.kind !== "created") return;
    const record = created.value.record as HeadlessProvisionalStoredJobRecord;

    const appended = appendProvisionalStagingObjectRefs(
      record,
      ctx.fullStaging,
      CLOCK + 500,
    );
    assert.equal(appended.ok, true, appended.ok ? "" : appended.message);
    if (!appended.ok) return;
    const cas = await store.compareAndSetProvisional({
      jobId: record.jobId,
      ownerId: record.ownerId,
      expectedStoreVersion: record.storeVersion,
      next: appended.record,
    });
    assert.equal(cas.ok && cas.value.kind === "updated", true);
  });

  await test("wrong owner / stale CAS / incomplete coverage reject promote", async () => {
    const store = new NeonHeadlessJobStoreAdapter(new InMemoryHeadlessSqlFixture());
    const ctx = await buildDraft();
    const created = await store.createProvisionalIfAbsent({
      idempotencyAuthorityKey: ctx.idempotencyAuthorityKey,
      record: ctx.draft,
    });
    assert.equal(created.ok && created.value.kind === "created", true);
    if (!created.ok || created.value.kind !== "created") return;
    const record = created.value.record as HeadlessProvisionalStoredJobRecord;

    const missing = await store.getByJobIdAndOwner(record.jobId, "other");
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.issues[0]?.code, "JOB_NOT_FOUND");

    const next = updateProvisionalVerificationCoverage(
      record,
      {
        requiredTargets: [...record.verificationCoverage.requiredTargets],
        verifiedTargets: [record.verificationCoverage.requiredTargets[0]!],
        complete: false,
      },
      "verify-claim-1",
      CLOCK + 1000,
      CLOCK + 2000,
    );
    assert.equal(next.ok, true);
    if (!next.ok) return;
    const stale = await store.compareAndSetProvisional({
      jobId: record.jobId,
      ownerId: record.ownerId,
      expectedStoreVersion: 999,
      next: next.record,
    });
    assert.equal(stale.ok && stale.value.kind === "stale", true);

    const pair = buildCanonicalPair(ctx.manifest, ctx.seeded.bundle, record);
    const rejected = await store.promoteProvisionalToCanonical({
      jobId: record.jobId,
      ownerId: record.ownerId,
      expectedStoreVersion: record.storeVersion,
      expectedOperationId: record.operationId,
      canonicalJob: pair.job,
      canonicalRequest: pair.request,
    });
    assert.equal(rejected.ok && rejected.value.kind === "rejected", true);
  });

  await test("promotion + already-promoted replay + forged reject", async () => {
    const store = new NeonHeadlessJobStoreAdapter(new InMemoryHeadlessSqlFixture());
    const ctx = await buildDraft();
    const created = await store.createProvisionalIfAbsent({
      idempotencyAuthorityKey: ctx.idempotencyAuthorityKey,
      record: ctx.draft,
    });
    assert.equal(created.ok && created.value.kind === "created", true);
    if (!created.ok || created.value.kind !== "created") return;
    let record = created.value.record as HeadlessProvisionalStoredJobRecord;
    record = await casCoverage(
      store,
      record,
      record.verificationCoverage.requiredTargets,
    );
    const pair = buildCanonicalPair(ctx.manifest, ctx.seeded.bundle, record);
    const promoted = await store.promoteProvisionalToCanonical({
      jobId: record.jobId,
      ownerId: record.ownerId,
      expectedStoreVersion: record.storeVersion,
      expectedOperationId: record.operationId,
      canonicalJob: pair.job,
      canonicalRequest: pair.request,
    });
    assert.equal(promoted.ok && promoted.value.kind === "updated", true);
    if (!promoted.ok || promoted.value.kind !== "updated") return;
    assert.equal(promoted.value.record.operationId, record.operationId);

    const replay = await store.promoteProvisionalToCanonical({
      jobId: record.jobId,
      ownerId: record.ownerId,
      expectedStoreVersion: record.storeVersion,
      expectedOperationId: record.operationId,
      canonicalJob: pair.job,
      canonicalRequest: pair.request,
    });
    assert.equal(replay.ok && replay.value.kind === "already_promoted", true);

    const forged = await store.promoteProvisionalToCanonical({
      jobId: record.jobId,
      ownerId: record.ownerId,
      expectedStoreVersion: record.storeVersion,
      expectedOperationId: "forged-op",
      canonicalJob: pair.job,
      canonicalRequest: pair.request,
    });
    assert.equal(forged.ok && forged.value.kind === "rejected", true);
  });

  await test("canonical claim race, live/expired recovery, queue listing", async () => {
    const store = new NeonHeadlessJobStoreAdapter(new InMemoryHeadlessSqlFixture());
    const ctx = await buildDraft();
    const created = await store.createProvisionalIfAbsent({
      idempotencyAuthorityKey: ctx.idempotencyAuthorityKey,
      record: ctx.draft,
    });
    assert.equal(created.ok && created.value.kind === "created", true);
    if (!created.ok || created.value.kind !== "created") return;
    let record = created.value.record as HeadlessProvisionalStoredJobRecord;
    record = await casCoverage(
      store,
      record,
      record.verificationCoverage.requiredTargets,
    );
    const pair = buildCanonicalPair(ctx.manifest, ctx.seeded.bundle, record);
    const promoted = await store.promoteProvisionalToCanonical({
      jobId: record.jobId,
      ownerId: record.ownerId,
      expectedStoreVersion: record.storeVersion,
      expectedOperationId: record.operationId,
      canonicalJob: pair.job,
      canonicalRequest: pair.request,
    });
    assert.equal(promoted.ok && promoted.value.kind === "updated", true);
    if (!promoted.ok || promoted.value.kind !== "updated") return;
    const canonical = promoted.value.record;

    const listed = await store.listCanonicalQueuedJobIds(10);
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.ok(listed.value.includes(canonical.jobId));

    const claim1 = await store.claimQueuedJob({
      jobId: canonical.jobId,
      ownerId: canonical.ownerId,
      expectedStoreVersion: canonical.storeVersion,
      claimToken: "claim_a",
      nowMs: CLOCK + 10,
    });
    assert.equal(claim1.ok && claim1.value.kind === "claimed", true);
    const claim2 = await store.claimQueuedJob({
      jobId: canonical.jobId,
      ownerId: canonical.ownerId,
      expectedStoreVersion: canonical.storeVersion,
      claimToken: "claim_b",
      nowMs: CLOCK + 11,
    });
    assert.equal(claim2.ok && claim2.value.kind === "rejected", true);
    const listedAfter = await store.listCanonicalQueuedJobIds(10);
    assert.equal(listedAfter.ok, true);
    if (!listedAfter.ok) return;
    assert.equal(listedAfter.value.includes(canonical.jobId), false);

    if (!claim1.ok || claim1.value.kind !== "claimed") return;
    const claimed = claim1.value.record;
    const live = await store.recoverExpiredClaim({
      jobId: claimed.jobId,
      ownerId: claimed.ownerId,
      nowMs: CLOCK + 20,
      leaseMs: 60_000,
    });
    assert.equal(live.ok && live.value.kind === "rejected_live_claim", true);
    const expired = await store.recoverExpiredClaim({
      jobId: claimed.jobId,
      ownerId: claimed.ownerId,
      nowMs: (claimed.claimedAtMs ?? 0) + 60_001,
      leaseMs: 60_000,
    });
    assert.equal(expired.ok && expired.value.kind === "failed_expired", true);
  });

  await test("canonical create/replay/conflict + terminal lock + freeze", async () => {
    const store = new NeonHeadlessJobStoreAdapter(new InMemoryHeadlessSqlFixture());
    const ctx = await buildDraft();
    const requestResult = finalizeHeadlessRenderJobRequest({
      ownership: { ownerId: ctx.ownerId, projectId: ctx.projectId },
      manifest: ctx.manifest,
      assetBundle: ctx.seeded.bundle,
      rendererProfile: ctx.draft.requestedRendererProfile,
      rendererBuildId: ctx.draft.requestedRendererBuildId,
      idempotencyKey: ctx.draft.creatorIdempotencyKey,
    });
    assert.equal(requestResult.ok, true);
    if (!requestResult.ok) return;
    const accepted = createAcceptedHeadlessRenderJob({
      jobId: `job_${randomUUID()}`,
      requestValue: requestResult.request,
      createdAtMs: CLOCK,
    });
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    const queued = applyHeadlessJobTransition({
      jobValue: accepted.job,
      requestValue: accepted.request,
      toState: "queued",
      attempt: accepted.job.attempt,
      updatedAtMs: CLOCK + 1,
    });
    assert.equal(queued.ok, true);
    if (!queued.ok) return;

    const opId = `op_canon_${randomUUID()}`;
    const created = await store.createIfAbsent({
      idempotencyAuthorityKey: ctx.idempotencyAuthorityKey,
      record: {
        job: queued.job,
        request: accepted.request,
        idempotencyAuthorityKey: ctx.idempotencyAuthorityKey,
        operationId: opId,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: null,
      },
    });
    assert.equal(created.ok && created.value.kind === "created", true);
    if (!created.ok || created.value.kind !== "created") return;

    const replay = await store.createIfAbsent({
      idempotencyAuthorityKey: ctx.idempotencyAuthorityKey,
      record: {
        job: queued.job,
        request: accepted.request,
        idempotencyAuthorityKey: ctx.idempotencyAuthorityKey,
        operationId: opId,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: null,
      },
    });
    assert.equal(replay.ok && replay.value.kind === "existing", true);

    try {
      (created.value.record.canonicalJob as { state: string }).state = "succeeded";
      assert.fail("expected freeze");
    } catch {
      // frozen
    }

    const claimed = await store.claimQueuedJob({
      jobId: created.value.record.jobId,
      ownerId: created.value.record.ownerId,
      expectedStoreVersion: created.value.record.storeVersion,
      claimToken: "claim_t",
      nowMs: CLOCK,
    });
    assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
    if (!claimed.ok || claimed.value.kind !== "claimed") return;

    const failed = applyHeadlessJobTransition({
      jobValue: claimed.value.record.canonicalJob,
      requestValue: claimed.value.record.canonicalRequest,
      toState: "failed",
      attempt: claimed.value.record.canonicalJob!.attempt,
      updatedAtMs: CLOCK + 2,
      terminalReason: { reasonId: "WORKER_FAILED", retryable: false },
    });
    assert.equal(failed.ok, true);
    if (!failed.ok) return;
    const toFail = await store.compareAndSetTransition({
      jobId: claimed.value.record.jobId,
      ownerId: claimed.value.record.ownerId,
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
    assert.equal(toFail.ok && toFail.value.kind === "updated", true);
    if (!toFail.ok || toFail.value.kind !== "updated") return;

    const locked = await store.compareAndSetTransition({
      jobId: toFail.value.record.jobId,
      ownerId: toFail.value.record.ownerId,
      expectedStoreVersion: toFail.value.record.storeVersion,
      next: {
        job: toFail.value.record.canonicalJob,
        request: toFail.value.record.canonicalRequest,
        idempotencyAuthorityKey: toFail.value.record.idempotencyAuthorityKey,
        operationId: toFail.value.record.operationId,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: null,
      },
    });
    assert.equal(locked.ok && locked.value.kind === "terminal_locked", true);
  });

  await test("malformed JSONB + DATABASE_UNAVAILABLE privacy", async () => {
    const sql = new InMemoryHeadlessSqlFixture();
    sql.seedJob({
      job_id: "job_bad",
      stage: "canonical",
      state: "queued",
      owner_id: "owner-neon-1",
      project_id: randomUUID(),
      store_version: 1,
      operation_id: "op_bad",
      idempotency_authority_key: buildIdempotencyKey("owner-neon-1", "p", "c"),
      creator_idempotency_key: null,
      requested_renderer_profile: null,
      requested_renderer_build_id: null,
      provisional: null,
      canonical_job: { state: "rendering" },
      canonical_request: {},
      claim_token: null,
      claimed_at_ms: null,
      artifact_object_binding: null,
      created_at_ms: CLOCK,
      updated_at_ms: CLOCK,
      expires_at_ms: null,
      terminal_reason: null,
      verification_claim_token: null,
      verification_claimed_at_ms: null,
    });
    const store = new NeonHeadlessJobStoreAdapter(sql);
    const bad = await store.getByJobIdAndOwner("job_bad", "owner-neon-1");
    assert.equal(bad.ok, false);
    if (!bad.ok) {
      assert.equal(bad.issues[0]?.code, "JOB_STORE_COHERENCE_REJECTED");
    }

    const sql2 = new InMemoryHeadlessSqlFixture();
    sql2.injectConnectionFailure();
    const down = await new NeonHeadlessJobStoreAdapter(sql2).getByJobIdAndOwner(
      "x",
      "y",
    );
    assert.equal(down.ok, false);
    if (!down.ok) {
      assert.equal(down.issues[0]?.code, "DATABASE_UNAVAILABLE");
      assert.equal(JSON.stringify(down).includes("postgresql"), false);
    }
  });

  await test("parameterized SQL; no secrets in results", async () => {
    const sql = new InMemoryHeadlessSqlFixture();
    const store = new NeonHeadlessJobStoreAdapter(sql);
    const ctx = await buildDraft();
    const created = await store.createProvisionalIfAbsent({
      idempotencyAuthorityKey: ctx.idempotencyAuthorityKey,
      record: ctx.draft,
    });
    assert.equal(created.ok, true);
    assert.equal(JSON.stringify(created).includes("DATABASE_URL"), false);
    for (const q of sql.queries) {
      assert.ok(!("params" in q));
      // Tx control + fixed internal savepoints carry no client params.
      if (!/BEGIN|COMMIT|ROLLBACK|SAVEPOINT/i.test(q.text)) {
        assert.ok(/\$\d/.test(q.text));
      }
    }
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
