/**
 * Preview runtime-parity corpus and local fixtures.
 * Run: npm run test:preview-runtime-parity
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { buildPreviewRuntimeParityLocalFixtures } from "@/features/preview/runtime-parity/build-preview-runtime-parity-local-fixtures";
import {
  buildPreviewRuntimeParityHarnessStory,
  buildPreviewRuntimeParityStory,
} from "@/features/preview/runtime-parity/build-preview-runtime-parity-story";
import { buildPreviewRuntimeParitySvgFixture } from "@/features/preview/runtime-parity/build-preview-runtime-parity-svg-fixture";
import {
  PREVIEW_RUNTIME_PARITY_CORPUS,
  PREVIEW_RUNTIME_PARITY_CORPUS_CASE_IDS,
} from "@/features/preview/runtime-parity/preview-runtime-parity-corpus";
import {
  PREVIEW_RUNTIME_PARITY_IMAGE_IDENTITIES,
  PREVIEW_RUNTIME_PARITY_VIDEO_IDENTITIES,
  previewRuntimeParityPublicUrl,
} from "@/features/preview/runtime-parity/preview-runtime-parity-fixture-identities";
import { resolvePreviewSceneMediaWindows } from "@/features/scene-media-timeline";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

test("corpus lists every required case", () => {
  assert.deepEqual(
    PREVIEW_RUNTIME_PARITY_CORPUS.map((entry) => entry.id),
    [...PREVIEW_RUNTIME_PARITY_CORPUS_CASE_IDS],
  );
  assert.ok(PREVIEW_RUNTIME_PARITY_CORPUS.length >= 8);
});

test("tracked SVG fixtures match the deterministic builder", () => {
  for (const identity of [
    ...PREVIEW_RUNTIME_PARITY_VIDEO_IDENTITIES,
    ...PREVIEW_RUNTIME_PARITY_IMAGE_IDENTITIES,
  ]) {
    const kind = "fileName" in identity && identity.fileName.startsWith("video")
      ? "video"
      : "image";
    const expected = buildPreviewRuntimeParitySvgFixture({
      marker: identity.marker,
      fill: identity.fill,
      kind,
    });
    const actual = readFileSync(
      join(process.cwd(), "public", "preview-runtime-parity", identity.fileName),
      "utf8",
    );
    assert.equal(actual.replace(/\s+/g, " ").trim(), expected.replace(/\s+/g, " ").trim());
  }
});

test("local fixture builder writes gitignored .tmp files", () => {
  const written = buildPreviewRuntimeParityLocalFixtures();
  assert.equal(written.length, 5);
  for (const fixture of written) {
    assert.ok(existsSync(join(process.cwd(), fixture.relativePath)));
    assert.match(fixture.relativePath, /^\.tmp\/preview-runtime-parity\//);
  }
});

test("three-video story is generic across identities and has equal windows", () => {
  const story = buildPreviewRuntimeParityStory("three-videos-equal-windows");
  const scene = story.scenes[0]!;
  const windows = resolvePreviewSceneMediaWindows(scene, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(windows.length, 3);
  assert.equal(windows[0]?.durationMs, windows[1]?.durationMs);
  assert.equal(windows[1]?.durationMs, windows[2]?.durationMs);
  assert.ok(windows.every((window) => window.media.type === "video"));
  assert.ok(
    windows.every((window) =>
      PREVIEW_RUNTIME_PARITY_VIDEO_IDENTITIES.some((identity) => identity.id === window.itemId),
    ),
  );
  assert.doesNotMatch(JSON.stringify(story), /https?:\/\//);
});

test("unequal, mixed, transition, framing, and clock stories exist", () => {
  const unequal = resolvePreviewSceneMediaWindows(
    buildPreviewRuntimeParityStory("three-videos-unequal-windows").scenes[0]!,
    { mixedMediaScenesEnabled: true },
  );
  assert.notEqual(unequal[0]?.durationMs, unequal[2]?.durationMs);

  const mixed = resolvePreviewSceneMediaWindows(
    buildPreviewRuntimeParityStory("mixed-image-video-unequal").scenes[0]!,
    { mixedMediaScenesEnabled: true },
  );
  assert.equal(mixed.some((window) => window.media.type === "image"), true);
  assert.equal(mixed.some((window) => window.media.type === "video"), true);

  const transition = buildPreviewRuntimeParityStory("three-videos-intra-scene-transition").scenes[0]!;
  assert.ok(transition.mediaTransitions?.boundaries?.length);

  const framing = resolvePreviewSceneMediaWindows(
    buildPreviewRuntimeParityStory("framing-fit-fill-zoom-fit-background").scenes[0]!,
    { mixedMediaScenesEnabled: true },
  );
  assert.ok(framing.some((window) => window.media.fitMode === "cover"));
  assert.ok(framing.some((window) => window.media.fitMode === "contain"));
  assert.ok(framing.some((window) => (window.media.transform?.scale ?? 1) > 1));
  assert.ok(framing.some((window) => window.media.backgroundTreatment === "blurred_fill"));

  const clock = buildPreviewRuntimeParityStory("clock-lifecycle-two-scenes");
  assert.equal(clock.scenes.length, 2);
});

test("harness story stays in-memory and uses local fixture URLs", () => {
  const story = buildPreviewRuntimeParityHarnessStory();
  assert.ok(story.scenes.length >= 3);
  assert.equal(story.voiceoverUrl, undefined);
  const serialized = JSON.stringify(story);
  assert.doesNotMatch(serialized, /https?:\/\//);
  assert.match(serialized, /preview-runtime-parity/);
  assert.ok(
    PREVIEW_RUNTIME_PARITY_VIDEO_IDENTITIES.every((identity) =>
      serialized.includes(previewRuntimeParityPublicUrl(identity.fileName)),
    ),
  );
});

console.log(`\nAll preview runtime-parity corpus checks passed (${passed}).`);
