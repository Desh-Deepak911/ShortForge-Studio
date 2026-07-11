/**
 * PreparedExportFrame — semantic frame state ready to draw (Sprint 6C).
 */

import type { ExportBrandingManifest } from "@/features/export/domain/export-manifest.types";
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
  readonly transition: ResolvedExportTransitionFrame | null;
  readonly branding: ExportBrandingManifest;
  readonly storyTitle: string;
}
