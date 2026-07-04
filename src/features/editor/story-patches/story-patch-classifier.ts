import type { FootieScene, FootieScript, TimelineItem } from "@/features/story/types";
import { isUserAuthoredSpokenTextChange } from "@/features/story/utils/caption.utils";
import {
  getSceneImage,
  normalizeSceneImageMotion,
} from "@/features/story/utils/scene.utils";

/** Coarse edit classes for editor update policy. */
export type StoryPatchClass =
  | "structural"
  | "timing"
  | "spoken_text"
  | "caption"
  | "media"
  | "motion"
  | "transition"
  | "audio"
  | "metadata";

export interface StoryPatchClassification {
  classes: StoryPatchClass[];
  primary: StoryPatchClass;
}

const PRIMARY_PRIORITY: StoryPatchClass[] = [
  "structural",
  "timing",
  "transition",
  "audio",
  "metadata",
  "spoken_text",
  "media",
  "motion",
  "caption",
];

const IMMEDIATE_TIMELINE_CLASSES: ReadonlySet<StoryPatchClass> = new Set([
  "structural",
  "timing",
  "transition",
]);

const DEBOUNCED_TIMELINE_CLASSES: ReadonlySet<StoryPatchClass> = new Set([
  "spoken_text",
  "caption",
  "motion",
]);

const IMMEDIATE_EVOLUTION_CLASSES: ReadonlySet<StoryPatchClass> = new Set([
  "structural",
  "timing",
  "metadata",
  "spoken_text",
]);

/** Content edits that should not force expensive planning/evolution work. */
const DEFERRED_EVOLUTION_CLASSES: ReadonlySet<StoryPatchClass> = new Set([
  "caption",
  "motion",
  "media",
  "transition",
  "audio",
]);

export const CONTENT_TIMELINE_REBUILD_DEBOUNCE_MS = 300;
export const IMMEDIATE_STORY_EVOLUTION_DEBOUNCE_MS = 100;
export const DEFERRED_STORY_EVOLUTION_DEBOUNCE_MS = 1500;

function resolvePrimary(classes: StoryPatchClass[]): StoryPatchClass {
  for (const candidate of PRIMARY_PRIORITY) {
    if (classes.includes(candidate)) {
      return candidate;
    }
  }
  return "metadata";
}

function sceneOrderChanged(prev: FootieScene[], next: FootieScene[]): boolean {
  if (prev.length !== next.length) {
    return true;
  }

  return prev.some((scene, index) => scene.id !== next[index]?.id);
}

function msValueMatchesSec(ms: number | undefined, sec: number | undefined): boolean {
  if (sec == null || !Number.isFinite(sec)) {
    return ms == null;
  }

  const expectedMs = Math.round(sec * 1000);
  return ms == null || ms === expectedMs;
}

/** True when ms fields were populated from unchanged second-based timing only. */
export function isSceneMsBackfillOnly(prev: FootieScene, next: FootieScene): boolean {
  if (
    prev.start !== next.start ||
    prev.end !== next.end ||
    prev.duration !== next.duration ||
    prev.durationSource !== next.durationSource
  ) {
    return false;
  }

  const msChanged =
    prev.startMs !== next.startMs ||
    prev.endMs !== next.endMs ||
    prev.durationMs !== next.durationMs;

  if (!msChanged) {
    return false;
  }

  return (
    msValueMatchesSec(prev.startMs, next.start) &&
    msValueMatchesSec(next.startMs, next.start) &&
    msValueMatchesSec(prev.endMs, next.end) &&
    msValueMatchesSec(next.endMs, next.end) &&
    msValueMatchesSec(prev.durationMs, next.duration) &&
    msValueMatchesSec(next.durationMs, next.duration)
  );
}

export function isMsBackfillOnlyStoryPatch(prev: FootieScript, next: FootieScript): boolean {
  if (sceneOrderChanged(prev.scenes, next.scenes)) {
    return false;
  }

  const prevById = new Map(prev.scenes.map((scene) => [scene.id, scene]));
  let sawMsBackfill = false;

  for (const nextScene of next.scenes) {
    const prevScene = prevById.get(nextScene.id);
    if (!prevScene) {
      return false;
    }

    if (isSceneMsBackfillOnly(prevScene, nextScene)) {
      sawMsBackfill = true;
      continue;
    }

    if (sceneTimingChanged(prevScene, nextScene)) {
      return false;
    }
  }

  return sawMsBackfill;
}

