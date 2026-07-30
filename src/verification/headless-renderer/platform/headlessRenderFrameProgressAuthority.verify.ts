/**
 * Sprint 11E Phase 2G.25A — unified headless export progress authority.
 * Run: npm run test:headless-render-frame-progress-authority
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  classifyHeadlessMissingFrameTelemetry,
  deriveHeadlessGlobalProgressPercent,
  deriveHeadlessMaterializeProgressPercent,
  mapHeadlessPreparationLocalPercent,
} from "@/features/headless-renderer/domain/headless-export-progress-authority";
import { parseHeadlessProgress } from "@/features/headless-renderer/domain/headless-field-validators";
import {
  HEADLESS_ENCODING_PROGRESS_PERCENT,
  HEADLESS_MAX_ADVISORY_FRAME_COUNT,
  HEADLESS_PREPARATION_PROGRESS_MAX,
  HEADLESS_RENDERING_PROGRESS_CEILING,
  HEADLESS_RENDERING_PROGRESS_FLOOR,
  HEADLESS_SUCCEEDED_PROGRESS_PERCENT,
  HEADLESS_UPLOADING_PROGRESS_PERCENT,
  HEADLESS_VALIDATING_PROGRESS_PERCENT,
} from "@/features/headless-renderer/domain/headless-render-constants";
import { toHeadlessPublicJobView } from "@/features/headless-renderer/control-plane/services/safe-job-view";
import type { HeadlessRenderJobV1 } from "@/features/headless-renderer/domain/headless-render.types";
import { validateHeadlessPublicJobView } from "@/features/headless-renderer/product/client/validate-public-job-view";
import {
  reduceHeadlessProduct,
  statusLabelForProductState,
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
  state?: "rendering" | "encoding" | "validating" | "uploading" | "queued" | "succeeded";
}) {
  return {
    version: 1 as const,
    jobId: "job-12345678",
    state: input.state ?? ("rendering" as const),
    createdAtMs: 1,
    updatedAtMs: input.updatedAtMs ?? 2,
    progress: {
      percent: input.percent,
      stage: input.state ?? "rendering",
      ...(input.completedFrames != null ? { completedFrames: input.completedFrames } : {}),
      ...(input.totalFrames != null ? { totalFrames: input.totalFrames } : {}),
    },
    terminalReason: null,
    artifactAvailable: input.state === "succeeded",
    cancelAccepted: input.state !== "succeeded",
  };
}

function main() {
  console.log("\nSprint 11E Phase 2G.25A — headless export progress authority\n");

  test("preparation local 92 maps to global 35 max", () => {
    assert.equal(mapHeadlessPreparationLocalPercent(92), HEADLESS_PREPARATION_PROGRESS_MAX);
    assert.equal(deriveHeadlessMaterializeProgressPercent(92), HEADLESS_PREPARATION_PROGRESS_MAX);
  });

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
    assert.equal(deriveRenderingFrameProgressPercent(531, 1062), 61);
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

  test("rendering progress maps monotonically across the 40–82 band", () => {
    let prev: number = HEADLESS_RENDERING_PROGRESS_FLOOR;
    for (let c = 1; c <= 72; c += 1) {
      const next = deriveRenderingFrameProgressPercent(c, 72);
      assert.ok(next >= prev);
      prev = next;
    }
    assert.ok(prev <= HEADLESS_RENDERING_PROGRESS_CEILING);
  });

  test("rendering percent range is restricted to 40 through 82", () => {
    for (const total of [72, 1062, 1812]) {
      for (let c = 1; c <= total; c += Math.max(1, Math.floor(total / 40))) {
        const percent = deriveRenderingFrameProgressPercent(c, total);
        assert.ok(percent >= HEADLESS_RENDERING_PROGRESS_FLOOR);
        assert.ok(percent <= HEADLESS_RENDERING_PROGRESS_CEILING);
      }
    }
  });

  test("encoding begins above frame-capture progress", () => {
    assert.equal(HEADLESS_ENCODING_PROGRESS_PERCENT, 85);
    assert.ok(
      deriveRenderingFrameProgressPercent(1062, 1062) <
        HEADLESS_ENCODING_PROGRESS_PERCENT,
    );
    assert.ok(
      deriveRenderingFrameProgressPercent(1812, 1812) <
        HEADLESS_ENCODING_PROGRESS_PERCENT,
    );
  });

  test("artifact finalization remains below 100", () => {
    assert.ok(HEADLESS_VALIDATING_PROGRESS_PERCENT < HEADLESS_SUCCEEDED_PROGRESS_PERCENT);
    assert.ok(HEADLESS_UPLOADING_PROGRESS_PERCENT < HEADLESS_SUCCEEDED_PROGRESS_PERCENT);
    assert.equal(
      deriveHeadlessGlobalProgressPercent({
        state: "uploading",
        progress: { percent: 97, stage: "uploading" },
      }),
      HEADLESS_UPLOADING_PROGRESS_PERCENT,
    );
  });

  test("durable succeeded CAS produces exactly 100", () => {
    assert.equal(
      deriveHeadlessGlobalProgressPercent({
        state: "succeeded",
        progress: { percent: 99, stage: "uploading" },
      }),
      100,
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
      view: renderingView({ percent: 55 }),
    });
    assert.equal(model.ctx.advisoryPercent, 55);
    assert.equal(model.ctx.advisoryCompletedFrames, null);
    assert.equal(model.ctx.advisoryTotalFrames, null);
  });

  test("write throttling skips duplicate percent within interval", () => {
    assert.equal(
      shouldEmitFrameProgressWrite({
        lastEmittedPercent: 50,
        nextPercent: 50,
        completedFrames: 20,
        totalFrames: 72,
        lastWriteAtMs: 100,
        nowMs: 100 + HEADLESS_FRAME_PROGRESS_MIN_WRITE_INTERVAL_MS - 1,
      }),
      false,
    );
    assert.equal(
      shouldEmitFrameProgressWrite({
        lastEmittedPercent: 50,
        nextPercent: 51,
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
    assert.equal(maxDistinct, 43);
    for (const total of [72, 1062, 1812]) {
      const writes = simulateFrameProgressWriteCount({ totalFrames: total });
      assert.ok(writes <= 43, `writes=${writes} total=${total}`);
      assert.ok(writes >= 2, `writes=${writes} total=${total}`);
    }
  });

  test("first and final frame transitions may emit despite interval throttle", () => {
    assert.equal(
      shouldEmitFrameProgressWrite({
        lastEmittedPercent: HEADLESS_RENDERING_PROGRESS_FLOOR,
        nextPercent: HEADLESS_RENDERING_PROGRESS_FLOOR,
        completedFrames: 1,
        totalFrames: 72,
        lastWriteAtMs: 100,
        nowMs: 150,
      }),
      false,
    );
    assert.equal(
      shouldEmitFrameProgressWrite({
        lastEmittedPercent: 81,
        nextPercent: HEADLESS_RENDERING_PROGRESS_CEILING,
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
        percent: 44,
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
    assert.equal(model.ctx.advisoryPercent, 44);
  });

  test("polling the same frame count does not move progress", () => {
    let model = createInitialProductModel("headless");
    model = reduceHeadlessProduct(model, {
      type: "JOB_VIEW",
      runId: 0,
      view: renderingView({
        percent: deriveRenderingFrameProgressPercent(36, 72),
        completedFrames: 36,
        totalFrames: 72,
      }),
    });
    const first = model.ctx.advisoryPercent;
    model = reduceHeadlessProduct(model, {
      type: "JOB_VIEW",
      runId: 0,
      view: renderingView({
        percent: deriveRenderingFrameProgressPercent(36, 72),
        completedFrames: 36,
        totalFrames: 72,
        updatedAtMs: 3,
      }),
    });
    assert.equal(model.ctx.advisoryPercent, first);
  });

  test("preparation 92 followed by frame 1/72 does not remain at 92", () => {
    let model = createInitialProductModel("headless");
    model = reduceHeadlessProduct(model, {
      type: "MATERIALIZE_PROGRESS",
      runId: 0,
      phase: "uploading",
      percent: 92,
      message: "Uploads complete. Verifying durable asset coverage…",
    });
    assert.equal(model.ctx.advisoryPercent, HEADLESS_PREPARATION_PROGRESS_MAX);
    model = reduceHeadlessProduct(model, {
      type: "JOB_VIEW",
      runId: 0,
      view: renderingView({
        percent: HEADLESS_RENDERING_PROGRESS_FLOOR,
        completedFrames: 1,
        totalFrames: 72,
      }),
    });
    assert.ok((model.ctx.advisoryPercent ?? 0) > HEADLESS_PREPARATION_PROGRESS_MAX);
    assert.equal(model.ctx.advisoryCompletedFrames, 1);
    assert.equal(model.ctx.advisoryTotalFrames, 72);
  });

  test("realistic regression sequence advances monotonically past preparation", () => {
    let model = createInitialProductModel("headless");
    const runId = 0;
    model = reduceHeadlessProduct(model, {
      type: "MATERIALIZE_PROGRESS",
      runId,
      phase: "uploading",
      percent: 92,
    });
    assert.equal(model.ctx.advisoryPercent, 35);
    const steps = [
      { state: "queued" as const, percent: 37, frames: null as null },
      { state: "rendering" as const, percent: 40, frames: [1, 72] as const },
      { state: "rendering" as const, percent: 61, frames: [36, 72] as const },
      { state: "rendering" as const, percent: 82, frames: [72, 72] as const },
      { state: "encoding" as const, percent: 85, frames: null as null },
      { state: "validating" as const, percent: 93, frames: null as null },
      { state: "uploading" as const, percent: 97, frames: null as null },
      { state: "succeeded" as const, percent: 100, frames: null as null },
    ];
    let prev = model.ctx.advisoryPercent ?? 0;
    for (const step of steps) {
      model = reduceHeadlessProduct(model, {
        type: "JOB_VIEW",
        runId,
        view: {
          version: 1,
          jobId: "job-12345678",
          state: step.state,
          createdAtMs: 1,
          updatedAtMs: Date.now(),
          progress:
            step.frames == null
              ? { percent: step.percent, stage: step.state }
              : {
                  percent: step.percent,
                  stage: step.state,
                  completedFrames: step.frames[0],
                  totalFrames: step.frames[1],
                },
          terminalReason: null,
          artifactAvailable: step.state === "succeeded",
          cancelAccepted: step.state !== "succeeded",
        },
      });
      assert.ok(
        (model.ctx.advisoryPercent ?? 0) >= prev,
        `regressed at ${step.state}`,
      );
      if (step.state === "rendering" && step.frames?.[0] === 1) {
        assert.notEqual(model.ctx.advisoryPercent, 92);
      }
      prev = model.ctx.advisoryPercent ?? prev;
    }
    assert.equal(model.ctx.advisoryPercent, 100);
    assert.equal(model.state, "succeeded");
  });

  test("cancellation preserves last valid rendering progress", () => {
    let model = createInitialProductModel("headless");
    const percent = deriveRenderingFrameProgressPercent(300, 1062);
    model = reduceHeadlessProduct(model, {
      type: "JOB_VIEW",
      runId: 0,
      view: renderingView({
        percent,
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
    assert.equal(model.state, "cancelled");
    assert.equal(model.ctx.advisoryPercent, percent);
    assert.equal(model.ctx.advisoryCompletedFrames, 300);
    assert.equal(model.ctx.advisoryTotalFrames, 1062);
  });

  test("failure during rendering becomes terminal and does not remain rendering", () => {
    let model = createInitialProductModel("headless");
    model = reduceHeadlessProduct(model, {
      type: "JOB_VIEW",
      runId: 0,
      view: renderingView({
        percent: deriveRenderingFrameProgressPercent(500, 1062),
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
    assert.notEqual(statusLabelForProductState(model.state), "Rendering video");
    assert.equal(model.ctx.jobView?.progress, null);
  });

  test("public status DTO exposes only safe frame counts", () => {
    const view = validateHeadlessPublicJobView(
      renderingView({
        percent: 61,
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

  test("frame count updates survive public job-view serialization", () => {
    const job = {
      jobId: "job-12345678",
      state: "rendering",
      progress: {
        percent: 61,
        stage: "rendering",
        updatedAtMs: 1,
        completedFrames: 36,
        totalFrames: 72,
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
    const validated = validateHeadlessPublicJobView({
      version: 1,
      jobId: safe.jobId,
      state: safe.state,
      createdAtMs: safe.createdAtMs,
      updatedAtMs: safe.updatedAtMs,
      progress: safe.progress,
      terminalReason: null,
      artifactAvailable: false,
      cancelAccepted: true,
    });
    assert.equal(validated?.progress?.completedFrames, 36);
    assert.equal(validated?.progress?.totalFrames, 72);
  });

  test("control-plane safe view strips private authority fields", () => {
    const job = {
      jobId: "job-12345678",
      state: "rendering",
      progress: {
        percent: 61,
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

  test("missing frame telemetry produces bounded safe state", () => {
    assert.equal(
      classifyHeadlessMissingFrameTelemetry({
        state: "rendering",
        completedFrames: null,
        totalFrames: null,
        pollsWithoutFrameTelemetry: 1,
      }),
      "awaiting_first_poll",
    );
    assert.equal(
      classifyHeadlessMissingFrameTelemetry({
        state: "rendering",
        completedFrames: null,
        totalFrames: null,
        pollsWithoutFrameTelemetry: 3,
      }),
      "missing_after_bounded_polls",
    );
    let model = createInitialProductModel("headless");
    for (let i = 0; i < 3; i += 1) {
      model = reduceHeadlessProduct(model, {
        type: "JOB_VIEW",
        runId: 0,
        view: renderingView({ percent: HEADLESS_RENDERING_PROGRESS_FLOOR }),
      });
    }
    assert.equal(model.ctx.renderingPollsWithoutFrameTelemetry, 3);
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
    assert.ok(src.includes('className="sr-only"'));
    assert.ok(src.includes("frameProgressLabel"));
    assert.ok(src.includes("data-headless-frame-telemetry"));
    assert.equal(
      (src.match(/statusDescriptionForProductState\("rendering"\)/g) ?? []).length,
      1,
    );
  });

  test("duplicate rendering description is not rendered in status panel", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/product/ui/HeadlessJobStatusPanel.tsx",
      ),
      "utf8",
    );
    assert.ok(src.includes("showFrameProgress"));
    assert.ok(src.includes("? frameProgressLabel"));
    assert.equal(src.includes("{label}. ${announcedMessage}"), false);
  });

  test("frame facts prevent static preparation percent regression at mid-render", () => {
    const percent = deriveRenderingFrameProgressPercent(400, 1062);
    assert.ok(percent > HEADLESS_RENDERING_PROGRESS_FLOOR);
    let model = createInitialProductModel("headless");
    model = reduceHeadlessProduct(model, {
      type: "MATERIALIZE_PROGRESS",
      runId: 0,
      phase: "uploading",
      percent: 92,
    });
    model = reduceHeadlessProduct(model, {
      type: "JOB_VIEW",
      runId: 0,
      view: renderingView({
        percent,
        completedFrames: 400,
        totalFrames: 1062,
      }),
    });
    assert.ok((model.ctx.advisoryPercent ?? 0) > HEADLESS_PREPARATION_PROGRESS_MAX);
    assert.ok((model.ctx.advisoryPercent ?? 0) > HEADLESS_RENDERING_PROGRESS_FLOOR);
  });

  console.log(`\n${passed} passed\n`);
}

main();
