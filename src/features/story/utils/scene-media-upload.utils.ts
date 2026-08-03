import type { FootieScene, SceneImage, SceneMedia } from "@/features/story/types";

import type { ProbedVideoMetadata } from "./probe-video-metadata.utils";

function normalizeUploadDimension(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : undefined;
}

function normalizeUploadMimeType(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeUploadDurationMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : undefined;
}

export const SCENE_MEDIA_FILE_ACCEPT =
  "image/*,video/mp4,video/webm,video/quicktime";

export const SUPPORTED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export type SupportedVideoMimeType = (typeof SUPPORTED_VIDEO_MIME_TYPES)[number];

export function isSupportedVideoMimeType(mimeType: string): mimeType is SupportedVideoMimeType {
  return (SUPPORTED_VIDEO_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function isVideoUploadFile(file: Pick<File, "type" | "name">): boolean {
  const mimeType = file.type.trim().toLowerCase();
  if (mimeType && isSupportedVideoMimeType(mimeType)) {
    return true;
  }

  const lowerName = file.name.trim().toLowerCase();
  return lowerName.endsWith(".mp4") || lowerName.endsWith(".webm") || lowerName.endsWith(".mov");
}

export function isImageUploadFile(file: Pick<File, "type" | "name">): boolean {
  const mimeType = file.type.trim().toLowerCase();
  if (mimeType.startsWith("image/")) {
    return true;
  }

  return !isVideoUploadFile(file);
}

export function buildSceneMediaImageFromUpload(
  image: SceneImage,
  mimeType?: string,
  facts?: {
    readonly width?: number;
    readonly height?: number;
    readonly mimeType?: string;
  },
  options?: {
    readonly source?: Exclude<SceneMedia["source"], undefined>;
  },
): SceneMedia {
  const fitMode =
    image.fitMode === "fill" ? "cover" : image.fitMode === "fit" ? "contain" : undefined;
  const normalizedMime = normalizeUploadMimeType(facts?.mimeType ?? mimeType);
  const width = normalizeUploadDimension(facts?.width);
  const height = normalizeUploadDimension(facts?.height);

  return {
    type: "image",
    url: image.url,
    source: options?.source ?? "upload",
    ...(normalizedMime != null ? { mimeType: normalizedMime } : {}),
    ...(width != null ? { width } : {}),
    ...(height != null ? { height } : {}),
    fitMode,
    transform: {
      x: image.x,
      y: image.y,
      scale: image.scale,
      rotation: image.rotation ?? 0,
    },
    imageMotion: image.imageMotion,
  };
}

export function buildSceneMediaVideoFromUpload(
  url: string,
  metadata: ProbedVideoMetadata,
): SceneMedia {
  const durationMs = normalizeUploadDurationMs(metadata.durationMs);
  const width = normalizeUploadDimension(metadata.width);
  const height = normalizeUploadDimension(metadata.height);
  const mimeType = normalizeUploadMimeType(metadata.mimeType);

  return {
    type: "video",
    url,
    source: "upload",
    ...(mimeType != null ? { mimeType } : {}),
    ...(durationMs != null ? { durationMs } : {}),
    ...(width != null ? { width } : {}),
    ...(height != null ? { height } : {}),
    muted: true,
    trimStartMs: 0,
    trimEndMs: durationMs,
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
}

export function buildRemoveSceneMediaPatch(): Pick<
  FootieScene,
  "media" | "image" | "uploadedImage" | "assetAttachment"
> {
  return {
    media: undefined,
    image: undefined,
    uploadedImage: undefined,
    assetAttachment: undefined,
  };
}

export const SCENE_MEDIA_UPLOAD_HELPER_COPY =
  "Upload images or short clips you own or have rights to use.";
