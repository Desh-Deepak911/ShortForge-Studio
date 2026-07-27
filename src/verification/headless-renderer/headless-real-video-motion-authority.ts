/**
 * Shared helpers for real Chrome + MP4 motion parity authority tests.
 */

import { createHash } from "node:crypto";
import { createReadStream, existsSync, lstatSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

import puppeteer, { type Browser, type Page } from "puppeteer-core";

import { buildHeadlessChromeLaunchArgs } from "@/features/headless-renderer/worker/chromium/chrome-launch-args";
import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";
import {
  buildHeadlessAssetResponseHeaders,
  parseHeadlessAssetByteRange,
  startHeadlessAssetServer,
  type HeadlessAssetServer,
} from "@/features/headless-renderer/worker/chromium/asset-server";

export function hashCanvasMediaRegion(imageData: Uint8ClampedArray): string {
  return createHash("sha256").update(Buffer.from(imageData)).digest("hex");
}

export async function sampleRawVideoFrameHashes(input: {
  readonly page: Page;
  readonly videoUrl: string;
  readonly pageUrl: string;
  readonly seekTimesSec: readonly number[];
  readonly timeoutMs?: number;
  readonly waitForFreshDecode?: boolean;
}): Promise<string[]> {
  const timeoutMs = input.timeoutMs ?? 15_000;
  const samplerPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "headless-real-video-motion-browser-sampler.js",
  );
  const samplerSource = readFileSync(samplerPath, "utf8");
  await input.page.goto(input.pageUrl, { waitUntil: "domcontentloaded" });
  await input.page.addScriptTag({ content: samplerSource });
  return input.page.evaluate(
    function evaluateMotionSample(
      videoUrl,
      seekTimesSec,
      evaluateTimeoutMs,
      waitForFreshDecode,
    ) {
      const w = window as Window & {
        __shortforgeSampleMotionHashes?: (
          url: string,
          times: number[],
          timeout: number,
          waitForFreshDecode?: boolean,
        ) => Promise<string[]>;
      };
      return w.__shortforgeSampleMotionHashes!(
        videoUrl,
        [...seekTimesSec],
        evaluateTimeoutMs,
        waitForFreshDecode,
      );
    },
    input.videoUrl,
    input.seekTimesSec,
    timeoutMs,
    input.waitForFreshDecode ?? true,
  );
}

export async function withChromePage<T>(
  fn: (input: { readonly browser: Browser; readonly page: Page }) => Promise<T>,
): Promise<T> {
  const chrome = resolveSystemChromeExecutable();
  if (!chrome.ok) {
    throw new Error("system Chrome unavailable");
  }
  const browser = await puppeteer.launch({
    executablePath: chrome.executable,
    headless: true,
    args: [...buildHeadlessChromeLaunchArgs()],
  });
  try {
    const page = await browser.newPage();
    try {
      return await fn({ browser, page });
    } finally {
      await page.close({ runBeforeUnload: false }).catch(() => undefined);
    }
  } finally {
    await browser.close();
  }
}

