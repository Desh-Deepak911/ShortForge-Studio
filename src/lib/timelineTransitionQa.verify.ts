/**
 * Timeline Intelligence — Phase 3C Transition Scheduler QA
 * Run: npm run test:timeline-transition-qa
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import { getExportTransitionLayerDrawStatesFromTransitionState } from "@/features/export/utils/export-transition-canvas.utils";
import { buildPreviewMasterTimeline } from "@/features/preview/utils/preview-master-timeline.utils";
import { resolvePreviewTransitionOverlay } from "@/features/preview/utils/previewTransitionOverlay";
import {
  transitionStateToPreviewLayerStyles,
  type TransitionState,
} from "@/features/timeline-intelligence/resolve-transition-state.utils";
import { resolveTimelineTransitionOverlay } from "@/features/timeline-intelligence/resolve-timeline-transition-overlay.utils";
import type { MasterTimeline, TransitionTimelineEvent } from "@/features/timeline-intelligence/timeline.types";
import { getTimelineTrackByType } from "@/features/timeline-intelligence/timeline-utils";
import type { FootieScene, FootieScript, TransitionEffect } from "@/features/story/types";
import {
  ensureTimelineItems,
  getSceneTimingAtGlobalTime,
  recalculateSceneTimings,
  TRANSITION_CARD_TITLE,
} from "@/features/story/utils";
import {
  getTransitionProgress,
  resolveSceneTransitionOverlay,
} from "@/features/story/utils/transition-overlay.utils";
import { syncFootieScript } from "@/lib/voiceover";

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${message}`);
  }
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function makeScene(
  id: string,
  durationSec: number,
  options: { startSec?: number } = {},
): FootieScene {
  const startSec = options.startSec ?? 0;
  const durationMs = durationSec * 1000;
  const startMs = startSec * 1000;

  return {
    id,
    start: startSec,
    end: startSec + durationSec,
    duration: durationSec,
    startMs,
    endMs: startMs + durationMs,
    durationMs,
    durationSource: "manual",
    subtitle: `Caption ${id}`,
    captionMode: "generated",
    subtitleText: `Subtitle for ${id}.`,
    narration: `Narration for ${id}.`,
    image: {
      url: `https://example.com/${id}.jpg`,
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      fitMode: "fit",
    },
  };
}

function buildStoryWithTransitions(
  scenes: FootieScene[],
  transitions: Array<{
    fromSceneId: string;
    toSceneId: string;
    effect: TransitionEffect;
    durationMs: number;
  }>,
  options: { voiceoverDurationMs?: number } = {},
): FootieScript {
  const timedScenes = recalculateSceneTimings(scenes);
  const timelineItems = ensureTimelineItems(timedScenes).map((item) => {
    if (item.type !== "transition") {
      return item;
    }

    const match = transitions.find(
      (transition) =>
        transition.fromSceneId === item.fromSceneId &&
        transition.toSceneId === item.toSceneId,
    );

    if (!match) {
      return item;
    }

    return {
      ...item,
      effect: match.effect,
      durationMs: match.durationMs,
      label: TRANSITION_CARD_TITLE,
    };
  });

  const totalDuration = timedScenes.reduce((sum, scene) => sum + scene.duration, 0);

  return syncFootieScript({
    title: "Transition Scheduler QA",
    narration: timedScenes.map((scene) => scene.narration).join(" "),
    totalDuration,
    scenes: timedScenes,
    timelineItems,
    ...(options.voiceoverDurationMs != null
      ? {
          voiceoverUrl: "blob:qa-voiceover",
          voiceoverDurationMs: options.voiceoverDurationMs,
        }
      : {}),
  });
}

function buildTimelines(story: FootieScript): {
  previewTimeline: MasterTimeline;
  exportTimeline: MasterTimeline;
} {
  const previewTimeline = buildPreviewMasterTimeline(story)!;
  const exportTimeline = prepareStoryForExport(story).masterTimeline;
  return { previewTimeline, exportTimeline };
}

function getTransitionEvents(timeline: MasterTimeline): TransitionTimelineEvent[] {
  const track = getTimelineTrackByType(timeline.tracks, "transition");
  return (track?.events ?? []) as TransitionTimelineEvent[];
}

function assertTransitionDiagnosticsClean(timeline: MasterTimeline, label: string): void {
  assert.equal(
    timeline.diagnostics.transitionOverlapCollisionCount,
    0,
    `${label}: overlap collisions`,
  );
  assert.equal(
    timeline.diagnostics.transitionSceneVisibilityViolationCount,
    0,
    `${label}: visibility violations`,
  );
  assert.equal(
    timeline.diagnostics.transitionOutOfBoundsCount,
    0,
    `${label}: out-of-bounds transitions`,
  );
}

function assertNoNegativeVisibility(state: TransitionState, label: string): void {
  assert.ok(state.opacityFrom >= 0 && state.opacityFrom <= 1, `${label}: opacityFrom in [0,1]`);
  assert.ok(state.opacityTo >= 0 && state.opacityTo <= 1, `${label}: opacityTo in [0,1]`);
}

function assertNoBlackFrame(
  state: TransitionState,
  effect: TransitionEffect,
  label: string,
): void {
  assertNoNegativeVisibility(state, label);
  assert.ok(
    Math.max(state.opacityFrom, state.opacityTo) > 0,
    `${label}: at least one scene layer visible`,
  );

  if (effect === "fade" && state.isActive && state.progress > 0 && state.progress < 1) {
    assert.ok(
      state.opacityFrom + state.opacityTo >= 0.99,
      `${label}: fade crossfade preserves combined visibility`,
    );
  }

  if (effect === "slide-left" || effect === "slide-right") {
    assert.equal(state.opacityFrom, 1, `${label}: slide from opacity`);
    assert.equal(state.opacityTo, 1, `${label}: slide to opacity`);
  }
}

function assertPreviewExportLayerParity(
  effect: TransitionEffect,
  state: TransitionState,
  label: string,
): void {
  const preview = transitionStateToPreviewLayerStyles(effect, state);
  const exportLayers = getExportTransitionLayerDrawStatesFromTransitionState(effect, state);

  assert.equal(exportLayers.from.opacity, preview.from.opacity ?? 1, `${label}: from opacity`);
  assert.equal(exportLayers.to.opacity, preview.to.opacity ?? 1, `${label}: to opacity`);

  const previewFromTx = preview.from.transform?.match(/translateX\(([-\d.]+)%\)/)?.[1];
  const previewToTx = preview.to.transform?.match(/translateX\(([-\d.]+)%\)/)?.[1];
  if (previewFromTx) {
    assert.equal(
      exportLayers.from.translateXRatio,
      parseFloat(previewFromTx) / 100,
      `${label}: from translateX`,
    );
  }
  if (previewToTx) {
    assert.equal(
      exportLayers.to.translateXRatio,
      parseFloat(previewToTx) / 100,
      `${label}: to translateX`,
    );
  }

  const previewFromScale = preview.from.transform?.match(/scale\(([\d.]+)\)/)?.[1];
  const previewToScale = preview.to.transform?.match(/scale\(([\d.]+)\)/)?.[1];
  if (previewFromScale) {
    assert.equal(exportLayers.from.scale, parseFloat(previewFromScale), `${label}: from scale`);
  }
  if (previewToScale) {
    assert.equal(exportLayers.to.scale, parseFloat(previewToScale), `${label}: to scale`);
  }
}

function assertNoLegacyDrift(
  story: FootieScript,
  timeline: MasterTimeline,
  timeMs: number,
  label: string,
): void {
  const timing = getSceneTimingAtGlobalTime(story.scenes, timeMs);
  const timelineOverlay = resolveTimelineTransitionOverlay(timeline, story.scenes, timeMs);

  if (!timing) {
    assert.equal(timelineOverlay, null, `${label} @${timeMs}ms: no timing outside story`);
    return;
  }

  const legacyOverlay = resolveSceneTransitionOverlay(
    story.scenes,
    story.timelineItems ?? [],
    timing.slot.index,
    timing.sceneElapsedMs,
    timing.sceneDurationMs,
  );

  if (!legacyOverlay && !timelineOverlay) {
    return;
  }

  assert.ok(legacyOverlay, `${label} @${timeMs}ms: legacy overlay expected`);
  assert.ok(timelineOverlay, `${label} @${timeMs}ms: timeline overlay expected`);
  assert.equal(timelineOverlay!.effect, legacyOverlay!.effect, `${label} @${timeMs}ms: effect`);
  assert.equal(timelineOverlay!.progress, legacyOverlay!.progress, `${label} @${timeMs}ms: progress`);
  assert.equal(
    timelineOverlay!.fromScene.id,
    legacyOverlay!.fromScene.id,
    `${label} @${timeMs}ms: from scene`,
  );
  assert.equal(
    timelineOverlay!.toScene.id,
    legacyOverlay!.toScene.id,
    `${label} @${timeMs}ms: to scene`,
  );

  const transitionItem = story.timelineItems?.find(
    (item) => item.type === "transition" && item.fromSceneId === legacyOverlay!.fromScene.id,
  );
  const transitionDurationMs =
    transitionItem?.type === "transition" ? transitionItem.durationMs : undefined;

  const expectedProgress = getTransitionProgress({
    sceneElapsedMs: timing.sceneElapsedMs,
    sceneDurationMs: timing.sceneDurationMs,
    transitionDurationMs,
  });

  assert.equal(timelineOverlay!.progress, expectedProgress, `${label} @${timeMs}ms: scheduler drift`);
  const event = timelineOverlay!.event;
  assert.ok(timeMs >= event.startMs && timeMs < event.endMs, `${label} @${timeMs}ms: inside event window`);
}

function sampleTransitionWindow(
  event: TransitionTimelineEvent,
  sampleCount: number,
): number[] {
  const samples: number[] = [];
  const span = event.endMs - event.startMs;

  for (let index = 0; index < sampleCount; index += 1) {
    const offset = Math.floor((span * index) / Math.max(1, sampleCount - 1));
    samples.push(event.startMs + Math.min(offset, span - 1));
  }

  return samples;
}

function assertPreviewExportTransitionParity(
  story: FootieScript,
  previewTimeline: MasterTimeline,
  exportTimeline: MasterTimeline,
  timeMs: number,
  label: string,
): void {
  const previewOverlay = resolvePreviewTransitionOverlay(previewTimeline, story.scenes, timeMs);
  const exportOverlay = resolveTimelineTransitionOverlay(exportTimeline, story.scenes, timeMs);

  if (!previewOverlay && !exportOverlay) {
    return;
  }

  assert.ok(previewOverlay, `${label} @${timeMs}ms: preview overlay`);
  assert.ok(exportOverlay, `${label} @${timeMs}ms: export overlay`);
  assert.equal(previewOverlay!.effect, exportOverlay!.effect, `${label} @${timeMs}ms: effect`);
  assert.equal(
    previewOverlay!.fromScene.id,
    exportOverlay!.fromScene.id,
    `${label} @${timeMs}ms: from scene`,
  );
  assert.equal(
    previewOverlay!.toScene.id,
    exportOverlay!.toScene.id,
    `${label} @${timeMs}ms: to scene`,
  );
  assert.equal(previewOverlay!.progress, exportOverlay!.progress, `${label} @${timeMs}ms: progress`);
  assert.equal(
    previewOverlay!.transitionState.opacityFrom,
    exportOverlay!.transitionState.opacityFrom,
    `${label} @${timeMs}ms: opacityFrom`,
  );
  assert.equal(
    previewOverlay!.transitionState.opacityTo,
    exportOverlay!.transitionState.opacityTo,
    `${label} @${timeMs}ms: opacityTo`,
  );
  assertPreviewExportLayerParity(
    previewOverlay!.effect,
    previewOverlay!.transitionState,
    `${label} @${timeMs}ms: preview/export layers`,
  );
}

function assertPreviewExportSamples(
  story: FootieScript,
  previewTimeline: MasterTimeline,
  exportTimeline: MasterTimeline,
  sampleCount: number,
  label: string,
): void {
  const renderMs = previewTimeline.renderDurationMs;
  for (let index = 0; index < sampleCount; index += 1) {
    const timeMs = Math.floor((renderMs * index) / Math.max(1, sampleCount - 1));
    assertPreviewExportTransitionParity(story, previewTimeline, exportTimeline, timeMs, label);
  }
  assertPreviewExportTransitionParity(
    story,
    previewTimeline,
    exportTimeline,
    renderMs - 1,
    `${label} tail`,
  );
}

console.log("timeline-transition-qa");

test("1. no transition — empty track, no overlay drift", () => {
  const story = buildStoryWithTransitions([makeScene("s1", 8)], []);
  const { previewTimeline } = buildTimelines(story);

  assert.equal(story.scenes.length, 1);
  assert.equal(getTransitionEvents(previewTimeline).length, 0);
  assertTransitionDiagnosticsClean(previewTimeline, "no transition");

  for (const timeMs of [0, 2500, 4999, 7500, 7999]) {
    assert.equal(
      resolveTimelineTransitionOverlay(previewTimeline, story.scenes, timeMs),
      null,
      `no overlay @${timeMs}ms`,
    );
    assertNoLegacyDrift(story, previewTimeline, timeMs, "no transition");
  }
});

test("2. fade transition — tail window, visibility, no drift", () => {
  const story = buildStoryWithTransitions(
    [makeScene("s1", 5), makeScene("s2", 5, { startSec: 5 })],
    [{ fromSceneId: "s1", toSceneId: "s2", effect: "fade", durationMs: 800 }],
  );
  const { previewTimeline } = buildTimelines(story);
  const [event] = getTransitionEvents(previewTimeline);

  assert.ok(event, "fade transition scheduled");
  assert.equal(event!.metadata.transitionType, "fade");
  assert.equal(event!.endMs, 5_000);
  assert.equal(event!.startMs, 4_200);
  assertTransitionDiagnosticsClean(previewTimeline, "fade");

  for (const timeMs of sampleTransitionWindow(event!, 8)) {
    const overlay = resolveTimelineTransitionOverlay(previewTimeline, story.scenes, timeMs);
    assert.ok(overlay, `fade overlay @${timeMs}ms`);
    assert.equal(overlay!.effect, "fade");
    assert.ok(overlay!.transitionState.isActive);
    assert.ok(overlay!.transitionState.shouldRenderBothScenes);
    assertNoBlackFrame(overlay!.transitionState, "fade", `fade @${timeMs}ms`);
    assertNoLegacyDrift(story, previewTimeline, timeMs, "fade");
    assertPreviewExportLayerParity("fade", overlay!.transitionState, `fade @${timeMs}ms`);
  }

  assert.equal(resolveTimelineTransitionOverlay(previewTimeline, story.scenes, 3_000), null);
});

test("3. zoom and slide transitions — scheduler + visibility", () => {
  const story = buildStoryWithTransitions(
    [
      makeScene("s1", 4),
      makeScene("s2", 4, { startSec: 4 }),
      makeScene("s3", 4, { startSec: 8 }),
    ],
    [
      { fromSceneId: "s1", toSceneId: "s2", effect: "slide-left", durationMs: 600 },
      { fromSceneId: "s2", toSceneId: "s3", effect: "zoom-in", durationMs: 700 },
    ],
  );
  const { previewTimeline } = buildTimelines(story);
  const events = getTransitionEvents(previewTimeline);

  assert.equal(events.length, 2);
  assertTransitionDiagnosticsClean(previewTimeline, "zoom/slide");

  const slideEvent = events.find((entry) => entry.metadata.transitionType === "slide-left")!;
  const zoomEvent = events.find((entry) => entry.metadata.transitionType === "zoom-in")!;

  for (const timeMs of sampleTransitionWindow(slideEvent, 6)) {
    const overlay = resolveTimelineTransitionOverlay(previewTimeline, story.scenes, timeMs)!;
    assertNoBlackFrame(overlay.transitionState, "slide-left", `slide @${timeMs}ms`);
    assertNoLegacyDrift(story, previewTimeline, timeMs, "slide-left");
  }

  for (const timeMs of sampleTransitionWindow(zoomEvent, 6)) {
    const overlay = resolveTimelineTransitionOverlay(previewTimeline, story.scenes, timeMs)!;
    assertNoBlackFrame(overlay.transitionState, "zoom-in", `zoom @${timeMs}ms`);
    assertNoLegacyDrift(story, previewTimeline, timeMs, "zoom-in");
  }
});

test("4. short scene with transition — clamped overlay, no black frames", () => {
  const story = buildStoryWithTransitions(
    [makeScene("s1", 2), makeScene("s2", 4, { startSec: 2 })],
    [{ fromSceneId: "s1", toSceneId: "s2", effect: "fade", durationMs: 800 }],
  );
  const { previewTimeline } = buildTimelines(story);
  const [event] = getTransitionEvents(previewTimeline);

  assert.ok(event);
  assert.equal(event!.startMs, 1_200, "short scene clamps overlay to 40% tail");
  assert.equal(event!.endMs, 2_000);
  assertTransitionDiagnosticsClean(previewTimeline, "short scene");

  for (const timeMs of sampleTransitionWindow(event!, 5)) {
    const overlay = resolveTimelineTransitionOverlay(previewTimeline, story.scenes, timeMs)!;
    assertNoBlackFrame(overlay.transitionState, "fade", `short scene @${timeMs}ms`);
    assertNoLegacyDrift(story, previewTimeline, timeMs, "short scene");
  }
});

test("5. final scene — no transition after last outgoing scene", () => {
  const story = buildStoryWithTransitions(
    [
      makeScene("s1", 4),
      makeScene("s2", 4, { startSec: 4 }),
      makeScene("s3", 4, { startSec: 8 }),
    ],
    [
      { fromSceneId: "s1", toSceneId: "s2", effect: "fade", durationMs: 500 },
      { fromSceneId: "s2", toSceneId: "s3", effect: "fade", durationMs: 500 },
    ],
  );
  const { previewTimeline } = buildTimelines(story);
  const events = getTransitionEvents(previewTimeline);

  assert.equal(events.length, 2);
  assert.ok(!events.some((event) => event.metadata.fromSceneId === "s3"), "no transition leaving final scene");

  for (const timeMs of [8_000, 9_000, 10_500, 11_999]) {
    assert.equal(
      resolveTimelineTransitionOverlay(previewTimeline, story.scenes, timeMs),
      null,
      `final scene body @${timeMs}ms`,
    );
  }

  const lastEvent = events.find((event) => event.metadata.fromSceneId === "s2")!;
  for (const timeMs of sampleTransitionWindow(lastEvent, 4)) {
    const overlay = resolveTimelineTransitionOverlay(previewTimeline, story.scenes, timeMs)!;
    assertNoBlackFrame(overlay.transitionState, "fade", `into final scene @${timeMs}ms`);
  }
});

test("6. 60s+ video — multi-scene transitions stay in bounds", () => {
  const sceneCount = 12;
  const sceneDurationSec = 6;
  const scenes = Array.from({ length: sceneCount }, (_, index) =>
    makeScene(`s${index + 1}`, sceneDurationSec, { startSec: index * sceneDurationSec }),
  );
  const transitions = Array.from({ length: sceneCount - 1 }, (_, index) => ({
    fromSceneId: `s${index + 1}`,
    toSceneId: `s${index + 2}`,
    effect: (index % 2 === 0 ? "fade" : "slide-right") as TransitionEffect,
    durationMs: 500,
  }));

  const story = buildStoryWithTransitions(scenes, transitions, { voiceoverDurationMs: 72_000 });
  const { previewTimeline, exportTimeline } = buildTimelines(story);
  const events = getTransitionEvents(previewTimeline);

  assert.equal(events.length, sceneCount - 1);
  assert.ok(previewTimeline.renderDurationMs >= 72_000, "60s+ render span");
  assertTransitionDiagnosticsClean(previewTimeline, "60s+ preview");
  assertTransitionDiagnosticsClean(exportTimeline, "60s+ export");

  for (const event of events) {
    assert.ok(event.startMs < event.endMs, `${event.id}: positive duration`);
    assert.ok(event.endMs <= event.metadata.endMs, `${event.id}: ends within outgoing scene`);
    for (const timeMs of sampleTransitionWindow(event, 3)) {
      const overlay = resolveTimelineTransitionOverlay(previewTimeline, story.scenes, timeMs)!;
      assertNoBlackFrame(
        overlay.transitionState,
        overlay.effect,
        `60s+ ${overlay.effect} @${timeMs}ms`,
      );
      assertNoLegacyDrift(story, previewTimeline, timeMs, "60s+");
    }
  }
});

test("7. preview/export comparison — shared resolver parity across samples", () => {
  const story = buildStoryWithTransitions(
    [
      makeScene("s1", 6),
      makeScene("s2", 6, { startSec: 6 }),
      makeScene("s3", 6, { startSec: 12 }),
    ],
    [
      { fromSceneId: "s1", toSceneId: "s2", effect: "fade", durationMs: 600 },
      { fromSceneId: "s2", toSceneId: "s3", effect: "zoom-out", durationMs: 700 },
    ],
    { voiceoverDurationMs: 18_000 },
  );

  const { previewTimeline, exportTimeline } = buildTimelines(story);
  assertTransitionDiagnosticsClean(previewTimeline, "preview/export preview");
  assertTransitionDiagnosticsClean(exportTimeline, "preview/export export");
  assertPreviewExportSamples(story, previewTimeline, exportTimeline, 24, "preview/export comparison");

  for (const event of getTransitionEvents(previewTimeline)) {
    for (const timeMs of sampleTransitionWindow(event, 5)) {
      assertPreviewExportTransitionParity(
        story,
        previewTimeline,
        exportTimeline,
        timeMs,
        "transition window parity",
      );
    }
  }
});

test("structural: preview/export wired to timeline transition resolver", () => {
  const previewFrame = readSrc("src/features/preview/components/PreviewFrame.tsx");
  const videoPreview = readSrc("src/features/preview/components/VideoPreview.tsx");
  const videoRender = readSrc("src/features/export/services/video-render.service.ts");
  const exportCanvas = readSrc("src/features/export/utils/export-transition-canvas.utils.ts");
  const overlayUtils = readSrc(
    "src/features/timeline-intelligence/resolve-timeline-transition-overlay.utils.ts",
  );

  assert.match(previewFrame, /transitionStateToPreviewLayerStyles/);
  assert.match(videoPreview, /resolvePreviewTransitionOverlay/);
  assert.match(videoRender, /resolveTimelineTransitionOverlay/);
  assert.match(exportCanvas, /getExportTransitionLayerDrawStatesFromTransitionState/);
  assert.match(overlayUtils, /getActiveTransitionAtTime/);
  assert.match(overlayUtils, /resolveTransitionState/);
  assert.doesNotMatch(videoRender, /resolveSceneTransitionOverlay/);
});

const total = passed + failures.length;

console.log(`\nTimeline Transition QA: ${passed}/${total} passed`);

if (failures.length > 0) {
  console.log("\nFailing cases:");
  for (const failure of failures) {
    console.log(`  - ${failure}`);
  }
  console.log("\nNOT READY for Timeline Optimizer\n");
  process.exit(1);
}

console.log("\nREADY for Timeline Optimizer\n");
