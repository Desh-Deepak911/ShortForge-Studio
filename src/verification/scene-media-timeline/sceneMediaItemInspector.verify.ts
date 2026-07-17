/**
 * Sprint 8C / 8C.1 — Per-media Inspector.
 * Run: npm run test:scene-media-item-inspector
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyStoryPatch } from "@/features/editor/story-patches";
import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import {
  buildMediaFramingPatch,
  buildResetMediaFramingPatch,
} from "@/features/media-framing";
import {
  buildMediaMotionPatch,
  buildResetMediaMotionPatch,
} from "@/features/media-motion";
import {
  buildResetVideoTrimPatch,
  buildVideoTrimPatch,
} from "@/features/media-playback";
import {
  buildPosterTimePatch,
  buildResetPosterPatch,
} from "@/features/media-thumbnails";
import {
  appendSceneMediaImageItem,
  buildTemporarySceneForMediaItemEdit,
  createSequentialMediaItemIdGenerator,
  deriveFirstItemCompatibilityImage,
  projectSceneMediaTimeline,
  runSceneMediaItemTempEdit,
  updateSceneMediaItemMedia,
} from "@/features/scene-media-timeline";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { getSceneImage, getSceneMedia } from "@/features/story/utils/scene.utils";
import { duplicateTimelineScene } from "@/features/timeline-editor/timeline-editor.commands";
import { buildMasterTimeline } from "@/features/timeline-intelligence/build-master-timeline";
import { applySceneUpdate, syncFootieScript } from "@/lib/utils/voiceover";

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
    narration: "Narration stays put.",
    ...overrides,
  };
}

function twoItemScene(): { scene: FootieScene; id1: string; id2: string } {
  const generateId = createSequentialMediaItemIdGenerator("item");
  let scene = baseScene({
    media: imageMedia("https://example.com/first.jpg"),
    image: {
      url: "https://example.com/first.jpg",
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
    },
  });
  const result = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/second.jpg"),
    { generateId },
  );
  scene = result.scene;
  const id1 = scene.mediaTimeline!.items[0]!.id;
  const id2 = scene.mediaTimeline!.items[1]!.id;
  return { scene, id1, id2 };
}

function commitItemEdit(
  script: FootieScript,
  sceneId: string,
  result: ReturnType<typeof updateSceneMediaItemMedia>,
  includeImage = false,
): FootieScript {
  return applySceneUpdate(script, sceneId, {
    media: result.scene.media,
    mediaTimeline: result.scene.mediaTimeline,
    ...(includeImage ? { image: result.scene.image } : {}),
  });
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
};

console.log("\nscene-media-item-inspector (Sprint 8C / 8C.1)\n");

test("1. Inspector always routes multi-image selection (flag retired)", () => {
  const studio = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  assert.doesNotMatch(studio, /isMultiImageScenesEnabled/);
  assert.match(studio, /showMediaItemInspector/);
  assert.match(studio, /SceneMediaItemInspector/);
  assert.match(studio, /SmartEditImageAction/);
  assert.match(studio, /SceneVideoInspector/);
  assert.match(studio, /Add another image/);
  assert.match(studio, /Replace current image/);
});

test("2. Scene selection preserves scene-level controls beside item inspector", () => {
  const studio = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  assert.match(
    studio,
    /showMediaItemInspector && selectedMediaItemId \? \(/,
  );
  assert.match(studio, /isSceneMediaItemSelected/);
  // Scene-level branch remains when item inspector is not shown.
  assert.match(studio, /hasImageMedia \? \(/);
});

test("3. Selecting item 2 resolves by stable ID", () => {
  const { scene, id2 } = twoItemScene();
  const projected = projectSceneMediaTimeline(scene);
  assert.equal(projected.items[1]?.id, id2);
  const temp = buildTemporarySceneForMediaItemEdit(scene, projected.items[1]!.media);
  assert.equal(temp.media?.url, "https://example.com/second.jpg");
});

test("4. Item 2 framing changes only item 2", () => {
  const { scene, id1, id2 } = twoItemScene();
  const item2 = scene.mediaTimeline!.items.find((item) => item.id === id2)!;
  const temp = buildTemporarySceneForMediaItemEdit(scene, item2.media);
  const framing = buildMediaFramingPatch(temp, { zoom: 1.4, positionX: 12 });
  assert.ok(framing?.media);
  const updated = updateSceneMediaItemMedia(scene, id2, framing!.media!);
  assert.equal(updated.scene.mediaTimeline?.items[0]?.id, id1);
  assert.equal(updated.scene.mediaTimeline?.items[1]?.media.transform?.scale, 1.4);
  assert.equal(updated.scene.mediaTimeline?.items[0]?.media.url, "https://example.com/first.jpg");
  assert.equal(updated.scene.media?.url, "https://example.com/first.jpg");
});

test("5. Item 2 motion changes only item 2", () => {
  const { scene, id2 } = twoItemScene();
  const item2 = scene.mediaTimeline!.items.find((item) => item.id === id2)!;
  const temp = buildTemporarySceneForMediaItemEdit(scene, item2.media);
  const motion = buildMediaMotionPatch(temp, {
    enabled: true,
    presetId: "slow-zoom-in",
    intensity: 1,
  });
  assert.ok(motion?.media);
  const updated = updateSceneMediaItemMedia(scene, id2, motion!.media);
  assert.equal(updated.scene.mediaTimeline?.items[1]?.media.motion?.presetId, "slow-zoom-in");
  assert.equal(updated.scene.mediaTimeline?.items[0]?.media.motion, undefined);
});

test("6. Item 2 image changes do not alter scene.image", () => {
  const { scene, id2 } = twoItemScene();
  const beforeImage = scene.image;
  const item2 = scene.mediaTimeline!.items.find((item) => item.id === id2)!;
  const temp = buildTemporarySceneForMediaItemEdit(scene, item2.media);
  const framing = buildMediaFramingPatch(temp, { zoom: 1.8 });
  const updated = updateSceneMediaItemMedia(scene, id2, framing!.media!);
  assert.deepEqual(updated.scene.image, beforeImage);
  assert.notEqual(updated.scene.image?.scale, 1.8);
});

test("7. Item 1 image framing keeps compatibility scene.media and scene.image aligned", () => {
  const { scene, id1 } = twoItemScene();
  const item1 = scene.mediaTimeline!.items.find((item) => item.id === id1)!;
  const temp = buildTemporarySceneForMediaItemEdit(scene, item1.media);
  const framing = buildMediaFramingPatch(temp, { zoom: 1.25, positionY: 8 });
  assert.ok(framing?.media);
  const updated = updateSceneMediaItemMedia(scene, id1, framing!.media!);
  assert.equal(updated.scene.media?.url, "https://example.com/first.jpg");
  assert.equal(updated.scene.media?.transform?.scale, 1.25);
  assert.equal(updated.scene.image?.scale, 1.25);
  assert.equal(updated.scene.image?.y, 8);
  const derived = deriveFirstItemCompatibilityImage(updated.scene.media!);
  assert.equal(updated.scene.image?.scale, derived?.scale);
  assert.equal(updated.scene.image?.y, derived?.y);
});

test("8. Legacy virtual item converts on first Inspector edit", () => {
  const scene = baseScene({
    media: imageMedia("https://example.com/legacy.jpg"),
  });
  assert.equal(scene.mediaTimeline, undefined);
  const projected = projectSceneMediaTimeline(scene);
  const legacyId = projected.items[0]!.id;
  const temp = buildTemporarySceneForMediaItemEdit(scene, projected.items[0]!.media);
  const framing = buildMediaFramingPatch(temp, { zoom: 1.1 });
  const updated = updateSceneMediaItemMedia(scene, legacyId, framing!.media!);
  assert.equal(updated.convertedFromLegacy, true);
  assert.equal(updated.scene.mediaTimeline?.items.length, 1);
  assert.equal(updated.scene.mediaTimeline?.items[0]?.id, legacyId);
});

test("9. Image reset affects only the selected item", () => {
  const { scene, id1, id2 } = twoItemScene();
  let working = scene;
  const framed2 = buildMediaFramingPatch(
    buildTemporarySceneForMediaItemEdit(working, working.mediaTimeline!.items[1]!.media),
    { zoom: 1.6 },
  );
  working = updateSceneMediaItemMedia(working, id2, framed2!.media!).scene;
  const framed1 = buildMediaFramingPatch(
    buildTemporarySceneForMediaItemEdit(working, working.mediaTimeline!.items[0]!.media),
    { zoom: 1.3 },
  );
  working = updateSceneMediaItemMedia(working, id1, framed1!.media!).scene;

  const reset2 = buildResetMediaFramingPatch(
    buildTemporarySceneForMediaItemEdit(working, working.mediaTimeline!.items[1]!.media),
  );
  const updated = updateSceneMediaItemMedia(working, id2, reset2!.media!);
  assert.equal(updated.scene.mediaTimeline?.items[1]?.media.transform?.scale, 1);
  assert.equal(updated.scene.mediaTimeline?.items[0]?.media.transform?.scale, 1.3);
});

test("10. Video trim affects only the selected item", () => {
  const generateId = createSequentialMediaItemIdGenerator("vid");
  let scene = baseScene({ media: videoMedia("https://example.com/a.mp4") });
  scene = appendSceneMediaImageItem(scene, imageMedia("https://example.com/b.jpg"), {
    generateId,
  }).scene;
  // Replace first with ensured video-only two item: rebuild as video+video
  scene = {
    ...scene,
    mediaTimeline: {
      version: 1,
      items: [
        { id: "v1", media: videoMedia("https://example.com/a.mp4"), durationWeight: 1 },
        { id: "v2", media: videoMedia("https://example.com/b.mp4"), durationWeight: 1 },
      ],
    },
    media: videoMedia("https://example.com/a.mp4"),
  };
  const temp = buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[1]!.media);
  const trim = buildVideoTrimPatch(temp, { trimStartMs: 500, trimEndMs: 2500 });
  assert.ok(trim?.media);
  const updated = updateSceneMediaItemMedia(scene, "v2", trim!.media);
  assert.equal(updated.scene.mediaTimeline?.items[1]?.media.trimStartMs, 500);
  assert.equal(updated.scene.mediaTimeline?.items[0]?.media.trimStartMs, 0);
  assert.equal(updated.scene.durationMs, 6000);
});

test("11. Video poster affects only the selected item", () => {
  const scene: FootieScene = {
    ...baseScene(),
    media: videoMedia("https://example.com/a.mp4"),
    mediaTimeline: {
      version: 1,
      items: [
        { id: "v1", media: videoMedia("https://example.com/a.mp4"), durationWeight: 1 },
        { id: "v2", media: videoMedia("https://example.com/b.mp4"), durationWeight: 1 },
      ],
    },
  };
  const temp = buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[1]!.media);
  const poster = buildPosterTimePatch(temp, 1200);
  assert.ok(poster?.media);
  const updated = updateSceneMediaItemMedia(scene, "v2", poster!.media!);
  assert.equal(updated.scene.mediaTimeline?.items[1]?.media.posterTimeMs, 1200);
  assert.equal(updated.scene.mediaTimeline?.items[0]?.media.posterTimeMs, undefined);
});

test("12. Video reset preserves unrelated metadata", () => {
  const media = {
    ...videoMedia("https://example.com/a.mp4"),
    width: 1080,
    height: 1920,
    mimeType: "video/mp4",
    muted: true,
    trimStartMs: 200,
    trimEndMs: 4000,
    posterTimeMs: 800,
  };
  const scene: FootieScene = {
    ...baseScene(),
    media,
    mediaTimeline: {
      version: 1,
      items: [{ id: "v1", media, durationWeight: 1 }],
    },
  };
  const temp = buildTemporarySceneForMediaItemEdit(scene, media);
  const resetTrim = buildResetVideoTrimPatch(temp);
  assert.ok(resetTrim?.media);
  const updated = updateSceneMediaItemMedia(scene, "v1", resetTrim!.media);
  const next = updated.scene.mediaTimeline!.items[0]!.media;
  assert.equal(next.url, "https://example.com/a.mp4");
  assert.equal(next.width, 1080);
  assert.equal(next.height, 1920);
  assert.equal(next.mimeType, "video/mp4");
  assert.equal(next.muted, true);
  assert.equal(next.trimStartMs, 0);
  assert.equal(next.trimEndMs, 5000);

  const resetPoster = buildResetPosterPatch(
    buildTemporarySceneForMediaItemEdit(updated.scene, next),
  );
  const afterPoster = updateSceneMediaItemMedia(updated.scene, "v1", resetPoster!.media!);
  assert.equal(afterPoster.scene.mediaTimeline?.items[0]?.media.posterTimeMs, undefined);
  assert.equal(afterPoster.scene.mediaTimeline?.items[0]?.media.width, 1080);
});

test("13. Item IDs, weights, order, and scene duration remain unchanged", () => {
  const { scene, id1, id2 } = twoItemScene();
  const weights = scene.mediaTimeline!.items.map((item) => item.durationWeight);
  const item2 = scene.mediaTimeline!.items[1]!;
  const temp = buildTemporarySceneForMediaItemEdit(scene, item2.media);
  const framing = buildMediaFramingPatch(temp, { rotationDeg: 5 });
  const updated = updateSceneMediaItemMedia(scene, id2, framing!.media!);
  assert.deepEqual(
    updated.scene.mediaTimeline?.items.map((item) => item.id),
    [id1, id2],
  );
  assert.deepEqual(
    updated.scene.mediaTimeline?.items.map((item) => item.durationWeight),
    weights,
  );
  assert.equal(updated.scene.durationMs, 6000);
  assert.equal(updated.scene.narration, "Narration stays put.");
});

test("14. Unknown/stale item IDs do not write", () => {
  const { scene } = twoItemScene();
  const before = JSON.stringify(scene);
  assert.throws(() =>
    updateSceneMediaItemMedia(scene, "missing-id", imageMedia("https://example.com/x.jpg")),
  );
  assert.throws(() => updateSceneMediaItemMedia(scene, "", imageMedia("https://example.com/x.jpg")));
  assert.equal(JSON.stringify(scene), before);
});

test("15. Draft JSON/reload preserves Inspector edits", () => {
  const { scene, id2 } = twoItemScene();
  const item2 = scene.mediaTimeline!.items[1]!;
  const framing = buildMediaFramingPatch(
    buildTemporarySceneForMediaItemEdit(scene, item2.media),
    { zoom: 1.55 },
  );
  const updated = updateSceneMediaItemMedia(scene, id2, framing!.media!).scene;
  const script = syncFootieScript({
    title: "Draft",
    narration: "Narration.",
    totalDuration: 6,
    scenes: [updated],
  });
  const reloaded = JSON.parse(JSON.stringify(script)) as FootieScript;
  assert.equal(reloaded.scenes[0]?.mediaTimeline?.items[1]?.media.transform?.scale, 1.55);
  assert.equal(reloaded.scenes[0]?.mediaTimeline?.items[1]?.id, id2);
});

test("16. Scene duplication produces independent nested media", () => {
  const { scene, id2 } = twoItemScene();
  const framed = updateSceneMediaItemMedia(
    scene,
    id2,
    buildMediaFramingPatch(
      buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[1]!.media),
      { zoom: 1.7 },
    )!.media!,
  ).scene;
  const script = syncFootieScript({
    title: "Dup",
    narration: "Narration.",
    totalDuration: 6,
    scenes: [framed],
  });
  const dup = duplicateTimelineScene(script, framed.id);
  assert.ok(dup);
  const originalItem = dup!.script.scenes[0]?.mediaTimeline?.items[1];
  const copyItem = dup!.script.scenes[1]?.mediaTimeline?.items[1];
  assert.ok(originalItem && copyItem);
  assert.equal(originalItem.media.transform?.scale, 1.7);
  assert.equal(copyItem.media.transform?.scale, 1.7);
  // Mutate copy only
  const mutated = updateSceneMediaItemMedia(
    dup!.script.scenes[1]!,
    copyItem.id,
    buildMediaFramingPatch(
      buildTemporarySceneForMediaItemEdit(dup!.script.scenes[1]!, copyItem.media),
      { zoom: 1.2 },
    )!.media!,
  ).scene;
  assert.equal(mutated.mediaTimeline?.items[1]?.media.transform?.scale, 1.2);
  assert.equal(
    dup!.script.scenes[0]?.mediaTimeline?.items[1]?.media.transform?.scale,
    1.7,
  );
});

test("17. Story patch classification is media", () => {
  const { scene, id2 } = twoItemScene();
  const prev = syncFootieScript({
    title: "P",
    narration: "Narration.",
    totalDuration: 6,
    scenes: [scene],
  });
  const framing = buildMediaFramingPatch(
    buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[1]!.media),
    { zoom: 1.33 },
  );
  const result = updateSceneMediaItemMedia(scene, id2, framing!.media!);
  const next = commitItemEdit(prev, scene.id, result);
  const classification = classifyStoryPatch(prev, next);
  assert.ok(classification.classes.includes("media"));
  assert.equal(classification.primary, "media");
});

test("18. Narration and voice dirtiness remain unchanged", () => {
  const { scene, id2 } = twoItemScene();
  const prev = syncFootieScript({
    title: "P",
    narration: "Immutable narration.",
    totalDuration: 6,
    scenes: [scene],
  });
  const framing = buildMediaFramingPatch(
    buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[1]!.media),
    { zoom: 1.12 },
  );
  const result = updateSceneMediaItemMedia(scene, id2, framing!.media!);
  const next = commitItemEdit(prev, scene.id, result);
  const classification = classifyStoryPatch(prev, next);
  assert.equal(classification.classes.includes("spoken_text"), false);
  assert.equal(classification.classes.includes("audio"), false);
  assert.equal(next.narration, "Immutable narration.");
  assert.equal(next.scenes[0]?.narration, scene.narration);
});

test("19. Playback and boundary locks block unsafe commits", () => {
  const inspector = readSrc(
    "src/features/editor/components/media/SceneMediaItemInspector.tsx",
  );
  assert.match(inspector, /SelectionPhase\.PlaybackLocked/);
  assert.match(inspector, /playback_locked/);
  assert.match(inspector, /controlsDisabled|playbackLocked/);
  // Boundary ownership remains timeline-local; inspector does not acquire it.
  assert.doesNotMatch(inspector, /tryAcquireMediaBoundaryOwner/);
  assert.doesNotMatch(inspector, /mediaBoundaryOwner/);
});

test("20. Preview/Export/MasterTimeline remain single-media and unchanged", () => {
  const { scene, id2 } = twoItemScene();
  const framed = updateSceneMediaItemMedia(
    scene,
    id2,
    buildMediaFramingPatch(
      buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[1]!.media),
      { zoom: 1.9 },
    )!.media!,
  ).scene;
  assert.equal(getSceneMedia(framed)?.url, "https://example.com/first.jpg");
  const story = syncFootieScript({
    title: "Compat",
    narration: "Narration.",
    totalDuration: 6,
    scenes: [framed],
  });
  const timeline = buildMasterTimeline(story, { mode: "export" });
  assert.ok(timeline.renderDurationMs > 0);
  const manifest = buildExportManifest({ story, environment: CAPABLE_ENV });
  const media = manifest.scenes[0]?.media;
  assert.ok(media && media.type === "image");
  if (media && media.type === "image") {
    assert.equal(media.source, "https://example.com/first.jpg");
  }
});

test("21. Smart Edit cannot silently patch the wrong item", () => {
  const inspector = readSrc(
    "src/features/editor/components/media/SceneMediaItemInspector.tsx",
  );
  const studio = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  assert.doesNotMatch(inspector, /SmartEditImageAction/);
  assert.match(inspector, /showSmartEdit=\{false\}/);
  // When item inspector is shown, Smart Edit lives only in the suppressed scene branch.
  assert.match(studio, /showMediaItemInspector && selectedMediaItemId/);
});

test("22. Inspector UI is accessible and contains no nested interactive controls", () => {
  const inspector = readSrc(
    "src/features/editor/components/media/SceneMediaItemInspector.tsx",
  );
  assert.match(inspector, /role="status"/);
  assert.match(inspector, /role="alert"/);
  assert.match(inspector, /SCENE_MEDIA_ITEM_INSPECTOR_PREVIEW_NOTICE/);
  assert.match(inspector, /hideSourceActions/);
  assert.doesNotMatch(inspector, /<button[^>]*>\s*<button/);
  const video = readSrc("src/features/editor/components/media/SceneVideoInspector.tsx");
  assert.match(video, /hideSourceActions/);
});

test("command rejects invalid media without mutating input", () => {
  const { scene, id2 } = twoItemScene();
  const before = JSON.stringify(scene);
  assert.throws(() =>
    updateSceneMediaItemMedia(scene, id2, { type: "image" } as SceneMedia),
  );
  assert.equal(JSON.stringify(scene), before);
});

test("getSceneImage stays first-item after non-first framing", () => {
  const { scene, id2 } = twoItemScene();
  const framed = updateSceneMediaItemMedia(
    scene,
    id2,
    buildMediaFramingPatch(
      buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[1]!.media),
      { zoom: 2 },
    )!.media!,
  ).scene;
  assert.equal(getSceneImage(framed)?.url, "https://example.com/first.jpg");
});

test("motion reset clears only selected item motion", () => {
  const { scene, id1, id2 } = twoItemScene();
  let working = updateSceneMediaItemMedia(
    scene,
    id2,
    buildMediaMotionPatch(
      buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[1]!.media),
      { enabled: true, presetId: "slow-zoom-in" },
    )!.media,
  ).scene;
  working = updateSceneMediaItemMedia(
    working,
    id1,
    buildMediaMotionPatch(
      buildTemporarySceneForMediaItemEdit(working, working.mediaTimeline!.items[0]!.media),
      { enabled: true, presetId: "pan-right" },
    )!.media,
  ).scene;
  const reset = buildResetMediaMotionPatch(
    buildTemporarySceneForMediaItemEdit(working, working.mediaTimeline!.items[1]!.media),
  );
  const updated = updateSceneMediaItemMedia(working, id2, reset!.media);
  assert.ok(
    !updated.scene.mediaTimeline?.items[1]?.media.motion ||
      updated.scene.mediaTimeline.items[1]?.media.motion?.presetId === "static" ||
      updated.scene.mediaTimeline.items[1]?.media.motion?.enabled === false,
  );
  assert.equal(updated.scene.mediaTimeline?.items[0]?.media.motion?.presetId, "pan-right");
});

// --- Sprint 8C.1 authority hardening ---

test("8C.1-1. First image framing synchronizes scene.media and derived scene.image without caller input", () => {
  const { scene, id1 } = twoItemScene();
  const framing = buildMediaFramingPatch(
    buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[0]!.media),
    { zoom: 1.45, positionX: 10, rotationDeg: 3 },
  );
  assert.ok(framing?.media);
  const updated = updateSceneMediaItemMedia(scene, id1, framing!.media!);
  assert.equal(updated.scene.media?.transform?.scale, 1.45);
  assert.equal(updated.scene.image?.scale, 1.45);
  assert.equal(updated.scene.image?.x, 10);
  assert.equal(updated.scene.image?.rotation, 3);
  assert.equal(updated.scene.uploadedImage, undefined);
  const derived = deriveFirstItemCompatibilityImage(updated.scene.media!);
  assert.deepEqual(
    {
      url: updated.scene.image?.url,
      scale: updated.scene.image?.scale,
      x: updated.scene.image?.x,
      y: updated.scene.image?.y,
      rotation: updated.scene.image?.rotation,
    },
    {
      url: derived?.url,
      scale: derived?.scale,
      x: derived?.x,
      y: derived?.y,
      rotation: derived?.rotation,
    },
  );
});

test("8C.1-2. First image motion edit does not create legacy motion authority", () => {
  const { scene, id1 } = twoItemScene();
  const beforeImageMotion = scene.image?.imageMotion;
  const motion = buildMediaMotionPatch(
    buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[0]!.media),
    { enabled: true, presetId: "slow-zoom-in", intensity: 1.2 },
  );
  assert.ok(motion?.media);
  const updated = updateSceneMediaItemMedia(scene, id1, motion!.media);
  assert.equal(updated.scene.media?.motion?.presetId, "slow-zoom-in");
  assert.equal(updated.scene.mediaTimeline?.items[0]?.media.motion?.presetId, "slow-zoom-in");
  assert.equal(updated.scene.media?.imageMotion, undefined);
  assert.deepEqual(updated.scene.image?.imageMotion, beforeImageMotion);
});

test("8C.1-3. First video edit clears stale image compatibility fields", () => {
  const generateId = createSequentialMediaItemIdGenerator("fv");
  let scene = baseScene({
    media: imageMedia("https://example.com/stale.jpg"),
    image: {
      url: "https://example.com/stale.jpg",
      scale: 1.2,
      x: 4,
      y: 2,
      rotation: 0,
      fitMode: "cover",
    },
    uploadedImage: "https://example.com/upload-stale.jpg",
  });
  scene = appendSceneMediaImageItem(scene, imageMedia("https://example.com/second.jpg"), {
    generateId,
  }).scene;
  // Replace first item with video via command.
  const firstId = scene.mediaTimeline!.items[0]!.id;
  const video = videoMedia("https://example.com/first.mp4");
  const updated = updateSceneMediaItemMedia(scene, firstId, video);
  assert.equal(updated.scene.media?.type, "video");
  assert.equal(updated.scene.image, undefined);
  assert.equal(updated.scene.uploadedImage, undefined);
});

test("8C.1-4. Non-first image/video edits preserve first-item legacy fields", () => {
  const generateId = createSequentialMediaItemIdGenerator("nf");
  let scene = baseScene({
    media: imageMedia("https://example.com/first.jpg"),
    image: {
      url: "https://example.com/first.jpg",
      scale: 1.1,
      x: 1,
      y: 2,
      rotation: 5,
      fitMode: "contain",
    },
    uploadedImage: "https://example.com/upload-keep.jpg",
  });
  scene = appendSceneMediaImageItem(scene, imageMedia("https://example.com/second.jpg"), {
    generateId,
  }).scene;
  const id2 = scene.mediaTimeline!.items[1]!.id;
  const beforeImage = scene.image;
  const beforeUploaded = scene.uploadedImage;
  const framed = updateSceneMediaItemMedia(
    scene,
    id2,
    buildMediaFramingPatch(
      buildTemporarySceneForMediaItemEdit(scene, scene.mediaTimeline!.items[1]!.media),
      { zoom: 2.2 },
    )!.media!,
  ).scene;
  assert.equal(framed.image, beforeImage);
  assert.equal(framed.uploadedImage, beforeUploaded);
  assert.deepEqual(framed.image, beforeImage);

  const withVideoSecond = updateSceneMediaItemMedia(
    framed,
    id2,
    videoMedia("https://example.com/second.mp4"),
  ).scene;
  assert.equal(withVideoSecond.image, beforeImage);
  assert.equal(withVideoSecond.uploadedImage, beforeUploaded);
});

test("8C.1-5. No public compatibilityImage option remains", () => {
  const commands = readSrc(
    "src/features/scene-media-timeline/editor/scene-media-timeline.commands.ts",
  );
  const editorIndex = readSrc("src/features/scene-media-timeline/editor/index.ts");
  const inspector = readSrc(
    "src/features/editor/components/media/SceneMediaItemInspector.tsx",
  );
  assert.doesNotMatch(commands, /compatibilityImage/);
  assert.doesNotMatch(commands, /UpdateSceneMediaItemMediaOptions/);
  assert.doesNotMatch(editorIndex, /UpdateSceneMediaItemMediaOptions/);
  assert.doesNotMatch(inspector, /compatibilityImage/);
  assert.match(commands, /deriveFirstItemCompatibilityImage/);
});

test("8C.1-6. Image media renders an image thumbnail branch", () => {
  const inspector = readSrc(
    "src/features/editor/components/media/SceneMediaItemInspector.tsx",
  );
  assert.match(inspector, /data-scene-media-item-thumb=\"image\"/);
  assert.match(inspector, /imageThumbUrl/);
});

test("8C.1-7. Video media renders a video thumbnail branch", () => {
  const inspector = readSrc(
    "src/features/editor/components/media/SceneMediaItemInspector.tsx",
  );
  assert.match(inspector, /data-scene-media-item-thumb=\"video\"/);
  assert.match(inspector, /<video/);
  assert.match(inspector, /videoThumbUrl/);
});

test("8C.1-8. Video URL is never passed to the image thumbnail", () => {
  const inspector = readSrc(
    "src/features/editor/components/media/SceneMediaItemInspector.tsx",
  );
  assert.match(
    inspector,
    /media\.type === \"image\" && typeof media\.url === \"string\"/,
  );
  assert.doesNotMatch(
    inspector,
    /thumbUrl[\s\S]*media\.type === \"image\"[\s\S]*poster\.posterUrl \|\| media\.posterUrl \|\| media\.url/,
  );
  assert.doesNotMatch(inspector, /src=\{thumbUrl\}/);
});

test("8C.1-9. Video thumbnail does not autoplay and is muted/playsInline", () => {
  const inspector = readSrc(
    "src/features/editor/components/media/SceneMediaItemInspector.tsx",
  );
  assert.match(inspector, /muted/);
  assert.match(inspector, /playsInline/);
  assert.match(inspector, /preload=\"metadata\"/);
  assert.doesNotMatch(inspector, /autoPlay|autoplay/);
  assert.doesNotMatch(inspector, /<video[^>]*\scontrols/);
  assert.match(inspector, /aria-label=\{thumbLabel\}/);
});

test("8C.1-10. Successful trim builder plus rejected item commit returns false", () => {
  const { scene } = twoItemScene();
  const media = videoMedia("https://example.com/clip.mp4");
  const ok = runSceneMediaItemTempEdit({
    media,
    playbackLocked: false,
    scene,
    build: (temp) => {
      const result = buildVideoTrimPatch(
        { ...temp, media },
        { trimStartMs: 500, trimEndMs: 4000 },
      );
      assert.ok(result?.media);
      return result?.media ? { media: result.media } : null;
    },
    commit: () => false,
  });
  assert.equal(ok, false);
});

test("8C.1-11. Playback-locked trim returns false", () => {
  const { scene } = twoItemScene();
  const media = videoMedia("https://example.com/clip.mp4");
  let buildCalled = false;
  const ok = runSceneMediaItemTempEdit({
    media,
    playbackLocked: true,
    scene,
    build: () => {
      buildCalled = true;
      return { media };
    },
    commit: () => true,
  });
  assert.equal(ok, false);
  assert.equal(buildCalled, false);
});

test("8C.1-12. Successful trim commit returns true", () => {
  const { scene } = twoItemScene();
  const media = videoMedia("https://example.com/clip.mp4");
  let committed: SceneMedia | null = null;
  const ok = runSceneMediaItemTempEdit({
    media,
    playbackLocked: false,
    scene,
    build: (temp) => {
      const result = buildVideoTrimPatch(
        { ...temp, media },
        { trimStartMs: 250, trimEndMs: 4500 },
      );
      return result?.media ? { media: result.media } : null;
    },
    commit: (next) => {
      committed = next;
      return true;
    },
  });
  assert.equal(ok, true);
  assert.ok(committed);
  assert.equal(committed!.trimStartMs, 250);
  assert.equal(committed!.trimEndMs, 4500);
});

test("8C.1-13. Reset trim follows the same terminal rules", () => {
  const { scene } = twoItemScene();
  const media = videoMedia("https://example.com/clip.mp4");
  media.trimStartMs = 1000;
  media.trimEndMs = 3000;

  assert.equal(
    runSceneMediaItemTempEdit({
      media,
      playbackLocked: true,
      scene,
      build: (temp) => {
        const result = buildResetVideoTrimPatch({ ...temp, media });
        return result?.media ? { media: result.media } : null;
      },
      commit: () => true,
    }),
    false,
  );

  assert.equal(
    runSceneMediaItemTempEdit({
      media,
      playbackLocked: false,
      scene,
      build: (temp) => {
        const result = buildResetVideoTrimPatch({ ...temp, media });
        return result?.media ? { media: result.media } : null;
      },
      commit: () => false,
    }),
    false,
  );

  const ok = runSceneMediaItemTempEdit({
    media,
    playbackLocked: false,
    scene,
    build: (temp) => {
      const result = buildResetVideoTrimPatch({ ...temp, media });
      return result?.media ? { media: result.media } : null;
    },
    commit: () => true,
  });
  assert.equal(ok, true);

  const inspector = readSrc(
    "src/features/editor/components/media/SceneMediaItemInspector.tsx",
  );
  assert.match(inspector, /onApplyTrim=\{\(trim\) =>\s*runWithTempScene/);
  assert.match(inspector, /onResetTrim=\{\(\) =>\s*runWithTempScene/);
  assert.doesNotMatch(inspector, /let ok = false/);
});

test("8E.2 Inspector append shares authority; blob ownership policy intact", () => {
  const sceneInspector = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );
  assert.match(sceneInspector, /SceneMediaAddAnotherImageButton/);
  assert.match(sceneInspector, /useOptionalSceneMediaImageAppendContext/);
  assert.match(sceneInspector, /data-scene-media-ordinal/);

  const appendHook = readSrc(
    "src/features/timeline-editor/scene-media/useSceneMediaImageAppend.ts",
  );
  assert.match(appendHook, /Do NOT revoke on lane\/hook unmount/);
  assert.match(appendHook, /revokeOwnedBlobUrlIfPresent/);
  assert.match(appendHook, /appendSceneMediaImageItem/);

  const ownership = readSrc(
    "src/features/timeline-editor/scene-media/blob-url-ownership.ts",
  );
  assert.match(ownership, /revokeOwnedBlobUrlIfPresent/);
});

console.log(`\n${passed} passed\n`);
