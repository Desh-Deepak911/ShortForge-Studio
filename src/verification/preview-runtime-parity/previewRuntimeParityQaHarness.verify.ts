/**
 * Preview runtime-parity QA harness isolation and data attributes.
 * Run: npm run test:preview-runtime-parity
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { isLocalDevQaHarnessAllowed } from "@/features/visual-retention/qa/assert-local-dev-qa-harness-allowed";
import { buildPreviewRuntimeParityHarnessStory } from "@/features/preview/runtime-parity/build-preview-runtime-parity-story";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

test("harness is unavailable outside local development", () => {
  assert.equal(isLocalDevQaHarnessAllowed("production"), false);
  assert.equal(isLocalDevQaHarnessAllowed("test"), false);
  assert.equal(isLocalDevQaHarnessAllowed(undefined), false);
  assert.equal(isLocalDevQaHarnessAllowed("development"), true);

  const page = readSrc("src/app/dev/preview-runtime-parity-qa/page.tsx");
  assert.match(page, /assertLocalDevQaHarnessAllowed/);
  assert.doesNotMatch(page, /["']use client["']/);
  assert.doesNotMatch(page, /href=.*preview-runtime-parity-qa/);
});

test("harness uses in-memory local fixtures and never claims visual Pass", () => {
  const harness = readSrc(
    "src/app/dev/preview-runtime-parity-qa/PreviewRuntimeParityQaHarness.tsx",
  );
  assert.match(harness, /data-preview-runtime-parity-qa-harness/);
  assert.match(harness, /data-preview-runtime-parity-playback-authority/);
  assert.match(harness, /data-preview-runtime-parity-inspection-media-id/);
  assert.match(harness, /data-preview-runtime-parity-mounted-ids/);
  assert.match(harness, /data-preview-runtime-parity-play/);
  assert.match(harness, /data-preview-runtime-parity-play-scene/);
  assert.match(harness, /data-preview-runtime-parity-stop/);
  assert.match(harness, /selectedMediaItemId/);
  assert.match(harness, /data-preview-runtime-parity-pause/);
  assert.match(harness, /data-preview-runtime-parity-seek/);
  assert.match(harness, /data-preview-runtime-parity-restart-scene/);
  assert.match(harness, /data-preview-runtime-parity-restart-story/);
  assert.match(harness, /data-preview-runtime-parity-select/);
  assert.match(harness, /data-preview-runtime-parity-remove/);
  assert.match(harness, /data-preview-runtime-parity-caption-anchor/);
  assert.match(harness, /data-preview-runtime-parity-cta-size/);
  assert.match(harness, /data-preview-runtime-parity-cta-kind/);
  assert.match(harness, /data-preview-runtime-parity-cta-checkpoint/);
  assert.match(harness, /data-preview-runtime-parity-cta-collision/);
  assert.match(harness, /data-preview-runtime-parity-cta-measurements/);
  assert.match(harness, /data-preview-runtime-parity-build-marker/);
  assert.match(harness, /PreviewRuntimeParityCtaCanvasReference/);
  assert.match(harness, /data-preview-runtime-parity-load-frozen-cert/);
  assert.match(harness, /data-preview-runtime-parity-export-browser/);
  assert.match(harness, /data-preview-runtime-parity-cert-capture/);
  assert.match(harness, /data-preview-runtime-parity-arm-cert-capture/);
  assert.match(harness, /__PREVIEW_RUNTIME_PARITY_SEEK_SNAPSHOT__/);
  assert.match(harness, /data-preview-runtime-parity-automatic-checks/);
  assert.match(harness, /data-preview-runtime-parity-visual-checks/);
  assert.match(harness, /never claim visual Pass/);
  assert.doesNotMatch(harness, /ffmpeg/i);
  assert.doesNotMatch(harness, /onSaveDraft/);
  const story = buildPreviewRuntimeParityHarnessStory();
  assert.equal(story.voiceoverUrl, undefined);
});

console.log("\nAll preview runtime-parity QA harness checks passed.");
