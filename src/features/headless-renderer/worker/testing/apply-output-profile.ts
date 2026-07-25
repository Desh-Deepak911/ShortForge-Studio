/**
 * Sync frozen ExportManifest output format/quality with a headless profile.
 * Never writes 4K into ExportManifest — pixel elevation is HeadlessRenderTarget only.
 */

import {
  buildExportManifestFingerprint,
  type ExportManifest,
  type ExportManifestV3,
} from "@/features/export/domain/headless-safe";

import type { HeadlessRendererProfile } from "../../domain";
import { resolveHeadlessOutputProfile } from "../runtime/output-profiles";

/**
 * Apply format/quality/mime/extension from profile onto a frozen-compatible
 * manifest draft. Resolution/pixels are never elevated to 4K here.
 */
export function applyHeadlessFormatToManifest<T extends ExportManifest>(
  manifest: T,
  rendererProfile: HeadlessRendererProfile,
):
  | { readonly ok: true; readonly manifest: T }
  | { readonly ok: false; readonly message: string } {
  const resolved = resolveHeadlessOutputProfile(rendererProfile);
  if (!resolved.ok) {
    return { ok: false, message: resolved.message };
  }
  const profile = resolved.profile;

  // 4K jobs keep a frozen 1080p snapshot; other profiles keep their label.
  const resolution =
    rendererProfile.resolution === "4k"
      ? ("1080p" as const)
      : rendererProfile.resolution;
  const width = resolution === "720p" ? 720 : 1080;
  const height = resolution === "720p" ? 1280 : 1920;

  const baseName = String(manifest.output.filename || "export").replace(
    /\.(webm|mp4)$/i,
    "",
  );
  const draft = {
    ...manifest,
    output: {
      ...manifest.output,
      format: profile.format,
      quality: rendererProfile.quality,
      resolution,
      width,
      height,
      fps: 30 as const,
      mimeType: profile.mimeType,
      extension: profile.extension,
      filename: `${baseName}${profile.extension}`,
    },
  };
  const fingerprint = buildExportManifestFingerprint(
    draft as unknown as Omit<ExportManifestV3, "fingerprint">,
  );
  return { ok: true, manifest: { ...draft, fingerprint } as T };
}

/** @deprecated Prefer applyHeadlessFormatToManifest — never elevates to 4K. */
export const applyHeadlessOutputProfileToManifest = applyHeadlessFormatToManifest;
