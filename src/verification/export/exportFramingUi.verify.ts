/**
 * Sprint 6G — Framing inspector layout: no Fit/Reposition overlap.
 * Run: npm run test:framing-ui
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

console.log("\nframing-ui (Sprint 6G)\n");

test("Fit/Fill control is separated from Reposition/Reset actions", () => {
  const source = read("src/features/editor/components/MediaFramingInspectorControls.tsx");

  // Segmented control is its own block — not inlined with action buttons.
  assert.match(source, /studioImageFitSegmentedControlStacked/);
  assert.match(source, /grid grid-cols-1 gap-2 sm:grid-cols-2/);
  assert.match(source, /Reset framing/);
  assert.match(source, /Reposition/);

  // Regression: previous layout put Fit + Reposition + Reset in one flex-row.
  assert.doesNotMatch(
    source,
    /flex flex-col gap-2 sm:flex-row sm:items-center[\s\S]*studioImageFitSegmentedControlStacked[\s\S]*Reposition[\s\S]*Reset framing/,
  );
});

test("action buttons use consistent full-width touch targets", () => {
  const source = read("src/features/editor/components/MediaFramingInspectorControls.tsx");
  assert.match(source, /min-h-\[2\.25rem\] w-full justify-center/);
  assert.match(source, /aria-pressed=\{repositionActive\}/);
  assert.match(source, /role="radiogroup"/);
  assert.match(source, /role="radio"/);
});

test("zoom and position controls remain accessible and labeled", () => {
  const source = read("src/features/editor/components/MediaFramingInspectorControls.tsx");
  assert.match(source, /aria-label=\{`\$\{mediaLabel\} horizontal position`\}/);
  assert.match(source, /aria-label=\{`\$\{mediaLabel\} vertical position`\}/);
  assert.match(source, /aria-label=\{`\$\{mediaLabel\} zoom`\}/);
  assert.match(source, /Zoom out/);
  assert.match(source, /Zoom in/);
});

test("shared framing inspector is wired for image and video", () => {
  const imageInspector = read("src/features/editor/components/SceneImageInspector.tsx");
  const videoInspector = read(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(imageInspector, /MediaFramingInspectorControls/);
  assert.match(videoInspector, /MediaFramingInspectorControls/);
});

console.log(`\nframing-ui: ${passed} passed\n`);
