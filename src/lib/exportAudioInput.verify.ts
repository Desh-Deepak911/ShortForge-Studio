/**
 * Export audio input normalization verification (run: npm run test:export-audio-input).
 */
import assert from "node:assert/strict";

import type { AudioTrack } from "@/features/audio/types/audio.types";
import {
  buildFfmpegMusicInputFilename,
  buildFfmpegVoiceInputFilename,
  normalizeExportAudioInput,
  resolveExportAudioExtensionFromMime,
} from "@/features/export/utils/export-audio-input.utils";

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("exportAudioInput");

  await test("resolveExportAudioExtensionFromMime maps common audio MIME types", () => {
    assert.equal(resolveExportAudioExtensionFromMime("audio/mpeg"), ".mp3");
    assert.equal(resolveExportAudioExtensionFromMime("audio/wav"), ".wav");
    assert.equal(resolveExportAudioExtensionFromMime("audio/mp4"), ".m4a");
    assert.equal(resolveExportAudioExtensionFromMime("audio/ogg"), ".ogg");
    assert.equal(resolveExportAudioExtensionFromMime("audio/webm"), ".webm");
  });

  await test("normalizeExportAudioInput keeps Blob bytes and MIME", async () => {
    const source = new Blob([Uint8Array.from([1, 2, 3])], { type: "audio/wav" });
    const normalized = await normalizeExportAudioInput(source);

    assert.equal(normalized.mimeType, "audio/wav");
    assert.equal(normalized.extension, ".wav");
    assert.equal(normalized.fileName, "audio.wav");
    assert.equal(normalized.blob.type, "audio/wav");
    assert.equal(normalized.blob.size, 3);
  });

  await test("normalizeExportAudioInput converts raw base64 to Blob", async () => {
    const bytes = Uint8Array.from(Array.from({ length: 32 }, (_, index) => index));
    const base64 = Buffer.from(bytes).toString("base64");
    const normalized = await normalizeExportAudioInput(base64);

    assert.equal(normalized.mimeType, "audio/mpeg");
    assert.equal(normalized.extension, ".mp3");
    assert.equal(normalized.fileName, "audio.mp3");
    assert.equal(normalized.blob.size, bytes.length);
  });

  await test("normalizeExportAudioInput parses data URLs", async () => {
    const bytes = Uint8Array.from([10, 20, 30]);
    const base64 = Buffer.from(bytes).toString("base64");
    const dataUrl = `data:audio/ogg;base64,${base64}`;
    const normalized = await normalizeExportAudioInput(dataUrl);

    assert.equal(normalized.mimeType, "audio/ogg");
    assert.equal(normalized.extension, ".ogg");
    assert.equal(normalized.fileName, "audio.ogg");
  });

  await test("normalizeExportAudioInput resolves File name and extension", async () => {
    const file = new File([Uint8Array.from([9, 8, 7])], "bed-track.m4a", {
      type: "audio/mp4",
    });
    const normalized = await normalizeExportAudioInput(file);

    assert.equal(normalized.fileName, "bed-track.m4a");
    assert.equal(normalized.extension, ".m4a");
    assert.equal(normalized.mimeType, "audio/mp4");
  });

  await test("normalizeExportAudioInput resolves AudioTrack src to Blob", async () => {
    const bytes = Uint8Array.from(Array.from({ length: 24 }, (_, index) => index + 1));
    const base64 = Buffer.from(bytes).toString("base64");
    const track: AudioTrack = {
      id: "voiceover",
      type: "voiceover",
      src: base64,
      volume: 1,
      playbackRate: 1,
      enabled: true,
      startMs: 0,
    };

    const normalized = await normalizeExportAudioInput(track);

    assert.equal(normalized.fileName, "audio.mp3");
    assert.match(normalized.blob.type, /audio/);
    assert.equal(normalized.blob.size, bytes.length);
  });

  await test("normalizeExportAudioInput uses music prefix for background tracks", async () => {
    const bytes = Uint8Array.from(Array.from({ length: 24 }, (_, index) => index + 10));
    const base64 = Buffer.from(bytes).toString("base64");
    const track: AudioTrack = {
      id: "background",
      type: "background",
      src: base64,
      fileName: "ambient.wav",
      volume: 0.2,
      playbackRate: 1,
      enabled: true,
      startMs: 0,
    };

    const normalized = await normalizeExportAudioInput(track);

    assert.equal(normalized.fileName, "ambient.wav");
    assert.equal(normalized.extension, ".wav");
    assert.equal(normalized.mimeType, "audio/wav");
  });

  await test("normalizeExportAudioInput prefers fileName extension over suspicious blob MIME", async () => {
    const source = new Blob([Uint8Array.from([1, 2, 3, 4])], { type: "audio/mpeg" });
    const normalized = await normalizeExportAudioInput({
      blob: source,
      fileName: "ambient.wav",
      fallbackBaseName: "music",
    });

    assert.equal(normalized.mimeType, "audio/wav");
    assert.equal(normalized.extension, ".wav");
    assert.equal(normalized.fileName, "ambient.wav");
    assert.equal(normalized.blob.type, "audio/wav");
  });

  await test("normalizeExportAudioInput uses persisted music mime metadata on AudioTrack", async () => {
    const bytes = Uint8Array.from(Array.from({ length: 24 }, (_, index) => index + 10));
    const base64 = Buffer.from(bytes).toString("base64");
    const track: AudioTrack = {
      id: "background",
      type: "background",
      src: base64,
      fileName: "ambient.wav",
      volume: 0.2,
      playbackRate: 1,
      enabled: true,
      startMs: 0,
      metadata: { mimeType: "audio/wav" },
    };

    const normalized = await normalizeExportAudioInput(track);

    assert.equal(normalized.mimeType, "audio/wav");
    assert.equal(normalized.extension, ".wav");
    assert.equal(normalized.fileName, "ambient.wav");
  });

  await test("buildFfmpegVoiceInputFilename and buildFfmpegMusicInputFilename use detected extensions", () => {
    assert.equal(buildFfmpegVoiceInputFilename(".mp3"), "voice.mp3");
    assert.equal(buildFfmpegVoiceInputFilename(".wav"), "voice.wav");
    assert.equal(buildFfmpegMusicInputFilename(".webm"), "music.webm");
  });

  console.log("All export audio input checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
