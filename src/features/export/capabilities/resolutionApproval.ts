/**
 * Capability-based resolution approval (Sprint 6F.1).
 * Replaces blanket 1080p browser block with Approved / Warning / Blocked.
 */

import type { ExportManifest } from "@/features/export/domain/export-manifest.types";
import type { ExportCostEstimate } from "@/features/export/domain/export-capability.types";

import {
  buildExportDeviceCapabilityEstimate,
  isImageHeavyProject,
  isMixedMediaProject,
  isVideoHeavyProject,
  type ExportDeviceCapabilityEstimate,
} from "./deviceCapabilityEstimate";
import {
  EXPORT_1080P_OVERRIDE_WARNING_MESSAGE,
  is1080pBrowserOverrideEnabled,
} from "./export1080pOverride";
import {
  getExportResolutionPolicy,
  type ExportResolutionApprovalClass,
} from "./exportResolutionPolicy";

export interface ExportResolutionApproval {
  readonly classification: ExportResolutionApprovalClass;
  readonly resolution: "720p" | "1080p";
  readonly overrideApplied: boolean;
  readonly message: string;
  readonly reasons: readonly string[];
  readonly estimate: ExportDeviceCapabilityEstimate;
}

export const EXPORT_1080P_BLOCKED_USER_MESSAGE = [
  "This project is estimated to exceed reliable browser memory for 1080p export.",
  "",
  "Try:",
  "• 720p browser export",
  "• reduce video-heavy scenes",
  "• Headless export (renders in the background on a server)",
].join("\n");

/** Shown when 1080p is approved but may stress the local browser. */
export const EXPORT_1080P_WARNING_USER_MESSAGE =
  "1080p browser export may use significant device resources. Keep this tab open until the download finishes. You can use Headless instead to render in the background.";

export function approveExportResolution(input: {
  readonly estimate: ExportDeviceCapabilityEstimate;
  readonly allow1080Override?: boolean;
}): ExportResolutionApproval {
  const overrideApplied =
    input.allow1080Override ?? is1080pBrowserOverrideEnabled();
  const { estimate } = input;
  const policy = getExportResolutionPolicy(estimate.resolution);
  const reasons: string[] = [];

  if (!estimate.browserApisReady) {
    return {
      classification: "blocked",
      resolution: estimate.resolution,
      overrideApplied: false,
      message:
        "This browser does not expose the APIs required for reliable export.",
      reasons: ["browser-apis-unavailable"],
      estimate,
    };
  }

  if (estimate.resolution === "720p") {
    if (
      estimate.estimatedPeakMemoryBytes >= policy.maxEstimatedPeakMemoryBytes ||
      estimate.projectDurationMs > policy.maxProjectDurationMs ||
      estimate.videoSceneCount > policy.maxVideoScenes
    ) {
      reasons.push("720p-cost-exceeded");
      return {
        classification: "blocked",
        resolution: "720p",
        overrideApplied: false,
        message:
          "This project is too large for reliable 720p browser export. Reduce duration or video scenes, or wait for the server renderer.",
        reasons,
        estimate,
      };
    }
    if (
      estimate.estimatedPeakMemoryBytes >= policy.safePeakMemoryBytes ||
      estimate.durationClass === "long"
    ) {
      reasons.push("720p-borderline");
      return {
        classification: "approved-with-warning",
        resolution: "720p",
        overrideApplied: false,
        message:
          "This 720p export is near the safe browser memory or duration limit.",
        reasons,
        estimate,
      };
    }
    return {
      classification: "approved",
      resolution: "720p",
      overrideApplied: false,
      message: "720p browser export is approved for this project.",
      reasons: ["720p-production-approved"],
      estimate,
    };
  }

  // —— 1080p ——
  // Developer override bypasses only 1080p memory/capability blockers (not media/codec/etc.).
  if (overrideApplied) {
    return {
      classification: "approved-with-warning",
      resolution: "1080p",
      overrideApplied: true,
      message: EXPORT_1080P_OVERRIDE_WARNING_MESSAGE,
      reasons: ["DEV_1080P_OVERRIDE"],
      estimate,
    };
  }

  const videoHeavy = isVideoHeavyProject(estimate);
  const mixed = isMixedMediaProject(estimate);
  const imageHeavy = isImageHeavyProject(estimate);

  if (
    estimate.estimatedPeakMemoryBytes >= policy.maxEstimatedPeakMemoryBytes
  ) {
    reasons.push("peak-memory-unsafe");
    return blocked1080(estimate, reasons);
  }

  if (
    estimate.projectDurationMs > policy.maxProjectDurationMs ||
    estimate.estimatedFrames > policy.maxEstimatedFrames
  ) {
    reasons.push("duration-exceeded");
    return warn1080(estimate, reasons);
  }

  if (videoHeavy && estimate.durationClass !== "short") {
    reasons.push("video-heavy-non-short");
    return warn1080(estimate, reasons);
  }

  if (videoHeavy && estimate.videoSceneCount > policy.maxVideoScenes) {
    reasons.push("video-scene-cap");
    return blocked1080(estimate, reasons);
  }

  if (estimate.durationClass === "long" && estimate.videoSceneCount > 0) {
    reasons.push("long-with-video");
    return warn1080(estimate, reasons);
  }

  if (mixed || (videoHeavy && estimate.durationClass === "short")) {
    reasons.push(mixed ? "mixed-media" : "video-heavy-short");
    return {
      classification: "approved-with-warning",
      resolution: "1080p",
      overrideApplied: false,
      message: EXPORT_1080P_WARNING_USER_MESSAGE,
      reasons,
      estimate,
    };
  }

  if (
    estimate.estimatedPeakMemoryBytes >= policy.safePeakMemoryBytes ||
    estimate.durationClass === "medium"
  ) {
    reasons.push("borderline-cost");
    return {
      classification: "approved-with-warning",
      resolution: "1080p",
      overrideApplied: false,
      message: EXPORT_1080P_WARNING_USER_MESSAGE,
      reasons,
      estimate,
    };
  }

  if (imageHeavy || estimate.videoSceneCount === 0) {
    reasons.push("image-heavy-or-silent-visual");
    return {
      classification: "approved",
      resolution: "1080p",
      overrideApplied: false,
      message: "1080p browser export is approved for this project profile.",
      reasons,
      estimate,
    };
  }

  reasons.push("default-1080p-warning");
  return {
    classification: "approved-with-warning",
    resolution: "1080p",
    overrideApplied: false,
    message: EXPORT_1080P_WARNING_USER_MESSAGE,
    reasons,
    estimate,
  };
}

function warn1080(
  estimate: ExportDeviceCapabilityEstimate,
  reasons: string[],
): ExportResolutionApproval {
  return {
    classification: "approved-with-warning",
    resolution: "1080p",
    overrideApplied: false,
    message: EXPORT_1080P_WARNING_USER_MESSAGE,
    reasons,
    estimate,
  };
}

function blocked1080(
  estimate: ExportDeviceCapabilityEstimate,
  reasons: string[],
): ExportResolutionApproval {
  return {
    classification: "blocked",
    resolution: "1080p",
    overrideApplied: false,
    message: EXPORT_1080P_BLOCKED_USER_MESSAGE,
    reasons,
    estimate,
  };
}

export function approveExportResolutionForManifest(
  manifest: ExportManifest,
  estimatedCost: ExportCostEstimate,
  options?: { readonly allow1080Override?: boolean },
): ExportResolutionApproval {
  const estimate = buildExportDeviceCapabilityEstimate(manifest, estimatedCost);
  return approveExportResolution({
    estimate,
    allow1080Override: options?.allow1080Override,
  });
}
