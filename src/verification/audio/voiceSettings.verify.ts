/**
 * Story voice settings verification (run: npm run test:voice-settings).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { FootieScene, FootieScript } from "@/features/story/types";
import {
  coerceLegacyStoryFields,
  getStoryVoiceSettings,
  normalizeStoryVoiceSettings,
} from "@/features/story/utils";
import { applyStoryVoiceSettings, applyVoiceoverChanges, syncFootieScript } from "@/lib/utils/voiceover";
import {
  DEFAULT_VOICEOVER_SPEED,
  VOICEOVER_SPEED_OPTIONS,
  resolveVoiceoverSpeed,
} from "@/lib/utils/voiceoverOptions";

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

function makeScript(scenes: FootieScene[]): FootieScript {
  return {
    title: "Test",
    narration: "One two three four five.",
    totalDuration: scenes.reduce((sum, scene) => sum + scene.duration, 0),
    scenes,
  };
}

console.log("voice settings");

test("resolveVoiceoverSpeed snaps to supported presets", () => {
  assert.equal(resolveVoiceoverSpeed(undefined), DEFAULT_VOICEOVER_SPEED);
  assert.equal(resolveVoiceoverSpeed("bad"), DEFAULT_VOICEOVER_SPEED);
  assert.equal(resolveVoiceoverSpeed(1.12), 1.1);
  assert.equal(resolveVoiceoverSpeed(1.4), 1.4);
  assert.deepEqual([...VOICEOVER_SPEED_OPTIONS], [0.75, 0.9, 1, 1.1, 1.25, 1.4]);
});

test("coerceLegacyStoryFields initializes voiceSettings.speed to 1.0", () => {
  const legacy = makeScript([makeScene("a", 4)]);
  const coerced = coerceLegacyStoryFields(legacy);

  assert.deepEqual(coerced.voiceSettings, { speed: 1 });
  assert.equal(getStoryVoiceSettings(coerced).speed, 1);
});

test("coerceLegacyStoryFields migrates legacy voiceoverSpeed", () => {
  const legacy = {
    ...makeScript([makeScene("a", 4)]),
    voiceoverSpeed: 1.25,
  } as FootieScript & { voiceoverSpeed: number };

  const coerced = coerceLegacyStoryFields(legacy);
  assert.deepEqual(coerced.voiceSettings, { speed: 1.25 });
});

test("applyStoryVoiceSettings persists story-level voice and speed without scene changes", () => {
  const script = syncFootieScript(makeScript([makeScene("a", 4), makeScene("b", 6)]));
  const next = applyStoryVoiceSettings(script, { voice: "nova", speed: 0.9 });

  assert.equal(next.voiceSettings?.voice, "nova");
  assert.equal(next.voiceSettings?.speed, 0.9);
  assert.equal(next.scenes.length, 2);
  assert.equal(next.scenes[0]?.subtitle, "Scene a");
});

test("applyVoiceoverChanges redistributes scene timings proportionally", () => {
  const script = syncFootieScript({
    title: "Test",
    narration: "One two three four five.",
    totalDuration: 20,
    scenes: [
      { id: "1", start: 0, end: 8, duration: 8, durationMs: 8000, subtitle: "Scene 1" },
      { id: "2", start: 8, end: 16, duration: 8, durationMs: 8000, subtitle: "Scene 2" },
      { id: "3", start: 16, end: 20, duration: 4, durationMs: 4000, subtitle: "Scene 3" },
    ],
  });

  const next = applyVoiceoverChanges(script, {
    voiceoverUrl: "blob:new",
    voiceoverDurationMs: 16_000,
    voiceSettings: { speed: 1.25 },
  });

  assert.equal(next.voiceoverDurationMs, 16_000);
  assert.equal(next.scenes[0]?.duration, 6.4);
  assert.equal(next.scenes[1]?.duration, 6.4);
  assert.equal(next.scenes[2]?.duration, 3.2);
  assert.equal(next.scenes[0]?.durationMs, 6400);
  assert.equal(next.scenes[1]?.durationMs, 6400);
  assert.equal(next.scenes[2]?.durationMs, 3200);
  assert.equal(next.scenes[0]?.startMs, 0);
  assert.equal(next.scenes[1]?.startMs, 6400);
  assert.equal(next.scenes[2]?.startMs, 12_800);
  assert.equal(next.scenes[2]?.endMs, 16_000);
  assert.equal(next.scenes[0]?.subtitle, "Scene 1");
  assert.equal(next.scenes[2]?.subtitle, "Scene 3");
});

test("applyVoiceoverChanges preserves captions and media while refitting timings", () => {
  const script = syncFootieScript({
    title: "Test",
    narration: "One two three four five.",
    totalDuration: 10,
    voiceoverUrl: "blob:old",
    voiceoverDurationMs: 10_000,
    scenes: [
      {
        id: "a",
        start: 0,
        end: 4,
        duration: 4,
        durationMs: 4000,
        durationSource: "manual",
        subtitle: "Scene caption",
        subtitleText: "Custom subtitle",
        captionMode: "subtitles",
        subtitleEffect: "typewriter",
        image: { url: "https://example.com/a.jpg", scale: 1.2, x: 10, y: -5, rotation: 15 },
        narration: "One two",
      },
      {
        id: "b",
        start: 4,
        end: 10,
        duration: 6,
        durationMs: 6000,
        subtitle: "Second scene",
      },
    ],
  });

  const next = applyVoiceoverChanges(script, {
    voiceoverUrl: "blob:new",
    voiceoverDurationMs: 7500,
    voiceSettings: { voice: "echo", speed: 1.25 },
  });

  assert.equal(next.voiceoverUrl, "blob:new");
  assert.equal(next.voiceoverDurationMs, 7500);
  assert.deepEqual(next.voiceSettings, { voice: "echo", speed: 1.25 });
  assert.equal(next.scenes.length, 2);
  assert.equal(next.scenes[0]?.subtitle, "Scene caption");
  assert.equal(next.scenes[0]?.subtitleText, "Custom subtitle");
  assert.equal(next.scenes[0]?.duration, 3);
  assert.equal(next.scenes[0]?.durationMs, 3000);
  assert.equal(next.scenes[1]?.duration, 4.5);
  assert.equal(next.scenes[1]?.durationMs, 4500);
  assert.equal(next.scenes[0]?.image?.scale, 1.2);
  assert.equal(next.scenes[0]?.image?.rotation, 15);
  assert.equal(next.scenes[1]?.subtitle, "Second scene");
});

test("normalizeStoryVoiceSettings keeps optional voice unset by default", () => {
  assert.deepEqual(normalizeStoryVoiceSettings({}), { speed: 1 });
});

test("story model defines voiceSettings once per story", () => {
  const typesPath = join(process.cwd(), "src/features/story/types/story.types.ts");
  const types = readFileSync(typesPath, "utf8");
  assert.match(types, /interface StoryVoiceSettings/);
  assert.match(types, /voiceSettings\?: StoryVoiceSettings/);
});

console.log("\nAll voice settings checks passed.");
