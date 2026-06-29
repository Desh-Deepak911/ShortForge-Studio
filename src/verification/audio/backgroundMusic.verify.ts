/**
 * Background music model verification (run: npm run test:background-music).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  applyStoryBackgroundMusic,
  BACKGROUND_MUSIC_LIBRARY_CATALOG,
  BACKGROUND_MUSIC_LIBRARY_EMPTY_MESSAGE,
  BACKGROUND_MUSIC_LIBRARY_TRACKS,
  DEFAULT_BACKGROUND_MUSIC_VOLUME,
  coerceLegacyStoryFields,
  formatBackgroundMusicLibraryLicenseLabel,
  getAvailableBackgroundMusicLibraryTracks,
  getStoryBackgroundMusic,
  normalizeStoryBackgroundMusic,
  percentToVolume,
  volumeToPercent,
} from "@/features/story/utils";
import { syncFootieScript } from "@/lib/utils/voiceover";
import type { FootieScene, FootieScript } from "@/features/story/types";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function legacyScene(id: string): FootieScene {
  return {
    id,
    start: 0,
    end: 3,
    duration: 3,
    subtitle: `Scene ${id}`,
  };
}

const legacyScript: FootieScript = {
  title: "Legacy Story",
  narration: "No background music yet.",
  totalDuration: 3,
  scenes: [legacyScene("1")],
};

console.log("backgroundMusic");

test("normalizeStoryBackgroundMusic applies product defaults", () => {
  assert.deepEqual(normalizeStoryBackgroundMusic(), {
    enabled: false,
    source: "none",
    volume: DEFAULT_BACKGROUND_MUSIC_VOLUME,
    duckingEnabled: true,
    fadeIn: true,
    fadeOut: true,
  });
});

test("coerceLegacyStoryFields initializes backgroundMusic defaults", () => {
  const coerced = coerceLegacyStoryFields(legacyScript);

  assert.deepEqual(coerced.backgroundMusic, {
    enabled: false,
    source: "none",
    volume: 0.18,
    duckingEnabled: true,
    fadeIn: true,
    fadeOut: true,
  });
});

test("syncFootieScript preserves normalized background music on legacy stories", () => {
  const synced = syncFootieScript(legacyScript);

  assert.deepEqual(getStoryBackgroundMusic(synced), {
    enabled: false,
    source: "none",
    volume: 0.18,
    duckingEnabled: true,
    fadeIn: true,
    fadeOut: true,
  });
});

test("normalizeStoryBackgroundMusic preserves upload track metadata", () => {
  assert.deepEqual(
    normalizeStoryBackgroundMusic({
      enabled: true,
      source: "upload",
      fileUrl: "blob:track",
      fileName: "ambient-loop.mp3",
      volume: 0.25,
      duckingEnabled: false,
      fadeIn: false,
      fadeOut: true,
      license: "Royalty-free",
      attributionRequired: true,
      attributionText: "Music by Example Artist",
    }),
    {
      enabled: true,
      source: "upload",
      fileUrl: "blob:track",
      fileName: "ambient-loop.mp3",
      volume: 0.25,
      duckingEnabled: false,
      fadeIn: false,
      fadeOut: true,
      license: "Royalty-free",
      attributionRequired: true,
      attributionText: "Music by Example Artist",
    },
  );
});

test("normalizeStoryBackgroundMusic preserves library track metadata", () => {
  assert.deepEqual(
    normalizeStoryBackgroundMusic({
      enabled: true,
      source: "library",
      trackId: "stadium-pulse",
      trackName: "Stadium Pulse",
      artist: "FootieBitz Sample Library",
      fileUrl: "/music/stadium-pulse.mp3",
      license: "CC0 1.0 Universal",
      volume: 0.18,
    }),
    {
      enabled: true,
      source: "library",
      trackId: "stadium-pulse",
      trackName: "Stadium Pulse",
      artist: "FootieBitz Sample Library",
      fileUrl: "/music/stadium-pulse.mp3",
      license: "CC0 1.0 Universal",
      volume: 0.18,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: true,
    },
  );
});

test("built-in library is empty when no public music assets are shipped", () => {
  assert.deepEqual(BACKGROUND_MUSIC_LIBRARY_CATALOG, []);
  assert.deepEqual(BACKGROUND_MUSIC_LIBRARY_TRACKS, []);
  assert.equal(
    BACKGROUND_MUSIC_LIBRARY_EMPTY_MESSAGE,
    "Upload your own licensed music to add a soundtrack.",
  );
});

test("getAvailableBackgroundMusicLibraryTracks only includes shipped files", () => {
  const catalog = [
    {
      id: "demo-track",
      name: "Demo Track",
      mood: "Calm",
      artist: "Sample Artist",
      fileUrl: "/music/demo-track.mp3",
      license: "CC BY 4.0",
      attributionRequired: true,
      attributionText: "Demo Track by Sample Artist (CC BY 4.0)",
    },
  ];

  assert.deepEqual(getAvailableBackgroundMusicLibraryTracks(catalog, []), []);
  assert.deepEqual(getAvailableBackgroundMusicLibraryTracks(catalog, ["/music/demo-track.mp3"]), catalog);
});

test("formatBackgroundMusicLibraryLicenseLabel uses metadata without implying copyright-free", () => {
  assert.equal(
    formatBackgroundMusicLibraryLicenseLabel({
      id: "demo",
      name: "Demo",
      mood: "Calm",
      artist: "Artist",
      fileUrl: "/music/demo.mp3",
      license: "CC BY 4.0",
      attributionRequired: true,
    }),
    "CC BY 4.0",
  );

  assert.equal(
    formatBackgroundMusicLibraryLicenseLabel({
      id: "demo",
      name: "Demo",
      mood: "Calm",
      artist: "Artist",
      fileUrl: "/music/demo.mp3",
      license: "",
      attributionRequired: false,
    }),
    "License not specified",
  );
});

test("disabled background music forces source none", () => {
  assert.deepEqual(
    normalizeStoryBackgroundMusic({
      enabled: false,
      source: "library",
      trackId: "unused",
    }),
    {
      enabled: false,
      source: "none",
      volume: 0.18,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: true,
    },
  );
});

test("normalizeStoryBackgroundMusic clamps invalid volume", () => {
  assert.equal(normalizeStoryBackgroundMusic({ volume: 2 }).volume, 1);
  assert.equal(normalizeStoryBackgroundMusic({ volume: -1 }).volume, 0);
  assert.equal(normalizeStoryBackgroundMusic({ volume: "bad" as unknown as number }).volume, 0.18);
});

test("volumeToPercent and percentToVolume round-trip for UI slider", () => {
  assert.equal(volumeToPercent(0.18), 18);
  assert.equal(percentToVolume(18), 0.18);
});

test("applyStoryBackgroundMusic updates music settings without touching voiceover", () => {
  const script: FootieScript = {
    ...legacyScript,
    voiceoverUrl: "blob:voiceover",
    voiceoverDurationMs: 3000,
  };

  const next = applyStoryBackgroundMusic(script, {
    enabled: true,
    source: "upload",
    fileUrl: "blob:music",
    fileName: "ambient.mp3",
    volume: 0.22,
  });

  assert.equal(next.voiceoverUrl, "blob:voiceover");
  assert.equal(next.voiceoverDurationMs, 3000);
  assert.equal(next.backgroundMusic?.fileName, "ambient.mp3");
  assert.equal(next.backgroundMusic?.volume, 0.22);
});

test("story model defines backgroundMusic once per story", () => {
  const typesPath = join(process.cwd(), "src/features/story/types/story.types.ts");
  const types = readFileSync(typesPath, "utf8");

  assert.match(types, /interface StoryBackgroundMusic/);
  assert.match(types, /backgroundMusic\?: StoryBackgroundMusic/);
});

console.log("All background music checks passed.");
