/**
 * Export background music mixing verification (run: npm run test:export-background-music).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildExportBackgroundMusicFilterChain,
  resolveExportBackgroundMusicBedVolume,
  resolveExportBackgroundMusicMixSettings,
  resolveExportDuckedMusicGain,
  resolveExportMusicGainAtSec,
} from "@/features/export/utils/export-background-music.utils";
import type { FootieScript } from "@/features/story/types";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const scriptWithMusic: FootieScript = {
  title: "Music Export",
  narration: "Test narration.",
  totalDuration: 12,
  scenes: [
    {
      id: "1",
      start: 0,
      end: 12,
      duration: 12,
      subtitle: "Scene",
    },
  ],
  voiceoverUrl: "blob:voiceover",
  voiceoverDurationMs: 8_000,
  backgroundMusic: {
    enabled: true,
    source: "upload",
    fileUrl: "blob:music-track",
    fileName: "ambient.mp3",
    volume: 0.2,
    duckingEnabled: true,
    fadeIn: true,
    fadeOut: true,
  },
};

console.log("exportBackgroundMusic");

test("resolveExportBackgroundMusicBedVolume uses track volume without ducking", () => {
  const music = scriptWithMusic.backgroundMusic!;
  assert.equal(resolveExportBackgroundMusicBedVolume(music), 0.2);
  assert.equal(resolveExportBackgroundMusicBedVolume(music), 0.2);
});

test("resolveExportBackgroundMusicMixSettings includes fade windows and export duration", () => {
  const settings = resolveExportBackgroundMusicMixSettings(scriptWithMusic, true, 30_000);
  assert.ok(settings);
  assert.equal(settings?.exportDurationMs, 30_000);
  assert.equal(settings?.fadeInSec, 2);
  assert.equal(settings?.fadeOutSec, 2);
  assert.equal(settings?.voiceGain, 1);
  assert.equal(settings?.musicGain, 0.2);
  assert.equal(settings?.applyDucking, true);
  assert.equal(settings?.voiceoverDurationSec, 8);
});

test("export ducking disabled keeps static music gain", () => {
  const script: FootieScript = {
    ...scriptWithMusic,
    backgroundMusic: {
      ...scriptWithMusic.backgroundMusic!,
      duckingEnabled: false,
    },
  };
  const settings = resolveExportBackgroundMusicMixSettings(script, true, 12_000)!;
  assert.equal(settings.applyDucking, false);
  assert.equal(resolveExportMusicGainAtSec(settings, 4), 0.2);

  const chain = buildExportBackgroundMusicFilterChain(2, settings, "music");
  assert.match(chain, /volume=0\.2000/);
  assert.doesNotMatch(chain, /if\(lt\(t/);
});

test("export ducking 35% attenuates music during voiceover like preview", () => {
  const settings = resolveExportBackgroundMusicMixSettings(scriptWithMusic, true, 12_000)!;
  assert.equal(settings.duckingStrength, 0.35);
  assert.ok(Math.abs(resolveExportDuckedMusicGain(settings.musicGain, settings.duckingStrength) - 0.07) < 0.0001);
  assert.ok(Math.abs(resolveExportMusicGainAtSec(settings, 4) - 0.07) < 0.0001);

  const chain = buildExportBackgroundMusicFilterChain(2, settings, "music");
  assert.match(chain, /if\(lt\(t\\,8\.000\)\\,0\.0700\\,0\.2000\)/);
});

test("export ducking strength 0 mutes music during voiceover", () => {
  const script: FootieScript = {
    ...scriptWithMusic,
    audioMixer: {
      music: { duckingStrength: 0, duckingEnabled: true },
    },
  };
  const settings = resolveExportBackgroundMusicMixSettings(script, true, 12_000)!;
  assert.equal(resolveExportMusicGainAtSec(settings, 2), 0);
  assert.equal(resolveExportMusicGainAtSec(settings, 10), 0.2);
});

test("export with no voiceover does not apply ducking", () => {
  const settings = resolveExportBackgroundMusicMixSettings(scriptWithMusic, false, 12_000)!;
  assert.equal(settings.applyDucking, false);
  assert.equal(resolveExportMusicGainAtSec(settings, 2), 0.2);
});

test("resolveExportBackgroundMusicMixSettings maps low music volume to gain path", () => {
  const lowVolumeScript: FootieScript = {
    ...scriptWithMusic,
    backgroundMusic: {
      ...scriptWithMusic.backgroundMusic!,
      volume: 0.01,
    },
  };
  const settings = resolveExportBackgroundMusicMixSettings(lowVolumeScript, true, 12_000);
  assert.equal(settings?.musicGain, 0.01);
});

test("buildExportBackgroundMusicFilterChain loops and trims to export duration", () => {
  const noDuckScript: FootieScript = {
    ...scriptWithMusic,
    backgroundMusic: {
      ...scriptWithMusic.backgroundMusic!,
      duckingEnabled: false,
    },
  };
  const settings = resolveExportBackgroundMusicMixSettings(noDuckScript, true, 12_000)!;
  const chain = buildExportBackgroundMusicFilterChain(2, settings, "music");

  assert.match(chain, /\[2:a\]/);
  assert.match(chain, /aresample=48000/);
  assert.match(chain, /aformat=sample_fmts=fltp:channel_layouts=stereo/);
  assert.match(chain, /aloop=loop=-1:size=2e\+09/);
  assert.match(chain, /atrim=0:12\.000/);
  assert.match(chain, /asetpts=PTS-STARTPTS/);
  assert.match(chain, /volume=0\.2000/);
  assert.doesNotMatch(chain, /apad=/);
  assert.doesNotMatch(chain, /afade=/);
  assert.match(chain, /\[music\]$/);
});

test("export with boosted voice enables peak protection on mix settings", () => {
  const boostedScript: FootieScript = {
    ...scriptWithMusic,
    audioMixer: {
      voice: { volume: 2 },
    },
  };
  const settings = resolveExportBackgroundMusicMixSettings(boostedScript, true, 12_000)!;
  assert.equal(settings.applyPeakProtection, true);
  assert.equal(settings.applyDucking, true);
});

test("music fade envelope remains available in browser export mix path", () => {
  const browserMix = readFileSync(
    join(process.cwd(), "src/features/export/utils/export-browser-audio-mix.utils.ts"),
    "utf8",
  );

  assert.match(browserMix, /applyMusicFadeEnvelope/);
  assert.match(browserMix, /configurePreviewPeakProtectionCompressor/);
  assert.match(browserMix, /fadeOutSec/);
  assert.doesNotMatch(browserMix, /loudnorm/);
});

test("preview ducking path remains unchanged", () => {
  const previewMusic = readFileSync(
    join(process.cwd(), "src/features/preview/utils/preview-background-music.utils.ts"),
    "utf8",
  );

  assert.match(previewMusic, /duckingStrength/);
  assert.match(previewMusic, /voiceoverIsPlaying/);
  assert.doesNotMatch(previewMusic, /resolveExportDuckedMusicGain/);
});

console.log("All export background music checks passed.");
