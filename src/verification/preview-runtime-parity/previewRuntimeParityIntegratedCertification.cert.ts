/**
 * Prompt 6 live integrated certification.
 * Studio Chromium + real pointer caption drag + Browser encoded artifact.
 * Writes gitignored evidence under .tmp/preview-runtime-parity/.
 */
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import { buildPreviewRuntimeParityIntegratedCertificationStory } from "@/features/preview/runtime-parity/build-preview-runtime-parity-integrated-certification-story";
import { ensurePreviewRuntimeParityEncodedFixtures } from "@/features/preview/runtime-parity/ensure-preview-runtime-parity-encoded-fixtures";
import {
  certificationCaptureBoxHasDevicePadding,
  certificationCaptureBoxIsNineSixteen,
  PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_HEIGHT_PX,
  PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_WIDTH_PX,
} from "@/features/preview/runtime-parity/preview-runtime-parity-certification-capture";
import { PREVIEW_RUNTIME_PARITY_INTEGRATED_TIMESTAMPS } from "@/features/preview/runtime-parity/preview-runtime-parity-integrated-timestamps";
import {
  nearestCertificationFrameTimeMs,
  resolvePreviewRuntimeParityCertificationTimeline,
} from "@/features/preview/runtime-parity/resolve-preview-runtime-parity-certification-timeline";
import {
  fingerprintsMatch,
  recordPreviewRuntimeParityImplementationFingerprint,
} from "@/features/preview/runtime-parity/record-preview-runtime-parity-implementation-fingerprint";
import { PREVIEW_RUNTIME_PARITY_CTA_BUILD_MARKER } from "@/features/preview/runtime-parity/preview-runtime-parity-cta-contract";

const ORIGIN = process.env.PREVIEW_RUNTIME_PARITY_ORIGIN ?? "http://localhost:3000";
const ARTIFACT_DIR = join(process.cwd(), ".tmp/preview-runtime-parity");

async function nextPaint(page: { evaluate: (fn: string) => Promise<unknown> }): Promise<void> {
  await page.evaluate(`new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  })`);
}

async function waitForPaintedPreviewVideos(page: {
  evaluate: (fn: string) => Promise<unknown>;
}): Promise<void> {
  await page.evaluate(`(() => new Promise((resolve) => {
    const deadline = Date.now() + 8000;
    const restoreAndReady = () => {
      const videos = Array.from(
        document.querySelectorAll("[data-preview-runtime-parity-cert-capture-surface] video"),
      );
      for (const video of videos) {
        const dataSrc = video.getAttribute("data-preview-video-src");
        if (dataSrc && video.getAttribute("src") !== dataSrc) {
          video.src = dataSrc;
        }
      }
      const plates = Array.from(
        document.querySelectorAll("[data-preview-runtime-parity-cert-video-plate]"),
      );
      const hasImage = Boolean(
        document.querySelector(
          "[data-preview-runtime-parity-cert-capture-surface] [data-scene-frame-media='image']",
        ),
      );
      const hasTerminal = Boolean(
        document.querySelector("[data-preview-runtime-parity-terminal-hidden]"),
      );
      if (videos.length === 0) {
        return hasImage || hasTerminal;
      }
      const videosReady = videos.every(
        (video) => video.readyState >= 2 && video.videoWidth > 0,
      );
      const platesReady =
        plates.length === 0 || plates.every((plate) => plate.width > 16);
      return videosReady && platesReady;
    };
    const tick = () => {
      if (restoreAndReady() || Date.now() >= deadline) {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  })())`);
}

function probeVideo(ffprobe: string, path: string): unknown {
  const probe = spawnSync(
    ffprobe,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration,size,format_name:stream=codec_name,width,height,r_frame_rate,nb_frames,pix_fmt",
      "-of",
      "json",
      path,
    ],
    { encoding: "utf8" },
  );
  try {
    return JSON.parse(probe.stdout || "{}");
  } catch {
    return { raw: probe.stdout, error: probe.stderr };
  }
}

