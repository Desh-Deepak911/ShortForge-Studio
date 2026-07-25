/**
 * Production render-profile authority — single source for capability + telemetry.
 * Reuses assertPhase3WorkerCapability; no parallel allowlists.
 */

import type { HeadlessRenderJobRequestV1 } from "../../domain";

import { assertPhase3WorkerCapability } from "./capability-preflight";
import type { RenderProfileClass } from "./provider-backed-boundary-telemetry";

export function classifyProductionRenderProfileClass(input: {
  readonly request: HeadlessRenderJobRequestV1;
  readonly ffmpegExecutable?: string;
}): RenderProfileClass {
  const failure = assertPhase3WorkerCapability({
    request: input.request,
    ffmpegExecutable: input.ffmpegExecutable,
  });
  return failure == null ? "phase3_supported" : "unsupported";
}

export function isProductionRenderProfileSupported(input: {
  readonly request: HeadlessRenderJobRequestV1;
  readonly ffmpegExecutable?: string;
}): boolean {
  return classifyProductionRenderProfileClass(input) === "phase3_supported";
}
