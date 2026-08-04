/**
 * Visual Retention Preset export guidance verification.
 * Run: npm run test:visual-retention-presets-export
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { appendMixedMediaSequenceItem } from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import {
  applyVisualBeatPlan,
  suggestVisualBeatPlan,
} from "@/features/visual-beat-density";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import { prepareExportRequest } from "@/features/export/domain/prepare-export-request";
import { EXPORT_WARNING_MESSAGES } from "@/features/export/domain/export-preflight.constants";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { coerceLegacyStoryFields } from "@/features/story/utils/legacy-story.utils";
import {
  applyVisualRetentionPresetPlan,
  buildVisualRetentionPresetApplicationPlan,
  evaluateVisualRetentionPresetStaleness,
  projectStoryVisualRetentionPresetInput,
  resolveVisualRetentionPresetExportGuidance,
  VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES,
  VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_MESSAGES,
  type VisualRetentionPresetPlanningCapabilities,
} from "@/features/visual-retention-presets";

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

function mixedScene(id: string, durationMs = 10_000): FootieScene {
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
    narration: "Opening beat. Middle beat. Closing beat.",
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

function scriptOf(...scenes: FootieScene[]): FootieScript {
  return {
    title: "Preset export guidance",
    narration: "Story",
    totalDuration: scenes.reduce(
      (sum, scene) => sum + (scene.durationMs ?? 0) / 1000,
      0,
    ),
    scenes,
  };
}

function applyPulse(script: FootieScript) {
  const capabilities = allCapabilities();
  const facts = projectStoryVisualRetentionPresetInput(script, {
    mixedMediaScenesEnabled: true,
  });
  const plan = buildVisualRetentionPresetApplicationPlan({
    facts,
    presetId: "visual-retention-pulse-edit",
    capabilities,
  });
  return applyVisualRetentionPresetPlan({
    script,
    plan,
    capabilities,
    generatedAtIso: "2026-08-05T12:00:00.000Z",
  });
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

async function prepareGuidedRequest(
  story: FootieScript,
  options: {
    readonly presetsEnabled?: boolean;
    readonly ready?: boolean;
    readonly keyframedVisualEffectsEnabled?: boolean;
  } = {},
) {
  return prepareExportRequest({
    story,
    throwIfBlocked: false,
    mixedMediaScenesEnabled: true,
    visualBeatDensityEnabled: true,
    keyframedVisualEffectsEnabled: options.keyframedVisualEffectsEnabled !== false,
    engagementOverlaysEnabled: true,
    shortForgeBrandStingEnabled: true,
    visualRetentionPresetsEnabled: options.presetsEnabled !== false,
    visualRetentionCapabilitiesReady: options.ready !== false,
    environment: CAPABLE_ENV,
  });
}

function withManualLookOverride(script: FootieScript): FootieScript {
  return {
    ...script,
    scenes: script.scenes.map((scene) => {
      if (!scene.visualSequence) return scene;
      const items = scene.visualSequence.items.map((item, index) => {
        if (index !== 0) return item;
        return {
          ...item,
          media: {
            ...item.media,
            visualEffect: {
              version: 1 as const,
              presetId: "monochrome" as const,
              intensity: 0.2,
            },
          },
        };
      });
      return {
        ...scene,
        visualSequence: { version: 1 as const, items },
      };
    }),
  };
}

async function main(): Promise<void> {
  console.log("\nVisual Retention Preset export guidance\n");

  test("absent provenance → no warning", () => {
    const prepared = prepareStoryForExport(scriptOf(mixedScene("s1")), {
      mixedMediaScenesEnabled: true,
    });
    const guidance = resolveVisualRetentionPresetExportGuidance(
      prepared.story,
      GUIDANCE_CAPS,
    );
    assert.equal(guidance.length, 0);
  });

  test("valid current applied → no warning", () => {
    const applied = applyPulse(scriptOf(mixedScene("s1")));
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const prepared = prepareStoryForExport(applied.script, {
      mixedMediaScenesEnabled: true,
    });
    const projection = evaluateVisualRetentionPresetStaleness({
      script: prepared.story,
      capabilities: allCapabilities(),
    });
    assert.equal(projection.effectiveStatus, "applied");
    assert.equal(
      resolveVisualRetentionPresetExportGuidance(prepared.story, GUIDANCE_CAPS)
        .length,
      0,
    );
  });

  test("stale manual override → exactly one warning with exact copy", () => {
    const applied = applyPulse(scriptOf(mixedScene("s1"), mixedScene("s2")));
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const stale = withManualLookOverride(applied.script);
    const prepared = prepareStoryForExport(stale, {
      mixedMediaScenesEnabled: true,
    });
    const guidance = resolveVisualRetentionPresetExportGuidance(
      prepared.story,
      GUIDANCE_CAPS,
    );
    assert.equal(guidance.length, 1);
    assert.equal(
      guidance[0]!.code,
      VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES.VISUAL_RETENTION_PRESET_STALE,
    );
    assert.equal(
      guidance[0]!.message,
      VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_MESSAGES.VISUAL_RETENTION_PRESET_STALE,
    );
    assert.equal(
      guidance[0]!.message,
      "Visual Retention Preset settings have changed since Apply. Export will use your current settings.",
    );
    assert.doesNotMatch(guidance[0]!.message, /reapply|repair|regenerat/i);
  });

  test("target missing → one warning", () => {
    const applied = applyPulse(scriptOf(mixedScene("s1"), mixedScene("s2")));
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const withoutS2: FootieScript = {
      ...applied.script,
      scenes: applied.script.scenes.filter((scene) => scene.id !== "s2"),
    };
    const prepared = prepareStoryForExport(withoutS2, {
      mixedMediaScenesEnabled: true,
    });
    const guidance = resolveVisualRetentionPresetExportGuidance(
      prepared.story,
      GUIDANCE_CAPS,
    );
    assert.equal(guidance.length, 1);
    assert.equal(
      guidance[0]!.code,
      VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES.VISUAL_RETENTION_PRESET_STALE,
    );
  });

  test("catalog/recipe identity change → one warning where evaluator proves stale", () => {
    const applied = applyPulse(scriptOf(mixedScene("s1")));
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    // Optional rebuilt plan identity is how the evaluator proves same-input
    // catalog/recipe drift. Export guidance observes the resulting stale status.
    const projection = evaluateVisualRetentionPresetStaleness({
      script: applied.script,
      capabilities: allCapabilities(),
      rebuiltInputFingerprint: applied.provenance.inputFingerprint,
      rebuiltPlanFingerprint: "vrp1:catalog-drift-plan",
    });
    assert.equal(projection.effectiveStatus, "stale");
    // Without rebuilt fingerprints, matching live snapshots stay applied — export
    // must not invent catalog drift it cannot observe on the prepared story alone.
    assert.equal(
      resolveVisualRetentionPresetExportGuidance(
        applied.script,
        GUIDANCE_CAPS,
      ).length,
      0,
    );
    // When live settings also diverge (honest prepared-story stale), emit once.
    const liveStale = withManualLookOverride(applied.script);
    assert.equal(
      resolveVisualRetentionPresetExportGuidance(liveStale, GUIDANCE_CAPS)
        .length,
      1,
    );
  });

  await testAsync(
    "underlying capability off on applied provenance → one stale warning",
    async () => {
      const applied = applyPulse(scriptOf(mixedScene("s1")));
      assert.equal(applied.ok, true);
      if (!applied.ok) return;
      const prepared = await prepareGuidedRequest(applied.script, {
        keyframedVisualEffectsEnabled: false,
      });
      assert.equal(
        countCode(
          prepared.preflight.warnings,
          VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES.VISUAL_RETENTION_PRESET_STALE,
        ),
        1,
      );
      assert.equal(prepared.preflight.supported, true);
    },
  );

  test("presets capability off / not ready → no warning", () => {
    const applied = applyPulse(scriptOf(mixedScene("s1")));
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const stale = withManualLookOverride(applied.script);
    assert.equal(
      resolveVisualRetentionPresetExportGuidance(stale, {
        ...GUIDANCE_CAPS,
        visualRetentionPresetsEnabled: false,
      }).length,
      0,
    );
    assert.equal(
      resolveVisualRetentionPresetExportGuidance(stale, {
        ...GUIDANCE_CAPS,
        visualRetentionCapabilitiesReady: false,
      }).length,
      0,
    );
  });

  test("malformed provenance normalized away → no warning", () => {
    const malformed = coerceLegacyStoryFields({
      ...scriptOf(mixedScene("s1")),
      visualRetentionPresetProvenance: { version: 99 } as never,
    });
    assert.equal(malformed.visualRetentionPresetProvenance, undefined);
    const prepared = prepareStoryForExport(malformed, {
      mixedMediaScenesEnabled: true,
    });
    assert.equal(prepared.story.visualRetentionPresetProvenance, undefined);
    assert.equal(
      resolveVisualRetentionPresetExportGuidance(prepared.story, GUIDANCE_CAPS)
        .length,
      0,
    );
  });

  await testAsync(
    "prepareExportRequest dedupes stale exactly once and stays non-terminal",
    async () => {
      const applied = applyPulse(scriptOf(mixedScene("s1"), mixedScene("s2")));
      assert.equal(applied.ok, true);
      if (!applied.ok) return;
      const stale = withManualLookOverride(applied.script);
      const prepared = await prepareGuidedRequest(stale);
      assert.equal(
        countCode(
          prepared.preflight.warnings,
          VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES.VISUAL_RETENTION_PRESET_STALE,
        ),
        1,
      );
      assert.equal(prepared.preflight.supported, true);
      assert.notEqual(prepared.preflight.renderer, "blocked");
      assert.equal(
        prepared.preflight.blockers.some((blocker) =>
          String(blocker.code).includes("VISUAL_RETENTION_PRESET"),
        ),
        false,
      );
      assert.equal(
        prepared.preparedStory.warnings.some((warning) =>
          /Visual Retention Preset|VISUAL_RETENTION_PRESET_/i.test(warning),
        ),
        false,
      );

      const appliedOk = await prepareGuidedRequest(applied.script);
      assert.equal(
        countCode(
          appliedOk.preflight.warnings,
          VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES.VISUAL_RETENTION_PRESET_STALE,
        ),
        0,
      );

      const capabilityOff = await prepareGuidedRequest(stale, {
        presetsEnabled: false,
      });
      assert.equal(
        countCode(
          capabilityOff.preflight.warnings,
          VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES.VISUAL_RETENTION_PRESET_STALE,
        ),
        0,
      );

      const notReady = await prepareGuidedRequest(stale, { ready: false });
      assert.equal(
        countCode(
          notReady.preflight.warnings,
          VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES.VISUAL_RETENTION_PRESET_STALE,
        ),
        0,
      );
    },
  );

  await testAsync(
    "Browser and Headless receive identical guidance for the same prepared story",
    async () => {
      const applied = applyPulse(scriptOf(mixedScene("s1")));
      assert.equal(applied.ok, true);
      if (!applied.ok) return;
      const stale = withManualLookOverride(applied.script);
      const browser = await prepareExportRequest({
        story: stale,
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
      const headless = await prepareExportRequest({
        story: stale,
        throwIfBlocked: false,
        mixedMediaScenesEnabled: true,
        visualBeatDensityEnabled: true,
        keyframedVisualEffectsEnabled: true,
        engagementOverlaysEnabled: true,
        shortForgeBrandStingEnabled: true,
        visualRetentionPresetsEnabled: true,
        visualRetentionCapabilitiesReady: true,
        environment: { ...CAPABLE_ENV, serverRendererAvailable: true },
      });
      assert.deepEqual(
        browser.preflight.warnings.filter((warning) =>
          String(warning.code).startsWith("VISUAL_RETENTION_PRESET_"),
        ),
        headless.preflight.warnings.filter((warning) =>
          String(warning.code).startsWith("VISUAL_RETENTION_PRESET_"),
        ),
      );
      // Environment bits may differ; media windows and preset guidance must not.
      assert.deepEqual(
        browser.manifest.scenes.map((scene) => scene.mediaTimeline),
        headless.manifest.scenes.map((scene) => scene.mediaTimeline),
      );
    },
  );

  test("exactly-once production warning authority", () => {
    const code = "VISUAL_RETENTION_PRESET_STALE";
    const prepareRequest = readSrc(
      "src/features/export/domain/prepare-export-request.ts",
    );
    assert.equal(
      (
        prepareRequest.match(
          /resolveVisualRetentionPresetExportGuidance\(/g,
        ) ?? []
      ).length,
      1,
    );
    assert.match(prepareRequest, /seenPresetCodes/);
    assert.match(
      prepareRequest,
      /EXPORT_WARNING_MESSAGES\[code\].*item\.message|item\.message.*EXPORT_WARNING_MESSAGES/,
    );

    const productionRoots = [
      "src/features/export",
      "src/features/preview",
      "src/features/headless-renderer",
      "src/components",
    ] as const;
    const allowedCodeFiles = new Set([
      "src/features/export/domain/prepare-export-request.ts",
      "src/features/export/domain/export-capability.types.ts",
      "src/features/export/domain/export-preflight.constants.ts",
      "src/features/visual-retention-presets/adapters/resolve-visual-retention-preset-export-guidance.ts",
    ]);
    for (const root of productionRoots) {
      for (const file of walkTsFiles(path.join(process.cwd(), root))) {
        const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
        const src = readFileSync(file, "utf8");
        if (!src.includes(code)) continue;
        assert.ok(
          allowedCodeFiles.has(rel),
          `${rel} must not own ${code}`,
        );
      }
    }

    // Adapter may resolve guidance; only prepare-export-request appends it.
    assert.doesNotMatch(
      readSrc("src/features/export/utils/export-preflight.utils.ts"),
      /VISUAL_RETENTION_PRESET_|resolveVisualRetentionPresetExportGuidance/,
    );
    assert.doesNotMatch(
      readSrc("src/features/export/domain/build-export-manifest.ts"),
      /VISUAL_RETENTION_PRESET_STALE|resolveVisualRetentionPresetExportGuidance/,
    );
    assert.doesNotMatch(
      readSrc("src/features/export/services/video-render.service.ts"),
      /VISUAL_RETENTION_PRESET_STALE|resolveVisualRetentionPresetExportGuidance/,
    );
    assert.doesNotMatch(
      readSrc("src/features/export/utils/export-quality.utils.ts"),
      /VISUAL_RETENTION_PRESET_STALE|resolveVisualRetentionPresetExportGuidance/,
    );
    for (const rel of [
      "src/components/ExportPanel.tsx",
      "src/features/headless-renderer/product/ui/HeadlessExportSection.tsx",
    ]) {
      const src = readSrc(rel);
      assert.doesNotMatch(src, /VISUAL_RETENTION_PRESET_STALE/);
      assert.doesNotMatch(
        src,
        /Visual Retention Preset settings have changed since Apply/,
      );
      assert.doesNotMatch(src, /resolveVisualRetentionPresetExportGuidance/);
    }
  });

  test("structured warning contract and frozen deterministic resolver", () => {
    const applied = applyPulse(scriptOf(mixedScene("s1"), mixedScene("s2")));
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const stale = withManualLookOverride(applied.script);
    const first = resolveVisualRetentionPresetExportGuidance(stale, GUIDANCE_CAPS);
    const second = resolveVisualRetentionPresetExportGuidance(stale, GUIDANCE_CAPS);
    assert.equal(first.length, 1);
    assert.deepEqual(first, second);
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first[0]));
    assert.equal(
      first[0]!.code,
      VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES.VISUAL_RETENTION_PRESET_STALE,
    );
    assert.equal(
      first[0]!.message,
      "Visual Retention Preset settings have changed since Apply. Export will use your current settings.",
    );
    assert.equal(
      EXPORT_WARNING_MESSAGES.VISUAL_RETENTION_PRESET_STALE,
      first[0]!.message,
    );
    assert.doesNotMatch(first[0]!.message, /PRESET_|visual-retention-presets-v1|vrp1:/);
    assert.doesNotMatch(first[0]!.message, /reapply|repair|regenerat|terminal/i);

    const before = JSON.stringify(stale);
    resolveVisualRetentionPresetExportGuidance(stale, GUIDANCE_CAPS);
    assert.equal(JSON.stringify(stale), before);

    const adapter = readSrc(
      "src/features/visual-retention-presets/adapters/resolve-visual-retention-preset-export-guidance.ts",
    );
    assert.doesNotMatch(adapter, /from ["']react["']/);
    assert.doesNotMatch(
      adapter,
      /use[A-Z]|fetch\(|process\.env|localStorage|window\.|document\.|canvas|HTMLCanvas/,
    );
    assert.doesNotMatch(adapter, /from ["']@\/features\/preview/);
    assert.doesNotMatch(adapter, /from ["']@\/features\/export/);
    assert.doesNotMatch(adapter, /from ["']@\/features\/headless-renderer/);
    assert.doesNotMatch(adapter, /visual-retention-preset\.commands/);
    assert.doesNotMatch(
      adapter,
      /VisualRetentionCapabilitiesContext|MixedMediaScenesCapabilityContext/,
    );
    assert.match(adapter, /evaluateVisualRetentionPresetStaleness/);
    assert.match(adapter, /never a render authority/i);
  });

  test("final prepared-copy source order is authoritative", () => {
    const storyPrep = readSrc(
      "src/features/export/utils/export-preflight.utils.ts",
    );
    assert.match(storyPrep, /Order \(mixed-media scenes\):/);
    assert.match(storyPrep, /1\.\s*sync/);
    assert.match(storyPrep, /2\.\s*MasterTimeline \+ voiceover scene-duration refit/);
    assert.match(
      storyPrep,
      /3\.\s*visualSequence ↔ mediaTimeline reconcile against \*\*final\*\* scene durations/,
    );
    assert.match(storyPrep, /4\.\s*media validation on the repaired export copy/);
    assert.match(storyPrep, /5\.\s*final sync/);
    assert.doesNotMatch(storyPrep, /VISUAL_RETENTION_PRESET_|resolveVisualRetentionPreset/);

    const prepareRequest = readSrc(
      "src/features/export/domain/prepare-export-request.ts",
    );
    const voiceoverIdx = prepareRequest.indexOf(
      "prepareStoryVoiceoverForExport(",
    );
    const storyPrepIdx = prepareRequest.indexOf("prepareStoryForExport(");
    const manifestIdx = prepareRequest.indexOf("buildExportManifest(");
    const guidanceIdx = prepareRequest.indexOf(
      "resolveVisualRetentionPresetExportGuidance(",
    );
    assert.ok(voiceoverIdx >= 0 && storyPrepIdx > voiceoverIdx);
    assert.ok(manifestIdx > storyPrepIdx);
    assert.ok(guidanceIdx > manifestIdx);
    assert.match(
      prepareRequest,
      /sync → voiceover\/master-timeline refit →[\s\S]*mixed-media reconcile → media validation → final sync/,
    );
  });

  await testAsync("capability matrix is explicit and fail-closed", async () => {
    const applied = applyPulse(scriptOf(mixedScene("s1")));
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const stale = withManualLookOverride(applied.script);

    const readinessOff = await prepareGuidedRequest(stale, { ready: false });
    assert.equal(
      countCode(readinessOff.preflight.warnings, "VISUAL_RETENTION_PRESET_STALE"),
      0,
    );
    const presetsOff = await prepareGuidedRequest(stale, {
      presetsEnabled: false,
    });
    assert.equal(
      countCode(presetsOff.preflight.warnings, "VISUAL_RETENTION_PRESET_STALE"),
      0,
    );
    const current = await prepareGuidedRequest(applied.script);
    assert.equal(
      countCode(current.preflight.warnings, "VISUAL_RETENTION_PRESET_STALE"),
      0,
    );
    const staleOn = await prepareGuidedRequest(stale);
    assert.equal(
      countCode(staleOn.preflight.warnings, "VISUAL_RETENTION_PRESET_STALE"),
      1,
    );
    const malformed = await prepareGuidedRequest(
      coerceLegacyStoryFields({
        ...scriptOf(mixedScene("s1")),
        visualRetentionPresetProvenance: { version: 99 } as never,
      }),
    );
    assert.equal(
      countCode(malformed.preflight.warnings, "VISUAL_RETENTION_PRESET_STALE"),
      0,
    );
    const underlyingOff = await prepareGuidedRequest(applied.script, {
      keyframedVisualEffectsEnabled: false,
    });
    assert.equal(
      evaluateVisualRetentionPresetStaleness({
        script: applied.script,
        capabilities: allCapabilities({
          keyframedVisualEffectsEnabled: false,
        }),
      }).effectiveStatus,
      "stale",
    );
    assert.equal(
      countCode(
        underlyingOff.preflight.warnings,
        "VISUAL_RETENTION_PRESET_STALE",
      ),
      1,
    );

    const prepareSrc = readSrc(
      "src/features/export/domain/prepare-export-request.ts",
    );
    assert.match(
      prepareSrc,
      /visualRetentionPresetsEnabled === true \|\|\s*input\.options\?\.visualRetentionPresetsEnabled === true/,
    );
    assert.doesNotMatch(
      prepareSrc,
      /visualRetentionPresetsEnabled\s*=\s*visualBeatDensityEnabled|phase.*12F.*presets/i,
    );
  });

  test("Browser/Headless UI shows shared preflight copy once", () => {
    const exportPanel = readSrc("src/components/ExportPanel.tsx");
    assert.match(exportPanel, /capabilityWarningMessages\.map/);
    assert.match(
      exportPanel,
      /Shared structured preflight guidance for Browser and Headless/,
    );
    // Warnings are rendered once in Download section, not inside Headless.
    assert.equal(
      (exportPanel.match(/capabilityWarningMessages\.map/g) ?? []).length,
      1,
    );
    assert.match(exportPanel, /exportRenderer === ["']browser["']/);
    assert.match(exportPanel, /HeadlessExportSection/);
    assert.doesNotMatch(exportPanel, /VisualRetentionPresetsPanel/);
    assert.doesNotMatch(
      exportPanel,
      /Visual Retention Preset settings have changed since Apply/,
    );

    const headless = readSrc(
      "src/features/headless-renderer/product/ui/HeadlessExportSection.tsx",
    );
    assert.match(headless, /visualRetentionPresetsEnabled/);
    assert.match(headless, /visualRetentionCapabilitiesReady/);
    assert.doesNotMatch(
      headless,
      /Visual Retention Preset settings have changed since Apply/,
    );
    assert.doesNotMatch(headless, /VISUAL_RETENTION_PRESET_STALE/);
    assert.doesNotMatch(headless, /capabilityWarningMessages/);
    // Headless must not auto-start browser export or mutate renderer selection.
    assert.doesNotMatch(headless, /exportFootieShort\(/);
    assert.doesNotMatch(headless, /setExportRenderer\(/);
  });

  await testAsync(
    "pacing + source-quality + preset warnings coexist once each",
    async () => {
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
          {
            type: "image",
            source: "upload",
            url: `https://example.com/coexist-${i}.jpg`,
            mimeType: "image/jpeg",
            width: 640,
            height: 360,
            fitMode: "cover",
            transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          },
          {
            mixedMediaScenesEnabled: true,
            generateId: () => `c${i}`,
          },
        ).scene;
      }
      let story: FootieScript = {
        title: "Coexistence guidance",
        narration: "Story",
        totalDuration: 9,
        scenes: [scene],
      };
      const suggested = suggestVisualBeatPlan(story, {
        sceneId: "scene-1",
        density: "balanced",
        generatedAtIso: "2026-08-05T12:00:00.000Z",
        visualBeatDensityEnabled: true,
      });
      assert.equal(suggested.ok, true);
      if (!suggested.ok) return;
      const paced = applyVisualBeatPlan(suggested.script, {
        sceneId: "scene-1",
        selectedDensity: "balanced",
        visualBeatDensityEnabled: true,
        mixedMediaScenesEnabled: true,
      });
      assert.equal(paced.ok, true);
      if (!paced.ok) return;
      const presetApplied = applyPulse(paced.script);
      assert.equal(presetApplied.ok, true);
      if (!presetApplied.ok) return;

      // Narration drift → pacing stale; look override → preset stale; low-res → SQ.
      story = {
        ...withManualLookOverride(presetApplied.script),
        scenes: withManualLookOverride(presetApplied.script).scenes.map(
          (entry) =>
            entry.id === "scene-1"
              ? {
                  ...entry,
                  narration: "Completely different narration for pacing drift.",
                }
              : entry,
        ),
      };

      const prepared = await prepareExportRequest({
        story,
        throwIfBlocked: false,
        mixedMediaScenesEnabled: true,
        visualBeatDensityEnabled: true,
        sourceQualityIntelligenceEnabled: true,
        sourceQualityExportTarget: "1080p",
        keyframedVisualEffectsEnabled: true,
        engagementOverlaysEnabled: true,
        shortForgeBrandStingEnabled: true,
        visualRetentionPresetsEnabled: true,
        visualRetentionCapabilitiesReady: true,
        environment: CAPABLE_ENV,
      });

      assert.equal(countCode(prepared.preflight.warnings, "VISUAL_PACING_STALE"), 1);
      assert.equal(
        countCode(
          prepared.preflight.warnings,
          "VISUAL_RETENTION_PRESET_STALE",
        ),
        1,
      );
      assert.ok(
        prepared.preflight.warnings.some((warning) =>
          String(warning.code).startsWith("SOURCE_QUALITY_"),
        ),
      );
      for (const code of [
        "VISUAL_PACING_STALE",
        "VISUAL_RETENTION_PRESET_STALE",
      ] as const) {
        assert.equal(countCode(prepared.preflight.warnings, code), 1);
      }

      const codes = prepared.preflight.warnings.map((warning) => warning.code);
      const pacingIdx = codes.indexOf("VISUAL_PACING_STALE");
      const sqIdx = codes.findIndex((code) =>
        String(code).startsWith("SOURCE_QUALITY_"),
      );
      const presetIdx = codes.indexOf("VISUAL_RETENTION_PRESET_STALE");
      assert.ok(pacingIdx >= 0 && sqIdx > pacingIdx && presetIdx > sqIdx);

      assert.equal(prepared.preflight.supported, true);
      assert.notEqual(prepared.preflight.renderer, "blocked");
      assert.equal(
        prepared.preflight.blockers.some((blocker) =>
          /VISUAL_PACING_|SOURCE_QUALITY_|VISUAL_RETENTION_PRESET_/.test(
            blocker.code,
          ),
        ),
        false,
      );
    },
  );

  await testAsync(
    "multi-reason stale / recalculated preflight still emits once",
    async () => {
      const applied = applyPulse(
        scriptOf(mixedScene("s1"), mixedScene("s2"), mixedScene("s3")),
      );
      assert.equal(applied.ok, true);
      if (!applied.ok) return;
      // Manual override + missing targets → multiple stale reasons, one warning.
      const multi: FootieScript = {
        ...withManualLookOverride(applied.script),
        scenes: withManualLookOverride(applied.script).scenes.filter(
          (scene) => scene.id !== "s3",
        ),
      };
      const projection = evaluateVisualRetentionPresetStaleness({
        script: multi,
        capabilities: allCapabilities(),
      });
      assert.equal(projection.effectiveStatus, "stale");
      assert.ok(projection.reasons.length >= 2);

      const first = await prepareGuidedRequest(multi);
      const second = await prepareGuidedRequest(multi);
      assert.equal(
        countCode(first.preflight.warnings, "VISUAL_RETENTION_PRESET_STALE"),
        1,
      );
      assert.equal(
        countCode(second.preflight.warnings, "VISUAL_RETENTION_PRESET_STALE"),
        1,
      );
      assert.deepEqual(
        first.preflight.warnings.filter(
          (warning) => warning.code === "VISUAL_RETENTION_PRESET_STALE",
        ),
        second.preflight.warnings.filter(
          (warning) => warning.code === "VISUAL_RETENTION_PRESET_STALE",
        ),
      );
      assert.equal(
        first.preflight.warnings.find(
          (warning) => warning.code === "VISUAL_RETENTION_PRESET_STALE",
        )?.message,
        EXPORT_WARNING_MESSAGES.VISUAL_RETENTION_PRESET_STALE,
      );
    },
  );

  test("authority / wiring / package contracts", () => {
    const exportPanel = readSrc("src/components/ExportPanel.tsx");
    assert.match(exportPanel, /useVisualRetentionPresetsEnabled/);
    assert.match(exportPanel, /visualRetentionPresetsEnabled/);
    const headless = readSrc(
      "src/features/headless-renderer/product/ui/HeadlessExportSection.tsx",
    );
    assert.match(headless, /visualRetentionPresetsEnabled/);
    const pkg = readSrc("package.json");
    assert.match(pkg, /"test:visual-retention-presets-export"/);
    assert.match(
      pkg,
      /visualRetentionPresetExportGuidance\.verify\.ts/,
    );
    assert.match(
      pkg,
      /visualRetentionPresetVoiceoverRefit\.verify\.ts/,
    );
    assert.match(
      pkg,
      /visualRetentionPresetRenderCompatibility\.verify\.ts/,
    );
  });

  console.log(`\nVisual Retention Preset export guidance: ${passed} PASS\n`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
