/**
 * Canonical export timing types (Sprint 6C).
 * All semantic timing derives from ExportManifest — never live StoryDocument.
 */

import type {
  ExportCaptionManifest,
  ExportSceneManifest,
  ExportTransitionManifest,
} from "@/features/export/domain/export-manifest.types";

export interface ResolvedExportSceneFrame {
  readonly scene: ExportSceneManifest;
  readonly sceneIndex: number;
  readonly sceneStartMs: number;
  readonly sceneEndMs: number;
  readonly sceneElapsedMs: number;
  readonly sceneDurationMs: number;
}

export interface ResolvedExportCaptionFrame {
  readonly caption: ExportCaptionManifest;
  readonly captionIndex: number;
  readonly elapsedMs: number;
  readonly durationMs: number;
  readonly progress: number;
}

export interface ResolvedExportTransitionFrame {
  readonly transition: ExportTransitionManifest;
  readonly fromScene: ExportSceneManifest;
  readonly toScene: ExportSceneManifest;
  readonly fromSceneIndex: number;
  readonly toSceneIndex: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly elapsedMs: number;
  readonly durationMs: number;
  readonly progress: number;
}

export interface ResolvedExportMediaFrame {
  readonly scene: ExportSceneManifest;
  readonly sceneElapsedMs: number;
  readonly sceneDurationMs: number;
  readonly sourceTimeMs: number;
  readonly holdLastFrame: boolean;
}
