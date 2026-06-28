/**
 * Export preflight verification (run: npm run test:export-preflight).
 */
import assert from "node:assert/strict";

import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import {
  resolveExportBackgroundMusicMixSettingsFromMix,
} from "@/features/export/utils/export-background-music.utils";
import { buildAudioMixFromStory } from "@/features/audio";
import {
  EXPORT_NARRATION_VOICEOVER_MISMATCH_WARNING,
  hasNarrationVoiceoverMismatch,
} from "@/features/export/utils/export-narration-voiceover.utils";
import { TIMELINE_END_BUFFER_MS } from "@/features/timeline-intelligence/build-master-timeline";
import { getStoryTotalDuration } from "@/features/story/utils/scene.utils";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/voiceover";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const baseScript: FootieScript = {
  title: "Preflight Export",
  narration: "Scene one. Scene two.",
  totalDuration: 10,
  voiceoverUrl: "blob:voiceover",
  voiceoverDurationMs: 10_000,
  scenes: [
    {
      id: "scene-1",
      start: 0,
      end: 6,
      duration: 6,
      startMs: 0,
      endMs: 6000,
      durationMs: 6000,
      subtitle: "Scene one",
      sceneType: "intro",
    },
    {
      id: "scene-2",
      start: 6,
      end: 12,
      duration: 6,
      startMs: 6000,
      endMs: 12_000,
      durationMs: 6000,
      subtitle: "Scene two",
      sceneType: "ending",
    },
  ],
};

console.log("exportPreflight");

test("prepareStoryForExport refits scenes to voiceoverDurationMs", () => {
  const result = prepareStoryForExport(syncFootieScript(baseScript));

  assert.equal(result.exportDurationMs, 10_000 + TIMELINE_END_BUFFER_MS);
  assert.ok(result.masterTimeline);
  assert.equal(Math.round(getStoryTotalDuration(result.story.scenes) * 1000), 10_000);
  assert.equal(result.story.scenes[0]?.durationMs, 5000);
  assert.equal(result.story.scenes[1]?.durationMs, 5000);
  assert.equal(result.story.scenes[1]?.endMs, 10_000);
  assert.ok(result.warnings.some((warning) => /refit applied/i.test(warning)));
});

test("prepareStoryForExport preserves proportional manual scene durations", () => {
  const proportionalScript = syncFootieScript({
    ...baseScript,
    voiceoverDurationMs: 30_000,
    scenes: [
      {
        id: "scene-1",
        start: 0,
        end: 3,
        duration: 3,
        startMs: 0,
        endMs: 3000,
        durationMs: 3000,
        durationSource: "manual",
        subtitle: "Scene one",
        sceneType: "intro",
      },
      {
        id: "scene-2",
        start: 3,
        end: 10,
        duration: 7,
        startMs: 3000,
        endMs: 10_000,
        durationMs: 7000,
        durationSource: "manual",
        subtitle: "Scene two",
        sceneType: "match",
      },
      {
        id: "scene-3",
        start: 10,
        end: 15,
        duration: 5,
        startMs: 10_000,
        endMs: 15_000,
        durationMs: 5000,
        durationSource: "manual",
        subtitle: "Scene three",
        sceneType: "ending",
      },
    ],
  });

  const result = prepareStoryForExport(proportionalScript);

  assert.equal(result.exportDurationMs, 30_000 + TIMELINE_END_BUFFER_MS);
  assert.equal(result.story.scenes[0]?.duration, 6);
  assert.equal(result.story.scenes[1]?.duration, 14);
  assert.equal(result.story.scenes[2]?.duration, 10);
  assert.equal(result.story.scenes[0]?.durationSource, "manual");
  assert.equal(result.story.scenes[1]?.subtitle, "Scene two");
});

