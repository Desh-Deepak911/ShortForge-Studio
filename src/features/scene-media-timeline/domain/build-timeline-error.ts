/**
 * Typed domain error for atomic media-timeline write/build failures.
 * Diagnostics never include media URLs or private payloads.
 */

import type { SceneMediaTimelineDiagnostic } from "./normalize-timeline";

export class SceneMediaTimelineBuildError extends Error {
  readonly code = "scene_media_timeline_build_rejected" as const;
  readonly diagnostics: readonly SceneMediaTimelineDiagnostic[];

  constructor(diagnostics: readonly SceneMediaTimelineDiagnostic[]) {
    const codes = diagnostics.map((d) => d.code).join(", ");
    super(
      codes
        ? `Scene media timeline build rejected: ${codes}`
        : "Scene media timeline build rejected.",
    );
    this.name = "SceneMediaTimelineBuildError";
    this.diagnostics = diagnostics;
  }
}

export function isSceneMediaTimelineBuildError(
  error: unknown,
): error is SceneMediaTimelineBuildError {
  return error instanceof SceneMediaTimelineBuildError;
}
