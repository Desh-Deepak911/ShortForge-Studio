/**
 * Short headless reference fixture with one trimmed MP4 scene for motion parity.
 */

import {
  buildExportManifest,
  buildExportManifestFingerprint,
  EXPORT_MANIFEST_V2_VERSION,
  EXPORT_RENDERER_CONTRACT_V2,
  isExportManifestV4,
  isExportManifestV5,
  type ExportEnvironmentSnapshot,
  type ExportManifestV2,
  type ExportManifestV4,
  type ExportManifestV5,
} from "@/features/export/domain";
import type { FootieScene, SceneMedia } from "@/features/story/types";
import { setSceneMediaTransitionBoundary } from "@/features/scene-media-transitions";
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
  readonly sourceWidth?: number;
  readonly sourceHeight?: number;
  readonly fitMode?: "fit" | "fill";
  readonly zoom?: number;
  readonly positionX?: number;
  readonly positionY?: number;
  readonly sourcePattern?: "testsrc" | "smptehdbars";
  readonly secondSourcePattern?: "testsrc" | "smptehdbars";
  readonly sourceDurationSec?: number;
  readonly trimStartMs?: number;
  /** Fit-with-background treatment — escalates frozen manifest to v5. */
  readonly backgroundTreatment?: "blurred_fill";
  /** Optional prebuilt source MP4 bytes (realistic-motion corpus). */
  readonly sourceBytes?: Uint8Array;
  /** Empty title avoids opening-title contamination in encode audits. */
  readonly storyTitle?: string;
  /** Optional two-item moving-video transition certification fixture. */
  readonly intraSceneTransition?: {
    readonly effect: "fade" | "slide-left" | "slide-right" | "zoom-in" | "zoom-out" | "blur";
    readonly durationMs: 300 | 500 | 1000;
  };
}): HeadlessReferenceFixture {
  const contentDurationMs = input?.contentDurationMs ?? 6000;
  const rendererProfile: HeadlessRendererProfile = {
    resolution: input?.rendererProfile?.resolution ?? "720p",
    format: input?.rendererProfile?.format ?? "webm",
    fps: 30,
    quality: input?.rendererProfile?.quality ?? "high",
  };
  const sourceWidth = input?.sourceWidth ?? 320;
  const sourceHeight = input?.sourceHeight ?? 240;
  const sourceDurationSec = input?.sourceDurationSec ?? 20;
  const sourceDurationMs = Math.max(1, Math.round(sourceDurationSec * 1000));
  const trimStartMs = Math.min(
    Math.max(0, input?.trimStartMs ?? 10_000),
    sourceDurationMs - 1,
  );
  const trimEndMs = Math.min(
    sourceDurationMs,
    trimStartMs + Math.max(contentDurationMs, 1_000),
  );
  const motion = input?.sourceBytes
    ? {
        bytes: input.sourceBytes,
        durationSec: sourceDurationSec,
        width: sourceWidth,
        height: sourceHeight,
        fps: 30,
      }
    : synthesizeMotionMp4Fixture({
        durationSec: sourceDurationSec,
        width: sourceWidth,
        height: sourceHeight,
        pattern: input?.sourcePattern,
      });
  const secondMotion = input?.intraSceneTransition && input.secondSourcePattern
    ? synthesizeMotionMp4Fixture({
        durationSec: sourceDurationSec,
        width: sourceWidth,
        height: sourceHeight,
        pattern: input.secondSourcePattern,
      })
    : motion;
  const urls = {
    a: "https://fixture.local/headless/motion.mp4",
    b: "https://fixture.local/headless/motion-b.mp4",
    c: "https://fixture.local/headless/motion.mp4",
    voice: "https://fixture.local/headless/voice.wav",
    music: "https://fixture.local/headless/music.wav",
  };
  const fitMode = input?.fitMode === "fit" ? ("contain" as const) : ("cover" as const);
  const backgroundTreatment =
    input?.backgroundTreatment === "blurred_fill" && fitMode === "contain"
      ? ("blurred_fill" as const)
      : undefined;
  const videoMedia: SceneMedia = {
    type: "video",
    url: urls.a,
    mimeType: "video/mp4",
    width: sourceWidth,
    height: sourceHeight,
    durationMs: sourceDurationMs,
    trimStartMs,
    trimEndMs,
    muted: true,
    fitMode,
    transform: {
      x: input?.positionX ?? 0,
      y: input?.positionY ?? 0,
      scale: input?.zoom ?? 1,
      rotation: 0,
    },
    ...(backgroundTreatment ? { backgroundTreatment } : {}),
  };
  const secondVideoMedia: SceneMedia = {
    ...videoMedia,
    url: urls.b,
  };
  let scene: FootieScene = {
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
      items: input?.intraSceneTransition
        ? [
            { id: "video-item-1", media: videoMedia, durationWeight: 1 },
            { id: "video-item-2", media: secondVideoMedia, durationWeight: 1 },
          ]
        : [{ id: "video-item-1", media: videoMedia, durationWeight: 1 }],
    },
  };
  if (input?.intraSceneTransition) {
    scene = setSceneMediaTransitionBoundary(
      scene,
      "video-item-1",
      "video-item-2",
      input.intraSceneTransition.effect,
      input.intraSceneTransition.durationMs,
    ).scene;
  }
  const story = syncFootieScript({
    title: input?.storyTitle ?? "Headless Video Motion Reference",
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
    multiImageScenesEnabled: Boolean(input?.intraSceneTransition),
    exportSettings: {
      resolution: exportResolution,
      format: rendererProfile.format,
      quality: rendererProfile.quality,
    },
  });
  if (!isExportManifestV4(manifest) && !isExportManifestV5(manifest)) {
    throw new Error("Expected v4 or v5 video motion manifest.");
  }
  if ((backgroundTreatment || input?.intraSceneTransition) && !isExportManifestV5(manifest)) {
    throw new Error("Enhanced video motion fixture must freeze as ExportManifest v5.");
  }
  if (!backgroundTreatment && !input?.intraSceneTransition && !isExportManifestV4(manifest)) {
    throw new Error("Legacy Fit/Fill video motion fixture must freeze as v4.");
  }
  const appliedPrimary = applyHeadlessFormatToManifest(manifest, rendererProfile);
  if (!appliedPrimary.ok) {
    throw new Error(appliedPrimary.message);
  }
  const manifestV3 = appliedPrimary.manifest as ExportManifestV4 | ExportManifestV5;

  // Companion v2 is legacy-only: strip v5 fields so older fixture consumers stay valid.
  const v2Scenes = manifestV3.scenes.map((sceneRow) => {
    const rest = { ...sceneRow } as Record<string, unknown>;
    delete rest.mediaTransitions;
    delete rest.engagementOverlays;
    if (rest.media && typeof rest.media === "object") {
      const media = { ...(rest.media as Record<string, unknown>) };
      delete media.backgroundTreatment;
      delete media.visualEffect;
      rest.media = media;
    }
    if (
      rest.mediaTimeline &&
      typeof rest.mediaTimeline === "object" &&
      Array.isArray((rest.mediaTimeline as { items?: unknown }).items)
    ) {
      const timeline = {
        ...(rest.mediaTimeline as { version: number; items: unknown[] }),
      };
      timeline.items = timeline.items.map((item) => {
        if (!item || typeof item !== "object") return item;
        const row = { ...(item as Record<string, unknown>) };
        if (row.media && typeof row.media === "object") {
          const media = { ...(row.media as Record<string, unknown>) };
          delete media.backgroundTreatment;
          delete media.visualEffect;
          row.media = media;
        }
        return row;
      });
      rest.mediaTimeline = timeline;
    }
    return rest;
  });
  const v2Draft = {
    ...manifestV3,
    version: EXPORT_MANIFEST_V2_VERSION,
    rendererContractVersion: EXPORT_RENDERER_CONTRACT_V2,
    scenes: v2Scenes,
  } as unknown as Omit<ExportManifestV2, "fingerprint">;
  delete (v2Draft as { requiredCapabilities?: unknown }).requiredCapabilities;
  delete (v2Draft as { brandSting?: unknown }).brandSting;
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
    [urls.b, secondMotion.bytes],
    [urls.c, motion.bytes],
  ]);
  return {
    manifestV3,
    manifestV2: appliedV2.manifest,
    rendererProfile,
    assetBytesByUrl,
    assetMimeByUrl: new Map([
      [urls.a, "video/mp4"],
      [urls.b, "video/mp4"],
    ]),
    voiceBytes: null,
    musicBytes: null,
    urls,
  };
}
