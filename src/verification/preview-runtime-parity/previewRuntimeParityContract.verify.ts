/**
 * Preview runtime-parity contract structure.
 * Run: npm run test:preview-runtime-parity
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PREVIEW_RUNTIME_PARITY_DEFECT_IDS,
  PREVIEW_RUNTIME_PARITY_INVARIANT_IDS,
  PREVIEW_RUNTIME_PARITY_INVARIANTS,
  PREVIEW_RUNTIME_PARITY_OUTPUT_HEIGHT,
  PREVIEW_RUNTIME_PARITY_OUTPUT_WIDTH,
  PREVIEW_RUNTIME_PARITY_PHONE_WIDTHS_PX,
  PREVIEW_RUNTIME_PARITY_PROMPT2_PRODUCTION_FILES,
} from "@/features/preview/runtime-parity/preview-runtime-parity-contract";
import { PREVIEW_RUNTIME_PARITY_STATE_IDS } from "@/features/preview/runtime-parity/preview-runtime-parity-states";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

test("output space is 1080×1920 and phone widths include 220/260/360", () => {
  assert.equal(PREVIEW_RUNTIME_PARITY_OUTPUT_WIDTH, 1080);
  assert.equal(PREVIEW_RUNTIME_PARITY_OUTPUT_HEIGHT, 1920);
  assert.deepEqual([...PREVIEW_RUNTIME_PARITY_PHONE_WIDTHS_PX], [220, 260, 360]);
});

test("contract names every required defect, invariant, and explicit state", () => {
  assert.equal(PREVIEW_RUNTIME_PARITY_DEFECT_IDS.length, 7);
  assert.equal(PREVIEW_RUNTIME_PARITY_INVARIANT_IDS.length, 12);
  assert.equal(PREVIEW_RUNTIME_PARITY_INVARIANTS.length, 12);
  assert.ok(PREVIEW_RUNTIME_PARITY_STATE_IDS.includes("selected-media-item-for-inspection"));
  assert.ok(PREVIEW_RUNTIME_PARITY_STATE_IDS.includes("playback-active-media"));
  assert.ok(PREVIEW_RUNTIME_PARITY_STATE_IDS.includes("removed-or-no-longer-authoritative-media"));
});

const PREVIEW_RUNTIME_PARITY_WIRED_FILES = new Set([
  "src/features/preview/components/PreviewFrame.tsx",
  "src/features/preview/components/VideoPreview.tsx",
  "src/features/preview/hooks/usePreviewPlayback.ts",
  "src/features/editor/components/SceneFrameVideo.tsx",
]);

const PREVIEW_RUNTIME_PARITY_INSPECTION_FILES = new Set([
  "src/features/preview/components/PreviewFrame.tsx",
  "src/features/preview/components/VideoPreview.tsx",
]);

test("Prompt 2/3 production targets exist; unwired files stay free of the contract path", () => {
  for (const relativePath of PREVIEW_RUNTIME_PARITY_PROMPT2_PRODUCTION_FILES) {
    const source = readFileSync(join(process.cwd(), relativePath), "utf8");
    assert.ok(source.length > 0, relativePath);
    if (PREVIEW_RUNTIME_PARITY_WIRED_FILES.has(relativePath)) {
      assert.match(source, /preview\/runtime-parity/);
      if (!PREVIEW_RUNTIME_PARITY_INSPECTION_FILES.has(relativePath)) {
        assert.doesNotMatch(source, /selectedMediaItemId/);
      }
      continue;
    }
    assert.doesNotMatch(source, /preview-runtime-parity/);
  }
});

test("contract does not add a barrel or second timing engine", () => {
  const contract = readFileSync(
    join(process.cwd(), "src/features/preview/runtime-parity/preview-runtime-parity-contract.ts"),
    "utf8",
  );
  assert.doesNotMatch(contract, /createPreviewEngine/);
  assert.doesNotMatch(contract, /preview intelligence/i);
});

console.log(`\nAll preview runtime-parity contract checks passed (${passed}).`);
