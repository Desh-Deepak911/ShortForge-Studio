/**
 * Subtitle Timing Engine foundation — 4.0C-2.
 * Run: npm run test:subtitle-timing
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildMasterTimeline } from "@/features/timeline-intelligence/build-master-timeline";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { recalculateSceneTimings } from "@/features/story/utils";
import { getSubtitleChunkDurationMs, splitSubtitleChunks } from "@/features/story/utils/subtitle.utils";
import { syncFootieScript } from "@/lib/utils/voiceover";

import {
  allocateWordWeightedChunkWindows,
  applyWordWeightedTimingFeel,
  buildSubtitleTimingMap,
  capWeightedChunkDurations,
  countTimingWords,
  equalSubtitleTimingStrategy,
  getSubtitleTimingStrategy,
  isNarratedSubtitlesScene,
  mapSubtitleTimingChunksToEvents,
  normalizeWeightedDurations,
  resolveDefaultSceneSubtitleChunks,
  resolveSubtitleTimingStrategy,
  SUBTITLE_TIMING_LEAD_IN_MS,
  SUBTITLE_TIMING_MAX_CHUNK_DURATION_MS,
  SUBTITLE_TIMING_MIN_CHUNK_MS,
  splitSubtitleChunks,
  splitSubtitleChunksForWordWeightedTiming,
  wordWeightedSubtitleTimingStrategy,
} from "@/features/subtitle-timing";
import { splitSubtitleChunks as legacySplitSubtitleChunks } from "@/features/story/utils/subtitle.utils";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function makeScene(
  id: string,
  durationSec: number,
  options: {
    subtitleText?: string;
    narration?: string;
    captionMode?: FootieScene["captionMode"];
    subtitle?: string;
  } = {},
): FootieScene {
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
    subtitle: options.subtitle ?? "",
    captionMode: options.captionMode ?? "subtitles",
    subtitleText: options.subtitleText,
    narration: options.narration,
  };
}

function buildStory(
  scenes: FootieScene[],
  options: { voiceoverUrl?: string; voiceoverDurationMs?: number } = {},
): FootieScript {
  const timedScenes = recalculateSceneTimings(scenes);
  const totalDuration = timedScenes.reduce((sum, scene) => sum + scene.duration, 0);
  return syncFootieScript({
    title: "Subtitle timing engine story",
    narration: "Subtitle timing engine narration.",
    scenes: timedScenes,
    totalDuration,
    ...(options.voiceoverUrl ? { voiceoverUrl: options.voiceoverUrl } : {}),
    ...(options.voiceoverDurationMs != null
      ? { voiceoverDurationMs: options.voiceoverDurationMs }
      : {}),
  });
}

const LONG_TEXT =
  "The palace was alive. Music echoing through marble halls as guests gathered for the annual ball.";

const LONG_RUN_ON =
  "The Jabulani was controversial because it moved unpredictably in the air during the World Cup and players struggled to control it.";

test("word-weighted long sentence splits into more readable chunks than legacy split", () => {
  const legacyChunks = legacySplitSubtitleChunks(LONG_RUN_ON);
  const timingChunks = splitSubtitleChunksForWordWeightedTiming(LONG_RUN_ON);

  assert.ok(timingChunks.length >= legacyChunks.length);
  assert.ok(timingChunks.every((chunk) => chunk.split(/\s+/).length <= 4));
  assert.ok(timingChunks.every((chunk) => chunk.length <= 28 || chunk.split(/\s+/).length === 1));
});

test("word-weighted lead-in does not create negative timestamps", () => {
  const scene = makeScene("s1", 8, { subtitleText: LONG_RUN_ON });
  const map = buildSubtitleTimingMap(
    {
      scenes: [scene],
      sceneEvents: [
        { sceneId: "s1", sceneIndex: 0, startMs: 500, endMs: 8500, durationMs: 8000 },
      ],
      totalDurationMs: 8500,
    },
    { strategy: "word_weighted" },
  );

  for (const chunk of map.chunks) {
    assert.ok(chunk.startMs >= 0);
    assert.ok(chunk.startMs >= 500);
    assert.ok(chunk.endMs <= 8500);
    assert.ok(chunk.endMs >= chunk.startMs);
  }

  for (let index = 1; index < map.chunks.length; index++) {
    const previous = map.chunks[index - 1]!;
    const current = map.chunks[index]!;
    assert.ok(current.startMs <= previous.endMs);
    assert.ok(previous.endMs - current.startMs <= SUBTITLE_TIMING_LEAD_IN_MS + 48);
  }
});

test("word-weighted chunks remain within scene window after timing feel", () => {
  const scenes = recalculateSceneTimings([
    makeScene("s1", 4, { subtitleText: "Scene one short copy." }),
    makeScene("s2", 6, { subtitleText: LONG_RUN_ON }),
  ]);

  const map = buildSubtitleTimingMap(
    {
      scenes,
      sceneEvents: [
        { sceneId: "s1", sceneIndex: 0, startMs: 0, endMs: 4000, durationMs: 4000 },
        { sceneId: "s2", sceneIndex: 1, startMs: 4000, endMs: 10000, durationMs: 6000 },
      ],
      totalDurationMs: 10000,
    },
    { strategy: "word_weighted" },
  );

  const sceneBounds = new Map([
    ["s1", { startMs: 0, endMs: 4000 }],
    ["s2", { startMs: 4000, endMs: 10000 }],
  ]);

  for (const chunk of map.chunks) {
    const bounds = sceneBounds.get(chunk.sceneId);
    assert.ok(bounds);
    assert.ok(chunk.startMs >= bounds!.startMs);
    assert.ok(chunk.endMs <= bounds!.endMs);
  }

  const sceneTwoChunks = map.chunks.filter((chunk) => chunk.sceneId === "s2");
  assert.equal(sceneTwoChunks[0]?.startMs, 4000);
  assert.equal(sceneTwoChunks.at(-1)?.endMs, 10000);
});

test("word-weighted caps long chunk durations before feel adjustments", () => {
  const durations = capWeightedChunkDurations([4200, 1800], 6000, SUBTITLE_TIMING_MAX_CHUNK_DURATION_MS);
  assert.ok(
    durations.slice(0, -1).every((duration) => duration <= SUBTITLE_TIMING_MAX_CHUNK_DURATION_MS + 0.01),
  );
  assert.equal(durations.reduce((sum, duration) => sum + duration, 0), 6000);
});

test("applyWordWeightedTimingFeel pins first and last chunk to scene bounds", () => {
  const felt = applyWordWeightedTimingFeel(
    [
      { startMs: 1000, endMs: 3000 },
      { startMs: 3000, endMs: 5200 },
      { startMs: 5200, endMs: 7000 },
    ],
    1000,
    7000,
  );

  assert.equal(felt[0]?.startMs, 1000);
  assert.equal(felt.at(-1)?.endMs, 7000);
});

test("equal strategy produces same number of chunks as existing split", () => {
  const scene = makeScene("s1", 9, { subtitleText: LONG_TEXT });
  const expectedChunks = resolveDefaultSceneSubtitleChunks(scene);
  const map = equalSubtitleTimingStrategy.build({
    scenes: [scene],
    sceneEvents: [
      {
        sceneId: "s1",
        sceneIndex: 0,
        startMs: 0,
        endMs: 9000,
        durationMs: 9000,
      },
    ],
    totalDurationMs: 9000,
    resolveSceneChunks: resolveDefaultSceneSubtitleChunks,
    resolveSubtitleText: (entry) => entry.subtitleText ?? "",
    splitSubtitleChunks,
  });

  assert.equal(map.chunks.length, expectedChunks.length);
  assert.deepEqual(
    map.chunks.map((chunk) => chunk.text),
    expectedChunks,
  );
});

test("equal strategy divides scene window equally", () => {
  const scene = makeScene("s1", 8, { subtitleText: LONG_TEXT });
  const chunks = resolveDefaultSceneSubtitleChunks(scene);
  const chunkDurationMs = getSubtitleChunkDurationMs(8000, chunks.length);

  const map = equalSubtitleTimingStrategy.build({
    scenes: [scene],
    sceneEvents: [
      { sceneId: "s1", sceneIndex: 0, startMs: 0, endMs: 8000, durationMs: 8000 },
    ],
    totalDurationMs: 8000,
    resolveSceneChunks: resolveDefaultSceneSubtitleChunks,
    resolveSubtitleText: (entry) => entry.subtitleText ?? "",
    splitSubtitleChunks,
  });

  for (const chunk of map.chunks) {
    const expectedEnd =
      chunk.chunkIndex === chunks.length - 1
        ? 8000
        : chunk.chunkIndex * chunkDurationMs;
    assert.equal(chunk.startMs, chunk.chunkIndex * chunkDurationMs);
    if (chunk.chunkIndex < chunks.length - 1) {
      assert.equal(chunk.endMs, expectedEnd + chunkDurationMs);
    }
  }
});

test("first chunk starts at scene start", () => {
  const scene = makeScene("s1", 6, { subtitleText: "First chunk boundary test for timing." });
  const map = buildSubtitleTimingMap({
    scenes: [scene],
    sceneEvents: [
      { sceneId: "s1", sceneIndex: 0, startMs: 2000, endMs: 8000, durationMs: 6000 },
    ],
    totalDurationMs: 8000,
  });

  assert.equal(map.chunks[0]?.startMs, 2000);
});

test("last chunk ends at scene end", () => {
  const scene = makeScene("s1", 6, { subtitleText: "Last chunk boundary test for timing." });
  const map = buildSubtitleTimingMap({
    scenes: [scene],
    sceneEvents: [
      { sceneId: "s1", sceneIndex: 0, startMs: 2000, endMs: 8000, durationMs: 6000 },
    ],
    totalDurationMs: 8000,
  });

  assert.equal(map.chunks.at(-1)?.endMs, 8000);
});

test("multiple scenes produce absolute timeline timestamps", () => {
  const scenes = recalculateSceneTimings([
    makeScene("s1", 4, { subtitleText: "Scene one narrated copy." }),
    makeScene("s2", 5, { subtitleText: LONG_TEXT }),
  ]);

  const map = buildSubtitleTimingMap({
    scenes,
    sceneEvents: [
      { sceneId: "s1", sceneIndex: 0, startMs: 0, endMs: 4000, durationMs: 4000 },
      { sceneId: "s2", sceneIndex: 1, startMs: 4000, endMs: 9000, durationMs: 5000 },
    ],
    totalDurationMs: 9000,
  });

  const sceneTwoChunks = map.chunks.filter((chunk) => chunk.sceneId === "s2");
  assert.ok(sceneTwoChunks.length >= 2);
  assert.equal(sceneTwoChunks[0]?.startMs, 4000);
  assert.equal(sceneTwoChunks.at(-1)?.endMs, 9000);
});

test("scenes without subtitle text produce no chunks", () => {
  const scene = makeScene("s1", 4, { subtitleText: undefined, narration: undefined });
  const map = buildSubtitleTimingMap({
    scenes: [scene],
    sceneEvents: [
      { sceneId: "s1", sceneIndex: 0, startMs: 0, endMs: 4000, durationMs: 4000 },
    ],
    totalDurationMs: 4000,
  });

  assert.equal(map.chunks.length, 0);
});

test("placeholder text is ignored", () => {
  const scene = makeScene("s1", 4, { subtitleText: "Add subtitle..." });
  const map = buildSubtitleTimingMap({
    scenes: [scene],
    sceneEvents: [
      { sceneId: "s1", sceneIndex: 0, startMs: 0, endMs: 4000, durationMs: 4000 },
    ],
    totalDurationMs: 4000,
  });

  assert.equal(map.chunks.length, 0);
});

test("unknown strategy falls back to equal", () => {
  const scene = makeScene("s1", 4, { subtitleText: "Fallback strategy test copy." });
  const equalMap = buildSubtitleTimingMap({
    scenes: [scene],
    sceneEvents: [
      { sceneId: "s1", sceneIndex: 0, startMs: 0, endMs: 4000, durationMs: 4000 },
    ],
    totalDurationMs: 4000,
  });
  const alignedMap = buildSubtitleTimingMap(
    {
      scenes: [scene],
      sceneEvents: [
        { sceneId: "s1", sceneIndex: 0, startMs: 0, endMs: 4000, durationMs: 4000 },
      ],
      totalDurationMs: 4000,
    },
    { strategy: "aligned" },
  );

  assert.equal(alignedMap.strategy, "equal");
  assert.deepEqual(
    alignedMap.chunks.map((chunk) => ({ startMs: chunk.startMs, endMs: chunk.endMs, text: chunk.text })),
    equalMap.chunks.map((chunk) => ({ startMs: chunk.startMs, endMs: chunk.endMs, text: chunk.text })),
  );
});

test("preview/export subtitle event shape remains compatible", () => {
  const story = buildStory([
    makeScene("s1", 4, { subtitleText: LONG_TEXT }),
    makeScene("s2", 5, { subtitleText: "Second scene copy." }),
  ]);

  const timeline = buildMasterTimeline(story, { assumeSynced: true, mode: "preview" });
  const subtitleTrack = timeline.tracks.find((track) => track.type === "subtitle");
  assert.ok(subtitleTrack);
  assert.ok(subtitleTrack.events.length > 0);

  const first = subtitleTrack.events[0]!;
  assert.equal(first.type, "subtitle");
  assert.equal(first.source, "derived-subtitle");
  assert.equal(first.metadata.captionMode, "subtitles");
  assert.match(first.id, /^subtitle-s1-/);

  const scene = makeScene("s1", 4, { subtitleText: LONG_TEXT });
  const map = buildSubtitleTimingMap({
    scenes: [scene],
    sceneEvents: [
      { sceneId: "s1", sceneIndex: 0, startMs: 0, endMs: 4000, durationMs: 4000 },
    ],
    totalDurationMs: 4000,
  });
  const converted = mapSubtitleTimingChunksToEvents(
    map.chunks,
    new Map([["s1", 4000]]),
  );
  assert.equal(converted.events[0]?.metadata.chunkCount, map.chunks.length);
  assert.equal(converted.events[0]?.metadata.sceneId, "s1");
});

test("written captions are not routed through the timing engine", () => {
  const generated = makeScene("s1", 4, {
    captionMode: "generated",
    subtitle: "Written caption heading",
    subtitleText: "Should not appear in timing map",
  });
  assert.equal(isNarratedSubtitlesScene(generated), false);

  const map = buildSubtitleTimingMap({
    scenes: [generated],
    sceneEvents: [
      { sceneId: "s1", sceneIndex: 0, startMs: 0, endMs: 4000, durationMs: 4000 },
    ],
    totalDurationMs: 4000,
  });
  assert.equal(map.chunks.length, 0);

  const masterTimeline = readFileSync(
    join(process.cwd(), "src/features/timeline-intelligence/build-master-timeline.ts"),
    "utf8",
  );
  assert.match(masterTimeline, /buildSubtitleTimingMap/);
  assert.doesNotMatch(
    masterTimeline.slice(masterTimeline.indexOf("function buildSubtitleEvents"), masterTimeline.indexOf("function extendFinalSubtitle")),
    /normalizeCaptionMode\(scene\.captionMode\) === "generated"/,
  );
});

test("word-weighted strategy is registered", () => {
  const strategy = getSubtitleTimingStrategy("word_weighted");
  assert.equal(strategy.id, "word_weighted");
  assert.equal(strategy, wordWeightedSubtitleTimingStrategy);
});

test("word-weighted gives longer chunks more duration", () => {
  const textChunks = [
    "The Jabulani was controversial",
    "because it moved unpredictably",
    "in the air",
  ];
  const allocation = allocateWordWeightedChunkWindows(textChunks, 0, 6000);

  assert.equal(allocation.usedEqualFallback, false);
  assert.equal(allocation.durations[0], allocation.durations[1]);
  assert.ok(allocation.durations[0]! > allocation.durations[2]!);
  assert.ok(allocation.durations[0]! >= SUBTITLE_TIMING_MIN_CHUNK_MS);
});

test("word-weighted total duration equals scene window", () => {
  const scene = makeScene("s1", 6, {
    subtitleText: "The Jabulani was controversial because it moved unpredictably in the air.",
  });
  (scene as FootieScene & { subtitleChunks?: string[] }).subtitleChunks = [
    "The Jabulani was controversial",
    "because it moved unpredictably",
    "in the air",
  ];

  const map = buildSubtitleTimingMap(
    {
      scenes: [scene],
      sceneEvents: [
        { sceneId: "s1", sceneIndex: 0, startMs: 1000, endMs: 7000, durationMs: 6000 },
      ],
      totalDurationMs: 7000,
    },
    { strategy: "word_weighted" },
  );

  const sceneSpan = map.chunks.at(-1)!.endMs - map.chunks[0]!.startMs;
  assert.equal(sceneSpan, 6000);
  assert.equal(map.source, "estimated");
  assert.equal(map.strategy, "word_weighted");
  assert.ok(map.chunks.every((chunk) => chunk.source === "word_weighted"));
});

test("word-weighted first chunk starts at scene start", () => {
  const scene = makeScene("s1", 6, { subtitleText: "Word weighted start boundary test copy." });
  const map = buildSubtitleTimingMap(
    {
      scenes: [scene],
      sceneEvents: [
        { sceneId: "s1", sceneIndex: 0, startMs: 2500, endMs: 8500, durationMs: 6000 },
      ],
      totalDurationMs: 8500,
    },
    { strategy: "word_weighted" },
  );

  assert.equal(map.chunks[0]?.startMs, 2500);
});

test("word-weighted last chunk ends at scene end", () => {
  const scene = makeScene("s1", 6, { subtitleText: "Word weighted end boundary test copy." });
  const map = buildSubtitleTimingMap(
    {
      scenes: [scene],
      sceneEvents: [
        { sceneId: "s1", sceneIndex: 0, startMs: 2500, endMs: 8500, durationMs: 6000 },
      ],
      totalDurationMs: 8500,
    },
    { strategy: "word_weighted" },
  );

  assert.equal(map.chunks.at(-1)?.endMs, 8500);
});

test("word-weighted ignores zero or empty chunks", () => {
  const scene = makeScene("s1", 4, { subtitleText: undefined, narration: undefined });
  const map = buildSubtitleTimingMap(
    {
      scenes: [scene],
      sceneEvents: [
        { sceneId: "s1", sceneIndex: 0, startMs: 0, endMs: 4000, durationMs: 4000 },
      ],
      totalDurationMs: 4000,
    },
    { strategy: "word_weighted" },
  );

  assert.equal(map.chunks.length, 0);

  const allocation = allocateWordWeightedChunkWindows(["", "   "], 0, 4000);
  assert.equal(allocation.windows.length, 0);
});

test("word-weighted respects minimum chunk duration when possible", () => {
  const weights = [4, 4, 3];
  const durations = normalizeWeightedDurations(weights, 6000, SUBTITLE_TIMING_MIN_CHUNK_MS);

  assert.ok(durations.every((duration) => duration >= SUBTITLE_TIMING_MIN_CHUNK_MS));
  assert.equal(durations.reduce((sum, duration) => sum + duration, 0), 6000);
});

test("word-weighted falls back to equal when minimum duration cannot fit", () => {
  const textChunks = ["one two", "three four", "five six"];
  const allocation = allocateWordWeightedChunkWindows(textChunks, 0, 1000);

  assert.equal(allocation.usedEqualFallback, true);
  assert.equal(allocation.durations.length, 3);
  assert.ok(allocation.durations.every((duration) => Math.abs(duration - 1000 / 3) < 0.01));
  assert.equal(allocation.windows[0]?.startMs, 0);
  assert.equal(allocation.windows.at(-1)?.endMs, 1000);

  const scene = makeScene("s1", 1, { subtitleText: "ignored when chunks persisted" });
  (scene as FootieScene & { subtitleChunks?: string[] }).subtitleChunks = textChunks;
  const map = buildSubtitleTimingMap(
    {
      scenes: [scene],
      sceneEvents: [
        { sceneId: "s1", sceneIndex: 0, startMs: 0, endMs: 1000, durationMs: 1000 },
      ],
      totalDurationMs: 1000,
    },
    { strategy: "word_weighted" },
  );

  assert.equal(map.chunks.length, 3);
  assert.ok(map.chunks.every((chunk) => chunk.source === "fallback"));
});

test("word-weighted multiple scenes produce absolute timestamps", () => {
  const scenes = recalculateSceneTimings([
    makeScene("s1", 4, { subtitleText: "Scene one short copy." }),
    makeScene("s2", 6, { subtitleText: "The Jabulani was controversial because it moved unpredictably in the air." }),
  ]);

  const map = buildSubtitleTimingMap(
    {
      scenes,
      sceneEvents: [
        { sceneId: "s1", sceneIndex: 0, startMs: 0, endMs: 4000, durationMs: 4000 },
        { sceneId: "s2", sceneIndex: 1, startMs: 4000, endMs: 10000, durationMs: 6000 },
      ],
      totalDurationMs: 10000,
    },
    { strategy: "word_weighted" },
  );

  const sceneTwoChunks = map.chunks.filter((chunk) => chunk.sceneId === "s2");
  assert.ok(sceneTwoChunks.length >= 2);
  assert.equal(sceneTwoChunks[0]?.startMs, 4000);
  assert.equal(sceneTwoChunks.at(-1)?.endMs, 10000);
});

test("equal strategy remains unchanged after word-weighted registration", () => {
  const scene = makeScene("s1", 8, { subtitleText: LONG_TEXT });
  const chunks = resolveDefaultSceneSubtitleChunks(scene);
  const chunkDurationMs = getSubtitleChunkDurationMs(8000, chunks.length);

  const map = equalSubtitleTimingStrategy.build({
    scenes: [scene],
    sceneEvents: [
      { sceneId: "s1", sceneIndex: 0, startMs: 0, endMs: 8000, durationMs: 8000 },
    ],
    totalDurationMs: 8000,
    resolveSceneChunks: resolveDefaultSceneSubtitleChunks,
    resolveSubtitleText: (entry) => entry.subtitleText ?? "",
    splitSubtitleChunks,
  });

  assert.equal(map.strategy, "equal");
  assert.equal(map.source, "legacy_equal");
  for (const chunk of map.chunks) {
    assert.equal(chunk.source, "equal");
    if (chunk.chunkIndex < chunks.length - 1) {
      assert.equal(chunk.endMs - chunk.startMs, chunkDurationMs);
    }
  }
});

test("default strategy remains equal", () => {
  const scene = makeScene("s1", 6, { subtitleText: LONG_TEXT });
  const defaultMap = buildSubtitleTimingMap({
    scenes: [scene],
    sceneEvents: [
      { sceneId: "s1", sceneIndex: 0, startMs: 0, endMs: 6000, durationMs: 6000 },
    ],
    totalDurationMs: 6000,
  });
  const explicitEqualMap = buildSubtitleTimingMap(
    {
      scenes: [scene],
      sceneEvents: [
        { sceneId: "s1", sceneIndex: 0, startMs: 0, endMs: 6000, durationMs: 6000 },
      ],
      totalDurationMs: 6000,
    },
    { strategy: "equal" },
  );

  assert.equal(defaultMap.strategy, "equal");
  assert.deepEqual(
    defaultMap.chunks.map((chunk) => ({ startMs: chunk.startMs, endMs: chunk.endMs, text: chunk.text })),
    explicitEqualMap.chunks.map((chunk) => ({ startMs: chunk.startMs, endMs: chunk.endMs, text: chunk.text })),
  );
});

test("countTimingWords ignores empty strings", () => {
  assert.equal(countTimingWords(""), 0);
  assert.equal(countTimingWords("one two three"), 3);
});

test("resolveSubtitleTimingStrategy uses word_weighted when voiceoverDurationMs exists", () => {
  const story = buildStory([makeScene("s1", 4, { subtitleText: "Narrated copy." })], {
    voiceoverDurationMs: 4000,
  });

  assert.equal(resolveSubtitleTimingStrategy(story), "word_weighted");
});

test("resolveSubtitleTimingStrategy uses word_weighted when canonical voiceover exists", () => {
  const story = buildStory([makeScene("s1", 4, { subtitleText: "Narrated copy." })], {
    voiceoverUrl: "https://cdn.example.com/voiceover.mp3",
    voiceoverDurationMs: 4000,
  });

  assert.equal(resolveSubtitleTimingStrategy(story), "word_weighted");
});

test("resolveSubtitleTimingStrategy uses equal without voiceover metadata", () => {
  const story = buildStory([makeScene("s1", 4, { subtitleText: "Narrated copy." })]);

  assert.equal(resolveSubtitleTimingStrategy(story), "equal");
});

test("master timeline uses word_weighted narrated subtitles when voiceover exists", () => {
  const scene = makeScene("s1", 6, {
    subtitleText: "The Jabulani was controversial because it moved unpredictably in the air.",
  });
  (scene as FootieScene & { subtitleChunks?: string[] }).subtitleChunks = [
    "The Jabulani was controversial",
    "because it moved unpredictably",
    "in the air",
  ];

  const story = buildStory([scene], {
    voiceoverUrl: "https://cdn.example.com/voiceover.mp3",
    voiceoverDurationMs: 6000,
  });

  const weightedTimeline = buildMasterTimeline(story, { assumeSynced: true, mode: "preview" });
  assert.equal(weightedTimeline.diagnostics.subtitleTimingStrategy, "word_weighted");

  const subtitleTrack = weightedTimeline.tracks.find((track) => track.type === "subtitle");
  assert.ok(subtitleTrack);
  assert.equal(subtitleTrack.events.length, 3);

  const durations = subtitleTrack.events.map((event) => event.endMs - event.startMs);
  assert.ok(durations[0]! > durations[2]!);
  assert.equal(durations.reduce((sum, duration) => sum + duration, 0), 6000);
});

test("master timeline uses equal narrated subtitles without voiceover", () => {
  const scene = makeScene("s1", 6, {
    subtitleText: "The Jabulani was controversial because it moved unpredictably in the air.",
  });
  (scene as FootieScene & { subtitleChunks?: string[] }).subtitleChunks = [
    "The Jabulani was controversial",
    "because it moved unpredictably",
    "in the air",
  ];

  const story = buildStory([scene]);
  const equalTimeline = buildMasterTimeline(story, { assumeSynced: true, mode: "preview" });

  assert.equal(equalTimeline.diagnostics.subtitleTimingStrategy, "equal");

  const subtitleTrack = equalTimeline.tracks.find((track) => track.type === "subtitle");
  assert.ok(subtitleTrack);
  const durations = subtitleTrack.events.map((event) => event.endMs - event.startMs);
  assert.ok(durations.every((duration) => Math.abs(duration - 2000) < 0.01));
});

test("preview and export share subtitle timing strategy resolution", () => {
  const story = buildStory(
    [makeScene("s1", 6, { subtitleText: "Shared strategy resolution test copy." })],
    {
      voiceoverUrl: "https://cdn.example.com/voiceover.mp3",
      voiceoverDurationMs: 6000,
    },
  );

  const previewTimeline = buildMasterTimeline(story, { assumeSynced: true, mode: "preview" });
  const exportTimeline = buildMasterTimeline(story, {
    assumeSynced: true,
    mode: "export",
    useVoiceoverRefit: true,
  });

  assert.equal(previewTimeline.diagnostics.subtitleTimingStrategy, "word_weighted");
  assert.equal(exportTimeline.diagnostics.subtitleTimingStrategy, "word_weighted");

  const previewSubtitles = previewTimeline.tracks.find((track) => track.type === "subtitle")?.events ?? [];
  const exportSubtitles = exportTimeline.tracks.find((track) => track.type === "subtitle")?.events ?? [];
  assert.equal(previewSubtitles.length, exportSubtitles.length);
  assert.deepEqual(
    previewSubtitles.map((event) => ({
      startMs: event.startMs,
      endMs: event.endMs,
      text: event.metadata.text,
    })),
    exportSubtitles.map((event) => ({
      startMs: event.startMs,
      endMs: event.endMs,
      text: event.metadata.text,
    })),
  );
});

test("written captions remain unaffected by subtitle timing strategy resolver", () => {
  const generated = makeScene("s1", 4, {
    captionMode: "generated",
    subtitle: "Written caption heading",
    subtitleText: "Should not appear in timing map",
  });

  const story = buildStory([generated], {
    voiceoverUrl: "https://cdn.example.com/voiceover.mp3",
    voiceoverDurationMs: 4000,
  });

  const timeline = buildMasterTimeline(story, { assumeSynced: true, mode: "preview" });
  const subtitleTrack = timeline.tracks.find((track) => track.type === "subtitle");

  assert.equal(timeline.diagnostics.subtitleTimingStrategy, "word_weighted");
  assert.ok(!subtitleTrack || subtitleTrack.events.length === 0);
  assert.equal(isNarratedSubtitlesScene(generated), false);
});

test("subtitle-timing module does not import story-sync", () => {
  const moduleFiles = [
    "src/features/subtitle-timing/index.ts",
    "src/features/subtitle-timing/subtitle-timing.types.ts",
    "src/features/subtitle-timing/subtitle-timing.equal-strategy.ts",
    "src/features/subtitle-timing/subtitle-timing.word-weighted-strategy.ts",
    "src/features/subtitle-timing/subtitle-timing.engine.ts",
    "src/features/subtitle-timing/subtitle-timing.utils.ts",
    "src/features/subtitle-timing/subtitle-timing.resolver.ts",
  ];

  for (const file of moduleFiles) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    assert.doesNotMatch(source, /story-sync/);
    assert.doesNotMatch(source, /storySync/);
  }
});

console.log(`\nsubtitle-timing: ${passed} passed`);
