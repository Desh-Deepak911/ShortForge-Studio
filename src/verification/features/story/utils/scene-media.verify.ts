/**
 * Scene media read-path foundation — 4.2A-2
 * Run: npm run test:scene-media
 */
import assert from "node:assert/strict";

import type { FootieScene } from "@/features/story/types";
import {
  getSceneImageUrl,
  getSceneMedia,
  getSceneMediaType,
  getSceneMediaUrl,
  sceneHasImage,
  sceneHasMedia,
} from "@/features/story/utils/scene.utils";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function baseScene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 5,
    duration: 5,
    subtitle: "Scene caption",
    ...overrides,
  };
}

test("legacy scene.image maps to media type image", () => {
  const scene = baseScene({
    image: {
      url: "https://example.com/scene.jpg",
      scale: 1.2,
      x: 10,
      y: -20,
      rotation: 0,
      fitMode: "fill",
      imageMotion: { type: "zoom-in", intensity: "medium" },
    },
  });

  const media = getSceneMedia(scene);
  assert.equal(media?.type, "image");
  assert.equal(media?.url, "https://example.com/scene.jpg");
  assert.equal(media?.source, "legacy");
  assert.equal(media?.fitMode, "cover");
  assert.deepEqual(media?.transform, { x: 10, y: -20, scale: 1.2, rotation: 0 });
  assert.equal(media?.imageMotion?.type, "zoom-in");
  assert.equal(getSceneMediaType(scene), "image");
});

test("legacy uploadedImage maps to media type image", () => {
  const scene = baseScene({
    uploadedImage: "https://example.com/legacy.jpg",
  });

  const media = getSceneMedia(scene);
  assert.equal(media?.type, "image");
  assert.equal(media?.url, "https://example.com/legacy.jpg");
  assert.equal(media?.source, "legacy");
  assert.equal(getSceneMediaType(scene), "image");
  assert.equal(getSceneMediaUrl(scene), "https://example.com/legacy.jpg");
});

test("scene.media image wins over scene.image", () => {
  const scene = baseScene({
    image: {
      url: "https://example.com/legacy.jpg",
      scale: 1,
      x: 0,
      y: 0,
    },
    media: {
      type: "image",
      url: "https://example.com/media-slot.jpg",
      source: "upload",
      fitMode: "contain",
      transform: { x: 4, y: 8, scale: 1.1 },
    },
  });

  const media = getSceneMedia(scene);
  assert.equal(media?.url, "https://example.com/media-slot.jpg");
  assert.equal(media?.source, "upload");
  assert.equal(media?.fitMode, "contain");
  assert.equal(media?.transform?.x, 4);
  assert.notEqual(media?.url, getSceneImageUrl(scene));
});

test("scene.media video returns type video", () => {
  const scene = baseScene({
    media: {
      type: "video",
      url: "blob:video-clip",
      source: "upload",
      mimeType: "video/mp4",
      durationMs: 4200,
      trimStartMs: 0,
      trimEndMs: 3000,
      muted: true,
    },
  });

  const media = getSceneMedia(scene);
  assert.equal(media?.type, "video");
  assert.equal(getSceneMediaType(scene), "video");
  assert.equal(media?.durationMs, 4200);
  assert.equal(media?.muted, true);
});

test("video with url + durationMs is media-ready", () => {
  const scene = baseScene({
    media: {
      type: "video",
      url: "blob:ready-video",
      durationMs: 5000,
    },
  });

  assert.equal(sceneHasMedia(scene), true);
});

test("video with url but no durationMs is not media-ready", () => {
  const scene = baseScene({
    media: {
      type: "video",
      url: "blob:incomplete-video",
    },
  });

  assert.equal(sceneHasMedia(scene), false);
});

test("placeholder is not media-ready", () => {
  const scene = baseScene({
    media: {
      type: "placeholder",
    },
  });

  assert.equal(sceneHasMedia(scene), false);
  assert.equal(getSceneMediaUrl(scene), undefined);
  assert.equal(getSceneMediaType(scene), "placeholder");
});

test("missing media and missing image is not media-ready", () => {
  const scene = baseScene();

  assert.equal(getSceneMedia(scene), undefined);
  assert.equal(getSceneMediaType(scene), undefined);
  assert.equal(sceneHasMedia(scene), false);
});

test("getSceneMediaUrl works for image", () => {
  const scene = baseScene({
    media: {
      type: "image",
      url: "https://example.com/media-image.jpg",
    },
  });

  assert.equal(getSceneMediaUrl(scene), "https://example.com/media-image.jpg");
});

test("getSceneMediaUrl works for video", () => {
  const scene = baseScene({
    media: {
      type: "video",
      url: "blob:media-video",
      durationMs: 2500,
    },
  });

  assert.equal(getSceneMediaUrl(scene), "blob:media-video");
});

test("image fallback behavior remains unchanged", () => {
  const scene = baseScene({
    image: {
      url: "https://example.com/fallback.jpg",
      scale: 1,
      x: 0,
      y: 0,
    },
  });

  assert.equal(getSceneMediaUrl(scene), "https://example.com/fallback.jpg");
  assert.equal(sceneHasMedia(scene), true);
  assert.equal(sceneHasImage(scene), true);
});

test("sceneHasImage still works exactly as before", () => {
  const withImage = baseScene({
    image: { url: "https://example.com/a.jpg", scale: 1, x: 0, y: 0 },
  });
  const withLegacy = baseScene({ uploadedImage: "https://example.com/b.jpg" });
  const withVideoOnly = baseScene({
    media: {
      type: "video",
      url: "blob:clip",
      durationMs: 3000,
    },
  });
  const empty = baseScene();

  assert.equal(sceneHasImage(withImage), true);
  assert.equal(sceneHasImage(withLegacy), true);
  assert.equal(sceneHasImage(withVideoOnly), false);
  assert.equal(sceneHasImage(empty), false);
});

console.log(`\nscene-media: ${passed} passed`);
