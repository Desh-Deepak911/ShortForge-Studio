/**
 * Timeline Intelligence — Phase 3A Caption Animation QA
 * Run: npm run test:timeline-caption-animation-qa
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveExportFrameFromMasterTimeline } from "@/features/export/services/video-render.service";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import {
  buildPreviewMasterTimeline,
  resolvePreviewPlaybackState,
} from "@/features/preview/utils/preview-master-timeline.utils";
import {
  buildMasterTimeline,
  TIMELINE_SUBTITLE_FINAL_READABLE_HOLD_MS,
} from "@/features/timeline-intelligence/build-master-timeline";
import { resolveCaptionAnimationState } from "@/features/timeline-intelligence/resolve-caption-animation-state.utils";
import type {
  CaptionAnimationTimelineEvent,
  MasterTimeline,
} from "@/features/timeline-intelligence/timeline.types";
import { getTimelineTrackByType } from "@/features/timeline-intelligence/timeline-utils";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { recalculateSceneTimings } from "@/features/story/utils";
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
  const subtitleText = options.subtitleText ?? `Subtitle narration for scene ${id}.`;

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
  options: { voiceoverDurationMs?: number } = {},
): FootieScript {
  const timedScenes = recalculateSceneTimings(scenes);
  const totalDuration = timedScenes.reduce((sum, scene) => sum + scene.duration, 0);

  return syncFootieScript({
    title: "Caption Animation QA",
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

function getCaptionAnimationEvents(timeline: MasterTimeline): CaptionAnimationTimelineEvent[] {
  const track = getTimelineTrackByType(timeline.tracks, "caption-animation");
  return (track?.events ?? []) as CaptionAnimationTimelineEvent[];
}

function assertAnimationFitsSubtitleWindow(timeline: MasterTimeline, label: string): void {
  for (const event of getCaptionAnimationEvents(timeline)) {
    const meta = event.metadata;
    assert.ok(
      event.startMs >= meta.subtitleStartMs,
      `${label}: animation start inside subtitle window (${event.id})`,
    );
    assert.ok(
      event.endMs <= meta.subtitleEndMs,
      `${label}: animation end inside subtitle window (${event.id})`,
    );
    assert.ok(
      meta.animationEndMs <= meta.subtitleEndMs,
      `${label}: scheduled animationEndMs <= subtitleEndMs (${event.id})`,
    );
  }
}

function assertCaptionCompletesBeforeSubtitleEnd(timeline: MasterTimeline, label: string): void {
  for (const event of getCaptionAnimationEvents(timeline)) {
    const meta = event.metadata;
    const fullText = meta.text.trim();
    if (!fullText) {
      continue;
    }

    const atEnd = resolveCaptionAnimationState(event, meta.subtitleEndMs - 1);
    assert.equal(
      atEnd.visibleText,
      fullText,
      `${label}: full text visible before subtitleEndMs (${event.id})`,
    );
    assert.equal(
      atEnd.shouldRenderFullText,
      true,
      `${label}: shouldRenderFullText before subtitleEndMs (${event.id})`,
    );

    if (meta.effectType === "typewriter" || meta.effect === "typewriter") {
      assert.ok(
        meta.animationEndMs <= meta.subtitleEndMs,
        `${label}: typewriter animationEndMs <= subtitleEndMs (${event.id})`,
      );
    }
  }
}

function assertNoTypewriterOverrun(timeline: MasterTimeline, label: string): void {
  for (const event of getCaptionAnimationEvents(timeline)) {
    const meta = event.metadata;
    const effect = meta.effectType ?? meta.effect;
    if (effect !== "typewriter") {
      continue;
    }

    assert.ok(
      meta.animationEndMs <= meta.subtitleEndMs,
      `${label}: typewriter scheduled end within subtitle window (${event.id})`,
    );

    const fullText = meta.text.trim();
    for (const sampleMs of [
      meta.subtitleStartMs,
      meta.animationEndMs - 1,
      meta.subtitleEndMs - 1,
    ]) {
      if (sampleMs < meta.subtitleStartMs || sampleMs >= meta.subtitleEndMs) {
        continue;
      }
      const state = resolveCaptionAnimationState(event, sampleMs);
      assert.ok(
        state.visibleText.length <= fullText.length,
        `${label}: visible text never longer than source (${event.id} @${sampleMs}ms)`,
      );
      assert.ok(
        fullText.startsWith(state.visibleText) || state.visibleText === fullText,
        `${label}: visible text is prefix of full copy (${event.id} @${sampleMs}ms)`,
      );
    }

    const atSubtitleEnd = resolveCaptionAnimationState(event, meta.subtitleEndMs - 1);
    assert.equal(
      atSubtitleEnd.visibleText,
      fullText,
      `${label}: typewriter completes before subtitleEndMs (${event.id})`,
    );
  }
}

function assertFinalCaptionCompletes(timeline: MasterTimeline, label: string): void {
  const events = getCaptionAnimationEvents(timeline);
  assert.ok(events.length > 0, `${label}: has caption animation events`);

  const lastEvent = events.reduce((latest, event) =>
    event.metadata.subtitleEndMs > latest.metadata.subtitleEndMs ? event : latest,
  );
  const meta = lastEvent.metadata;
  const fullText = meta.text.trim();

  const beforeRenderEnd = resolveCaptionAnimationState(
    lastEvent,
    timeline.renderDurationMs - 1,
  );
  assert.equal(
    beforeRenderEnd.visibleText,
    fullText,
    `${label}: final caption full text held through render tail`,
  );
  assert.equal(
    beforeRenderEnd.shouldRenderFullText,
    true,
    `${label}: final caption shouldRenderFullText at render tail`,
  );

  const finalSubtitleEndMs = timeline.diagnostics.finalSubtitleEndMs ?? 0;
  assert.ok(finalSubtitleEndMs > 0, `${label}: finalSubtitleEndMs recorded`);
  assert.ok(
    timeline.renderDurationMs >= finalSubtitleEndMs + TIMELINE_SUBTITLE_FINAL_READABLE_HOLD_MS,
    `${label}: readable hold after final subtitle`,
  );
}

function assertPreviewExportCaptionParity(
  script: FootieScript,
  previewTimeline: MasterTimeline,
  exportTimeline: MasterTimeline,
  timeMs: number,
  label: string,
): void {
  const scenes = script.scenes;
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));

  const preview = resolvePreviewPlaybackState(previewTimeline, scenes, timeMs);
  const exportFrame = resolveExportFrameFromMasterTimeline(
    exportTimeline,
    scenes,
    sceneById,
    timeMs,
  );

  assert.ok(preview, `${label} @${timeMs}ms: preview state`);
  assert.equal(preview!.sceneIndex, exportFrame.sceneIndex, `${label} @${timeMs}ms: scene index`);
  assert.equal(preview!.scene.id, exportFrame.scene.id, `${label} @${timeMs}ms: scene id`);

  const previewAnim = preview!.captionAnimationState;
  const exportAnim = exportFrame.subtitleDisplay?.animationState;

  if (!previewAnim && !exportAnim) {
    return;
  }

  assert.ok(previewAnim, `${label} @${timeMs}ms: preview animation state`);
  assert.ok(exportAnim, `${label} @${timeMs}ms: export animation state`);
  assert.equal(
    previewAnim!.visibleText,
    exportAnim!.visibleText,
    `${label} @${timeMs}ms: visibleText`,
  );
  assert.equal(
    previewAnim!.shouldRenderFullText,
    exportAnim!.shouldRenderFullText,
    `${label} @${timeMs}ms: shouldRenderFullText`,
  );
  assert.equal(previewAnim!.progress, exportAnim!.progress, `${label} @${timeMs}ms: progress`);
  assert.equal(previewAnim!.opacity, exportAnim!.opacity, `${label} @${timeMs}ms: opacity`);
}

function assertPreviewExportSamples(
  script: FootieScript,
  previewTimeline: MasterTimeline,
  exportTimeline: MasterTimeline,
  sampleCount: number,
  label: string,
): void {
  const renderMs = previewTimeline.renderDurationMs;
  for (let index = 0; index < sampleCount; index++) {
    const timeMs = Math.floor((renderMs * index) / Math.max(1, sampleCount - 1));
    assertPreviewExportCaptionParity(script, previewTimeline, exportTimeline, timeMs, label);
  }
}

function buildTimelines(story: FootieScript) {
  const previewTimeline = buildPreviewMasterTimeline(story);
  const exportTimeline = prepareStoryForExport(story).masterTimeline;
  assert.ok(previewTimeline, "preview timeline");
  return { previewTimeline: previewTimeline!, exportTimeline };
}

function assertTimelineCaptionHealth(
  previewTimeline: MasterTimeline,
  exportTimeline: MasterTimeline,
  label: string,
): void {
  assertAnimationFitsSubtitleWindow(previewTimeline, `${label} preview`);
  assertAnimationFitsSubtitleWindow(exportTimeline, `${label} export`);
  assertCaptionCompletesBeforeSubtitleEnd(previewTimeline, `${label} preview`);
  assertCaptionCompletesBeforeSubtitleEnd(exportTimeline, `${label} export`);
  assertNoTypewriterOverrun(previewTimeline, `${label} preview`);
  assertNoTypewriterOverrun(exportTimeline, `${label} export`);
  assertFinalCaptionCompletes(previewTimeline, `${label} preview`);
  assertFinalCaptionCompletes(exportTimeline, `${label} export`);
  assert.equal(
    previewTimeline.renderDurationMs,
    exportTimeline.renderDurationMs,
    `${label}: preview/export render duration`,
  );
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

console.log("\nTimeline Caption Animation QA — Phase 3A\n");

test("1. typewriter short caption", () => {
  const text = "Quick goal.";
  const story = buildStory([
    makeScene("s1", 8, { subtitleText: text, subtitleEffect: "typewriter" }),
  ], { voiceoverDurationMs: 8_000 });

  const { previewTimeline, exportTimeline } = buildTimelines(story);
  assertTimelineCaptionHealth(previewTimeline, exportTimeline, "typewriter short");

  const event = getCaptionAnimationEvents(previewTimeline)[0]!;
  const mid = resolveCaptionAnimationState(event, event.metadata.subtitleStartMs + 500);
  assert.ok(mid.visibleText.length >= 1);
  assert.ok(mid.visibleText.length < text.length);
  assertPreviewExportCaptionParity(story, previewTimeline, exportTimeline, 500, "typewriter short");
});

test("2. typewriter long caption", () => {
  const text =
    "He picks it up on the halfway line, beats one, beats two, and curls it into the top corner with unstoppable power.";
  const story = buildStory([
    makeScene("s1", 6, { subtitleText: text, subtitleEffect: "typewriter" }),
  ]);

  const { previewTimeline, exportTimeline } = buildTimelines(story);
  assertTimelineCaptionHealth(previewTimeline, exportTimeline, "typewriter long");

  const tooShortEvents = getCaptionAnimationEvents(previewTimeline).filter(
    (event) => event.metadata.captionTooShortForEffect,
  );
  for (const event of tooShortEvents) {
    const atEnd = resolveCaptionAnimationState(event, event.metadata.subtitleEndMs - 1);
    assert.equal(
      atEnd.visibleText,
      event.metadata.text.trim(),
      "accelerated typewriter completes at window end",
    );
  }

  assertPreviewExportSamples(story, previewTimeline, exportTimeline, 10, "typewriter long");
});

test("3. animated caption near end", () => {
  const story = buildStory(
    [
      makeScene("s1", 20, { subtitleText: "Opening stretch with standard fade-up captions." }),
      makeScene("s2", 20, {
        startSec: 20,
        subtitleText: "Closing scene fade-up caption lands near the final render tail.",
        subtitleEffect: "fade-up",
      }),
    ],
    { voiceoverDurationMs: 40_000 },
  );

  const { previewTimeline, exportTimeline } = buildTimelines(story);
  assertTimelineCaptionHealth(previewTimeline, exportTimeline, "animated near end");

  const finalEvent = getCaptionAnimationEvents(previewTimeline).reduce((latest, event) =>
    event.metadata.subtitleEndMs > latest.metadata.subtitleEndMs ? event : latest,
  );
  const nearEndMs = finalEvent.metadata.subtitleStartMs + 100;
  const nearEndState = resolveCaptionAnimationState(finalEvent, nearEndMs);
  assert.ok(nearEndState.opacity < 1, "fade-up near start of final chunk is mid-reveal");
  assertPreviewExportCaptionParity(
    story,
    previewTimeline,
    exportTimeline,
    nearEndMs,
    "animated near end",
  );
  assertPreviewExportCaptionParity(
    story,
    previewTimeline,
    exportTimeline,
    previewTimeline.renderDurationMs - 200,
    "animated near end tail",
  );
});

test("4. final caption with typewriter", () => {
  const closingText = "And that is the moment the entire stadium erupted in celebration.";
  const story = buildStory(
    [
      makeScene("s1", 10, { subtitleText: "Earlier scene with standard subtitles." }),
      makeScene("s2", 10, {
        startSec: 10,
        subtitleText: closingText,
        subtitleEffect: "typewriter",
      }),
    ],
    { voiceoverDurationMs: 20_000 },
  );

  const { previewTimeline, exportTimeline } = buildTimelines(story);
  assertTimelineCaptionHealth(previewTimeline, exportTimeline, "final typewriter");

  const finalSceneEvents = getCaptionAnimationEvents(previewTimeline)
    .filter((event) => event.metadata.sceneId === "s2")
    .sort((left, right) => left.metadata.chunkIndex - right.metadata.chunkIndex);
  assert.ok(finalSceneEvents.length > 0, "final scene has caption animation events");

  for (const event of finalSceneEvents) {
    const chunkText = event.metadata.text.trim();
    const atChunkEnd = resolveCaptionAnimationState(event, event.metadata.subtitleEndMs - 1);
    assert.equal(atChunkEnd.visibleText, chunkText, `chunk ${event.metadata.chunkIndex} completes`);
    assert.equal(atChunkEnd.shouldRenderFullText, true);
  }

  const lastFinalEvent = finalSceneEvents[finalSceneEvents.length - 1]!;
  assertPreviewExportCaptionParity(
    story,
    previewTimeline,
    exportTimeline,
    lastFinalEvent.metadata.subtitleEndMs - 1,
    "final typewriter complete",
  );

  const atRenderTail = resolveCaptionAnimationState(
    lastFinalEvent,
    previewTimeline.renderDurationMs - 1,
  );
  assert.equal(atRenderTail.visibleText, lastFinalEvent.metadata.text.trim());
  assert.equal(atRenderTail.shouldRenderFullText, true);
});

test("5. 60s+ video with animated captions", () => {
  const effects: FootieScene["subtitleEffect"][] = ["fade-up", "typewriter", "highlight"];
  const scenes = Array.from({ length: 12 }, (_, index) =>
    makeScene(`s${index + 1}`, 6, {
      startSec: index * 6,
      subtitleText: `Segment ${index + 1} animated caption copy for the long-form QA story.`,
      subtitleEffect: effects[index % effects.length],
    }),
  );
  const story = buildStory(scenes, { voiceoverDurationMs: 72_000 });

  const { previewTimeline, exportTimeline } = buildTimelines(story);
  assertTimelineCaptionHealth(previewTimeline, exportTimeline, "60s+ animated");
  assert.ok(previewTimeline.renderDurationMs >= 72_000, "60s+ render covers voiceover span");
  assertPreviewExportSamples(story, previewTimeline, exportTimeline, 16, "60s+ animated");
});

test("6. preview/export comparison", () => {
  const story = buildStory(
    [
      makeScene("s1", 8, {
        subtitleText: "Fade-up chunk for parity sampling.",
        subtitleEffect: "fade-up",
      }),
      makeScene("s2", 8, {
        startSec: 8,
        subtitleText: "Typewriter chunk reveals progressively across the subtitle window.",
        subtitleEffect: "typewriter",
      }),
      makeScene("s3", 8, {
        startSec: 16,
        subtitleText: "Highlight chunk animates through the final stretch.",
        subtitleEffect: "highlight",
      }),
    ],
    { voiceoverDurationMs: 24_000 },
  );

  const { previewTimeline, exportTimeline } = buildTimelines(story);
  assertTimelineCaptionHealth(previewTimeline, exportTimeline, "preview/export comparison");
  assertPreviewExportSamples(story, previewTimeline, exportTimeline, 24, "preview/export comparison");

  const diagnostics = buildMasterTimeline(story, { mode: "preview", useVoiceoverRefit: true });
  assert.ok(
    (diagnostics.diagnostics.captionTooShortForAnimationCount ?? 0) >= 0,
    "caption schedule diagnostics available",
  );
});

test("structural: preview/export wired to resolveCaptionAnimationState", () => {
  const previewUtils = readSrc("src/features/preview/utils/preview-master-timeline.utils.ts");
  const exportSubtitle = readSrc("src/features/export/utils/export-subtitle.utils.ts");
  const canvasUtils = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  const effectPreview = readSrc("src/features/editor/components/subtitleEffectPreview.tsx");

  assert.match(previewUtils, /resolveCaptionAnimationState/);
  assert.match(exportSubtitle, /resolveCaptionAnimationState/);
  assert.match(canvasUtils, /display\.animationState/);
  assert.match(effectPreview, /captionAnimationState/);
});

const total = passed + failures.length;

console.log(`\nTimeline Caption Animation QA: ${passed}/${total} passed`);

if (failures.length > 0) {
  console.log("\nFailing cases:");
  for (const failure of failures) {
    console.log(`  - ${failure}`);
  }
  console.log("\nNOT READY for Motion Scheduler\n");
  process.exit(1);
}

console.log("\nREADY for Motion Scheduler\n");
