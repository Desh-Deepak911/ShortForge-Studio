/**
 * 4.0D-4 — Media completeness + export readiness domain separation.
 * Run: npm run test:story-sync-domain
 */
import assert from "node:assert/strict";

import { classifyStoryPatch } from "@/features/editor/story-patches";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { recalculateSceneTimings } from "@/features/story/utils";
import {
  applySceneImageSettings,
  applyPresentationStoryUpdate,
  applySceneUpdate,
  applyStoryUpdate,
  syncFootieScript,
} from "@/lib/utils/voiceover";

import {
  formatMissingSceneNumbers,
  resolveMediaCompleteness,
} from "@/features/story-sync/media-completeness.utils";
import {
  isExportReadinessBlocked,
  resolveExportReadiness,
} from "@/features/story-sync/export-readiness.utils";
import { createInitialStorySynchronizationState } from "@/features/story-sync/story-sync.state";
import {
  applyStorySyncEdit,
  markExportSynchronized,
  markNarrationSynchronized,
  markPreviewSynchronized,
  markVoiceSynchronized,
  resolveMediaSyncEditKind,
  resolvePresentationSyncEditKind,
  resolveStorySyncEditKind,
  resolveStorySyncSteps,
} from "@/features/story-sync/story-sync.utils";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function makeScene(
  id: string,
  durationSec: number,
  options: {
    subtitleText?: string;
    subtitle?: string;
    withImage?: boolean;
  } = {},
): FootieScene {
  const durationMs = durationSec * 1000;
  return {
    id,
    start: 0,
    end: durationSec,
    duration: durationSec,
    startMs: 0,
    endMs: durationMs,
    durationMs,
    durationSource: "manual",
    subtitle: options.subtitle ?? `Caption ${id}`,
    captionMode: "generated",
    subtitleText: options.subtitleText ?? `Subtitle ${id}`,
    narration: `Narration ${id}`,
    ...(options.withImage !== false
      ? {
          image: {
            url: `https://example.com/${id}.jpg`,
            scale: 1,
            x: 0,
            y: 0,
            fitMode: "fit" as const,
          },
        }
      : {}),
  };
}

function makeSceneWithoutImage(id: string, durationSec: number): FootieScene {
  return makeScene(id, durationSec, { withImage: false });
}

function buildStory(scenes: FootieScene[]): FootieScript {
  const timedScenes = recalculateSceneTimings(scenes);
  const totalDuration = timedScenes.reduce((sum, scene) => sum + scene.duration, 0);
  return syncFootieScript({
    title: "Export readiness story",
    narration: "Export readiness narration.",
    scenes: timedScenes,
    totalDuration,
    voiceoverUrl: "blob:voice",
    voiceoverDurationMs: totalDuration * 1000,
  });
}

function commitMedia(prev: FootieScript, next: FootieScript) {
  const synced = applyStoryUpdate(prev, next);
  const classification = classifyStoryPatch(prev, synced);
  const kind = resolveMediaSyncEditKind(prev, synced, classification);
  return { synced, kind };
}

function commitStory(prev: FootieScript, next: FootieScript) {
  const synced = applyStoryUpdate(prev, next);
  const classification = classifyStoryPatch(prev, synced);
  const kind = resolveStorySyncEditKind(prev, synced, classification);
  return { synced, kind };
}

test("fresh generated story with no images is not export ready", () => {
  const script = buildStory([
    makeSceneWithoutImage("s1", 3),
    makeSceneWithoutImage("s2", 4),
  ]);
  const syncState = createInitialStorySynchronizationState();

  const media = resolveMediaCompleteness(script);
  assert.equal(media.isComplete, false);
  assert.equal(media.scenesWithMedia, 0);
  assert.equal(media.totalScenes, 2);

  const readiness = resolveExportReadiness(script, syncState);
  assert.equal(readiness.mediaComplete, false);
  assert.equal(readiness.canExport, false);
  assert.equal(readiness.isReady, false);

  const exportStep = resolveStorySyncSteps(syncState, script).find((step) => step.id === "export");
  assert.ok(exportStep);
  assert.match(exportStep!.statusLabel, /Blocked/i);
  assert.doesNotMatch(exportStep!.statusLabel, /Ready to export/i);
});

test("attach image to one scene updates media completeness without dirtying narration or voice", () => {
  const prev = buildStory([
    makeSceneWithoutImage("s1", 3),
    makeSceneWithoutImage("s2", 4),
  ]);
  const { kind } = commitMedia(
    prev,
    applySceneUpdate(prev, "s1", {
      image: { url: "https://example.com/s1.jpg", scale: 1, x: 0, y: 0, fitMode: "fit" },
    }),
  );
  assert.equal(kind, "image");

  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.exportDirty, true);

  const next = applyStoryUpdate(prev, applySceneUpdate(prev, "s1", {
    image: { url: "https://example.com/s1.jpg", scale: 1, x: 0, y: 0, fitMode: "fit" },
  }));
  const media = resolveMediaCompleteness(next);
  assert.equal(media.scenesWithMedia, 1);
  assert.equal(media.isComplete, false);
});

