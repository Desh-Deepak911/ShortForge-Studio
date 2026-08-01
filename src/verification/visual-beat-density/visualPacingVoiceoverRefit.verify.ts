/**
 * Visual pacing voiceover-refit staleness verification.
 * Run: npm run test:visual-pacing-export
 */

import assert from "node:assert/strict";

import {
  appendMixedMediaSequenceItem,
  readMixedMediaSequenceItems,
} from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import {
  applyVisualBeatPlan,
  projectVisualBeatPlanStalenessForScene,
  suggestVisualBeatPlan,
} from "@/features/visual-beat-density";
import { resolveVisualPacingExportGuidance } from "@/features/visual-beat-density/adapters/resolve-visual-pacing-export-guidance";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import { prepareExportRequest } from "@/features/export/domain/prepare-export-request";
import { buildExportManifest } from "@/features/export/domain";
import type { ExportEnvironmentSnapshot } from "@/features/export/domain/export-manifest.types";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
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

function seededAppliedScript(): FootieScript {
  let scene: FootieScene = {
    id: "scene-1",
    start: 0,
    end: 6,
    duration: 6,
    startMs: 0,
    endMs: 6_000,
    durationMs: 6_000,
    subtitle: "Fallback",
    narration: "Short scene narration for pacing.",
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
    title: "Voiceover refit pacing",
    totalDuration: 6,
    narration: "Story narration",
    scenes: [scene],
    voiceoverUrl: "https://example.com/voice.mp3",
    // Longer voiceover forces export-time duration refit away from 6s editor scenes.
    voiceoverDurationMs: 12_000,
  };
  const suggested = suggestVisualBeatPlan(script, {
    sceneId: "scene-1",
    density: "balanced",
    generatedAtIso: "2026-08-01T12:00:00.000Z",
    visualBeatDensityEnabled: true,
  });
  assert.equal(suggested.ok, true);
  if (!suggested.ok) throw new Error("suggest failed");
  const applied = applyVisualBeatPlan(suggested.script, {
    sceneId: "scene-1",
    selectedDensity: "balanced",
    visualBeatDensityEnabled: true,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(applied.ok, true);
  if (!applied.ok) throw new Error("apply failed");
  return applied.script;
}

async function main(): Promise<void> {
  console.log("\nVisual pacing voiceover refit\n");

  test("editor story remains immutable through prepareStoryForExport", () => {
    const editor = seededAppliedScript();
    const beforeJson = JSON.stringify(editor);
    const beforeTiming = readMixedMediaSequenceItems(editor.scenes[0]!).map(
      (item) => ({
        id: item.id,
        startOffsetMs: item.startOffsetMs,
        durationMs: item.durationMs,
      }),
    );
    prepareStoryForExport(editor, {
      mixedMediaScenesEnabled: true,
    });
    assert.equal(JSON.stringify(editor), beforeJson);
    assert.deepEqual(
      readMixedMediaSequenceItems(editor.scenes[0]!).map((item) => ({
        id: item.id,
        startOffsetMs: item.startOffsetMs,
        durationMs: item.durationMs,
      })),
      beforeTiming,
    );
  });

  test("voiceover refit changing duration derives applied plan as stale", () => {
    const editor = seededAppliedScript();
    // Editor-side applied plan is current before export prep.
    assert.equal(
      projectVisualBeatPlanStalenessForScene(editor.scenes[0]!, "balanced")
        .effectiveStatus,
      "applied",
    );

    const prepared = prepareStoryForExport(editor, {
      mixedMediaScenesEnabled: true,
    });
    const preparedScene = prepared.story.scenes[0]!;
    assert.notEqual(preparedScene.durationMs, editor.scenes[0]!.durationMs);

    const guidance = resolveVisualPacingExportGuidance(prepared.story, {
      visualBeatDensityEnabled: true,
    });
    assert.ok(
      guidance.some((item) => item.code === "VISUAL_PACING_STALE"),
      "expected stale guidance after voiceover duration refit",
    );
    // prepareStoryForExport is timing-only — guidance strings belong to prepareExportRequest.
    assert.equal(
      prepared.warnings.some((warning) => warning.includes("Visual pacing")),
      false,
    );
  });

  await testAsync(
    "prepareExportRequest emits stale exactly once after voiceover refit",
    async () => {
      const editor = seededAppliedScript();
      const prepared = await prepareExportRequest({
        story: editor,
        throwIfBlocked: false,
        mixedMediaScenesEnabled: true,
        visualBeatDensityEnabled: true,
        environment: CAPABLE_ENV,
      });
      assert.notEqual(
        prepared.preparedStory.story.scenes[0]!.durationMs,
        editor.scenes[0]!.durationMs,
      );
      const staleWarnings = prepared.preflight.warnings.filter(
        (warning) => warning.code === "VISUAL_PACING_STALE",
      );
      assert.equal(staleWarnings.length, 1);
      assert.equal(
        prepared.preparedStory.warnings.some((warning) =>
          warning.includes("Visual pacing"),
        ),
        false,
      );
    },
  );

  test("Browser and Headless receive identical final media windows after refit", () => {
    const editor = seededAppliedScript();
    const prepared = prepareStoryForExport(editor, {
      mixedMediaScenesEnabled: true,
    });
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
    assert.equal(JSON.stringify(browser).includes("visualBeatPlan"), false);
    assert.equal(JSON.stringify(headless).includes("visualBeatPlan"), false);
  });

  test("narration remains authoritative; music absent from pacing path", () => {
    const editor = seededAppliedScript();
    const withMusic: FootieScript = {
      ...editor,
      backgroundMusic: {
        enabled: true,
        source: "upload",
        fileUrl: "https://example.com/music.mp3",
        volume: 0.2,
        duckingEnabled: true,
        fadeIn: true,
        fadeOut: true,
      },
    };
    const prepared = prepareStoryForExport(withMusic, {
      mixedMediaScenesEnabled: true,
    });
    // Music must not clear stale guidance caused by voiceover refit.
    assert.ok(
      resolveVisualPacingExportGuidance(prepared.story, {
        visualBeatDensityEnabled: true,
      }).some((item) => item.code === "VISUAL_PACING_STALE"),
    );
  });

  console.log(`\nVisual pacing voiceover refit: ${passed} PASS`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
