/**
 * Preview video clip rendering — 4.2A-4
 * Run: npm run test:preview-video-clip
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveSceneFrameMediaKind } from "@/features/editor/components/SceneFrameMedia";
import {
  resolvePreviewVideoClipTime,
  shouldPlayPreviewVideoClip,
} from "@/features/preview/utils/preview-video-clip.utils";
import type { FootieScene } from "@/features/story/types";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
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
    subtitle: "Caption",
    ...overrides,
  };
}

test("video scene chooses video renderer", () => {
  const scene = baseScene({
    media: {
      type: "video",
      url: "blob:clip",
      durationMs: 3000,
      muted: true,
    },
  });
  assert.equal(resolveSceneFrameMediaKind(scene), "video");
});

test("image scene still chooses image renderer", () => {
  const scene = baseScene({
    image: { url: "https://example.com/a.jpg", scale: 1, x: 0, y: 0 },
  });
  assert.equal(resolveSceneFrameMediaKind(scene), "image");
});

test("video currentTime calculation from sceneElapsedMs", () => {
  const result = resolvePreviewVideoClipTime({
    sceneElapsedMs: 1500,
    trimStartMs: 0,
    trimEndMs: 4000,
    durationMs: 4000,
  });
  assert.equal(result.clipTimeMs, 1500);
  assert.equal(result.currentTimeSec, 1.5);
  assert.equal(result.holdingLastFrame, false);
});

test("trimStartMs respected", () => {
  const result = resolvePreviewVideoClipTime({
    sceneElapsedMs: 500,
    trimStartMs: 1000,
    trimEndMs: 5000,
    durationMs: 6000,
  });
  assert.equal(result.clipTimeMs, 1500);
  assert.equal(result.trimStartMs, 1000);
});

test("trimEndMs respected", () => {
  const result = resolvePreviewVideoClipTime({
    sceneElapsedMs: 9000,
    trimStartMs: 0,
    trimEndMs: 2500,
    durationMs: 8000,
  });
  assert.equal(result.clipTimeMs, 2500);
  assert.equal(result.holdingLastFrame, true);
});

test("clip shorter than scene holds last frame", () => {
  const result = resolvePreviewVideoClipTime({
    sceneElapsedMs: 5000,
    trimStartMs: 0,
    trimEndMs: 2000,
    durationMs: 2000,
  });
  assert.equal(result.holdingLastFrame, true);
  assert.equal(result.clipTimeMs, 2000);
  assert.equal(
    shouldPlayPreviewVideoClip({
      isActive: true,
      isPlaying: true,
      holdingLastFrame: result.holdingLastFrame,
    }),
    false,
  );
});

test("video muted by default in SceneFrameVideo", () => {
  const video = readSrc("src/features/editor/components/SceneFrameVideo.tsx");
  assert.match(video, /muted/);
  assert.match(video, /data-preview-video-muted="true"/);
  assert.match(video, /playsInline/);
  assert.match(video, /preload="metadata"/);
});

test("inactive video paused", () => {
  assert.equal(
    shouldPlayPreviewVideoClip({
      isActive: false,
      isPlaying: true,
      holdingLastFrame: false,
    }),
    false,
  );
});

test("active video plays during story playback", () => {
  assert.equal(
    shouldPlayPreviewVideoClip({
      isActive: true,
      isPlaying: true,
      holdingLastFrame: false,
    }),
    true,
  );
});

test("scene preview maps to clip time", () => {
  const result = resolvePreviewVideoClipTime({
    sceneElapsedMs: 0,
    trimStartMs: 750,
    trimEndMs: 3750,
    durationMs: 5000,
  });
  assert.equal(result.clipTimeMs, 750);
  assert.equal(result.currentTimeSec, 0.75);
});

test("captions still render above video", () => {
  const previewFrame = readSrc("src/features/preview/components/PreviewFrame.tsx");
  assert.match(previewFrame, /\{overlay\}/);
  assert.match(previewFrame, /SceneFrameMedia/);
  // Overlay is rendered after backdrop/media — captions stay on top.
  const mediaIndex = previewFrame.indexOf("<SceneFrameMedia");
  const overlayIndex = previewFrame.indexOf("{overlay}");
  assert.ok(mediaIndex >= 0 && overlayIndex > mediaIndex);
});

test("image preview path unchanged", () => {
  const media = readSrc("src/features/editor/components/SceneFrameMedia.tsx");
  const previewFrame = readSrc("src/features/preview/components/PreviewFrame.tsx");
  assert.match(media, /SceneFrameImage/);
  assert.match(media, /sceneHasImage\(scene\)/);
  assert.match(previewFrame, /sceneHasMedia/);
  assert.doesNotMatch(previewFrame, /video-render|ffmpeg/i);

  const imageScene = baseScene({
    image: { url: "https://example.com/still.jpg", scale: 1, x: 0, y: 0 },
  });
  assert.equal(resolveSceneFrameMediaKind(imageScene), "image");
});

test("preview enables framing edit for video via overlay-only drag", () => {
  const videoPreview = readSrc("src/features/preview/components/VideoPreview.tsx");
  assert.match(videoPreview, /sceneHasFramableMedia/);
  assert.match(videoPreview, /framingDragOffset/);
  assert.match(videoPreview, /overlayOnly=\{isVideoScene\}/);
  assert.doesNotMatch(videoPreview, /getSceneMediaType\(displayScene\) !== "video"/);
});

test("placeholder scenes remain empty", () => {
  assert.equal(resolveSceneFrameMediaKind(baseScene()), "placeholder");
});

console.log(`\npreview-video-clip: ${passed} passed`);
