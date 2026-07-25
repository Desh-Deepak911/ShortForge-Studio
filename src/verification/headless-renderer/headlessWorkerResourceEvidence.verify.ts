/**
 * Sprint 11D Phase 3.2 — streaming resource evidence + honest Node RSS metrics.
 * Short representative runs prove the image2pipe path; 60s operational artifacts
 * are produced by test:headless-worker-streaming-evidence.
 * Run: npm run test:headless-worker-resource-evidence
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { WorkspaceByteBudget } from "@/features/headless-renderer/worker/assets/workspace-quota";
import {
  HEADLESS_OUTPUT_PROFILES,
  type HeadlessOutputProfileId,
} from "@/features/headless-renderer/worker/runtime/output-profiles";
import {
  buildHeadlessRunMetrics,
  HeadlessRssSampler,
} from "@/features/headless-renderer/worker/runtime/run-metrics";
import {
  DEFAULT_HEADLESS_WORKER_LIMITS,
  HEADLESS_WORKER_RENDERER_BUILD_ID,
} from "@/features/headless-renderer/worker/runtime/worker-types";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";
import type { HeadlessRendererProfile } from "@/features/headless-renderer/domain";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const EVIDENCE_DIR = join(process.cwd(), ".tmp/headless-11d-evidence");

interface MeasuredEvidence {
  readonly kind: "measured";
  readonly profileId: string;
  readonly rendererBuildId: string;
  readonly digest: string;
  readonly contentDurationMs: number;
  readonly renderDurationMs: number;
  readonly artifactDurationMs: number;
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly videoCodec: string;
  readonly audioCodec: string | null;
  readonly audioPresent: boolean;
  readonly metrics: {
    readonly renderStageMs: number | null;
    readonly encodeStageMs: number | null;
    readonly probeStageMs: number | null;
    readonly totalElapsedMs: number | null;
    readonly peakWorkspaceCommittedBytes: number | null;
    readonly peakFrameBytes: number | null;
    readonly aggregateFrameBytes: number | null;
    readonly artifactBytes: number | null;
    readonly nodeCoordinatorPeakRssBytes: number | null;
    readonly frameCount: number | null;
    readonly totalFramesProduced?: number | null;
    readonly totalFramesAccepted?: number | null;
    readonly totalFrameBytesStreamed?: number | null;
    readonly peakWritableBufferedBytes?: number | null;
    readonly chromiumRenderElapsedMs?: number | null;
    readonly ffmpegEncodeElapsedMs?: number | null;
    readonly overlappedRenderEncodeElapsedMs?: number | null;
    readonly unavailableReasons: Readonly<Record<string, string>>;
  };
  readonly memoryScope: {
    readonly nodeCoordinatorPeakRssBytes: "node_process_only";
    readonly excludes: readonly ["chrome", "ffmpeg"];
    readonly notTotalWorkerMemoryAuthority: true;
  };
  readonly projected: null;
}

async function runMeasured(input: {
  profile: HeadlessRendererProfile;
  audioMode: "silent" | "with-voice" | "with-voice-and-music";
  durationMs: number;
  idempotencyKey: string;
  evidenceName: string;
}): Promise<MeasuredEvidence> {
  const fixture = buildHeadlessReferenceFixture({
    durationMs: input.durationMs,
    audioMode: input.audioMode,
    rendererProfile: input.profile,
    musicFades: input.audioMode === "with-voice-and-music",
  });
  const clock = 1_700_000_000_000;
  const { stack, worker, jobId, ownerId } = await seedAndCreateReferenceJob({
    fixture,
    idempotencyKey: input.idempotencyKey,
    clockMs: clock,
    workerLimits: {
      jobTimeoutMs: 45 * 60 * 1000,
    },
  });
  const result = await worker.processOnce(1);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error("worker failed");
  const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
  assert.equal(stored.ok, true);
  if (!stored.ok) throw new Error("missing job");
  assert.equal(
    result.value.succeeded,
    1,
    JSON.stringify({
      processOnce: result.value,
      state: stored.value.canonicalJob.state,
      terminalReason: stored.value.canonicalJob.terminalReason,
      contentDurationMs: fixture.manifestV3.project.contentDurationMs,
      renderDurationMs: fixture.manifestV3.project.renderDurationMs,
    }),
  );
  assert.ok(result.value.lastEvidence, "missing lastEvidence metrics");
  const ev = result.value.lastEvidence!;
  const art = stored.value.canonicalJob.artifact!;
  const profileId =
    `${input.profile.resolution}-${input.profile.format}-30` as HeadlessOutputProfileId;
  const expected = HEADLESS_OUTPUT_PROFILES[profileId];
  assert.equal(art.width, expected.width);
  assert.equal(art.height, expected.height);
  assert.equal(art.rendererBuildId, HEADLESS_WORKER_RENDERER_BUILD_ID);
  assert.equal(ev.profileId, expected.profileId);
  assert.ok(
    ev.metrics.peakFrameBytes != null && ev.metrics.peakFrameBytes > 0,
    "peakFrameBytes must be measured",
  );
  assert.ok(
    ev.metrics.aggregateFrameBytes != null &&
      ev.metrics.aggregateFrameBytes > 0,
    "aggregateFrameBytes must be measured",
  );
  assert.ok(
    ev.metrics.totalFrameBytesStreamed != null &&
      ev.metrics.totalFrameBytesStreamed > 0,
    "totalFrameBytesStreamed must be measured on streaming path",
  );
  assert.ok(
    ev.metrics.totalFramesAccepted != null &&
      ev.metrics.totalFramesAccepted === ev.metrics.frameCount,
    "totalFramesAccepted must match frameCount",
  );
  assert.ok(
    ev.metrics.nodeCoordinatorPeakRssBytes != null &&
      ev.metrics.nodeCoordinatorPeakRssBytes > 0,
    "nodeCoordinatorPeakRssBytes must be measured",
  );
  assert.ok(
    ev.metrics.renderStageMs != null && ev.metrics.renderStageMs > 0,
    "renderStageMs must be measured",
  );
  assert.ok(
    ev.metrics.encodeStageMs != null && ev.metrics.encodeStageMs > 0,
    "encodeStageMs must be measured",
  );
  assert.ok(
    ev.metrics.overlappedRenderEncodeElapsedMs != null &&
      ev.metrics.overlappedRenderEncodeElapsedMs > 0,
    "overlappedRenderEncodeElapsedMs must be measured",
  );

  const evidence: MeasuredEvidence = {
    kind: "measured",
    profileId: expected.profileId,
    rendererBuildId: art.rendererBuildId,
    digest: art.contentDigest,
    contentDurationMs: fixture.manifestV3.project.contentDurationMs,
    renderDurationMs: fixture.manifestV3.project.renderDurationMs,
    artifactDurationMs: art.durationMs,
    byteLength: art.byteLength,
    width: art.width,
    height: art.height,
    fps: art.fps,
    videoCodec: art.video.codec!,
    audioCodec: art.audio.codec,
    audioPresent: art.audio.present,
    metrics: ev.metrics,
    memoryScope: {
      nodeCoordinatorPeakRssBytes: "node_process_only",
      excludes: ["chrome", "ffmpeg"],
      notTotalWorkerMemoryAuthority: true,
    },
    projected: null,
  };

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(EVIDENCE_DIR, input.evidenceName),
    JSON.stringify(evidence, null, 2),
  );
  return evidence;
}

async function main() {
  console.log("\nSprint 11D Phase 3.2 — Resource evidence (streaming smoke)\n");

  test("workspace quota tracks peak committed / frame bytes", () => {
    const budget = new WorkspaceByteBudget({
      ...DEFAULT_HEADLESS_WORKER_LIMITS,
      maxWorkspaceBytes: 10_000,
      maxAggregateFrameBytes: 8_000,
      maxSingleFrameBytes: 4_000,
      maxArtifactBytes: 5_000,
    });
    const r1 = budget.reserve(1000, "frame");
    assert.equal(r1.ok, true);
    if (!r1.ok) return;
    budget.commit(r1.reservationId, 800);
    const r2 = budget.reserve(2000, "frame");
    assert.equal(r2.ok, true);
    if (!r2.ok) return;
    budget.commit(r2.reservationId, 2000);
    assert.equal(budget.peakSingleFrameBytes(), 2000);
    assert.equal(budget.aggregateFrameBytesCommitted(), 2800);
    assert.ok(budget.peakWorkspaceCommittedBytes() >= 2800);
  });

  test("RSS sampler stops and retains peak; cleanup on stop", async () => {
    const sampler = new HeadlessRssSampler();
    sampler.start(50);
    await new Promise((r) => setTimeout(r, 120));
    const peak = sampler.stop();
    assert.ok(peak == null || (Number.isSafeInteger(peak) && peak > 0));
    const again = sampler.stop();
    assert.equal(again, peak);
  });

  test("RSS sampler cleanup is idempotent after simulated cancel/timeout", async () => {
    const cancelSampler = new HeadlessRssSampler();
    cancelSampler.start(40);
    await new Promise((r) => setTimeout(r, 80));
    const cancelledPeak = cancelSampler.stop();
    assert.equal(cancelSampler.stop(), cancelledPeak);

    const timeoutSampler = new HeadlessRssSampler();
    timeoutSampler.start(40);
    await new Promise((r) => setTimeout(r, 80));
    const timedOutPeak = timeoutSampler.stop();
    assert.equal(timeoutSampler.stop(), timedOutPeak);
  });

  test("metrics privacy: no path/url keys; RSS field is node-scoped", () => {
    const metrics = buildHeadlessRunMetrics({
      renderStageMs: 1,
      encodeStageMs: null,
      probeStageMs: 2,
      uploadStageMs: null,
      totalElapsedMs: 3,
      budget: null,
      artifactBytes: 4,
      nodeCoordinatorPeakRssBytes: 5,
      frameCount: 6,
    });
    const blob = JSON.stringify(metrics);
    assert.equal(blob.includes("/Users"), false);
    assert.equal(blob.includes("http"), false);
    assert.equal(blob.includes("://"), false);
    assert.equal(blob.includes("sampledPeakRssBytes"), false);
    assert.equal(metrics.nodeCoordinatorPeakRssBytes, 5);
    assert.equal(metrics.encodeStageMs, null);
    assert.equal(
      metrics.unavailableReasons.encodeStageMs,
      "stage_not_completed",
    );
  });

  // Short streaming smokes — prove image2pipe + metrics without multi-minute wall clock.
  // Full 60s operational artifacts: npm run test:headless-worker-streaming-evidence
  const runs: Array<{
    profile: HeadlessRendererProfile;
    audioMode: "silent" | "with-voice" | "with-voice-and-music";
    durationMs: number;
    key: string;
    file: string;
  }> = [
    {
      profile: { resolution: "720p", format: "webm", fps: 30, quality: "high" },
      audioMode: "with-voice-and-music",
      durationMs: 2_000,
      key: "p32-720-webm-2s",
      file: "phase32-720p-webm-2s-streaming-smoke.json",
    },
    {
      profile: { resolution: "720p", format: "mp4", fps: 30, quality: "high" },
      audioMode: "with-voice",
      durationMs: 2_000,
      key: "p32-720-mp4-2s",
      file: "phase32-720p-mp4-2s-streaming-smoke.json",
    },
    {
      profile: { resolution: "1080p", format: "webm", fps: 30, quality: "high" },
      audioMode: "with-voice-and-music",
      durationMs: 2_000,
      key: "p32-1080-webm-2s",
      file: "phase32-1080p-webm-2s-streaming-smoke.json",
    },
    {
      profile: { resolution: "1080p", format: "mp4", fps: 30, quality: "high" },
      audioMode: "silent",
      durationMs: 2_000,
      key: "p32-1080-mp4-2s",
      file: "phase32-1080p-mp4-2s-streaming-smoke.json",
    },
    {
      profile: { resolution: "4k", format: "webm", fps: 30, quality: "high" },
      audioMode: "silent",
      durationMs: 2_000,
      key: "p32-4k-webm-2s",
      file: "phase32-4k-webm-2s-streaming-smoke.json",
    },
    {
      profile: { resolution: "4k", format: "mp4", fps: 30, quality: "high" },
      audioMode: "with-voice",
      durationMs: 2_000,
      key: "p32-4k-mp4-2s",
      file: "phase32-4k-mp4-2s-streaming-smoke.json",
    },
  ];

  const results: MeasuredEvidence[] = [];
  for (const run of runs) {
    await testAsync(`measured ${run.file}`, async () => {
      const evidence = await runMeasured({
        profile: run.profile,
        audioMode: run.audioMode,
        durationMs: run.durationMs,
        idempotencyKey: run.key,
        evidenceName: run.file,
      });
      results.push(evidence);
      assert.equal(evidence.kind, "measured");
      assert.ok(evidence.byteLength > 1000);
      assert.equal(evidence.contentDurationMs, run.durationMs);
      assert.equal(evidence.renderDurationMs, run.durationMs + 400);
    });
  }

  const ledger = {
    rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
    note: "Streaming smoke ledger. 60s operational evidence is separate. nodeCoordinatorPeakRssBytes is Node-only.",
    frameStorage: "duration_independent_image2pipe",
    profiles: results.map((r) => ({
      profileId: r.profileId,
      contentDurationMs: r.contentDurationMs,
      renderDurationMs: r.renderDurationMs,
      artifactDurationMs: r.artifactDurationMs,
      artifactBytes: r.byteLength,
      peakFrameBytes: r.metrics.peakFrameBytes,
      aggregateFrameBytes: r.metrics.aggregateFrameBytes,
      totalFrameBytesStreamed: r.metrics.totalFrameBytesStreamed ?? null,
      peakWorkspaceCommittedBytes: r.metrics.peakWorkspaceCommittedBytes,
      nodeCoordinatorPeakRssBytes: r.metrics.nodeCoordinatorPeakRssBytes,
      renderStageMs: r.metrics.renderStageMs,
      encodeStageMs: r.metrics.encodeStageMs,
      overlappedRenderEncodeElapsedMs:
        r.metrics.overlappedRenderEncodeElapsedMs ?? null,
      probeStageMs: r.metrics.probeStageMs,
      totalElapsedMs: r.metrics.totalElapsedMs,
      frameCount: r.metrics.frameCount,
    })),
  };
  writeFileSync(
    join(EVIDENCE_DIR, "phase32-streaming-smoke-ledger.json"),
    JSON.stringify(ledger, null, 2),
  );

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
