/**
 * Prompt 6B — certification-story timing (provider-free).
 * Run: npm run test:preview-runtime-parity-certification-story-timing
 */
import assert from "node:assert/strict";

import { buildExportManifest } from "@/features/export/domain";
import { buildPreviewRuntimeParityIntegratedCertificationStory } from "@/features/preview/runtime-parity/build-preview-runtime-parity-integrated-certification-story";
import { PREVIEW_RUNTIME_PARITY_INTEGRATED_TIMESTAMPS } from "@/features/preview/runtime-parity/preview-runtime-parity-integrated-timestamps";
import { resolvePreviewRuntimeParityCertificationSeek } from "@/features/preview/runtime-parity/resolve-preview-runtime-parity-certification-seek";
import { resolvePreviewRuntimeParityCertificationTimeline } from "@/features/preview/runtime-parity/resolve-preview-runtime-parity-certification-timeline";
import { getActiveSceneAtTime, getSceneTimingMap } from "@/features/story/utils/scene.utils";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const frozen = buildPreviewRuntimeParityIntegratedCertificationStory();
const timeline = resolvePreviewRuntimeParityCertificationTimeline(frozen.story);
const rows = timeline.sceneTiming;

test("scene 1 starts at 0 and later scenes start at the previous end", () => {
  assert.equal(rows[0]?.startMs, 0);
  for (let index = 1; index < rows.length; index += 1) {
    assert.equal(rows[index]!.startMs, rows[index - 1]!.endMs);
    assert.ok(rows[index]!.startMs > rows[index - 1]!.startMs);
  }
});

test("each scene duration equals end minus start in seconds and milliseconds", () => {
  for (const row of rows) {
    assert.equal(row.durationMs, row.endMs - row.startMs);
    assert.equal(row.duration, row.end - row.start);
    assert.equal(row.startMs, Math.round(row.start * 1000));
    assert.equal(row.endMs, Math.round(row.end * 1000));
    assert.equal(row.durationMs, Math.round(row.duration * 1000));
  }
});

test("there are no overlaps or unintended gaps", () => {
  for (let index = 1; index < rows.length; index += 1) {
    assert.equal(rows[index]!.startMs - rows[index - 1]!.endMs, 0);
  }
});

test("final narration scene remains active through canonical contentEndMs", () => {
  const last = rows[rows.length - 1];
  assert.ok(last);
  assert.equal(last.endMs, timeline.lastNarrationSceneEndMs);
  assert.ok(timeline.contentEndMs >= last.endMs);
  const activeAtContentEnd = getActiveSceneAtTime(
    frozen.story.scenes,
    Math.max(0, timeline.contentEndMs - 1),
  );
  assert.equal(activeAtContentEnd?.sceneId, last.id);
  assert.equal(timeline.brandStingStartMs, timeline.contentEndMs);
});

test("Brand Sting begins at the resolved canonical sting boundary", () => {
  assert.equal(timeline.brandStingStartMs, timeline.contentEndMs);
  assert.ok(timeline.brandStingEndMs > timeline.brandStingStartMs);
  assert.ok(timeline.renderEndMs >= timeline.brandStingEndMs);
});

test("the timeline resolves the expected scene at every certification timestamp", () => {
  for (const sample of PREVIEW_RUNTIME_PARITY_INTEGRATED_TIMESTAMPS) {
    if (sample.ms >= timeline.brandStingStartMs) continue;
    const seek = resolvePreviewRuntimeParityCertificationSeek(frozen.story, sample.ms);
    const slot = getSceneTimingMap(frozen.story.scenes).find(
      (entry) => sample.ms >= entry.startMs && sample.ms < entry.endMs,
    );
    assert.ok(slot, `missing slot at ${sample.ms}`);
    assert.equal(seek.sceneId, slot!.sceneId);
    assert.equal(seek.inspectionActive, false);
    assert.equal(seek.storyMutated, false);
  }
});

test("later-scene Preview seek resolves the correct scene and media item", () => {
  const later = PREVIEW_RUNTIME_PARITY_INTEGRATED_TIMESTAMPS.filter(
    (sample) =>
      sample.ms >= (rows[1]?.startMs ?? 9000) &&
      sample.expectedMediaId &&
      !sample.phase.includes("transition"),
  );
  assert.ok(later.length >= 3);
  for (const sample of later) {
    const seek = resolvePreviewRuntimeParityCertificationSeek(frozen.story, sample.ms);
    assert.notEqual(seek.sceneId, rows[0]?.id);
    assert.equal(seek.activeMediaId, sample.expectedMediaId);
  }
  const inter = resolvePreviewRuntimeParityCertificationSeek(frozen.story, 8750);
  assert.equal(inter.transition.kind, "inter-scene");
  assert.equal(inter.transition.effect, "fade");
});

test("frozen story and manifest agree on scene boundaries", () => {
  const manifest = buildExportManifest({
    story: frozen.story,
    exportSettings: {
      fileName: "preview-runtime-parity-integrated-certification",
      format: "webm",
      quality: "standard",
      resolution: "1080x1920",
    },
    audioMode: "silent",
    mixedMediaScenesEnabled: true,
    engagementOverlaysEnabled: true,
    shortForgeBrandStingEnabled: true,
    keyframedVisualEffectsEnabled: true,
  });
  assert.equal(manifest.project.contentDurationMs, timeline.brandStingEndMs);
  for (const row of rows) {
    const scene = manifest.scenes.find((entry) => entry.id === row.id);
    assert.ok(scene, row.id);
    assert.equal(scene!.startMs, row.startMs);
    assert.equal(scene!.endMs, row.endMs);
    assert.equal(scene!.durationMs, row.durationMs);
  }
});

console.log(`\nPreview runtime-parity certification story timing: ${passed} passed`);
