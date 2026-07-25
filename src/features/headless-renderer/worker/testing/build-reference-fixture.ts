/**
 * Deterministic 11D Phase 2 reference fixture — images + optional voice/music.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSequentialMediaItemIdGenerator } from "@/features/scene-media-timeline";
import { setSceneMediaTransitionBoundary } from "@/features/scene-media-transitions";
import {
  buildExportManifest,
  buildExportManifestFingerprint,
  EXPORT_MANIFEST_V2_VERSION,
  EXPORT_RENDERER_CONTRACT_V2,
  isExportManifestV3,
  type ExportEnvironmentSnapshot,
  type ExportManifestV2,
  type ExportManifestV3,
} from "@/features/export/domain";
import type { FootieScene, SceneMedia } from "@/features/story/types";
import { applyStoryBackgroundMusic } from "@/features/story/utils/background-music.utils";
import { syncFootieScript } from "@/lib/utils/voiceover";

import type { HeadlessRendererProfile } from "../../domain";
import { resolveNativeFfmpegBinaries } from "../ffmpeg/resolve-ffmpeg-binaries";
import { applyHeadlessFormatToManifest } from "./apply-output-profile";

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
  mp4EncoderAvailable: true,
};

/**
 * Visually detailed fixture frames (not solid-color proxies).
 * Patterns differ so Chromium capture/encode evidence reflects real complexity.
 */
function complexPng(
  pattern: "testsrc2" | "rgbtestsrc" | "smptebars",
  width = 720,
  height = 1280,
): Uint8Array {
  const ffmpeg = resolveNativeFfmpegBinaries();
  if (!ffmpeg.ok) {
    throw new Error(ffmpeg.message);
  }
  const dir = mkdtempSync(join(tmpdir(), "hf-png-"));
  const out = join(dir, "frame.png");
  const lavfi =
    pattern === "testsrc2"
      ? `testsrc2=s=${width}x${height}:d=0.04:r=30`
      : pattern === "rgbtestsrc"
        ? `rgbtestsrc=s=${width}x${height}:d=0.04:r=30`
        : `smptehdbars=s=${width}x${height}:d=0.04:r=30`;
  const result = spawnSync(
    ffmpeg.ffmpegExecutable,
    ["-y", "-f", "lavfi", "-i", lavfi, "-frames:v", "1", out],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error("Failed to synthesize complex PNG fixture.");
  }
  const bytes = new Uint8Array(readFileSync(out));
  rmSync(dir, { recursive: true, force: true });
  return bytes;
}

