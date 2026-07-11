/**
 * Sprint 6D — deterministic chunk plan.
 * Run: npm run test:export-chunk-plan
 */
import assert from "node:assert/strict";

import {
  assertExportChunkPlanCoverage,
  buildExportChunkPlan,
  EXPORT_CHUNK_FRAMES_1080P,
  EXPORT_CHUNK_FRAMES_720P,
  EXPORT_CHUNKED_RENDERER_VERSION,
  resolveExportChunkSizeFrames,
} from "@/features/export/chunking";
import { resolveExportFrameTimestampMs } from "@/features/export/timing";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("\nexport-chunk-plan (Sprint 6D)\n");

test("exact ranges with no gaps or overlaps", () => {
  const plan = buildExportChunkPlan({
    totalFrames: 250,
    fps: 30,
    width: 720,
    height: 1280,
    chunkSizeFrames: 120,
  });
  assert.equal(plan.chunks.length, 3);
  assert.equal(plan.chunks[0]!.globalStartFrame, 0);
  assert.equal(plan.chunks[0]!.globalEndFrameExclusive, 120);
  assert.equal(plan.chunks[1]!.globalStartFrame, 120);
  assert.equal(plan.chunks[1]!.globalEndFrameExclusive, 240);
  assert.equal(plan.chunks[2]!.globalStartFrame, 240);
  assert.equal(plan.chunks[2]!.globalEndFrameExclusive, 250);
  assert.equal(plan.chunks[2]!.frameCount, 10);
  assertExportChunkPlanCoverage(plan);
});

test("final partial chunk works", () => {
  const plan = buildExportChunkPlan({
    totalFrames: 121,
    fps: 30,
    width: 720,
    height: 1280,
    chunkSizeFrames: 120,
  });
  assert.equal(plan.chunks.length, 2);
  assert.equal(plan.chunks[1]!.frameCount, 1);
  assert.equal(plan.chunks[1]!.globalStartFrame, 120);
});

test("determinism — same input yields same boundaries", () => {
  const a = buildExportChunkPlan({
    totalFrames: 960,
    fps: 30,
    width: 720,
    height: 1280,
  });
  const b = buildExportChunkPlan({
    totalFrames: 960,
    fps: 30,
    width: 720,
    height: 1280,
  });
  assert.deepEqual(a.chunks, b.chunks);
  assert.equal(a.rendererVersion, EXPORT_CHUNKED_RENDERER_VERSION);
});

test("720p policy uses 120-frame baseline", () => {
  assert.equal(
    resolveExportChunkSizeFrames({ width: 720, height: 1280 }),
    EXPORT_CHUNK_FRAMES_720P,
  );
});

test("1080p policy uses tighter chunk size", () => {
  assert.equal(
    resolveExportChunkSizeFrames({ width: 1080, height: 1920 }),
    EXPORT_CHUNK_FRAMES_1080P,
  );
  assert.ok(EXPORT_CHUNK_FRAMES_1080P <= EXPORT_CHUNK_FRAMES_720P);
});

test("different durations scale chunk count", () => {
  const short = buildExportChunkPlan({
    totalFrames: 60,
    fps: 30,
    width: 720,
    height: 1280,
    chunkSizeFrames: 120,
  });
  const long = buildExportChunkPlan({
    totalFrames: 960,
    fps: 30,
    width: 720,
    height: 1280,
    chunkSizeFrames: 120,
  });
  assert.equal(short.chunks.length, 1);
  assert.equal(long.chunks.length, 8);
});

test("frame-center timing preserved at chunk boundaries", () => {
  const fps = 30;
  const plan = buildExportChunkPlan({
    totalFrames: 240,
    fps,
    width: 720,
    height: 1280,
    chunkSizeFrames: 120,
  });
  const boundary = plan.chunks[1]!.globalStartFrame;
  assert.equal(boundary, 120);
  assert.equal(
    plan.chunks[0]!.endTimestampMs,
    resolveExportFrameTimestampMs(119, fps),
  );
  assert.equal(
    plan.chunks[1]!.startTimestampMs,
    resolveExportFrameTimestampMs(120, fps),
  );
  // No duplicate: frame 119 only in chunk 0, 120 only in chunk 1.
  assert.equal(plan.chunks[0]!.globalEndFrameExclusive, 120);
});

test("empty project yields empty plan", () => {
  const plan = buildExportChunkPlan({
    totalFrames: 0,
    fps: 30,
    width: 720,
    height: 1280,
  });
  assert.equal(plan.chunks.length, 0);
  assertExportChunkPlanCoverage(plan);
});

console.log(`\n${passed} tests passed.\n`);
