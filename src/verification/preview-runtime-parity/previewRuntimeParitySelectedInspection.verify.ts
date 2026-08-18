/**
 * Prompt 3 selected-media inspection.
 * Provider-free — reuses scene-media windows and the inspection adapter.
 * Run: npm run test:preview-runtime-parity-selected-inspection
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildFramingCoverageScene,
  buildMixedImageVideoScene,
  buildPreviewRuntimeParityStory,
  buildThreeVideoEqualWindowScene,
  buildThreeVideoUnequalWindowScene,
} from "@/features/preview/runtime-parity/build-preview-runtime-parity-story";
import {
  collectAuthoritativePreviewMountedLayers,
  collectReconciledPreviewMountedLayers,
  inventoryContainsMedia,
} from "@/features/preview/runtime-parity/collect-authoritative-preview-mounted-layers";
import { resolveCurrentPreviewPlaybackPresentation } from "@/features/preview/runtime-parity/resolve-preview-presentation-authority";
import { buildPreviewMediaLayerLifecycleKey } from "@/features/preview/runtime-parity/resolve-preview-media-layer-identity";
import { resolvePreviewSelectedMediaInspection } from "@/features/preview/runtime-parity/resolve-preview-selected-media-inspection";
import {
  removeSceneMediaItem,
  resolvePreviewSceneMediaWindows,
  updateSceneMediaItemMedia,
  moveSceneMediaItemRight,
} from "@/features/scene-media-timeline";
import { resolveActiveSubtitleForScene } from "@/features/story/utils";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function windowsOf(
  scene: ReturnType<typeof buildThreeVideoEqualWindowScene>,
) {
  const windows = resolvePreviewSceneMediaWindows(scene, {
    mixedMediaScenesEnabled: true,
  });
  assert.ok(windows.length >= 2);
  return windows;
}

function inspect(
  scene: ReturnType<typeof buildThreeVideoEqualWindowScene>,
  selectedMediaItemId: string | null,
  extras: {
    readonly sceneElapsedMs?: number;
    readonly isPlaying?: boolean;
    readonly mediaItemSelectionActive?: boolean;
    readonly selectedSceneId?: string | null;
    readonly inspectionOffsetMs?: number | null;
  } = {},
) {
  return resolvePreviewSelectedMediaInspection({
    scene,
    selectedMediaItemId,
    sceneElapsedMs: extras.sceneElapsedMs ?? 200,
    isPlaying: extras.isPlaying === true,
    mediaItemSelectionActive: extras.mediaItemSelectionActive,
    selectedSceneId: extras.selectedSceneId,
    inspectionOffsetMs: extras.inspectionOffsetMs,
    mixedMediaScenesEnabled: true,
  });
}

test("1. Select item 1 at an idle clock belonging to item 1", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  const first = windows[0]!;
  const result = inspect(scene, first.itemId, { sceneElapsedMs: first.startMs + 200 });
  assert.equal(result.active, true);
  assert.equal(result.selectedMediaItemId, first.itemId);
  assert.equal(result.view?.mediaItemId, first.itemId);
  assert.equal(result.inspectionSceneElapsedMs, first.startMs);
  assert.equal(result.layerPlan?.outgoing, null);
});

test("2. Select item 2 while idle clock belongs to item 1", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  const result = inspect(scene, windows[1]!.itemId, { sceneElapsedMs: 200 });
  assert.equal(result.active, true);
  assert.equal(result.view?.mediaItemId, windows[1]!.itemId);
  assert.notEqual(result.view?.mediaItemId, windows[0]!.itemId);
  assert.equal(result.inspectionSceneElapsedMs, windows[1]!.startMs);
});

test("3. Select item 3 while idle clock belongs to item 1", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  const result = inspect(scene, windows[2]!.itemId, { sceneElapsedMs: 200 });
  assert.equal(result.active, true);
  assert.equal(result.view?.mediaItemId, windows[2]!.itemId);
  assert.equal(result.inspectionSceneElapsedMs, windows[2]!.startMs);
});

test("4. Exact canonical boundary selection for every item", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  for (const window of windows) {
    const result = inspect(scene, window.itemId, { sceneElapsedMs: 0 });
    assert.equal(result.inspectionSceneElapsedMs, window.startMs);
    assert.equal(result.inspectionItemElapsedMs, 0);
    assert.equal(result.view?.mediaItemId, window.itemId);
    if (window.itemIndex > 0) {
      assert.notEqual(result.inspectionSceneElapsedMs, windows[window.itemIndex - 1]!.endMs - 1);
    }
  }
});

test("5. Equal and unequal media windows", () => {
  const equal = buildThreeVideoEqualWindowScene();
  const unequal = buildThreeVideoUnequalWindowScene();
  const equalWindows = windowsOf(equal);
  const unequalWindows = windowsOf(unequal);
  assert.equal(equalWindows[0]!.durationMs, equalWindows[1]!.durationMs);
  assert.notEqual(unequalWindows[0]!.durationMs, unequalWindows[1]!.durationMs);
  const equalInspect = inspect(equal, equalWindows[1]!.itemId);
  const unequalInspect = inspect(unequal, unequalWindows[1]!.itemId);
  assert.equal(equalInspect.inspectionSceneElapsedMs, equalWindows[1]!.startMs);
  assert.equal(unequalInspect.inspectionSceneElapsedMs, unequalWindows[1]!.startMs);
  assert.equal(unequalInspect.windowDurationMs, unequalWindows[1]!.durationMs);
});

test("6. Mixed image/video sequences", () => {
  const scene = buildMixedImageVideoScene();
  const windows = windowsOf(scene);
  assert.equal(windows[0]!.media.type, "image");
  assert.equal(windows[1]!.media.type, "video");
  const image = inspect(scene, windows[0]!.itemId);
  const video = inspect(scene, windows[1]!.itemId);
  assert.equal(image.view?.media?.type, "image");
  assert.equal(video.view?.media?.type, "video");
  assert.equal(video.inspectionItemElapsedMs, 0);
});

test("7. Fit, Fill, zoom, and Fit-with-background", () => {
  const scene = buildFramingCoverageScene();
  const windows = windowsOf(scene);
  const byId = new Map(windows.map((window) => [window.itemId, window]));
  for (const window of windows) {
    const result = inspect(scene, window.itemId);
    assert.equal(result.view?.media?.fitMode, window.media.fitMode);
    assert.deepEqual(result.view?.media?.transform, window.media.transform);
    assert.equal(
      result.view?.media?.backgroundTreatment,
      window.media.backgroundTreatment,
    );
    assert.equal(byId.get(window.itemId)?.itemId, result.selectedMediaItemId);
  }
});

test("8. Video inspection begins from canonical trim start", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  const second = windows[1]!;
  const trimmed = updateSceneMediaItemMedia(scene, second.itemId, {
    ...second.media,
    trimStartMs: 800,
    trimEndMs: 5_000,
  }).scene;
  const result = inspect(trimmed, second.itemId);
  assert.equal(result.inspectionItemElapsedMs, 0);
  assert.equal(result.view?.media?.trimStartMs, 800);
  assert.equal(result.view?.itemElapsedMs, 0);
});

test("8b. Trim scrub keeps inspection on the selected second item", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  const second = windows[1]!;
  const result = resolvePreviewSelectedMediaInspection({
    scene,
    selectedMediaItemId: second.itemId,
    sceneElapsedMs: 200,
    trimScrubActive: true,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(result.active, true);
  assert.equal(result.selectedMediaItemId, second.itemId);
  assert.equal(result.presentationAuthority, "trim-scrub");
  const presented = resolveCurrentPreviewPlaybackPresentation({
    scene,
    sceneElapsedMs: 200,
    isPlaying: false,
    selectedMediaItemId: second.itemId,
    trimScrubActive: true,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(presented.playbackMedia.mediaItemId, second.itemId);
});

test("9. Item-local motion begins deterministically", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  const second = windows[1]!;
  const withMotion = updateSceneMediaItemMedia(scene, second.itemId, {
    ...second.media,
    motion: { version: 1, enabled: true, presetId: "zoom-in", intensity: 1 },
  }).scene;
  const result = inspect(withMotion, second.itemId);
  assert.equal(result.inspectionItemElapsedMs, 0);
  assert.equal(result.view?.itemElapsedMs, 0);
  assert.equal(result.view?.media?.motion?.enabled, true);
});

test("10. Selecting another scene exits inspection", () => {
  const story = buildPreviewRuntimeParityStory("clock-lifecycle-two-scenes");
  const first = story.scenes[0]!;
  const second = story.scenes[1]!;
  const firstWindows = windowsOf(first);
  const otherScene = inspect(second, firstWindows[1]!.itemId, {
    selectedSceneId: second.id,
  });
  assert.equal(otherScene.active, false);
  assert.ok(
    otherScene.reason === "item-not-in-selected-scene" ||
      otherScene.reason === "empty-or-invalid-item",
  );
});

test("11. Selecting the scene clears item inspection", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const result = inspect(scene, null);
  assert.equal(result.active, false);
  assert.equal(result.reason, "no-selected-item");
  assert.equal(result.layerPlan, null);
});

test("12. Clearing media selection restores idle timeline authority", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  const cleared = resolveCurrentPreviewPlaybackPresentation({
    scene,
    sceneElapsedMs: 200,
    isPlaying: false,
    selectedMediaItemId: null,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(cleared.playbackAuthority, "canonical-timeline");
  assert.equal(cleared.playbackMedia.mediaItemId, windows[0]!.itemId);
});

test("13. Selecting a transition does not activate item inspection", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  const result = inspect(scene, windows[1]!.itemId, {
    mediaItemSelectionActive: false,
  });
  assert.equal(result.active, false);
  assert.equal(result.reason, "transition-selection");
});

test("14. Play Story exits inspection", () => {
  const preview = readSrc("src/features/preview/components/VideoPreview.tsx");
  assert.match(
    preview,
    /exitSelectedMediaInspection\(\);\s*onPreviewStart\?\.\(\);\s*void playPreview\(\);/,
  );
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  const playing = inspect(scene, windows[1]!.itemId, { isPlaying: true });
  assert.equal(playing.active, false);
  assert.equal(playing.reason, "playback-active");
});

test("15. Play Scene exits inspection", () => {
  const preview = readSrc("src/features/preview/components/VideoPreview.tsx");
  assert.match(
    preview,
    /exitSelectedMediaInspection\(\);\s*onPreviewStart\?\.\(\);\s*void playScenePreview\(\);/,
  );
});

test("16. Browser voice playback exits inspection", () => {
  const preview = readSrc("src/features/preview/components/VideoPreview.tsx");
  assert.match(preview, /exitSelectedMediaInspection\(\);\s*playWithBrowserVoice\(\)/);
});

test("17. Pause does not reactivate old inspection", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  const afterPlayClearsSelection = inspect(scene, null, { isPlaying: false });
  assert.equal(afterPlayClearsSelection.active, false);
  const pausedCanonical = resolveCurrentPreviewPlaybackPresentation({
    scene,
    sceneElapsedMs: 200,
    isPlaying: false,
    selectedMediaItemId: null,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(pausedCanonical.playbackMedia.mediaItemId, windows[0]!.itemId);
  assert.notEqual(pausedCanonical.playbackMedia.mediaItemId, windows[1]!.itemId);
});

test("18. Stop does not reactivate old inspection", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  const stopped = inspect(scene, null, { sceneElapsedMs: 0, isPlaying: false });
  assert.equal(stopped.active, false);
  const presented = resolveCurrentPreviewPlaybackPresentation({
    scene,
    sceneElapsedMs: 0,
    isPlaying: false,
    selectedMediaItemId: null,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(presented.playbackMedia.mediaItemId, windows[0]!.itemId);
});

test("19. Loop Scene stays canonical", () => {
  const preview = readSrc("src/features/preview/components/VideoPreview.tsx");
  assert.match(preview, /toggleLoopScene/);
  assert.doesNotMatch(preview, /play selected item/i);
  assert.doesNotMatch(preview, /playSelectedItem/);
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  const playing = resolveCurrentPreviewPlaybackPresentation({
    scene,
    sceneElapsedMs: 200,
    isPlaying: true,
    selectedMediaItemId: windows[1]!.itemId,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(playing.playbackAuthority, "canonical-timeline");
  assert.equal(playing.playbackMedia.mediaItemId, windows[0]!.itemId);
});

test("20. Reorder preserves inspection by stable ID", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  const selected = windows[1]!;
  const reordered = moveSceneMediaItemRight(scene, selected.itemId).scene;
  const result = inspect(reordered, selected.itemId);
  assert.equal(result.active, true);
  assert.equal(result.selectedMediaItemId, selected.itemId);
  assert.equal(result.view?.mediaItemId, selected.itemId);
});

test("21. Replace updates source and remounts by Prompt 2 identity", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  const selected = windows[1]!;
  const replacementUrl = "/preview-runtime-parity/image-q.svg";
  const replaced = updateSceneMediaItemMedia(scene, selected.itemId, {
    type: "image",
    url: replacementUrl,
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  }).scene;
  const result = inspect(replaced, selected.itemId);
  assert.equal(result.view?.media?.url, replacementUrl);
  const beforeKey = buildPreviewMediaLayerLifecycleKey({
    role: "primary",
    sceneId: scene.id,
    mediaItemId: selected.itemId,
    sourceIdentity: selected.media.url ?? "",
  });
  const afterKey = buildPreviewMediaLayerLifecycleKey({
    role: "primary",
    sceneId: replaced.id,
    mediaItemId: selected.itemId,
    sourceIdentity: replacementUrl,
  });
  assert.notEqual(afterKey, beforeKey);
});

test("22. Remove selected item cannot retain its ID or URL", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  const selected = windows[1]!;
  const removed = removeSceneMediaItem(scene, selected.itemId).scene;
  const result = inspect(removed, selected.itemId);
  assert.equal(result.active, false);
  const mounted = collectReconciledPreviewMountedLayers({
    scene: removed,
    sceneElapsedMs: 200,
    isPlaying: false,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(
    inventoryContainsMedia(mounted, {
      mediaItemId: selected.itemId,
      mediaUrl: selected.media.url,
    }),
    false,
  );
});

test("23. Nearest-survivor selection shows only the authoritative survivor", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  const selected = windows[1]!;
  const removed = removeSceneMediaItem(scene, selected.itemId);
  assert.ok(removed.selectedMediaItemId);
  assert.notEqual(removed.selectedMediaItemId, selected.itemId);
  const result = inspect(removed.scene, removed.selectedMediaItemId);
  assert.equal(result.active, true);
  assert.equal(result.selectedMediaItemId, removed.selectedMediaItemId);
  assert.notEqual(result.selectedMediaItemId, selected.itemId);
});

test("24. Rapid item 1 → item 2 → item 3 selection mounts only item 3", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  let last = inspect(scene, windows[0]!.itemId);
  last = inspect(scene, windows[1]!.itemId);
  last = inspect(scene, windows[2]!.itemId);
  assert.equal(last.view?.mediaItemId, windows[2]!.itemId);
  assert.equal(last.layerPlan?.primary.view.mediaItemId, windows[2]!.itemId);
  assert.equal(last.layerPlan?.outgoing, null);
  const inventory = collectAuthoritativePreviewMountedLayers({
    scene,
    sceneElapsedMs: 200,
    isPlaying: false,
    selectedMediaItemId: windows[2]!.itemId,
    mixedMediaScenesEnabled: true,
  });
  assert.deepEqual(inventory.mediaItemIds, [windows[2]!.itemId]);
});

test("25. Inspector edits update the selected item in Preview", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  const selected = windows[2]!;
  const edited = updateSceneMediaItemMedia(scene, selected.itemId, {
    ...selected.media,
    fitMode: "contain",
    transform: { x: 8, y: -4, scale: 1.25, rotation: 6 },
    backgroundTreatment: "blurred_fill",
  }).scene;
  const result = inspect(edited, selected.itemId);
  assert.equal(result.view?.media?.fitMode, "contain");
  assert.equal(result.view?.media?.transform?.scale, 1.25);
  assert.equal(result.view?.media?.transform?.rotation, 6);
  assert.equal(result.view?.media?.backgroundTreatment, "blurred_fill");
});

test("26. Inspection time drives caption/CTA timing consistently", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  const selected = windows[1]!;
  const result = inspect(scene, selected.itemId, { sceneElapsedMs: 200 });
  assert.equal(result.inspectionSceneElapsedMs, selected.startMs);
  const chunk = resolveActiveSubtitleForScene(scene, {
    sceneElapsedMs: result.inspectionSceneElapsedMs,
    sceneDurationMs: 9_000,
  });
  const idleChunk = resolveActiveSubtitleForScene(scene, {
    sceneElapsedMs: 200,
    sceneDurationMs: 9_000,
  });
  assert.ok(chunk);
  assert.ok(idleChunk);
  const preview = readSrc("src/features/preview/components/VideoPreview.tsx");
  assert.match(preview, /presentationSceneElapsedMs/);
  assert.match(preview, /inspection\.inspectionSceneElapsedMs/);
});

test("27. Inspection does not mutate the story", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const before = JSON.stringify(scene);
  const windows = windowsOf(scene);
  inspect(scene, windows[2]!.itemId);
  assert.equal(JSON.stringify(scene), before);
});

test("28. Inspection does not alter export manifests or fingerprints", () => {
  const exportFiles = [
    "src/features/export/services/video-render.service.ts",
    "src/features/export/utils/ffmpeg.utils.ts",
    "src/features/export/utils/export-preflight.utils.ts",
    "src/features/headless-renderer/worker/runtime/execute-render-job.ts",
  ];
  for (const file of exportFiles) {
    const source = readSrc(file);
    assert.doesNotMatch(source, /resolvePreviewSelectedMediaInspection/);
    assert.doesNotMatch(source, /selectedMediaItemId/);
  }
});

test("29. Browser and Headless rendering remain unchanged", () => {
  const browser = readSrc("src/features/export/services/video-render.service.ts");
  const headless = readSrc(
    "src/features/headless-renderer/worker/runtime/execute-render-job.ts",
  );
  assert.doesNotMatch(browser, /preview-runtime-parity/);
  assert.doesNotMatch(headless, /preview-runtime-parity/);
});

test("30. Direct canvas framing cannot edit the wrong item", () => {
  const preview = readSrc("src/features/preview/components/VideoPreview.tsx");
  assert.match(preview, /!inspection\.active/);
  assert.match(preview, /Canvas framing is disabled while inspecting a selected media item/);
  const adapter = readSrc(
    "src/features/preview/runtime-parity/resolve-preview-selected-media-inspection.ts",
  );
  assert.match(adapter, /allowFramingDrag: false/);
});

test("optional inspection offset clamps inside the selected window", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = windowsOf(scene);
  const second = windows[1]!;
  const clamped = inspect(scene, second.itemId, {
    inspectionOffsetMs: second.durationMs + 4_000,
  });
  assert.equal(clamped.inspectionItemElapsedMs, second.durationMs);
  assert.equal(clamped.view?.mediaItemId, second.itemId);
});

test("PreviewFrame accepts selectedMediaItemId and suppresses outgoing during inspection", () => {
  const previewFrame = readSrc("src/features/preview/components/PreviewFrame.tsx");
  assert.match(previewFrame, /selectedMediaItemId/);
  assert.match(previewFrame, /resolvePreviewSelectedMediaInspection/);
  assert.match(previewFrame, /planPreviewMediaLayers/);
  assert.match(previewFrame, /reconcilePreviewMediaLayerPlan/);
  assert.match(previewFrame, /data-preview-inspection-active/);
});

console.log(`\nAll preview runtime-parity selected-inspection checks passed (${passed}).`);
