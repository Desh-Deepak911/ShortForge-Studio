/**
 * Real Chromium Preview + production Browser export certification.
 * Writes gitignored evidence under .tmp/per-media-video-trim/.
 */
import {
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import { ensurePerMediaVideoTrimFixture } from "@/features/preview/video-trim-preview/per-media-video-trim-fixture";
import {
  PER_MEDIA_VIDEO_TRIM_SAMPLES,
  type PerMediaVideoTrimSampleId,
} from "@/features/preview/video-trim-preview/per-media-video-trim-contract";
import {
  captionBandLooksOpaqueBlack,
  classifyRgb,
  samplePngCaptionBandLuma,
  samplePngCenterRgb,
} from "./classify-timecode-section";

const ORIGIN = process.env.PER_MEDIA_VIDEO_TRIM_ORIGIN ?? "http://localhost:3000";
const ARTIFACT_DIR = join(process.cwd(), ".tmp/per-media-video-trim");

function decodeVideoFrame(
  ffmpegExecutable: string,
  videoPath: string,
  timeSec: number,
  outPath: string,
): boolean {
  const result = spawnSync(
    ffmpegExecutable,
    [
      "-y",
      "-ss",
      String(timeSec),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      outPath,
    ],
    { encoding: "utf8" },
  );
  return result.status === 0 && existsSync(outPath);
}

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const findings: Record<string, unknown> = {
    recordedAt: new Date().toISOString(),
    origin: ORIGIN,
  };

  const fixture = ensurePerMediaVideoTrimFixture();
  findings.fixture = fixture;
  const ffmpeg = resolveNativeFfmpegBinaries();
  const chrome = resolveSystemChromeExecutable();
  if (!fixture.ok || !ffmpeg.ok || !chrome.ok) {
    findings.ok = false;
    if (!fixture.ok) {
      findings.blocker = fixture.message;
    } else if (!ffmpeg.ok) {
      findings.blocker = ffmpeg.message;
    } else if (!chrome.ok) {
      findings.blocker = chrome.message;
    }
    writeFileSync(join(ARTIFACT_DIR, "preview-browser.json"), `${JSON.stringify(findings, null, 2)}\n`);
    console.log(`PER_MEDIA_TRIM_CERT: blocked (${String(findings.blocker)})`);
    process.exitCode = 0;
    return;
  }

  let puppeteer: typeof import("puppeteer-core");
  try {
    puppeteer = await import("puppeteer-core");
  } catch {
    findings.ok = false;
    findings.blocker = "puppeteer-core unavailable";
    writeFileSync(join(ARTIFACT_DIR, "preview-browser.json"), `${JSON.stringify(findings, null, 2)}\n`);
    console.log("PER_MEDIA_TRIM_CERT: blocked (puppeteer-core)");
    process.exitCode = 0;
    return;
  }

  const browser = await puppeteer.default.launch({
    executablePath: chrome.executable,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const previewFrames: Record<string, unknown>[] = [];
  let browserExport: Record<string, unknown> = { attempted: false };

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(180000);
    const response = await page.goto(`${ORIGIN}/dev/per-media-video-trim-qa`, {
      waitUntil: "domcontentloaded",
    });
    if (!response || !response.ok()) {
      findings.ok = false;
      findings.blocker = `harness HTTP ${response?.status() ?? "no-response"}`;
      writeFileSync(join(ARTIFACT_DIR, "preview-browser.json"), `${JSON.stringify(findings, null, 2)}\n`);
      console.log(`PER_MEDIA_TRIM_CERT: blocked (${String(findings.blocker)})`);
      return;
    }
    await page.waitForSelector("[data-per-media-video-trim-ready=true]", {
      timeout: 120000,
    });

    for (const sample of PER_MEDIA_VIDEO_TRIM_SAMPLES) {
      await page.evaluate((id: PerMediaVideoTrimSampleId) => {
        window.__PER_MEDIA_VIDEO_TRIM_CERT__?.seek(id);
      }, sample.id);
      await page.waitForFunction(
        () => {
          const videos = Array.from(
            document.querySelectorAll("[data-per-media-video-trim-preview] video"),
          ) as HTMLVideoElement[];
          return (
            videos.length > 0 &&
            videos.every((video) => video.readyState >= 2 && video.videoWidth > 0)
          );
        },
        { timeout: 20000 },
      );
      await page.evaluate(
        `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
      );
      const previewPath = join(ARTIFACT_DIR, `preview-${sample.id}.png`);
      const surface = await page.$("[data-per-media-video-trim-preview]");
      if (surface) {
        await surface.screenshot({ path: previewPath as `${string}.png` });
      }
      const snapshot = await page.evaluate(() =>
        window.__PER_MEDIA_VIDEO_TRIM_CERT__?.snapshot() ?? null,
      );
      const rgb = samplePngCenterRgb(ffmpeg.ffmpegExecutable, previewPath);
      const classified = rgb ? classifyRgb(rgb.r, rgb.g, rgb.b) : null;
      const captionRgb = samplePngCaptionBandLuma(ffmpeg.ffmpegExecutable, previewPath);
      previewFrames.push({
        id: sample.id,
        snapshot,
        expectedLabel: sample.expectedLabel,
        classified,
        captionRgb,
        captionOpaqueBlack: captionRgb ? captionBandLooksOpaqueBlack(captionRgb) : null,
        path: previewPath,
      });
    }

    const exportResult = await page.evaluate(() =>
      window.__PER_MEDIA_VIDEO_TRIM_CERT__?.exportBrowser() ?? Promise.resolve({
        ok: false,
        bytes: 0,
        mimeType: "",
        base64: "",
        error: "cert bridge missing",
      }),
    );
    const browserPath = join(ARTIFACT_DIR, "browser-export.webm");
    if (exportResult.ok && exportResult.base64) {
      writeFileSync(browserPath, Buffer.from(exportResult.base64, "base64"));
    }
    const decoded: Record<string, unknown>[] = [];
    if (existsSync(browserPath)) {
      const probe = spawnSync(
        ffmpeg.ffprobeExecutable,
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration,size,format_name:stream=codec_name,width,height,r_frame_rate,pix_fmt",
          "-of",
          "json",
          browserPath,
        ],
        { encoding: "utf8" },
      );
      try {
        browserExport = {
          attempted: true,
          ok: true,
          path: browserPath,
          bytes: exportResult.bytes,
          mimeType: exportResult.mimeType,
          probe: JSON.parse(probe.stdout || "{}"),
        };
      } catch {
        browserExport = {
          attempted: true,
          ok: true,
          path: browserPath,
          probeError: probe.stderr,
        };
      }
      for (const sample of PER_MEDIA_VIDEO_TRIM_SAMPLES) {
        if (sample.inspectMediaItemId) continue;
        const framePath = join(ARTIFACT_DIR, `browser-${sample.id}.png`);
        decodeVideoFrame(
          ffmpeg.ffmpegExecutable,
          browserPath,
          sample.sceneElapsedMs / 1000,
          framePath,
        );
        const rgb = samplePngCenterRgb(ffmpeg.ffmpegExecutable, framePath);
        const classified = rgb ? classifyRgb(rgb.r, rgb.g, rgb.b) : null;
        const captionRgb = samplePngCaptionBandLuma(ffmpeg.ffmpegExecutable, framePath);
        decoded.push({
          id: sample.id,
          expectedLabel: sample.expectedLabel,
          classified,
          captionOpaqueBlack: captionRgb ? captionBandLooksOpaqueBlack(captionRgb) : null,
          path: framePath,
        });
      }
    } else {
      browserExport = {
        attempted: true,
        ok: false,
        error: exportResult.error ?? "missing Blob",
      };
    }
    findings.browserDecoded = decoded;

    const mismatches = [
      ...previewFrames.filter(
        (frame) =>
          frame.classified &&
          (frame.classified as { label: string }).label !== frame.expectedLabel,
      ),
      ...decoded.filter(
        (frame) =>
          frame.classified &&
          (frame.classified as { label: string }).label !== frame.expectedLabel,
      ),
    ];
    findings.ok = mismatches.length === 0 && Boolean(browserExport.ok);
    findings.mismatches = mismatches;
    findings.previewFrames = previewFrames;
    findings.browserExport = browserExport;
  } catch (error) {
    findings.ok = false;
    findings.blocker = error instanceof Error ? error.message : String(error);
  } finally {
    await browser.close();
  }

  writeFileSync(join(ARTIFACT_DIR, "preview-browser.json"), `${JSON.stringify(findings, null, 2)}\n`);
  console.log(`PER_MEDIA_TRIM_CERT: ${findings.ok ? "ok" : "failed"}`);
  if (findings.blocker) {
    console.log(String(findings.blocker));
  }
}

void main();
