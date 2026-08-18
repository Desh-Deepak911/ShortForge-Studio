/**
 * Prompt 6B — deterministic Preview seek (provider-free).
 * Run: npm run test:preview-runtime-parity-certification-seek
 */
import assert from "node:assert/strict";

import { buildPreviewRuntimeParityIntegratedCertificationStory } from "@/features/preview/runtime-parity/build-preview-runtime-parity-integrated-certification-story";
import { PREVIEW_RUNTIME_PARITY_INTEGRATED_TIMESTAMPS } from "@/features/preview/runtime-parity/preview-runtime-parity-integrated-timestamps";
import { resolvePreviewRuntimeParityCertificationSeek } from "@/features/preview/runtime-parity/resolve-preview-runtime-parity-certification-seek";
import { resolvePreviewRuntimeParityCertificationTimeline } from "@/features/preview/runtime-parity/resolve-preview-runtime-parity-certification-timeline";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const frozen = buildPreviewRuntimeParityIntegratedCertificationStory();
const before = JSON.stringify(frozen.story);
const timeline = resolvePreviewRuntimeParityCertificationTimeline(frozen.story);

test("every certification timestamp records canonical seek diagnostics", () => {
  for (const sample of PREVIEW_RUNTIME_PARITY_INTEGRATED_TIMESTAMPS) {
    const seek = resolvePreviewRuntimeParityCertificationSeek(frozen.story, sample.ms);
    assert.equal(seek.timelineMs, sample.ms);
    assert.equal(seek.inspectionActive, false);
    assert.equal(typeof seek.sceneLocalMs, "number");
    assert.ok("activeMediaId" in seek);
    assert.ok("outgoingMediaId" in seek);
    assert.ok(seek.transition);
    assert.ok(seek.caption);
    assert.ok(seek.cta);
    assert.ok(seek.brandSting);
  }
});

test("seeking does not mutate the frozen story", () => {
  for (const sample of PREVIEW_RUNTIME_PARITY_INTEGRATED_TIMESTAMPS) {
    const seek = resolvePreviewRuntimeParityCertificationSeek(frozen.story, sample.ms);
    assert.equal(seek.storyMutated, false);
  }
  assert.equal(JSON.stringify(frozen.story), before);
});

test("later-scene samples leave scene 1 and keep the expected media", () => {
  const firstId = frozen.story.scenes[0]?.id;
  const later = PREVIEW_RUNTIME_PARITY_INTEGRATED_TIMESTAMPS.filter(
    (sample) => sample.ms >= 9_000 && sample.expectedMediaId,
  );
  assert.ok(later.length >= 3);
  for (const sample of later) {
    const seek = resolvePreviewRuntimeParityCertificationSeek(frozen.story, sample.ms);
    assert.notEqual(seek.sceneId, firstId);
    assert.equal(seek.activeMediaId, sample.expectedMediaId);
  }
});

test("Brand Sting samples use canonical sting-local time", () => {
  const mid = resolvePreviewRuntimeParityCertificationSeek(
    frozen.story,
    timeline.brandStingMidMs,
  );
  assert.equal(mid.brandSting.active, true);
  assert.equal(mid.brandSting.elapsedMs, timeline.brandStingMidMs - timeline.brandStingStartMs);
  assert.equal(mid.activeMediaId, null);
  assert.equal(mid.inspectionActive, false);
});

test("terminal classification follows last decodable encoded frame", () => {
  const last = resolvePreviewRuntimeParityCertificationSeek(
    frozen.story,
    timeline.lastDecodableFrameMs,
  );
  if (timeline.lastDecodableFrameClassification === "brand-sting-last-visible") {
    assert.equal(last.brandSting.active, true);
    assert.equal(last.terminalHidden, false);
  } else {
    assert.equal(last.terminalHidden, true);
    assert.equal(last.brandSting.active, false);
  }
});

console.log(`\nPreview runtime-parity certification seek: ${passed} passed`);
