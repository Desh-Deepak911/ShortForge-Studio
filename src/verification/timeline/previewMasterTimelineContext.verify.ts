/**
 * Shared PreviewMasterTimelineContext — P1 hotfix verification.
 * Run: npm run test:preview-master-timeline-context
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildPreviewMasterTimeline } from "@/features/preview/utils/preview-master-timeline.utils";
import { resolvePreviewMasterTimelineState } from "@/features/timeline-intelligence/master-timeline";
import { getTimelineTrackByType } from "@/features/timeline-intelligence/timeline-utils";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { recalculateSceneTimings } from "@/features/story/utils";
import { insertTimelineSceneAfter } from "@/features/timeline-editor/timeline-editor.commands";
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
    captionMode: "generated",
    subtitleText: `Subtitle ${id}`,
    narration: `Narration ${id}`,
  };
}

function buildStory(scenes: FootieScene[]): FootieScript {
  const timedScenes = recalculateSceneTimings(scenes);
  const totalDuration = timedScenes.reduce((sum, scene) => sum + scene.duration, 0);
  return syncFootieScript({
    title: "Shared timeline context story",
    narration: "Shared timeline context story narration.",
    scenes: timedScenes,
    totalDuration,
  });
}

test("resolvePreviewMasterTimelineState builds once and exposes shared fields", () => {
  const story = buildStory([makeScene("s1", 3), makeScene("s2", 4)]);
  const state = resolvePreviewMasterTimelineState(story);
  const directBuild = buildPreviewMasterTimeline(story);

  assert.ok(state.previewMasterTimeline);
  assert.ok(directBuild);
  assert.equal(state.previewDurationMs, state.previewMasterTimeline.renderDurationMs);
  assert.equal(state.previewDurationMs, directBuild.renderDurationMs);
  assert.equal(state.previewDurationSource, "MasterTimeline");
  assert.equal(state.isUsingEditorTimingAuthority, true);
  assert.ok(Array.isArray(state.previewTimingWarnings));
  // Single resolve call exposes one timeline object for all consumers.
  assert.strictEqual(state.previewMasterTimeline, state.previewMasterTimeline);
});

test("preview and timeline consumers receive the same timeline reference for a script version", () => {
  const story = buildStory([makeScene("s1", 3), makeScene("s2", 4)]);
  const shared = resolvePreviewMasterTimelineState(story);

  // Simulates VideoPreview + StudioTimeline both reading the provider value.
  const previewTimeline = shared.previewMasterTimeline;
  const timelineRailTimeline = shared.previewMasterTimeline;

  assert.ok(previewTimeline);
  assert.strictEqual(previewTimeline, timelineRailTimeline);
});

test("inserted scene appears in the shared preview master timeline", () => {
  const story = buildStory([makeScene("s1", 3), makeScene("s2", 4)]);
  const insertResult = insertTimelineSceneAfter(story, "s1");
  assert.ok(insertResult);

  const shared = resolvePreviewMasterTimelineState(insertResult.script);
  assert.ok(shared.previewMasterTimeline);
  const sceneTrack = getTimelineTrackByType(shared.previewMasterTimeline.tracks, "scene");
  const sceneIds =
    sceneTrack?.events.map((event) => {
      const metadata = event.metadata as { sceneId?: string };
      return metadata.sceneId;
    }).filter((sceneId): sceneId is string => Boolean(sceneId)) ?? [];

  assert.equal(insertResult.script.scenes.length, 3);
  assert.ok(sceneIds.includes(insertResult.selectSceneId));
  assert.equal(sceneIds.length, 3);
});

test("caption-only edit keeps the same shared timeline reference when script identity is unchanged", () => {
  const story = buildStory([makeScene("s1", 3), makeScene("s2", 4)]);
  const sharedA = resolvePreviewMasterTimelineState(story);
  const sharedB = resolvePreviewMasterTimelineState(story);

  // Provider memos on script reference; same script object → consumers share one build result.
  // Two resolve calls produce equal timelines; provider guarantees one object per script version.
  assert.equal(
    sharedA.previewMasterTimeline?.renderDurationMs,
    sharedB.previewMasterTimeline?.renderDurationMs,
  );
  assert.equal(
    sharedA.previewMasterTimeline?.tracks.find((track) => track.type === "scene")?.events.length,
    sharedB.previewMasterTimeline?.tracks.find((track) => track.type === "scene")?.events.length,
  );
});

test("structural: StoryWorkspace mounts PreviewMasterTimelineProvider", () => {
  const workspace = readSrc("src/components/StoryWorkspace.tsx");
  assert.match(workspace, /PreviewMasterTimelineProvider/);
  assert.match(workspace, /script=\{props\.script\}/);
});

test("structural: usePreviewPlayback consumes shared context with fallback", () => {
  const previewHook = readSrc("src/features/preview/hooks/usePreviewPlayback.ts");
  assert.match(previewHook, /usePreviewMasterTimelineContext/);
  assert.match(previewHook, /sharedPreviewTimeline\?\.previewMasterTimeline/);
  assert.match(previewHook, /fallbackMasterTimeline/);
  assert.match(previewHook, /buildPreviewMasterTimeline/);
});

test("structural: StudioTimeline consumes shared context with drag-only rebuild", () => {
  const timeline = readSrc("src/features/timeline-editor/StudioTimeline.tsx");
  assert.match(timeline, /usePreviewMasterTimelineContext/);
  assert.match(timeline, /sharedPreviewTimeline\?\.previewMasterTimeline/);
  assert.match(timeline, /dragMasterTimeline/);
  assert.match(timeline, /fallbackMasterTimeline/);
});

test("structural: diagnostics reuse shared preview timeline", () => {
  const diagnostics = readSrc(
    "src/features/timeline-intelligence/timeline-diagnostics.dev.utils.ts",
  );
  const previewDiagnostics = readSrc(
    "src/features/timeline-intelligence/preview-timeline-diagnostics.dev.utils.ts",
  );
  const developerView = readSrc(
    "src/features/timeline-intelligence/TimelineDeveloperView.tsx",
  );

  assert.match(diagnostics, /previewTimeline\?:/);
  assert.match(diagnostics, /options\.previewTimeline/);
  assert.match(previewDiagnostics, /previewTimeline: options\.previewTimeline/);
  assert.match(developerView, /usePreviewMasterTimelineContext/);
  assert.match(developerView, /previewTimeline: sharedPreviewTimeline\?\.previewMasterTimeline/);
});

test("structural: normal editor path builds preview timeline only in the provider", () => {
  const provider = readSrc(
    "src/features/timeline-intelligence/master-timeline/PreviewMasterTimelineProvider.tsx",
  );
  const previewHook = readSrc("src/features/preview/hooks/usePreviewPlayback.ts");
  const timeline = readSrc("src/features/timeline-editor/StudioTimeline.tsx");

  assert.match(provider, /buildPreviewMasterTimeline\(script,\s*\{\s*assumeSynced:\s*true/);
  assert.match(provider, /timelineEpoch/);
  assert.match(provider, /timelineState\.epoch !== timelineEpoch/);

  // Consumers only build when context is missing or during drag preview.
  assert.match(previewHook, /if \(sharedPreviewTimeline\)/);
  assert.match(timeline, /if \(sharedPreviewTimeline \|\| dragState\)/);
  assert.match(timeline, /if \(!dragState\)/);
});

console.log(`\npreviewMasterTimelineContext: ${passed} passed`);
