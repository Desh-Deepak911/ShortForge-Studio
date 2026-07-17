/**
 * Sprint 8D — Scene Media Timeline Preview integration.
 * Run: npm run test:scene-media-preview
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  appendSceneMediaImageItem,
  createSequentialMediaItemIdGenerator,
  resolveActiveSceneMediaRenderView,
  resolveProjectedSceneMediaWindows,
  updateSceneMediaItemMedia,
  buildTemporarySceneForMediaItemEdit,
} from "@/features/scene-media-timeline";
import { buildMediaFramingPatch } from "@/features/media-framing";
import { buildMediaMotionPatch } from "@/features/media-motion";
import { resolvePreviewVideoClipTime } from "@/features/preview/utils/preview-video-clip.utils";
import type { FootieScene, SceneMedia } from "@/features/story/types";
import { resolveSceneFrameMediaKind } from "@/features/editor/components/SceneFrameMedia";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

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

function baseScene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 6,
    duration: 6,
    startMs: 0,
    endMs: 6000,
    durationMs: 6000,
    subtitle: "Caption",
    narration: "Narration.",
    ...overrides,
  };
}

function twoEqualImages(): { scene: FootieScene; id1: string; id2: string } {
  const generateId = createSequentialMediaItemIdGenerator("p");
  let scene = baseScene({ media: imageMedia("https://example.com/a.jpg") });
  scene = appendSceneMediaImageItem(scene, imageMedia("https://example.com/b.jpg"), {
    generateId,
  }).scene;
  return {
    scene,
    id1: scene.mediaTimeline!.items[0]!.id,
    id2: scene.mediaTimeline!.items[1]!.id,
  };
}

console.log("\nscene-media-preview (Sprint 8D)\n");

test("1. Legacy scene parity", () => {
  const scene = baseScene({ media: imageMedia("https://example.com/legacy.jpg") });
  const off = resolveActiveSceneMediaRenderView(scene, 1000, {
    multiImageScenesEnabled: false,
  });
  const on = resolveActiveSceneMediaRenderView(scene, 1000, {
    multiImageScenesEnabled: true,
  });
  assert.equal(off.media?.url, "https://example.com/legacy.jpg");
  assert.equal(on.media?.url, "https://example.com/legacy.jpg");
  assert.equal(off.itemIndex, 0);
  assert.equal(on.itemIndex, 0);
});

test("2. Gate OFF first-item parity", () => {
  const { scene, id1, id2 } = twoEqualImages();
  const atMid = resolveActiveSceneMediaRenderView(scene, 4000, {
    multiImageScenesEnabled: false,
  });
  assert.equal(atMid.mediaItemId, id1);
  assert.notEqual(atMid.mediaItemId, id2);
  assert.equal(atMid.media?.url, "https://example.com/a.jpg");
  assert.equal(atMid.windowStartMs, 0);
  assert.equal(atMid.windowEndMs, 6000);
});

test("3. Two equal images switch at boundary", () => {
  const { scene, id1, id2 } = twoEqualImages();
  const before = resolveActiveSceneMediaRenderView(scene, 2999, {
    multiImageScenesEnabled: true,
  });
  const at = resolveActiveSceneMediaRenderView(scene, 3000, {
    multiImageScenesEnabled: true,
  });
  assert.equal(before.mediaItemId, id1);
  assert.equal(at.mediaItemId, id2);
});

test("4. Unequal weights switch at exact resolved boundary", () => {
  const generateId = createSequentialMediaItemIdGenerator("u");
  let scene = baseScene({ media: imageMedia("https://example.com/a.jpg") });
  scene = appendSceneMediaImageItem(scene, imageMedia("https://example.com/b.jpg"), {
    generateId,
  }).scene;
  // Force 1:3 weights via stored timeline rebuild through update of weights
  const windows = resolveProjectedSceneMediaWindows(scene);
  assert.equal(windows.length, 2);
  // Default equal — reshape by replacing timeline weights through apply path
  scene = {
    ...scene,
    mediaTimeline: {
      version: 1,
      items: [
        { ...scene.mediaTimeline!.items[0]!, durationWeight: 1 },
        { ...scene.mediaTimeline!.items[1]!, durationWeight: 3 },
      ],
    },
  };
  const resolved = resolveProjectedSceneMediaWindows(scene);
  const boundary = resolved[1]!.startMs;
  const before = resolveActiveSceneMediaRenderView(scene, boundary - 1, {
    multiImageScenesEnabled: true,
  });
  const at = resolveActiveSceneMediaRenderView(scene, boundary, {
    multiImageScenesEnabled: true,
  });
  assert.equal(before.itemIndex, 0);
  assert.equal(at.itemIndex, 1);
  assert.equal(boundary, 1500);
});

test("5. Exact boundary selects following item", () => {
  const { scene } = twoEqualImages();
  const view = resolveActiveSceneMediaRenderView(scene, 3000, {
    multiImageScenesEnabled: true,
  });
  assert.equal(view.itemIndex, 1);
  assert.equal(view.itemElapsedMs, 0);
});

test("6. Mixed image/video switching", () => {
  const generateId = createSequentialMediaItemIdGenerator("m");
  let scene = baseScene({ media: imageMedia("https://example.com/a.jpg") });
  scene = appendSceneMediaImageItem(scene, imageMedia("https://example.com/b.jpg"), {
    generateId,
  }).scene;
  const id2 = scene.mediaTimeline!.items[1]!.id;
  scene = updateSceneMediaItemMedia(scene, id2, videoMedia("https://example.com/b.mp4")).scene;
  const first = resolveActiveSceneMediaRenderView(scene, 1000, {
    multiImageScenesEnabled: true,
  });
  const second = resolveActiveSceneMediaRenderView(scene, 4000, {
    multiImageScenesEnabled: true,
  });
  assert.equal(first.media?.type, "image");
  assert.equal(second.media?.type, "video");
  assert.equal(resolveSceneFrameMediaKind(scene, {
    multiImageScenesEnabled: true,
    sceneElapsedMs: 4000,
  }), "video");
});

test("7. Item-local video clip time", () => {
  const media = videoMedia("https://example.com/clip.mp4");
  media.trimStartMs = 1000;
  media.trimEndMs = 4000;
  const clip = resolvePreviewVideoClipTime({
    sceneElapsedMs: 500, // item-local
    trimStartMs: media.trimStartMs,
    trimEndMs: media.trimEndMs,
    durationMs: media.durationMs,
  });
  assert.equal(clip.clipTimeMs, 1500);
});

test("8. Item-local motion restarts", () => {
  const { scene, id2 } = twoEqualImages();
  const motion = buildMediaMotionPatch(
    buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[1]!.media),
    { enabled: true, presetId: "slow-zoom-in" },
  );
  const updated = updateSceneMediaItemMedia(scene, id2, motion!.media).scene;
  const atStartOfItem2 = resolveActiveSceneMediaRenderView(updated, 3000, {
    multiImageScenesEnabled: true,
  });
  assert.equal(atStartOfItem2.itemElapsedMs, 0);
  assert.equal(atStartOfItem2.windowDurationMs, 3000);
  assert.equal(atStartOfItem2.media?.motion?.presetId, "slow-zoom-in");
});

test("9. Item-specific framing", () => {
  const { scene, id2 } = twoEqualImages();
  const framed = buildMediaFramingPatch(
    buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[1]!.media),
    { zoom: 1.7, positionX: 20 },
  );
  const updated = updateSceneMediaItemMedia(scene, id2, framed!.media!).scene;
  const view = resolveActiveSceneMediaRenderView(updated, 4500, {
    multiImageScenesEnabled: true,
  });
  assert.equal(view.media?.transform?.scale, 1.7);
  assert.equal(view.media?.transform?.x, 20);
  assert.equal(view.renderScene.image?.scale, 1.7);
});

test("10. Previous video pauses after boundary (key remount)", () => {
  const media = readSrc("src/features/editor/components/SceneFrameMedia.tsx");
  assert.match(media, /key=\{activeMediaView\.mediaItemId/);
  assert.match(media, /activeMediaView: ActiveSceneMediaRenderView/);
});

test("11. Final item holds at scene end", () => {
  const { scene, id2 } = twoEqualImages();
  const view = resolveActiveSceneMediaRenderView(scene, 6000, {
    multiImageScenesEnabled: true,
  });
  assert.equal(view.mediaItemId, id2);
  assert.equal(view.holdingFinalFrame, true);
  assert.equal(view.itemElapsedMs, view.windowDurationMs);
});

test("12. Transition from/to layers resolve independently", () => {
  const { scene: from } = twoEqualImages();
  const generateId = createSequentialMediaItemIdGenerator("t");
  let to = baseScene({
    id: "scene-2",
    media: imageMedia("https://example.com/c.jpg"),
  });
  to = appendSceneMediaImageItem(to, imageMedia("https://example.com/d.jpg"), {
    generateId,
  }).scene;
  const fromView = resolveActiveSceneMediaRenderView(from, 1000, {
    multiImageScenesEnabled: true,
  });
  const toView = resolveActiveSceneMediaRenderView(to, 4000, {
    multiImageScenesEnabled: true,
  });
  assert.equal(fromView.media?.url, "https://example.com/a.jpg");
  assert.equal(toView.media?.url, "https://example.com/d.jpg");
});

test("13. Placeholder/missing media is safe", () => {
  const scene = baseScene({});
  const view = resolveActiveSceneMediaRenderView(scene, 0, {
    multiImageScenesEnabled: true,
  });
  assert.equal(view.media, null);
  assert.equal(resolveSceneFrameMediaKind(scene, { multiImageScenesEnabled: true }), "placeholder");
});

test("14. No duplicate timing math in React", () => {
  const media = readSrc("src/features/editor/components/SceneFrameMedia.tsx");
  const image = readSrc("src/features/editor/components/SceneFrameImage.tsx");
  const video = readSrc("src/features/editor/components/SceneFrameVideo.tsx");
  assert.doesNotMatch(media, /durationWeight/);
  assert.doesNotMatch(image, /resolveSceneMediaWindows|durationWeight/);
  assert.doesNotMatch(video, /resolveSceneMediaWindows|durationWeight/);
  assert.match(media, /activeMediaView/);
});

function withFirstPlaceholder(
  later: SceneMedia,
): { scene: FootieScene; laterId: string } {
  const generateId = createSequentialMediaItemIdGenerator("ph");
  let scene = baseScene({ media: imageMedia("https://example.com/seed.jpg") });
  // Append accepts images only — swap the later item to video afterward when needed.
  const laterSeed =
    later.type === "video"
      ? imageMedia(later.url ?? "https://example.com/later-seed.jpg")
      : later.type === "image"
        ? later
        : imageMedia("https://example.com/later-seed.jpg");
  scene = appendSceneMediaImageItem(scene, laterSeed, { generateId }).scene;
  const laterId = scene.mediaTimeline!.items[1]!.id;
  const laterMedia = later.type === "video" || later.type === "image" ? later : laterSeed;
  scene = {
    ...scene,
    media: { type: "placeholder" },
    image: undefined,
    mediaTimeline: {
      version: 1,
      items: [
        {
          ...scene.mediaTimeline!.items[0]!,
          media: { type: "placeholder" },
        },
        {
          ...scene.mediaTimeline!.items[1]!,
          media: laterMedia,
        },
      ],
    },
  };
  return { scene, laterId };
}

function isDrawableView(view: ReturnType<typeof resolveActiveSceneMediaRenderView>): boolean {
  const media = view.media;
  if (!media || media.type === "placeholder") return false;
  return typeof media.url === "string" && Boolean(media.url.trim());
}

test("8D.1-1. First placeholder → later image renders later image", () => {
  const { scene, laterId } = withFirstPlaceholder(
    imageMedia("https://example.com/later.jpg"),
  );
  const early = resolveActiveSceneMediaRenderView(scene, 500, {
    multiImageScenesEnabled: true,
  });
  const late = resolveActiveSceneMediaRenderView(scene, 4000, {
    multiImageScenesEnabled: true,
  });
  assert.equal(early.media?.type, "placeholder");
  assert.equal(isDrawableView(early), false);
  assert.equal(late.mediaItemId, laterId);
  assert.equal(late.media?.url, "https://example.com/later.jpg");
  assert.equal(isDrawableView(late), true);
  assert.equal(
    resolveSceneFrameMediaKind(scene, {
      multiImageScenesEnabled: true,
      sceneElapsedMs: 4000,
    }),
    "image",
  );
});

test("8D.1-2. First placeholder → later video renders later video", () => {
  const { scene, laterId } = withFirstPlaceholder(
    videoMedia("https://example.com/later.mp4"),
  );
  const late = resolveActiveSceneMediaRenderView(scene, 4000, {
    multiImageScenesEnabled: true,
  });
  assert.equal(late.mediaItemId, laterId);
  assert.equal(late.media?.type, "video");
  assert.equal(
    resolveSceneFrameMediaKind(scene, {
      multiImageScenesEnabled: true,
      sceneElapsedMs: 4000,
    }),
    "video",
  );
});

test("8D.1-3. Valid first image → later placeholder uses fallback", () => {
  const generateId = createSequentialMediaItemIdGenerator("lp");
  let scene = baseScene({ media: imageMedia("https://example.com/first.jpg") });
  scene = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/second.jpg"),
    { generateId },
  ).scene;
  scene = {
    ...scene,
    mediaTimeline: {
      version: 1,
      items: [
        scene.mediaTimeline!.items[0]!,
        {
          ...scene.mediaTimeline!.items[1]!,
          media: { type: "placeholder" },
        },
      ],
    },
  };
  const early = resolveActiveSceneMediaRenderView(scene, 500, {
    multiImageScenesEnabled: true,
  });
  const late = resolveActiveSceneMediaRenderView(scene, 4000, {
    multiImageScenesEnabled: true,
  });
  assert.equal(isDrawableView(early), true);
  assert.equal(late.media?.type, "placeholder");
  assert.equal(isDrawableView(late), false);
  assert.equal(
    resolveSceneFrameMediaKind(scene, {
      multiImageScenesEnabled: true,
      sceneElapsedMs: 4000,
    }),
    "placeholder",
  );
});

test("8D.1-4. Gate OFF remains first-item-only (even with later image)", () => {
  const { scene } = withFirstPlaceholder(
    imageMedia("https://example.com/later.jpg"),
  );
  const late = resolveActiveSceneMediaRenderView(scene, 4000, {
    multiImageScenesEnabled: false,
  });
  assert.equal(late.itemIndex, 0);
  assert.equal(late.media?.type, "placeholder");
  assert.equal(isDrawableView(late), false);
  assert.equal(late.windowEndMs, 6000);
});

test("8D.1-5. Transition layers use their own active fallback/media state", () => {
  const { scene: from } = withFirstPlaceholder(
    imageMedia("https://example.com/from-later.jpg"),
  );
  const generateId = createSequentialMediaItemIdGenerator("to");
  let to = baseScene({
    id: "scene-2",
    media: imageMedia("https://example.com/to-first.jpg"),
  });
  to = appendSceneMediaImageItem(to, imageMedia("https://example.com/to-later.jpg"), {
    generateId,
  }).scene;
  to = {
    ...to,
    mediaTimeline: {
      version: 1,
      items: [
        to.mediaTimeline!.items[0]!,
        { ...to.mediaTimeline!.items[1]!, media: { type: "placeholder" } },
      ],
    },
  };
  const fromView = resolveActiveSceneMediaRenderView(from, 4000, {
    multiImageScenesEnabled: true,
  });
  const toView = resolveActiveSceneMediaRenderView(to, 4000, {
    multiImageScenesEnabled: true,
  });
  assert.equal(isDrawableView(fromView), true);
  assert.equal(fromView.media?.url, "https://example.com/from-later.jpg");
  assert.equal(isDrawableView(toView), false);
  const preview = readSrc("src/features/preview/components/PreviewFrame.tsx");
  assert.match(preview, /transitionOverlay\.fromScene/);
  assert.match(preview, /transitionOverlay\.toScene/);
  // Production Preview always uses default multi-image resolution on SceneBackdrop.
  assert.match(preview, /SceneBackdrop/);
  assert.doesNotMatch(preview, /isMultiImageScenesEnabled/);
});

test("8D.1-6. SceneFrameMedia does not read process.env; Preview defaults multi-image", () => {
  const media = readSrc("src/features/editor/components/SceneFrameMedia.tsx");
  const preview = readSrc("src/features/preview/components/PreviewFrame.tsx");
  // Production component requires pre-resolved activeMediaView.
  assert.match(media, /activeMediaView: ActiveSceneMediaRenderView/);
  assert.match(media, /Does not read process\.env/);
  const defaultExportBody = media.slice(
    media.indexOf("export default function SceneFrameMedia"),
    media.indexOf("export function resolveSceneFrameMediaKindFromView"),
  );
  assert.doesNotMatch(defaultExportBody, /isMultiImageScenesEnabled\s*\(/);
  assert.doesNotMatch(defaultExportBody, /process\.env/);
  assert.doesNotMatch(preview, /isMultiImageScenesEnabled/);
  assert.doesNotMatch(preview, /process\.env\.NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE/);
});

test("Inspector notice no longer references Sprint 8D deferral", () => {
  const notice = readSrc(
    "src/features/scene-media-timeline/editor/scene-media-timeline.constants.ts",
  );
  assert.match(notice, /follows Scene Media Timeline playback/);
  assert.doesNotMatch(notice, /until Sprint 8D|until multi-media Preview ships/);
});

console.log(`\n${passed} passed\n`);
