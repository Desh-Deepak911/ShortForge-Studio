/**
 * Sprint 6C — Manifest-only renderer structural + isolation checks.
 * Run: npm run test:export-manifest-renderer
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import {
  prepareExportFromManifest,
  prepareExportFrame,
} from "@/features/export/runtime";
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

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function shortStory(): FootieScript {
  const scene = {
    id: "scene-1",
    start: 0,
    end: 3,
    duration: 3,
    startMs: 0,
    endMs: 3000,
    durationMs: 3000,
    subtitle: "Hello",
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
    title: "Manifest Renderer",
    narration: "Hello",
    totalDuration: 3,
    exportSettings: {
      fileName: "manifest-renderer",
      format: "webm",
      quality: "standard",
      resolution: "720x1280",
    },
    scenes: [scene],
    timelineItems: [{ id: "ti-1", type: "scene", scene }],
  });
}

async function main() {
  console.log("\nexport-manifest-renderer (Sprint 6C)\n");

  await test("production entry uses renderExport(manifest, context)", () => {
    const service = read("src/features/export/services/video-render.service.ts");
    assert.match(service, /renderExport\(request\.manifest,\s*context/);
    assert.match(service, /createExportRenderContext/);
    assert.doesNotMatch(
      service.slice(service.indexOf("export async function exportFootieShortFromManifest")),
      /exportFootieShortInternal\(request\.exportStory/,
    );
  });

  await test("runtime renderExport does not call prepareStoryForExport", () => {
    const render = read("src/features/export/runtime/render-export.ts");
    const chunked = read("src/features/export/chunking/render-chunked-silent-visual.ts");
    assert.doesNotMatch(render, /prepareStoryForExport/);
    assert.doesNotMatch(render, /buildOptimizedMasterTimeline/);
    assert.doesNotMatch(render, /buildFootieExportPayload/);
    assert.match(render, /renderChunkedSilentVisual/);
    assert.match(chunked, /prepareExportFromManifest/);
    assert.match(chunked, /preloadExportManifestMedia/);
    assert.doesNotMatch(chunked, /prepareStoryForExport/);
  });

  await test("runtime modules do not import story stores or React", () => {
    for (const file of [
      "src/features/export/runtime/render-export.ts",
      "src/features/export/runtime/prepare-export-frame.ts",
      "src/features/export/runtime/draw-prepared-export-frame.ts",
      "src/features/export/runtime/create-export-render-context.ts",
    ]) {
      const body = read(file);
      assert.doesNotMatch(body, /story-document\.store|useStoryDocument|from \"react\"|from 'react'/);
    }
  });

  await test("prepareExportFromManifest freezes draw plan from manifest only", () => {
    const story = shortStory();
    const manifest = buildExportManifest({ story, environment: CAPABLE_ENV });
    const plan = prepareExportFromManifest(manifest);
    assert.equal(plan.scenes.length, manifest.scenes.length);
    assert.equal(plan.scenes[0]!.id, manifest.scenes[0]!.id);
    assert.equal(plan.scenes[0]!.durationMs, manifest.scenes[0]!.durationMs);
    story.scenes[0]!.durationMs = 99999;
    assert.equal(plan.scenes[0]!.durationMs, manifest.scenes[0]!.durationMs);
  });

  await test("prepareExportFrame uses manifest captions/branding/title", async () => {
    const manifest = buildExportManifest({
      story: shortStory(),
      environment: CAPABLE_ENV,
    });
    const plan = prepareExportFromManifest(manifest);
    const fakeContext = {
      cancellation: {
        isCancelled: false,
        throwIfCancelled() {},
        cancel() {},
      },
      mediaCache: {
        images: new Map(),
        videos: new Map(),
        assets: new Map(),
        diagnostics: [],
      },
      progress: { report() {} },
    } as never;

    // Media prepare will soft-fail without DOM media — still returns semantic frame.
    const { frame } = await prepareExportFrame(manifest, plan, 0, fakeContext);
    assert.equal(frame.storyTitle, manifest.project.storyTitle);
    assert.equal(frame.branding.watermarkText, manifest.branding.watermarkText);
    assert.equal(frame.drawScene.id, manifest.scenes[0]!.id);
    assert.ok(frame.timestampMs >= 0);
  });

  await test("double-preparation regression: gateway prepares; renderer does not", () => {
    const gateway = read("src/features/export/domain/prepare-export-request.ts");
    assert.match(gateway, /prepareStoryForExport/);
    const render = read("src/features/export/runtime/render-export.ts");
    assert.doesNotMatch(render, /prepareStoryForExport/);
    assert.doesNotMatch(render, /buildOptimizedMasterTimeline/);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
