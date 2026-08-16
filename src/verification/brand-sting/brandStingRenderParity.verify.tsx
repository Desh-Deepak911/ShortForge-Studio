/**
 * Brand-sting preview/canvas planner parity and seek stability.
 * Run via: npm run test:brand-sting-export
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  BRAND_STING_LEAD_IN,
  BrandStingPreview,
  createDefaultShortForgeBrandSting,
  drawBrandSting,
  BRAND_STING_LOCKED_TITLE,
  resolveBrandStingFinalElapsedMs,
  resolveBrandStingFrame,
  resolveBrandStingLocalElapsedMs,
  resolveBrandStingTerminalElapsedMs,
  resolveBrandStingTimelineBounds,
} from "@/features/brand-sting";
import {
  buildExportManifest,
  isExportManifestV5,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import { prepareExportFromManifest } from "@/features/export/runtime/prepare-export-from-manifest";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

const CAPABLE_ENV: Partial<ExportEnvironmentSnapshot> = {
  browserName: "chrome",
  supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true,
  supportsMediaRecorder: true,
  supportsRequestVideoFrameCallback: true,
  supportsWebAssembly: true,
  serverRendererAvailable: false,
  ffmpegRuntimePoisoned: false,
  estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
};

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function story(): FootieScript {
  return {
    ...syncFootieScript({
      title: "Parity",
      narration: "Hello",
      totalDuration: 4,
      scenes: [
        {
          id: "scene-a",
          start: 0,
          end: 4,
          duration: 4,
          startMs: 0,
          endMs: 4000,
          durationMs: 4000,
          subtitle: "Hello",
          narration: "Hello",
          media: {
            type: "image",
            url: "https://example.com/p.jpg",
            source: "upload",
          },
        },
      ],
    }),
    visualRetentionExtensions: {
      version: 1,
      shortForgeBrandSting: createDefaultShortForgeBrandSting(2500),
    },
  };
}

function makeCtx(): CanvasRenderingContext2D {
  const calls: string[] = [];
  const ctx = {
    calls,
    save() {
      calls.push("save");
    },
    restore() {
      calls.push("restore");
    },
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    rect() {},
    clip() {},
    fill() {},
    stroke() {},
    fillRect() {},
    fillText(text: string) {
      calls.push(`fillText:${text}`);
    },
    translate() {},
    scale() {},
    setTransform() {},
    arc() {
      calls.push("arc");
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    filter: "none",
    shadowBlur: 0,
    shadowColor: "",
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

console.log("\nbrand-sting-render-parity\n");

test("deterministic entrance/hold/exit samples and seek stability", () => {
  const sting = createDefaultShortForgeBrandSting(2500);
  const a = resolveBrandStingFrame({ sting, elapsedMs: 200 });
  const b = resolveBrandStingFrame({ sting, elapsedMs: 200 });
  assert.deepEqual(a, b);
  assert.equal(a.phase, "entrance");
  assert.equal(resolveBrandStingFrame({ sting, elapsedMs: 1200 }).phase, "hold");
  assert.equal(resolveBrandStingFrame({ sting, elapsedMs: 2300 }).phase, "exit");
  assert.equal(resolveBrandStingFrame({ sting, elapsedMs: 2500 }).visible, false);
});

test("720p/1080p/4K frame-plan parity for layout progress", () => {
  const sting = createDefaultShortForgeBrandSting(2500);
  const samples = [
    [720, 1280],
    [1080, 1920],
    [2160, 3840],
  ] as const;
  for (const [width, height] of samples) {
    const plan = resolveBrandStingFrame({
      sting,
      elapsedMs: 1000,
      frameWidth: width,
      frameHeight: height,
    });
    assert.equal(plan.phase, "hold");
    assert.equal(plan.titleOpacity, 1);
    assert.ok(plan.mark.cx > 0);
    assert.ok(plan.mark.size > 0);
  }
});

test("preview and canvas consume the same resolveBrandStingFrame plan", () => {
  const sting = createDefaultShortForgeBrandSting(2500);
  const plan = resolveBrandStingFrame({ sting, elapsedMs: 400 });
  const markup = renderToStaticMarkup(
    createElement(BrandStingPreview, { sting, elapsedMs: 400 }),
  );
  assert.match(markup, /ShortForge/);
  assert.match(markup, /Studio/);
  assert.match(markup, /MADE WITH/);
  assert.doesNotMatch(markup, />Made with</);
  assert.match(markup, /pointer-events:\s*none/);
  assert.match(markup, /viewBox="0 0 1080 1920"/);
  assert.equal(plan.titlePrimary, "ShortForge");
  assert.equal(plan.leadIn, BRAND_STING_LEAD_IN);
  assert.equal(plan.leadInDisplay, "MADE WITH");

  const ctx = makeCtx();
  drawBrandSting(ctx, plan, 1080, 1920);
  const calls = (ctx as unknown as { calls: string[] }).calls;
  assert.equal(calls[0], "save");
  assert.equal(calls[calls.length - 1], "restore");
});

test("promotional hierarchy: Made with lead-in under dominant ShortForge Studio", () => {
  const sting = createDefaultShortForgeBrandSting(2500);
  for (const [width, height] of [
    [720, 1280],
    [1080, 1920],
    [2160, 3840],
  ] as const) {
    const plan = resolveBrandStingFrame({
      sting,
      elapsedMs: 1200,
      frameWidth: width,
      frameHeight: height,
    });
    assert.equal(plan.leadIn, "Made with");
    assert.equal(plan.title, "ShortForge Studio");
    assert.equal(plan.titlePrimary, "ShortForge");
    assert.equal(plan.titleSecondary, "Studio");
    assert.ok(plan.leadInOpacity > 0);
    assert.ok(plan.titleOpacity >= plan.leadInOpacity);
  }
  const draw = readSrc("src/features/brand-sting/render/draw-brand-sting.ts");
  assert.match(draw, /plan\.titleFontSize/);
  assert.match(draw, /plan\.leadInFontSize/);
  assert.match(draw, /plan\.leadInY/);
  assert.match(draw, /plan\.titleY/);
  assert.match(draw, /plan\.leadInDisplay/);
  assert.doesNotMatch(draw, /titleSize = 64/);
  assert.doesNotMatch(draw, /leadInSize = 22/);
  assert.doesNotMatch(draw, /frameWidth \/ 1080/);
  assert.doesNotMatch(draw, /plan\.mark\.cy \+/);
  assert.match(draw, /resetIsolatedDrawState/);
});

test("no scene renderer during sting; prepare/draw early branch", () => {
  const prepare = readSrc("src/features/export/runtime/prepare-export-frame.ts");
  assert.match(prepare, /brandStingFrame/);
  assert.match(prepare, /resolveBrandStingLocalElapsedMs/);
  assert.match(prepare, /resolveBrandStingTerminalElapsedMs/);
  assert.doesNotMatch(prepare, /resolveBrandStingFinalElapsedMs/);
  // Early return must skip media/captions/engagement/motion prep.
  const brandBranch = prepare.slice(
    prepare.indexOf("if (brandStingFrame)"),
    prepare.indexOf("const scene = resolveExportSceneFrame(manifest, timestampMs)"),
  );
  assert.match(brandBranch, /captions: \[\]/);
  assert.match(brandBranch, /intraSceneTransition: null/);
  assert.doesNotMatch(brandBranch, /prepareExportSceneMediaFrame/);
  assert.doesNotMatch(brandBranch, /resolveExportCaptionFrames/);
  const draw = readSrc("src/features/export/runtime/draw-prepared-export-frame.ts");
  assert.match(draw, /frame\.brandSting/);
  assert.match(draw, /drawBrandSting/);
  assert.match(draw, /return;/);

  const bounds = resolveBrandStingTimelineBounds({
    narrationEndMs: 4000,
    endBufferMs: 250,
    brandStingDurationMs: 2500,
  });
  assert.equal(
    resolveBrandStingLocalElapsedMs({
      absoluteTimeMs: bounds.narrationEndMs - 1,
      narrationEndMs: bounds.narrationEndMs,
      durationMs: bounds.durationMs,
    }),
    null,
  );
  assert.equal(
    resolveBrandStingLocalElapsedMs({
      absoluteTimeMs: bounds.brandStingStartMs,
      narrationEndMs: bounds.narrationEndMs,
      durationMs: bounds.durationMs,
    }),
    0,
  );
  assert.equal(
    resolveBrandStingLocalElapsedMs({
      absoluteTimeMs: bounds.brandStingEndMs - 1,
      narrationEndMs: bounds.narrationEndMs,
      durationMs: bounds.durationMs,
    }),
    resolveBrandStingFinalElapsedMs(bounds.durationMs),
  );
  assert.equal(
    resolveBrandStingLocalElapsedMs({
      absoluteTimeMs: bounds.brandStingEndMs,
      narrationEndMs: bounds.narrationEndMs,
      durationMs: bounds.durationMs,
    }),
    null,
  );
  assert.equal(
    resolveBrandStingLocalElapsedMs({
      absoluteTimeMs: bounds.brandStingEndMs + 1,
      narrationEndMs: bounds.narrationEndMs,
      durationMs: bounds.durationMs,
    }),
    null,
  );
  assert.equal(
    resolveBrandStingLocalElapsedMs({
      absoluteTimeMs: bounds.renderDurationMs - 1,
      narrationEndMs: bounds.narrationEndMs,
      durationMs: bounds.durationMs,
    }),
    null,
  );
});

test("end and end-buffer samples omit branded tokens; terminal draw is neutral", () => {
  const sting = createDefaultShortForgeBrandSting(2500);
  const bounds = resolveBrandStingTimelineBounds({
    narrationEndMs: 4000,
    endBufferMs: 250,
    brandStingDurationMs: 2500,
  });
  for (const absolute of [
    bounds.brandStingEndMs,
    bounds.brandStingEndMs + 1,
    bounds.renderDurationMs - 1,
  ]) {
    const plan = resolveBrandStingFrame({
      sting,
      elapsedMs: resolveBrandStingTerminalElapsedMs(2500),
    });
    assert.equal(plan.visible, false, `invisible @${absolute}`);
    assert.equal(plan.leadInOpacity, 0);
    assert.equal(plan.titleOpacity, 0);
    assert.equal(plan.subtitleOpacity, 0);
    assert.equal(plan.accentGlowOpacity, 0);
    assert.equal(plan.mark.reveal, 0);
    assert.equal(plan.mark.opacity, 0);
    assert.notEqual(plan.phase, "hold");
  }

  const terminal = resolveBrandStingFrame({
    sting,
    elapsedMs: resolveBrandStingTerminalElapsedMs(2500),
  });
  const ctx = makeCtx();
  drawBrandSting(ctx, terminal, 1080, 1920);
  const calls = (ctx as unknown as { calls: string[] }).calls;
  assert.equal(calls[0], "save");
  assert.equal(calls[calls.length - 1], "restore");
  const drawSrc = readSrc("src/features/brand-sting/render/draw-brand-sting.ts");
  assert.match(drawSrc, /drawTerminalNeutralFill/);
  assert.match(drawSrc, /#000000/);
  assert.doesNotMatch(
    drawSrc.slice(drawSrc.indexOf("drawTerminalNeutralFill")),
    new RegExp(BRAND_STING_LOCKED_TITLE),
  );
  assert.doesNotMatch(
    drawSrc.slice(
      drawSrc.indexOf("function drawTerminalNeutralFill"),
      drawSrc.indexOf("export function drawBrandSting"),
    ),
    /Made with|ShortForge|accentGlow|forged/,
  );
});

test("Browser/Headless share prepareExportFromManifest brand-sting flag", () => {
  const manifest = buildExportManifest({
    story: story(),
    environment: CAPABLE_ENV,
    audioMode: "silent",
    shortForgeBrandStingEnabled: true,
  });
  assert.equal(isExportManifestV5(manifest), true);
  const plan = prepareExportFromManifest(manifest);
  assert.equal(plan.shortForgeBrandStingEnabled, true);
});

test("deterministic local primitives: no remote assets or wall-clock", () => {
  const frame = readSrc(
    "src/features/brand-sting/domain/resolve-brand-sting-frame.ts",
  );
  const draw = readSrc("src/features/brand-sting/render/draw-brand-sting.ts");
  const preview = readSrc(
    "src/features/brand-sting/preview/BrandStingPreview.tsx",
  );
  const mark = readSrc(
    "src/features/brand-sting/domain/brand-sting-mark-geometry.ts",
  );
  assert.doesNotMatch(frame, /Date\.now|Math\.random|fetch\(/);
  assert.doesNotMatch(draw, /https?:\/\//);
  assert.doesNotMatch(preview, /https?:\/\/(?!example)/);
  assert.doesNotMatch(mark, /https?:\/\/|fetch\(|Date\.now|Math\.random/);
  assert.match(draw, /BRAND_STING_FONT_FAMILY/);
  assert.match(
    readSrc("src/features/brand-sting/domain/brand-sting.presets.ts"),
    /Arial, Helvetica, sans-serif/,
  );
});

test("preview is an output-space SVG and drops the old top-heavy layout", () => {
  const preview = readSrc(
    "src/features/brand-sting/preview/BrandStingPreview.tsx",
  );
  assert.match(preview, /resolveBrandStingFrame/);
  assert.match(preview, /viewBox=\{`0 0 \$\{plan\.frameWidth\} \$\{plan\.frameHeight\}`\}/);
  assert.match(preview, /width="100%"/);
  assert.match(preview, /height="100%"/);
  assert.match(preview, /leadInDisplay/);
  assert.match(preview, /scaleBrandStingMarkGeometry/);
  assert.match(preview, /resolveBrandStingMarkRevealClip/);
  assert.doesNotMatch(preview, /top:\s*["']22%["']/);
  assert.doesNotMatch(preview, /top:\s*["']24%["']/);
  assert.doesNotMatch(preview, /top:\s*["']36%["']/);
  assert.doesNotMatch(preview, /0\.72rem|1\.55rem|0\.95rem/);
  assert.doesNotMatch(preview, /width:\s*56|height:\s*56|width:\s*180|height:\s*180/);
  assert.doesNotMatch(
    preview,
    /requestAnimationFrame|ResizeObserver|@keyframes|transition:|setTimeout|setInterval/,
  );

  const sting = createDefaultShortForgeBrandSting(2500);
  const markup = renderToStaticMarkup(
    createElement(BrandStingPreview, { sting, elapsedMs: 1200 }),
  );
  assert.match(markup, /viewBox="0 0 1080 1920"/);
  assert.match(markup, /data-brand-sting-surface="output-space"/);
  assert.match(markup, /data-brand-sting-glow/);
  assert.match(markup, /data-brand-sting-beam="0"/);
  assert.match(markup, /data-brand-sting-beam="1"/);
  assert.match(markup, /data-brand-sting-ring="0"/);
  assert.match(markup, /data-brand-sting-ring="1"/);
  assert.match(markup, /data-brand-sting-ring="2"/);
  assert.match(markup, /data-brand-sting-ring-marker/);
  assert.match(markup, /data-brand-sting-mark/);
  assert.match(markup, /data-brand-sting-lead-in/);
  assert.match(markup, /data-brand-sting-title/);
  assert.match(markup, /data-brand-sting-subtitle/);
  assert.match(markup, /data-brand-sting-accent-line/);
  assert.match(markup, /MADE WITH/);
  assert.match(markup, /ShortForge/);
  assert.match(markup, />Studio</);
});

test("canvas consumes the shared mark geometry and resolved lockup", () => {
  const draw = readSrc("src/features/brand-sting/render/draw-brand-sting.ts");
  const preview = readSrc(
    "src/features/brand-sting/preview/BrandStingPreview.tsx",
  );
  assert.match(draw, /scaleBrandStingMarkGeometry/);
  assert.match(draw, /resolveBrandStingMarkRevealClip/);
  assert.match(draw, /plan\.glow\.(cx|radius|opacity|color)/);
  assert.match(draw, /plan\.rings/);
  assert.match(draw, /plan\.beams/);
  assert.match(draw, /plan\.accentLine/);
  assert.match(draw, /plan\.mark\.opacity/);
  assert.match(preview, /scaleBrandStingMarkGeometry/);
  assert.doesNotMatch(draw, /const s = size \/ 48/);
  assert.doesNotMatch(draw, /-18 \* s/);

  const sting = createDefaultShortForgeBrandSting(2500);
  const plan = resolveBrandStingFrame({ sting, elapsedMs: 1200 });
  const ctx = makeCtx();
  drawBrandSting(ctx, plan, 1080, 1920);
  const calls = (ctx as unknown as { calls: string[] }).calls;
  assert.ok(calls.includes("arc"));
  assert.ok(calls.includes("fillText:MADE WITH"));
  assert.ok(calls.includes("fillText:ShortForge"));
  assert.ok(calls.includes("fillText:Studio"));
  assert.equal(calls.filter((call) => call === "save").length, calls.filter((call) => call === "restore").length);
  assert.equal(calls[0], "save");
  assert.equal(calls[calls.length - 1], "restore");
});

test("two Brand Sting previews use distinct matched SVG ids that ignore seek", () => {
  const preview = readSrc(
    "src/features/brand-sting/preview/BrandStingPreview.tsx",
  );
  assert.match(preview, /useId\(/);
  assert.doesNotMatch(preview, /Date\.now|Math\.random|requestAnimationFrame/);
  assert.doesNotMatch(preview, /id=["']brand-sting-background["']/);

  const sting = createDefaultShortForgeBrandSting(2500);
  const seekA = renderToStaticMarkup(
    createElement(BrandStingPreview, { sting, elapsedMs: 400 }),
  );
  const seekB = renderToStaticMarkup(
    createElement(BrandStingPreview, { sting, elapsedMs: 1200 }),
  );
  const attr = (markup: string, name: string): string => {
    const match = markup.match(new RegExp(`${name}="([^"]+)"`));
    assert.ok(match?.[1], `missing ${name}`);
    return match[1]!;
  };
  assert.equal(
    attr(seekA, "data-brand-sting-background-id"),
    attr(seekB, "data-brand-sting-background-id"),
  );

  const dual = renderToStaticMarkup(
    createElement(
      "div",
      null,
      createElement(BrandStingPreview, { sting, elapsedMs: 1200 }),
      createElement(BrandStingPreview, { sting, elapsedMs: 1200 }),
    ),
  );
  const backgrounds = [
    ...dual.matchAll(/data-brand-sting-background-id="([^"]+)"/g),
  ].map((match) => match[1]!);
  const glows = [...dual.matchAll(/data-brand-sting-glow-id="([^"]+)"/g)].map(
    (match) => match[1]!,
  );
  const clips = [
    ...dual.matchAll(/data-brand-sting-mark-clip-id="([^"]+)"/g),
  ].map((match) => match[1]!);
  assert.equal(backgrounds.length, 2);
  assert.notEqual(backgrounds[0], backgrounds[1]);
  assert.notEqual(glows[0], glows[1]);
  assert.notEqual(clips[0], clips[1]);
  for (const id of [...backgrounds, ...glows, ...clips]) {
    assert.match(dual, new RegExp(`id="${id}"`));
    assert.match(dual, new RegExp(`url\\(#${id}\\)`));
  }
});

test("capability-off preview and canvas render no branded residue", () => {
  const off = { ...createDefaultShortForgeBrandSting(2500), enabled: false };
  const markup = renderToStaticMarkup(
    createElement(BrandStingPreview, { sting: off, elapsedMs: 1200 }),
  );
  assert.equal(markup, "");
  const plan = resolveBrandStingFrame({ sting: off, elapsedMs: 1200 });
  assert.equal(plan.visible, false);
  const ctx = makeCtx();
  drawBrandSting(ctx, plan, 1080, 1920);
  assert.deepEqual((ctx as unknown as { calls: string[] }).calls, []);
});

console.log(`\n${passed} passed\n`);
