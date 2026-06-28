/**
 * Transition QA (run: npm run test:transition-qa).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildFootieExportPayload,
  getExportTotalDurationSec,
  getRenderableScenesFromPayload,
  isTransitionVideoContent,
} from "@/features/export/services";
import { buildMasterTimeline } from "@/features/timeline-intelligence/build-master-timeline";
import { resolveTimelineTransitionOverlay } from "@/features/timeline-intelligence/resolve-timeline-transition-overlay.utils";
import { getExportTransitionLayerDrawStates } from "@/features/export/utils/export-transition-canvas.utils";
import { getPreviewFrameAtTime, getTransitionLayerStyles } from "@/features/preview/utils/previewTimeline";
import { resolvePreviewTransitionOverlay } from "@/features/preview/utils/previewTransitionOverlay";
import type { FootieScene, FootieScript, TransitionEffect } from "@/features/story/types";
import {
  ensureTimelineItems,
  getSceneTimingAtGlobalTime,
  getStoryTotalDuration,
  TRANSITION_CARD_TITLE,
  TRANSITION_EFFECT_OPTIONS,
} from "@/features/story/utils";
import { syncFootieScript } from "@/lib/voiceover";

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function makeScene(id: string, durationMs: number, startMs: number): FootieScene {
  const duration = durationMs / 1000;
  const start = startMs / 1000;
  return {
    id,
    start,
    end: start + duration,
    duration,
    startMs,
    endMs: startMs + durationMs,
    durationMs,
    subtitle: `Caption ${id}`,
    captionMode: "generated",
    image: { url: `https://example.com/${id}.jpg`, scale: 1, x: 0, y: 0, rotation: 0, fitMode: "fit" },
  };
}

function buildStoryWithEffect(effect: TransitionEffect): FootieScript {
  const scenes = [makeScene("a", 4000, 0), makeScene("b", 4000, 4000)];
  const timelineItems = ensureTimelineItems(scenes).map((item) =>
    item.type === "transition"
      ? { ...item, effect, durationMs: 500, label: TRANSITION_CARD_TITLE }
      : item,
  );

  return syncFootieScript({
    title: `Transition QA ${effect}`,
    narration: "Narration for transition QA.",
    totalDuration: 8,
    voiceoverUrl: "blob:voice",
    voiceoverDurationMs: 8000,
    scenes,
    timelineItems,
  });
}

function assertPreviewExportEffectParity(effect: TransitionEffect, progress = 0.5): void {
  const preview = getTransitionLayerStyles(effect, progress);
  const exportLayers = getExportTransitionLayerDrawStates(effect, progress);

  assert.equal(exportLayers.from.opacity, preview.from.opacity ?? 1);
  assert.equal(exportLayers.to.opacity, preview.to.opacity ?? 1);

  const previewFromTx = preview.from.transform?.match(/translateX\(([-\d.]+)%\)/)?.[1];
  const previewToTx = preview.to.transform?.match(/translateX\(([-\d.]+)%\)/)?.[1];
  if (previewFromTx) {
    assert.equal(exportLayers.from.translateXRatio, parseFloat(previewFromTx) / 100);
  }
  if (previewToTx) {
    assert.equal(exportLayers.to.translateXRatio, parseFloat(previewToTx) / 100);
  }

  const previewFromScale = preview.from.transform?.match(/scale\(([\d.]+)\)/)?.[1];
  const previewToScale = preview.to.transform?.match(/scale\(([\d.]+)\)/)?.[1];
  if (previewFromScale) {
    assert.equal(exportLayers.from.scale, parseFloat(previewFromScale));
  }
  if (previewToScale) {
    assert.equal(exportLayers.to.scale, parseFloat(previewToScale));
  }

  const previewFromBlur = preview.from.filter?.match(/blur\(([\d.]+)px\)/)?.[1];
  const previewToBlur = preview.to.filter?.match(/blur\(([\d.]+)px\)/)?.[1];
  if (previewFromBlur) {
    assert.equal(exportLayers.from.blurPx, parseFloat(previewFromBlur));
  }
  if (previewToBlur) {
    assert.equal(exportLayers.to.blurPx, parseFloat(previewToBlur));
  }
}

console.log("transition-qa");

test("editor keeps transition cards visible in timeline", () => {
  const timelineEditor = readSrc("src/features/editor/components/TimelineEditor.tsx");
  const transitionCard = readSrc("src/features/editor/components/TransitionCard.tsx");

  assert.match(timelineEditor, /import TransitionCard/);
  assert.match(timelineEditor, /isTransitionTimelineItem\(item\)/);
  assert.match(timelineEditor, /<TransitionCard/);
  assert.match(transitionCard, /TRANSITION_CARD_TITLE/);
  assert.match(transitionCard, /\{TRANSITION_CARD_TITLE\}/);
});

test("preview never renders transition connector copy", () => {
  const videoPreview = readSrc("src/features/preview/components/VideoPreview.tsx");
  const previewFrame = readSrc("src/features/preview/components/PreviewFrame.tsx");

  assert.doesNotMatch(videoPreview, /TRANSITION_CARD_TITLE/);
  assert.doesNotMatch(videoPreview, /Transition to next scene/);
  assert.doesNotMatch(previewFrame, /TRANSITION_CARD_TITLE/);
  assert.doesNotMatch(previewFrame, /Transition to next scene/);
});

test("export never renders transition connector copy", () => {
  const videoRender = readSrc("src/features/export/services/video-render.service.ts");
  const exportPayload = readSrc("src/features/export/services/export-payload.service.ts");

  assert.doesNotMatch(videoRender, /TRANSITION_CARD_TITLE/);
  assert.doesNotMatch(videoRender, /Transition to next scene/);
  assert.match(exportPayload, /isTransitionVideoContent/);
  assert.equal(isTransitionVideoContent(TRANSITION_CARD_TITLE), true);
  assert.equal(isTransitionVideoContent("Transition to next scene"), true);
});

test("preview playback stays scene-only — no transition segments", () => {
  const script = buildStoryWithEffect("fade");
  const items = script.timelineItems ?? [];

  for (const timeSec of [0, 2, 3.75, 4, 4.2, 7.5]) {
    const frame = getPreviewFrameAtTime(items, script.scenes, timeSec);
    assert.equal(frame.kind, "scene", `expected scene frame at ${timeSec}s`);
  }
});

test("export payload excludes transition connector copy from renderable scenes", () => {
  const payload = buildFootieExportPayload(buildStoryWithEffect("fade"));

  assert.equal(getRenderableScenesFromPayload(payload).length, 2);
  for (const scene of getRenderableScenesFromPayload(payload)) {
    assert.doesNotMatch(scene.displayCaption, /Transition to next scene/i);
    assert.doesNotMatch(scene.subtitle, /Transition to next scene/i);
  }
});

const VISUAL_EFFECTS: TransitionEffect[] = [
  "fade",
  "slide-left",
  "slide-right",
  "zoom-in",
  "zoom-out",
  "blur",
];

for (const effect of VISUAL_EFFECTS) {
  test(`preview overlay resolves for ${effect} during tail window`, () => {
    const script = buildStoryWithEffect(effect);
    const timeline = buildMasterTimeline(script, { mode: "preview" });
    const overlay = resolvePreviewTransitionOverlay(timeline, script.scenes, 3750);

    assert.ok(overlay, `${effect} overlay should be active at 3750ms`);
    assert.equal(overlay.effect, effect);
    assert.ok(overlay.progress > 0 && overlay.progress < 1);
    assertPreviewExportEffectParity(effect, overlay.progress);
  });

  test(`export layer map matches preview for ${effect}`, () => {
    assertPreviewExportEffectParity(effect, 0.25);
    assertPreviewExportEffectParity(effect, 0.75);
  });
}

test("fade crossfade uses complementary opacities", () => {
  const styles = getTransitionLayerStyles("fade", 0.4);
  assert.equal(styles.from.opacity, 0.6);
  assert.equal(styles.to.opacity, 0.4);
});

test("slide-left/right produce opposing motion in preview and export", () => {
  const left = getExportTransitionLayerDrawStates("slide-left", 0.5);
  assert.equal(left.from.translateXRatio, -0.5);
  assert.equal(left.to.translateXRatio, 0.5);

  const right = getExportTransitionLayerDrawStates("slide-right", 0.5);
  assert.equal(right.from.translateXRatio, 0.5);
  assert.equal(right.to.translateXRatio, -0.5);
});

test("zoom-in/out apply scale in preview and export", () => {
  const zoomIn = getExportTransitionLayerDrawStates("zoom-in", 0.5);
  assert.equal(zoomIn.to.scale, 1.04);

  const zoomOut = getExportTransitionLayerDrawStates("zoom-out", 0.5);
  assert.equal(zoomOut.from.scale, 0.96);
});

test("blur effect is defined in preview and export (with fade fallback in export renderer)", () => {
  const blur = getExportTransitionLayerDrawStates("blur", 0.5);
  assert.equal(blur.from.blurPx, 4);
  assert.equal(blur.to.blurPx, 4);

  const exportCanvas = readSrc("src/features/export/utils/export-transition-canvas.utils.ts");
  assert.match(exportCanvas, /drawExportTransitionBackgrounds/);
  assert.match(exportCanvas, /"fade"/);
});

test("subtitles are hidden during preview transitions", () => {
  const videoPreview = readSrc("src/features/preview/components/VideoPreview.tsx");

  assert.match(videoPreview, /hideCaptionsDuringTransition/);
  assert.match(videoPreview, /resolvePreviewTransitionOverlay/);
  assert.match(videoPreview, /showSubtitles = .*!hideCaptionsDuringTransition/);
  assert.match(videoPreview, /showGeneratedCaption = .*!hideCaptionsDuringTransition/);
});

test("subtitles are hidden during export transitions", () => {
  const videoRender = readSrc("src/features/export/services/video-render.service.ts");

  assert.match(videoRender, /if \(transitionOverlay\)/);
  assert.match(videoRender, /return;/);
  assert.match(videoRender, /Hidden during transition overlay/);
});

test("scene timing map is unchanged — total duration ignores transition duration", () => {
  const script = buildStoryWithEffect("fade");

  assert.equal(getStoryTotalDuration(script.scenes), 8);
  assert.equal(getExportTotalDurationSec(buildFootieExportPayload(script)), 8);

  const transition = script.timelineItems?.find((item) => item.type === "transition");
  assert.ok(transition && transition.type === "transition");
  assert.equal(transition.durationMs, 500);
});

test("scene timing authority during transition window stays on scene map", () => {
  const script = buildStoryWithEffect("fade");
  const { scenes } = script;

  const tailOfSceneA = getSceneTimingAtGlobalTime(scenes, 3750);
  const afterBoundary = getSceneTimingAtGlobalTime(scenes, 4100);

  assert.equal(tailOfSceneA?.slot.index, 0);
  assert.equal(tailOfSceneA?.sceneElapsedMs, 3750);
  assert.equal(afterBoundary?.slot.index, 1);
  assert.equal(afterBoundary?.sceneElapsedMs, 100);
});

test("shared overlay resolver is active in preview and export", () => {
  const script = buildStoryWithEffect("slide-left");
  const timeline = buildMasterTimeline(script, { mode: "preview" });
  const previewOverlay = resolvePreviewTransitionOverlay(timeline, script.scenes, 3600);
  const exportOverlay = resolveTimelineTransitionOverlay(timeline, script.scenes, 3600);

  assert.deepEqual(previewOverlay, exportOverlay);
});

test("all supported transition effects are covered by QA", () => {
  const qaEffects = new Set([...VISUAL_EFFECTS, "cut"]);
  for (const option of TRANSITION_EFFECT_OPTIONS) {
    assert.ok(qaEffects.has(option.value), `missing QA coverage for ${option.value}`);
  }
});

console.log("\nAll transition QA checks passed.");
