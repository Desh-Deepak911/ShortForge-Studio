/**
 * Tighter subtitle chunk splitting for word-weighted timing only.
 * Does not affect written captions or the equal timing strategy.
 */
export const SUBTITLE_TIMING_MAX_WORDS_PER_CHUNK = 4;
export const SUBTITLE_TIMING_MAX_CHARS_PER_CHUNK = 28;

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

function isTimingChunkWithinLimits(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  if (isSingleWord(trimmed)) {
    return true;
  }

  return (
    countWords(trimmed) <= SUBTITLE_TIMING_MAX_WORDS_PER_CHUNK &&
    trimmed.length <= SUBTITLE_TIMING_MAX_CHARS_PER_CHUNK
  );
}

/** Phrase-first split — punctuation, em dashes, then word groups. */
function splitAtPhraseBoundaries(text: string): string[] {
  const words = text.split(" ").filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const segments: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length > 0) {
      segments.push(buffer.join(" "));
      buffer = [];
    }
  };

  for (const word of words) {
    buffer.push(word);

    if (/[.!?…]$/.test(word)) {
      flush();
      continue;
    }

    if (/[,;:]$/.test(word) && buffer.length >= 2) {
      flush();
      continue;
    }

    if ((word === "—" || word === "-" || /^[-—]$/.test(word)) && buffer.length >= 2) {
      flush();
    }
  }

  flush();
  return segments;
}

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
      if (isSingleWord(word) && word.length > SUBTITLE_TIMING_MAX_CHARS_PER_CHUNK) {
        chunks.push(word);
        continue;
      }
      currentWords = [word];
      continue;
    }

    const candidate = [...currentWords, word].join(" ");
    if (isTimingChunkWithinLimits(candidate)) {
      currentWords.push(word);
      continue;
    }

    flush();

    if (isSingleWord(word) && word.length > SUBTITLE_TIMING_MAX_CHARS_PER_CHUNK) {
      chunks.push(word);
    } else {
      currentWords = [word];
    }
  }

  flush();
  return chunks;
}

function finalizeTimingChunks(chunks: string[]): string[] {
  return chunks
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .flatMap((chunk) => (isTimingChunkWithinLimits(chunk) ? [chunk] : splitByWords(chunk)));
}

/**
 * Splits narrated subtitle copy into shorter, phrase-aware chunks for word-weighted timing.
 */
export function splitSubtitleChunksForWordWeightedTiming(text: string): string[] {
  const normalized = normalizeSubtitleText(text);
  if (!normalized) {
    return [];
  }

  const phrases = splitAtPhraseBoundaries(normalized);
  const chunks: string[] = [];

  for (const phrase of phrases) {
    const trimmed = phrase.trim();
    if (!trimmed) {
      continue;
    }

    if (isTimingChunkWithinLimits(trimmed)) {
      chunks.push(trimmed);
      continue;
    }

    chunks.push(...splitByWords(trimmed));
  }

  return finalizeTimingChunks(chunks);
}
