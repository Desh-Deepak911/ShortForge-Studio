/**
 * Sprint 6D — chunk renderer structural + global-frame semantics.
 * Run: npm run test:export-chunk-renderer
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildExportChunkPlan,
  listChunkFrameFilenames,
} from "@/features/export/chunking";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

console.log("\nexport-chunk-renderer (Sprint 6D)\n");

test("production silent visual uses chunked path", () => {
  const runtime = read("src/features/export/runtime/render-export.ts");
  assert.match(runtime, /renderChunkedSilentVisual/);
  assert.doesNotMatch(runtime, /normalizeSilentVisualFrameTiming/);
  assert.doesNotMatch(runtime, /startExportMediaRecorder/);
});

test("chunk renderer passes global frame index to prepareExportFrame", () => {
  const renderChunk = read("src/features/export/chunking/render-export-chunk.ts");
  assert.match(
    renderChunk,
    /globalFrameIndex\s*=\s*descriptor\.globalStartFrame\s*\+\s*local/,
  );
  assert.match(renderChunk, /prepareExportFrame\(\s*manifest,\s*plan,\s*globalFrameIndex/);
});

test("frame files are local to current chunk (zero-based)", () => {
  const names = listChunkFrameFilenames(3);
  assert.deepEqual(names, [
    "frame-000000.jpg",
    "frame-000001.jpg",
    "frame-000002.jpg",
  ]);
  const renderChunk = read("src/features/export/chunking/render-export-chunk.ts");
  assert.match(renderChunk, /buildChunkFrameFilename\(local\)/);
});

test("orchestration deletes chunk frames after encode", () => {
  const orch = read("src/features/export/chunking/render-chunked-silent-visual.ts");
  assert.match(orch, /cleanupExportChunkFrames/);
  assert.match(orch, /buildExportSegmentEncodeArgs/);
  assert.match(orch, /buildExportChunkConcatArgs|CONCAT_OUTPUT/);
  // Must not call full-project normalize extract.
  assert.doesNotMatch(orch, /normalizeSilentVisualFrameTiming/);
  assert.doesNotMatch(orch, /norm-frame-/);
});

test("no full-project JPEG residency in production path", () => {
  const orch = read("src/features/export/chunking/render-chunked-silent-visual.ts");
  assert.match(orch, /cleanupExportChunkFrames\(ffmpeg,\s*descriptor\)/);
  // Frames cleaned inside the per-chunk loop before next chunk.
  const encodeIdx = orch.indexOf("buildExportSegmentEncodeArgs");
  const cleanupIdx = orch.indexOf("cleanupExportChunkFrames(ffmpeg, descriptor)");
  assert.ok(encodeIdx >= 0 && cleanupIdx > encodeIdx);
});

test("cancellation checked before each chunk and frame", () => {
  const orch = read("src/features/export/chunking/render-chunked-silent-visual.ts");
  const frame = read("src/features/export/chunking/render-export-chunk.ts");
  assert.match(orch, /throwIfCancelled/);
  assert.match(frame, /throwIfCancelled/);
  assert.match(orch, /ExportCancelledError/);
});

test("chunk plan covers all global frames once", () => {
  const plan = buildExportChunkPlan({
    totalFrames: 305,
    fps: 30,
    width: 720,
    height: 1280,
    chunkSizeFrames: 120,
  });
  const covered = new Set<number>();
  for (const chunk of plan.chunks) {
    for (
      let g = chunk.globalStartFrame;
      g < chunk.globalEndFrameExclusive;
      g++
    ) {
      assert.equal(covered.has(g), false, `duplicate frame ${g}`);
      covered.add(g);
    }
  }
  assert.equal(covered.size, 305);
});

console.log(`\n${passed} tests passed.\n`);
