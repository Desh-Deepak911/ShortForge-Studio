/**
 * Canonical duration shown on the export success screen.
 * Same render-end authority used by the renderer and artifact validation.
 */

import { resolveExportRenderEndMs } from "@/features/export/timing";

import {
  buildExportManifest,
  type BuildExportManifestInput,
} from "./build-export-manifest";

/**
 * Exported render duration in seconds: story content + Brand Sting + end buffer.
 * Callers must not add Brand Sting or buffer themselves.
 */
export function resolveCanonicalExportSuccessDurationSec(
  input: BuildExportManifestInput,
): number {
  return resolveExportRenderEndMs(buildExportManifest(input)) / 1000;
}
