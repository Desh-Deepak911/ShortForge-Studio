/**
 * Timeline Intelligence — Phase 3B Image Motion QA
 * Run: npm run test:timeline-image-motion-qa
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import { buildPreviewMasterTimeline } from "@/features/preview/utils/preview-master-timeline.utils";
import { resolvePreviewTimelineImageMotion } from "@/features/preview/utils/previewSceneTiming";
import {
  IMAGE_MOTION_DEFAULT_PAN_TRAVEL_PCT,
  resolveImageMotionPreset,
} from "@/features/timeline-intelligence/image-motion-presets.utils";
import {
  resolveImageMotionSceneBaseTransform,
  resolveSceneImageMotionTransformState,
  type ImageMotionTransformState,
} from "@/features/timeline-intelligence/resolve-image-motion-transform.utils";
import type {
  ImageMotionTimelineEvent,
  MasterTimeline,
} from "@/features/timeline-intelligence/timeline.types";
import { getImageMotionEventForScene } from "@/features/timeline-intelligence/timeline-playback.utils";
import { getTimelineTrackByType } from "@/features/timeline-intelligence/timeline-utils";
import type { FootieScene, FootieScript, SceneImage, SceneImageMotionType } from "@/features/story/types";
import {
  getSceneImage,
  normalizeSceneImageMotion,
  recalculateSceneTimings,
  resolveSceneImageMotionScale,
  resolveSceneImageTransformForFrame,
} from "@/features/story/utils";
import { serializeEditorStateForDraft } from "@/features/drafts";
import { syncFootieScript } from "@/lib/voiceover";

const FRAME_WIDTH = 1080;
const FRAME_HEIGHT = 1920;

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

function makeSceneImage(
  motionType: SceneImageMotionType,
  transform: Partial<Pick<SceneImage, "scale" | "x" | "y" | "fitMode" | "rotation">> = {},
): SceneImage {
  return {
    url: "https://example.com/scene.jpg",
    scale: transform.scale ?? 1.15,
    x: transform.x ?? 24,
    y: transform.y ?? -18,
    rotation: transform.rotation ?? 0,
    fitMode: transform.fitMode ?? "fill",
    imageMotion: {
      type: motionType,
      intensity: "medium",
    },
  };
}

function makeScene(
  id: string,
  durationSec: number,
  options: {
    startSec?: number;
    image?: SceneImage;
  } = {},
): FootieScene {
  const startSec = options.startSec ?? 0;
  const durationMs = durationSec * 1000;
  const startMs = startSec * 1000;
  const subtitleText = `Subtitle for scene ${id}.`;

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
    captionMode: "subtitles",
    subtitleText,
    subtitleEffect: "fade-up",
    narration: subtitleText,
    ...(options.image ? { image: options.image } : {}),
  };
}

function buildStory(
  scenes: FootieScene[],
  options: { voiceoverDurationMs?: number } = {},
): FootieScript {
  const timedScenes = recalculateSceneTimings(scenes);
  const totalDuration = timedScenes.reduce((sum, scene) => sum + scene.duration, 0);

  return syncFootieScript({
    title: "Image Motion QA",
    narration: timedScenes.map((scene) => scene.narration).join(" "),
    totalDuration,
    scenes: timedScenes,
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
  const exportPreflight = prepareStoryForExport(story);
  const exportTimeline = exportPreflight.masterTimeline;

  return { previewTimeline, exportTimeline };
}

function getImageMotionEvents(timeline: MasterTimeline): ImageMotionTimelineEvent[] {
  const track = getTimelineTrackByType(timeline.tracks, "image-motion");
  return (track?.events ?? []) as ImageMotionTimelineEvent[];
}

function resolveMotionState(
  masterTimeline: MasterTimeline,
  scene: FootieScene,
  timeMs: number,
  frameWidth = FRAME_WIDTH,
  frameHeight = FRAME_HEIGHT,
): ImageMotionTransformState | null {
  const sceneImage = getSceneImage(scene);
  if (!sceneImage) {
    return null;
  }

  const timelineInput = resolvePreviewTimelineImageMotion(masterTimeline, scene, timeMs);
  return resolveSceneImageMotionTransformState(
    sceneImage,
    timelineInput,
    frameWidth,
    frameHeight,
  );
}

function resolveBaseTransform(scene: FootieScene, frameWidth = FRAME_WIDTH, frameHeight = FRAME_HEIGHT) {
  const sceneImage = getSceneImage(scene)!;
  return resolveImageMotionSceneBaseTransform(sceneImage, frameWidth, frameHeight);
}

function assertPreviewExportMotionParity(
  story: FootieScript,
  previewTimeline: MasterTimeline,
  exportTimeline: MasterTimeline,
  timeMs: number,
  label: string,
): void {
  const previewFrame = resolvePreviewPlaybackFrame(previewTimeline, story.scenes, timeMs);
  const exportFrame = resolvePreviewPlaybackFrame(exportTimeline, story.scenes, timeMs);

  assert.equal(
    previewFrame.sceneIndex,
    exportFrame.sceneIndex,
    `${label} @${timeMs}ms: scene index parity`,
  );

  const previewMotion = resolveMotionState(previewTimeline, previewFrame.scene, timeMs);
  const exportMotion = resolveMotionState(exportTimeline, exportFrame.scene, timeMs);

  if (!previewMotion && !exportMotion) {
    return;
  }

  assert.ok(previewMotion, `${label} @${timeMs}ms: preview motion state`);
  assert.ok(exportMotion, `${label} @${timeMs}ms: export motion state`);
  assert.equal(previewMotion!.scale, exportMotion!.scale, `${label} @${timeMs}ms: scale`);
  assert.equal(
    previewMotion!.translateX,
    exportMotion!.translateX,
    `${label} @${timeMs}ms: translateX`,
  );
  assert.equal(
    previewMotion!.translateY,
    exportMotion!.translateY,
    `${label} @${timeMs}ms: translateY`,
  );
  assert.equal(previewMotion!.progress, exportMotion!.progress, `${label} @${timeMs}ms: progress`);
  assert.equal(
    previewMotion!.transform,
    exportMotion!.transform,
    `${label} @${timeMs}ms: transform`,
  );
}

function resolvePreviewPlaybackFrame(
  masterTimeline: MasterTimeline,
  scenes: FootieScene[],
  timeMs: number,
): { scene: FootieScene; sceneIndex: number } {
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const track = getTimelineTrackByType(masterTimeline.tracks, "scene");
  const sceneEvents = track?.events ?? [];

  for (const event of sceneEvents) {
    if (timeMs >= event.startMs && timeMs < event.endMs) {
      const sceneId = event.metadata.sceneId;
      const sceneIndex = event.metadata.sceneIndex;
      return {
        scene: sceneById.get(sceneId) ?? scenes[sceneIndex] ?? scenes[0]!,
        sceneIndex,
      };
    }
  }

  return { scene: scenes[0]!, sceneIndex: 0 };
}

function assertNoCropPositionRegression(
  scene: FootieScene,
  state: ImageMotionTransformState,
  progress: number,
  label: string,
): void {
  const base = resolveBaseTransform(scene);
  const sceneImage = getSceneImage(scene)!;
  const resolved = resolveSceneImageTransformForFrame(sceneImage, FRAME_WIDTH, FRAME_HEIGHT);

  assert.equal(resolved.scale, base.scale, `${label}: fit/fill scale preserved in base`);
  assert.equal(resolved.x, base.translateX, `${label}: fit/fill x preserved in base`);
  assert.equal(resolved.y, base.translateY, `${label}: fit/fill y preserved in base`);

  if (progress === 0) {
    assert.equal(state.scale, base.scale, `${label}: no motion delta at progress 0`);
    assert.equal(state.translateX, base.translateX, `${label}: x unchanged at progress 0`);
    assert.equal(state.translateY, base.translateY, `${label}: y unchanged at progress 0`);
  }
}

function assertPreviewExportSamples(
  story: FootieScript,
  previewTimeline: MasterTimeline,
  exportTimeline: MasterTimeline,
  sampleCount: number,
  label: string,
): void {
  const step = Math.max(1, Math.floor(previewTimeline.renderDurationMs / sampleCount));
  for (let timeMs = 0; timeMs < previewTimeline.renderDurationMs; timeMs += step) {
    assertPreviewExportMotionParity(story, previewTimeline, exportTimeline, timeMs, label);
  }
  assertPreviewExportMotionParity(
    story,
    previewTimeline,
    exportTimeline,
    previewTimeline.renderDurationMs - 1,
    `${label} tail`,
  );
}

console.log("timeline-image-motion-qa");

test("1. static image — no motion event, framing stays fixed", () => {
  const image = makeSceneImage("none");
  const story = buildStory([makeScene("s1", 6, { image })]);
  const { previewTimeline, exportTimeline } = buildTimelines(story);

  assert.equal(getImageMotionEvents(previewTimeline).length, 0, "static/none skips motion track");
  assert.equal(getImageMotionEvents(exportTimeline).length, 0);

  const scene = story.scenes[0]!;
  const base = resolveBaseTransform(scene);

  for (const timeMs of [0, 1500, 3000, 5999]) {
    assert.equal(resolveMotionState(previewTimeline, scene, timeMs), null);
    assert.equal(resolveMotionState(exportTimeline, scene, timeMs), null);
    assert.equal(base.scale, 1.15);
    assert.equal(base.translateX, 24);
    assert.equal(base.translateY, -18);
  }
});

test("2. slow zoom in — scale increases, position stable at start", () => {
  const image = makeSceneImage("zoom-in");
  const story = buildStory([makeScene("s1", 5, { image })]);
  const { previewTimeline } = buildTimelines(story);
  const scene = story.scenes[0]!;
  const event = getImageMotionEventForScene(previewTimeline, "s1")!;

  assert.equal(event.metadata.motionType, "slow-zoom-in");
  assert.equal(event.metadata.peakScale, 1.1);

  const atStart = resolveMotionState(previewTimeline, scene, 0)!;
  const atMid = resolveMotionState(previewTimeline, scene, 2500)!;
  const atEnd = resolveMotionState(previewTimeline, scene, 5000)!;
  const legacyScale = resolveSceneImageMotionScale(image.imageMotion, 0.5);

  assertNoCropPositionRegression(scene, atStart, 0, "slow zoom in start");
  assert.equal(atStart.translateX, atMid.translateX, "slow zoom in: x stable");
  assert.equal(atStart.translateY, atMid.translateY, "slow zoom in: y stable");
  assert.ok(atMid.scale > atStart.scale && atEnd.scale > atMid.scale, "scale increases");
  assert.equal(
    atMid.scale,
    resolveBaseTransform(scene).scale * legacyScale,
    "Ken Burns parity at mid scene",
  );
});

test("3. slow zoom out — scale decreases from peak toward base", () => {
  const image = makeSceneImage("zoom-out");
  const story = buildStory([makeScene("s1", 5, { image })]);
  const { previewTimeline } = buildTimelines(story);
  const scene = story.scenes[0]!;
  const event = getImageMotionEventForScene(previewTimeline, "s1")!;

  assert.equal(event.metadata.motionType, "slow-zoom-out");

  const atStart = resolveMotionState(previewTimeline, scene, 0)!;
  const atEnd = resolveMotionState(previewTimeline, scene, 5000)!;
  const baseScale = resolveBaseTransform(scene).scale;

  assert.equal(atStart.scale, baseScale * 1.1);
  assert.equal(atEnd.scale, baseScale);
  assert.equal(atStart.translateX, atEnd.translateX);
  assert.equal(atStart.translateY, atEnd.translateY);
});

test("4. pan left — translateX increases, scale unchanged", () => {
  const image = makeSceneImage("pan-left");
  const story = buildStory([makeScene("s1", 4, { image })]);
  const { previewTimeline } = buildTimelines(story);
  const scene = story.scenes[0]!;
  const event = getImageMotionEventForScene(previewTimeline, "s1")!;

  assert.equal(event.metadata.motionType, "pan-left");

  const atStart = resolveMotionState(previewTimeline, scene, 0)!;
  const atEnd = resolveMotionState(previewTimeline, scene, 4000)!;
  const panPx = (IMAGE_MOTION_DEFAULT_PAN_TRAVEL_PCT / 100) * FRAME_WIDTH;
  const base = resolveBaseTransform(scene);

  assertNoCropPositionRegression(scene, atStart, 0, "pan left start");
  assert.equal(atStart.scale, atEnd.scale, "pan left: scale stable");
  assert.equal(atEnd.translateX, base.translateX + panPx);
  assert.equal(atEnd.translateY, base.translateY);
});

test("5. pan right — translateX decreases, scale unchanged", () => {
  const image = makeSceneImage("pan-right");
  const story = buildStory([makeScene("s1", 4, { image })]);
  const { previewTimeline } = buildTimelines(story);
  const scene = story.scenes[0]!;
  const event = getImageMotionEventForScene(previewTimeline, "s1")!;

  assert.equal(event.metadata.motionType, "pan-right");

  const atStart = resolveMotionState(previewTimeline, scene, 0)!;
  const atEnd = resolveMotionState(previewTimeline, scene, 4000)!;
  const panPx = (IMAGE_MOTION_DEFAULT_PAN_TRAVEL_PCT / 100) * FRAME_WIDTH;
  const base = resolveBaseTransform(scene);

  assert.equal(atStart.scale, atEnd.scale);
  assert.equal(atEnd.translateX, base.translateX - panPx);
  assert.equal(atEnd.translateY, base.translateY);
});

test("6. pan left + zoom — translateX and scale both animate", () => {
  const image = makeSceneImage("pan-left-zoom-in");
  const story = buildStory([makeScene("s1", 4, { image })]);
  const { previewTimeline } = buildTimelines(story);
  const scene = story.scenes[0]!;
  const event = getImageMotionEventForScene(previewTimeline, "s1")!;

  assert.equal(event.metadata.motionType, "pan-left-zoom-in");

  const atStart = resolveMotionState(previewTimeline, scene, 0)!;
  const atEnd = resolveMotionState(previewTimeline, scene, 4000)!;
  const panPx = (IMAGE_MOTION_DEFAULT_PAN_TRAVEL_PCT / 100) * FRAME_WIDTH;
  const base = resolveBaseTransform(scene);

  assertNoCropPositionRegression(scene, atStart, 0, "pan left zoom start");
  assert.equal(atStart.scale, base.scale);
  assert.equal(atEnd.scale, base.scale * 1.1);
  assert.equal(atEnd.translateX, base.translateX + panPx);
});

test("7. pan right + zoom — translateX and scale both animate", () => {
  const image = makeSceneImage("pan-right-zoom-in");
  const story = buildStory([makeScene("s1", 4, { image })]);
  const { previewTimeline } = buildTimelines(story);
  const scene = story.scenes[0]!;
  const event = getImageMotionEventForScene(previewTimeline, "s1")!;

  assert.equal(event.metadata.motionType, "pan-right-zoom-in");

  const atStart = resolveMotionState(previewTimeline, scene, 0)!;
  const atEnd = resolveMotionState(previewTimeline, scene, 4000)!;
  const panPx = (IMAGE_MOTION_DEFAULT_PAN_TRAVEL_PCT / 100) * FRAME_WIDTH;
  const base = resolveBaseTransform(scene);

  assert.equal(atStart.scale, base.scale);
  assert.equal(atEnd.scale, base.scale * 1.1);
  assert.equal(atEnd.translateX, base.translateX - panPx);
});

test("8. preview/export comparison — shared resolver parity across samples", () => {
  const story = buildStory(
    [
      makeScene("s1", 6, { image: makeSceneImage("zoom-in", { fitMode: "fit", x: 12, y: 8 }) }),
      makeScene("s2", 6, {
        startSec: 6,
        image: makeSceneImage("pan-left", { scale: 1.3, x: -10, y: 20 }),
      }),
      makeScene("s3", 6, {
        startSec: 12,
        image: makeSceneImage("pan-right-zoom-in", { fitMode: "fill", x: 5, y: -5 }),
      }),
    ],
    { voiceoverDurationMs: 18_000 },
  );

  const { previewTimeline, exportTimeline } = buildTimelines(story);
  assert.equal(getImageMotionEvents(previewTimeline).length, 3);
  assert.equal(getImageMotionEvents(exportTimeline).length, 3);
  assertPreviewExportSamples(story, previewTimeline, exportTimeline, 18, "preview/export comparison");
});

test("9. old draft with existing Ken Burns — legacy zoom-in/out map safely", () => {
  const legacyScript: FootieScript = {
    title: "Legacy Ken Burns Draft",
    narration: "Legacy motion draft.",
    totalDuration: 8,
    scenes: [
      makeScene("s1", 4, {
        image: {
          url: "blob:legacy-zoom-in",
          scale: 1.05,
          x: 10,
          y: -6,
          fitMode: "fit",
          imageMotion: { type: "zoom-in", intensity: "subtle" },
        },
      }),
      makeScene("s2", 4, {
        startSec: 4,
        image: {
          url: "blob:legacy-zoom-out",
          scale: 1.2,
          x: -8,
          y: 14,
          fitMode: "fill",
          imageMotion: { type: "zoom-out", intensity: "strong" },
        },
      }),
    ],
    voiceoverUrl: "blob:legacy-voiceover",
    voiceoverDurationMs: 8000,
  };

  const serialized = serializeEditorStateForDraft(legacyScript);
  const reloadedMotionIn = normalizeSceneImageMotion(serialized.scenes[0]?.image?.imageMotion);
  const reloadedMotionOut = normalizeSceneImageMotion(serialized.scenes[1]?.image?.imageMotion);

  assert.deepEqual(reloadedMotionIn, { type: "zoom-in", intensity: "subtle" });
  assert.deepEqual(reloadedMotionOut, { type: "zoom-out", intensity: "strong" });
  assert.equal(resolveImageMotionPreset(reloadedMotionIn), "slow-zoom-in");
  assert.equal(resolveImageMotionPreset(reloadedMotionOut), "slow-zoom-out");

  const { previewTimeline, exportTimeline } = buildTimelines(syncFootieScript(legacyScript));
  const sceneIn = serialized.scenes[0]!;
  const sceneOut = serialized.scenes[1]!;

  const zoomInMid = resolveMotionState(previewTimeline, sceneIn, 2000)!;
  const zoomOutMid = resolveMotionState(previewTimeline, sceneOut, 6000)!;

  assert.equal(
    zoomInMid.scale,
    resolveBaseTransform(sceneIn).scale *
      resolveSceneImageMotionScale(reloadedMotionIn, 0.5),
  );
  assert.equal(
    zoomOutMid.scale,
    resolveBaseTransform(sceneOut).scale *
      resolveSceneImageMotionScale(reloadedMotionOut, 0.5),
  );

  assertPreviewExportMotionParity(
    syncFootieScript(legacyScript),
    previewTimeline,
    exportTimeline,
    2000,
    "legacy zoom-in",
  );
  assertPreviewExportMotionParity(
    syncFootieScript(legacyScript),
    previewTimeline,
    exportTimeline,
    6000,
    "legacy zoom-out",
  );
});

test("structural: preview/export wired to timeline image motion resolver", () => {
  const sceneFrameImage = readSrc("src/features/editor/components/SceneFrameImage.tsx");
  const previewFrame = readSrc("src/features/preview/components/PreviewFrame.tsx");
  const videoRender = readSrc("src/features/export/services/video-render.service.ts");
  const previewTiming = readSrc("src/features/preview/utils/previewSceneTiming.ts");

  assert.match(sceneFrameImage, /resolveSceneImageMotionTransformState/);
  assert.match(previewFrame, /timelineImageMotion/);
  assert.match(previewTiming, /resolvePreviewTimelineImageMotion/);
  assert.match(videoRender, /resolveSceneImageMotionTransformState/);
  assert.match(videoRender, /getImageMotionEventForScene/);
  assert.doesNotMatch(previewFrame, /resolveSceneImageMotionScale/);
  assert.doesNotMatch(videoRender, /resolveSceneImageMotionScale/);
});

const total = passed + failures.length;

console.log(`\nTimeline Image Motion QA: ${passed}/${total} passed`);

if (failures.length > 0) {
  console.log("\nFailing cases:");
  for (const failure of failures) {
    console.log(`  - ${failure}`);
  }
  console.log("\nNOT READY for Transition Scheduler\n");
  process.exit(1);
}

console.log("\nREADY for Transition Scheduler\n");
