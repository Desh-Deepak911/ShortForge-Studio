/**
 * Real-Chromium certification for Prompt 2 Preview lifecycle.
 * Writes gitignored evidence under .tmp/preview-runtime-parity/.
 * Does not touch saved drafts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";

const ORIGIN = process.env.PREVIEW_RUNTIME_PARITY_ORIGIN ?? "http://localhost:3000";
const ARTIFACT_DIR = join(process.cwd(), ".tmp/preview-runtime-parity");

type Snapshot = {
  readonly sceneElapsedMs: string;
  readonly playbackMediaId: string;
  readonly mountedPlanIds: string;
  readonly canonicalActiveId: string;
  readonly mountedPrimaryId: string;
  readonly mountedOutgoingId: string;
  readonly mountedLayerCount: string;
  readonly videoSrcs: string[];
  readonly mediaItemIds: string[];
  readonly videoCount: number;
  readonly canvasCount: number;
  readonly playbackAuthority: string;
  readonly inspectionMediaId: string;
};

async function nextPaint(page: { evaluate: (fn: string) => Promise<unknown> }): Promise<void> {
  await page.evaluate(`new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  })`);
}

async function snapshot(page: { evaluate: (fn: string) => Promise<unknown> }): Promise<Snapshot> {
  return (await page.evaluate(`(() => {
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? "";
    const attr = (selector, name) => document.querySelector(selector)?.getAttribute(name) ?? "";
    const videos = [...document.querySelectorAll("video")];
    return {
      sceneElapsedMs: text("[data-preview-runtime-parity-scene-elapsed-ms]"),
      playbackMediaId: text("[data-preview-runtime-parity-playback-media-id]"),
      mountedPlanIds: text("[data-preview-runtime-parity-mounted-ids]"),
      canonicalActiveId: attr("[data-preview-stable-media-stack]", "data-preview-canonical-active-id"),
      mountedPrimaryId: attr("[data-preview-stable-media-stack]", "data-preview-mounted-primary-id"),
      mountedOutgoingId: attr("[data-preview-stable-media-stack]", "data-preview-mounted-outgoing-id"),
      mountedLayerCount: attr("[data-preview-stable-media-stack]", "data-preview-mounted-layer-count"),
      videoSrcs: videos.map((video) => video.currentSrc || video.getAttribute("src") || ""),
      mediaItemIds: [...document.querySelectorAll("[data-scene-media-item-id]")]
        .map((node) => node.getAttribute("data-scene-media-item-id") ?? "")
        .filter(Boolean),
      videoCount: videos.length,
      canvasCount: document.querySelectorAll("canvas[data-scene-frame-layer='background']").length,
      playbackAuthority: text("[data-preview-runtime-parity-playback-authority]"),
      inspectionMediaId: text("[data-preview-runtime-parity-inspection-media-id]"),
    };
  })()`)) as Snapshot;
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
    await page.waitForSelector("[data-preview-runtime-parity-windows] li");
    await nextPaint(page);

    const windowIds = await page.$$eval(
      "[data-preview-runtime-parity-remove]",
      (buttons) => buttons.map((button) => button.getAttribute("data-preview-runtime-parity-remove") ?? ""),
    );
    if (windowIds.length < 2) {
      throw new Error("Harness did not expose removable media items");
    }

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

    await seek(200);
    const idleBefore = await snapshot(page);
    await page.screenshot({
      path: join(ARTIFACT_DIR, "01-idle-before-remove.png") as `${string}.png`,
    });

    const firstId = windowIds[0]!;
    await clickAttr(`[data-preview-runtime-parity-remove="${firstId}"]`);
    const afterFirstRemove = await snapshot(page);
    await page.screenshot({
      path: join(ARTIFACT_DIR, "02-after-remove-first.png") as `${string}.png`,
    });

    const selectButtons = await page.$$eval(
      "[data-preview-runtime-parity-select]",
      (buttons) => buttons.map((button) => button.getAttribute("data-preview-runtime-parity-select") ?? ""),
    );
    const item2 = selectButtons[1];
    if (item2) {
      await clickAttr(`[data-preview-runtime-parity-select="${item2}"]`);
    }
    const afterSelect2 = await snapshot(page);

    await clickAttr("[data-preview-runtime-parity-pause]");
    await seek(4500);
    const pausedBefore = await snapshot(page);
    const pausedId = pausedBefore.mountedPrimaryId;
    if (pausedId) {
      await clickAttr(`[data-preview-runtime-parity-remove="${pausedId}"]`);
    }
    const afterPausedRemove = await snapshot(page);

    await clickAttr("[data-preview-runtime-parity-restart-scene]");
    await clickAttr("[data-preview-runtime-parity-play]");
    await page
      .waitForFunction(
        `() => Number(document.querySelector("[data-preview-runtime-parity-scene-elapsed-ms]")?.textContent ?? "0") > 2800`,
        { timeout: 15_000 },
      )
      .catch(() => undefined);
    const duringPlay = await snapshot(page);
    await clickAttr("[data-preview-runtime-parity-pause]");

    const remaining = await page.$$eval(
      "[data-preview-runtime-parity-replace]",
      (buttons) => buttons.map((button) => button.getAttribute("data-preview-runtime-parity-replace") ?? ""),
    );
    if (remaining[0]) {
      await clickAttr(`[data-preview-runtime-parity-replace="${remaining[0]}"]`);
    }
    const afterReplace = await snapshot(page);

    const hasMoveRight = await page.evaluate(
      `Boolean(document.querySelector("[data-preview-runtime-parity-move-right]"))`,
    );
    if (hasMoveRight) {
      await clickAttr("[data-preview-runtime-parity-move-right]");
    }
    const afterReorder = await snapshot(page);

    await clickAttr("[data-preview-runtime-parity-restart-story]");
    const sceneCount = await page.evaluate(
      `document.querySelectorAll("[data-preview-runtime-parity-scene-select]").length`,
    );
    if (Number(sceneCount) > 1) {
      await clickAttr('[data-preview-runtime-parity-scene-select="1"]');
    }
    const otherScene = await snapshot(page);
    if (Number(sceneCount) > 0) {
      await clickAttr('[data-preview-runtime-parity-scene-select="0"]');
    }
    const returnedScene = await snapshot(page);

    await clickAttr("[data-preview-runtime-parity-restart-scene]");
    const replay = await snapshot(page);

    findings.cases = {
      idleBefore,
      afterFirstRemove,
      afterSelect2,
      pausedBefore,
      afterPausedRemove,
      duringPlay,
      afterReplace,
      afterReorder,
      otherScene,
      returnedScene,
      replay,
    };

    const removedStillMounted =
      afterFirstRemove.mediaItemIds.includes(firstId) ||
      afterFirstRemove.mountedPrimaryId === firstId ||
      afterFirstRemove.mountedPlanIds.includes(firstId);
    const inspectionStillIgnored =
      !item2 || afterSelect2.mountedPrimaryId !== item2;
    const pausedRemovedGone = !pausedId || (
      !afterPausedRemove.mediaItemIds.includes(pausedId) &&
      afterPausedRemove.mountedPrimaryId !== pausedId
    );

    findings.pass = {
      removedFirstDisappeared: !removedStillMounted,
      inspectionStillIgnored,
      pausedRemoveReconciled: pausedRemovedGone,
      replaceChangedSource: afterReplace.videoSrcs.some((src) => src.includes("image-q")) ||
        afterReplace.mountedPlanIds !== pausedBefore.mountedPlanIds,
      sceneReturnKeptReconciliation: !returnedScene.mediaItemIds.includes(firstId),
      replayAtSceneStart: Number(replay.sceneElapsedMs) < 250,
    };

    writeFileSync(
      join(ARTIFACT_DIR, "prompt2-browser-cert.json"),
      `${JSON.stringify(findings, null, 2)}\n`,
    );
    console.log("BROWSER_CERT: attempted");
    console.log(JSON.stringify(findings.pass, null, 2));
    if (!findings.pass || Object.values(findings.pass).some((value) => value !== true)) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
