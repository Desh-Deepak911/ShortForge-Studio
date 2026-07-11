import type { FootieScene, FootieScript, TimelineItem } from "@/features/story/types";
import {
  isCaptionModeSwitchOnly,
  isUserAuthoredSpokenTextChange,
} from "@/features/story/utils/caption.utils";
import {
  getSceneImage,
  getSceneMedia,
  getSceneMediaType,
  getSceneMediaUrl,
  normalizeSceneImageMotion,
} from "@/features/story/utils/scene.utils";
import {
  resolveSceneMediaMotionFromMedia,
  serializeSceneMediaMotionFingerprint,
} from "@/features/media-motion";

/** Coarse edit classes for editor update policy. */
export type StoryPatchClass =
  | "structural"
  | "timing"
  | "spoken_text"
  | "caption"
  | "caption_layout"
  | "caption_style"
  | "caption_animation"
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
  "caption_layout",
  "caption_style",
  "caption_animation",
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
  "caption_layout",
  "caption_style",
  "caption_animation",
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

function sceneUnchangedExceptMsBackfill(prev: FootieScene, next: FootieScene): boolean {
  if (isSceneMsBackfillOnly(prev, next)) {
    return true;
  }

  return (
    prev.captionMode === next.captionMode &&
    prev.subtitle === next.subtitle &&
    prev.subtitleText === next.subtitleText &&
    prev.narration === next.narration &&
    prev.captionPreset === next.captionPreset &&
    prev.subtitleEffect === next.subtitleEffect &&
    prev.sceneType === next.sceneType &&
    prev.start === next.start &&
    prev.end === next.end &&
    prev.duration === next.duration &&
    prev.startMs === next.startMs &&
    prev.endMs === next.endMs &&
    prev.durationMs === next.durationMs &&
    prev.durationSource === next.durationSource &&
    !sceneMediaChanged(prev, next) &&
    !sceneMotionChanged(prev, next)
  );
}

