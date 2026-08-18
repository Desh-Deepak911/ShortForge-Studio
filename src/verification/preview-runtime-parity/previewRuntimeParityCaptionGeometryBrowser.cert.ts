/**
 * Real-Chromium certification for Prompt 4 caption geometry.
 * Writes gitignored evidence under .tmp/preview-runtime-parity/.
 * Does not touch saved drafts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";

const ORIGIN = process.env.PREVIEW_RUNTIME_PARITY_ORIGIN ?? "http://localhost:3000";
const ARTIFACT_DIR = join(process.cwd(), ".tmp/preview-runtime-parity");
const DRIFT_TOLERANCE_OUTPUT_PX = 4;

type CaptionBounds = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly outputLeft: number;
  readonly outputTop: number;
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly outputCenterX: number;
  readonly outputCenterY: number;
  readonly anchor: string;
  readonly legacy: string;
  readonly frameWidth: string;
  readonly fontSize: string;
};

async function nextPaint(page: { evaluate: (fn: string) => Promise<unknown> }): Promise<void> {
  await page.evaluate(`new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  })`);
}

async function measureCaption(page: { evaluate: (fn: string) => Promise<unknown> }): Promise<CaptionBounds | null> {
  return (await page.evaluate(`(() => {
    const host = document.querySelector("[data-preview-runtime-parity-preview-host]");
    const box =
      host?.querySelector("[data-preview-caption-visual-box]") ??
      host?.querySelector("[data-preview-caption-placement-box]");
    if (!host || !box) return null;
    const frame = host.getBoundingClientRect();
    const rect = box.getBoundingClientRect();
    if (frame.width <= 0 || frame.height <= 0 || rect.width <= 0 || rect.height <= 0) return null;
    const left = rect.left - frame.left;
    const top = rect.top - frame.top;
    return {
      left,
      top,
      width: rect.width,
      height: rect.height,
      centerX: left + rect.width / 2,
      centerY: top + rect.height / 2,
      outputLeft: (left / frame.width) * 1080,
      outputTop: (top / frame.height) * 1920,
      outputWidth: (rect.width / frame.width) * 1080,
      outputHeight: (rect.height / frame.height) * 1920,
      outputCenterX: ((left + rect.width / 2) / frame.width) * 1080,
      outputCenterY: ((top + rect.height / 2) / frame.height) * 1920,
      anchor: host.querySelector("[data-preview-caption-anchor]")?.getAttribute("data-preview-caption-anchor") ?? "",
      legacy: host.querySelector("[data-preview-caption-legacy]")?.getAttribute("data-preview-caption-legacy") ?? "",
      frameWidth: host.querySelector("[data-preview-caption-frame-width]")?.getAttribute("data-preview-caption-frame-width") ?? "",
      fontSize: host.querySelector(".preview-narration-subtitle-text")
        ? getComputedStyle(host.querySelector(".preview-narration-subtitle-text")).fontSize
        : "",
    };
  })()`)) as CaptionBounds | null;
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

  const findings: Record<string, unknown> = {
    chrome: chrome.version,
    origin: ORIGIN,
    draftTouched: false,
    driftToleranceOutputPx: DRIFT_TOLERANCE_OUTPUT_PX,
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
    await page.waitForSelector("[data-preview-caption-placement-surface]");
    await nextPaint(page);

    const clickAttr = async (selector: string) => {
      const clicked = await page.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.scrollIntoView({ block: "center" });
        el.click();
        return true;
      })()`);
      if (!clicked) {
        throw new Error(`Missing control ${selector}`);
      }
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

    const seek = async (value: number) => {
      await page.evaluate(`(() => {
        const el = document.querySelector("[data-preview-runtime-parity-seek]");
        if (!el) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(el, ${JSON.stringify(String(value))});
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      })()`);
      await nextPaint(page);
    };

    await setSelect("[data-preview-runtime-parity-caption-anchor]", "center");
    await setSelect("[data-preview-runtime-parity-caption-align]", "center");
    await setSelect("[data-preview-runtime-parity-caption-effect]", "none");
    await clickAttr("[data-preview-runtime-parity-width='260']");
    await seek(200);
    const idleCenter = await measureCaption(page);
    await page.screenshot({
      path: join(ARTIFACT_DIR, "06-caption-idle-center.png") as `${string}.png`,
    });

    await clickAttr("[data-preview-runtime-parity-play-scene]");
    await new Promise((resolve) => setTimeout(resolve, 400));
    const playingEarly = await measureCaption(page);
    await new Promise((resolve) => setTimeout(resolve, 700));
    const playingMid = await measureCaption(page);
    await page.screenshot({
      path: join(ARTIFACT_DIR, "07-caption-playing-center.png") as `${string}.png`,
    });
    await clickAttr("[data-preview-runtime-parity-pause]");
    const paused = await measureCaption(page);
    await seek(1200);
    const seekForward = await measureCaption(page);
    await seek(200);
    const seekBack = await measureCaption(page);

    await setSelect("[data-preview-runtime-parity-caption-effect]", "typewriter");
    await clickAttr("[data-preview-runtime-parity-play-scene]");
    await new Promise((resolve) => setTimeout(resolve, 180));
    const typewriterEarly = await measureCaption(page);
    await new Promise((resolve) => setTimeout(resolve, 450));
    const typewriterMid = await measureCaption(page);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const typewriterFinal = await measureCaption(page);
    await clickAttr("[data-preview-runtime-parity-pause]");

    await setSelect("[data-preview-runtime-parity-caption-effect]", "fade");
    await clickAttr("[data-preview-runtime-parity-play-scene]");
    await new Promise((resolve) => setTimeout(resolve, 250));
    const fadeUp = await measureCaption(page);
    await clickAttr("[data-preview-runtime-parity-pause]");

    await setSelect("[data-preview-runtime-parity-caption-effect]", "highlight");
    await clickAttr("[data-preview-runtime-parity-play-scene]");
    await new Promise((resolve) => setTimeout(resolve, 350));
    const highlight = await measureCaption(page);
    await clickAttr("[data-preview-runtime-parity-pause]");

    const anchors: Record<string, CaptionBounds | null> = {};
    for (const anchor of [
      "top_left",
      "top_center",
      "top_right",
      "center_left",
      "center",
      "center_right",
      "bottom_left",
      "bottom_center",
      "bottom_right",
    ]) {
      await setSelect("[data-preview-runtime-parity-caption-anchor]", anchor);
      anchors[anchor] = await measureCaption(page);
    }

    const widths: Record<string, CaptionBounds | null> = {};
    await setSelect("[data-preview-runtime-parity-caption-anchor]", "center");
    for (const width of [220, 260, 360]) {
      await clickAttr(`[data-preview-runtime-parity-width='${width}']`);
      widths[String(width)] = await measureCaption(page);
    }

    await clickAttr("[data-preview-runtime-parity-width='260']");
    const beforeDrag = await measureCaption(page);
    const dragged = await page.evaluate(`(() => {
      const pill = document.querySelector("[data-preview-caption-visual-box]")?.parentElement;
      if (!pill) return false;
      const start = pill.getBoundingClientRect();
      pill.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: start.x + 8, clientY: start.y + 8, pointerId: 1 }));
      pill.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: start.x + 28, clientY: start.y + 8, pointerId: 1 }));
      pill.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: start.x + 28, clientY: start.y + 8, pointerId: 1 }));
      return true;
    })()`);
    await nextPaint(page);
    const afterDrag = await measureCaption(page);

    const selectIds = await page.$$eval(
      "[data-preview-runtime-parity-select]",
      (buttons) => buttons.map((button) => button.getAttribute("data-preview-runtime-parity-select") ?? ""),
    );
    if (selectIds[1]) {
      await clickAttr(`[data-preview-runtime-parity-select="${selectIds[1]}"]`);
    }
    const inspection = await measureCaption(page);
    await page.screenshot({
      path: join(ARTIFACT_DIR, "08-caption-inspection.png") as `${string}.png`,
    });

    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    const reducedMotion = await measureCaption(page);

    for (const preset of ["tiktok", "sports", "news"] as const) {
      await setSelect("[data-preview-runtime-parity-caption-preset]", preset);
    }
    const newsPreset = await measureCaption(page);

    const centerDrift = (a: CaptionBounds | null, b: CaptionBounds | null) => {
      if (!a || !b) return Number.POSITIVE_INFINITY;
      return Math.hypot(a.outputCenterX - b.outputCenterX, a.outputCenterY - b.outputCenterY);
    };

    findings.idleCenter = idleCenter;
    findings.playingEarly = playingEarly;
    findings.playingMid = playingMid;
    findings.paused = paused;
    findings.seekForward = seekForward;
    findings.seekBack = seekBack;
    findings.typewriter = { early: typewriterEarly, mid: typewriterMid, final: typewriterFinal };
    findings.fadeUp = fadeUp;
    findings.highlight = highlight;
    findings.anchors = anchors;
    findings.widths = widths;
    findings.drag = { before: beforeDrag, after: afterDrag, dragged };
    findings.inspection = inspection;
    findings.reducedMotion = reducedMotion;
    findings.newsPreset = newsPreset;
    findings.centerPlayDrift = centerDrift(idleCenter, playingMid);
    findings.typewriterDrift = centerDrift(typewriterEarly, typewriterFinal);
    findings.widthCenterNorm = {
      220: widths["220"] ? widths["220"].outputCenterX / 1080 : null,
      260: widths["260"] ? widths["260"].outputCenterX / 1080 : null,
      360: widths["360"] ? widths["360"].outputCenterX / 1080 : null,
    };

    if (!idleCenter || !playingMid) {
      throw new Error("Caption box was not measurable in idle or playback");
    }
    if (centerDrift(idleCenter, playingMid) > DRIFT_TOLERANCE_OUTPUT_PX) {
      throw new Error(`Center drifted during playback: ${centerDrift(idleCenter, playingMid)}`);
    }
    if (typewriterEarly && typewriterFinal && centerDrift(typewriterEarly, typewriterFinal) > DRIFT_TOLERANCE_OUTPUT_PX) {
      throw new Error(`Center drifted during typewriter: ${centerDrift(typewriterEarly, typewriterFinal)}`);
    }

    writeFileSync(
      join(ARTIFACT_DIR, "prompt4-browser-cert.json"),
      `${JSON.stringify(findings, null, 2)}\n`,
    );
    console.log("BROWSER_CERT: caption geometry passed");
    console.log(`  idle→play center drift: ${centerDrift(idleCenter, playingMid).toFixed(2)} output px`);
    console.log(`  typewriter drift: ${centerDrift(typewriterEarly, typewriterFinal).toFixed(2)} output px`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
