/**
 * Real Browser export certification for the frozen Prompt 2B story.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import { ensurePerMediaVideoTrimFixture } from "@/features/preview/video-trim-preview/per-media-video-trim-fixture";
import { CURRENT_VISUAL_FEATURE_BUNDLE_SAMPLES } from "@/features/preview/video-trim-preview/current-visual-feature-bundle-contract";
import {
  captionBandLooksOpaqueBlack,
  classifyRgb,
  samplePngCaptionBandLuma,
  samplePngCenterRgb,
} from "./classify-timecode-section";

const ORIGIN = process.env.CURRENT_VISUAL_FEATURE_BUNDLE_ORIGIN ?? "http://localhost:3000";
const ARTIFACT_DIR = join(process.cwd(), ".tmp/current-visual-feature-bundle");

function decodeVideoFrame(
  ffmpegExecutable: string,
  videoPath: string,
  timeSec: number,
  outPath: string,
): boolean {
  const result = spawnSync(
    ffmpegExecutable,
    ["-y", "-ss", String(timeSec), "-i", videoPath, "-frames:v", "1", outPath],
    { encoding: "utf8" },
  );
  return result.status === 0 && existsSync(outPath);
}

function isDarkNavy(rgb: { r: number; g: number; b: number } | null): boolean {
  if (!rgb) return false;
  const luma = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  return luma < 70 && rgb.b >= rgb.r;
}

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const findings: Record<string, unknown> = {
    recordedAt: new Date().toISOString(),
    origin: ORIGIN,
  };
  const fixture = ensurePerMediaVideoTrimFixture();
  const ffmpeg = resolveNativeFfmpegBinaries();
  const chrome = resolveSystemChromeExecutable();
  if (!fixture.ok || !ffmpeg.ok || !chrome.ok) {
    findings.ok = false;
    findings.blocker = !fixture.ok
      ? fixture.message
      : !ffmpeg.ok
        ? ffmpeg.message
        : chrome.ok
          ? "blocked"
          : chrome.message;
    writeFileSync(join(ARTIFACT_DIR, "browser.json"), `${JSON.stringify(findings, null, 2)}\n`);
    console.log(`VISUAL_BUNDLE_BROWSER: blocked (${String(findings.blocker)})`);
    process.exitCode = 0;
    return;
  }

  let puppeteer: typeof import("puppeteer-core");
  try {
    puppeteer = await import("puppeteer-core");
  } catch {
    findings.ok = false;
    findings.blocker = "puppeteer-core unavailable";
    writeFileSync(join(ARTIFACT_DIR, "browser.json"), `${JSON.stringify(findings, null, 2)}\n`);
    console.log("VISUAL_BUNDLE_BROWSER: blocked (puppeteer-core)");
    process.exitCode = 0;
    return;
  }

  const browser = await puppeteer.default.launch({
    executablePath: chrome.executable,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(180000);
    const response = await page.goto(
      `${ORIGIN}/dev/current-visual-feature-bundle-qa`,
      { waitUntil: "domcontentloaded" },
    );
    if (!response || !response.ok()) {
      findings.ok = false;
      findings.blocker = `harness HTTP ${response?.status() ?? "no-response"}`;
      writeFileSync(join(ARTIFACT_DIR, "browser.json"), `${JSON.stringify(findings, null, 2)}\n`);
      console.log(`VISUAL_BUNDLE_BROWSER: blocked (${String(findings.blocker)})`);
      return;
    }
    await page.waitForSelector("[data-current-visual-feature-bundle-ready=true]", {
      timeout: 120000,
    });
    await page.waitForFunction(
      () => window.__CURRENT_VISUAL_FEATURE_BUNDLE_CERT__?.ready === true,
      { timeout: 120000 },
    );
    const exportResult = await page.evaluate(() =>
      window.__CURRENT_VISUAL_FEATURE_BUNDLE_CERT__?.exportBrowser() ??
      Promise.resolve({
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
    if (!existsSync(browserPath)) {
      findings.ok = false;
      findings.blocker = exportResult.error ?? "missing Browser Blob";
      writeFileSync(join(ARTIFACT_DIR, "browser.json"), `${JSON.stringify(findings, null, 2)}\n`);
      console.log(`VISUAL_BUNDLE_BROWSER: blocked (${String(findings.blocker)})`);
      return;
    }
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
    findings.probe = JSON.parse(probe.stdout || "{}");
    findings.bytes = exportResult.bytes;
    findings.path = browserPath;
    const decoded: Record<string, unknown>[] = [];
    for (const sample of CURRENT_VISUAL_FEATURE_BUNDLE_SAMPLES) {
      const framePath = join(ARTIFACT_DIR, `browser-${sample.id}.png`);
      decodeVideoFrame(
        ffmpeg.ffmpegExecutable,
        browserPath,
        sample.timestampMs / 1000,
        framePath,
      );
      const rgb = samplePngCenterRgb(ffmpeg.ffmpegExecutable, framePath);
      const classified = rgb ? classifyRgb(rgb.r, rgb.g, rgb.b) : null;
      const captionRgb = samplePngCaptionBandLuma(ffmpeg.ffmpegExecutable, framePath);
      decoded.push({
        id: sample.id,
        timestampMs: sample.timestampMs,
        expectedLabel: "expectedLabel" in sample ? sample.expectedLabel : null,
        classified,
        captionOpaqueBlack: captionRgb
          ? captionBandLooksOpaqueBlack(captionRgb)
          : null,
        darkNavyCenter: isDarkNavy(rgb),
        path: framePath,
      });
    }
    findings.decodedFrames = decoded;
    const trimOk = decoded
      .filter((frame) => frame.expectedLabel)
      .every(
        (frame) =>
          frame.classified &&
          (frame.classified as { label: string }).label === frame.expectedLabel,
      );
    const captionsOk = decoded.every((frame) => frame.captionOpaqueBlack !== true);
    const stingHold = decoded.find((frame) => frame.id === "brand-sting-hold");
    findings.ok = trimOk && captionsOk && stingHold?.darkNavyCenter === true;
  } catch (error) {
    findings.ok = false;
    findings.blocker = error instanceof Error ? error.message : String(error);
  } finally {
    await browser.close();
  }

  writeFileSync(join(ARTIFACT_DIR, "browser.json"), `${JSON.stringify(findings, null, 2)}\n`);
  console.log(`VISUAL_BUNDLE_BROWSER: ${findings.ok ? "ok" : "failed"}`);
}

void main();
