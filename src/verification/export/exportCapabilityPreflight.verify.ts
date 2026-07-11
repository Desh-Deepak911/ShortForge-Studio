/**
 * Sprint 6B — capability preflight, cost, renderer selection, gateway gate.
 * Run: npm run test:export-preflight (also runs story prepareStoryForExport checks)
 * Or: npm run test:export-capability-preflight
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildExportManifest,
  estimateExportCost,
  ExportPreflightError,
  prepareExportRequest,
  runExportCapabilityPreflight,
  selectExportRenderer,
  type ExportEnvironmentSnapshot,
  type ExportManifest,
} from "@/features/export/domain";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

const CAPABLE_ENV: Partial<ExportEnvironmentSnapshot> = {
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

let passed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    });
}

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function shortImageStory(
  resolution: "720x1280" | "1080x1920" = "720x1280",
  format: "webm" | "mp4" = "webm",
): FootieScript {
  const scene = {
    id: "scene-1",
    start: 0,
    end: 4,
    duration: 4,
    startMs: 0,
    endMs: 4000,
    durationMs: 4000,
    subtitle: "Short clip",
    media: {
      type: "image" as const,
      url: "https://example.com/short.jpg",
      source: "upload" as const,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    },
    image: {
      url: "https://example.com/short.jpg",
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      fitMode: "fill" as const,
    },
  };
  return syncFootieScript({
    title: "Short Export",
    narration: "Short clip",
    totalDuration: 4,
    exportSettings: {
      fileName: "short-export",
      format,
      quality: "standard",
      resolution,
    },
    scenes: [scene],
    timelineItems: [{ id: "ti-1", type: "scene", scene }],
  });
}

function mixedStory(
  resolution: "720x1280" | "1080x1920",
): FootieScript {
  const scenes = [
    {
      id: "scene-1",
      start: 0,
      end: 5,
      duration: 5,
      startMs: 0,
      endMs: 5000,
      durationMs: 5000,
      subtitle: "Image",
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
    },
    {
      id: "scene-2",
      start: 5,
      end: 10,
      duration: 5,
      startMs: 5000,
      endMs: 10_000,
      durationMs: 5000,
      subtitle: "Video",
      media: {
        type: "video" as const,
        url: "https://example.com/b.mp4",
        source: "upload" as const,
        durationMs: 12_000,
        trimStartMs: 0,
        trimEndMs: 5000,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        fitMode: "cover" as const,
      },
    },
  ];
  return syncFootieScript({
    title: "Mixed Export",
    narration: "Image. Video.",
    totalDuration: 10,
    exportSettings: {
      fileName: "mixed-export",
      format: "webm",
      quality: "high",
      resolution,
    },
    scenes,
    timelineItems: [
      { id: "ti-1", type: "scene", scene: scenes[0]! },
      {
        id: "ti-t",
        type: "transition",
        fromSceneId: "scene-1",
        toSceneId: "scene-2",
        effect: "fade",
        durationMs: 300,
        label: "Fade",
      },
      { id: "ti-2", type: "scene", scene: scenes[1]! },
    ],
  });
}

/** Sprint 6F.1 — video-heavy long 1080p remains capability-blocked without server. */
function longVideoHeavyStory(
  resolution: "720x1280" | "1080x1920" = "1080x1920",
): FootieScript {
  const scenes = [0, 1, 2, 3].map((i) => {
    const startMs = i * 10_000;
    return {
      id: `vid-${i}`,
      start: startMs / 1000,
      end: (startMs + 10_000) / 1000,
      duration: 10,
      startMs,
      endMs: startMs + 10_000,
      durationMs: 10_000,
      subtitle: `Video ${i + 1}`,
      media: {
        type: "video" as const,
        url: `https://example.com/v${i}.mp4`,
        source: "upload" as const,
        durationMs: 20_000,
        trimStartMs: 0,
        trimEndMs: 10_000,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        fitMode: "cover" as const,
      },
    };
  });
  return syncFootieScript({
    title: "Long Video Heavy",
    narration: scenes.map((s) => s.subtitle).join(". "),
    totalDuration: 40,
    exportSettings: {
      fileName: "long-video-heavy",
      format: "webm",
      quality: "high",
      resolution,
    },
    scenes,
    timelineItems: scenes.map((scene) => ({
      id: `ti-${scene.id}`,
      type: "scene" as const,
      scene,
    })),
  });
}

function build(
  story: FootieScript,
  env: Partial<ExportEnvironmentSnapshot> = CAPABLE_ENV,
): ExportManifest {
  return buildExportManifest({
    story,
    exportSettings: story.exportSettings,
    environment: env,
  });
}

