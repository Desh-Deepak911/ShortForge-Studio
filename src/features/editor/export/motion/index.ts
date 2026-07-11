/**
 * Export media motion adapter — canvas bridge for the shared motion engine (4.2C-5).
 */
export type {
  ExportMediaMotionInput,
  ExportMotionTransform,
} from "./exportMotionAdapter";
export {
  clampExportSceneLocalTimeMs,
  resolveExportMediaBaseTransform,
  resolveExportMediaMotionTransform,
  resolveExportSceneLocalTimeMs,
  toExportDrawTransformOverride,
  toExportMotionTransform,
} from "./exportMotionAdapter";
