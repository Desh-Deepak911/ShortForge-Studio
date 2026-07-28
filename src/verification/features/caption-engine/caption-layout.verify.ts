/**
 * Caption placement sync + adapter regression — 4.0D-4 / 4.1A-1 / 4.1A-2.
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
  buildResetCaptionLayoutPatch,
  clampCaptionMaxWidthPercent,
  clampCaptionOffsetXPx,
  clampCaptionOffsetYPx,
  mergeCaptionLayoutSettings,
} from "@/features/caption-layout";
import {
  resolveExportCaptionPlacement,
  resolveCaptionLayout,
  resolvePreviewCaptionLayout,
  resolvePreviewCaptionLayoutForScene,
  resolvePreviewCaptionLayoutScene,
  DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY,
} from "@/features/caption-engine/caption-layout.utils";
import { syncFootieScript } from "@/lib/utils/voiceover";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
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
  const script = buildStory([scene]);
  const layout = resolveCaptionLayout(scene, script);
  assert.equal(layout.usesLegacyBottomPlacement, true);
  assert.equal(layout.anchor, "bottom_center");

  const placement = resolveExportCaptionPlacement(scene, script, 1080, 1920, 1, 400, 120);
  assert.equal(placement.centerX, 540);
  assert.equal(placement.boxBottomY, 1600);
  assert.equal(placement.backgroundAlpha, DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY / 100);
});

test("center anchor applies in preview and export", () => {
  const scene = {
    ...makeScene("s1", 4),
    captionLayout: { anchor: "center" as const, version: 2 },
  };
  const script = buildStory([scene]);
  const layout = resolveCaptionLayout(scene, script);
  assert.equal(layout.anchor, "center");

  const placement = resolveExportCaptionPlacement(scene, script, 1080, 1920, 1, 500, 140);
  assert.equal(placement.centerX, 540);
  assert.equal(placement.boxBottomY, 1001);
});

test("top-left anchor keeps independent text alignment", () => {
  const scene = {
    ...makeScene("s1", 4),
    captionLayout: { anchor: "top_left" as const, textAlign: "center" as const, version: 2 },
  };
  const script = buildStory([scene]);
  const layout = resolveCaptionLayout(scene, script);
  assert.equal(layout.anchor, "top_left");
  assert.equal(layout.textAlign, "center");

  const placement = resolveExportCaptionPlacement(scene, script, 1080, 1920, 1, 400, 100);
  assert.equal(placement.centerX, 265);
  assert.equal(placement.boxBottomY, 196);
  assert.equal(placement.textAlign, "center");
});

test("text alignment updates preview and export together", () => {
  const scene = {
    ...makeScene("s1", 4),
    captionLayout: { anchor: "top_center" as const, textAlign: "left" as const, version: 2 },
  };
  const script = buildStory([scene]);
  const preview = resolvePreviewCaptionLayout(scene, script, 400, 100);
  const exportPlacement = resolveExportCaptionPlacement(scene, script, 1080, 1920, 1, 400, 100);
  assert.equal(preview.textAlign, "left");
  assert.equal(exportPlacement.textAlign, "left");
});

test("offset x/y pixel sliders clamp correctly", () => {
  assert.equal(clampCaptionOffsetXPx(-500), -300);
  assert.equal(clampCaptionOffsetXPx(500), 300);
  assert.equal(clampCaptionOffsetYPx(-900), -500);
  assert.equal(clampCaptionOffsetYPx(900), 500);
});

test("max width percent clamps to 40–100", () => {
  assert.equal(clampCaptionMaxWidthPercent(10), 40);
  assert.equal(clampCaptionMaxWidthPercent(120), 100);
});

test("opacity applies in export placement", () => {
  const scene = {
    ...makeScene("s1", 4),
    captionLayout: { anchor: "center" as const, backgroundOpacity: 72, version: 2 },
  };
  const script = buildStory([scene]);
  const placement = resolveExportCaptionPlacement(scene, script, 1080, 1920, 1, 400, 100);
  assert.equal(placement.backgroundAlpha, 0.72);
});

test("safe area toggle affects resolved placement", () => {
  const enabled = resolvePreviewCaptionLayout(
    { captionLayout: { anchor: "top_left", safeAreaEnabled: true, version: 2 } },
    undefined,
    400,
    100,
  );
  const disabled = resolvePreviewCaptionLayout(
    { captionLayout: { anchor: "top_left", safeAreaEnabled: false, version: 2 } },
    undefined,
    400,
    100,
  );
  assert.ok(enabled.y >= enabled.safeAreaInsets.top);
  assert.equal(disabled.y, 0);
});

test("reset layout patch restores factory defaults only", () => {
  const reset = buildResetCaptionLayoutPatch().captionLayout;
  assert.equal(reset.anchor, "bottom_center");
  assert.equal(reset.textAlign, "center");
  assert.equal(reset.offsetX, 0);
  assert.equal(reset.safeAreaEnabled, true);
});

test("placement change does not dirty narration or voice", () => {
  const prev = buildStory([makeScene("s1", 4)]);
  const next = buildStory([
    {
      ...makeScene("s1", 4),
      captionLayout: { anchor: "center", textAlign: "left", version: 2 },
    },
  ]);
  const kind = resolveStorySyncEditKind(prev, next, classifyStoryPatch(prev, next));
  assert.equal(kind, "caption_layout");
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(isStorySyncExportBlocked(state), false);
});

test("placement change marks export dirty only", () => {
  const prev = buildStory([makeScene("s1", 4)]);
  const next = buildStory([
    {
      ...makeScene("s1", 4),
      captionLayout: { anchor: "top_center", textAlign: "right", version: 2 },
    },
  ]);
  const kind = resolveStorySyncEditKind(prev, next, classifyStoryPatch(prev, next));
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.exportDirty, true);
  assert.equal(state.narrationDirty, false);
});

test("caption timing events unchanged by placement edits", () => {
  const prev = buildStory([makeScene("s1", 4)]);
  const next = buildStory([
    {
      ...makeScene("s1", 4),
      captionLayout: { anchor: "bottom_right", textAlign: "center", version: 2 },
    },
  ]);
  const prevTimeline = buildMasterTimeline(prev, { mode: "preview" });
  const nextTimeline = buildMasterTimeline(next, { mode: "preview" });
  const prevSubtitles =
    prevTimeline.tracks.find((track) => track.type === "subtitle")?.events ?? [];
  const nextSubtitles =
    nextTimeline.tracks.find((track) => track.type === "subtitle")?.events ?? [];
  assert.deepEqual(prevSubtitles, nextSubtitles);
});

test("existing stories without layout preserve legacy appearance", () => {
  const scene = makeScene("s1", 4);
  const script = buildStory([scene]);
  const settings = mergeCaptionLayoutSettings(scene.captionLayout, script.defaultCaptionLayout);
  assert.equal(settings.textAlign, "center");
  const resolved = resolvePreviewCaptionLayout(scene, script, 400, 120);
  assert.equal(resolved.usesLegacyBottomCenter, true);
});

test("preview resolves layout from live script scene during playback", () => {
  const liveScene = {
    ...makeScene("s1", 4),
    captionLayout: { anchor: "center" as const, version: 2 },
  };
  const script = buildStory([liveScene]);
  const staleScene = { ...liveScene, captionLayout: undefined };

  const resolved = resolvePreviewCaptionLayoutForScene(staleScene, script, 0);
  assert.equal(resolved.anchor, "center");
  assert.equal(resolved.usesLegacyBottomCenter, false);
  const layoutScene = resolvePreviewCaptionLayoutScene(script, staleScene, 0) as unknown as typeof liveScene;
  assert.equal(layoutScene.captionLayout?.anchor, "center");
});

test("project default layout applies when preview scene snapshot is stale", () => {
  const scene = makeScene("s1", 4);
  const script = buildStory([scene], {
    defaultCaptionLayout: { anchor: "top_center", version: 2 },
  });
  const resolved = resolvePreviewCaptionLayoutForScene(scene, script, 0);
  assert.equal(resolved.anchor, "top_center");
  assert.equal(resolved.usesLegacyBottomCenter, false);
});

test("export and preview wiring expose layout-aware draw APIs", () => {
  const canvasUtils = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  const subtitleOverlay = readSrc("src/features/preview/components/SubtitleOverlay.tsx");
  const videoPreview = readSrc("src/features/preview/components/VideoPreview.tsx");
  assert.match(canvasUtils, /resolveExportCaptionPlacement\(scene, script/);
  assert.match(subtitleOverlay, /resolvePreviewCaptionLayoutForScene/);
  assert.match(subtitleOverlay, /resolvePreviewCaptionLayoutScene/);
  assert.match(videoPreview, /sceneIndex=\{subtitleSceneIndex\}/);
});

console.log(`\ncaption-engine layout adapter: ${passed} passed`);
