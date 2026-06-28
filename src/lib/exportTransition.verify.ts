/**
 * Export transition canvas verification (run: npm run test:export-transition).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getExportTransitionLayerDrawStates } from "@/features/export/utils/export-transition-canvas.utils";
import { getTransitionLayerStyles } from "@/features/preview/utils/previewTimeline";

const root = process.cwd();

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

console.log("export-transition");

test("export transition utils mirror preview layer styles for fade", () => {
  const preview = getTransitionLayerStyles("fade", 0.4);
  const exportLayers = getExportTransitionLayerDrawStates("fade", 0.4);

  assert.equal(exportLayers.from.opacity, preview.from.opacity);
  assert.equal(exportLayers.to.opacity, preview.to.opacity);
});

test("export transition utils parse slide transforms", () => {
  const layers = getExportTransitionLayerDrawStates("slide-left", 0.25);

  assert.equal(layers.from.translateXRatio, -0.25);
  assert.equal(layers.to.translateXRatio, 0.75);
});

test("export transition utils parse zoom and blur", () => {
  const zoomOut = getExportTransitionLayerDrawStates("zoom-out", 0.5);
  assert.equal(zoomOut.from.scale, 0.96);
  assert.equal(zoomOut.from.opacity, 0.5);

  const blur = getExportTransitionLayerDrawStates("blur", 0.5);
  assert.equal(blur.from.blurPx, 4);
  assert.equal(blur.to.blurPx, 4);
});

test("video render uses overlay map and hides captions during transition", () => {
  const source = readFileSync(
    join(root, "src/features/export/services/video-render.service.ts"),
    "utf8",
  );

  assert.match(source, /resolveTimelineTransitionOverlay/);
  assert.match(source, /drawExportTransitionBackgrounds/);
  assert.match(source, /if \(transitionOverlay\)/);
  assert.doesNotMatch(source, /TRANSITION_CARD_TITLE/);
});

console.log("\nAll export transition checks passed.");
