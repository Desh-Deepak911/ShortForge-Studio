/**
 * Real-Chromium certification for caption background authority.
 * Writes gitignored evidence under .tmp/caption-background-authority/.
 * Does not touch saved drafts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveCaptionBackgroundAuthority,
  resolveExportCaptionStyle,
  resolveExportCaptionStyleMetrics,
  resolvePreviewCaptionContainerStyle,
} from "@/features/caption-style";
import { buildExportManifest } from "@/features/export/domain";
import { resolveLegibilityLayerPlan } from "@/features/legibility-layer";
import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";
import type { CaptionStyle } from "@/features/caption-style";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

const ARTIFACT_DIR = join(process.cwd(), ".tmp/caption-background-authority");
const ORIGIN = process.env.CAPTION_BACKGROUND_AUTHORITY_ORIGIN ?? "http://localhost:3000";

const CASES: Array<{ id: string; style: Partial<CaptionStyle>; text: string }> = [
  { id: "off", style: { backgroundEnabled: false, backgroundOpacity: 45 }, text: "No box" },
  { id: "zero", style: { backgroundEnabled: true, backgroundOpacity: 0 }, text: "Zero" },
  { id: "ten", style: { backgroundEnabled: true, backgroundOpacity: 10 }, text: "Ten" },
  { id: "forty-five", style: { backgroundEnabled: true, backgroundOpacity: 45 }, text: "Box" },
];

function buildStory(style: Partial<CaptionStyle>, text: string): FootieScript {
  return syncFootieScript({
    title: "Caption background cert",
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
  const preview = resolvePreviewCaptionContainerStyle(scene, story);
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
    text,
    authority,
    preview: {
      backgroundColor: preview.backgroundColor,
      border: preview.border,
      backdropFilter: preview.backdropFilter,
      padding: preview.padding,
      borderRadius: preview.borderRadius,
    },
    exportMetrics: {
      backgroundAlpha: metrics.backgroundAlpha,
      drawsFill: metrics.drawsFill,
      drawsBorder: metrics.drawsBorder,
      drawsBlur: metrics.drawsBlur,
      padX: metrics.padX,
      padY: metrics.padY,
      cornerRadius: metrics.cornerRadius,
    },
    manifest,
    legibility: {
      needsLocalScrim: plan.caption.needsLocalScrim,
      backgroundIntent: plan.caption.backgroundIntent,
      styleProvidesBackground: plan.caption.styleProvidesBackground,
    },
  };
}

async function maybeScreenshotHarness(): Promise<{
  attempted: boolean;
  ok: boolean;
  reason?: string;
}> {
  const chrome = resolveSystemChromeExecutable();
  if (!chrome.ok) {
    return { attempted: false, ok: false, reason: chrome.message };
  }
  let puppeteer: typeof import("puppeteer-core");
  try {
    puppeteer = await import("puppeteer-core");
  } catch {
    return { attempted: false, ok: false, reason: "puppeteer-core unavailable" };
  }

  const browser = await puppeteer.default.launch({
    executablePath: chrome.executable,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    const response = await page.goto(`${ORIGIN}/dev/caption-background-authority-qa`, {
      waitUntil: "domcontentloaded",
    });
    if (!response || !response.ok()) {
      return {
        attempted: true,
        ok: false,
        reason: `harness HTTP ${response?.status() ?? "no-response"}`,
      };
    }
    await page.waitForSelector("[data-caption-background-case=off]", { timeout: 60000 });
    for (const id of ["off", "zero", "ten", "forty-five"]) {
      const preview = await page.$(`[data-caption-background-preview="${id}"]`);
      const canvas = await page.$(`[data-caption-background-canvas="${id}"]`);
      if (preview) {
        await preview.screenshot({
          path: join(ARTIFACT_DIR, `preview-${id}.png`) as `${string}.png`,
        });
      }
      if (canvas) {
        await canvas.screenshot({
          path: join(ARTIFACT_DIR, `canvas-${id}.png`) as `${string}.png`,
        });
      }
    }
    return { attempted: true, ok: true };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const cases = CASES.map((entry) => recordCase(entry.id, entry.style, entry.text));
  const live = await maybeScreenshotHarness();
  const report = {
    recordedAt: new Date().toISOString(),
    liveBrowser: live,
    cases,
  };
  writeFileSync(join(ARTIFACT_DIR, "caption-background-authority.json"), JSON.stringify(report, null, 2));
  console.log("CAPTION_BACKGROUND_CERT: recorded", ARTIFACT_DIR);
  console.log("LIVE_BROWSER:", live.ok ? "ok" : live.reason ?? "skipped");
  for (const entry of cases) {
    console.log(
      `${entry.id}: enabled=${entry.authority.backgroundEnabled} opacity=${entry.authority.effectiveOpacityPercent} fill=${entry.authority.drawsFill} scrim=${entry.legibility.needsLocalScrim}`,
    );
  }
}

void main();
