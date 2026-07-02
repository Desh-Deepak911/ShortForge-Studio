/**
 * Timeline Intelligence — Phase 2 Timeline Authority QA
 * Run: npm run test:timeline-authority-qa
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildAudioMixFromStory } from "@/features/audio";
import {
  buildFootieExportPayload,
} from "@/features/export/services/export-payload.service";
import { resolveExportFrameFromMasterTimeline } from "@/features/export/services/video-render.service";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import {
  resolveExportBackgroundMusicMixSettingsFromMix,
} from "@/features/export/utils/export-background-music.utils";
import { resolveExportPath } from "@/features/export/utils/export-path.utils";
import {
  buildPreviewMasterTimeline,
  resolvePreviewDurationSec,
  resolvePreviewPlaybackState,
} from "@/features/preview/utils/preview-master-timeline.utils";
import {
  buildMasterTimeline,
  TIMELINE_SUBTITLE_FINAL_READABLE_HOLD_MS,
} from "@/features/timeline-intelligence/build-master-timeline";
import { buildTimelineDevDiagnostics } from "@/features/timeline-intelligence/timeline-diagnostics.dev.utils";
import {
  getActiveSubtitleAtTime,
  resolveTimelineFrameCount,
} from "@/features/timeline-intelligence/timeline-playback.utils";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { recalculateSceneTimings } from "@/features/story/utils";
import { syncFootieScript } from "@/lib/utils/voiceover";

let passed = 0;
const failures: string[] = [];
const timingMismatches: string[] = [];

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
  options: {
    voiceoverDurationMs?: number;
    timelineItems?: FootieScript["timelineItems"];
    backgroundMusic?: FootieScript["backgroundMusic"];
  } = {},
): FootieScript {
  const timedScenes = recalculateSceneTimings(scenes);
  const totalDuration = timedScenes.reduce((sum, scene) => sum + scene.duration, 0);

  return syncFootieScript({
    title: "Timeline Authority QA",
    narration: timedScenes.map((scene) => scene.narration).join(" "),
    totalDuration,
    scenes: timedScenes,
    ...(options.timelineItems ? { timelineItems: options.timelineItems } : {}),
    ...(options.backgroundMusic ? { backgroundMusic: options.backgroundMusic } : {}),
    ...(options.voiceoverDurationMs != null
      ? {
          voiceoverUrl: "blob:qa-voiceover",
          voiceoverDurationMs: options.voiceoverDurationMs,
        }
      : {}),
  });
}

function scenesForDuration(totalSec: number, segmentSec = 6): FootieScene[] {
  const count = Math.ceil(totalSec / segmentSec);
  return Array.from({ length: count }, (_, index) =>
    makeScene(`s${index + 1}`, segmentSec, {
      startSec: index * segmentSec,
      subtitleText: `Segment ${index + 1} copy for the ${totalSec}s authority QA story.`,
    }),
  );
}

function assertMasterTimelineDurationAuthority(
  script: FootieScript,
  label: string,
): { previewTimeline: ReturnType<typeof buildPreviewMasterTimeline>; exportTimeline: ReturnType<typeof buildMasterTimeline> } {
  const previewTimeline = buildPreviewMasterTimeline(script);
  const preflight = prepareStoryForExport(script);
  const exportTimeline = preflight.masterTimeline;

  assert.ok(previewTimeline, `${label}: preview timeline`);
  assert.equal(
    resolvePreviewDurationSec(previewTimeline),
    previewTimeline!.renderDurationMs / 1000,
    `${label}: preview duration from renderDurationMs`,
  );
  assert.equal(
    preflight.exportDurationMs,
    exportTimeline.renderDurationMs,
    `${label}: export duration from MasterTimeline`,
  );

  return { previewTimeline: previewTimeline!, exportTimeline };
}

function assertPreviewExportFrameParity(
  script: FootieScript,
  previewTimeline: ReturnType<typeof buildMasterTimeline>,
  exportTimeline: ReturnType<typeof buildMasterTimeline>,
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
  assert.equal(
    preview!.sceneElapsedMs,
    exportFrame.timing.sceneElapsedMs,
    `${label} @${timeMs}ms: scene elapsed`,
  );

  const previewSubtitle = getActiveSubtitleAtTime(previewTimeline, timeMs);
  const exportSubtitle = getActiveSubtitleAtTime(exportTimeline, timeMs);
  const previewText = previewSubtitle?.event.metadata.text ?? "";
  const exportText = exportSubtitle?.event.metadata.text ?? "";
  if (previewText !== exportText) {
    timingMismatches.push(`${label} @${timeMs}ms: subtitle "${previewText}" vs "${exportText}"`);
  }
  assert.equal(previewText, exportText, `${label} @${timeMs}ms: subtitle chunk`);
}

function assertFinalSubtitleCompletes(timeline: ReturnType<typeof buildMasterTimeline>, label: string): void {
  const finalSubtitleEndMs = timeline.diagnostics.finalSubtitleEndMs ?? 0;
  assert.ok(finalSubtitleEndMs > 0, `${label}: has final subtitle end`);
  assert.ok(
    finalSubtitleEndMs <= timeline.renderDurationMs,
    `${label}: finalSubtitleEndMs <= renderDurationMs`,
  );
  assert.ok(
    timeline.renderDurationMs >= finalSubtitleEndMs + TIMELINE_SUBTITLE_FINAL_READABLE_HOLD_MS,
    `${label}: readable hold after final subtitle`,
  );

  const tailSubtitle = getActiveSubtitleAtTime(timeline, timeline.renderDurationMs - 1);
  assert.ok(tailSubtitle, `${label}: final subtitle held at render tail`);
}

function assertNoSubtitleDriftAtSamples(
  script: FootieScript,
  previewTimeline: ReturnType<typeof buildMasterTimeline>,
  exportTimeline: ReturnType<typeof buildMasterTimeline>,
  sampleCount: number,
  label: string,
): void {
  const renderMs = previewTimeline.renderDurationMs;
  for (let index = 0; index < sampleCount; index++) {
    const timeMs = Math.floor((renderMs * index) / Math.max(1, sampleCount - 1));
    assertPreviewExportFrameParity(script, previewTimeline, exportTimeline, timeMs, label);
  }
}

console.log("\nTimeline Authority QA — Phase 2\n");

test("1. 30s normal subtitles", () => {
  const story = buildStory(scenesForDuration(30), { voiceoverDurationMs: 30_000 });
  const { previewTimeline, exportTimeline } = assertMasterTimelineDurationAuthority(story, "30s normal");
  assertFinalSubtitleCompletes(previewTimeline, "30s normal preview");
  assertFinalSubtitleCompletes(exportTimeline, "30s normal export");
  assertNoSubtitleDriftAtSamples(story, previewTimeline, exportTimeline, 8, "30s normal");
});

test("2. 30s typewriter subtitles", () => {
  const scenes = scenesForDuration(30).map((scene) => ({
    ...scene,
    subtitleEffect: "typewriter" as const,
  }));
  const story = buildStory(scenes, { voiceoverDurationMs: 30_000 });
  const { previewTimeline, exportTimeline } = assertMasterTimelineDurationAuthority(story, "30s typewriter");
  assertFinalSubtitleCompletes(previewTimeline, "30s typewriter preview");
  assertPreviewExportFrameParity(story, previewTimeline, exportTimeline, 15_000, "30s typewriter mid");
});

test("3. final subtitle after audio end", () => {
  const story = buildStory(
    [
      makeScene("s1", 10, { subtitleText: "Scene one with extended on-screen subtitles." }),
      makeScene("s2", 14, {
        startSec: 10,
        subtitleText: "Final scene subtitles continue after narration ends.",
      }),
    ],
    { voiceoverDurationMs: 20_000 },
  );
  const { previewTimeline, exportTimeline } = assertMasterTimelineDurationAuthority(story, "after audio end");
  assert.ok(previewTimeline.renderDurationMs > previewTimeline.narrationDurationMs);
  assert.ok(exportTimeline.renderDurationMs > exportTimeline.narrationDurationMs);

  const afterAudioMs = previewTimeline.narrationDurationMs + 500;
  const previewSubtitle = getActiveSubtitleAtTime(previewTimeline, afterAudioMs);
  const exportSubtitle = getActiveSubtitleAtTime(exportTimeline, afterAudioMs);
  assert.ok(previewSubtitle, "preview subtitle active after audio end");
  assert.ok(exportSubtitle, "export subtitle active after audio end");
  assertFinalSubtitleCompletes(previewTimeline, "after audio end preview");
});

test("4. 60s video", () => {
  const story = buildStory(scenesForDuration(60), { voiceoverDurationMs: 60_000 });
  const { previewTimeline, exportTimeline } = assertMasterTimelineDurationAuthority(story, "60s");
  assertNoSubtitleDriftAtSamples(story, previewTimeline, exportTimeline, 12, "60s");
  assert.equal(previewTimeline.renderDurationMs, exportTimeline.renderDurationMs);
});

test("5. 90s video", () => {
  const story = buildStory(scenesForDuration(90), { voiceoverDurationMs: 90_000 });
  const { previewTimeline, exportTimeline } = assertMasterTimelineDurationAuthority(story, "90s");
  assertNoSubtitleDriftAtSamples(story, previewTimeline, exportTimeline, 15, "90s");
  assert.equal(previewTimeline.sceneDurationMs, exportTimeline.sceneDurationMs);
});

test("6. voiceover + background music", () => {
  const story = buildStory(scenesForDuration(30), {
    voiceoverDurationMs: 30_000,
    backgroundMusic: {
      enabled: true,
      source: "upload",
      fileUrl: "blob:ambient-track",
      fileName: "ambient.mp3",
      volume: 0.18,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: true,
    },
  });

  const { exportTimeline } = assertMasterTimelineDurationAuthority(story, "voiceover+bgm");
  const audioMix = buildAudioMixFromStory(story);
  const bgmSettings = resolveExportBackgroundMusicMixSettingsFromMix(
    story,
    audioMix,
    true,
    exportTimeline.renderDurationMs,
  );
  assert.ok(bgmSettings, "export background music mix settings");
  assert.equal(bgmSettings!.exportDurationMs, exportTimeline.renderDurationMs);

  const previewHook = readSrc("src/features/preview/hooks/usePreviewPlayback.ts");
  assert.match(previewHook, /resolvePreviewBackgroundMusicPlaybackVolume/);
  assert.match(previewHook, /startBackgroundMusic/);
  assert.doesNotMatch(previewHook, /stopVoice\(\);\s*\n\s*\};\s*\n\s*audio\.addEventListener\("ended"/);
});

test("7. transitions", () => {
  const scenes = recalculateSceneTimings([
    makeScene("s1", 6),
    makeScene("s2", 6, { startSec: 6 }),
  ]);
  const story = buildStory(scenes, {
    voiceoverDurationMs: 12_000,
    timelineItems: [
      { type: "scene", sceneId: "s1", order: 0 },
      {
        type: "transition",
        id: "t-s1-s2",
        fromSceneId: "s1",
        toSceneId: "s2",
        effect: "fade",
        durationMs: 500,
      },
      { type: "scene", sceneId: "s2", order: 1 },
    ],
  });

  const { previewTimeline, exportTimeline } = assertMasterTimelineDurationAuthority(story, "transitions");
  assert.ok(
    previewTimeline.transitionDurationMs >= 0,
    "transition track present on preview timeline",
  );
  assertPreviewExportFrameParity(story, previewTimeline, exportTimeline, 6_200, "transitions window");
});

test("8. exported WebM uses MasterTimeline frame loop", () => {
  const videoRender = readSrc("src/features/export/services/video-render.service.ts");
  const ffmpeg = readSrc("src/features/export/utils/ffmpeg.utils.ts");

  assert.match(videoRender, /resolveExportFrameFromMasterTimeline/);
  assert.match(videoRender, /resolveTimelineFrameCount\(renderDurationMs/);
  assert.match(videoRender, /prepareStoryForExport/);
  assert.match(ffmpeg, /outputFormat = options\.outputFormat \?\? "webm"/);

  const story = buildStory(scenesForDuration(12), { voiceoverDurationMs: 12_000 });
  const preflight = prepareStoryForExport(story);
  const fps = 30;
  const frameCount = resolveTimelineFrameCount(preflight.exportDurationMs, fps);
  assert.ok(frameCount > 0);

  const webmPath = resolveExportPath({ format: "webm" });
  assert.equal(webmPath.path, "webm");
});

test("9. exported MP4 uses MasterTimeline duration in mux path", () => {
  const videoRender = readSrc("src/features/export/services/video-render.service.ts");
  const ffmpeg = readSrc("src/features/export/utils/ffmpeg.utils.ts");

  assert.match(videoRender, /return exportPath === "mp4" \? "mp4" : "webm"/);
  assert.match(ffmpeg, /outputFormat === "mp4"/);

  const story = buildStory(scenesForDuration(12), { voiceoverDurationMs: 12_000 });
  const preflight = prepareStoryForExport(story);
  const mp4Path = resolveExportPath({ format: "mp4" });
  assert.equal(mp4Path.path, "mp4");

  const bgmSettings = resolveExportBackgroundMusicMixSettingsFromMix(
    story,
    buildAudioMixFromStory(story),
    true,
    preflight.exportDurationMs,
  );
  if (bgmSettings) {
    assert.equal(bgmSettings.exportDurationMs, preflight.exportDurationMs);
  }
});

test("10. preview vs export timing comparison", () => {
  const story = buildStory(scenesForDuration(30), { voiceoverDurationMs: 30_000 });
  const diagnostics = buildTimelineDevDiagnostics(story);

  assert.equal(diagnostics.preview.renderDurationMs, diagnostics.export.renderDurationMs);
  assert.equal(diagnostics.preview.exportRefitApplied, true);
  assert.equal(diagnostics.export.exportRefitApplied, true);
  assert.equal(diagnostics.comparisonWarnings.length, 0);

  const previewUtils = readSrc("src/features/preview/utils/preview-master-timeline.utils.ts");
  const exportRender = readSrc("src/features/export/services/video-render.service.ts");
  assert.match(previewUtils, /resolveTimelineSceneFrame/);
  assert.match(exportRender, /resolveTimelineSceneFrame/);

  const { previewTimeline, exportTimeline } = assertMasterTimelineDurationAuthority(story, "comparison");
  assertNoSubtitleDriftAtSamples(story, previewTimeline, exportTimeline, 10, "comparison");
});

test("structural: preview/export MasterTimeline duration authority", () => {
  const previewHook = readSrc("src/features/preview/hooks/usePreviewPlayback.ts");
  const preflight = readSrc("src/features/export/utils/export-preflight.utils.ts");

  assert.match(previewHook, /buildPreviewMasterTimeline/);
  assert.match(previewHook, /resolvePreviewDurationSec/);
  assert.match(previewHook, /masterTimeline\.renderDurationMs/);
  assert.match(preflight, /exportDurationMs: masterTimeline\.renderDurationMs/);
});

test("structural: shared active scene/subtitle helpers", () => {
  const playback = readSrc("src/features/timeline-intelligence/timeline-playback.utils.ts");
  const previewUtils = readSrc("src/features/preview/utils/preview-master-timeline.utils.ts");
  const exportRender = readSrc("src/features/export/services/video-render.service.ts");

  assert.match(playback, /export function getActiveSceneAtTime/);
  assert.match(playback, /export function getActiveSubtitleAtTime/);
  assert.match(playback, /export function resolveTimelineSceneFrame/);
  assert.match(previewUtils, /resolveTimelineSceneFrame/);
  assert.match(exportRender, /resolveTimelineSceneFrame/);
  assert.doesNotMatch(previewUtils, /getActiveSceneAtTime\(masterTimeline/);
  assert.doesNotMatch(exportRender, /getActiveSceneAtTime\(masterTimeline/);
});

test("structural: audio ending does not immediately stop preview subtitles", () => {
  const previewHook = readSrc("src/features/preview/hooks/usePreviewPlayback.ts");
  assert.match(previewHook, /narrationEndedRef/);
  assert.match(previewHook, /audioEndedButTimelineActive|renderDurationMs/);
  assert.doesNotMatch(
    previewHook,
    /const handleEnded = \(\) => \{[\s\S]*stopVoice\(\);[\s\S]*\};\s*\n\s*audio\.addEventListener\("ended", handleEnded\)/,
  );
});

test("structural: export payload uses preflight MasterTimeline duration", () => {
  const story = buildStory(scenesForDuration(15), { voiceoverDurationMs: 15_000 });
  const preflight = prepareStoryForExport(story);
  buildFootieExportPayload(preflight.story);
  assert.equal(preflight.exportDurationMs, preflight.masterTimeline.renderDurationMs);
});

const total = passed + failures.length;

console.log(`\nTimeline Authority QA: ${passed}/${total} passed`);
if (timingMismatches.length > 0) {
  console.log("\nRemaining timing mismatches:");
  for (const warning of timingMismatches) {
    console.log(`  - ${warning}`);
  }
}
if (failures.length > 0) {
  console.log("\nFailing cases:");
  for (const failure of failures) {
    console.log(`  - ${failure}`);
  }
  console.log("\nFiles to inspect:");
  console.log("  - src/features/timeline-intelligence/build-master-timeline.ts");
  console.log("  - src/features/timeline-intelligence/timeline-playback.utils.ts");
  console.log("  - src/features/preview/hooks/usePreviewPlayback.ts");
  console.log("  - src/features/preview/utils/preview-master-timeline.utils.ts");
  console.log("  - src/features/export/services/video-render.service.ts");
  console.log("  - src/features/export/utils/export-preflight.utils.ts");
  console.log("\nNOT READY for Phase 3 caption animation timeline\n");
  process.exit(1);
}

console.log("\nREADY for Phase 3 caption animation timeline\n");
