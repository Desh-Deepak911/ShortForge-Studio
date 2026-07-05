import type { FootieScene } from "@/features/story/types";

export const SUBTITLE_MAX_WORDS_PER_CHUNK = 5;
export const SUBTITLE_MAX_CHARS_PER_CHUNK = 34;
/** Max on-screen rows for one subtitle chunk (preview + export). */
export const SUBTITLE_MAX_VISIBLE_LINES = 3;
/** Conservative wrap width estimate used when splitting overflow chunks. */
export const SUBTITLE_ESTIMATED_CHARS_PER_LINE = 16;
export const SUBTITLE_MAX_WIDTH_RATIO = 0.9;

function normalizeSubtitleText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function countWords(text: string): number {
  const normalized = normalizeSubtitleText(text);
  if (!normalized) {
    return 0;
  }

  return normalized.split(" ").length;
}

function isSingleWord(text: string): boolean {
  return countWords(text) <= 1;
}

/** True when a chunk is within subtitle limits (single words are always allowed). */
export function isSubtitleChunkWithinLimits(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  if (isSingleWord(trimmed)) {
    return true;
  }

  return (
    countWords(trimmed) <= SUBTITLE_MAX_WORDS_PER_CHUNK &&
    trimmed.length <= SUBTITLE_MAX_CHARS_PER_CHUNK
  );
}

/** Splits text into phrase segments, preferring punctuation boundaries. */
function splitAtPunctuation(text: string): string[] {
  const words = text.split(" ").filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const segments: string[] = [];
  let buffer: string[] = [];

  for (const word of words) {
    buffer.push(word);
    if (/[.!?,:;…]$/.test(word)) {
      segments.push(buffer.join(" "));
      buffer = [];
    }
  }

  if (buffer.length > 0) {
    segments.push(buffer.join(" "));
  }

  return segments;
}

/** Splits a phrase into word groups that respect max words/chars per chunk. */
function splitByWords(text: string): string[] {
  const words = normalizeSubtitleText(text).split(" ").filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let currentWords: string[] = [];

  const flush = () => {
    if (currentWords.length === 0) {
      return;
    }
    chunks.push(currentWords.join(" "));
    currentWords = [];
  };

  for (const word of words) {
    if (currentWords.length === 0) {
      if (isSingleWord(word) && word.length > SUBTITLE_MAX_CHARS_PER_CHUNK) {
        chunks.push(word);
        continue;
      }
      currentWords = [word];
      continue;
    }

    const candidate = [...currentWords, word].join(" ");
    if (isSubtitleChunkWithinLimits(candidate)) {
      currentWords.push(word);
      continue;
    }

    flush();

    if (isSingleWord(word) && word.length > SUBTITLE_MAX_CHARS_PER_CHUNK) {
      chunks.push(word);
    } else {
      currentWords = [word];
    }
  }

  flush();
  return chunks;
}

function estimateVisibleLineCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  return Math.max(1, Math.ceil(trimmed.length / SUBTITLE_ESTIMATED_CHARS_PER_LINE));
}

/** Splits a chunk further when it would exceed the visible line cap. */
function splitChunkForVisibleLineCap(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  if (estimateVisibleLineCount(trimmed) <= SUBTITLE_MAX_VISIBLE_LINES) {
    return [trimmed];
  }

  const maxChars =
    SUBTITLE_ESTIMATED_CHARS_PER_LINE * SUBTITLE_MAX_VISIBLE_LINES;
  const words = trimmed.split(" ").filter(Boolean);
  const chunks: string[] = [];
  let currentWords: string[] = [];

  const flush = () => {
    if (currentWords.length > 0) {
      chunks.push(currentWords.join(" "));
      currentWords = [];
    }
  };

  for (const word of words) {
    const candidate = currentWords.length ? [...currentWords, word].join(" ") : word;

    if (
      currentWords.length > 0 &&
      (candidate.length > maxChars ||
        estimateVisibleLineCount(candidate) > SUBTITLE_MAX_VISIBLE_LINES)
    ) {
      flush();
      if (isSingleWord(word)) {
        chunks.push(word);
        continue;
      }
      currentWords = [word];
      continue;
    }

    if (currentWords.length === 0) {
      currentWords = [word];
      continue;
    }

    currentWords.push(word);
  }

  flush();
  return chunks.flatMap((chunk) =>
    estimateVisibleLineCount(chunk) > SUBTITLE_MAX_VISIBLE_LINES
      ? splitByWords(chunk)
      : [chunk],
  );
}

function finalizeChunks(chunks: string[]): string[] {
  return chunks
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .flatMap((chunk) => (isSubtitleChunkWithinLimits(chunk) ? [chunk] : splitByWords(chunk)))
    .flatMap((chunk) => splitChunkForVisibleLineCap(chunk));
}

/**
 * Splits narration into readable subtitle chunks (deterministic, no AI).
 * Prefers punctuation boundaries, then word splits, capped at 5 words / 34 chars.
 */
