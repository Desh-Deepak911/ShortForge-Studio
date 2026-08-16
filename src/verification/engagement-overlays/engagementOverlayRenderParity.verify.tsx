/**
 * Engagement-overlay preview/canvas plan parity verification.
 * Run via: npm run test:engagement-overlays
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  drawEngagementOverlay,
  EngagementOverlayPreview,
  resolveEngagementOverlayFrame,
} from "@/features/engagement-overlays";
import type { SceneEngagementOverlayV1 } from "@/features/visual-retention/domain/visual-retention-extension-contracts";

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function overlay(): SceneEngagementOverlayV1 {
  return {
    version: 1,
    id: "engagement-parity",
    kind: "combined",
    startOffsetMs: 0,
    durationMs: 2500,
    position: "top-right",
    presetId: "compact-pill-v1",
  };
}

function main(): void {
  console.log("\nengagement-overlay-render-parity\n");

  test("preview and canvas consume the same resolveEngagementOverlayFrame plan", () => {
    const plan = resolveEngagementOverlayFrame({
      overlay: overlay(),
      sceneDurationMs: 5000,
      sceneElapsedMs: 1000,
      frameWidth: 1080,
      frameHeight: 1920,
    });
    assert.equal(plan.visible, true);
    assert.equal(plan.phase, "hold");
    assert.equal(plan.segments.length, 3);
    assert.equal(plan.segments.filter((segment) => segment.active).length, 1);

    const markup = renderToStaticMarkup(
      createElement(EngagementOverlayPreview, { frame: plan }),
    );
    assert.match(markup, /data-engagement-overlay-preview="true"/);
    assert.match(markup, /data-engagement-overlay-kind="combined"/);
    assert.match(markup, /data-engagement-overlay-segment=/);
    assert.match(markup, /Like/);
    assert.match(markup, /Share/);
    assert.match(markup, /Subscribe/);
    assert.match(markup, /pointer-events-none/);
    assert.doesNotMatch(markup, /<button|<a |tabIndex|contentEditable/i);

    const confirmPlan = resolveEngagementOverlayFrame({
      overlay: overlay(),
      sceneDurationMs: 5000,
      sceneElapsedMs: 1900,
      frameWidth: 1080,
      frameHeight: 1920,
    });
    assert.equal(confirmPlan.segments[2]!.confirmation, true);
    const confirmMarkup = renderToStaticMarkup(
      createElement(EngagementOverlayPreview, { frame: confirmPlan }),
    );
    assert.match(confirmMarkup, /Subscribe/);
    assert.doesNotMatch(confirmMarkup, /Subscribed/);
    assert.match(
      confirmMarkup,
      /data-engagement-overlay-segment-confirmation="true"/,
    );

    const draw = readSrc(
      "src/features/engagement-overlays/render/draw-engagement-overlay.ts",
    );
    const preview = readSrc(
      "src/features/engagement-overlays/preview/EngagementOverlayPreview.tsx",
    );
    assert.match(draw, /ResolvedEngagementOverlayFrame/);
    assert.match(draw, /frame\.segments/);
    assert.match(draw, /segment\.confirmation/);
    assert.match(draw, /segment\.pulseScale/);
    assert.match(draw, /segment\.glowOpacity/);
    assert.match(draw, /chrome\.columnBoxes/);
    assert.match(preview, /resolveEngagementOverlayFrame/);
    assert.match(preview, /captionCollision: props.captionCollision/);
    assert.match(preview, /frame\.segments/);
    assert.match(preview, /segment\.pulseScale/);
    assert.match(preview, /segment\.glowOpacity/);
    assert.match(preview, /z-\[2\]/);
    assert.doesNotMatch(draw, /1 \+ 0\.07 \* segment\.emphasis/);
    assert.doesNotMatch(preview, /1 \+ 0\.07 \* segment\.emphasis/);
    assert.doesNotMatch(preview, /justify-evenly/);
    assert.doesNotMatch(
      draw,
      /Math\.floor\([^)]*beat|setTimeout|requestAnimationFrame|Date\.now/,
    );
    assert.doesNotMatch(
      preview,
      /useEffect|useState|setTimeout|requestAnimationFrame|Date\.now/,
    );
  });

  test("canvas save/restore isolates alpha/filter/font/shadow/transform fields", () => {
    const calls: string[] = [];
    type MockCtx = {
      globalAlpha: number;
      globalCompositeOperation: string;
      filter: string;
      shadowBlur: number;
      shadowColor: string;
      shadowOffsetX: number;
      shadowOffsetY: number;
      fillStyle: string;
      strokeStyle: string;
      lineWidth: number;
      lineCap: string;
      lineJoin: string;
      font: string;
      textAlign: string;
      textBaseline: string;
      save: () => void;
      restore: () => void;
      beginPath: () => void;
      moveTo: () => void;
      lineTo: () => void;
      quadraticCurveTo: () => void;
      closePath: () => void;
      fill: () => void;
      stroke: () => void;
      fillText: () => void;
      measureText: () => { width: number };
      bezierCurveTo: () => void;
      arc: () => void;
      translate: () => void;
      scale: () => void;
      createLinearGradient: () => { addColorStop: () => void };
    };
    const stack: Array<Partial<MockCtx>> = [];
    const ctx: MockCtx = {
      save() {
        calls.push("save");
        stack.push({
          globalAlpha: ctx.globalAlpha,
          globalCompositeOperation: ctx.globalCompositeOperation,
          filter: ctx.filter,
          shadowBlur: ctx.shadowBlur,
          shadowColor: ctx.shadowColor,
          font: ctx.font,
          textAlign: ctx.textAlign,
          textBaseline: ctx.textBaseline,
        });
      },
      restore() {
        calls.push("restore");
        const prev = stack.pop();
        if (!prev) return;
        Object.assign(ctx, prev);
      },
      beginPath() {},
      moveTo() {},
      lineTo() {},
      quadraticCurveTo() {},
      closePath() {},
      fill() {},
      stroke() {},
      fillText() {},
      measureText() {
        return { width: 40 };
      },
      bezierCurveTo() {},
      arc() {},
      translate() {},
      scale() {},
      createLinearGradient() {
        return { addColorStop() {} };
      },
      globalAlpha: 0.25,
      globalCompositeOperation: "multiply",
      filter: "blur(2px)",
      shadowBlur: 8,
      shadowColor: "red",
      shadowOffsetX: 2,
      shadowOffsetY: 2,
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      lineCap: "butt",
      lineJoin: "miter",
      font: "10px comic",
      textAlign: "right",
      textBaseline: "top",
    };

    const plan = resolveEngagementOverlayFrame({
      overlay: overlay(),
      sceneDurationMs: 5000,
      sceneElapsedMs: 1000,
      frameWidth: 1080,
      frameHeight: 1920,
    });
    drawEngagementOverlay(ctx as unknown as CanvasRenderingContext2D, plan);
    assert.ok(calls.length >= 2);
    assert.equal(calls[0], "save");
    assert.equal(calls[calls.length - 1], "restore");
    assert.equal(
      calls.filter((call) => call === "save").length,
      calls.filter((call) => call === "restore").length,
    );
    // Outer card save/restore plus one nested pair per segment.
    assert.ok(calls.filter((call) => call === "save").length >= 4);
    assert.equal(ctx.globalAlpha, 0.25);
    assert.equal(ctx.filter, "blur(2px)");
    assert.equal(ctx.shadowBlur, 8);
    assert.equal(ctx.font, "10px comic");
    assert.equal(ctx.textAlign, "right");

    const drawSrc = readSrc(
      "src/features/engagement-overlays/render/draw-engagement-overlay.ts",
    );
    assert.match(drawSrc, /shadowBlur\s*=\s*0/);
    assert.match(drawSrc, /filter\s*=\s*["']none["']/);
    assert.match(drawSrc, /globalCompositeOperation/);
    assert.match(drawSrc, /ENGAGEMENT_OVERLAY_STYLE/);
  });

  test("caption z-order contract: engagement below captions in preview and export", () => {
    const preview = readSrc("src/features/preview/components/VideoPreview.tsx");
    const draw = readSrc(
      "src/features/export/runtime/draw-prepared-export-frame.ts",
    );
    const interaction = readSrc(
      "src/features/preview/utils/preview-interaction-layer.utils.ts",
    );
    assert.match(preview, /EngagementOverlayPreview/);
    assert.match(preview, /SubtitleOverlay/);
    const engagementAt = preview.indexOf("<EngagementOverlayPreview");
    const subtitleAt = preview.indexOf("<SubtitleOverlay");
    assert.ok(engagementAt >= 0 && subtitleAt > engagementAt);
    assert.match(interaction, /z-\[4\]/);
    assert.match(draw, /drawEngagementOverlay/);
    assert.ok(
      draw.indexOf("drawEngagementOverlay") <
        draw.indexOf("drawExportSubtitlesCaption"),
    );
  });

  test("image/video and mixed-media independence from item selection", () => {
    const controls = readSrc(
      "src/features/engagement-overlays/editor/EngagementOverlayControls.tsx",
    );
    const inspector = readSrc(
      "src/features/editor/components/StudioSceneInspector.tsx",
    );
    assert.doesNotMatch(controls, /selectedMediaItemId/);
    assert.doesNotMatch(controls, /requiresMediaItemSelection/);
    assert.match(inspector, /Scene-scoped CTA/);
    assert.match(inspector, /EngagementOverlayControls/);
  });

  test("Browser/Headless share prepareExportFromManifest engagement flag", () => {
    const plan = readSrc(
      "src/features/export/runtime/prepare-export-from-manifest.ts",
    );
    const chunk = readSrc(
      "src/features/export/chunking/render-export-chunk.ts",
    );
    assert.match(plan, /engagementOverlaysEnabled/);
    assert.match(plan, /EXPORT_RENDERER_CAPABILITY_ENGAGEMENT_OVERLAYS/);
    assert.match(chunk, /drawPreparedExportFrame/);
  });

  test("deterministic local primitives: shared tokens, fixed labels, no remote assets", () => {
    const draw = readSrc(
      "src/features/engagement-overlays/render/draw-engagement-overlay.ts",
    );
    const preview = readSrc(
      "src/features/engagement-overlays/preview/EngagementOverlayPreview.tsx",
    );
    const presets = readSrc(
      "src/features/engagement-overlays/domain/engagement-overlay.presets.ts",
    );
    assert.match(draw, /SHORTFORGE_MOTION_FONT_STACK/);
    assert.match(preview, /SHORTFORGE_MOTION_FONT_STACK/);
    assert.match(preview, /pointer-events-none/);
    const heartDraw = draw.slice(
      draw.indexOf("function drawHeartIcon"),
      draw.indexOf("function drawShareIcon"),
    );
    assert.match(heartDraw, /ctx\.stroke\(\)/);
    assert.doesNotMatch(heartDraw, /ctx\.fill\(\)/);
    assert.doesNotMatch(draw, /drawBellIcon|"bell"/);
    assert.doesNotMatch(preview, /fill="currentColor"|drawBellIcon|"bell"/);
    assert.match(preview, /fill: "none"/);
    assert.match(presets, /"Like"|"Share"|"Subscribe"/);
    assert.doesNotMatch(draw, /https?:\/\/|emoji|twemoji|youtu\.be|instagram/i);
    assert.doesNotMatch(
      preview.replaceAll("http://www.w3.org/1999/xhtml", ""),
      /https?:\/\/|emoji|twemoji|youtu\.be|instagram/i,
    );
    assert.doesNotMatch(presets, /contentEditable|customSvg|fetch\(|https?:\/\//i);

    const plan = resolveEngagementOverlayFrame({
      overlay: overlay(),
      sceneDurationMs: 5000,
      sceneElapsedMs: 1000,
      frameWidth: 1080,
      frameHeight: 1920,
    });
    assert.deepEqual(plan.labels, ["Like", "Share", "Subscribe"]);
    assert.deepEqual(plan.iconTokens, ["heart", "share", "circle-plus"]);
    assert.equal(plan.segments.length, 3);
    assert.match(presets, /ENGAGEMENT_OVERLAY_STYLE/);
    assert.match(presets, /cardFill/);
    assert.match(presets, /accentFill/);
    assert.doesNotMatch(presets, /from ["']@\/features\/brand-sting/);
    assert.doesNotMatch(draw, /from ["']@\/features\/brand-sting/);
    assert.doesNotMatch(preview, /from ["']@\/features\/brand-sting/);
  });

  test("preview markup uses equal columns, outlined icons, and Subscribe", () => {
    const hold = resolveEngagementOverlayFrame({
      overlay: overlay(),
      sceneDurationMs: 5000,
      sceneElapsedMs: 1000,
      frameWidth: 1080,
      frameHeight: 1920,
    });
    const markup = renderToStaticMarkup(
      createElement(EngagementOverlayPreview, { frame: hold }),
    );
    assert.match(markup, /data-engagement-overlay-column="0"/);
    assert.match(markup, /data-engagement-overlay-column="1"/);
    assert.match(markup, /data-engagement-overlay-column="2"/);
    assert.match(markup, /data-engagement-overlay-separator="0"/);
    assert.match(markup, /Like/);
    assert.match(markup, /Share/);
    assert.match(markup, /Subscribe/);
    assert.doesNotMatch(markup, /Subscribed/);
    const widths = [...markup.matchAll(/data-engagement-overlay-column-width="([^"]+)"/g)].map(
      (match) => Number(match[1]),
    );
    assert.equal(widths.length, 3);
    assert.ok(widths.every((width) => Math.abs(width - widths[0]!) < 1e-9));

    const single = resolveEngagementOverlayFrame({
      overlay: { ...overlay(), kind: "subscribe" },
      sceneDurationMs: 5000,
      sceneElapsedMs: 1000,
      frameWidth: 1080,
      frameHeight: 1920,
    });
    const singleMarkup = renderToStaticMarkup(
      createElement(EngagementOverlayPreview, { frame: single }),
    );
    assert.match(singleMarkup, /data-engagement-overlay-column="0"/);
    assert.doesNotMatch(singleMarkup, /data-engagement-overlay-column="1"/);
    assert.doesNotMatch(singleMarkup, /data-engagement-overlay-separator=/);
    assert.match(singleMarkup, /Subscribe/);
    assert.doesNotMatch(singleMarkup, /Like|Share|Subscribed/);
  });

  test("preview scales output-space chrome through an SVG viewBox, not phone CSS pixels", () => {
    const hold = resolveEngagementOverlayFrame({
      overlay: overlay(),
      sceneDurationMs: 5000,
      sceneElapsedMs: 1000,
      frameWidth: 1080,
      frameHeight: 1920,
    });
    const markup = renderToStaticMarkup(
      createElement(EngagementOverlayPreview, { frame: hold }),
    );
    const previewSrc = readSrc(
      "src/features/engagement-overlays/preview/EngagementOverlayPreview.tsx",
    );
    const drawSrc = readSrc(
      "src/features/engagement-overlays/render/draw-engagement-overlay.ts",
    );
    const outer = markup.match(
      /<div[^>]*data-engagement-overlay-preview="true"[^>]*>/,
    )?.[0];
    assert.ok(outer);
    assert.doesNotMatch(
      outer,
      /font-size|border-radius|gap:|width:\s*\d+px|height:\s*\d+px/,
    );
    assert.match(outer, /width:\s*[\d.]+%/);
    assert.match(outer, /height:\s*[\d.]+%/);
    assert.match(
      markup,
      new RegExp(
        `viewBox="0 0 ${hold.layout.width} ${hold.layout.height}"`,
      ),
    );
    assert.match(markup, /data-engagement-overlay-surface="output-space"/);
    const beforeSurface = markup.slice(
      0,
      markup.indexOf('data-engagement-overlay-surface="output-space"'),
    );
    assert.doesNotMatch(
      beforeSurface,
      /font-size|border-radius:\s*[\d.]+px|gap:\s*[\d.]+px/,
    );
    assert.match(markup, /width="100%"/);
    assert.match(markup, /height="100%"/);
    assert.match(markup, /<foreignObject/);
    assert.match(previewSrc, /viewBox=\{`0 0 \$\{layout\.width\} \$\{layout\.height\}`\}/);
    assert.doesNotMatch(
      previewSrc,
      /ResizeObserver|matchMedia|requestAnimationFrame|@media/,
    );

    function overlayCssWidth(phoneWidth: number): number {
      return (hold.layout.width / 1080) * phoneWidth;
    }
    const phones = [220, 260, 360] as const;
    const renderedFonts = phones.map(
      (phoneWidth) =>
        hold.chrome.fontSize * (overlayCssWidth(phoneWidth) / hold.layout.width),
    );
    const renderedIcons = phones.map(
      (phoneWidth) =>
        hold.chrome.iconSize * (overlayCssWidth(phoneWidth) / hold.layout.width),
    );
    for (let index = 1; index < phones.length; index += 1) {
      assert.ok(
        Math.abs(
          renderedFonts[index]! / overlayCssWidth(phones[index]!) -
            renderedFonts[0]! / overlayCssWidth(phones[0]!),
        ) < 1e-12,
      );
      assert.ok(
        Math.abs(
          renderedIcons[index]! / overlayCssWidth(phones[index]!) -
            renderedIcons[0]! / overlayCssWidth(phones[0]!),
        ) < 1e-12,
      );
    }
    assert.ok(
      Math.abs(overlayCssWidth(520) / overlayCssWidth(260) - 2) < 1e-12,
    );
    assert.ok(
      Math.abs(renderedFonts[1]! * (520 / 260) - hold.chrome.fontSize * (overlayCssWidth(520) / hold.layout.width)) <
        1e-12,
    );
    assert.notEqual(renderedFonts[1], hold.chrome.fontSize);

    for (const size of ["small", "medium", "large"] as const) {
      const sized = resolveEngagementOverlayFrame({
        overlay: { ...overlay(), size },
        sceneDurationMs: 5000,
        sceneElapsedMs: 1000,
        frameWidth: 1080,
        frameHeight: 1920,
      });
      const sizedMarkup = renderToStaticMarkup(
        createElement(EngagementOverlayPreview, { frame: sized }),
      );
      assert.match(
        sizedMarkup,
        new RegExp(`viewBox="0 0 ${sized.layout.width} ${sized.layout.height}"`),
      );
      assert.match(sizedMarkup, /Subscribe/);
      assert.doesNotMatch(sizedMarkup, /Subscribed/);
    }

    assert.doesNotMatch(drawSrc, /foreignObject|viewBox/);
    assert.match(drawSrc, /chrome\.fontSize/);
    assert.match(drawSrc, /chrome\.iconSize/);
  });

  test("two CTA previews use distinct matched SVG fill ids that ignore seek", () => {
    const preview = readSrc(
      "src/features/engagement-overlays/preview/EngagementOverlayPreview.tsx",
    );
    assert.match(preview, /useId\(/);
    assert.doesNotMatch(preview, /Date\.now|Math\.random|requestAnimationFrame/);
    assert.doesNotMatch(preview, /id=["']engagement-overlay-cta-fill["']/);

    const hold = resolveEngagementOverlayFrame({
      overlay: overlay(),
      sceneDurationMs: 5000,
      sceneElapsedMs: 1000,
      frameWidth: 1080,
      frameHeight: 1920,
    });
    const exit = resolveEngagementOverlayFrame({
      overlay: overlay(),
      sceneDurationMs: 5000,
      sceneElapsedMs: 2400,
      frameWidth: 1080,
      frameHeight: 1920,
    });
    const seekA = renderToStaticMarkup(
      createElement(EngagementOverlayPreview, { frame: hold }),
    );
    const seekB = renderToStaticMarkup(
      createElement(EngagementOverlayPreview, { frame: exit }),
    );
    const attr = (markup: string): string => {
      const match = markup.match(/data-engagement-overlay-fill-id="([^"]+)"/);
      assert.ok(match?.[1], "missing fill id");
      return match[1]!;
    };
    assert.equal(attr(seekA), attr(seekB));

    const dual = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(EngagementOverlayPreview, { frame: hold }),
        createElement(EngagementOverlayPreview, { frame: hold }),
      ),
    );
    const ids = [
      ...dual.matchAll(/data-engagement-overlay-fill-id="([^"]+)"/g),
    ].map((match) => match[1]!);
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1]);
    for (const id of ids) {
      assert.match(dual, new RegExp(`id="${id}"`));
      assert.match(dual, new RegExp(`url\\(#${id}\\)`));
    }
  });

  test("preview and canvas share inter-scene transition suppression helper", () => {
    const preview = readSrc("src/features/preview/components/VideoPreview.tsx");
    const draw = readSrc(
      "src/features/export/runtime/draw-prepared-export-frame.ts",
    );
    assert.match(preview, /shouldSuppressEngagementOverlayForInterSceneTransition/);
    assert.match(draw, /shouldSuppressEngagementOverlayForInterSceneTransition/);
    assert.match(preview, /suppressEngagementOverlay/);
  });

  console.log(`\n${passed} passed\n`);
}

main();
