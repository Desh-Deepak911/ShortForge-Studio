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
    assert.match(draw, /segment\.emphasis/);
    assert.match(preview, /resolveEngagementOverlayFrame/);
    assert.match(preview, /frame\.segments/);
    assert.match(preview, /segment\.emphasis/);
    assert.match(preview, /z-\[2\]/);
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
    assert.match(draw, /Arial, Helvetica, sans-serif/);
    assert.match(preview, /Arial, Helvetica, sans-serif/);
    assert.match(preview, /pointer-events-none/);
    assert.match(presets, /"Like"|"Share"|"Subscribe"/);
    assert.doesNotMatch(draw, /https?:\/\/|emoji|twemoji|youtu\.be|instagram/i);
    assert.doesNotMatch(preview, /https?:\/\/|emoji|twemoji|youtu\.be|instagram/i);
    assert.doesNotMatch(presets, /contentEditable|customSvg|fetch\(|https?:\/\//i);

    const plan = resolveEngagementOverlayFrame({
      overlay: overlay(),
      sceneDurationMs: 5000,
      sceneElapsedMs: 1000,
      frameWidth: 1080,
      frameHeight: 1920,
    });
    assert.deepEqual(plan.labels, ["Like", "Share", "Subscribe"]);
    assert.deepEqual(plan.iconTokens, ["heart", "share", "bell"]);
    assert.equal(plan.segments.length, 3);
    assert.match(presets, /ENGAGEMENT_OVERLAY_STYLE/);
    assert.match(presets, /cardFill/);
    assert.match(presets, /accentFill/);
    assert.doesNotMatch(presets, /from ["']@\/features\/brand-sting/);
    assert.doesNotMatch(draw, /from ["']@\/features\/brand-sting/);
    assert.doesNotMatch(preview, /from ["']@\/features\/brand-sting/);
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