/** Pre-fix behavior: advertise ranges but answer Range with HTTP 200 + full file. */
export async function startIgnoringRangeAssetServer(input: {
  rootDir: string;
}): Promise<HeadlessAssetServer> {
  const rootReal = realpathSync(resolve(input.rootDir));
  const server: Server = createServer((req, res) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end();
        return;
      }
      const rawUrl = req.url ?? "/";
      const questionIndex = rawUrl.indexOf("?");
      const pathOnly =
        questionIndex >= 0 ? rawUrl.slice(0, questionIndex) : rawUrl;
      let rel: string;
      try {
        rel = decodeURIComponent(pathOnly.replace(/^\//, ""));
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      if (!rel || rel.includes("\0") || rel.split("/").includes("..")) {
        res.writeHead(400);
        res.end();
        return;
      }
      const abs = resolve(join(rootReal, rel));
      const relCheck = relative(rootReal, abs);
      if (relCheck.startsWith("..") || resolve(rootReal, relCheck) !== abs) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!existsSync(abs)) {
        res.writeHead(404);
        res.end();
        return;
      }
      if (lstatSync(abs).isSymbolicLink()) {
        res.writeHead(403);
        res.end();
        return;
      }
      let realFile: string;
      try {
        realFile = realpathSync(abs);
      } catch {
        res.writeHead(404);
        res.end();
        return;
      }
      const realRel = relative(rootReal, realFile);
      if (
        realRel.startsWith("..") ||
        realRel.includes(`..${sep}`) ||
        (!realFile.startsWith(rootReal + sep) && realFile !== rootReal)
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      const fileStat = statSync(realFile);
      if (!fileStat.isFile()) {
        res.writeHead(404);
        res.end();
        return;
      }

      const fileSize = fileStat.size;
      const rangeHeader = req.headers.range;
      const selection = parseHeadlessAssetByteRange(
        typeof rangeHeader === "string" ? rangeHeader : undefined,
        fileSize,
      );
      const response = buildHeadlessAssetResponseHeaders({
        filePath: realFile,
        fileSize,
        selection,
      });

      if (selection.kind === "invalid") {
        res.writeHead(400);
        res.end();
        return;
      }

      if (response.status === 416) {
        res.writeHead(416, response.headers);
        res.end();
        return;
      }

      if (selection.kind === "partial") {
        const fullResponse = buildHeadlessAssetResponseHeaders({
          filePath: realFile,
          fileSize,
          selection: { kind: "full" },
        });
        res.writeHead(200, fullResponse.headers);
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        createReadStream(realFile).pipe(res);
        return;
      }

      res.writeHead(response.status, response.headers);
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      createReadStream(realFile).pipe(res);
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const addr = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${addr.port}`,
    port: addr.port,
    async close() {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    },
  };
}

/** Legacy full-file server without Accept-Ranges (HTTP-only negative fixture). */
export async function startLegacyFullFileAssetServer(input: {
  rootDir: string;
}): Promise<HeadlessAssetServer> {
  const rootReal = realpathSync(resolve(input.rootDir));
  const server: Server = createServer((req, res) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end();
        return;
      }
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const rel = decodeURIComponent(url.pathname.replace(/^\//, ""));
      if (!rel || rel.includes("\0") || rel.split("/").includes("..")) {
        res.writeHead(400);
        res.end();
        return;
      }
      const abs = resolve(join(rootReal, rel));
      const relCheck = relative(rootReal, abs);
      if (relCheck.startsWith("..") || resolve(rootReal, relCheck) !== abs) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!existsSync(abs) || lstatSync(abs).isSymbolicLink()) {
        res.writeHead(403);
        res.end();
        return;
      }
      const realFile = realpathSync(abs);
      const realRel = relative(rootReal, realFile);
      if (
        realRel.startsWith("..") ||
        realRel.includes(`..${sep}`) ||
        (!realFile.startsWith(rootReal + sep) && realFile !== rootReal)
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!statSync(realFile).isFile()) {
        res.writeHead(404);
        res.end();
        return;
      }
      const fileSize = statSync(realFile).size;
      res.writeHead(200, {
        "Content-Type":
          extname(realFile).toLowerCase() === ".mp4" ? "video/mp4" : "application/octet-stream",
        "Content-Length": String(fileSize),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      createReadStream(realFile).pipe(res);
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const addr = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${addr.port}`,
    port: addr.port,
    async close() {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    },
  };
}

export function assertDistinctMotionFrameHashes(hashes: readonly string[]): void {
  if (new Set(hashes).size !== hashes.length) {
    throw new Error("expected distinct motion frame hashes");
  }
}

export function assertFrozenVideoSamples(hashes: readonly string[]): void {
  if (hashes.length < 2) {
    throw new Error("need at least two samples to detect frozen video");
  }
  if (new Set(hashes).size !== 1) {
    throw new Error("expected frozen identical hashes for negative control");
  }
}

export async function writeFixtureFile(dir: string, name: string, bytes: Uint8Array | string): Promise<string> {
  const filePath = join(dir, name);
  writeFileSync(filePath, bytes);
  return filePath;
}

export async function writeMotionSamplerPage(dir: string): Promise<string> {
  return writeFixtureFile(
    dir,
    "motion-sampler.html",
    "<!DOCTYPE html><html><body></body></html>",
  );
}

export { startHeadlessAssetServer };
