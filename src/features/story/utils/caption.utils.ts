import type { CaptionMode, FootieScene, SubtitleEffect } from "@/features/story/types";

import {
  getSubtitleDisplayChunk,
  getSubtitleDisplayChunks,
  getTimedSubtitleDisplayChunk,
} from "./subtitle.utils";
import { resolveActiveSubtitleTiming } from "./subtitle-timing.utils";

export const DEFAULT_CAPTION_MODE: CaptionMode = "generated";
export const DEFAULT_SUBTITLE_EFFECT: SubtitleEffect = "fade-up";

export const CAPTION_MODE_OPTIONS: { value: CaptionMode; label: string }[] = [
  { value: "generated", label: "Generated" },
  { value: "subtitles", label: "Subtitles" },
];

export const SUBTITLE_EFFECT_OPTIONS: { value: SubtitleEffect; label: string }[] = [
  { value: "fade-up", label: "Fade up" },
  { value: "typewriter", label: "Typewriter" },
  { value: "highlight", label: "Highlight" },
];

const CAPTION_MODES = new Set<CaptionMode>(CAPTION_MODE_OPTIONS.map((o) => o.value));
const SUBTITLE_EFFECTS = new Set<SubtitleEffect>(
  SUBTITLE_EFFECT_OPTIONS.map((o) => o.value),
);

export function isCaptionMode(value: string): value is CaptionMode {
  return CAPTION_MODES.has(value as CaptionMode);
}

export function isSubtitleEffect(value: string): value is SubtitleEffect {
  return SUBTITLE_EFFECTS.has(value as SubtitleEffect);
}

export function normalizeCaptionMode(value: unknown): CaptionMode {
  if (value == null || value === "") {
    return DEFAULT_CAPTION_MODE;
  }

  if (typeof value === "string" && isCaptionMode(value)) {
    return value;
  }

  return DEFAULT_CAPTION_MODE;
}

export function normalizeSubtitleEffect(value: unknown): SubtitleEffect {
  if (value == null || value === "") {
    return DEFAULT_SUBTITLE_EFFECT;
  }

  if (typeof value === "string" && isSubtitleEffect(value)) {
    return value;
  }

  return DEFAULT_SUBTITLE_EFFECT;
}

/** Applies default caption mode and subtitle effect to a scene (legacy-safe). */
export function normalizeSceneCaptionSettings(scene: FootieScene): FootieScene {
  return {
    ...scene,
    captionMode: normalizeCaptionMode(scene.captionMode),
    subtitleEffect: normalizeSubtitleEffect(scene.subtitleEffect),
  };
}

export function normalizeScenesCaptionSettings(scenes: FootieScene[]): FootieScene[] {
  return scenes.map(normalizeSceneCaptionSettings);
}

/**
 * Forces AI-generated story scenes to use generated captions with the default effect.
 * Ignores any captionMode/subtitleEffect the model may return.
 */
export function applyGeneratedStorySceneCaptions(scenes: FootieScene[]): FootieScene[] {
  return scenes.map((scene) => ({
    ...scene,
    captionMode: DEFAULT_CAPTION_MODE,
    subtitleEffect: DEFAULT_SUBTITLE_EFFECT,
  }));
}

export function getCaptionModeLabel(mode: CaptionMode): string {
  return CAPTION_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? "Generated";
}

export function getSubtitleEffectLabel(effect: SubtitleEffect): string {
  return SUBTITLE_EFFECT_OPTIONS.find((option) => option.value === effect)?.label ?? "Fade up";
}

const PLACEHOLDER_CAPTION = "Add subtitle...";

/** User-facing transition connector copy — must never appear in preview/export video. */
const TRANSITION_CONNECTOR_COPY = "Transition to next scene";

/** True when text is transition connector copy — must never appear in preview/export video. */
export function isTransitionVideoContent(text: string | undefined): boolean {
  const normalized = text?.trim() ?? "";
  if (!normalized) {
    return false;
  }

  return (
    normalized === TRANSITION_CONNECTOR_COPY ||
    normalized.toLowerCase() === TRANSITION_CONNECTOR_COPY.toLowerCase()
  );
}

/** Returns display caption with transition connector copy removed for preview/export renderers. */
export function getPreviewDisplayCaption(scene: DisplayCaptionScene): string {
  const caption = getDisplayCaption(scene);
  return isTransitionVideoContent(caption) ? "" : caption;
}

