/**
 * Audio mixer UI verification
 * (run: npm run test:audio-mixer-ui).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyStoryAudioMixer,
  DEFAULT_DUCKING_STRENGTH,
  DEFAULT_MASTER_MIX_VOLUME,
  DEFAULT_VOICE_MIX_VOLUME,
  formatMixerVolumePercent,
  resolveAudioMixerSettings,
} from "@/features/audio-mixer";
import type { FootieScript } from "@/features/story/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = __dirname;
const PROJECT_AUDIO_STUDIO_PATH = join(
  __dirname,
  "../editor/components/ProjectAudioStudio.tsx",
);

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

function buildLegacyScript(overrides: Partial<FootieScript> = {}): FootieScript {
  return {
    title: "Mixer UI QA",
    narration: "Test narration.",
    totalDuration: 6,
    scenes: [
      {
        id: "scene-1",
        start: 0,
        end: 6,
        duration: 6,
        subtitle: "Scene one",
      },
    ],
    ...overrides,
  };
}

function collectUiSources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectUiSources(fullPath));
      continue;
    }

    if (/AudioMixer.*\.tsx$/.test(entry)) {
      files.push(fullPath);
    }
  }

  return files;
}

console.log("audioMixerUi");

test("legacy draft without audioMixer shows resolved defaults in UI layer", () => {
  const script = buildLegacyScript({
    backgroundMusic: {
      enabled: true,
      source: "upload",
      fileUrl: "blob:music",
      volume: 0.42,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: true,
    },
  });

  assert.equal(script.audioMixer, undefined);

  const resolved = resolveAudioMixerSettings(script);
  assert.equal(resolved.voice.volume, DEFAULT_VOICE_MIX_VOLUME);
  assert.equal(resolved.master.volume, DEFAULT_MASTER_MIX_VOLUME);
  assert.equal(resolved.music.volume, 0.42);
  assert.equal(resolved.music.duckingEnabled, true);
  assert.equal(resolved.music.duckingStrength, DEFAULT_DUCKING_STRENGTH);
});

test("applyStoryAudioMixer writes audioMixer only after first adjustment", () => {
  const script = buildLegacyScript();
  assert.equal(script.audioMixer, undefined);

  const updated = applyStoryAudioMixer(script, { voice: { volume: 1.25 } });
  assert.ok(updated.audioMixer);
  assert.equal(updated.audioMixer?.voice?.volume, 1.25);
  assert.equal(script.audioMixer, undefined);
});

test("applyStoryAudioMixer merges nested patches without mutating script", () => {
  const script = buildLegacyScript({
    audioMixer: {
      voice: { volume: 1.1 },
    },
  });
  const snapshot = structuredClone(script);

  const updated = applyStoryAudioMixer(script, {
    music: { volume: 0.55, duckingEnabled: false },
    master: { volume: 0.9 },
  });

  assert.deepEqual(script, snapshot);
  assert.equal(updated.audioMixer?.voice?.volume, 1.1);
  assert.equal(updated.audioMixer?.music?.volume, 0.55);
  assert.equal(updated.audioMixer?.music?.duckingEnabled, false);
  assert.equal(updated.audioMixer?.master?.volume, 0.9);
});

test("slider bindings use 0–2 volume range and 0.05 step", () => {
  const panelSource = readSource(join(MODULE_ROOT, "AudioMixerPanel.tsx"));
  const sliderSource = readSource(join(MODULE_ROOT, "AudioMixerSlider.tsx"));

  assert.match(panelSource, /MAX_MIX_VOLUME/);
  assert.match(panelSource, /MIN_MIX_VOLUME/);
  assert.match(panelSource, /VOLUME_STEP = 0\.05/);
  assert.match(panelSource, /DUCKING_STEP = 0\.05/);
  assert.match(panelSource, /resolveAudioMixerSettings\(script\)/);
  assert.match(panelSource, /applyStoryAudioMixer\(script/);
  assert.match(sliderSource, /type="range"/);
  assert.match(sliderSource, /formatMixerVolumePercent/);
});

test("ducking strength slider is conditional on ducking enabled", () => {
  const panelSource = readSource(join(MODULE_ROOT, "AudioMixerPanel.tsx"));

  assert.match(panelSource, /mixer\.music\.duckingEnabled \?/);
  assert.match(panelSource, /label="Ducking Strength"/);
  assert.match(panelSource, /label="Enable Ducking"/);
});

test("coming-soon controls are disabled", () => {
  const panelSource = readSource(join(MODULE_ROOT, "AudioMixerPanel.tsx"));

  assert.match(panelSource, /Normalize Voice/);
  assert.match(panelSource, /Coming soon/);
  assert.match(panelSource, /label="Limiter"/);
  assert.match(panelSource, /label="Peak Protection"/);
  assert.match(panelSource, /peakProtection/);
  assert.match(panelSource, /Normalize Voice[\s\S]*comingSoon/);
  assert.match(panelSource, /label="Limiter"[\s\S]*comingSoon/);
});

test("ProjectAudioStudio integrates Audio Mixer between music and export", () => {
  const studioSource = readSource(PROJECT_AUDIO_STUDIO_PATH);

  assert.match(studioSource, /AudioMixerPanel/);
  assert.match(studioSource, /title="Audio Mixer"/);
  assert.match(studioSource, /Background Music[\s\S]*Audio Mixer[\s\S]*Export Mix/);
});

test("formatMixerVolumePercent maps 1.0 to 100% and 2.0 to 200%", () => {
  assert.equal(formatMixerVolumePercent(0), "0%");
  assert.equal(formatMixerVolumePercent(1), "100%");
  assert.equal(formatMixerVolumePercent(2), "200%");
});

test("audio mixer UI files do not touch playback, export mux, or generation", () => {
  const forbiddenPatterns = [
    /generateVoiceover/,
    /muxVideoWithExportAudio/,
    /mixExportVoiceoverAndBackgroundMusic/,
    /usePreviewPlayback/,
    /VideoPreview/,
    /CaptionEngine/,
    /AssetBrowser/,
  ];

  for (const filePath of collectUiSources(MODULE_ROOT)) {
    const contents = readFileSync(filePath, "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(contents, pattern, `${filePath} must remain UI-only`);
    }
  }
});

console.log("All audio mixer UI checks passed.");
