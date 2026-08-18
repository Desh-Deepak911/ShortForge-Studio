/**
 * Desired Preview invariants across Prompts 2–5.
 * Run: npm run test:preview-runtime-parity-desired
 *
 * Prompt 2: removed-media and clock/replay assertions pass.
 * Prompt 3: selected-media inspection assertions pass.
 * Prompt 4: centered caption geometry assertions pass.
 * Prompt 5: provider-free CTA inner-screen contract is asserted here.
 * Browser visual Pass is recorded by the Prompt 5 cert, not this gate.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { measureCtaInnerScreenVersusHost } from "@/features/preview/runtime-parity/measure-preview-cta-measured-parity";
import { measureCurrentPreviewCaptionOverlayShrink } from "@/features/preview/runtime-parity/measure-preview-caption-geometry";
import {
  buildPreviewRuntimeParityStory,
  buildThreeVideoEqualWindowScene,
} from "@/features/preview/runtime-parity/build-preview-runtime-parity-story";
import {
  collectReconciledPreviewMountedLayers,
  inventoryContainsMedia,
} from "@/features/preview/runtime-parity/collect-authoritative-preview-mounted-layers";
import { resolvePreviewClockAfterSceneSelection } from "@/features/preview/runtime-parity/reconcile-preview-playback-clock";
import { resolveCurrentPreviewPlaybackPresentation } from "@/features/preview/runtime-parity/resolve-preview-presentation-authority";
import {
  removeSceneMediaItem,
  resolvePreviewSceneMediaWindows,
} from "@/features/scene-media-timeline";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  ✗ ${name}`);
    console.log(`    ${message}`);
  }
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

test("desired: removed current media disappears from the reconciled Preview plan", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = resolvePreviewSceneMediaWindows(scene, {
    mixedMediaScenesEnabled: true,
  });
  const visible = windows[0]!;
  const removed = removeSceneMediaItem(scene, visible.itemId).scene;
  const after = collectReconciledPreviewMountedLayers({
    scene: removed,
    sceneElapsedMs: visible.startMs + 200,
    isPlaying: false,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(
    inventoryContainsMedia(after, {
      mediaItemId: visible.itemId,
      mediaUrl: visible.media.url,
    }),
    false,
  );
});

test("desired: completed story selection returns to the earlier scene start", () => {
  const story = buildPreviewRuntimeParityStory("clock-lifecycle-two-scenes");
  const selected = resolvePreviewClockAfterSceneSelection({
    scenes: story.scenes,
    sceneIndex: 0,
    timelineMs: 20_000,
    clockKind: "completed-story",
    isPlaying: false,
  });
  assert.ok(selected);
  assert.equal(selected.kind, "idle");
  assert.equal(selected.timelineMs, story.scenes[0]?.startMs ?? 0);
});

test("desired: production PreviewFrame can present a selected inspection item", () => {
  const source = readSrc("src/features/preview/components/PreviewFrame.tsx");
  assert.match(
    source,
    /selectedMediaItemId/,
    "PreviewFrame does not yet accept a selected inspection identity",
  );
});

test("desired: idle selection of item 2 changes current production playback media", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = resolvePreviewSceneMediaWindows(scene, {
    mixedMediaScenesEnabled: true,
  });
  const current = resolveCurrentPreviewPlaybackPresentation({
    scene,
    sceneElapsedMs: 200,
    isPlaying: false,
    selectedMediaItemId: windows[1]?.itemId,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(
    current.playbackMedia.mediaItemId,
    windows[1]?.itemId,
    "current production playback media still follows the scene clock, not idle selection",
  );
});

test("desired: CTA certification normalizes against the inner 9:16 screen, not the host", () => {
  const host = measureCtaInnerScreenVersusHost(260);
  assert.equal(host.innerWidthPx, 244);
  assert.equal(host.hostDiffersFromInner, true);
  assert.ok(host.innerPlanWidthDelta < 1e-9);
});

test("desired: centered caption overlay center stays stable as chunk width changes", () => {
  const current = measureCurrentPreviewCaptionOverlayShrink({
    anchor: "center",
    textAlign: "center",
  });
  assert.equal(current.placementBoxMoved, false);
  assert.ok(current.overlayCenterDelta <= 1);
  assert.equal(current.correctnessFromTextAlignAlone, false);
});

console.log(
  `\nPreview runtime-parity desired invariants: ${passed} passed, ${failed} failed.`,
);

process.exitCode = failed === 0 ? 0 : 1;
