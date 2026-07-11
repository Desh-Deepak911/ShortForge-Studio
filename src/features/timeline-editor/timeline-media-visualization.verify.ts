/**
 * Timeline media visualization — 4.2B-11 (presentation only)
 * Run: npm run test:timeline-media-viz
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { FootieScene } from "@/features/story/types";

import {
  formatTimelineMediaSeconds,
  resolveTimelineMediaKind,
  resolveTimelineMediaVisualization,
  resolveTimelineMediaVizDensity,
  TIMELINE_MEDIA_VIZ_WIDTH,
} from "./timeline-media-visualization.utils";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function videoScene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 5,
    duration: 5,
    durationMs: 5000,
    subtitle: "Caption",
    media: {
      type: "video",
      url: "blob:clip",
      durationMs: 9800,
      trimStartMs: 1000,
      trimEndMs: 5200,
      muted: true,
      posterTimeMs: 2000,
    },
    ...overrides,
  };
}

test("formats compact duration labels", () => {
  assert.equal(formatTimelineMediaSeconds(3200), "3.2s");
  assert.equal(formatTimelineMediaSeconds(9800), "9.8s");
});

test("density gates match documented widths", () => {
  assert.equal(resolveTimelineMediaVizDensity(TIMELINE_MEDIA_VIZ_WIDTH.full), "full");
  assert.equal(resolveTimelineMediaVizDensity(TIMELINE_MEDIA_VIZ_WIDTH.secondary), "secondary");
  assert.equal(resolveTimelineMediaVizDensity(TIMELINE_MEDIA_VIZ_WIDTH.compact), "compact");
  assert.equal(resolveTimelineMediaVizDensity(TIMELINE_MEDIA_VIZ_WIDTH.icon - 1), "icon");
});

test("video visualization exposes clip trim scene and hold", () => {
  const viz = resolveTimelineMediaVisualization({
    scene: videoScene(),
    sceneDurationMs: 5000,
    blockWidthPx: 200,
  });
  assert.equal(viz.kind, "video");
  assert.equal(viz.holdsLastFrame, true);
  assert.match(viz.clipDurationLabel, /Clip 9\.8s/);
  assert.match(viz.trimDurationLabel, /Trim 4\.2s/);
  assert.equal(viz.sceneDurationLabel, "5.0s");
  assert.equal(viz.showHoldBadge, true);
  assert.match(viz.tooltip, /Last frame held/);
  assert.match(viz.ariaSummary, /Hold last frame/);
  assert.equal(viz.isMuted, true);
  assert.equal(viz.hasPoster, true);
});

test("image scenes are distinct from video", () => {
  assert.equal(
    resolveTimelineMediaKind({
      id: "img",
      start: 0,
      end: 3,
      duration: 3,
      subtitle: "",
      media: { type: "image", url: "https://example.com/a.jpg" },
    }),
    "image",
  );
  const block = readSrc("src/features/timeline-editor/TimelineSceneBlock.tsx");
  assert.match(block, /data-timeline-media-badge=\{mediaViz\.kind\}/);
  assert.match(block, /Image scene/);
});

test("missing media is labeled", () => {
  const viz = resolveTimelineMediaVisualization({
    scene: { id: "empty", start: 0, end: 2, duration: 2, subtitle: "" },
    sceneDurationMs: 2000,
    blockWidthPx: 180,
  });
  assert.equal(viz.kind, "missing");
  assert.equal(viz.mediaBadgeLabel, "Missing Media");
  assert.match(viz.tooltip, /Missing media/);
});

test("narrow blocks hide secondary labels", () => {
  const viz = resolveTimelineMediaVisualization({
    scene: videoScene(),
    sceneDurationMs: 5000,
    blockWidthPx: 100,
  });
  assert.equal(viz.density, "compact");
  assert.equal(viz.showClipDurationLabel, false);
  assert.equal(viz.showTrimDurationLabel, false);
  assert.equal(viz.showHoldIconOnly, true);
});

test("presentation module does not touch engines", () => {
  const utils = readSrc(
    "src/features/timeline-editor/timeline-media-visualization.utils.ts",
  );
  assert.match(utils, /Presentation-only/);
  assert.doesNotMatch(utils, /onScriptChange|buildVideoTrimPatch|MasterTimeline/);
  const block = readSrc("src/features/timeline-editor/TimelineSceneBlock.tsx");
  assert.match(block, /data-timeline-hold-frame/);
  assert.match(block, /data-timeline-scene-duration/);
  assert.match(block, /data-timeline-clip-duration/);
  assert.match(block, /data-timeline-trim-duration/);
});

test("trim and resize interactions remain present", () => {
  const block = readSrc("src/features/timeline-editor/TimelineSceneBlock.tsx");
  assert.match(block, /data-timeline-video-trim-handle="start"/);
  assert.match(block, /aria-label="Resize scene duration"/);
  assert.match(block, /aria-label="Trim clip start"/);
});

console.log(`\ntimeline-media-viz: ${passed} passed`);
