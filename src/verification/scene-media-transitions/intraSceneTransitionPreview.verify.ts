/**
 * Sprint 9B — Intra-scene transition Preview integration.
 * Run: npm run test:intra-scene-transition-preview
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  appendSceneMediaImageItem,
  createSequentialMediaItemIdGenerator,
  projectSceneMediaTimeline,
  resolveActiveSceneMediaRenderView,
  resolveSceneMediaItemRenderView,
} from "@/features/scene-media-timeline";
import {
  resolveEffectiveIntraSceneTransitionDurationMs,
  resolveIntraSceneTransitionAtElapsed,
  setSceneMediaTransitionBoundary,
} from "@/features/scene-media-transitions";
import {
  buildPreviewMediaLayerStableKey,
  composeIntraSceneTransitionPreview,
  planPreviewMediaLayers,
  resolveIntraSceneTransitionProgressCheckpoint,
} from "@/features/scene-media-transitions/preview";
import { resolvePreviewVideoClipTime } from "@/features/preview/utils/preview-video-clip.utils";
import {
  buildExportManifest,
  EXPORT_MANIFEST_V5_VERSION,
  EXPORT_RENDERER_CONTRACT_V5,
} from "@/features/export/domain";
import type { FootieScene, SceneMedia, TransitionEffect } from "@/features/story/types";
import { getSceneDurationMs } from "@/features/story/utils/scene.utils";
import { resolveTransitionEffectLayers } from "@/features/timeline-intelligence/resolve-transition-state.utils";
import { syncFootieScript } from "@/lib/utils/voiceover";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function imageMedia(url: string): SceneMedia {
  return {
    type: "image",
    url,
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1.2, rotation: 0 },
    motion: {
      version: 1,
      enabled: true,
      presetId: "slow-drift",
      intensity: 0.4,
    },
  };
}

function videoMedia(url: string, trim?: { start: number; end: number }): SceneMedia {
  return {
    type: "video",
    url,
    source: "upload",
    fitMode: "cover",
    durationMs: 10_000,
    trimStartMs: trim?.start ?? 1000,
    trimEndMs: trim?.end ?? 7000,
    muted: true,
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
}

function twoItemScene(
  first: SceneMedia,
  second: SceneMedia,
  durationMs = 6000,
): { scene: FootieScene; a: string; b: string } {
  const generateId = createSequentialMediaItemIdGenerator("p9b");
  const a = generateId();
  const b = generateId();
  const scene: FootieScene = {
    id: "scene-preview",
    start: 0,
    end: durationMs / 1000,
    duration: durationMs / 1000,
    startMs: 0,
    endMs: durationMs,
    durationMs,
    subtitle: "Caption stays visible",
    narration: "Voiceover continues.",
    media: first,
    mediaTimeline: {
      version: 1,
      items: [
        { id: a, media: first, durationWeight: 1 },
        { id: b, media: second, durationWeight: 1 },
      ],
    },
  };
  return { scene, a, b };
}

function threeItemScene(): { scene: FootieScene; a: string; b: string; c: string } {
  const generateId = createSequentialMediaItemIdGenerator("p9b3");
  let scene: FootieScene = {
    id: "scene-3",
    start: 0,
    end: 9,
    duration: 9,
    startMs: 0,
    endMs: 9000,
    durationMs: 9000,
    subtitle: "Cap",
    media: imageMedia("https://example.com/a.jpg"),
  };
  scene = appendSceneMediaImageItem(scene, imageMedia("https://example.com/b.jpg"), {
    generateId,
  }).scene;
  scene = appendSceneMediaImageItem(scene, imageMedia("https://example.com/c.jpg"), {
    generateId,
  }).scene;
  const items = projectSceneMediaTimeline(scene).items;
  return { scene, a: items[0]!.id, b: items[1]!.id, c: items[2]!.id };
}

console.log("\nintra-scene-transition-preview (Sprint 9B)\n");

test("Before centered overlap: ordinary outgoing media; composition null", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const withFade = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  assert.equal(composeIntraSceneTransitionPreview(withFade, 2749), null);
  const ordinary = resolveActiveSceneMediaRenderView(withFade, 2749);
  assert.equal(ordinary.mediaItemId, a);
});

test("Centered overlap start: transition active and both peers join ordinary timing", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const withFade = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const composition = composeIntraSceneTransitionPreview(withFade, 2750);
  assert.ok(composition);
  assert.equal(composition!.progress, 0);
  assert.equal(composition!.fromMediaItemId, a);
  assert.equal(composition!.toMediaItemId, b);
  assert.equal(composition!.fromView.itemElapsedMs, 2750);
  assert.equal(composition!.toView.itemElapsedMs, 0);
  assert.equal(resolveIntraSceneTransitionProgressCheckpoint(0), "start");
});

test("Midpoint: shared effect styles match resolveTransitionEffectLayers", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const withFade = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const composition = composeIntraSceneTransitionPreview(withFade, 3000);
  assert.ok(composition);
  const layers = resolveTransitionEffectLayers("fade", composition!.progress);
  assert.equal(composition!.layerStyles.from.opacity, layers.opacityFrom);
  assert.equal(composition!.layerStyles.to.opacity, layers.opacityTo);
  assert.ok(composition!.progress > 0 && composition!.progress < 1);
});

test("Overlay end: inactive; incoming joins ordinary playback without a jump", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const withFade = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const semantic = resolveIntraSceneTransitionAtElapsed(withFade, 3000);
  const endMs = semantic.overlayEndMs;
  assert.equal(composeIntraSceneTransitionPreview(withFade, endMs), null);
  const after = resolveActiveSceneMediaRenderView(withFade, endMs);
  assert.equal(after.mediaItemId, b);
  assert.equal(after.itemElapsedMs, endMs - 3000);
});

test("All supported effects compose; Cut/absence do not", () => {
  const effects: TransitionEffect[] = [
    "fade",
    "slide-left",
    "slide-right",
    "zoom-in",
    "zoom-out",
    "blur",
  ];
  for (const effect of effects) {
    const { scene, a, b } = twoItemScene(
      imageMedia("https://example.com/a.jpg"),
      imageMedia("https://example.com/b.jpg"),
    );
    const next = setSceneMediaTransitionBoundary(scene, a, b, effect, 500).scene;
    const composition = composeIntraSceneTransitionPreview(next, 3100);
    assert.ok(composition, effect);
    assert.equal(composition!.effect, effect);
  }
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  assert.equal(composeIntraSceneTransitionPreview(scene, 3100), null);
  const cut = setSceneMediaTransitionBoundary(scene, a, b, "cut", 500).scene;
  assert.equal(cut.mediaTransitions, undefined);
  assert.equal(composeIntraSceneTransitionPreview(cut, 3100), null);
});

test("40% clamp reflected in composition effective duration", () => {
  // 2000ms scene → 1000ms windows → floor(0.4×1000)=400 clamps requested 1000.
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
    2000,
  );
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 1000).scene;
  const composition = composeIntraSceneTransitionPreview(next, 1000);
  assert.ok(composition);
  assert.equal(composition!.requestedDurationMs, 1000);
  assert.equal(
    composition!.effectiveDurationMs,
    resolveEffectiveIntraSceneTransitionDurationMs({
      requestedDurationMs: 1000,
      fromWindowDurationMs: 1000,
      toWindowDurationMs: 1000,
    }),
  );
  assert.equal(composition!.effectiveDurationMs, 400);
});

test("Multiple internal boundaries compose independently", () => {
  const { scene, a, b, c } = threeItemScene();
  let next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  next = setSceneMediaTransitionBoundary(next, b, c, "blur", 300).scene;
  const first = composeIntraSceneTransitionPreview(next, 3000);
  assert.ok(first);
  assert.equal(first!.fromMediaItemId, a);
  assert.equal(first!.toMediaItemId, b);
  const second = composeIntraSceneTransitionPreview(next, 6000);
  assert.ok(second);
  assert.equal(second!.fromMediaItemId, b);
  assert.equal(second!.toMediaItemId, c);
  assert.equal(composeIntraSceneTransitionPreview(next, 4500), null);
});

test("Image→image, image→video, video→image, video→video peers", () => {
  const cases: Array<[SceneMedia, SceneMedia]> = [
    [imageMedia("https://example.com/a.jpg"), imageMedia("https://example.com/b.jpg")],
    [imageMedia("https://example.com/a.jpg"), videoMedia("https://example.com/b.mp4")],
    [videoMedia("https://example.com/a.mp4"), imageMedia("https://example.com/b.jpg")],
    [videoMedia("https://example.com/a.mp4"), videoMedia("https://example.com/b.mp4")],
  ];
  for (const [from, to] of cases) {
    const { scene, a, b } = twoItemScene(from, to);
    const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
    const composition = composeIntraSceneTransitionPreview(next, 3100);
    assert.ok(composition, `${from.type}->${to.type}`);
    assert.equal(composition!.fromView.media?.type, from.type);
    assert.equal(composition!.toView.media?.type, to.type);
  }
});

test("Both video peers advance during a continuous overlap", () => {
  const { scene, a, b } = twoItemScene(
    videoMedia("https://example.com/a.mp4"),
    videoMedia("https://example.com/b.mp4"),
  );
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const plan = planPreviewMediaLayers({
    scene: next,
    sceneElapsedMs: 3200,
    isPlaying: true,
  });
  assert.ok(plan.outgoing);
  assert.ok(plan.outgoing!.view.itemElapsedMs > 2750);
  assert.ok(plan.outgoing!.view.itemElapsedMs < 3000);
  assert.ok(plan.primary.view.itemElapsedMs > 0);
  assert.ok(plan.primary.view.itemElapsedMs < 250);
  assert.equal(plan.primary.isPlaying, true);
  assert.equal(plan.primary.isActive, true);
  assert.equal(plan.outgoing!.isPlaying, true);
  assert.equal(plan.outgoing!.isActive, true);

  const previewSrc = readSrc("src/features/preview/components/PreviewFrame.tsx");
  assert.match(previewSrc, /planPreviewMediaLayers/);
  assert.match(previewSrc, /buildPreviewMediaLayerLifecycleKey/);
  assert.match(previewSrc, /mediaLayerPlan\.primary\.view\.mediaItemId/);
  assert.match(previewSrc, /mediaLayerPlan\.outgoing\.view\.mediaItemId/);
  assert.match(previewSrc, /activeMediaView=\{mediaLayerPlan\.primary\.view\}/);
  assert.match(previewSrc, /activeMediaView=\{mediaLayerPlan\.outgoing\.view\}/);
  assert.match(previewSrc, /data-preview-stable-media-stack="true"/);
  assert.match(previewSrc, /data-intra-scene-transition-outgoing-active/);
});

test("Trimmed video source-time correctness for peers", () => {
  const { scene, a, b } = twoItemScene(
    videoMedia("https://example.com/a.mp4", { start: 2000, end: 8000 }),
    videoMedia("https://example.com/b.mp4", { start: 500, end: 4500 }),
  );
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const composition = composeIntraSceneTransitionPreview(next, 3000);
  assert.ok(composition);
  const outgoingClip = resolvePreviewVideoClipTime({
    sceneElapsedMs: composition!.fromView.itemElapsedMs,
    trimStartMs: composition!.fromView.media!.trimStartMs,
    trimEndMs: composition!.fromView.media!.trimEndMs,
    durationMs: composition!.fromView.media!.durationMs,
  });
  const incomingClip = resolvePreviewVideoClipTime({
    sceneElapsedMs: composition!.toView.itemElapsedMs,
    trimStartMs: composition!.toView.media!.trimStartMs,
    trimEndMs: composition!.toView.media!.trimEndMs,
    durationMs: composition!.toView.media!.durationMs,
  });
  assert.ok(outgoingClip.clipTimeMs > 2000 + 2750);
  assert.ok(outgoingClip.clipTimeMs < 2000 + 3000);
  assert.ok(incomingClip.clipTimeMs > 500);
  assert.ok(incomingClip.clipTimeMs < 500 + 250);
});

test("Item-local framing and motion use peer renderScene media", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const composition = composeIntraSceneTransitionPreview(next, 3100);
  assert.ok(composition);
  assert.equal(composition!.fromView.renderScene.media?.url, "https://example.com/a.jpg");
  assert.equal(composition!.toView.renderScene.media?.url, "https://example.com/b.jpg");
  assert.equal(composition!.fromView.renderScene.media?.transform?.scale, 1.2);
  assert.ok(composition!.fromView.windowDurationMs > 0);
  assert.ok(composition!.toView.windowDurationMs > 0);
});

test("Exact peer resolution by item ID — not artificial scene times", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const peer = resolveSceneMediaItemRenderView(next, a, 2999);
  assert.ok(peer);
  assert.equal(peer!.mediaItemId, a);
  // Artificial elapsed inside the incoming window must not be used for outgoing peer.
  const wrongIfActive = resolveActiveSceneMediaRenderView(next, 3100);
  assert.equal(wrongIfActive.mediaItemId, b);
  assert.notEqual(peer!.mediaItemId, wrongIfActive.mediaItemId);
});

test("Captions remain visible; scene/MasterTimeline duration unchanged", () => {
  const videoPreview = readSrc("src/features/preview/components/VideoPreview.tsx");
  assert.match(
    videoPreview,
    /hideCaptionsDuringTransition = transitionOverlay != null/,
  );
  assert.match(videoPreview, /intra-scene transitions keep subtitles/i);
  assert.match(videoPreview, /!intraSceneTransitionActive/);

  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const before = getSceneDurationMs(scene);
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 800).scene;
  assert.equal(getSceneDurationMs(next), before);
  const story = syncFootieScript({
    title: "t",
    narration: "n",
    totalDuration: 6,
    scenes: [next],
  });
  assert.equal(story.scenes[0]!.durationMs, before);
});

test("Scrubbing forward/backward and loop replay semantics", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  assert.equal(composeIntraSceneTransitionPreview(next, 2700), null);
  assert.ok(composeIntraSceneTransitionPreview(next, 3000));
  assert.ok(composeIntraSceneTransitionPreview(next, 3200));
  assert.equal(composeIntraSceneTransitionPreview(next, 3250), null);
  // Scrub back into overlay
  assert.ok(composeIntraSceneTransitionPreview(next, 3100));
  // Loop restart at scene start
  assert.equal(composeIntraSceneTransitionPreview(next, 0), null);
  const ordinary = resolveActiveSceneMediaRenderView(next, 0);
  assert.equal(ordinary.mediaItemId, a);
});

test("Scene-to-scene overlay priority in PreviewFrame", () => {
  const preview = readSrc("src/features/preview/components/PreviewFrame.tsx");
  assert.match(
    preview,
    /(?:activeTransitionOverlay|transitionOverlay) && transitionStyles \?[\s\S]*mediaLayerPlan \?/,
  );
  assert.match(preview, /planPreviewMediaLayers/);
  assert.match(preview, /!activeTransitionOverlay[\s\S]*reconcilePreviewMediaLayerPlan/);
});

test("Invalid/stale metadata hard-cut fallback", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const stale: FootieScene = {
    ...scene,
    mediaTransitions: {
      version: 1,
      boundaries: [
        { fromItemId: "missing", toItemId: b, effect: "fade", durationMs: 500 },
        { fromItemId: a, toItemId: b, effect: "mystery" as TransitionEffect, durationMs: 500 },
      ],
    },
  };
  assert.equal(composeIntraSceneTransitionPreview(stale, 3100), null);
  assert.equal(resolveActiveSceneMediaRenderView(stale, 3100).mediaItemId, b);

  const tiny: FootieScene = {
    ...scene,
    durationMs: 4,
    duration: 0.004,
    endMs: 4,
    end: 0.004,
    mediaTimeline: {
      version: 1,
      items: [
        { id: a, media: imageMedia("https://example.com/a.jpg"), durationWeight: 1 },
        { id: b, media: imageMedia("https://example.com/b.jpg"), durationWeight: 1 },
      ],
    },
  };
  const tinyFade = setSceneMediaTransitionBoundary(tiny, a, b, "fade", 500).scene;
  // 40% of 2ms windows → floor(0.8)=0 → hard-cut
  assert.equal(composeIntraSceneTransitionPreview(tinyFade, 2), null);
});

test("Incoming key/seek continuity across overlay end", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const mid = planPreviewMediaLayers({
    scene: next,
    sceneElapsedMs: 3249,
    isPlaying: true,
  });
  const after = planPreviewMediaLayers({
    scene: next,
    sceneElapsedMs: 3250,
    isPlaying: true,
  });
  assert.ok(mid.intraScene);
  assert.equal(after.intraScene, null);
  assert.equal(mid.primary.stableKey, after.primary.stableKey);
  assert.equal(mid.primary.view.mediaItemId, b);
  assert.equal(after.primary.view.mediaItemId, b);
  // Continuous item-local time — no seek-back to 0 at overlay end.
  assert.ok(after.primary.view.itemElapsedMs >= mid.primary.view.itemElapsedMs);
  assert.ok(after.primary.view.itemElapsedMs > 0);
  assert.equal(after.outgoing, null);
});

test("current ExportManifest freezes Preview-configured transitions; draw does not import Preview compose", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const withFade = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const story = syncFootieScript({
    title: "t",
    narration: "n",
    totalDuration: 6,
    scenes: [withFade],
  });
  const withMeta = buildExportManifest({ story });
  const without = buildExportManifest({
    story: {
      ...story,
      scenes: [{ ...withFade, mediaTransitions: undefined }],
    },
  });
  assert.notEqual(withMeta.fingerprint, without.fingerprint);
  assert.equal(withMeta.version, EXPORT_MANIFEST_V5_VERSION);
  assert.equal(withMeta.rendererContractVersion, EXPORT_RENDERER_CONTRACT_V5);
  assert.match(JSON.stringify(withMeta), /mediaTransitions/);

  const exportDraw = readSrc("src/features/export/runtime/draw-prepared-export-frame.ts");
  const prepare = readSrc("src/features/export/runtime/prepare-export-frame.ts");
  assert.doesNotMatch(exportDraw, /composeIntraSceneTransitionPreview/);
  assert.doesNotMatch(prepare, /composeIntraSceneTransitionPreview/);
});

test("Preview adapter ownership boundaries", () => {
  const adapter = readSrc(
    "src/features/scene-media-transitions/preview/compose-intra-scene-transition-preview.ts",
  );
  assert.match(adapter, /resolveIntraSceneTransitionAtElapsed/);
  assert.match(adapter, /resolveTransitionEffectLayers/);
  assert.match(adapter, /transitionStateToPreviewLayerStyles/);
  assert.match(adapter, /resolveSceneMediaItemRenderView/);
  assert.doesNotMatch(adapter, /features\/export/);
  assert.doesNotMatch(adapter, /process\.env/);
  const planSrc = readSrc(
    "src/features/scene-media-transitions/preview/plan-preview-media-layers.ts",
  );
  assert.doesNotMatch(planSrc, /features\/export/);
  assert.doesNotMatch(planSrc, /process\.env\./);
  const index = readSrc("src/features/scene-media-transitions/index.ts");
  assert.doesNotMatch(index, /composeIntraSceneTransitionPreview/);
  assert.doesNotMatch(index, /planPreviewMediaLayers/);
});

test("Legacy / single-item / no track unchanged", () => {
  const legacy: FootieScene = {
    id: "legacy",
    start: 0,
    end: 4,
    duration: 4,
    startMs: 0,
    endMs: 4000,
    durationMs: 4000,
    subtitle: "",
    media: imageMedia("https://example.com/only.jpg"),
  };
  assert.equal(composeIntraSceneTransitionPreview(legacy, 1000), null);
  const view = resolveActiveSceneMediaRenderView(legacy, 1000);
  assert.ok(view.mediaItemId);
  assert.equal(view.media?.url, "https://example.com/only.jpg");
});

test("9B.1 Stable layer plan — primary key A→B at start; B continuous after end", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;

  const before = planPreviewMediaLayers({
    scene: next,
    sceneElapsedMs: 2749,
    isPlaying: true,
  });
  assert.equal(before.intraScene, null);
  assert.equal(before.outgoing, null);
  assert.equal(before.primary.view.mediaItemId, a);
  assert.equal(
    before.primary.stableKey,
    buildPreviewMediaLayerStableKey("primary", a),
  );

  const atStart = planPreviewMediaLayers({
    scene: next,
    sceneElapsedMs: 2750,
    isPlaying: true,
  });
  assert.ok(atStart.intraScene);
  assert.ok(atStart.outgoing);
  assert.equal(atStart.primary.view.mediaItemId, b);
  assert.equal(atStart.outgoing!.view.mediaItemId, a);
  assert.equal(
    atStart.primary.stableKey,
    buildPreviewMediaLayerStableKey("primary", b),
  );
  assert.equal(
    atStart.outgoing!.stableKey,
    buildPreviewMediaLayerStableKey("outgoing", a),
  );
  assert.notEqual(before.primary.stableKey, atStart.primary.stableKey);

  const mid = planPreviewMediaLayers({
    scene: next,
    sceneElapsedMs: 3000,
    isPlaying: true,
  });
  assert.equal(mid.primary.stableKey, atStart.primary.stableKey);
  assert.ok(mid.outgoing);

  const after = planPreviewMediaLayers({
    scene: next,
    sceneElapsedMs: 3250,
    isPlaying: true,
  });
  assert.equal(after.intraScene, null);
  assert.equal(after.outgoing, null);
  assert.equal(after.primary.stableKey, atStart.primary.stableKey);
  assert.equal(after.primary.view.mediaItemId, b);
});

test("9B.1 Video→video incoming target time non-decreasing; only outgoing removed", () => {
  const { scene, a, b } = twoItemScene(
    videoMedia("https://example.com/a.mp4"),
    videoMedia("https://example.com/b.mp4"),
  );
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const samples = [2750, 2850, 3000, 3150, 3249, 3250];
  let previousIncomingLocal = -1;
  let previousPrimaryKey: string | null = null;
  for (const elapsed of samples) {
    const plan = planPreviewMediaLayers({
      scene: next,
      sceneElapsedMs: elapsed,
      isPlaying: true,
    });
    assert.equal(plan.primary.view.mediaItemId, b);
    assert.ok(plan.primary.view.itemElapsedMs >= previousIncomingLocal);
    previousIncomingLocal = plan.primary.view.itemElapsedMs;

    if (elapsed < 3250) {
      assert.ok(plan.outgoing);
      assert.equal(plan.outgoing!.isPlaying, true);
      assert.equal(plan.outgoing!.isActive, true);
      assert.equal(plan.primary.isPlaying, true);
      previousPrimaryKey = plan.primary.stableKey;
    } else {
      assert.equal(plan.outgoing, null);
      assert.equal(plan.primary.stableKey, previousPrimaryKey);
    }

    const clip = resolvePreviewVideoClipTime({
      sceneElapsedMs: plan.primary.view.itemElapsedMs,
      trimStartMs: plan.primary.view.media!.trimStartMs,
      trimEndMs: plan.primary.view.media!.trimEndMs,
      durationMs: plan.primary.view.media!.durationMs,
    });
    if (elapsed === 2750) {
      assert.equal(clip.clipTimeMs, 1000);
    }
    if (elapsed === 3250) {
      assert.equal(clip.clipTimeMs, 1000 + 250);
    }
  }
});

test("9B.1 Image→video and video→image layer continuity", () => {
  for (const [from, to] of [
    [imageMedia("https://example.com/a.jpg"), videoMedia("https://example.com/b.mp4")],
    [videoMedia("https://example.com/a.mp4"), imageMedia("https://example.com/b.jpg")],
  ] as const) {
    const { scene, a, b } = twoItemScene(from, to);
    const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
    const mid = planPreviewMediaLayers({
      scene: next,
      sceneElapsedMs: 3200,
      isPlaying: true,
    });
    const after = planPreviewMediaLayers({
      scene: next,
      sceneElapsedMs: 3500,
      isPlaying: false,
    });
    assert.equal(mid.primary.stableKey, after.primary.stableKey);
    assert.equal(mid.primary.view.media?.type, to.type);
    assert.equal(after.primary.view.media?.type, to.type);
    assert.ok(mid.outgoing);
    assert.equal(after.outgoing, null);
  }
});

test("9B.1 Collision-safe layer keys for delimiter-like item IDs", () => {
  const weirdFrom = 'a|b:c"d';
  const weirdTo = "x\u0000y";
  const scene: FootieScene = {
    id: "weird",
    start: 0,
    end: 6,
    duration: 6,
    startMs: 0,
    endMs: 6000,
    durationMs: 6000,
    subtitle: "",
    media: imageMedia("https://example.com/a.jpg"),
    mediaTimeline: {
      version: 1,
      items: [
        {
          id: weirdFrom,
          media: imageMedia("https://example.com/a.jpg"),
          durationWeight: 1,
        },
        {
          id: weirdTo,
          media: imageMedia("https://example.com/b.jpg"),
          durationWeight: 1,
        },
      ],
    },
  };
  const next = setSceneMediaTransitionBoundary(
    scene,
    weirdFrom,
    weirdTo,
    "fade",
    500,
  ).scene;
  const plan = planPreviewMediaLayers({
    scene: next,
    sceneElapsedMs: 3100,
    isPlaying: true,
  });
  assert.equal(
    plan.primary.stableKey,
    buildPreviewMediaLayerStableKey("primary", weirdTo),
  );
  assert.equal(
    plan.outgoing!.stableKey,
    buildPreviewMediaLayerStableKey("outgoing", weirdFrom),
  );
  assert.notEqual(plan.primary.stableKey, plan.outgoing!.stableKey);
  assert.match(plan.primary.stableKey, /^primary:/);
  assert.match(plan.outgoing!.stableKey, /^outgoing:/);
});

test("9B.1 Scrub backwards remains deterministic", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const forward = planPreviewMediaLayers({
    scene: next,
    sceneElapsedMs: 3200,
    isPlaying: true,
  });
  const back = planPreviewMediaLayers({
    scene: next,
    sceneElapsedMs: 2000,
    isPlaying: false,
  });
  assert.ok(forward.intraScene);
  assert.equal(forward.primary.view.mediaItemId, b);
  assert.equal(back.intraScene, null);
  assert.equal(back.outgoing, null);
  assert.equal(back.primary.view.mediaItemId, a);
  assert.equal(
    back.primary.stableKey,
    buildPreviewMediaLayerStableKey("primary", a),
  );
});

console.log(`\n${passed} passed\n`);
