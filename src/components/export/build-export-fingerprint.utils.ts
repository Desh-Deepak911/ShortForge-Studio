import { buildScriptHash } from "@/features/editor/creator-asset-planning/creator-asset-planning.utils";
import { normalizeExportSettings } from "@/features/export/services";
import {
  resolveSceneMediaMotionFromMedia,
  serializeSceneMediaMotionFingerprint,
} from "@/features/media-motion";
import type {
  ExportSettings,
  FootieScene,
  FootieScript,
  SceneMedia,
} from "@/features/story/types";
import { getSceneMedia } from "@/features/story/utils";

export interface BuildExportFingerprintInput {
  script: FootieScript;
  exportSettings: ExportSettings;
  includeNarration: boolean;
  includeBackgroundMusic: boolean;
}

/**
 * Stable media segment for export staleness.
 * SceneMedia is the single authority — resolved via getSceneMedia()
 * (covers legacy image / uploadedImage automatically).
 */
export function buildSceneMediaExportFingerprintKey(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
): string {
  const media = getSceneMedia(scene);
  if (!media) {
    return "";
  }

  return serializeSceneMediaFingerprint(media);
}

function serializeSceneMediaFingerprint(media: SceneMedia): string {
  if (media.type === "placeholder") {
    return "placeholder";
  }

  const transform = media.transform
    ? [
        media.transform.x ?? 0,
        media.transform.y ?? 0,
        media.transform.scale ?? 1,
        media.transform.rotation ?? 0,
      ].join(",")
    : "";

  const motionKey = serializeSceneMediaMotionFingerprint(
    resolveSceneMediaMotionFromMedia(media),
  );

  if (media.type === "image") {
    return [
      "image",
      media.url ?? "",
      media.fitMode ?? "",
      transform,
      motionKey,
    ].join("|");
  }

  if (media.type === "video") {
    return [
      "video",
      media.url ?? "",
      media.durationMs ?? "",
      media.trimStartMs ?? "",
      media.trimEndMs ?? "",
      media.posterUrl ?? "",
      media.fitMode ?? "",
      transform,
      media.muted === false ? "0" : "1",
      motionKey,
    ].join("|");
  }

  return media.type;
}

function buildSceneExportFingerprint(scene: FootieScene): string {
  const mediaKey = buildSceneMediaExportFingerprintKey(scene);

  return [
    scene.id,
    scene.duration,
    scene.subtitle,
    scene.subtitleText ?? "",
    scene.captionMode ?? "",
    scene.captionPreset ?? "",
    scene.subtitleEffect ?? "",
    mediaKey,
  ].join(":");
}

function buildTimelineExportFingerprint(script: FootieScript): string {
  return (script.timelineItems ?? [])
    .map((item) => {
      if (item.type === "transition") {
        return `t:${item.id}:${item.effect}:${item.durationMs}`;
      }
      return `s:${item.id}`;
    })
    .join("|");
}

/** Stable fingerprint for export staleness — presentation only, not render input. */
export function buildExportFingerprint(input: BuildExportFingerprintInput): string {
  const { script, exportSettings, includeNarration, includeBackgroundMusic } = input;
  const normalizedSettings = normalizeExportSettings(exportSettings, script.title);

  return [
    buildScriptHash(script),
    script.scenes.map(buildSceneExportFingerprint).join(";"),
    buildTimelineExportFingerprint(script),
    JSON.stringify(script.audioMixer ?? null),
    JSON.stringify(script.backgroundMusic ?? null),
    JSON.stringify(script.voiceSettings ?? null),
    JSON.stringify(normalizedSettings),
    includeNarration ? "1" : "0",
    includeBackgroundMusic ? "1" : "0",
  ].join("::");
}
