/**
 * Sprint 6D — segment concat contract.
 * Run: npm run test:export-chunk-concat
 */
import assert from "node:assert/strict";

import {
  assertOrderedChunkSegments,
  buildExportChunkConcatArgs,
  buildExportChunkConcatList,
  buildExportChunkPlan,
  toEncodedExportChunk,
  validateConcatenatedVisual,
} from "@/features/export/chunking";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("\nexport-chunk-concat (Sprint 6D)\n");

test("ordered segment list", () => {
  const plan = buildExportChunkPlan({
    totalFrames: 250,
    fps: 30,
    width: 720,
    height: 1280,
    chunkSizeFrames: 120,
  });
  const encoded = plan.chunks.map((c) => toEncodedExportChunk(c, 10_000, 30));
  assertOrderedChunkSegments(encoded);
  const list = buildExportChunkConcatList(encoded);
  assert.match(list, /file 'segment-000\.webm'/);
  assert.match(list, /file 'segment-001\.webm'/);
  assert.match(list, /file 'segment-002\.webm'/);
  assert.ok(list.indexOf("segment-000") < list.indexOf("segment-001"));
});

test("stream-copy concat args", () => {
  const args = buildExportChunkConcatArgs({});
  assert.equal(args[args.indexOf("-f") + 1], "concat");
  assert.ok(args.includes("-c"));
  assert.equal(args[args.indexOf("-c") + 1], "copy");
  assert.ok(args.includes("-an"));
});

test("continuous duration from totalFrames/FPS", () => {
  const totalFrames = 250;
  const fps = 30;
  const result = validateConcatenatedVisual({
    totalFrames,
    fps,
    byteSize: 100_000,
    segmentCount: 3,
  });
  assert.equal(result.ok, true);
  assert.equal(result.expectedDurationSec, totalFrames / fps);
});

test("missing segment / empty concat fails", () => {
  assert.equal(
    validateConcatenatedVisual({
      totalFrames: 120,
      fps: 30,
      byteSize: 100_000,
      segmentCount: 0,
    }).ok,
    false,
  );
  assert.equal(
    validateConcatenatedVisual({
      totalFrames: 120,
      fps: 30,
      byteSize: 10,
      segmentCount: 1,
    }).ok,
    false,
  );
});

test("gap between segments throws", () => {
  const plan = buildExportChunkPlan({
    totalFrames: 240,
    fps: 30,
    width: 720,
    height: 1280,
    chunkSizeFrames: 120,
  });
  const encoded = plan.chunks.map((c) => toEncodedExportChunk(c, 10_000, 30));
  const broken = [
    encoded[0]!,
    {
      ...encoded[1]!,
      descriptor: {
        ...encoded[1]!.descriptor,
        globalStartFrame: 130,
      },
    },
  ];
  assert.throws(() => assertOrderedChunkSegments(broken));
});

test("final partial segment included", () => {
  const plan = buildExportChunkPlan({
    totalFrames: 125,
    fps: 30,
    width: 720,
    height: 1280,
    chunkSizeFrames: 120,
  });
  assert.equal(plan.chunks.length, 2);
  assert.equal(plan.chunks[1]!.frameCount, 5);
  const encoded = plan.chunks.map((c) => toEncodedExportChunk(c, 8_000, 30));
  assertOrderedChunkSegments(encoded);
  assert.equal(
    encoded.reduce((sum, c) => sum + c.frameCount, 0),
    125,
  );
});

console.log(`\n${passed} tests passed.\n`);
