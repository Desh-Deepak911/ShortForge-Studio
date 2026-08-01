/**
 * Visual-beat input fingerprint verification.
 * Run: npm run test:visual-beat-planning
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  VISUAL_BEAT_INPUT_FINGERPRINT_PREFIX,
  fingerprintVisualBeatInput,
  generateVisualBeatPlan,
  normalizeVisualBeatNarrationText,
  type VisualBeatPlanInput,
  type VisualBeatUsableMediaIdentity,
} from "@/features/visual-beat-density";

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function media(
  items: readonly VisualBeatUsableMediaIdentity[],
): readonly VisualBeatUsableMediaIdentity[] {
  return items;
}

function baseInput(
  overrides: Partial<VisualBeatPlanInput> = {},
): VisualBeatPlanInput {
  return {
    narrationText: "Hello world. Next phrase, then more.",
    sceneDurationMs: 10_000,
    usableMedia: media([
      { itemId: "a", mediaKind: "image", sourceIdentity: "src-a" },
      { itemId: "b", mediaKind: "video", sourceIdentity: "src-b" },
      { itemId: "c", mediaKind: "image", sourceIdentity: "src-c" },
    ]),
    density: "balanced",
    ...overrides,
  };
}

function readFeature(rel: string): string {
  return readFileSync(
    path.join(process.cwd(), "src/features/visual-beat-density", rel),
    "utf8",
  );
}

function main(): void {
  console.log("\nVisual-beat plan fingerprint\n");

  test("identical semantic inputs → identical fingerprint", () => {
    const a = fingerprintVisualBeatInput(baseInput());
    const b = fingerprintVisualBeatInput({
      ...baseInput(),
      usableMedia: [
        { sourceIdentity: "src-a", mediaKind: "image", itemId: "a" },
        { sourceIdentity: "src-b", mediaKind: "video", itemId: "b" },
        { sourceIdentity: "src-c", mediaKind: "image", itemId: "c" },
      ],
    });
    assert.equal(a, b);
    assert.ok(a.startsWith(VISUAL_BEAT_INPUT_FINGERPRINT_PREFIX));
  });

  test("explicit timestamp does not alter fingerprint", () => {
    const without = fingerprintVisualBeatInput(baseInput());
    const withTs = generateVisualBeatPlan(
      baseInput({ generatedAtIso: "2020-01-01T00:00:00.000Z" }),
    );
    assert.equal(withTs.ok, true);
    if (!withTs.ok) return;
    assert.equal(withTs.plan.sourceFingerprint, without);
    assert.equal(withTs.plan.generatedAtIso, "2020-01-01T00:00:00.000Z");
  });

  test("narration normalization is stable", () => {
    assert.equal(
      normalizeVisualBeatNarrationText("  Hello\n\tworld  "),
      "Hello world",
    );
    const spaced = fingerprintVisualBeatInput(
      baseInput({ narrationText: "Hello   world. Next phrase, then more." }),
    );
    const plain = fingerprintVisualBeatInput(
      baseInput({ narrationText: "Hello world. Next phrase, then more." }),
    );
    assert.equal(spaced, plain);
  });

  test("narration change changes fingerprint", () => {
    const a = fingerprintVisualBeatInput(baseInput());
    const b = fingerprintVisualBeatInput(
      baseInput({ narrationText: "Completely different narration." }),
    );
    assert.notEqual(a, b);
  });

  test("duration change changes fingerprint", () => {
    const a = fingerprintVisualBeatInput(baseInput());
    const b = fingerprintVisualBeatInput(baseInput({ sceneDurationMs: 12_000 }));
    assert.notEqual(a, b);
  });

  test("density change changes fingerprint", () => {
    const a = fingerprintVisualBeatInput(baseInput({ density: "fast" }));
    const b = fingerprintVisualBeatInput(baseInput({ density: "studio" }));
    assert.notEqual(a, b);
  });

  test("media identity change changes fingerprint", () => {
    const a = fingerprintVisualBeatInput(baseInput());
    const b = fingerprintVisualBeatInput(
      baseInput({
        usableMedia: media([
          { itemId: "a", mediaKind: "image", sourceIdentity: "src-a-changed" },
          { itemId: "b", mediaKind: "video", sourceIdentity: "src-b" },
          { itemId: "c", mediaKind: "image", sourceIdentity: "src-c" },
        ]),
      }),
    );
    assert.notEqual(a, b);
  });

  test("media order change changes fingerprint", () => {
    const a = fingerprintVisualBeatInput(baseInput());
    const b = fingerprintVisualBeatInput(
      baseInput({
        usableMedia: media([
          { itemId: "c", mediaKind: "image", sourceIdentity: "src-c" },
          { itemId: "b", mediaKind: "video", sourceIdentity: "src-b" },
          { itemId: "a", mediaKind: "image", sourceIdentity: "src-a" },
        ]),
      }),
    );
    assert.notEqual(a, b);
  });

  test("generator-version change changes fingerprint", () => {
    const a = fingerprintVisualBeatInput(baseInput({ generatorVersion: 1 }));
    // Cast through unknown to prove fingerprint payload includes generatorVersion.
    const b = fingerprintVisualBeatInput({
      ...baseInput(),
      generatorVersion: 2 as unknown as 1,
    });
    assert.notEqual(a, b);
  });

  test("no music dependency in fingerprint module", () => {
    const source = readFeature("domain/fingerprint-visual-beat-input.ts");
    assert.doesNotMatch(source, /from\s+["'][^"']*music[^"']*["']/i);
    assert.doesNotMatch(source, /features\/audio|audio-mixer/i);
    assert.doesNotMatch(source, /Date\.now\(|new Date\(|Math\.random/);
  });

  console.log(`\n${passed} passed\n`);
}

main();
