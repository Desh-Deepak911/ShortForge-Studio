/** High-level visual beat for a planned scene. */
export type SceneBeatKind =
  | "intro"
  | "context"
  | "match"
  | "player_spotlight"
  | "stat_card"
  | "transition"
  | "ending";

export interface PlannedSceneBeat {
  index: number;
  kind: SceneBeatKind;
  /** Short visual direction for subtitles / storyboard. */
  subtitleHint?: string;
  /** Optional entity labels to highlight in this beat. */
  entityLabels?: string[];
}

export interface StoryboardPlan {
  beats: PlannedSceneBeat[];
  sceneCount: number;
}
