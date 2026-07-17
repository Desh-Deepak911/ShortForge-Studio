/**
 * Export Media Cache foundation — 4.2A-5B-1
 * Run: npm run test:export-media-cache
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildExportMediaCacheKey,
  createExportMediaCache,
  disposeExportMediaCache,
  getExportCachedImage,
  getExportCachedVideo,
  getExportSceneMediaAsset,
  preloadExportSceneMedia,
  preloadExportStoryMedia,
  type ExportMediaCacheLoaders,
} from "@/features/export/utils/export-media-cache.utils";
import type { FootieScene } from "@/features/story/types";

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
    subtitle: "Scene caption",
    ...overrides,
  };
}

function createMockImage(url: string): HTMLImageElement {
  return {
    src: url,
    complete: true,
    naturalWidth: 1080,
    naturalHeight: 1920,
  } as unknown as HTMLImageElement;
}

function createMockVideo(url: string): HTMLVideoElement {
  return {
    src: url,
    muted: true,
    defaultMuted: true,
    volume: 0,
    paused: true,
    duration: 5,
    readyState: 1,
    pause() {
      this.paused = true;
    },
    load() {},
    removeAttribute() {},
  } as unknown as HTMLVideoElement;
}

function createLoaders(options?: {
  failImage?: boolean;
  failVideo?: boolean;
}): ExportMediaCacheLoaders {
  return {
    loadImage: async (url) => {
      if (options?.failImage) {
        throw new Error("Failed to load scene image");
      }
      return createMockImage(url);
    },
    loadVideo: async (url, media) => {
      if (options?.failVideo) {
        throw new Error("Failed to load scene video");
      }
      const element = createMockVideo(url);
      return {
        element,
        durationMs:
          typeof media.durationMs === "number" && media.durationMs > 0
            ? media.durationMs
            : 5000,
      };
    },
  };
}

async function run() {
  await test("Image scene creates image asset", async () => {
    const cache = createExportMediaCache();
    const scene = baseScene({
      media: {
        type: "image",
        url: "https://example.com/still.jpg",
        source: "upload",
      },
    });

    const asset = await preloadExportSceneMedia(scene, cache, {
      loaders: createLoaders(),
    });

    assert.equal(asset?.kind, "image");
    assert.equal(asset?.status, "ready");
    const key = buildExportMediaCacheKey(scene.id, "__scene__");
    assert.equal(cache.images.has(key), true);
    assert.equal(cache.videos.has(key), false);
    assert.equal(getExportSceneMediaAsset(cache, scene)?.kind, "image");
    assert.ok(getExportCachedImage(cache, scene.id));
  });

  await test("Video scene creates video asset", async () => {
    const cache = createExportMediaCache();
    const scene = baseScene({
      media: {
        type: "video",
        url: "blob:clip",
        source: "upload",
        durationMs: 5000,
        muted: true,
      },
    });

    const asset = await preloadExportSceneMedia(scene, cache, {
      loaders: createLoaders(),
    });

    assert.equal(asset?.kind, "video");
    assert.equal(asset?.status, "ready");
    if (asset?.kind !== "video") {
      throw new Error("expected video asset");
    }
    assert.equal(asset.durationMs, 5000);
    assert.equal(asset.muted, true);
    const key = buildExportMediaCacheKey(scene.id, "__scene__");
    assert.equal(cache.videos.has(key), true);
    assert.equal(cache.images.has(key), false);
    assert.ok(getExportCachedVideo(cache, scene.id));
  });

  await test("Placeholder scene creates no asset", async () => {
    const cache = createExportMediaCache();
    const scene = baseScene({
      media: { type: "placeholder" },
      image: { url: "https://example.com/should-not-load.jpg", scale: 1, x: 0, y: 0 },
    });

    const asset = await preloadExportSceneMedia(scene, cache, {
      loaders: createLoaders(),
    });

    assert.equal(asset, null);
    assert.equal(cache.assets.size, 0);
    assert.equal(cache.diagnostics[0]?.status, "skipped");
    assert.equal(cache.diagnostics[0]?.mediaType, "placeholder");
  });

  await test("Missing URL skipped safely", async () => {
    const cache = createExportMediaCache();
    const scene = baseScene({
      media: { type: "video", source: "upload", durationMs: 3000 },
    });

    const asset = await preloadExportSceneMedia(scene, cache, {
      loaders: createLoaders(),
    });

    assert.equal(asset, null);
    assert.equal(cache.assets.size, 0);
    assert.equal(cache.diagnostics[0]?.status, "skipped");
    assert.match(cache.diagnostics[0]?.message ?? "", /Missing video URL/i);
  });

  await test("Video asset is muted", async () => {
    const cache = createExportMediaCache();
    const scene = baseScene({
      id: "scene-video",
      media: {
        type: "video",
        url: "blob:muted-clip",
        durationMs: 4000,
        muted: false,
      },
    });

    const asset = await preloadExportSceneMedia(scene, cache, {
      loaders: createLoaders(),
    });

    assert.equal(asset?.kind, "video");
    if (asset?.kind !== "video") {
      throw new Error("expected video asset");
    }
    assert.equal(asset.muted, true);
    assert.equal(asset.element.muted, true);
    assert.equal(asset.element.volume, 0);
  });

  await test("Video asset preload errors return diagnostics, not crashes", async () => {
    const cache = createExportMediaCache();
    const scene = baseScene({
      media: {
        type: "video",
        url: "blob:broken",
        durationMs: 2000,
      },
    });

    const asset = await preloadExportSceneMedia(scene, cache, {
      loaders: createLoaders({ failVideo: true }),
    });

    assert.equal(asset, null);
    assert.equal(cache.videos.size, 0);
    assert.equal(cache.diagnostics[0]?.status, "error");
    assert.match(cache.diagnostics[0]?.message ?? "", /Failed to load scene video/i);
  });

  await test("Existing image cache behavior unchanged for legacy scene.image", async () => {
    const cache = createExportMediaCache();
    const scene = baseScene({
      image: {
        url: "https://example.com/legacy.jpg",
        scale: 1,
        x: 0,
        y: 0,
      },
    });

    const asset = await preloadExportSceneMedia(scene, cache, {
      loaders: createLoaders(),
    });

    assert.equal(asset?.kind, "image");
    const key = buildExportMediaCacheKey(scene.id, "__scene__");
    assert.equal(cache.images.get(key)?.src, "https://example.com/legacy.jpg");
    // Map shape preserved for renderer compatibility (keys are sceneId+mediaItemId).
    assert.equal(cache.images instanceof Map, true);
    assert.equal(typeof cache.images.get, "function");
  });

  await test("scene.media image URL wins over stale scene.image in cache preload", async () => {
    const cache = createExportMediaCache();
    const scene = baseScene({
      image: {
        url: "https://example.com/stale.jpg",
        scale: 1,
        x: 0,
        y: 0,
      },
      media: {
        type: "image",
        url: "https://example.com/canonical.jpg",
        source: "upload",
      },
    });

    const asset = await preloadExportSceneMedia(scene, cache, {
      loaders: createLoaders(),
    });

    assert.equal(asset?.kind, "image");
    assert.equal(asset?.url, "https://example.com/canonical.jpg");
    assert.equal(
      cache.images.get(buildExportMediaCacheKey(scene.id, "__scene__"))?.src,
      "https://example.com/canonical.jpg",
    );
  });

  await test("scene.media video wins over stale scene.image in cache preload", async () => {
    const cache = createExportMediaCache();
    const scene = baseScene({
      image: {
        url: "https://example.com/stale-still.jpg",
        scale: 1,
        x: 0,
        y: 0,
      },
      media: {
        type: "video",
        url: "blob:canonical",
        durationMs: 4000,
        muted: true,
      },
    });

    const asset = await preloadExportSceneMedia(scene, cache, {
      loaders: createLoaders(),
    });

    assert.equal(asset?.kind, "video");
    assert.equal(asset?.url, "blob:canonical");
    const key = buildExportMediaCacheKey(scene.id, "__scene__");
    assert.equal(cache.images.has(key), false);
    assert.equal(cache.videos.has(key), true);
  });

  await test("Image load failure is soft and does not throw", async () => {
    const cache = createExportMediaCache();
    const scene = baseScene({
      media: { type: "image", url: "https://example.com/broken.jpg" },
    });

    const asset = await preloadExportSceneMedia(scene, cache, {
      loaders: createLoaders({ failImage: true }),
    });

    assert.equal(asset, null);
    assert.equal(cache.diagnostics[0]?.status, "error");
    assert.equal(cache.images.size, 0);
  });

  await test("preloadExportStoryMedia loads mixed scenes", async () => {
    const scenes: FootieScene[] = [
      baseScene({
        id: "img",
        media: { type: "image", url: "https://example.com/a.jpg" },
      }),
      baseScene({
        id: "vid",
        media: { type: "video", url: "blob:v", durationMs: 3000 },
      }),
      baseScene({
        id: "empty",
      }),
    ];

    const cache = await preloadExportStoryMedia(scenes, createExportMediaCache(), {
      loaders: createLoaders(),
    });

    assert.equal(cache.images.size, 1);
    assert.equal(cache.videos.size, 1);
    assert.equal(cache.assets.size, 2);
    assert.ok(cache.diagnostics.some((d) => d.sceneId === "empty" && d.status === "skipped"));
  });

  await test("disposeExportMediaCache clears maps and diagnostics", async () => {
    const cache = await preloadExportStoryMedia(
      [
        baseScene({
          id: "img",
          media: { type: "image", url: "https://example.com/a.jpg" },
        }),
        baseScene({
          id: "vid",
          media: { type: "video", url: "blob:v", durationMs: 3000 },
        }),
      ],
      createExportMediaCache(),
      { loaders: createLoaders() },
    );

    disposeExportMediaCache(cache);

    assert.equal(cache.images.size, 0);
    assert.equal(cache.videos.size, 0);
    assert.equal(cache.assets.size, 0);
    assert.equal(cache.diagnostics.length, 0);
  });

  await test("Renderer uses ExportMediaCache preload path", () => {
    const renderService = readSrc("src/features/export/services/video-render.service.ts");
    assert.match(renderService, /createExportMediaCache/);
    assert.match(renderService, /preloadExportStoryMedia/);
    assert.match(renderService, /disposeExportMediaCache/);
    assert.doesNotMatch(renderService, /const imageCache = new Map/);
  });

  await test("Cache module does not draw video frames", () => {
    const source = readSrc("src/features/export/utils/export-media-cache.utils.ts");
    assert.doesNotMatch(source, /drawImage|drawSceneMediaFrame/);
    assert.doesNotMatch(source, /MediaRecorder|ffmpeg/i);
  });

  console.log(`\nexport-media-cache: ${passed} passed`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
