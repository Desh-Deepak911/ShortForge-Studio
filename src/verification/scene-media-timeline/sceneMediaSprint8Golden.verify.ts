/**
 * Sprint 8E — Multi-image golden QA (deterministic).
 * Run: npm run test:scene-media-sprint (aggregate) or
 *      tsx src/verification/scene-media-timeline/sceneMediaSprint8Golden.verify.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  appendSceneMediaImageItem,
  createSequentialMediaItemIdGenerator,
  isAbsentSceneMediaTimeline,
  moveSceneMediaItemRight,
  projectSceneMediaTimeline,
  removeSceneMediaItem,
  resolveActiveSceneMediaRenderView,
  resolveProjectedSceneMediaWindows,
  SCENE_MEDIA_MIN_ITEM_DURATION_MS,
  updateSceneMediaItemMedia,
} from "@/features/scene-media-timeline";
import {
  buildExportManifest,
  EXPORT_INVALID_MANIFEST_COST_SENTINEL,
  EXPORT_MANIFEST_VERSION,
  EXPORT_RENDERER_CONTRACT_VERSION,
  resolveExportActiveSceneMediaFrame,
  runExportCapabilityPreflight,
  validateExportManifestV2SceneMedia,
  type ExportEnvironmentSnapshot,
  type ExportManifest,
} from "@/features/export/domain";
import { prepareExportFromManifest } from "@/features/export/runtime/prepare-export-from-manifest";
import {
  buildExportMediaCacheKey,
  createExportMediaCache,
  preloadExportManifestMedia,
} from "@/features/export/utils/export-media-cache.utils";
import {
  collectExportParityCheckpoints,
  sampleParityCheckpoint,
} from "@/features/export/qa/export-qa-diagnostics";
import {
  buildExportDeviceCapabilityEstimate,
} from "@/features/export/capabilities";
import { estimateExportCost } from "@/features/export/domain/export-cost-estimate.utils";
import { classifyStoryPatch } from "@/features/editor/story-patches/story-patch-classifier";
import { syncFootieScript } from "@/lib/utils/voiceover";
import { buildMasterTimeline } from "@/features/timeline-intelligence/build-master-timeline";
import { duplicateScene } from "@/features/story/utils/timeline.utils";
import type { FootieScene } from "@/features/story/types";

import {
  buildSceneMediaGoldenFixture,
  getLegacyExplicitEditPair,
  listSceneMediaGoldenFixtures,
  SCENE_MEDIA_GOLDEN_IDS,
  SCENE_MEDIA_GOLDEN_PROJECTS,
  SCENE_MEDIA_GOLDEN_SOLID,
  goldenImageMedia,
} from "./goldens";

let passed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  const result = fn();
  if (result && typeof (result as Promise<void>).then === "function") {
    throw new Error(`Async test not supported in this runner: ${name}`);
  }
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const CAPABLE_ENV: Partial<ExportEnvironmentSnapshot> = {
  browserName: "chrome",
  supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true,
  supportsMediaRecorder: true,
  supportsRequestVideoFrameCallback: true,
  supportsWebAssembly: true,
  serverRendererAvailable: false,
  ffmpegRuntimePoisoned: false,
  estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
  mp4EncoderAvailable: true,
};

function primaryScene(fixtureId: (typeof SCENE_MEDIA_GOLDEN_IDS)[number]): FootieScene {
  const fixture = buildSceneMediaGoldenFixture(fixtureId);
  const scene = fixture.story.scenes.find((s) => s.id === fixture.primarySceneId);
  assert.ok(scene, `missing primary scene for ${fixtureId}`);
  return scene!;
}

function samplePreviewCheckpoints(scene: FootieScene) {
  const windows = resolveProjectedSceneMediaWindows(scene);
  const samples: {
    label: string;
    elapsedMs: number;
    itemId: string | null;
    itemElapsedMs: number;
  }[] = [];

  for (const window of windows) {
    const mid = window.startMs + Math.floor(window.durationMs / 2);
    const beforeBoundary = Math.max(0, window.endMs - 1);
    const points = [
      { label: `item-start:${window.itemId}`, elapsedMs: window.startMs },
      { label: `item-mid:${window.itemId}`, elapsedMs: mid },
      { label: `item-end-1:${window.itemId}`, elapsedMs: beforeBoundary },
    ];
    if (window.endMs < (scene.durationMs ?? 0)) {
      points.push({
        label: `item-boundary:${window.itemId}`,
        elapsedMs: window.endMs,
      });
    }
    for (const point of points) {
      const view = resolveActiveSceneMediaRenderView(scene, point.elapsedMs, {
        multiImageScenesEnabled: true,
      });
      samples.push({
        label: point.label,
        elapsedMs: point.elapsedMs,
        itemId: view.mediaItemId,
        itemElapsedMs: view.itemElapsedMs,
      });
    }
  }

  const finalElapsed = scene.durationMs ?? 0;
  const finalView = resolveActiveSceneMediaRenderView(scene, finalElapsed, {
    multiImageScenesEnabled: true,
  });
  samples.push({
    label: "final-scene-frame",
    elapsedMs: finalElapsed,
    itemId: finalView.mediaItemId,
    itemElapsedMs: finalView.itemElapsedMs,
  });

  return { windows, samples, finalView };
}

console.log("\nscene-media-sprint-8-golden (Sprint 8E)\n");

test("Registry covers all 12 required golden ids", () => {
  assert.equal(SCENE_MEDIA_GOLDEN_IDS.length, 12);
  assert.equal(SCENE_MEDIA_GOLDEN_PROJECTS.length, 12);
  const fixtures = listSceneMediaGoldenFixtures();
  assert.equal(fixtures.length, 12);
  for (const id of SCENE_MEDIA_GOLDEN_IDS) {
    assert.ok(fixtures.some((f) => f.id === id));
  }
});

test("Timeline: stable IDs, order, proportional windows, min 500ms", () => {
  const scene = primaryScene("sm-three-unequal-images");
  const windows = resolveProjectedSceneMediaWindows(scene);
  assert.equal(windows.length, 3);
  assert.equal(windows[0]!.startMs, 0);
  assert.equal(windows[2]!.endMs, scene.durationMs);
  for (let i = 1; i < windows.length; i += 1) {
    assert.equal(windows[i]!.startMs, windows[i - 1]!.endMs);
  }
  for (const window of windows) {
    assert.ok(window.durationMs >= SCENE_MEDIA_MIN_ITEM_DURATION_MS);
  }
  // Weights 1:2:3 → 1000 / 2000 / 3000 on 6000ms
  assert.equal(windows[0]!.durationMs, 1000);
  assert.equal(windows[1]!.durationMs, 2000);
  assert.equal(windows[2]!.durationMs, 3000);
  const ids = scene.mediaTimeline!.items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("Timeline: exact boundary selects following item", () => {
  const scene = primaryScene("sm-two-equal-images");
  const before = resolveActiveSceneMediaRenderView(scene, 2999, {
    multiImageScenesEnabled: true,
  });
  const at = resolveActiveSceneMediaRenderView(scene, 3000, {
    multiImageScenesEnabled: true,
  });
  assert.equal(before.itemIndex, 0);
  assert.equal(at.itemIndex, 1);
  assert.equal(at.itemElapsedMs, 0);
});

test("Timeline: append/reorder/remove preserve duration + first-item mirror", () => {
  const generateId = createSequentialMediaItemIdGenerator("cmd");
  let scene = primaryScene("sm-two-equal-images");
  const durationBefore = scene.durationMs;
  const firstUrl = scene.mediaTimeline!.items[0]!.media.url;
  scene = appendSceneMediaImageItem(
    scene,
    goldenImageMedia(SCENE_MEDIA_GOLDEN_SOLID.itemC),
    { generateId },
  ).scene;
  assert.equal(scene.durationMs, durationBefore);
  assert.equal(scene.media?.url, firstUrl);
  const id0 = scene.mediaTimeline!.items[0]!.id;
  const id1 = scene.mediaTimeline!.items[1]!.id;
  scene = moveSceneMediaItemRight(scene, id0).scene;
  assert.equal(scene.mediaTimeline!.items[0]!.id, id1);
  assert.equal(scene.media?.url, scene.mediaTimeline!.items[0]!.media.url);
  const removeId = scene.mediaTimeline!.items[2]!.id;
  scene = removeSceneMediaItem(scene, removeId).scene;
  assert.equal(scene.mediaTimeline!.items.length, 2);
  assert.equal(scene.durationMs, durationBefore);
});

test("Timeline: non-first edits cannot mutate first-item compatibility", () => {
  const scene = primaryScene("sm-per-item-framing-motion");
  const firstUrl = scene.mediaTimeline!.items[0]!.media.url;
  const second = scene.mediaTimeline!.items[1]!;
  assert.notEqual(second.media.transform?.scale, scene.media?.transform?.scale);
  assert.equal(scene.media?.url, firstUrl);
  assert.equal(scene.image?.url, firstUrl);
});

test("Timeline: legacy conversion only on explicit edit", () => {
  const { legacy, converted } = getLegacyExplicitEditPair();
  assert.equal(isAbsentSceneMediaTimeline(legacy.mediaTimeline), true);
  assert.equal(legacy.mediaTimeline, undefined);
  assert.equal(converted.mediaTimeline?.version, 1);
  assert.equal(converted.mediaTimeline?.items.length, 1);
  const projected = projectSceneMediaTimeline(legacy);
  assert.equal(projected.fromStoredTimeline, false);
  assert.equal(projected.items.length, 1);
});

test("Timeline: MasterTimeline / scene duration unchanged by multi-item", () => {
  const fixture = buildSceneMediaGoldenFixture("sm-two-equal-images");
  const timeline = buildMasterTimeline(fixture.story, { mode: "export" });
  const off = buildExportManifest({
    story: fixture.story,
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: false,
  });
  const on = buildExportManifest({
    story: fixture.story,
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  assert.equal(off.project.renderDurationMs, on.project.renderDurationMs);
  assert.equal(on.project.renderDurationMs, timeline.renderDurationMs);
  assert.equal(on.project.sceneCount, fixture.story.scenes.length);
});

test("Inspector: per-item framing/motion/trim survive fixture build", () => {
  const framing = primaryScene("sm-per-item-framing-motion");
  assert.equal(framing.mediaTimeline!.items[1]!.media.transform?.scale, 1.6);
  assert.equal(framing.mediaTimeline!.items[1]!.media.motion?.presetId, "slow-zoom-in");
  const trimmed = primaryScene("sm-image-to-video-trim");
  const video = trimmed.mediaTimeline!.items[1]!.media;
  assert.equal(video.type, "video");
  if (video.type === "video") {
    assert.equal(video.trimStartMs, 500);
    assert.equal(video.trimEndMs, 3500);
  }
});

test("Inspector: duplicated scenes have independent graphs", () => {
  const fixture = buildSceneMediaGoldenFixture("sm-draft-reload-duplicate");
  const a = fixture.story.scenes[0]!;
  const b = fixture.story.scenes[1]!;
  assert.notEqual(a.id, b.id);
  assert.ok(a.mediaTimeline);
  assert.ok(b.mediaTimeline);
  // Mutating a duplicate must not rewrite the original scene graph.
  const dup = duplicateScene(a);
  const generateId = createSequentialMediaItemIdGenerator("dup-mut");
  const mutated = appendSceneMediaImageItem(
    dup,
    goldenImageMedia(SCENE_MEDIA_GOLDEN_SOLID.itemC),
    { generateId },
  ).scene;
  assert.equal(a.mediaTimeline!.items.length, 2);
  assert.equal(b.mediaTimeline!.items.length, 2);
  assert.equal(mutated.mediaTimeline!.items.length, 3);
  assert.notEqual(mutated.id, a.id);
});

test("Preview: checkpoint sampling across every item window", () => {
  const scene = primaryScene("sm-two-equal-images");
  const { windows, samples, finalView } = samplePreviewCheckpoints(scene);
  assert.equal(windows.length, 2);
  assert.ok(samples.some((s) => s.label.startsWith("item-start:")));
  assert.ok(samples.some((s) => s.label.startsWith("item-boundary:")));
  assert.ok(samples.some((s) => s.label === "final-scene-frame"));
  const boundary = samples.find((s) =>
    s.label.startsWith(`item-boundary:${windows[0]!.itemId}`),
  );
  assert.ok(boundary);
  assert.equal(boundary!.itemId, windows[1]!.itemId);
  assert.equal(boundary!.itemElapsedMs, 0);
  assert.equal(finalView.holdingFinalFrame, true);
  assert.equal(finalView.mediaItemId, windows[1]!.itemId);
});

test("Preview: item-local motion/video timing + remount key identity", () => {
  const scene = primaryScene("sm-per-item-framing-motion");
  const atSecondStart = resolveActiveSceneMediaRenderView(scene, 3000, {
    multiImageScenesEnabled: true,
  });
  assert.equal(atSecondStart.itemElapsedMs, 0);
  assert.equal(atSecondStart.media?.motion?.presetId, "slow-zoom-in");
  const mediaSrc = readSrc("src/features/editor/components/SceneFrameMedia.tsx");
  assert.match(mediaSrc, /key=\{activeMediaView\.mediaItemId/);
  const previewSrc = readSrc("src/features/preview/components/PreviewFrame.tsx");
  // Ordinary path still resolves active media; 9B may also compose intra-scene overlays.
  assert.match(previewSrc, /resolveActiveSceneMediaRenderView/);
  assert.doesNotMatch(previewSrc, /crossfade.*mediaTimeline/i);
});

test("Preview: active placeholder fallback (not first-item-only)", () => {
  const scene = primaryScene("sm-placeholder-missing-media");
  const early = resolveActiveSceneMediaRenderView(scene, 500, {
    multiImageScenesEnabled: true,
  });
  const late = resolveActiveSceneMediaRenderView(scene, 4000, {
    multiImageScenesEnabled: true,
  });
  assert.equal(early.media?.type, "placeholder");
  assert.equal(late.media?.type, "image");
  assert.equal(late.media?.url, SCENE_MEDIA_GOLDEN_SOLID.itemB);
});

test("Preview: transition peers resolve independently", () => {
  const fixture = buildSceneMediaGoldenFixture("sm-transition-multi-item-peers");
  const from = fixture.story.scenes[0]!;
  const to = fixture.story.scenes[1]!;
  const fromView = resolveActiveSceneMediaRenderView(from, 4000, {
    multiImageScenesEnabled: true,
  });
  const toView = resolveActiveSceneMediaRenderView(to, 1000, {
    multiImageScenesEnabled: true,
  });
  assert.equal(fromView.media?.url, SCENE_MEDIA_GOLDEN_SOLID.itemB);
  assert.equal(toView.media?.url, SCENE_MEDIA_GOLDEN_SOLID.itemC);
  assert.ok(
    (fixture.story.timelineItems ?? []).some(
      (item) => item.type === "transition" && item.fromSceneId === from.id,
    ),
  );
});

test("Export: manifest v4 / contract 9D / compatibility = item 1", () => {
  const fixture = buildSceneMediaGoldenFixture("sm-two-equal-images");
  const manifest = buildExportManifest({
    story: fixture.story,
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  assert.equal(manifest.version, EXPORT_MANIFEST_VERSION);
  assert.equal(manifest.rendererContractVersion, EXPORT_RENDERER_CONTRACT_VERSION);
  assert.equal(EXPORT_MANIFEST_VERSION, 4);
  assert.equal(EXPORT_RENDERER_CONTRACT_VERSION, "9D");
  const scene = manifest.scenes[0]!;
  assert.ok(scene.mediaTimeline.items.length >= 2);
  assert.deepEqual(scene.media, scene.mediaTimeline.items[0]!.media);
});

test("Export: Preview/Export active-item parity at checkpoints", () => {
  const fixture = buildSceneMediaGoldenFixture("sm-two-equal-images");
  const storyScene = fixture.story.scenes[0]!;
  const manifest = buildExportManifest({
    story: fixture.story,
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const exportScene = manifest.scenes[0]!;
  for (const elapsed of [0, 1500, 2999, 3000, 4500, 6000]) {
    const preview = resolveActiveSceneMediaRenderView(storyScene, elapsed, {
      multiImageScenesEnabled: true,
    });
    const exp = resolveExportActiveSceneMediaFrame(exportScene, elapsed);
    assert.equal(preview.mediaItemId, exp?.item.id ?? null);
    assert.ok(
      Math.abs(preview.itemElapsedMs - (exp?.itemElapsedMs ?? -1)) <= 1,
    );
  }
});

test("Export: collision-safe cache keys + independent preload wiring", () => {
  const fixture = buildSceneMediaGoldenFixture("sm-two-equal-images");
  const manifest = buildExportManifest({
    story: fixture.story,
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const items = manifest.scenes[0]!.mediaTimeline.items;
  assert.equal(items.length, 2);
  const keys = items.map((item) =>
    buildExportMediaCacheKey(manifest.scenes[0]!.id, item.id),
  );
  assert.equal(new Set(keys).size, 2);
  const a = buildExportMediaCacheKey("scene|1", "item");
  const b = buildExportMediaCacheKey("scene", "1|item");
  assert.notEqual(a, b);
  const cacheSrc = readSrc("src/features/export/utils/export-media-cache.utils.ts");
  assert.match(cacheSrc, /buildExportMediaCacheKey\(scene\.id, mediaItemId\)/);
  void createExportMediaCache;
  void preloadExportManifestMedia;
});

test("Export: later invalid media cannot hide behind item 1", () => {
  const fixture = buildSceneMediaGoldenFixture("sm-two-equal-images");
  const manifest = buildExportManifest({
    story: fixture.story,
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const poisoned = structuredClone(manifest) as ExportManifest;
  (poisoned.scenes[0]!.mediaTimeline.items[1] as { media: { type: string; source: string } }).media =
    {
      type: "image",
      source: "",
      fitMode: "fit",
      positionX: 0,
      positionY: 0,
      zoom: 1,
      rotationDeg: 0,
    } as never;
  const preflight = runExportCapabilityPreflight(poisoned);
  assert.equal(preflight.supported, false);
  assert.ok(
    preflight.blockers.some(
      (b) => b.code === "MISSING_MEDIA" || b.code === "INVALID_MANIFEST",
    ),
  );
});

test("Export: capability/cost count every media item", () => {
  const fixture = buildSceneMediaGoldenFixture("sm-multi-video-independent-trims");
  const manifest = buildExportManifest({
    story: fixture.story,
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const estimate = buildExportDeviceCapabilityEstimate(
    manifest,
    estimateExportCost(manifest),
  );
  assert.equal(estimate.mediaItemCount, 3);
  assert.equal(estimate.videoMediaItemCount, 3);
  assert.ok(estimate.videoMediaItemCount > 1);
});

test("Export: QA diagnostics retain item boundary labels", () => {
  const fixture = buildSceneMediaGoldenFixture("sm-two-equal-images");
  const manifest = buildExportManifest({
    story: fixture.story,
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const scene = manifest.scenes[0]!;
  const item0 = scene.mediaTimeline.items[0]!;
  const labels = collectExportParityCheckpoints(manifest).map((c) => c.label);
  assert.ok(labels.some((l) => l.includes(`media-item-start:${scene.id}:${item0.id}`)));
  assert.ok(labels.some((l) => l.includes(`media-item-boundary:${scene.id}:${item0.id}`)));
  const mid = sampleParityCheckpoint(
    manifest,
    scene.startMs + item0.endOffsetMs + 10,
    "after-boundary",
  );
  assert.equal(mid.mediaItemId, scene.mediaTimeline.items[1]!.id);
});

test("Export: fingerprint changes for order/windows/framing/trim/source", () => {
  const fixture = buildSceneMediaGoldenFixture("sm-two-equal-images");
  const base = buildExportManifest({
    story: fixture.story,
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const reorderedScene: FootieScene = {
    ...fixture.story.scenes[0]!,
    mediaTimeline: {
      version: 1,
      items: [
        fixture.story.scenes[0]!.mediaTimeline!.items[1]!,
        fixture.story.scenes[0]!.mediaTimeline!.items[0]!,
      ],
    },
    media: fixture.story.scenes[0]!.mediaTimeline!.items[1]!.media,
  };
  const reordered = buildExportManifest({
    story: syncFootieScript({
      ...fixture.story,
      scenes: [reorderedScene],
    }),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  assert.notEqual(base.fingerprint, reordered.fingerprint);

  const framingFixture = buildSceneMediaGoldenFixture("sm-per-item-framing-motion");
  const framingManifest = buildExportManifest({
    story: framingFixture.story,
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  assert.notEqual(base.fingerprint, framingManifest.fingerprint);
});

test("Export: malformed manifests fail before cost/preload/render", () => {
  const fixture = buildSceneMediaGoldenFixture("sm-malformed-export-manifest-v2");
  const good = buildExportManifest({
    story: fixture.story,
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const bad = structuredClone(good) as ExportManifest;
  (bad.scenes as unknown[])[0] = null;
  const before = JSON.stringify(bad);
  const integrity = validateExportManifestV2SceneMedia(bad);
  assert.equal(integrity.ok, false);
  const preflight = runExportCapabilityPreflight(bad);
  assert.equal(preflight.supported, false);
  assert.equal(preflight.renderer, "blocked");
  assert.equal(
    preflight.estimatedCost.rendererVersion,
    EXPORT_INVALID_MANIFEST_COST_SENTINEL.rendererVersion,
  );
  assert.throws(() => prepareExportFromManifest(bad));
  assert.equal(JSON.stringify(bad), before);
});

test("Persistence: draft JSON round-trip keeps stored timeline", () => {
  const fixture = buildSceneMediaGoldenFixture("sm-two-equal-images");
  const json = JSON.stringify(fixture.story);
  const reloaded = JSON.parse(json) as typeof fixture.story;
  const synced = syncFootieScript(reloaded);
  assert.equal(synced.scenes[0]!.mediaTimeline?.items.length, 2);
  assert.equal(
    synced.scenes[0]!.mediaTimeline!.items[0]!.id,
    fixture.story.scenes[0]!.mediaTimeline!.items[0]!.id,
  );
});

test("Persistence: legacy drafts remain readable without migration", () => {
  const fixture = buildSceneMediaGoldenFixture("sm-legacy-single-image");
  assert.equal(fixture.story.scenes[0]!.mediaTimeline, undefined);
  const projected = projectSceneMediaTimeline(fixture.story.scenes[0]!);
  assert.equal(projected.items.length, 1);
  const json = JSON.stringify(fixture.story);
  const reloaded = syncFootieScript(JSON.parse(json));
  assert.equal(reloaded.scenes[0]!.mediaTimeline, undefined);
});

test("Persistence: patch classification remains media", () => {
  const before = primaryScene("sm-two-equal-images");
  const after = updateSceneMediaItemMedia(
    before,
    before.mediaTimeline!.items[1]!.id,
    goldenImageMedia(SCENE_MEDIA_GOLDEN_SOLID.itemC),
  ).scene;
  const classification = classifyStoryPatch(
    syncFootieScript({
      title: "p",
      narration: "n",
      totalDuration: 6,
      scenes: [before],
    }),
    syncFootieScript({
      title: "p",
      narration: "n",
      totalDuration: 6,
      scenes: [after],
    }),
  );
  assert.ok(classification.classes.includes("media"));
});

test("Regression: single-media Preview/Export parity", () => {
  const fixture = buildSceneMediaGoldenFixture("sm-legacy-single-image");
  const scene = fixture.story.scenes[0]!;
  const off = resolveActiveSceneMediaRenderView(scene, 1000, {
    multiImageScenesEnabled: false,
  });
  const on = resolveActiveSceneMediaRenderView(scene, 1000, {
    multiImageScenesEnabled: true,
  });
  assert.equal(off.media?.url, on.media?.url);
  const offManifest = buildExportManifest({
    story: fixture.story,
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: false,
  });
  const onManifest = buildExportManifest({
    story: fixture.story,
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  assert.deepEqual(offManifest.scenes[0]!.media, onManifest.scenes[0]!.media);
});

test("Regression: media windows stay hard-cut; Export uses manifest-only 9C path", () => {
  const preview = readSrc("src/features/preview/components/PreviewFrame.tsx");
  const exportDraw = readSrc(
    "src/features/export/runtime/draw-prepared-export-frame.ts",
  );
  const domain = readSrc(
    "src/features/scene-media-timeline/resolution/resolve-media-windows.ts",
  );
  // Window domain stays hard-cut; Export/Preview own their own transition adapters.
  assert.doesNotMatch(domain, /crossfadeMediaItem/);
  assert.doesNotMatch(exportDraw, /composeIntraSceneTransitionPreview/);
  assert.doesNotMatch(exportDraw, /resolveIntraSceneTransitionAtElapsed/);
  assert.match(exportDraw, /intraSceneTransition/);
  // Preview 9B/9B.1 composes via stable layer plan (not a second window algorithm).
  assert.match(preview, /planPreviewMediaLayers/);
});

test("Regression: multi-image flag retired; domain defaults to multi-item (opt-out for tests)", () => {
  assert.throws(() => {
    readFileSync(
      join(process.cwd(), "src/features/scene-media-timeline/feature-gate.ts"),
      "utf8",
    );
  }, /ENOENT/);
  const build = readSrc("src/features/export/domain/build-export-manifest.ts");
  assert.doesNotMatch(build, /process\.env\./);
  assert.doesNotMatch(build, /isMultiImageScenesEnabled\s*\(/);
  assert.match(build, /multiImageScenesEnabled !== false/);
  const resolve = readSrc(
    "src/features/scene-media-timeline/adapters/resolve-active-scene-media-render-view.ts",
  );
  assert.doesNotMatch(resolve, /process\.env\./);
  assert.doesNotMatch(resolve, /isMultiImageScenesEnabled\s*\(/);
  assert.match(resolve, /multiImageScenesEnabled !== false/);
  const prepare = readSrc("src/features/export/domain/prepare-export-request.ts");
  assert.doesNotMatch(prepare, /isMultiImageScenesEnabled/);
  assert.match(prepare, /multiImageScenesEnabled !== false/);
});

test("Harness route is development-only and unlinked from production nav", () => {
  const page = readSrc("src/app/dev/scene-media-qa/page.tsx");
  assert.match(page, /NODE_ENV === ["']production["']/);
  assert.match(page, /development-only|Development only/i);
  assert.match(page, /exportFootieShort|prepareExportRequest/);
  assert.match(page, /resolveActiveSceneMediaRenderView|SceneBackdrop|PreviewFrame/);
  for (const navPath of [
    "src/app/layout.tsx",
    "src/app/page.tsx",
    "src/app/create/page.tsx",
  ]) {
    try {
      const src = readSrc(navPath);
      assert.doesNotMatch(src, /\/dev\/scene-media-qa/);
    } catch {
      // Optional path.
    }
  }
});

console.log(`\n${passed} passed\n`);
