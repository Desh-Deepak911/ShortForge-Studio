/**
 * Caption Layout Drag — 4.1A-3A
 * Run: npm run test:caption-layout
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyStoryPatch } from "@/features/editor/story-patches";
import {
  applyStorySyncEdit,
  createInitialStorySynchronizationState,
  resolveStorySyncEditKind,
} from "@/features/story-sync";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { recalculateSceneTimings } from "@/features/story/utils";
import { buildMasterTimeline } from "@/features/timeline-intelligence/build-master-timeline";
import {
  resolveExportCaptionPlacement,
  resolvePreviewCaptionLayout,
} from "@/features/caption-engine/caption-layout.utils";
import { syncFootieScript } from "@/lib/utils/voiceover";

import {
  applyCaptionDragDelta,
  buildCaptionLayoutOffsetCommitPatch,
  isCaptionDragEnabled,
  resolveCaptionKeyboardStep,
  resolvePreviewCaptionLayoutForDrag,
  resolveStoredCaptionOffsets,
  screenDeltaToReferenceOffsetPx,
} from "@/features/caption-layout-drag/caption-layout-drag.utils";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function makeScene(id: string, durationSec: number, patch: Partial<FootieScene> = {}): FootieScene {
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
    subtitle: `Caption ${id}`,
    captionMode: "subtitles",
    subtitleText: `Narrated subtitle for ${id}.`,
    subtitleEffect: "fade-up",
    narration: `Narrated subtitle for ${id}.`,
    ...patch,
  };
}

function buildStory(scenes: FootieScene[]): FootieScript {
  const timedScenes = recalculateSceneTimings(scenes);
  const totalDuration = timedScenes.reduce((sum, scene) => sum + scene.duration, 0);
  return syncFootieScript({
    title: "Caption drag story",
    narration: timedScenes.map((scene) => scene.narration).join(" "),
    scenes: timedScenes,
    totalDuration,
    voiceoverUrl: "blob:voice",
    voiceoverDurationMs: totalDuration * 1000,
  });
}

test("drag updates offsetX from screen delta", () => {
  const delta = screenDeltaToReferenceOffsetPx(54, 0, 540, 960);
  assert.equal(delta.offsetX, 108);
  assert.equal(delta.offsetY, 0);

  const next = applyCaptionDragDelta(0, 0, 54, 0, 540, 960);
  assert.equal(next.offsetX, 108);
  assert.equal(next.offsetY, 0);
});

test("drag updates offsetY from screen delta", () => {
  const next = applyCaptionDragDelta(10, -20, 0, 48, 540, 960);
  assert.equal(next.offsetX, 10);
  assert.equal(next.offsetY, 76);
});

test("drag commit patch preserves anchor and text alignment", () => {
  const scene = {
    captionLayout: {
      anchor: "top_left" as const,
      textAlign: "left" as const,
      version: 2,
      offsetX: 0,
      offsetY: 0,
    },
  };
  const patch = buildCaptionLayoutOffsetCommitPatch(scene, undefined, 120, -80);
  assert.equal(patch.captionLayout.anchor, "top_left");
  assert.equal(patch.captionLayout.textAlign, "left");
  assert.equal(patch.captionLayout.offsetX, 120);
  assert.equal(patch.captionLayout.offsetY, -80);
});

test("drag offsets clamp through layout engine helpers", () => {
  const next = applyCaptionDragDelta(280, -480, 400, -600, 540, 960);
  assert.equal(next.offsetX, 300);
  assert.equal(next.offsetY, -500);
});

test("keyboard movement resolves 1px, 10px, and 25px steps", () => {
  assert.deepEqual(resolveCaptionKeyboardStep({ key: "ArrowRight", shiftKey: false, altKey: false }), {
    deltaX: 1,
    deltaY: 0,
  });
  assert.deepEqual(resolveCaptionKeyboardStep({ key: "ArrowUp", shiftKey: true, altKey: false }), {
    deltaX: 0,
    deltaY: -10,
  });
  assert.deepEqual(resolveCaptionKeyboardStep({ key: "ArrowLeft", shiftKey: false, altKey: true }), {
    deltaX: -25,
    deltaY: 0,
  });
});

test("preview drag layout resolves through caption layout engine", () => {
  const scene = { captionLayout: { anchor: "center" as const, version: 2 } };
  const base = resolvePreviewCaptionLayoutForDrag(scene, undefined, 0, 0, 420, 110);
  const shifted = resolvePreviewCaptionLayoutForDrag(scene, undefined, 50, 30, 420, 110);
  assert.equal(shifted.x, base.x + 50);
  assert.equal(shifted.y, base.y + 30);
});

test("preview and export stay aligned after drag offsets", () => {
  const scene = {
    captionLayout: { anchor: "center" as const, version: 2, offsetX: 40, offsetY: -25 },
  };
  const script = buildStory([makeScene("s1", 4, scene)]);
  const preview = resolvePreviewCaptionLayout(scene, script, 420, 110);
  const exportPlacement = resolveExportCaptionPlacement(scene, script, 1080, 1920, 1, 420, 110);
  assert.equal(preview.centerX, exportPlacement.centerX);
  assert.equal(preview.boxBottomY, exportPlacement.boxBottomY);
});

test("drag enabled only for selected scene when idle", () => {
  assert.equal(
    isCaptionDragEnabled({
      enabled: true,
      sceneId: "s1",
      selectedSceneId: "s1",
      playbackActive: false,
      frameEditActive: false,
    }),
    true,
  );
  assert.equal(
    isCaptionDragEnabled({
      enabled: true,
      sceneId: "s1",
      selectedSceneId: "s2",
      playbackActive: false,
      frameEditActive: false,
    }),
    false,
  );
  assert.equal(
    isCaptionDragEnabled({
      enabled: true,
      sceneId: "s1",
      selectedSceneId: "s1",
      playbackActive: true,
      frameEditActive: false,
    }),
    false,
  );
});

test("drag wiring commits on pointer release via presentation patch", () => {
  const overlay = readSrc("src/features/caption-layout-drag/CaptionPreviewOverlay.tsx");
  const workspace = readSrc("src/components/StoryWorkspace.tsx");
  assert.match(overlay, /commitOffsets\(finalOffsets\.offsetX, finalOffsets\.offsetY\)/);
  assert.match(overlay, /requestAnimationFrame/);
  assert.match(workspace, /applyPresentationSceneUpdate[\s\S]*buildCaptionLayoutOffsetCommitPatch/);
  assert.match(workspace, /intent: "presentation"/);
});

test("written captions and narrated subtitles share drag overlay", () => {
  const subtitleOverlay = readSrc("src/features/preview/components/SubtitleOverlay.tsx");
  const captionOverlay = readSrc("src/features/preview/components/CaptionOverlay.tsx");
  const dragOverlay = readSrc("src/features/caption-layout-drag/CaptionPreviewOverlay.tsx");
  assert.match(subtitleOverlay, /CaptionPreviewOverlay/);
  assert.match(captionOverlay, /CaptionPreviewOverlay/);
  assert.match(dragOverlay, /aria-label=\{captionInteractive \? "Move caption"/);
  assert.match(dragOverlay, /allowPointerEvents/);
});

test("drag offset commit is presentation-only sync", () => {
  const prev = buildStory([makeScene("s1", 4)]);
  const next = buildStory([
    makeScene("s1", 4, {
      captionLayout: { anchor: "bottom_center", version: 2, offsetX: 80, offsetY: -40 },
    }),
  ]);
  const kind = resolveStorySyncEditKind(prev, next, classifyStoryPatch(prev, next));
  assert.equal(kind, "caption_layout");
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.exportDirty, true);
});

test("drag edits do not rebuild master timeline subtitle events", () => {
  const prev = buildStory([makeScene("s1", 4)]);
  const next = buildStory([
    makeScene("s1", 4, {
      captionLayout: { anchor: "bottom_center", version: 2, offsetX: 120, offsetY: 0 },
    }),
  ]);
  const prevTimeline = buildMasterTimeline(prev, { mode: "preview" });
  const nextTimeline = buildMasterTimeline(next, { mode: "preview" });
  const prevSubtitles =
    prevTimeline.tracks.find((track) => track.type === "subtitle")?.events ?? [];
  const nextSubtitles =
    nextTimeline.tracks.find((track) => track.type === "subtitle")?.events ?? [];
  assert.deepEqual(prevSubtitles, nextSubtitles);
});

test("existing stories start drag from zero offsets", () => {
  const scene = makeScene("s1", 4);
  const script = buildStory([scene]);
  const offsets = resolveStoredCaptionOffsets(scene, script);
  assert.equal(offsets.offsetX, 0);
  assert.equal(offsets.offsetY, 0);
});

console.log(`\ncaption-layout-drag: ${passed} passed`);