export type DisplayCaptionScene = Pick<
  FootieScene,
  | "captionMode"
  | "subtitle"
  | "narration"
  | "subtitleText"
  | "subtitleEffect"
  | "captionPreset"
  | "captionLayout"
> & {
  /** Generated on-screen caption (alias for `subtitle` when present). */
  caption?: string;
};

function normalizeCaptionText(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === PLACEHOLDER_CAPTION) {
    return "";
  }
  return trimmed;
}

function getGeneratedCaption(scene: DisplayCaptionScene): string {
  return normalizeCaptionText(scene.caption ?? scene.subtitle);
}

export interface DisplayCaptionTiming {
  sceneElapsedMs: number;
  sceneDurationMs: number;
}

function resolveSubtitlesChunk(
  scene: DisplayCaptionScene,
  timing?: DisplayCaptionTiming,
): string {
  if (timing) {
    return getTimedSubtitleDisplayChunk(
      scene,
      timing.sceneElapsedMs,
      timing.sceneDurationMs,
    );
  }

  return getSubtitleDisplayChunk(scene);
}

/**
 * Returns the caption text that should be shown for a scene.
 * - `subtitles` mode → first readable chunk from `subtitleText || narration`
 * - otherwise → generated scene caption (`caption` or legacy `subtitle`)
 */
export function getDisplayCaption(scene: DisplayCaptionScene): string {
  if (normalizeCaptionMode(scene.captionMode) === "subtitles") {
    return getSubtitleDisplayChunk(scene);
  }
  return getGeneratedCaption(scene);
}

/**
 * Splits long caption/narration text into short readable lines (deterministic).
 * Words are grouped by `maxWordsPerLine`; whitespace is normalized between words.
 */
export function splitCaptionIntoLines(text: string, maxWordsPerLine = 6): string[] {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return [];
  }

  const wordsPerLine = Math.max(1, Math.floor(maxWordsPerLine));
  const words = normalized.split(" ");
  const lines: string[] = [];

  for (let index = 0; index < words.length; index += wordsPerLine) {
    lines.push(words.slice(index, index + wordsPerLine).join(" "));
  }

  return lines;
}

/** Convenience: display caption split into readable lines for rendering. */
export function getDisplayCaptionLines(
  scene: DisplayCaptionScene,
  maxWordsPerLine = 6,
  timing?: DisplayCaptionTiming,
): string[] {
  if (normalizeCaptionMode(scene.captionMode) === "subtitles") {
    const chunk = resolveSubtitlesChunk(scene, timing);
    return splitCaptionIntoLines(chunk, maxWordsPerLine);
  }

  return splitCaptionIntoLines(getGeneratedCaption(scene), maxWordsPerLine);
}

type ExportCaptionScene = DisplayCaptionScene & {
  subtitleChunks?: string[];
};

/**
 * Resolves on-screen caption lines for export at a specific frame time.
 * Subtitles mode renders one timed chunk from `subtitleChunks`; generated mode is unchanged.
 */
export function getExportSceneCaptionLines(
  scene: ExportCaptionScene,
  timing: DisplayCaptionTiming,
  maxWordsPerLine = 6,
): string[] {
  if (normalizeCaptionMode(scene.captionMode) === "subtitles") {
    const chunks =
      scene.subtitleChunks && scene.subtitleChunks.length > 0
        ? scene.subtitleChunks
        : getSubtitleDisplayChunks(scene);
    const activeChunk = resolveActiveSubtitleTiming(chunks, timing).activeChunk;

    return splitCaptionIntoLines(activeChunk, maxWordsPerLine);
  }

  return splitCaptionIntoLines(getGeneratedCaption(scene), maxWordsPerLine);
}

/**
 * Splits full story narration into equal word segments — one per scene.
 * Deterministic — no AI. Remainder words go to the earliest scenes.
 */
export function splitNarrationEvenlyBySceneCount(
  fullNarration: string,
  sceneCount: number,
): string[] {
  const words = fullNarration.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);

  if (sceneCount <= 0) {
    return [];
  }

  if (words.length === 0) {
    return Array.from({ length: sceneCount }, () => "");
  }

  if (sceneCount === 1) {
    return [words.join(" ")];
  }

  const baseCount = Math.floor(words.length / sceneCount);
  const remainder = words.length - baseCount * sceneCount;
  const wordCounts = Array.from({ length: sceneCount }, (_, index) =>
    baseCount + (index < remainder ? 1 : 0),
  );

  const segments: string[] = [];
  let wordIndex = 0;

  for (const count of wordCounts) {
    segments.push(words.slice(wordIndex, wordIndex + count).join(" "));
    wordIndex += count;
  }

  return segments;
}

