/**
 * Sprint 11E Phase 2G.23 — frame progress authority.
 * Run: npm run test:headless-render-frame-progress-authority
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { parseHeadlessProgress } from "@/features/headless-renderer/domain/headless-field-validators";
import {
  HEADLESS_ENCODING_PROGRESS_PERCENT,
  HEADLESS_MAX_ADVISORY_FRAME_COUNT,
  HEADLESS_RENDERING_PROGRESS_CEILING,
  HEADLESS_RENDERING_PROGRESS_FLOOR,
} from "@/features/headless-renderer/domain/headless-render-constants";
import { toHeadlessPublicJobView } from "@/features/headless-renderer/control-plane/services/safe-job-view";
import type { HeadlessRenderJobV1 } from "@/features/headless-renderer/domain/headless-render.types";
import { validateHeadlessPublicJobView } from "@/features/headless-renderer/product/client/validate-public-job-view";
import {
  reduceHeadlessProduct,
} from "@/features/headless-renderer/product/state/product-dispatch.machine";
import { createInitialProductModel } from "@/features/headless-renderer/product/state/product-dispatch.types";
import {
  HEADLESS_FRAME_PROGRESS_MIN_WRITE_INTERVAL_MS,
  buildAdvisoryFrameProgress,
  countMaxRenderingProgressPercentWrites,
  deriveRenderingFrameProgressPercent,
  simulateFrameProgressWriteCount,
  shouldEmitFrameProgressWrite,
} from "@/features/headless-renderer/worker/runtime/frame-render-progress";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function renderingView(input: {
  percent: number;
  completedFrames?: number;
  totalFrames?: number;
  updatedAtMs?: number;
}) {
  return {
    version: 1 as const,
    jobId: "job-12345678",
    state: "rendering" as const,
    createdAtMs: 1,
    updatedAtMs: input.updatedAtMs ?? 2,
    progress: {
      percent: input.percent,
      stage: "rendering",
      ...(input.completedFrames != null ? { completedFrames: input.completedFrames } : {}),
      ...(input.totalFrames != null ? { totalFrames: input.totalFrames } : {}),
    },
    terminalReason: null,
    artifactAvailable: false,
    cancelAccepted: true,
  };
}

function main() {
  console.log("\nSprint 11E Phase 2G.23 — frame render progress authority\n");

  test("first frame progress stays at rendering floor", () => {
    assert.equal(
      deriveRenderingFrameProgressPercent(1, 72),
      HEADLESS_RENDERING_PROGRESS_FLOOR,
    );
    const progress = buildAdvisoryFrameProgress({
      completedFrames: 1,
      totalFrames: 72,
      nowMs: 1,
    });
    assert.equal(progress.completedFrames, 1);
    assert.equal(progress.totalFrames, 72);
    assert.equal(progress.percent, HEADLESS_RENDERING_PROGRESS_FLOOR);
  });

  test("middle frame progress advances above floor and below ceiling", () => {
    const middle = deriveRenderingFrameProgressPercent(36, 72);
    assert.ok(middle > HEADLESS_RENDERING_PROGRESS_FLOOR);
    assert.ok(middle < HEADLESS_RENDERING_PROGRESS_CEILING);
    assert.equal(deriveRenderingFrameProgressPercent(531, 1062), 47);
  });

  test("final frame progress reaches rendering ceiling only", () => {
    assert.equal(
      deriveRenderingFrameProgressPercent(72, 72),
      HEADLESS_RENDERING_PROGRESS_CEILING,
    );
    assert.equal(
      deriveRenderingFrameProgressPercent(1812, 1812),
      HEADLESS_RENDERING_PROGRESS_CEILING,
    );
  });

  test("rendering progress maps monotonically from 35 to 59", () => {
    let prev: number = HEADLESS_RENDERING_PROGRESS_FLOOR;
    for (let c = 1; c <= 72; c += 1) {
      const next = deriveRenderingFrameProgressPercent(c, 72);
      assert.ok(next >= prev);
      prev = next;
    }
    assert.ok(prev <= HEADLESS_RENDERING_PROGRESS_CEILING);
  });

  test("rendering percent range is restricted to 35 through 59", () => {
    for (const total of [72, 1062, 1812]) {
      for (let c = 1; c <= total; c += Math.max(1, Math.floor(total / 40))) {
        const percent = deriveRenderingFrameProgressPercent(c, total);
        assert.ok(percent >= HEADLESS_RENDERING_PROGRESS_FLOOR);
        assert.ok(percent <= HEADLESS_RENDERING_PROGRESS_CEILING);
      }
    }
  });

  test("encoding begins at 60 percent", () => {
    assert.equal(HEADLESS_ENCODING_PROGRESS_PERCENT, 60);
    assert.notEqual(
      deriveRenderingFrameProgressPercent(1062, 1062),
      HEADLESS_ENCODING_PROGRESS_PERCENT,
    );
    assert.ok(
      deriveRenderingFrameProgressPercent(1812, 1812) <
        HEADLESS_ENCODING_PROGRESS_PERCENT,
    );
  });

  test("progress parser rejects negative frame counts", () => {
    assert.equal(
      parseHeadlessProgress({
        percent: 42,
        stage: "rendering",
        updatedAtMs: 1,
        completedFrames: -1,
        totalFrames: 72,
      }).ok,
      false,
    );
    assert.equal(
      parseHeadlessProgress({
        percent: 42,
        stage: "rendering",
        updatedAtMs: 1,
        completedFrames: 1,
        totalFrames: -5,
      }).ok,
      false,
    );
  });

  test("progress parser rejects completedFrames above totalFrames", () => {
    const parsed = parseHeadlessProgress({
      percent: 42,
      stage: "rendering",
      updatedAtMs: 1,
      completedFrames: 80,
      totalFrames: 72,
    });
    assert.equal(parsed.ok, false);
  });

  test("progress parser rejects excessive totalFrames", () => {
    const parsed = parseHeadlessProgress({
      percent: 42,
      stage: "rendering",
      updatedAtMs: 1,
      completedFrames: 1,
      totalFrames: HEADLESS_MAX_ADVISORY_FRAME_COUNT + 1,
    });
    assert.equal(parsed.ok, false);
  });

  test("legacy jobs without frame counts keep percent-only advisory progress", () => {
    let model = createInitialProductModel("headless");
    model = reduceHeadlessProduct(model, {
      type: "JOB_VIEW",
      runId: 0,
      view: renderingView({ percent: 35 }),
    });
    assert.equal(model.ctx.advisoryPercent, 35);
    assert.equal(model.ctx.advisoryCompletedFrames, null);
    assert.equal(model.ctx.advisoryTotalFrames, null);
  });

  test("write throttling skips duplicate percent within interval", () => {
    assert.equal(
      shouldEmitFrameProgressWrite({
        lastEmittedPercent: 40,
        nextPercent: 40,
        completedFrames: 20,
        totalFrames: 72,
        lastWriteAtMs: 100,
        nowMs: 100 + HEADLESS_FRAME_PROGRESS_MIN_WRITE_INTERVAL_MS - 1,
      }),
      false,
    );
    assert.equal(
      shouldEmitFrameProgressWrite({
        lastEmittedPercent: 40,
        nextPercent: 41,
        completedFrames: 21,
        totalFrames: 72,
        lastWriteAtMs: 100,
        nowMs: 100 + HEADLESS_FRAME_PROGRESS_MIN_WRITE_INTERVAL_MS,
      }),
      true,
    );
  });

  test("bounded write counts for 72, 1062 and 1812 frames", () => {
    const maxDistinct = countMaxRenderingProgressPercentWrites(1812);
    assert.equal(maxDistinct, 25);
    for (const total of [72, 1062, 1812]) {
      const writes = simulateFrameProgressWriteCount({ totalFrames: total });
      assert.ok(writes <= 25, `writes=${writes} total=${total}`);
      assert.ok(writes >= 2, `writes=${writes} total=${total}`);
    }
  });

  test("first and final frame transitions may emit despite interval throttle", () => {
    assert.equal(
      shouldEmitFrameProgressWrite({
        lastEmittedPercent: 35,
        nextPercent: 35,
        completedFrames: 1,
        totalFrames: 72,
        lastWriteAtMs: 100,
        nowMs: 150,
      }),
      false,
    );
    assert.equal(
      shouldEmitFrameProgressWrite({
        lastEmittedPercent: 58,
        nextPercent: 59,
        completedFrames: 72,
        totalFrames: 72,
        lastWriteAtMs: 100,
        nowMs: 150,
      }),
      true,
    );
  });

  test("website reducer never regresses advisory percent", () => {
    let model = createInitialProductModel("headless");
    model = reduceHeadlessProduct(model, {
      type: "JOB_VIEW",
      runId: 0,
      view: renderingView({
        percent: 40,
        completedFrames: 100,
        totalFrames: 1000,
      }),
    });
    model = reduceHeadlessProduct(model, {
      type: "JOB_VIEW",
      runId: 0,
      view: renderingView({
        percent: 38,
        completedFrames: 90,
        totalFrames: 1000,
        updatedAtMs: 3,
      }),
    });
    assert.equal(model.ctx.advisoryPercent, 40);
  });

  test("cancellation preserves last valid rendering progress", () => {
    let model = createInitialProductModel("headless");
    model = reduceHeadlessProduct(model, {
      type: "JOB_VIEW",
      runId: 0,
      view: renderingView({
        percent: 44,
        completedFrames: 300,
        totalFrames: 1062,
      }),
    });
    model = reduceHeadlessProduct(model, {
      type: "JOB_VIEW",
      runId: 0,
      view: {
        version: 1,
        jobId: "job-12345678",
        state: "cancelled",
        createdAtMs: 1,
        updatedAtMs: 4,
        progress: null,
        terminalReason: { reasonId: "CANCELLED_BY_USER", retryable: false },
        artifactAvailable: false,
        cancelAccepted: false,
      },
    });
    assert.equal(model.ctx.advisoryPercent, 44);
    assert.equal(model.ctx.advisoryCompletedFrames, 300);
    assert.equal(model.ctx.advisoryTotalFrames, 1062);
  });

  test("failure status replaces rendering progress in UI state", () => {
    let model = createInitialProductModel("headless");
    model = reduceHeadlessProduct(model, {
      type: "JOB_VIEW",
      runId: 0,
      view: renderingView({
        percent: 52,
        completedFrames: 500,
        totalFrames: 1062,
      }),
    });
    model = reduceHeadlessProduct(model, {
      type: "JOB_VIEW",
      runId: 0,
      view: {
        version: 1,
        jobId: "job-12345678",
        state: "failed",
        createdAtMs: 1,
        updatedAtMs: 5,
        progress: null,
        terminalReason: { reasonId: "WORKER_FAILED", retryable: true },
        artifactAvailable: false,
        cancelAccepted: false,
      },
    });
    assert.equal(model.state, "failed");
    assert.equal(model.ctx.advisoryPercent, 52);
    assert.equal(model.ctx.jobView?.progress, null);
  });

  test("public status DTO exposes only safe frame counts", () => {
    const view = validateHeadlessPublicJobView(
      renderingView({
        percent: 47,
        completedFrames: 531,
        totalFrames: 1062,
      }),
    );
    assert.ok(view);
    assert.equal(view?.progress?.completedFrames, 531);
    assert.equal(view?.progress?.totalFrames, 1062);
    assert.equal("updatedAtMs" in (view?.progress ?? {}), false);
    assert.equal("claimToken" in (view ?? {}), false);
    assert.equal("renderJobFingerprint" in (view ?? {}), false);
  });

  test("control-plane safe view strips private authority fields", () => {
    const job = {
      jobId: "job-12345678",
      state: "rendering",
      progress: {
        percent: 47,
        stage: "rendering",
        updatedAtMs: 1,
        completedFrames: 531,
        totalFrames: 1062,
      },
      createdAtMs: 1,
      updatedAtMs: 2,
      terminalReason: null,
      artifact: null,
      manifestFingerprint: "secret-manifest",
      assetBundleFingerprint: "secret-bundle",
      requestFingerprint: "secret-request",
      renderJobFingerprint: "secret-job",
      rendererBuildId: "secret-build",
      rendererProfile: {
        resolution: "1080p",
        format: "webm",
        fps: 30,
        quality: "standard",
      },
      idempotencyKey: "secret-idempotency",
      attempt: 1,
      contractVersion: 1,
    } as HeadlessRenderJobV1;
    const safe = toHeadlessPublicJobView(job);
    assert.equal(safe.progress?.completedFrames, 531);
    assert.equal(safe.progress?.totalFrames, 1062);
    assert.equal("manifestFingerprint" in safe, false);
    assert.equal("renderJobFingerprint" in safe, false);
  });

  test("website status panel exposes accessible frame progress copy", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/product/ui/HeadlessJobStatusPanel.tsx",
      ),
      "utf8",
    );
    assert.ok(src.includes("Rendering frame"));
    assert.ok(src.includes("toLocaleString()"));
    assert.ok(src.includes('aria-live="polite"'));
    assert.ok(src.includes("frameProgressLabel"));
  });

  test("frame facts prevent static 35 percent regression at mid-render", () => {
    const percent = deriveRenderingFrameProgressPercent(400, 1062);
    assert.ok(percent > HEADLESS_RENDERING_PROGRESS_FLOOR);
    let model = createInitialProductModel("headless");
    model = reduceHeadlessProduct(model, {
      type: "JOB_VIEW",
      runId: 0,
      view: renderingView({
        percent,
        completedFrames: 400,
        totalFrames: 1062,
      }),
    });
    assert.ok(
      (model.ctx.advisoryPercent ?? 0) > HEADLESS_RENDERING_PROGRESS_FLOOR,
    );
  });

  console.log(`\n${passed} passed\n`);
}

main();