function synthWav(frequency: number, durationMs: number): Uint8Array {
  const ffmpeg = resolveNativeFfmpegBinaries();
  if (!ffmpeg.ok) throw new Error(ffmpeg.message);
  const dir = mkdtempSync(join(tmpdir(), "hf-wav-"));
  const out = join(dir, "tone.wav");
  const result = spawnSync(
    ffmpeg.ffmpegExecutable,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${frequency}:duration=${(durationMs / 1000).toFixed(3)}`,
      "-ac",
      "2",
      "-ar",
      "48000",
      out,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error("Failed to synthesize wav fixture.");
  }
  const bytes = new Uint8Array(readFileSync(out));
  rmSync(dir, { recursive: true, force: true });
  return bytes;
}

function imageMedia(url: string): SceneMedia {
  return {
    type: "image",
    url,
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 8, scale: 1.08, rotation: 0 },
    motion: { version: 1 },
  };
}

export type HeadlessFixtureAudioMode =
  | "silent"
  | "with-voice"
  | "with-voice-and-music";

export interface HeadlessReferenceFixture {
  readonly manifestV3: ExportManifestV3;
  readonly manifestV2: ExportManifestV2;
  readonly rendererProfile: HeadlessRendererProfile;
  readonly assetBytesByUrl: ReadonlyMap<string, Uint8Array>;
  readonly voiceBytes: Uint8Array | null;
  readonly musicBytes: Uint8Array | null;
  readonly urls: {
    readonly a: string;
    readonly b: string;
    readonly c: string;
    readonly voice: string;
    readonly music: string;
  };
}

export function buildHeadlessReferenceFixture(input?: {
  audioMode?: HeadlessFixtureAudioMode;
  /** Keep short for local evidence (default 2000ms). */
  durationMs?: number;
  /** Music source length — shorter than render exercises loop (default 400ms). */
  musicDurationMs?: number;
  /** When true, enable default mixer fades (2s). Default false for short fixtures. */
  musicFades?: boolean;
  /** Canonical headless output profile (default 720p WebM). */
  rendererProfile?: Partial<HeadlessRendererProfile>;
}): HeadlessReferenceFixture {
  const durationMs = input?.durationMs ?? 2000;
  const audioMode = input?.audioMode ?? "silent";
  const withVoice =
    audioMode === "with-voice" || audioMode === "with-voice-and-music";
  const withMusic = audioMode === "with-voice-and-music";
  const musicDurationMs = input?.musicDurationMs ?? 400;
  const musicFades = input?.musicFades === true;
  const rendererProfile: HeadlessRendererProfile = {
    resolution: input?.rendererProfile?.resolution ?? "720p",
    format: input?.rendererProfile?.format ?? "webm",
    fps: 30,
    quality: input?.rendererProfile?.quality ?? "high",
  };

  const urls = {
    a: "https://fixture.local/headless/a.png",
    b: "https://fixture.local/headless/b.png",
    c: "https://fixture.local/headless/c.png",
    voice: "https://fixture.local/headless/voice.wav",
    music: "https://fixture.local/headless/music.wav",
  };

  // PNGs match profile pixels so Chromium native size is proven (no upscale).
  const profilePixels =
    rendererProfile.resolution === "4k"
      ? { width: 2160, height: 3840 }
      : rendererProfile.resolution === "1080p"
        ? { width: 1080, height: 1920 }
        : { width: 720, height: 1280 };
  const bytesA = complexPng(
    "testsrc2",
    profilePixels.width,
    profilePixels.height,
  );
  const bytesB = complexPng(
    "rgbtestsrc",
    profilePixels.width,
    profilePixels.height,
  );
  const bytesC = complexPng(
    "smptebars",
    profilePixels.width,
    profilePixels.height,
  );

  const generateId = createSequentialMediaItemIdGenerator("h11d");
  const itemA = generateId();
  const itemB = generateId();
  const itemC = generateId();

  const scene1Duration = Math.round(durationMs * 0.7);
  const scene2Duration = durationMs - scene1Duration;

  let scene1: FootieScene = {
    id: "scene-1",
    start: 0,
    end: scene1Duration / 1000,
    duration: scene1Duration / 1000,
    startMs: 0,
    endMs: scene1Duration,
    durationMs: scene1Duration,
    subtitle: "Headless frame one",
    captionMode: "generated",
    media: imageMedia(urls.a),
    mediaTimeline: {
      version: 1,
      items: [
        { id: itemA, media: imageMedia(urls.a), durationWeight: 1 },
        { id: itemB, media: imageMedia(urls.b), durationWeight: 1 },
      ],
    },
  };

  const bounded = setSceneMediaTransitionBoundary(
    scene1,
    itemA,
    itemB,
    "fade",
    500,
  );
  scene1 = bounded.scene;

  const scene2: FootieScene = {
    id: "scene-2",
    start: scene1Duration / 1000,
    end: durationMs / 1000,
    duration: scene2Duration / 1000,
    startMs: scene1Duration,
    endMs: durationMs,
    durationMs: scene2Duration,
    subtitle: "Headless frame two",
    captionMode: "generated",
    media: imageMedia(urls.c),
    mediaTimeline: {
      version: 1,
      items: [{ id: itemC, media: imageMedia(urls.c), durationWeight: 1 }],
    },
  };

  let story = syncFootieScript({
    title: "Headless 11D Reference",
    narration: "Deterministic headless reference narration.",
    totalDuration: durationMs / 1000,
    voiceoverUrl: withVoice ? urls.voice : undefined,
    voiceoverDurationMs: withVoice ? durationMs : undefined,
    scenes: [scene1, scene2],
  });

  if (withMusic) {
    story = applyStoryBackgroundMusic(story, {
      enabled: true,
      source: "upload",
      fileUrl: urls.music,
      fileName: "music.wav",
      fileMimeType: "audio/wav",
      volume: 0.2,
      duckingEnabled: true,
      fadeIn: musicFades,
      fadeOut: musicFades,
    });
  }

  // Frozen ExportManifest stays 720p/1080p — 4K elevates only via headless profile.
  const exportResolution =
    rendererProfile.resolution === "720p" ? "720x1280" : "1080x1920";
  const manifest = buildExportManifest({
    story,
    environment: CAPABLE_ENV,
    audioMode: withVoice ? "with-voice" : "silent",
    includeBackgroundMusic: withMusic,
    multiImageScenesEnabled: true,
    exportSettings: {
      resolution: exportResolution,
      format: rendererProfile.format,
      quality: rendererProfile.quality,
    },
  });
  if (!isExportManifestV3(manifest)) {
    throw new Error("Expected v3 reference manifest.");
  }
  if (withMusic && manifest.audio.mode !== "voice-with-music") {
    throw new Error("Expected voice-with-music manifest mode.");
  }
  if (withVoice && !withMusic && manifest.audio.mode !== "voice") {
    throw new Error("Expected voice manifest mode.");
  }

  const appliedV3 = applyHeadlessFormatToManifest(manifest, rendererProfile);
  if (!appliedV3.ok) {
    throw new Error(appliedV3.message);
  }
  const manifestV3 = appliedV3.manifest;
  if (rendererProfile.resolution === "4k") {
    if (
      manifestV3.output.resolution !== "1080p" ||
      manifestV3.output.width !== 1080 ||
      manifestV3.output.height !== 1920
    ) {
      throw new Error("4K fixture must keep frozen 1080p ExportManifest.");
    }
  }

  const v2Scenes = manifestV3.scenes.map((scene) => {
    const rest = { ...scene };
    delete (rest as { mediaTransitions?: unknown }).mediaTransitions;
    return rest;
  });
  const v2Draft = {
    ...manifestV3,
    version: EXPORT_MANIFEST_V2_VERSION,
    rendererContractVersion: EXPORT_RENDERER_CONTRACT_V2,
    scenes: v2Scenes,
  } as unknown as Omit<ExportManifestV2, "fingerprint">;
  const appliedV2 = applyHeadlessFormatToManifest(
    {
      ...v2Draft,
      fingerprint: buildExportManifestFingerprint(v2Draft),
    } as ExportManifestV2,
    rendererProfile,
  );
  if (!appliedV2.ok) {
    throw new Error(appliedV2.message);
  }
  const manifestV2 = appliedV2.manifest;

  let voiceBytes: Uint8Array | null = null;
  let musicBytes: Uint8Array | null = null;
  if (withVoice) {
    voiceBytes = synthWav(440, durationMs);
  }
  if (withMusic) {
    musicBytes = synthWav(220, musicDurationMs);
  }

  const assetBytesByUrl = new Map<string, Uint8Array>([
    [urls.a, bytesA],
    [urls.b, bytesB],
    [urls.c, bytesC],
  ]);
  if (voiceBytes) assetBytesByUrl.set(urls.voice, voiceBytes);
  if (musicBytes) assetBytesByUrl.set(urls.music, musicBytes);

  return {
    manifestV3,
    manifestV2,
    rendererProfile,
    assetBytesByUrl,
    voiceBytes,
    musicBytes,
    urls,
  };
}
