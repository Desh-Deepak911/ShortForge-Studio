/**
 * PreparedExportFrame — semantic frame state ready to draw (Sprint 6C / 9C).
 */

import type {
  ExportBrandStingManifest,
  ExportBrandingManifest,
  ExportSceneMediaTimelineItemManifest,
  ExportSceneMediaTransitionBoundaryManifest,
} from "@/features/export/domain/export-manifest.types";
import type {
  ResolvedExportCaptionFrame,
  ResolvedExportSceneFrame,
  ResolvedExportTransitionFrame,
} from "@/features/export/timing";
import type { ExportDrawScene } from "./prepare-export-from-manifest";

export interface ResolvedExportMediaDrawFrame {
  readonly drawScene: ExportDrawScene;
  readonly sceneElapsedMs: number;
  readonly sceneDurationMs: number;
  readonly sourceTimeMs: number;
  readonly holdLastFrame: boolean;
  readonly mediaItemId: string | null;
  readonly itemElapsedMs: number;
  readonly itemDurationMs: number;
}

/**
 * Distinct intra-scene transition frame — not overloaded onto scene-to-scene.
 */
export interface ResolvedExportIntraSceneTransitionFrame {
  readonly sceneId: string;
  readonly fromItem: ExportSceneMediaTimelineItemManifest;
  readonly toItem: ExportSceneMediaTimelineItemManifest;
  readonly boundary: ExportSceneMediaTransitionBoundaryManifest;
  readonly effect: ExportSceneMediaTransitionBoundaryManifest["effect"];
  readonly progress: number;
  readonly requestedDurationMs: number;
  readonly effectiveDurationMs: number;
  readonly overlayStartOffsetMs: number;
  readonly overlayEndOffsetMs: number;
  readonly outgoingItemLocalMs: number;
  readonly incomingItemLocalMs: number;
  readonly fromDrawScene: ExportDrawScene;
  readonly toDrawScene: ExportDrawScene;
  readonly fromMediaKey: string;
  readonly toMediaKey: string;
}

export interface PreparedExportBrandStingFrame {
  readonly brandSting: ExportBrandStingManifest;
  /** Sting-local elapsed ms. */
  readonly elapsedMs: number;
}

export interface PreparedExportFrame {
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly visualTimeMs: number;
  readonly scene: ResolvedExportSceneFrame;
  readonly drawScene: ExportDrawScene;
  readonly peerDrawScenes: ReadonlyMap<string, ExportDrawScene>;
  readonly media: ResolvedExportMediaDrawFrame;
  readonly captions: readonly ResolvedExportCaptionFrame[];
  /** Scene-to-scene transition (takes precedence over intra-scene). */
  readonly transition: ResolvedExportTransitionFrame | null;
  /** V3 intra-scene media transition overlay (null when hard-cut / inactive). */
  readonly intraSceneTransition: ResolvedExportIntraSceneTransitionFrame | null;
  readonly branding: ExportBrandingManifest;
  readonly storyTitle: string;
  /** Narration/content duration — title timing authority (excludes brand sting). */
  readonly contentDurationMs: number;
  /** Present when absolute time is inside the trailing ShortForge Studio outro. */
  readonly brandSting: PreparedExportBrandStingFrame | null;
}
