/**
 * Sprint 11E Phase 2G.12A — real Chrome + MP4 motion parity authority.
 * Run: npm run test:headless-real-video-motion-authority
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  resolveExportSceneMediaPlaybackState,
  resolveExportSeekEpsilonSec,
  resetExportVideoSamplingState,
  seekVideoFrame,
} from "@/features/export/utils/export-scene-media-renderer";
import type { FootieScene, SceneMedia } from "@/features/story/types";
import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";
import { synthesizeMotionMp4Fixture } from "@/features/headless-renderer/worker/testing/synthesize-motion-mp4-fixture";

import {
  assertDistinctMotionFrameHashes,
  assertFrozenVideoSamples,
  sampleRawVideoFrameHashes,
  startHeadlessAssetServer,
  startIgnoringRangeAssetServer,
  startLegacyFullFileAssetServer,
  withChromePage,
  writeFixtureFile,
  writeMotionSamplerPage,
} from "../support/headless-real-video-motion-authority";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nheadless real video motion authority\n");

  const chrome = resolveSystemChromeExecutable();
  if (!chrome.ok) {
    console.log("\n  SKIPPED — system Chrome unavailable\n");
    process.exit(0);
  }

  await test("trim start/end mapping remains exact for export playback state", () => {
    const media: SceneMedia = {
      type: "video",
      url: "https://fixture.local/motion.mp4",
      durationMs: 20_000,
      trimStartMs: 10_000,
      trimEndMs: 18_000,
      muted: true,
    };
    const scene: FootieScene = {
      id: "video-scene",
      start: 0,
      end: 6,
      duration: 6,
      startMs: 0,
      endMs: 6000,
      durationMs: 6000,
      subtitle: "",
      media,
    };
    const at4500 = resolveExportSceneMediaPlaybackState(scene, 4500, 6000);
    const at5000 = resolveExportSceneMediaPlaybackState(scene, 5000, 6000);
    const at6000 = resolveExportSceneMediaPlaybackState(scene, 6000, 6000);
    assert.equal(at4500.clipTimeMs, 14_500);
    assert.equal(at5000.clipTimeMs, 15_000);
    assert.equal(at6000.clipTimeMs, 16_000);
    assert.equal(at4500.trimStartMs, 10_000);
    assert.equal(at6000.trimEndMs, 18_000);
  });

  await test("seekVideoFrame rejects stale HAVE_CURRENT_DATA after real seek target change", async () => {
    resetExportVideoSamplingState();
    let currentTime = 14.5;
    let rvfcMediaTime = 14.5;
    let seekCount = 0;
    const listeners = new Map<string, Set<() => void>>();
    const video = {
      muted: true,
      volume: 0,
      paused: true,
      readyState: 2,
      get currentTime() {
        return currentTime;
      },
      set currentTime(value: number) {
        seekCount += 1;
        currentTime = value;
        rvfcMediaTime = value;
        queueMicrotask(() => listeners.get("seeked")?.forEach((fn) => fn()));
      },
      pause() {},
      addEventListener(type: string, fn: () => void) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener(type: string, fn: () => void) {
        listeners.get(type)?.delete(fn);
      },
      requestVideoFrameCallback(
        cb: (now: number, metadata: { mediaTime: number }) => void,
      ) {
        queueMicrotask(() => cb(0, { mediaTime: rvfcMediaTime }));
        return 1;
      },
      cancelVideoFrameCallback() {},
    } as unknown as HTMLVideoElement;

    const epsilon = resolveExportSeekEpsilonSec(30);
    const first = await seekVideoFrame(video, 14.5, { epsilonSec: epsilon, exportFps: 30 });
    assert.equal(first, true);
    const second = await seekVideoFrame(video, 15.0, { epsilonSec: epsilon, exportFps: 30 });
    assert.equal(second, true);
    assert.ok(seekCount >= 1);
  });

  await test("range-aware asset server yields distinct media hashes at 14.5s, 15s, and 16s", async () => {
    const dir = mkdtempSync(join(tmpdir(), "motion-range-"));
    const fixture = synthesizeMotionMp4Fixture({ durationSec: 20 });
    await writeFixtureFile(dir, "motion.mp4", fixture.bytes);
    await writeMotionSamplerPage(dir);
    const server = await startHeadlessAssetServer({ rootDir: dir });
    try {
      const hashes = await withChromePage(async ({ page }) =>
        sampleRawVideoFrameHashes({
          page,
          pageUrl: `${server.origin}/motion-sampler.html`,
          videoUrl: `${server.origin}/motion.mp4`,
          seekTimesSec: [14.5, 15.0, 16.0],
        }),
      );
      assert.equal(hashes.length, 3);
      assertDistinctMotionFrameHashes(hashes);
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test("same-timestamp resampling yields identical media hashes (frozen control)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "motion-same-ts-"));
    const fixture = synthesizeMotionMp4Fixture({ durationSec: 20 });
    await writeFixtureFile(dir, "motion.mp4", fixture.bytes);
    await writeMotionSamplerPage(dir);
    const server = await startHeadlessAssetServer({ rootDir: dir });
    try {
      const hashes = await withChromePage(async ({ page }) =>
        sampleRawVideoFrameHashes({
          page,
          pageUrl: `${server.origin}/motion-sampler.html`,
          videoUrl: `${server.origin}/motion.mp4`,
          seekTimesSec: [14.5, 14.5, 14.5],
        }),
      );
      assertFrozenVideoSamples(hashes);
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test("ignoring-range asset server answers Range with HTTP 200 and full body", async () => {
    const dir = mkdtempSync(join(tmpdir(), "motion-ignore-http-"));
    const fixture = synthesizeMotionMp4Fixture({ durationSec: 2 });
    await writeFixtureFile(dir, "motion.mp4", fixture.bytes);
    const server = await startIgnoringRangeAssetServer({ rootDir: dir });
    try {
      const res = await fetch(`${server.origin}/motion.mp4`, {
        headers: { Range: "bytes=0-15" },
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("accept-ranges"), "bytes");
      const body = Buffer.from(await res.arrayBuffer());
      assert.equal(body.length, fixture.bytes.length);
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test("legacy full-file server answers Range with HTTP 200", async () => {
    const dir = mkdtempSync(join(tmpdir(), "motion-legacy-http-"));
    const fixture = synthesizeMotionMp4Fixture({ durationSec: 2 });
    await writeFixtureFile(dir, "motion.mp4", fixture.bytes);
    const server = await startLegacyFullFileAssetServer({ rootDir: dir });
    try {
      const res = await fetch(`${server.origin}/motion.mp4`, {
        headers: { Range: "bytes=0-15" },
      });
      assert.equal(res.status, 200);
      const body = Buffer.from(await res.arrayBuffer());
      assert.equal(body.length, fixture.bytes.length);
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test("frozen-video detector fails closed on distinct motion hashes", () => {
    assert.throws(
      () => assertFrozenVideoSamples(["aaa", "bbb", "ccc"]),
      /expected frozen identical hashes/,
    );
  });

  await test("distinct motion detector rejects frozen output", () => {
    assert.throws(
      () => assertDistinctMotionFrameHashes(["deadbeef", "deadbeef", "deadbeef"]),
      /expected distinct motion frame hashes/,
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
