/**
 * Caption background authority — one style contract for Preview / Browser / Headless.
 * Run: npm run test:caption-background-authority
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveCaptionAnimation } from "@/features/caption-animation";
import { applyCaptionLayoutToAllScenes, extractCopyableCaptionLayout } from "@/features/caption-layout-workflow";
import {
  buildSceneCaptionStylePatch,
  resolveCaptionBackgroundAuthority,
  resolveExportCaptionStyle,
  resolveExportCaptionStyleMetrics,
  resolvePreviewCaptionContainerStyle,
  resolvePreviewCaptionStyle,
  type CaptionStyle,
} from "@/features/caption-style";
import { buildExportManifest, composeCaptionAnimationOpacity } from "@/features/export/domain";
import { resolveEngagementOverlayCaptionSafePlacement } from "@/features/engagement-overlays/domain/resolve-engagement-overlay-caption-safe-placement";
import { resolveLegibilityLayerPlan } from "@/features/legibility-layer";
import { classifyStoryPatch } from "@/features/editor/story-patches";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function makeStory(
  sceneStyle?: Partial<CaptionStyle> | null,
  extras: Partial<FootieScene> = {},
  project?: Partial<FootieScript>,
): FootieScript {
  return syncFootieScript({
    title: "Caption background",
    narration: "Hello world from the pitch.",
    totalDuration: 4,
    ...project,
    scenes: [
      {
        id: "s1",
        start: 0,
        end: 4,
        duration: 4,
        startMs: 0,
        endMs: 4000,
        durationMs: 4000,
        subtitle: extras.subtitle ?? "Hello world from the pitch tonight",
        captionMode: "generated",
        captionStyle: sceneStyle ?? undefined,
        media: {
          type: "image",
          url: "https://example.com/a.jpg",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        },
        ...extras,
      },
    ],
  } as FootieScript);
}

function authorityFor(story: FootieScript) {
  const scene = story.scenes[0]!;
  return resolveCaptionBackgroundAuthority({
    sceneStyle: scene.captionStyle,
    projectStyle: story.defaultCaptionStyle,
    sceneLayout: scene.captionLayout,
    projectLayout: story.defaultCaptionLayout,
  });
}

function matchedAppearance(story: FootieScript) {
  const scene = story.scenes[0]!;
  const authority = authorityFor(story);
  const preview = resolvePreviewCaptionContainerStyle(scene, story);
  const exportStyle = resolveExportCaptionStyle(scene, story);
  const metrics = resolveExportCaptionStyleMetrics(exportStyle, 1);
  const plan = resolveLegibilityLayerPlan({
    absoluteContentTimeMs: 800,
    contentDurationMs: 4000,
    storyTitle: story.title,
    hasActiveCaption: true,
    captionPlacement: "bottom",
    captionStyleBackgroundEnabled: authority.backgroundEnabled,
    captionStyleBackgroundOpacity: authority.effectiveOpacityPercent,
    watermarkEnabled: true,
  });
  return { authority, preview, metrics, plan, exportStyle };
}

console.log("\ncaption-background-authority\n");

test("1. Background disabled with stored opacity 45", () => {
  const story = makeStory({ backgroundEnabled: false, backgroundOpacity: 45 });
  const { authority, preview, metrics, plan } = matchedAppearance(story);
  assert.equal(authority.backgroundEnabled, false);
  assert.equal(authority.storedOpacityPercent, 45);
  assert.equal(authority.effectiveOpacityPercent, 0);
  assert.equal(authority.drawsFill, false);
  assert.equal(preview.backgroundColor, "transparent");
  assert.equal(metrics.drawsFill, false);
  assert.equal(metrics.backgroundAlpha, 0);
  assert.equal(plan.caption.needsLocalScrim, false);
  assert.equal(plan.caption.backgroundIntent, "explicit-transparent");
});

test("2. Background disabled with stored opacity 0", () => {
  const story = makeStory({ backgroundEnabled: false, backgroundOpacity: 0 });
  const { authority, metrics } = matchedAppearance(story);
  assert.equal(authority.backgroundEnabled, false);
  assert.equal(authority.effectiveOpacityPercent, 0);
  assert.equal(metrics.drawsFill, false);
});

test("3. Background enabled with opacity 0", () => {
  const story = makeStory({ backgroundEnabled: true, backgroundOpacity: 0 });
  const { authority, preview, metrics, plan } = matchedAppearance(story);
  assert.equal(authority.backgroundEnabled, true);
  assert.equal(authority.effectiveOpacityPercent, 0);
  assert.equal(authority.drawsFill, false);
  assert.equal(preview.backgroundColor, "transparent");
  assert.equal(metrics.backgroundAlpha, 0);
  assert.equal(plan.caption.needsLocalScrim, false);
});

test("4–9. Enabled opacities 1 / 10 / 29 / 30 / 45 / 100 stay exact", () => {
  for (const opacity of [1, 10, 29, 30, 45, 100]) {
    const story = makeStory({ backgroundEnabled: true, backgroundOpacity: opacity });
    const { authority, preview, metrics, plan } = matchedAppearance(story);
    assert.equal(authority.effectiveOpacityPercent, opacity);
    assert.equal(authority.effectiveAlpha, opacity / 100);
    assert.equal(authority.drawsFill, true);
    assert.match(String(preview.backgroundColor), new RegExp(authority.effectiveAlpha.toFixed(3)));
    assert.equal(metrics.backgroundAlpha, opacity / 100);
    assert.equal(metrics.drawsBorder, false);
    assert.equal(metrics.drawsBlur, false);
    assert.equal(preview.border, "none");
    assert.equal(preview.backdropFilter, "none");
    assert.equal(plan.caption.needsLocalScrim, false);
    assert.equal(plan.caption.styleProvidesBackground, true);
    assert.equal(plan.caption.backgroundIntent, "enabled");
  }
});

test("10. Scene style override versus project default", () => {
  const story = makeStory(
    { backgroundEnabled: true, backgroundOpacity: 10 },
    {},
    { defaultCaptionStyle: { backgroundEnabled: true, backgroundOpacity: 45 } },
  );
  assert.equal(authorityFor(story).effectiveOpacityPercent, 10);
  assert.equal(authorityFor(story).opacitySource, "scene-style");
});

test("11. Explicit scene disable versus enabled project default", () => {
  const story = makeStory(
    { backgroundEnabled: false, backgroundOpacity: 45 },
    {},
    { defaultCaptionStyle: { backgroundEnabled: true, backgroundOpacity: 45 } },
  );
  const authority = authorityFor(story);
  assert.equal(authority.backgroundEnabled, false);
  assert.equal(authority.effectiveOpacityPercent, 0);
  assert.equal(authority.enabledSource, "scene-style");
});

test("12. Explicit project disable with no scene override", () => {
  const story = makeStory(undefined, {}, {
    defaultCaptionStyle: { backgroundEnabled: false, backgroundOpacity: 45 },
  });
  const authority = authorityFor(story);
  assert.equal(authority.backgroundEnabled, false);
  assert.equal(authority.effectiveOpacityPercent, 0);
  assert.equal(authority.enabledSource, "project-style");
});

test("13. Legacy layout opacity with no stored caption style", () => {
  const story = makeStory(undefined, {
    captionLayout: { version: 2, anchor: "bottom_center", backgroundOpacity: 12 },
  });
  const authority = authorityFor(story);
  assert.equal(authority.opacitySource, "legacy-layout-scene");
  assert.equal(authority.effectiveOpacityPercent, 12);
  assert.equal(authority.backgroundEnabled, true);
});

test("14. Explicit caption style opacity wins over legacy layout opacity", () => {
  const story = makeStory(
    { backgroundEnabled: true, backgroundOpacity: 10 },
    { captionLayout: { version: 2, anchor: "bottom_center", backgroundOpacity: 80 } },
  );
  assert.equal(authorityFor(story).effectiveOpacityPercent, 10);
  assert.equal(authorityFor(story).opacitySource, "scene-style");
});

test("15. New style edits do not write layout opacity", () => {
  const patch = buildSceneCaptionStylePatch({
    version: 1,
    backgroundEnabled: false,
    backgroundOpacity: 0,
  });
  assert.equal("captionLayout" in patch, false);
  assert.ok(patch.captionStyle);
  assert.equal(patch.captionStyle.backgroundEnabled, false);
});

test("16. Caption Layout UI no longer exposes Background Opacity", () => {
  const control = readSrc("src/features/caption-engine/CaptionLayoutControl.tsx");
  assert.doesNotMatch(control, /Background Opacity/);
  assert.doesNotMatch(control, /caption-layout-opacity/);
  assert.match(control, /Safe Area Enabled/);
});

test("17. Caption Style UI hides Color/Opacity when Background is off", () => {
  const control = readSrc("src/features/caption-engine/CaptionStyleControl.tsx");
  assert.match(control, />\s*Background\s*</);
  assert.match(control, /backgroundEnabled \? \(/);
  assert.match(control, /No box will appear behind captions in Preview or export/);
  assert.match(control, />\s*Color\s*</);
  assert.match(control, />\s*Opacity\s*</);
});

test("18–19. Preview has no background box when disabled or opacity zero", () => {
  for (const style of [
    { backgroundEnabled: false, backgroundOpacity: 45 },
    { backgroundEnabled: true, backgroundOpacity: 0 },
  ] as const) {
    const preview = resolvePreviewCaptionContainerStyle({ captionStyle: { ...style } });
    assert.equal(preview.backgroundColor, "transparent");
    assert.equal(preview.border, "none");
    assert.equal(preview.backdropFilter, "none");
    assert.equal(preview.boxShadow, "none");
  }
});

test("20–21. Browser and Headless canvas draw no box, border, or scrim when disabled", () => {
  const story = makeStory({ backgroundEnabled: false, backgroundOpacity: 45 });
  const { metrics, plan } = matchedAppearance(story);
  assert.equal(metrics.drawsFill, false);
  assert.equal(metrics.drawsBorder, false);
  assert.equal(metrics.boxBorderColor, "transparent");
  assert.equal(plan.caption.needsLocalScrim, false);
  const canvas = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  assert.match(canvas, /if \(!styleMetrics\.drawsFill \|\| alpha <= 0\)/);
  assert.doesNotMatch(canvas, /ctx\.stroke\(\);/);
  const prepared = readSrc("src/features/export/runtime/draw-prepared-export-frame.ts");
  const legacy = readSrc("src/features/export/services/video-render.service.ts");
  assert.match(prepared, /drawLegibilityCaptionScrimIfNeeded/);
  assert.match(legacy, /drawLegibilityCaptionScrimIfNeeded/);
  assert.match(prepared, /captionStyleFromManifest/);
});

test("22. Low opacity is not upgraded by the legibility layer", () => {
  const { plan } = matchedAppearance(
    makeStory({ backgroundEnabled: true, backgroundOpacity: 10 }),
  );
  assert.equal(plan.caption.needsLocalScrim, false);
  assert.equal(plan.caption.styleProvidesBackground, true);
  assert.equal(plan.caption.backgroundIntent, "enabled");
});

test("23. Text, shadow, and outline still resolve when background is off", () => {
  const story = makeStory({
    backgroundEnabled: false,
    outlineEnabled: true,
    outlineColor: "#111111",
    outlineWidth: 3,
    shadowEnabled: true,
    shadowBlur: 8,
  });
  const exportStyle = resolveExportCaptionStyle(story.scenes[0]!, story);
  assert.equal(exportStyle.resolvedStyle.outlineEnabled, true);
  assert.equal(exportStyle.resolvedStyle.shadowEnabled, true);
  assert.equal(exportStyle.resolvedStyle.backgroundEnabled, false);
});

test("24. Title scrim remains unchanged", () => {
  const plan = resolveLegibilityLayerPlan({
    absoluteContentTimeMs: 0,
    contentDurationMs: 8000,
    storyTitle: "Derby Winner",
    hasActiveCaption: true,
    captionPlacement: "bottom",
    captionStyleBackgroundEnabled: false,
    captionStyleBackgroundOpacity: 0,
    watermarkEnabled: true,
  });
  assert.equal(plan.title.visible, true);
  assert.ok(plan.title.region.width > 0);
  assert.equal(plan.caption.needsLocalScrim, false);
});

test("25. Caption animation remains unchanged", () => {
  const { resolvedAnimation } = resolveCaptionAnimation({
    sceneSubtitleEffect: "fade-up",
  });
  assert.equal(resolvedAnimation.preset, "fade");
  const canvas = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  assert.match(canvas, /resolveCaptionAnimationTranslateYPx/);
});

test("26. Caption placement remains unchanged", () => {
  const overlay = readSrc("src/features/caption-layout-drag/CaptionPreviewOverlay.tsx");
  assert.match(overlay, /data-preview-caption-placement-surface/);
  assert.match(overlay, /resolvePreviewCaptionLayoutForScene/);
});

test("27. CTA caption-safe placement remains unchanged", () => {
  const requested = { x: 200, y: 1600, width: 680, height: 112 };
  const plan = resolveEngagementOverlayCaptionSafePlacement({
    requested,
    frameWidth: 1080,
    frameHeight: 1920,
    captionCollision: {
      present: true,
      sceneLayout: { version: 2, anchor: "bottom_center" },
    },
  });
  assert.ok(plan.applied.width === requested.width);
  assert.ok(plan.applied.height === requested.height);
  const source = readSrc(
    "src/features/engagement-overlays/domain/resolve-engagement-overlay-caption-safe-placement.ts",
  );
  assert.match(source, /resolveCaptionLayout/);
});

test("28. JSON/manifest round trip preserves false and zero", () => {
  const story = makeStory({ backgroundEnabled: false, backgroundOpacity: 0 });
  const caption = buildExportManifest({ story }).captions[0]!;
  assert.equal(caption.style.backgroundEnabled, false);
  assert.equal(caption.style.backgroundOpacity, 0);
  const roundTrip = JSON.parse(JSON.stringify(caption.style)) as {
    backgroundEnabled: boolean;
    backgroundOpacity: number;
  };
  assert.equal(roundTrip.backgroundEnabled, false);
  assert.equal(roundTrip.backgroundOpacity, 0);
  assert.equal(roundTrip.backgroundEnabled ?? true, false);
  assert.equal(roundTrip.backgroundOpacity ?? 45, 0);
  assert.equal(roundTrip.backgroundEnabled || true, true);
  assert.equal(roundTrip.backgroundOpacity || 45, 45);
});

test("29. Existing enabled-background stories remain visually compatible", () => {
  const story = makeStory({ backgroundEnabled: true, backgroundOpacity: 45 });
  const { authority, metrics } = matchedAppearance(story);
  assert.equal(authority.effectiveOpacityPercent, 45);
  assert.equal(metrics.backgroundAlpha, 0.45);
  assert.equal(metrics.drawsFill, true);
});

test("30. Copy/paste/apply-all layout no longer creates conflicting appearance", () => {
  const copied = extractCopyableCaptionLayout(
    { version: 2, anchor: "center", backgroundOpacity: 55 },
    undefined,
  );
  assert.equal("backgroundOpacity" in copied, false);
  const source = makeStory(undefined, {
    captionLayout: { version: 2, anchor: "top_center", backgroundOpacity: 55 },
  });
  const withPeer = syncFootieScript({
    ...source,
    scenes: [
      source.scenes[0]!,
      {
        ...source.scenes[0]!,
        id: "s2",
        captionLayout: { version: 2, anchor: "bottom_center", backgroundOpacity: 20 },
      },
    ],
  } as FootieScript);
  const applied = applyCaptionLayoutToAllScenes(withPeer, "s1");
  assert.equal(applied.scenes[0]?.captionLayout?.anchor, "top_center");
  assert.equal(applied.scenes[1]?.captionLayout?.anchor, "top_center");
  assert.equal(applied.scenes[0]?.captionLayout?.backgroundOpacity, 55);
  assert.equal(applied.scenes[1]?.captionLayout?.backgroundOpacity, 20);
});

test("31. Save/reload preserves the effective background choice", () => {
  const story = makeStory({ backgroundEnabled: false, backgroundOpacity: 45 });
  const reloaded = JSON.parse(JSON.stringify(story)) as FootieScript;
  assert.deepEqual(authorityFor(reloaded), authorityFor(story));
  assert.equal(authorityFor(reloaded).backgroundEnabled, false);
});

test("32. No narration, voice, media timing, or export duration change", () => {
  const prev = makeStory({ backgroundEnabled: true, backgroundOpacity: 45 });
  const next = makeStory({ backgroundEnabled: false, backgroundOpacity: 45 });
  const classification = classifyStoryPatch(prev, next);
  assert.ok(classification.classes.includes("caption_style"));
  assert.equal(prev.narration, next.narration);
  assert.equal(prev.scenes[0]?.durationMs, next.scenes[0]?.durationMs);
  assert.equal(prev.scenes[0]?.startMs, next.scenes[0]?.startMs);
  const prevManifest = buildExportManifest({ story: prev });
  const nextManifest = buildExportManifest({ story: next });
  assert.equal(prevManifest.project.durationMs, nextManifest.project.durationMs);
});

test("Matched frames share fill/border/blur/opacity/padding/radius", () => {
  const cases: Array<{ label: string; style: Partial<CaptionStyle>; lines: string }> = [
    { label: "off", style: { backgroundEnabled: false, backgroundOpacity: 45 }, lines: "One line" },
    { label: "zero", style: { backgroundEnabled: true, backgroundOpacity: 0 }, lines: "One line" },
    { label: "ten", style: { backgroundEnabled: true, backgroundOpacity: 10 }, lines: "One line" },
    {
      label: "forty-five multiline",
      style: { backgroundEnabled: true, backgroundOpacity: 45 },
      lines: "Hello world from the pitch tonight under the lights",
    },
  ];
  for (const entry of cases) {
    const story = makeStory(entry.style, { subtitle: entry.lines });
    const { authority, preview, metrics, exportStyle } = matchedAppearance(story);
    const previewResolved = resolvePreviewCaptionStyle(story.scenes[0]!, story).resolvedStyle;
    assert.equal(preview.border, "none", entry.label);
    assert.equal(preview.backdropFilter, "none", entry.label);
    assert.equal(preview.WebkitBackdropFilter, "none", entry.label);
    assert.equal(metrics.drawsBorder, false, entry.label);
    assert.equal(metrics.drawsBlur, false, entry.label);
    assert.equal(previewResolved.paddingX, exportStyle.resolvedStyle.paddingX, entry.label);
    assert.equal(previewResolved.paddingY, exportStyle.resolvedStyle.paddingY, entry.label);
    assert.equal(previewResolved.cornerRadius, exportStyle.resolvedStyle.cornerRadius, entry.label);
    assert.equal(previewResolved.backgroundOpacity, exportStyle.resolvedStyle.backgroundOpacity, entry.label);
    assert.equal(metrics.padX, exportStyle.resolvedStyle.paddingX, entry.label);
    assert.equal(metrics.cornerRadius, exportStyle.resolvedStyle.cornerRadius, entry.label);
    if (!authority.drawsFill) {
      assert.equal(preview.backgroundColor, "transparent", entry.label);
      assert.equal(metrics.backgroundAlpha, 0, entry.label);
    } else {
      assert.equal(metrics.backgroundAlpha, authority.effectiveAlpha, entry.label);
    }
  }
});

test("Idle and animated captions keep the same container contract", () => {
  const story = makeStory({ backgroundEnabled: true, backgroundOpacity: 10 });
  const idle = matchedAppearance(story);
  const animatedAlpha = composeCaptionAnimationOpacity(idle.metrics.backgroundAlpha, 0.4);
  assert.equal(idle.metrics.backgroundAlpha, 0.1);
  assert.ok(Math.abs(animatedAlpha - 0.04) < 1e-9);
  assert.equal(idle.metrics.drawsFill, true);
  assert.equal(idle.metrics.drawsBorder, false);
  assert.equal(idle.metrics.drawsBlur, false);
  const off = matchedAppearance(makeStory({ backgroundEnabled: false, backgroundOpacity: 45 }));
  assert.equal(composeCaptionAnimationOpacity(off.metrics.backgroundAlpha, 1), 0);
  assert.equal(off.metrics.drawsFill, false);
});

test("Preview combined style always applies shared authority, including drag", () => {
  const overlay = readSrc("src/features/caption-layout-drag/CaptionPreviewOverlay.tsx");
  assert.match(overlay, /resolveCaptionBackgroundAuthority/);
  assert.match(overlay, /data-caption-container-blur="false"/);
  assert.match(overlay, /data-caption-container-border="false"/);
  const adapters = readSrc("src/features/caption-style/caption-style.adapters.ts");
  assert.doesNotMatch(adapters, /if \(!usesStoredStyle\) \{\n    return layoutPillStyle;/);
});

console.log(`\ncaption-background-authority: ${passed} passed\n`);