export function splitSubtitleChunks(text: string): string[] {
  const normalized = normalizeSubtitleText(text);
  if (!normalized) {
    return [];
  }

  const phrases = splitAtPunctuation(normalized);
  const chunks: string[] = [];

  for (const phrase of phrases) {
    const trimmed = phrase.trim();
    if (!trimmed) {
      continue;
    }

    if (isSubtitleChunkWithinLimits(trimmed)) {
      chunks.push(trimmed);
      continue;
    }

    chunks.push(...splitByWords(trimmed));
  }

  return finalizeChunks(chunks);
}

/** Duration of one subtitle chunk — derived from scene duration, never stored. */
export function getSubtitleChunkDurationMs(
  sceneDurationMs: number,
  chunkCount: number,
): number {
  return Math.max(1, sceneDurationMs / Math.max(1, chunkCount));
}

/**
 * Returns the subtitle chunk that should be visible at a point within a scene.
 * Divides scene duration equally across precomputed chunks (deterministic, no AI).
 */
export function getActiveSubtitleChunkFromList(
  chunks: string[],
  sceneElapsedMs: number,
  sceneDurationMs: number,
): string {
  if (chunks.length === 0) {
    return "";
  }

  const durationMs = Math.max(1, sceneDurationMs);
  const elapsedMs = Math.max(0, sceneElapsedMs);
  const chunkDurationMs = getSubtitleChunkDurationMs(durationMs, chunks.length);
  const rawIndex = Math.floor(elapsedMs / chunkDurationMs);
  const index = Math.min(chunks.length - 1, Math.max(0, rawIndex));

  return chunks[index] ?? "";
}

/**
 * Returns the subtitle chunk that should be visible at a point within a scene.
 * Divides scene duration equally across chunks (deterministic, no AI).
 */
export function getActiveSubtitleChunk(
  text: string,
  sceneElapsedMs: number,
  sceneDurationMs: number,
): string {
  return getActiveSubtitleChunkFromList(
    splitSubtitleChunks(text),
    sceneElapsedMs,
    sceneDurationMs,
  );
}

/** Active chunk plus progress (0–1) within its time window. */
export function getActiveSubtitleChunkStateFromList(
  chunks: string[],
  sceneElapsedMs: number,
  sceneDurationMs: number,
): { chunk: string; progress: number; chunkElapsedMs: number } {
  const chunk = getActiveSubtitleChunkFromList(chunks, sceneElapsedMs, sceneDurationMs);

  if (chunks.length === 0) {
    return { chunk: "", progress: 0, chunkElapsedMs: 0 };
  }

  const durationMs = Math.max(1, sceneDurationMs);
  const elapsedMs = Math.max(0, sceneElapsedMs);
  const chunkDurationMs = getSubtitleChunkDurationMs(durationMs, chunks.length);
  const rawIndex = Math.floor(elapsedMs / chunkDurationMs);
  const index = Math.min(chunks.length - 1, Math.max(0, rawIndex));
  const chunkStartMs = index * chunkDurationMs;
  const chunkElapsedMs = Math.max(0, elapsedMs - chunkStartMs);
  const progress = Math.min(1, Math.max(0, chunkElapsedMs / chunkDurationMs));

  return { chunk, progress, chunkElapsedMs };
}

/** Active chunk plus progress (0–1) within its time window. */
export function getActiveSubtitleChunkState(
  text: string,
  sceneElapsedMs: number,
  sceneDurationMs: number,
): { chunk: string; progress: number } {
  const state = getActiveSubtitleChunkStateFromList(
    splitSubtitleChunks(text),
    sceneElapsedMs,
    sceneDurationMs,
  );

  return { chunk: state.chunk, progress: state.progress };
}

type SubtitleCaptionScene = Pick<
  FootieScene,
  "captionMode" | "subtitle" | "narration" | "subtitleText" | "subtitleEffect"
> & {
  /** Generated on-screen caption (alias for `subtitle` when present). */
  caption?: string;
};

const PLACEHOLDER_CAPTION = "Add subtitle...";

function normalizeCaptionText(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === PLACEHOLDER_CAPTION) {
    return "";
  }
  return trimmed;
}

function getSubtitlesSourceText(scene: SubtitleCaptionScene): string {
  return normalizeCaptionText(
    scene.subtitleText || scene.narration || scene.caption || scene.subtitle,
  );
}

/** Full editable subtitle source — never uses generated caption fields. */
export function getSubtitlesCaptionSource(scene: SubtitleCaptionScene): string {
  return getSubtitlesSourceText(scene);
}

/** Deterministic subtitle chunks from the subtitles-mode source text. */
export function getSubtitleDisplayChunks(scene: SubtitleCaptionScene): string[] {
  return splitSubtitleChunks(getSubtitlesSourceText(scene));
}

/** Visible subtitle chunk for preview/export (first chunk when timing is omitted). */
export function getSubtitleDisplayChunk(scene: SubtitleCaptionScene, chunkIndex = 0): string {
  return getSubtitleDisplayChunks(scene)[chunkIndex] ?? "";
}

/** Subtitle chunk visible at a point within the scene (preview timing). */
export function getTimedSubtitleDisplayChunk(
  scene: SubtitleCaptionScene,
  sceneElapsedMs: number,
  sceneDurationMs: number,
): string {
  return getActiveSubtitleChunk(
    getSubtitlesSourceText(scene),
    sceneElapsedMs,
    sceneDurationMs,
  );
}
