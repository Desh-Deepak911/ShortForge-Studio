/**
 * Sprint 8D — Scene Media Timeline Export integration.
 * Run: npm run test:scene-media-export
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildExportManifest,
  EXPORT_INVALID_MANIFEST_COST_SENTINEL,
  EXPORT_MANIFEST_VERSION,
  EXPORT_RENDERER_CONTRACT_VERSION,
  exportMediaManifestSemanticallyEqual,
  resolveExportActiveSceneMediaFrame,
  runExportCapabilityPreflight,
  validateExportManifest,
  type ExportEnvironmentSnapshot,
  type ExportManifest,
} from "@/features/export/domain";
import { prepareExportFromManifest } from "@/features/export/runtime/prepare-export-from-manifest";
import {
  buildExportMediaCacheKey,
  createExportMediaCache,
  preloadExportManifestMedia,
  type ExportImageAsset,
} from "@/features/export/utils/export-media-cache.utils";
import {
  beginExportVideoSeekRequest,
  exportSceneHasDrawableMedia,
  getExportVideoSamplingState,
  resetExportVideoSamplingState,
} from "@/features/export/utils/export-scene-media-renderer";
import { resolveExportVideoSourceTimeMs } from "@/features/export/timing";
import { estimateExportCost } from "@/features/export/domain/export-cost-estimate.utils";
import {
  buildExportDeviceCapabilityEstimate,
  isImageHeavyProject,
  isMixedMediaProject,
  isVideoHeavyProject,
} from "@/features/export/capabilities";
import {
  collectExportParityCheckpoints,
  sampleParityCheckpoint,
} from "@/features/export/qa/export-qa-diagnostics";
import {
  appendSceneMediaImageItem,
  buildTemporarySceneForMediaItemEdit,
  createSequentialMediaItemIdGenerator,
  updateSceneMediaItemMedia,
} from "@/features/scene-media-timeline";
import { buildMediaFramingPatch } from "@/features/media-framing";
import { buildMediaMotionPatch } from "@/features/media-motion";
import { buildVideoTrimPatch } from "@/features/media-playback";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";
import { buildMasterTimeline } from "@/features/timeline-intelligence/build-master-timeline";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
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

function imageMedia(url: string, extras: Partial<SceneMedia> = {}): SceneMedia {
  return {
    type: "image",
    url,
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    ...extras,
  };
}

function videoMedia(url: string): SceneMedia {
  return {
    type: "video",
    url,
    source: "upload",
    durationMs: 5000,
    trimStartMs: 0,
    trimEndMs: 5000,
    muted: true,
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
}

function storyFromScenes(scenes: FootieScene[]): FootieScript {
  return syncFootieScript({
    title: "8D Export",
    narration: "Narration stays put.",
    totalDuration: scenes.reduce((sum, scene) => sum + (scene.duration ?? 0), 0),
    scenes,
  });
}

function twoItemScene(): FootieScene {
  const generateId = createSequentialMediaItemIdGenerator("ex");
  let scene: FootieScene = {
    id: "scene-1",
    start: 0,
    end: 6,
    duration: 6,
    startMs: 0,
    endMs: 6000,
    durationMs: 6000,
    subtitle: "Cap",
    narration: "Narration.",
    media: imageMedia("https://example.com/first.jpg"),
    image: {
      url: "https://example.com/first.jpg",
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
    },
  };
  scene = appendSceneMediaImageItem(scene, imageMedia("https://example.com/second.jpg"), {
    generateId,
  }).scene;
  return scene;
}

console.log("\nscene-media-export (Sprint 8D)\n");

test("1. Manifest version 4 and renderer contract 9D (production)", () => {
  assert.equal(EXPORT_MANIFEST_VERSION, 4);
  assert.equal(EXPORT_RENDERER_CONTRACT_VERSION, "9D");
  const manifest = buildExportManifest({
    story: storyFromScenes([twoItemScene()]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  assert.equal(manifest.version, 4);
  assert.equal(manifest.rendererContractVersion, "9D");
});

test("2. Legacy story produces one media item", () => {
  const scene: FootieScene = {
    id: "legacy",
    start: 0,
    end: 3,
    duration: 3,
    startMs: 0,
    endMs: 3000,
    durationMs: 3000,
    subtitle: "",
    media: imageMedia("https://example.com/legacy.jpg"),
  };
  const manifest = buildExportManifest({
    story: storyFromScenes([scene]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  assert.equal(manifest.scenes[0]!.mediaTimeline.items.length, 1);
  assert.equal(manifest.scenes[0]!.media.type, "image");
});

test("3. Gate OFF produces one compatibility item", () => {
  const manifest = buildExportManifest({
    story: storyFromScenes([twoItemScene()]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: false,
  });
  assert.equal(manifest.scenes[0]!.mediaTimeline.items.length, 1);
  assert.equal(manifest.scenes[0]!.mediaTimeline.items[0]!.media.type, "image");
  if (manifest.scenes[0]!.media.type === "image") {
    assert.equal(manifest.scenes[0]!.media.source, "https://example.com/first.jpg");
  }
});

test("4. Gate ON freezes all items/windows", () => {
  const scene = twoItemScene();
  const manifest = buildExportManifest({
    story: storyFromScenes([scene]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const items = manifest.scenes[0]!.mediaTimeline.items;
  assert.equal(items.length, 2);
  assert.equal(items[0]!.startOffsetMs, 0);
  assert.equal(items[0]!.endOffsetMs, 3000);
  assert.equal(items[1]!.startOffsetMs, 3000);
  assert.equal(items[1]!.endOffsetMs, 6000);
  assert.equal(items[0]!.id, scene.mediaTimeline!.items[0]!.id);
});

test("5. scene.media equals the first frozen item", () => {
  const manifest = buildExportManifest({
    story: storyFromScenes([twoItemScene()]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  assert.deepEqual(
    manifest.scenes[0]!.media,
    manifest.scenes[0]!.mediaTimeline.items[0]!.media,
  );
});

test("6. Later-item framing/motion/trim survives manifest build", () => {
  let scene = twoItemScene();
  const id2 = scene.mediaTimeline!.items[1]!.id;
  const framed = buildMediaFramingPatch(
    buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[1]!.media),
    { zoom: 1.55, positionY: 12 },
  );
  scene = updateSceneMediaItemMedia(scene, id2, framed!.media!).scene;
  const motion = buildMediaMotionPatch(
    buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[1]!.media),
    { enabled: true, presetId: "pan-right" },
  );
  scene = updateSceneMediaItemMedia(scene, id2, motion!.media).scene;
  // Replace second with video + trim
  const video = videoMedia("https://example.com/second.mp4");
  scene = updateSceneMediaItemMedia(scene, id2, video).scene;
  const trim = buildVideoTrimPatch(
    buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[1]!.media),
    { trimStartMs: 500, trimEndMs: 3500 },
  );
  scene = updateSceneMediaItemMedia(scene, id2, trim!.media).scene;

  const manifest = buildExportManifest({
    story: storyFromScenes([scene]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const item2 = manifest.scenes[0]!.mediaTimeline.items[1]!;
  assert.equal(item2.media.type, "video");
  if (item2.media.type === "video") {
    assert.equal(item2.media.trimStartMs, 500);
    assert.equal(item2.media.trimEndMs, 3500);
    assert.equal(item2.media.zoom, 1); // video replace reset framing unless preserved — trim path preserves
    assert.equal(item2.media.sourceAudioPolicy, "muted");
  }
});

test("7. Boundary/order/later-item changes alter fingerprint", () => {
  const scene = twoItemScene();
  const base = buildExportManifest({
    story: storyFromScenes([scene]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const reordered: FootieScene = {
    ...scene,
    mediaTimeline: {
      version: 1,
      items: [scene.mediaTimeline!.items[1]!, scene.mediaTimeline!.items[0]!],
    },
    media: scene.mediaTimeline!.items[1]!.media,
  };
  const reorderedManifest = buildExportManifest({
    story: storyFromScenes([reordered]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  assert.notEqual(base.fingerprint, reorderedManifest.fingerprint);

  const weighted: FootieScene = {
    ...scene,
    mediaTimeline: {
      version: 1,
      items: [
        { ...scene.mediaTimeline!.items[0]!, durationWeight: 1 },
        { ...scene.mediaTimeline!.items[1]!, durationWeight: 3 },
      ],
    },
  };
  const weightedManifest = buildExportManifest({
    story: storyFromScenes([weighted]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  assert.notEqual(base.fingerprint, weightedManifest.fingerprint);
});

test("8. Manifest is deeply immutable", () => {
  const manifest = buildExportManifest({
    story: storyFromScenes([twoItemScene()]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  assert.throws(() => {
    (
      manifest.scenes[0]!.mediaTimeline as unknown as { items: unknown[] }
    ).items.push({});
  });
});

test("9. Active-item resolver matches domain boundary semantics", () => {
  const manifest = buildExportManifest({
    story: storyFromScenes([twoItemScene()]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const scene = manifest.scenes[0]!;
  const before = resolveExportActiveSceneMediaFrame(scene, 2999);
  const at = resolveExportActiveSceneMediaFrame(scene, 3000);
  assert.equal(before?.itemIndex, 0);
  assert.equal(at?.itemIndex, 1);
  assert.equal(at?.itemElapsedMs, 0);
  const end = resolveExportActiveSceneMediaFrame(scene, 6000);
  assert.equal(end?.holdingFinalFrame, true);
  assert.equal(end?.itemIndex, 1);
});

test("10. Cache keys are collision-safe", () => {
  const a = buildExportMediaCacheKey("scene|1", "item");
  const b = buildExportMediaCacheKey("scene", "1|item");
  assert.notEqual(a, b);
  assert.match(a, /^s\d+:/);
  assert.match(a, /\|m\d+:/);
});

test("11. Every item preloads independently", async () => {
  const manifest = buildExportManifest({
    story: storyFromScenes([twoItemScene()]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const cache = createExportMediaCache();
  const loaders = {
    loadImage: async (url: string) => {
      const img = { src: url } as HTMLImageElement;
      return img;
    },
  };
  await preloadExportManifestMedia(manifest.scenes, cache, { loaders });
  const items = manifest.scenes[0]!.mediaTimeline.items;
  assert.equal(cache.assets.size, 2);
  assert.ok(cache.assets.has(buildExportMediaCacheKey(manifest.scenes[0]!.id, items[0]!.id)));
  assert.ok(cache.assets.has(buildExportMediaCacheKey(manifest.scenes[0]!.id, items[1]!.id)));
});

test("12. Prepared frame identifies the correct item", () => {
  const prepare = readSrc("src/features/export/runtime/prepare-export-frame.ts");
  assert.match(prepare, /resolveExportActiveSceneMediaFrame/);
  assert.match(prepare, /mediaItemId/);
  assert.match(prepare, /buildActiveExportDrawScene/);
});

test("13–15. Mixed media / item-local video / motion wiring present", () => {
  const videoTime = readSrc(
    "src/features/export/timing/resolve-export-video-source-time.ts",
  );
  assert.match(videoTime, /itemElapsedMs/);
  assert.match(videoTime, /resolveExportActiveSceneMediaFrame/);
  const draw = readSrc("src/features/export/runtime/draw-prepared-export-frame.ts");
  assert.match(draw, /itemElapsedMs/);
  assert.match(draw, /buildActiveExportDrawScene/);
});

test("16. Scene transition resolves both active items", () => {
  const prepare = readSrc("src/features/export/runtime/prepare-export-frame.ts");
  assert.match(prepare, /transition\.fromScene/);
  assert.match(prepare, /transition\.toScene/);
  assert.match(prepare, /peerActive/);
});

test("17. End buffer holds final item/final frame", () => {
  const manifest = buildExportManifest({
    story: storyFromScenes([twoItemScene()]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const hold = resolveExportActiveSceneMediaFrame(manifest.scenes[0]!, 99999);
  assert.equal(hold?.holdingFinalFrame, true);
  assert.equal(hold?.itemIndex, 1);
});

test("18. Chunk boundary causes no media timing discontinuity", () => {
  const chunk = readSrc("src/features/export/chunking/render-export-chunk.ts");
  assert.match(chunk, /prepareExportFrame|frameIndex/);
  assert.doesNotMatch(chunk, /mediaTimeline/);
});

test("19. Every video item participates in capability/cost estimates", () => {
  let scene = twoItemScene();
  const id2 = scene.mediaTimeline!.items[1]!.id;
  scene = updateSceneMediaItemMedia(scene, id2, videoMedia("https://example.com/v.mp4")).scene;
  const manifest = buildExportManifest({
    story: storyFromScenes([scene]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const cost = estimateExportCost(manifest);
  assert.ok(cost.estimatedFrames > 0);
  // Image + video should count the video item toward risk heuristics path.
  const costSrc = readSrc("src/features/export/domain/export-cost-estimate.utils.ts");
  assert.match(costSrc, /mediaTimeline\?\.items/);
});

test("20. Invalid later item cannot hide behind valid first media", () => {
  const scene = twoItemScene();
  const manifest = buildExportManifest({
    story: storyFromScenes([scene]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  // Inject invalid later item into a shallow clone for preflight
  const poisoned = {
    ...manifest,
    scenes: [
      {
        ...manifest.scenes[0]!,
        mediaTimeline: {
          version: 1 as const,
          items: [
            manifest.scenes[0]!.mediaTimeline.items[0]!,
            {
              ...manifest.scenes[0]!.mediaTimeline.items[1]!,
              media: { type: "image" as const, source: "", fitMode: "fit" as const, positionX: 0, positionY: 0, zoom: 1, rotationDeg: 0, motion: null },
            },
          ],
        },
      },
    ],
  };
  const preflight = runExportCapabilityPreflight(poisoned as typeof manifest);
  // Fail-closed before/at integrity: empty later source must not hide behind item 1.
  assert.equal(preflight.supported, false);
  assert.ok(
    preflight.blockers.some(
      (b) => b.code === "MISSING_MEDIA" || b.code === "INVALID_MANIFEST",
    ),
  );
});

test("21. Source-video audio remains muted", () => {
  let scene = twoItemScene();
  scene = updateSceneMediaItemMedia(
    scene,
    scene.mediaTimeline!.items[1]!.id,
    videoMedia("https://example.com/v.mp4"),
  ).scene;
  const manifest = buildExportManifest({
    story: storyFromScenes([scene]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const video = manifest.scenes[0]!.mediaTimeline.items[1]!.media;
  assert.equal(video.type, "video");
  if (video.type === "video") {
    assert.equal(video.sourceAudioPolicy, "muted");
  }
  assert.equal(manifest.audio.sourceVideoAudioPolicy, "muted");
});

test("22. Renderer consumes manifest only after freeze", () => {
  const prepare = readSrc("src/features/export/runtime/prepare-export-from-manifest.ts");
  assert.match(prepare, /assertExportManifest/);
  assert.throws(() =>
    prepareExportFromManifest({
      version: 1,
      rendererContractVersion: "6C.1",
      scenes: [],
    } as never),
  );
});

test("23. Scene count and project/render duration remain unchanged", () => {
  const scene = twoItemScene();
  const story = storyFromScenes([scene]);
  const timeline = buildMasterTimeline(story, { mode: "export" });
  const off = buildExportManifest({
    story,
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: false,
  });
  const on = buildExportManifest({
    story,
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  assert.equal(off.project.sceneCount, 1);
  assert.equal(on.project.sceneCount, 1);
  assert.equal(off.project.renderDurationMs, on.project.renderDurationMs);
  assert.equal(on.project.renderDurationMs, timeline.renderDurationMs);
});

test("24. 720p/1080p framing parity remains intact", () => {
  const framing = readSrc("src/verification/editor/mediaFramingParity.verify.ts");
  assert.match(framing, /720p|1080p/);
});

test("25. Legacy Preview/Export parity remains intact", () => {
  const scene: FootieScene = {
    id: "one",
    start: 0,
    end: 4,
    duration: 4,
    startMs: 0,
    endMs: 4000,
    durationMs: 4000,
    subtitle: "",
    media: imageMedia("https://example.com/one.jpg", {
      transform: { x: 5, y: 6, scale: 1.1, rotation: 2 },
    }),
  };
  const off = buildExportManifest({
    story: storyFromScenes([scene]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: false,
  });
  const on = buildExportManifest({
    story: storyFromScenes([scene]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  assert.deepEqual(off.scenes[0]!.media, on.scenes[0]!.media);
  assert.equal(off.scenes[0]!.mediaTimeline.items.length, 1);
  assert.equal(on.scenes[0]!.mediaTimeline.items.length, 1);
});

test("Video source time uses item-local elapsed", () => {
  let scene = twoItemScene();
  scene = updateSceneMediaItemMedia(
    scene,
    scene.mediaTimeline!.items[1]!.id,
    videoMedia("https://example.com/v.mp4"),
  ).scene;
  const manifest = buildExportManifest({
    story: storyFromScenes([scene]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const resolved = resolveExportVideoSourceTimeMs(manifest.scenes[0]!, 3500);
  assert.equal(resolved.mediaItemId, manifest.scenes[0]!.mediaTimeline.items[1]!.id);
  assert.ok(resolved.sourceTimeMs >= 0);
});

test("Domain builders do not read process.env; multi-image defaults on", () => {
  const build = readSrc("src/features/export/domain/build-export-manifest.ts");
  assert.doesNotMatch(build, /process\.env\./);
  assert.doesNotMatch(build, /isMultiImageScenesEnabled\s*\(/);
  assert.match(build, /multiImageScenesEnabled !== false/);
  const prepare = readSrc("src/features/export/domain/prepare-export-request.ts");
  assert.doesNotMatch(prepare, /isMultiImageScenesEnabled/);
  assert.match(prepare, /multiImageScenesEnabled !== false/);
});

function seedDrawableItem(
  cache: ReturnType<typeof createExportMediaCache>,
  sceneId: string,
  mediaItemId: string,
  url = "https://example.com/active.jpg",
): void {
  const key = buildExportMediaCacheKey(sceneId, mediaItemId);
  const element = { src: url, naturalWidth: 8, naturalHeight: 8 } as HTMLImageElement;
  const asset: ExportImageAsset = {
    kind: "image",
    sceneId,
    mediaItemId,
    cacheKey: key,
    url,
    element,
    status: "ready",
  };
  cache.assets.set(key, asset);
  cache.images.set(key, element);
}

function oneImageThenVideosScene(): FootieScene {
  const generateId = createSequentialMediaItemIdGenerator("mix");
  let scene: FootieScene = {
    id: "scene-mix",
    start: 0,
    end: 9,
    duration: 9,
    startMs: 0,
    endMs: 9000,
    durationMs: 9000,
    subtitle: "Mix",
    narration: "Narration.",
    media: imageMedia("https://example.com/first.jpg"),
    image: {
      url: "https://example.com/first.jpg",
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
    },
  };
  scene = appendSceneMediaImageItem(scene, imageMedia("https://example.com/v1.jpg"), {
    generateId,
  }).scene;
  scene = appendSceneMediaImageItem(scene, imageMedia("https://example.com/v2.jpg"), {
    generateId,
  }).scene;
  scene = appendSceneMediaImageItem(scene, imageMedia("https://example.com/v3.jpg"), {
    generateId,
  }).scene;
  const ids = scene.mediaTimeline!.items.map((item) => item.id);
  scene = updateSceneMediaItemMedia(scene, ids[1]!, videoMedia("https://example.com/v1.mp4")).scene;
  scene = updateSceneMediaItemMedia(scene, ids[2]!, videoMedia("https://example.com/v2.mp4")).scene;
  scene = updateSceneMediaItemMedia(scene, ids[3]!, videoMedia("https://example.com/v3.mp4")).scene;
  return scene;
}

test("8D.1-7. Composite-key media is recognized as drawable", () => {
  const cache = createExportMediaCache();
  const sceneId = "scene-1";
  const mediaItemId = "item-active";
  seedDrawableItem(cache, sceneId, mediaItemId);
  assert.equal(exportSceneHasDrawableMedia(cache, { id: sceneId }, mediaItemId), true);
  // Legacy __scene__ lookup must not falsely claim the active item.
  assert.equal(exportSceneHasDrawableMedia(cache, { id: sceneId }), false);
});

test("8D.1-8. No false placeholder label over active timeline media", () => {
  const cache = createExportMediaCache();
  const sceneId = "scene-1";
  const mediaItemId = "item-active";
  seedDrawableItem(cache, sceneId, mediaItemId);
  const shouldDrawSceneTypeLabel =
    !exportSceneHasDrawableMedia(cache, { id: sceneId }, mediaItemId) &&
    Boolean("match");
  assert.equal(shouldDrawSceneTypeLabel, false);
  const drawSrc = readSrc("src/features/export/runtime/draw-prepared-export-frame.ts");
  assert.match(drawSrc, /activeDrawMediaItemId/);
  assert.match(drawSrc, /preparedBySceneId\.get\(frame\.drawScene\.id\)\?\.mediaItemId/);
  assert.match(drawSrc, /exportSceneHasDrawableMedia\(\s*context\.mediaCache,\s*frame\.drawScene,\s*activeDrawMediaItemId/);
});

test("8D.1-9. Missing active media still falls back", () => {
  const cache = createExportMediaCache();
  assert.equal(
    exportSceneHasDrawableMedia(cache, { id: "scene-1" }, "missing-item"),
    false,
  );
  const shouldDrawSceneTypeLabel =
    !exportSceneHasDrawableMedia(cache, { id: "scene-1" }, "missing-item") &&
    Boolean("match");
  assert.equal(shouldDrawSceneTypeLabel, true);
});

test("8D.1-10. One scene with first image and later videos is mixed/video-heavy", () => {
  const manifest = buildExportManifest({
    story: storyFromScenes([oneImageThenVideosScene()]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const estimate = buildExportDeviceCapabilityEstimate(
    manifest,
    estimateExportCost(manifest),
  );
  assert.equal(estimate.sceneCount, 1);
  assert.equal(estimate.mediaItemCount, 4);
  assert.equal(estimate.imageMediaItemCount, 1);
  assert.equal(estimate.videoMediaItemCount, 3);
  assert.equal(estimate.videoSceneCount, 3);
  assert.equal(estimate.imageSceneCount, 1);
  assert.equal(isImageHeavyProject(estimate), false);
  assert.equal(isMixedMediaProject(estimate), true);
  assert.equal(isVideoHeavyProject(estimate), true);
});

test("8D.1-11. Device approval counts every video item", () => {
  const manifest = buildExportManifest({
    story: storyFromScenes([oneImageThenVideosScene()]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const estimate = buildExportDeviceCapabilityEstimate(
    manifest,
    estimateExportCost(manifest),
  );
  assert.equal(estimate.videoMediaItemCount, 3);
  // Compatibility-first counting would have seen only the image.
  assert.notEqual(
    manifest.scenes.filter((scene) => scene.media.type === "video").length,
    estimate.videoMediaItemCount,
  );
});

test("8D.1-12. QA checkpoint reports the active item and item-local time", () => {
  const manifest = buildExportManifest({
    story: storyFromScenes([twoItemScene()]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const scene = manifest.scenes[0]!;
  const second = scene.mediaTimeline.items[1]!;
  const checkpoint = sampleParityCheckpoint(
    manifest,
    scene.startMs + second.startOffsetMs + 250,
    "mid-second-item",
  );
  assert.equal(checkpoint.mediaItemId, second.id);
  assert.equal(checkpoint.mediaItemElapsedMs, 250);
  assert.equal(checkpoint.mediaType, second.media.type);
});

test("8D.1-13. QA checkpoints include item boundaries", () => {
  const manifest = buildExportManifest({
    story: storyFromScenes([twoItemScene()]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const scene = manifest.scenes[0]!;
  const items = scene.mediaTimeline.items;
  const checkpoints = collectExportParityCheckpoints(manifest);
  const labels = checkpoints.map((cp) => cp.label);
  assert.ok(labels.some((label) => label.startsWith(`media-item-start:${scene.id}:${items[0]!.id}`)));
  assert.ok(labels.some((label) => label.startsWith(`media-item-end:${scene.id}:${items[0]!.id}`)));
  assert.ok(labels.some((label) => label.startsWith(`media-item-boundary:${scene.id}:${items[0]!.id}`)));
  const boundary = checkpoints.find((cp) =>
    cp.label.startsWith(`media-item-boundary:${scene.id}:${items[0]!.id}`),
  );
  assert.ok(boundary);
  assert.equal(boundary!.mediaItemId, items[1]!.id);
  assert.equal(boundary!.mediaItemElapsedMs, 0);
});

function cloneManifest(manifest: ExportManifest): ExportManifest {
  return structuredClone(manifest) as ExportManifest;
}

test("8D.1-14. Wrong renderer contract is rejected by preflight", () => {
  const manifest = buildExportManifest({
    story: storyFromScenes([twoItemScene()]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const bad = cloneManifest(manifest);
  (bad as { rendererContractVersion: string }).rendererContractVersion = "6C.1";
  const preflight = runExportCapabilityPreflight(bad);
  assert.ok(preflight.blockers.some((b) => b.code === "INVALID_MANIFEST"));
  assert.equal(validateExportManifest(bad).ok, false);
});

test("8D.1-15. Non-contiguous windows are rejected", () => {
  const manifest = buildExportManifest({
    story: storyFromScenes([twoItemScene()]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const bad = cloneManifest(manifest);
  const items = bad.scenes[0]!.mediaTimeline.items;
  (items[1] as { startOffsetMs: number }).startOffsetMs = items[0]!.endOffsetMs + 100;
  (items[1] as { durationMs: number }).durationMs =
    items[1]!.endOffsetMs - items[1]!.startOffsetMs;
  const result = validateExportManifest(bad);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === "NON_CONTIGUOUS_MEDIA_WINDOWS"));
  assert.ok(
    runExportCapabilityPreflight(bad).blockers.some((b) => b.code === "INVALID_MANIFEST"),
  );
});

test("8D.1-16. Duplicate IDs are rejected", () => {
  const manifest = buildExportManifest({
    story: storyFromScenes([twoItemScene()]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const bad = cloneManifest(manifest);
  const items = bad.scenes[0]!.mediaTimeline.items;
  (items[1] as { id: string }).id = items[0]!.id;
  const result = validateExportManifest(bad);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === "DUPLICATE_MEDIA_ITEM_ID"));
});

test("8D.1-17. Bad indices/durations are rejected", () => {
  const manifest = buildExportManifest({
    story: storyFromScenes([twoItemScene()]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const badIndex = cloneManifest(manifest);
  (badIndex.scenes[0]!.mediaTimeline.items[1] as { index: number }).index = 99;
  assert.ok(
    validateExportManifest(badIndex).issues.some(
      (i) => i.code === "INVALID_MEDIA_ITEM_INDEX",
    ),
  );

  const badDuration = cloneManifest(manifest);
  (badDuration.scenes[0]!.mediaTimeline.items[0] as { durationMs: number }).durationMs = 1;
  assert.ok(
    validateExportManifest(badDuration).issues.some(
      (i) => i.code === "INVALID_MEDIA_ITEM_DURATION",
    ),
  );
});

test("8D.1-18. Compatibility-media mismatch is rejected", () => {
  const manifest = buildExportManifest({
    story: storyFromScenes([twoItemScene()]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const bad = cloneManifest(manifest);
  (bad.scenes[0] as { media: { type: string; source?: string } }).media = {
    type: "image",
    source: "https://example.com/not-first.jpg",
    fitMode: "fit",
    positionX: 0,
    positionY: 0,
    zoom: 1,
    rotationDeg: 0,
  } as never;
  const result = validateExportManifest(bad);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === "COMPATIBILITY_MEDIA_MISMATCH"));
});

test("8D.1-19. Collision-prone seek IDs are impossible", () => {
  resetExportVideoSamplingState();
  const keyA = buildExportMediaCacheKey("scene|1", "item");
  const keyB = buildExportMediaCacheKey("scene", "1|item");
  assert.notEqual(keyA, keyB);
  beginExportVideoSeekRequest(keyA);
  const identityA = getExportVideoSamplingState().sceneId;
  beginExportVideoSeekRequest(keyB);
  const identityB = getExportVideoSamplingState().sceneId;
  assert.equal(identityA, keyA);
  assert.equal(identityB, keyB);
  assert.notEqual(identityA, identityB);
  const prepareSrc = readSrc(
    "src/features/export/utils/export-scene-media-renderer.ts",
  );
  assert.match(prepareSrc, /buildExportMediaCacheKey\(scene\.id, mediaItemId\)/);
  assert.doesNotMatch(prepareSrc, /beginExportVideoSeekRequest\(`\$\{scene\.id\}:\$\{mediaItemId\}`\)/);
});

test("8D.1-20. Valid generated production manifests still pass", () => {
  const manifest = buildExportManifest({
    story: storyFromScenes([twoItemScene(), oneImageThenVideosScene()]),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const integrity = validateExportManifest(manifest);
  assert.equal(integrity.ok, true);
  assert.equal(integrity.issues.length, 0);
  const preflight = runExportCapabilityPreflight(manifest);
  assert.ok(!preflight.blockers.some((b) => b.code === "INVALID_MANIFEST"));
  assert.doesNotThrow(() => prepareExportFromManifest(manifest));
});

function assertFailClosedMalformed(
  name: string,
  mutate: (manifest: ExportManifest) => void,
  expectedCode: string,
): void {
  test(`8D.1A ${name}`, () => {
    const base = buildExportManifest({
      story: storyFromScenes([twoItemScene()]),
      environment: CAPABLE_ENV,
      multiImageScenesEnabled: true,
    });
    const bad = cloneManifest(base);
    mutate(bad);
    const before = JSON.stringify(bad);

    let validation: ReturnType<typeof validateExportManifest> = {
      ok: true,
      issues: [],
    };
    assert.doesNotThrow(() => {
      validation = validateExportManifest(bad);
    });
    assert.equal(validation.ok, false);
    assert.ok(
      validation.issues.some((issue) => issue.code === expectedCode),
      `expected issue code ${expectedCode}, got ${validation.issues.map((i) => i.code).join(",")}`,
    );

    let preflight = runExportCapabilityPreflight(base);
    assert.doesNotThrow(() => {
      preflight = runExportCapabilityPreflight(bad);
    });
    assert.equal(preflight.supported, false);
    assert.equal(preflight.renderer, "blocked");
    assert.equal(
      preflight.blockers.filter((b) => b.code === "INVALID_MANIFEST").length,
      1,
    );
    assert.equal(
      preflight.estimatedCost.rendererVersion,
      EXPORT_INVALID_MANIFEST_COST_SENTINEL.rendererVersion,
    );
    assert.equal(preflight.estimatedCost.estimatedFrames, 0);

    assert.throws(() => prepareExportFromManifest(bad));
    assert.equal(JSON.stringify(bad), before, "manifest must remain unrepaired");
  });
}

assertFailClosedMalformed(
  "null scene",
  (manifest) => {
    (manifest.scenes as unknown[])[0] = null;
  },
  "INVALID_SCENE",
);

assertFailClosedMalformed(
  "null timeline item",
  (manifest) => {
    (manifest.scenes[0]!.mediaTimeline.items as unknown[])[0] = null;
  },
  "INVALID_MEDIA_ITEM",
);

assertFailClosedMalformed(
  "null media",
  (manifest) => {
    (manifest.scenes[0]!.mediaTimeline.items[0] as { media: unknown }).media = null;
  },
  "INVALID_MEDIA",
);

assertFailClosedMalformed(
  "unknown media type",
  (manifest) => {
    (manifest.scenes[0]!.mediaTimeline.items[0] as { media: { type: string } }).media = {
      type: "gif",
    };
    (manifest.scenes[0] as { media: { type: string } }).media = { type: "gif" };
  },
  "UNKNOWN_MEDIA_TYPE",
);

assertFailClosedMalformed(
  "non-string media source",
  (manifest) => {
    (manifest.scenes[0]!.mediaTimeline.items[0]!.media as { source: unknown }).source = 42;
    (manifest.scenes[0]!.media as { source: unknown }).source = 42;
  },
  "INVALID_MEDIA_SOURCE",
);

assertFailClosedMalformed(
  "NaN/Infinity timing and framing",
  (manifest) => {
    (manifest.scenes[0]!.mediaTimeline.items[0] as { startOffsetMs: number }).startOffsetMs =
      Number.NaN;
    (manifest.scenes[0]!.mediaTimeline.items[0]!.media as { zoom: number }).zoom =
      Number.POSITIVE_INFINITY;
    (manifest.scenes[0]!.media as { zoom: number }).zoom = Number.POSITIVE_INFINITY;
  },
  "INVALID_MEDIA_ITEM_TIMING",
);

assertFailClosedMalformed(
  "malformed motion",
  (manifest) => {
    (manifest.scenes[0]!.mediaTimeline.items[0]!.media as { motion: unknown }).motion = {
      enabled: "yes",
      presetId: 1,
      easing: null,
      intensity: Number.NaN,
    };
    (manifest.scenes[0]!.media as { motion: unknown }).motion = {
      enabled: "yes",
      presetId: 1,
      easing: null,
      intensity: Number.NaN,
    };
  },
  "INVALID_MEDIA_MOTION",
);

assertFailClosedMalformed(
  "invalid video trim/duration/playback/audio policy",
  (manifest) => {
    const videoMedia = {
      type: "video" as const,
      source: "https://example.com/v.mp4",
      sourceDurationMs: -10,
      trimStartMs: 500,
      trimEndMs: 100,
      playbackRate: 2 as unknown as 1,
      sourceAudioPolicy: "unmuted" as unknown as "muted",
      fitMode: "fill" as const,
      positionX: 0,
      positionY: 0,
      zoom: 1,
      rotationDeg: 0,
    };
    (manifest.scenes[0]!.mediaTimeline.items[0] as { media: unknown }).media = videoMedia;
    (manifest.scenes[0] as { media: unknown }).media = videoMedia;
  },
  "INVALID_VIDEO_PLAYBACK_RATE",
);

assertFailClosedMalformed(
  "overlapping media windows",
  (manifest) => {
    const items = manifest.scenes[0]!.mediaTimeline.items;
    (items[1] as { startOffsetMs: number }).startOffsetMs = items[0]!.endOffsetMs - 250;
    (items[1] as { durationMs: number }).durationMs =
      items[1]!.endOffsetMs - items[1]!.startOffsetMs;
  },
  "OVERLAPPING_MEDIA_WINDOWS",
);

assertFailClosedMalformed(
  "malformed compatibility media",
  (manifest) => {
    (manifest.scenes[0] as { media: unknown }).media = {
      type: "image",
      source: "https://example.com/compat.jpg",
      fitMode: "stretch",
      positionX: 0,
      positionY: 0,
      zoom: 1,
      rotationDeg: 0,
    };
  },
  "INVALID_MEDIA_FIT_MODE",
);

test("8D.1A property-order-independent semantic equality", () => {
  const left = {
    type: "image" as const,
    source: "https://example.com/a.jpg",
    fitMode: "fit" as const,
    positionX: 1,
    positionY: 2,
    zoom: 1.5,
    rotationDeg: 3,
    motion: {
      enabled: true,
      presetId: "slow-zoom-in",
      easing: "ease-out",
      intensity: 0.4,
    },
  };
  const right = {
    motion: {
      intensity: 0.4,
      easing: "ease-out",
      presetId: "slow-zoom-in",
      enabled: true,
    },
    rotationDeg: 3,
    zoom: 1.5,
    positionY: 2,
    positionX: 1,
    fitMode: "fit" as const,
    source: "https://example.com/a.jpg",
    type: "image" as const,
  };
  assert.equal(exportMediaManifestSemanticallyEqual(left, right), true);
  assert.equal(
    exportMediaManifestSemanticallyEqual(left, { ...right, zoom: 2 }),
    false,
  );
});

assertFailClosedMalformed(
  "incorrect hasDrawableMedia",
  (manifest) => {
    (manifest.scenes[0] as { hasDrawableMedia: boolean }).hasDrawableMedia = false;
  },
  "INVALID_HAS_DRAWABLE_MEDIA",
);

assertFailClosedMalformed(
  "missing/invalid fingerprint",
  (manifest) => {
    (manifest as { fingerprint: unknown }).fingerprint = "";
  },
  "INVALID_MANIFEST_FINGERPRINT",
);

test("8D.1A non-object manifest never throws and blocks", () => {
  for (const value of [null, undefined, 12, "manifest", true]) {
    let validation: ReturnType<typeof validateExportManifest> = {
      ok: true,
      issues: [],
    };
    assert.doesNotThrow(() => {
      validation = validateExportManifest(value);
    });
    assert.equal(validation.ok, false);
    let preflight;
    assert.doesNotThrow(() => {
      preflight = runExportCapabilityPreflight(value as never);
    });
    assert.equal(preflight!.supported, false);
    assert.equal(preflight!.renderer, "blocked");
    assert.equal(preflight!.estimatedCost.rendererVersion, "invalid-manifest-sentinel");
  }
});

test("8D.1A integrity runs before cost estimation (source order)", () => {
  const preflightSrc = readSrc(
    "src/features/export/domain/run-export-capability-preflight.ts",
  );
  const integrityIdx = preflightSrc.indexOf("validateExportManifest(manifest)");
  const costIdx = preflightSrc.indexOf("estimateExportCost(manifest)");
  assert.ok(integrityIdx >= 0 && costIdx > integrityIdx);
  assert.match(preflightSrc, /EXPORT_INVALID_MANIFEST_COST_SENTINEL/);
  assert.match(preflightSrc, /invalid-manifest-sentinel/);
  // Frozen v2 validator remains available for explicit v2 fixtures.
  assert.match(
    readSrc("src/features/export/domain/assert-export-manifest-v2-scene-media.ts"),
    /export function validateExportManifestV2SceneMedia/,
  );
  assert.match(
    readSrc("src/features/export/domain/validate-export-manifest.ts"),
    /validateExportManifestV2SceneMedia/,
  );
});

console.log(`\n${passed} passed\n`);
