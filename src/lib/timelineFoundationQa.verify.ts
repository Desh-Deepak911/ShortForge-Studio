/**
 * Timeline Foundation QA — Phase 1 (run: npm run test:timeline-foundation-qa).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildMasterTimeline, TIMELINE_END_BUFFER_MS, TIMELINE_SUBTITLE_FINAL_READABLE_HOLD_MS } from "@/features/timeline-intelligence/build-master-timeline";
import { buildTimelineDevDiagnostics } from "@/features/timeline-intelligence/timeline-diagnostics.dev.utils";
import type { CaptionAnimationTimelineEvent } from "@/features/timeline-intelligence/timeline.types";
import {
  getTimelineContentEndMs,
  getTimelineTrackByType,
  validateMasterTimeline,
} from "@/features/timeline-intelligence/timeline-utils";
import { FADE_UP_DURATION_MS } from "@/features/story/utils/subtitle-effect.utils";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import {
  getActiveSceneAtTime,
  getActiveSubtitleAtTime,
} from "@/features/timeline-intelligence/timeline-playback.utils";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { recalculateSceneTimings } from "@/features/story/utils";
import { syncFootieScript } from "@/lib/voiceover";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function makeScene(
  id: string,
  durationSec: number,
  options: {
    startSec?: number;
    subtitleText?: string;
    subtitleEffect?: FootieScene["subtitleEffect"];
    captionMode?: FootieScene["captionMode"];
    imageMotion?: FootieScene["image"];
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
    captionMode: options.captionMode ?? "subtitles",
    subtitleText,
    subtitleEffect: options.subtitleEffect ?? "fade-up",
    narration: subtitleText,
    ...(options.imageMotion ? { image: options.imageMotion } : {}),
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
    title: "Timeline Foundation QA",
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

function assertTimelineBuilds(timeline: ReturnType<typeof buildMasterTimeline>, label: string) {
  assert.ok(timeline.id, `${label}: timeline id`);
  assert.ok(timeline.tracks.length >= 6, `${label}: expected track lanes`);
  const validation = validateMasterTimeline(timeline);
  assert.equal(validation.valid, true, `${label}: ${validation.issues.map((i) => i.message).join("; ")}`);
}

function assertAbsoluteTimestamps(timeline: ReturnType<typeof buildMasterTimeline>, label: string) {
  for (const track of timeline.tracks) {
    for (const event of track.events) {
      assert.ok(event.startMs >= 0, `${label}: ${event.id} negative start`);
      assert.ok(event.endMs >= event.startMs, `${label}: ${event.id} inverted range`);
      assert.equal(
        event.durationMs,
        event.endMs - event.startMs,
        `${label}: ${event.id} duration mismatch`,
      );
    }
  }
}

function assertRenderCoversSubtitles(timeline: ReturnType<typeof buildMasterTimeline>, label: string) {
  const lastSubtitleEndMs = timeline.diagnostics.finalSubtitleEndMs ?? 0;
  if (lastSubtitleEndMs <= 0) {
    return;
  }

  assert.ok(
    timeline.renderDurationMs >= lastSubtitleEndMs,
    `${label}: renderDurationMs (${timeline.renderDurationMs}) < lastSubtitleEndMs (${lastSubtitleEndMs})`,
  );

  const renderEndBeforeBuffer =
    timeline.diagnostics.renderEndBeforeBufferMs ?? timeline.renderDurationMs - TIMELINE_END_BUFFER_MS;
  assert.ok(
    renderEndBeforeBuffer >= lastSubtitleEndMs,
    `${label}: finalRenderEndMs (${renderEndBeforeBuffer}) < lastSubtitleEndMs (${lastSubtitleEndMs})`,
  );
}

console.log("Timeline Foundation QA");

test("1. short video with normal subtitles", () => {
  const story = buildStory([
    makeScene("s1", 4, { subtitleText: "Kickoff whistle blows. The crowd roars." }),
    makeScene("s2", 4, { startSec: 4, subtitleText: "A stunning strike finds the net." }),
  ]);

  const timeline = buildMasterTimeline(story, { mode: "preview" });
  assertTimelineBuilds(timeline, "normal subtitles");
  assertAbsoluteTimestamps(timeline, "normal subtitles");
  assertRenderCoversSubtitles(timeline, "normal subtitles");

  const subtitleTrack = getTimelineTrackByType(timeline.tracks, "subtitle");
  assert.ok(subtitleTrack && subtitleTrack.events.length > 0, "subtitle events exist");

  const sceneTrack = getTimelineTrackByType(timeline.tracks, "scene");
  assert.equal(sceneTrack?.events.length, 2, "two scene events");
  assert.equal(sceneTrack?.events[0]?.endMs, sceneTrack?.events[1]?.startMs, "scenes abut");
});

test("2. short video with final subtitle near the end", () => {
  const closingLine =
    "And that is full time. What a match. Unbelievable drama until the final second.";
  const story = buildStory([
    makeScene("s1", 3, { subtitleText: "First half highlights roll." }),
    makeScene("s2", 7, {
      startSec: 3,
      subtitleText: closingLine,
    }),
  ]);

  const timeline = buildMasterTimeline(story, { mode: "preview" });
  assertTimelineBuilds(timeline, "final subtitle near end");
  assertRenderCoversSubtitles(timeline, "final subtitle near end");

  const lastSubtitleEndMs = timeline.diagnostics.finalSubtitleEndMs ?? 0;
  assert.equal(lastSubtitleEndMs, 10_000, "last subtitle ends at story end");
  assert.ok(
    timeline.renderDurationMs >= 10_000 + TIMELINE_SUBTITLE_FINAL_READABLE_HOLD_MS + TIMELINE_END_BUFFER_MS,
    "render includes readable hold and end buffer after final subtitle",
  );
  assert.ok(
    (timeline.diagnostics.finalSubtitleEndMs ?? 0) <= timeline.renderDurationMs,
    "final subtitle end fits within render duration",
  );
});

test("3. short video with typewriter subtitles", () => {
  const story = buildStory([
    makeScene("s1", 6, {
      subtitleText:
        "He picks it up on the halfway line, beats one, beats two, and curls it into the top corner.",
      subtitleEffect: "typewriter",
    }),
  ]);

  const timeline = buildMasterTimeline(story, { mode: "preview" });
  assertTimelineBuilds(timeline, "typewriter");
  assertRenderCoversSubtitles(timeline, "typewriter");

  const animationTrack = getTimelineTrackByType(timeline.tracks, "caption-animation");
  assert.ok(
    animationTrack?.events.every(
      (event) => event.metadata && (event.metadata as { effect?: string }).effect === "typewriter",
    ),
    "caption-animation events use typewriter effect",
  );

  const diagnostics = buildTimelineDevDiagnostics(story);
  assert.ok(
    diagnostics.typewriterOverrunWarnings.length > 0,
    "typewriter overrun warnings detected for short chunk windows",
  );
});

test("4. video where audio is shorter than final subtitle timeline", () => {
  const story = buildStory(
    [
      makeScene("s1", 8, { subtitleText: "Scene one with extended copy on screen." }),
      makeScene("s2", 8, { startSec: 8, subtitleText: "Scene two keeps playing after audio ends." }),
      makeScene("s3", 8, { startSec: 16, subtitleText: "Scene three tail extends beyond narration." }),
    ],
    { voiceoverDurationMs: 18_000 },
  );

  const preview = buildMasterTimeline(story, { mode: "preview" });
  assertTimelineBuilds(preview, "audio shorter preview");
  assert.equal(preview.narrationDurationMs, 18_000);
  assert.equal(preview.sceneDurationMs, 24_000);
  assert.equal(preview.diagnostics.audioShorterThanSubtitleTimeline, true);
  assert.equal(preview.diagnostics.sceneExtendsBeyondAudio, true);

  const diagnostics = buildTimelineDevDiagnostics(story);
  assert.ok(
    diagnostics.timingMismatchWarnings.length > 0 ||
      preview.warnings.some((warning) => warning.toLowerCase().includes("audio")),
    "timing warnings surface audio/subtitle mismatch",
  );
});

test("5. 60s+ video", () => {
  const scenes = Array.from({ length: 12 }, (_, index) =>
    makeScene(`s${index + 1}`, 6, {
      startSec: index * 6,
      subtitleText: `Segment ${index + 1} narration for the long-form QA story.`,
    }),
  );
  const story = buildStory(scenes, { voiceoverDurationMs: 72_000 });

  const preview = buildMasterTimeline(story, { mode: "preview" });
  const exportTimeline = buildMasterTimeline(story, { mode: "export" });

  assertTimelineBuilds(preview, "60s+ preview");
  assertTimelineBuilds(exportTimeline, "60s+ export");
  assertAbsoluteTimestamps(preview, "60s+ preview");
  assertAbsoluteTimestamps(exportTimeline, "60s+ export");
  assert.equal(preview.sceneDurationMs, 72_000);
  assert.equal(exportTimeline.sceneDurationMs, 72_000);
  assert.ok(preview.tracks.reduce((count, track) => count + track.events.length, 0) > 24);
});

test("6. video with transitions", () => {
  const scenes = recalculateSceneTimings([
    makeScene("s1", 5, { subtitleText: "Opening frame." }),
    makeScene("s2", 5, { subtitleText: "Closing frame." }),
  ]);
  const story = buildStory(scenes, {
    timelineItems: [
      { id: "s1", type: "scene", scene: scenes[0]! },
      {
        id: "t-1",
        type: "transition",
        fromSceneId: "s1",
        toSceneId: "s2",
        effect: "fade",
        durationMs: 800,
        label: "Fade",
      },
      { id: "s2", type: "scene", scene: scenes[1]! },
    ],
  });

  const timeline = buildMasterTimeline(story, { mode: "preview" });
  assertTimelineBuilds(timeline, "transitions");
  const transitionTrack = getTimelineTrackByType(timeline.tracks, "transition");
  assert.ok(transitionTrack && transitionTrack.events.length === 1, "one transition overlay event");
  const transition = transitionTrack!.events[0]!;
  assert.equal(transition.endMs, 5_000, "transition ends at outgoing scene end");
  assert.equal(transition.startMs, 4_200, "transition starts within outgoing scene tail");
  assert.ok(transition.startMs < transition.endMs, "transition has positive duration");
  assert.ok(timeline.transitionDurationMs > 0, "transition union span recorded");

  const meta = transition.metadata;
  assert.equal(meta.fromSceneId, "s1");
  assert.equal(meta.toSceneId, "s2");
  assert.equal(meta.transitionType, "fade");
  assert.equal(meta.effect, "fade");
  assert.equal(meta.startMs, transition.startMs);
  assert.equal(meta.endMs, transition.endMs);
  assert.equal(meta.durationMs, transition.durationMs);
  assert.equal(timeline.diagnostics.transitionsScheduled, 1);
  assert.equal(timeline.diagnostics.transitionOverlapCollisionCount, 0);
  assert.equal(timeline.diagnostics.transitionSceneVisibilityViolationCount, 0);
  assert.equal(timeline.diagnostics.transitionOutOfBoundsCount, 0);
});

test("7. video with image motion", () => {
  const story = buildStory([
    makeScene("s1", 5, {
      subtitleText: "Slow zoom over the pitch.",
      imageMotion: {
        url: "https://example.com/pitch.jpg",
        scale: 1.05,
        x: 0,
        y: 0,
        imageMotion: { type: "zoom-in", intensity: "medium" },
      },
    }),
  ]);

  const timeline = buildMasterTimeline(story, { mode: "preview" });
  assertTimelineBuilds(timeline, "image motion");
  const motionTrack = getTimelineTrackByType(timeline.tracks, "image-motion");
  assert.equal(motionTrack?.events.length, 1, "one image motion event");
  assert.equal(motionTrack?.events[0]?.startMs, 0);
  assert.equal(motionTrack?.events[0]?.endMs, 5_000);

  const motionMeta = motionTrack?.events[0]?.metadata as {
    motionType?: string;
    progressCurve?: string;
    baseTransform?: { scale: number };
    peakScale?: number;
  };
  assert.equal(motionMeta?.motionType, "slow-zoom-in");
  assert.equal(motionMeta?.progressCurve, "linear");
  assert.equal(motionMeta?.baseTransform?.scale, 1);
  assert.equal(motionMeta?.peakScale, 1.1);
});

test("8. export-mode timeline with voiceover refit", () => {
  const story = buildStory(
    [
      makeScene("s1", 10, { subtitleText: "Scene one weighted longer in editor." }),
      makeScene("s2", 5, { startSec: 10, subtitleText: "Scene two shorter weight." }),
    ],
    { voiceoverDurationMs: 12_000 },
  );

  const timeline = buildMasterTimeline(story, { mode: "export" });
  assertTimelineBuilds(timeline, "export refit");
  assert.equal(timeline.authority, "export-refit-timing");
  assert.equal(timeline.diagnostics.exportRefitApplied, true);
  assert.equal(timeline.sceneDurationMs, 12_000);
  assert.equal(timeline.narrationDurationMs, 12_000);
  assert.ok(
    timeline.warnings.some((warning) => warning.toLowerCase().includes("refit")),
    "refit surfaced in warnings",
  );
});

test("9. preview authority with voiceover refit aligns export timing", () => {
  const story = buildStory(
    [
      makeScene("s1", 10, { subtitleText: "Preview playback uses refitted scene windows." }),
      makeScene("s2", 5, { startSec: 10, subtitleText: "Second scene matches export timing." }),
    ],
    { voiceoverDurationMs: 12_000 },
  );

  const preview = buildMasterTimeline(story, { mode: "preview", useVoiceoverRefit: true });
  const exportTimeline = buildMasterTimeline(story, { mode: "export" });

  assertTimelineBuilds(preview, "preview refit");
  assert.equal(preview.diagnostics.exportRefitApplied, true);
  assert.equal(preview.sceneDurationMs, exportTimeline.sceneDurationMs);
  assert.equal(preview.renderDurationMs, exportTimeline.renderDurationMs);

  const diagnostics = buildTimelineDevDiagnostics(story);
  assert.equal(diagnostics.preview.exportRefitApplied, true);
  assert.equal(diagnostics.preview.previewDurationSource, "MasterTimeline");
  assert.equal(diagnostics.export.exportRefitApplied, true);
  assert.equal(diagnostics.comparisonWarnings.length, 0);
});

test("final subtitle completes with readable hold in preview and export", () => {
  const story = buildStory(
    [
      makeScene("s1", 6, {
        subtitleText: "Closing words must remain visible through the final readable hold.",
        subtitleEffect: "typewriter",
      }),
    ],
    { voiceoverDurationMs: 6_000 },
  );

  for (const mode of ["preview", "export"] as const) {
    const timeline = buildMasterTimeline(story, {
      mode,
      ...(mode === "preview" ? { useVoiceoverRefit: true } : {}),
    });
    const finalSubtitleEndMs = timeline.diagnostics.finalSubtitleEndMs ?? 0;

    assert.ok(finalSubtitleEndMs > 0, `${mode}: final subtitle end`);
    assert.ok(
      finalSubtitleEndMs <= timeline.renderDurationMs,
      `${mode}: finalSubtitleEndMs <= renderDurationMs`,
    );
    assert.ok(
      timeline.renderDurationMs >= finalSubtitleEndMs + TIMELINE_SUBTITLE_FINAL_READABLE_HOLD_MS,
      `${mode}: readable hold after final subtitle`,
    );

    const atChunkStart = getActiveSubtitleAtTime(timeline, finalSubtitleEndMs - 500);
    assert.ok(atChunkStart, `${mode}: subtitle active before final end`);

    const tailHold = getActiveSubtitleAtTime(timeline, timeline.renderDurationMs - 1);
    assert.ok(tailHold, `${mode}: final subtitle held through render tail`);
  }
});

test("line-cap overflow risk is detectable in diagnostics", () => {
  const longWord =
    "SupercalifragilisticexpialidociousExtraLettersForTimelineFoundationQA";
  const story = buildStory([
    makeScene("s1", 8, {
      subtitleText: longWord,
    }),
  ]);

  const timeline = buildMasterTimeline(story, { mode: "preview" });
  assert.equal(timeline.diagnostics.lineCapOverflowRisk, true);

  const diagnostics = buildTimelineDevDiagnostics(story);
  assert.ok(
    diagnostics.lineCapOverflowWarnings.length > 0 ||
      timeline.warnings.some((warning) => warning.toLowerCase().includes("line-cap")),
    "line-cap overflow warnings present",
  );
});

test("export playback resolves active scene/subtitle from absolute timestamps", () => {
  const story = buildStory(
    [
      makeScene("s1", 4, { subtitleText: "First scene subtitle chunk text." }),
      makeScene("s2", 4, {
        startSec: 4,
        subtitleText: "Second scene holds through export tail.",
      }),
    ],
    { voiceoverDurationMs: 8_000 },
  );

  const timeline = buildMasterTimeline(story, { mode: "export", useVoiceoverRefit: true });

  const midScene = getActiveSceneAtTime(timeline, 2_000);
  assert.ok(midScene);
  assert.equal(midScene!.event.metadata.sceneId, "s1");
  assert.equal(midScene!.elapsedMs, 2_000);

  const tailHold = getActiveSceneAtTime(timeline, timeline.renderDurationMs - 1);
  assert.ok(tailHold);
  assert.equal(tailHold!.event.metadata.sceneId, "s2");
  assert.equal(tailHold!.progress, 1);

  const subtitleTail = getActiveSubtitleAtTime(timeline, timeline.renderDurationMs - 1);
  assert.ok(subtitleTail);
  assert.equal(subtitleTail!.event.metadata.sceneId, "s2");
});

test("export render loop uses MasterTimeline playback helpers", () => {
  const videoRender = readSrc("src/features/export/services/video-render.service.ts");
  assert.match(videoRender, /resolveExportFrameFromMasterTimeline/);
  assert.match(videoRender, /resolveTimelineSceneFrame/);
  assert.match(videoRender, /resolveTimelineFrameTimeMs\(frameIndex, fps\)/);
  assert.doesNotMatch(videoRender, /getSceneTimingAtGlobalTime/);
  assert.doesNotMatch(videoRender, /getActiveSceneAtTime\(masterTimeline/);
});

test("preview playback uses MasterTimeline authority", () => {
  const previewPlayback = readSrc("src/features/preview/hooks/usePreviewPlayback.ts");
  const previewSceneTiming = readSrc("src/features/preview/utils/previewSceneTiming.ts");
  const previewMasterTimeline = readSrc("src/features/preview/utils/preview-master-timeline.utils.ts");
  const playbackUtils = readSrc("src/features/timeline-intelligence/timeline-playback.utils.ts");
  const videoRender = readSrc("src/features/export/services/video-render.service.ts");
  const preflight = readSrc("src/features/export/utils/export-preflight.utils.ts");
  const devView = readSrc("src/features/timeline-intelligence/TimelineDeveloperView.tsx");

  assert.match(previewPlayback, /buildPreviewMasterTimeline/);
  assert.match(previewPlayback, /resolvePreviewPlaybackState/);
  assert.match(previewMasterTimeline, /resolveTimelineSceneFrame/);
  assert.match(previewMasterTimeline, /buildOptimizedMasterTimeline/);
  assert.match(previewMasterTimeline, /useVoiceoverRefit:\s*true/);
  assert.match(previewPlayback, /logPreviewMasterTimelineDiagnostics/);
  assert.match(playbackUtils, /getTimelineProgress/);
  assert.match(playbackUtils, /resolveTimelineSceneFrame/);
  assert.doesNotMatch(previewSceneTiming, /getSceneTimingAtGlobalTime/);
  assert.match(videoRender, /resolveTimelineSceneFrame/);
  assert.doesNotMatch(videoRender, /getActiveSceneAtTime\(masterTimeline/);
  assert.match(preflight, /buildOptimizedMasterTimeline/);
  assert.match(videoRender, /logExportMasterTimelineDiagnostics/);
  assert.match(videoRender, /resolveExportFrameFromMasterTimeline/);
  assert.match(devView, /previewDurationSource/);
  assert.match(devView, /optimizerFindings/);
  assert.match(readSrc("src/components/StoryWorkspace.tsx"), /TimelineDeveloperView/);
});

test("preview timeline supports tail hold through render duration", () => {
  const story = buildStory(
    [
      makeScene("s1", 4, { subtitleText: "Preview holds through render tail." }),
      makeScene("s2", 4, {
        startSec: 4,
        subtitleText: "Second scene holds through preview tail.",
      }),
    ],
    { voiceoverDurationMs: 8_000 },
  );

  const timeline = buildMasterTimeline(story, { mode: "preview", useVoiceoverRefit: true });

  assert.ok(timeline.renderDurationMs > timeline.narrationDurationMs);

  const tailHold = getActiveSceneAtTime(timeline, timeline.renderDurationMs - 1);
  assert.ok(tailHold);
  assert.equal(tailHold!.event.metadata.sceneId, "s2");
  assert.equal(tailHold!.progress, 1);
});

test("prepareStoryForExport uses MasterTimeline render duration", () => {
  const story = buildStory(
    [
      makeScene("s1", 10, { subtitleText: "Export preflight uses canonical timeline." }),
      makeScene("s2", 5, { startSec: 10, subtitleText: "Second scene." }),
    ],
    { voiceoverDurationMs: 12_000 },
  );

  const preflight = prepareStoryForExport(story);

  assert.equal(preflight.exportDurationMs, preflight.masterTimeline.renderDurationMs);
  assert.equal(preflight.masterTimeline.diagnostics.exportRefitApplied, true);
});

test("content end and render duration relationship", () => {
  const story = buildStory([
    makeScene("s1", 4, { subtitleText: "Quick clip." }),
  ]);

  const timeline = buildMasterTimeline(story, { mode: "preview" });
  const contentEndMs = getTimelineContentEndMs(timeline);
  assert.ok(contentEndMs <= timeline.renderDurationMs);
  assert.equal(
    timeline.renderDurationMs,
    (timeline.diagnostics.renderEndBeforeBufferMs ?? 0) + (timeline.diagnostics.endBufferMs ?? 0),
  );
});

test("caption animation events schedule inside subtitle windows", () => {
  const story = buildStory([
    makeScene("s1", 8, {
      subtitleText: "Fade up caption with room to hold after reveal.",
      subtitleEffect: "fade-up",
    }),
    makeScene("s2", 8, {
      startSec: 8,
      subtitleText: "Second scene typewriter copy for scheduling.",
      subtitleEffect: "typewriter",
    }),
  ]);

  const timeline = buildMasterTimeline(story, { mode: "preview" });
  const subtitleTrack = getTimelineTrackByType(timeline.tracks, "subtitle");
  const animationTrack = getTimelineTrackByType(timeline.tracks, "caption-animation");
  assert.ok(subtitleTrack && animationTrack);
  assert.equal(animationTrack!.events.length, subtitleTrack!.events.length);

  for (const event of animationTrack!.events) {
    const animation = event as CaptionAnimationTimelineEvent;
    const meta = animation.metadata;

    assert.ok(meta.subtitleStartMs <= animation.startMs, "animation starts at or after subtitle start");
    assert.ok(animation.endMs <= meta.subtitleEndMs, "animation ends within subtitle window");
    assert.equal(meta.animationStartMs, animation.startMs);
    assert.equal(meta.animationEndMs, animation.endMs);
    assert.ok(meta.availableDurationMs > 0);
    assert.ok(meta.holdDurationMs >= 0);
    assert.ok(meta.textLength > 0);
    assert.equal(meta.subtitleId, meta.subtitleEventId);
  }

  const fadeUp = animationTrack!.events.find(
    (event) => (event as CaptionAnimationTimelineEvent).metadata.sceneId === "s1",
  ) as CaptionAnimationTimelineEvent;
  assert.ok(fadeUp);
  assert.equal(fadeUp.metadata.effectType, "fade-up");
  assert.equal(fadeUp.endMs - fadeUp.startMs, FADE_UP_DURATION_MS);
  assert.ok(fadeUp.metadata.holdDurationMs > 0, "fade-up leaves hold time in long subtitle window");

  const typewriter = animationTrack!.events.find(
    (event) => (event as CaptionAnimationTimelineEvent).metadata.sceneId === "s2",
  ) as CaptionAnimationTimelineEvent;
  assert.ok(typewriter);
  assert.equal(typewriter.metadata.effectType, "typewriter");
  assert.ok(typewriter.endMs <= typewriter.metadata.subtitleEndMs);
});

test("too-short typewriter windows emit caption animation diagnostics", () => {
  const story = buildStory([
    makeScene("s1", 6, {
      subtitleText:
        "He picks it up on the halfway line, beats one, beats two, and curls it into the top corner.",
      subtitleEffect: "typewriter",
    }),
  ]);

  const timeline = buildMasterTimeline(story, { mode: "preview" });
  assert.ok((timeline.diagnostics.captionTooShortForAnimationCount ?? 0) > 0);
  assert.ok(
    timeline.warnings.some((warning) => warning.toLowerCase().includes("caption animation")),
    "summary caption animation warning present",
  );
  assert.ok(
    timeline.warnings.some((warning) => warning.includes("[caption-animation]")),
    "per-chunk caption animation schedule warning present",
  );
});

test("transition scheduling is timeline-driven; preview/export use timeline transition resolver", () => {
  const videoPreview = readSrc("src/features/preview/components/VideoPreview.tsx");
  const videoRender = readSrc("src/features/export/services/video-render.service.ts");
  const playbackUtils = readSrc("src/features/timeline-intelligence/timeline-playback.utils.ts");

  assert.match(videoPreview, /resolvePreviewTransitionOverlay/);
  assert.match(videoRender, /resolveTimelineTransitionOverlay/);
  assert.match(playbackUtils, /getActiveTransitionAtTime/);
  assert.doesNotMatch(videoPreview, /resolveSceneTransitionOverlay/);
  assert.doesNotMatch(videoRender, /resolveSceneTransitionOverlay/);
});

console.log(`\nTimeline Foundation QA: ${passed}/${passed} passed — READY\n`);
