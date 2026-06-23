/**
 * AudioEngine foundation verification (run: npm run test:audio-engine).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  classifyAudioSrcType,
  getAudioEngine,
  getAudioEngineDebugState,
  getCanonicalVoiceover,
  resetAudioEngineForTests,
  resolveAudioEngineSnapshot,
  resolveExportAudioSource,
} from "@/features/audio";
import { syncFootieScript } from "@/lib/voiceover";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const root = process.cwd();

function buildScript() {
  return syncFootieScript({
    title: "Audio Engine QA",
    narration: "Test narration for audio engine.",
    totalDuration: 10,
    voiceoverUrl: "blob:voiceover-test",
    voiceoverDurationMs: 10_000,
    voiceSettings: { voice: "alloy", speed: 1.25 },
    backgroundMusic: {
      enabled: true,
      source: "upload",
      fileUrl: "blob:music-test",
      volume: 0.2,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: true,
    },
    scenes: [
      {
        id: "1",
        start: 0,
        end: 10,
        duration: 10,
        startMs: 0,
        endMs: 10_000,
        durationMs: 10_000,
        subtitle: "Scene",
      },
    ],
  });
}

console.log("audio-engine");

test("resolveAudioEngineSnapshot mirrors FootieScript voice and music fields", () => {
  const script = buildScript();
  const snapshot = resolveAudioEngineSnapshot(script);

  assert.ok(snapshot);
  assert.equal(snapshot!.voiceover?.url, "blob:voiceover-test");
  assert.equal(snapshot!.voiceover?.durationMs, 10_000);
  assert.equal(snapshot!.voiceover?.voice, "alloy");
  assert.equal(snapshot!.voiceover?.speed, 1.25);
  assert.equal(snapshot!.backgroundMusic?.url, "blob:music-test");
  assert.equal(snapshot!.voiceSettings.speed, 1.25);
});

test("getCanonicalVoiceover prefers voiceoverUrl and resolves legacy fields", () => {
  const script = buildScript();

  assert.deepEqual(getCanonicalVoiceover(script), {
    url: "blob:voiceover-test",
    durationMs: 10_000,
  });

  assert.deepEqual(
    getCanonicalVoiceover({
      ...script,
      voiceoverUrl: undefined,
      voiceoverDurationMs: undefined,
      voiceover: { url: "blob:legacy-voiceover", durationMs: 8_000 },
    }),
    { url: "blob:legacy-voiceover", durationMs: 8_000 },
  );

  assert.deepEqual(
    getCanonicalVoiceover({
      ...script,
      voiceoverUrl: undefined,
      voiceoverDurationMs: undefined,
      audioUrl: "blob:audio-first",
    }),
    { url: "blob:audio-first" },
  );

  assert.deepEqual(
    getCanonicalVoiceover({
      ...script,
      voiceoverUrl: undefined,
      voiceoverDurationMs: undefined,
      voiceoverAudio: "blob:voiceover-audio",
    }),
    { url: "blob:voiceover-audio" },
  );
});

test("voice speed changes update snapshot cache key without changing url until apply", () => {
  const script = buildScript();
  const baseline = resolveAudioEngineSnapshot(script);
  const fasterSettings = resolveAudioEngineSnapshot({
    ...script,
    voiceSettings: { voice: "alloy", speed: 1.4 },
  });

  assert.equal(baseline?.voiceover?.url, fasterSettings?.voiceover?.url);
  assert.notEqual(baseline?.voiceover?.cacheKey, fasterSettings?.voiceover?.cacheKey);
});

test("preview and export integrations route through AudioEngine", () => {
  const preview = readFileSync(
    join(root, "src/features/preview/hooks/usePreviewPlayback.ts"),
    "utf8",
  );
  const exportRender = readFileSync(
    join(root, "src/features/export/services/video-render.service.ts"),
    "utf8",
  );
  const ffmpegUtils = readFileSync(
    join(root, "src/features/export/utils/ffmpeg.utils.ts"),
    "utf8",
  );
  const voiceApply = readFileSync(join(root, "src/hooks/useStoryVoiceoverApply.ts"), "utf8");
  const downloads = readFileSync(
    join(root, "src/features/export/utils/download.utils.ts"),
    "utf8",
  );

  assert.match(preview, /getAudioEngine\(\)/);
  assert.match(preview, /buildAudioMixFromStory/);
  assert.match(preview, /getNarrationAudioElementBySrc/);
  assert.match(preview, /getBackgroundMusicAudioElementBySrc/);
  assert.match(exportRender, /buildAudioMixFromStory/);
  assert.match(exportRender, /voiceoverInput/);
  assert.match(exportRender, /backgroundMusicInput/);
  assert.match(ffmpegUtils, /normalizeExportAudioInput/);
  assert.match(voiceApply, /applyVoiceoverRegeneration/);
  assert.match(voiceApply, /getCanonicalVoiceover/);
  assert.match(downloads, /getAudioEngine\(\)/);
});

test("AudioEngine reuses blob cache entries by URL", async () => {
  resetAudioEngineForTests();
  const engine = getAudioEngine();
  let fetchCount = 0;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  }) as typeof fetch;

  try {
    const first = await engine.fetchVoiceoverBlobByUrl("blob:cache-test");
    const second = await engine.fetchVoiceoverBlobByUrl("blob:cache-test");
    assert.equal(fetchCount, 1);
    assert.equal(first.size, second.size);
  } finally {
    globalThis.fetch = originalFetch;
    resetAudioEngineForTests();
  }
});

test("getAudioEngineDebugState summarizes mix without logging audio payloads", () => {
  const script = buildScript();
  const state = getAudioEngineDebugState(script);

  assert.ok(state);
  assert.equal(state!.voiceoverExists, true);
  assert.equal(state!.voiceoverSrcType, "blob");
  assert.equal(state!.voiceoverDurationMs, 10_000);
  assert.equal(state!.backgroundMusicEnabled, true);
  assert.equal(state!.backgroundMusicExists, true);
  assert.equal(state!.masterDurationMs, 10_000);
  assert.equal(state!.exportAudioSource, "voiceover+background");
  assert.equal(classifyAudioSrcType("data:audio/mpeg;base64,abc"), "data-url");
  assert.equal(
    resolveExportAudioSource({
      voiceover: { src: "blob:v", enabled: true } as never,
      masterDurationMs: 1000,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: true,
    }),
    "voiceover",
  );
});

console.log("\nAll audio engine checks passed.");
