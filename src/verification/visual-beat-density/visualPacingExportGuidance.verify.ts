/**
 * Visual pacing export guidance verification.
 * Run: npm run test:visual-pacing-export
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  appendMixedMediaSequenceItem,
  readMixedMediaSequenceItems,
  updateMixedMediaSequenceBoundary,
} from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import {
  applyVisualBeatPlan,
  discardVisualBeatPlan,
  suggestVisualBeatPlan,
} from "@/features/visual-beat-density";
import {
  VISUAL_PACING_EXPORT_GUIDANCE_CODES,
  VISUAL_PACING_EXPORT_GUIDANCE_MESSAGES,
  resolveVisualPacingExportGuidance,
} from "@/features/visual-beat-density/adapters/resolve-visual-pacing-export-guidance";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import { prepareExportRequest } from "@/features/export/domain/prepare-export-request";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

let passed = 0;

function test(name: string, fn: () => void | Promise<void>): void {
  const result = fn();
  if (result && typeof (result as Promise<void>).then === "function") {
    throw new Error(`Use testAsync for async: ${name}`);
  }
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function imageMedia(url: string): SceneMedia {
  return {
    type: "image",
    url,
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
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
    subtitle: "Fallback",
    narration: "One sentence. Two sentence, then end!",
    ...overrides,
  };
}

function baseScript(scene: FootieScene): FootieScript {
  return {
    title: "Visual pacing export guidance",
    totalDuration: scene.duration ?? 9,
    narration: "Story narration",
    scenes: [scene],
  };
}

function seededScript(count = 3): FootieScript {
  let scene = baseScene();
  for (let i = 0; i < count; i += 1) {
    scene = appendMixedMediaSequenceItem(
      scene,
      imageMedia(`https://example.com/${i}.jpg`),
      {
        mixedMediaScenesEnabled: true,
        generateId: () => `m${i}`,
      },
    ).scene;
  }
  return baseScript(scene);
}

function draftScript(): FootieScript {
  const suggested = suggestVisualBeatPlan(seededScript(), {
    sceneId: "scene-1",
    density: "balanced",
    generatedAtIso: "2026-08-01T12:00:00.000Z",
    visualBeatDensityEnabled: true,
  });
  assert.equal(suggested.ok, true);
  if (!suggested.ok) throw new Error("suggest failed");
  return suggested.script;
}

function appliedScript(): FootieScript {
  const applied = applyVisualBeatPlan(draftScript(), {
    sceneId: "scene-1",
    selectedDensity: "balanced",
    visualBeatDensityEnabled: true,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(applied.ok, true);
  if (!applied.ok) throw new Error("apply failed");
  return applied.script;
}

const CAPABLE_ENV = {
  browserName: "chrome" as const,
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

function countPreflightCode(
  warnings: ReadonlyArray<{ code: string }>,
  code: string,
): number {
  return warnings.filter((warning) => warning.code === code).length;
}

async function prepareGuidedRequest(story: FootieScript, enabled = true) {
  return prepareExportRequest({
    story,
    throwIfBlocked: false,
    mixedMediaScenesEnabled: true,
    visualBeatDensityEnabled: enabled,
    environment: CAPABLE_ENV,
  });
}

async function main(): Promise<void> {
  console.log("\nVisual pacing export guidance\n");

  test("no plan → no guidance", () => {
    const prepared = prepareStoryForExport(seededScript(), {
      mixedMediaScenesEnabled: true,
    });
    const guidance = resolveVisualPacingExportGuidance(prepared.story, {
      visualBeatDensityEnabled: true,
    });
    assert.equal(guidance.length, 0);
    assert.equal(
      prepared.warnings.some((warning) => warning.includes("Visual pacing")),
      false,
    );
  });

  test("current draft → draft-not-applied warning", () => {
    const prepared = prepareStoryForExport(draftScript(), {
      mixedMediaScenesEnabled: true,
    });
    const guidance = resolveVisualPacingExportGuidance(prepared.story, {
      visualBeatDensityEnabled: true,
    });
    assert.equal(guidance.length, 1);
    assert.equal(
      guidance[0]!.code,
      VISUAL_PACING_EXPORT_GUIDANCE_CODES.VISUAL_PACING_DRAFT_NOT_APPLIED,
    );
    assert.equal(
      guidance[0]!.message,
      VISUAL_PACING_EXPORT_GUIDANCE_MESSAGES.VISUAL_PACING_DRAFT_NOT_APPLIED,
    );
    assert.equal(
      prepared.warnings.some((warning) => warning.includes("Visual pacing")),
      false,
    );
  });

  test("current applied → no guidance", () => {
    const prepared = prepareStoryForExport(appliedScript(), {
      mixedMediaScenesEnabled: true,
    });
    const guidance = resolveVisualPacingExportGuidance(prepared.story, {
      visualBeatDensityEnabled: true,
    });
    assert.equal(guidance.length, 0);
  });

  test("stale via narration → stale warning", () => {
    let script = appliedScript();
    script = {
      ...script,
      scenes: script.scenes.map((scene) =>
        scene.id === "scene-1"
          ? { ...scene, narration: "Completely different narration now." }
          : scene,
      ),
    };
    const prepared = prepareStoryForExport(script, {
      mixedMediaScenesEnabled: true,
    });
    const guidance = resolveVisualPacingExportGuidance(prepared.story, {
      visualBeatDensityEnabled: true,
    });
    assert.equal(guidance[0]?.code, "VISUAL_PACING_STALE");
  });

  test("stale via media → stale warning", () => {
    let script = appliedScript();
    const scene = script.scenes[0]!;
    const appended = appendMixedMediaSequenceItem(
      scene,
      imageMedia("https://example.com/extra.jpg"),
      {
        mixedMediaScenesEnabled: true,
        generateId: () => "extra",
      },
    ).scene;
    script = {
      ...script,
      scenes: [appended],
    };
    const prepared = prepareStoryForExport(script, {
      mixedMediaScenesEnabled: true,
    });
    assert.ok(
      resolveVisualPacingExportGuidance(prepared.story, {
        visualBeatDensityEnabled: true,
      }).some((item) => item.code === "VISUAL_PACING_STALE"),
    );
  });

  test("stale via manual timing → stale warning", () => {
    let script = appliedScript();
    const items = readMixedMediaSequenceItems(script.scenes[0]!);
    const edited = updateMixedMediaSequenceBoundary(
      script.scenes[0]!,
      items[1]!.id,
      items[1]!.startOffsetMs + 400,
      { mixedMediaScenesEnabled: true },
    );
    script = { ...script, scenes: [edited.scene] };
    const prepared = prepareStoryForExport(script, {
      mixedMediaScenesEnabled: true,
    });
    assert.equal(
      resolveVisualPacingExportGuidance(prepared.story, {
        visualBeatDensityEnabled: true,
      })[0]?.code,
      "VISUAL_PACING_STALE",
    );
  });

  test("malformed metadata → invalid warning; timing remains", () => {
    let script = appliedScript();
    const before = readMixedMediaSequenceItems(script.scenes[0]!).map(
      (item) => item.startOffsetMs,
    );
    script = {
      ...script,
      scenes: [
        {
          ...script.scenes[0]!,
          visualBeatPlan: { version: 1, bogus: true } as never,
        },
      ],
    };
    const prepared = prepareStoryForExport(script, {
      mixedMediaScenesEnabled: true,
    });
    assert.equal(
      resolveVisualPacingExportGuidance(prepared.story, {
        visualBeatDensityEnabled: true,
      })[0]?.code,
      "VISUAL_PACING_METADATA_INVALID",
    );
    assert.deepEqual(
      readMixedMediaSequenceItems(prepared.story.scenes[0]!).map(
        (item) => item.startOffsetMs,
      ),
      before,
    );
  });

  test("capability off ignores plan metadata", () => {
    const prepared = prepareStoryForExport(draftScript(), {
      mixedMediaScenesEnabled: true,
    });
    assert.equal(
      resolveVisualPacingExportGuidance(prepared.story, {
        visualBeatDensityEnabled: false,
      }).length,
      0,
    );
    assert.equal(
      prepared.warnings.some((warning) => warning.includes("Visual pacing")),
      false,
    );
  });

  test("old project with no plan remains quiet", () => {
    const legacy = baseScript(baseScene({ id: "legacy" }));
    const prepared = prepareStoryForExport(legacy, {
      mixedMediaScenesEnabled: true,
    });
    assert.equal(
      resolveVisualPacingExportGuidance(prepared.story, {
        visualBeatDensityEnabled: true,
      }).length,
      0,
    );
  });

  test("discard applied preserves timing and clears guidance", () => {
    const applied = appliedScript();
    const timing = readMixedMediaSequenceItems(applied.scenes[0]!).map(
      (item) => item.startOffsetMs,
    );
    const discarded = discardVisualBeatPlan(applied, { sceneId: "scene-1" });
    assert.equal(discarded.ok, true);
    if (!discarded.ok) return;
    assert.deepEqual(
      readMixedMediaSequenceItems(discarded.script.scenes[0]!).map(
        (item) => item.startOffsetMs,
      ),
      timing,
    );
    const prepared = prepareStoryForExport(discarded.script, {
      mixedMediaScenesEnabled: true,
    });
    assert.equal(
      resolveVisualPacingExportGuidance(prepared.story, {
        visualBeatDensityEnabled: true,
      }).length,
      0,
    );
  });

  test("prepareStoryForExport never appends Visual pacing string warnings", () => {
    const draftPrepared = prepareStoryForExport(draftScript(), {
      mixedMediaScenesEnabled: true,
    });
    let staleScript = appliedScript();
    staleScript = {
      ...staleScript,
      scenes: staleScript.scenes.map((scene) =>
        scene.id === "scene-1"
          ? { ...scene, narration: "Narration drift for preparation warnings." }
          : scene,
      ),
    };
    const stalePrepared = prepareStoryForExport(staleScript, {
      mixedMediaScenesEnabled: true,
    });
    const invalidPrepared = prepareStoryForExport(
      {
        ...appliedScript(),
        scenes: [
          {
            ...appliedScript().scenes[0]!,
            visualBeatPlan: { version: 1, bogus: true } as never,
          },
        ],
      },
      { mixedMediaScenesEnabled: true },
    );
    for (const prepared of [draftPrepared, stalePrepared, invalidPrepared]) {
      assert.equal(
        prepared.warnings.some((warning) => warning.includes("Visual pacing")),
        false,
      );
    }
    // Unrelated preparation warnings remain available on the string list.
    assert.ok(Array.isArray(draftPrepared.warnings));
  });

  await testAsync(
    "prepareExportRequest emits each draft/stale/invalid code exactly once",
    async () => {
      const draft = await prepareGuidedRequest(draftScript());
      assert.equal(
        countPreflightCode(
          draft.preflight.warnings,
          "VISUAL_PACING_DRAFT_NOT_APPLIED",
        ),
        1,
      );
      assert.equal(draft.preflight.supported, true);
      assert.notEqual(draft.preflight.renderer, "blocked");

      let staleScript = appliedScript();
      staleScript = {
        ...staleScript,
        scenes: staleScript.scenes.map((scene) =>
          scene.id === "scene-1"
            ? { ...scene, narration: "Completely different narration now." }
            : scene,
        ),
      };
      const stale = await prepareGuidedRequest(staleScript);
      assert.equal(
        countPreflightCode(stale.preflight.warnings, "VISUAL_PACING_STALE"),
        1,
      );

      const invalid = await prepareGuidedRequest({
        ...appliedScript(),
        scenes: [
          {
            ...appliedScript().scenes[0]!,
            visualBeatPlan: { version: 1, bogus: true } as never,
          },
        ],
      });
      assert.equal(
        countPreflightCode(
          invalid.preflight.warnings,
          "VISUAL_PACING_METADATA_INVALID",
        ),
        1,
      );

      const applied = await prepareGuidedRequest(appliedScript());
      assert.equal(
        applied.preflight.warnings.filter((warning) =>
          String(warning.code).startsWith("VISUAL_PACING_"),
        ).length,
        0,
      );
      const capabilityOff = await prepareGuidedRequest(draftScript(), false);
      assert.equal(
        capabilityOff.preflight.warnings.filter((warning) =>
          String(warning.code).startsWith("VISUAL_PACING_"),
        ).length,
        0,
      );
      const noPlan = await prepareGuidedRequest(seededScript());
      assert.equal(
        noPlan.preflight.warnings.filter((warning) =>
          String(warning.code).startsWith("VISUAL_PACING_"),
        ).length,
        0,
      );
    },
  );

  test("user-facing copy and wiring contracts", () => {
    assert.match(
      VISUAL_PACING_EXPORT_GUIDANCE_MESSAGES.VISUAL_PACING_DRAFT_NOT_APPLIED,
      /has not been applied/,
    );
    assert.match(
      VISUAL_PACING_EXPORT_GUIDANCE_MESSAGES.VISUAL_PACING_STALE,
      /out of date/,
    );
    assert.match(
      VISUAL_PACING_EXPORT_GUIDANCE_MESSAGES.VISUAL_PACING_METADATA_INVALID,
      /could not be read/,
    );
    const preflightUtils = readSrc(
      "src/features/export/utils/export-preflight.utils.ts",
    );
    assert.doesNotMatch(preflightUtils, /resolveVisualPacingExportGuidance/);
    assert.match(
      preflightUtils,
      /authoring guidance is not evaluated here|prepareExportRequest/,
    );
    const prepareRequest = readSrc(
      "src/features/export/domain/prepare-export-request.ts",
    );
    assert.match(prepareRequest, /resolveVisualPacingExportGuidance/);
    assert.match(prepareRequest, /visualBeatDensityEnabled/);
    const exportPanel = readSrc("src/components/ExportPanel.tsx");
    assert.match(exportPanel, /useVisualBeatDensityEnabled/);
    assert.match(exportPanel, /visualBeatDensityEnabled/);
    assert.doesNotMatch(exportPanel, /VisualPacingPanel|Suggest pacing/);
    assert.doesNotMatch(
      readSrc("src/features/export/domain/export-manifest.types.ts"),
      /visualBeatPlan|VISUAL_PACING_/,
    );
  });

  test("no music / outro dependency in guidance adapter", () => {
    const adapter = readSrc(
      "src/features/visual-beat-density/adapters/resolve-visual-pacing-export-guidance.ts",
    );
    assert.doesNotMatch(adapter, /music|outro|brand.?sting/i);
    assert.doesNotMatch(adapter, /fetch\(|process\.env/);
  });

  console.log(`\nVisual pacing export guidance: ${passed} PASS`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
