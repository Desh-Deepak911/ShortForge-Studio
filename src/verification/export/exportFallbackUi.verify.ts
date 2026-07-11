/**
 * Sprint 6F — Fallback UI contract (typed choices only, no auto-trigger).
 * Run: npm run test:export-fallback-ui
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveExportFallbackAudioOption } from "@/components/export/ExportFallbackActions";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

console.log("\nexport-fallback-ui (Sprint 6F)\n");

test("only typed fallbacks map to audioFallback options", () => {
  assert.equal(resolveExportFallbackAudioOption("retry"), undefined);
  assert.equal(resolveExportFallbackAudioOption("silent"), "silent");
  assert.equal(resolveExportFallbackAudioOption("voice-only"), "voice-only");
  assert.equal(resolveExportFallbackAudioOption("webm"), "webm");
});

test("ExportPanel wires fallback UI and requires user selection", () => {
  const panel = read("src/components/ExportPanel.tsx");
  assert.match(panel, /ExportFallbackActions/);
  assert.match(panel, /availableFallbacks/);
  assert.match(panel, /audioFallback/);
  // Must not auto-pick a reducing fallback on error.
  assert.doesNotMatch(
    panel,
    /setAvailableFallbacks\([\s\S]{0,80}audioFallback:\s*["']silent["']/,
  );
});

test("fallback component documents explicit choice", () => {
  const ui = read("src/components/export/ExportFallbackActions.tsx");
  assert.match(ui, /Nothing runs until you select one/);
  assert.match(ui, /availableFallbacks\.map/);
});

console.log(`\nexport-fallback-ui: ${passed} passed\n`);
