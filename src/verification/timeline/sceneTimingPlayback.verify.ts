import assert from "node:assert/strict";

import type { FootieScene } from "@/features/story/types";
import {
  applyManualDurationPatch,
  getActiveSceneAtTime,
  getSceneTimingMap,
  recalculateSceneTimings,
} from "@/features/story/utils";

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
    subtitle: `Scene ${id}`,
  };
}

test("getSceneTimingMap accumulates per-scene durations", () => {
  const scenes = recalculateSceneTimings([makeScene("1", 3), makeScene("2", 7)]);

  assert.deepEqual(getSceneTimingMap(scenes), [
    { sceneId: "1", index: 0, startMs: 0, endMs: 3000, durationMs: 3000 },
    { sceneId: "2", index: 1, startMs: 3000, endMs: 10000, durationMs: 7000 },
  ]);
});

test("getActiveSceneAtTime resolves scene windows from accumulated durations", () => {
  const scenes = recalculateSceneTimings([makeScene("1", 3), makeScene("2", 7)]);

  assert.equal(getActiveSceneAtTime(scenes, 0)?.index, 0);
  assert.equal(getActiveSceneAtTime(scenes, 2999)?.index, 0);
  assert.equal(getActiveSceneAtTime(scenes, 3000)?.index, 1);
  assert.equal(getActiveSceneAtTime(scenes, 9999)?.index, 1);
});

test("getSceneTimingMap prefers durationMs when present", () => {
  const scenes = [
    {
      ...makeScene("1", 7),
      durationMs: 3000,
      startMs: 0,
      endMs: 7000,
    },
    makeScene("2", 7),
  ];

  const map = getSceneTimingMap(scenes);
  assert.equal(map[0]?.durationMs, 3000);
  assert.equal(map[0]?.endMs, 3000);
  assert.equal(getActiveSceneAtTime(scenes, 2999)?.index, 0);
  assert.equal(getActiveSceneAtTime(scenes, 3000)?.index, 1);
});

test("edited durations stay in sync after recalculateSceneTimings", () => {
  const scenes = recalculateSceneTimings([
    {
      ...makeScene("1", 7),
      durationMs: 7000,
      startMs: 0,
      endMs: 7000,
    },
    makeScene("2", 3),
  ]);

  const edited = recalculateSceneTimings(
    scenes.map((scene, index) =>
      index === 0 ? { ...scene, duration: 3, durationMs: 3000, durationSource: "manual" } : scene,
    ),
  );

  assert.equal(edited[0]?.durationMs, 3000);
  assert.equal(edited[0]?.durationSource, "manual");
  assert.equal(edited[0]?.startMs, 0);
  assert.equal(edited[0]?.endMs, 3000);
  assert.equal(edited[1]?.startMs, 3000);
  assert.equal(edited[1]?.endMs, 6000);
  assert.equal(getActiveSceneAtTime(edited, 3000)?.index, 1);
});

test("applyManualDurationPatch sets durationMs and durationSource", () => {
  const patch = applyManualDurationPatch(3);
  assert.deepEqual(patch, {
    duration: 3,
    durationMs: 3000,
    durationSource: "manual",
  });

  const scenes = recalculateSceneTimings([
    { ...makeScene("1", 7), ...patch },
    makeScene("2", 3),
  ]);
  assert.equal(scenes[0]?.endMs, 3000);
  assert.equal(scenes[1]?.startMs, 3000);
});

console.log("All scene timing playback checks passed.");
