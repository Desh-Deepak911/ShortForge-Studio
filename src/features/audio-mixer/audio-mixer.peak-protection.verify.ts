/**
 * Peak protection verification (included in npm run test:audio-mixer).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PEAK_PROTECTION_GAIN_THRESHOLD,
  PEAK_PROTECTION_OUTPUT_CEILING,
  resolvePeakProtectionFromMixer,
  shouldApplyPeakProtection,
} from "@/features/audio-mixer/audio-mixer.peak-protection.utils";
import {
  resolveAudioMixerSettings,
  resolveMusicStemGain,
  resolveVoiceStemGain,
} from "@/features/audio-mixer/audio-mixer.utils";
import {
  buildExportBackgroundMusicFilterChain,
  resolveExportBackgroundMusicMixSettings,
} from "@/features/export/utils/export-background-music.utils";
import {
  resolvePreviewPeakProtectionActive,
  resolvePreviewVoiceSafeOutputGain,
} from "@/features/preview/utils/preview-voice-gain.utils";
import type { FootieScript } from "@/features/story/types";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function buildScript(overrides: Partial<FootieScript> = {}): FootieScript {
  return {
    title: "Peak protection QA",
    narration: "Test narration.",
    totalDuration: 10,
    voiceoverUrl: "blob:voice",
    voiceoverDurationMs: 8_000,
    scenes: [
      {
        id: "scene-1",
        start: 0,
        end: 10,
        duration: 10,
        subtitle: "Scene one",
      },
    ],
    backgroundMusic: {
      enabled: true,
      source: "upload",
      fileUrl: "blob:music",
      volume: 0.18,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: true,
    },
    ...overrides,
  };
}

console.log("peakProtection");

test("voice 2.0 triggers peak protection path", () => {
  const script = buildScript({
    audioMixer: {
      voice: { volume: 2 },
      master: { volume: 1 },
    },
  });
  const mixer = resolveAudioMixerSettings(script);

  assert.equal(resolveVoiceStemGain(mixer), 2);
  assert.equal(shouldApplyPeakProtection({
    master: mixer.master,
    voiceStemGain: 2,
    musicStemGain: resolveMusicStemGain(mixer),
  }), true);
  assert.equal(resolvePreviewPeakProtectionActive(script), true);

  const output = resolvePreviewVoiceSafeOutputGain(script);
  assert.equal(output.stemGain, 2);
  assert.equal(output.peakProtectionActive, true);
  assert.equal(output.safeOutputCeiling, PEAK_PROTECTION_OUTPUT_CEILING);

  const exportSettings = resolveExportBackgroundMusicMixSettings(script, true, 10_000)!;
  assert.equal(exportSettings.applyPeakProtection, true);
  assert.equal(exportSettings.applyDucking, true);
});

test("legacy voice 1.0 and music 0.18 do not trigger auto peak protection", () => {
  const script = buildScript();
  const mixer = resolveAudioMixerSettings(script);

  assert.equal(resolveVoiceStemGain(mixer), 1);
  assert.ok(resolveMusicStemGain(mixer) < PEAK_PROTECTION_GAIN_THRESHOLD);
  assert.equal(resolvePeakProtectionFromMixer(
    mixer,
    resolveVoiceStemGain(mixer),
    resolveMusicStemGain(mixer),
  ), false);
  assert.equal(resolvePreviewPeakProtectionActive(script), false);

  const exportSettings = resolveExportBackgroundMusicMixSettings(script, true, 10_000)!;
  assert.equal(exportSettings.applyPeakProtection, false);

  const chain = buildExportBackgroundMusicFilterChain(1, exportSettings, "music");
  assert.doesNotMatch(chain, /alimiter/);
});

test("explicit peakProtection flag enables protection at unity gain", () => {
  const script = buildScript({
    audioMixer: {
      master: { peakProtection: true },
    },
  });

  assert.equal(resolvePreviewPeakProtectionActive(script), true);
  assert.equal(
    resolvePreviewVoiceSafeOutputGain(script).safeOutputCeiling,
    PEAK_PROTECTION_OUTPUT_CEILING,
  );
});

test("export filter includes alimiter when peak protection is active", () => {
  const script = buildScript({
    audioMixer: {
      voice: { volume: 1.5 },
    },
  });
  const settings = resolveExportBackgroundMusicMixSettings(script, true, 10_000)!;
  const ffmpegUtils = readFileSync(
    join(process.cwd(), "src/features/export/utils/ffmpeg.utils.ts"),
    "utf8",
  );
  const peakProtectionUtils = readFileSync(
    join(process.cwd(), "src/features/audio-mixer/audio-mixer.peak-protection.utils.ts"),
    "utf8",
  );

  assert.equal(settings.applyPeakProtection, true);
  assert.match(ffmpegUtils, /buildExportFfmpegPeakLimiterFilterChain/);
  assert.match(peakProtectionUtils, /alimiter/);
  assert.doesNotMatch(ffmpegUtils, /loudnorm/);
});

test("preview voice boost path uses dynamics compressor when protection active", () => {
  const audioEngineSource = readFileSync(
    join(process.cwd(), "src/features/audio/services/audio-engine.service.ts"),
    "utf8",
  );
  const previewHook = readFileSync(
    join(process.cwd(), "src/features/preview/hooks/usePreviewPlayback.ts"),
    "utf8",
  );

  assert.match(audioEngineSource, /configurePreviewPeakProtectionCompressor/);
  assert.match(audioEngineSource, /createDynamicsCompressor/);
  assert.match(previewHook, /resolvePreviewPeakProtectionActive/);
  assert.match(previewHook, /syncNarrationPreviewGain/);
});

console.log("All peak protection checks passed.");
