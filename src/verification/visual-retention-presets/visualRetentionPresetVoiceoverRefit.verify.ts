/**
 * Visual Retention Preset guidance after voiceover/mixed-media final prep.
 * Run: npm run test:visual-retention-presets-export
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { getShortForgeBrandSting } from "@/features/brand-sting/domain/normalize-brand-sting";
import { getSceneEngagementOverlay } from "@/features/engagement-overlays/domain/normalize-engagement-overlays";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import { prepareExportRequest } from "@/features/export/domain/prepare-export-request";
import { buildExportManifest } from "@/features/export/domain";
import type { ExportEnvironmentSnapshot } from "@/features/export/domain/export-manifest.types";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import {
  applyVisualRetentionPresetPlan,
  buildVisualRetentionPresetApplicationPlan,
  evaluateVisualRetentionPresetStaleness,
  projectStoryVisualRetentionPresetInput,
  resolveVisualRetentionPresetExportGuidance,
  VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES,
  type VisualRetentionPresetPlanningCapabilities,
} from "@/features/visual-retention-presets";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

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

function allCapabilities(
  overrides: Partial<VisualRetentionPresetPlanningCapabilities> = {},
): VisualRetentionPresetPlanningCapabilities {
  return {
    ready: true,
    visualRetentionPresetsEnabled: true,
    visualBeatDensityEnabled: true,
    keyframedVisualEffectsEnabled: true,
    engagementOverlaysEnabled: true,
    shortForgeBrandStingEnabled: true,
    mixedMediaScenesEnabled: true,
    ...overrides,
  };
}

function imageMedia(url: string): SceneMedia {
  return { type: "image", source: "upload", url };
}

function videoMedia(url: string): SceneMedia {
  return { type: "video", source: "upload", url };
}

function mixedScene(id: string, durationMs = 6_000): FootieScene {
  const split = Math.floor(durationMs * 0.4);
  return {
    id,
    start: 0,
    end: durationMs / 1000,
    duration: durationMs / 1000,
    startMs: 0,
    endMs: durationMs,
    durationMs,
    subtitle: "Fallback",
    narration: "Short scene narration for preset export refit.",
    media: imageMedia(`https://example.com/${id}-ignored.jpg`),
    visualSequence: {
      version: 1,
      items: [
        {
          id: `${id}-a`,
          media: imageMedia(`https://example.com/${id}-a.jpg`),
          startOffsetMs: 0,
          durationMs: split,
        },
        {
          id: `${id}-b`,
          media: videoMedia(`https://example.com/${id}-b.mp4`),
          startOffsetMs: split,
          durationMs: durationMs - split,
        },
      ],
    },
  };
}

function applyPreset(
  script: FootieScript,
  presetId:
    | "visual-retention-pulse-edit"
    | "visual-retention-share-ready" = "visual-retention-pulse-edit",
) {
  const capabilities = allCapabilities();
  const facts = projectStoryVisualRetentionPresetInput(script, {
    mixedMediaScenesEnabled: true,
  });
  const plan = buildVisualRetentionPresetApplicationPlan({
    facts,
    presetId,
    capabilities,
  });
  return applyVisualRetentionPresetPlan({
    script,
    plan,
    capabilities,
    generatedAtIso: "2026-08-05T12:00:00.000Z",
  });
}

function applyPulse(script: FootieScript) {
  return applyPreset(script, "visual-retention-pulse-edit");
}

function seededAppliedWithLongVoiceover(): FootieScript {
  const base: FootieScript = {
    title: "Preset voiceover refit",
    narration: "Story narration",
    totalDuration: 6,
    scenes: [mixedScene("s1", 6_000)],
    voiceoverUrl: "https://example.com/voice.mp3",
    voiceoverDurationMs: 12_000,
  };
  const applied = applyPulse(base);
  assert.equal(applied.ok, true);
  if (!applied.ok) throw new Error("apply failed");
  return applied.script;
}

const GUIDANCE_CAPS = {
  visualRetentionCapabilitiesReady: true,
  visualRetentionPresetsEnabled: true,
  visualBeatDensityEnabled: true,
  keyframedVisualEffectsEnabled: true,
  engagementOverlaysEnabled: true,
  shortForgeBrandStingEnabled: true,
  mixedMediaScenesEnabled: true,
} as const;

function countCode(
  warnings: ReadonlyArray<{ code: string }>,
  code: string,
): number {
  return warnings.filter((warning) => warning.code === code).length;
}

async function main(): Promise<void> {
  console.log("\nVisual Retention Preset voiceover refit\n");

  test("editor story remains immutable through prepareStoryForExport", () => {
    const editor = seededAppliedWithLongVoiceover();
    const beforeJson = JSON.stringify(editor);
    prepareStoryForExport(editor, { mixedMediaScenesEnabled: true });
    assert.equal(JSON.stringify(editor), beforeJson);
  });

  test("prepareStoryForExport warnings stay free of preset copy", () => {
    const editor = seededAppliedWithLongVoiceover();
    const prepared = prepareStoryForExport(editor, {
      mixedMediaScenesEnabled: true,
    });
    assert.equal(
      prepared.warnings.some((warning) =>
        /Visual Retention Preset|VISUAL_RETENTION_PRESET_/i.test(warning),
      ),
      false,
    );
  });

  test("voiceover refit with equivalent applied snapshots → no preset warning", () => {
    const editor = seededAppliedWithLongVoiceover();
    assert.equal(
      evaluateVisualRetentionPresetStaleness({
        script: editor,
        capabilities: allCapabilities(),
      }).effectiveStatus,
      "applied",
    );
    const prepared = prepareStoryForExport(editor, {
      mixedMediaScenesEnabled: true,
    });
    assert.notEqual(
      prepared.story.scenes[0]!.durationMs,
      editor.scenes[0]!.durationMs,
    );
    assert.equal(
      evaluateVisualRetentionPresetStaleness({
        script: prepared.story,
        capabilities: allCapabilities(),
      }).effectiveStatus,
      "applied",
    );
    assert.equal(
      resolveVisualRetentionPresetExportGuidance(prepared.story, GUIDANCE_CAPS)
        .length,
      0,
    );
  });

  test("applied pacing snapshot drift on final prepared copy → one stale warning", () => {
    const editor = seededAppliedWithLongVoiceover();
    const prepared = prepareStoryForExport(editor, {
      mixedMediaScenesEnabled: true,
    });
    // Honest post-refit drift: live beat-plan identity no longer matches the
    // recorded applied snapshot (e.g. authoring rewrite after duration refit).
    const scene = prepared.story.scenes[0]!;
    assert.ok(scene.visualBeatPlan);
    const driftedStory: FootieScript = {
      ...prepared.story,
      scenes: [
        {
          ...scene,
          visualBeatPlan: {
            ...scene.visualBeatPlan!,
            sourceSnapshot: {
              ...scene.visualBeatPlan!.sourceSnapshot,
              sceneDurationMs:
                (scene.visualBeatPlan!.sourceSnapshot.sceneDurationMs ?? 0) +
                1,
            },
          },
        },
      ],
    };
    assert.equal(
      evaluateVisualRetentionPresetStaleness({
        script: driftedStory,
        capabilities: allCapabilities(),
      }).effectiveStatus,
      "stale",
    );
    const guidance = resolveVisualRetentionPresetExportGuidance(
      driftedStory,
      GUIDANCE_CAPS,
    );
    assert.equal(guidance.length, 1);
    assert.equal(
      guidance[0]!.code,
      VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES.VISUAL_RETENTION_PRESET_STALE,
    );
  });

  await testAsync(
    "prepareExportRequest evaluates guidance after final prepared copy",
    async () => {
      const editor = seededAppliedWithLongVoiceover();
      const before = JSON.stringify(editor);
      const prepared = await prepareExportRequest({
        story: editor,
        throwIfBlocked: false,
        mixedMediaScenesEnabled: true,
        visualBeatDensityEnabled: true,
        keyframedVisualEffectsEnabled: true,
        engagementOverlaysEnabled: true,
        shortForgeBrandStingEnabled: true,
        visualRetentionPresetsEnabled: true,
        visualRetentionCapabilitiesReady: true,
        environment: CAPABLE_ENV,
      });
      assert.equal(JSON.stringify(editor), before);
      assert.ok(
        (prepared.exportStory.scenes[0]?.durationMs ?? 0) >
          (editor.scenes[0]?.durationMs ?? 0),
      );
      // Equivalent applied snapshots after refit → no false preset warning.
      assert.equal(
        countCode(
          prepared.preflight.warnings,
          VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES.VISUAL_RETENTION_PRESET_STALE,
        ),
        0,
      );
      assert.equal(
        prepared.preparedStory.warnings.some((warning) =>
          /Visual Retention Preset|VISUAL_RETENTION_PRESET_/i.test(warning),
        ),
        false,
      );

      const prepareSrc = readSrc(
        "src/features/export/domain/prepare-export-request.ts",
      );
      const storyPrepIndex = prepareSrc.indexOf("prepareStoryForExport(");
      const guidanceIndex = prepareSrc.indexOf(
        "resolveVisualRetentionPresetExportGuidance(",
      );
      assert.ok(storyPrepIndex >= 0);
      assert.ok(guidanceIndex > storyPrepIndex);
    },
  );

  await testAsync(
    "mixed-media final reconciliation target removal → one stale warning",
    async () => {
      const base: FootieScript = {
        title: "Preset reconcile target",
        narration: "Story",
        totalDuration: 12,
        scenes: [mixedScene("s1", 6_000), mixedScene("s2", 6_000)],
      };
      const applied = applyPulse(base);
      assert.equal(applied.ok, true);
      if (!applied.ok) return;
      const withoutS2: FootieScript = {
        ...applied.script,
        scenes: applied.script.scenes.filter((scene) => scene.id !== "s2"),
        voiceoverUrl: "https://example.com/voice.mp3",
        voiceoverDurationMs: 12_000,
      };
      const prepared = await prepareExportRequest({
        story: withoutS2,
        throwIfBlocked: false,
        mixedMediaScenesEnabled: true,
        visualBeatDensityEnabled: true,
        keyframedVisualEffectsEnabled: true,
        engagementOverlaysEnabled: true,
        shortForgeBrandStingEnabled: true,
        visualRetentionPresetsEnabled: true,
        visualRetentionCapabilitiesReady: true,
        environment: CAPABLE_ENV,
      });
      assert.equal(
        countCode(
          prepared.preflight.warnings,
          VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES.VISUAL_RETENTION_PRESET_STALE,
        ),
        1,
      );
      assert.equal(prepared.preflight.supported, true);
      assert.notEqual(prepared.preflight.renderer, "blocked");
    },
  );

  test("unrelated music/narration changes do not invent a false preset warning", () => {
    const editor = seededAppliedWithLongVoiceover();
    const withMusic: FootieScript = {
      ...editor,
      narration: "Completely rewritten story narration that is unrelated.",
      backgroundMusic: {
        enabled: true,
        source: "upload",
        fileUrl: "https://example.com/music.mp3",
        volume: 0.2,
        duckingEnabled: true,
        fadeIn: true,
        fadeOut: true,
      },
      scenes: editor.scenes.map((scene) => ({
        ...scene,
        narration: "Unrelated scene narration rewrite without touching applied snapshots.",
      })),
    };
    const prepared = prepareStoryForExport(withMusic, {
      mixedMediaScenesEnabled: true,
    });
    assert.equal(
      evaluateVisualRetentionPresetStaleness({
        script: prepared.story,
        capabilities: allCapabilities(),
      }).effectiveStatus,
      "applied",
    );
    assert.equal(
      resolveVisualRetentionPresetExportGuidance(prepared.story, GUIDANCE_CAPS)
        .length,
      0,
    );
  });

  await testAsync(
    "refit-changed beat-plan snapshot emits preset stale once via prepareExportRequest path",
    async () => {
      const editor = seededAppliedWithLongVoiceover();
      const preparedTiming = prepareStoryForExport(editor, {
        mixedMediaScenesEnabled: true,
      });
      assert.notEqual(
        preparedTiming.story.scenes[0]!.durationMs,
        editor.scenes[0]!.durationMs,
      );
      const scene = preparedTiming.story.scenes[0]!;
      assert.ok(scene.visualBeatPlan);
      // Simulate honest post-refit applied-snapshot drift on the final prepared copy.
      const drifted: FootieScript = {
        ...preparedTiming.story,
        scenes: [
          {
            ...scene,
            visualBeatPlan: {
              ...scene.visualBeatPlan!,
              sourceSnapshot: {
                ...scene.visualBeatPlan!.sourceSnapshot,
                sceneDurationMs:
                  (scene.visualBeatPlan!.sourceSnapshot.sceneDurationMs ?? 0) +
                  1,
              },
            },
          },
        ],
      };
      // Guidance on the drifted final copy — never invent catalog drift.
      const guidance = resolveVisualRetentionPresetExportGuidance(
        drifted,
        GUIDANCE_CAPS,
      );
      assert.equal(guidance.length, 1);
      assert.equal(
        guidance[0]!.code,
        VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES.VISUAL_RETENTION_PRESET_STALE,
      );
      assert.doesNotMatch(guidance[0]!.message, /catalog|recipe|fingerprint/i);
    },
  );

  test("outro duration / engagement timing remain unchanged by provenance alone", () => {
    const base: FootieScript = {
      title: "Share-ready timing",
      narration: "Story",
      totalDuration: 6,
      scenes: [mixedScene("s1", 6_000)],
      voiceoverUrl: "https://example.com/voice.mp3",
      voiceoverDurationMs: 12_000,
    };
    const applied = applyPreset(base, "visual-retention-share-ready");
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const withProv = applied.script;
    const withoutProv: FootieScript = { ...withProv };
    delete withoutProv.visualRetentionPresetProvenance;

    const preparedProv = prepareStoryForExport(withProv, {
      mixedMediaScenesEnabled: true,
    });
    const preparedBase = prepareStoryForExport(withoutProv, {
      mixedMediaScenesEnabled: true,
    });
    assert.equal(preparedProv.exportDurationMs, preparedBase.exportDurationMs);
    assert.equal(preparedProv.contentEndMs, preparedBase.contentEndMs);
    assert.deepEqual(
      getShortForgeBrandSting(preparedProv.story.visualRetentionExtensions),
      getShortForgeBrandSting(preparedBase.story.visualRetentionExtensions),
    );
    assert.deepEqual(
      getSceneEngagementOverlay(preparedProv.story, "s1"),
      getSceneEngagementOverlay(preparedBase.story, "s1"),
    );

    const manifestProv = buildExportManifest({
      story: preparedProv.story,
      prepared: preparedProv,
      mixedMediaScenesEnabled: true,
      engagementOverlaysEnabled: true,
      shortForgeBrandStingEnabled: true,
      environment: CAPABLE_ENV,
    });
    const manifestBase = buildExportManifest({
      story: preparedBase.story,
      prepared: preparedBase,
      mixedMediaScenesEnabled: true,
      engagementOverlaysEnabled: true,
      shortForgeBrandStingEnabled: true,
      environment: CAPABLE_ENV,
    });
    assert.equal(manifestProv.fingerprint, manifestBase.fingerprint);
    assert.equal(
      manifestProv.project.renderDurationMs,
      manifestBase.project.renderDurationMs,
    );
    assert.equal(
      manifestProv.project.contentDurationMs,
      manifestBase.project.contentDurationMs,
    );
    assert.deepEqual(
      "brandSting" in manifestProv ? manifestProv.brandSting : null,
      "brandSting" in manifestBase ? manifestBase.brandSting : null,
    );
  });

  test("guidance evaluation never regenerates or writes prepared copy back", () => {
    const editor = seededAppliedWithLongVoiceover();
    const before = JSON.stringify(editor);
    const prepared = prepareStoryForExport(editor, {
      mixedMediaScenesEnabled: true,
    });
    const preparedBefore = JSON.stringify(prepared.story);
    resolveVisualRetentionPresetExportGuidance(prepared.story, GUIDANCE_CAPS);
    assert.equal(JSON.stringify(editor), before);
    assert.equal(JSON.stringify(prepared.story), preparedBefore);
    const adapter = readSrc(
      "src/features/visual-retention-presets/adapters/resolve-visual-retention-preset-export-guidance.ts",
    );
    assert.doesNotMatch(
      adapter,
      /applyVisualRetentionPresetPlan|buildVisualRetentionPresetApplicationPlan|suggestVisualBeatPlan/,
    );
  });

  test("Browser and Headless media windows stay aligned after refit", () => {
    const editor = seededAppliedWithLongVoiceover();
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
    assert.doesNotMatch(
      JSON.stringify(browser),
      /visualRetentionPresetProvenance/,
    );
  });

  console.log(`\nVisual Retention Preset voiceover refit: ${passed} PASS\n`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
