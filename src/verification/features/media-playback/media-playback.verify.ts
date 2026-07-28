/**
 * Media Playback Engine — 4.2A-5A
 * Run: npm run test:media-playback
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildResetVideoTrimPatch,
  buildVideoTrimPatch,
  clampPosterTimeToTrimWindow,
  clampSceneMediaTrim,
  getSceneMediaTrimDuration,
  hasSceneMediaEnded,
  isSceneMediaReady,
  normalizeVideoTrim,
  resolveSceneMediaClipTime,
  resolveSceneMediaPlayback,
  resolveSceneMediaPlaybackDiagnostics,
  validateSceneMediaPlayback,
} from "@/features/media-playback";
import { buildExportFingerprint } from "@/components/export/build-export-fingerprint.utils";
import { classifyStoryPatch } from "@/features/editor/story-patches";
import {
  formatExportMediaValidationWarnings,
  validateExportStoryMedia,
} from "@/features/export/utils/export-media-validation.utils";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
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

const imageMedia: SceneMedia = {
  type: "image",
  url: "https://example.com/still.jpg",
  source: "upload",
};

const videoMedia: SceneMedia = {
  type: "video",
  url: "blob:clip",
  source: "upload",
  durationMs: 5000,
  trimStartMs: 1000,
  trimEndMs: 4000,
  muted: true,
};

// ── IMAGE ──────────────────────────────────────────────────────────────────

test("image always returns clipTime 0", () => {
  const state = resolveSceneMediaPlayback({
    sceneMedia: imageMedia,
    sceneElapsedMs: 2500,
    sceneDurationMs: 5000,
    playing: true,
  });
  assert.equal(state.clipTimeMs, 0);
  assert.equal(state.mediaType, "image");
});

test("image always holds frame", () => {
  const state = resolveSceneMediaPlayback({
    sceneMedia: imageMedia,
    sceneElapsedMs: 1000,
    sceneDurationMs: 4000,
    playing: true,
  });
  assert.equal(state.holdLastFrame, true);
  assert.equal(state.play, false);
});

test("image never ends", () => {
  const state = resolveSceneMediaPlayback({
    sceneMedia: imageMedia,
    sceneElapsedMs: 9999,
    sceneDurationMs: 3000,
    playing: false,
  });
  assert.equal(state.ended, false);
  assert.equal(hasSceneMediaEnded(state), false);
});

// ── VIDEO ──────────────────────────────────────────────────────────────────

test("trimStart respected", () => {
  const state = resolveSceneMediaPlayback({
    sceneMedia: videoMedia,
    sceneElapsedMs: 0,
    sceneDurationMs: 5000,
    playing: true,
  });
  assert.equal(state.clipTimeMs, 1000);
  assert.equal(state.trimStartMs, 1000);
});

test("trimEnd respected", () => {
  const state = resolveSceneMediaPlayback({
    sceneMedia: videoMedia,
    sceneElapsedMs: 10_000,
    sceneDurationMs: 8000,
    playing: true,
  });
  assert.equal(state.clipTimeMs, 4000);
  assert.equal(state.trimEndMs, 4000);
  assert.equal(state.holdLastFrame, true);
});

test("clamp works", () => {
  const window = clampSceneMediaTrim({
    durationMs: 3000,
    trimStartMs: -50,
    trimEndMs: 9000,
  });
  assert.equal(window.trimStartMs, 0);
  assert.equal(window.trimEndMs, 3000);
});

test("clip shorter than scene holds last frame", () => {
  const shortClip: SceneMedia = {
    type: "video",
    url: "blob:short",
    durationMs: 2000,
    trimStartMs: 0,
    trimEndMs: 2000,
  };
  const state = resolveSceneMediaPlayback({
    sceneMedia: shortClip,
    sceneElapsedMs: 5000,
    sceneDurationMs: 8000,
    playing: true,
  });
  assert.equal(state.holdLastFrame, true);
  assert.equal(state.ended, true);
  assert.equal(state.play, false);
  assert.equal(state.clipTimeMs, 2000);
});

test("scene shorter than clip stops within trim window", () => {
  const longClip: SceneMedia = {
    type: "video",
    url: "blob:long",
    durationMs: 20_000,
    trimStartMs: 0,
    trimEndMs: 20_000,
  };
  const state = resolveSceneMediaPlayback({
    sceneMedia: longClip,
    sceneElapsedMs: 3000,
    sceneDurationMs: 3000,
    playing: true,
  });
  assert.equal(state.clipTimeMs, 3000);
  assert.equal(state.holdLastFrame, false);
  assert.equal(state.ended, false);
  assert.equal(state.play, true);
});

test("progress calculation", () => {
  const state = resolveSceneMediaPlayback({
    sceneMedia: videoMedia,
    sceneElapsedMs: 2500,
    sceneDurationMs: 5000,
    playing: false,
  });
  assert.equal(state.progress, 0.5);
});

test("trimProgress calculation", () => {
  // trim window 1000–4000 (3000ms). elapsed 1500 → clipTime 2500 → trimProgress 0.5
  const state = resolveSceneMediaPlayback({
    sceneMedia: videoMedia,
    sceneElapsedMs: 1500,
    sceneDurationMs: 5000,
    playing: true,
  });
  assert.equal(state.clipTimeMs, 2500);
  assert.equal(state.trimProgress, 0.5);
});

test("remaining time", () => {
  const state = resolveSceneMediaPlayback({
    sceneMedia: videoMedia,
    sceneElapsedMs: 2000,
    sceneDurationMs: 5000,
    playing: true,
  });
  assert.equal(state.remainingMs, 3000);
});

test("invalid trim rejected", () => {
  const issues = validateSceneMediaPlayback({
    type: "video",
    url: "blob:bad",
    durationMs: 5000,
    trimStartMs: 3000,
    trimEndMs: 1000,
  });
  assert.ok(issues.some((issue) => issue.code === "invalid_trim"));
});

test("duration required", () => {
  const issues = validateSceneMediaPlayback({
    type: "video",
    url: "blob:nodur",
  });
  assert.ok(issues.some((issue) => issue.code === "missing_duration"));
  assert.equal(
    isSceneMediaReady({
      type: "video",
      url: "blob:nodur",
    }),
    false,
  );
});

test("ended flag", () => {
  const state = resolveSceneMediaPlayback({
    sceneMedia: videoMedia,
    sceneElapsedMs: 4000,
    sceneDurationMs: 5000,
    playing: true,
  });
  assert.equal(state.ended, true);
  assert.equal(hasSceneMediaEnded(state), true);
});

test("holdLastFrame", () => {
  const clip = resolveSceneMediaClipTime(videoMedia, 5000);
  assert.equal(clip.holdLastFrame, true);
  assert.equal(clip.clipTimeMs, 4000);
});

// ── UTILITIES ──────────────────────────────────────────────────────────────

test("trim duration helper", () => {
  assert.equal(getSceneMediaTrimDuration(videoMedia), 3000);
  assert.equal(getSceneMediaTrimDuration(imageMedia), 0);
});

test("media ready helper", () => {
  assert.equal(isSceneMediaReady(imageMedia), true);
  assert.equal(isSceneMediaReady(videoMedia), true);
  assert.equal(
    isSceneMediaReady({ type: "placeholder" }),
    false,
  );
  assert.equal(
    isSceneMediaReady({
      type: "video",
      url: "blob:x",
      durationMs: 1000,
      trimStartMs: 0,
      trimEndMs: 2000,
    }),
    false,
  );
});

test("clipTime helper", () => {
  const result = resolveSceneMediaClipTime(videoMedia, 500);
  assert.equal(result.clipTimeMs, 1500);
  assert.equal(result.holdLastFrame, false);
});

test("paused video does not play", () => {
  const state = resolveSceneMediaPlayback({
    sceneMedia: videoMedia,
    sceneElapsedMs: 500,
    sceneDurationMs: 5000,
    playing: false,
  });
  assert.equal(state.play, false);
  assert.equal(state.clipTimeMs, 1500);
});

test("diagnostics expose media timing fields", () => {
  const diagnostics = resolveSceneMediaPlaybackDiagnostics({
    sceneMedia: videoMedia,
    sceneElapsedMs: 1500,
    sceneDurationMs: 5000,
    playing: true,
  });
  assert.equal(diagnostics.mediaType, "video");
  assert.equal(diagnostics.trimStartMs, 1000);
  assert.equal(diagnostics.trimEndMs, 4000);
  assert.equal(diagnostics.clipDurationMs, 3000);
  assert.equal(diagnostics.clipTimeMs, 2500);
  assert.equal(diagnostics.progress, 0.3);
  assert.equal(diagnostics.trimProgress, 0.5);
  assert.equal(diagnostics.ended, false);
  assert.equal(diagnostics.holdLastFrame, false);
  assert.equal(diagnostics.ready, true);
});

// ── VALIDATION ─────────────────────────────────────────────────────────────

test("missing duration blocked", () => {
  const issues = validateSceneMediaPlayback({
    type: "video",
    url: "blob:x",
  });
  assert.ok(issues.some((issue) => issue.code === "missing_duration"));
});

test("invalid trim blocked", () => {
  const issues = validateSceneMediaPlayback({
    type: "video",
    url: "blob:x",
    durationMs: 4000,
    trimStartMs: 2000,
    trimEndMs: 2000,
  });
  assert.ok(issues.some((issue) => issue.code === "invalid_trim"));
});

test("unsupported media rejected", () => {
  const issues = validateSceneMediaPlayback({
    type: "placeholder",
  });
  assert.ok(issues.some((issue) => issue.code === "unsupported_type"));
});

test("trim exceeds duration blocked", () => {
  const issues = validateSceneMediaPlayback({
    type: "video",
    url: "blob:x",
    durationMs: 3000,
    trimStartMs: 0,
    trimEndMs: 5000,
  });
  assert.ok(issues.some((issue) => issue.code === "trim_exceeds_duration"));
});

test("export validation uses getSceneMedia not scene.image", () => {
  const script: FootieScript = syncFootieScript({
    title: "Media validation",
    narration: "One.",
    totalDuration: 5,
    scenes: [
      {
        id: "s1",
        start: 0,
        end: 5,
        duration: 5,
        subtitle: "One",
        media: {
          type: "video",
          url: "blob:bad",
          durationMs: 2000,
          trimStartMs: 1500,
          trimEndMs: 500,
        },
      },
    ],
  });

  const issues = validateExportStoryMedia(script);
  assert.ok(issues.some((issue) => issue.code === "invalid_trim"));
  assert.ok(issues.every((issue) => issue.sceneId === "s1"));

  const warnings = formatExportMediaValidationWarnings(issues);
  assert.ok(warnings.some((line) => /trimStartMs/i.test(line)));
});

test("export preflight surfaces media validation warnings", () => {
  const script = syncFootieScript({
    title: "Preflight media",
    narration: "Clip.",
    totalDuration: 4,
    voiceoverUrl: "blob:voice",
    voiceoverDurationMs: 4000,
    scenes: [
      {
        id: "scene-video",
        start: 0,
        end: 4,
        duration: 4,
        subtitle: "Clip",
        media: {
          type: "video",
          url: "blob:clip",
          // missing durationMs
        },
      },
    ],
  });

  const result = prepareStoryForExport(script);
  assert.ok(result.mediaIssues.length > 0);
  assert.ok(result.mediaIssues.some((issue) => issue.code === "missing_duration"));
  assert.ok(result.warnings.some((warning) => /durationMs/i.test(warning)));
});

test("engine module is pure with no React or renderer imports", () => {
  const engine = readSrc("src/features/media-playback/media-playback.engine.ts");
  const utils = readSrc("src/features/media-playback/media-playback.utils.ts");
  const index = readSrc("src/features/media-playback/index.ts");

  for (const source of [engine, utils, index]) {
    assert.doesNotMatch(source, /from ["']react["']/);
    assert.doesNotMatch(source, /HTMLVideoElement|MediaRecorder|ffmpeg/i);
    assert.doesNotMatch(source, /video-render|SceneFrame|VideoPreview/);
    assert.doesNotMatch(source, /story-sync|StorySync/);
  }
});

test("missing media returns empty state", () => {
  const state = resolveSceneMediaPlayback({
    sceneMedia: null,
    sceneElapsedMs: 1000,
    sceneDurationMs: 4000,
  });
  assert.equal(state.mediaType, "none");
  assert.equal(state.clipTimeMs, 0);
  assert.equal(state.remainingMs, 4000);
});

test("scene loop wraps elapsed within scene duration", () => {
  const clip: SceneMedia = {
    type: "video",
    url: "blob:loop",
    durationMs: 10_000,
    trimStartMs: 0,
    trimEndMs: 10_000,
  };
  const state = resolveSceneMediaPlayback({
    sceneMedia: clip,
    sceneElapsedMs: 5500,
    sceneDurationMs: 5000,
    playing: true,
    loopMode: "scene",
  });
  // 5500 % 5000 = 500
  assert.equal(state.clipTimeMs, 500);
  assert.equal(state.holdLastFrame, false);
});

// ── 4.2B-5 Video Trim Foundation ───────────────────────────────────────────

function trimBaseScene(overrides: Partial<FootieScene> = {}): FootieScene {
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

function buildTrimScript(media: SceneMedia): FootieScript {
  const timedScenes = recalculateSceneTimings([
    trimBaseScene({
      media,
      duration: 5,
      durationMs: 5000,
    }),
  ]);
  return syncFootieScript({
    title: "Trim story",
    narration: "Story narration",
    scenes: timedScenes,
    totalDuration: timedScenes.reduce((sum, scene) => sum + scene.duration, 0),
    voiceoverUrl: "blob:voice",
    voiceoverDurationMs: 5000,
  });
}

test("trim start clamps to zero", () => {
  const window = normalizeVideoTrim(10_000, { trimStartMs: -500, trimEndMs: 4000 });
  assert.equal(window.trimStartMs, 0);
  assert.equal(window.trimEndMs, 4000);
  assert.equal(window.wasClamped, true);
});

test("trim end clamps to source duration", () => {
  const window = normalizeVideoTrim(10_000, { trimStartMs: 2000, trimEndMs: 99_000 });
  assert.equal(window.trimStartMs, 2000);
  assert.equal(window.trimEndMs, 10_000);
  assert.equal(window.wasClamped, true);
});

test("trim end must remain greater than trim start", () => {
  const window = normalizeVideoTrim(10_000, { trimStartMs: 5000, trimEndMs: 5000 });
  assert.ok(window.trimEndMs > window.trimStartMs);
  assert.equal(window.trimDurationMs > 0, true);

  const inverted = normalizeVideoTrim(10_000, { trimStartMs: 8000, trimEndMs: 1000 });
  assert.ok(inverted.trimEndMs > inverted.trimStartMs);
});

test("valid trim remains unchanged", () => {
  const window = normalizeVideoTrim(12_000, { trimStartMs: 3000, trimEndMs: 7000 });
  assert.equal(window.trimStartMs, 3000);
  assert.equal(window.trimEndMs, 7000);
  assert.equal(window.trimDurationMs, 4000);
  assert.equal(window.wasClamped, false);
});

test("trim duration helper is correct", () => {
  assert.equal(
    getSceneMediaTrimDuration({
      durationMs: 12_000,
      trimStartMs: 3000,
      trimEndMs: 7000,
    }),
    4000,
  );
  assert.equal(getSceneMediaTrimDuration(videoMedia), 3000);
});

test("buildVideoTrimPatch updates media only", () => {
  const scene = trimBaseScene({
    media: {
      type: "video",
      url: "blob:clip",
      source: "upload",
      mimeType: "video/mp4",
      durationMs: 12_000,
      trimStartMs: 0,
      trimEndMs: 12_000,
      muted: true,
      fitMode: "cover",
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    },
    durationMs: 5000,
    duration: 5,
  });

  const result = buildVideoTrimPatch(scene, { trimStartMs: 3000, trimEndMs: 7000 });
  assert.ok(result);
  assert.equal(result!.patch.media?.trimStartMs, 3000);
  assert.equal(result!.patch.media?.trimEndMs, 7000);
  assert.equal(result!.patch.media?.url, "blob:clip");
  assert.equal(result!.patch.media?.muted, true);
  assert.equal(result!.patch.media?.fitMode, "cover");
  assert.equal(result!.patch.media?.mimeType, "video/mp4");
  assert.equal(result!.patch.media?.durationMs, 12_000);
  assert.deepEqual(Object.keys(result!.patch).sort(), ["media"]);
});

test("scene duration remains unchanged", () => {
  const prev = buildTrimScript({
    type: "video",
    url: "blob:clip",
    durationMs: 12_000,
    trimStartMs: 0,
    trimEndMs: 12_000,
    muted: true,
  });
  const patch = buildVideoTrimPatch(prev.scenes[0]!, { trimStartMs: 3000, trimEndMs: 7000 });
  assert.ok(patch);
  const next = applySceneUpdate(prev, "scene-1", patch!.patch);
  assert.equal(next.scenes[0]?.durationMs, prev.scenes[0]?.durationMs);
  assert.equal(next.scenes[0]?.duration, prev.scenes[0]?.duration);
  assert.equal(next.scenes[0]?.start, prev.scenes[0]?.start);
  assert.equal(next.scenes[0]?.end, prev.scenes[0]?.end);
});

test("trim edit classifies as media", () => {
  const prev = buildTrimScript({
    type: "video",
    url: "blob:clip",
    durationMs: 12_000,
    trimStartMs: 0,
    trimEndMs: 12_000,
    muted: true,
  });
  const patch = buildVideoTrimPatch(prev.scenes[0]!, { trimStartMs: 3000, trimEndMs: 7000 });
  assert.ok(patch);
  const synced = applyMediaStoryUpdate(prev, applySceneUpdate(prev, "scene-1", patch!.patch));
  const classification = classifyStoryPatch(prev, synced);
  assert.ok(classification.classes.includes("media"));
  assert.equal(resolveMediaSyncEditKind(prev, synced, classification), "image");
});

test("trim edit does not dirty narration", () => {
  const prev = buildTrimScript({
    type: "video",
    url: "blob:clip",
    durationMs: 12_000,
    trimStartMs: 0,
    trimEndMs: 12_000,
    muted: true,
  });
  const patch = buildVideoTrimPatch(prev.scenes[0]!, { trimStartMs: 2000, trimEndMs: 6000 });
  assert.ok(patch);
  const synced = applyMediaStoryUpdate(prev, applySceneUpdate(prev, "scene-1", patch!.patch));
  const kind = resolveMediaSyncEditKind(prev, synced, classifyStoryPatch(prev, synced));
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(synced.narration, prev.narration);
});

test("trim edit does not dirty voice", () => {
  const prev = buildTrimScript({
    type: "video",
    url: "blob:clip",
    durationMs: 12_000,
    trimStartMs: 0,
    trimEndMs: 12_000,
    muted: true,
  });
  const patch = buildVideoTrimPatch(prev.scenes[0]!, { trimStartMs: 1000, trimEndMs: 5000 });
  assert.ok(patch);
  const synced = applyMediaStoryUpdate(prev, applySceneUpdate(prev, "scene-1", patch!.patch));
  const kind = resolveMediaSyncEditKind(prev, synced, classifyStoryPatch(prev, synced));
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.voiceDirty, false);
  assert.equal(synced.voiceoverUrl, prev.voiceoverUrl);
});

test("trim edit marks export dirty", () => {
  const prev = buildTrimScript({
    type: "video",
    url: "blob:clip",
    durationMs: 12_000,
    trimStartMs: 0,
    trimEndMs: 12_000,
    muted: true,
  });
  const beforeMedia = resolveMediaCompleteness(prev);
  const patch = buildVideoTrimPatch(prev.scenes[0]!, { trimStartMs: 3000, trimEndMs: 7000 });
  assert.ok(patch);
  const synced = applyMediaStoryUpdate(prev, applySceneUpdate(prev, "scene-1", patch!.patch));
  const kind = resolveMediaSyncEditKind(prev, synced, classifyStoryPatch(prev, synced));
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.exportDirty, true);
  assert.equal(state.storyDirty, false);
  assert.equal(resolveMediaCompleteness(synced).isComplete, beforeMedia.isComplete);
});

test("poster below trim start is clamped", () => {
  const scene = trimBaseScene({
    media: {
      type: "video",
      url: "blob:clip",
      durationMs: 12_000,
      trimStartMs: 0,
      trimEndMs: 12_000,
      posterTimeMs: 1000,
      posterUrl: "blob:poster",
      muted: true,
    },
  });
  const result = buildVideoTrimPatch(scene, { trimStartMs: 3000, trimEndMs: 7000 });
  assert.ok(result);
  assert.equal(result!.media.posterTimeMs, 3000);
  assert.equal(result!.posterWasClamped, true);
  assert.equal(result!.posterUrlCleared, true);
  assert.equal(result!.media.posterUrl, undefined);
});

test("poster above trim end is clamped", () => {
  const scene = trimBaseScene({
    media: {
      type: "video",
      url: "blob:clip",
      durationMs: 12_000,
      trimStartMs: 0,
      trimEndMs: 12_000,
      posterTimeMs: 9000,
      muted: true,
    },
  });
  const result = buildVideoTrimPatch(scene, { trimStartMs: 3000, trimEndMs: 7000 });
  assert.ok(result);
  assert.equal(result!.media.posterTimeMs, 7000);
  assert.equal(result!.posterWasClamped, true);
});

test("valid poster remains unchanged", () => {
  const scene = trimBaseScene({
    media: {
      type: "video",
      url: "blob:clip",
      durationMs: 12_000,
      trimStartMs: 0,
      trimEndMs: 12_000,
      posterTimeMs: 4500,
      posterUrl: "blob:poster",
      muted: true,
    },
  });
  const result = buildVideoTrimPatch(scene, { trimStartMs: 3000, trimEndMs: 7000 });
  assert.ok(result);
  assert.equal(result!.media.posterTimeMs, 4500);
  assert.equal(result!.posterWasClamped, false);
  assert.equal(result!.posterUrlCleared, false);
  assert.equal(result!.media.posterUrl, "blob:poster");
});

test("reset trim restores full source duration", () => {
  const scene = trimBaseScene({
    media: {
      type: "video",
      url: "blob:clip",
      durationMs: 12_000,
      trimStartMs: 3000,
      trimEndMs: 7000,
      muted: true,
    },
  });
  const result = buildResetVideoTrimPatch(scene);
  assert.ok(result);
  assert.equal(result!.media.trimStartMs, 0);
  assert.equal(result!.media.trimEndMs, 12_000);
  assert.equal(result!.window.trimDurationMs, 12_000);
});

test("reset trim preserves valid poster", () => {
  const scene = trimBaseScene({
    media: {
      type: "video",
      url: "blob:clip",
      durationMs: 12_000,
      trimStartMs: 3000,
      trimEndMs: 7000,
      posterTimeMs: 4500,
      posterUrl: "blob:poster",
      muted: true,
    },
  });
  const result = buildResetVideoTrimPatch(scene);
  assert.ok(result);
  assert.equal(result!.media.posterTimeMs, 4500);
  assert.equal(result!.media.posterUrl, "blob:poster");
  assert.equal(result!.posterWasClamped, false);
});

test("image media rejects/no-ops trim patch", () => {
  const scene = trimBaseScene({
    media: { type: "image", url: "https://example.com/still.jpg" },
  });
  assert.equal(buildVideoTrimPatch(scene, { trimStartMs: 0, trimEndMs: 1000 }), null);
  assert.equal(buildResetVideoTrimPatch(scene), null);
});

test("missing source duration handled safely", () => {
  const scene = trimBaseScene({
    media: { type: "video", url: "blob:clip", muted: true },
  });
  assert.equal(buildVideoTrimPatch(scene, { trimStartMs: 0, trimEndMs: 1000 }), null);
  const zero = normalizeVideoTrim(0, { trimStartMs: 0, trimEndMs: 1000 });
  assert.equal(zero.trimDurationMs, 0);
  assert.equal(zero.sourceDurationMs, 0);
});

test("export fingerprint changes when trim changes", () => {
  const settings: import("@/features/story/types").ExportSettings = {
    fileName: "trim-export",
    format: "mp4",
    quality: "standard",
    resolution: "1080x1920",
  };
  const base = buildTrimScript({
    type: "video",
    url: "blob:clip",
    durationMs: 12_000,
    trimStartMs: 0,
    trimEndMs: 12_000,
    muted: true,
  });
  const before = buildExportFingerprint({
    script: base,
    exportSettings: settings,
    includeNarration: true,
    includeBackgroundMusic: false,
  });
  const patch = buildVideoTrimPatch(base.scenes[0]!, { trimStartMs: 3000, trimEndMs: 7000 });
  assert.ok(patch);
  const afterScript = applySceneUpdate(base, "scene-1", patch!.patch);
  const after = buildExportFingerprint({
    script: afterScript,
    exportSettings: settings,
    includeNarration: true,
    includeBackgroundMusic: false,
  });
  assert.notEqual(before, after);
});

test("preview/export timing helpers continue using shared trim authority", () => {
  const engine = readSrc("src/features/media-playback/media-playback.utils.ts");
  const exportRenderer = readSrc("src/features/export/utils/export-scene-media-renderer.ts");
  const trimPatch = readSrc("src/features/media-playback/media-trim-patch.utils.ts");
  const preview = readSrc("src/features/preview/utils/preview-video-clip.utils.ts");

  assert.match(engine, /export function clampSceneMediaTrim/);
  assert.match(exportRenderer, /resolveSceneMediaPlayback/);
  assert.match(trimPatch, /clampSceneMediaTrim/);
  // Preview path unchanged in this phase (parallel helper still present).
  assert.match(preview, /resolvePreviewVideoClipWindow/);
  assert.doesNotMatch(trimPatch, /scene\.durationMs\s*=/);
});

test("clampPosterTimeToTrimWindow helper", () => {
  const below = clampPosterTimeToTrimWindow(500, { trimStartMs: 3000, trimEndMs: 7000 });
  assert.equal(below.posterTimeMs, 3000);
  assert.equal(below.wasClamped, true);

  const above = clampPosterTimeToTrimWindow(9000, { trimStartMs: 3000, trimEndMs: 7000 });
  assert.equal(above.posterTimeMs, 7000);

  const ok = clampPosterTimeToTrimWindow(4500, { trimStartMs: 3000, trimEndMs: 7000 });
  assert.equal(ok.posterTimeMs, 4500);
  assert.equal(ok.wasClamped, false);
});

console.log(`\nmedia-playback: ${passed} passed`);