/** Attaches script narration segments to scenes (even split, no AI). */
export function attachSceneNarrationFromScript(
  scenes: FootieScene[],
  fullNarration: string,
): FootieScene[] {
  const segments = splitNarrationEvenlyBySceneCount(fullNarration, scenes.length);

  return scenes.map((scene, index) => ({
    ...scene,
    narration: segments[index] ?? "",
  }));
}

/** Returns the voiceover excerpt for a scene when present (script segment, not AI caption). */
export function getSceneVoiceoverExcerpt(scene: FootieScene): string {
  return scene.narration?.trim() ?? "";
}

/**
 * Splits full story narration into per-scene excerpts proportional to scene duration.
 * Deterministic — no AI.
 */
export function deriveSceneNarrationExcerpts(
  fullNarration: string,
  scenes: FootieScene[],
): string[] {
  const words = fullNarration.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (words.length === 0 || scenes.length === 0) {
    return scenes.map(() => "");
  }

  if (scenes.length === 1) {
    return [words.join(" ")];
  }

  const weights = scenes.map((scene) => Math.max(1, scene.duration));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const excerpts: string[] = [];
  let wordIndex = 0;

  for (let index = 0; index < scenes.length; index++) {
    if (index === scenes.length - 1) {
      excerpts.push(words.slice(wordIndex).join(" "));
      break;
    }

    const remainingScenes = scenes.length - index - 1;
    const remainingWords = words.length - wordIndex;
    const proportion = weights[index] / totalWeight;
    const idealCount = Math.max(1, Math.round(words.length * proportion));
    const maxCount = Math.max(1, remainingWords - remainingScenes);
    const count = Math.min(idealCount, maxCount);

    excerpts.push(words.slice(wordIndex, wordIndex + count).join(" "));
    wordIndex += count;
  }

  return excerpts;
}

export function deriveSceneNarrationExcerpt(
  fullNarration: string,
  sceneIndex: number,
  scenes: FootieScene[],
): string {
  return deriveSceneNarrationExcerpts(fullNarration, scenes)[sceneIndex] ?? "";
}

/**
 * Whether per-scene narration excerpts should be re-derived from story narration.
 * Skips re-sync for visual-only edits such as `subtitleEffect`.
 */
export function scenesNeedNarrationExcerptSync(
  previousScenes: FootieScene[],
  nextScenes: FootieScene[],
  fullNarration: string,
  previousFullNarration?: string,
): boolean {
  if (previousFullNarration !== undefined && previousFullNarration !== fullNarration) {
    return true;
  }

  if (previousScenes.length !== nextScenes.length) {
    return true;
  }

  for (let index = 0; index < nextScenes.length; index++) {
    const previous = previousScenes[index];
    const next = nextScenes[index];

    if (!previous || previous.id !== next.id) {
      return true;
    }

    if (normalizeCaptionMode(previous.captionMode) !== normalizeCaptionMode(next.captionMode)) {
      return true;
    }

    if (previous.duration !== next.duration) {
      return true;
    }

    if (
      normalizeCaptionMode(next.captionMode) === "subtitles" &&
      previous.narration !== next.narration
    ) {
      return true;
    }
  }

  return false;
}

/**
 * When switching to subtitles mode, seeds `subtitleText` from the scene narration excerpt
 * if the user has not set subtitle copy yet.
 */
export function mergeSubtitleTextOnSubtitlesModeSwitch(
  scene: FootieScene,
  updates: Partial<FootieScene>,
): Partial<FootieScene> {
  if (normalizeCaptionMode(updates.captionMode) !== "subtitles") {
    return updates;
  }

  if (normalizeCaptionMode(scene.captionMode) === "subtitles") {
    return updates;
  }

  if ((updates.subtitleText ?? scene.subtitleText)?.trim()) {
    return updates;
  }

  return { ...updates, subtitleText: scene.narration?.trim() ?? "" };
}

function normalizeSpokenText(value: string | undefined): string {
  return value?.trim() ?? "";
}

/**
 * True when subtitleText was auto-seeded from scene narration during a switch
 * into subtitles mode — not user-authored spoken copy.
 */
