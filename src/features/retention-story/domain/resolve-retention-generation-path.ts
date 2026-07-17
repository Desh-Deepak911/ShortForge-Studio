/**
 * Generation-path resolution — Sprint 10B.
 */

import type { GenerateScriptMode } from "@/types/footiebitz";

import { RetentionStoryError } from "./retention-story-errors";
import type { RetentionGenerationPath } from "./retention-story-contract.types";

const API_TO_PATH: Readonly<Record<GenerateScriptMode, RetentionGenerationPath>> = Object.freeze({
  "script-only": "script_only",
  full: "audio_first_full",
  "scenes-only": "scenes_only",
});

const PATH_TO_API: Readonly<Record<RetentionGenerationPath, GenerateScriptMode>> = Object.freeze({
  script_only: "script-only",
  audio_first_full: "full",
  scenes_only: "scenes-only",
});

const VALID_PATHS = new Set<RetentionGenerationPath>([
  "script_only",
  "audio_first_full",
  "scenes_only",
]);

const VALID_API_MODES = new Set<GenerateScriptMode>(["full", "script-only", "scenes-only"]);

export function apiModeToRetentionGenerationPath(
  apiMode: GenerateScriptMode,
): RetentionGenerationPath {
  return API_TO_PATH[apiMode];
}

export function retentionGenerationPathToApiMode(
  path: RetentionGenerationPath,
): GenerateScriptMode {
  return PATH_TO_API[path];
}

export function isRetentionGenerationPath(value: unknown): value is RetentionGenerationPath {
  return typeof value === "string" && VALID_PATHS.has(value as RetentionGenerationPath);
}

export function isGenerateScriptMode(value: unknown): value is GenerateScriptMode {
  return typeof value === "string" && VALID_API_MODES.has(value as GenerateScriptMode);
}

/**
 * Resolve coherent generation path from optional internal path and/or API mode.
 * Absence of both → audio_first_full (API `full`).
 */
export function resolveRetentionGenerationPath(input: {
  readonly generationPath?: RetentionGenerationPath | string | null;
  readonly apiMode?: GenerateScriptMode | string | null;
}): RetentionGenerationPath {
  const hasPath =
    input.generationPath != null && String(input.generationPath).trim() !== "";
  const hasApi = input.apiMode != null && String(input.apiMode).trim() !== "";

  if (!hasPath && !hasApi) {
    return "audio_first_full";
  }

  let fromPath: RetentionGenerationPath | undefined;
  if (hasPath) {
    if (!isRetentionGenerationPath(input.generationPath)) {
      throw new RetentionStoryError(
        "invalid_generation_path",
        "Generation path is not a supported Retention path.",
      );
    }
    fromPath = input.generationPath;
  }

  let fromApi: RetentionGenerationPath | undefined;
  if (hasApi) {
    if (!isGenerateScriptMode(input.apiMode)) {
      throw new RetentionStoryError(
        "invalid_generation_path",
        "API generation mode is not supported.",
      );
    }
    fromApi = apiModeToRetentionGenerationPath(input.apiMode);
  }

  if (fromPath && fromApi && fromPath !== fromApi) {
    throw new RetentionStoryError(
      "generation_path_mismatch",
      "Generation path and API mode describe different pipelines.",
    );
  }

  return fromPath ?? fromApi ?? "audio_first_full";
}
