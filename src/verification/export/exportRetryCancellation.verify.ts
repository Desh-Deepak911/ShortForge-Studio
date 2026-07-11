/**
 * Sprint 6F — Retry / cancellation / failure injection contract.
 * Run: npm run test:export-retry-cancellation
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ExportInjectedFailureError,
  consumeExportFailureInjection,
  getExportFailureInjection,
  setExportFailureInjection,
  throwIfExportFailureInjected,
} from "@/features/export/qa";
import { ExportFinalizationError } from "@/features/export/formats";
import { ExportCancelledError } from "@/features/export/runtime";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

console.log("\nexport-retry-cancellation (Sprint 6F)\n");

test("injection points consume once", () => {
  setExportFailureInjection("chunk-encode");
  assert.equal(getExportFailureInjection(), "chunk-encode");
  assert.equal(consumeExportFailureInjection("chunk-encode"), true);
  assert.equal(getExportFailureInjection(), null);
  assert.equal(consumeExportFailureInjection("chunk-encode"), false);
});

test("throwIfExportFailureInjected raises typed error", () => {
  setExportFailureInjection("audio-mux");
  assert.throws(
    () => throwIfExportFailureInjected("audio-mux"),
    (error: unknown) =>
      error instanceof ExportInjectedFailureError &&
      error.injectionPoint === "audio-mux",
  );
});

test("mismatched injection point is ignored", () => {
  setExportFailureInjection("concat");
  throwIfExportFailureInjected("audio-mux");
  assert.equal(getExportFailureInjection(), "concat");
  setExportFailureInjection(null);
});

test("failure matrix wired into production paths", () => {
  const chunked = read(
    "src/features/export/chunking/render-chunked-silent-visual.ts",
  );
  const render = read("src/features/export/runtime/render-export.ts");
  assert.match(chunked, /frame-serialization/);
  assert.match(chunked, /chunk-encode/);
  assert.match(chunked, /concat/);
  assert.match(chunked, /ffmpeg-worker-abort/);
  assert.match(render, /audio-mux/);
  assert.match(render, /artifact-validation/);
  assert.match(render, /cancellation/);
});

test("cancellation is typed ExportCancelledError", () => {
  const err = new ExportCancelledError("user cancel");
  assert.equal(err.name, "ExportCancelledError");
  assert.match(err.message, /cancel/i);
});

test("finalization errors expose fallbacks without auto-apply", () => {
  const err = new ExportFinalizationError("mux failed", {
    availableFallbacks: ["retry", "silent", "webm"],
  });
  assert.deepEqual(err.availableFallbacks, ["retry", "silent", "webm"]);
  const panel = read("src/components/ExportPanel.tsx");
  // Fallback UI must require explicit user choice — no automatic audioFallback.
  assert.doesNotMatch(panel, /audioFallback:\s*["']silent["']/);
  assert.doesNotMatch(panel, /audioFallback:\s*["']voice-only["']/);
});

test("poison recovery still present for retry safety", () => {
  const render = read("src/features/export/runtime/render-export.ts");
  assert.match(render, /markPoisoned/);
  assert.match(render, /markExportFfmpegRuntimePoisoned\(true\)/);
  assert.match(render, /context\.ffmpeg\.reset/);
});

setExportFailureInjection(null);
console.log(`\nexport-retry-cancellation: ${passed} passed\n`);
