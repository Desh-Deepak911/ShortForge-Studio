/**
 * Neon durable-queue foundation — claim-next, lease, cancel, retry, fairness.
 * Run: npm run test:headless-neon-durable-queue
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";
import {
  recoverExpiredRenderClaimsOnce,
  type HeadlessJobStorePort,
} from "@/features/headless-renderer/control-plane";
import {
  composeTestHeadlessControlPlane,
  InMemoryHeadlessSqlFixture,
  MemoryHeadlessJobStoreAdapter,
  NeonHeadlessJobStoreAdapter,
  seedOwnedManifestAndBundle,
} from "@/features/headless-renderer/control-plane/testing";
import {
  buildHeadlessAuthorityFingerprint,
  createAcceptedHeadlessRenderJob,
  finalizeHeadlessRenderJobRequest,
} from "@/features/headless-renderer/domain";
import { applyHeadlessJobTransition } from "@/features/headless-renderer/domain/headless-job-lifecycle";

const CLOCK = 1_700_000_000_000;
const LEASE_MS = 60_000;

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
    title: "Neon Queue Verify",
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

async function enqueueQueuedJob(
  store: HeadlessJobStorePort,
  input: {
    ownerId: string;
    creatorKey: string;
    createdAtMs?: number;
  },
) {
  const manifest = buildExportManifest({
    story: fixStory(),
    environment: CAPABLE_ENV,
    audioMode: "with-voice",
  });
  assert.equal(manifest.version, 4);
  const projectId = manifest.project.projectId;
  const stack = composeTestHeadlessControlPlane({
    principal: { ownerId: input.ownerId, sessionId: "sess-1" },
    authorizedProjectIds: [projectId],
    nowMs: () => CLOCK,
  });
  const seeded = await seedOwnedManifestAndBundle({
    storage: stack.storage,
    ownerId: input.ownerId,
    projectId,
    manifest,
    nowMs: CLOCK,
  });
  assert.equal(seeded.ok, true);
  if (!seeded.ok) throw new Error("seed failed");

  const requestResult = finalizeHeadlessRenderJobRequest({
    ownership: { ownerId: input.ownerId, projectId },
    manifest,
    assetBundle: seeded.value.bundle,
    rendererProfile: {
      resolution: manifest.output.resolution,
      format: manifest.output.format,
      fps: 30,
      quality: manifest.output.quality,
    },
    rendererBuildId: "renderer-build-1",
    idempotencyKey: input.creatorKey,
  });
  assert.equal(requestResult.ok, true);
  if (!requestResult.ok) throw new Error("request failed");

  const createdAtMs = input.createdAtMs ?? CLOCK;
  const accepted = createAcceptedHeadlessRenderJob({
    jobId: `job_${randomUUID()}`,
    requestValue: requestResult.request,
    createdAtMs,
  });
  assert.equal(accepted.ok, true);
  if (!accepted.ok) throw new Error("accept failed");
  const queued = applyHeadlessJobTransition({
    jobValue: accepted.job,
    requestValue: accepted.request,
    toState: "queued",
    attempt: accepted.job.attempt,
    updatedAtMs: createdAtMs + 1,
  });
  assert.equal(queued.ok, true);
  if (!queued.ok) throw new Error("queue transition failed");

  const idempotencyAuthorityKey = buildIdempotencyKey(
    input.ownerId,
    projectId,
    input.creatorKey,
  );
  const created = await store.createIfAbsent({
    idempotencyAuthorityKey,
    record: {
      job: queued.job,
      request: accepted.request,
      idempotencyAuthorityKey,
      operationId: `op_${randomUUID()}`,
      claimToken: null,
      claimedAtMs: null,
      artifactObjectBinding: null,
    },
  });
  assert.equal(created.ok && created.value.kind === "created", true);
  if (!created.ok || created.value.kind !== "created") {
    throw new Error("enqueue failed");
  }
  return {
    record: created.value.record,
    projectId,
    idempotencyAuthorityKey,
    request: accepted.request,
    replayWrite: {
      job: queued.job,
      request: accepted.request,
      idempotencyAuthorityKey,
      operationId: created.value.record.operationId,
      claimToken: null as string | null,
      claimedAtMs: null as number | null,
      artifactObjectBinding: null,
    },
  };
}

function makeStore(label: "memory" | "neon-fixture"): HeadlessJobStorePort {
  return label === "memory"
    ? new MemoryHeadlessJobStoreAdapter()
    : new NeonHeadlessJobStoreAdapter(new InMemoryHeadlessSqlFixture());
}

async function main() {
  console.log("\nNeon durable queue foundation\n");

  await test("002 already ships queued-unclaimed partial index", () => {
    const sql = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/migrations/002_headless_jobs.sql",
      ),
      "utf8",
    );
    assert.match(sql, /idx_headless_jobs_canonical_queued_unclaimed/);
    assert.match(sql, /WHERE stage = 'canonical'/);
    assert.match(sql, /state = 'queued'/);
    assert.match(sql, /claim_token IS NULL/);
  });

  for (const label of ["memory", "neon-fixture"] as const) {
    await test(`${label}: repeated Export is idempotent`, async () => {
      const store = makeStore(label);
      const first = await enqueueQueuedJob(store, {
        ownerId: `owner-${label}-idem`,
        creatorKey: "export-click-1",
      });
      const replay = await store.createIfAbsent({
        idempotencyAuthorityKey: first.idempotencyAuthorityKey,
        record: first.replayWrite,
      });
      assert.equal(replay.ok && replay.value.kind === "existing", true);
      if (!replay.ok || replay.value.kind !== "existing") return;
      assert.equal(replay.value.record.jobId, first.record.jobId);
    });

    await test(`${label}: two workers cannot claim the same job`, async () => {
      const store = makeStore(label);
      await enqueueQueuedJob(store, {
        ownerId: `owner-${label}-race`,
        creatorKey: "only-job",
      });
      const a = await store.claimNextQueuedJob({
        claimToken: "worker-a",
        nowMs: CLOCK + 10,
      });
      const b = await store.claimNextQueuedJob({
        claimToken: "worker-b",
        nowMs: CLOCK + 11,
      });
      assert.equal(a.ok && a.value.kind === "claimed", true);
      assert.equal(b.ok && b.value.kind === "empty", true);
      if (!a.ok || a.value.kind !== "claimed") return;
      assert.equal(a.value.record.claimToken, "worker-a");
    });

    await test(`${label}: two workers claim distinct jobs`, async () => {
      const store = makeStore(label);
      const owner = `owner-${label}-two`;
      const first = await enqueueQueuedJob(store, {
        ownerId: owner,
        creatorKey: "job-1",
        createdAtMs: CLOCK,
      });
      const second = await enqueueQueuedJob(store, {
        ownerId: owner,
        creatorKey: "job-2",
        createdAtMs: CLOCK + 5,
      });
      const a = await store.claimNextQueuedJob({
        claimToken: "w1",
        nowMs: CLOCK + 20,
      });
      const b = await store.claimNextQueuedJob({
        claimToken: "w2",
        nowMs: CLOCK + 21,
      });
      assert.equal(a.ok && a.value.kind === "claimed", true);
      assert.equal(b.ok && b.value.kind === "claimed", true);
      if (!a.ok || a.value.kind !== "claimed") return;
      if (!b.ok || b.value.kind !== "claimed") return;
      const ids = new Set([a.value.record.jobId, b.value.record.jobId]);
      assert.equal(ids.size, 2);
      assert.ok(ids.has(first.record.jobId));
      assert.ok(ids.has(second.record.jobId));
      assert.equal(a.value.record.jobId, first.record.jobId);
    });

    await test(`${label}: lease renew keeps a stale worker from stealing`, async () => {
      const store = makeStore(label);
      const enqueued = await enqueueQueuedJob(store, {
        ownerId: `owner-${label}-lease`,
        creatorKey: "lease-job",
      });
      const claimed = await store.claimNextQueuedJob({
        claimToken: "live-worker",
        nowMs: CLOCK + 10,
      });
      assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
      if (!claimed.ok || claimed.value.kind !== "claimed") return;

      const renewed = await store.renewRenderClaim({
        jobId: claimed.value.record.jobId,
        ownerId: claimed.value.record.ownerId,
        claimToken: "live-worker",
        nowMs: CLOCK + 40_000,
      });
      assert.equal(renewed.ok && renewed.value.kind === "renewed", true);

      const stillLive = await store.recoverExpiredClaim({
        jobId: claimed.value.record.jobId,
        ownerId: claimed.value.record.ownerId,
        nowMs: CLOCK + 50_000,
        leaseMs: LEASE_MS,
        expectedClaimToken: "live-worker",
      });
      assert.equal(
        stillLive.ok && stillLive.value.kind === "rejected_live_claim",
        true,
      );

      const wrongToken = await store.renewRenderClaim({
        jobId: enqueued.record.jobId,
        ownerId: enqueued.record.ownerId,
        claimToken: "stale-worker",
        nowMs: CLOCK + 41_000,
      });
      assert.equal(wrongToken.ok && wrongToken.value.kind === "rejected", true);
    });

    await test(`${label}: expired lease recovery then retry enqueue`, async () => {
      const store = makeStore(label);
      const first = await enqueueQueuedJob(store, {
        ownerId: `owner-${label}-expire`,
        creatorKey: "expire-job",
      });
      const claimed = await store.claimNextQueuedJob({
        claimToken: "dead-worker",
        nowMs: CLOCK + 10,
      });
      assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
      if (!claimed.ok || claimed.value.kind !== "claimed") return;

      const listed = await store.listExpiredRenderClaims({
        nowMs: CLOCK + 10 + LEASE_MS + 1,
        leaseMs: LEASE_MS,
        limit: 10,
      });
      assert.equal(listed.ok, true);
      if (!listed.ok) return;
      assert.equal(
        listed.value.some((row) => row.jobId === first.record.jobId),
        true,
      );

      const sweep = await recoverExpiredRenderClaimsOnce({
        jobStore: store,
        nowMs: CLOCK + 10 + LEASE_MS + 1,
        leaseMs: LEASE_MS,
        limit: 10,
      });
      assert.equal(sweep.ok && sweep.value.recovered >= 1, true);

      const retryKey = buildIdempotencyKey(
        first.record.ownerId,
        first.record.projectId,
        "expire-job-retry",
      );
      const retryAccepted = createAcceptedHeadlessRenderJob({
        jobId: `job_${randomUUID()}`,
        requestValue: first.request,
        createdAtMs: CLOCK + 20,
      });
      assert.equal(retryAccepted.ok, true);
      if (!retryAccepted.ok) return;
      const retryQueued = applyHeadlessJobTransition({
        jobValue: retryAccepted.job,
        requestValue: retryAccepted.request,
        toState: "queued",
        attempt: retryAccepted.job.attempt,
        updatedAtMs: CLOCK + 21,
      });
      assert.equal(retryQueued.ok, true);
      if (!retryQueued.ok) return;
      const retried = await store.createIfAbsent({
        idempotencyAuthorityKey: retryKey,
        record: {
          job: retryQueued.job,
          request: retryAccepted.request,
          idempotencyAuthorityKey: retryKey,
          operationId: `op_${randomUUID()}`,
          claimToken: null,
          claimedAtMs: null,
          artifactObjectBinding: null,
        },
      });
      assert.equal(retried.ok && retried.value.kind === "created", true);
      const reclaim = await store.claimNextQueuedJob({
        claimToken: "retry-worker",
        nowMs: CLOCK + 30,
      });
      assert.equal(reclaim.ok && reclaim.value.kind === "claimed", true);
    });

    await test(`${label}: cancel wins over stale claimed progress`, async () => {
      const store = makeStore(label);
      const enqueued = await enqueueQueuedJob(store, {
        ownerId: `owner-${label}-cancel`,
        creatorKey: "cancel-job",
      });
      const claimed = await store.claimNextQueuedJob({
        claimToken: "busy-worker",
        nowMs: CLOCK + 10,
      });
      assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
      if (!claimed.ok || claimed.value.kind !== "claimed") return;

      const cancelled = applyHeadlessJobTransition({
        jobValue: claimed.value.record.canonicalJob,
        requestValue: claimed.value.record.canonicalRequest,
        toState: "cancelled",
        attempt: claimed.value.record.canonicalJob.attempt,
        updatedAtMs: CLOCK + 20,
        terminalReason: { reasonId: "CANCELLED_BY_USER", retryable: false },
      });
      assert.equal(cancelled.ok, true);
      if (!cancelled.ok) return;
      const cas = await store.compareAndSetTransition({
        jobId: enqueued.record.jobId,
        ownerId: enqueued.record.ownerId,
        expectedStoreVersion: claimed.value.record.storeVersion,
        next: {
          job: cancelled.job,
          request: claimed.value.record.canonicalRequest,
          idempotencyAuthorityKey: claimed.value.record.idempotencyAuthorityKey,
          operationId: claimed.value.record.operationId,
          claimToken: null,
          claimedAtMs: null,
          artifactObjectBinding: null,
        },
      });
      assert.equal(cas.ok && cas.value.kind === "updated", true);

      const progress = await store.updateClaimedProgress({
        jobId: enqueued.record.jobId,
        ownerId: enqueued.record.ownerId,
        claimToken: "busy-worker",
        expectedStoreVersion: claimed.value.record.storeVersion,
        nowMs: CLOCK + 25,
        progress: {
          percent: 50,
          stage: "rendering",
          updatedAtMs: CLOCK + 25,
        },
      });
      assert.equal(progress.ok, true);
      if (!progress.ok) return;
      assert.ok(
        progress.value.kind === "terminal_locked" ||
          progress.value.kind === "stale" ||
          progress.value.kind === "rejected",
      );
    });

    await test(`${label}: progress persist does not reset the lease clock`, async () => {
      const store = makeStore(label);
      await enqueueQueuedJob(store, {
        ownerId: `owner-${label}-progress`,
        creatorKey: "progress-job",
      });
      const claimed = await store.claimNextQueuedJob({
        claimToken: "prog-worker",
        nowMs: CLOCK + 10,
      });
      assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
      if (!claimed.ok || claimed.value.kind !== "claimed") return;

      await store.renewRenderClaim({
        jobId: claimed.value.record.jobId,
        ownerId: claimed.value.record.ownerId,
        claimToken: "prog-worker",
        nowMs: CLOCK + 40_000,
      });

      const progress = await store.updateClaimedProgress({
        jobId: claimed.value.record.jobId,
        ownerId: claimed.value.record.ownerId,
        claimToken: "prog-worker",
        expectedStoreVersion: claimed.value.record.storeVersion,
        nowMs: CLOCK + 41_000,
        progress: {
          percent: 45,
          stage: "rendering",
          updatedAtMs: CLOCK + 41_000,
        },
      });
      assert.equal(
        progress.ok && progress.value.kind === "updated",
        true,
        progress.ok
          ? `kind=${progress.value.kind}`
          : `fail=${progress.issues[0]?.code}:${progress.issues[0]?.message}`,
      );
      if (!progress.ok || progress.value.kind !== "updated") return;
      assert.equal(progress.value.record.canonicalJob.state, "rendering");
      assert.equal(progress.value.record.claimedAtMs, CLOCK + 40_000);
      assert.equal(progress.value.record.claimToken, "prog-worker");
    });

    await test(`${label}: per-owner cap prevents monopolizing workers`, async () => {
      const store = makeStore(label);
      const noisy = `owner-${label}-noisy`;
      const quiet = `owner-${label}-quiet`;
      await enqueueQueuedJob(store, {
        ownerId: noisy,
        creatorKey: "noisy-1",
        createdAtMs: CLOCK,
      });
      await enqueueQueuedJob(store, {
        ownerId: noisy,
        creatorKey: "noisy-2",
        createdAtMs: CLOCK + 1,
      });
      const quietJob = await enqueueQueuedJob(store, {
        ownerId: quiet,
        creatorKey: "quiet-1",
        createdAtMs: CLOCK + 2,
      });

      const first = await store.claimNextQueuedJob({
        claimToken: "fair-1",
        nowMs: CLOCK + 30,
        maxActiveRendersPerOwner: 1,
      });
      const second = await store.claimNextQueuedJob({
        claimToken: "fair-2",
        nowMs: CLOCK + 31,
        maxActiveRendersPerOwner: 1,
      });
      assert.equal(first.ok && first.value.kind === "claimed", true);
      assert.equal(second.ok && second.value.kind === "claimed", true);
      if (!first.ok || first.value.kind !== "claimed") return;
      if (!second.ok || second.value.kind !== "claimed") return;
      const owners = new Set([
        first.value.record.ownerId,
        second.value.record.ownerId,
      ]);
      assert.equal(owners.has(noisy), true);
      assert.equal(owners.has(quiet), true);
      assert.ok(
        first.value.record.jobId === quietJob.record.jobId ||
          second.value.record.jobId === quietJob.record.jobId,
      );

      const third = await store.claimNextQueuedJob({
        claimToken: "fair-3",
        nowMs: CLOCK + 32,
        maxActiveRendersPerOwner: 1,
      });
      assert.equal(third.ok && third.value.kind === "empty", true);
    });
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
