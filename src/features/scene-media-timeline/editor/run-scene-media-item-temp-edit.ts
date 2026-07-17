/**
 * Pure terminal commit helper for per-media Inspector temp-scene edits (Sprint 8C.1).
 * Returns true only after the caller-provided commit accepts the StoryDocument write.
 */

import type { FootieScene, SceneMedia } from "@/features/story/types";

import { buildTemporarySceneForMediaItemEdit } from "./scene-media-timeline.commands";

export type SceneMediaItemTempScene = ReturnType<typeof buildTemporarySceneForMediaItemEdit>;

export interface RunSceneMediaItemTempEditParams {
  media: SceneMedia | null | undefined;
  playbackLocked: boolean;
  scene: FootieScene;
  build: (tempScene: SceneMediaItemTempScene) => { media: SceneMedia } | null;
  /** Must return true only after the StoryDocument media-intent commit is accepted. */
  commit: (nextMedia: SceneMedia) => boolean;
}

/**
 * Runs builder → commit for a selected timeline item.
 * false: missing media, playback locked, empty builder, or rejected commit.
 * true: only after commit returns true.
 */
export function runSceneMediaItemTempEdit(
  params: RunSceneMediaItemTempEditParams,
): boolean {
  if (!params.media) {
    return false;
  }
  if (params.playbackLocked) {
    return false;
  }

  const tempScene = buildTemporarySceneForMediaItemEdit(params.scene, params.media);
  let built: { media: SceneMedia } | null;
  try {
    built = params.build(tempScene);
  } catch {
    return false;
  }
  if (!built?.media) {
    return false;
  }

  try {
    return params.commit(built.media) === true;
  } catch {
    return false;
  }
}
