/**
 * Legacy story backward-compatibility checks (run: npm run test:legacy-compat).
 */
import assert from "node:assert/strict";

import {
  buildFootieExportPayload,
  getExportTotalDurationSec,
  getRenderableScenesFromPayload,
} from "@/features/export/services";
import { getPreviewFrameAtTime } from "@/features/preview/utils";
import { resolveTimelineItems } from "@/features/preview/utils";
import {
  coerceLegacyStoryFields,
  getSceneDurationMs,
  hasVoiceoverAudio,
  isAudioFirstStory,
  resolveStoryDurationSec,
} from "@/features/story/utils";
import { syncFootieScript } from "@/lib/utils/voiceover";
import type { FootieScene, FootieScript } from "@/features/story/types";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function legacyScene(id: string, subtitle: string): FootieScene {
  return {
    id,
    start: id === "1" ? 0 : 3,
    end: id === "1" ? 3 : 6,
    duration: 3,
    subtitle,
  };
}

const legacyScript: FootieScript = {
  title: "Legacy Derby",
  narration: "Old pipeline story with scene subtitles only.",
  totalDuration: 6,
  scenes: [legacyScene("1", "Opening"), legacyScene("2", "Climax")],
};

console.log("legacyCompat");

test("coerceLegacyStoryFields preserves legacy stories without voiceover", () => {
  const coerced = coerceLegacyStoryFields(legacyScript);

  assert.equal(coerced.title, "Legacy Derby");
  assert.equal(coerced.scenes.length, 2);
  assert.equal(coerced.totalDuration, 6);
  assert.equal(coerced.voiceoverUrl, undefined);
  assert.equal(coerced.voiceoverDurationMs, undefined);
  assert.deepEqual(coerced.voiceSettings, { speed: 1 });
  assert.equal(hasVoiceoverAudio(coerced), false);
  assert.equal(isAudioFirstStory(coerced), false);
});

test("syncFootieScript upgrades legacy stories without forcing voiceover fields", () => {
  const synced = syncFootieScript(legacyScript);

  assert.equal(synced.narration, legacyScript.narration);
  assert.equal(synced.scenes.length, 2);
  assert.ok(synced.timelineItems && synced.timelineItems.length >= 2);
  assert.equal(synced.voiceoverUrl, undefined);
  assert.deepEqual(synced.voiceSettings, { speed: 1 });
  assert.equal(resolveStoryDurationSec(synced), 6);
});

test("legacy export payload builds and renders without voiceover metadata", () => {
  const payload = buildFootieExportPayload(syncFootieScript(legacyScript));

  assert.equal(payload.narration, legacyScript.narration);
  assert.equal(payload.voiceoverUrl, undefined);
  assert.equal(payload.audioFirst, undefined);
  assert.equal(getExportTotalDurationSec(payload), 6);
  assert.equal(getRenderableScenesFromPayload(payload).length, 2);
});

test("preview frame resolution works for legacy second-based scenes", () => {
  const synced = syncFootieScript(legacyScript);
  const timelineItems = resolveTimelineItems(synced.timelineItems, synced.scenes);
  const frame = getPreviewFrameAtTime(timelineItems, synced.scenes, 1.5);

  assert.equal(frame.kind, "scene");
  if (frame.kind === "scene") {
    assert.equal(frame.sceneIndex, 0);
    assert.equal(frame.scene.subtitle, "Opening");
  }
});

test("scene duration helpers tolerate missing millisecond timing", () => {
  const scene = legacyScene("1", "Opening");
  delete scene.durationMs;
  delete scene.startMs;
  delete scene.endMs;

  assert.equal(getSceneDurationMs(scene), 3000);
  assert.equal(getSceneDurationMs(undefined), 1000);
});

test("duration resolution falls back to scene timings when voiceover is absent", () => {
  const script: FootieScript = {
    ...legacyScript,
    totalDuration: 0,
  };

  assert.equal(resolveStoryDurationSec(script), 6);
});

console.log("All legacy compatibility checks passed.");
