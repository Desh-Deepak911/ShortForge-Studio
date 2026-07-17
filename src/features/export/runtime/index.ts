/**
 * Export runtime public API (Sprint 6C).
 */

export type {
  CreateExportRenderContextOptions,
  ExportCancellationToken,
  ExportDiagnostics,
  ExportFfmpegRuntime,
  ExportProgressReporter,
  ExportProgressStage,
  ExportProgressUpdate,
  ExportRenderContext,
  ExportRuntimeEnvironment,
  ExportTemporaryStorage,
} from "./export-render-context.types";

export { createExportCancellationToken, ExportCancelledError } from "./export-cancellation";
export { createExportProgressReporter } from "./export-progress";
export { createExportRenderContext } from "./create-export-render-context";
export { disposeExportRenderContext } from "./dispose-export-render-context";
export {
  prepareExportFromManifest,
  assertExportManifest,
  assertExportManifestV2,
  type ExportDrawScene,
  type ExportRenderPlan,
} from "./prepare-export-from-manifest";
export {
  prepareExportFrame,
  type PrepareExportFrameResult,
} from "./prepare-export-frame";
export type {
  PreparedExportFrame,
  ResolvedExportMediaDrawFrame,
  ResolvedExportIntraSceneTransitionFrame,
} from "./prepared-export-frame.types";
export { drawPreparedExportFrame } from "./draw-prepared-export-frame";
export {
  renderExport,
  renderExportSilentVisual,
  type ExportArtifact,
  type ExportResultKind,
  type RenderExportOptions,
} from "./render-export";
