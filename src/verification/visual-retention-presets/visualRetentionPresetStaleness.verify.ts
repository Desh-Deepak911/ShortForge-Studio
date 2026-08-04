/**
 * Visual Retention Preset Undo / staleness projection verification.
 * Run via: npm run test:visual-retention-presets-commands
 */

import assert from "node:assert/strict";

import { getShortForgeBrandSting } from "@/features/brand-sting/domain/normalize-brand-sting";
import { getSceneEngagementOverlay } from "@/features/engagement-overlays/domain/normalize-engagement-overlays";
import { normalizeSceneMediaVisualEffect } from "@/features/media-motion/domain/resolve-media-visual-effect";
import { resolveSceneMediaMotionFromMedia } from "@/features/media-motion/media-motion.normalize";
import type {
  FootieScene,
  FootieScript,
  SceneMedia,
} from "@/features/story/types";
import { normalizeVisualRetentionPresetProvenance } from "@/features/story/types/visual-retention-preset-provenance.types";
import {
  applyVisualRetentionPresetPlan,
  buildVisualRetentionPresetApplicationPlan,
  dismissVisualRetentionPresetApplication,
  evaluateVisualRetentionPresetStaleness,
  keepVisualRetentionPresetApplication,
  projectStoryVisualRetentionPresetInput,
  undoVisualRetentionPresetApplication,
  VISUAL_RETENTION_PRESET_STALE_REASONS,
  type VisualRetentionPresetPlanningCapabilities,
} from "@/features/visual-retention-presets";

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
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

function imageMedia(url: string, extras: Partial<SceneMedia> = {}): SceneMedia {
  return { type: "image", source: "upload", url, ...extras };
}

function videoMedia(url: string, extras: Partial<SceneMedia> = {}): SceneMedia {
  return { type: "video", source: "upload", url, ...extras };
}

function sceneStub(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 10,
    duration: 10,
    startMs: 0,
    endMs: 10_000,
    durationMs: 10_000,
    subtitle: "Fallback subtitle",
    narration: "Opening beat. Middle beat. Closing beat.",
    ...overrides,
  };
}

function scriptOf(...scenes: FootieScene[]): FootieScript {
  return {
    title: "Preset staleness fixture",
    narration: "Story",
    totalDuration: scenes.reduce(
      (sum, scene) => sum + (scene.durationMs ?? 0),
      0,
    ),
    scenes,
  };
}

function mixedSequenceScene(id: string, durationMs = 10_000): FootieScene {
  const split = Math.floor(durationMs * 0.4);
  return sceneStub({
    id,
    duration: durationMs / 1000,
    durationMs,
    end: durationMs / 1000,
    endMs: durationMs,
    media: imageMedia("https://example.com/ignored.jpg"),
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
  });
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
    generatedAtIso: "2026-08-04T12:00:00.000Z",
  });
}

