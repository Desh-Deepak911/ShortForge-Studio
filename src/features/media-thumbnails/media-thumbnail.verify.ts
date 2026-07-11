/**
 * Media thumbnail / poster engine — 4.2B-2
 * Run: npm run test:media-thumbnails
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildPosterTimePatch,
  buildResetPosterPatch,
  clampPosterTime,
  DEFAULT_FILMSTRIP_THUMBNAIL_COUNT,
  formatPosterFrameTime,
  formatPosterTime,
  generateSceneMediaFilmstrip,
  generateSceneMediaPoster,
  generateThumbnailTimes,
  isPosterPickerAvailable,
  resolvePosterTime,
  resolveScenePoster,
  resolveSceneThumbnail,
} from "@/features/media-thumbnails";
import { classifyStoryPatch } from "@/features/editor/story-patches";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { recalculateSceneTimings } from "@/features/story/utils";
import {
  applyStorySyncEdit,
  createInitialStorySynchronizationState,
  resolveMediaCompleteness,
  resolveMediaSyncEditKind,
} from "@/features/story-sync";
import {
  applyMediaStoryUpdate,
  applySceneUpdate,
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
    durationMs: 5000,
    startMs: 0,
    endMs: 5000,
    subtitle: "Caption",
    ...overrides,
  };
}

test("Image poster", () => {
  const media: SceneMedia = {
    type: "image",
    url: "https://example.com/still.jpg",
  };
  const poster = generateSceneMediaPoster(media);
  assert.equal(poster.mediaType, "image");
  assert.equal(poster.posterTimeMs, 0);
  assert.equal(poster.posterUrl, "https://example.com/still.jpg");
  assert.equal(poster.hasPosterUrl, true);
  assert.equal(poster.hasCustomPosterTime, false);
});

test("Video poster default", () => {
  const media: SceneMedia = {
    type: "video",
    url: "blob:clip",
    durationMs: 10_000,
    trimStartMs: 1000,
    trimEndMs: 8000,
    muted: true,
  };
  const poster = generateSceneMediaPoster(media);
  assert.equal(poster.mediaType, "video");
  assert.equal(poster.posterTimeMs, 1000);
  assert.equal(poster.hasCustomPosterTime, false);
  assert.equal(poster.hasPosterUrl, false);
  assert.equal(resolvePosterTime(media), 1000);
});

test("Custom poster time", () => {
  const media: SceneMedia = {
    type: "video",
    url: "blob:clip",
    durationMs: 10_000,
    trimStartMs: 0,
    trimEndMs: 10_000,
    posterTimeMs: 4500,
    posterUrl: "https://example.com/poster.jpg",
  };
  const poster = generateSceneMediaPoster(media);
  assert.equal(poster.posterTimeMs, 4500);
  assert.equal(poster.hasCustomPosterTime, true);
  assert.equal(poster.posterUrl, "https://example.com/poster.jpg");
  assert.equal(poster.hasPosterUrl, true);
});

test("Thumbnail generation", () => {
  const media: SceneMedia = {
    type: "video",
    url: "blob:clip",
    durationMs: 8000,
    trimStartMs: 0,
    trimEndMs: 8000,
  };
  const filmstrip = generateSceneMediaFilmstrip(media);
  assert.equal(filmstrip.count, DEFAULT_FILMSTRIP_THUMBNAIL_COUNT);
  assert.equal(filmstrip.samples.length, DEFAULT_FILMSTRIP_THUMBNAIL_COUNT);
  assert.equal(filmstrip.samples[0]?.timeMs, 0);
  assert.equal(filmstrip.samples[filmstrip.samples.length - 1]?.timeMs, 8000);
});

test("Even spacing", () => {
  const samples = generateThumbnailTimes(0, 1000, 5);
  assert.equal(samples.length, 5);
  assert.equal(samples[0]?.percentage, 0);
  assert.equal(samples[2]?.percentage, 0.5);
  assert.equal(samples[4]?.percentage, 1);
  assert.equal(samples[0]?.timeMs, 0);
  assert.equal(samples[2]?.timeMs, 500);
  assert.equal(samples[4]?.timeMs, 1000);
});

test("Duration shorter than thumbnail count", () => {
  const media: SceneMedia = {
    type: "video",
    url: "blob:clip",
    durationMs: 3,
    trimStartMs: 0,
    trimEndMs: 3,
  };
  const filmstrip = generateSceneMediaFilmstrip(media, { count: 8 });
  assert.equal(filmstrip.samples.length, 8);
  assert.equal(filmstrip.samples[0]?.timeMs, 0);
  assert.equal(filmstrip.samples[7]?.timeMs, 3);
  // Intermediate samples still land within the tiny window.
  for (const sample of filmstrip.samples) {
    assert.ok(sample.timeMs >= 0 && sample.timeMs <= 3);
  }
});

test("Zero duration", () => {
  const media: SceneMedia = {
    type: "video",
    url: "blob:clip",
    durationMs: 0,
  };
  const poster = generateSceneMediaPoster(media);
  assert.equal(poster.posterTimeMs, 0);

  const filmstrip = generateSceneMediaFilmstrip(media, { count: 4 });
  assert.equal(filmstrip.samples.length, 4);
  assert.ok(filmstrip.samples.every((sample) => sample.timeMs === 0));
});

test("Poster clamp", () => {
  assert.equal(clampPosterTime(-10, 0, 5000), 0);
  assert.equal(clampPosterTime(9000, 1000, 5000), 5000);
  assert.equal(clampPosterTime(2500, 1000, 5000), 2500);
  assert.equal(clampPosterTime(100, 200, 200), 200);

  const media: SceneMedia = {
    type: "video",
    url: "blob:clip",
    durationMs: 5000,
    trimStartMs: 1000,
    trimEndMs: 4000,
    posterTimeMs: 50,
  };
  assert.equal(resolvePosterTime(media), 1000);

  const overshoot: SceneMedia = {
    ...media,
    posterTimeMs: 99999,
  };
  assert.equal(resolvePosterTime(overshoot), 4000);
});

test("Legacy image fallback", () => {
  const scene = baseScene({
    image: {
      url: "https://example.com/legacy.jpg",
      scale: 1,
      x: 0,
      y: 0,
    },
  });
  const poster = resolveScenePoster(scene);
  assert.equal(poster.mediaType, "image");
  assert.equal(poster.posterUrl, "https://example.com/legacy.jpg");
  assert.equal(poster.posterTimeMs, 0);

  const filmstrip = resolveSceneThumbnail(scene);
  assert.equal(filmstrip.mediaType, "image");
  assert.equal(filmstrip.count, 1);
});

test("Placeholder scenes", () => {
  const media: SceneMedia = { type: "placeholder" };
  const poster = generateSceneMediaPoster(media);
  assert.equal(poster.mediaType, "placeholder");
  assert.equal(poster.posterTimeMs, 0);
  assert.equal(poster.hasPosterUrl, false);

  const filmstrip = generateSceneMediaFilmstrip(media);
  assert.equal(filmstrip.count, 0);
  assert.equal(filmstrip.samples.length, 0);

  const empty = generateSceneMediaPoster(undefined);
  assert.equal(empty.mediaType, "none");
});

test("formatPosterTime helper", () => {
  assert.equal(formatPosterTime(undefined), "—");
  assert.equal(formatPosterTime(0), "0.0s");
  assert.equal(formatPosterTime(1500), "1.5s");
  assert.equal(formatPosterFrameTime(1250), "00:01.250");
  assert.equal(formatPosterFrameTime(0), "00:00.000");
});

test("poster slider clamps to trim window", () => {
  assert.equal(clampPosterTime(-100, 0, 10_000), 0);
  assert.equal(clampPosterTime(12_500, 0, 10_000), 10_000);
  assert.equal(clampPosterTime(4500, 0, 10_000), 4500);

  const full = baseScene({
    media: {
      type: "video",
      url: "blob:clip",
      durationMs: 8000,
      muted: true,
    },
  });
  const fullPatch = buildPosterTimePatch(full, 99_000);
  assert.ok(fullPatch);
  assert.equal(fullPatch!.media?.posterTimeMs, 8000);

  const trimmed = baseScene({
    media: {
      type: "video",
      url: "blob:clip",
      durationMs: 12_000,
      trimStartMs: 3000,
      trimEndMs: 7000,
      muted: true,
    },
  });
  const below = buildPosterTimePatch(trimmed, 500);
  assert.ok(below);
  assert.equal(below!.media?.posterTimeMs, 3000);
  const above = buildPosterTimePatch(trimmed, 9000);
  assert.ok(above);
  assert.equal(above!.media?.posterTimeMs, 7000);
});

test("set poster updates scene.media.posterTimeMs", () => {
  const scene = baseScene({
    media: {
      type: "video",
      url: "blob:clip",
      durationMs: 10_000,
      muted: true,
      posterUrl: "blob:old-poster",
    },
  });
  const patch = buildPosterTimePatch(scene, 2500);
  assert.ok(patch);
  assert.equal(patch!.media?.type, "video");
  assert.equal(patch!.media?.posterTimeMs, 2500);
  assert.equal(patch!.media?.posterUrl, undefined);
  assert.equal(patch!.media?.url, "blob:clip");
});

test("reset poster clears posterTimeMs and posterUrl", () => {
  const scene = baseScene({
    media: {
      type: "video",
      url: "blob:clip",
      durationMs: 10_000,
      muted: true,
      posterTimeMs: 3200,
      posterUrl: "blob:poster",
    },
  });
  const patch = buildResetPosterPatch(scene);
  assert.ok(patch);
  assert.equal(patch!.media?.posterTimeMs, undefined);
  assert.equal(patch!.media?.posterUrl, undefined);
  assert.equal(patch!.media?.url, "blob:clip");
  assert.equal(patch!.media?.durationMs, 10_000);
});

function buildVideoScript(media: SceneMedia): FootieScript {
  const timedScenes = recalculateSceneTimings([
    baseScene({
      media,
      narration: "Scene narration",
      subtitleText: "Scene caption",
    }),
  ]);
  return syncFootieScript({
    title: "Poster story",
    narration: "Story narration",
    scenes: timedScenes,
    totalDuration: timedScenes.reduce((sum, scene) => sum + scene.duration, 0),
    voiceoverUrl: "blob:voice",
    voiceoverDurationMs: 5000,
  });
}

function commitPoster(prev: FootieScript, next: FootieScript) {
  const synced = applyMediaStoryUpdate(prev, next);
  const classification = classifyStoryPatch(prev, synced);
  const kind = resolveMediaSyncEditKind(prev, synced, classification);
  return { synced, kind, classification };
}

test("media intent does not dirty narration", () => {
  const prev = buildVideoScript({
    type: "video",
    url: "blob:clip",
    durationMs: 10_000,
    muted: true,
  });
  const patch = buildPosterTimePatch(prev.scenes[0]!, 1500);
  assert.ok(patch);
  const { synced, kind } = commitPoster(prev, applySceneUpdate(prev, "scene-1", patch!));
  assert.equal(kind, "image");
  assert.equal(synced.narration, prev.narration);
  assert.equal(synced.scenes[0]?.narration, prev.scenes[0]?.narration);
  assert.equal(synced.scenes[0]?.subtitleText, prev.scenes[0]?.subtitleText);

  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, false);
});

test("media intent does not dirty voice", () => {
  const prev = buildVideoScript({
    type: "video",
    url: "blob:clip",
    durationMs: 10_000,
    muted: true,
  });
  const patch = buildPosterTimePatch(prev.scenes[0]!, 2000);
  assert.ok(patch);
  const { synced, kind } = commitPoster(prev, applySceneUpdate(prev, "scene-1", patch!));
  assert.equal(kind, "image");
  assert.equal(synced.voiceoverUrl, prev.voiceoverUrl);

  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.voiceDirty, false);
});

test("poster edit marks export stale", () => {
  const prev = buildVideoScript({
    type: "video",
    url: "blob:clip",
    durationMs: 10_000,
    muted: true,
  });
  const beforeMedia = resolveMediaCompleteness(prev);
  const patch = buildPosterTimePatch(prev.scenes[0]!, 3333);
  assert.ok(patch);
  const { synced, kind, classification } = commitPoster(
    prev,
    applySceneUpdate(prev, "scene-1", patch!),
  );
  assert.ok(classification.classes.includes("media"));
  assert.equal(kind, "image");
  assert.equal(synced.scenes[0]?.media?.posterTimeMs, 3333);

  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.exportDirty, true);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.storyDirty, false);

  const afterMedia = resolveMediaCompleteness(synced);
  assert.equal(afterMedia.isComplete, beforeMedia.isComplete);
  assert.equal(afterMedia.scenesWithMedia, beforeMedia.scenesWithMedia);
});

test("video without duration disables picker", () => {
  const media: SceneMedia = { type: "video", url: "blob:clip" };
  assert.equal(isPosterPickerAvailable(media), false);
  assert.equal(buildPosterTimePatch(baseScene({ media }), 1000), null);
});

test("image scenes do not show poster picker", () => {
  const media: SceneMedia = { type: "image", url: "https://example.com/still.jpg" };
  assert.equal(isPosterPickerAvailable(media), false);
  assert.equal(buildPosterTimePatch(baseScene({ media }), 1000), null);
  assert.equal(buildResetPosterPatch(baseScene({ media })), null);

  const inspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  assert.match(inspector, /isVideoMedia && sceneMedia\?\.type === "video"/);
  assert.match(inspector, /onSetPoster/);
  assert.match(inspector, /buildPosterTimePatch/);
});

test("Engine is pure — no React / DOM / preview / export", () => {
  const engine = readSrc("src/features/media-thumbnails/media-thumbnail.engine.ts");
  const utils = readSrc("src/features/media-thumbnails/media-thumbnail.utils.ts");
  const patches = readSrc("src/features/media-thumbnails/media-poster-patch.utils.ts");
  assert.doesNotMatch(engine, /from ["']react["']/);
  assert.doesNotMatch(engine, /\bdocument\./);
  assert.doesNotMatch(engine, /HTMLVideoElement|canvas|drawImage/i);
  assert.doesNotMatch(utils, /from ["']react["']/);
  assert.doesNotMatch(patches, /from ["']react["']/);
  assert.doesNotMatch(engine, /video-render|MediaRecorder|ffmpeg/i);
});

test("Inspector shows interactive poster picker", () => {
  const inspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(inspector, /data-scene-video-poster="true"/);
  assert.match(inspector, /data-scene-video-filmstrip="true"/);
  assert.match(inspector, /data-scene-video-poster-slider="true"/);
  assert.match(inspector, /data-scene-video-poster-set="true"/);
  assert.match(inspector, /data-scene-video-poster-reset="true"/);
  assert.match(inspector, /Poster unavailable until video metadata is loaded/);
  assert.match(inspector, /onSetPoster/);
  assert.match(inspector, /onResetPoster/);
  assert.doesNotMatch(inspector, /Poster editing coming soon/);
  // Trim UI commits via parent patch helpers — no direct media.trim mutation.
  assert.match(inspector, /onApplyTrim/);
  assert.doesNotMatch(inspector, /media\.trimStartMs\s*=/);
});

console.log(`\nmedia-thumbnails: ${passed} passed`);
