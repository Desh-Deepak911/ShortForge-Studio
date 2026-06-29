/**
 * Timeline Intelligence — Phase 3D Timeline Optimizer QA
 * Run: npm run test:timeline-optimizer-qa
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildMasterTimeline } from "@/features/timeline-intelligence/build-master-timeline";
import { buildOptimizedMasterTimeline } from "@/features/timeline-intelligence/build-optimized-master-timeline.utils";
import {
  optimizeMasterTimeline,
  TIMELINE_OPTIMIZER_DENSE_SUBTITLE_CHUNK_MS,
  TIMELINE_OPTIMIZER_SHORT_SCENE_THRESHOLD_MS,
} from "@/features/timeline-intelligence/optimize-master-timeline.utils";
import { getTimelineTrackByType } from "@/features/timeline-intelligence/timeline-utils";
import type {
  CaptionAnimationTimelineEvent,
  TransitionTimelineEvent,
} from "@/features/timeline-intelligence/timeline.types";
import type { FootieScene, FootieScript } from "@/features/story/types";
import {
  ensureTimelineItems,
  recalculateSceneTimings,
  TRANSITION_CARD_TITLE,
} from "@/features/story/utils";
import { syncFootieScript } from "@/lib/utils/voiceover";

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

function makeScene(
  id: string,
  durationSec: number,
  options: {
    startSec?: number;
    subtitleText?: string;
    subtitleEffect?: FootieScene["subtitleEffect"];
  } = {},
): FootieScene {
  const startSec = options.startSec ?? 0;
  const durationMs = durationSec * 1000;
  const startMs = startSec * 1000;
  const subtitleText = options.subtitleText ?? `Subtitle copy for scene ${id}.`;

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
    subtitleEffect: options.subtitleEffect ?? "fade-up",
    narration: subtitleText,
  };
}

function buildStory(
  scenes: FootieScene[],
  options: {
    voiceoverDurationMs?: number;
    timelineItems?: FootieScript["timelineItems"];
  } = {},
): FootieScript {
  const timedScenes = recalculateSceneTimings(scenes);
  const totalDuration = timedScenes.reduce((sum, scene) => sum + scene.duration, 0);

  return syncFootieScript({
    title: "Timeline Optimizer QA",
    narration: timedScenes.map((scene) => scene.narration).join(" "),
    totalDuration,
    scenes: timedScenes,
    ...(options.timelineItems ? { timelineItems: options.timelineItems } : {}),
    ...(options.voiceoverDurationMs != null
      ? {
          voiceoverUrl: "blob:qa-voiceover",
          voiceoverDurationMs: options.voiceoverDurationMs,
        }
      : {}),
  });
}

function buildStoryWithTransition(
  scenes: FootieScene[],
  effect: "fade" | "slide-left" = "fade",
  durationMs: number,
): FootieScript {
  const timedScenes = recalculateSceneTimings(scenes);
  const timelineItems = ensureTimelineItems(timedScenes).map((item) =>
    item.type === "transition"
      ? {
          ...item,
          effect,
          durationMs,
          label: TRANSITION_CARD_TITLE,
        }
      : item,
  );

  return buildStory(timedScenes, { timelineItems });
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

console.log("timeline-optimizer-qa");

test("1. final subtitle hold buffer is preserved in optimized render span", () => {
  const story = buildStory(
    [makeScene("s1", 6, { subtitleText: "Closing line before the render tail hold." })],
    { voiceoverDurationMs: 6_000 },
  );
  const timeline = buildMasterTimeline(story, { mode: "export", useVoiceoverRefit: true });
  const optimized = optimizeMasterTimeline(timeline);

  assert.ok(optimized.timeline.diagnostics.finalSubtitleEndMs! > 0);
  assert.ok(optimized.timeline.diagnostics.finalSubtitleEndGapMs! >= 400);
  assert.ok(
    optimized.findings.some((finding) => finding.rule === "final-subtitle-hold"),
    "final hold finding present",
  );
});

test("2. transition duration is clamped to safe outgoing scene tail", () => {
  const story = buildStoryWithTransition(
    [makeScene("s1", 2), makeScene("s2", 4, { startSec: 2 })],
    "fade",
    900,
  );
  const timeline = buildMasterTimeline(story, { mode: "preview" });
  const sceneEndMs = getTimelineTrackByType(timeline.tracks, "scene")!.events[0]!.endMs;

  const tamperedTimeline = {
    ...timeline,
    tracks: timeline.tracks.map((track) =>
      track.type === "transition"
        ? {
            ...track,
            events: track.events.map((event) => ({
              ...event,
              startMs: 0,
              endMs: sceneEndMs,
              durationMs: sceneEndMs,
              metadata: {
                ...(event as TransitionTimelineEvent).metadata,
                startMs: 0,
                endMs: sceneEndMs,
                durationMs: sceneEndMs,
              },
            })),
          }
        : track,
    ),
  };

  const optimized = optimizeMasterTimeline(tamperedTimeline);
  const after = getTimelineTrackByType(optimized.timeline.tracks, "transition")!
    .events[0] as TransitionTimelineEvent;

  assert.equal(after.startMs, 1_200);
  assert.equal(after.endMs, 2_000);
  assert.equal(after.durationMs, 800);
  assert.ok(
    optimized.findings.some(
      (finding) => finding.rule === "transition-scene-fraction" && finding.severity === "applied",
    ),
  );
});

test("3. very short scenes are flagged without changing scene duration", () => {
  const story = buildStory([makeScene("s1", 1.5), makeScene("s2", 6, { startSec: 1.5 })]);
  const timeline = buildMasterTimeline(story, { mode: "preview" });
  const sceneBefore = getTimelineTrackByType(timeline.tracks, "scene")!.events[0]!;

  const optimized = optimizeMasterTimeline(timeline);
  const sceneAfter = getTimelineTrackByType(optimized.timeline.tracks, "scene")!.events[0]!;

  assert.equal(sceneBefore.startMs, sceneAfter.startMs);
  assert.equal(sceneBefore.endMs, sceneAfter.endMs);
  assert.equal(sceneBefore.durationMs, sceneAfter.durationMs);
  assert.ok(
    optimized.findings.some(
      (finding) =>
        finding.rule === "short-scene-flag" &&
        finding.sceneId === "s1" &&
        finding.message.includes(String(TIMELINE_OPTIMIZER_SHORT_SCENE_THRESHOLD_MS)),
    ),
  );
});

test("4. dense subtitles are flagged without rewriting text", () => {
  const denseText =
    "He picks it up on the halfway line beats one beats two and curls it into the top corner with unstoppable power.";
  const story = buildStory([
    makeScene("s1", 3, {
      subtitleText: denseText,
      subtitleEffect: "typewriter",
    }),
  ]);
  const timeline = buildMasterTimeline(story, { mode: "preview" });
  const subtitleBefore = getTimelineTrackByType(timeline.tracks, "subtitle")!.events[0]!;

  const optimized = optimizeMasterTimeline(timeline);
  const subtitleAfter = getTimelineTrackByType(optimized.timeline.tracks, "subtitle")!.events[0]!;

  assert.equal(subtitleBefore.metadata.text, subtitleAfter.metadata.text);
  assert.ok(
    optimized.findings.some((finding) => finding.rule === "dense-subtitle-flag"),
    "dense subtitle flagged",
  );
  assert.ok(
    optimized.findings.some((finding) =>
      finding.message.includes(String(TIMELINE_OPTIMIZER_DENSE_SUBTITLE_CHUNK_MS)),
    ),
  );
});

test("5. caption animation duration is clamped to subtitle window", () => {
  const story = buildStory([
    makeScene("s1", 4, {
      subtitleText: "Typewriter caption with a longer reveal window requirement.",
      subtitleEffect: "typewriter",
    }),
  ]);
  const timeline = buildMasterTimeline(story, { mode: "preview" });
  const animationBefore = getTimelineTrackByType(timeline.tracks, "caption-animation")!
    .events[0] as CaptionAnimationTimelineEvent;
  const subtitle = getTimelineTrackByType(timeline.tracks, "subtitle")!.events[0]!;

  const tamperedTimeline = {
    ...timeline,
    tracks: timeline.tracks.map((track) =>
      track.type === "caption-animation"
        ? {
            ...track,
            events: track.events.map((event) => ({
              ...event,
              endMs: subtitle.endMs + 500,
              durationMs: subtitle.endMs + 500 - event.startMs,
              metadata: {
                ...(event as CaptionAnimationTimelineEvent).metadata,
                animationEndMs: subtitle.endMs + 500,
              },
            })),
          }
        : track,
    ),
  };

  assert.ok(animationBefore.endMs <= subtitle.endMs + 1, "baseline already within window");
  assert.ok(
    (tamperedTimeline.tracks.find((track) => track.type === "caption-animation")!.events[0]!
      .endMs) > subtitle.endMs,
  );

  const optimized = optimizeMasterTimeline(tamperedTimeline);
  const animationAfter = getTimelineTrackByType(optimized.timeline.tracks, "caption-animation")!
    .events[0] as CaptionAnimationTimelineEvent;

  assert.equal(animationAfter.endMs, subtitle.endMs);
  assert.ok(
    optimized.findings.some(
      (finding) => finding.rule === "animation-window-clamp" && finding.severity === "applied",
    ),
  );
});

test("6. narration and audio alignment are preserved", () => {
  const story = buildStory(
    [
      makeScene("s1", 5),
      makeScene("s2", 5, { startSec: 5 }),
    ],
    { voiceoverDurationMs: 10_000 },
  );
  const timeline = buildMasterTimeline(story, { mode: "export", useVoiceoverRefit: true });
  const audioBefore = getTimelineTrackByType(timeline.tracks, "audio")!.events;

  const optimized = optimizeMasterTimeline(timeline);
  const audioAfter = getTimelineTrackByType(optimized.timeline.tracks, "audio")!.events;

  assert.equal(timeline.narrationDurationMs, optimized.timeline.narrationDurationMs);
  assert.equal(timeline.audioDurationMs, optimized.timeline.audioDurationMs);
  assert.deepEqual(audioBefore, audioAfter);
  assert.ok(
    optimized.findings.some((finding) => finding.rule === "narration-audio-preservation"),
  );
});

test("7. buildOptimizedMasterTimeline attaches optimizer diagnostics", () => {
  const story = buildStory([makeScene("s1", 1.5), makeScene("s2", 6, { startSec: 1.5 })]);
  const timeline = buildOptimizedMasterTimeline(story, {
    mode: "preview",
    useVoiceoverRefit: true,
  });

  assert.ok(timeline.diagnostics.optimizer);
  assert.ok(timeline.diagnostics.optimizer!.findings.length > 0);
  assert.ok(
    timeline.diagnostics.optimizer!.findings.some(
      (finding) => finding.rule === "short-scene-flag",
    ),
  );
});

test("structural: preview/export wired to buildOptimizedMasterTimeline pipeline", () => {
  const previewMasterTimeline = readSrc("src/features/preview/utils/preview-master-timeline.utils.ts");
  const preflight = readSrc("src/features/export/utils/export-preflight.utils.ts");
  const devDiagnostics = readSrc("src/features/timeline-intelligence/timeline-diagnostics.dev.utils.ts");

  assert.match(previewMasterTimeline, /buildOptimizedMasterTimeline/);
  assert.match(preflight, /buildOptimizedMasterTimeline/);
  assert.match(devDiagnostics, /buildOptimizedMasterTimeline/);
  assert.match(devDiagnostics, /optimizerFindings/);
});

const total = passed + failures.length;

console.log(`\nTimeline Optimizer QA: ${passed}/${total} passed`);

if (failures.length > 0) {
  console.log("\nFailing cases:");
  for (const failure of failures) {
    console.log(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("\nREADY\n");
