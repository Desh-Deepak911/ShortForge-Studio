import { buildScriptHash } from "@/features/editor/creator-asset-planning/creator-asset-planning.utils";
import { normalizeExportSettings } from "@/features/export/services";
import type { ExportSettings, FootieScene, FootieScript } from "@/features/story/types";

export interface BuildExportFingerprintInput {
  script: FootieScript;
  exportSettings: ExportSettings;
  includeNarration: boolean;
  includeBackgroundMusic: boolean;
}

function buildSceneExportFingerprint(scene: FootieScene): string {
  const imageKey = scene.image
    ? [
        scene.image.url,
        scene.image.scale,
        scene.image.x,
        scene.image.y,
        scene.image.rotation ?? 0,
        scene.image.fitMode ?? "",
        JSON.stringify(scene.image.imageMotion ?? null),
      ].join(",")
    : (scene.uploadedImage ?? "");

  return [
    scene.id,
    scene.duration,
    scene.subtitle,
    scene.subtitleText ?? "",
    scene.captionMode ?? "",
    scene.captionPreset ?? "",
    scene.subtitleEffect ?? "",
    imageKey,
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
