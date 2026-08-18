/**
 * Provider-free Headless caption-background certification.
 * Exercises the prepared-frame / shared canvas contract, not Browser screenshots.
 * Writes gitignored evidence under .tmp/caption-background-authority/.
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveCaptionBackgroundAuthority,
  resolveExportCaptionStyle,
  resolveExportCaptionStyleMetrics,
} from "@/features/caption-style";
import { buildExportManifest } from "@/features/export/domain";
import { resolveLegibilityLayerPlan } from "@/features/legibility-layer";
import type { CaptionStyle } from "@/features/caption-style";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

const ARTIFACT_DIR = join(process.cwd(), ".tmp/caption-background-authority");

const CASES: Array<{ id: string; style: Partial<CaptionStyle>; text: string }> = [
  { id: "off", style: { backgroundEnabled: false, backgroundOpacity: 45 }, text: "No box" },
  { id: "zero", style: { backgroundEnabled: true, backgroundOpacity: 0 }, text: "Zero" },
  { id: "ten", style: { backgroundEnabled: true, backgroundOpacity: 10 }, text: "Ten" },
  { id: "forty-five", style: { backgroundEnabled: true, backgroundOpacity: 45 }, text: "Box" },
];

function buildStory(style: Partial<CaptionStyle>, text: string): FootieScript {
  return syncFootieScript({
    title: "Caption background headless cert",
    narration: text,
    totalDuration: 3,
    scenes: [
      {
        id: "s1",
        start: 0,
        end: 3,
        duration: 3,
        startMs: 0,
        endMs: 3000,
        durationMs: 3000,
        subtitle: text,
        captionMode: "generated",
        captionStyle: style,
        media: {
          type: "image",
          url: "https://example.com/a.jpg",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        },
      },
    ],
  } as FootieScript);
}

function recordCase(id: string, style: Partial<CaptionStyle>, text: string) {
  const story = buildStory(style, text);
  const scene = story.scenes[0]!;
  const authority = resolveCaptionBackgroundAuthority({
    sceneStyle: scene.captionStyle,
    projectStyle: story.defaultCaptionStyle,
    sceneLayout: scene.captionLayout,
    projectLayout: story.defaultCaptionLayout,
  });
  const metrics = resolveExportCaptionStyleMetrics(resolveExportCaptionStyle(scene, story), 1);
  const manifest = buildExportManifest({ story }).captions[0]!.style;
  const plan = resolveLegibilityLayerPlan({
    absoluteContentTimeMs: 800,
    contentDurationMs: 3000,
    storyTitle: story.title,
    hasActiveCaption: true,
    captionPlacement: "bottom",
    captionStyleBackgroundEnabled: authority.backgroundEnabled,
    captionStyleBackgroundOpacity: authority.effectiveOpacityPercent,
    watermarkEnabled: true,
  });
  return {
    id,
    path: "prepared-frame + shared caption canvas",
    authority,
    exportMetrics: {
      backgroundAlpha: metrics.backgroundAlpha,
      drawsFill: metrics.drawsFill,
      drawsBorder: metrics.drawsBorder,
      drawsBlur: metrics.drawsBlur,
    },
    manifest,
    legibility: {
      needsLocalScrim: plan.caption.needsLocalScrim,
      backgroundIntent: plan.caption.backgroundIntent,
      styleProvidesBackground: plan.caption.styleProvidesBackground,
    },
  };
}

function main(): void {
  const prepared = readFileSync(
    join(process.cwd(), "src/features/export/runtime/draw-prepared-export-frame.ts"),
    "utf8",
  );
  const canvas = readFileSync(
    join(process.cwd(), "src/features/export/utils/export-caption-canvas.utils.ts"),
    "utf8",
  );
  const scrim = readFileSync(
    join(process.cwd(), "src/features/legibility-layer/draw-legibility-layer.ts"),
    "utf8",
  );
  assert.match(prepared, /drawExportSubtitlesCaption/);
  assert.match(prepared, /drawLegibilityCaptionScrimIfNeeded/);
  assert.match(prepared, /captionStyleFromManifest/);
  assert.match(canvas, /if \(!styleMetrics\.drawsFill \|\| alpha <= 0\)/);
  assert.doesNotMatch(canvas, /ctx\.stroke\(\);/);
  assert.match(scrim, /if \(!plan\.caption\.needsLocalScrim \|\| !plan\.caption\.region\)/);

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const cases = CASES.map((entry) => recordCase(entry.id, entry.style, entry.text));
  for (const entry of cases) {
    assert.equal(entry.legibility.needsLocalScrim, false);
    assert.equal(entry.exportMetrics.drawsBorder, false);
    assert.equal(entry.exportMetrics.drawsBlur, false);
    if (entry.id === "off" || entry.id === "zero") {
      assert.equal(entry.authority.drawsFill, false);
      assert.equal(entry.exportMetrics.backgroundAlpha, 0);
      assert.equal(entry.manifest.backgroundOpacity, 0);
    }
    if (entry.id === "ten") {
      assert.equal(entry.exportMetrics.backgroundAlpha, 0.1);
    }
    if (entry.id === "forty-five") {
      assert.equal(entry.exportMetrics.backgroundAlpha, 0.45);
    }
  }

  writeFileSync(
    join(ARTIFACT_DIR, "caption-background-authority-headless.json"),
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        path: "headless-prepared-frame",
        cases,
      },
      null,
      2,
    ),
  );
  console.log("CAPTION_BACKGROUND_HEADLESS_CERT: recorded", ARTIFACT_DIR);
}

main();