function sceneTimingChanged(prev: FootieScene, next: FootieScene): boolean {
  if (isSceneMsBackfillOnly(prev, next)) {
    return false;
  }

  return (
    prev.start !== next.start ||
    prev.end !== next.end ||
    prev.duration !== next.duration ||
    prev.startMs !== next.startMs ||
    prev.endMs !== next.endMs ||
    prev.durationMs !== next.durationMs ||
    prev.durationSource !== next.durationSource
  );
}

function sceneVisualCaptionChanged(prev: FootieScene, next: FootieScene): boolean {
  return (
    prev.subtitle !== next.subtitle ||
    prev.captionMode !== next.captionMode ||
    prev.captionPreset !== next.captionPreset ||
    prev.subtitleEffect !== next.subtitleEffect
  );
}

function sceneSpokenTextChanged(prev: FootieScene, next: FootieScene): boolean {
  return isUserAuthoredSpokenTextChange(prev, next);
}

function sceneMediaChanged(prev: FootieScene, next: FootieScene): boolean {
  const prevImage = getSceneImage(prev);
  const nextImage = getSceneImage(next);
  const prevUrl = prevImage?.url ?? prev.uploadedImage ?? "";
  const nextUrl = nextImage?.url ?? next.uploadedImage ?? "";

  return (
    prevUrl !== nextUrl ||
    JSON.stringify(prev.assetAttachment ?? null) !== JSON.stringify(next.assetAttachment ?? null)
  );
}

function sceneMotionChanged(prev: FootieScene, next: FootieScene): boolean {
  const prevImage = getSceneImage(prev);
  const nextImage = getSceneImage(next);

  if (!prevImage && !nextImage) {
    return false;
  }

  if (!prevImage || !nextImage) {
    return false;
  }

  const prevMotion = normalizeSceneImageMotion(prevImage.imageMotion);
  const nextMotion = normalizeSceneImageMotion(nextImage.imageMotion);

  return (
    prevMotion.type !== nextMotion.type ||
    prevMotion.intensity !== nextMotion.intensity ||
    prevImage.scale !== nextImage.scale ||
    prevImage.x !== nextImage.x ||
    prevImage.y !== nextImage.y ||
    (prevImage.rotation ?? 0) !== (nextImage.rotation ?? 0) ||
    (prevImage.fitMode ?? "fit") !== (nextImage.fitMode ?? "fit")
  );
}

function transitionItemsSignature(items: TimelineItem[] | undefined): string {
  if (!items?.length) {
    return "";
  }

  return items
    .filter((item) => item.type === "transition")
    .map((item) =>
      item.type === "transition"
        ? `${item.id}:${item.fromSceneId}:${item.toSceneId}:${item.effect}:${item.durationMs}`
        : "",
    )
    .join("|");
}

function audioChanged(prev: FootieScript, next: FootieScript): boolean {
  return (
    prev.voiceoverUrl !== next.voiceoverUrl ||
    prev.voiceoverDurationMs !== next.voiceoverDurationMs ||
    prev.voiceoverNarration !== next.voiceoverNarration ||
    JSON.stringify(prev.voiceSettings ?? null) !== JSON.stringify(next.voiceSettings ?? null) ||
    JSON.stringify(prev.voiceoverVoiceSettings ?? null) !==
      JSON.stringify(next.voiceoverVoiceSettings ?? null) ||
    JSON.stringify(prev.audioMixer ?? null) !== JSON.stringify(next.audioMixer ?? null) ||
    JSON.stringify(prev.backgroundMusic ?? null) !== JSON.stringify(next.backgroundMusic ?? null)
  );
}

function audioAffectsTimelineAuthority(prev: FootieScript, next: FootieScript): boolean {
  return (
    prev.voiceoverUrl !== next.voiceoverUrl ||
    prev.voiceoverDurationMs !== next.voiceoverDurationMs
  );
}

