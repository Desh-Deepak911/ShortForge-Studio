/**
 * Sprint 6D — FFmpeg poison classification and recovery wiring.
 * Run: npm run test:export-ffmpeg-recovery
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  classifyExportFfmpegFailure,
  isExportFfmpegPoisonFailure,
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

console.log("\nexport-ffmpeg-recovery (Sprint 6D)\n");

test("worker abort marks poison class", () => {
  assert.equal(
    classifyExportFfmpegFailure(new Error("Worker aborted")),
    "FFMPEG_WORKER_ABORTED",
  );
  assert.equal(isExportFfmpegPoisonFailure("FFMPEG_WORKER_ABORTED"), true);
});

test("OOM marks poison class", () => {
  assert.equal(
    classifyExportFfmpegFailure(new Error("Cannot enlarge memory arrays")),
    "FFMPEG_OUT_OF_MEMORY",
  );
  assert.equal(
    classifyExportFfmpegFailure(new Error("out of memory")),
    "FFMPEG_OUT_OF_MEMORY",
  );
  assert.equal(isExportFfmpegPoisonFailure("FFMPEG_OUT_OF_MEMORY"), true);
});

test("command failure is typed but not always poison-reset class", () => {
  assert.equal(
    classifyExportFfmpegFailure(new Error("exit code 1")),
    "FFMPEG_COMMAND_FAILED",
  );
});

test("output missing classification", () => {
  assert.equal(
    classifyExportFfmpegFailure(new Error("file not found")),
    "FFMPEG_OUTPUT_MISSING",
  );
});

test("chunked path marks poison and resets runtime", () => {
  const orch = read("src/features/export/chunking/render-chunked-silent-visual.ts");
  assert.match(orch, /markPoisoned/);
  assert.match(orch, /markExportFfmpegRuntimePoisoned\(true\)/);
  assert.match(orch, /context\.ffmpeg\.reset|resetFFmpeg/);
  assert.match(orch, /poisonAndReset/);
  assert.match(orch, /isExportFfmpegPoisonFailure/);
});

test("mux failure marks poison and resets", () => {
  const render = read("src/features/export/runtime/render-export.ts");
  assert.match(render, /markPoisoned/);
  assert.match(render, /markExportFfmpegRuntimePoisoned\(true\)/);
  assert.match(render, /context\.ffmpeg\.reset/);
});

test("cancellation resets without treating as export failure poison path", () => {
  const orch = read("src/features/export/chunking/render-chunked-silent-visual.ts");
  assert.match(orch, /ExportCancelledError/);
  // Cancel path resets ffmpeg but does not mark poison before throw.
  const cancelBlock = orch.slice(orch.indexOf("ExportCancelledError"));
  assert.match(cancelBlock, /resetFFmpeg/);
});

test("dispose resets poisoned runtime for clean retry", () => {
  const dispose = read("src/features/export/runtime/dispose-export-render-context.ts");
  assert.match(dispose, /isPoisoned/);
  assert.match(dispose, /ffmpeg\.reset/);
  const create = read("src/features/export/runtime/create-export-render-context.ts");
  assert.match(create, /markPoisoned/);
  assert.match(create, /resetFFmpeg/);
});

test("retry contract: new export creates context after dispose", () => {
  const service = read("src/features/export/services/video-render.service.ts");
  assert.match(service, /createExportRenderContext/);
  assert.match(service, /disposeExportRenderContext/);
  assert.match(service, /finally/);
});

console.log(`\n${passed} tests passed.\n`);
