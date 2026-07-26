/**
 * Sprint 11E Phase 1 — product dispatch foundation verification.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { PRODUCTION_HEADLESS_UNAVAILABLE } from "@/features/headless-renderer/product/availability/availability.types";
import { validateHeadlessAvailabilityResponse } from "@/features/headless-renderer/product/availability/validate-availability-response";
import { creatorMessageForReasonId } from "@/features/headless-renderer/product/client/creator-messages";
import {
  validateHeadlessDownloadCapability,
  validateHeadlessPublicJobView,
} from "@/features/headless-renderer/product/client/validate-public-job-view";
import { freezeHeadlessClickAuthority } from "@/features/headless-renderer/product/snapshot/freeze-export-snapshot";
import { evaluateHeadlessOutputCompatibility } from "@/features/headless-renderer/product/snapshot/output-compatibility";
import {
  reduceHeadlessProduct,
  statusLabelForProductState,
} from "@/features/headless-renderer/product/state/product-dispatch.machine";
import { createInitialProductModel } from "@/features/headless-renderer/product/state/product-dispatch.types";
import {
  HEADLESS_TEST_AUTHORITY_PREFIX,
  rejectProductionPlaceholderCreateJobBody,
} from "@/features/headless-renderer/product/authority/placeholder-production-guard";
import { HttpHeadlessRenderClient } from "@/features/headless-renderer/product/client/http-headless-render.client";
import { FakeHeadlessRenderClient } from "@/features/headless-renderer/product/testing/fake-headless-render.client";
import { FakeOwnedUploadAdapter } from "@/features/headless-renderer/product/testing/fake-owned-upload.adapter";
import { dispatchOwnedHeadlessJob } from "@/features/headless-renderer/product/orchestration/dispatch-owned-headless-job";
import { startBoundedJobPoller } from "@/features/headless-renderer/product/polling/bounded-job-poller";
import {
  clearActiveJobReference,
  reconcileActiveJobReference,
  writeActiveJobReference,
} from "@/features/headless-renderer/product/persistence/active-job-reference";
import { UnavailableOwnedUploadAdapter } from "@/features/headless-renderer/product/upload/owned-upload.port";

const TEST_OWNER = `${HEADLESS_TEST_AUTHORITY_PREFIX}owner`;
const TEST_MANIFEST_FP = `${HEADLESS_TEST_AUTHORITY_PREFIX}manifest`;
const TEST_BUNDLE_FP = `${HEADLESS_TEST_AUTHORITY_PREFIX}bundle`;
const TEST_BUILD = "test-authority-phase1a";

let passed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`ok - ${name}`);
    });
}

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectTsFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function assertNoForbiddenImports(file: string, forbidden: string[]): void {
  const src = readFileSync(file, "utf8");
  for (const needle of forbidden) {
    assert.equal(
      src.includes(needle),
      false,
      `${file} must not contain ${needle}`,
    );
  }
}

async function main(): Promise<void> {
  await test("availability contract validates production unavailable", () => {
    const v = validateHeadlessAvailabilityResponse(PRODUCTION_HEADLESS_UNAVAILABLE);
    assert.ok(v);
    assert.equal(v.state, "configuration_unavailable");
    assert.equal(v.canCreateJob, false);
  });

  await test("availability fails closed on available without canCreateJob", () => {
    const v = validateHeadlessAvailabilityResponse({
      version: 1,
      state: "available",
      message: "ok",
      headlessSelectable: true,
      canCreateJob: false,
    });
    assert.equal(v, null);
  });

  await test("public job view requires artifact on succeeded", () => {
    const bad = validateHeadlessPublicJobView({
      version: 1,
      jobId: "job-12345678",
      state: "succeeded",
      createdAtMs: 1,
      updatedAtMs: 1,
      progress: null,
      terminalReason: null,
      artifactAvailable: false,
      cancelAccepted: false,
    });
    assert.equal(bad, null);
  });

  await test("download capability rejects path traversal filenames", () => {
    const bad = validateHeadlessDownloadCapability({
      version: 1,
      jobId: "job-12345678",
      url: "https://example.com/a.webm",
      expiresAtMs: Date.now() + 1000,
      filename: "../secret.webm",
    });
    assert.equal(bad, null);
  });

  await test("output compatibility: 4K ≤60s accepted; 60.001s rejected", () => {
    const ok = evaluateHeadlessOutputCompatibility({
      resolution: "4k",
      format: "webm",
      contentDurationMs: 60_000,
      renderDurationMs: 60_400,
    });
    assert.equal(ok.allowed, true);
    const bad = evaluateHeadlessOutputCompatibility({
      resolution: "4k",
      format: "mp4",
      contentDurationMs: 60_001,
      renderDurationMs: 60_401,
    });
    assert.equal(bad.allowed, false);
  });

  await test("output compatibility: 60s 1080p accepted; 60.001s rejected", () => {
    const ok = evaluateHeadlessOutputCompatibility({
      resolution: "1080p",
      format: "mp4",
      contentDurationMs: 60_000,
      renderDurationMs: 60_400,
    });
    assert.equal(ok.allowed, true);
    const bad = evaluateHeadlessOutputCompatibility({
      resolution: "1080p",
      format: "mp4",
      contentDurationMs: 60_001,
      renderDurationMs: 60_401,
    });
    assert.equal(bad.allowed, false);
  });

  await test("idempotency key unique per operationId", () => {
    let n = 0;
    const a = freezeHeadlessClickAuthority({
      draftId: "d1",
      resolution: "720p",
      format: "webm",
      manifestFingerprint: "m".repeat(64),
      assetBundleFingerprint: "a".repeat(64),
      randomUUID: () => `op-${++n}`,
    });
    const b = freezeHeadlessClickAuthority({
      draftId: "d1",
      resolution: "720p",
      format: "webm",
      manifestFingerprint: "m".repeat(64),
      assetBundleFingerprint: "a".repeat(64),
      randomUUID: () => `op-${++n}`,
    });
    assert.notEqual(a.idempotencyKey, b.idempotencyKey);
    assert.notEqual(a.operationId, b.operationId);
  });

  await test("production-shaped idempotency key fits durable job ID authority", () => {
    const operationId = "a4567890-e89b-42d3-a456-426614174001";
    const frozen = freezeHeadlessClickAuthority({
      draftId: "123e4567-e89b-42d3-a456-426614174000",
      resolution: "1080p",
      format: "mp4",
      manifestFingerprint: "m".repeat(64),
      assetBundleFingerprint: "a".repeat(64),
      randomUUID: () => operationId,
    });

    assert.equal(frozen.idempotencyKey, `h11e:${operationId}`);
    assert.ok(frozen.idempotencyKey.length <= 128);
  });

  await test("state machine: stale JOB_VIEW ignored; terminal no regress", () => {
    let m = createInitialProductModel("headless");
    m = reduceHeadlessProduct(m, {
      type: "START_EXPORT",
      runId: 2,
      snapshot: {
        operationId: "op-1",
        idempotencyKey: "k1",
        draftId: "d1",
        output: { resolution: "720p", format: "webm" },
        createdAtMs: 1,
      },
    });
    m = reduceHeadlessProduct(m, {
      type: "CREATE_OK",
      runId: 2,
      jobId: "job-aaaaaaaa",
      view: validateHeadlessPublicJobView({
        version: 1,
        jobId: "job-aaaaaaaa",
        state: "queued",
        createdAtMs: 1,
        updatedAtMs: 1,
        progress: { percent: 5, stage: "queued" },
        terminalReason: null,
        artifactAvailable: false,
        cancelAccepted: true,
      })!,
    });
    assert.equal(m.state, "queued");
    // Stale run
    m = reduceHeadlessProduct(m, {
      type: "JOB_VIEW",
      runId: 1,
      view: validateHeadlessPublicJobView({
        version: 1,
        jobId: "job-aaaaaaaa",
        state: "rendering",
        createdAtMs: 1,
        updatedAtMs: 2,
        progress: { percent: 40, stage: "rendering" },
        terminalReason: null,
        artifactAvailable: false,
        cancelAccepted: true,
      })!,
    });
    assert.equal(m.state, "queued");
    m = reduceHeadlessProduct(m, {
      type: "JOB_VIEW",
      runId: 2,
      view: validateHeadlessPublicJobView({
        version: 1,
        jobId: "job-aaaaaaaa",
        state: "succeeded",
        createdAtMs: 1,
        updatedAtMs: 3,
        progress: null,
        terminalReason: null,
        artifactAvailable: true,
        cancelAccepted: false,
      })!,
    });
    assert.equal(m.state, "succeeded");
    m = reduceHeadlessProduct(m, {
      type: "JOB_VIEW",
      runId: 2,
      view: validateHeadlessPublicJobView({
        version: 1,
        jobId: "job-aaaaaaaa",
        state: "rendering",
        createdAtMs: 1,
        updatedAtMs: 4,
        progress: { percent: 10, stage: "rendering" },
        terminalReason: null,
        artifactAvailable: false,
        cancelAccepted: true,
      })!,
    });
    assert.equal(m.state, "succeeded");
  });

  await test("fake client: create idempotent + cancel + retry + download", async () => {
    const client = new FakeHeadlessRenderClient({ autoAdvance: false });
    const body = {
      version: 1 as const,
      ownership: { ownerId: TEST_OWNER, projectId: "p1" },
      manifestObjectKey: "test-owned/m/manifest.json",
      assetBundleObjectKey: "test-owned/m/assets.json",
      manifestFingerprint: TEST_MANIFEST_FP,
      assetBundleFingerprint: TEST_BUNDLE_FP,
      rendererProfile: {
        resolution: "720p" as const,
        format: "webm" as const,
        fps: 30 as const,
        quality: "standard" as const,
      },
      rendererBuildId: TEST_BUILD,
      idempotencyKey: "idem-1",
      requestFingerprint: "req-1",
    };
    const a = await client.createJob(body);
    assert.equal(a.ok, true);
    if (!a.ok) return;
    const b = await client.createJob(body);
    assert.equal(b.ok, true);
    if (!b.ok) return;
    assert.equal(a.value.jobId, b.value.jobId);
    assert.equal(client.createJobCallCount, 2);

    client.forceState(a.value.jobId, "failed");
    const retry = await client.retryJob(a.value.jobId);
    assert.equal(retry.ok, true);
    if (!retry.ok) return;
    assert.notEqual(retry.value.jobId, a.value.jobId);

    client.forceState(retry.value.jobId, "succeeded");
    const dl = await client.createDownloadCapability(retry.value.jobId);
    assert.equal(dl.ok, true);
    if (dl.ok && dl.value.url.startsWith("blob:")) {
      URL.revokeObjectURL(dl.value.url);
    }

    const cancelTarget = await client.createJob({
      ...body,
      idempotencyKey: "idem-2",
    });
    assert.equal(cancelTarget.ok, true);
    if (!cancelTarget.ok) return;
    const cancelled = await client.cancelJob(cancelTarget.value.jobId);
    assert.equal(cancelled.ok, true);
    if (cancelled.ok) assert.equal(cancelled.value.state, "cancelled");
  });

  await test("owned upload production adapter unavailable", async () => {
    const adapter = new UnavailableOwnedUploadAdapter();
    const result = await adapter.uploadOwnedBundle({
      operationId: "op",
      draftId: "d",
      manifestBytes: new Uint8Array([1]),
      assetBundleBytes: new Uint8Array([1]),
      manifestFingerprint: "m",
      assetBundleFingerprint: "a",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "CONFIGURATION_UNAVAILABLE");
  });

  await test("product orchestration: upload precedes create; fingerprints preserved; lifecycle", async () => {
    const client = new FakeHeadlessRenderClient({ autoAdvance: false });
    const uploadPort = new FakeOwnedUploadAdapter();
    const order: string[] = [];
    const trackingUpload: typeof uploadPort = {
      async uploadOwnedBundle(req) {
        order.push("upload");
        return uploadPort.uploadOwnedBundle(req);
      },
    };
    const trackingClient = new Proxy(client, {
      get(target, prop, receiver) {
        if (prop === "createJob") {
          return async (
            ...args: Parameters<FakeHeadlessRenderClient["createJob"]>
          ) => {
            order.push("create");
            return target.createJob(...args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as FakeHeadlessRenderClient;

    const result = await dispatchOwnedHeadlessJob({
      client: trackingClient,
      uploadPort: trackingUpload,
      uploadRequest: {
        operationId: "operation-phase1a",
        draftId: "draft-phase1a",
        manifestBytes: new Uint8Array([1, 2, 3]),
        assetBundleBytes: new Uint8Array([4, 5, 6]),
        manifestFingerprint: TEST_MANIFEST_FP,
        assetBundleFingerprint: TEST_BUNDLE_FP,
      },
      createBody: {
        version: 1,
        ownership: { ownerId: TEST_OWNER, projectId: "draft-phase1a" },
        rendererProfile: {
          resolution: "1080p",
          format: "mp4",
          fps: 30,
          quality: "standard",
        },
        rendererBuildId: TEST_BUILD,
        idempotencyKey: "phase1a-idempotency",
        requestFingerprint: "phase1a-request",
      },
    });
    assert.deepEqual(order, ["upload", "create"]);
    assert.equal(result.ok, true);
    assert.equal(uploadPort.requests.length, 1);
    assert.equal(client.createJobCallCount, 1);
    if (!result.ok) return;
    assert.equal(result.job.view.state, "queued");
    assert.equal(result.upload.manifestFingerprint, TEST_MANIFEST_FP);
    assert.equal(result.upload.assetBundleFingerprint, TEST_BUNDLE_FP);
    const createdBody = client.createJobCalls[0]!;
    assert.equal(createdBody.manifestFingerprint, TEST_MANIFEST_FP);
    assert.equal(createdBody.assetBundleFingerprint, TEST_BUNDLE_FP);
    assert.equal(createdBody.manifestObjectKey, result.upload.manifestObjectKey);
    assert.equal(
      createdBody.assetBundleObjectKey,
      result.upload.assetBundleObjectKey,
    );

    // Idempotent replay through the same orchestration path.
    const replay = await dispatchOwnedHeadlessJob({
      client,
      uploadPort,
      uploadRequest: {
        operationId: "operation-phase1a-replay",
        draftId: "draft-phase1a",
        manifestBytes: new Uint8Array([1, 2, 3]),
        assetBundleBytes: new Uint8Array([4, 5, 6]),
        manifestFingerprint: TEST_MANIFEST_FP,
        assetBundleFingerprint: TEST_BUNDLE_FP,
      },
      createBody: {
        version: 1,
        ownership: { ownerId: TEST_OWNER, projectId: "draft-phase1a" },
        rendererProfile: {
          resolution: "1080p",
          format: "mp4",
          fps: 30,
          quality: "standard",
        },
        rendererBuildId: TEST_BUILD,
        idempotencyKey: "phase1a-idempotency",
        requestFingerprint: "phase1a-request",
      },
    });
    assert.equal(replay.ok, true);
    if (!replay.ok) return;
    assert.equal(replay.job.jobId, result.job.jobId);
    assert.equal(client.createJobCallCount, 2);

    client.forceState(result.job.jobId, "failed");
    const retry = await client.retryJob(result.job.jobId);
    assert.equal(retry.ok, true);
    if (!retry.ok) return;
    client.forceState(retry.value.jobId, "succeeded");
    const download = await client.createDownloadCapability(retry.value.jobId);
    assert.equal(download.ok, true);
    if (download.ok && download.value.url.startsWith("blob:")) {
      URL.revokeObjectURL(download.value.url);
    }

    const second = await dispatchOwnedHeadlessJob({
      client,
      uploadPort,
      uploadRequest: {
        operationId: "operation-phase1a-cancel",
        draftId: "draft-phase1a",
        manifestBytes: new Uint8Array([1]),
        assetBundleBytes: new Uint8Array([2]),
        manifestFingerprint: TEST_MANIFEST_FP,
        assetBundleFingerprint: TEST_BUNDLE_FP,
      },
      createBody: {
        version: 1,
        ownership: { ownerId: TEST_OWNER, projectId: "draft-phase1a" },
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: "standard",
        },
        rendererBuildId: TEST_BUILD,
        idempotencyKey: "phase1a-idempotency-cancel",
        requestFingerprint: "phase1a-request-cancel",
      },
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    const cancelled = await client.cancelJob(second.job.jobId);
    assert.equal(cancelled.ok, true);
    if (cancelled.ok) assert.equal(cancelled.value.state, "cancelled");

    // Polling reaches terminal succeeded.
    const pollClient = new FakeHeadlessRenderClient({ autoAdvance: true });
    const polled = await dispatchOwnedHeadlessJob({
      client: pollClient,
      uploadPort: new FakeOwnedUploadAdapter(),
      uploadRequest: {
        operationId: "operation-poll",
        draftId: "draft-phase1a",
        manifestBytes: new Uint8Array([9]),
        assetBundleBytes: new Uint8Array([8]),
        manifestFingerprint: TEST_MANIFEST_FP,
        assetBundleFingerprint: TEST_BUNDLE_FP,
      },
      createBody: {
        version: 1,
        ownership: { ownerId: TEST_OWNER, projectId: "draft-phase1a" },
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: "standard",
        },
        rendererBuildId: TEST_BUILD,
        idempotencyKey: "phase1a-poll",
        requestFingerprint: "phase1a-poll",
      },
    });
    assert.equal(polled.ok, true);
    if (!polled.ok) return;
    const states: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const handle = startBoundedJobPoller({
        runId: 1,
        isCurrentRun: () => true,
        fetchStatus: async () => {
          const g = await pollClient.getJob(polled.job.jobId);
          if (!g.ok) throw new Error("poll get failed");
          return g.value;
        },
        isTerminal: (v) =>
          v.state === "succeeded" ||
          v.state === "failed" ||
          v.state === "cancelled" ||
          v.state === "expired",
        onResult: (v) => {
          states.push(v.state);
          if (v.state === "succeeded") {
            handle.stop();
            resolve();
          }
        },
        onTransientFailure: () => undefined,
        onTerminalFailure: (msg) => reject(new Error(msg)),
        baseIntervalMs: 15,
        jitterRatio: 0,
      });
      setTimeout(() => {
        handle.stop();
        reject(new Error("poll timeout"));
      }, 500);
    });
    assert.ok(states.includes("succeeded"));
    assert.ok(states.includes("queued") || states.includes("rendering"));
  });

  await test("product orchestration: upload failure yields zero createJob calls", async () => {
    const client = new FakeHeadlessRenderClient({ autoAdvance: false });
    const uploadPort = new FakeOwnedUploadAdapter({ fail: true });
    const result = await dispatchOwnedHeadlessJob({
      client,
      uploadPort,
      uploadRequest: {
        operationId: "operation-failed-upload",
        draftId: "draft-phase1a",
        manifestBytes: new Uint8Array([1]),
        assetBundleBytes: new Uint8Array([2]),
        manifestFingerprint: TEST_MANIFEST_FP,
        assetBundleFingerprint: TEST_BUNDLE_FP,
      },
      createBody: {
        version: 1,
        ownership: { ownerId: TEST_OWNER, projectId: "draft-phase1a" },
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: "standard",
        },
        rendererBuildId: TEST_BUILD,
        idempotencyKey: "failed-upload",
        requestFingerprint: "failed-upload",
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.stage, "upload");
    assert.equal(client.createJobCallCount, 0);
    assert.equal(client.latestJobId(), null);
  });

  await test("placeholder production guard: HTTP rejects pending/test-auth; real digests only", async () => {
    assert.equal(
      rejectProductionPlaceholderCreateJobBody({
        version: 1,
        ownership: { ownerId: "pending-auth", projectId: "d" },
        manifestObjectKey: "x",
        assetBundleObjectKey: "y",
        manifestFingerprint: "pending-prepare",
        assetBundleFingerprint: "pending-bundle",
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: "standard",
        },
        rendererBuildId: "product-dispatch-phase1",
        idempotencyKey: "k",
        requestFingerprint: "r",
      }),
      "pending_fingerprint",
    );
    assert.equal(
      rejectProductionPlaceholderCreateJobBody({
        version: 1,
        ownership: { ownerId: TEST_OWNER, projectId: "d" },
        manifestObjectKey: "x",
        assetBundleObjectKey: "y",
        manifestFingerprint: TEST_MANIFEST_FP,
        assetBundleFingerprint: TEST_BUNDLE_FP,
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: "standard",
        },
        rendererBuildId: TEST_BUILD,
        idempotencyKey: "k",
        requestFingerprint: "r",
      }),
      "test_authority",
    );

    const realDigest = "a".repeat(64);
    assert.equal(
      rejectProductionPlaceholderCreateJobBody({
        version: 1,
        ownership: { ownerId: "user-owner-001", projectId: "d" },
        manifestObjectKey: "owned/m",
        assetBundleObjectKey: "owned/b",
        manifestFingerprint: realDigest,
        assetBundleFingerprint: realDigest,
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: "standard",
        },
        rendererBuildId: "headless-local-chromium-ffmpeg-11d-phase3.1a",
        idempotencyKey: "k",
        requestFingerprint: "r",
      }),
      null,
    );

    let fetched = 0;
    const http = new HttpHeadlessRenderClient(async () => {
      fetched += 1;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    for (const body of [
      {
        ownership: { ownerId: "pending-auth", projectId: "d" },
        manifestFingerprint: "pending-prepare",
        assetBundleFingerprint: "pending-bundle",
        rendererBuildId: "product-dispatch-phase1",
      },
      {
        ownership: { ownerId: TEST_OWNER, projectId: "d" },
        manifestFingerprint: TEST_MANIFEST_FP,
        assetBundleFingerprint: TEST_BUNDLE_FP,
        rendererBuildId: TEST_BUILD,
      },
    ] as const) {
      const blocked = await http.createJob({
        version: 1,
        ownership: body.ownership,
        manifestObjectKey: "x",
        assetBundleObjectKey: "y",
        manifestFingerprint: body.manifestFingerprint,
        assetBundleFingerprint: body.assetBundleFingerprint,
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: "standard",
        },
        rendererBuildId: body.rendererBuildId,
        idempotencyKey: "k",
        requestFingerprint: "r",
      });
      assert.equal(blocked.ok, false);
    }
    assert.equal(fetched, 0);

    const fake = new FakeOwnedUploadAdapter();
    const rejectedUpload = await fake.uploadOwnedBundle({
      operationId: "op",
      draftId: "d",
      manifestBytes: new Uint8Array(0),
      assetBundleBytes: new Uint8Array(0),
      manifestFingerprint: "pending-prepare",
      assetBundleFingerprint: "pending-bundle",
    });
    assert.equal(rejectedUpload.ok, false);

    // Testing client still accepts explicit test-auth.
    const testClient = new FakeHeadlessRenderClient({ autoAdvance: false });
    const accepted = await testClient.createJob({
      version: 1,
      ownership: { ownerId: TEST_OWNER, projectId: "d" },
      manifestObjectKey: "test-owned/m/manifest.json",
      assetBundleObjectKey: "test-owned/m/assets.json",
      manifestFingerprint: TEST_MANIFEST_FP,
      assetBundleFingerprint: TEST_BUNDLE_FP,
      rendererProfile: {
        resolution: "720p",
        format: "webm",
        fps: 30,
        quality: "standard",
      },
      rendererBuildId: TEST_BUILD,
      idempotencyKey: "test-ok",
      requestFingerprint: "test-ok",
    });
    assert.equal(accepted.ok, true);
  });

  await test("late create after cancel cannot commit; Browser switch locked while busy", async () => {
    let m = createInitialProductModel("headless");
    m = reduceHeadlessProduct(m, {
      type: "START_EXPORT",
      runId: 1,
      snapshot: {
        operationId: "op-late",
        idempotencyKey: "k-late",
        draftId: "d1",
        output: { resolution: "720p", format: "webm" },
        createdAtMs: 1,
      },
    });
    m = reduceHeadlessProduct(m, { type: "PREPARE_OK", runId: 1 });
    m = reduceHeadlessProduct(m, {
      type: "MATERIALIZE_PROGRESS",
      runId: 1,
      phase: "uploading",
    });
    assert.equal(m.state, "uploading");
    assert.equal(m.ctx.busy, true);

    // Browser switch rejected while busy — no divergence.
    const afterSwitch = reduceHeadlessProduct(m, {
      type: "SELECT_RENDERER",
      renderer: "browser",
    });
    assert.equal(afterSwitch.ctx.renderer, "headless");
    assert.equal(afterSwitch.state, "uploading");

    m = reduceHeadlessProduct(m, { type: "REQUEST_CANCEL", runId: 1 });
    assert.equal(m.state, "cancelled");

    // Late create for the cancelled run must not resurrect the job.
    m = reduceHeadlessProduct(m, {
      type: "CREATE_OK",
      runId: 1,
      jobId: "job-should-not-land",
      view: validateHeadlessPublicJobView({
        version: 1,
        jobId: "job-should-not-land",
        state: "queued",
        createdAtMs: 1,
        updatedAtMs: 2,
        progress: { percent: 5, stage: "queued" },
        terminalReason: null,
        artifactAvailable: false,
        cancelAccepted: true,
      })!,
    });
    assert.equal(m.state, "cancelled");
    assert.equal(m.ctx.jobId, null);

    // Delayed upload that completes after abort must not call createJob.
    let releaseUpload: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    const client = new FakeHeadlessRenderClient({ autoAdvance: false });
    const slowUpload = {
      async uploadOwnedBundle(
        request: Parameters<FakeOwnedUploadAdapter["uploadOwnedBundle"]>[0],
      ) {
        await gate;
        if (request.signal?.aborted) {
          return {
            ok: false as const,
            code: "ABORTED" as const,
            message: "The test upload was cancelled.",
          };
        }
        return new FakeOwnedUploadAdapter().uploadOwnedBundle(request);
      },
    };
    const ac = new AbortController();
    const pending = dispatchOwnedHeadlessJob({
      client,
      uploadPort: slowUpload,
      signal: ac.signal,
      uploadRequest: {
        operationId: "op-delayed",
        draftId: "draft-phase1a",
        manifestBytes: new Uint8Array([1]),
        assetBundleBytes: new Uint8Array([2]),
        manifestFingerprint: TEST_MANIFEST_FP,
        assetBundleFingerprint: TEST_BUNDLE_FP,
      },
      createBody: {
        version: 1,
        ownership: { ownerId: TEST_OWNER, projectId: "draft-phase1a" },
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: "standard",
        },
        rendererBuildId: TEST_BUILD,
        idempotencyKey: "delayed-abort",
        requestFingerprint: "delayed-abort",
      },
    });
    ac.abort();
    releaseUpload!();
    const delayed = await pending;
    assert.equal(delayed.ok, false);
    if (!delayed.ok) assert.equal(delayed.stage, "upload");
    assert.equal(client.createJobCallCount, 0);
  });

  await test("safe persistence recovery for active job reference", () => {
    class MemoryStorage {
      private map = new Map<string, string>();
      getItem(key: string): string | null {
        return this.map.has(key) ? this.map.get(key)! : null;
      }
      setItem(key: string, value: string): void {
        this.map.set(key, value);
      }
      removeItem(key: string): void {
        this.map.delete(key);
      }
    }
    const storage = new MemoryStorage();
    writeActiveJobReference(storage, {
      version: 1,
      draftId: "draft-phase1a",
      jobId: "fake-job-0001",
      createdAtMs: Date.now(),
      operationId: "op-12345678",
      output: { resolution: "720p", format: "webm" },
    });
    const restored = reconcileActiveJobReference(storage, "draft-phase1a");
    assert.ok(restored);
    assert.equal(restored.jobId, "fake-job-0001");
    clearActiveJobReference(storage);
    assert.equal(reconcileActiveJobReference(storage, "draft-phase1a"), null);
  });

  await test("creator messages never echo internal reason verbatim for unknown", () => {
    const msg = creatorMessageForReasonId("SOME_INTERNAL_STACK_TRACE");
    assert.equal(msg.includes("STACK"), false);
    assert.ok(msg.includes("Browser Export") || msg.includes("retry"));
  });

  await test("status labels cover product states", () => {
    assert.equal(
      statusLabelForProductState("materializing"),
      "Verifying media",
    );
    assert.equal(statusLabelForProductState("queued"), "Waiting for render worker");
    assert.equal(
      statusLabelForProductState("uploading_artifact"),
      "Finalizing download",
    );
    assert.equal(statusLabelForProductState("succeeded"), "Ready to download");
  });

  await test("provisional server states are not presented as queued", () => {
    let model = createInitialProductModel("headless");
    model = reduceHeadlessProduct(model, {
      type: "START_EXPORT",
      runId: 7,
      snapshot: {
        operationId: "op-preparing",
        idempotencyKey: "key-preparing",
        draftId: "draft-preparing",
        output: { resolution: "720p", format: "webm" },
        createdAtMs: 1,
      },
    });
    model = reduceHeadlessProduct(model, {
      type: "CREATE_OK",
      runId: 7,
      jobId: "job-preparing",
      view: validateHeadlessPublicJobView({
        version: 1,
        jobId: "job-preparing",
        state: "materializing",
        createdAtMs: 1,
        updatedAtMs: 2,
        progress: { percent: 5, stage: "verifying" },
        terminalReason: null,
        artifactAvailable: false,
        cancelAccepted: true,
      })!,
    });
    assert.equal(model.state, "materializing");
    assert.equal(statusLabelForProductState(model.state), "Verifying media");
  });

  await test("source-boundary: product UI/client has no worker/control-plane/testing leaks", () => {
    const productRoot = path.join(
      process.cwd(),
      "src/features/headless-renderer/product",
    );
    const files = collectTsFiles(productRoot).filter(
      (f) => !f.includes(`${path.sep}testing${path.sep}`),
    );
    for (const file of files) {
      assertNoForbiddenImports(file, [
        "control-plane/testing",
        "composeTestHeadlessControlPlane",
        "headless-renderer/worker",
        "puppeteer",
        "playwright",
        "ffmpeg-static",
        "process.env",
      ]);
    }
    const exportPanel = readFileSync(
      path.join(process.cwd(), "src/components/ExportPanel.tsx"),
      "utf8",
    );
    assert.equal(exportPanel.includes("product/testing"), false);
    assert.equal(exportPanel.includes("control-plane/testing"), false);
    assert.equal(exportPanel.includes("FakeHeadlessRenderClient"), false);
    assert.equal(exportPanel.includes("FakeOwnedUploadAdapter"), false);

    const productIndex = readFileSync(
      path.join(process.cwd(), "src/features/headless-renderer/product/index.ts"),
      "utf8",
    );
    assert.equal(productIndex.includes("FakeOwnedUploadAdapter"), false);
    assert.equal(productIndex.includes("FakeHeadlessRenderClient"), false);
    assert.equal(productIndex.includes("product/testing"), false);
    assert.ok(productIndex.includes("UnavailableOwnedUploadAdapter"));

    const routes = [
      "src/app/api/headless-render/availability/route.ts",
      "src/app/api/headless-render/jobs/route.ts",
      "src/app/api/headless-render/jobs/[jobId]/route.ts",
      "src/app/api/headless-render/jobs/[jobId]/cancel/route.ts",
      "src/app/api/headless-render/jobs/[jobId]/retry/route.ts",
      "src/app/api/headless-render/jobs/[jobId]/download/route.ts",
    ];
    for (const rel of routes) {
      const src = readFileSync(path.join(process.cwd(), rel), "utf8");
      assert.equal(src.includes("control-plane/testing"), false);
      assert.equal(src.includes("FakeHeadlessRenderClient"), false);
      assert.equal(src.includes("FakeOwnedUploadAdapter"), false);
      assert.equal(src.includes("composeTest"), false);
    }

    const section = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/product/ui/HeadlessExportSection.tsx",
      ),
      "utf8",
    );
    assert.ok(section.includes("HttpOwnedUploadAdapter"));
    assert.equal(section.includes("UnavailableOwnedUploadAdapter"), false);
    assert.ok(section.includes("allowTestAuthority"));
    assert.equal(section.includes('from "../testing/'), false);
    assert.equal(section.includes("product/testing"), false);
    assert.equal(exportPanel.includes("allowTestAuthority"), false);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
