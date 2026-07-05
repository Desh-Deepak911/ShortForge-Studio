/**
 * Export subtitle QA (run: npm run test:export-subtitle-qa).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveSubtitleDisplayLayout,
} from "@/features/story/utils/subtitle-layout.utils";
import {
  buildFootieExportPayload,
  getRenderableScenesFromPayload,
} from "@/features/export/services";
import {
  resolveExportSubtitleDisplay,
  getExportSubtitleChunkState,
} from "@/features/export/utils/export-subtitle.utils";
import {
  wrapTextToLines,
  resolveExportSubtitleBoxWidth,
  resolveExportSubtitleTextBlockSize,
  getExportSubtitleLayoutMetrics,
} from "@/features/export/utils/export-caption-canvas.utils";
import {
  FADE_SAFE_CAPTION_STYLE_TOKENS,
  LEGACY_EXPORT_CAPTION_STYLE_TOKENS,
  resolveExportCaptionStyle,
  resolveExportCaptionStyleForDisplay,
  resolvePreviewCaptionStyle,
  resolvePreviewNewsMotionStyle,
  resolvePreviewSportsMotionStyle,
  resolvePreviewTikTokMotionStyle,
  resolveNewsMotionOverlay,
  resolveNewsMotionVisualState,
  resolveSportsMotionOverlay,
  resolveSportsMotionVisualState,
  resolveTikTokMotionOverlay,
  resolveTikTokPopScale,
  NEWS_SLIDE_MIN_WINDOW_MS,
  SPORTS_BOUNCE_MIN_WINDOW_MS,
  TIKTOK_MOTION_STYLE_TOKENS,
  TIKTOK_POP_DURATION_MS,
  inferNewsSlideDisabled,
  inferSportsBounceDisabled,
} from "@/features/caption-engine";
import {
  FADE_UP_DURATION_MS,
  getActiveSubtitleChunkState,
  getExportHighlightSubtitleFrame,
  getExportSceneCaptionLines,
  getFadeUpSubtitleFrame,
  getTypewriterRevealedText,
  splitSubtitleChunks,
} from "@/features/story/utils";
import type { FootieScene, FootieScript } from "@/features/story/types";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function sampleScene(id: string, subtitle: string): FootieScene {
  return {
    id,
    start: 0,
    end: 3,
    duration: 3,
    subtitle,
  };
}

const multiChunkSubtitle =
  "First phrase starts the scene. Second phrase keeps building tension here. Third phrase lands the payoff now.";

function subtitlesScene(effect: FootieScene["subtitleEffect"]): FootieScript {
  return {
    title: "Export Subtitle QA",
    narration: multiChunkSubtitle,
    totalDuration: 9,
    scenes: [
      {
        ...sampleScene("scene-1", "Generated caption ignored"),
        captionMode: "subtitles",
        subtitleText: multiChunkSubtitle,
        subtitleEffect: effect,
        durationMs: 9000,
        startMs: 0,
        endMs: 9000,
      },
    ],
  };
}

console.log("export-subtitle-qa");

test("preview subtitle paths remain wired", () => {
  const videoPreview = readSrc("src/features/preview/components/VideoPreview.tsx");
  const subtitleOverlay = readSrc("src/features/preview/components/SubtitleOverlay.tsx");
  const effectPreview = readSrc("src/features/editor/components/subtitleEffectPreview.tsx");

  assert.match(videoPreview, /getPreviewSceneTiming/);
  assert.match(videoPreview, /SubtitleOverlay/);
  assert.match(videoPreview, /sceneElapsedMs/);
  assert.match(subtitleOverlay, /resolveActiveSubtitleForScene/);
  assert.match(subtitleOverlay, /renderSceneCaptionContent/);
  assert.match(effectPreview, /case "fade-up"/);
  assert.match(effectPreview, /case "typewriter"/);
  assert.match(effectPreview, /case "highlight"/);
});

test("export renderer uses timed subtitle display and effect canvas helpers", () => {
  const videoRender = readSrc("src/features/export/services/video-render.service.ts");
  const canvasUtils = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  const exportSubtitle = readSrc("src/features/export/utils/export-subtitle.utils.ts");

  assert.match(videoRender, /resolveExportSubtitleDisplayFromTimeline/);
  assert.match(videoRender, /resolveExportFrameFromMasterTimeline/);
  assert.match(videoRender, /sceneElapsedMs/);
  assert.match(videoRender, /clearRect\(0, 0, width, height\)/);
  assert.match(videoRender, /requestCanvasCaptureFrame/);
  assert.match(exportSubtitle, /getActiveSubtitleChunkFromList/);
  assert.match(exportSubtitle, /resolveExportSubtitleDisplay/);
  assert.match(exportSubtitle, /resolveExportCaptionAnimation/);
  assert.match(canvasUtils, /prepareExportSubtitleLayer/);
  assert.match(canvasUtils, /resetExportCanvasDrawState/);
  assert.doesNotMatch(canvasUtils, /repaintSubtitleRegionOverlay/);
  assert.doesNotMatch(canvasUtils, /getExportSubtitleRegionBounds/);
  assert.match(canvasUtils, /resolveExportSubtitleTextBlockSize/);
  assert.match(canvasUtils, /measureSubtitleLineWidths/);
  assert.match(canvasUtils, /resolveExportCaptionStyleMetrics/);
  assert.match(canvasUtils, /from "@\/features\/caption-style"/);
  assert.match(canvasUtils, /backgroundAlpha/);
  assert.match(canvasUtils, /drawExportSubtitlesCaption/);
  assert.match(canvasUtils, /drawExportGeneratedCaption/);
  assert.match(canvasUtils, /resolveExportCaptionStyleForDisplay/);
  assert.match(canvasUtils, /applyExportCaptionTextDrawState/);
  assert.match(canvasUtils, /resolveExportCaptionHighlightFrame/);
  assert.match(canvasUtils, /display\.animationState/);
  assert.match(canvasUtils, /resolveCaptionAnimationTranslateYPx/);
  assert.match(canvasUtils, /drawHighlightLine/);
  assert.match(canvasUtils, /wrapTextToLines/);
  assert.match(canvasUtils, /textTopY \+ \(index \+ 1\) \* metrics\.lineHeight/);
});

test("subtitle layout keeps all words within visible line budget", () => {
  const source =
    "one two three four five six seven eight nine ten eleven twelve";
  const layout = resolveSubtitleDisplayLayout(source, { maxLines: 3 });

  assert.ok(layout.lines.join(" ").includes("twelve"));
  assert.ok(layout.lines.length <= 3 || layout.fontScale < 1);
});

test("export resolves exactly one active subtitle chunk per frame", () => {
  const scene = getRenderableScenesFromPayload(buildFootieExportPayload(subtitlesScene("fade-up")))[0]!;
  const chunks = scene.subtitleChunks;
  const timing = { sceneDurationMs: 9000 };
  const chunkDurationMs = timing.sceneDurationMs / chunks.length;
  const midIndex = Math.floor(chunks.length / 2);

  const early = resolveExportSubtitleDisplay(scene, { ...timing, sceneElapsedMs: chunkDurationMs * 0.5 });
  const middle = resolveExportSubtitleDisplay(scene, {
    ...timing,
    sceneElapsedMs: chunkDurationMs * (midIndex + 0.5),
  });
  const late = resolveExportSubtitleDisplay(scene, {
    ...timing,
    sceneElapsedMs: chunkDurationMs * (chunks.length - 0.5),
  });

  assert.ok(early && middle && late);
  assert.equal(early.activeChunk, chunks[0]);
  assert.equal(middle.activeChunk, chunks[midIndex]);
  assert.equal(late.activeChunk, chunks.at(-1));
  assert.notEqual(early.activeChunk, middle.activeChunk);
  assert.notEqual(middle.activeChunk, late.activeChunk);
  assert.ok(chunks.length >= 3);
  assert.equal(early.lines.join(" "), chunks[0]);
  assert.equal(middle.lines.join(" "), chunks[midIndex]);
  assert.equal(late.lines.join(" "), chunks.at(-1));
});

test("exported fade-up effect animates opacity and vertical offset at chunk start", () => {
  const start = getFadeUpSubtitleFrame(0);
  const mid = getFadeUpSubtitleFrame(FADE_UP_DURATION_MS / 2);
  const end = getFadeUpSubtitleFrame(FADE_UP_DURATION_MS);

  assert.equal(start.opacity, 0);
  assert.ok(start.yOffsetPx > 0);
  assert.ok(mid.opacity > start.opacity && mid.opacity < 1);
  assert.ok(mid.yOffsetPx < start.yOffsetPx);
  assert.equal(end.opacity, 1);
  assert.equal(end.yOffsetPx, 0);

  const scene = getRenderableScenesFromPayload(buildFootieExportPayload(subtitlesScene("fade-up")))[0]!;
  const chunkState = resolveExportSubtitleDisplay(scene, {
    sceneElapsedMs: 50,
    sceneDurationMs: 9000,
  });

  assert.ok(chunkState);
  assert.equal(chunkState.effect, "fade-up");
  assert.ok(getFadeUpSubtitleFrame(chunkState.chunkElapsedMs).opacity < 1);
  assert.ok(chunkState.activeChunkDurationMs > 0);
  assert.ok(chunkState.effectProgress >= 0 && chunkState.effectProgress < 1);
});

test("exported typewriter effect reveals substring over chunk progress", () => {
  const chunk = "Typewriter reveals this phrase slowly.";
  assert.equal(getTypewriterRevealedText(chunk, 0), chunk.slice(0, 1));
  assert.ok(getTypewriterRevealedText(chunk, 0.4).length < chunk.length);
  assert.equal(getTypewriterRevealedText(chunk, 1), chunk);

  const scene = getRenderableScenesFromPayload(
    buildFootieExportPayload(subtitlesScene("typewriter")),
  )[0]!;
  const chunkDurationMs = 9000 / scene.subtitleChunks.length;
  const partial = resolveExportSubtitleDisplay(scene, {
    sceneElapsedMs: chunkDurationMs * 0.25,
    sceneDurationMs: 9000,
  });
  const complete = resolveExportSubtitleDisplay(scene, {
    sceneElapsedMs: chunkDurationMs * 0.95,
    sceneDurationMs: 9000,
  });

  assert.ok(partial);
  assert.ok(complete);
  const partialText = partial.animationState?.visibleText ?? partial.lines.join("");
  const completeText = complete.animationState?.visibleText ?? complete.lines.join("");
  assert.ok(partialText.length <= completeText.length);
  assert.ok(partialText.length < completeText.length || partial.effectProgress < complete.effectProgress);
  assert.equal(partial.effect, "typewriter");
  assert.ok(partial.activeChunkDurationMs > 0);
  assert.ok(partial.effectProgress < complete.effectProgress);
});

test("exported highlight effect animates highlight background through chunk elapsed time", () => {
  const activeChunkDurationMs = 3000;
  const start = getExportHighlightSubtitleFrame(0, activeChunkDurationMs);
  const end = getExportHighlightSubtitleFrame(2999, activeChunkDurationMs);
  const pulse = getExportHighlightSubtitleFrame(600, activeChunkDurationMs);

  assert.ok(start.highlightWidthProgress < end.highlightWidthProgress);
  assert.ok(start.backgroundAlpha <= end.backgroundAlpha);
  assert.ok(pulse.barScale >= 0.88 && pulse.barScale <= 1);

  const scene = getRenderableScenesFromPayload(
    buildFootieExportPayload(subtitlesScene("highlight")),
  )[0]!;
  const chunkDurationMs = 9000 / scene.subtitleChunks.length;
  const early = resolveExportSubtitleDisplay(scene, {
    sceneElapsedMs: 100,
    sceneDurationMs: 9000,
  });
  const later = resolveExportSubtitleDisplay(scene, {
    sceneElapsedMs: chunkDurationMs * 0.8,
    sceneDurationMs: 9000,
  });

  assert.ok(early && later);
  assert.equal(early.effect, "highlight");
  assert.equal(early.activeChunk, later.activeChunk);
  assert.ok(early.effectProgress < later.effectProgress);
  assert.ok(getExportHighlightSubtitleFrame(early.chunkElapsedMs, early.activeChunkDurationMs)
    .highlightWidthProgress <
    getExportHighlightSubtitleFrame(later.chunkElapsedMs, later.activeChunkDurationMs)
      .highlightWidthProgress);
});

test("generated caption export path is unchanged", () => {
  const script: FootieScript = {
    title: "Generated QA",
    narration: "Narration stays separate.",
    totalDuration: 6,
    scenes: [
      sampleScene("scene-1", "Full generated caption stays static"),
      sampleScene("scene-2", "Second generated caption"),
    ],
  };

  const scene = getRenderableScenesFromPayload(buildFootieExportPayload(script))[0]!;
  assert.equal(scene.captionMode, "generated");
  assert.deepEqual(scene.subtitleChunks, []);

  const early = getExportSceneCaptionLines(scene, {
    sceneElapsedMs: 0,
    sceneDurationMs: scene.durationMs,
  });
  const late = getExportSceneCaptionLines(scene, {
    sceneElapsedMs: scene.durationMs,
    sceneDurationMs: scene.durationMs,
  });

  assert.deepEqual(early, late);
  assert.equal(early.join(" "), "Full generated caption stays static");

  const videoRender = readSrc("src/features/export/services/video-render.service.ts");
  assert.match(videoRender, /normalizeCaptionMode\(scene\.captionMode\) === "subtitles"/);
  assert.match(videoRender, /drawExportGeneratedCaption\(ctx, captionLines/);
});

test("export subtitles stay bottom-centered on canvas", () => {
  const canvasUtils = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  const layoutEngine = readSrc("src/features/caption-layout/caption-layout.engine.ts");

  assert.match(canvasUtils, /resolveExportCaptionPlacement\(scene, script, width, height, scale, boxWidth, boxHeight\)/);
  assert.match(canvasUtils, /resolveExportCaptionPlacement/);
  assert.match(canvasUtils, /placement\.centerX/);
  assert.match(canvasUtils, /placement\.boxBottomY - boxHeight/);
  assert.match(layoutEngine, /width \/ 2/);
  assert.match(layoutEngine, /LEGACY_EXPORT_BOTTOM_MARGIN_PX \* scale/);
  assert.match(canvasUtils, /placement\.textAlign/);
  assert.match(canvasUtils, /resolveExportCaptionTextX/);
});

test("export does not render full narration as one static subtitle block", () => {
  const scene = getRenderableScenesFromPayload(buildFootieExportPayload(subtitlesScene("fade-up")))[0]!;
  const timing = { sceneDurationMs: 9000 };

  for (const elapsedMs of [0, 1500, 4500, 8000]) {
    const display = resolveExportSubtitleDisplay(scene, { ...timing, sceneElapsedMs: elapsedMs });
    assert.ok(display);
    assert.notEqual(display.lines.join(" "), multiChunkSubtitle);
    assert.ok(display.lines.join(" ").length < multiChunkSubtitle.length);
  }

  assert.notEqual(scene.displayCaption, multiChunkSubtitle);
  assert.ok(scene.subtitleChunks.every((chunk) => chunk.length < multiChunkSubtitle.length));
});

test("export subtitle pill wraps text content instead of full frame width", () => {
  const ctx = {
    measureText(text: string) {
      return { width: text.length * 10 };
    },
  } as CanvasRenderingContext2D;

  const scale = 1;
  const metrics = {
    ...getExportSubtitleLayoutMetrics(scale),
    maxBoxWidth: 900,
    maxTextWidth: 844,
  };
  const shortLines = ["Short line"];
  const longLines = wrapTextToLines(
    ctx,
    "one two three four five six seven eight nine ten eleven twelve",
    metrics.maxTextWidth,
    3,
  );

  const shortWidth = resolveExportSubtitleBoxWidth(ctx, shortLines, metrics);
  const longWidth = resolveExportSubtitleBoxWidth(ctx, longLines, metrics);

  assert.ok(shortWidth < metrics.maxBoxWidth);
  assert.equal(shortWidth, ctx.measureText("Short line").width + metrics.padX * 2);
  assert.ok(longWidth <= metrics.maxBoxWidth);
  assert.ok(longWidth > shortWidth);
});

test("no overlapping subtitles: one content-sized pill per frame", () => {
  const canvasUtils = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  const scene = getRenderableScenesFromPayload(buildFootieExportPayload(subtitlesScene("fade-up")))[0]!;
  const timing = { sceneDurationMs: 9000 };

  assert.match(canvasUtils, /prepareExportSubtitleLayer/);
  assert.match(canvasUtils, /resolveExportSubtitleTextBlockSize/);
  assert.match(canvasUtils, /measureSubtitleLineWidths/);
  assert.match(canvasUtils, /resolveExportCaptionStyleMetrics/);
  assert.match(canvasUtils, /from "@\/features\/caption-style"/);
  assert.match(canvasUtils, /wrapTextToLines/);
  assert.match(canvasUtils, /lines\.length \* metrics\.lineHeight/);
  assert.doesNotMatch(canvasUtils, /drawSubtitleBox[\s\S]*maxBoxWidth, boxHeight/);

  for (const elapsedMs of [500, 4500, 8500]) {
    const display = resolveExportSubtitleDisplay(scene, { ...timing, sceneElapsedMs: elapsedMs });
    assert.ok(display);
    const joined = display.lines.join(" ").trim();
    assert.ok(scene.subtitleChunks.includes(joined));
    assert.notEqual(joined, multiChunkSubtitle);
    assert.equal(
      scene.subtitleChunks.filter((chunk) => joined.includes(chunk) && chunk !== joined).length,
      0,
    );
  }
});

test("only one subtitle chunk visible at each elapsed time", () => {
  const scene = getRenderableScenesFromPayload(buildFootieExportPayload(subtitlesScene("typewriter")))[0]!;
  const timing = { sceneDurationMs: 9000 };
  const seen = new Set<string>();

  for (let elapsedMs = 0; elapsedMs < 9000; elapsedMs += 250) {
    const display = resolveExportSubtitleDisplay(scene, { ...timing, sceneElapsedMs: elapsedMs });
    if (!display) {
      continue;
    }

    assert.ok(scene.subtitleChunks.includes(display.activeChunk));
    seen.add(display.activeChunk);

    const otherChunks = scene.subtitleChunks.filter((chunk) => chunk !== display.activeChunk);
    for (const other of otherChunks) {
      assert.ok(!display.lines.join(" ").includes(other));
    }
  }

  assert.ok(seen.size >= 2);
});

test("fade-up export produces varying opacity across chunk start frames", () => {
  const scene = getRenderableScenesFromPayload(buildFootieExportPayload(subtitlesScene("fade-up")))[0]!;
  const chunkDurationMs = scene.durationMs / scene.subtitleChunks.length;
  const opacities = [0, 100, 250, 400].map((offsetMs) => {
    const display = resolveExportSubtitleDisplay(scene, {
      sceneElapsedMs: offsetMs,
      sceneDurationMs: scene.durationMs,
    });
    assert.ok(display);
    return getFadeUpSubtitleFrame(display.chunkElapsedMs).opacity;
  });

  assert.ok(opacities[0]! < opacities.at(-1)!);
  assert.ok(new Set(opacities.map((value) => value.toFixed(2))).size >= 2);
  assert.ok(chunkDurationMs > FADE_UP_DURATION_MS);
});

test("typewriter export progressively lengthens text within a chunk", () => {
  const scene = getRenderableScenesFromPayload(
    buildFootieExportPayload(subtitlesScene("typewriter")),
  )[0]!;
  const chunkDurationMs = scene.durationMs / scene.subtitleChunks.length;
  const ratios = [0.1, 0.35, 0.6, 0.9];
  const displays = ratios.map((ratio) => {
    const display = resolveExportSubtitleDisplay(scene, {
      sceneElapsedMs: Math.floor(chunkDurationMs * ratio),
      sceneDurationMs: scene.durationMs,
    });
    assert.ok(display);
    return display;
  });
  const lengths = displays.map(
    (display) => (display.animationState?.visibleText ?? display.lines.join("")).length,
  );
  const progresses = displays.map((display) => display.effectProgress);

  assert.ok(lengths.at(-1)! >= lengths[0]!);
  assert.ok(lengths.every((length, index) => index === 0 || length >= lengths[index - 1]!));
  assert.ok(progresses.at(-1)! > progresses[0]!);
});

test("highlight export grows highlight width through chunk elapsed time", () => {
  const scene = getRenderableScenesFromPayload(
    buildFootieExportPayload(subtitlesScene("highlight")),
  )[0]!;
  const chunkDurationMs = scene.durationMs / scene.subtitleChunks.length;
  const widths = [0.15, 0.45, 0.75].map((ratio) => {
    const display = resolveExportSubtitleDisplay(scene, {
      sceneElapsedMs: Math.floor(chunkDurationMs * ratio),
      sceneDurationMs: scene.durationMs,
    });
    assert.ok(display);
    return getExportHighlightSubtitleFrame(
      display.chunkElapsedMs,
      display.activeChunkDurationMs,
    ).highlightWidthProgress;
  });

  assert.ok(widths[0]! < widths.at(-1)!);
});

test("export highlight draws full pill with progressive overlay (preview parity)", () => {
  const canvasUtils = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  const effectPreview = readSrc("src/features/editor/components/subtitleEffectPreview.tsx");

  assert.match(canvasUtils, /resolveExportCaptionHighlightFrame/);
  assert.match(effectPreview, /resolveExportCaptionHighlightFrame/);
  assert.match(canvasUtils, /overlayWidth = pillFullWidth \* highlight\.highlightWidthProgress/);
  assert.match(canvasUtils, /roundRectPath\(ctx, pillLeft, pillTop, pillFullWidth, pillHeight/);
  assert.match(canvasUtils, /ctx\.clip\(\)/);
  assert.match(canvasUtils, /rgba\(255, 255, 255, 0\.1\)/);
  assert.match(effectPreview, /highlight\.highlightWidthProgress \* 100/);
  assert.doesNotMatch(canvasUtils, /pillWidth = pillFullWidth/);
});

test("export highlight early frame keeps text inside full pill bounds", () => {
  const canvasUtils = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  const early = getExportHighlightSubtitleFrame(100, 3000);

  assert.ok(early.highlightWidthProgress < 1);
  assert.match(canvasUtils, /fillText\(line, pillLeft \+ padX, baselineY\)/);
  assert.match(canvasUtils, /const pillFullWidth = textWidth \+ padX \* 2/);
  assert.doesNotMatch(canvasUtils, /roundRectPath\(ctx, pillLeft, pillTop, pillWidth/);
});

test("complete highlight frame fills overlay across full pill", () => {
  const complete = getExportHighlightSubtitleFrame(2999, 3000);
  assert.ok(complete.highlightWidthProgress >= 0.99);
});

test("fade-up and typewriter export paths remain separate from highlight overlay", () => {
  const canvasUtils = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");

  assert.match(canvasUtils, /display\?\.effect === "highlight"/);
  assert.match(canvasUtils, /drawSubtitleBox\(ctx, boxLeft, boxTop, boxWidth, boxHeight/);
  assert.match(canvasUtils, /display\.animationState && display\.effect === "typewriter"/);
  assert.match(canvasUtils, /drawExportCaptionStyledLine\(/);
});

test("export subtitle styling: no full-width bottom band, content-sized pill at ~45% opacity", () => {
  const canvasUtils = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");

  assert.doesNotMatch(canvasUtils, /getExportSubtitleRegionBounds/);
  assert.doesNotMatch(canvasUtils, /repaintSubtitleRegionOverlay/);
  assert.match(canvasUtils, /resolveExportCaptionBackgroundFill/);
  assert.match(canvasUtils, /roundRectPath/);
  const styleDefaults = readSrc("src/features/caption-style/caption-style.defaults.ts");
  assert.match(styleDefaults, /LEGACY_EXPORT_CAPTION_BOX_RADIUS = 12/);
  assert.match(canvasUtils, /drawExportCaptionStyledLine/);
  assert.match(canvasUtils, /widestLineWidth \+ metrics\.padX \* 2/);
});

test("export subtitle pill dimensions scale with 1, 2, and 3 wrapped lines", () => {
  const ctx = {
    measureText(text: string) {
      return { width: text.length * 10 };
    },
  } as CanvasRenderingContext2D;

  const scale = 1;
  const metrics = {
    ...getExportSubtitleLayoutMetrics(scale),
    maxBoxWidth: 900,
    maxTextWidth: 844,
  };

  const oneLine = ["Short"];
  const twoLines = ["Medium width", "Longer width line"];
  const threeLines = ["Top line", "Much longer middle line", "Bottom line"];

  assert.equal(oneLine.length, 1);
  assert.equal(twoLines.length, 2);
  assert.equal(threeLines.length, 3);

  const one = resolveExportSubtitleTextBlockSize(ctx, oneLine, metrics);
  const two = resolveExportSubtitleTextBlockSize(ctx, twoLines, metrics);
  const three = resolveExportSubtitleTextBlockSize(ctx, threeLines, metrics);

  assert.equal(one.boxWidth, ctx.measureText(oneLine[0]!).width + metrics.padX * 2);
  assert.equal(one.boxHeight, metrics.lineHeight + metrics.padY * 2);
  assert.equal(two.boxHeight, metrics.lineHeight * 2 + metrics.padY * 2);
  assert.equal(three.boxHeight, metrics.lineHeight * 3 + metrics.padY * 2);
  assert.ok(one.boxWidth < two.boxWidth);
  assert.ok(two.boxWidth < three.boxWidth);
  assert.ok(three.boxWidth < metrics.maxBoxWidth);
});

test("preview and export subtitle layout stays visually consistent", () => {
  const globalsCss = readSrc("src/app/globals.css");
  const canvasUtils = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  const subtitleUtils = readSrc("src/features/story/utils/subtitle.utils.ts");

  assert.match(globalsCss, /\.preview-narration-subtitle-pill[\s\S]*max-width:\s*90%/);
  assert.match(globalsCss, /\.preview-narration-subtitle-text[\s\S]*line-height:\s*1\.3/);
  assert.match(globalsCss, /\.preview-narration-subtitle-text[\s\S]*color:\s*#fff/);
  assert.match(subtitleUtils, /SUBTITLE_MAX_WIDTH_RATIO = 0\.9/);
  assert.match(canvasUtils, /SUBTITLE_MAX_WIDTH_RATIO/);
  assert.match(canvasUtils, /exportStyle\.lineHeightRatio/);
  assert.match(canvasUtils, /resolveExportCaptionStyleMetrics/);
  assert.match(canvasUtils, /from "@\/features\/caption-style"/);
  const styleDefaults = readSrc("src/features/caption-style/caption-style.defaults.ts");
  assert.match(styleDefaults, /LEGACY_EXPORT_CAPTION_BOX_PAD_X = 18/);
  assert.match(styleDefaults, /LEGACY_EXPORT_CAPTION_BOX_PAD_Y = 10/);
  assert.match(styleDefaults, /LEGACY_EXPORT_CAPTION_BOX_RADIUS = 12/);
  assert.doesNotMatch(globalsCss, /\.preview-narration-subtitle-overlay[\s\S]*inset:\s*0/);
});

test("voiceover, subtitle chunk, and scene timing paths are unchanged by subtitle styling", () => {
  const videoRender = readSrc("src/features/export/services/video-render.service.ts");
  const canvasUtils = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  const sceneUtils = readSrc("src/features/story/utils/scene.utils.ts");

  assert.match(videoRender, /buildAudioMixFromStory\(exportScript\)/);
  assert.match(videoRender, /audioMix\.voiceover/);
  assert.match(videoRender, /resolveTimelineSceneFrame/);
  assert.match(videoRender, /resolveExportSubtitleDisplayFromTimeline/);
  assert.doesNotMatch(canvasUtils, /voiceover/);
  assert.doesNotMatch(canvasUtils, /getSceneTimingMap/);
  assert.doesNotMatch(canvasUtils, /splitSubtitleChunks/);
  assert.match(sceneUtils, /getSceneTimingAtGlobalTime/);
  assert.match(sceneUtils, /getSceneTimingMap/);
});

test("preview and export select the same active chunk and progress", () => {
  const scene = getRenderableScenesFromPayload(buildFootieExportPayload(subtitlesScene("fade-up")))[0]!;
  const subtitleText = scene.subtitleText;
  const previewChunks = splitSubtitleChunks(subtitleText);

  for (const elapsedMs of [500, 3000, 6000]) {
    const timing = { sceneElapsedMs: elapsedMs, sceneDurationMs: scene.durationMs };
    const exportState = getExportSubtitleChunkState(scene, timing);
    const previewState = getActiveSubtitleChunkState(
      subtitleText,
      elapsedMs,
      scene.durationMs,
    );

    assert.equal(exportState.chunk, previewState.chunk);
    assert.equal(exportState.chunk, previewChunks.find((chunk) => chunk === exportState.chunk));
    assert.ok(Math.abs(exportState.progress - previewState.progress) < 0.001);
    assert.equal(
      exportState.effectProgress,
      exportState.chunkElapsedMs / exportState.activeChunkDurationMs,
    );
  }
});

test("safe caption presets resolve export styles matching preview intent", () => {
  for (const presetId of ["minimal", "documentary", "cinematic"] as const) {
    const scene = { captionPreset: presetId, subtitleEffect: "fade-up" as const };
    const exportStyle = resolveExportCaptionStyle(scene);
    const previewStyle = resolvePreviewCaptionStyle(scene);

    assert.equal(exportStyle.usesFadeSafeStyleOverlay, true);
    assert.equal(previewStyle.usesFadeSafeStyleOverlay, true);
    assert.deepEqual(
      {
        fontWeight: exportStyle.fontWeight,
        letterSpacingEm: exportStyle.letterSpacingEm,
        lineHeightRatio: exportStyle.lineHeightRatio,
        textShadow: exportStyle.textShadow,
      },
      FADE_SAFE_CAPTION_STYLE_TOKENS[presetId],
    );
  }
});

test("non-safe presets and non-fade effects keep legacy export styling", () => {
  for (const presetId of ["tiktok", "sports", "news"] as const) {
    const style = resolveExportCaptionStyle({ captionPreset: presetId });
    assert.equal(style.usesFadeSafeStyleOverlay, false);
    assert.equal(style.fontWeight, LEGACY_EXPORT_CAPTION_STYLE_TOKENS.fontWeight);
  }

  const override = resolveExportCaptionStyle({
    captionPreset: "cinematic",
    subtitleEffect: "typewriter",
  });
  assert.equal(override.usesFadeSafeStyleOverlay, false);
  assert.equal(override.fontWeight, LEGACY_EXPORT_CAPTION_STYLE_TOKENS.fontWeight);
});

test("typewriter and highlight export displays skip preset styling", () => {
  for (const effect of ["typewriter", "highlight"] as const) {
    const style = resolveExportCaptionStyleForDisplay({
      captionPreset: "documentary",
      effect,
    });
    assert.equal(style.usesFadeSafeStyleOverlay, false);
    assert.equal(style.fontWeight, LEGACY_EXPORT_CAPTION_STYLE_TOKENS.fontWeight);
  }
});

test("generated caption export path keeps legacy styling", () => {
  const style = resolveExportCaptionStyleForDisplay(undefined);
  assert.equal(style.usesFadeSafeStyleOverlay, false);
  assert.equal(style.fontWeight, LEGACY_EXPORT_CAPTION_STYLE_TOKENS.fontWeight);
  assert.equal(style.lineHeightRatio, LEGACY_EXPORT_CAPTION_STYLE_TOKENS.lineHeightRatio);

  const canvasUtils = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  assert.match(canvasUtils, /drawExportGeneratedCaption/);
  assert.match(canvasUtils, /resolveExportCaptionStyleForDisplay/);
});

test("export subtitle display carries captionPreset for fade-safe styling", () => {
  const script: FootieScript = {
    ...subtitlesScene("fade-up"),
    scenes: [
      {
        ...subtitlesScene("fade-up").scenes[0]!,
        captionPreset: "cinematic",
      },
    ],
  };
  const scene = getRenderableScenesFromPayload(buildFootieExportPayload(script))[0]!;
  const display = resolveExportSubtitleDisplay(scene, {
    sceneElapsedMs: 500,
    sceneDurationMs: scene.durationMs,
  });

  assert.ok(display);
  assert.equal(display!.captionPreset, "cinematic");
  assert.equal(display!.effect, "fade-up");
});

test("typewriter and highlight export timing paths remain unchanged", () => {
  for (const effect of ["typewriter", "highlight"] as const) {
    const scene = getRenderableScenesFromPayload(buildFootieExportPayload(subtitlesScene(effect)))[0]!;
    const timing = { sceneElapsedMs: 1500, sceneDurationMs: scene.durationMs };
    const state = getExportSubtitleChunkState(scene, timing);
    const display = resolveExportSubtitleDisplay(scene, timing);

    assert.ok(state.chunk);
    assert.ok(display);
    assert.equal(display!.effect, effect);
    assert.equal(
      display!.effectProgress,
      state.chunkElapsedMs / state.activeChunkDurationMs,
    );
  }
});

test("tiktok preset applies typewriter motion styling in preview and export", () => {
  const script: FootieScript = {
    ...subtitlesScene("typewriter"),
    scenes: [
      {
        ...subtitlesScene("typewriter").scenes[0]!,
        captionPreset: "tiktok",
      },
    ],
  };
  const scene = getRenderableScenesFromPayload(buildFootieExportPayload(script))[0]!;
  const display = resolveExportSubtitleDisplay(scene, {
    sceneElapsedMs: 500,
    sceneDurationMs: scene.durationMs,
  });

  assert.ok(display);
  assert.equal(display!.captionPreset, "tiktok");
  assert.equal(display!.effect, "typewriter");

  const overlay = resolveTikTokMotionOverlay({
    captionPreset: display!.captionPreset,
    subtitleEffect: display!.effect,
    captionTooShortForEffect: display!.captionTooShortForEffect,
  });
  assert.equal(overlay.usesTikTokMotionOverlay, true);

  const exportStyle = resolveExportCaptionStyleForDisplay({
    captionPreset: display!.captionPreset,
    effect: display!.effect,
    captionTooShortForEffect: display!.captionTooShortForEffect,
  });
  assert.equal(exportStyle.fontWeight, TIKTOK_MOTION_STYLE_TOKENS.fontWeight);

  const previewStyle = resolvePreviewTikTokMotionStyle({
    captionPreset: "tiktok",
    subtitleEffect: "typewriter",
  });
  assert.match(previewStyle.containerClassName, /caption-preset-tiktok/);

  const canvasUtils = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  assert.match(canvasUtils, /resolveTikTokMotionVisualState/);
});

test("tiktok motion pop scale stays within safe bounds", () => {
  assert.ok(resolveTikTokPopScale(0) >= 0.9);
  assert.ok(resolveTikTokPopScale(0) <= 1);
  assert.equal(resolveTikTokPopScale(TIKTOK_POP_DURATION_MS), 1);
  assert.equal(resolveTikTokPopScale(TIKTOK_POP_DURATION_MS + 500), 1);
});

test("fade-safe presets remain unchanged after tiktok motion export wiring", () => {
  for (const presetId of ["minimal", "documentary", "cinematic"] as const) {
    const style = resolveExportCaptionStyle({
      captionPreset: presetId,
      subtitleEffect: "fade-up",
    });
    assert.equal(style.usesFadeSafeStyleOverlay, true);
    assert.deepEqual(
      {
        fontWeight: style.fontWeight,
        letterSpacingEm: style.letterSpacingEm,
        lineHeightRatio: style.lineHeightRatio,
        textShadow: style.textShadow,
      },
      FADE_SAFE_CAPTION_STYLE_TOKENS[presetId],
    );
  }

  const highlightStyle = resolveExportCaptionStyleForDisplay({
    captionPreset: "news",
    effect: "highlight",
  });
  assert.equal(highlightStyle.fontWeight, LEGACY_EXPORT_CAPTION_STYLE_TOKENS.fontWeight);
});

test("sports preset applies highlight motion styling in preview and export", () => {
  const script: FootieScript = {
    ...subtitlesScene("highlight"),
    scenes: [
      {
        ...subtitlesScene("highlight").scenes[0]!,
        captionPreset: "sports",
        durationMs: 9000,
      },
    ],
  };
  const scene = getRenderableScenesFromPayload(buildFootieExportPayload(script))[0]!;
  const display = resolveExportSubtitleDisplay(scene, {
    sceneElapsedMs: 1500,
    sceneDurationMs: scene.durationMs,
  });

  assert.ok(display);
  assert.equal(display!.captionPreset, "sports");
  assert.equal(display!.effect, "highlight");

  const overlay = resolveSportsMotionOverlay({
    captionPreset: display!.captionPreset,
    subtitleEffect: display!.effect,
    subtitleAvailableDurationMs: display!.activeChunkDurationMs,
  });
  assert.equal(overlay.usesSportsMotionOverlay, true);

  const previewStyle = resolvePreviewSportsMotionStyle({
    captionPreset: "sports",
    subtitleEffect: "highlight",
    subtitleAvailableDurationMs: 2000,
  });
  assert.match(previewStyle.containerClassName, /caption-preset-sports/);

  const canvasUtils = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  assert.match(canvasUtils, /resolveSportsMotionVisualState/);
  assert.match(canvasUtils, /SPORTS_MOTION_STYLE_TOKENS/);
});

test("sports highlight state parity uses getExportHighlightSubtitleFrame unchanged", () => {
  const durationMs = 2000;
  const early = getExportHighlightSubtitleFrame(200, durationMs);
  const late = getExportHighlightSubtitleFrame(1600, durationMs);

  assert.ok(early.highlightWidthProgress < late.highlightWidthProgress);
  assert.ok(early.backgroundAlpha <= late.backgroundAlpha);

  const motion = resolveSportsMotionVisualState(
    resolveSportsMotionOverlay({
      captionPreset: "sports",
      subtitleEffect: "highlight",
      subtitleAvailableDurationMs: durationMs,
    }),
    { localElapsedMs: 200 },
  );
  assert.ok(motion.usesSportsGlow);
});

test("short sports highlight windows degrade to legacy highlight styling", () => {
  const overlay = resolveSportsMotionOverlay({
    captionPreset: "sports",
    subtitleEffect: "highlight",
    subtitleAvailableDurationMs: SPORTS_BOUNCE_MIN_WINDOW_MS - 100,
  });
  assert.equal(overlay.usesLegacyHighlightFallback, true);
  assert.equal(inferSportsBounceDisabled(300), true);
});

test("news preset applies lower-third highlight styling in preview and export", () => {
  const script: FootieScript = {
    ...subtitlesScene("highlight"),
    scenes: [
      {
        ...subtitlesScene("highlight").scenes[0]!,
        captionPreset: "news",
        durationMs: 9000,
      },
    ],
  };
  const scene = getRenderableScenesFromPayload(buildFootieExportPayload(script))[0]!;
  const display = resolveExportSubtitleDisplay(scene, {
    sceneElapsedMs: 1500,
    sceneDurationMs: scene.durationMs,
  });

  assert.ok(display);
  assert.equal(display!.captionPreset, "news");
  assert.equal(display!.effect, "highlight");

  const overlay = resolveNewsMotionOverlay({
    captionPreset: display!.captionPreset,
    subtitleEffect: display!.effect,
    subtitleAvailableDurationMs: display!.activeChunkDurationMs,
  });
  assert.equal(overlay.usesNewsMotionOverlay, true);

  const previewStyle = resolvePreviewNewsMotionStyle({
    captionPreset: "news",
    subtitleEffect: "highlight",
    subtitleAvailableDurationMs: 2000,
  });
  assert.match(previewStyle.containerClassName, /caption-preset-news/);

  const canvasUtils = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  assert.match(canvasUtils, /resolveNewsMotionVisualState/);
  assert.match(canvasUtils, /NEWS_MOTION_STYLE_TOKENS/);
});

test("news highlight state parity uses getExportHighlightSubtitleFrame unchanged", () => {
  const durationMs = 2000;
  const early = getExportHighlightSubtitleFrame(200, durationMs);
  const late = getExportHighlightSubtitleFrame(1600, durationMs);

  assert.ok(early.highlightWidthProgress < late.highlightWidthProgress);

  const motion = resolveNewsMotionVisualState(
    resolveNewsMotionOverlay({
      captionPreset: "news",
      subtitleEffect: "highlight",
      subtitleAvailableDurationMs: durationMs,
    }),
    { localElapsedMs: 100 },
  );
  assert.ok(motion.usesNewsLowerThird);
  assert.ok(motion.slideOffsetPx > 0);
});

test("short news highlight windows degrade to standard highlight styling", () => {
  const overlay = resolveNewsMotionOverlay({
    captionPreset: "news",
    subtitleEffect: "highlight",
    subtitleAvailableDurationMs: NEWS_SLIDE_MIN_WINDOW_MS - 100,
  });
  assert.equal(overlay.usesLegacyHighlightFallback, true);
  assert.equal(inferNewsSlideDisabled(300), true);
});

test("sports and tiktok presets remain unchanged by news motion wiring", () => {
  assert.equal(
    resolveSportsMotionOverlay({
      captionPreset: "sports",
      subtitleEffect: "highlight",
      subtitleAvailableDurationMs: 5000,
    }).usesSportsMotionOverlay,
    true,
  );
  assert.equal(
    resolveNewsMotionOverlay({
      captionPreset: "sports",
      subtitleEffect: "highlight",
      subtitleAvailableDurationMs: 5000,
    }).usesNewsMotionOverlay,
    false,
  );
  assert.equal(
    resolveNewsMotionOverlay({
      captionPreset: "tiktok",
      subtitleEffect: "typewriter",
      subtitleAvailableDurationMs: 5000,
    }).usesNewsMotionOverlay,
    false,
  );
});

console.log("All export subtitle QA checks passed.");
