import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildVoiceMasteringFfmpegFilters,
  GENERATED_SPEECH_MASTERING_PLAN,
  prepareNarrationForVoiceCadence,
  prepareVoiceCadenceInstructions,
} from "@/features/voice-quality";
import { buildMuxVideoExportAudioFilterComplex } from "@/features/export/utils/ffmpeg.utils";
import {
  buildExportManifest,
  EXPORT_RENDERER_CAPABILITY_GENERATED_VOICE_MASTERING,
  isExportManifestV5,
  validateExportManifest,
} from "@/features/export/domain";
import { buildHeadlessAudioFilterComplex } from "@/features/headless-renderer/worker/audio/build-headless-audio-filter";
import type { HeadlessAudioPlan } from "@/features/headless-renderer/worker/audio/audio-plan.types";
import { HEADLESS_OUTPUT_PROFILES } from "@/features/headless-renderer/worker/runtime/output-profiles";
import type { FootieScript } from "@/features/story/types";

let passed = 0;
function test(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("\nvoice mastering + cadence parity\n");

test("shared mastering is deterministic and never changes speed", () => {
  const filters = buildVoiceMasteringFfmpegFilters(
    GENERATED_SPEECH_MASTERING_PLAN,
  );
  assert.equal(filters.length, 3);
  assert.equal(GENERATED_SPEECH_MASTERING_PLAN.playbackRate, 1);
  assert.equal(filters.some((value) => /atempo|asetrate/i.test(value)), false);
  assert.equal(filters.some((value) => /loudnorm|dynaudnorm/i.test(value)), false);
});

test("Browser and Headless consume the same mastering filter fragments", () => {
  const expected = buildVoiceMasteringFfmpegFilters(
    GENERATED_SPEECH_MASTERING_PLAN,
  );
  const browser = buildMuxVideoExportAudioFilterComplex({
    hasVoiceover: true,
    hasMusic: false,
    voiceInputIndex: 1,
    musicInputIndex: null,
    durationSec: 4,
    voiceGain: 1,
    voiceMasteringProfile: "generated_speech_v1",
  });
  const plan: HeadlessAudioPlan = {
    combination: "voiceover",
    mixPolicy: "voice-only",
    outputDurationMs: 4000,
    outputDurationSec: 4,
    sampleRateHz: 48000,
    channels: 2,
    outputCodec: "opus",
    applyPeakProtection: false,
    voiceover: {
      sourceTrimStartMs: 0,
      sourceTrimEndMs: 3500,
      timelineStartMs: 0,
      requireDelayMs: 0,
      sourceDurationMs: 3500,
      volumeGain: 1,
      padToOutputMs: 500,
      masteringProfile: "generated_speech_v1",
    },
    music: null,
    captionsAffectMix: false,
  };
  const headlessResult = buildHeadlessAudioFilterComplex({
    plan,
    voiceInputIndex: 1,
    musicInputIndex: null,
  });
  assert.equal(headlessResult.ok, true);
  const headless = headlessResult.ok
    ? headlessResult.build.filterComplex ?? ""
    : "";
  for (const fragment of expected) {
    assert.ok(browser.includes(fragment), `Browser missing ${fragment}`);
    assert.ok(headless.includes(fragment), `Headless missing ${fragment}`);
  }
  assert.equal(/atempo|asetrate/i.test(browser + headless), false);
});

test("Browser and Headless preserve mastered speech with 128 kbps audio", () => {
  const ffmpegSource = readFileSync(
    join(process.cwd(), "src/features/export/utils/ffmpeg.utils.ts"),
    "utf8",
  );
  const browserMixSource = readFileSync(
    join(
      process.cwd(),
      "src/features/export/utils/export-browser-audio-mix.utils.ts",
    ),
    "utf8",
  );
  assert.match(ffmpegSource, /"-b:a",\s*"128k"/);
  assert.match(browserMixSource, /audioBitsPerSecond:\s*128_000/);
  for (const profile of Object.values(HEADLESS_OUTPUT_PROFILES)) {
    assert.equal(profile.audioBitrate, "128k");
  }
});

test("unknown or uploaded narration remains unmastered", () => {
  const browser = buildMuxVideoExportAudioFilterComplex({
    hasVoiceover: true,
    hasMusic: false,
    voiceInputIndex: 1,
    musicInputIndex: null,
    durationSec: 4,
    voiceGain: 1,
  });
  assert.equal(browser.includes("acompressor="), false);
});

function story(sourceKind: "generated" | "uploaded"): FootieScript {
  const scene: FootieScript["scenes"][number] = {
    id: "scene-1",
    start: 0,
    end: 4,
    duration: 4,
    startMs: 0,
    endMs: 4000,
    durationMs: 4000,
    subtitle: "Voice mastering",
  };
  return {
    title: "Voice mastering",
    narration: "One coherent narration.",
    totalDuration: 4,
    scenes: [scene],
    timelineItems: [{ id: "item-1", type: "scene", scene }],
    voiceoverUrl: "https://example.com/voice.mp3",
    voiceoverDurationMs: 3500,
    voiceoverSourceKind: sourceKind,
    voiceoverVoiceSettings: { speed: 1.25 },
  };
}

test("manifest capability gates generated mastering and leaves uploads alone", () => {
  const generated = buildExportManifest({
    story: story("generated"),
    audioMode: "with-voice",
  });
  assert.equal(isExportManifestV5(generated), true);
  assert.equal(generated.audio.voiceover?.masteringProfile, "generated_speech_v1");
  assert.ok(
    isExportManifestV5(generated) &&
      generated.requiredCapabilities.includes(
        EXPORT_RENDERER_CAPABILITY_GENERATED_VOICE_MASTERING,
      ),
  );
  assert.equal(validateExportManifest(generated).ok, true);

  const uploaded = buildExportManifest({
    story: story("uploaded"),
    audioMode: "with-voice",
  });
  assert.equal(uploaded.audio.voiceover?.masteringProfile, undefined);
});

test("fast cadence cleanup preserves words and normal-speed punctuation", () => {
  const narration = "Why now?!\n\nThe answer… is pressure — and timing.";
  assert.equal(prepareNarrationForVoiceCadence(narration, 1), narration);
  const fast = prepareNarrationForVoiceCadence(narration, 1.25);
  assert.equal(fast, "Why now? The answer, is pressure, and timing.");
  const words = (value: string) => value.toLowerCase().match(/[a-z]+/g);
  assert.deepEqual(words(fast), words(narration));
});

test("fast instruction-capable voices request continuous cadence without rewrites", () => {
  assert.equal(
    prepareVoiceCadenceInstructions({ model: "tts-1", speed: 1.25 }),
    undefined,
  );
  const instructions = prepareVoiceCadenceInstructions({
    model: "gpt-4o-mini-tts",
    speed: 1.25,
    instructions: "Deliver with urgency. Do not add or change any facts.",
  });
  assert.match(instructions ?? "", /continuous/i);
  assert.match(instructions ?? "", /brief natural pauses/i);
  assert.match(instructions ?? "", /do not add, omit, or change/i);
});

console.log(`\n${passed} voice mastering/cadence checks passed.\n`);
