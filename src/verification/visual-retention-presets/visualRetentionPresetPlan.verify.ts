/**
 * Visual Retention Preset application plan verification (hardened Slice 3).
 * Run via: npm run test:visual-retention-presets-plan
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { getMediaMotionPreset } from "@/features/media-motion/media-motion.presets";
import {
  buildVisualRetentionPresetApplicationPlan,
  listVisualRetentionPresets,
  projectStoryVisualRetentionPresetInput,
  VISUAL_RETENTION_PRESET_IDS,
  VISUAL_RETENTION_PRESET_PLAN_REASON_CODES,
  VISUAL_RETENTION_PRESET_PLAN_TERMINAL_CODES,
  type VisualRetentionPresetId,
  type VisualRetentionPresetPlanningCapabilities,
  type VisualRetentionPresetPlanActionV1,
} from "@/features/visual-retention-presets";
import type {
  FootieScene,
  FootieScript,
  SceneMedia,
} from "@/features/story/types";

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

function recipeMotion(presetId: string, intensity: number): SceneMedia["motion"] {
  const preset = getMediaMotionPreset(presetId);
  return {
    version: 1,
    enabled: true,
    presetId,
    intensity,
    easing: preset.defaultEasing,
    startTransform: { ...preset.startDelta },
    endTransform: { ...preset.endDelta },
  };
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
    title: "Preset plan fixture",
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
    readonly motionOnSecond?: boolean;
    readonly lookOnFirst?: boolean;
    readonly keyframesOnFirst?: boolean;
    readonly adjustmentsOnFirst?: boolean;
    readonly durationMs?: number;
  } = {},
): FootieScene {
  const durationMs = options.durationMs ?? 10_000;
  const first: SceneMedia = imageMedia("https://example.com/seq-a.jpg", {
    ...(options.lookOnFirst
      ? { visualEffect: { version: 1, presetId: "vivid", intensity: 0.6 } }
      : {}),
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
  const second: SceneMedia = videoMedia("https://example.com/seq-b.mp4", {
    ...(options.motionOnSecond
      ? { motion: recipeMotion("sports-punch", 0.7) }
      : {}),
  });
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

function legacyScene(
  id: string,
  media: SceneMedia,
  durationMs = 10_000,
): FootieScene {
  return sceneStub({
    id,
    duration: durationMs / 1000,
    durationMs,
    end: durationMs / 1000,
    endMs: durationMs,
    media,
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

function main(): void {
  console.log("\nvisual-retention-preset-plan\n");

  test("catalog still has exactly four presets", () => {
    assert.deepEqual(
      listVisualRetentionPresets().map((preset) => preset.id),
      [...VISUAL_RETENTION_PRESET_IDS],
    );
  });

  test("explicit mixed-media boolean changes winning projection", () => {
    const script = scriptOf(
      mixedSequenceScene("s1", {
        ignoredMediaUrl: "https://example.com/legacy-winner.jpg",
      }),
    );
    const withMixed = projectStoryVisualRetentionPresetInput(script, {
      mixedMediaScenesEnabled: true,
    });
    const withoutMixed = projectStoryVisualRetentionPresetInput(script, {
      mixedMediaScenesEnabled: false,
    });
    assert.equal(withMixed.mixedMediaScenesEnabled, true);
    assert.equal(withoutMixed.mixedMediaScenesEnabled, false);
    assert.equal(withMixed.scenes[0]!.mediaTargets.length, 2);
    assert.equal(withMixed.scenes[0]!.mediaTargets[0]!.mediaItemId, "s1-a");
    assert.ok(
      !withMixed.scenes[0]!.mediaTargets.some((media) =>
        media.sourceIdentity.includes("legacy-winner"),
      ),
    );
    // Capability off: sequence is not authoring authority → legacy single target.
    assert.equal(withoutMixed.scenes[0]!.mediaTargets.length, 1);
    assert.equal(withoutMixed.scenes[0]!.mediaTargets[0]!.mediaItemId, null);
    assert.equal(
      withoutMixed.scenes[0]!.mediaTargets[0]!.sourceIdentity,
      "https://example.com/legacy-winner.jpg",
    );

    const planOn = buildVisualRetentionPresetApplicationPlan({
      facts: withMixed,
      presetId: "visual-retention-balanced-clarity",
      capabilities: allCapabilities({ mixedMediaScenesEnabled: true }),
    });
    const planOff = buildVisualRetentionPresetApplicationPlan({
      facts: withoutMixed,
      presetId: "visual-retention-balanced-clarity",
      capabilities: allCapabilities({ mixedMediaScenesEnabled: false }),
    });
    assert.notEqual(planOn.inputFingerprint, planOff.inputFingerprint);
    assert.ok(planOn.summary.applyMotionCount >= 2);
    assert.equal(planOff.summary.applyMotionCount, 1);
    assert.ok(
      planOff.actions.every(
        (action) =>
          action.kind !== "apply-motion-preset" || action.mediaItemId === null,
      ),
    );
  });

  test("omitted/malformed mixed-media capability is false", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    const omitted = projectStoryVisualRetentionPresetInput(script);
    assert.equal(omitted.mixedMediaScenesEnabled, false);
    const coerced = buildVisualRetentionPresetApplicationPlan({
      facts: omitted,
      presetId: "visual-retention-balanced-clarity",
      capabilities: {
        ...allCapabilities(),
        mixedMediaScenesEnabled: "yes" as unknown as boolean,
      },
    });
    // normalizeCapabilities treats non-true as false; facts say false → valid.
    assert.equal(coerced.status, "preview");
  });

  test("Balanced Clarity: pacing/motion only; preserves looks and promotional metadata", () => {
    const script = scriptOf(
      mixedSequenceScene("s1"),
      mixedSequenceScene("s2"),
    );
    const before = JSON.stringify(script);
    const plan = planFor(script, "visual-retention-balanced-clarity");
    assert.equal(plan.status, "preview");
    assert.ok(plan.summary.suggestPacingCount >= 1);
    assert.ok(plan.summary.applyMotionCount >= 1);
    assert.equal(plan.summary.applyLookCount, 0);
    assert.equal(plan.summary.addEngagementCount, 0);
    assert.equal(plan.summary.enableBrandStingCount, 0);
    assert.equal(JSON.stringify(script), before);
  });

  test("Pulse Edit and Cinematic Hold produce pacing/motion/look", () => {
    for (const presetId of [
      "visual-retention-pulse-edit",
      "visual-retention-cinematic-hold",
    ] as const) {
      const plan = planFor(scriptOf(mixedSequenceScene("s1")), presetId);
      assert.ok(plan.summary.suggestPacingCount >= 1, presetId);
      assert.ok(plan.summary.applyMotionCount >= 1, presetId);
      assert.ok(plan.summary.applyLookCount >= 1, presetId);
    }
  });

  test("Share Ready order + closing-scene walk-back", () => {
    const shortClosing = mixedSequenceScene("short", { durationMs: 100 });
    shortClosing.narration = "Too short for overlay.";
    const eligible = mixedSequenceScene("eligible");
    const script = scriptOf(eligible, shortClosing);
    const plan = planFor(script, "visual-retention-share-ready");
    assert.equal(plan.actions[0]?.kind, "enable-brand-sting");
    const engagement = plan.actions.find(
      (action) => action.kind === "add-engagement-overlay",
    );
    assert.ok(engagement && engagement.kind === "add-engagement-overlay");
    if (engagement?.kind === "add-engagement-overlay") {
      assert.equal(engagement.sceneId, "eligible");
      assert.equal(engagement.timingPolicy, "closing-scene");
      assert.equal(engagement.overlayKind, "combined");
      assert.equal(engagement.durationMs, 2500);
      assert.equal(engagement.position, "top-right");
      assert.equal("id" in engagement, false);
    }
  });

  test("exact action order across scenes and mixed-media items", () => {
    const plan = planFor(
      scriptOf(mixedSequenceScene("s1"), mixedSequenceScene("s2")),
      "visual-retention-pulse-edit",
    );
    const motionLook = plan.actions.filter(
      (action) =>
        action.kind === "apply-motion-preset" ||
        action.kind === "apply-media-look",
    );
    assert.deepEqual(
      motionLook.map((action) => {
        assert.ok(
          action.kind === "apply-motion-preset" ||
            action.kind === "apply-media-look",
        );
        return `${action.sceneId}:${action.mediaItemId}:${action.kind}`;
      }),
      [
        "s1:s1-a:apply-motion-preset",
        "s1:s1-a:apply-media-look",
        "s1:s1-b:apply-motion-preset",
        "s1:s1-b:apply-media-look",
        "s2:s2-a:apply-motion-preset",
        "s2:s2-a:apply-media-look",
        "s2:s2-b:apply-motion-preset",
        "s2:s2-b:apply-media-look",
      ],
    );
  });

  test("legacy single-media projection uses mediaItemId null", () => {
    const facts = projectStoryVisualRetentionPresetInput(
      scriptOf(
        legacyScene(
          "legacy",
          imageMedia("https://example.com/legacy.jpg", {
            motion: recipeMotion("slow-zoom-in", 0.2),
          }),
        ),
      ),
      { mixedMediaScenesEnabled: false },
    );
    assert.equal(facts.scenes[0]!.mediaTargets[0]!.mediaItemId, null);
  });

  test("duplicate scene IDs are invalid input with zero actions", () => {
    const facts = projectStoryVisualRetentionPresetInput(
      scriptOf(mixedSequenceScene("dup"), mixedSequenceScene("dup")),
      { mixedMediaScenesEnabled: true },
    );
    const plan = buildVisualRetentionPresetApplicationPlan({
      facts,
      presetId: "visual-retention-balanced-clarity",
      capabilities: allCapabilities(),
    });
    assert.equal(plan.status, "terminal");
    assert.equal(
      plan.terminalCode,
      VISUAL_RETENTION_PRESET_PLAN_TERMINAL_CODES.PRESET_PLAN_INVALID_INPUT,
    );
    assert.equal(plan.actions.length, 0);
    assert.equal(plan.skipped.length, 0);
    assert.equal(plan.conflicts.length, 0);
    assert.ok(plan.inputFingerprint.startsWith("vrp1:"));
    assert.ok(plan.planFingerprint.startsWith("vrp1:"));
  });

  test("keyframes skip only motion; look still plans; adjustments preserved", () => {
    const script = scriptOf(
      mixedSequenceScene("s1", {
        keyframesOnFirst: true,
        adjustmentsOnFirst: true,
      }),
    );
    const facts = projectStoryVisualRetentionPresetInput(script, {
      mixedMediaScenesEnabled: true,
    });
    assert.equal(
      facts.scenes[0]!.mediaTargets[0]!.hasFreeformVisualAdjustments,
      true,
    );
    const plan = buildVisualRetentionPresetApplicationPlan({
      facts,
      presetId: "visual-retention-pulse-edit",
      capabilities: allCapabilities(),
    });
    assert.ok(
      plan.skipped.some(
        (entry) =>
          entry.category === "skipped" &&
          entry.reason ===
            VISUAL_RETENTION_PRESET_PLAN_REASON_CODES.PRESET_PLAN_MANUAL_KEYFRAMES_PRESERVED &&
          typeof entry.message === "string" &&
          entry.message.length > 0,
      ),
    );
    assert.ok(
      plan.actions.some(
        (action) =>
          action.kind === "apply-media-look" && action.mediaItemId === "s1-a",
      ),
    );
  });

  test("same preset ID with divergent easing is not already-matching", () => {
    const scene = mixedSequenceScene("s1");
    const item = scene.visualSequence!.items[0]!;
    scene.visualSequence = {
      version: 1,
      items: [
        {
          ...item,
          media: {
            ...item.media,
            motion: {
              ...recipeMotion("sports-punch", 0.7)!,
              easing: "linear", // sports-punch default is ease-out
            },
          },
        },
        scene.visualSequence!.items[1]!,
      ],
    };
    const plan = planFor(scriptOf(scene), "visual-retention-pulse-edit");
    assert.ok(
      plan.actions.some(
        (action) =>
          action.kind === "apply-motion-preset" &&
          action.mediaItemId === "s1-a",
      ),
    );
  });

  test("exact recipe motion/look values already-match; no redundant writes", () => {
    const scene = mixedSequenceScene("s1");
    scene.visualSequence = {
      version: 1,
      items: scene.visualSequence!.items.map((item) => ({
        ...item,
        media: {
          ...item.media,
          motion: recipeMotion("sports-punch", 0.7),
          visualEffect: { version: 1, presetId: "vivid", intensity: 0.6 },
        },
      })),
    };
    const plan = planFor(scriptOf(scene), "visual-retention-pulse-edit");
    assert.equal(
      plan.actions.filter((action) => action.kind === "apply-motion-preset")
        .length,
      0,
    );
    assert.equal(
      plan.actions.filter((action) => action.kind === "apply-media-look")
        .length,
      0,
    );
    assert.ok(
      plan.skipped.some(
        (entry) =>
          entry.reason ===
            VISUAL_RETENTION_PRESET_PLAN_REASON_CODES.PRESET_PLAN_ALREADY_MATCHES &&
          entry.actionKind === "apply-motion-preset",
      ),
    );
  });

  test("engagement/outro conflicts never already-match; unrelated actions continue", () => {
    const script = scriptOf(mixedSequenceScene("s1"), mixedSequenceScene("s2"));
    script.visualRetentionExtensions = {
      version: 1,
      engagementOverlaysBySceneId: {
        s2: [
          {
            version: 1,
            id: "existing",
            kind: "like",
            position: "top-left",
            startOffsetMs: 7000,
            durationMs: 2500,
            presetId: "compact-pill-v1",
          },
        ],
      },
      shortForgeBrandSting: {
        version: 1,
        enabled: true,
        title: "ShortForge Studio",
        durationMs: 2000,
        presetId: "shortforge-studio-outro-v1",
        narrationPolicy: "none",
        captionPolicy: "none",
        playbackSpeedPolicy: "fixed",
      },
    };
    const plan = planFor(script, "visual-retention-share-ready");
    assert.equal(plan.summary.addEngagementCount, 0);
    assert.equal(plan.summary.enableBrandStingCount, 0);
    assert.ok(
      plan.conflicts.every(
        (entry) =>
          entry.category === "conflict" &&
          entry.reason !==
            VISUAL_RETENTION_PRESET_PLAN_REASON_CODES.PRESET_PLAN_ALREADY_MATCHES,
      ),
    );
    assert.ok(plan.summary.suggestPacingCount >= 1);
    assert.ok(plan.summary.applyMotionCount >= 1);
    assert.ok(plan.summary.applyLookCount >= 1);
  });

  test("malformed engagement/outro do not false-conflict", () => {
    const script = scriptOf(mixedSequenceScene("s1"), mixedSequenceScene("s2"));
    script.visualRetentionExtensions = {
      version: 1,
      engagementOverlaysBySceneId: {
        s2: [{ version: 1, kind: "subscribe" } as never],
      },
      shortForgeBrandSting: { version: 1, enabled: true } as never,
    };
    const plan = planFor(script, "visual-retention-share-ready");
    assert.equal(plan.summary.addEngagementCount, 1);
    assert.equal(plan.summary.enableBrandStingCount, 1);
    assert.equal(plan.conflicts.length, 0);
  });

  test("typed entries include category, code, action kind, target, message", () => {
    const plan = planFor(
      scriptOf(sceneStub({ id: "empty", media: undefined })),
      "visual-retention-balanced-clarity",
    );
    for (const entry of plan.skipped) {
      assert.equal(entry.category, "skipped");
      assert.ok(entry.reason.startsWith("PRESET_PLAN_"));
      assert.ok(typeof entry.actionKind === "string");
      assert.ok(typeof entry.message === "string" && entry.message.length > 0);
    }
    assert.equal(plan.summary.skippedCount, plan.skipped.length);
    assert.equal(plan.summary.actionCount, plan.actions.length);
    assert.equal(plan.summary.conflictCount, plan.conflicts.length);
    assert.equal(plan.summary.warningCount, plan.warnings.length);
  });

  test("missing underlying capabilities skip only affected actions", () => {
    const plan = planFor(
      scriptOf(mixedSequenceScene("s1"), mixedSequenceScene("s2")),
      "visual-retention-share-ready",
      allCapabilities({
        visualBeatDensityEnabled: false,
        keyframedVisualEffectsEnabled: false,
        engagementOverlaysEnabled: false,
        shortForgeBrandStingEnabled: false,
      }),
    );
    assert.equal(plan.summary.suggestPacingCount, 0);
    assert.equal(plan.summary.applyLookCount, 0);
    assert.equal(plan.summary.addEngagementCount, 0);
    assert.equal(plan.summary.enableBrandStingCount, 0);
    assert.ok(plan.summary.applyMotionCount >= 1);
  });

  test("terminal readiness/off/unknown with zero actions", () => {
    const script = scriptOf(mixedSequenceScene("s1"));
    for (const [capabilities, code] of [
      [
        allCapabilities({ ready: false }),
        VISUAL_RETENTION_PRESET_PLAN_TERMINAL_CODES.PRESET_PLAN_CAPABILITIES_NOT_READY,
      ],
      [
        allCapabilities({ visualRetentionPresetsEnabled: false }),
        VISUAL_RETENTION_PRESET_PLAN_TERMINAL_CODES.PRESET_PLAN_CAPABILITY_OFF,
      ],
    ] as const) {
      const plan = planFor(
        script,
        "visual-retention-balanced-clarity",
        capabilities,
      );
      assert.equal(plan.status, "terminal");
      assert.equal(plan.terminalCode, code);
      assert.equal(plan.actions.length, 0);
      assert.ok(typeof plan.terminalMessage === "string");
    }
  });

  test("idempotency and deep immutability", () => {
    const script = scriptOf(
      mixedSequenceScene("s1"),
      mixedSequenceScene("s2"),
    );
    const before = JSON.stringify(script);
    const factsA = projectStoryVisualRetentionPresetInput(script, {
      mixedMediaScenesEnabled: true,
    });
    const planA = buildVisualRetentionPresetApplicationPlan({
      facts: factsA,
      presetId: "visual-retention-share-ready",
      capabilities: allCapabilities(),
    });
    try {
      (planA.actions as VisualRetentionPresetPlanActionV1[]).push({
        kind: "enable-brand-sting",
        durationMs: 3000,
      });
    } catch {
      // frozen
    }
    const planB = buildVisualRetentionPresetApplicationPlan({
      facts: projectStoryVisualRetentionPresetInput(script, {
        mixedMediaScenesEnabled: true,
      }),
      presetId: "visual-retention-share-ready",
      capabilities: allCapabilities(),
    });
    assert.equal(JSON.stringify(planA), JSON.stringify(planB));
    assert.equal(Object.isFrozen(planA), true);
    assert.equal(Object.isFrozen(factsA), true);
    assert.equal(JSON.stringify(script), before);
    assert.equal("generatedAtIso" in planA, false);
  });

  test("dependency direction and scope", () => {
    const planner = readSrc(
      "src/features/visual-retention-presets/domain/build-visual-retention-preset-plan.ts",
    );
    const fingerprint = readSrc(
      "src/features/visual-retention-presets/domain/visual-retention-preset-fingerprint.ts",
    );
    const adapter = readSrc(
      "src/features/visual-retention-presets/adapters/project-story-visual-retention-preset-input.ts",
    );
    for (const src of [planner, fingerprint]) {
      assert.doesNotMatch(src, /from\s+["']react["']/);
      assert.doesNotMatch(src, /from\s+["']@\/features\/story/);
      assert.doesNotMatch(src, /StoryWorkspace|process\.env|Date\.now|Math\.random/);
      assert.doesNotMatch(src, /\.commands|localStorage|headless-renderer/);
    }
    assert.doesNotMatch(adapter, /\.commands|suggestVisualBeatPlan|applyVisualBeatPlan/);
    assert.doesNotMatch(adapter, /from\s+["']@\/features\/mixed-media-scenes["']/);
    assert.match(adapter, /project-visual-sequence/);
    assert.match(planner, /walk backward|Closing-scene engagement policy/i);

    for (const file of [
      "src/features/story/types/story.types.ts",
      "src/features/export/domain/export-manifest.types.ts",
      "src/app/api/visual-retention/capabilities/route.ts",
      "src/components/StoryWorkspace.tsx",
    ] as const) {
      assert.doesNotMatch(
        readSrc(file),
        /buildVisualRetentionPresetApplicationPlan|projectStoryVisualRetentionPresetInput/,
      );
    }

    const creatorRoot = path.join(
      process.cwd(),
      "src/features/creator-templates",
    );
    function walk(dir: string): string[] {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
      }
      return out;
    }
    for (const file of walk(creatorRoot)) {
      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /visual-retention-presets/,
      );
    }
  });

  console.log(`\nvisual-retention-preset-plan: ${passed} PASS\n`);
}

main();
