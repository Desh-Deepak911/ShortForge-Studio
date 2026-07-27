/**
 * Sprint 6G — voice/music gain parity: Story → Manifest → Prepared → adapters.
 * Run: npm run test:export-audio-parity
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveAudioMixerSettings,
  resolveMusicStemGain,
  resolvePeakProtectionFromMixer,
  resolveVoiceVolumeGain,
  resolveVoiceStemGain,
} from "@/features/audio-mixer";
import { prepareExportAudio } from "@/features/export/audio";
import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

const CAPABLE_ENV: Partial<ExportEnvironmentSnapshot> = {
  browserName: "chrome",
  supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true,
  supportsMediaRecorder: true,
  supportsRequestVideoFrameCallback: true,
  supportsWebAssembly: true,
  serverRendererAvailable: false,
  ffmpegRuntimePoisoned: false,
  estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
};

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function baseStory(overrides: Partial<FootieScript> = {}): FootieScript {
  const scene = {
    id: "s1",
    start: 0,
    end: 5,
    duration: 5,
    startMs: 0,
    endMs: 5000,
    durationMs: 5000,
    subtitle: "Hello world",
    media: {
      type: "image" as const,
      url: "https://example.com/a.jpg",
      source: "upload" as const,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    },
    image: {
      url: "https://example.com/a.jpg",
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      fitMode: "fit" as const,
    },
  };
  return syncFootieScript({
    title: "Audio Parity",
    narration: "Hello world",
    totalDuration: 5,
    exportSettings: {
      fileName: "audio-parity",
      format: "webm",
      quality: "standard",
      resolution: "720x1280",
    },
    scenes: [scene],
    timelineItems: [{ id: "ti-1", type: "scene", scene }],
    voiceoverUrl: "https://example.com/voice.mp3",
    voiceoverDurationMs: 4500,
    voiceSettings: { speed: 1.1 },
    backgroundMusic: {
      enabled: true,
      source: "upload",
      fileUrl: "https://example.com/music.mp3",
      volume: 0.5,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: true,
    },
    ...overrides,
  });
}

console.log("\nexport-audio-parity (Sprint 6G)\n");

test("voice gain freezes stem gain (bus × master) for 0–200%", () => {
  const cases: Array<{ voice: number; master: number; expected: number }> = [
    { voice: 0, master: 1, expected: 0 },
    { voice: 0.25, master: 1, expected: 0.25 },
    { voice: 0.5, master: 1, expected: 0.5 },
    { voice: 1, master: 1, expected: 1 },
    { voice: 1.5, master: 1, expected: resolveVoiceVolumeGain(1.5) },
    { voice: 2, master: 1, expected: resolveVoiceVolumeGain(2) },
    { voice: 1.5, master: 0.8, expected: resolveVoiceVolumeGain(1.5) * 0.8 },
  ];

  for (const { voice, master, expected } of cases) {
    const story = baseStory({
      audioMixer: {
        voice: { volume: voice },
        master: { volume: master },
        music: { volume: 0.4 },
      },
    });
    const mixer = resolveAudioMixerSettings(story);
    assert.ok(Math.abs(resolveVoiceStemGain(mixer) - expected) < 1e-9);

    const manifest = buildExportManifest({
      story,
      environment: CAPABLE_ENV,
      audioMode: "with-voice",
      includeBackgroundMusic: true,
    });
    assert.ok(Math.abs((manifest.audio.voiceover?.volume ?? NaN) - expected) < 1e-9);
    assert.equal(manifest.audio.voiceover?.generatedPlaybackRate, 1);

    const prepared = prepareExportAudio(manifest, { outputFormat: "webm" });
    assert.ok(Math.abs((prepared.voiceover?.volume ?? NaN) - expected) < 1e-9);
  }
});

test("music gain freezes stem gain independently of voice", () => {
  const story = baseStory({
    audioMixer: {
      voice: { volume: 0.25 },
      music: { volume: 0.8 },
      master: { volume: 0.5 },
    },
  });
  const mixer = resolveAudioMixerSettings(story);
  const expectedMusic = resolveMusicStemGain(mixer); // 0.4
  assert.equal(expectedMusic, 0.4);

  const manifest = buildExportManifest({
    story,
    environment: CAPABLE_ENV,
    audioMode: "with-voice",
    includeBackgroundMusic: true,
  });
  assert.equal(manifest.audio.voiceover?.volume, 0.125);
  assert.equal(manifest.audio.music?.volume, expectedMusic);
  assert.equal(manifest.audio.music?.duckingEnabled, mixer.music.duckingEnabled);
  assert.equal(manifest.audio.music?.duckingStrength, mixer.music.duckingStrength);
  assert.equal(manifest.audio.music?.fadeInMs, mixer.music.fadeInMs);
  assert.equal(manifest.audio.music?.fadeOutMs, mixer.music.fadeOutMs);

  const prepared = prepareExportAudio(manifest, { outputFormat: "webm" });
  assert.equal(prepared.music?.volume, expectedMusic);
  assert.equal(prepared.voiceover?.volume, 0.125);
});

test("ducking + fades survive manifest freeze unchanged", () => {
  const story = baseStory({
    audioMixer: {
      music: {
        volume: 0.35,
        duckingEnabled: true,
        duckingStrength: 0.55,
        fadeInMs: 250,
        fadeOutMs: 800,
      },
    },
  });
  const manifest = buildExportManifest({
    story,
    environment: CAPABLE_ENV,
    audioMode: "with-voice",
    includeBackgroundMusic: true,
  });
  assert.equal(manifest.audio.music?.duckingEnabled, true);
  assert.equal(manifest.audio.music?.duckingStrength, 0.55);
  assert.equal(manifest.audio.music?.fadeInMs, 250);
  assert.equal(manifest.audio.music?.fadeOutMs, 800);
});

test("peak protection freezes from mixer + stem gains", () => {
  const boosted = baseStory({
    audioMixer: {
      voice: { volume: 2 },
      master: { volume: 1 },
    },
  });
  const mixer = resolveAudioMixerSettings(boosted);
  const expected = resolvePeakProtectionFromMixer(
    mixer,
    resolveVoiceStemGain(mixer),
    resolveMusicStemGain(mixer),
  );
  assert.equal(expected, true);

  const manifest = buildExportManifest({
    story: boosted,
    environment: CAPABLE_ENV,
    audioMode: "with-voice",
  });
  assert.equal(manifest.audio.applyPeakProtection, true);
  assert.equal(manifest.audio.voiceover?.volume, resolveVoiceVolumeGain(2));
});

test("silent mode has no voice stem; Model A playback rate stays 1", () => {
  const story = baseStory({ voiceoverUrl: undefined, voiceoverDurationMs: undefined });
  const manifest = buildExportManifest({
    story,
    environment: CAPABLE_ENV,
    audioMode: "silent",
  });
  assert.equal(manifest.audio.voiceover, null);
  assert.equal(typeof manifest.audio.applyPeakProtection, "boolean");
});

test("structural: adapters consume frozen volume; no hardcoded voice volume: 1", () => {
  const builder = read("src/features/export/domain/build-export-manifest.ts");
  assert.match(builder, /resolveVoiceStemGain/);
  assert.match(builder, /resolveMusicStemGain/);
  assert.doesNotMatch(builder, /volume:\s*1,\s*\n\s*generatedPlaybackRate:\s*1/);

  const mp4 = read("src/features/export/formats/mp4-export-format-adapter.ts");
  const webm = read("src/features/export/formats/webm-export-format-adapter.ts");
  assert.match(mp4, /voiceGain:\s*prepared(?:Audio)?\.voiceover\?\.volume/);
  assert.match(webm, /voiceGain:\s*prepared(?:Audio)?\.voiceover\?\.volume/);
  assert.match(mp4, /applyPeakProtection:\s*manifest\.audio\.applyPeakProtection/);
  assert.match(webm, /applyPeakProtection:\s*manifest\.audio\.applyPeakProtection/);

  const prepare = read("src/features/export/audio/prepare-export-audio.ts");
  assert.match(prepare, /volume:\s*voice\.volume/);
  assert.match(prepare, /generatedPlaybackRate:\s*1/);
});

console.log(`\nexport-audio-parity: ${passed} passed\n`);
