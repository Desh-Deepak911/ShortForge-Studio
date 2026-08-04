/**
 * Visual Retention Preset provenance compatibility verification.
 * Preview / Browser / Headless / ExportManifest ignore story provenance.
 * Run via: npm run test:visual-retention-presets-commands
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import {
  buildExportManifest,
  EXPORT_MANIFEST_VERSION,
} from "@/features/export/domain";
import type { ExportEnvironmentSnapshot } from "@/features/export/domain/export-manifest.types";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import {
  normalizeVisualRetentionPresetProvenance,
  VISUAL_RETENTION_PRESET_PROVENANCE_VERSION,
} from "@/features/story/types/visual-retention-preset-provenance.types";
import { prepareExportRequest } from "@/features/export/domain";
import { coerceLegacyStoryFields } from "@/features/story/utils/legacy-story.utils";
import { syncFootieScript } from "@/lib/utils/voiceover";
import {
  applyVisualRetentionPresetPlan,
  buildVisualRetentionPresetApplicationPlan,
  projectStoryVisualRetentionPresetInput,
  type VisualRetentionPresetPlanningCapabilities,
} from "@/features/visual-retention-presets";

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

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function walkTsFiles(dir: string, into: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkTsFiles(full, into);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      into.push(full);
    }
  }
  return into;
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

function mixedScene(id: string): FootieScene {
  return {
    id,
    start: 0,
    end: 10,
    duration: 10,
    startMs: 0,
    endMs: 10_000,
    durationMs: 10_000,
    subtitle: "Fallback",
    narration: "Opening beat. Middle beat. Closing beat.",
    media: imageMedia("https://example.com/ignored.jpg"),
    visualSequence: {
      version: 1,
      items: [
        {
          id: `${id}-a`,
          media: imageMedia(`https://example.com/${id}-a.jpg`),
          startOffsetMs: 0,
          durationMs: 4000,
        },
        {
          id: `${id}-b`,
          media: videoMedia(`https://example.com/${id}-b.mp4`),
          startOffsetMs: 4000,
          durationMs: 6000,
        },
      ],
    },
  };
}

function baseScript(): FootieScript {
  return syncFootieScript({
    title: "Preset compat",
    narration: "Story",
    totalDuration: 10,
    scenes: [mixedScene("s1")],
    exportSettings: {
      fileName: "preset-compat",
      format: "webm",
      quality: "standard",
      resolution: "1080x1920",
    },
  });
}

function applyBalanced(script: FootieScript) {
  const capabilities = allCapabilities();
  const facts = projectStoryVisualRetentionPresetInput(script, {
    mixedMediaScenesEnabled: true,
  });
  const plan = buildVisualRetentionPresetApplicationPlan({
    facts,
    presetId: "visual-retention-balanced-clarity",
    capabilities,
  });
  return applyVisualRetentionPresetPlan({
    script,
    plan,
    capabilities,
    generatedAtIso: "2026-08-04T12:00:00.000Z",
  });
}

async function main(): Promise<void> {
  console.log("\nvisual-retention-preset-compatibility\n");

  test("fail-closed provenance normalization + transition contracts", () => {
    assert.equal(normalizeVisualRetentionPresetProvenance(null), undefined);
    assert.equal(normalizeVisualRetentionPresetProvenance({}), undefined);
    assert.equal(
      normalizeVisualRetentionPresetProvenance({
        version: VISUAL_RETENTION_PRESET_PROVENANCE_VERSION,
        catalogVersion: 1,
        presetId: "visual-retention-balanced-clarity",
        inputFingerprint: "nope",
        planFingerprint: "vrp1:abc",
        status: "applied",
        changes: [
          {
            actionKind: "suggest-pacing",
            field: "visualBeatPlan",
            target: { scope: "scene", sceneId: "s1" },
            previousValue: null,
            appliedValue: { version: 1 },
          },
        ],
      }),
      undefined,
    );
    assert.equal(
      normalizeVisualRetentionPresetProvenance({
        version: VISUAL_RETENTION_PRESET_PROVENANCE_VERSION,
        catalogVersion: 1,
        presetId: "visual-retention-balanced-clarity",
        inputFingerprint: "vrp1:input",
        planFingerprint: "vrp1:plan",
        status: "applied",
        changes: [
          {
            actionKind: "suggest-pacing",
            field: "motion",
            target: { scope: "scene", sceneId: "s1" },
            previousValue: null,
            appliedValue: null,
          },
        ],
      }),
      undefined,
    );
    // Impossible transitions normalize as absent.
    assert.equal(
      normalizeVisualRetentionPresetProvenance({
        version: 1,
        catalogVersion: 1,
        presetId: "visual-retention-share-ready",
        inputFingerprint: "vrp1:input",
        planFingerprint: "vrp1:plan",
        status: "applied",
        changes: [
          {
            actionKind: "add-engagement-overlay",
            field: "engagementOverlay",
            target: { scope: "scene", sceneId: "s1" },
            previousValue: {
              version: 1,
              id: "engagement-s1",
              kind: "like",
              startOffsetMs: 0,
              durationMs: 2500,
              position: "top-right",
            },
            appliedValue: {
              version: 1,
              id: "engagement-s1",
              kind: "like",
              startOffsetMs: 0,
              durationMs: 2500,
              position: "top-right",
            },
          },
        ],
      }),
      undefined,
    );
    assert.equal(
      normalizeVisualRetentionPresetProvenance({
        version: 1,
        catalogVersion: 1,
        presetId: "visual-retention-pulse-edit",
        inputFingerprint: "vrp1:input",
        planFingerprint: "vrp1:plan",
        status: "applied",
        changes: [
          {
            actionKind: "apply-media-look",
            field: "visualEffect",
            target: { scope: "media", sceneId: "s1", mediaItemId: "a" },
            previousValue: null,
            appliedValue: {
              version: 1,
              presetId: "vivid",
              intensity: 0.7,
              visualAdjustments: { brightness: 110 },
            },
          },
        ],
      }),
      undefined,
    );
  });

  test("legacy stories without provenance remain unchanged", () => {
    const legacy = baseScript();
    assert.equal(legacy.visualRetentionPresetProvenance, undefined);
    const coerced = coerceLegacyStoryFields(legacy);
    assert.equal(coerced.visualRetentionPresetProvenance, undefined);
  });

  test("ExportManifest / fingerprint parity with and without provenance", () => {
    assert.equal(EXPORT_MANIFEST_VERSION, 4);
    const base = baseScript();
    const applied = applyBalanced(base);
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    // Strip provenance for the without case while keeping applied ordinary settings.
    const withProvenance = applied.script;
    const withoutProvenance: FootieScript = {
      ...withProvenance,
    };
    delete withoutProvenance.visualRetentionPresetProvenance;

    const preparedWith = prepareStoryForExport(withProvenance, {
      mixedMediaScenesEnabled: true,
    });
    const preparedWithout = prepareStoryForExport(withoutProvenance, {
      mixedMediaScenesEnabled: true,
    });
    const exportSettings = {
      fileName: "preset-compat",
      format: "webm" as const,
      quality: "standard" as const,
      resolution: "1080x1920" as const,
    };
    const manifestWith = buildExportManifest({
      story: preparedWith.story,
      prepared: preparedWith,
      exportSettings,
      audioMode: "silent",
      includeBackgroundMusic: false,
      environment: CAPABLE_ENV,
    });
    const manifestWithout = buildExportManifest({
      story: preparedWithout.story,
      prepared: preparedWithout,
      exportSettings,
      audioMode: "silent",
      includeBackgroundMusic: false,
      environment: CAPABLE_ENV,
    });
    assert.equal(manifestWith.version, manifestWithout.version);
    assert.equal(manifestWith.fingerprint, manifestWithout.fingerprint);
    assert.doesNotMatch(
      JSON.stringify(manifestWith),
      /visualRetentionPresetProvenance/,
    );
    const types = readSrc("src/features/export/domain/export-manifest.types.ts");
    assert.doesNotMatch(types, /visualRetentionPresetProvenance|PRESET_/);
  });

  test("no preview/export/headless import of presets feature", () => {
    const blockedRoots = [
      "src/features/preview",
      "src/features/export",
      "src/features/headless-renderer",
      "src/features/visual-beat-density",
      "src/features/media-motion",
      "src/features/engagement-overlays",
      "src/features/brand-sting",
    ];
    for (const root of blockedRoots) {
      const abs = path.join(process.cwd(), root);
      let files: string[] = [];
      try {
        files = walkTsFiles(abs);
      } catch {
        continue;
      }
      for (const file of files) {
        const src = readFileSync(file, "utf8");
        assert.doesNotMatch(
          src,
          /from ["']@\/features\/visual-retention-presets/,
          `${file} must not import visual-retention-presets`,
        );
      }
    }
  });

  test("no renderer capability for visual-retention-presets-v1", () => {
    const capabilityFiles = [
      "src/features/export/domain/export-manifest.types.ts",
      "src/features/export/domain/build-export-manifest.ts",
      "src/features/headless-renderer",
    ];
    for (const rel of capabilityFiles) {
      const abs = path.join(process.cwd(), rel);
      let files: string[] = [];
      try {
        const stat = statSync(abs);
        files = stat.isDirectory() ? walkTsFiles(abs) : [abs];
      } catch {
        continue;
      }
      for (const file of files) {
        const src = readFileSync(file, "utf8");
        assert.doesNotMatch(
          src,
          /visual-retention-presets-v1/,
          `${file} must not require visual-retention-presets-v1`,
        );
      }
    }
  });

  test("provenance leaf has no story/command/preview/export imports", () => {
    const leaf = readSrc(
      "src/features/story/types/visual-retention-preset-provenance.types.ts",
    );
    assert.doesNotMatch(leaf, /from ["']@\/features\/story\/types["']/);
    assert.doesNotMatch(leaf, /from ["']@\/features\/visual-retention-presets/);
    assert.doesNotMatch(leaf, /from ["']react["']/);
    assert.doesNotMatch(leaf, /from ["']@\/features\/preview/);
    assert.doesNotMatch(leaf, /from ["']@\/features\/export/);
    assert.doesNotMatch(leaf, /from ["'].*commands["']/);
  });

  test("story types import only provenance leaf", () => {
    const storyTypes = readSrc("src/features/story/types/story.types.ts");
    assert.match(
      storyTypes,
      /from ["']\.\/visual-retention-preset-provenance\.types["']/,
    );
    assert.doesNotMatch(
      storyTypes,
      /from ["']@\/features\/visual-retention-presets/,
    );
  });

  test("static cycle assertions — domain does not import editor", () => {
    const domainFiles = walkTsFiles(
      path.join(
        process.cwd(),
        "src/features/visual-retention-presets/domain",
      ),
    );
    for (const file of domainFiles) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(
        src,
        /from ["']\.\.\/editor\//,
        `${file} must not import editor/`,
      );
    }
    const adapter = readSrc(
      "src/features/visual-retention-presets/adapters/project-story-visual-retention-preset-input.ts",
    );
    assert.doesNotMatch(adapter, /evaluate-visual-retention-preset-staleness/);
    assert.doesNotMatch(adapter, /visual-retention-preset\.commands/);
  });

  await testAsync("timeline / narration / music / prepareExportRequest ignore provenance", async () => {
    const base = baseScript();
    const applied = applyBalanced(base);
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const withProv = applied.script;
    const withoutProv: FootieScript = { ...withProv };
    delete withoutProv.visualRetentionPresetProvenance;

    const preparedBase = prepareStoryForExport(withoutProv, {
      mixedMediaScenesEnabled: true,
    });
    const preparedProv = prepareStoryForExport(withProv, {
      mixedMediaScenesEnabled: true,
    });
    assert.equal(
      preparedBase.story.scenes[0]!.durationMs,
      preparedProv.story.scenes[0]!.durationMs,
    );
    assert.equal(preparedBase.story.narration, preparedProv.story.narration);
    const exportSettings = {
      fileName: "preset-compat",
      format: "webm" as const,
      quality: "standard" as const,
      resolution: "1080x1920" as const,
    };
    const manifestBase = buildExportManifest({
      story: preparedBase.story,
      prepared: preparedBase,
      exportSettings,
      audioMode: "silent",
      includeBackgroundMusic: false,
      environment: CAPABLE_ENV,
    });
    const manifestProv = buildExportManifest({
      story: preparedProv.story,
      prepared: preparedProv,
      exportSettings,
      audioMode: "silent",
      includeBackgroundMusic: false,
      environment: CAPABLE_ENV,
    });
    assert.equal(manifestBase.fingerprint, manifestProv.fingerprint);
    assert.equal(manifestBase.version, manifestProv.version);
    assert.deepEqual(manifestBase.scenes, manifestProv.scenes);
    assert.doesNotMatch(
      JSON.stringify(manifestProv),
      /visualRetentionPresetProvenance/,
    );

    const requestBase = await prepareExportRequest({
      story: withoutProv,
      throwIfBlocked: false,
      mixedMediaScenesEnabled: true,
      environment: CAPABLE_ENV,
    });
    const requestProv = await prepareExportRequest({
      story: withProv,
      throwIfBlocked: false,
      mixedMediaScenesEnabled: true,
      environment: CAPABLE_ENV,
    });
    assert.equal(requestBase.manifest.fingerprint, requestProv.manifest.fingerprint);
    assert.doesNotMatch(
      JSON.stringify(requestProv.manifest),
      /visualRetentionPresetProvenance/,
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
