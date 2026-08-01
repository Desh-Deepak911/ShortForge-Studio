/**
 * Visual-beat Suggest / Apply / Discard command verification.
 * Run: npm run test:visual-beat-plan-commands
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

import {
  applyVisualBeatPlan,
  discardVisualBeatPlan,
  suggestVisualBeatPlan,
} from "@/features/visual-beat-density";
import { projectSceneVisualPlan } from "@/features/mixed-media-scenes/adapters/project-visual-sequence";
import {
  appendMixedMediaSequenceItem,
  readMixedMediaSequenceItems,
  updateMixedMediaSequenceBoundary,
} from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";

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

function videoMedia(url: string): SceneMedia {
  return {
    type: "video",
    url,
    source: "upload",
    durationMs: 8_000,
    trimStartMs: 100,
    trimEndMs: 4_100,
    muted: true,
    fitMode: "cover",
    transform: { x: 1, y: -1, scale: 1.05, rotation: 0 },
  };
}

function baseScene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 9,
    duration: 9,
    startMs: 0,
    endMs: 9_000,
    durationMs: 9_000,
    subtitle: "Fallback subtitle",
    narration: "One sentence. Two sentence, then end!",
    ...overrides,
  };
}

function baseScript(scene: FootieScene): FootieScript {
  return {
    title: "Beat commands",
    totalDuration: 9,
    narration: "Story narration",
    scenes: [scene],
  };
}

function seededScript(): FootieScript {
  let scene = baseScene();
  scene = appendMixedMediaSequenceItem(scene, imageMedia("https://example.com/a.jpg"), {
    mixedMediaScenesEnabled: true,
    generateId: () => "a",
  }).scene;
  scene = appendMixedMediaSequenceItem(scene, videoMedia("https://example.com/b.mp4"), {
    mixedMediaScenesEnabled: true,
    generateId: () => "b",
  }).scene;
  scene = appendMixedMediaSequenceItem(scene, imageMedia("blob:https://local/c"), {
    mixedMediaScenesEnabled: true,
    generateId: () => "c",
  }).scene;
  return baseScript(scene);
}

function main(): void {
  console.log("\nVisual-beat plan commands\n");

  test("Suggest does not change timing", () => {
    const script = seededScript();
    const before = JSON.stringify(script.scenes[0]!.visualSequence);
    const beforeTimeline = JSON.stringify(script.scenes[0]!.mediaTimeline);
    const result = suggestVisualBeatPlan(script, {
      sceneId: "scene-1",
      density: "balanced",
      generatedAtIso: "2020-01-01T00:00:00.000Z",
      visualBeatDensityEnabled: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(
      JSON.stringify(result.script.scenes[0]!.visualSequence),
      before,
    );
    assert.equal(
      JSON.stringify(result.script.scenes[0]!.mediaTimeline),
      beforeTimeline,
    );
    assert.equal(result.plan?.status, "draft");
    assert.equal(script.scenes[0]!.visualBeatPlan, undefined);
  });

  test("capability off Suggest fails without mutation", () => {
    const script = seededScript();
    const before = JSON.stringify(script);
    const result = suggestVisualBeatPlan(script, {
      sceneIndex: 0,
      density: "fast",
      generatedAtIso: "2020-01-01T00:00:00.000Z",
      visualBeatDensityEnabled: false,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.terminalCode, "BEATS_CAPABILITY_OFF");
    assert.equal(result.script, script);
    assert.equal(JSON.stringify(script), before);
  });

  test("Apply changes timing only and preserves identity/media/trims", () => {
    const suggested = suggestVisualBeatPlan(seededScript(), {
      sceneId: "scene-1",
      density: "studio",
      generatedAtIso: "2020-01-01T00:00:00.000Z",
      visualBeatDensityEnabled: true,
    });
    assert.equal(suggested.ok, true);
    if (!suggested.ok) return;
    const beforeItems = readMixedMediaSequenceItems(suggested.script.scenes[0]!);
    const applied = applyVisualBeatPlan(suggested.script, {
      sceneId: "scene-1",
      selectedDensity: "studio",
      visualBeatDensityEnabled: true,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const afterItems = readMixedMediaSequenceItems(applied.script.scenes[0]!);
    assert.equal(afterItems.length, beforeItems.length);
    for (let i = 0; i < beforeItems.length; i++) {
      assert.equal(afterItems[i]!.id, beforeItems[i]!.id);
      assert.deepEqual(afterItems[i]!.media, beforeItems[i]!.media);
    }
    assert.deepEqual(
      afterItems.map((item) => item.startOffsetMs),
      [...(applied.plan?.proposedStartOffsetsMs ?? [])],
    );
    assert.equal(applied.plan?.status, "applied");
    assert.ok(applied.script.scenes[0]!.visualSequence);
    assert.ok(applied.script.scenes[0]!.mediaTimeline);
  });

  test("Apply dual-writes mediaTimeline and preview projection matches", () => {
    const suggested = suggestVisualBeatPlan(seededScript(), {
      sceneId: "scene-1",
      density: "balanced",
      generatedAtIso: "2020-01-01T00:00:00.000Z",
      visualBeatDensityEnabled: true,
    });
    assert.equal(suggested.ok, true);
    if (!suggested.ok) return;
    const applied = applyVisualBeatPlan(suggested.script, {
      sceneId: "scene-1",
      selectedDensity: "balanced",
      visualBeatDensityEnabled: true,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const scene = applied.script.scenes[0]!;
    const projected = projectSceneVisualPlan(scene, {
      mixedMediaScenesEnabled: true,
    });
    assert.equal(projected.authority, "visual_sequence");
    assert.deepEqual(
      projected.windows.map((window) => window.startMs),
      scene.visualSequence!.items.map((item) => item.startOffsetMs),
    );
  });

  test("Browser and Headless manifests stay aligned through existing consumers", () => {
    const suggested = suggestVisualBeatPlan(seededScript(), {
      sceneId: "scene-1",
      density: "balanced",
      generatedAtIso: "2020-01-01T00:00:00.000Z",
      visualBeatDensityEnabled: true,
    });
    assert.equal(suggested.ok, true);
    if (!suggested.ok) return;
    const applied = applyVisualBeatPlan(suggested.script, {
      sceneId: "scene-1",
      selectedDensity: "balanced",
      visualBeatDensityEnabled: true,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const prepared = prepareStoryForExport(applied.script, {
      mixedMediaScenesEnabled: true,
    });
    const browser = buildExportManifest({
      story: applied.script,
      environment: CAPABLE_ENV,
      prepared,
      mixedMediaScenesEnabled: true,
    });
    const headless = buildExportManifest({
      story: applied.script,
      environment: { ...CAPABLE_ENV, serverRendererAvailable: true },
      prepared,
      mixedMediaScenesEnabled: true,
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
    assert.equal(
      JSON.stringify(browser).includes("visualBeatPlan"),
      false,
    );
  });

  test("Stale Apply fails without mutation", () => {
    const suggested = suggestVisualBeatPlan(seededScript(), {
      sceneId: "scene-1",
      density: "balanced",
      generatedAtIso: "2020-01-01T00:00:00.000Z",
      visualBeatDensityEnabled: true,
    });
    assert.equal(suggested.ok, true);
    if (!suggested.ok) return;
    const applied = applyVisualBeatPlan(suggested.script, {
      sceneId: "scene-1",
      selectedDensity: "balanced",
      visualBeatDensityEnabled: true,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const edited = updateMixedMediaSequenceBoundary(
      applied.script.scenes[0]!,
      "b",
      4_500,
      { mixedMediaScenesEnabled: true },
    );
    const staleScript: FootieScript = {
      ...applied.script,
      scenes: [edited.scene],
    };
    const before = JSON.stringify(staleScript);
    const retry = applyVisualBeatPlan(staleScript, {
      sceneId: "scene-1",
      selectedDensity: "balanced",
      visualBeatDensityEnabled: true,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(retry.ok, false);
    if (retry.ok) return;
    assert.equal(retry.terminalCode, "BEATS_PLAN_STALE");
    assert.equal(retry.script, staleScript);
    assert.equal(JSON.stringify(staleScript), before);
  });

  test("Too-short Apply fails without mutation", () => {
    let scene = baseScene({
      durationMs: 1_500,
      duration: 1.5,
      end: 1.5,
      endMs: 1_500,
    });
    scene = appendMixedMediaSequenceItem(scene, imageMedia("https://example.com/a.jpg"), {
      mixedMediaScenesEnabled: true,
      generateId: () => "a",
    }).scene;
    scene = appendMixedMediaSequenceItem(scene, imageMedia("https://example.com/b.jpg"), {
      mixedMediaScenesEnabled: true,
      generateId: () => "b",
    }).scene;
    scene = appendMixedMediaSequenceItem(scene, imageMedia("https://example.com/c.jpg"), {
      mixedMediaScenesEnabled: true,
      generateId: () => "c",
    }).scene;
    const suggested = suggestVisualBeatPlan(baseScript(scene), {
      sceneId: "scene-1",
      density: "fast",
      generatedAtIso: "2020-01-01T00:00:00.000Z",
      visualBeatDensityEnabled: true,
    });
    assert.equal(suggested.ok, true);
    if (!suggested.ok) return;
    const shrunk: FootieScript = {
      ...suggested.script,
      scenes: [
        {
          ...suggested.script.scenes[0]!,
          durationMs: 1_000,
          duration: 1,
          end: 1,
          endMs: 1_000,
        },
      ],
    };
    const before = JSON.stringify(shrunk);
    const applied = applyVisualBeatPlan(shrunk, {
      sceneId: "scene-1",
      selectedDensity: "fast",
      visualBeatDensityEnabled: true,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(applied.ok, false);
    if (applied.ok) return;
    assert.equal(applied.terminalCode, "BEATS_SCENE_TOO_SHORT");
    assert.equal(applied.script, shrunk);
    assert.equal(JSON.stringify(shrunk), before);
  });

  test("Discard preserves applied timing", () => {
    const suggested = suggestVisualBeatPlan(seededScript(), {
      sceneId: "scene-1",
      density: "balanced",
      generatedAtIso: "2020-01-01T00:00:00.000Z",
      visualBeatDensityEnabled: true,
    });
    assert.equal(suggested.ok, true);
    if (!suggested.ok) return;
    const applied = applyVisualBeatPlan(suggested.script, {
      sceneId: "scene-1",
      selectedDensity: "balanced",
      visualBeatDensityEnabled: true,
      mixedMediaScenesEnabled: true,
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const timingBefore = JSON.stringify({
      visualSequence: applied.script.scenes[0]!.visualSequence,
      mediaTimeline: applied.script.scenes[0]!.mediaTimeline,
    });
    const discarded = discardVisualBeatPlan(applied.script, { sceneId: "scene-1" });
    assert.equal(discarded.ok, true);
    if (!discarded.ok) return;
    assert.equal(discarded.script.scenes[0]!.visualBeatPlan, undefined);
    assert.equal(
      JSON.stringify({
        visualSequence: discarded.script.scenes[0]!.visualSequence,
        mediaTimeline: discarded.script.scenes[0]!.mediaTimeline,
      }),
      timingBefore,
    );
  });

  test("inputs remain immutable", () => {
    const script = Object.freeze(seededScript());
    const before = JSON.stringify(script);
    suggestVisualBeatPlan(script, {
      sceneId: "scene-1",
      density: "balanced",
      generatedAtIso: "2020-01-01T00:00:00.000Z",
      visualBeatDensityEnabled: true,
    });
    assert.equal(JSON.stringify(script), before);
  });

  test("no music / env / preview consumer wiring in commands", () => {
    const commands = readFileSync(
      path.join(
        process.cwd(),
        "src/features/visual-beat-density/editor/visual-beat-plan.commands.ts",
      ),
      "utf8",
    );
    assert.doesNotMatch(commands, /from\s+["'][^"']*music[^"']*["']/i);
    assert.doesNotMatch(commands, /process\.env|SHORTFORGE_/);
    assert.doesNotMatch(commands, /Date\.now\(|Math\.random\(/);
    assert.match(commands, /getSceneDurationMs/);
    assert.match(commands, /writeMixedMediaSequenceItems/);

    const snapshot = readFileSync(
      path.join(
        process.cwd(),
        "src/features/visual-beat-density/domain/visual-beat-source-snapshot.ts",
      ),
      "utf8",
    );
    assert.doesNotMatch(snapshot, /from\s+["'][^"']*music[^"']*["']/i);
    assert.doesNotMatch(snapshot, /Date\.now\(|Math\.random\(|fetch\(/);

    assert.doesNotMatch(
      readSrc("src/features/export/domain/export-manifest.types.ts"),
      /sourceSnapshot|visualBeatPlan/,
    );
    assert.doesNotMatch(
      readSrc("src/features/preview/components/VideoPreview.tsx"),
      /sourceSnapshot|visualBeatPlan/,
    );
  });

  test("Discard removes invalid plan metadata safely", () => {
    const suggested = suggestVisualBeatPlan(seededScript(), {
      sceneId: "scene-1",
      density: "balanced",
      generatedAtIso: "2020-01-01T00:00:00.000Z",
      visualBeatDensityEnabled: true,
    });
    assert.equal(suggested.ok, true);
    if (!suggested.ok) return;
    const { sourceSnapshot: _snap, ...brokenPlan } = suggested.plan!;
    void _snap;
    const brokenScript: FootieScript = {
      ...suggested.script,
      scenes: [
        {
          ...suggested.script.scenes[0]!,
          visualBeatPlan: brokenPlan as typeof suggested.plan,
        },
      ],
    };
    const discarded = discardVisualBeatPlan(brokenScript, { sceneId: "scene-1" });
    assert.equal(discarded.ok, true);
    if (!discarded.ok) return;
    assert.equal(discarded.script.scenes[0]!.visualBeatPlan, undefined);
  });

  test("dependency / cycle assertion for story type leaf import", () => {
    const storyTypes = readFileSync(
      path.join(process.cwd(), "src/features/story/types/story.types.ts"),
      "utf8",
    );
    assert.match(
      storyTypes,
      /from\s+["']@\/features\/visual-beat-density\/domain\/visual-beat-plan["']/,
    );
    assert.doesNotMatch(
      storyTypes,
      /from\s+["']@\/features\/visual-beat-density["']/,
    );
    assert.doesNotMatch(
      storyTypes,
      /visual-beat-plan\.commands|evaluate-visual-beat-plan-staleness|project-scene-visual-beat-plan/,
    );

    const planLeaf = readFileSync(
      path.join(
        process.cwd(),
        "src/features/visual-beat-density/domain/visual-beat-plan.ts",
      ),
      "utf8",
    );
    assert.doesNotMatch(planLeaf, /@\/features\/story|mixed-media-scenes|export\//);

    const mixedDomain = readFileSync(
      path.join(
        process.cwd(),
        "src/features/mixed-media-scenes/domain/normalize-visual-sequence.ts",
      ),
      "utf8",
    );
    assert.doesNotMatch(mixedDomain, /visual-beat-density/);
  });

  console.log(`\n${passed} passed\n`);
}

main();
