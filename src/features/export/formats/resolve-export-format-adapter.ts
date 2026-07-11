/**
 * Resolve format adapter for manifest output (Sprint 6E).
 */

import type { ExportManifest } from "@/features/export/domain/export-manifest.types";

import type { ExportFormatAdapter, ExportFormatId } from "./export-format-adapter.types";
import { createMp4ExportFormatAdapter } from "./mp4-export-format-adapter";
import {
  getCachedExportRuntimeCodecProbe,
  isMp4ExportRuntimeAvailable,
} from "./export-runtime-codec-probe";
import { createWebmExportFormatAdapter } from "./webm-export-format-adapter";

export function resolveExportFormatId(manifest: ExportManifest): ExportFormatId {
  return manifest.output.format === "mp4" ? "mp4" : "webm";
}

export function resolveExportFormatAdapter(
  manifest: ExportManifest,
): ExportFormatAdapter {
  const format = resolveExportFormatId(manifest);
  if (format === "mp4") {
    return createMp4ExportFormatAdapter(manifest);
  }
  return createWebmExportFormatAdapter(manifest);
}

export function isExportFormatSupported(format: ExportFormatId): boolean {
  if (format === "webm") return true;
  if (isMp4ExportRuntimeAvailable()) return true;
  // Manifest capability snapshot already gated MP4 when probe ran.
  const probe = getCachedExportRuntimeCodecProbe();
  if (probe) return probe.mp4Available;
  // Legacy sync callers (tests) without probe — defer to package assumption only in Node.
  return typeof window === "undefined";
}