function main(): void {
  console.log("\nvisual-retention-preset-staleness\n");

  test("exact full Undo after Apply", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const applied = applyPulse(script);
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const undone = undoVisualRetentionPresetApplication({
      script: applied.script,
      capabilities: allCapabilities(),
    });
    assert.equal(undone.ok, true);
    if (!undone.ok) return;
    assert.equal(undone.script.visualRetentionPresetProvenance, undefined);
    assert.equal(
      normalizeSceneMediaVisualEffect(
        undone.script.scenes[0]!.visualSequence!.items[0]!.media.visualEffect,
      ),
      undefined,
    );
  });

  test("exact absence restoration for brand sting / engagement", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const capabilities = allCapabilities();
    const facts = projectStoryVisualRetentionPresetInput(script, {
      mixedMediaScenesEnabled: true,
    });
    const plan = buildVisualRetentionPresetApplicationPlan({
      facts,
      presetId: "visual-retention-share-ready",
      capabilities,
    });
    const applied = applyVisualRetentionPresetPlan({
      script,
      plan,
      capabilities,
      generatedAtIso: "2026-08-04T12:00:00.000Z",
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.ok(getShortForgeBrandSting(applied.script.visualRetentionExtensions));
    assert.ok(getSceneEngagementOverlay(applied.script, "s1"));
    const undone = undoVisualRetentionPresetApplication({
      script: applied.script,
      capabilities,
    });
    assert.equal(undone.ok, true);
    if (!undone.ok) return;
    assert.equal(
      getShortForgeBrandSting(undone.script.visualRetentionExtensions),
      undefined,
    );
    assert.equal(getSceneEngagementOverlay(undone.script, "s1"), undefined);
  });

  test("scene/media deletion → missing target stale; partial Undo", () => {
    const script = scriptOf(mixedSequenceScene("s1"), mixedSequenceScene("s2"));
    const applied = applyPulse(script);
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const withoutS2: FootieScript = {
      ...applied.script,
      scenes: applied.script.scenes.filter((scene) => scene.id !== "s2"),
    };
    const stale = evaluateVisualRetentionPresetStaleness({
      script: withoutS2,
      capabilities: allCapabilities(),
    });
    assert.equal(stale.effectiveStatus, "stale");
    assert.ok(
      stale.reasons.includes(
        VISUAL_RETENTION_PRESET_STALE_REASONS.PRESET_TARGET_MISSING,
      ),
    );
    assert.equal(stale.undoAllowed, true);
    const undone = undoVisualRetentionPresetApplication({
      script: withoutS2,
      capabilities: allCapabilities(),
    });
    assert.equal(undone.ok, true);
    if (!undone.ok) return;
    assert.ok(undone.warnings.some((warning) => /missing target/i.test(warning)));
    assert.equal(undone.script.visualRetentionPresetProvenance, undefined);
  });

  test("manual override refuses Undo and blocks undoAllowed", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const applied = applyPulse(script);
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const overridden: FootieScript = {
      ...applied.script,
      scenes: applied.script.scenes.map((scene) => {
        if (scene.id !== "s1") return scene;
        const items = scene.visualSequence!.items.map((item, index) => {
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
    const stale = evaluateVisualRetentionPresetStaleness({
      script: overridden,
      capabilities: allCapabilities(),
    });
    assert.ok(
      stale.reasons.includes(
        VISUAL_RETENTION_PRESET_STALE_REASONS.PRESET_MANUAL_OVERRIDE_AFTER_APPLY,
      ),
    );
    assert.equal(stale.undoAllowed, false);
    const undone = undoVisualRetentionPresetApplication({
      script: overridden,
      capabilities: allCapabilities(),
    });
    assert.equal(undone.ok, false);
    if (!undone.ok) {
      assert.equal(undone.terminalCode, "PRESET_UNDO_MANUAL_OVERRIDE");
      assert.equal(undone.script, overridden);
    }
  });

  test("catalog/recipe drift via rebuilt plan keeps Undo allowed; absent rebuild is not stale", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const applied = applyPulse(script);
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    // Without optional rebuilt fingerprints, matching snapshots stay applied.
    const current = evaluateVisualRetentionPresetStaleness({
      script: applied.script,
      capabilities: allCapabilities(),
    });
    assert.equal(current.effectiveStatus, "applied");
    assert.deepEqual(current.reasons, []);

    const rebuiltMismatch = evaluateVisualRetentionPresetStaleness({
      script: applied.script,
      capabilities: allCapabilities(),
      rebuiltInputFingerprint: applied.provenance.inputFingerprint,
      rebuiltPlanFingerprint: "vrp1:catalog-drift-plan",
    });
    assert.ok(
      rebuiltMismatch.reasons.includes(
        VISUAL_RETENTION_PRESET_STALE_REASONS.PRESET_PLAN_FINGERPRINT_MISMATCH,
      ),
    );
    assert.ok(
      rebuiltMismatch.reasons.includes(
        VISUAL_RETENTION_PRESET_STALE_REASONS.PRESET_CATALOG_CHANGED,
      ),
    );
    assert.equal(rebuiltMismatch.undoAllowed, true);
    const undone = undoVisualRetentionPresetApplication({
      script: applied.script,
      capabilities: allCapabilities(),
    });
    assert.equal(undone.ok, true);
  });

  test("underlying capability-off blocks Undo", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const applied = applyPulse(script);
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const caps = allCapabilities({ keyframedVisualEffectsEnabled: false });
    const stale = evaluateVisualRetentionPresetStaleness({
      script: applied.script,
      capabilities: caps,
    });
    assert.ok(
      stale.reasons.includes(
        VISUAL_RETENTION_PRESET_STALE_REASONS.PRESET_UNDERLYING_CAPABILITY_OFF,
      ),
    );
    assert.equal(stale.undoAllowed, false);
    const undone = undoVisualRetentionPresetApplication({
      script: applied.script,
      capabilities: caps,
    });
    assert.equal(undone.ok, false);
    if (!undone.ok) {
      assert.equal(undone.terminalCode, "PRESET_UNDO_UNDERLYING_CAPABILITY_OFF");
    }
  });

  test("malformed / missing provenance", () => {
    const missing = undoVisualRetentionPresetApplication({
      script: scriptOf(mixedSequenceScene("s1")),
      capabilities: allCapabilities(),
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.terminalCode, "PRESET_UNDO_NOT_AVAILABLE");
    }

    const malformedScript: FootieScript = {
      ...scriptOf(mixedSequenceScene("s1")),
      visualRetentionPresetProvenance: {
        version: 1,
        catalogVersion: 1,
        presetId: "visual-retention-pulse-edit",
        inputFingerprint: "bad",
        planFingerprint: "bad",
        status: "applied",
        changes: [],
      } as never,
    };
    assert.equal(
      normalizeVisualRetentionPresetProvenance(
        malformedScript.visualRetentionPresetProvenance,
      ),
      undefined,
    );
    const invalid = evaluateVisualRetentionPresetStaleness({
      script: malformedScript,
      capabilities: allCapabilities(),
    });
    assert.equal(invalid.effectiveStatus, "invalid");
    assert.ok(
      invalid.reasons.includes(
        VISUAL_RETENTION_PRESET_STALE_REASONS.PRESET_PROVENANCE_INVALID,
      ),
    );
    const undoInvalid = undoVisualRetentionPresetApplication({
      script: malformedScript,
      capabilities: allCapabilities(),
    });
    assert.equal(undoInvalid.ok, false);
    if (!undoInvalid.ok) {
      assert.equal(undoInvalid.terminalCode, "PRESET_UNDO_PROVENANCE_INVALID");
    }
  });

  test("Keep/Dismiss metadata-only; capability-off explicit", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const applied = applyPulse(script);
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const motion = resolveSceneMediaMotionFromMedia(
      applied.script.scenes[0]!.visualSequence!.items[0]!.media,
    );
    const kept = keepVisualRetentionPresetApplication({
      script: applied.script,
      capabilities: allCapabilities(),
    });
    assert.equal(kept.ok, true);
    assert.equal(kept.script.visualRetentionPresetProvenance, undefined);
    assert.deepEqual(
      resolveSceneMediaMotionFromMedia(
        kept.script.scenes[0]!.visualSequence!.items[0]!.media,
      ),
      motion,
    );
    const dismissOff = dismissVisualRetentionPresetApplication({
      script: applied.script,
      capabilities: allCapabilities({ visualRetentionPresetsEnabled: false }),
    });
    assert.equal(dismissOff.ok, false);
    if (!dismissOff.ok) {
      assert.equal(dismissOff.terminalCode, "PRESET_DISMISS_CAPABILITY_OFF");
    }
    const clearMalformed = dismissVisualRetentionPresetApplication({
      script: {
        ...scriptOf(mixedSequenceScene("s1")),
        visualRetentionPresetProvenance: { version: 99 } as never,
      },
      capabilities: allCapabilities(),
    });
    assert.equal(clearMalformed.ok, true);
    assert.equal(clearMalformed.script.visualRetentionPresetProvenance, undefined);
  });

  test("unrelated story edits do not stale applied snapshots", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const applied = applyPulse(script);
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const narrated: FootieScript = {
      ...applied.script,
      narration: "Completely different story narration.",
      scenes: applied.script.scenes.map((scene) => ({
        ...scene,
        narration: "Edited scene narration that should not stale presets.",
        subtitle: "Edited subtitle",
      })),
    };
    const stale = evaluateVisualRetentionPresetStaleness({
      script: narrated,
      capabilities: allCapabilities(),
    });
    assert.equal(stale.effectiveStatus, "applied");
    assert.deepEqual(stale.reasons, []);
    assert.equal(stale.undoAllowed, true);
  });

  test("applied current when snapshots match", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const applied = applyPulse(script);
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const stale = evaluateVisualRetentionPresetStaleness({
      script: applied.script,
      capabilities: allCapabilities(),
    });
    assert.equal(stale.effectiveStatus, "applied");
    assert.equal(stale.undoAllowed, true);
    assert.ok(stale.provenance);
  });

  test("manual override field matrix blocks Undo; unrelated edits do not", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const applied = applyPulse(script);
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    const mutateLook = (next: FootieScript): FootieScript => ({
      ...next,
      scenes: next.scenes.map((scene) => ({
        ...scene,
        visualSequence: scene.visualSequence
          ? {
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
                          intensity: 0.25,
                        },
                      },
                    }
                  : item,
              ),
            }
          : scene.visualSequence,
      })),
    });

    const lookOverride = mutateLook(applied.script);
    const lookStale = evaluateVisualRetentionPresetStaleness({
      script: lookOverride,
      capabilities: allCapabilities(),
    });
    assert.ok(
      lookStale.reasons.includes(
        VISUAL_RETENTION_PRESET_STALE_REASONS.PRESET_MANUAL_OVERRIDE_AFTER_APPLY,
      ),
    );
    const lookUndo = undoVisualRetentionPresetApplication({
      script: lookOverride,
      capabilities: allCapabilities(),
    });
    assert.equal(lookUndo.ok, false);
    if (!lookUndo.ok) {
      assert.equal(lookUndo.terminalCode, "PRESET_UNDO_MANUAL_OVERRIDE");
      assert.equal(lookUndo.script, lookOverride);
      assert.ok(lookUndo.script.visualRetentionPresetProvenance);
    }

    const framingOnly: FootieScript = {
      ...applied.script,
      scenes: applied.script.scenes.map((scene) => ({
        ...scene,
        visualSequence: scene.visualSequence
          ? {
              version: 1 as const,
              items: scene.visualSequence.items.map((item, index) =>
                index === 0
                  ? {
                      ...item,
                      media: {
                        ...item.media,
                        fitMode: "contain",
                        transform: { x: 12, y: -4, scale: 1.05, rotation: 0 },
                      },
                    }
                  : item,
              ),
            }
          : scene.visualSequence,
      })),
    };
    const framingStale = evaluateVisualRetentionPresetStaleness({
      script: framingOnly,
      capabilities: allCapabilities(),
    });
    assert.equal(framingStale.effectiveStatus, "applied");
    const framingUndo = undoVisualRetentionPresetApplication({
      script: framingOnly,
      capabilities: allCapabilities(),
    });
    assert.equal(framingUndo.ok, true);
  });

  test("all targets missing clears provenance without inventing data", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const applied = applyPulse(script);
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const empty: FootieScript = {
      ...applied.script,
      scenes: [],
    };
    const undone = undoVisualRetentionPresetApplication({
      script: empty,
      capabilities: allCapabilities(),
    });
    assert.equal(undone.ok, true);
    if (!undone.ok) return;
    assert.equal(undone.script.visualRetentionPresetProvenance, undefined);
    assert.equal(undone.script.scenes.length, 0);
    assert.ok(
      undone.warnings.some((warning) => /no restorable targets/i.test(warning)),
    );
  });

  console.log(`\n${passed} passed\n`);
}

main();
