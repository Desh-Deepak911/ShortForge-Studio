/**
 * Export background music mixing verification (run: npm run test:export-background-music).
 */
import assert from "node:assert/strict";

import {
  buildExportBackgroundMusicFilterChain,
  resolveExportBackgroundMusicBedVolume,
  resolveExportBackgroundMusicMixSettings,
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
});

test("buildExportBackgroundMusicFilterChain loops and trims to export duration", () => {
  const settings = resolveExportBackgroundMusicMixSettings(scriptWithMusic, true, 12_000)!;
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

console.log("All export background music checks passed.");