/** True when the story diff is a single caption display mode switch (plus ms backfill). */
export function isCaptionModeSwitchStoryPatch(prev: FootieScript, next: FootieScript): boolean {
  if (sceneOrderChanged(prev.scenes, next.scenes)) {
    return false;
  }

  if (prev.title !== next.title || prev.narration !== next.narration) {
    return false;
  }

  if (
    prev.voiceoverUrl !== next.voiceoverUrl ||
    prev.voiceoverDurationMs !== next.voiceoverDurationMs
  ) {
    return false;
  }

  const prevById = new Map(prev.scenes.map((scene) => [scene.id, scene]));
  let switchCount = 0;

  for (const nextScene of next.scenes) {
    const prevScene = prevById.get(nextScene.id);
    if (!prevScene) {
      return false;
    }

    if (isCaptionModeSwitchOnly(prevScene, nextScene)) {
      if (sceneTimingChanged(prevScene, nextScene) && !isSceneMsBackfillOnly(prevScene, nextScene)) {
        return false;
      }

      if (sceneMediaChanged(prevScene, nextScene) || sceneMotionChanged(prevScene, nextScene)) {
        return false;
      }

      switchCount += 1;
      continue;
    }

    if (!sceneUnchangedExceptMsBackfill(prevScene, nextScene)) {
      return false;
    }
  }

  return switchCount === 1;
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

function sceneCaptionLayoutChanged(prev: FootieScene, next: FootieScene): boolean {
  return JSON.stringify(prev.captionLayout ?? null) !== JSON.stringify(next.captionLayout ?? null);
}

function scriptCaptionLayoutChanged(prev: FootieScript, next: FootieScript): boolean {
  return (
    JSON.stringify(prev.defaultCaptionLayout ?? null) !==
    JSON.stringify(next.defaultCaptionLayout ?? null)
  );
}

function sceneCaptionStyleChanged(prev: FootieScene, next: FootieScene): boolean {
  return JSON.stringify(prev.captionStyle ?? null) !== JSON.stringify(next.captionStyle ?? null);
}

function scriptCaptionStyleChanged(prev: FootieScript, next: FootieScript): boolean {
  return (
    JSON.stringify(prev.defaultCaptionStyle ?? null) !==
    JSON.stringify(next.defaultCaptionStyle ?? null)
  );
}

function sceneCaptionAnimationChanged(prev: FootieScene, next: FootieScene): boolean {
  return (
    JSON.stringify(prev.captionAnimation ?? null) !== JSON.stringify(next.captionAnimation ?? null)
  );
}

function scriptCaptionAnimationChanged(prev: FootieScript, next: FootieScript): boolean {
  return (
    JSON.stringify(prev.defaultCaptionAnimation ?? null) !==
    JSON.stringify(next.defaultCaptionAnimation ?? null)
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

function sceneMediaPosterSignature(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
): string {
  const media = getSceneMedia(scene);
  if (!media) {
    return "";
  }

  const posterTimeMs =
    typeof media.posterTimeMs === "number" && Number.isFinite(media.posterTimeMs)
      ? Math.round(media.posterTimeMs)
      : "";
  const posterUrl = typeof media.posterUrl === "string" ? media.posterUrl.trim() : "";

  return `${posterTimeMs}|${posterUrl}`;
}

function sceneMediaTrimSignature(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
): string {
  const media = getSceneMedia(scene);
  if (!media || media.type !== "video") {
    return "";
  }

  const trimStartMs =
    typeof media.trimStartMs === "number" && Number.isFinite(media.trimStartMs)
      ? Math.round(media.trimStartMs)
      : "";
  const trimEndMs =
    typeof media.trimEndMs === "number" && Number.isFinite(media.trimEndMs)
      ? Math.round(media.trimEndMs)
      : "";

  return `${trimStartMs}|${trimEndMs}`;
}

function sceneMediaChanged(prev: FootieScene, next: FootieScene): boolean {
  const prevImage = getSceneImage(prev);
  const nextImage = getSceneImage(next);
  const prevUrl = prevImage?.url ?? prev.uploadedImage ?? "";
  const nextUrl = nextImage?.url ?? next.uploadedImage ?? "";
  const prevMediaUrl = getSceneMediaUrl(prev) ?? "";
  const nextMediaUrl = getSceneMediaUrl(next) ?? "";
  const prevMediaType = getSceneMediaType(prev) ?? "";
  const nextMediaType = getSceneMediaType(next) ?? "";

  return (
    prevUrl !== nextUrl ||
    prevMediaUrl !== nextMediaUrl ||
    prevMediaType !== nextMediaType ||
    sceneMediaPosterSignature(prev) !== sceneMediaPosterSignature(next) ||
    sceneMediaTrimSignature(prev) !== sceneMediaTrimSignature(next) ||
    JSON.stringify(prev.assetAttachment ?? null) !== JSON.stringify(next.assetAttachment ?? null)
  );
}

function sceneMotionChanged(prev: FootieScene, next: FootieScene): boolean {
  const prevImage = getSceneImage(prev);
  const nextImage = getSceneImage(next);

  if (prevImage && nextImage) {
    const prevMotion = normalizeSceneImageMotion(prevImage.imageMotion);
    const nextMotion = normalizeSceneImageMotion(nextImage.imageMotion);

    if (
      prevMotion.type !== nextMotion.type ||
      prevMotion.intensity !== nextMotion.intensity ||
      prevImage.scale !== nextImage.scale ||
      prevImage.x !== nextImage.x ||
      prevImage.y !== nextImage.y ||
      (prevImage.rotation ?? 0) !== (nextImage.rotation ?? 0) ||
      (prevImage.fitMode ?? "fit") !== (nextImage.fitMode ?? "fit")
    ) {
      return true;
    }
  } else if (Boolean(prevImage) !== Boolean(nextImage)) {
    // Image slot appearance alone is media, not motion — fall through to media.motion check.
  }

  const prevMedia = getSceneMedia(prev);
  const nextMedia = getSceneMedia(next);
  const prevResolved = serializeSceneMediaMotionFingerprint(
    resolveSceneMediaMotionFromMedia(prevMedia),
  );
  const nextResolved = serializeSceneMediaMotionFingerprint(
    resolveSceneMediaMotionFromMedia(nextMedia),
  );

  return prevResolved !== nextResolved;
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
  if (isCaptionModeSwitchStoryPatch(prev, next)) {
    return { classes: ["caption"], primary: "caption" };
  }

  const classes = new Set<StoryPatchClass>();

  if (sceneOrderChanged(prev.scenes, next.scenes)) {
    classes.add("structural");
  }

  if (scriptCaptionLayoutChanged(prev, next)) {
    classes.add("caption_layout");
  }

  if (scriptCaptionStyleChanged(prev, next)) {
    classes.add("caption_style");
  }

  if (scriptCaptionAnimationChanged(prev, next)) {
    classes.add("caption_animation");
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

    if (sceneCaptionLayoutChanged(prevScene, nextScene)) {
      classes.add("caption_layout");
    }

    if (sceneCaptionStyleChanged(prevScene, nextScene)) {
      classes.add("caption_style");
    }

    if (sceneCaptionAnimationChanged(prevScene, nextScene)) {
      classes.add("caption_animation");
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
