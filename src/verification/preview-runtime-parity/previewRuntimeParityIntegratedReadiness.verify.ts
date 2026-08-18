/**
 * Prompt 6 — integrated readiness (provider-free).
 * Run: npm run test:preview-runtime-parity-integrated-readiness
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildPreviewRuntimeParityIntegratedCertificationStory } from "@/features/preview/runtime-parity/build-preview-runtime-parity-integrated-certification-story";
import { resolvePreviewRuntimeParityCertificationTimeline } from "@/features/preview/runtime-parity/resolve-preview-runtime-parity-certification-timeline";
import { resolvePreviewRuntimeParityCertificationSeek } from "@/features/preview/runtime-parity/resolve-preview-runtime-parity-certification-seek";
import { recordPreviewRuntimeParityImplementationFingerprint } from "@/features/preview/runtime-parity/record-preview-runtime-parity-implementation-fingerprint";
import { resolvePreviewSelectedMediaInspection } from "@/features/preview/runtime-parity/resolve-preview-selected-media-inspection";
import { resolvePreviewSceneMediaWindows } from "@/features/scene-media-timeline";
import { getSceneEngagementOverlay } from "@/features/engagement-overlays/domain/normalize-engagement-overlays";
import { getShortForgeBrandSting } from "@/features/brand-sting/domain/normalize-brand-sting";
import { resolveEngagementOverlayFrame } from "@/features/engagement-overlays/domain/resolve-engagement-overlay-frame";
import { getSceneDurationMs } from "@/features/story/utils/scene.utils";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const frozen = buildPreviewRuntimeParityIntegratedCertificationStory();

test("frozen story contains the required corpus scenes and mutations", () => {
  assert.ok(frozen.sceneIds.length >= 4);
  assert.ok(frozen.mediaItemIds.length >= 6);
  assert.ok(frozen.removedMediaItemIds.length >= 1);
  assert.ok(frozen.replacedMediaItemId);
  assert.ok(frozen.reorderedSceneId);
  assert.ok(frozen.brandStingEnabled);
  assert.ok(frozen.contentDurationMs > 0);
});

test("removed media IDs are absent from the frozen story", () => {
  for (const removed of frozen.removedMediaItemIds) {
    assert.equal(frozen.mediaItemIds.includes(removed), false);
    assert.doesNotMatch(JSON.stringify(frozen.story), new RegExp(removed));
  }
});

test("inspection state is not persisted on the frozen story", () => {
  assert.equal(
    "selectedMediaItemId" in (frozen.story as Record<string, unknown>),
    false,
  );
  assert.doesNotMatch(JSON.stringify(frozen.story), /inspectionSceneElapsedMs/);
});

test("combined CTA and caption-collision relocation stay on the shared plan", () => {
  const scene = frozen.story.scenes.find((entry) => entry.id === frozen.ctaSceneId);
  assert.ok(scene);
  const overlay = getSceneEngagementOverlay(frozen.story, scene!.id);
  assert.ok(overlay);
  assert.equal(overlay!.kind, "combined");
  const hold = resolveEngagementOverlayFrame({
    overlay,
    sceneDurationMs: getSceneDurationMs(scene!),
    sceneElapsedMs: 800,
    captionCollision: {
      present: true,
      sceneLayout: scene!.captionLayout,
    },
  });
  assert.equal(hold.visible, true);
  assert.equal(hold.captionSafePlacement.translated, true);
  assert.equal(hold.layout.width > 0, true);
});

test("Brand Sting is enabled and inspection remains UI-only", () => {
  const sting = getShortForgeBrandSting(frozen.story.visualRetentionExtensions);
  assert.equal(sting?.enabled, true);
  const scene = frozen.story.scenes[0]!;
  const windows = resolvePreviewSceneMediaWindows(scene, {
    mixedMediaScenesEnabled: true,
  });
  const inspection = resolvePreviewSelectedMediaInspection({
    scene,
    selectedMediaItemId: windows[1]?.itemId,
    sceneElapsedMs: 200,
    isPlaying: false,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(inspection.active, true);
  assert.notEqual(inspection.inspectionSceneElapsedMs, 200);
});

test("frozen story uses typewriter captions and a long wrapping subtitle", () => {
  const scene = frozen.story.scenes.find((entry) => entry.id === frozen.ctaSceneId);
  assert.ok(scene);
  assert.equal(scene!.captionAnimation?.preset, "typewriter");
  assert.ok((scene!.subtitle?.length ?? 0) > 80);
});

test("intra-scene and inter-scene transitions are present", () => {
  const intra = frozen.story.scenes.find(
    (scene) => scene.id === frozen.intraSceneTransitionSceneId,
  );
  assert.ok(intra?.mediaTransitions);
  const inter = frozen.story.timelineItems?.find(
    (item) => item.type === "transition" && item.effect === "fade",
  );
  assert.ok(inter);
});

test("Browser and Headless stay on the same canvas draw authority", () => {
  const exportDraw = readSrc("src/features/export/runtime/draw-prepared-export-frame.ts");
  assert.match(exportDraw, /drawEngagementOverlay\(ctx, plan\)/);
  assert.doesNotMatch(exportDraw, /EngagementOverlayPreview/);
});

test("Prompt 2–5 measurement and inspection remain export-neutral", () => {
  const exportDraw = readSrc("src/features/export/runtime/draw-prepared-export-frame.ts");
  assert.doesNotMatch(exportDraw, /collect-preview-cta-dom-measurements/);
  assert.doesNotMatch(exportDraw, /measure-preview-caption-geometry/);
  assert.doesNotMatch(exportDraw, /resolve-preview-selected-media-inspection/);
  const preview = readSrc(
    "src/features/engagement-overlays/preview/EngagementOverlayPreview.tsx",
  );
  assert.match(preview, /data-engagement-overlay-icon/);
  assert.match(preview, /aria-hidden="true"/);
});

test("implementation fingerprint helper is deterministic for one tree", () => {
  const first = recordPreviewRuntimeParityImplementationFingerprint();
  const second = recordPreviewRuntimeParityImplementationFingerprint();
  assert.equal(first.head, second.head);
  assert.equal(first.trackedDiffHash, second.trackedDiffHash);
  assert.equal(first.implementationFingerprint, second.implementationFingerprint);
});

test("harness can load the frozen story and export through production Browser path", () => {
  const harness = readSrc(
    "src/app/dev/preview-runtime-parity-qa/PreviewRuntimeParityQaHarness.tsx",
  );
  assert.match(harness, /data-preview-runtime-parity-load-frozen-cert/);
  assert.match(harness, /data-preview-runtime-parity-export-browser/);
  assert.match(harness, /exportFootieShortFromManifest/);
  assert.match(harness, /prepareExportRequest/);
  assert.match(harness, /buildPreviewRuntimeParityIntegratedCertificationStory/);
  assert.match(harness, /BrandStingPreview/);
  assert.match(harness, /certificationCaptureMode/);
  assert.match(harness, /__PREVIEW_RUNTIME_PARITY_SEEK__/);
});

test("corrected certification story timing is cumulative and seekable", () => {
  const timing = resolvePreviewRuntimeParityCertificationTimeline(frozen.story);
  assert.equal(timing.sceneTiming[0]?.startMs, 0);
  assert.ok((timing.sceneTiming[1]?.startMs ?? 0) > 0);
  assert.equal(
    resolvePreviewRuntimeParityCertificationSeek(frozen.story, 26_200).activeMediaId,
    "parity-image-q",
  );
});

console.log(`\nPreview runtime-parity integrated readiness: ${passed} passed`);