function metadataChanged(prev: FootieScript, next: FootieScript): boolean {
  return prev.title !== next.title || prev.narration !== next.narration;
}

/**
 * Classifies a story update by comparing the previous and next scripts.
 * Used by the editor to choose lightweight vs structural update paths.
 */
export function classifyStoryPatch(
  prev: FootieScript,
  next: FootieScript,
): StoryPatchClassification {
  const classes = new Set<StoryPatchClass>();

  if (sceneOrderChanged(prev.scenes, next.scenes)) {
    classes.add("structural");
  }

  if (transitionItemsSignature(prev.timelineItems) !== transitionItemsSignature(next.timelineItems)) {
    classes.add("transition");
  }

  if (audioChanged(prev, next)) {
    classes.add("audio");
  }

  if (metadataChanged(prev, next)) {
    classes.add("metadata");
  }

  const prevById = new Map(prev.scenes.map((scene) => [scene.id, scene]));

  for (const nextScene of next.scenes) {
    const prevScene = prevById.get(nextScene.id);
    if (!prevScene) {
      classes.add("structural");
      continue;
    }

    if (prevScene.sceneType !== nextScene.sceneType) {
      classes.add("structural");
    }

    if (sceneTimingChanged(prevScene, nextScene)) {
      classes.add("timing");
    }

    if (sceneVisualCaptionChanged(prevScene, nextScene)) {
      classes.add("caption");
    }

    if (sceneSpokenTextChanged(prevScene, nextScene)) {
      classes.add("spoken_text");
    }

    if (sceneMediaChanged(prevScene, nextScene)) {
      classes.add("media");
    }

    if (sceneMotionChanged(prevScene, nextScene)) {
      classes.add("motion");
    }
  }

  if (classes.size === 0) {
    classes.add("metadata");
  }

  const list = PRIMARY_PRIORITY.filter((entry) => classes.has(entry));
  return {
    classes: list,
    primary: resolvePrimary(list),
  };
}

export function requiresImmediateTimelineRebuild(
  classification: StoryPatchClassification,
): boolean {
  return classification.classes.some((entry) => IMMEDIATE_TIMELINE_CLASSES.has(entry));
}

export function requiresDebouncedTimelineRebuild(
  classification: StoryPatchClassification,
): boolean {
  if (requiresImmediateTimelineRebuild(classification)) {
    return false;
  }

  return classification.classes.some((entry) => DEBOUNCED_TIMELINE_CLASSES.has(entry));
}

/** Narration metadata can affect excerpt-derived subtitle timing. */
export function requiresImmediateTimelineRebuildForMetadata(
  prev: FootieScript,
  next: FootieScript,
  classification: StoryPatchClassification,
): boolean {
  return classification.classes.includes("metadata") && prev.narration !== next.narration;
}

export function resolveTimelineRebuildPolicy(
  prev: FootieScript,
  next: FootieScript,
  classification: StoryPatchClassification,
): "immediate" | "debounced" | "none" {
  if (
    requiresImmediateTimelineRebuild(classification) ||
    requiresImmediateTimelineRebuildForMetadata(prev, next, classification)
  ) {
    return "immediate";
  }

  if (classification.classes.includes("audio") && audioAffectsTimelineAuthority(prev, next)) {
    return "immediate";
  }

  if (requiresDebouncedTimelineRebuild(classification)) {
    return "debounced";
  }

  return "none";
}

export function resolveStoryEvolutionDebounceMs(
  classification: StoryPatchClassification,
): number {
  if (classification.classes.some((entry) => IMMEDIATE_EVOLUTION_CLASSES.has(entry))) {
    return IMMEDIATE_STORY_EVOLUTION_DEBOUNCE_MS;
  }

  if (classification.classes.some((entry) => DEFERRED_EVOLUTION_CLASSES.has(entry))) {
    return DEFERRED_STORY_EVOLUTION_DEBOUNCE_MS;
  }

  return DEFERRED_STORY_EVOLUTION_DEBOUNCE_MS;
}
