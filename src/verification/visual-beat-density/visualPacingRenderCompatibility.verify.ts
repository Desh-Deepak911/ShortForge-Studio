/**
 * Visual pacing Browser/Headless render-compatibility verification.
 * Authoring capability must not become a renderer requirement.
 * Run: npm run test:visual-pacing-export
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { appendMixedMediaSequenceItem } from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import {
  applyVisualBeatPlan,
  suggestVisualBeatPlan,
} from "@/features/visual-beat-density";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import {
  buildExportManifest,
  EXPORT_MANIFEST_VERSION,
  runExportCapabilityPreflight,
} from "@/features/export/domain";
import type { ExportEnvironmentSnapshot } from "@/features/export/domain/export-manifest.types";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

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
  mp4EncoderAvailable: true,
};

function imageMedia(url: string): SceneMedia {
  return {
    type: "image",
    url,
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
}

function appliedPrepared() {
  let scene: FootieScene = {
    id: "scene-1",
    start: 0,
    end: 9,
    duration: 9,
    startMs: 0,
    endMs: 9_000,
    durationMs: 9_000,
    subtitle: "Fallback",
    narration: "One sentence. Two sentence, then end!",
  };
  for (let i = 0; i < 3; i += 1) {
    scene = appendMixedMediaSequenceItem(
      scene,
      imageMedia(`https://example.com/${i}.jpg`),
      {
        mixedMediaScenesEnabled: true,
        generateId: () => `m${i}`,
      },
    ).scene;
  }
  const script: FootieScript = {
    title: "Render compatibility",
    totalDuration: 9,
    narration: "Story",
    scenes: [scene],
  };
  const suggested = suggestVisualBeatPlan(script, {
    sceneId: "scene-1",
    density: "studio",
    generatedAtIso: "2026-08-01T12:00:00.000Z",
    visualBeatDensityEnabled: true,
  });
  assert.equal(suggested.ok, true);
  if (!suggested.ok) throw new Error("suggest failed");
  const applied = applyVisualBeatPlan(suggested.script, {
    sceneId: "scene-1",
    selectedDensity: "studio",
    visualBeatDensityEnabled: true,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(applied.ok, true);
  if (!applied.ok) throw new Error("apply failed");
  return prepareStoryForExport(applied.script, {
    mixedMediaScenesEnabled: true,
    visualBeatDensityEnabled: true,
  });
}

function main(): void {
  console.log("\nVisual pacing render compatibility\n");

  test("ExportManifest remains version 4 and excludes plan/provenance", () => {
    const prepared = appliedPrepared();
    const manifest = buildExportManifest({
      story: prepared.story,
      prepared,
      mixedMediaScenesEnabled: true,
      environment: CAPABLE_ENV,
    });
    assert.equal(manifest.version, EXPORT_MANIFEST_VERSION);
    assert.equal(manifest.version, 4);
    const json = JSON.stringify(manifest);
    assert.equal(json.includes("visualBeatPlan"), false);
    assert.equal(json.includes("sourceSnapshot"), false);
    assert.equal(json.includes("visual-beat-density"), false);
    assert.equal(json.includes("VISUAL_PACING_"), false);
  });

  test("applied output is expressible entirely through existing media windows", () => {
    const prepared = appliedPrepared();
    const manifest = buildExportManifest({
      story: prepared.story,
      prepared,
      mixedMediaScenesEnabled: true,
      environment: CAPABLE_ENV,
    });
    const items = manifest.scenes[0]!.mediaTimeline.items;
    assert.ok(items.length >= 2);
    assert.equal(items[0]!.startOffsetMs, 0);
    for (let i = 1; i < items.length; i += 1) {
      assert.ok(items[i]!.startOffsetMs >= items[i - 1]!.startOffsetMs);
    }
  });

  test("Browser and Headless manifests stay identical for the same prepared story", () => {
    const prepared = appliedPrepared();
    const browser = buildExportManifest({
      story: prepared.story,
      prepared,
      mixedMediaScenesEnabled: true,
      environment: CAPABLE_ENV,
    });
    const headless = buildExportManifest({
      story: prepared.story,
      prepared,
      mixedMediaScenesEnabled: true,
      environment: { ...CAPABLE_ENV, serverRendererAvailable: true },
    });
    assert.deepEqual(
      browser.scenes.map((scene) => scene.mediaTimeline),
      headless.scenes.map((scene) => scene.mediaTimeline),
    );
    // Environment capability bits may differ; media windows must not.
    assert.deepEqual(
      browser.scenes[0]!.mediaTimeline.items.map((item) => ({
        id: item.id,
        start: item.startOffsetMs,
        duration: item.durationMs,
      })),
      headless.scenes[0]!.mediaTimeline.items.map((item) => ({
        id: item.id,
        start: item.startOffsetMs,
        duration: item.durationMs,
      })),
    );
  });

  test("mixed-media-capable renderer without pacing knowledge remains exportable", () => {
    const prepared = appliedPrepared();
    const manifest = buildExportManifest({
      story: prepared.story,
      prepared,
      mixedMediaScenesEnabled: true,
      environment: CAPABLE_ENV,
    });
    const preflight = runExportCapabilityPreflight(manifest);
    assert.equal(preflight.supported, true);
    assert.equal(preflight.renderer, "browser");
    assert.equal(
      preflight.blockers.some((blocker) =>
        /visual.?beat|pacing/i.test(blocker.code + blocker.message),
      ),
      false,
    );
  });

  test("Headless preferred does not disable Browser selection wiring", () => {
    const exportPanel = readSrc("src/components/ExportPanel.tsx");
    assert.match(exportPanel, /browser/i);
    assert.match(exportPanel, /HeadlessExportSection|server/i);
    // Browser export button path remains present.
    assert.match(exportPanel, /exportRenderer === ["']browser["']/);
    assert.doesNotMatch(exportPanel, /visual-beat-density-v1/);
  });

  test("capability/resolution surfaces keep Browser 720p/1080p and Headless 4K options", () => {
    const exportPanel = readSrc("src/components/ExportPanel.tsx");
    assert.match(exportPanel, /720/);
    assert.match(exportPanel, /1080/);
    const headlessSection = readSrc(
      "src/features/headless-renderer/product/ui/HeadlessExportSection.tsx",
    );
    assert.match(headlessSection, /720p/);
    assert.match(headlessSection, /1080p/);
    assert.match(headlessSection, /4k/);
    assert.match(headlessSection, /visualBeatDensityEnabled/);
  });

  test("existing unsupported render capability remains pre-dispatch terminal", () => {
    const prepared = appliedPrepared();
    const manifest = buildExportManifest({
      story: prepared.story,
      prepared,
      mixedMediaScenesEnabled: true,
      environment: {
        ...CAPABLE_ENV,
        supportsMediaRecorder: false,
        supportsCanvasCaptureStream: false,
      },
    });
    const preflight = runExportCapabilityPreflight(manifest);
    assert.equal(preflight.renderer, "blocked");
    assert.ok(preflight.blockers.length > 0);
    // Draft/stale pacing must never invent a pacing-specific terminal.
    assert.equal(
      preflight.blockers.some((blocker) =>
        /VISUAL_PACING|visual-beat-density/i.test(blocker.code),
      ),
      false,
    );
  });

  test("no Visual pacing state can leave export progress at 92%", () => {
    const service = readSrc(
      "src/features/export/services/video-render.service.ts",
    );
    assert.doesNotMatch(service, /visualBeatPlan|VISUAL_PACING_/);
    const preflight = readSrc(
      "src/features/export/domain/run-export-capability-preflight.ts",
    );
    assert.doesNotMatch(preflight, /VISUAL_PACING_|visualBeatPlan/);
    // Guidance is merged after capability preflight, never as a blocker code.
    assert.match(
      readSrc("src/features/export/domain/prepare-export-request.ts"),
      /resolveVisualPacingExportGuidance/,
    );
  });

  test("renderer capability list excludes visual-beat authoring capability", () => {
    assert.doesNotMatch(
      readSrc("src/features/export/domain/export-manifest.types.ts"),
      /visual-beat-density-v1|visualBeatDensity/,
    );
    assert.doesNotMatch(
      readSrc("src/features/export/domain/build-export-manifest.ts"),
      /visualBeatPlan|visual-beat-density/,
    );
    assert.match(
      readSrc(
        "src/features/visual-beat-density/adapters/resolve-visual-pacing-export-guidance.ts",
      ),
      /never a render authority/i,
    );
  });

  test("one shared capability fetch remains the only fetch site", () => {
    const provider = readSrc(
      "src/features/visual-retention/client/VisualRetentionCapabilitiesContext.tsx",
    );
    assert.equal(
      (
        provider.match(
          /fetch\(\s*["']\/api\/visual-retention\/capabilities/g,
        ) ?? []
      ).length,
      1,
    );
    assert.doesNotMatch(
      readSrc("src/components/ExportPanel.tsx"),
      /fetch\(\s*["']\/api\/visual-retention\/capabilities/,
    );
    assert.doesNotMatch(
      readSrc(
        "src/features/headless-renderer/product/ui/HeadlessExportSection.tsx",
      ),
      /fetch\(\s*["']\/api\/visual-retention\/capabilities/,
    );
  });

  console.log(`\nVisual pacing render compatibility: ${passed} PASS`);
}

main();
