/**
 * Explicit export renderer selection (Sprint 6B / 6F.1).
 * Never silently downgrades resolution, format, quality, or audio mode.
 * 1080p uses capability-based resolution approval — not a blanket server requirement.
 */

import {
  approveExportResolutionForManifest,
  is1080pBrowserOverrideEnabled,
} from "@/features/export/capabilities";

import type {
  ExportCapabilityResult,
  ExportRendererKind,
} from "./export-capability.types";
import type { ExportManifest } from "./export-manifest.types";

export function selectExportRenderer(
  manifest: ExportManifest,
  preflight: Pick<ExportCapabilityResult, "blockers" | "estimatedCost">,
): ExportRendererKind {
  if (preflight.blockers.length > 0) {
    return "blocked";
  }

  const needsServer = exportRequiresServerRenderer(manifest, preflight);

  if (needsServer) {
    return manifest.capabilities.serverRendererAvailable ? "server" : "blocked";
  }

  if (!manifest.capabilities.browserRendererAvailable) {
    return "blocked";
  }

  return "browser";
}

export function exportRequiresServerRenderer(
  manifest: ExportManifest,
  preflight: Pick<ExportCapabilityResult, "estimatedCost">,
): boolean {
  // Dev override: bypass only 1080p memory/capability server requirement.
  // Unrelated blockers (missing media, codecs, poison, etc.) are handled separately.
  if (
    manifest.output.resolution === "1080p" &&
    is1080pBrowserOverrideEnabled()
  ) {
    return false;
  }

  // True memory-unsafe estimates still require server when available.
  if (preflight.estimatedCost.risk === "unsafe") {
    return true;
  }

  const approval = approveExportResolutionForManifest(
    manifest,
    preflight.estimatedCost,
  );

  // Capability-blocked 1080p (or rare 720p) maps to server-required when no browser path.
  return approval.classification === "blocked";
}
