/**
 * Verifies subtitle chunk splitting (run: npm run test:subtitle-chunks).
 */
import assert from "node:assert/strict";

import {
  isSubtitleChunkWithinLimits,
  splitSubtitleChunks,
  SUBTITLE_MAX_CHARS_PER_CHUNK,
  SUBTITLE_MAX_WORDS_PER_CHUNK,
} from "@/features/story/utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function assertChunkLimits(chunks: string[]) {
  for (const chunk of chunks) {
    assert.equal(chunk, chunk.trim());
    assert.ok(chunk.length > 0);
    assert.ok(
      isSubtitleChunkWithinLimits(chunk),
      `chunk out of limits: "${chunk}" (${wordCount(chunk)} words, ${chunk.length} chars)`,
    );
  }
}

console.log("subtitleChunks");

test("splits at punctuation like the palace example", () => {
  const text =
    "The palace was alive. Music echoing through marble halls as guests gathered for the annual ball.";
  const chunks = splitSubtitleChunks(text);

  assert.equal(chunks[0], "The palace was alive.");
  assert.ok(chunks.length >= 2);
  assertChunkLimits(chunks);
});

test("splits long sentences without punctuation into word chunks", () => {
  const text =
    "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen";
  const chunks = splitSubtitleChunks(text);

  assert.ok(chunks.length >= 3);
  assertChunkLimits(chunks);
  assert.ok(chunks.every((chunk) => wordCount(chunk) <= SUBTITLE_MAX_WORDS_PER_CHUNK));
});

test("respects max chars per chunk when words are short", () => {
  const text = "aa bb cc dd ee ff gg hh ii jj kk ll mm nn oo pp";
  const chunks = splitSubtitleChunks(text);

  assert.ok(chunks.length >= 2);
  assertChunkLimits(chunks);
  assert.ok(
    chunks.every(
      (chunk) =>
        wordCount(chunk) === 1 || chunk.length <= SUBTITLE_MAX_CHARS_PER_CHUNK,
    ),
  );
});

test("allows a single long word chunk when unavoidable", () => {
  const longWord = "supercalifragilisticexpialidociousness";
  const chunks = splitSubtitleChunks(longWord);

  assert.deepEqual(chunks, [longWord]);
  assert.ok(longWord.length > SUBTITLE_MAX_CHARS_PER_CHUNK);
  assert.ok(isSubtitleChunkWithinLimits(longWord));
});

test("returns empty array for blank input", () => {
  assert.deepEqual(splitSubtitleChunks(""), []);
  assert.deepEqual(splitSubtitleChunks("   "), []);
});

test("keeps short narration as a single chunk", () => {
  assert.deepEqual(splitSubtitleChunks("Short line here."), ["Short line here."]);
});

console.log("All subtitleChunks checks passed.");
