/**
 * Audio-first pipeline verification (run: npm run test:audio-first).
 */
import assert from "node:assert/strict";

import { estimateNarrationDurationMs, getMp3DurationSeconds } from "@/lib/audio";
import type { FootieScene } from "@/features/story/types";
import {
  attachEvenVoiceoverTiming,
  attachSceneNarrationFromScript,
  attachVoiceoverTimingMs,
  fitScenesToTargetDuration,
  getSceneIndexForTime,
  getStoryTotalDuration,
  resolveVoiceoverDurationMs,
  splitNarrationEvenlyBySceneCount,
  splitVoiceoverDurationEvenlyMs,
  withSceneTimingMs,
} from "@/features/story/utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function makeScene(id: string, duration: number): FootieScene {
  return {
    id,
    start: 0,
    end: duration,
    duration,
    subtitle: `Scene ${id}`,
  };
}

console.log("audio-first");

test("fitScenesToTargetDuration preserves scene count and minimum duration", () => {
  const scenes = [makeScene("1", 9), makeScene("2", 9), makeScene("3", 9), makeScene("4", 9), makeScene("5", 9)];
  const fitted = fitScenesToTargetDuration(scenes, 42);

  assert.equal(fitted.length, 5);
  assert.equal(getStoryTotalDuration(fitted), 42);
  assert.ok(fitted.every((scene) => scene.duration >= 1));
  assert.equal(fitted[0]?.start, 0);
  assert.equal(fitted[4]?.end, 42);
});

test("fitScenesToTargetDuration respects proportional weights", () => {
  const scenes = [makeScene("1", 10), makeScene("2", 20), makeScene("3", 10)];
  const fitted = fitScenesToTargetDuration(scenes, 40, [10, 20, 10]);

  assert.equal(getStoryTotalDuration(fitted), 40);
  assert.equal(fitted[1]?.duration, 20);
  assert.equal(fitted[0]?.duration, 10);
  assert.equal(fitted[2]?.duration, 10);
});

test("fitScenesToTargetDuration never shrinks below one second per scene", () => {
  const scenes = [makeScene("1", 5), makeScene("2", 5), makeScene("3", 5)];
  const fitted = fitScenesToTargetDuration(scenes, 2);

  assert.equal(getStoryTotalDuration(fitted), 3);
  assert.deepEqual(
    fitted.map((scene) => scene.duration),
    [1, 1, 1],
  );
});

test("estimateNarrationDurationMs derives duration from word count", () => {
  const durationMs = estimateNarrationDurationMs(
    "one two three four five six seven eight nine ten",
  );

  assert.equal(durationMs, 4567);
});

test("estimateNarrationDurationMs enforces minimum duration", () => {
  assert.equal(estimateNarrationDurationMs(""), 3000);
  assert.equal(estimateNarrationDurationMs("hello"), 3000);
});

test("resolveVoiceoverDurationMs falls back to estimated duration", () => {
  const { durationMs, durationSource } = resolveVoiceoverDurationMs(
    new ArrayBuffer(0),
    "one two three four five six seven eight nine ten",
  );

  assert.equal(durationSource, "estimated");
  assert.equal(durationMs, 4567);
});

test("splitVoiceoverDurationEvenlyMs divides duration across scenes", () => {
  assert.deepEqual(splitVoiceoverDurationEvenlyMs(42_000, 7), [
    6000, 6000, 6000, 6000, 6000, 6000, 6000,
  ]);
});

test("splitNarrationEvenlyBySceneCount divides full script across scenes", () => {
  const narration =
    "For decades this rivalry was more than football it was politics pride and proof";
  const segments = splitNarrationEvenlyBySceneCount(narration, 3);

  assert.equal(segments.length, 3);
  assert.equal(segments.join(" "), narration);
  assert.ok(segments.every((segment) => segment.length > 0));
});

test("attachSceneNarrationFromScript assigns non-AI excerpts to timed scenes", () => {
  const narration = "one two three four five six";
  const timed = attachEvenVoiceoverTiming(
    [makeScene("1", 1), makeScene("2", 1), makeScene("3", 1)],
    9000,
  );
  const scenes = attachSceneNarrationFromScript(timed, narration);

  assert.equal(
    scenes.map((scene) => scene.narration).join(" "),
    narration,
  );
  assert.equal(scenes[0]?.narration, "one two");
  assert.equal(scenes[2]?.narration, "five six");
});

test("attachEvenVoiceoverTiming sets startMs/endMs/durationMs on scenes", () => {
  const scenes = attachEvenVoiceoverTiming(
    [
      makeScene("1", 1),
      makeScene("2", 1),
    ],
    6000,
  );

  assert.equal(scenes[0]?.startMs, 0);
  assert.equal(scenes[0]?.durationMs, 3000);
  assert.equal(scenes[0]?.endMs, 3000);
  assert.equal(scenes[1]?.startMs, 3000);
  assert.equal(scenes[1]?.endMs, 6000);
  assert.equal(scenes[1]?.duration, 3);
  assert.equal(
    scenes.reduce((sum, scene) => sum + (scene.durationMs ?? 0), 0),
    6000,
  );
  assert.equal(getStoryTotalDuration(scenes), 6);
});

test("attachVoiceoverTimingMs matches voiceover duration with weighted scenes", () => {
  const scenes = attachVoiceoverTimingMs(
    [makeScene("1", 10), makeScene("2", 20), makeScene("3", 10)],
    40_000,
    [10, 20, 10],
  );

  assert.equal(
    scenes.reduce((sum, scene) => sum + (scene.durationMs ?? 0), 0),
    40_000,
  );
  assert.equal(scenes[1]?.durationMs, 20_000);
  assert.equal(getStoryTotalDuration(scenes), 40);
});

test("getSceneIndexForTime uses millisecond scene boundaries when present", () => {
  const scenes = attachEvenVoiceoverTiming(
    [makeScene("1", 1), makeScene("2", 1), makeScene("3", 1)],
    9000,
  );

  assert.equal(getSceneIndexForTime(0, scenes), 0);
  assert.equal(getSceneIndexForTime(2.999, scenes), 0);
  assert.equal(getSceneIndexForTime(3.001, scenes), 1);
  assert.equal(getSceneIndexForTime(8.5, scenes), 2);
});

test("withSceneTimingMs adds millisecond fields without removing second fields", () => {
  const scene = withSceneTimingMs(makeScene("1", 9));

  assert.equal(scene.duration, 9);
  assert.equal(scene.start, 0);
  assert.equal(scene.end, 9);
  assert.equal(scene.durationMs, 9000);
  assert.equal(scene.startMs, 0);
  assert.equal(scene.endMs, 9000);
});

test("getMp3DurationSeconds returns zero for empty buffers", () => {
  assert.equal(getMp3DurationSeconds(new ArrayBuffer(0)), 0);
});

test("getMp3DurationSeconds parses a single MPEG1 Layer III frame", () => {
  // 128 kbps, 44100 Hz, no padding — one frame ≈ 26.1 ms
  const frame = Uint8Array.from([
    0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  const duration = getMp3DurationSeconds(frame.buffer);

  assert.ok(duration > 0.02 && duration < 0.03);
});

console.log("All audio-first checks passed.");
