/** Preview playback scope — story-wide or single-scene window. */
export type PreviewPlaybackScope = "story" | "scene";

export interface PreviewScenePlaybackBounds {
  sceneId: string;
  sceneIndex: number;
  startMs: number;
  endMs: number;
}
