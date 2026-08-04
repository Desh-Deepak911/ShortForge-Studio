/**
 * Visual Retention Preset Preview/Browser/Headless render-compatibility proof.
 * Provenance alone must never become a renderer requirement.
 * Run: npm run test:visual-retention-presets-export
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import {
  buildExportManifest,
  EXPORT_MANIFEST_VERSION,
  prepareExportRequest,
  runExportCapabilityPreflight,
} from "@/features/export/domain";
import type { ExportEnvironmentSnapshot } from "@/features/export/domain/export-manifest.types";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { getShortForgeBrandSting } from "@/features/brand-sting/domain/normalize-brand-sting";
import { getSceneEngagementOverlay } from "@/features/engagement-overlays/domain/normalize-engagement-overlays";
import {
  applyVisualRetentionPresetPlan,
  buildVisualRetentionPresetApplicationPlan,
  projectStoryVisualRetentionPresetInput,
  type VisualRetentionPresetPlanningCapabilities,
} from "@/features/visual-retention-presets";
import {
  EXPORT_RENDERER_CAPABILITY_ENGAGEMENT_OVERLAYS,
  EXPORT_RENDERER_CAPABILITY_KEYFRAMED_VISUAL_EFFECTS,
  EXPORT_RENDERER_CAPABILITY_SHORTFORGE_BRAND_STING,
} from "@/features/export/domain/export-manifest.types";

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
    media: imageMedia(`https://example.com/${id}-ignored.jpg`),
    visualSequence: {
      version: 1,
      items: [
        {
          id: `${id}-a`,
          media: imageMedia(`https://example.com/${id}-a.jpg`),
          startOffsetMs: 0,
          durationMs: 4_000,
        },
        {
          id: `${id}-b`,
          media: videoMedia(`https://example.com/${id}-b.mp4`),
          startOffsetMs: 4_000,
          durationMs: 6_000,
        },
      ],
    },
  };
}

function appliedPresetScript(
  presetId:
    | "visual-retention-pulse-edit"
    | "visual-retention-share-ready" = "visual-retention-pulse-edit",
): FootieScript {
  const script: FootieScript = {
    title: "Preset render compatibility",
    narration: "Story",
    totalDuration: 10,
    scenes: [mixedScene("s1")],
  };
  const capabilities = allCapabilities();
  const facts = projectStoryVisualRetentionPresetInput(script, {
    mixedMediaScenesEnabled: true,
  });
  const plan = buildVisualRetentionPresetApplicationPlan({
    facts,
    presetId,
    capabilities,
  });
  const applied = applyVisualRetentionPresetPlan({
    script,
    plan,
    capabilities,
    generatedAtIso: "2026-08-05T12:00:00.000Z",
  });
  assert.equal(applied.ok, true);
  if (!applied.ok) throw new Error("apply failed");
  return applied.script;
}

function appliedPulseScript(): FootieScript {
  return appliedPresetScript("visual-retention-pulse-edit");
}

async function main(): Promise<void> {
  console.log("\nVisual Retention Preset render compatibility\n");

  test("manifest/fingerprint parity with and without identical provenance", () => {
    const withProv = appliedPresetScript("visual-retention-share-ready");
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
    assert.deepEqual(
      getSceneEngagementOverlay(preparedBase.story, "s1"),
      getSceneEngagementOverlay(preparedProv.story, "s1"),
    );
    assert.deepEqual(
      getShortForgeBrandSting(preparedBase.story.visualRetentionExtensions),
      getShortForgeBrandSting(preparedProv.story.visualRetentionExtensions),
    );

    const exportSettings = {
      fileName: "preset-render-compat",
      format: "webm" as const,
      quality: "standard" as const,
      resolution: "1080x1920" as const,
    };
    const manifestBase = buildExportManifest({
      story: preparedBase.story,
      prepared: preparedBase,
      exportSettings,
      audioMode: "with-voice",
      includeBackgroundMusic: false,
      mixedMediaScenesEnabled: true,
      keyframedVisualEffectsEnabled: true,
      engagementOverlaysEnabled: true,
      shortForgeBrandStingEnabled: true,
      environment: CAPABLE_ENV,
    });
    const manifestProv = buildExportManifest({
      story: preparedProv.story,
      prepared: preparedProv,
      exportSettings,
      audioMode: "with-voice",
      includeBackgroundMusic: false,
      mixedMediaScenesEnabled: true,
      keyframedVisualEffectsEnabled: true,
      engagementOverlaysEnabled: true,
      shortForgeBrandStingEnabled: true,
      environment: CAPABLE_ENV,
    });

    assert.equal(manifestBase.version, manifestProv.version);
    assert.equal(manifestBase.fingerprint, manifestProv.fingerprint);
    assert.deepEqual(manifestBase.scenes, manifestProv.scenes);
    assert.deepEqual(
      "requiredCapabilities" in manifestBase
        ? manifestBase.requiredCapabilities
        : [],
      "requiredCapabilities" in manifestProv
        ? manifestProv.requiredCapabilities
        : [],
    );
    assert.deepEqual(
      manifestBase.capabilities,
      manifestProv.capabilities,
    );
    assert.equal(
      manifestBase.project.contentDurationMs,
      manifestProv.project.contentDurationMs,
    );
    assert.equal(
      manifestBase.project.renderDurationMs,
      manifestProv.project.renderDurationMs,
    );
    assert.deepEqual(manifestBase.audio, manifestProv.audio);
    assert.deepEqual(
      "brandSting" in manifestBase ? manifestBase.brandSting : null,
      "brandSting" in manifestProv ? manifestProv.brandSting : null,
    );
    // Share-ready ordinary settings promote v5 when enhancements project.
    assert.ok(
      manifestProv.version === EXPORT_MANIFEST_VERSION ||
        manifestProv.version === 5,
    );

    const preflightBase = runExportCapabilityPreflight(manifestBase);
    const preflightProv = runExportCapabilityPreflight(manifestProv);
    assert.equal(preflightBase.renderer, preflightProv.renderer);
    assert.equal(preflightBase.supported, preflightProv.supported);

    const json = JSON.stringify(manifestProv);
    assert.doesNotMatch(
      json,
      /visualRetentionPresetProvenance|visual-retention-presets-v1|VISUAL_RETENTION_PRESET_/,
    );
    assert.doesNotMatch(json, /"presetId"\s*:\s*"visual-retention-/);
    assert.doesNotMatch(json, /inputFingerprint|planFingerprint|vrp1:/);
  });

  await testAsync(
    "prepareExportRequest keeps fingerprint parity; guidance does not alter dispatch",
    async () => {
      const withProv = appliedPulseScript();
      const withoutProv: FootieScript = { ...withProv };
      delete withoutProv.visualRetentionPresetProvenance;

      const requestBase = await prepareExportRequest({
        story: withoutProv,
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
      const requestProv = await prepareExportRequest({
        story: withProv,
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
        requestBase.manifest.fingerprint,
        requestProv.manifest.fingerprint,
      );
      assert.deepEqual(
        requestBase.manifest.scenes,
        requestProv.manifest.scenes,
      );
      assert.equal(requestBase.preflight.renderer, requestProv.preflight.renderer);
      assert.equal(requestBase.preflight.supported, true);
      assert.equal(requestProv.preflight.supported, true);
    },
  );

  test("no presets renderer requirement; underlying features keep their own caps", () => {
    const prepared = prepareStoryForExport(appliedPulseScript(), {
      mixedMediaScenesEnabled: true,
    });
    const manifest = buildExportManifest({
      story: prepared.story,
      prepared,
      mixedMediaScenesEnabled: true,
      keyframedVisualEffectsEnabled: true,
      environment: CAPABLE_ENV,
    });
    const json = JSON.stringify(manifest);
    assert.doesNotMatch(json, /visual-retention-presets-v1/);
    assert.doesNotMatch(
      readSrc("src/features/export/domain/export-manifest.types.ts"),
      /visual-retention-presets-v1/,
    );
    assert.doesNotMatch(
      readSrc("src/features/export/domain/build-export-manifest.ts"),
      /visualRetentionPresetProvenance|visual-retention-presets-v1/,
    );
    const preflight = runExportCapabilityPreflight(manifest);
    assert.equal(
      preflight.blockers.some((blocker) =>
        /visual.?retention.?preset/i.test(blocker.code + blocker.message),
      ),
      false,
    );
  });

  test("Browser and Headless media-window parity", () => {
    const prepared = prepareStoryForExport(appliedPulseScript(), {
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
      browser.scenes.map((scene) => scene.mediaTimeline),
      headless.scenes.map((scene) => scene.mediaTimeline),
    );
  });

  test("resolution availability and Browser selection remain unchanged", () => {
    const exportPanel = readSrc("src/components/ExportPanel.tsx");
    assert.match(exportPanel, /720/);
    assert.match(exportPanel, /1080/);
    assert.match(exportPanel, /exportRenderer === ["']browser["']/);
    assert.match(exportPanel, /HeadlessExportSection/);
    const headlessSection = readSrc(
      "src/features/headless-renderer/product/ui/HeadlessExportSection.tsx",
    );
    assert.match(headlessSection, /720p/);
    assert.match(headlessSection, /1080p/);
    assert.match(headlessSection, /4k/);
    assert.match(headlessSection, /visualRetentionPresetsEnabled/);
  });

  test("existing unsupported render capability remains terminal; preset never is", () => {
    const prepared = prepareStoryForExport(appliedPulseScript(), {
      mixedMediaScenesEnabled: true,
    });
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
    assert.equal(
      preflight.blockers.some((blocker) =>
        /VISUAL_RETENTION_PRESET|visual-retention-presets/i.test(blocker.code),
      ),
      false,
    );
  });

  await testAsync(
    "underlying renderer capabilities stay authoritative; presets never negotiate",
    async () => {
      const withProv = appliedPresetScript("visual-retention-share-ready");
      const prepared = await prepareExportRequest({
        story: withProv,
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
      const required =
        "requiredCapabilities" in prepared.manifest
          ? prepared.manifest.requiredCapabilities
          : [];
      assert.equal(
        required.includes("visual-retention-presets-v1" as never),
        false,
      );
      // Ordinary applied features may still require their own capability IDs.
      for (const capability of required) {
        assert.ok(
          (
            [
              EXPORT_RENDERER_CAPABILITY_KEYFRAMED_VISUAL_EFFECTS,
              EXPORT_RENDERER_CAPABILITY_ENGAGEMENT_OVERLAYS,
              EXPORT_RENDERER_CAPABILITY_SHORTFORGE_BRAND_STING,
            ] as readonly string[]
          ).includes(capability),
        );
      }
      assert.doesNotMatch(
        JSON.stringify(prepared.manifest.capabilities),
        /visual-retention-presets-v1/,
      );
      assert.equal(
        prepared.preflight.blockers.some((blocker) =>
          /visual-retention-presets/i.test(blocker.code + blocker.message),
        ),
        false,
      );

      // Stale preset guidance must not flip supported ↔ unsupported.
      const staleScript: FootieScript = {
        ...withProv,
        scenes: withProv.scenes.map((scene) => {
          if (!scene.visualSequence) return scene;
          return {
            ...scene,
            visualSequence: {
              version: 1 as const,
              items: scene.visualSequence.items.map((item, index) =>
                index === 0
                  ? {
                      ...item,
                      media: {
                        ...item.media,
                        visualEffect: {
                          version: 1 as const,
                          presetId: "monochrome" as const,
                          intensity: 0.15,
                        },
                      },
                    }
                  : item,
              ),
            },
          };
        }),
      };
      const stalePrepared = await prepareExportRequest({
        story: staleScript,
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
        stalePrepared.preflight.warnings.filter(
          (warning) => warning.code === "VISUAL_RETENTION_PRESET_STALE",
        ).length,
        1,
      );
      // Ordinary look change may alter fingerprint; preset stale must not flip
      // renderer negotiation or invent presets-v1.
      assert.equal(stalePrepared.preflight.supported, prepared.preflight.supported);
      assert.equal(stalePrepared.preflight.renderer, prepared.preflight.renderer);
      assert.equal(
        (
          "requiredCapabilities" in stalePrepared.manifest
            ? stalePrepared.manifest.requiredCapabilities
            : []
        ).includes("visual-retention-presets-v1" as never),
        false,
      );
      assert.doesNotMatch(
        JSON.stringify(stalePrepared.manifest),
        /visual-retention-presets-v1/,
      );
    },
  );

  test("preview/export/headless static import isolation (adapter-only prepare path)", () => {
    const blockedRoots = [
      "src/features/preview",
      "src/features/headless-renderer",
    ];
    for (const root of blockedRoots) {
      const abs = path.join(process.cwd(), root);
      for (const file of walkTsFiles(abs)) {
        const src = readFileSync(file, "utf8");
        assert.doesNotMatch(
          src,
          /from ["']@\/features\/visual-retention-presets/,
          `${file} must not import visual-retention-presets`,
        );
      }
    }

    const prepareRel = "src/features/export/domain/prepare-export-request.ts";
    const prepareSrc = readSrc(prepareRel);
    assert.match(
      prepareSrc,
      /from ["']@\/features\/visual-retention-presets\/adapters\/resolve-visual-retention-preset-export-guidance["']/,
    );
    assert.doesNotMatch(
      prepareSrc,
      /from ["']@\/features\/visual-retention-presets["']/,
    );

    for (const file of walkTsFiles(
      path.join(process.cwd(), "src/features/export"),
    )) {
      const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
      if (rel === prepareRel) continue;
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(
        src,
        /from ["']@\/features\/visual-retention-presets/,
        `${file} must not import visual-retention-presets`,
      );
    }

    assert.doesNotMatch(
      readSrc("src/features/export/services/video-render.service.ts"),
      /VISUAL_RETENTION_PRESET_|visualRetentionPresetProvenance/,
    );
    assert.match(
      readSrc(
        "src/features/visual-retention-presets/adapters/resolve-visual-retention-preset-export-guidance.ts",
      ),
      /never a render authority/i,
    );
  });

  test("visual-retention-presets-v1 absent from Browser/Headless capability surfaces", () => {
    for (const rel of [
      "src/features/export/domain/export-manifest.types.ts",
      "src/features/export/domain/build-export-manifest.ts",
    ]) {
      assert.doesNotMatch(readSrc(rel), /visual-retention-presets-v1/);
    }
    for (const file of walkTsFiles(
      path.join(process.cwd(), "src/features/headless-renderer"),
    )) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(
        src,
        /visual-retention-presets-v1/,
        `${file} must not require visual-retention-presets-v1`,
      );
    }
  });

  console.log(
    `\nVisual Retention Preset render compatibility: ${passed} PASS\n`,
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
