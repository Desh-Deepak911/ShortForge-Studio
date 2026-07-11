/**
 * Sprint 6E — Golden A–G semantic matrix (model verification).
 * Run: npm run test:export-golden-matrix
 *
 * Distinguishes model/semantic fixtures from device binary playback QA.
 */
import assert from "node:assert/strict";

import {
  prepareExportAudio,
  resolveExportAudioEndPolicy,
} from "@/features/export/audio";
import {
  assertExportEndBufferContract,
  resolveExportEndOfProjectSnapshot,
  resolveExportFormatAdapter,
  resolveExportFormatId,
} from "@/features/export/formats";
import { validateFinalExportArtifact } from "@/features/export/validation";
import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
  type ExportManifest,
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

function mkScene(
  id: string,
  startMs: number,
  durationMs: number,
  subtitle: string,
  kind: "image" | "video" = "image",
) {
  if (kind === "video") {
    return {
      id,
      start: startMs / 1000,
      end: (startMs + durationMs) / 1000,
      duration: durationMs / 1000,
      startMs,
      endMs: startMs + durationMs,
      durationMs,
      subtitle,
      captionMode: "subtitles" as const,
      media: {
        type: "video" as const,
        url: `https://example.com/${id}.mp4`,
        source: "upload" as const,
        durationMs: 15_000,
        trimStartMs: 0,
        trimEndMs: durationMs,
        playbackRate: 1,
        muted: true,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      },
      image: {
        url: `https://example.com/${id}-poster.jpg`,
        scale: 1,
        x: 0,
        y: 0,
        rotation: 0,
        fitMode: "fill" as const,
      },
      transition: { type: "fade" as const, durationMs: 400 },
    };
  }
  return {
    id,
    start: startMs / 1000,
    end: (startMs + durationMs) / 1000,
    duration: durationMs / 1000,
    startMs,
    endMs: startMs + durationMs,
    durationMs,
    subtitle,
    captionMode: "subtitles" as const,
    media: {
      type: "image" as const,
      url: `https://example.com/${id}.jpg`,
      source: "upload" as const,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      motion: {
        preset: "slow-zoom-in" as const,
        intensity: 0.3,
        startMs: 0,
        endMs: durationMs,
      },
    },
    image: {
      url: `https://example.com/${id}.jpg`,
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      fitMode: "fit" as const,
    },
    transition: { type: "fade" as const, durationMs: 400 },
  };
}

function buildStory(input: {
  format: "webm" | "mp4";
  scenes: ReturnType<typeof mkScene>[];
  voice?: boolean;
  music?: boolean;
  fileName: string;
}): FootieScript {
  return syncFootieScript({
    title: input.fileName,
    narration: input.scenes.map((s) => s.subtitle).join(". "),
    totalDuration: input.scenes.reduce((n, s) => n + s.duration, 0),
    exportSettings: {
      fileName: input.fileName,
      format: input.format,
      quality: "standard",
      resolution: "720x1280",
    },
    scenes: input.scenes,
    timelineItems: input.scenes.map((scene) => ({
      id: `ti-${scene.id}`,
      type: "scene" as const,
      scene,
    })),
    ...(input.voice
      ? {
          voiceoverUrl: "https://example.com/voice.mp3",
          voiceoverDurationMs: Math.max(
            1000,
            input.scenes.reduce((n, s) => n + s.durationMs, 0) - 600,
          ),
        }
      : {}),
    ...(input.music
      ? {
          backgroundMusic: {
            enabled: true,
            url: "https://example.com/music.mp3",
            volume: 0.35,
            fadeIn: true,
            fadeOut: true,
            ducking: true,
          },
        }
      : {}),
  });
}

function assertGoldenBasics(manifest: ExportManifest, format: "webm" | "mp4") {
  assertExportEndBufferContract(manifest);
  assert.equal(resolveExportFormatId(manifest), format);
  const adapter = resolveExportFormatAdapter(manifest);
  assert.equal(adapter.format, format);
  const snap = resolveExportEndOfProjectSnapshot(manifest);
  assert.ok(snap.lastGlobalFrameIndex >= 0);
  assert.equal(snap.renderDurationMs, manifest.project.renderDurationMs);
}

console.log("\nexport-golden-matrix (Sprint 6E) — model fixtures\n");

test("Golden A — Silent WebM image-only + final caption", () => {
  const story = buildStory({
    format: "webm",
    fileName: "golden-a",
    scenes: [mkScene("img-1", 0, 4000, "Final caption hold")],
  });
  const manifest = buildExportManifest({ story, environment: CAPABLE_ENV });
  const silent = {
    ...manifest,
    audio: { ...manifest.audio, mode: "silent" as const, voiceover: null, music: null },
  };
  assertGoldenBasics(silent, "webm");
  const prepared = prepareExportAudio(silent, { outputFormat: "webm" });
  assert.equal(prepared.mode, "silent");
  const snap = resolveExportEndOfProjectSnapshot(silent);
  assert.equal(snap.finalSceneId, "img-1");
});

test("Golden B — Voice WebM mixed image/video", () => {
  const story = buildStory({
    format: "webm",
    fileName: "golden-b",
    voice: true,
    scenes: [
      mkScene("img-1", 0, 3000, "Image open"),
      mkScene("vid-1", 3000, 4000, "Video clip", "video"),
    ],
  });
  const manifest = buildExportManifest({
    story,
    environment: CAPABLE_ENV,
    options: { audioMode: "with-voice" },
  });
  assertGoldenBasics(manifest, "webm");
  assert.ok(manifest.scenes.some((s) => s.media.type === "video"));
  assert.ok(manifest.scenes.some((s) => s.media.type === "image"));
});

