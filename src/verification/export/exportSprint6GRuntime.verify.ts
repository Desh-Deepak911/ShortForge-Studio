/**
 * Sprint 6G runtime forensics — gain freeze, FFmpeg.wasm-safe graphs, canvas quality.
 * Run: npm run test:export-6g-runtime
 *
 * Confirmed browser regression: applyPeakProtection injected `alimiter` into the
 * FFmpeg.wasm mux graph after visual encode succeeded → WebM audio mux aborted.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveAudioMixerSettings,
  resolveMusicStemGain,
  resolvePeakProtectionFromMixer,
  resolveVoiceStemGain,
} from "@/features/audio-mixer";
import { prepareExportAudio } from "@/features/export/audio";
import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
  type ExportManifest,
} from "@/features/export/domain";
import { applyExportCanvasMediaQuality } from "@/features/export/utils/export-scene-media-renderer";
import {
  buildMuxVideoExportAudioFilterComplex,
  normalizeExportMuxGain,
} from "@/features/export/utils/ffmpeg.utils";
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

function assertFiniteGain(gain: number, label: string) {
  assert.equal(Number.isFinite(gain), true, `${label} must be finite`);
  assert.ok(gain >= 0, `${label} must be >= 0`);
}

function assertJsonSerializable(manifest: ExportManifest) {
  const json = JSON.stringify(manifest);
  assert.ok(json.length > 0);
  const parsed = JSON.parse(json) as ExportManifest;
  assert.equal(typeof parsed.audio.applyPeakProtection, "boolean");
  assert.doesNotMatch(json, /\[object Object\]|undefined|NaN/);
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
    subtitle: "Hello",
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
    title: "6G Runtime",
    narration: "Hello",
    totalDuration: 5,
    exportSettings: {
      fileName: "6g-runtime",
      format: "webm",
      quality: "standard",
      resolution: "720x1280",
    },
    scenes: [scene],
    timelineItems: [{ id: "ti-1", type: "scene", scene }],
    voiceoverUrl: "https://example.com/voice.mp3",
    voiceoverDurationMs: 4500,
    backgroundMusic: {
      enabled: true,
      source: "upload",
      fileUrl: "https://example.com/music.mp3",
      volume: 0.4,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: true,
    },
    ...overrides,
  });
}

console.log("\nexport-6g-runtime (Sprint 6G forensics)\n");

test("voice/music gains 0 / 1 / 2 freeze finite and serializable", () => {
  for (const gain of [0, 1, 2]) {
    const story = baseStory({
      audioMixer: {
        voice: { volume: gain },
        music: { volume: gain },
        master: { volume: 1 },
      },
    });
    const mixer = resolveAudioMixerSettings(story);
    const voiceGain = resolveVoiceStemGain(mixer);
    const musicGain = resolveMusicStemGain(mixer);
    assertFiniteGain(voiceGain, "voice");
    assertFiniteGain(musicGain, "music");
    assert.equal(voiceGain, gain);
    assert.equal(musicGain, gain);

    const manifest = buildExportManifest({
      story,
      environment: CAPABLE_ENV,
      audioMode: "with-voice",
      includeBackgroundMusic: true,
    });
    assert.equal(manifest.audio.voiceover?.volume, gain);
    assert.equal(manifest.audio.music?.volume, gain);
    assert.equal(
      manifest.audio.applyPeakProtection,
      resolvePeakProtectionFromMixer(mixer, voiceGain, musicGain),
    );
    assertJsonSerializable(manifest);

    const prepared = prepareExportAudio(manifest, { outputFormat: "webm" });
    assert.equal(prepared.voiceover?.volume, gain);
    assert.equal(prepared.music?.volume, gain);
  }
});

test("peak protection enabled at 200% and disabled at 100%", () => {
  const boosted = buildExportManifest({
    story: baseStory({ audioMixer: { voice: { volume: 2 } } }),
    environment: CAPABLE_ENV,
    audioMode: "with-voice",
  });
  assert.equal(boosted.audio.applyPeakProtection, true);
  assert.equal(boosted.audio.voiceover?.volume, 2);

  const unity = buildExportManifest({
    story: baseStory({ audioMixer: { voice: { volume: 1 }, music: { volume: 0.2 } } }),
    environment: CAPABLE_ENV,
    audioMode: "with-voice",
    includeBackgroundMusic: true,
  });
  assert.equal(unity.audio.applyPeakProtection, false);
  assert.equal(unity.audio.voiceover?.volume, 1);
});

test("FFmpeg.wasm graphs apply volume= for 100% and 200% without alimiter", () => {
  for (const voiceGain of [1, 2]) {
    const voiceOnly = buildMuxVideoExportAudioFilterComplex({
      hasVoiceover: true,
      hasMusic: false,
      voiceInputIndex: 1,
      musicInputIndex: null,
      durationSec: 27.4,
      voiceGain,
    });
    assert.doesNotMatch(voiceOnly, /alimiter/);
    assert.match(voiceOnly, /\[aout\]/);
    if (voiceGain === 1) {
      assert.doesNotMatch(voiceOnly, /volume=/);
    } else {
      assert.match(voiceOnly, /volume=2\.0000/);
    }

    const mixed = buildMuxVideoExportAudioFilterComplex({
      hasVoiceover: true,
      hasMusic: true,
      voiceInputIndex: 1,
      musicInputIndex: 2,
      durationSec: 27.4,
      voiceGain,
      backgroundMusicMix: {
        exportDurationMs: 27400,
        volume: 0.4,
        voiceGain,
        musicGain: 0.4,
        fadeIn: true,
        fadeOut: true,
        fadeInSec: 0.5,
        fadeOutSec: 0.5,
        duckingEnabled: true,
        duckingStrength: 0.35,
        voiceoverDurationSec: 26,
        applyDucking: true,
        applyPeakProtection: true,
      },
    });
    assert.doesNotMatch(mixed, /alimiter/);
    assert.match(mixed, /volume=/);
    assert.match(mixed, /amix=/);
    assert.match(mixed, /\[aout\]/);
  }
});

test("normalizeExportMuxGain rejects NaN / negative / non-finite", () => {
  assert.equal(normalizeExportMuxGain(2), 2);
  assert.equal(normalizeExportMuxGain(0), 0);
  assert.equal(normalizeExportMuxGain(Number.NaN), 1);
  assert.equal(normalizeExportMuxGain(Number.POSITIVE_INFINITY), 1);
  assert.equal(normalizeExportMuxGain(-1), 1);
  assert.equal(normalizeExportMuxGain(undefined), 1);
});

test("canvas quality helper is safe with valid and absent contexts", () => {
  applyExportCanvasMediaQuality(null);
  applyExportCanvasMediaQuality(undefined);

  const calls: Record<string, unknown> = {};
  const ctx = {
    set imageSmoothingEnabled(v: boolean) {
      calls.enabled = v;
    },
    set imageSmoothingQuality(v: ImageSmoothingQuality) {
      calls.quality = v;
    },
  } as CanvasRenderingContext2D;
  applyExportCanvasMediaQuality(ctx);
  assert.equal(calls.enabled, true);
  assert.equal(calls.quality, "high");
});

test("structural: wasm mux skips alimiter; framing UI stays client; no functions in audio freeze", () => {
  const ffmpeg = read("src/features/export/utils/ffmpeg.utils.ts");
  assert.match(ffmpeg, /buildMuxVideoExportAudioFilterComplex/);
  assert.match(ffmpeg, /Post-mix `alimiter` is intentionally NOT/);
  assert.doesNotMatch(ffmpeg, /buildExportFfmpegPeakLimiterFilterChain\(/);

  const framing = read("src/features/editor/components/MediaFramingInspectorControls.tsx");
  assert.match(framing, /^"use client";/);

  const builder = read("src/features/export/domain/build-export-manifest.ts");
  assert.match(builder, /applyPeakProtection:\s*resolvePeakProtectionFromMixer/);
  assert.match(builder, /resolveVoiceStemGain/);

  const manifest = buildExportManifest({
    story: baseStory({ audioMixer: { voice: { volume: 2 } } }),
    environment: CAPABLE_ENV,
    audioMode: "with-voice",
  });
  for (const value of Object.values(manifest.audio)) {
    assert.notEqual(typeof value, "function");
  }
  assert.equal(typeof manifest.audio.applyPeakProtection, "boolean");
});

console.log(`\nexport-6g-runtime: ${passed} passed\n`);
