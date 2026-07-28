/**
 * Per-scene preview playback — 4.0E-4
 * Run: npm run test:preview-scene-playback
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { FootieScene } from "@/features/story/types";
import { recalculateSceneTimings } from "@/features/story/utils";
import {
  resolveScenePlaybackBounds,
  resolveScenePlaybackBoundary,
} from "@/features/preview/utils/preview-scene-playback.utils";

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
    subtitle: `Scene ${id}`,
  };
}

test("resolveScenePlaybackBounds prefers scene startMs/endMs", () => {
  const scenes = recalculateSceneTimings([makeScene("s1", 3), makeScene("s2", 4)]);

  assert.deepEqual(resolveScenePlaybackBounds(scenes, 1), {
    sceneId: "s2",
    sceneIndex: 1,
    startMs: 3000,
    endMs: 7000,
  });
});

test("resolveScenePlaybackBoundary stops at scene end when loop is disabled", () => {
  const bounds = {
    sceneId: "s1",
    sceneIndex: 0,
    startMs: 0,
    endMs: 3000,
  };

  assert.equal(resolveScenePlaybackBoundary(2500, bounds, false), null);
  assert.deepEqual(resolveScenePlaybackBoundary(3000, bounds, false), {
    timelineMs: 2999,
    continuePlaying: false,
  });
});

test("resolveScenePlaybackBoundary loops to scene start when enabled", () => {
  const bounds = {
    sceneId: "s1",
    sceneIndex: 0,
    startMs: 1000,
    endMs: 4000,
  };

  assert.deepEqual(resolveScenePlaybackBoundary(4000, bounds, true), {
    timelineMs: 1000,
    continuePlaying: true,
  });
});

test("usePreviewPlayback exposes scene playback scope without a second engine", () => {
  const hook = readSrc("src/features/preview/hooks/usePreviewPlayback.ts");

  assert.match(hook, /PreviewPlaybackScope/);
  assert.match(hook, /playbackScopeRef/);
  assert.match(hook, /loopSceneEnabledRef/);
  assert.match(hook, /scenePlaybackIndexRef/);
  assert.match(hook, /playScenePreview/);
  assert.match(hook, /applyScenePlaybackBoundary/);
  assert.match(hook, /resolvePreviewPlaybackState/);
  assert.doesNotMatch(hook, /createPreviewEngine/);
  assert.doesNotMatch(hook, /PreviewSceneEngine/);
});

test("usePreviewPlayback scene navigation seeks during scene scope playback", () => {
  const hook = readSrc("src/features/preview/hooks/usePreviewPlayback.ts");

  assert.match(hook, /seekSceneDuringPlayback/);
  assert.match(hook, /sceneNavigationWhilePlaying/);
});

test("VideoPreview renders scene playback transport controls beneath preview", () => {
  const preview = readSrc("src/features/preview/components/VideoPreview.tsx");

  assert.match(preview, /Play Story/);
  assert.match(preview, /Play Scene/);
  assert.match(preview, /Loop Scene/);
  assert.match(preview, /playScenePreview/);
  assert.match(preview, /toggleLoopScene/);
  assert.match(preview, /scenePreviewControlsDisabled/);
});

test("scene preview controls stay disabled during image edit mode", () => {
  const preview = readSrc("src/features/preview/components/VideoPreview.tsx");

  assert.match(preview, /scenePreviewControlsDisabled = isFrameEditing/);
  assert.match(preview, /disabled=\{isPlaying \|\| !hasPlayableVoiceover \|\| scenePreviewControlsDisabled\}/);
  assert.match(preview, /disabled=\{scenePreviewControlsDisabled\}/);
});

console.log(`\nAll preview scene playback checks passed (${passed}).`);
