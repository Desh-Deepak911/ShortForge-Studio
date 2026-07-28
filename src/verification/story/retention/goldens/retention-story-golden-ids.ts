/**
 * Sprint 10H — Retention Story Intelligence golden fixture IDs.
 * Representative (not Cartesian) coverage of durations, quality, strategy,
 * ScriptModes, tones, Hook paths, research classes, and generation paths.
 */

export const RETENTION_STORY_GOLDEN_IDS = [
  "rs-15-auto-fast-story",
  "rs-24-retention-balanced",
  "rs-25-auto-fast-story",
  "rs-30-auto-fast-story",
  "rs-30-retention-balanced",
  "rs-30-standard-balanced",
  "rs-30-auto-studio",
  "rs-30-hook-explicit-retention",
  "rs-30-write-my-own-retention",
  "rs-35-auto-fast-story",
  "rs-36-auto-fast-extended",
  "rs-45-auto-balanced-extended",
  "rs-60-auto-studio-extended",
  "rs-mode-tactical-review",
  "rs-mode-match-preview",
  "rs-mode-match-recap",
  "rs-mode-player-analysis",
  "rs-mode-top-5",
  "rs-mode-historical-explainer",
  "rs-mode-opinion-debate",
  "rs-tone-funny",
  "rs-tone-tactical",
  "rs-research-off",
  "rs-research-eligible-provider",
  "rs-research-manual-unverified",
  "rs-research-forbidden",
  "rs-path-script-only",
  "rs-path-audio-first",
  "rs-path-scenes-only",
  "rs-budget-fast-ceiling",
  "rs-budget-balanced-ceiling",
  "rs-budget-studio-ceiling",
  "rs-persistence-linked-success",
  "rs-fail-closed-unsupported-claim",
] as const;

export type RetentionStoryGoldenId =
  (typeof RETENTION_STORY_GOLDEN_IDS)[number];

export type RetentionStoryGoldenEvidenceFocus =
  | "duration-strategy"
  | "quality-budget"
  | "script-mode"
  | "tone"
  | "hook-path"
  | "research-grounding"
  | "generation-path"
  | "persistence"
  | "fail-closed";

export interface RetentionStoryGoldenDescriptor {
  readonly id: RetentionStoryGoldenId;
  readonly title: string;
  readonly proves: string;
  readonly evidenceFocus: RetentionStoryGoldenEvidenceFocus;
}
