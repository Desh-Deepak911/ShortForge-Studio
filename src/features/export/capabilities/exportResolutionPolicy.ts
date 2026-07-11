/**
 * Resolution thresholds for browser export (Sprint 6F.1).
 * Capability estimation drives Approved / Warning / Blocked — not a blanket 1080p ban.
 */

import type { ExportCostEstimate } from "@/features/export/domain/export-capability.types";
import {
  EXPORT_SAFE_PEAK_MEMORY_BYTES,
  EXPORT_UNSAFE_PEAK_MEMORY_BYTES,
} from "@/features/export/domain/export-cost-estimate.utils";

export type ExportResolutionApprovalClass =
  | "approved"
  | "approved-with-warning"
  | "blocked";

export interface ExportResolutionPolicy {
  readonly resolution: "720p" | "1080p";
  readonly maxProjectDurationMs: number;
  readonly maxEstimatedFrames: number;
  readonly maxVideoScenes: number;
  readonly maxEstimatedPeakMemoryBytes: number;
  readonly safePeakMemoryBytes: number;
  readonly productionDefault: ExportResolutionApprovalClass;
  readonly rationale: string;
}

/** 720p remains the production-approved browser path. */
export const EXPORT_720P_RESOLUTION_POLICY: ExportResolutionPolicy = {
  resolution: "720p",
  maxProjectDurationMs: 90_000,
  maxEstimatedFrames: (90_000 * 30) / 1000,
  maxVideoScenes: 8,
  maxEstimatedPeakMemoryBytes: EXPORT_UNSAFE_PEAK_MEMORY_BYTES,
  safePeakMemoryBytes: EXPORT_SAFE_PEAK_MEMORY_BYTES,
  productionDefault: "approved",
  rationale:
    "720p chunked browser export is production-approved for Chromium-first workflows.",
};

/**
 * 1080p is capability-gated (not blanket-blocked).
 * Image-heavy short projects may approve; mixed warns; video-heavy long blocks.
 */
export const EXPORT_1080P_RESOLUTION_POLICY: ExportResolutionPolicy = {
  resolution: "1080p",
  maxProjectDurationMs: 45_000,
  maxEstimatedFrames: (45_000 * 30) / 1000,
  maxVideoScenes: 3,
  maxEstimatedPeakMemoryBytes: EXPORT_UNSAFE_PEAK_MEMORY_BYTES,
  safePeakMemoryBytes: EXPORT_SAFE_PEAK_MEMORY_BYTES,
  productionDefault: "approved-with-warning",
  rationale:
    "1080p browser export is approved when estimated cost is safe; mixed media warns; video-heavy or long projects block pending server renderer.",
};

export function getExportResolutionPolicy(
  resolution: "720p" | "1080p",
): ExportResolutionPolicy {
  return resolution === "1080p"
    ? EXPORT_1080P_RESOLUTION_POLICY
    : EXPORT_720P_RESOLUTION_POLICY;
}

export function durationClassFromMs(
  projectDurationMs: number,
): ExportCostEstimate["durationClass"] {
  const durationSec = projectDurationMs / 1000;
  if (durationSec <= 12) return "short";
  if (durationSec <= 28) return "medium";
  return "long";
}
