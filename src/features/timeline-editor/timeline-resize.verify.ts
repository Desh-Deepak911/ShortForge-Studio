/**
 * Timeline right-edge duration resize — 4.0B-2 / 4.0B-3 / 4.0B-4.
 * Run: npm run test:timeline-resize
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { FootieScene, FootieScript } from "@/features/story/types";
import { applySceneUpdate, syncFootieScript } from "@/lib/utils/voiceover";

import type { TimelineLayoutVM, TimelineResizeState } from "./timeline-editor.types";
import {
  applyResizePreviewToLayout,
  nudgeDurationSec,
  resolveDurationNudgeDeltaSec,
  resolveResizedDurationSec,
  TIMELINE_RESIZE_MAX_DURATION_SEC,
  TIMELINE_RESIZE_MIN_DURATION_SEC,
} from "./timeline-resize.utils";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

test("resize utility converts px delta to duration", () => {
  // 1000px rail, 10_000ms total → 0.1 px/ms. +100px → +1000ms → +1s.
  const next = resolveResizedDurationSec({
    startDurationMs: 3000,
    pointerDeltaX: 100,
    railWidthPx: 1000,
    totalDurationMs: 10_000,
  });
  assert.equal(next, 4);
});

test("clamps duration to 1–20s", () => {
  const tooSmall = resolveResizedDurationSec({
    startDurationMs: 2000,
    pointerDeltaX: -10_000,
    railWidthPx: 1000,
    totalDurationMs: 10_000,
  });
  assert.equal(tooSmall, TIMELINE_RESIZE_MIN_DURATION_SEC);

  const tooLarge = resolveResizedDurationSec({
    startDurationMs: 5000,
    pointerDeltaX: 50_000,
    railWidthPx: 1000,
    totalDurationMs: 10_000,
  });
  assert.equal(tooLarge, TIMELINE_RESIZE_MAX_DURATION_SEC);
});

test("snaps to 1s", () => {
  // +0.4s → rounds to start; +0.6s → +1s.
  const down = resolveResizedDurationSec({
    startDurationMs: 3000,
    pointerDeltaX: 40,
    railWidthPx: 1000,
    totalDurationMs: 10_000,
  });
  assert.equal(down, 3);

  const up = resolveResizedDurationSec({
    startDurationMs: 3000,
    pointerDeltaX: 60,
    railWidthPx: 1000,
    totalDurationMs: 10_000,
  });
  assert.equal(up, 4);
});

test("resize preview updates active block width without mutating others' durations", () => {
  const layout: TimelineLayoutVM = {
    layoutSource: "master-timeline",
    totalDurationMs: 10_000,
    segments: [
      {
        type: "scene",
        block: {
          sceneId: "s1",
          sceneIndex: 0,
          sceneNumber: 1,
          startMs: 0,
          endMs: 3000,
          durationMs: 3000,
          widthPercent: 30,
          durationLabelSec: 3,
        },
      },
      {
        type: "scene",
        block: {
          sceneId: "s2",
          sceneIndex: 1,
          sceneNumber: 2,
          startMs: 3000,
          endMs: 10_000,
          durationMs: 7000,
          widthPercent: 70,
          durationLabelSec: 7,
        },
      },
    ],
  };

  const resizeState: TimelineResizeState = {
    sceneId: "s1",
    startDurationMs: 3000,
    startClientX: 0,
    railWidthPx: 1000,
    totalDurationMs: 10_000,
    previewDurationSec: 5,
  };

  const preview = applyResizePreviewToLayout(layout, resizeState);
  assert.equal(preview.totalDurationMs, 12_000);
  assert.equal(preview.segments[0]?.type, "scene");
  assert.equal(preview.segments[1]?.type, "scene");
  if (preview.segments[0]?.type === "scene" && preview.segments[1]?.type === "scene") {
    assert.equal(preview.segments[0].block.durationMs, 5000);
    assert.equal(preview.segments[1].block.durationMs, 7000);
    assert.ok(Math.abs(preview.segments[0].block.widthPercent - (5000 / 12_000) * 100) < 0.001);
  }
});

test("reorder and resize states are separate in StudioTimeline", () => {
  const timeline = readSrc("src/features/timeline-editor/StudioTimeline.tsx");
  assert.match(timeline, /TimelineDragState/);
  assert.match(timeline, /TimelineResizeState/);
  assert.match(timeline, /handleResizeHandlePointerDown/);
  assert.match(timeline, /handleDragHandlePointerDown/);
  assert.match(timeline, /applySceneUpdate/);
  assert.match(timeline, /duration: durationSec/);
  assert.match(timeline, /playbackLocked \|\| dragStateRef\.current/);
  assert.match(timeline, /playbackLocked \|\| resizeStateRef\.current/);

  const resizeMoveStart = timeline.indexOf("const handlePointerMove = (event: PointerEvent) => {\n      const current = resizeStateRef");
  const resizeMoveEnd = timeline.indexOf("const commitResize = () => {");
  assert.ok(resizeMoveStart > 0 && resizeMoveEnd > resizeMoveStart);
  const resizeMoveBody = timeline.slice(resizeMoveStart, resizeMoveEnd);
  assert.doesNotMatch(resizeMoveBody, /onScriptChange|applySceneUpdate/);
  assert.match(timeline.slice(resizeMoveEnd, resizeMoveEnd + 800), /applySceneUpdate/);
});

test("scene block exposes resize handle separate from reorder grip", () => {
  const block = readSrc("src/features/timeline-editor/TimelineSceneBlock.tsx");
  assert.match(block, /Resize scene duration/);
  assert.match(block, /onResizeHandlePointerDown/);
  assert.match(block, /onDragHandlePointerDown/);
  assert.match(block, /data-timeline-resize-handle/);
  assert.match(block, /Reorder scene/);
});

test("ArrowRight increases duration by 1s", () => {
  assert.equal(resolveDurationNudgeDeltaSec("ArrowRight", false), 1);
  assert.equal(nudgeDurationSec(3, 1), 4);
});

test("ArrowLeft decreases duration by 1s", () => {
  assert.equal(resolveDurationNudgeDeltaSec("ArrowLeft", false), -1);
  assert.equal(nudgeDurationSec(3, -1), 2);
});

test("Shift+ArrowRight increases by 5s", () => {
  assert.equal(resolveDurationNudgeDeltaSec("ArrowRight", true), 5);
  assert.equal(nudgeDurationSec(3, 5), 8);
});

test("Shift+ArrowLeft decreases by 5s", () => {
  assert.equal(resolveDurationNudgeDeltaSec("ArrowLeft", true), -5);
  assert.equal(nudgeDurationSec(8, -5), 3);
});

test("keyboard nudge clamps duration to 1–20s", () => {
  assert.equal(nudgeDurationSec(1, -1), TIMELINE_RESIZE_MIN_DURATION_SEC);
  assert.equal(nudgeDurationSec(2, -5), TIMELINE_RESIZE_MIN_DURATION_SEC);
  assert.equal(nudgeDurationSec(20, 1), TIMELINE_RESIZE_MAX_DURATION_SEC);
  assert.equal(nudgeDurationSec(18, 5), TIMELINE_RESIZE_MAX_DURATION_SEC);
});

test("role and aria attributes exist on resize handle", () => {
  const block = readSrc("src/features/timeline-editor/TimelineSceneBlock.tsx");
  assert.match(block, /role="slider"/);
  assert.match(block, /aria-label="Resize scene duration"/);
  assert.match(block, /aria-valuemin=\{TIMELINE_RESIZE_MIN_DURATION_SEC\}/);
  assert.match(block, /aria-valuemax=\{TIMELINE_RESIZE_MAX_DURATION_SEC\}/);
  assert.match(block, /aria-valuenow=\{durationSec\}/);
  assert.match(block, /aria-valuetext=\{`\$\{durationSec\}/);
  assert.match(block, /Pause playback to resize scene duration/);
});

test("coarse pointer handle class exists", () => {
  const ui = readSrc("src/features/timeline-editor/timeline-editor.ui.ts");
  assert.match(ui, /timelineSceneBlockResizeHandle/);
  assert.match(ui, /@media\(pointer:coarse\)]:w-5/);
  assert.match(ui, /@media\(pointer:coarse\)]:opacity-100/);
  assert.match(ui, /timelineEditorRailResizing/);
  assert.match(ui, /touch-none/);
});

test("keyboard nudge uses same commit path", () => {
  const timeline = readSrc("src/features/timeline-editor/StudioTimeline.tsx");
  const block = readSrc("src/features/timeline-editor/TimelineSceneBlock.tsx");
  assert.match(timeline, /handleDurationNudge/);
  assert.match(timeline, /nudgeDurationSec/);
  assert.match(timeline, /onDurationNudge/);
  assert.match(block, /onDurationNudge/);
  assert.match(block, /resolveDurationNudgeDeltaSec/);

  const nudgeStart = timeline.indexOf("const handleDurationNudge = useCallback(");
  const nudgeEnd = timeline.indexOf("const handleResizeHandlePointerDown = useCallback(");
  assert.ok(nudgeStart > 0 && nudgeEnd > nudgeStart);
  const nudgeBody = timeline.slice(nudgeStart, nudgeEnd);
  assert.match(nudgeBody, /applySceneUpdate/);
  assert.match(nudgeBody, /duration: nextDurationSec/);
  assert.doesNotMatch(nudgeBody, /selectScene/);
});

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
    image: {
      url: `https://example.com/${id}.jpg`,
      scale: 1.2,
      x: 0.1,
      y: -0.05,
      fitMode: "fill",
      imageMotion: { type: "zoom-in", intensity: "medium" },
    },
  };
}

function buildStory(scenes: FootieScene[]): FootieScript {
  return syncFootieScript({
    title: "Resize QA story",
    narration: "Resize QA narration.",
    scenes,
    totalDuration: scenes.reduce((sum, scene) => sum + scene.duration, 0),
  });
}

function layoutForScenes(
  scenes: Array<{ id: string; durationMs: number }>,
): TimelineLayoutVM {
  const totalDurationMs = scenes.reduce((sum, scene) => sum + scene.durationMs, 0);
  let cursor = 0;
  return {
    layoutSource: "master-timeline",
    totalDurationMs,
    segments: scenes.map((scene, index) => {
      const startMs = cursor;
      const endMs = startMs + scene.durationMs;
      cursor = endMs;
      return {
        type: "scene" as const,
        block: {
          sceneId: scene.id,
          sceneIndex: index,
          sceneNumber: index + 1,
          startMs,
          endMs,
          durationMs: scene.durationMs,
          widthPercent: (scene.durationMs / totalDurationMs) * 100,
          durationLabelSec: scene.durationMs / 1000,
        },
      };
    }),
  };
}

test("first and last scene resize allowed", () => {
  const layout = layoutForScenes([
    { id: "first", durationMs: 3000 },
    { id: "middle", durationMs: 4000 },
    { id: "last", durationMs: 5000 },
  ]);

  const firstPreview = applyResizePreviewToLayout(layout, {
    sceneId: "first",
    startDurationMs: 3000,
    startClientX: 0,
    railWidthPx: 1200,
    totalDurationMs: 12_000,
    previewDurationSec: 6,
  });
  assert.equal(firstPreview.totalDurationMs, 15_000);
  assert.equal(
    firstPreview.segments[0]?.type === "scene"
      ? firstPreview.segments[0].block.durationMs
      : 0,
    6000,
  );

  const lastPreview = applyResizePreviewToLayout(layout, {
    sceneId: "last",
    startDurationMs: 5000,
    startClientX: 0,
    railWidthPx: 1200,
    totalDurationMs: 12_000,
    previewDurationSec: 2,
  });
  assert.equal(lastPreview.totalDurationMs, 9000);
  assert.equal(
    lastPreview.segments[2]?.type === "scene"
      ? lastPreview.segments[2].block.durationMs
      : 0,
    2000,
  );

  const story = buildStory([
    makeScene("first", 3),
    makeScene("middle", 4),
    makeScene("last", 5),
  ]);
  const resizedFirst = applySceneUpdate(story, "first", { duration: 7 });
  const resizedLast = applySceneUpdate(story, "last", { duration: 2 });
  assert.equal(resizedFirst.scenes[0]?.duration, 7);
  assert.equal(resizedFirst.scenes[0]?.durationSource, "manual");
  assert.equal(resizedLast.scenes[2]?.duration, 2);
  assert.equal(resizedLast.scenes[2]?.durationSource, "manual");
});

test("locked resize disabled", () => {
  const timeline = readSrc("src/features/timeline-editor/StudioTimeline.tsx");
  const block = readSrc("src/features/timeline-editor/TimelineSceneBlock.tsx");
  assert.match(timeline, /const playbackLocked = selection\.phase === SelectionPhase\.PlaybackLocked/);
  assert.match(timeline, /const resizeDisabled = playbackLocked \|\| dragState != null/);
  assert.match(timeline, /resizeDisabled=\{resizeDisabled\}/);
  assert.match(block, /Pause playback to resize scene duration/);
});

test("inspector helper copy present", () => {
  const inspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  assert.match(inspector, /inspector-duration-\$\{scene\.id\}/);
  assert.match(inspector, /\n\s*Duration\n/);
  assert.match(
    inspector,
    /Drag scene edges on the timeline for faster timing edits\./,
  );
});

test("timeline duration hint present", () => {
  const timeline = readSrc("src/features/timeline-editor/StudioTimeline.tsx");
  const ui = readSrc("src/features/timeline-editor/timeline-editor.ui.ts");
  assert.match(timeline, /data-timeline-duration-hint/);
  assert.match(timeline, /Drag a scene edge to adjust duration\./);
  assert.match(ui, /timelineEditorDurationHint/);
});

test("resizing preserves caption image and motion fields", () => {
  const story = buildStory([makeScene("s1", 3), makeScene("s2", 4)]);
  const before = story.scenes[0]!;
  const after = applySceneUpdate(story, "s1", { duration: 8 });
  const updated = after.scenes[0]!;

  assert.equal(updated.duration, 8);
  assert.equal(updated.durationMs, 8000);
  assert.equal(updated.durationSource, "manual");
  assert.equal(updated.subtitle, before.subtitle);
  assert.equal(updated.subtitleText, before.subtitleText);
  assert.equal(updated.narration, before.narration);
  assert.equal(updated.image?.url, before.image?.url);
  assert.equal(updated.image?.scale, before.image?.scale);
  assert.equal(updated.image?.imageMotion?.type, before.image?.imageMotion?.type);
  assert.equal(updated.image?.imageMotion?.intensity, before.image?.imageMotion?.intensity);
  assert.equal(after.scenes[1]?.duration, 4);
  assert.equal(after.scenes[1]?.startMs, 8000);
});

test("Escape cancel does not commit", () => {
  const timeline = readSrc("src/features/timeline-editor/StudioTimeline.tsx");
  const escapeStart = timeline.indexOf('if (event.key === "Escape")');
  // Prefer the resize-session Escape handler (second occurrence after reorder).
  const resizeEscapeStart = timeline.indexOf(
    'if (event.key === "Escape") {\n        resizeStateRef.current = null',
  );
  assert.ok(resizeEscapeStart > 0);
  const escapeBody = timeline.slice(resizeEscapeStart, resizeEscapeStart + 120);
  assert.match(escapeBody, /resizeStateRef\.current = null/);
  assert.match(escapeBody, /setResizeState\(null\)/);
  assert.doesNotMatch(escapeBody, /applySceneUpdate|onScriptChange/);
  void escapeStart;
});

console.log(`\ntimeline-resize: ${passed} passed`);
