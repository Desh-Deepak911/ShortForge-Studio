/**
 * Transitions scope lock verification (run: npm run test:transitions-scope).
 * Ensures transition work cannot regress audio/subtitle/timing invariants.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildFootieExportPayload,
  getExportTotalDurationSec,
  getRenderableScenesFromPayload,
} from "@/features/export/services";
import { getPreviewFrameAtTime } from "@/features/preview/utils/previewTimeline";
import { getPreviewSceneTiming } from "@/features/preview/utils/previewSceneTiming";
import { buildMasterTimeline } from "@/features/timeline-intelligence/build-master-timeline";
import type { FootieScene, FootieScript } from "@/features/story/types";
import {
  ensureTimelineItems,
  getSceneTimingAtGlobalTime,
  getStoryTotalDuration,
  resolveStoryDurationSec,
  TRANSITION_CARD_TITLE,
} from "@/features/story/utils";
import { applyVoiceoverChanges, syncFootieScript } from "@/lib/voiceover";

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function makeScene(id: string, durationSec: number): FootieScene {
  return {
    id,
    start: 0,
    end: durationSec,
    duration: durationSec,
    subtitle: `Caption ${id}`,
    captionMode: "generated",
  };
}

function buildStoryWithTransition(): FootieScript {
  const scenes = [makeScene("a", 4), makeScene("b", 4)];
  const timelineItems = ensureTimelineItems(scenes).map((item) =>
    item.type === "transition"
      ? { ...item, effect: "fade" as const, durationMs: 500, label: TRANSITION_CARD_TITLE }
      : item,
  );

  return syncFootieScript({
    title: "Transition scope",
    narration: "Narration for scope lock story.",
    totalDuration: 8,
    voiceoverUrl: "blob:voice",
    voiceoverDurationMs: 8000,
    scenes: [
      { ...scenes[0]!, durationMs: 4000, startMs: 0, endMs: 4000 },
      { ...scenes[1]!, durationMs: 4000, startMs: 4000, endMs: 8000 },
    ],
    timelineItems,
  });
}

console.log("transitions-scope");

test("scope doc and cursor rule exist", () => {
  const doc = readFileSync(join(root, "docs/TRANSITIONS-SCOPE.md"), "utf8");
  const rule = readFileSync(join(root, ".cursor/rules/transitions-visual-only.mdc"), "utf8");

  assert.match(doc, /visual-only/i);
  assert.match(doc, /Do not change/);
  assert.match(doc, /overlay/i);
  assert.match(rule, /getSceneTimingAtGlobalTime/);
});

test("export keeps renderTransitions disabled and scene-only video segments", () => {
  const payload = buildFootieExportPayload(buildStoryWithTransition());

  assert.equal(payload.renderTransitions, false);
  assert.equal(getRenderableScenesFromPayload(payload).length, 2);
  assert.equal(getExportTotalDurationSec(payload), 8);
  assert.ok(
    getRenderableScenesFromPayload(payload).every(
      (scene) => !scene.displayCaption.includes(TRANSITION_CARD_TITLE),
    ),
  );
});

test("total duration ignores transition.durationMs", () => {
  const script = buildStoryWithTransition();
  const transition = script.timelineItems?.find((item) => item.type === "transition");
  assert.ok(transition && transition.type === "transition");
  assert.equal(transition.durationMs, 500);

  assert.equal(getStoryTotalDuration(script.scenes), 8);
  assert.equal(resolveStoryDurationSec(script), 8);
});

test("scene timing map is unchanged by transition metadata", () => {
  const script = buildStoryWithTransition();
  const beforeEndMs = script.scenes[0]!.endMs;
  const afterStartMs = script.scenes[1]!.startMs;

  assert.equal(beforeEndMs, 4000);
  assert.equal(afterStartMs, 4000);
  assert.equal(script.scenes[1]!.startMs, beforeEndMs);
});

test("applyVoiceoverChanges preserves transitions without retiming scenes into transition slots", () => {
  const script = buildStoryWithTransition();
  const next = applyVoiceoverChanges(script, {
    voiceoverUrl: "blob:new",
    voiceoverDurationMs: 6400,
    voiceSettings: { speed: 1.25 },
  });

  assert.equal(next.scenes[0]?.durationMs, 3200);
  assert.equal(next.scenes[1]?.durationMs, 3200);
  assert.equal(next.scenes[0]?.subtitle, "Caption a");

  const transition = next.timelineItems?.find((item) => item.type === "transition");
  assert.ok(transition && transition.type === "transition");
  assert.equal(transition.effect, "fade");
  assert.equal(transition.durationMs, 500);
});

test("subtitle and scene authority stays on scene timing map during transition window", () => {
  const script = buildStoryWithTransition();
  const { scenes } = script;

  const atBoundaryMs = 4000;
  const duringTransitionMs = 4200;

  const timingAtBoundary = getSceneTimingAtGlobalTime(scenes, atBoundaryMs);
  const timingDuringTransition = getSceneTimingAtGlobalTime(scenes, duringTransitionMs);

  assert.equal(timingAtBoundary?.slot.index, 1);
  assert.equal(timingDuringTransition?.slot.index, 1);

  const masterTimeline = buildMasterTimeline(script, {
    mode: "preview",
    useVoiceoverRefit: true,
  });

  const previewTiming = getPreviewSceneTiming({
    scenes,
    sceneIndex: 0,
    elapsedSec: duringTransitionMs / 1000,
    playbackMode: "narration",
    isPlaying: true,
    browserSceneStartedAtMs: null,
    previewClockMs: 0,
    masterTimeline,
    currentTimeMs: duringTransitionMs,
  });

  assert.equal(previewTiming.activeSceneIndex, 1);
  assert.equal(previewTiming.sceneDurationMs, 4000);
  assert.equal(previewTiming.sceneElapsedMs, 200);
});

test("preview resolves scene frames only — no transition playback segments", () => {
  const script = buildStoryWithTransition();
  const timelineItems = script.timelineItems ?? [];
  const frameAtBoundary = getPreviewFrameAtTime(timelineItems, script.scenes, 4.0);
  const frameDuringOldWindow = getPreviewFrameAtTime(timelineItems, script.scenes, 4.2);

  assert.equal(frameAtBoundary.kind, "scene");
  assert.equal(frameDuringOldWindow.kind, "scene");
  assert.equal(frameDuringOldWindow.sceneIndex, 1);

  const videoRender = readSrc("src/features/export/services/video-render.service.ts");
  assert.match(videoRender, /getRenderableScenesFromPayload/);
  assert.match(videoRender, /resolveTimelineTransitionOverlay/);
  assert.match(videoRender, /drawExportTransitionBackgrounds/);
  assert.match(videoRender, /resolveExportFrameTiming/);
  assert.doesNotMatch(videoRender, /TRANSITION_CARD_TITLE/);
});

test("preview never shows transition connector copy", () => {
  const videoPreview = readSrc("src/features/preview/components/VideoPreview.tsx");
  assert.doesNotMatch(videoPreview, /TRANSITION_CARD_TITLE/);
  assert.doesNotMatch(videoPreview, /getTransitionEffectLabel/);
  assert.doesNotMatch(videoPreview, /getTransitionDurationLabel/);
  assert.doesNotMatch(videoPreview, /isPreviewTransitionFrame/);
});

test("export excludes transition connector copy from video content", () => {
  const exportPayload = readSrc("src/features/export/services/export-payload.service.ts");
  assert.match(exportPayload, /isTransitionVideoContent/);
  assert.match(exportPayload, /TRANSITION_CARD_TITLE/);
});

test("voiceover and subtitle modules are outside transition render scope", () => {
  const hook = readSrc("src/hooks/useStoryVoiceoverApply.ts");
  const subtitleTiming = readSrc("src/features/story/utils/subtitle-timing.utils.ts");
  const previewTiming = readSrc("src/features/preview/utils/previewSceneTiming.ts");

  assert.doesNotMatch(hook, /transition/i);
  assert.match(subtitleTiming, /getSceneTimingAtGlobalTime/);
  assert.match(previewTiming, /resolveTimelineSceneFrame|resolvePreviewPlaybackState/);
  assert.doesNotMatch(previewTiming, /getSceneTimingAtGlobalTime/);
  assert.doesNotMatch(subtitleTiming, /transition/i);
});

console.log("\nAll transitions scope checks passed.");
