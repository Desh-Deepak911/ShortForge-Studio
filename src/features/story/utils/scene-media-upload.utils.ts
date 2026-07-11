import type { FootieScene, SceneImage, SceneMedia } from "@/features/story/types";

import type { ProbedVideoMetadata } from "./probe-video-metadata.utils";

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
): SceneMedia {
  const fitMode =
    image.fitMode === "fill" ? "cover" : image.fitMode === "fit" ? "contain" : undefined;

  return {
    type: "image",
    url: image.url,
    source: "upload",
    mimeType: mimeType?.trim() || undefined,
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
  return {
    type: "video",
    url,
    source: "upload",
    mimeType: metadata.mimeType,
    durationMs: metadata.durationMs,
    width: metadata.width > 0 ? metadata.width : undefined,
    height: metadata.height > 0 ? metadata.height : undefined,
    muted: true,
    trimStartMs: 0,
    trimEndMs: metadata.durationMs,
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
