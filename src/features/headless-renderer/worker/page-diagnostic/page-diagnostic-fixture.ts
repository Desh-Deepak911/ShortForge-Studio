/**
 * Deterministic provider-free 720p/2s diagnostic fixture bytes and manifest.
 */

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

import {
  buildExportManifestFingerprint,
  EXPORT_MANIFEST_VERSION,
  EXPORT_RENDERER_CONTRACT_VERSION,
  type ExportManifestV3,
} from "@/features/export/domain/headless-safe";

import { headlessSourceDigest, headlessSourceSlotKey } from "../../domain";
import { classifyHeadlessSource } from "../../domain/headless-source-coverage";
import type { StagedWorkerAsset } from "../assets/materialize-owned-assets";
import type { HeadlessWorkerWorkspace } from "../assets/workspace";

export const PAGE_DIAGNOSTIC_CONTENT_DURATION_MS = 2_000 as const;
export const PAGE_DIAGNOSTIC_PROFILE_ID = "720p-webm-30" as const;

const FIXTURE_IMAGE_URL = "fixture://page-diagnostic/scene-a.png";
const FIXTURE_SCENE_ID = "scene-diag";
const FIXTURE_ITEM_ID = "00000000-0000-4000-8000-0000000000a1";
const FIXTURE_PROJECT_ID = "00000000-0000-4000-8000-0000000000p1";

/** Minimal valid 720x1280 PNG (deterministic solid). */
export function buildPageDiagnosticPngBytes(): Uint8Array {
  const width = 720;
  const height = 1280;
  const rowSize = 1 + width * 3;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = rowStart + 1 + x * 3;
      raw[i] = 32;
      raw[i + 1] = 64;
      raw[i + 2] = 96;
    }
  }
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) {
      c = crcTable[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const typeBuf = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcInput = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcInput), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  };
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const compressed = deflateSync(raw);
  return new Uint8Array(
    Buffer.concat([
      signature,
      chunk("IHDR", ihdr),
      chunk("IDAT", compressed),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

export function buildPageDiagnosticManifestV3(): ExportManifestV3 {
  const durationMs = PAGE_DIAGNOSTIC_CONTENT_DURATION_MS;
  const imageMedia = Object.freeze({
    type: "image" as const,
    source: FIXTURE_IMAGE_URL,
    fitMode: "fill" as const,
    positionX: 0,
    positionY: 0,
    zoom: 1,
    rotationDeg: 0,
    motion: null,
  });
  const draft: Omit<ExportManifestV3, "fingerprint"> = {
    manifestId: "00000000-0000-4000-8000-0000000000m1",
    createdAt: "2026-07-23T00:00:00.000Z",
    version: EXPORT_MANIFEST_VERSION,
    rendererContractVersion: EXPORT_RENDERER_CONTRACT_VERSION,
    project: {
      projectId: FIXTURE_PROJECT_ID,
      storyTitle: "Page Diagnostic Fixture",
      contentDurationMs: durationMs,
      renderDurationMs: durationMs,
      endBufferMs: 0,
      aspectRatio: "9:16",
      sceneCount: 1,
    },
    output: {
      format: "webm",
      quality: "high",
      resolution: "720p",
      width: 720,
      height: 1280,
      fps: 30,
      filename: "export.webm",
      mimeType: "video/webm",
      extension: ".webm",
      bitrate: 2_500_000,
    },
    captions: [],
    audio: {
      mode: "silent",
      voiceover: null,
      music: null,
      sourceVideoAudioPolicy: "muted",
      applyPeakProtection: false,
    },
    branding: {
      watermarkEnabled: true,
      watermarkText: "ShortForge",
      position: "top-left",
      opacity: 0.35,
    },
    capabilities: {
      supportedFormats: ["webm", "mp4"],
      supportedResolutions: ["720p", "1080p"],
      supportedFps: [30],
      browserRendererAvailable: true,
      serverRendererAvailable: false,
      environment: {
        browserName: "chrome",
        supportsCanvasCaptureStream: true,
        supportsManualCanvasFrameRequest: true,
        supportsMediaRecorder: true,
        supportsRequestVideoFrameCallback: true,
        supportsWebAssembly: true,
        estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
        serverRendererAvailable: false,
        ffmpegRuntimePoisoned: false,
        mp4EncoderAvailable: true,
      },
    },
    scenes: [
      {
        id: FIXTURE_SCENE_ID,
        index: 0,
        startMs: 0,
        durationMs,
        endMs: durationMs,
        media: imageMedia,
        mediaTimeline: {
          version: 1,
          items: [
            {
              id: FIXTURE_ITEM_ID,
              index: 0,
              startOffsetMs: 0,
              endOffsetMs: durationMs,
              durationMs,
              media: imageMedia,
            },
          ],
        },
        mediaTransitions: { version: 1, boundaries: [] },
        transitionOut: null,
        captionMode: "generated",
        hasDrawableMedia: true,
      },
    ],
  };
  const fingerprint = buildExportManifestFingerprint(draft);
  return Object.freeze({ ...draft, fingerprint });
}

export function stagePageDiagnosticAssets(input: {
  readonly workspace: HeadlessWorkerWorkspace;
  readonly manifest: ExportManifestV3;
  readonly pngBytes: Uint8Array;
}): { readonly ok: true; readonly assets: readonly StagedWorkerAsset[] } | { readonly ok: false } {
  const scene = input.manifest.scenes[0];
  const item = scene?.mediaTimeline.items[0];
  if (scene == null || item == null) {
    return { ok: false };
  }
  const source = FIXTURE_IMAGE_URL;
  const digest = headlessSourceDigest(source);
  const slotKey = headlessSourceSlotKey({
    role: "scene_media",
    sceneId: scene.id,
    mediaItemId: item.id,
    sourceDigest: digest,
  });
  const assetId = "diag_asset_a";
  const digestTail = digest.replace(/^[^:]+:/, "").slice(0, 16);
  const fileName = `${assetId}_${digestTail}.png`;
  const assetsDir = join(input.workspace.rootDir, "assets");
  const absolutePath = join(assetsDir, fileName);
  try {
    writeFileSync(absolutePath, input.pngBytes);
  } catch {
    return { ok: false };
  }
  const asset: StagedWorkerAsset = Object.freeze({
    assetId,
    sourceIdentity: {
      role: "scene_media" as const,
      sceneId: scene.id,
      mediaItemId: item.id,
      sourceDigest: digest,
      classification: classifyHeadlessSource(source),
    },
    sourceDigest: digest,
    slotKey,
    mimeType: "image/png",
    absolutePath,
    relativeUrlPath: `assets/${fileName}`,
    byteLength: input.pngBytes.byteLength,
  });
  return { ok: true, assets: Object.freeze([asset]) };
}

export function pageDiagnosticFixtureFingerprint(): string {
  const manifest = buildPageDiagnosticManifestV3();
  const png = buildPageDiagnosticPngBytes();
  return createHash("sha256")
    .update(buildExportManifestFingerprint(manifest))
    .update(png)
    .digest("hex");
}
