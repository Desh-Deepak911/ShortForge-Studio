/**
 * Sprint 6E — shared audio graph semantics.
 * Run: npm run test:export-audio-graph
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildExportAudioFilterGraph,
  prepareExportAudio,
  resolveClampedMusicFadeMs,
} from "@/features/export/audio";
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

function story(): FootieScript {
  const scene = {
    id: "s1",
    start: 0,
    end: 4,
    duration: 4,
    startMs: 0,
    endMs: 4000,
    durationMs: 4000,
    subtitle: "Graph test",
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
    title: "Audio Graph",
    narration: "Graph test",
    totalDuration: 4,
    exportSettings: {
      fileName: "audio-graph",
      format: "webm",
      quality: "standard",
      resolution: "720x1280",
    },
    scenes: [scene],
    timelineItems: [{ id: "ti-1", type: "scene", scene }],
    voiceoverUrl: "https://example.com/voice.mp3",
    voiceoverDurationMs: 3500,
  });
}

console.log("\nexport-audio-graph (Sprint 6E)\n");

test("shared graph forbids voice speed and uses project end", () => {
  const manifest = buildExportManifest({ story: story(), environment: CAPABLE_ENV });
  const withVoice = {
    ...manifest,
    audio: {
      ...manifest.audio,
      mode: "voice" as const,
      voiceover: {
        source: "https://example.com/v.mp3",
        durationMs: 3500,
        volume: 1,
        generatedPlaybackRate: 1 as const,
        sourceVoiceSpeed: 1,
      },
    },
  };
  const prepared = prepareExportAudio(withVoice, { outputFormat: "webm" });
  const graph = buildExportAudioFilterGraph(withVoice, prepared);
  assert.equal(graph.forbidsVoiceSpeedFilters, true);
  assert.equal(graph.projectEndMs, prepared.durationMs);
  assert.equal(graph.sampleRateHz, 48000);
  assert.ok(graph.description.some((line) => line.includes("project-end=")));
  assert.ok(graph.description.some((line) => /no atempo|baked/i.test(line)));
});

test("voice + music graph mentions ducking and fade anchors", () => {
  const manifest = buildExportManifest({ story: story(), environment: CAPABLE_ENV });
  const withBoth = {
    ...manifest,
    audio: {
      ...manifest.audio,
      mode: "voice-with-music" as const,
      voiceover: {
        source: "https://example.com/v.mp3",
        durationMs: 3500,
        volume: 1,
        generatedPlaybackRate: 1 as const,
        sourceVoiceSpeed: 1,
      },
      music: {
        source: "https://example.com/m.mp3",
        volume: 0.4,
        duckingEnabled: true,
        duckingStrength: 0.35,
        fadeInMs: 400,
        fadeOutMs: 600,
        looping: true as const,
      },
      sourceVideoAudioPolicy: "muted" as const,
    },
  };
  const prepared = prepareExportAudio(withBoth, { outputFormat: "webm" });
  const graph = buildExportAudioFilterGraph(withBoth, prepared);
  assert.ok(graph.description.some((l) => /ducking/i.test(l)));
  assert.ok(graph.description.some((l) => /fadeOut=.*anchored to project end/i.test(l)));
  assert.ok(graph.description.some((l) => /loop input/i.test(l)));
  assert.ok(graph.description.some((l) => /source-video-audio=muted/.test(l)));
});

test("fade clamp never exceeds project duration", () => {
  assert.equal(resolveClampedMusicFadeMs(800, 400), 400);
  assert.equal(resolveClampedMusicFadeMs(100, 400), 100);
  assert.equal(resolveClampedMusicFadeMs(-1, 400), 0);
});

test("FFmpeg music path uses aloop + atrim; no -shortest; no voice loop", () => {
  const music = read("src/features/export/utils/export-background-music.utils.ts");
  const ffmpeg = read("src/features/export/utils/ffmpeg.utils.ts");
  assert.match(music, /aloop/);
  assert.match(music, /atrim/);
  assert.doesNotMatch(ffmpeg, /-shortest/);
  assert.doesNotMatch(music, /aloop=.*voice/);
});

test("production finalization uses project duration -t authority", () => {
  const ffmpeg = read("src/features/export/utils/ffmpeg.utils.ts");
  assert.match(ffmpeg, /"-t"/);
  assert.doesNotMatch(ffmpeg, /-shortest/);
});

console.log(`\n${passed} tests passed.\n`);
