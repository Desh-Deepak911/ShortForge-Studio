/**
 * Scene media upload + management — 4.2A-3
 * Run: npm run test:scene-media-upload
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyStoryPatch } from "@/features/editor/story-patches";
import type { FootieScene, FootieScript } from "@/features/story/types";
import {
  createSceneImageFromUrl,
  getSceneImage,
  sceneHasImage,
  sceneHasMedia,
} from "@/features/story/utils/scene.utils";
import {
  buildRemoveSceneMediaPatch,
  buildSceneMediaImageFromUpload,
  buildSceneMediaVideoFromUpload,
  isVideoUploadFile,
} from "@/features/story/utils/scene-media-upload.utils";
import {
  applyStorySyncEdit,
  createInitialStorySynchronizationState,
  resolveMediaCompleteness,
  resolveMediaSyncEditKind,
} from "@/features/story-sync";
import { recalculateSceneTimings } from "@/features/story/utils";
import {
  applySceneUpdate,
  applyStoryUpdate,
  syncFootieScript,
} from "@/lib/utils/voiceover";

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
    subtitle: "Scene caption",
    captionMode: "generated",
    subtitleText: "Scene caption",
    narration: "Scene narration",
    ...overrides,
  };
}

function buildScript(scenes: FootieScene[]): FootieScript {
  const timedScenes = recalculateSceneTimings(scenes);
  const totalDuration = timedScenes.reduce((sum, scene) => sum + scene.duration, 0);
  return syncFootieScript({
    title: "Media upload story",
    narration: "Narration",
    scenes: timedScenes,
    totalDuration,
  });
}

function commitMedia(prev: FootieScript, next: FootieScript) {
  const synced = applyStoryUpdate(prev, next);
  const classification = classifyStoryPatch(prev, synced);
  const kind = resolveMediaSyncEditKind(prev, synced, classification);
  return { synced, kind, classification };
}

test("image upload still writes scene.image", () => {
  const image = createSceneImageFromUrl("blob:image-test");
  const scene = baseScene({ image, media: buildSceneMediaImageFromUpload(image, "image/png") });

  assert.ok(getSceneImage(scene));
  assert.equal(getSceneImage(scene)?.url, "blob:image-test");
  assert.equal(sceneHasImage(scene), true);
});

test("image upload also writes scene.media image", () => {
  const image = createSceneImageFromUrl("blob:image-test");
  const media = buildSceneMediaImageFromUpload(image, "image/png");
  const scene = baseScene({ image, media });

  assert.equal(scene.media?.type, "image");
  assert.equal(scene.media?.source, "upload");
  assert.equal(scene.media?.url, "blob:image-test");
  assert.equal(scene.media?.mimeType, "image/png");
  assert.equal(scene.media?.fitMode, "contain");
  assert.equal(sceneHasMedia(scene), true);
});

test("video upload writes scene.media video", () => {
  const media = buildSceneMediaVideoFromUpload("blob:video-test", {
    durationMs: 3200,
    width: 1080,
    height: 1920,
    mimeType: "video/mp4",
  });
  const scene = baseScene({ media });

  assert.equal(scene.media?.type, "video");
  assert.equal(scene.media?.durationMs, 3200);
  assert.equal(scene.media?.trimStartMs, 0);
  assert.equal(scene.media?.trimEndMs, 3200);
  assert.equal(scene.media?.width, 1080);
  assert.equal(scene.media?.height, 1920);
});

test("video upload does not write scene.image", () => {
  const media = buildSceneMediaVideoFromUpload("blob:video-test", {
    durationMs: 3200,
    width: 1080,
    height: 1920,
    mimeType: "video/mp4",
  });
  const scene = baseScene({ media });

  assert.equal(scene.image, undefined);
  assert.equal(scene.uploadedImage, undefined);
  assert.equal(sceneHasImage(scene), false);
});

test("video metadata duration required for media readiness", () => {
  const incomplete = baseScene({
    media: { type: "video", url: "blob:video-test" },
  });
  const complete = baseScene({
    media: {
      type: "video",
      url: "blob:video-test",
      durationMs: 2500,
    },
  });

  assert.equal(sceneHasMedia(incomplete), false);
  assert.equal(sceneHasMedia(complete), true);
});

test("video defaults muted true", () => {
  const media = buildSceneMediaVideoFromUpload("blob:video-test", {
    durationMs: 1500,
    width: 720,
    height: 1280,
    mimeType: "video/webm",
  });

  assert.equal(media.muted, true);
});

test("remove media clears scene.media and legacy image fields", () => {
  const patch = buildRemoveSceneMediaPatch();
  assert.deepEqual(patch, {
    media: undefined,
    image: undefined,
    uploadedImage: undefined,
    assetAttachment: undefined,
  });
});

test("media intent does not dirty narration", () => {
  const prev = buildScript([baseScene()]);
  const { kind } = commitMedia(
    prev,
    applySceneUpdate(prev, "scene-1", {
      media: buildSceneMediaVideoFromUpload("blob:video-test", {
        durationMs: 3000,
        width: 1080,
        height: 1920,
        mimeType: "video/mp4",
      }),
      image: undefined,
      uploadedImage: undefined,
      assetAttachment: undefined,
    }),
  );
  assert.equal(kind, "image");

  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, false);
});

test("media intent does not dirty voice", () => {
  const prev = buildScript([baseScene()]);
  const image = createSceneImageFromUrl("blob:new-image");
  const { kind } = commitMedia(
    prev,
    applySceneUpdate(prev, "scene-1", {
      image,
      uploadedImage: undefined,
      media: buildSceneMediaImageFromUpload(image, "image/jpeg"),
    }),
  );
  assert.equal(kind, "image");

  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.exportDirty, true);
});

test("sceneHasMedia returns true for video with duration", () => {
  const scene = baseScene({
    media: { type: "video", url: "blob:clip", durationMs: 4000 },
  });
  assert.equal(sceneHasMedia(scene), true);
});

test("sceneHasMedia returns false for video without duration", () => {
  const scene = baseScene({
    media: { type: "video", url: "blob:clip" },
  });
  assert.equal(sceneHasMedia(scene), false);
});

test("media completeness counts video scenes with duration", () => {
  const script = buildScript([
    baseScene({
      media: { type: "video", url: "blob:clip", durationMs: 5000 },
    }),
    baseScene({
      image: createSceneImageFromUrl("https://example.com/a.jpg"),
    }),
  ]);

  const media = resolveMediaCompleteness(script);
  assert.equal(media.scenesWithMedia, 2);
  assert.equal(media.isComplete, true);
});

test("upload hook dual-writes image media and clears video-only image fields", () => {
  const hook = readSrc("src/features/editor/hooks/useSceneImageUpload.ts");
  const inspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");

  assert.match(hook, /buildSceneMediaImageFromUpload/);
  assert.match(hook, /buildSceneMediaVideoFromUpload/);
  assert.match(hook, /buildRemoveSceneMediaPatch/);
  assert.match(hook, /intent: "media"/);
  assert.match(hook, /probeVideoMetadata/);
  assert.match(inspector, /SCENE_MEDIA_FILE_ACCEPT/);
  assert.match(inspector, /SceneVideoInspector/);
  assert.match(inspector, /Upload media/);
  assert.doesNotMatch(inspector, /SceneVideoStatusCard/);
});

test("isVideoUploadFile detects supported video mime types", () => {
  assert.equal(isVideoUploadFile({ type: "video/mp4", name: "clip.mp4" }), true);
  assert.equal(isVideoUploadFile({ type: "video/webm", name: "clip.webm" }), true);
  assert.equal(isVideoUploadFile({ type: "image/png", name: "still.png" }), false);
});

test("applySceneUpdate remove patch clears all media fields", () => {
  const prev = buildScript([
    baseScene({
      image: createSceneImageFromUrl("blob:image"),
      uploadedImage: "legacy",
      assetAttachment: {
        attachSource: "manual",
        normalizedAssetId: "asset-1",
        attachedAt: "2026-01-01T00:00:00.000Z",
      },
      media: { type: "image", url: "blob:image", source: "upload" },
    }),
  ]);

  const next = applySceneUpdate(prev, "scene-1", buildRemoveSceneMediaPatch());
  const scene = next.scenes[0];
  assert.equal(scene.media, undefined);
  assert.equal(scene.image, undefined);
  assert.equal(scene.uploadedImage, undefined);
  assert.equal(scene.assetAttachment, undefined);
});

console.log(`\nscene-media-upload: ${passed} passed`);