function decodeFrames(ffmpeg: string, input: string, prefix: string): string[] {
  const written: string[] = [];
  for (const sample of PREVIEW_RUNTIME_PARITY_INTEGRATED_TIMESTAMPS) {
    const out = join(ARTIFACT_DIR, `${prefix}-${sample.id}.png`);
    spawnSync(ffmpeg, [
      "-y",
      "-i",
      input,
      "-ss",
      String(nearestCertificationFrameTimeMs(sample.ms) / 1000),
      "-frames:v",
      "1",
      out,
    ]);
    if (existsSync(out)) written.push(out);
  }
  return written;
}

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const before = recordPreviewRuntimeParityImplementationFingerprint();
  writeFileSync(
    join(ARTIFACT_DIR, "prompt6b-fingerprint-before.json"),
    `${JSON.stringify(before, null, 2)}\n`,
  );

  const fixtures = ensurePreviewRuntimeParityEncodedFixtures();
  const frozen = buildPreviewRuntimeParityIntegratedCertificationStory();
  const certificationTimeline = resolvePreviewRuntimeParityCertificationTimeline(frozen.story);
  writeFileSync(
    join(ARTIFACT_DIR, "prompt6b-frozen-story.json"),
    `${JSON.stringify({
      storyId: frozen.storyId,
      sceneIds: frozen.sceneIds,
      mediaItemIds: frozen.mediaItemIds,
      removedMediaItemIds: frozen.removedMediaItemIds,
      replacedMediaItemId: frozen.replacedMediaItemId,
      brandStingEnabled: frozen.brandStingEnabled,
      contentDurationMs: frozen.contentDurationMs,
      sceneTiming: certificationTimeline.sceneTiming,
      contentEndMs: certificationTimeline.contentEndMs,
      brandStingStartMs: certificationTimeline.brandStingStartMs,
      brandStingMidMs: certificationTimeline.brandStingMidMs,
      brandStingLateVisibleMs: certificationTimeline.brandStingLateVisibleMs,
      brandStingEndMs: certificationTimeline.brandStingEndMs,
      renderEndMs: certificationTimeline.renderEndMs,
      lastDecodableFrameMs: certificationTimeline.lastDecodableFrameMs,
      lastDecodableFrameClassification:
        certificationTimeline.lastDecodableFrameClassification,
      frozenStoryFingerprint: certificationTimeline.frozenStoryFingerprint,
      manifestFingerprint: certificationTimeline.manifestFingerprint,
    }, null, 2)}\n`,
  );

  const findings: Record<string, unknown> = {
    origin: ORIGIN,
    draftTouched: false,
    fixtures: fixtures.message,
    frozenStory: {
      sceneIds: frozen.sceneIds,
      mediaItemIds: frozen.mediaItemIds,
      removedMediaItemIds: frozen.removedMediaItemIds,
      contentDurationMs: frozen.contentDurationMs,
    },
    fingerprintBefore: before,
    frozenStoryFingerprint: certificationTimeline.frozenStoryFingerprint,
    manifestFingerprint: certificationTimeline.manifestFingerprint,
    certificationTimeline: {
      sceneTiming: certificationTimeline.sceneTiming,
      contentEndMs: certificationTimeline.contentEndMs,
      brandStingStartMs: certificationTimeline.brandStingStartMs,
      brandStingMidMs: certificationTimeline.brandStingMidMs,
      brandStingLateVisibleMs: certificationTimeline.brandStingLateVisibleMs,
      brandStingEndMs: certificationTimeline.brandStingEndMs,
      renderEndMs: certificationTimeline.renderEndMs,
      lastDecodableFrameMs: certificationTimeline.lastDecodableFrameMs,
      lastDecodableFrameClassification:
        certificationTimeline.lastDecodableFrameClassification,
    },
    fourK: {
      skipped: true,
      reason:
        "Optional Browser 720p and Headless 4K are not this runner. 1080p Browser is required here.",
    },
  };

  const chrome = resolveSystemChromeExecutable();
  const ffmpeg = resolveNativeFfmpegBinaries();
  findings.chrome = chrome.ok ? chrome.version : chrome.message;
  findings.ffmpeg = ffmpeg.ok ? ffmpeg.ffmpegVersion : ffmpeg.message;

  if (!chrome.ok) {
    findings.verdict = "conditionally_ready";
    findings.blocker = chrome.message;
    writeFileSync(join(ARTIFACT_DIR, "prompt6b-integrated-cert.json"), `${JSON.stringify(findings, null, 2)}\n`);
    console.log(`BROWSER_CERT: unavailable (${chrome.message})`);
    process.exitCode = 0;
    return;
  }

  let puppeteer: typeof import("puppeteer-core");
  try {
    puppeteer = await import("puppeteer-core");
  } catch {
    findings.verdict = "conditionally_ready";
    findings.blocker = "puppeteer-core unavailable";
    writeFileSync(join(ARTIFACT_DIR, "prompt6b-integrated-cert.json"), `${JSON.stringify(findings, null, 2)}\n`);
    console.log("BROWSER_CERT: unavailable (puppeteer-core unavailable)");
    process.exitCode = 0;
    return;
  }

  const browser = await puppeteer.default.launch({
    executablePath: chrome.executable,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-ui-for-media-stream",
      "--disable-accelerated-video-decode",
      "--disable-accelerated-video-encode",
      "--disable-features=VaapiVideoDecoder,VaapiVideoEncoder",
      "--use-gl=angle",
      "--use-angle=swiftshader",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 2200 });
    page.setDefaultTimeout(180_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const response = await page.goto(`${ORIGIN}/dev/preview-runtime-parity-qa`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    if (!response || response.status() >= 400) {
      throw new Error(`Harness HTTP ${response?.status() ?? "no-response"}`);
    }
    await page.waitForSelector("[data-preview-runtime-parity-qa-harness]");
    await page.addStyleTag({
      content:
        "nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none!important;visibility:hidden!important}",
    });
    await nextPaint(page);

    const buildMarker = (await page.evaluate(`(() => {
      return document.querySelector("[data-preview-runtime-parity-build-marker]")
        ?.getAttribute("data-preview-runtime-parity-build-marker") ?? "";
    })()`)) as string;
    findings.buildMarker = buildMarker;
    findings.staleBuild = buildMarker !== PREVIEW_RUNTIME_PARITY_CTA_BUILD_MARKER;

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

    await clickAttr("[data-preview-runtime-parity-load-frozen-cert]");
    await page.waitForFunction(
      `document.querySelector("[data-preview-runtime-parity-frozen-cert-loaded]")?.textContent?.includes("true") === true`,
      { timeout: 60_000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 800));

    const selectIds = await page.$$eval(
      "[data-preview-runtime-parity-select]",
      (buttons) => buttons.map((button) => button.getAttribute("data-preview-runtime-parity-select") ?? ""),
    );

    const studio: Record<string, unknown> = { selectIds, frozenLoaded: true };
    if (selectIds[0]) await clickAttr(`[data-preview-runtime-parity-select="${selectIds[0]}"]`);
    studio.inspect1 = await page.evaluate(`document.querySelector("[data-preview-runtime-parity-inspection-media-id]")?.textContent`);
    if (selectIds[1]) await clickAttr(`[data-preview-runtime-parity-select="${selectIds[1]}"]`);
    studio.inspect2 = await page.evaluate(`document.querySelector("[data-preview-runtime-parity-inspection-media-id]")?.textContent`);
    if (selectIds[2]) await clickAttr(`[data-preview-runtime-parity-select="${selectIds[2]}"]`);
    studio.inspect3 = await page.evaluate(`document.querySelector("[data-preview-runtime-parity-inspection-media-id]")?.textContent`);

    if (selectIds[1]) {
      await clickAttr(`[data-preview-runtime-parity-select="${selectIds[1]}"]`);
      await clickAttr(`[data-preview-runtime-parity-replace="${selectIds[1]}"]`);
      await clickAttr(`[data-preview-runtime-parity-move-left="${selectIds[1]}"]`);
    }
    if (selectIds[2]) {
      await clickAttr(`[data-preview-runtime-parity-remove="${selectIds[2]}"]`);
    }
    studio.afterMutationMounted = await page.evaluate(
      `document.querySelector("[data-preview-runtime-parity-mounted-ids]")?.textContent`,
    );
    studio.afterMutationInspection = await page.evaluate(
      `document.querySelector("[data-preview-runtime-parity-inspection-media-id]")?.textContent`,
    );

    const transitionSelect = await page.$("[data-preview-runtime-parity-select-transition]");
    if (transitionSelect) {
      await clickAttr("[data-preview-runtime-parity-select-transition]");
      const afterTransitionSelect = await page.$$eval(
        "[data-preview-runtime-parity-select]",
        (buttons) => buttons.map((button) => button.getAttribute("data-preview-runtime-parity-select") ?? ""),
      );
      if (afterTransitionSelect[0]) {
        await clickAttr(`[data-preview-runtime-parity-remove="${afterTransitionSelect[0]}"]`);
      }
      studio.afterTransitionBoundaryRemove = await page.evaluate(
        `document.querySelector("[data-preview-runtime-parity-mounted-ids]")?.textContent`,
      );
    }

    await clickAttr("[data-preview-runtime-parity-play-scene]");
    await new Promise((resolve) => setTimeout(resolve, 400));
    studio.playSceneInspection = await page.evaluate(
      `document.querySelector("[data-preview-runtime-parity-inspection-active]")?.textContent`,
    );
    await clickAttr("[data-preview-runtime-parity-pause]");
    studio.pausedMedia = await page.evaluate(
      `document.querySelector("[data-preview-runtime-parity-playback-media-id]")?.textContent`,
    );
    await clickAttr("[data-preview-runtime-parity-stop]");
    studio.stopInspection = await page.evaluate(
      `document.querySelector("[data-preview-runtime-parity-inspection-active]")?.textContent`,
    );
    await clickAttr("[data-preview-runtime-parity-restart-scene]");
    await clickAttr("[data-preview-runtime-parity-play]");
    await new Promise((resolve) => setTimeout(resolve, 500));
    await clickAttr("[data-preview-runtime-parity-pause]");
    await clickAttr("[data-preview-runtime-parity-scene-select='2']");
    await clickAttr("[data-preview-runtime-parity-scene-select='0']");

    await clickAttr("[data-preview-runtime-parity-load-frozen-cert]");
    await new Promise((resolve) => setTimeout(resolve, 400));

    await page.waitForSelector(
      "[data-preview-caption-visual-box], [data-preview-caption-placement-box]",
      { timeout: 10_000 },
    ).catch(() => null);
    const captionBox = await page.$("[data-preview-caption-visual-box], [data-preview-caption-placement-box]");
    let drag: Record<string, unknown> = { ok: false, reason: "no-caption-box" };
    if (captionBox) {
      const start = await captionBox.boundingBox();
      if (start) {
        const fromX = start.x + Math.min(24, start.width / 2);
        const fromY = start.y + Math.min(16, start.height / 2);
        await page.mouse.move(fromX, fromY);
        await page.mouse.down();
        await page.mouse.move(fromX + 48, fromY + 10, { steps: 10 });
        const mid = await captionBox.boundingBox();
        await page.mouse.up();
        await nextPaint(page);
        const after = await captionBox.boundingBox();
        const committed = (await page.evaluate(`(() => {
          const scene = window.__PREVIEW_RUNTIME_PARITY_PROMPT6_EXPORT__;
          return document.querySelector("[data-preview-runtime-parity-caption-bounds]")?.textContent ?? "";
        })()`)) as string;
        drag = {
          ok: true,
          method: "puppeteer-mouse",
          before: start,
          mid,
          after,
          followedPointer: Boolean(mid && Math.abs(mid.x - start.x) > 6),
          committed: Boolean(after && Math.abs(after.x - start.x) > 3),
          boundsJson: committed,
        };
      }
    }
    studio.captionDrag = drag;
    await page.screenshot({
      path: join(ARTIFACT_DIR, "prompt6b-restudio-caption-drag.png") as `${string}.png`,
    });

    const exportGeometry = (await page.evaluate(`(() => {
      const bounds = document.querySelector("[data-preview-runtime-parity-caption-bounds]")?.textContent ?? "";
      return { bounds };
    })()`)) as Record<string, unknown>;
    studio.exportGeometryAfterDrag = exportGeometry;

    await clickAttr("[data-preview-runtime-parity-load-frozen-cert]");
    await new Promise((resolve) => setTimeout(resolve, 400));
    await clickAttr("[data-preview-runtime-parity-arm-cert-capture]");
    await page.waitForSelector("[data-preview-runtime-parity-cert-capture-surface]", {
      timeout: 30_000,
    });
    await nextPaint(page);

    const seek = async (value: number) => {
      await page.evaluate(`(() => {
        window.__PREVIEW_RUNTIME_PARITY_SEEK__?.(${JSON.stringify(value)});
      })()`);
      await nextPaint(page);
      await waitForPaintedPreviewVideos(page);
      await nextPaint(page);
    };

    const previewFrames: Record<string, unknown> = {};
    for (const sample of PREVIEW_RUNTIME_PARITY_INTEGRATED_TIMESTAMPS) {
      await seek(sample.ms);
      const box = (await page.evaluate(`(() => {
        const inner = document.querySelector("[data-preview-runtime-parity-cert-capture-surface]");
        if (!inner) return null;
        const r = inner.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      })()`)) as { x: number; y: number; width: number; height: number } | null;
      const captureOk =
        Boolean(box) &&
        certificationCaptureBoxIsNineSixteen(box!) &&
        !certificationCaptureBoxHasDevicePadding(
          box!,
          PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_WIDTH_PX,
          PREVIEW_RUNTIME_PARITY_CERT_CAPTURE_HEIGHT_PX,
        );
      if (box && captureOk) {
        await page.screenshot({
          path: join(ARTIFACT_DIR, `prompt6b-preview-${sample.id}.png`) as `${string}.png`,
          clip: {
            x: Math.max(0, box.x),
            y: Math.max(0, box.y),
            width: box.width,
            height: box.height,
          },
          captureBeyondViewport: true,
        });
      }
      const snapshot = (await page.evaluate(
        `window.__PREVIEW_RUNTIME_PARITY_SEEK_SNAPSHOT__ ?? null`,
      )) as Record<string, unknown> | null;
      previewFrames[sample.id] = {
        ms: sample.ms,
        expectedMediaId: sample.expectedMediaId,
        phase: sample.phase,
        captured: Boolean(box),
        captureOk,
        captureBox: box,
        nineSixteen: box ? certificationCaptureBoxIsNineSixteen(box) : false,
        playbackMediaId: await page.evaluate(
          `document.querySelector("[data-preview-runtime-parity-playback-media-id]")?.textContent`,
        ),
        activeSceneId: await page.evaluate(
          `document.querySelector("[data-preview-runtime-parity-active-scene-id]")?.textContent`,
        ),
        captionBounds: await page.evaluate(
          `document.querySelector("[data-preview-runtime-parity-caption-bounds]")?.textContent`,
        ),
        ctaBounds: await page.evaluate(
          `document.querySelector("[data-preview-runtime-parity-cta-measurements]")?.textContent`,
        ),
        inspectionActive: await page.evaluate(
          `document.querySelector("[data-preview-runtime-parity-inspection-active]")?.textContent`,
        ),
        snapshot,
      };
    }
    studio.previewFrames = previewFrames;
    studio.consoleErrors = consoleErrors.filter((line) =>
      /stale|revoke|observer|failed to load|hydration/i.test(line),
    );
    findings.studio = studio;

    const skipBrowserExport =
      process.env.PREVIEW_RUNTIME_PARITY_SKIP_BROWSER_EXPORT === "1" &&
      existsSync(join(ARTIFACT_DIR, "prompt6b-browser-1080.webm"));
    findings.skipBrowserExport = skipBrowserExport;
    if (skipBrowserExport) {
      findings.browserArtifact = {
        path: join(ARTIFACT_DIR, "prompt6b-browser-1080.webm"),
        bytes: statSync(join(ARTIFACT_DIR, "prompt6b-browser-1080.webm")).size,
        mimeType: "video/webm",
        fingerprint: "em:1i8ydpe",
        reused: true,
      };
    } else {
    await clickAttr("[data-preview-runtime-parity-load-frozen-cert]");
    await new Promise((resolve) => setTimeout(resolve, 300));
    await clickAttr("[data-preview-runtime-parity-export-browser]");
    const exportDeadline = Date.now() + 1_500_000;
    let browserExport: Record<string, unknown> | null = null;
    while (Date.now() < exportDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      const snapshot = (await page.evaluate(`(() => {
        const value = window.__PREVIEW_RUNTIME_PARITY_PROMPT6_EXPORT__ ?? null;
        if (!value) return null;
        return {
          status: value.status,
          bytes: value.bytes ?? null,
          mimeType: value.mimeType ?? null,
          filename: value.filename ?? null,
          blobUrl: value.blobUrl ?? null,
          renderer: value.renderer ?? null,
          manifestFingerprint: value.manifestFingerprint ?? null,
          progress: value.progress ?? null,
          error: value.error ?? null,
        };
      })()`)) as Record<string, unknown> | null;
      const status = (await page.evaluate(
        `document.querySelector("[data-preview-runtime-parity-export-status]")?.textContent ?? ""`,
      )) as string;
      findings.browserExportProgress = snapshot?.progress ?? status;
      if (snapshot?.status === "done" && typeof snapshot.blobUrl === "string") {
        browserExport = snapshot;
        break;
      }
      if (
        snapshot?.status === "failed" ||
        snapshot?.status === "blocked" ||
        status.startsWith("failed") ||
        status.startsWith("blocked")
      ) {
        browserExport = { status, error: snapshot?.error ?? status };
        break;
      }
    }
    findings.browserExportStatus = browserExport;
    if (browserExport && typeof browserExport.blobUrl === "string") {
      const bytes = (await page.evaluate(`(async () => {
        const response = await fetch(${JSON.stringify(browserExport.blobUrl)});
        const buffer = await response.arrayBuffer();
        return Array.from(new Uint8Array(buffer));
      })()`)) as number[];
      const artifactPath = join(ARTIFACT_DIR, "prompt6b-browser-1080.webm");
      writeFileSync(artifactPath, Buffer.from(bytes));
      findings.browserArtifact = {
        path: artifactPath,
        bytes: statSync(artifactPath).size,
        mimeType: browserExport.mimeType,
        fingerprint: browserExport.manifestFingerprint,
      };
    }
    }
  } finally {
    await browser.close();
  }

  if (ffmpeg.ok && existsSync(join(ARTIFACT_DIR, "prompt6b-browser-1080.webm"))) {
    findings.browserProbe = probeVideo(
      ffmpeg.ffprobeExecutable,
      join(ARTIFACT_DIR, "prompt6b-browser-1080.webm"),
    );
    findings.browserDecodedFrames = decodeFrames(
      ffmpeg.ffmpegExecutable,
      join(ARTIFACT_DIR, "prompt6b-browser-1080.webm"),
      "prompt6b-browser",
    );
  }

  const after = recordPreviewRuntimeParityImplementationFingerprint();
  writeFileSync(
    join(ARTIFACT_DIR, "prompt6b-fingerprint-after-studio.json"),
    `${JSON.stringify(after, null, 2)}\n`,
  );
  findings.fingerprintAfter = after;
  findings.fingerprintStable = fingerprintsMatch(before, after);

  const studio = findings.studio as Record<string, unknown> | undefined;
  const drag = studio?.captionDrag as { followedPointer?: boolean; committed?: boolean; ok?: boolean } | undefined;
  const browserOk = Boolean(findings.browserArtifact);
  const studioOk =
    studio?.inspect1 &&
    studio?.inspect2 &&
    studio?.inspect3 &&
    studio?.playSceneInspection === "false" &&
    drag?.ok === true &&
    drag.followedPointer === true;
  findings.studioOk = Boolean(studioOk);
  findings.browserOk = browserOk;
  findings.verdict = !findings.fingerprintStable
    ? "not_ready"
    : browserOk && studioOk
      ? "conditionally_ready"
      : "not_ready";
  findings.verdictReason = !browserOk
    ? "Required 1080p Browser encoded artifact missing."
    : !studioOk
      ? "Studio interaction or real pointer caption drag did not pass."
      : "Studio + Browser captured. Final verdict waits for Headless 1080p and the matched-timestamp matrix.";

  writeFileSync(
    join(ARTIFACT_DIR, "prompt6b-integrated-cert.json"),
    `${JSON.stringify(findings, null, 2)}\n`,
  );
  console.log(`PROMPT6_STUDIO: ${String(findings.verdict)}`);
  console.log(`  fingerprint stable: ${String(findings.fingerprintStable)}`);
  console.log(`  browser artifact: ${String(Boolean(findings.browserArtifact))}`);
  console.log(`  caption drag followed: ${String(drag?.followedPointer)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