export function isAutoSeededSubtitleTextOnModeSwitch(
  prev: FootieScene,
  next: FootieScene,
): boolean {
  const prevMode = normalizeCaptionMode(prev.captionMode);
  const nextMode = normalizeCaptionMode(next.captionMode);

  if (prevMode === "subtitles" || nextMode !== "subtitles") {
    return false;
  }

  const prevText = normalizeSpokenText(prev.subtitleText);
  if (prevText) {
    return false;
  }

  const nextText = normalizeSpokenText(next.subtitleText);
  const narrationText = normalizeSpokenText(prev.narration);
  return nextText === narrationText;
}

/**
 * True when the only scene-level edits are caption display mode (and optional
 * auto-seeded subtitleText or narration excerpt sync when entering subtitles).
 */
export function isCaptionModeSwitchOnly(prev: FootieScene, next: FootieScene): boolean {
  const prevMode = normalizeCaptionMode(prev.captionMode);
  const nextMode = normalizeCaptionMode(next.captionMode);

  if (prevMode === nextMode) {
    return false;
  }

  if (
    prev.subtitle !== next.subtitle ||
    prev.captionPreset !== next.captionPreset ||
    prev.subtitleEffect !== next.subtitleEffect ||
    prev.sceneType !== next.sceneType
  ) {
    return false;
  }

  if (
    prev.subtitleText !== next.subtitleText &&
    !isAutoSeededSubtitleTextOnModeSwitch(prev, next)
  ) {
    return false;
  }

  if (prev.narration !== next.narration) {
    const enteringSubtitles = prevMode !== "subtitles" && nextMode === "subtitles";
    if (!enteringSubtitles) {
      return false;
    }
  }

  return true;
}

/**
 * Builds a caption-mode switch patch, seeding subtitleText from the narration excerpt
 * when entering subtitles mode without existing narrated copy.
 */
export function buildCaptionModeSwitchPatch(
  scene: FootieScene,
  mode: CaptionMode,
): Partial<FootieScene> {
  return mergeSubtitleTextOnSubtitlesModeSwitch(scene, { captionMode: mode });
}

/**
 * True when `subtitleText` changed because the user edited spoken copy,
 * not because caption mode switched or sync seeded from `scene.narration`.
 */
export function isUserAuthoredSpokenTextChange(
  prev: FootieScene,
  next: FootieScene,
): boolean {
  if (prev.subtitleText === next.subtitleText) {
    return false;
  }

  const prevMode = normalizeCaptionMode(prev.captionMode);
  const nextMode = normalizeCaptionMode(next.captionMode);
  const prevText = normalizeSpokenText(prev.subtitleText);
  const nextText = normalizeSpokenText(next.subtitleText);

  if (prevMode !== nextMode) {
    if (prevMode === "subtitles" && nextMode !== "subtitles") {
      return false;
    }

    if (isAutoSeededSubtitleTextOnModeSwitch(prev, next)) {
      return false;
    }

    if (prevText === nextText) {
      return false;
    }
  }

  if (isAutoSeededSubtitleTextOnModeSwitch(prev, next)) {
    return false;
  }

  return true;
}

/**
 * After narration excerpts sync, fills `subtitleText` for scenes that just switched
 * to subtitles mode when the initial seed was still empty.
 */
export function finalizeSubtitleTextAfterModeSwitch(
  previousScenes: FootieScene[],
  nextScenes: FootieScene[],
): FootieScene[] {
  return nextScenes.map((scene, index) => {
    const previous = previousScenes[index];
    if (!previous || previous.id !== scene.id) {
      return scene;
    }

    if (normalizeCaptionMode(previous.captionMode) === "subtitles") {
      return scene;
    }

    if (normalizeCaptionMode(scene.captionMode) !== "subtitles") {
      return scene;
    }

    if (scene.subtitleText?.trim()) {
      return scene;
    }

    const fromNarration = scene.narration?.trim();
    return fromNarration ? { ...scene, subtitleText: fromNarration } : scene;
  });
}

/**
 * Keeps per-scene `narration` excerpts in sync for scenes in subtitles mode.
 * Deterministic — no AI.
 */
export function syncScenesSubtitlesNarration(
  scenes: FootieScene[],
  fullNarration: string,
): FootieScene[] {
  const hasSubtitlesScenes = scenes.some(
    (scene) => normalizeCaptionMode(scene.captionMode) === "subtitles",
  );

  if (!hasSubtitlesScenes) {
    return scenes;
  }

  const excerpts = deriveSceneNarrationExcerpts(fullNarration, scenes);

  return scenes.map((scene, index) =>
    normalizeCaptionMode(scene.captionMode) === "subtitles"
      ? { ...scene, narration: excerpts[index] ?? "" }
      : scene,
  );
}