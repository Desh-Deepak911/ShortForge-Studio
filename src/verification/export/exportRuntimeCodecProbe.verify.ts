/**
 * Sprint 6F — Runtime MP4 codec probe.
 * Run: npm run test:export-runtime-codec-probe
 */
import assert from "node:assert/strict";

import {
  buildExportManifest,
  prepareExportRequest,
  runExportCapabilityPreflight,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import {
  buildExportRuntimeCodecProbeResult,
  clearExportRuntimeCodecProbeCache,
  getCachedExportRuntimeCodecProbe,
  isMp4ExportRuntimeAvailable,
  probeExportMp4Runtime,
  setExportRuntimeCodecProbeForTests,
} from "@/features/export/formats";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

let passed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    });
}

const CAPABLE: Partial<ExportEnvironmentSnapshot> = {
  browserName: "chrome",
  supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true,
  supportsMediaRecorder: true,
  supportsRequestVideoFrameCallback: true,
  supportsWebAssembly: true,
  serverRendererAvailable: false,
  ffmpegRuntimePoisoned: false,
  estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
};

function mp4Story(): FootieScript {
  const scene = {
    id: "s1",
    start: 0,
    end: 2,
    duration: 2,
    startMs: 0,
    endMs: 2000,
    durationMs: 2000,
    subtitle: "Probe",
    media: {
      type: "image" as const,
      url: "https://example.com/a.jpg",
      source: "upload" as const,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    },
    image: {
      url: "https://example.com/a.jpg",
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      fitMode: "fit" as const,
    },
  };
  return syncFootieScript({
    title: "Probe",
    narration: "Probe",
    totalDuration: 2,
    exportSettings: {
      fileName: "probe",
      format: "mp4",
      quality: "standard",
      resolution: "720x1280",
    },
    scenes: [scene],
    timelineItems: [{ id: "ti-1", type: "scene", scene }],
  });
}

async function main() {
  console.log("\nexport-runtime-codec-probe (Sprint 6F)\n");

  await test("MP4 available when all encoder flags pass", async () => {
    clearExportRuntimeCodecProbeCache();
    setExportRuntimeCodecProbeForTests(
      buildExportRuntimeCodecProbeResult({
        h264EncoderAvailable: true,
        aacEncoderAvailable: true,
        mp4MuxerAvailable: true,
        faststartSupported: true,
        minimalMp4EncodeSucceeded: true,
      }),
    );
    assert.equal(isMp4ExportRuntimeAvailable(), true);
    const again = await probeExportMp4Runtime();
    assert.equal(again.mp4Available, true);
  });

  await test("MP4 unavailable when AAC missing", () => {
    setExportRuntimeCodecProbeForTests(
      buildExportRuntimeCodecProbeResult({
        h264EncoderAvailable: true,
        aacEncoderAvailable: false,
        mp4MuxerAvailable: true,
        faststartSupported: true,
        minimalMp4EncodeSucceeded: true,
      }),
    );
    assert.equal(isMp4ExportRuntimeAvailable(), false);
  });

  await test("MP4 unavailable when minimal encode fails", () => {
    setExportRuntimeCodecProbeForTests(
      buildExportRuntimeCodecProbeResult({
        h264EncoderAvailable: true,
        aacEncoderAvailable: true,
        mp4MuxerAvailable: true,
        faststartSupported: true,
        minimalMp4EncodeSucceeded: false,
      }),
    );
    assert.equal(isMp4ExportRuntimeAvailable(), false);
  });

  await test("probe result is cached per session", async () => {
    const first = buildExportRuntimeCodecProbeResult({
      h264EncoderAvailable: true,
      aacEncoderAvailable: true,
      mp4MuxerAvailable: true,
      faststartSupported: true,
      minimalMp4EncodeSucceeded: true,
      reason: "cache-a",
    });
    setExportRuntimeCodecProbeForTests(first);
    const a = getCachedExportRuntimeCodecProbe();
    const b = await probeExportMp4Runtime();
    assert.equal(a?.reason, "cache-a");
    assert.equal(b.reason, "cache-a");
  });

  await test("preflight blocks MP4 when probe unavailable", () => {
    const manifest = buildExportManifest({
      story: mp4Story(),
      environment: { ...CAPABLE, mp4EncoderAvailable: false },
    });
    assert.deepEqual(manifest.capabilities.supportedFormats, ["webm"]);
    const preflight = runExportCapabilityPreflight(manifest);
    assert.equal(preflight.supported, false);
    assert.ok(
      preflight.blockers.some(
        (b) =>
          b.code === "UNSUPPORTED_FORMAT" &&
          /MP4 blocked by preflight/i.test(b.message),
      ),
    );
  });

  await test("prepareExportRequest integrates probe override", async () => {
    setExportRuntimeCodecProbeForTests(
      buildExportRuntimeCodecProbeResult({
        h264EncoderAvailable: false,
        aacEncoderAvailable: false,
        mp4MuxerAvailable: false,
        faststartSupported: false,
        minimalMp4EncodeSucceeded: false,
        reason: "forced-unavailable",
      }),
    );
    await assert.rejects(
      () =>
        prepareExportRequest({
          story: mp4Story(),
          environment: CAPABLE,
          throwIfBlocked: true,
        }),
      /MP4 blocked by preflight|isn't supported|ExportPreflight/i,
    );
  });

  setExportRuntimeCodecProbeForTests(undefined);
  clearExportRuntimeCodecProbeCache();
  console.log(`\nexport-runtime-codec-probe: ${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
