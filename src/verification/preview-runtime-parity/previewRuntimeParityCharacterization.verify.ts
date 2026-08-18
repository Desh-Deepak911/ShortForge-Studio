/**
 * Characterization of current Preview defects and missing inspection coverage.
 * These tests record current behavior. They do not implement production fixes.
 * Run: npm run test:preview-runtime-parity
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  collectAuthoritativePreviewMountedLayers,
  collectCurrentPreviewPlanMountedLayers,
  inventoryContainsMedia,
} from "@/features/preview/runtime-parity/collect-authoritative-preview-mounted-layers";
import {
  buildPreviewRuntimeParityStory,
  buildThreeVideoEqualWindowScene,
  buildThreeVideoIntraSceneTransitionScene,
} from "@/features/preview/runtime-parity/build-preview-runtime-parity-story";
import {
  measureCurrentPreviewCaptionOverlayShrink,
  measurePreviewCaptionGeometry,
} from "@/features/preview/runtime-parity/measure-preview-caption-geometry";
import { measurePreviewCtaNormalizedBoundMatrix } from "@/features/preview/runtime-parity/measure-preview-cta-normalized-bounds";
import {
  PREVIEW_RUNTIME_PARITY_CAPTION_ANCHORS,
  PREVIEW_RUNTIME_PARITY_CAPTION_ALIGNS,
} from "@/features/preview/runtime-parity/preview-runtime-parity-corpus";
import { resolvePreviewClockAuthority } from "@/features/preview/runtime-parity/resolve-preview-clock-authority";
import {
  resolveCurrentPreviewPlaybackPresentation,
  resolvePreviewPresentationAuthority,
} from "@/features/preview/runtime-parity/resolve-preview-presentation-authority";
import {
  removeSceneMediaItem,
  resolvePreviewSceneMediaWindows,
} from "@/features/scene-media-timeline";
import { planPreviewMediaLayers } from "@/features/scene-media-transitions/preview";
import { composeIntraSceneTransitionPreview } from "@/features/scene-media-transitions/preview/compose-intra-scene-transition-preview";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function threeVideoWindows() {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = resolvePreviewSceneMediaWindows(scene, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(windows.length, 3);
  return { scene, windows };
}

test("A. removing first, middle, and last visible items drops them from the plan", () => {
  const { scene, windows } = threeVideoWindows();
  for (const window of windows) {
    const mid = window.startMs + Math.floor(window.durationMs / 2);
    const before = collectCurrentPreviewPlanMountedLayers({
      scene,
      sceneElapsedMs: mid,
      isPlaying: false,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(before.mediaItemIds.includes(window.itemId), true);
    const removed = removeSceneMediaItem(scene, window.itemId).scene;
    const after = collectCurrentPreviewPlanMountedLayers({
      scene: removed,
      sceneElapsedMs: mid,
      isPlaying: false,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(
      inventoryContainsMedia(after, {
        mediaItemId: window.itemId,
        mediaUrl: window.media.url,
      }),
      false,
    );
  }
});

test("B. removing incoming or outgoing items at an intra-scene boundary drops them", () => {
  const scene = buildThreeVideoIntraSceneTransitionScene();
  let composition = null;
  for (let elapsed = 0; elapsed <= 9_000; elapsed += 50) {
    composition = composeIntraSceneTransitionPreview(scene, elapsed, {
      mixedMediaScenesEnabled: true,
    });
    if (composition) break;
  }
  assert.ok(composition);
  const fromId = composition.fromMediaItemId;
  const toId = composition.toMediaItemId;
  for (const mediaItemId of [fromId, toId]) {
    const removed = removeSceneMediaItem(scene, mediaItemId).scene;
    const after = collectCurrentPreviewPlanMountedLayers({
      scene: removed,
      sceneElapsedMs: 3_000,
      isPlaying: true,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(after.mediaItemIds.includes(mediaItemId), false);
  }
});

test("C. paused remove immediately excludes the id and URL from authoritative layers", () => {
  const { scene, windows } = threeVideoWindows();
  const visible = windows[1]!;
  const mid = visible.startMs + 200;
  const pausedPlan = collectCurrentPreviewPlanMountedLayers({
    scene,
    sceneElapsedMs: mid,
    isPlaying: false,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(pausedPlan.mediaItemIds[0], visible.itemId);
  const removed = removeSceneMediaItem(scene, visible.itemId).scene;
  const inventory = collectAuthoritativePreviewMountedLayers({
    scene: removed,
    sceneElapsedMs: mid,
    isPlaying: false,
    removedMediaIds: [visible.itemId],
    removedMediaUrls: visible.media.url ? [visible.media.url] : [],
    mixedMediaScenesEnabled: true,
  });
  assert.equal(
    inventoryContainsMedia(inventory, {
      mediaItemId: visible.itemId,
      mediaUrl: visible.media.url,
    }),
    false,
  );
});

test("D. idle selection of items 1/2/3 presents that item in current production playback media", () => {
  const { scene, windows } = threeVideoWindows();
  const recorded: string[] = [];
  for (const window of windows) {
    const current = resolveCurrentPreviewPlaybackPresentation({
      scene,
      sceneElapsedMs: 200,
      isPlaying: false,
      selectedMediaItemId: window.itemId,
      mixedMediaScenesEnabled: true,
    });
    recorded.push(current.playbackMedia.mediaItemId ?? "none");
    assert.equal(current.playbackMedia.mediaItemId, window.itemId);
    assert.equal(current.inspectionMedia.mediaItemId, window.itemId);
    assert.equal(current.playbackAuthority, "inspection");
  }
  assert.deepEqual(recorded, [
    windows[0]?.itemId,
    windows[1]?.itemId,
    windows[2]?.itemId,
  ]);
});

test("E. starting playback after selecting item 2 resumes canonical timeline media", () => {
  const { scene, windows } = threeVideoWindows();
  const selected = windows[1]!;
  const idle = resolvePreviewPresentationAuthority({
    scene,
    sceneElapsedMs: 200,
    isPlaying: false,
    selectedMediaItemId: selected.itemId,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(idle.playbackAuthority, "inspection");
  const playing = resolvePreviewPresentationAuthority({
    scene,
    sceneElapsedMs: 200,
    isPlaying: true,
    selectedMediaItemId: selected.itemId,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(playing.playbackAuthority, "canonical-timeline");
  assert.equal(playing.playbackMedia.mediaItemId, windows[0]?.itemId);
});

test("F. returning after scene/story completion seeks to scene start, not the completed clock", () => {
  const story = buildPreviewRuntimeParityStory("clock-lifecycle-two-scenes");
  const completedScene = resolvePreviewClockAuthority({
    action: "complete-scene",
    scenes: story.scenes,
    sceneIndex: 0,
    timelineMs: 8_000,
  });
  assert.equal(completedScene.kind, "completed-scene");
  assert.ok(completedScene.holdingFinalFrame || completedScene.sceneElapsedMs >= 8_999 - 1);

  const returned = resolvePreviewClockAuthority({
    action: "return-to-scene",
    scenes: story.scenes,
    sceneIndex: 1,
    timelineMs: completedScene.timelineMs,
    targetSceneIndex: 0,
  });
  assert.equal(returned.kind, "idle");
  assert.equal(returned.sceneIndex, 0);
  assert.equal(returned.timelineMs, story.scenes[0]?.startMs ?? 0);
  assert.equal(returned.exitsInspection, true);

  const completedStory = resolvePreviewClockAuthority({
    action: "complete-story",
    scenes: story.scenes,
    sceneIndex: 0,
    timelineMs: 20_000,
  });
  assert.equal(completedStory.kind, "completed-story");
  const replay = resolvePreviewClockAuthority({
    action: "restart-story",
    scenes: story.scenes,
    sceneIndex: completedStory.sceneIndex,
    timelineMs: completedStory.timelineMs,
  });
  assert.equal(replay.timelineMs, 0);
  assert.equal(replay.sceneIndex, 0);
});

test("G/H. caption overlay/pill boxes stay anchored as chunk width changes", () => {
  for (const anchor of PREVIEW_RUNTIME_PARITY_CAPTION_ANCHORS) {
    for (const textAlign of PREVIEW_RUNTIME_PARITY_CAPTION_ALIGNS) {
      const desired = measurePreviewCaptionGeometry({ anchor, textAlign });
      const current = measureCurrentPreviewCaptionOverlayShrink({ anchor, textAlign });
      assert.ok(desired.short.overlayWidth < desired.long.overlayWidth);
      assert.equal(current.short.usesMaxContentWidth, true);
      assert.equal(current.placementBoxMoved, false);
      assert.ok(current.anchorReferenceDelta <= 1);
      if (textAlign === "center" && (anchor === "center" || anchor === "top_center" || anchor === "bottom_center")) {
        assert.equal(current.correctnessFromTextAlignAlone, false);
        assert.ok(current.overlayCenterDelta <= 1);
      }
    }
  }
});

test("I. CTA normalized bounds stay within the shared plan across sizes and widths", () => {
  const measurements = measurePreviewCtaNormalizedBoundMatrix();
  assert.ok(measurements.length >= 15);
  for (const measurement of measurements) {
    assert.ok(measurement.plan.width > 0);
    assert.ok(measurement.preview.width > 0);
    assert.ok(measurement.widthDelta < 0.03);
    assert.ok(measurement.heightDelta < 0.03);
    assert.equal(measurement.usesOutputSpaceSvgPath, true);
  }
});

test("J. output-space SVG path is present, but source inspection is not visual certification", () => {
  const preview = readSrc("src/features/engagement-overlays/preview/EngagementOverlayPreview.tsx");
  assert.match(preview, /data-engagement-overlay-surface="output-space"/);
  assert.match(preview, /viewBox=\{`0 0 \$\{layout\.width\} \$\{layout\.height\}`\}/);
  assert.doesNotMatch(preview, /visual certification/i);
});

test("K. corpus and measurements cover 220, 260, and 360 CSS pixels", () => {
  const measurements = measurePreviewCtaNormalizedBoundMatrix();
  const widths = new Set(measurements.map((entry) => entry.previewWidthPx));
  assert.deepEqual([...widths].sort((a, b) => a - b), [220, 260, 360]);
});

test("L. add/remove/reorder/scene change/replay do not keep removed identities in the plan", () => {
  const story = buildPreviewRuntimeParityStory("three-videos-equal-windows");
  const scene = story.scenes[0]!;
  const windows = resolvePreviewSceneMediaWindows(scene, {
    mixedMediaScenesEnabled: true,
  });
  const first = windows[0]!;
  const removed = removeSceneMediaItem(scene, first.itemId).scene;
  const replayClock = resolvePreviewClockAuthority({
    action: "restart-scene",
    scenes: [{ ...removed, startMs: 0, endMs: removed.durationMs ?? 9000 }],
    sceneIndex: 0,
    timelineMs: 8_000,
  });
  const after = collectCurrentPreviewPlanMountedLayers({
    scene: removed,
    sceneElapsedMs: replayClock.sceneElapsedMs,
    isPlaying: false,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(after.mediaItemIds.includes(first.itemId), false);
  assert.equal(after.mediaUrls.includes(first.media.url ?? ""), false);
});

test("production PreviewFrame accepts selected inspection identity", () => {
  const previewFrame = readSrc("src/features/preview/components/PreviewFrame.tsx");
  assert.match(previewFrame, /planPreviewMediaLayers/);
  assert.match(previewFrame, /selectedMediaItemId/);
  assert.match(previewFrame, /resolvePreviewSelectedMediaInspection/);
  const plan = planPreviewMediaLayers({
    scene: buildThreeVideoEqualWindowScene(),
    sceneElapsedMs: 200,
    isPlaying: false,
    mixedMediaScenesEnabled: true,
  });
  assert.ok(plan.primary.view.mediaItemId);
});

test("SceneFrameVideo exposes mounted identity and binds src to media.url", () => {
  const video = readSrc("src/features/editor/components/SceneFrameVideo.tsx");
  assert.match(video, /data-scene-media-item-id=\{mediaItemId/);
  assert.match(video, /src=\{url\}/);
});

test("selecting an item does not mutate persisted media order", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const before = (scene.mediaTimeline?.items ?? []).map((item) => item.id);
  resolvePreviewPresentationAuthority({
    scene,
    sceneElapsedMs: 200,
    isPlaying: false,
    selectedMediaItemId: before[2],
    mixedMediaScenesEnabled: true,
  });
  const after = (scene.mediaTimeline?.items ?? []).map((item) => item.id);
  assert.deepEqual(after, before);
});

console.log(`\nAll preview runtime-parity characterization checks passed (${passed}).`);