test("all scenes with images can export when story and voice are synced", () => {
  const script = buildStory([makeScene("s1", 3), makeScene("s2", 4)]);
  const syncState = markExportSynchronized(
    markPreviewSynchronized(
      markVoiceSynchronized(markNarrationSynchronized(createInitialStorySynchronizationState()), null),
      null,
    ),
    null,
  );

  const readiness = resolveExportReadiness(script, syncState);
  assert.equal(readiness.mediaComplete, true);
  assert.equal(readiness.canExport, true);
  assert.equal(readiness.isReady, true);
  assert.equal(isExportReadinessBlocked(script, syncState), false);
});

test("video scene with duration counts as media complete", () => {
  const script = buildStory([
    {
      ...makeScene("s1", 3, { withImage: false }),
      media: {
        type: "video",
        url: "blob:clip",
        durationMs: 3000,
      },
    },
    makeScene("s2", 4),
  ]);

  const media = resolveMediaCompleteness(script);
  assert.equal(media.scenesWithMedia, 2);
  assert.equal(media.isComplete, true);
});

test("replace image keeps narration and voice clean and marks export stale", () => {
  const prev = buildStory([makeScene("s1", 3)]);
  const clean = markExportSynchronized(
    markVoiceSynchronized(markNarrationSynchronized(createInitialStorySynchronizationState()), null),
    null,
  );

  const { kind } = commitMedia(
    prev,
    applySceneUpdate(prev, "s1", {
      image: { url: "https://example.com/replaced.jpg", scale: 1, x: 0, y: 0, fitMode: "fit" },
    }),
  );
  assert.equal(kind, "image");

  const state = applyStorySyncEdit(clean, kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.exportDirty, true);
});

test("image motion and framing keep narration and voice clean", () => {
  const prev = buildStory([makeScene("s1", 3)]);
  const { kind } = commitMedia(
    prev,
    applySceneImageSettings(prev, "s1", { scale: 1.4, x: 0.1, fitMode: "fill" }),
  );
  assert.equal(kind, "motion");

  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.exportDirty, true);
});

test("caption layout/style/animation edits keep narration and voice clean", () => {
  const prev = buildStory([makeScene("s1", 3)]);
  const layoutNext = applyPresentationStoryUpdate(prev, {
    ...prev,
    scenes: prev.scenes.map((scene) =>
      scene.id === "s1"
        ? { ...scene, captionLayout: { anchor: "bottom_center", offsetX: 0, offsetY: -12 } }
        : scene,
    ),
  });
  const layoutKind = resolvePresentationSyncEditKind(classifyStoryPatch(prev, layoutNext));
  assert.equal(layoutKind, "caption_layout");
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), layoutKind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.exportDirty, true);
});

test("narrated subtitle edit dirties narration and voice and blocks export", () => {
  const prev = buildStory([makeScene("s1", 3)]);
  const { kind } = commitStory(
    prev,
    applySceneUpdate(prev, "s1", { subtitleText: "Updated spoken subtitle." }),
  );
  assert.equal(kind, "spoken_text");

  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, true);
  assert.equal(state.voiceDirty, true);

  const next = applyStoryUpdate(prev, applySceneUpdate(prev, "s1", { subtitleText: "Updated spoken subtitle." }));
  assert.equal(isExportReadinessBlocked(next, state), true);
});

test("update narration and regenerate voice clears sync blockers but media still gates export", () => {
  const prev = buildStory([
    makeSceneWithoutImage("s1", 3),
    makeSceneWithoutImage("s2", 4),
  ]);
  let state = applyStorySyncEdit(createInitialStorySynchronizationState(), "spoken_text");
  state = applyStorySyncEdit(state, "narration");
  state = applyStorySyncEdit(state, "voice_generated");
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);

  const readiness = resolveExportReadiness(prev, state);
  assert.equal(readiness.storySynced, true);
  assert.equal(readiness.voiceSynced, true);
  assert.equal(readiness.mediaComplete, false);
  assert.equal(readiness.canExport, false);
});

test("export success clears exportDirty and readiness is true when media complete", () => {
  const script = buildStory([makeScene("s1", 3)]);
  let state = applyStorySyncEdit(createInitialStorySynchronizationState(), "transition");
  assert.equal(state.exportDirty, true);

  state = applyStorySyncEdit(state, "export_success");
  assert.equal(state.exportDirty, false);

  const readiness = resolveExportReadiness(script, state);
  assert.equal(readiness.isReady, true);
  assert.equal(readiness.canExport, true);
});

test("missing scene numbers are reported correctly", () => {
  const script = buildStory([
    makeScene("s1", 3),
    makeSceneWithoutImage("s2", 4),
    makeSceneWithoutImage("s3", 3),
  ]);
  const media = resolveMediaCompleteness(script);
  assert.deepEqual(formatMissingSceneNumbers(script, media.scenesMissingMedia), [2, 3]);

  const readiness = resolveExportReadiness(script, createInitialStorySynchronizationState());
  assert.match(readiness.blockedReasons[0] ?? "", /Scenes 2, 3/);
});

console.log(`\nstory-sync-domain: ${passed} passed`);
