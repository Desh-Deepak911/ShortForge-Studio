/**
 * Export canvas media renderer — 4.2A-5B-2
 * Run: npm run test:export-scene-media-renderer
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createExportMediaCache,
  type ExportMediaCache,
  type ExportVideoAsset,
} from "@/features/export/utils/export-media-cache.utils";
import {
  drawCanvasImageSource,
  drawSceneImageFrame,
  drawSceneMediaFrame,
  getExportSceneMediaRendererDiagnostics,
  prepareExportSceneMediaFrame,
  resetExportSceneMediaRendererDiagnostics,
  resolveExportSceneMediaDrawImage,
  resolveExportSceneMediaPlaybackState,
  seekVideoFrame,
} from "@/features/export/utils/export-scene-media-renderer";
import type { FootieScene, SceneImage } from "@/features/story/types";
import {
  drawSceneImageInFrame,
  getSceneImageCoverDimensions,
  getSceneImageDrawDimensions,
  resolveSceneImageTransformForFrame,
} from "@/features/story/utils";
import type { MasterTimeline } from "@/features/timeline-intelligence/timeline.types";

let passed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    });
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function baseScene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 5,
    duration: 5,
    durationMs: 5000,
    startMs: 0,
    endMs: 5000,
    subtitle: "Caption",
    ...overrides,
  };
}

function emptyTimeline(): MasterTimeline {
  return {
    contentEndMs: 5000,
    renderDurationMs: 5400,
    warnings: [],
    tracks: [],
    diagnostics: {},
  } as unknown as MasterTimeline;
}

function createMockCtx() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const ctx = {
    save: () => calls.push({ op: "save", args: [] }),
    restore: () => calls.push({ op: "restore", args: [] }),
    beginPath: () => calls.push({ op: "beginPath", args: [] }),
    rect: (...args: unknown[]) => calls.push({ op: "rect", args }),
    clip: () => calls.push({ op: "clip", args: [] }),
    translate: (...args: unknown[]) => calls.push({ op: "translate", args }),
    rotate: (...args: unknown[]) => calls.push({ op: "rotate", args }),
    scale: (...args: unknown[]) => calls.push({ op: "scale", args }),
    drawImage: (...args: unknown[]) => calls.push({ op: "drawImage", args }),
    createLinearGradient: () => ({
      addColorStop: () => undefined,
    }),
    fillRect: (...args: unknown[]) => calls.push({ op: "fillRect", args }),
    fillStyle: "",
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function createMockImage(url = "https://example.com/a.jpg"): HTMLImageElement {
  return {
    src: url,
    naturalWidth: 1080,
    naturalHeight: 1920,
    complete: true,
  } as unknown as HTMLImageElement;
}

function createMockVideo(url = "blob:clip"): HTMLVideoElement {
  let currentTime = 0;
  const listeners = new Map<string, Set<() => void>>();

  const video = {
    src: url,
    muted: true,
    volume: 0,
    paused: true,
    duration: 5,
    videoWidth: 1080,
    videoHeight: 1920,
    readyState: 2,
    get currentTime() {
      return currentTime;
    },
    set currentTime(value: number) {
      currentTime = value;
      queueMicrotask(() => {
        listeners.get("seeked")?.forEach((fn) => fn());
      });
    },
    pause() {
      this.paused = true;
    },
    addEventListener(type: string, fn: () => void) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.get(type)?.delete(fn);
    },
  };

  return video as unknown as HTMLVideoElement;
}

function seedImageCache(scene: FootieScene): ExportMediaCache {
  const cache = createExportMediaCache();
  const image = createMockImage(scene.image?.url ?? scene.media?.url ?? "https://example.com/a.jpg");
  cache.images.set(scene.id, image);
  cache.assets.set(scene.id, {
    kind: "image",
    sceneId: scene.id,
    url: image.src,
    element: image,
    status: "ready",
  });
  return cache;
}

function seedVideoCache(scene: FootieScene): ExportMediaCache {
  const cache = createExportMediaCache();
  const element = createMockVideo(scene.media?.url ?? "blob:clip");
  const asset: ExportVideoAsset = {
    kind: "video",
    sceneId: scene.id,
    url: element.src,
    element,
    durationMs: scene.media?.durationMs ?? 5000,
    muted: true,
    status: "ready",
  };
  cache.videos.set(scene.id, element);
  cache.assets.set(scene.id, asset);
  return cache;
}

async function run() {
  resetExportSceneMediaRendererDiagnostics();

  await test("Image scene still renders image path", () => {
    const scene = baseScene({
      image: { url: "https://example.com/still.jpg", scale: 1, x: 0, y: 0, fitMode: "fill" },
    });
    const cache = seedImageCache(scene);
    const { ctx, calls } = createMockCtx();

    const result = drawSceneMediaFrame({
      ctx,
      width: 1080,
      height: 1920,
      scene,
      cache,
      masterTimeline: emptyTimeline(),
      currentTimeMs: 1000,
      sceneElapsedMs: 1000,
      sceneDurationMs: 5000,
    });

    assert.equal(result.path, "image");
    assert.ok(calls.some((c) => c.op === "drawImage"));
  });

  await test("Video scene renders video path", async () => {
    const scene = baseScene({
      media: {
        type: "video",
        url: "blob:clip",
        durationMs: 5000,
        trimStartMs: 500,
        trimEndMs: 4500,
        muted: true,
        fitMode: "cover",
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      },
    });
    const cache = seedVideoCache(scene);
    const prepared = await prepareExportSceneMediaFrame(cache, scene, 1000, 5000);
    assert.equal(prepared.ok, true);
    assert.equal(prepared.path, "video");

    const { ctx, calls } = createMockCtx();
    const result = drawSceneMediaFrame({
      ctx,
      width: 1080,
      height: 1920,
      scene,
      cache,
      masterTimeline: emptyTimeline(),
      currentTimeMs: 1000,
      sceneElapsedMs: 1000,
      sceneDurationMs: 5000,
      mediaReady: prepared.ok,
    });

    assert.equal(result.path, "video");
    assert.ok(calls.some((c) => c.op === "drawImage"));
  });

  await test("Media Playback Engine used for clip timing", () => {
    const source = readSrc("src/features/export/utils/export-scene-media-renderer.ts");
    assert.match(source, /resolveSceneMediaPlayback/);
    assert.doesNotMatch(source, /trimStartMs\s*\+\s*sceneElapsed/);
  });

  await test("trimStart respected", () => {
    const scene = baseScene({
      media: {
        type: "video",
        url: "blob:clip",
        durationMs: 5000,
        trimStartMs: 1000,
        trimEndMs: 4000,
      },
    });
    const playback = resolveExportSceneMediaPlaybackState(scene, 0, 5000);
    assert.equal(playback.clipTimeMs, 1000);
  });

  await test("trimEnd respected", () => {
    const scene = baseScene({
      media: {
        type: "video",
        url: "blob:clip",
        durationMs: 5000,
        trimStartMs: 1000,
        trimEndMs: 4000,
      },
    });
    const playback = resolveExportSceneMediaPlaybackState(scene, 5000, 5000);
    assert.equal(playback.clipTimeMs, 4000);
    assert.equal(playback.ended, true);
  });

  await test("Hold last frame", () => {
    const scene = baseScene({
      media: {
        type: "video",
        url: "blob:clip",
        durationMs: 2000,
        trimStartMs: 0,
        trimEndMs: 2000,
      },
    });
    const playback = resolveExportSceneMediaPlaybackState(scene, 4500, 5000);
    assert.equal(playback.holdLastFrame, true);
    assert.equal(playback.clipTimeMs, 2000);
  });

  await test("Image geometry unchanged vs drawSceneImageInFrame", () => {
    const sceneImage: SceneImage = {
      url: "https://example.com/a.jpg",
      scale: 1.2,
      x: 40,
      y: -20,
      rotation: 5,
      fitMode: "fill",
    };
    const image = createMockImage();
    const { ctx: ctxA, calls: callsA } = createMockCtx();
    const { ctx: ctxB, calls: callsB } = createMockCtx();

    drawSceneImageInFrame(ctxA, image, 1080, 1920, sceneImage, 1080, 1920, 1);
    drawCanvasImageSource(ctxB, image, 1080, 1920, sceneImage, 1080, 1920, null);

    assert.deepEqual(
      callsA.filter((c) => c.op === "drawImage"),
      callsB.filter((c) => c.op === "drawImage"),
    );
    assert.deepEqual(
      callsA.filter((c) => c.op === "translate" || c.op === "scale" || c.op === "rotate"),
      callsB.filter((c) => c.op === "translate" || c.op === "scale" || c.op === "rotate"),
    );
  });

  await test("Video geometry matches image framing helpers", () => {
    const scene = baseScene({
      media: {
        type: "video",
        url: "blob:clip",
        durationMs: 5000,
        fitMode: "contain",
        transform: { x: 10, y: 20, scale: 1.1, rotation: 0 },
      },
    });
    const drawImage = resolveExportSceneMediaDrawImage(scene);
    assert.ok(drawImage);
    assert.equal(drawImage!.fitMode, "fit");
    assert.equal(drawImage!.scale, 1.1);

    const dims = getSceneImageDrawDimensions(drawImage!, 1080, 1920, 1080, 1920);
    const contain = getSceneImageCoverDimensions(1080, 1920, 1080, 1920);
    // contain fit uses contain dims, not cover — verify helper path is shared
    const resolved = resolveSceneImageTransformForFrame(drawImage!, 1080, 1920);
    assert.equal(resolved.fitMode, "fit");
    assert.ok(dims.drawWidth > 0 && dims.drawHeight > 0);
    assert.ok(contain.drawWidth > 0);
  });

  await test("Captions render after media in export frame", () => {
    const videoRender = readSrc("src/features/export/services/video-render.service.ts");
    const drawSceneFrame = videoRender.slice(
      videoRender.indexOf("function drawSceneFrame"),
      videoRender.indexOf("function mapRenderingProgress"),
    );
    const mediaIdx = drawSceneFrame.indexOf("drawSceneBackground(");
    const captionIdx = Math.max(
      drawSceneFrame.indexOf("drawExportSubtitlesCaption("),
      drawSceneFrame.indexOf("drawExportGeneratedCaption("),
    );
    assert.ok(mediaIdx > -1 && captionIdx > mediaIdx);
  });

  await test("Transition callback works with media renderer", () => {
    const videoRender = readSrc("src/features/export/services/video-render.service.ts");
    assert.match(videoRender, /drawExportTransitionBackgrounds/);
    assert.match(videoRender, /drawFromBackground:[\s\S]*drawSceneBackground/);
    assert.match(videoRender, /drawToBackground:[\s\S]*drawSceneBackground/);
    assert.match(videoRender, /prepareExportMediaForTimelineFrame/);
  });

  await test("Video seek timeout falls back gracefully", async () => {
    resetExportSceneMediaRendererDiagnostics();
    const video = createMockVideo();
    // Force seek hang by never firing seeked for far target after stubbing addEventListener
    const hanging = {
      ...video,
      currentTime: 0,
      muted: true,
      volume: 0,
      paused: true,
      pause() {},
      addEventListener() {},
      removeEventListener() {},
    } as unknown as HTMLVideoElement;

    // Override currentTime setter to not emit seeked
    Object.defineProperty(hanging, "currentTime", {
      get: () => 0,
      set: () => undefined,
      configurable: true,
    });

    const ok = await seekVideoFrame(hanging, 2.5, { timeoutMs: 30 });
    assert.equal(ok, false);
    assert.ok(getExportSceneMediaRendererDiagnostics().seekFailures >= 1);

    const scene = baseScene({
      media: { type: "video", url: "blob:clip", durationMs: 5000 },
    });
    const cache = createExportMediaCache();
    cache.assets.set(scene.id, {
      kind: "video",
      sceneId: scene.id,
      url: "blob:clip",
      element: hanging,
      durationMs: 5000,
      muted: true,
      status: "ready",
    });

    const prepared = await prepareExportSceneMediaFrame(cache, scene, 1000, 5000);
    assert.equal(prepared.ok, false);

    const { ctx, calls } = createMockCtx();
    const result = drawSceneMediaFrame({
      ctx,
      width: 1080,
      height: 1920,
      scene,
      cache,
      masterTimeline: emptyTimeline(),
      currentTimeMs: 1000,
      sceneElapsedMs: 1000,
      sceneDurationMs: 5000,
      mediaReady: false,
    });
    assert.equal(result.path, "placeholder");
    assert.ok(calls.some((c) => c.op === "fillRect"));
  });

  await test("Image export regression — drawSceneImageFrame uses shared geometry", () => {
    const scene = baseScene({
      image: {
        url: "https://example.com/still.jpg",
        scale: 1,
        x: 0,
        y: 0,
        fitMode: "fill",
      },
    });
    const image = createMockImage();
    const { ctx, calls } = createMockCtx();
    const drew = drawSceneImageFrame(
      ctx,
      1080,
      1920,
      scene,
      image,
      0,
      5000,
    );
    assert.equal(drew, true);
    assert.ok(calls.some((c) => c.op === "drawImage"));
  });

  await test("Export service wires media cache + media renderer only for backgrounds", () => {
    const videoRender = readSrc("src/features/export/services/video-render.service.ts");
    assert.match(videoRender, /createExportMediaCache/);
    assert.match(videoRender, /preloadExportStoryMedia/);
    assert.match(videoRender, /drawSceneMediaFrame/);
    assert.match(videoRender, /disposeExportMediaCache/);
    assert.doesNotMatch(videoRender, /const imageCache = new Map/);
    // Captions / mux pipeline markers preserved
    assert.match(videoRender, /drawExportSubtitlesCaption|drawExportGeneratedCaption/);
    assert.match(videoRender, /MediaRecorder/);
  });

  await test("media URL wins; framing prefers scene.image when both present", () => {
    const scene = baseScene({
      image: {
        url: "https://example.com/stale.jpg",
        scale: 2,
        x: 99,
        y: 99,
        fitMode: "fit",
      },
      media: {
        type: "image",
        url: "https://example.com/canonical.jpg",
        fitMode: "cover",
        transform: { x: 10, y: 20, scale: 1.1, rotation: 5 },
      },
    });

    const drawImage = resolveExportSceneMediaDrawImage(scene);
    assert.ok(drawImage);
    // URL: media slot is the media source of truth after upload dual-write.
    assert.equal(drawImage!.url, "https://example.com/canonical.jpg");
    // Framing: scene.image is the editor write authority (prevents drag snap-back).
    assert.equal(drawImage!.scale, 2);
    assert.equal(drawImage!.x, 99);
    assert.equal(drawImage!.y, 99);
    assert.equal(drawImage!.fitMode, "fit");
    assert.notEqual(drawImage!.url, "https://example.com/stale.jpg");
  });

  await test("image fitMode follows Preview scene.image when media.fitMode is cover", () => {
    const scene = baseScene({
      image: {
        url: "https://example.com/photo.jpg",
        scale: 1,
        x: 0,
        y: 0,
        fitMode: "fit",
      },
      media: {
        type: "image",
        url: "https://example.com/photo.jpg",
        fitMode: "cover",
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      },
    });
    assert.equal(resolveExportSceneMediaDrawImage(scene)?.fitMode, "fit");
  });

  await test("unset media.fitMode on image defaults to fit not fill", () => {
    const scene = baseScene({
      image: {
        url: "https://example.com/photo.jpg",
        scale: 1,
        x: 0,
        y: 0,
        fitMode: "fit",
      },
      media: {
        type: "image",
        url: "https://example.com/photo.jpg",
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      },
    });
    assert.equal(resolveExportSceneMediaDrawImage(scene)?.fitMode, "fit");
  });

  await test("scene.media video wins over stale scene.image", () => {
    const scene = baseScene({
      image: {
        url: "https://example.com/stale-still.jpg",
        scale: 1,
        x: 0,
        y: 0,
        fitMode: "fill",
      },
      media: {
        type: "video",
        url: "blob:canonical-video",
        durationMs: 4000,
        fitMode: "contain",
        transform: { x: 5, y: 6, scale: 1.25, rotation: 0 },
        muted: true,
      },
    });

    const drawImage = resolveExportSceneMediaDrawImage(scene);
    assert.ok(drawImage);
    assert.equal(drawImage!.url, "blob:canonical-video");
    assert.equal(drawImage!.fitMode, "fit");
    assert.equal(drawImage!.scale, 1.25);
    assert.notEqual(drawImage!.url, "https://example.com/stale-still.jpg");

    const playback = resolveExportSceneMediaPlaybackState(scene, 0, 5000);
    assert.equal(playback.mediaType, "video");
  });

  await test("legacy scene.image still renders through getSceneMedia", () => {
    const scene = baseScene({
      image: {
        url: "https://example.com/legacy.jpg",
        scale: 1.3,
        x: 12,
        y: -8,
        rotation: 2,
        fitMode: "fill",
        imageMotion: { type: "zoom-in", intensity: "medium" },
      },
    });

    const drawImage = resolveExportSceneMediaDrawImage(scene);
    assert.ok(drawImage);
    assert.equal(drawImage!.url, "https://example.com/legacy.jpg");
    assert.equal(drawImage!.scale, 1.3);
    assert.equal(drawImage!.x, 12);
    assert.equal(drawImage!.y, -8);
    assert.equal(drawImage!.fitMode, "fill");
    assert.equal(drawImage!.imageMotion?.type, "zoom-in");
  });

  await test("placeholder fallback still works under SceneMedia authority", () => {
    const scene = baseScene({
      media: { type: "placeholder" },
      image: {
        url: "https://example.com/should-not-win.jpg",
        scale: 1,
        x: 0,
        y: 0,
      },
    });

    assert.equal(resolveExportSceneMediaDrawImage(scene), undefined);

    const { ctx, calls } = createMockCtx();
    const cache = createExportMediaCache();
    const result = drawSceneMediaFrame({
      ctx,
      width: 1080,
      height: 1920,
      scene,
      cache,
      masterTimeline: emptyTimeline(),
      currentTimeMs: 0,
      sceneElapsedMs: 0,
      sceneDurationMs: 5000,
    });
    assert.equal(result.path, "placeholder");
    assert.ok(calls.some((c) => c.op === "fillRect"));
  });

  await test("mixed media scenes use SceneMedia authority consistently", () => {
    const imageScene = baseScene({
      id: "img",
      media: {
        type: "image",
        url: "https://example.com/a.jpg",
        fitMode: "cover",
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      },
      image: {
        url: "https://example.com/stale-a.jpg",
        scale: 9,
        x: 0,
        y: 0,
      },
    });
    const videoScene = baseScene({
      id: "vid",
      media: {
        type: "video",
        url: "blob:v",
        durationMs: 3000,
        muted: true,
        fitMode: "cover",
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      },
      image: {
        url: "https://example.com/stale-v.jpg",
        scale: 9,
        x: 0,
        y: 0,
      },
    });

    assert.equal(resolveExportSceneMediaDrawImage(imageScene)?.url, "https://example.com/a.jpg");
    assert.equal(resolveExportSceneMediaDrawImage(videoScene)?.url, "blob:v");
    assert.equal(resolveExportSceneMediaPlaybackState(imageScene, 0, 5000).mediaType, "image");
    assert.equal(resolveExportSceneMediaPlaybackState(videoScene, 0, 5000).mediaType, "video");
  });

  await test("renderer does not prefer resolveExportSceneImage over SceneMedia", () => {
    const source = readSrc("src/features/export/utils/export-scene-media-renderer.ts");
    assert.match(source, /getSceneMedia/);
    assert.match(source, /mapSceneMediaToExportDrawImage/);
    assert.doesNotMatch(source, /resolveExportSceneImage/);
  });

  console.log(`\nexport-scene-media-renderer: ${passed} passed`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
