/**
 * Subtitle timing verification (run: npm run test:subtitle-timing).
 */
import assert from "node:assert/strict";

import { splitSubtitleChunks } from "@/features/story/utils";
import { getActiveSubtitleChunk, getActiveSubtitleChunkState } from "@/features/story/utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const text =
  "The palace was alive. Music echoing through marble halls as guests gathered for the annual ball.";

console.log("subtitleTiming");

test("returns empty string when there are no chunks", () => {
  assert.equal(getActiveSubtitleChunk("", 0, 8000), "");
  assert.equal(getActiveSubtitleChunk("   ", 1000, 8000), "");
});

test("divides scene duration equally across chunks", () => {
  const chunks = splitSubtitleChunks(text);
  assert.ok(chunks.length >= 2);

  const sceneDurationMs = chunks.length * 2000;

  for (let index = 0; index < chunks.length; index++) {
    assert.equal(
      getActiveSubtitleChunk(text, index * 2000, sceneDurationMs),
      chunks[index],
    );
  }
});

test("clamps elapsed time and chunk index safely", () => {
  const chunks = splitSubtitleChunks(text);
  const sceneDurationMs = 8000;

  assert.equal(getActiveSubtitleChunk(text, -500, sceneDurationMs), chunks[0]);
  assert.equal(
    getActiveSubtitleChunk(text, sceneDurationMs + 5000, sceneDurationMs),
    chunks[chunks.length - 1],
  );
  assert.equal(getActiveSubtitleChunk("Short subtitle line.", 99999, 1000), "Short subtitle line.");
});

test("returns chunk progress within the active window", () => {
  const chunks = splitSubtitleChunks(text);
  const sceneDurationMs = chunks.length * 2000;

  assert.equal(getActiveSubtitleChunkState(text, 0, sceneDurationMs).progress, 0);
  assert.equal(getActiveSubtitleChunkState(text, 1999, sceneDurationMs).progress, 0.9995);
  assert.equal(
    getActiveSubtitleChunkState(text, 2000, sceneDurationMs).chunk,
    chunks[1],
  );
});

console.log("All subtitleTiming checks passed.");