test("prepareStoryForExport uses even scene durations when any timing is invalid", () => {
  const unevenScript = syncFootieScript({
    ...baseScript,
    voiceoverDurationMs: 30_000,
    scenes: [
      {
        id: "scene-1",
        start: 0,
        end: 3,
        duration: 3,
        startMs: 0,
        endMs: 3000,
        durationMs: 3000,
        subtitle: "Scene one",
        sceneType: "intro",
      },
      {
        id: "scene-2",
        start: 3,
        end: 3,
        duration: 0,
        startMs: 3000,
        endMs: 3000,
        durationMs: 0,
        subtitle: "Scene two",
        sceneType: "ending",
      },
      {
        id: "scene-3",
        start: 3,
        end: 8,
        duration: 5,
        startMs: 3000,
        endMs: 8000,
        durationMs: 5000,
        subtitle: "Scene three",
        sceneType: "ending",
      },
    ],
  });

  const result = prepareStoryForExport(unevenScript);

  assert.equal(result.exportDurationMs, 30_000 + TIMELINE_END_BUFFER_MS);
  assert.equal(result.story.scenes[0]?.duration, 10);
  assert.equal(result.story.scenes[1]?.duration, 10);
  assert.equal(result.story.scenes[2]?.duration, 10);
});

test("prepareStoryForExport uses scene timeline when voiceover is absent", () => {
  const withoutVoice = syncFootieScript({
    ...baseScript,
    voiceoverUrl: undefined,
    voiceoverDurationMs: undefined,
  });

  const result = prepareStoryForExport(withoutVoice);

  assert.equal(result.exportDurationMs, 12_000 + TIMELINE_END_BUFFER_MS);
  assert.equal(Math.round(getStoryTotalDuration(result.story.scenes) * 1000), 12_000);
  assert.equal(result.warnings.length, 0);
});

test("prepareStoryForExport does not mutate the input story", () => {
  const input = syncFootieScript(baseScript);
  const beforeDurationMs = input.scenes[1]?.endMs;

  prepareStoryForExport(input);

  assert.equal(input.scenes[1]?.endMs, beforeDurationMs);
});

test("hasNarrationVoiceoverMismatch detects script narration drift", () => {
  const synced = syncFootieScript({
    ...baseScript,
    voiceoverNarration: "Scene one. Scene two.",
    narration: "Edited narration text.",
  });

  assert.equal(hasNarrationVoiceoverMismatch(synced), true);
});

test("hasNarrationVoiceoverMismatch is false when narration matches snapshot", () => {
  const synced = syncFootieScript({
    ...baseScript,
    voiceoverNarration: "Scene one. Scene two.",
  });

  assert.equal(hasNarrationVoiceoverMismatch(synced), false);
});

test("hasNarrationVoiceoverMismatch is false without voiceover snapshot", () => {
  const synced = syncFootieScript({
    ...baseScript,
    narration: "Edited narration text.",
  });

  assert.equal(hasNarrationVoiceoverMismatch(synced), false);
});

test("prepareStoryForExport warns when narration changed after voiceover generation", () => {
  const mismatched = syncFootieScript({
    ...baseScript,
    voiceoverNarration: "Scene one. Scene two.",
    narration: "Different script narration now.",
  });

  const result = prepareStoryForExport(mismatched);

  assert.equal(
    result.warnings.some((warning) => warning === EXPORT_NARRATION_VOICEOVER_MISMATCH_WARNING),
    true,
  );
});

test("background music mix settings use preflight exportDurationMs", () => {
  const scriptWithMusic = syncFootieScript({
    ...baseScript,
    voiceoverDurationMs: 30_000,
    backgroundMusic: {
      enabled: true,
      source: "upload",
      fileUrl: "blob:music-track",
      fileName: "ambient.mp3",
      volume: 0.2,
      duckingEnabled: false,
      fadeIn: true,
      fadeOut: true,
    },
  });

  const preflight = prepareStoryForExport(scriptWithMusic);
  const mix = buildAudioMixFromStory(preflight.story);
  const settings = resolveExportBackgroundMusicMixSettingsFromMix(mix, true, preflight.exportDurationMs);

  assert.equal(preflight.exportDurationMs, 30_000 + TIMELINE_END_BUFFER_MS);
  assert.equal(settings?.exportDurationMs, 30_000 + TIMELINE_END_BUFFER_MS);
});

console.log("All export preflight checks passed.");
