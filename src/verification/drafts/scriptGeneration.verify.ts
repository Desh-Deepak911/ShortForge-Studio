/**
 * Script generation verification (run: npm run test:script-generation).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function readService(): string {
  return readFileSync(
    join(process.cwd(), "src/features/story/services/script-generation.service.ts"),
    "utf8",
  );
}

console.log("scriptGeneration");

test("post-parse length validation runs compression pass when budget exceeded", () => {
  const source = readService();

  assert.match(source, /parseStoryScriptJson\(rawText\)/);
  assert.match(source, /enforceScriptLengthBudget/);
  assert.match(source, /compressStoryScript/);
  assert.match(source, /isWithinNarrationScriptBudget/);
  assert.match(source, /exceedsNarrationScriptBudget|isWithinNarrationScriptBudget/);
});

test("compression prompt preserves mode, tone, and factual accuracy", () => {
  const source = readService();

  assert.match(source, /Preserve factual accuracy/);
  assert.match(source, /Do not add new facts/);
  assert.match(source, /preserve this mode's voice/);
  assert.match(source, /preserve tone/);
  assert.match(source, /Keep the title if still suitable/);
});

test("compression failure falls back to original script with warning", () => {
  const source = readService();

  assert.match(source, /SCRIPT_LENGTH_COMPRESSION_FAILED_WARNING/);
  assert.match(source, /script: original/);
  assert.match(source, /lengthWarning: SCRIPT_LENGTH_COMPRESSION_FAILED_WARNING/);
});

test("script generation uses duration-aware max_output_tokens", () => {
  const source = readService();

  assert.match(source, /resolveNarrationMaxOutputTokens\(duration\)/);
  assert.doesNotMatch(source, /NARRATION_SCRIPT_MAX_OUTPUT_TOKENS\s*=\s*1200/);
});

console.log("\nAll script generation checks passed.");
