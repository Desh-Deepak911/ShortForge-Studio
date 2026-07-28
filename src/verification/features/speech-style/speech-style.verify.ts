/**
 * Speech style verification
 * (run: npm run test:speech-style).
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  hasNarrationTextVoiceoverMismatch,
  hasVoiceSettingsVoiceoverMismatch,
} from "@/features/audio/utils/voiceover-status.utils";
import {
  DEFAULT_SPEECH_STYLE_PRESET,
  getSpeechStylePresets,
  resolveSpeechStyleInstructions,
  resolveSpeechStyleInstructionsForVoice,
  resolveSpeechStylePreset,
  resolveTtsModelForVoice,
  speechStyleInstructionTextIsSafe,
  SPEECH_STYLE_PRESET_ORDER,
  TTS_MODEL_EXPRESSIVE,
  TTS_MODEL_NEUTRAL,
} from "@/features/speech-style";
import { normalizeStoryVoiceSettings } from "@/features/story/utils/voice-settings.utils";
import { applyStoryVoiceSettings } from "@/lib/utils/voiceover";

const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
} as NodeModule;

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEECH_STYLE_ROOT = join(process.cwd(), "src/features/speech-style");
const VOICEOVER_SERVICE_PATH = join(
  process.cwd(),
  "src/features/story/services/voiceover.service.ts",
);
const VOICE_PREVIEW_ROUTE_PATH = join(process.cwd(), "src/app/api/voice-preview/route.ts");
const VOICE_PREVIEW_UTILS_PATH = join(process.cwd(), "src/features/voice-preview/voice-preview.utils.ts");

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function collectSpeechStyleSources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectSpeechStyleSources(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".verify.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

function buildScriptWithVoiceover(overrides: Record<string, unknown> = {}) {
  return {
    title: "Speech Style QA",
    narration: "Arsenal score late to win the derby.",
    totalDuration: 8,
    scenes: [{ id: "1", start: 0, end: 8, duration: 8, subtitle: "Scene" }],
    voiceoverUrl: "blob:voiceover-test",
    voiceoverNarration: "Arsenal score late to win the derby.",
    voiceoverVoiceSettings: {
      voice: "alloy",
      speed: 1,
      stylePreset: "neutral",
      expressiveDelivery: false,
    },
    voiceSettings: {
      voice: "alloy",
      speed: 1,
      stylePreset: "neutral",
      expressiveDelivery: false,
    },
    ...overrides,
  };
}

console.log("speech-style");

test("preset registry complete", () => {
  assert.equal(SPEECH_STYLE_PRESET_ORDER.length, 8);
  assert.equal(getSpeechStylePresets().length, 8);
  for (const presetId of SPEECH_STYLE_PRESET_ORDER) {
    const preset = getSpeechStylePresets().find((entry) => entry.id === presetId);
    assert.ok(preset, `${presetId} must exist`);
    assert.ok(preset.label.trim());
    assert.ok(preset.description.trim());
    assert.ok(preset.toneTags.length > 0);
    assert.ok(preset.recommendedFor.length > 0);
  }
});

test("neutral preset returns no instructions", () => {
  const result = resolveSpeechStyleInstructions("neutral", true);
  assert.equal(result.preset, "neutral");
  assert.equal(result.useInstructionTts, false);
  assert.equal(result.model, TTS_MODEL_NEUTRAL);
  assert.equal(result.instructions, undefined);
});

test("non-neutral preset returns safe instruction text", () => {
  for (const presetId of SPEECH_STYLE_PRESET_ORDER) {
    if (presetId === DEFAULT_SPEECH_STYLE_PRESET) {
      continue;
    }

    const result = resolveSpeechStyleInstructions(presetId, true);
    assert.equal(result.useInstructionTts, true);
    assert.equal(result.model, TTS_MODEL_EXPRESSIVE);
    assert.ok(result.instructions && result.instructions.length > 20);
    assert.equal(speechStyleInstructionTextIsSafe(result.instructions), true);
  }
});

test("existing drafts without style fields normalize safely", () => {
  const legacy = normalizeStoryVoiceSettings({});
  assert.equal(legacy.speed, 1);
  assert.equal(legacy.stylePreset, DEFAULT_SPEECH_STYLE_PRESET);
  assert.equal(legacy.expressiveDelivery, false);

  const legacyWithVoice = normalizeStoryVoiceSettings({ voiceSettings: { voice: "nova", speed: 1.1 } });
  assert.equal(legacyWithVoice.voice, "nova");
  assert.equal(legacyWithVoice.stylePreset, DEFAULT_SPEECH_STYLE_PRESET);
  assert.equal(resolveSpeechStylePreset(undefined), DEFAULT_SPEECH_STYLE_PRESET);
});

test("style-only update does not change script.narration", () => {
  const script = buildScriptWithVoiceover();
  const next = applyStoryVoiceSettings(script, { stylePreset: "sports_hype" });
  assert.equal(next.narration, script.narration);
  assert.equal(next.voiceoverNarration, script.voiceoverNarration);
});

test("style-only update marks voice settings stale", () => {
  const script = buildScriptWithVoiceover();
  const next = applyStoryVoiceSettings(script, { stylePreset: "cinematic" });
  assert.equal(hasVoiceSettingsVoiceoverMismatch(next), true);
});

test("style-only update does not mark narration stale", () => {
  const script = buildScriptWithVoiceover();
  const next = applyStoryVoiceSettings(script, { stylePreset: "news" });
  assert.equal(hasNarrationTextVoiceoverMismatch(next), false);
});

test("neutral uses existing tts-1 path", () => {
  const serviceSource = readFileSync(VOICEOVER_SERVICE_PATH, "utf8");
  const neutral = resolveSpeechStyleInstructions("neutral", true);
  assert.equal(neutral.model, "tts-1");
  assert.match(serviceSource, /model = options\.model \?\? TTS_MODEL/);
  assert.match(serviceSource, /const TTS_MODEL = "tts-1"/);
  assert.match(serviceSource, /resolveSpeechStyleInstructionsForVoice/);
});

test("gpt-4o-only voices use expressive engine on neutral delivery", () => {
  for (const voice of ["ballad", "marin", "verse", "cedar"] as const) {
    assert.equal(resolveTtsModelForVoice(voice, "neutral", false), TTS_MODEL_EXPRESSIVE);
    const resolved = resolveSpeechStyleInstructionsForVoice(voice, "neutral", false);
    assert.equal(resolved.model, TTS_MODEL_EXPRESSIVE);
    assert.equal(resolved.useInstructionTts, false);
  }
});

test("legacy voices stay on tts-1 for neutral delivery", () => {
  assert.equal(resolveTtsModelForVoice("nova", "neutral", false), TTS_MODEL_NEUTRAL);
  assert.equal(resolveTtsModelForVoice("alloy", "neutral", false), TTS_MODEL_NEUTRAL);
});

test("cedar stays on expressive engine when delivery expressive is off", () => {
  assert.equal(resolveTtsModelForVoice("cedar", "documentary", false), TTS_MODEL_EXPRESSIVE);
  const resolved = resolveSpeechStyleInstructionsForVoice("cedar", "documentary", false);
  assert.equal(resolved.model, TTS_MODEL_EXPRESSIVE);
  assert.equal(resolved.useInstructionTts, false);
});

test("non-neutral expressive uses instruction path", () => {
  const serviceSource = readFileSync(VOICEOVER_SERVICE_PATH, "utf8");
  const expressive = resolveSpeechStyleInstructions("debate", true);
  assert.equal(expressive.model, TTS_MODEL_EXPRESSIVE);
  assert.equal(expressive.useInstructionTts, true);
  assert.match(serviceSource, /instructions: style\.instructions/);
  assert.match(serviceSource, /model: style\.model/);
});

test("voice preview accepts style preset without persisting anything", () => {
  const previewUtils = readFileSync(VOICE_PREVIEW_UTILS_PATH, "utf8");
  const previewRoute = readFileSync(VOICE_PREVIEW_ROUTE_PATH, "utf8");

  assert.match(previewUtils, /stylePreset/);
  assert.match(previewUtils, /expressiveDelivery/);
  assert.match(previewUtils, /resolveSpeechStylePreset/);
  assert.doesNotMatch(previewRoute, /voiceoverAudioBase64/);
  assert.doesNotMatch(previewRoute, /onScriptChange/);
});

test("no export, preview playback, or caption imports", () => {
  const forbidden = [
    /features\/export/,
    /VideoPreview/,
    /features\/preview/,
    /caption\.utils/,
    /export-narration-voiceover/,
  ];
  const sources = collectSpeechStyleSources(SPEECH_STYLE_ROOT);

  for (const filePath of sources) {
    const source = readFileSync(filePath, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${filePath} must stay delivery-only`);
    }
  }
});

console.log("speech-style passed");
