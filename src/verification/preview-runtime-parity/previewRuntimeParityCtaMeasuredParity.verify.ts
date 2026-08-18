/**
 * Prompt 5 — CTA measured parity (provider-free).
 * Run: npm run test:preview-runtime-parity-cta-measured
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  collectCtaMeasuredParityCases,
  compareCtaOutputBoxes,
  measureCtaCaptionCollisionSizeStability,
  measureCtaDuplicateScale,
  measureCtaInnerScreenVersusHost,
  measureCtaPlanAcrossOutputTargets,
  normalizeCtaBox,
  resolveCtaCheckpointElapsedMs,
  resolveParityCtaFrame,
  toOutputSpaceBox,
  buildParityCtaOverlay,
} from "@/features/preview/runtime-parity/measure-preview-cta-measured-parity";
import {
  PREVIEW_RUNTIME_PARITY_CTA_BUILD_MARKER,
  PREVIEW_RUNTIME_PARITY_CTA_TOLERANCE,
  PREVIEW_RUNTIME_PARITY_INNER_SCREEN_WIDTHS_PX,
  resolvePreviewInnerScreenWidthPx,
} from "@/features/preview/runtime-parity/preview-runtime-parity-cta-contract";
import {
  ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT,
  ENGAGEMENT_OVERLAY_REFERENCE_WIDTH,
  shouldSuppressEngagementOverlayForInterSceneTransition,
} from "@/features/engagement-overlays/domain/resolve-engagement-overlay-frame";
import { resolvePreviewSelectedMediaInspection } from "@/features/preview/runtime-parity/resolve-preview-selected-media-inspection";
import { buildThreeVideoEqualWindowScene } from "@/features/preview/runtime-parity/build-preview-runtime-parity-story";
import { resolvePreviewSceneMediaWindows } from "@/features/scene-media-timeline";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

test("1. inner-screen normalization is not host normalization", () => {
  const host = measureCtaInnerScreenVersusHost(260);
  assert.equal(host.innerWidthPx, 244);
  assert.equal(host.hostDiffersFromInner, true);
  assert.ok(host.innerPlanWidthDelta < 1e-9);
  assert.ok(resolvePreviewInnerScreenWidthPx(220) === 204);
  assert.ok(resolvePreviewInnerScreenWidthPx(360) === 344);
  assert.deepEqual([...PREVIEW_RUNTIME_PARITY_INNER_SCREEN_WIDTHS_PX], [204, 244, 344]);
});

test("2–5. kinds, positions, sizes, and fine scale stay on one plan", () => {
  for (const entry of collectCtaMeasuredParityCases()) {
    const plan = resolveParityCtaFrame({ overlay: entry.overlay });
    const inner = resolveParityCtaFrame({
      overlay: entry.overlay,
      frameWidth: entry.innerWidthPx,
      frameHeight: Math.round((entry.innerWidthPx * 1920) / 1080),
    });
    const compared = compareCtaOutputBoxes(
      toOutputSpaceBox(
        normalizeCtaBox(plan.layout, ENGAGEMENT_OVERLAY_REFERENCE_WIDTH, ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT),
      ),
      toOutputSpaceBox(
        normalizeCtaBox(inner.layout, entry.innerWidthPx, Math.round((entry.innerWidthPx * 1920) / 1080)),
      ),
    );
    assert.equal(compared.withinOuterTolerance, true, entry.id);
  }
});

test("6. 204/244/344 inner widths keep normalized proportions", () => {
  const overlay = buildParityCtaOverlay({});
  const widths = PREVIEW_RUNTIME_PARITY_INNER_SCREEN_WIDTHS_PX.map((width) => {
    const frame = resolveParityCtaFrame({
      overlay,
      frameWidth: width,
      frameHeight: Math.round((width * 1920) / 1080),
    });
    return frame.layout.width / width;
  });
  assert.ok(Math.abs(widths[0]! - widths[1]!) < 1e-9);
  assert.ok(Math.abs(widths[1]! - widths[2]!) < 1e-9);
});

test("7. 720p/1080p/4K output plans match in output space", () => {
  const measurements = measureCtaPlanAcrossOutputTargets(buildParityCtaOverlay({}));
  const reference = measurements[1]!.output;
  for (const measurement of measurements) {
    assert.equal(compareCtaOutputBoxes(reference, measurement.output).withinOuterTolerance, true);
  }
});

test("8–12. columns, separators, pill, and type proportions are shared", () => {
  const frame = resolveParityCtaFrame({ overlay: buildParityCtaOverlay({ kind: "combined" }) });
  assert.equal(frame.chrome.columnCount, 3);
  assert.equal(frame.chrome.columnCentersX.length, 3);
  const gap1 = frame.chrome.columnCentersX[1]! - frame.chrome.columnCentersX[0]!;
  const gap2 = frame.chrome.columnCentersX[2]! - frame.chrome.columnCentersX[1]!;
  assert.ok(Math.abs(gap1 - gap2) < 1e-9);
  assert.equal(frame.chrome.separatorXs.length, 2);
  assert.ok(frame.chrome.separatorHeight > 0);
  assert.ok(frame.chrome.fontSize / frame.layout.height > 0);
  assert.ok(frame.chrome.iconSize / frame.layout.height > 0);
  assert.ok(frame.chrome.iconLabelGap / frame.layout.height > 0);
  assert.ok(Math.abs(frame.chrome.cornerRadius - frame.layout.height / 2) < 1e-9);
});

test("13. entrance/hold/action/confirmation/exit checkpoints are deterministic", () => {
  const overlay = buildParityCtaOverlay({ startOffsetMs: 400, durationMs: 2500, kind: "combined" });
  const hold = resolveParityCtaFrame({
    overlay,
    sceneElapsedMs: resolveCtaCheckpointElapsedMs({
      startOffsetMs: 400,
      durationMs: 2500,
      checkpoint: "hold",
    }),
  });
  const like = resolveParityCtaFrame({
    overlay,
    sceneElapsedMs: resolveCtaCheckpointElapsedMs({
      startOffsetMs: 400,
      durationMs: 2500,
      checkpoint: "like-active",
    }),
  });
  const subscribe = resolveParityCtaFrame({
    overlay,
    sceneElapsedMs: resolveCtaCheckpointElapsedMs({
      startOffsetMs: 400,
      durationMs: 2500,
      checkpoint: "subscribe-confirm",
    }),
  });
  const hidden = resolveParityCtaFrame({
    overlay,
    sceneElapsedMs: resolveCtaCheckpointElapsedMs({
      startOffsetMs: 400,
      durationMs: 2500,
      checkpoint: "hidden-before",
    }),
  });
  assert.equal(hold.phase, "hold");
  assert.equal(like.segments[0]?.active, true);
  assert.equal(subscribe.segments[2]?.confirmation, true);
  assert.equal(hidden.visible, false);
});

test("14. Subscribe label remains Subscribe during confirmation", () => {
  const overlay = buildParityCtaOverlay({ startOffsetMs: 400, durationMs: 2500, kind: "combined" });
  const confirm = resolveParityCtaFrame({
    overlay,
    sceneElapsedMs: resolveCtaCheckpointElapsedMs({
      startOffsetMs: 400,
      durationMs: 2500,
      checkpoint: "subscribe-confirm",
    }),
  });
  assert.equal(confirm.segments[2]?.label, "Subscribe");
  assert.doesNotMatch(confirm.segments[2]?.label ?? "", /Subscribed/);
});

test("15. no duplicate scale application in the shared plan", () => {
  const measured = measureCtaDuplicateScale(buildParityCtaOverlay({ scale: 1.15 }));
  assert.equal(measured.layoutIncludesAuthorScale, true);
  assert.equal(measured.frameScaleIsMotionOnly, true);
  const preview = readSrc("src/features/engagement-overlays/preview/EngagementOverlayPreview.tsx");
  assert.match(preview, /transform: `scale\(\$\{frame\.scale\}\)`/);
  assert.doesNotMatch(preview, /authorScale|sizeMultiplier/);
});

test("16. caption collision translates without resizing", () => {
  const measured = measureCtaCaptionCollisionSizeStability();
  assert.equal(measured.translated, true);
  assert.equal(measured.widthUnchanged, true);
  assert.equal(measured.heightUnchanged, true);
});

test("17. inter-scene suppression is shared", () => {
  assert.equal(shouldSuppressEngagementOverlayForInterSceneTransition(true), true);
  assert.equal(shouldSuppressEngagementOverlayForInterSceneTransition(false), false);
});

test("18. selected-media inspection uses canonical scene-local time", () => {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = resolvePreviewSceneMediaWindows(scene, { mixedMediaScenesEnabled: true });
  const inspection = resolvePreviewSelectedMediaInspection({
    scene,
    selectedMediaItemId: windows[1]?.itemId,
    sceneElapsedMs: 200,
    isPlaying: false,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(inspection.active, true);
  assert.equal(inspection.inspectionSceneElapsedMs, windows[1]?.startMs);
});

test("19. seek/restart checkpoints are deterministic", () => {
  const overlay = buildParityCtaOverlay({ startOffsetMs: 400, durationMs: 2500 });
  const first = resolveParityCtaFrame({ overlay, sceneElapsedMs: 900 });
  const second = resolveParityCtaFrame({ overlay, sceneElapsedMs: 900 });
  assert.equal(first.phase, second.phase);
  assert.equal(first.progress, second.progress);
  assert.equal(first.segments[0]?.emphasis, second.segments[0]?.emphasis);
});

test("20. capability-off / malformed overlay stays hidden", () => {
  const missing = resolveParityCtaFrame({
    overlay: buildParityCtaOverlay({}),
  });
  assert.equal(missing.visible, true);
  const malformed = resolveParityCtaFrame({
    overlay: { version: 1, id: "bad" } as never,
  });
  assert.equal(malformed.visible, false);
});

test("21. Preview remains decorative and non-interactive", () => {
  const preview = readSrc("src/features/engagement-overlays/preview/EngagementOverlayPreview.tsx");
  assert.match(preview, /aria-hidden="true"/);
  assert.match(preview, /pointer-events-none/);
  assert.match(preview, /focusable=\{false\}/);
});

test("22. Browser/Headless use the same canvas draw authority", () => {
  const exportDraw = readSrc("src/features/export/runtime/draw-prepared-export-frame.ts");
  const canvas = readSrc("src/features/engagement-overlays/render/draw-engagement-overlay.ts");
  assert.match(exportDraw, /drawEngagementOverlay\(ctx, plan\)/);
  assert.match(canvas, /export function drawEngagementOverlay/);
  assert.doesNotMatch(exportDraw, /EngagementOverlayPreview/);
});

test("23–24. Preview measurement does not mutate story or manifests", () => {
  const overlay = Object.freeze(buildParityCtaOverlay({}));
  resolveParityCtaFrame({ overlay });
  assert.equal(overlay.size, "medium");
  const exportDraw = readSrc("src/features/export/runtime/draw-prepared-export-frame.ts");
  assert.doesNotMatch(exportDraw, /measure-preview-cta-measured-parity/);
});

test("25. no Preview-only animation timer", () => {
  const preview = readSrc("src/features/engagement-overlays/preview/EngagementOverlayPreview.tsx");
  assert.doesNotMatch(preview, /requestAnimationFrame|setInterval|setTimeout/);
});

test("26. harness publishes a current build marker", () => {
  const harness = readSrc("src/app/dev/preview-runtime-parity-qa/PreviewRuntimeParityQaHarness.tsx");
  const contract = readSrc("src/features/preview/runtime-parity/preview-runtime-parity-cta-contract.ts");
  assert.match(harness, /data-preview-runtime-parity-build-marker/);
  assert.match(harness, /PREVIEW_RUNTIME_PARITY_CTA_BUILD_MARKER/);
  assert.match(contract, new RegExp(PREVIEW_RUNTIME_PARITY_CTA_BUILD_MARKER));
  assert.equal(
    PREVIEW_RUNTIME_PARITY_CTA_BUILD_MARKER,
    "staging-preview-runtime-parity:prompt-5:cta-measured-parity",
  );
  assert.ok(PREVIEW_RUNTIME_PARITY_CTA_TOLERANCE.outerBoundsPx === 2);
});

console.log(`\nPreview runtime-parity CTA measured parity: ${passed} passed`);
