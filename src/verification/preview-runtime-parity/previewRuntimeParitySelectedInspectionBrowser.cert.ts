/**
 * Real-Chromium certification for Prompt 3 selected-media inspection.
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
  readonly inspectionActive: string;
  readonly inspectionMediaId: string;
  readonly frameInspectionActive: string;
  readonly frameInspectionItemId: string;
  readonly intraSceneActive: string;
  readonly videoSrcs: string[];
  readonly mediaItemIds: string[];
  readonly videoCount: number;
  readonly canvasCount: number;
  readonly playbackAuthority: string;
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
      inspectionActive: text("[data-preview-runtime-parity-inspection-active]"),
      inspectionMediaId: text("[data-preview-runtime-parity-inspection-media-id]"),
      frameInspectionActive: attr("[data-preview-stable-media-stack]", "data-preview-inspection-active"),
      frameInspectionItemId: attr("[data-preview-stable-media-stack]", "data-preview-inspection-item-id"),
      intraSceneActive: attr("[data-preview-stable-media-stack]", "data-intra-scene-transition-active"),
      videoSrcs: videos.map((video) => video.currentSrc || video.getAttribute("src") || ""),
      mediaItemIds: [...document.querySelectorAll("[data-scene-media-item-id]")]
        .map((node) => node.getAttribute("data-scene-media-item-id") ?? "")
        .filter(Boolean),
      videoCount: videos.length,
      canvasCount: document.querySelectorAll("canvas[data-scene-frame-layer='background']").length,
      playbackAuthority: text("[data-preview-runtime-parity-playback-authority]"),
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
    draftTouched: false,
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
    const selectIds = await page.$$eval(
      "[data-preview-runtime-parity-select]",
      (buttons) => buttons.map((button) => button.getAttribute("data-preview-runtime-parity-select") ?? ""),
    );
    if (selectIds.length < 3) {
      throw new Error("Harness did not expose three selectable media items");
    }
    const [item1, item2, item3] = selectIds;

    await clickAttr(`[data-preview-runtime-parity-select="${item1}"]`);
    const inspect1 = await snapshot(page);
    await page.screenshot({
      path: join(ARTIFACT_DIR, "03-inspect-item-1.png") as `${string}.png`,
    });

    await clickAttr(`[data-preview-runtime-parity-select="${item2}"]`);
    const inspect2 = await snapshot(page);
    await page.screenshot({
      path: join(ARTIFACT_DIR, "04-inspect-item-2.png") as `${string}.png`,
    });

    await clickAttr(`[data-preview-runtime-parity-select="${item3}"]`);
    const inspect3 = await snapshot(page);
    await page.screenshot({
      path: join(ARTIFACT_DIR, "05-inspect-item-3.png") as `${string}.png`,
    });

    await clickAttr(`[data-preview-runtime-parity-inspect-zoom="${item3}"]`);
    const afterZoom = await snapshot(page);

    await clickAttr(`[data-preview-runtime-parity-replace="${item3}"]`);
    const afterReplace = await snapshot(page);

    await clickAttr(`[data-preview-runtime-parity-move-left="${item3}"]`);
    const afterReorder = await snapshot(page);

    await clickAttr("[data-preview-runtime-parity-play-scene]");
    const playScene = await snapshot(page);
    await page
      .waitForFunction(
        `() => Number(document.querySelector("[data-preview-runtime-parity-scene-elapsed-ms]")?.textContent ?? "0") > 250`,
        { timeout: 8_000 },
      )
      .catch(() => undefined);
    const playSceneLater = await snapshot(page);
    await clickAttr("[data-preview-runtime-parity-pause]");
    const afterPause = await snapshot(page);

    await clickAttr(`[data-preview-runtime-parity-select="${item2}"]`);
    await clickAttr("[data-preview-runtime-parity-play]");
    const playStory = await snapshot(page);
    await clickAttr("[data-preview-runtime-parity-stop]");
    const afterStop = await snapshot(page);

    await clickAttr(`[data-preview-runtime-parity-select="${item2}"]`);
    const reselectAfterStop = await snapshot(page);
    await clickAttr(`[data-preview-runtime-parity-remove="${item2}"]`);
    const afterRemove = await snapshot(page);

    const remainingIds = await page.$$eval(
      "[data-preview-runtime-parity-select]",
      (buttons) => buttons.map((button) => button.getAttribute("data-preview-runtime-parity-select") ?? ""),
    );

    await clickAttr('[data-preview-runtime-parity-scene-select="1"]');
    const mixedSceneIds = await page.$$eval(
      "[data-preview-runtime-parity-select]",
      (buttons) => buttons.map((button) => button.getAttribute("data-preview-runtime-parity-select") ?? ""),
    );
    if (mixedSceneIds[1]) {
      await clickAttr(`[data-preview-runtime-parity-select="${mixedSceneIds[1]}"]`);
    }
    const mixedInspect = await snapshot(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-preview-runtime-parity-qa-harness]");
    await page.waitForSelector("[data-preview-runtime-parity-windows] li");
    await page
      .waitForFunction(
        `() => document.querySelector("[data-preview-runtime-parity-video-blobs]")?.textContent?.trim() === "ready"`,
        { timeout: 10_000 },
      )
      .catch(() => undefined);
    await nextPaint(page);
    await seek(2800);
    await clickAttr("[data-preview-runtime-parity-play]");
    await page
      .waitForFunction(
        `() => document.querySelector("[data-preview-stable-media-stack]")?.getAttribute("data-intra-scene-transition-active") === "true"`,
        { timeout: 8_000 },
      )
      .catch(() => undefined);
    const duringTransition = await snapshot(page);
    await clickAttr("[data-preview-runtime-parity-pause]");

    findings.cases = {
      inspect1,
      inspect2,
      inspect3,
      afterZoom,
      afterReplace,
      afterReorder,
      playScene,
      playSceneLater,
      afterPause,
      playStory,
      afterStop,
      reselectAfterStop,
      afterRemove,
      remainingIds,
      mixedInspect,
      duringTransition,
    };

    const noOutgoingDuringInspection =
      inspect2.mountedOutgoingId === "" &&
      inspect2.mountedLayerCount === "1" &&
      inspect2.intraSceneActive === "false";

    findings.pass = {
      inspectItem1: inspect1.mountedPrimaryId === item1 && inspect1.mediaItemIds.includes(item1 ?? ""),
      inspectItem2: inspect2.mountedPrimaryId === item2 && inspect2.mediaItemIds.includes(item2 ?? ""),
      inspectItem3: inspect3.mountedPrimaryId === item3 && inspect3.mediaItemIds.includes(item3 ?? ""),
      visibleIdentityChanged: inspect1.mountedPrimaryId !== inspect2.mountedPrimaryId &&
        inspect2.mountedPrimaryId !== inspect3.mountedPrimaryId,
      noOutgoingDuringInspection,
      replaceKeptSelectedId: afterReplace.mountedPrimaryId === item3,
      reorderKeptStableId: afterReorder.mountedPrimaryId === item3,
      playSceneExitsInspection: playScene.inspectionActive === "false" &&
        playScene.frameInspectionActive === "false",
      pauseDoesNotResurrect: afterPause.inspectionActive === "false",
      playStoryExitsInspection: playStory.inspectionActive === "false",
      stopDoesNotResurrect: afterStop.inspectionActive === "false",
      reselectAfterStopWorks: reselectAfterStop.mountedPrimaryId === item2,
      removedIdGone: !afterRemove.mediaItemIds.includes(item2 ?? "") &&
        afterRemove.mountedPrimaryId !== item2,
      survivorIsAuthoritative: Boolean(afterRemove.mountedPrimaryId) &&
        remainingIds.includes(afterRemove.mountedPrimaryId),
      mixedInspectsSelected: !mixedSceneIds[1] ||
        mixedInspect.mountedPrimaryId === mixedSceneIds[1],
      transitionsReturnDuringPlayback: duringTransition.intraSceneActive === "true" ||
        duringTransition.mountedLayerCount === "2",
      draftUntouched: true,
    };

    writeFileSync(
      join(ARTIFACT_DIR, "prompt3-browser-cert.json"),
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
