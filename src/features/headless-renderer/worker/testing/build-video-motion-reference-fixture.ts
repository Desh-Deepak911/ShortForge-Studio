/**
 * Short headless reference fixture with one trimmed MP4 scene for motion parity.
 */

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
import { syncFootieScript } from "@/lib/utils/voiceover";

import type { HeadlessRendererProfile } from "../../domain";
import { applyHeadlessFormatToManifest } from "./apply-output-profile";
import { synthesizeMotionMp4Fixture } from "./synthesize-motion-mp4-fixture";
import type { HeadlessReferenceFixture } from "./build-reference-fixture";

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

export function buildHeadlessVideoMotionReferenceFixture(input?: {
  readonly contentDurationMs?: number;
  readonly rendererProfile?: Partial<HeadlessRendererProfile>;
}): HeadlessReferenceFixture {
  const contentDurationMs = input?.contentDurationMs ?? 6000;
  const rendererProfile: HeadlessRendererProfile = {
    resolution: input?.rendererProfile?.resolution ?? "720p",
    format: input?.rendererProfile?.format ?? "webm",
    fps: 30,
    quality: input?.rendererProfile?.quality ?? "high",
  };
  const motion = synthesizeMotionMp4Fixture({ durationSec: 20 });
  const urls = {
    a: "https://fixture.local/headless/motion.mp4",
    b: "https://fixture.local/headless/motion.mp4",
    c: "https://fixture.local/headless/motion.mp4",
    voice: "https://fixture.local/headless/voice.wav",
    music: "https://fixture.local/headless/music.wav",
  };
  const videoMedia: SceneMedia = {
    type: "video",
    url: urls.a,
    durationMs: 20_000,
    trimStartMs: 10_000,
    trimEndMs: 18_000,
    muted: true,
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
  const scene: FootieScene = {
    id: "video-motion-scene",
    start: 0,
    end: contentDurationMs / 1000,
    duration: contentDurationMs / 1000,
    startMs: 0,
    endMs: contentDurationMs,
    durationMs: contentDurationMs,
    subtitle: "",
    captionMode: "generated",
    media: videoMedia,
    mediaTimeline: {
      version: 1,
      items: [{ id: "video-item-1", media: videoMedia, durationWeight: 1 }],
    },
  };
  const story = syncFootieScript({
    title: "Headless Video Motion Reference",
    narration: "",
    totalDuration: contentDurationMs / 1000,
    scenes: [scene],
  });
  const exportResolution =
    rendererProfile.resolution === "720p" ? "720x1280" : "1080x1920";
  const manifest = buildExportManifest({
    story,
    environment: CAPABLE_ENV,
    audioMode: "silent",
    includeBackgroundMusic: false,
    multiImageScenesEnabled: false,
    exportSettings: {
      resolution: exportResolution,
      format: rendererProfile.format,
      quality: rendererProfile.quality,
    },
  });
  if (!isExportManifestV3(manifest)) {
    throw new Error("Expected v3 video motion manifest.");
  }
  const appliedV3 = applyHeadlessFormatToManifest(manifest, rendererProfile);
  if (!appliedV3.ok) {
    throw new Error(appliedV3.message);
  }
  const manifestV3 = appliedV3.manifest;
  const v2Scenes = manifestV3.scenes.map((sceneRow) => {
    const rest = { ...sceneRow };
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
  const assetBytesByUrl = new Map<string, Uint8Array>([
    [urls.a, motion.bytes],
    [urls.b, motion.bytes],
    [urls.c, motion.bytes],
  ]);
  return {
    manifestV3,
    manifestV2: appliedV2.manifest,
    rendererProfile,
    assetBytesByUrl,
    voiceBytes: null,
    musicBytes: null,
    urls,
  };
}