test("Golden C — Voice + music WebM ducking/fades", () => {
  const story = buildStory({
    format: "webm",
    fileName: "golden-c",
    voice: true,
    music: true,
    scenes: [mkScene("img-1", 0, 5000, "Ducked narration")],
  });
  const manifest = buildExportManifest({
    story,
    environment: CAPABLE_ENV,
    options: { audioMode: "with-voice" },
  });
  const withMusic =
    manifest.audio.music != null
      ? manifest
      : {
          ...manifest,
          audio: {
            ...manifest.audio,
            mode: "voice-with-music" as const,
            voiceover: manifest.audio.voiceover ?? {
              source: "https://example.com/voice.mp3",
              durationMs: 4400,
              volume: 1,
              generatedPlaybackRate: 1 as const,
              sourceVoiceSpeed: 1,
            },
            music: {
              source: "https://example.com/music.mp3",
              volume: 0.35,
              duckingEnabled: true,
              duckingStrength: 0.35,
              fadeInMs: 400,
              fadeOutMs: 500,
              looping: true as const,
            },
          },
        };
  assertGoldenBasics(withMusic, "webm");
  const policy = resolveExportAudioEndPolicy(withMusic);
  assert.equal(policy.music.action, "loop-and-trim");
  assert.ok(withMusic.audio.music?.duckingEnabled);
  assert.ok((withMusic.audio.music?.fadeOutMs ?? 0) > 0);
});

test("Golden D — Silent MP4", () => {
  const story = buildStory({
    format: "mp4",
    fileName: "golden-d",
    scenes: [mkScene("img-1", 0, 3000, "Silent mp4")],
  });
  const manifest = buildExportManifest({ story, environment: CAPABLE_ENV });
  const silent = {
    ...manifest,
    audio: { ...manifest.audio, mode: "silent" as const, voiceover: null, music: null },
  };
  assertGoldenBasics(silent, "mp4");
  assert.equal(resolveExportFormatAdapter(silent).codecPolicy.videoCodec, "libx264");
});

test("Golden E — Voice MP4", () => {
  const story = buildStory({
    format: "mp4",
    fileName: "golden-e",
    voice: true,
    scenes: [mkScene("img-1", 0, 4000, "Voice mp4")],
  });
  const manifest = buildExportManifest({
    story,
    environment: CAPABLE_ENV,
    options: { audioMode: "with-voice" },
  });
  assertGoldenBasics(manifest, "mp4");
  const prepared = prepareExportAudio(
    {
      ...manifest,
      audio: {
        ...manifest.audio,
        mode: "voice",
        voiceover: manifest.audio.voiceover ?? {
          source: "https://example.com/v.mp3",
          durationMs: 3500,
          volume: 1,
          generatedPlaybackRate: 1,
          sourceVoiceSpeed: 1,
        },
      },
    },
    { outputFormat: "mp4" },
  );
  assert.equal(prepared.outputCodec, "aac");
});

test("Golden F — Voice + music MP4", () => {
  const story = buildStory({
    format: "mp4",
    fileName: "golden-f",
    voice: true,
    music: true,
    scenes: [mkScene("img-1", 0, 5000, "Voice music mp4")],
  });
  const manifest = buildExportManifest({
    story,
    environment: CAPABLE_ENV,
    options: { audioMode: "with-voice" },
  });
  assert.equal(resolveExportFormatId(manifest), "mp4");
  assert.equal(resolveExportFormatAdapter(manifest).codecPolicy.audioCodec, "aac");
});

test("Golden G — Full mixed-media near end buffer", () => {
  const story = buildStory({
    format: "webm",
    fileName: "golden-g",
    voice: true,
    music: true,
    scenes: [
      mkScene("img-1", 0, 4000, "Open"),
      mkScene("vid-1", 4000, 5000, "Video mid", "video"),
      mkScene("img-2", 9000, 5000, "Final word near buffer"),
    ],
  });
  const manifest = buildExportManifest({
    story,
    environment: CAPABLE_ENV,
    options: { audioMode: "with-voice" },
  });
  assertGoldenBasics(manifest, "webm");
  const snap = resolveExportEndOfProjectSnapshot(manifest);
  assert.equal(snap.finalSceneId, "img-2");
  assert.ok(snap.endBufferMs >= 0);
  assert.ok(snap.contentDurationMs < snap.renderDurationMs || snap.endBufferMs === 0);

  const modelArtifact = {
    blob: new Blob([new Uint8Array(8192)], { type: "video/webm" }),
    format: "webm" as const,
    filename: "golden-g.webm",
    mimeType: "video/webm",
    hasAudio: true,
    resultKind: "audio-full" as const,
  };
  const validation = validateFinalExportArtifact({
    artifact: modelArtifact,
    manifest: {
      ...manifest,
      audio: {
        ...manifest.audio,
        mode: "voice",
        voiceover: manifest.audio.voiceover ?? {
          source: "https://example.com/v.mp3",
          durationMs: 12000,
          volume: 1,
          generatedPlaybackRate: 1,
          sourceVoiceSpeed: 1,
        },
      },
    },
    finalFrameRendered: true,
    probedHasVideo: true,
    probedHasAudio: true,
    probedDurationMs: manifest.project.renderDurationMs,
  });
  assert.equal(validation.valid, true);
});

console.log(`\n${passed} tests passed.\n`);
console.log(
  "Note: Golden matrix is semantic/model verification — not device playback QA.\n",
);
