/**
 * Caption placement controls — 4.0D-4.
 * Run: npm run test:caption-layout
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyStoryPatch } from "@/features/editor/story-patches";
import {
  applyStorySyncEdit,
  createInitialStorySynchronizationState,
  isStorySyncExportBlocked,
  resolveStorySyncEditKind,
} from "@/features/story-sync";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { recalculateSceneTimings } from "@/features/story/utils";
import { buildMasterTimeline } from "@/features/timeline-intelligence/build-master-timeline";
import {
  resolveExportCaptionPlacement,
  resolveCaptionLayout,
  clampCaptionLayoutPercent,
  DEFAULT_CAPTION_LAYOUT_BOTTOM_Y_PERCENT,
  DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY,
} from "./caption-layout.utils";
import { syncFootieScript } from "@/lib/utils/voiceover";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function makeScene(id: string, durationSec: number): FootieScene {
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
  };
}

function buildStory(scenes: FootieScene[], patch: Partial<FootieScript> = {}): FootieScript {
  const timedScenes = recalculateSceneTimings(scenes);
  const totalDuration = timedScenes.reduce((sum, scene) => sum + scene.duration, 0);
  return syncFootieScript({
    title: "Caption layout story",
    narration: timedScenes.map((scene) => scene.narration).join(" "),
    scenes: timedScenes,
    totalDuration,
    voiceoverUrl: "blob:voice",
    voiceoverDurationMs: totalDuration * 1000,
    ...patch,
  });
}

test("default placement matches legacy export bottom anchor", () => {
  const scene = makeScene("s1", 4);
  const layout = resolveCaptionLayout(scene, buildStory([scene]));
  assert.equal(layout.usesLegacyBottomPlacement, true);
  assert.equal(layout.position, "bottom");
  assert.equal(layout.xPercent, 50);
  assert.equal(layout.yPercent, DEFAULT_CAPTION_LAYOUT_BOTTOM_Y_PERCENT);

  const placement = resolveExportCaptionPlacement(layout, 1080, 1920, 1, 400, 120);
  assert.equal(placement.centerX, 540);
  assert.equal(placement.boxBottomY, 1600);
  assert.equal(placement.backgroundAlpha, DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY / 100);
});

test("center placement applies in preview and export", () => {
  const scene = {
    ...makeScene("s1", 4),
    captionLayout: { position: "center" as const },
  };
  const layout = resolveCaptionLayout(scene, buildStory([scene]));
  assert.equal(layout.position, "center");
  assert.equal(layout.yPercent, 52);

  const placement = resolveExportCaptionPlacement(layout, 1080, 1920, 1, 500, 140);
  assert.equal(placement.centerX, 540);
  assert.equal(placement.boxBottomY, 1068.4);
});

test("top-left placement applies in preview and export", () => {
  const scene = {
    ...makeScene("s1", 4),
    captionLayout: { position: "top_left" as const },
  };
  const layout = resolveCaptionLayout(scene, buildStory([scene]));
  assert.equal(layout.textAlign, "left");

  const placement = resolveExportCaptionPlacement(layout, 1080, 1920, 1, 400, 100);
  assert.equal(placement.centerX, 329.6);
  assert.equal(placement.boxBottomY, 388);
});

test("custom x/y clamps to 0–100", () => {
  assert.equal(clampCaptionLayoutPercent(-5, 50), 0);
  assert.equal(clampCaptionLayoutPercent(150, 50), 100);

  const scene = {
    ...makeScene("s1", 4),
    captionLayout: { position: "custom" as const, xPercent: 200, yPercent: -10 },
  };
  const layout = resolveCaptionLayout(scene, buildStory([scene]));
  assert.equal(layout.xPercent, 100);
  assert.equal(layout.yPercent, 0);
});

test("opacity applies in export placement", () => {
  const scene = {
    ...makeScene("s1", 4),
    captionLayout: { position: "center" as const, backgroundOpacity: 72 },
  };
  const layout = resolveCaptionLayout(scene, buildStory([scene]));
  const placement = resolveExportCaptionPlacement(layout, 1080, 1920, 1, 400, 100);
  assert.equal(placement.backgroundAlpha, 0.72);
});

test("placement change does not dirty narration or voice", () => {
  const prev = buildStory([makeScene("s1", 4)]);
  const next = buildStory([
    {
      ...makeScene("s1", 4),
      captionLayout: { position: "center" },
    },
  ]);
  const classification = classifyStoryPatch(prev, next);
  assert.ok(classification.classes.includes("caption_layout"));
  assert.doesNotMatch(classification.classes.join(","), /spoken_text|timing|structural/);

  const kind = resolveStorySyncEditKind(prev, next, classification);
  assert.equal(kind, "caption_layout");
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.previewDirty, false);
  assert.equal(state.exportDirty, true);
  assert.equal(isStorySyncExportBlocked(state), false);
});

test("placement change marks export dirty only", () => {
  const synced = createInitialStorySynchronizationState();
  const state = applyStorySyncEdit(synced, "caption_layout");
  assert.equal(state.exportDirty, true);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.previewDirty, false);
});

test("caption timing events unchanged by placement edits", () => {
  const prev = buildStory([makeScene("s1", 4)]);
  const next = buildStory([
    {
      ...makeScene("s1", 4),
      captionLayout: { position: "top" },
    },
  ]);

  const prevTimeline = buildMasterTimeline(prev, { assumeSynced: true, mode: "preview" });
  const nextTimeline = buildMasterTimeline(next, { assumeSynced: true, mode: "preview" });

  const prevSubtitles = prevTimeline.tracks.find((track) => track.type === "subtitle")?.events ?? [];
  const nextSubtitles = nextTimeline.tracks.find((track) => track.type === "subtitle")?.events ?? [];

  assert.equal(prevSubtitles.length, nextSubtitles.length);
  assert.deepEqual(
    prevSubtitles.map((event) => ({
      startMs: event.startMs,
      endMs: event.endMs,
      text: event.metadata.text,
    })),
    nextSubtitles.map((event) => ({
      startMs: event.startMs,
      endMs: event.endMs,
      text: event.metadata.text,
    })),
  );
});

test("export and preview wiring expose layout-aware draw APIs", () => {
  const canvasUtils = readFileSync(
    join(process.cwd(), "src/features/export/utils/export-caption-canvas.utils.ts"),
    "utf8",
  );
  const videoRender = readFileSync(
    join(process.cwd(), "src/features/export/services/video-render.service.ts"),
    "utf8",
  );
  const subtitleOverlay = readFileSync(
    join(process.cwd(), "src/features/preview/components/SubtitleOverlay.tsx"),
    "utf8",
  );

  assert.match(canvasUtils, /layout: ResolvedCaptionLayout/);
  assert.match(canvasUtils, /resolveExportCaptionPlacement/);
  assert.match(videoRender, /resolveCaptionLayout\(scene, script\)/);
  assert.match(subtitleOverlay, /resolvePreviewCaptionOverlayStyle/);
});

console.log(`\ncaption-layout: ${passed} passed`);
