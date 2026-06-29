/**
 * Preview background music mixing verification (run: npm run test:preview-background-music).
 */
import assert from "node:assert/strict";

import {
  computePreviewBackgroundMusicFadeMultiplier,
  computePreviewBackgroundMusicVolume,
  PREVIEW_BACKGROUND_MUSIC_FADE_IN_SEC,
  PREVIEW_BACKGROUND_MUSIC_FADE_OUT_SEC,
  PREVIEW_MUSIC_DUCKING_MULTIPLIER,
  resolvePreviewBackgroundMusicPlaybackVolume,
  resolvePreviewBackgroundMusicUrl,
} from "@/features/preview/utils";
import type { FootieScript } from "@/features/story/types";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const scriptWithMusic: FootieScript = {
  title: "Music Preview",
  narration: "Test narration.",
  totalDuration: 10,
  scenes: [
    {
      id: "1",
      start: 0,
      end: 10,
      duration: 10,
      subtitle: "Scene",
    },
  ],
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

console.log("previewBackgroundMusic");

test("resolvePreviewBackgroundMusicUrl returns fileUrl when music is enabled", () => {
  assert.equal(resolvePreviewBackgroundMusicUrl(scriptWithMusic), "blob:music-track");
  assert.equal(resolvePreviewBackgroundMusicUrl({ ...scriptWithMusic, backgroundMusic: undefined }), null);
});

test("computePreviewBackgroundMusicVolume ducks under voiceover when enabled", () => {
  assert.equal(
    computePreviewBackgroundMusicVolume({
      baseVolume: 0.2,
      duckingEnabled: true,
      voiceoverIsPlaying: true,
      fadeMultiplier: 1,
    }),
    0.2 * PREVIEW_MUSIC_DUCKING_MULTIPLIER,
  );

  assert.equal(
    computePreviewBackgroundMusicVolume({
      baseVolume: 0.2,
      duckingEnabled: true,
      voiceoverIsPlaying: false,
      fadeMultiplier: 1,
    }),
    0.2,
  );
});

test("computePreviewBackgroundMusicFadeMultiplier applies fade in and fade out windows", () => {
  assert.equal(
    computePreviewBackgroundMusicFadeMultiplier(0, 10, true, false),
    0,
  );
  assert.equal(
    computePreviewBackgroundMusicFadeMultiplier(PREVIEW_BACKGROUND_MUSIC_FADE_IN_SEC, 10, true, false),
    1,
  );
  assert.equal(
    computePreviewBackgroundMusicFadeMultiplier(10 - PREVIEW_BACKGROUND_MUSIC_FADE_OUT_SEC, 10, false, true),
    1,
  );
  assert.equal(
    computePreviewBackgroundMusicFadeMultiplier(10, 10, false, true),
    0,
  );
});

test("resolvePreviewBackgroundMusicPlaybackVolume combines base volume ducking and fades", () => {
  const atStart = resolvePreviewBackgroundMusicPlaybackVolume({
    script: scriptWithMusic,
    elapsedSec: 0,
    totalDurationSec: 10,
    voiceoverIsPlaying: true,
  });

  assert.equal(atStart, 0);

  const midPlayback = resolvePreviewBackgroundMusicPlaybackVolume({
    script: scriptWithMusic,
    elapsedSec: 5,
    totalDurationSec: 10,
    voiceoverIsPlaying: true,
  });

  assert.equal(midPlayback, 0.2 * PREVIEW_MUSIC_DUCKING_MULTIPLIER);
});

console.log("All preview background music checks passed.");
