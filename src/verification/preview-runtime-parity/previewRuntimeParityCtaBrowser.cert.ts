/**
 * Real-Chromium certification for Prompt 5 CTA measured parity.
 * Writes gitignored evidence under .tmp/preview-runtime-parity/.
 * Does not touch saved drafts and does not claim exported-video certification.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";
import { PREVIEW_RUNTIME_PARITY_CTA_BUILD_MARKER } from "@/features/preview/runtime-parity/preview-runtime-parity-cta-contract";

const ORIGIN = process.env.PREVIEW_RUNTIME_PARITY_ORIGIN ?? "http://localhost:3000";
const ARTIFACT_DIR = join(process.cwd(), ".tmp/preview-runtime-parity");

type JsonRecord = Record<string, unknown>;

async function nextPaint(page: { evaluate: (fn: string) => Promise<unknown> }): Promise<void> {
  await page.evaluate(`new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  })`);
}

async function readJson(
  page: { evaluate: (fn: string) => Promise<unknown> },
  selector: string,
): Promise<JsonRecord | null> {
  const raw = (await page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    return el ? el.textContent : null;
  })()`)) as string | null;
  if (!raw || raw === "none") return null;
  try {
    return JSON.parse(raw) as JsonRecord;
  } catch {
    return null;
  }
}

async function screenshotPair(
  page: {
    evaluate: (fn: string) => Promise<unknown>;
    screenshot: (opts: { path: `${string}.png`; clip?: { x: number; y: number; width: number; height: number } }) => Promise<unknown>;
  },
  previewName: string,
  canvasName: string,
): Promise<void> {
  const boxes = (await page.evaluate(`(() => {
    const preview = document.querySelector("[data-preview-runtime-parity-cta-preview]");
    const canvas = document.querySelector("[data-preview-runtime-parity-cta-canvas-host]");
    const toBox = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return { preview: toBox(preview), canvas: toBox(canvas) };
  })()`)) as {
    preview: { x: number; y: number; width: number; height: number } | null;
    canvas: { x: number; y: number; width: number; height: number } | null;
  };
  if (boxes.preview && boxes.preview.width > 0 && boxes.preview.height > 0) {
    await page.screenshot({
      path: join(ARTIFACT_DIR, previewName) as `${string}.png`,
      clip: {
        x: Math.max(0, boxes.preview.x),
        y: Math.max(0, boxes.preview.y),
        width: Math.min(800, boxes.preview.width),
        height: Math.min(1200, boxes.preview.height),
      },
    });
  }
  if (boxes.canvas && boxes.canvas.width > 0 && boxes.canvas.height > 0) {
    await page.screenshot({
      path: join(ARTIFACT_DIR, canvasName) as `${string}.png`,
      clip: {
        x: Math.max(0, boxes.canvas.x),
        y: Math.max(0, boxes.canvas.y),
        width: Math.min(800, boxes.canvas.width),
        height: Math.min(1200, boxes.canvas.height),
      },
    });
  }
}

function classifyForeignObject(preview: JsonRecord | null, canvas: JsonRecord | null): {
  readonly classification: string;
  readonly computedFontSizePx: number | null;
  readonly visualLabelOutputHeight: number | null;
  readonly planFontSize: number | null;
  readonly expectedVisualFontPx: number | null;
} {
  const computedFontSizePx =
    typeof preview?.computedFontSizePx === "number" ? preview.computedFontSizePx : null;
  const innerWidth = typeof preview?.innerWidth === "number" ? preview.innerWidth : null;
  const labels = Array.isArray(preview?.labels) ? preview.labels : [];
  const firstLabel = labels[0] as { height?: number } | undefined;
  const visualLabelHeight =
    typeof firstLabel?.height === "number" ? firstLabel.height : null;
  const planFontSize = typeof canvas?.fontSize === "number" ? canvas.fontSize : null;
  const expectedVisualFontPx =
    planFontSize != null && innerWidth != null ? planFontSize * (innerWidth / 1080) : null;
  const visualLabelOutputHeight =
    visualLabelHeight != null && innerWidth != null
      ? (visualLabelHeight / innerWidth) * 1080
      : null;

  if (computedFontSizePx == null || expectedVisualFontPx == null || visualLabelHeight == null) {
    return {
      classification: "insufficient-metrics",
      computedFontSizePx,
      visualLabelOutputHeight,
      planFontSize,
      expectedVisualFontPx,
    };
  }

  const computedLooksUnscaled = Math.abs(computedFontSizePx - (planFontSize ?? 0)) < 2;
  const visualMatchesScaled = Math.abs(visualLabelHeight - expectedVisualFontPx) <= 3;
  const visualMatchesUnscaled = Math.abs(visualLabelHeight - computedFontSizePx) <= 3;

  let classification = "foreignObject-scales-with-viewbox";
  if (computedLooksUnscaled && visualMatchesUnscaled && !visualMatchesScaled) {
    classification = "foreignObject-css-pixels-do-not-scale";
  } else if (visualMatchesScaled) {
    classification = "foreignObject-scales-with-viewbox";
  } else {
    classification = "font-metric-or-layout-difference";
  }

  return {
    classification,
    computedFontSizePx,
    visualLabelOutputHeight,
    planFontSize,
    expectedVisualFontPx,
  };
}

async function main(): Promise<void> {
  const chrome = resolveSystemChromeExecutable();
  if (!chrome.ok) {
    console.log(`BROWSER_CERT: unavailable (${chrome.message})`);
    process.exitCode = 0;
    return;
  }

  let puppeteer: typeof import("puppeteer-core");
  try {
    puppeteer = await import("puppeteer-core");
  } catch {
    console.log("BROWSER_CERT: unavailable (puppeteer-core unavailable)");
    process.exitCode = 0;
    return;
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const browser = await puppeteer.default.launch({
    executablePath: chrome.executable,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const findings: JsonRecord = {
    chrome: chrome.version,
    origin: ORIGIN,
    draftTouched: false,
    exportedVideoCertified: false,
    buildMarkerExpected: PREVIEW_RUNTIME_PARITY_CTA_BUILD_MARKER,
  };

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1100 });
    page.setDefaultTimeout(60_000);
    const response = await page.goto(`${ORIGIN}/dev/preview-runtime-parity-qa`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    if (!response || response.status() >= 400) {
      throw new Error(`Harness HTTP ${response?.status() ?? "no-response"}`);
    }
    await page.waitForSelector("[data-preview-runtime-parity-qa-harness]");
    await page.waitForSelector("[data-preview-runtime-parity-build-marker]");
    await nextPaint(page);

    const buildMarker = (await page.evaluate(`(() => {
      return document
        .querySelector("[data-preview-runtime-parity-build-marker]")
        ?.getAttribute("data-preview-runtime-parity-build-marker") ?? "";
    })()`)) as string;
    findings.buildMarkerActual = buildMarker;
    findings.staleBuild = buildMarker !== PREVIEW_RUNTIME_PARITY_CTA_BUILD_MARKER;
    if (findings.staleBuild) {
      throw new Error(`Stale build marker: ${buildMarker}`);
    }

    const clickAttr = async (selector: string) => {
      const clicked = await page.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.scrollIntoView({ block: "center" });
        el.click();
        return true;
      })()`);
      if (!clicked) throw new Error(`Missing control ${selector}`);
      await nextPaint(page);
    };

    const setSelect = async (selector: string, value: string) => {
      await page.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return;
        el.value = ${JSON.stringify(value)};
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      })()`);
      await nextPaint(page);
      await new Promise((resolve) => setTimeout(resolve, 80));
    };

    const setScale = async (value: number) => {
      await page.evaluate(`(() => {
        const el = document.querySelector("[data-preview-runtime-parity-cta-scale]");
        if (!el) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(el, ${JSON.stringify(String(value))});
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      })()`);
      await nextPaint(page);
    };

    const captureCase = async (id: string) => {
      await nextPaint(page);
      await new Promise((resolve) => setTimeout(resolve, 60));
      const preview = await readJson(page, "[data-preview-runtime-parity-cta-measurements]");
      const canvas = await readJson(page, "[data-preview-runtime-parity-cta-canvas-plan-json]");
      const compare = await readJson(page, "[data-preview-runtime-parity-cta-compare-json]");
      const fo = classifyForeignObject(preview, canvas);
      return { id, preview, canvas, compare, foreignObject: fo };
    };

    await clickAttr("[data-preview-runtime-parity-width='260']");
    await setSelect("[data-preview-runtime-parity-cta-kind]", "combined");
    await setSelect("[data-preview-runtime-parity-cta-size]", "medium");
    await setSelect("[data-preview-runtime-parity-cta-position]", "top-right");
    await setScale(1);
    await setSelect("[data-preview-runtime-parity-cta-collision]", "none");
    await setSelect("[data-preview-runtime-parity-cta-checkpoint]", "hold");
    const medium244 = await captureCase("combined-medium-244");
    await screenshotPair(page, "prompt5-cta-preview-medium.png", "prompt5-cta-canvas-medium.png");

    await setSelect("[data-preview-runtime-parity-cta-size]", "large");
    const large244 = await captureCase("combined-large-244");
    await screenshotPair(page, "prompt5-cta-preview-large.png", "prompt5-cta-canvas-large.png");

    await setSelect("[data-preview-runtime-parity-cta-size]", "medium");
    await clickAttr("[data-preview-runtime-parity-width='220']");
    const medium204 = await captureCase("combined-medium-204");
    await screenshotPair(page, "prompt5-cta-preview-204.png", "prompt5-cta-canvas-204.png");

    await clickAttr("[data-preview-runtime-parity-width='360']");
    const medium344 = await captureCase("combined-medium-344");
    await screenshotPair(page, "prompt5-cta-preview-344.png", "prompt5-cta-canvas-344.png");

    await clickAttr("[data-preview-runtime-parity-width='260']");
    await setSelect("[data-preview-runtime-parity-cta-kind]", "like");
    const like = await captureCase("like-medium-244");
    await setSelect("[data-preview-runtime-parity-cta-kind]", "share");
    const share = await captureCase("share-medium-244");
    await setSelect("[data-preview-runtime-parity-cta-kind]", "subscribe");
    const subscribe = await captureCase("subscribe-medium-244");

    await setSelect("[data-preview-runtime-parity-cta-kind]", "combined");
    await setScale(1.15);
    const maxScale = await captureCase("combined-medium-max-scale");
    await setScale(1);

    await setSelect("[data-preview-runtime-parity-cta-position]", "top-center");
    const top = await captureCase("combined-top");
    await setSelect("[data-preview-runtime-parity-cta-position]", "center");
    const center = await captureCase("combined-center");
    await setSelect("[data-preview-runtime-parity-cta-position]", "bottom-center");
    const bottom = await captureCase("combined-bottom");

    await setSelect("[data-preview-runtime-parity-cta-collision]", "collide");
    await setSelect("[data-preview-runtime-parity-cta-checkpoint]", "hold");
    const collide = await captureCase("caption-collide");
    await setSelect("[data-preview-runtime-parity-cta-collision]", "relocated");
    const relocated = await captureCase("caption-relocated");
    await setSelect("[data-preview-runtime-parity-cta-collision]", "none");
    await setSelect("[data-preview-runtime-parity-cta-position]", "top-right");

    const motion: Record<string, unknown> = {};
    for (const checkpoint of [
      "hidden-before",
      "entrance-start",
      "entrance-mid",
      "hold",
      "like-active",
      "share-active",
      "subscribe-active",
      "subscribe-confirm",
      "exit-start",
      "exit-mid",
      "hidden-after",
    ]) {
      await setSelect("[data-preview-runtime-parity-cta-checkpoint]", checkpoint);
      motion[checkpoint] = await captureCase(checkpoint);
    }

    const selectIds = await page.$$eval(
      "[data-preview-runtime-parity-select]",
      (buttons) => buttons.map((button) => button.getAttribute("data-preview-runtime-parity-select") ?? ""),
    );
    if (selectIds[1]) {
      await setSelect("[data-preview-runtime-parity-cta-checkpoint]", "hold");
      await clickAttr(`[data-preview-runtime-parity-select="${selectIds[1]}"]`);
    }
    const inspection = await captureCase("selected-media-inspection");
    await clickAttr("[data-preview-runtime-parity-clear-selection]");

    findings.cases = {
      medium244,
      large244,
      medium204,
      medium344,
      like,
      share,
      subscribe,
      maxScale,
      top,
      center,
      bottom,
      collide,
      relocated,
      inspection,
    };
    findings.motion = motion;
    findings.foreignObjectClassification = medium244.foreignObject;
    findings.oversizedReproduced =
      medium244.foreignObject.classification === "foreignObject-css-pixels-do-not-scale" ||
      (typeof medium244.compare?.withinOuterTolerance === "boolean" &&
        medium244.compare.withinOuterTolerance === false);

    writeFileSync(
      join(ARTIFACT_DIR, "prompt5-cta-measurements.json"),
      `${JSON.stringify(findings, null, 2)}\n`,
    );
    console.log("BROWSER_CERT: CTA measured parity captured");
    console.log(`  build marker: ${buildMarker}`);
    console.log(`  FO classification: ${medium244.foreignObject.classification}`);
    console.log(`  outer within tolerance: ${String(medium244.compare?.withinOuterTolerance)}`);
    console.log(`  inner width: ${String(medium244.preview?.innerWidth)}`);
    console.log(`  host width: ${String(medium244.preview?.hostWidth)}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
