/**
 * Scene Video Inspector — 4.2B-1 / 4.2B-3 / 4.2B-6
 * Run: npm run test:scene-video-inspector
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  formatMediaDuration,
  formatMediaMimeType,
  formatMediaResolution,
  formatMediaSourceBadge,
  formatTrimPlaybackResult,
  formatTrimSeconds,
  formatTrimWindow,
  formatTrimVsSceneDelta,
  isSceneVideoTrimEditorAvailable,
  parseTrimSecondsToMs,
  resolveSceneVideoTimingSummary,
  SCENE_VIDEO_COMING_SOON_CONTROLS,
  SCENE_VIDEO_INSPECTOR_SAFETY_COPY,
  validateSceneVideoTrimDraft,
} from "@/features/editor/components/media/scene-video-inspector.utils";
import {
  buildResetVideoTrimPatch,
  buildVideoTrimPatch,
} from "@/features/media-playback";
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

const videoMedia: SceneMedia = {
  type: "video",
  url: "blob:clip",
  source: "upload",
  mimeType: "video/mp4",
  durationMs: 12_500,
  width: 1080,
  height: 1920,
  trimStartMs: 1000,
  trimEndMs: 9000,
  muted: true,
};

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
    narration: "Scene narration",
    subtitleText: "Caption",
    ...overrides,
  };
}

function buildScript(media: SceneMedia): FootieScript {
  const timedScenes = recalculateSceneTimings([baseScene({ media })]);
  return syncFootieScript({
    title: "Trim inspector story",
    narration: "Story narration",
    scenes: timedScenes,
    totalDuration: timedScenes.reduce((sum, scene) => sum + scene.duration, 0),
    voiceoverUrl: "blob:voice",
    voiceoverDurationMs: 5000,
  });
}

test("Video inspector renders for video media", () => {
  const inspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  const videoInspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );

  assert.match(inspector, /isVideoMedia && sceneMedia\?\.type === "video"/);
  assert.match(inspector, /SceneVideoInspector/);
  assert.match(videoInspector, /data-scene-video-inspector="true"/);
  assert.match(videoInspector, /Clip/);
  assert.match(videoInspector, /Timing/);
  assert.match(videoInspector, /Poster/);
  assert.match(videoInspector, /Playback behavior/);
});

test("Image scene does not render video inspector", () => {
  const inspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");

  assert.match(inspector, /hasImageMedia \? \(/);
  assert.match(inspector, /SceneImageInspector/);
  assert.match(inspector, /!isVideoMedia && sceneImage/);
  assert.match(inspector, /MediaMotionInspectorPanel/);
  assert.match(inspector, /sceneHasMedia\(scene\)/);
});

test("Duration formatting", () => {
  assert.equal(formatMediaDuration(undefined), "—");
  assert.equal(formatMediaDuration(null), "—");
  assert.equal(formatMediaDuration(-1), "—");
  assert.equal(formatMediaDuration(0), "0s");
  assert.equal(formatMediaDuration(4500), "5s");
  assert.equal(formatMediaDuration(65_000), "1m 5s");
  assert.equal(formatMediaDuration(3_661_000), "1h 1m 1s");
});

test("Resolution formatting", () => {
  assert.equal(formatMediaResolution(1080, 1920), "1080×1920");
  assert.equal(formatMediaResolution(undefined, 1920), "—");
  assert.equal(formatMediaResolution(0, 1920), "—");
  assert.equal(formatMediaResolution(null, null), "—");
});

test("Trim duration formatting", () => {
  const window = formatTrimWindow(videoMedia);
  assert.equal(window.trimStartMs, 1000);
  assert.equal(window.trimEndMs, 9000);
  assert.equal(window.trimDurationMs, 8000);
  assert.match(window.label, /8s/);

  const timing = resolveSceneVideoTimingSummary(videoMedia, 10_000);
  assert.equal(timing.trimDurationMs, 8000);
  assert.equal(timing.sceneDurationMs, 10_000);
  assert.equal(timing.trimVsSceneDeltaMs, -2000);
  assert.equal(timing.holdsLastFrame, true);
  assert.match(formatTrimVsSceneDelta(-2000), /shorter/i);
});

test("Missing metadata handled gracefully", () => {
  const sparse: SceneMedia = { type: "video", url: "blob:x" };
  assert.equal(formatMediaDuration(sparse.durationMs), "—");
  assert.equal(formatMediaResolution(sparse.width, sparse.height), "—");
  assert.equal(formatMediaMimeType(sparse.mimeType), "video");
  assert.equal(formatMediaSourceBadge(sparse.source), "Video");

  const window = formatTrimWindow(sparse);
  assert.equal(window.trimDurationMs, 0);
  assert.equal(window.label.includes("—") || window.trimDurationMs === 0, true);
});

test("Replace action callback rendered", () => {
  const videoInspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(videoInspector, /data-scene-video-replace="true"/);
  assert.match(videoInspector, /onReplace/);
  assert.match(videoInspector, /Replace media/);
  assert.match(videoInspector, /SCENE_MEDIA_FILE_ACCEPT/);
});

test("Remove action callback rendered", () => {
  const videoInspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(videoInspector, /data-scene-video-remove="true"/);
  assert.match(videoInspector, /onRemove/);
  assert.match(videoInspector, /Remove media/);
});

test("No story/narration/voice dirtying from render", () => {
  const videoInspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  const utils = readSrc(
    "src/features/editor/components/media/scene-video-inspector.utils.ts",
  );
  const inspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");

  assert.doesNotMatch(videoInspector, /onScriptChange|intent:\s*"narration"|intent:\s*"voice"/);
  assert.doesNotMatch(utils, /onScriptChange|FootieScript/);
  assert.match(inspector, /onReplace=\{\(file\) => void handleMediaUpload/);
  assert.match(inspector, /onRemove=\{\(\) => removeMedia/);
  assert.match(inspector, /onSetPoster/);
  assert.match(inspector, /onResetPoster/);
  assert.match(inspector, /onApplyTrim/);
  assert.match(inspector, /onResetTrim/);
  assert.match(inspector, /intent: "media"/);
  assert.match(inspector, /buildVideoTrimPatch/);
  assert.match(inspector, /buildResetVideoTrimPatch/);
});

test("Poster picker is interactive for video", () => {
  const videoInspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(videoInspector, /data-scene-video-poster-picker="true"/);
  assert.match(videoInspector, /data-scene-video-poster-slider="true"/);
  assert.match(videoInspector, /Set Poster/);
  assert.match(videoInspector, /Reset Poster/);
  assert.match(videoInspector, /Poster unavailable until video metadata is loaded/);
  assert.doesNotMatch(videoInspector, /Poster editing coming soon/);
});

test("Existing image inspector path unchanged", () => {
  const inspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  assert.match(inspector, /SmartEditImageAction/);
  assert.match(inspector, /SceneImageInspector/);
  assert.match(inspector, /MediaMotionInspectorPanel/);
  assert.match(inspector, /!isVideoMedia && sceneImage/);
});

test("Safety copy and MIME helpers", () => {
  assert.match(SCENE_VIDEO_INSPECTOR_SAFETY_COPY, /own or have rights/i);
  assert.equal(formatMediaMimeType("video/mp4"), "MP4");
  assert.equal(formatMediaMimeType("video/webm"), "WEBM");
  assert.equal(formatMediaMimeType("video/quicktime"), "MOV");
});

test("Utils are pure — no React or DOM imports", () => {
  const utils = readSrc(
    "src/features/editor/components/media/scene-video-inspector.utils.ts",
  );
  assert.doesNotMatch(utils, /from ["']react["']/);
  assert.doesNotMatch(utils, /\bdocument\./);
  assert.doesNotMatch(utils, /\bwindow\.(?:document|location|addEventListener)/);
});

// ── 4.2B-6 Numeric Trim Controls ───────────────────────────────────────────

test("Video inspector shows editable trim controls", () => {
  const videoInspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(videoInspector, /data-scene-video-trim="true"/);
  assert.match(videoInspector, /data-scene-video-trim-start="true"/);
  assert.match(videoInspector, /data-scene-video-trim-end="true"/);
  assert.match(videoInspector, /Apply Trim/);
  assert.match(videoInspector, /Reset Trim/);
  assert.doesNotMatch(videoInspector, /id: "trim"/);
  assert.equal(
    SCENE_VIDEO_COMING_SOON_CONTROLS.some((control) => control.id === "trim"),
    false,
  );
});

test("Initial values reflect scene.media trim", () => {
  const window = formatTrimWindow(videoMedia);
  assert.equal(window.trimStartMs, 1000);
  assert.equal(window.trimEndMs, 9000);
  assert.equal(formatTrimSeconds(window.trimStartMs), "1.000");
  assert.equal(formatTrimSeconds(window.trimEndMs), "9.000");
});

test("Missing trim values resolve to full source window", () => {
  const media: SceneMedia = {
    type: "video",
    url: "blob:clip",
    durationMs: 12_000,
    muted: true,
  };
  const window = formatTrimWindow(media);
  assert.equal(window.trimStartMs, 0);
  assert.equal(window.trimEndMs, 12_000);
  assert.equal(window.trimDurationMs, 12_000);
});

test("Apply Trim uses buildVideoTrimPatch", () => {
  const inspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  const videoInspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(inspector, /buildVideoTrimPatch/);
  assert.match(inspector, /handleApplyTrim/);
  assert.match(videoInspector, /onApplyTrim/);
  assert.match(videoInspector, /data-scene-video-trim-apply="true"/);
  assert.doesNotMatch(videoInspector, /trimStartMs:\s*Number\(/);
});

test("Reset uses buildResetVideoTrimPatch", () => {
  const inspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  const videoInspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(inspector, /buildResetVideoTrimPatch/);
  assert.match(inspector, /handleResetTrim/);
  assert.match(videoInspector, /onResetTrim/);
  assert.match(videoInspector, /data-scene-video-trim-reset="true"/);
});

test("Invalid start/end does not commit", () => {
  const invalid = validateSceneVideoTrimDraft("5", "3", 12_000);
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors[0] ?? "", /less than/i);

  const nan = validateSceneVideoTrimDraft("abc", "4", 12_000);
  assert.equal(nan.ok, false);
});

test("Start below zero is rejected or clamped safely", () => {
  const rejected = validateSceneVideoTrimDraft("-1", "4", 12_000);
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors[0] ?? "", /negative/i);
});

test("End beyond duration is rejected or clamped safely", () => {
  const rejected = validateSceneVideoTrimDraft("1", "99", 12_000);
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors[0] ?? "", /exceed/i);
});

test("Start >= end does not commit", () => {
  assert.equal(validateSceneVideoTrimDraft("4", "4", 12_000).ok, false);
  assert.equal(validateSceneVideoTrimDraft("6", "2", 12_000).ok, false);
  assert.equal(validateSceneVideoTrimDraft("1.000", "1.050", 12_000).ok, false);
});

test("Scene duration remains unchanged", () => {
  const prev = buildScript({
    type: "video",
    url: "blob:clip",
    durationMs: 12_000,
    trimStartMs: 0,
    trimEndMs: 12_000,
    muted: true,
  });
  const result = buildVideoTrimPatch(prev.scenes[0]!, { trimStartMs: 3000, trimEndMs: 7000 });
  assert.ok(result);
  const next = applySceneUpdate(prev, "scene-1", result!.patch);
  assert.equal(next.scenes[0]?.durationMs, 5000);
  assert.equal(next.scenes[0]?.duration, prev.scenes[0]?.duration);
});

test("Poster range updates after trim", () => {
  const scene = baseScene({
    media: {
      type: "video",
      url: "blob:clip",
      durationMs: 12_000,
      trimStartMs: 0,
      trimEndMs: 12_000,
      posterTimeMs: 1000,
      muted: true,
    },
  });
  const result = buildVideoTrimPatch(scene, { trimStartMs: 3000, trimEndMs: 7000 });
  assert.ok(result);
  assert.equal(result!.media.posterTimeMs, 3000);
  assert.equal(result!.media.trimStartMs, 3000);
  assert.equal(result!.media.trimEndMs, 7000);
});

test("Trim edit uses media intent", () => {
  const inspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  assert.match(
    inspector,
    /buildVideoTrimPatch[\s\S]*intent: "media"|handleApplyTrim[\s\S]*intent: "media"/,
  );
  assert.match(inspector, /onScriptChange\(applySceneUpdate\(script, sceneId, result\.patch\), \{ intent: "media" \}\)/);
});

test("Narration remains clean", () => {
  const prev = buildScript({
    type: "video",
    url: "blob:clip",
    durationMs: 12_000,
    trimStartMs: 0,
    trimEndMs: 12_000,
    muted: true,
  });
  const result = buildVideoTrimPatch(prev.scenes[0]!, { trimStartMs: 2000, trimEndMs: 6000 });
  assert.ok(result);
  const synced = applyMediaStoryUpdate(prev, applySceneUpdate(prev, "scene-1", result!.patch));
  const kind = resolveMediaSyncEditKind(prev, synced, classifyStoryPatch(prev, synced));
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(synced.narration, prev.narration);
});

test("Voice remains clean", () => {
  const prev = buildScript({
    type: "video",
    url: "blob:clip",
    durationMs: 12_000,
    trimStartMs: 0,
    trimEndMs: 12_000,
    muted: true,
  });
  const result = buildVideoTrimPatch(prev.scenes[0]!, { trimStartMs: 1500, trimEndMs: 5500 });
  assert.ok(result);
  const synced = applyMediaStoryUpdate(prev, applySceneUpdate(prev, "scene-1", result!.patch));
  const kind = resolveMediaSyncEditKind(prev, synced, classifyStoryPatch(prev, synced));
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.voiceDirty, false);
  assert.equal(synced.voiceoverUrl, prev.voiceoverUrl);
});

test("Export becomes dirty", () => {
  const prev = buildScript({
    type: "video",
    url: "blob:clip",
    durationMs: 12_000,
    trimStartMs: 0,
    trimEndMs: 12_000,
    muted: true,
  });
  const before = resolveMediaCompleteness(prev);
  const result = buildVideoTrimPatch(prev.scenes[0]!, { trimStartMs: 3000, trimEndMs: 7000 });
  assert.ok(result);
  const synced = applyMediaStoryUpdate(prev, applySceneUpdate(prev, "scene-1", result!.patch));
  const kind = resolveMediaSyncEditKind(prev, synced, classifyStoryPatch(prev, synced));
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.exportDirty, true);
  assert.equal(resolveMediaCompleteness(synced).isComplete, before.isComplete);
});

test("Image scene does not show trim controls", () => {
  const inspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  assert.match(inspector, /isVideoMedia && sceneMedia\?\.type === "video"/);
  assert.equal(isSceneVideoTrimEditorAvailable({ type: "image", url: "x" }), false);
  assert.equal(
    buildVideoTrimPatch(baseScene({ media: { type: "image", url: "x" } }), {
      trimStartMs: 0,
      trimEndMs: 1000,
    }),
    null,
  );
});

test("Missing duration disables trim controls", () => {
  assert.equal(isSceneVideoTrimEditorAvailable({ type: "video", url: "blob:x" }), false);
  const validation = validateSceneVideoTrimDraft("0", "1", 0);
  assert.equal(validation.ok, false);
  const videoInspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(videoInspector, /data-scene-video-trim-unavailable="true"/);
  assert.match(videoInspector, /Trim unavailable until video metadata is loaded/);
});

test("Selected scene change resets local draft", () => {
  const videoInspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(videoInspector, /trimSourceKey/);
  assert.match(videoInspector, /draftTrimSourceKey !== trimSourceKey/);
  assert.match(videoInspector, /!trimStartFocused/);
  assert.match(videoInspector, /!trimEndFocused/);
  assert.match(videoInspector, /!trimSliderDragging/);
  assert.match(videoInspector, /syncDraftFromCommitted/);
});

test("Apply by Enter works", () => {
  const videoInspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(videoInspector, /event\.key === "Enter"/);
  assert.match(videoInspector, /commitTrimDraft/);
});

test("Reset restores full clip range", () => {
  const scene = baseScene({
    media: {
      type: "video",
      url: "blob:clip",
      durationMs: 12_000,
      trimStartMs: 3000,
      trimEndMs: 7000,
      posterTimeMs: 4500,
      muted: true,
    },
  });
  const result = buildResetVideoTrimPatch(scene);
  assert.ok(result);
  assert.equal(result!.media.trimStartMs, 0);
  assert.equal(result!.media.trimEndMs, 12_000);
  assert.equal(result!.media.posterTimeMs, 4500);
});

test("Trim playback result copy", () => {
  assert.match(formatTrimPlaybackResult(4000, 5000), /held/i);
  assert.match(formatTrimPlaybackResult(8000, 5000), /first/i);
  assert.match(formatTrimPlaybackResult(5000, 5000), /matches/i);
});

test("parseTrimSecondsToMs helper", () => {
  assert.equal(parseTrimSecondsToMs("1.250"), 1250);
  assert.equal(parseTrimSecondsToMs(3), 3000);
  assert.equal(parseTrimSecondsToMs("abc"), null);
});

console.log(`\nscene-video-inspector: ${passed} passed`);