async function main() {
  console.log("\nexport-capability-preflight (Sprint 6B)\n");

  await test("short 720p image-only WebM is browser-safe", () => {
    const manifest = build(shortImageStory("720x1280", "webm"));
    const result = runExportCapabilityPreflight(manifest);
    assert.equal(result.renderer, "browser");
    assert.equal(result.supported, true);
    assert.equal(result.blockers.length, 0);
  });

  await test("short 720p mixed-media WebM is browser-safe or warning-only", () => {
    const manifest = build(mixedStory("720x1280"));
    const result = runExportCapabilityPreflight(manifest);
    assert.equal(result.renderer, "browser");
    assert.equal(result.blockers.length, 0);
  });

  await test("valid 720p MP4 is browser-safe when APIs present", () => {
    const manifest = build(shortImageStory("720x1280", "mp4"));
    const result = runExportCapabilityPreflight(manifest);
    assert.equal(result.renderer, "browser");
    assert.equal(result.supported, true);
  });

  await test("short 1080p mixed project is browser-approved with warning (6F.1)", () => {
    const manifest = build(mixedStory("1080x1920"));
    const result = runExportCapabilityPreflight(manifest);
    assert.equal(result.renderer, "browser");
    assert.equal(result.blockers.length, 0);
    assert.ok(
      result.warnings.some((w) => w.code === "RESOLUTION_PERFORMANCE_WARNING"),
    );
  });

  await test("video-heavy long 1080p is blocked without server (6F.1)", () => {
    const manifest = build(longVideoHeavyStory("1080x1920"));
    const result = runExportCapabilityPreflight(manifest);
    assert.equal(result.renderer, "blocked");
    assert.ok(result.blockers.some((b) => b.code === "SERVER_RENDERER_REQUIRED"));
    assert.match(result.blockers[0]!.message, /720p browser export/i);
  });

  await test("video-heavy long 1080p + server available selects server", () => {
    const withServer = buildExportManifest({
      story: longVideoHeavyStory("1080x1920"),
      environment: { ...CAPABLE_ENV, serverRendererAvailable: true },
    });
    assert.equal(withServer.capabilities.serverRendererAvailable, true);
    const result = runExportCapabilityPreflight(withServer);
    assert.equal(result.renderer, "server");
    assert.equal(result.blockers.length, 0);
  });

  await test("missing media blocks export", () => {
    const story = shortImageStory();
    story.scenes[0]!.media = { type: "placeholder" };
    delete story.scenes[0]!.image;
    const manifest = build(story);
    const result = runExportCapabilityPreflight(manifest);
    assert.ok(result.blockers.some((b) => b.code === "MISSING_MEDIA"));
    assert.equal(result.renderer, "blocked");
  });

  await test("invalid video trim blocks export", () => {
    const story = mixedStory("720x1280");
    const video = story.scenes[1]!.media;
    if (video && video.type === "video") {
      video.trimStartMs = 8000;
      video.trimEndMs = 2000;
      video.durationMs = 5000;
    }
    const manifest = build(story);
    const result = runExportCapabilityPreflight(manifest);
    assert.ok(result.blockers.some((b) => b.code === "INVALID_VIDEO_TRIM"));
  });

  await test("missing required voiceover blocks when voice mode requested", () => {
    const story = shortImageStory();
    delete story.voiceoverUrl;
    delete story.voiceoverDurationMs;
    const manifest = buildExportManifest({
      story,
      audioMode: "with-voice",
      environment: CAPABLE_ENV,
    });
    const result = runExportCapabilityPreflight(manifest);
    assert.ok(result.blockers.some((b) => b.code === "MISSING_VOICEOVER"));
  });

  await test("unsupported transition blocks", () => {
    const base = build(mixedStory("720x1280"));
    const first = base.scenes[0]!;
    const manifest = {
      ...base,
      scenes: [
        {
          ...first,
          transitionOut: {
            type: "warp-hole",
            durationMs: 300,
            fromSceneId: "scene-1",
            toSceneId: "scene-2",
          },
        },
        ...base.scenes.slice(1),
      ],
    };
    const result = runExportCapabilityPreflight(manifest);
    assert.ok(result.blockers.some((b) => b.code === "UNSUPPORTED_TRANSITION"));
  });

  await test("missing browser APIs block", () => {
    const manifest = build(shortImageStory(), {
      ...CAPABLE_ENV,
      supportsMediaRecorder: false,
      supportsManualCanvasFrameRequest: false,
    });
    const result = runExportCapabilityPreflight(manifest);
    assert.ok(
      result.blockers.some(
        (b) =>
          b.code === "BROWSER_EXPORT_UNSUPPORTED" ||
          b.code === "MANUAL_CAPTURE_UNSUPPORTED",
      ),
    );
    assert.equal(result.renderer, "blocked");
  });

  await test("poisoned runtime blocks", () => {
    const manifest = build(shortImageStory(), {
      ...CAPABLE_ENV,
      ffmpegRuntimePoisoned: true,
    });
    const result = runExportCapabilityPreflight(manifest);
    assert.ok(result.blockers.some((b) => b.code === "POISONED_EXPORT_RUNTIME"));
  });

  await test("partial caption fidelity warns", () => {
    const story = shortImageStory();
    story.scenes[0]!.captionAnimation = { preset: "typewriter" };
    const manifest = build(story);
    const result = runExportCapabilityPreflight(manifest);
    assert.ok(result.warnings.some((w) => w.code === "PARTIAL_CAPTION_FIDELITY"));
    assert.equal(result.renderer, "browser");
  });

  await test("renderer selection rules", () => {
    const safe = runExportCapabilityPreflight(build(shortImageStory()));
    assert.equal(selectExportRenderer(build(shortImageStory()), safe), "browser");

    const blocked = runExportCapabilityPreflight(
      build(shortImageStory(), { ...CAPABLE_ENV, supportsWebAssembly: false }),
    );
    assert.equal(blocked.renderer, "blocked");

    const serverManifest = buildExportManifest({
      story: longVideoHeavyStory("1080x1920"),
      environment: { ...CAPABLE_ENV, serverRendererAvailable: true },
    });
    const serverResult = runExportCapabilityPreflight(serverManifest);
    assert.equal(serverResult.renderer, "server");
  });

  await test("cost estimate is conservative and deterministic", () => {
    const manifest = build(mixedStory("1080x1920"));
    const a = estimateExportCost(manifest);
    const b = estimateExportCost(manifest);
    assert.deepEqual(a, b);
    assert.ok(a.estimatedFrames > 0);
    assert.equal(a.rendererVersion, "chunked-browser-v1");
    assert.ok((a.chunkSizeFrames ?? 0) > 0);
    assert.ok((a.estimatedChunkFrameBytes ?? 0) < a.estimatedIntermediateBytes);
    // Peak uses chunk residency — must stay below full-sequence JPEG estimate.
    assert.ok(a.estimatedPeakMemoryBytes < a.estimatedIntermediateBytes + 200 * 1024 * 1024);
    // Sprint 6F.1 — short 1080p mixed is borderline, not blanket-unsafe.
    assert.equal(a.risk, "borderline");
  });

  await test("prepareExportRequest throws typed preflight error when blocked", async () => {
    await assert.rejects(
      () =>
        prepareExportRequest({
          story: longVideoHeavyStory("1080x1920"),
          environment: CAPABLE_ENV,
          throwIfBlocked: true,
        }),
      (error: unknown) => {
        assert.ok(error instanceof ExportPreflightError);
        assert.equal(error.code, "EXPORT_PREFLIGHT_BLOCKED");
        assert.ok(error.result.blockers.length > 0);
        return true;
      },
    );
  });

  await test("prepareExportRequest allows inspection when throwIfBlocked=false", async () => {
    const prepared = await prepareExportRequest({
      story: longVideoHeavyStory("1080x1920"),
      environment: CAPABLE_ENV,
      throwIfBlocked: false,
    });
    assert.equal(prepared.renderer, "blocked");
    assert.ok(prepared.preflight.blockers.length > 0);
    assert.ok(prepared.manifest.fingerprint);
  });

  await test("gateway structural: exportFootieShort prepares before renderer side effects", () => {
    const render = readSrc("src/features/export/services/video-render.service.ts");
    assert.match(render, /prepareExportRequest/);
    assert.match(render, /exportFootieShortFromManifest/);
    assert.match(render, /createExportRenderContext/);
    assert.match(render, /renderExport/);
    const publicEntry = render.indexOf("export async function exportFootieShort(");
    const prepareInEntry = render.indexOf("prepareExportRequest", publicEntry);
    const internalCall = render.indexOf("exportFootieShortFromManifest", publicEntry);
    assert.ok(prepareInEntry > publicEntry);
    assert.ok(internalCall > prepareInEntry);
  });

  await test("ExportPanel surfaces capability preflight states", () => {
    const panel = readSrc("src/components/ExportPanel.tsx");
    assert.match(panel, /Checking export/);
    assert.match(panel, /capabilityPreflightStatus/);
    assert.match(panel, /prepareExportRequest/);
    assert.match(panel, /Ready to export|ready-with-warnings|server-required/);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
