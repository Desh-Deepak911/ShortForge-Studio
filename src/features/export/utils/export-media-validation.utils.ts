import { getSceneMedia } from "@/features/story/utils";
import type { FootieScript } from "@/features/story/types";
import {
  validateSceneMediaPlayback,
  type MediaPlaybackValidationIssue,
} from "@/features/media-playback";

/**
 * Validates each scene's resolved SceneMedia for export.
 * Uses getSceneMedia() — never reads scene.image directly.
 * Does not mutate the story or attempt recovery.
 */
export function validateExportStoryMedia(
  story: FootieScript,
): MediaPlaybackValidationIssue[] {
  const issues: MediaPlaybackValidationIssue[] = [];

  for (const scene of story.scenes ?? []) {
    const media = getSceneMedia(scene);

    // Scenes without any media are handled by media-completeness / export readiness.
    // Only validate when an explicit media slot or legacy image is present.
    if (!media) {
      continue;
    }

    // Legacy/image media with a URL is fine — only surface video/placeholder problems.
    if (media.type === "image") {
      const imageIssues = validateSceneMediaPlayback(media, scene.id).filter(
        (issue) => issue.code === "missing_url",
      );
      issues.push(...imageIssues);
      continue;
    }

    issues.push(...validateSceneMediaPlayback(media, scene.id));
  }

  return issues;
}

/** Human-readable warning lines for export preflight UI. */
export function formatExportMediaValidationWarnings(
  issues: MediaPlaybackValidationIssue[],
): string[] {
  return issues.map((issue) => {
    const prefix = issue.sceneId ? `Scene ${issue.sceneId}: ` : "";
    return `${prefix}${issue.message}`;
  });
}
