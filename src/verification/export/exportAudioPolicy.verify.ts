/**
 * Sprint 6E — audio end policy + voice-speed Model A.
 * Run: npm run test:export-audio-policy
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertExportDoesNotApplyVoiceSpeed,
  assertFilterGraphForbidsVoiceSpeed,
  prepareExportAudio,
  resolveExportAudioEndPolicy,
  validatePreparedExportAudio,
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

function baseStory(overrides: Partial<FootieScript> = {}): FootieScript {
  const scene = {
    id: "s1",
    start: 0,
    end: 5,
    duration: 5,
    startMs: 0,
    endMs: 5000,
    durationMs: 5000,
    subtitle: "Hello world",
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
    title: "Audio Policy",
    narration: "Hello world",
    totalDuration: 5,
    exportSettings: {
      fileName: "audio-policy",
      format: "webm",
      quality: "standard",
      resolution: "720x1280",
    },
    scenes: [scene],
    timelineItems: [{ id: "ti-1", type: "scene", scene }],
    voiceoverUrl: "https://example.com/voice.mp3",
    voiceoverDurationMs: 4500,
    voiceSettings: { speed: 1.1 },
    ...overrides,
  });
}

console.log("\nexport-audio-policy (Sprint 6E)\n");

test("silent mode prepares no stems", () => {
  const story = baseStory({ voiceoverUrl: undefined, voiceoverDurationMs: undefined });
  const manifest = buildExportManifest({
    story,
    environment: CAPABLE_ENV,
    audioMode: "silent",
  });
  // Force silent if builder chose voice due to leftover url
  const forced = {
    ...manifest,
    audio: { ...manifest.audio, mode: "silent" as const, voiceover: null, music: null },
  };
  const prepared = prepareExportAudio(forced, { outputFormat: "webm" });
  assert.equal(prepared.mode, "silent");
  assert.equal(prepared.voiceover, null);
  assert.equal(prepared.music, null);
  assert.equal(prepared.outputCodec, "none");
  assert.equal(prepared.sourceVideoAudioMuted, true);
});

test("voice shorter than project pads with silence", () => {
  const manifest = buildExportManifest({
    story: baseStory(),
    environment: CAPABLE_ENV,
    audioMode: "with-voice",
  });
  const withVoice = {
    ...manifest,
    audio: {
      ...manifest.audio,
      mode: "voice" as const,
      voiceover: {
        source: "https://example.com/voice.mp3",
        durationMs: 4500,
        volume: 1,
        generatedPlaybackRate: 1 as const,
        sourceVoiceSpeed: 1.1,
      },
    },
  };
  const policy = resolveExportAudioEndPolicy(withVoice, {
    voiceoverProbeMs: 4000,
    musicProbeMs: null,
  });
  assert.equal(policy.voiceover.action, "pad");
  assert.ok((policy.voiceover.padDurationMs ?? 0) > 0);
  assert.equal(policy.projectEndMs, withVoice.project.renderDurationMs);
});

test("voice near project end is accepted", () => {
  const manifest = buildExportManifest({
    story: baseStory(),
    environment: CAPABLE_ENV,
    audioMode: "with-voice",
  });
  const withVoice = {
    ...manifest,
    audio: {
      ...manifest.audio,
      mode: "voice" as const,
      voiceover: {
        source: "https://example.com/voice.mp3",
        durationMs: 4500,
        volume: 1,
        generatedPlaybackRate: 1 as const,
        sourceVoiceSpeed: 1,
      },
    },
  };
  const policy = resolveExportAudioEndPolicy(withVoice, {
    voiceoverProbeMs: withVoice.project.renderDurationMs - 50,
    musicProbeMs: null,
  });
  assert.equal(policy.voiceover.action, "none");
});

test("voice too long beyond tolerance blocks", () => {
  const manifest = buildExportManifest({
    story: baseStory(),
    environment: CAPABLE_ENV,
    audioMode: "with-voice",
  });
  const withVoice = {
    ...manifest,
    audio: {
      ...manifest.audio,
      mode: "voice" as const,
      voiceover: {
        source: "https://example.com/voice.mp3",
        durationMs: 4500,
        volume: 1,
        generatedPlaybackRate: 1 as const,
        sourceVoiceSpeed: 1,
      },
    },
  };
  const policy = resolveExportAudioEndPolicy(withVoice, {
    voiceoverProbeMs: withVoice.project.renderDurationMs + 500,
    musicProbeMs: null,
  });
  assert.equal(policy.voiceover.action, "block");
});

test("music looping uses loop-and-trim", () => {
  const story = baseStory({
    backgroundMusic: {
      enabled: true,
      source: "upload",
      fileUrl: "https://example.com/music.mp3",
      volume: 0.4,
      fadeIn: true,
      fadeOut: true,
      duckingEnabled: true,
    },
  } as Partial<FootieScript>);
  const manifest = buildExportManifest({
    story,
    environment: CAPABLE_ENV,
    audioMode: "with-voice",
  });
  if (manifest.audio.mode !== "voice-with-music") {
    // Force music onto manifest for policy test
    const withMusic = {
      ...manifest,
      audio: {
        ...manifest.audio,
        mode: "voice-with-music" as const,
        music: {
          source: "https://example.com/music.mp3",
          volume: 0.4,
          duckingEnabled: true,
          duckingStrength: 0.35,
          fadeInMs: 500,
          fadeOutMs: 500,
          looping: true as const,
        },
      },
    };
    const policy = resolveExportAudioEndPolicy(withMusic);
    assert.equal(policy.music.action, "loop-and-trim");
  } else {
    const policy = resolveExportAudioEndPolicy(manifest);
    assert.equal(policy.music.action, "loop-and-trim");
  }
});

test("voice speed metadata only — generatedPlaybackRate is 1", () => {
  const manifest = buildExportManifest({
    story: baseStory(),
    environment: CAPABLE_ENV,
    audioMode: "with-voice",
  });
  if (manifest.audio.voiceover) {
    assert.equal(manifest.audio.voiceover.generatedPlaybackRate, 1);
    assert.ok(manifest.audio.voiceover.sourceVoiceSpeed > 0);
  }
  const prepared = prepareExportAudio(
    {
      ...manifest,
      audio: {
        ...manifest.audio,
        mode: "voice",
        voiceover: manifest.audio.voiceover ?? {
          source: "https://example.com/v.mp3",
          durationMs: 4000,
          volume: 1,
          generatedPlaybackRate: 1,
          sourceVoiceSpeed: 1.25,
        },
      },
    },
    { outputFormat: "webm" },
  );
  assert.equal(prepared.voiceover?.generatedPlaybackRate, 1);
  const check = validatePreparedExportAudio(prepared);
  assert.equal(check.ok, true);
});

test("no atempo / asetrate in production mux / filter sources", () => {
  const ffmpeg = read("src/features/export/utils/ffmpeg.utils.ts");
  const music = read("src/features/export/utils/export-background-music.utils.ts");
  const browser = read("src/features/export/utils/export-browser-audio-mix.utils.ts");
  assert.doesNotMatch(ffmpeg, /atempo/);
  assert.doesNotMatch(music, /atempo/);
  assert.doesNotMatch(browser, /atempo/);
  assert.doesNotMatch(ffmpeg, /asetrate=/);
  assertExportDoesNotApplyVoiceSpeed(["-i", "a.mp3", "-c:a", "libopus", "out.webm"]);
  assert.throws(() => assertExportDoesNotApplyVoiceSpeed(["-filter:a", "atempo=1.2"]));
  assertFilterGraphForbidsVoiceSpeed("volume=1,atrim=0:10");
  assert.throws(() => assertFilterGraphForbidsVoiceSpeed("atempo=1.1"));
});

test("source video audio remains muted in prepared audio", () => {
  const manifest = buildExportManifest({
    story: baseStory(),
    environment: CAPABLE_ENV,
  });
  assert.equal(manifest.audio.sourceVideoAudioPolicy, "muted");
});

console.log(`\n${passed} tests passed.\n`);
