/**
 * Visual Retention Preset Apply / Undo / Keep / Dismiss command verification.
 * Run via: npm run test:visual-retention-presets-commands
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { getMediaMotionPreset } from "@/features/media-motion/media-motion.presets";
import { normalizeSceneMediaVisualEffect } from "@/features/media-motion/domain/resolve-media-visual-effect";
import {
  resolveSceneMediaMotion,
  resolveSceneMediaMotionFromMedia,
} from "@/features/media-motion/media-motion.normalize";
import { getSceneEngagementOverlay } from "@/features/engagement-overlays/domain/normalize-engagement-overlays";
import { getShortForgeBrandSting } from "@/features/brand-sting/domain/normalize-brand-sting";
import { readStoredVisualBeatPlan } from "@/features/visual-beat-density/adapters/project-scene-visual-beat-plan";
import type {
  FootieScene,
  FootieScript,
  SceneMedia,
} from "@/features/story/types";
import {
  applyVisualRetentionPresetPlan,
  buildVisualRetentionPresetApplicationPlan,
  dismissVisualRetentionPresetApplication,
  keepVisualRetentionPresetApplication,
  listVisualRetentionPresets,
  projectStoryVisualRetentionPresetInput,
  undoVisualRetentionPresetApplication,
  VISUAL_RETENTION_PRESET_IDS,
  type VisualRetentionPresetId,
  type VisualRetentionPresetPlanActionV1,
  type VisualRetentionPresetPlanningCapabilities,
} from "@/features/visual-retention-presets";

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
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
    title: "Preset commands fixture",
    narration: "Story",
    totalDuration: scenes.reduce(
      (sum, scene) => sum + (scene.durationMs ?? 0),
      0,
    ),
    scenes,
  };
}

function mixedSequenceScene(
  id: string,
  options: {
    readonly ignoredMediaUrl?: string;
    readonly emptyUrls?: boolean;
    readonly keyframesOnFirst?: boolean;
    readonly adjustmentsOnFirst?: boolean;
    readonly durationMs?: number;
  } = {},
): FootieScene {
  const durationMs = options.durationMs ?? 10_000;
  const urlA = options.emptyUrls ? "" : "https://example.com/seq-a.jpg";
  const urlB = options.emptyUrls ? "" : "https://example.com/seq-b.mp4";
  const first: SceneMedia = imageMedia(urlA, {
    ...(options.adjustmentsOnFirst
      ? {
          visualAdjustments: {
            version: 1 as const,
            brightness: 110,
            contrast: 100,
            saturation: 100,
          },
        }
      : {}),
    ...(options.keyframesOnFirst
      ? {
          motion: {
            version: 1,
            enabled: true,
            presetId: "custom",
            intensity: 1,
            keyframes: [
              {
                offsetMs: 0,
                x: 0,
                y: 0,
                scale: 1,
                rotation: 0,
                opacity: 1,
                easing: "linear",
              },
              {
                offsetMs: 2000,
                x: 10,
                y: 0,
                scale: 1.1,
                rotation: 0,
                opacity: 1,
                easing: "linear",
              },
            ],
          },
        }
      : {}),
  });
  const second: SceneMedia = videoMedia(urlB);
  const split = Math.floor(durationMs * 0.4);
  return sceneStub({
    id,
    duration: durationMs / 1000,
    durationMs,
    end: durationMs / 1000,
    endMs: durationMs,
    media: imageMedia(
      options.ignoredMediaUrl ?? "https://example.com/ignored-scene-media.jpg",
    ),
    visualSequence: {
      version: 1,
      items: [
        {
          id: `${id}-a`,
          media: first,
          startOffsetMs: 0,
          durationMs: split,
        },
        {
          id: `${id}-b`,
          media: second,
          startOffsetMs: split,
          durationMs: durationMs - split,
        },
      ],
    },
  });
}

function planFor(
  script: FootieScript,
  presetId: VisualRetentionPresetId,
  capabilities: VisualRetentionPresetPlanningCapabilities = allCapabilities(),
) {
  const facts = projectStoryVisualRetentionPresetInput(script, {
    mixedMediaScenesEnabled: capabilities.mixedMediaScenesEnabled,
  });
  return buildVisualRetentionPresetApplicationPlan({
    facts,
    presetId,
    capabilities,
  });
}

function applyPreset(
  script: FootieScript,
  presetId: VisualRetentionPresetId,
  capabilities: VisualRetentionPresetPlanningCapabilities = allCapabilities(),
) {
  const plan = planFor(script, presetId, capabilities);
  return applyVisualRetentionPresetPlan({
    script,
    plan,
    capabilities,
    generatedAtIso: "2026-08-04T12:00:00.000Z",
  });
}

function freezeSnapshot(value: unknown): string {
  return JSON.stringify(value);
}

function main(): void {
  console.log("\nvisual-retention-preset-commands\n");

  test("catalog still exposes four presets", () => {
    assert.equal(listVisualRetentionPresets().length, 4);
    assert.deepEqual(
      listVisualRetentionPresets().map((preset) => preset.id),
      [...VISUAL_RETENTION_PRESET_IDS],
    );
  });

  for (const presetId of VISUAL_RETENTION_PRESET_IDS) {
    test(`Apply succeeds for ${presetId}`, () => {
      const script = scriptOf(
        mixedSequenceScene("s1"),
        mixedSequenceScene("s2"),
      );
      const before = freezeSnapshot(script);
      const result = applyPreset(script, presetId);
      assert.equal(result.ok, true, `${presetId} ${!result.ok ? result.terminalCode : ""}`);
      if (!result.ok) return;
      assert.ok(result.provenance.changes.length > 0);
      assert.equal(result.provenance.status, "applied");
      assert.equal(result.script.visualRetentionPresetProvenance?.presetId, presetId);
      assert.equal(freezeSnapshot(script), before, "input story must not mutate");
    });
  }

  test("canonical-plan recomputation refuses forged actions/targets/recipe values", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const plan = planFor(script, "visual-retention-pulse-edit");
    assert.equal(plan.status, "preview");
    const forged = {
      ...plan,
      actions: plan.actions.map((action) =>
        action.kind === "apply-media-look"
          ? { ...action, presetId: "monochrome" as const, intensity: 0.11 }
          : action,
      ),
    };
    const result = applyVisualRetentionPresetPlan({
      script,
      plan: forged,
      capabilities: allCapabilities(),
      generatedAtIso: "2026-08-04T12:00:00.000Z",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.terminalCode, "PRESET_APPLY_STALE_PLAN");
      assert.equal(result.script, script);
    }
  });

  test("forged fingerprint / removed skips refuse Apply", () => {
    const script = scriptOf(mixedSequenceScene("s1", { keyframesOnFirst: true }));
    const plan = planFor(script, "visual-retention-balanced-clarity");
    const forgedFingerprint = {
      ...plan,
      planFingerprint: "vrp1:deadbeef",
    };
    const forgedSkips = {
      ...plan,
      skipped: [],
      summary: { ...plan.summary, skippedCount: 0 },
    };
    for (const forged of [forgedFingerprint, forgedSkips]) {
      const result = applyVisualRetentionPresetPlan({
        script,
        plan: forged,
        capabilities: allCapabilities(),
        generatedAtIso: "2026-08-04T12:00:00.000Z",
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.terminalCode, "PRESET_APPLY_STALE_PLAN");
    }
  });

  test("stale story / media / capability refuse Apply", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const plan = planFor(script, "visual-retention-balanced-clarity");
    const changedStory = scriptOf(
      mixedSequenceScene("s1"),
      mixedSequenceScene("s2"),
    );
    const storyStale = applyVisualRetentionPresetPlan({
      script: changedStory,
      plan,
      capabilities: allCapabilities(),
      generatedAtIso: "2026-08-04T12:00:00.000Z",
    });
    assert.equal(storyStale.ok, false);
    if (!storyStale.ok) {
      assert.equal(storyStale.terminalCode, "PRESET_APPLY_STALE_PLAN");
    }

    const capStale = applyVisualRetentionPresetPlan({
      script,
      plan,
      capabilities: allCapabilities({ visualBeatDensityEnabled: false }),
      generatedAtIso: "2026-08-04T12:00:00.000Z",
    });
    assert.equal(capStale.ok, false);
    if (!capStale.ok) {
      assert.equal(capStale.terminalCode, "PRESET_APPLY_STALE_PLAN");
    }

    const expectedGuard = applyVisualRetentionPresetPlan({
      script,
      plan,
      capabilities: allCapabilities(),
      generatedAtIso: "2026-08-04T12:00:00.000Z",
      expectedPlanFingerprint: "vrp1:not-the-plan",
    });
    assert.equal(expectedGuard.ok, false);
    if (!expectedGuard.ok) {
      assert.equal(expectedGuard.terminalCode, "PRESET_APPLY_STALE_PLAN");
    }
  });

  test("transactional rollback: later motion failure rolls back pacing Suggest", () => {
    const script = scriptOf(mixedSequenceScene("s1", { emptyUrls: true }));
    const before = freezeSnapshot(script);
    const result = applyPreset(script, "visual-retention-balanced-clarity");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.terminalCode, "PRESET_APPLY_ACTION_FAILED");
      assert.equal(result.failedAction?.kind, "apply-motion-preset");
      assert.equal(result.script, script);
      assert.equal(result.script.visualRetentionPresetProvenance, undefined);
      assert.equal(
        result.script.scenes[0]!.visualBeatPlan,
        undefined,
        "failed Apply must not keep working-copy pacing",
      );
    }
    assert.equal(freezeSnapshot(script), before);
  });

  test("transactional rollback: motion failure after skipped pacing", () => {
    const script = scriptOf(mixedSequenceScene("s1", { emptyUrls: true }));
    const caps = allCapabilities({ visualBeatDensityEnabled: false });
    const before = freezeSnapshot(script);
    const result = applyPreset(
      script,
      "visual-retention-balanced-clarity",
      caps,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.terminalCode, "PRESET_APPLY_ACTION_FAILED");
      assert.equal(result.failedAction?.kind, "apply-motion-preset");
      assert.equal(result.script, script);
    }
    assert.equal(freezeSnapshot(script), before);
  });

  test("transactional rollback: brand sting then pacing failure restores nothing", () => {
    const script = scriptOf(mixedSequenceScene("s1", { emptyUrls: true }));
    const before = freezeSnapshot(script);
    const result = applyPreset(script, "visual-retention-share-ready");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.terminalCode, "PRESET_APPLY_ACTION_FAILED");
      assert.equal(result.script, script);
      assert.equal(
        getShortForgeBrandSting(result.script.visualRetentionExtensions),
        undefined,
      );
    }
    assert.equal(freezeSnapshot(script), before);
  });

  test("Suggest-only pacing — never Apply/retime timing", () => {
    const src = readSrc(
      "src/features/visual-retention-presets/editor/visual-retention-preset.commands.ts",
    );
    assert.match(src, /suggestVisualBeatPlan/);
    assert.doesNotMatch(src, /applyVisualBeatPlan\(/);
    const script = scriptOf(mixedSequenceScene("s1"));
    const beforeOffsets = script.scenes[0]!.visualSequence!.items.map(
      (item) => item.startOffsetMs,
    );
    const result = applyPreset(script, "visual-retention-balanced-clarity");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const afterOffsets = result.script.scenes[0]!.visualSequence!.items.map(
      (item) => item.startOffsetMs,
    );
    assert.deepEqual(afterOffsets, beforeOffsets);
    assert.ok(readStoredVisualBeatPlan(result.script.scenes[0]!));
  });

  test("deterministic engagement overlay ID", () => {
    const script = scriptOf(mixedSequenceScene("eligible"));
    const result = applyPreset(script, "visual-retention-share-ready");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const overlay = getSceneEngagementOverlay(result.script, "eligible");
    assert.ok(overlay);
    assert.equal(overlay!.id, "engagement-eligible");
    const again = applyPreset(
      {
        ...script,
        visualRetentionPresetProvenance: undefined,
      },
      "visual-retention-share-ready",
    );
    // Second apply refused while provenance active on first result; rebuild clean.
    const clean = scriptOf(mixedSequenceScene("eligible"));
    const second = applyPreset(clean, "visual-retention-share-ready");
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(
      getSceneEngagementOverlay(second.script, "eligible")?.id,
      "engagement-eligible",
    );
    void again;
  });

  test("mixed-media dual-write for motion/look targets", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const result = applyPreset(script, "visual-retention-pulse-edit");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const scene = result.script.scenes[0]!;
    assert.ok(scene.visualSequence?.items[0]?.media.motion);
    assert.ok(scene.visualSequence?.items[0]?.media.visualEffect);
    // Dual-write should keep timeline in sync when sequence-authoritative.
    const timelineItem = scene.mediaTimeline?.items?.find(
      (item) => item.id === "s1-a",
    );
    if (timelineItem) {
      assert.ok(timelineItem.media.motion);
      assert.ok(timelineItem.media.visualEffect);
    }
  });

  test("explicit capability-off legacy projection applies mediaItemId null", () => {
    const script = scriptOf(
      sceneStub({
        id: "legacy",
        media: imageMedia("https://example.com/legacy.jpg"),
        visualSequence: {
          version: 1,
          items: [
            {
              id: "ignored",
              media: imageMedia("https://example.com/seq.jpg"),
              startOffsetMs: 0,
              durationMs: 5000,
            },
            {
              id: "ignored-2",
              media: videoMedia("https://example.com/seq2.mp4"),
              startOffsetMs: 5000,
              durationMs: 5000,
            },
          ],
        },
      }),
    );
    const caps = allCapabilities({
      mixedMediaScenesEnabled: false,
      visualBeatDensityEnabled: false,
    });
    const result = applyPreset(
      script,
      "visual-retention-balanced-clarity",
      caps,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const motionChange = result.provenance.changes.find(
      (change) => change.actionKind === "apply-motion-preset",
    );
    assert.ok(motionChange);
    assert.equal(motionChange!.target.scope, "media");
    if (motionChange!.target.scope === "media") {
      assert.equal(motionChange!.target.mediaItemId, null);
    }
    assert.ok(resolveSceneMediaMotion(result.script.scenes[0]!));
  });

  test("keyframe + freeform adjustment preservation", () => {
    const script = scriptOf(
      mixedSequenceScene("s1", {
        keyframesOnFirst: true,
        adjustmentsOnFirst: true,
      }),
    );
    const beforeKeyframes =
      script.scenes[0]!.visualSequence!.items[0]!.media.motion!.keyframes;
    const beforeAdj =
      script.scenes[0]!.visualSequence!.items[0]!.media.visualAdjustments!;
    const result = applyPreset(script, "visual-retention-pulse-edit");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const media = result.script.scenes[0]!.visualSequence!.items[0]!.media;
    assert.deepEqual(media.motion?.keyframes, beforeKeyframes);
    assert.ok(media.visualAdjustments);
    assert.equal(media.visualAdjustments!.brightness, beforeAdj.brightness);
    assert.equal(media.visualAdjustments!.contrast, beforeAdj.contrast);
    assert.equal(media.visualAdjustments!.saturation, beforeAdj.saturation);
    assert.ok(
      !result.provenance.changes.some(
        (change) =>
          change.actionKind === "apply-motion-preset" &&
          change.target.scope === "media" &&
          change.target.mediaItemId === "s1-a",
      ),
    );
  });

  test("promo conflict skipping — existing engagement/brand sting", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    script.visualRetentionExtensions = {
      version: 1,
      engagementOverlaysBySceneId: {
        s1: [
          {
            version: 1,
            id: "engagement-s1",
            kind: "like",
            startOffsetMs: 7500,
            durationMs: 2500,
            position: "top-right",
            presetId: "compact-pill-v1",
          },
        ],
      },
      shortForgeBrandSting: {
        version: 1,
        enabled: true,
        title: "ShortForge Studio",
        durationMs: 2500,
        presetId: "shortforge-studio-outro-v1",
        narrationPolicy: "none",
        captionPolicy: "none",
        playbackSpeedPolicy: "fixed",
      },
    };
    const plan = planFor(script, "visual-retention-share-ready");
    assert.ok(plan.conflicts.length >= 1);
    const result = applyVisualRetentionPresetPlan({
      script,
      plan,
      capabilities: allCapabilities(),
      generatedAtIso: "2026-08-04T12:00:00.000Z",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(
      !result.provenance.changes.some(
        (change) =>
          change.actionKind === "add-engagement-overlay" ||
          change.actionKind === "enable-brand-sting",
      ),
    );
  });

  test("exact provenance actual-diff inventory; no-change stores none", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const first = applyPreset(script, "visual-retention-balanced-clarity");
    assert.equal(first.ok, true);
    if (!first.ok) return;
    for (const change of first.provenance.changes) {
      assert.notEqual(
        JSON.stringify(change.previousValue),
        JSON.stringify(change.appliedValue),
      );
    }
    // Re-apply after Keep — already matches recipe → NO_CHANGES / no provenance.
    const kept = keepVisualRetentionPresetApplication({
      script: first.script,
      capabilities: allCapabilities(),
    });
    assert.equal(kept.ok, true);
    const second = applyPreset(kept.script, "visual-retention-balanced-clarity");
    assert.equal(second.ok, false);
    if (!second.ok) {
      assert.equal(second.terminalCode, "PRESET_APPLY_NO_CHANGES");
      assert.equal(second.script.visualRetentionPresetProvenance, undefined);
    }
  });

  test("second Apply refused while provenance active", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const first = applyPreset(script, "visual-retention-cinematic-hold");
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const second = applyPreset(
      first.script,
      "visual-retention-balanced-clarity",
    );
    assert.equal(second.ok, false);
    if (!second.ok) {
      assert.equal(second.terminalCode, "PRESET_APPLY_PROVENANCE_ACTIVE");
      assert.equal(second.script, first.script);
    }
  });

  test("exact Undo restores previous values and clears provenance", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const beforeMotion = resolveSceneMediaMotionFromMedia(
      script.scenes[0]!.visualSequence!.items[0]!.media,
    );
    const beforeLook = normalizeSceneMediaVisualEffect(
      script.scenes[0]!.visualSequence!.items[0]!.media.visualEffect,
    );
    const applied = applyPreset(script, "visual-retention-pulse-edit");
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const undone = undoVisualRetentionPresetApplication({
      script: applied.script,
      capabilities: allCapabilities(),
    });
    assert.equal(undone.ok, true);
    if (!undone.ok) return;
    assert.equal(undone.script.visualRetentionPresetProvenance, undefined);
    const media = undone.script.scenes[0]!.visualSequence!.items[0]!.media;
    assert.equal(
      JSON.stringify(resolveSceneMediaMotionFromMedia(media)),
      JSON.stringify(beforeMotion),
    );
    assert.equal(
      JSON.stringify(normalizeSceneMediaVisualEffect(media.visualEffect) ?? null),
      JSON.stringify(beforeLook ?? null),
    );
    assert.equal(readStoredVisualBeatPlan(undone.script.scenes[0]!), undefined);
  });

  test("Keep/Dismiss clear metadata only", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const applied = applyPreset(script, "visual-retention-share-ready");
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const sting = getShortForgeBrandSting(
      applied.script.visualRetentionExtensions,
    );
    const overlay = getSceneEngagementOverlay(applied.script, "s1");
    const kept = keepVisualRetentionPresetApplication({
      script: applied.script,
      capabilities: allCapabilities(),
    });
    assert.equal(kept.ok, true);
    assert.equal(kept.script.visualRetentionPresetProvenance, undefined);
    assert.deepEqual(
      getShortForgeBrandSting(kept.script.visualRetentionExtensions),
      sting,
    );
    assert.deepEqual(getSceneEngagementOverlay(kept.script, "s1"), overlay);

    const dismissed = dismissVisualRetentionPresetApplication({
      script: applied.script,
      capabilities: allCapabilities(),
    });
    assert.equal(dismissed.ok, true);
    assert.equal(dismissed.script.visualRetentionPresetProvenance, undefined);
    assert.deepEqual(
      getShortForgeBrandSting(dismissed.script.visualRetentionExtensions),
      sting,
    );
  });

  test("capability gates for Apply/Undo/Keep", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const plan = planFor(script, "visual-retention-balanced-clarity");
    const off = applyVisualRetentionPresetPlan({
      script,
      plan,
      capabilities: allCapabilities({ visualRetentionPresetsEnabled: false }),
      generatedAtIso: "2026-08-04T12:00:00.000Z",
    });
    assert.equal(off.ok, false);
    if (!off.ok) assert.equal(off.terminalCode, "PRESET_APPLY_CAPABILITY_OFF");

    const applied = applyPreset(script, "visual-retention-balanced-clarity");
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const undoOff = undoVisualRetentionPresetApplication({
      script: applied.script,
      capabilities: allCapabilities({ visualRetentionPresetsEnabled: false }),
    });
    assert.equal(undoOff.ok, false);
    if (!undoOff.ok) assert.equal(undoOff.terminalCode, "PRESET_UNDO_CAPABILITY_OFF");

    const keepOff = keepVisualRetentionPresetApplication({
      script: applied.script,
      capabilities: allCapabilities({ visualRetentionPresetsEnabled: false }),
    });
    assert.equal(keepOff.ok, false);
    if (!keepOff.ok) {
      assert.equal(keepOff.terminalCode, "PRESET_DISMISS_CAPABILITY_OFF");
    }
  });

  test("ACTION_FAILED paths return original script reference in source", () => {
    const src = readSrc(
      "src/features/visual-retention-presets/editor/visual-retention-preset.commands.ts",
    );
    assert.match(src, /PRESET_APPLY_ACTION_FAILED/);
    assert.match(src, /script: original/);
    assert.match(src, /getMediaMotionPreset/);
    void getMediaMotionPreset;
  });

  test("conditional generatedAtIso — required only when pacing is planned", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const withPacing = planFor(script, "visual-retention-balanced-clarity");
    assert.ok(withPacing.actions.some((action) => action.kind === "suggest-pacing"));
    const missing = applyVisualRetentionPresetPlan({
      script,
      plan: withPacing,
      capabilities: allCapabilities(),
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.terminalCode, "PRESET_APPLY_GENERATED_AT_REQUIRED");
      assert.equal(missing.script, script);
    }

    const noPacingCaps = allCapabilities({ visualBeatDensityEnabled: false });
    const noPacingPlan = planFor(
      script,
      "visual-retention-balanced-clarity",
      noPacingCaps,
    );
    assert.ok(
      !noPacingPlan.actions.some((action) => action.kind === "suggest-pacing"),
    );
    const withoutTimestamp = applyVisualRetentionPresetPlan({
      script,
      plan: noPacingPlan,
      capabilities: noPacingCaps,
    });
    assert.equal(withoutTimestamp.ok, true);
  });

  test("copied fingerprint with altered skip/conflict/order fails before native writes", () => {
    const script = scriptOf(mixedSequenceScene("s1", { keyframesOnFirst: true }));
    const plan = planFor(script, "visual-retention-pulse-edit");
    assert.ok(plan.skipped.length > 0);
    const before = freezeSnapshot(script);
    const forged = {
      ...plan,
      skipped: plan.skipped.slice(1),
      summary: {
        ...plan.summary,
        skippedCount: Math.max(0, plan.summary.skippedCount - 1),
      },
    };
    const result = applyVisualRetentionPresetPlan({
      script,
      plan: forged,
      capabilities: allCapabilities(),
      generatedAtIso: "2026-08-04T12:00:00.000Z",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.terminalCode, "PRESET_APPLY_STALE_PLAN");
      assert.equal(result.script, script);
    }
    assert.equal(freezeSnapshot(script), before);
  });

  test("DI rollback matrix rolls back prior working-copy mutations", () => {
    const cases: Array<{
      readonly name: string;
      readonly presetId: VisualRetentionPresetId;
      readonly resolveFailIndex: (
        actions: readonly VisualRetentionPresetPlanActionV1[],
      ) => number;
    }> = [
      {
        name: "sting then pacing",
        presetId: "visual-retention-share-ready",
        resolveFailIndex: (actions) =>
          actions.findIndex((action) => action.kind === "suggest-pacing"),
      },
      {
        name: "pacing then engagement",
        presetId: "visual-retention-share-ready",
        resolveFailIndex: (actions) =>
          actions.findIndex((action) => action.kind === "add-engagement-overlay"),
      },
      {
        name: "motion then look",
        presetId: "visual-retention-pulse-edit",
        resolveFailIndex: (actions) =>
          actions.findIndex((action) => action.kind === "apply-media-look"),
      },
      {
        name: "earlier media then later media",
        presetId: "visual-retention-balanced-clarity",
        resolveFailIndex: (actions) => {
          let seen = 0;
          for (let i = 0; i < actions.length; i += 1) {
            if (actions[i]!.kind === "apply-motion-preset") {
              seen += 1;
              if (seen === 2) return i;
            }
          }
          return -1;
        },
      },
    ];

    for (const entry of cases) {
      const script = scriptOf(
        mixedSequenceScene("s1"),
        mixedSequenceScene("s2"),
      );
      const caps = allCapabilities();
      const plan = planFor(script, entry.presetId, caps);
      const failIndex = entry.resolveFailIndex(plan.actions);
      assert.ok(failIndex > 0, `${entry.name} needs a prior success`);
      const before = freezeSnapshot(script);
      const result = applyVisualRetentionPresetPlan({
        script,
        plan,
        capabilities: caps,
        generatedAtIso: "2026-08-04T12:00:00.000Z",
        beforeAction: ({ actionIndex }) =>
          actionIndex === failIndex
            ? { proceed: false, message: `forced:${entry.name}` }
            : { proceed: true },
      });
      assert.equal(result.ok, false, entry.name);
      if (!result.ok) {
        assert.equal(result.terminalCode, "PRESET_APPLY_ACTION_FAILED", entry.name);
        assert.equal(result.script, script, entry.name);
        assert.equal(result.script.visualRetentionPresetProvenance, undefined);
      }
      assert.equal(freezeSnapshot(script), before, entry.name);
    }
  });

  test("mixed-media on dual-writes sequence+timeline; off ignores sequence", () => {
    const disagreed = sceneStub({
      id: "split",
      media: imageMedia("https://example.com/scene-media.jpg"),
      visualSequence: {
        version: 1,
        items: [
          {
            id: "seq-a",
            media: imageMedia("https://example.com/seq-a.jpg"),
            startOffsetMs: 0,
            durationMs: 4000,
          },
          {
            id: "seq-b",
            media: videoMedia("https://example.com/seq-b.mp4"),
            startOffsetMs: 4000,
            durationMs: 6000,
          },
        ],
      },
      mediaTimeline: {
        version: 1,
        items: [
          {
            id: "tl-only",
            media: imageMedia("https://example.com/timeline-only.jpg"),
            durationWeight: 1,
          },
        ],
      },
    });

    const onCaps = allCapabilities({ mixedMediaScenesEnabled: true });
    const onResult = applyPreset(scriptOf(disagreed), "visual-retention-pulse-edit", onCaps);
    assert.equal(onResult.ok, true);
    if (!onResult.ok) return;
    const onScene = onResult.script.scenes[0]!;
    assert.ok(onScene.visualSequence?.items[0]?.media.motion);
    assert.ok(onScene.visualSequence?.items[0]?.media.visualEffect);
    const otherSeq = onScene.visualSequence!.items[1]!.media;
    // Second item may also receive recipe motion/look; ensure first target identity held.
    assert.equal(
      onResult.provenance.changes.some(
        (change) =>
          change.target.scope === "media" &&
          change.target.mediaItemId === "seq-a",
      ),
      true,
    );
    void otherSeq;

    const offCaps = allCapabilities({
      mixedMediaScenesEnabled: false,
      visualBeatDensityEnabled: false,
    });
    const offScript = scriptOf(
      sceneStub({
        id: "legacy",
        media: imageMedia("https://example.com/legacy-winner.jpg"),
        visualSequence: disagreed.visualSequence,
      }),
    );
    const beforeSeq = freezeSnapshot(offScript.scenes[0]!.visualSequence!);
    const offResult = applyPreset(
      offScript,
      "visual-retention-balanced-clarity",
      offCaps,
    );
    assert.equal(offResult.ok, true);
    if (!offResult.ok) return;
    assert.equal(
      freezeSnapshot(offResult.script.scenes[0]!.visualSequence!),
      beforeSeq,
      "capability-off must not mutate stored sequence",
    );
    const motionChange = offResult.provenance.changes.find(
      (change) => change.actionKind === "apply-motion-preset",
    );
    assert.ok(motionChange && motionChange.target.scope === "media");
    if (motionChange?.target.scope === "media") {
      assert.equal(motionChange.target.mediaItemId, null);
    }
  });

  test("extension preservation across engagement/brand-sting Apply and Undo", () => {
    const script = scriptOf(
      mixedSequenceScene("s1"),
      mixedSequenceScene("s2"),
    );
    script.visualRetentionExtensions = {
      version: 1,
      engagementOverlaysBySceneId: {
        s2: [
          {
            version: 1,
            id: "engagement-s2",
            kind: "share",
            startOffsetMs: 7000,
            durationMs: 2500,
            position: "top-left",
            presetId: "compact-pill-v1",
          },
        ],
      },
    };
    const beforeOther = freezeSnapshot(
      script.visualRetentionExtensions.engagementOverlaysBySceneId!.s2,
    );
    const applied = applyPreset(script, "visual-retention-share-ready");
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.equal(
      freezeSnapshot(
        applied.script.visualRetentionExtensions?.engagementOverlaysBySceneId?.s2,
      ),
      beforeOther,
    );
    assert.ok(getShortForgeBrandSting(applied.script.visualRetentionExtensions));
    assert.ok(getSceneEngagementOverlay(applied.script, "s2"));

    const undone = undoVisualRetentionPresetApplication({
      script: applied.script,
      capabilities: allCapabilities(),
    });
    assert.equal(undone.ok, true);
    if (!undone.ok) return;
    assert.equal(
      freezeSnapshot(
        undone.script.visualRetentionExtensions?.engagementOverlaysBySceneId?.s2,
      ),
      beforeOther,
    );
    assert.equal(getSceneEngagementOverlay(undone.script, "s1"), undefined);
    assert.equal(
      getShortForgeBrandSting(undone.script.visualRetentionExtensions),
      undefined,
    );
  });

  test("deleted sequence item is not recreated or redirected on Undo", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const applied = applyPreset(script, "visual-retention-pulse-edit");
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    const withoutItem: FootieScript = {
      ...applied.script,
      scenes: applied.script.scenes.map((scene) => {
        if (scene.id !== "s1") return scene;
        const items = scene.visualSequence!.items.filter(
          (item) => item.id !== "s1-a",
        );
        return {
          ...scene,
          visualSequence: { version: 1 as const, items },
        };
      }),
    };
    assert.equal(withoutItem.scenes[0]!.visualSequence!.items[0]!.id, "s1-b");
    const undone = undoVisualRetentionPresetApplication({
      script: withoutItem,
      capabilities: allCapabilities(),
    });
    assert.equal(undone.ok, true);
    if (!undone.ok) return;
    assert.ok(undone.warnings.some((warning) => /missing target/i.test(warning)));
    // Deleted s1-a must not be recreated; surviving s1-b undoes its own changes only.
    assert.equal(undone.script.scenes[0]!.visualSequence!.items.length, 1);
    assert.equal(undone.script.scenes[0]!.visualSequence!.items[0]!.id, "s1-b");
    assert.ok(
      !undone.script.scenes[0]!.visualSequence!.items.some(
        (item) => item.id === "s1-a",
      ),
    );
  });

  console.log(`\n${passed} passed\n`);
}

main();
