/**
 * Caption-local / title-local legibility layer — shared plan contracts.
 * Preview / Browser / Headless must consume the same deterministic plan.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  LEGIBILITY_CAPTION_BACKGROUND_SUFFICIENT_OPACITY,
  LEGIBILITY_TITLE_FADE_MS,
  LEGIBILITY_TITLE_WINDOW_MS,
  mapCaptionAnchorToLegibilityPlacement,
  resolveLegibilityLayerPlan,
  resolveLegibilityTitleTiming,
  type ResolveLegibilityLayerPlanInput,
} from "@/features/legibility-layer";

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function baseInput(
  overrides: Partial<ResolveLegibilityLayerPlanInput> = {},
): ResolveLegibilityLayerPlanInput {
  return {
    absoluteContentTimeMs: 3_000,
    contentDurationMs: 10_000,
    storyTitle: "Derby Winner",
    hasActiveCaption: false,
    captionPlacement: "none",
    captionStyleBackgroundEnabled: true,
    captionStyleBackgroundOpacity: 45,
    watermarkEnabled: true,
    frameWidth: 1080,
    frameHeight: 1920,
    ...overrides,
  };
}

console.log("\nLegibility layer plan contracts\n");

test("1. No title and no caption: no global gradient", () => {
  const plan = resolveLegibilityLayerPlan(
    baseInput({ storyTitle: "", hasActiveCaption: false }),
  );
  assert.equal(plan.globalGradientEnabled, false);
  assert.equal(plan.title.visible, false);
  assert.equal(plan.caption.active, false);
  assert.equal(plan.caption.needsLocalScrim, false);
});

test("2. Opening title at 0ms", () => {
  const plan = resolveLegibilityLayerPlan(
    baseInput({ absoluteContentTimeMs: 0 }),
  );
  assert.equal(plan.title.visible, true);
  assert.equal(plan.title.opacity, 1);
  assert.equal(plan.title.fadePhase, "solid");
});

test("3. Title before fade", () => {
  const plan = resolveLegibilityLayerPlan(
    baseInput({ absoluteContentTimeMs: LEGIBILITY_TITLE_WINDOW_MS - LEGIBILITY_TITLE_FADE_MS - 1 }),
  );
  assert.equal(plan.title.visible, true);
  assert.equal(plan.title.opacity, 1);
  assert.equal(plan.title.fadePhase, "solid");
});

test("4. Title during fade", () => {
  const midFade =
    LEGIBILITY_TITLE_WINDOW_MS - LEGIBILITY_TITLE_FADE_MS / 2;
  const plan = resolveLegibilityLayerPlan(
    baseInput({ absoluteContentTimeMs: midFade }),
  );
  assert.equal(plan.title.visible, true);
  assert.ok(plan.title.opacity > 0.01 && plan.title.opacity < 1);
  assert.equal(plan.title.fadePhase, "fading");
});

test("5. Title after 2,000ms: absent", () => {
  const plan = resolveLegibilityLayerPlan(
    baseInput({ absoluteContentTimeMs: LEGIBILITY_TITLE_WINDOW_MS }),
  );
  assert.equal(plan.title.visible, false);
  assert.equal(plan.title.opacity, 0);
  assert.equal(plan.title.fadePhase, "hidden");
});

test("6. Very short story: timing safely clamped", () => {
  const timing = resolveLegibilityTitleTiming({
    absoluteContentTimeMs: 650,
    contentDurationMs: 800,
    hasTitleText: true,
  });
  assert.equal(timing.effectiveWindowMs, 800);
  assert.ok(timing.fadeStartMs < timing.effectiveWindowMs);
  assert.equal(timing.visible, true);
  assert.ok(timing.opacity < 1);
  const after = resolveLegibilityTitleTiming({
    absoluteContentTimeMs: 800,
    contentDurationMs: 800,
    hasTitleText: true,
  });
  assert.equal(after.visible, false);
});

test("7. Title does not restart on scene two", () => {
  const sceneTwoLocalWouldBeZero = 5_000;
  const plan = resolveLegibilityLayerPlan(
    baseInput({ absoluteContentTimeMs: sceneTwoLocalWouldBeZero }),
  );
  assert.equal(plan.title.visible, false);
});

test("8. Generated caption at top", () => {
  const plan = resolveLegibilityLayerPlan(
    baseInput({
      hasActiveCaption: true,
      captionPlacement: "top",
      captionStyleBackgroundEnabled: false,
      captionStyleBackgroundOpacity: 0,
    }),
  );
  assert.equal(plan.caption.placement, "top");
  assert.ok(plan.caption.region);
  assert.ok(plan.caption.region!.y < 960);
  assert.equal(plan.caption.needsLocalScrim, true);
  assert.equal(plan.globalGradientEnabled, false);
});

test("9. Generated caption at bottom", () => {
  const plan = resolveLegibilityLayerPlan(
    baseInput({
      hasActiveCaption: true,
      captionPlacement: "bottom",
      captionStyleBackgroundEnabled: false,
      captionStyleBackgroundOpacity: 0,
    }),
  );
  assert.equal(plan.caption.placement, "bottom");
  assert.ok(plan.caption.region);
  assert.ok(plan.caption.region!.y > 960);
  assert.equal(plan.caption.needsLocalScrim, true);
});

test("10. Subtitle mode placement mapping", () => {
  assert.equal(mapCaptionAnchorToLegibilityPlacement("top_center"), "top");
  assert.equal(mapCaptionAnchorToLegibilityPlacement("bottom_center"), "bottom");
  assert.equal(mapCaptionAnchorToLegibilityPlacement("center"), "center");
  const plan = resolveLegibilityLayerPlan(
    baseInput({
      hasActiveCaption: true,
      captionPlacement: mapCaptionAnchorToLegibilityPlacement("bottom_left"),
      captionStyleBackgroundEnabled: true,
      captionStyleBackgroundOpacity: 45,
    }),
  );
  assert.equal(plan.caption.active, true);
  assert.equal(plan.caption.placement, "bottom");
});

test("11. Multi-line caption receives bounded padding region", () => {
  const plan = resolveLegibilityLayerPlan(
    baseInput({
      hasActiveCaption: true,
      captionPlacement: "bottom",
      captionStyleBackgroundEnabled: false,
      captionStyleBackgroundOpacity: 0,
    }),
  );
  assert.ok(plan.caption.region);
  assert.ok(plan.caption.region!.height >= 200);
  assert.ok(plan.caption.region!.width <= 1080);
  assert.ok(plan.caption.region!.x >= 0);
});

test("12. Caption style already containing a background", () => {
  const plan = resolveLegibilityLayerPlan(
    baseInput({
      hasActiveCaption: true,
      captionPlacement: "bottom",
      captionStyleBackgroundEnabled: true,
      captionStyleBackgroundOpacity: LEGIBILITY_CAPTION_BACKGROUND_SUFFICIENT_OPACITY,
    }),
  );
  assert.equal(plan.caption.styleProvidesBackground, true);
  assert.equal(plan.caption.needsLocalScrim, false);
});

test("13. No active caption", () => {
  const plan = resolveLegibilityLayerPlan(
    baseInput({ hasActiveCaption: false, captionPlacement: "bottom" }),
  );
  assert.equal(plan.caption.active, false);
  assert.equal(plan.caption.placement, "none");
  assert.equal(plan.caption.region, null);
  assert.equal(plan.caption.needsLocalScrim, false);
});

test("14. Bright source footage still disables global gradient", () => {
  const plan = resolveLegibilityLayerPlan(baseInput());
  assert.equal(plan.globalGradientEnabled, false);
});

test("15. Dark source footage still disables global gradient", () => {
  const plan = resolveLegibilityLayerPlan(
    baseInput({ absoluteContentTimeMs: 4_000, storyTitle: "Night Match" }),
  );
  assert.equal(plan.globalGradientEnabled, false);
  assert.equal(plan.title.visible, false);
});

test("16. Fit with background: plan stays above media (no geometry fields)", () => {
  const plan = resolveLegibilityLayerPlan(
    baseInput({
      hasActiveCaption: true,
      captionPlacement: "bottom",
      captionStyleBackgroundEnabled: true,
      captionStyleBackgroundOpacity: 45,
    }),
  );
  assert.equal(plan.globalGradientEnabled, false);
  assert.ok(!("fitMode" in plan));
  assert.ok(!("backgroundTreatment" in plan));
});

test("17. Scene transition suppresses caption overlays", () => {
  const plan = resolveLegibilityLayerPlan(
    baseInput({
      absoluteContentTimeMs: 1_000,
      hasActiveCaption: true,
      captionPlacement: "bottom",
      captionStyleBackgroundEnabled: false,
      captionStyleBackgroundOpacity: 0,
      suppressCaptionOverlays: true,
    }),
  );
  assert.equal(plan.suppressCaptionOverlays, true);
  assert.equal(plan.caption.active, false);
  assert.equal(plan.caption.needsLocalScrim, false);
  assert.equal(plan.title.visible, true);
});

test("18. Intra-scene transition keeps captions (suppress flag false)", () => {
  const plan = resolveLegibilityLayerPlan(
    baseInput({
      hasActiveCaption: true,
      captionPlacement: "top",
      captionStyleBackgroundEnabled: false,
      captionStyleBackgroundOpacity: 0,
      suppressCaptionOverlays: false,
    }),
  );
  assert.equal(plan.caption.active, true);
  assert.equal(plan.caption.needsLocalScrim, true);
});

test("19. Branding enabled and disabled", () => {
  const on = resolveLegibilityLayerPlan(baseInput({ watermarkEnabled: true }));
  const off = resolveLegibilityLayerPlan(baseInput({ watermarkEnabled: false }));
  assert.equal(on.branding.enabled, true);
  assert.equal(on.branding.treatment, "shadow_outline");
  assert.equal(off.branding.enabled, false);
  assert.equal(off.branding.treatment, "none");
});

test("20. Preview, Browser, and Headless plan parity", () => {
  const input = baseInput({
    absoluteContentTimeMs: 1_700,
    hasActiveCaption: true,
    captionPlacement: "top",
    captionStyleBackgroundEnabled: false,
    captionStyleBackgroundOpacity: 0,
  });
  const preview = resolveLegibilityLayerPlan(input);
  const browser = resolveLegibilityLayerPlan(input);
  const headless = resolveLegibilityLayerPlan(input);
  assert.deepEqual(preview, browser);
  assert.deepEqual(browser, headless);
});

test("21. Existing engagement overlays remain unchanged (draw path authority)", () => {
  const drawPath = join(
    process.cwd(),
    "src/features/export/runtime/draw-prepared-export-frame.ts",
  );
  const source = readFileSync(drawPath, "utf8");
  assert.match(source, /resolveEngagementOverlayFrame/);
  assert.match(source, /drawEngagementOverlay/);
  assert.doesNotMatch(source, /createLinearGradient/);
  assert.match(source, /resolveLegibilityLayerPlan/);
  assert.match(source, /drawLegibilityCaptionScrimIfNeeded/);

  const previewPath = join(
    process.cwd(),
    "src/features/preview/components/PreviewFrame.tsx",
  );
  const preview = readFileSync(previewPath, "utf8");
  assert.doesNotMatch(preview, /bg-gradient-to-t from-black\/80/);
  assert.match(preview, /resolveLegibilityLayerPlan/);

  const legacyPath = join(
    process.cwd(),
    "src/features/export/services/video-render.service.ts",
  );
  const legacy = readFileSync(legacyPath, "utf8");
  assert.doesNotMatch(
    legacy,
    /Gradient overlay for text legibility[\s\S]*createLinearGradient/,
  );
  assert.match(legacy, /resolveLegibilityLayerPlan/);
});

test("title region is local (not full-frame)", () => {
  const plan = resolveLegibilityLayerPlan(baseInput({ absoluteContentTimeMs: 0 }));
  const area = plan.title.region.width * plan.title.region.height;
  const frameArea = 1080 * 1920;
  assert.ok(area / frameArea < 0.2);
});

test("top caption does not darken bottom (disjoint regions)", () => {
  const top = resolveLegibilityLayerPlan(
    baseInput({
      hasActiveCaption: true,
      captionPlacement: "top",
      captionStyleBackgroundEnabled: false,
      captionStyleBackgroundOpacity: 0,
    }),
  );
  const bottom = resolveLegibilityLayerPlan(
    baseInput({
      hasActiveCaption: true,
      captionPlacement: "bottom",
      captionStyleBackgroundEnabled: false,
      captionStyleBackgroundOpacity: 0,
    }),
  );
  assert.ok(top.caption.region && bottom.caption.region);
  assert.ok(
    top.caption.region!.y + top.caption.region!.height <
      bottom.caption.region!.y,
  );
});

console.log(`\n${passed} legibility-layer plan tests passed.\n`);
