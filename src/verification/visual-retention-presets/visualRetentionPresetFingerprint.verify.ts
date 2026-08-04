/**
 * Visual Retention Preset fingerprint verification (hardened Slice 3).
 * Run via: npm run test:visual-retention-presets-plan
 */

import assert from "node:assert/strict";

import { getMediaMotionPreset } from "@/features/media-motion/media-motion.presets";
import {
  buildVisualRetentionPresetApplicationPlan,
  fingerprintVisualRetentionPresetCanonicalPayload,
  projectStoryVisualRetentionPresetInput,
  stableStringifyVisualRetentionPresetValue,
  VISUAL_RETENTION_PRESET_FINGERPRINT_PREFIX,
  VISUAL_RETENTION_PRESET_PLAN_TERMINAL_CODES,
  type VisualRetentionPresetPlanningCapabilities,
  type VisualRetentionPresetProjectFactsV1,
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

function caps(
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

function mixedScene(id: string): FootieScene {
  return {
    id,
    start: 0,
    end: 10,
    duration: 10,
    startMs: 0,
    endMs: 10_000,
    durationMs: 10_000,
    subtitle: "Fallback subtitle",
    narration: "One. Two. Three.",
    media: imageMedia("https://example.com/ignored.jpg"),
    visualSequence: {
      version: 1,
      items: [
        {
          id: `${id}-a`,
          media: imageMedia("https://example.com/a.jpg"),
          startOffsetMs: 0,
          durationMs: 4000,
        },
        {
          id: `${id}-b`,
          media: videoMedia("https://example.com/b.mp4"),
          startOffsetMs: 4000,
          durationMs: 6000,
        },
      ],
    },
  };
}

function scriptOf(...scenes: FootieScene[]): FootieScript {
  return {
    title: "fingerprint fixture",
    narration: "Story",
    totalDuration: 20,
    scenes,
  };
}

function planFingerprint(
  script: FootieScript,
  capabilities: VisualRetentionPresetPlanningCapabilities = caps(),
  presetId = "visual-retention-pulse-edit",
) {
  const facts = projectStoryVisualRetentionPresetInput(script, {
    mixedMediaScenesEnabled: capabilities.mixedMediaScenesEnabled,
  });
  const plan = buildVisualRetentionPresetApplicationPlan({
    facts,
    presetId,
    capabilities,
  });
  return { facts, plan };
}

function main(): void {
  console.log("\nvisual-retention-preset-fingerprint\n");

  test("prefix, lowercase base36, sorted-key stability", () => {
    const a = { z: 1, a: { b: 2, a: 3 }, list: [1, 2] };
    const b = { list: [1, 2], a: { a: 3, b: 2 }, z: 1 };
    assert.equal(
      stableStringifyVisualRetentionPresetValue(a),
      stableStringifyVisualRetentionPresetValue(b),
    );
    const fa = fingerprintVisualRetentionPresetCanonicalPayload(a);
    assert.equal(fa, fingerprintVisualRetentionPresetCanonicalPayload(b));
    assert.match(fa, /^vrp1:[0-9a-z]+$/);
    assert.ok(fa.startsWith(VISUAL_RETENTION_PRESET_FINGERPRINT_PREFIX));
  });

  test("undefined omitted vs null retained", () => {
    const withNull = stableStringifyVisualRetentionPresetValue({ a: null, b: 1 });
    const withUndefined = stableStringifyVisualRetentionPresetValue({
      a: undefined,
      b: 1,
    });
    assert.notEqual(withNull, withUndefined);
    assert.match(withNull, /"a":null/);
    assert.doesNotMatch(withUndefined, /"a"/);
  });

  test("non-finite numbers normalize deterministically", () => {
    const left = fingerprintVisualRetentionPresetCanonicalPayload({
      n: Number.NaN,
    });
    const right = fingerprintVisualRetentionPresetCanonicalPayload({
      n: Number.POSITIVE_INFINITY,
    });
    assert.equal(left, right);
    assert.equal(
      left,
      fingerprintVisualRetentionPresetCanonicalPayload({ n: null }),
    );
  });

  test("mixed-media capability true versus false changes fingerprint", () => {
    const script = scriptOf(mixedScene("s1"));
    const on = planFingerprint(script, caps({ mixedMediaScenesEnabled: true }));
    const off = planFingerprint(
      script,
      caps({ mixedMediaScenesEnabled: false }),
    );
    assert.notEqual(on.plan.inputFingerprint, off.plan.inputFingerprint);
  });

  test("media order change changes fingerprints", () => {
    const base = scriptOf(mixedScene("s1"));
    const first = base.scenes[0]!.visualSequence!.items[0]!;
    const second = base.scenes[0]!.visualSequence!.items[1]!;
    const reordered: FootieScript = {
      ...base,
      scenes: [
        {
          ...base.scenes[0]!,
          visualSequence: {
            version: 1,
            items: [
              {
                ...second,
                id: `${second.id}-first`,
                startOffsetMs: 0,
                durationMs: 6000,
              },
              {
                ...first,
                id: `${first.id}-second`,
                startOffsetMs: 6000,
                durationMs: 4000,
              },
            ],
          },
        },
      ],
    };
    assert.notEqual(
      planFingerprint(base).plan.inputFingerprint,
      planFingerprint(reordered).plan.inputFingerprint,
    );
  });

  test("motion enabled/easing/intensity changes fingerprint", () => {
    const base = scriptOf(mixedScene("s1"));
    const withMotion: FootieScript = {
      ...base,
      scenes: [
        {
          ...base.scenes[0]!,
          visualSequence: {
            version: 1,
            items: [
              {
                ...base.scenes[0]!.visualSequence!.items[0]!,
                media: {
                  ...base.scenes[0]!.visualSequence!.items[0]!.media,
                  motion: recipeMotion("gentle-drift", 0.5),
                },
              },
              base.scenes[0]!.visualSequence!.items[1]!,
            ],
          },
        },
      ],
    };
    const divergentEasing: FootieScript = {
      ...withMotion,
      scenes: [
        {
          ...withMotion.scenes[0]!,
          visualSequence: {
            version: 1,
            items: [
              {
                ...withMotion.scenes[0]!.visualSequence!.items[0]!,
                media: {
                  ...withMotion.scenes[0]!.visualSequence!.items[0]!.media,
                  motion: {
                    ...recipeMotion("gentle-drift", 0.5)!,
                    easing: "linear",
                  },
                },
              },
              withMotion.scenes[0]!.visualSequence!.items[1]!,
            ],
          },
        },
      ],
    };
    const left = planFingerprint(base).plan.inputFingerprint;
    const mid = planFingerprint(withMotion).plan.inputFingerprint;
    const right = planFingerprint(divergentEasing).plan.inputFingerprint;
    assert.notEqual(left, mid);
    assert.notEqual(mid, right);
  });

  test("keyframes added/removed and look intensity change fingerprints", () => {
    const base = scriptOf(mixedScene("s1"));
    const withKeyframes: FootieScript = {
      ...base,
      scenes: [
        {
          ...base.scenes[0]!,
          visualSequence: {
            version: 1,
            items: [
              {
                ...base.scenes[0]!.visualSequence!.items[0]!,
                media: {
                  ...base.scenes[0]!.visualSequence!.items[0]!.media,
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
                        offsetMs: 1000,
                        x: 5,
                        y: 0,
                        scale: 1.05,
                        rotation: 0,
                        opacity: 1,
                        easing: "linear",
                      },
                    ],
                  },
                },
              },
              base.scenes[0]!.visualSequence!.items[1]!,
            ],
          },
        },
      ],
    };
    const withLook: FootieScript = {
      ...base,
      scenes: [
        {
          ...base.scenes[0]!,
          visualSequence: {
            version: 1,
            items: [
              {
                ...base.scenes[0]!.visualSequence!.items[0]!,
                media: {
                  ...base.scenes[0]!.visualSequence!.items[0]!.media,
                  visualEffect: {
                    version: 1,
                    presetId: "cinematic",
                    intensity: 0.4,
                  },
                },
              },
              base.scenes[0]!.visualSequence!.items[1]!,
            ],
          },
        },
      ],
    };
    const lookIntensity: FootieScript = {
      ...withLook,
      scenes: [
        {
          ...withLook.scenes[0]!,
          visualSequence: {
            version: 1,
            items: [
              {
                ...withLook.scenes[0]!.visualSequence!.items[0]!,
                media: {
                  ...withLook.scenes[0]!.visualSequence!.items[0]!.media,
                  visualEffect: {
                    version: 1,
                    presetId: "cinematic",
                    intensity: 0.41,
                  },
                },
              },
              withLook.scenes[0]!.visualSequence!.items[1]!,
            ],
          },
        },
      ],
    };
    const left = planFingerprint(base).plan.inputFingerprint;
    assert.notEqual(left, planFingerprint(withKeyframes).plan.inputFingerprint);
    assert.notEqual(
      planFingerprint(withLook).plan.inputFingerprint,
      planFingerprint(lookIntensity).plan.inputFingerprint,
    );
  });

  test("engagement target scene and brand-sting config change fingerprints", () => {
    const base = scriptOf(mixedScene("s1"), mixedScene("s2"));
    const withEngagement: FootieScript = {
      ...base,
      visualRetentionExtensions: {
        version: 1,
        engagementOverlaysBySceneId: {
          s2: [
            {
              version: 1,
              id: "cta",
              kind: "subscribe",
              position: "top-right",
              startOffsetMs: 7000,
              durationMs: 2500,
              presetId: "compact-pill-v1",
            },
          ],
        },
      },
    };
    const otherScene: FootieScript = {
      ...base,
      visualRetentionExtensions: {
        version: 1,
        engagementOverlaysBySceneId: {
          s1: [
            {
              version: 1,
              id: "cta",
              kind: "subscribe",
              position: "top-right",
              startOffsetMs: 7000,
              durationMs: 2500,
              presetId: "compact-pill-v1",
            },
          ],
        },
      },
    };
    const withOutro: FootieScript = {
      ...base,
      visualRetentionExtensions: {
        version: 1,
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
      },
    };
    const outroDuration: FootieScript = {
      ...withOutro,
      visualRetentionExtensions: {
        version: 1,
        shortForgeBrandSting: {
          version: 1,
          enabled: true,
          title: "ShortForge Studio",
          durationMs: 3000,
          presetId: "shortforge-studio-outro-v1",
          narrationPolicy: "none",
          captionPolicy: "none",
          playbackSpeedPolicy: "fixed",
        },
      },
    };
    const share = "visual-retention-share-ready";
    assert.notEqual(
      planFingerprint(base, caps(), share).plan.inputFingerprint,
      planFingerprint(withEngagement, caps(), share).plan.inputFingerprint,
    );
    assert.notEqual(
      planFingerprint(withEngagement, caps(), share).plan.inputFingerprint,
      planFingerprint(otherScene, caps(), share).plan.inputFingerprint,
    );
    assert.notEqual(
      planFingerprint(withOutro, caps(), share).plan.inputFingerprint,
      planFingerprint(outroDuration, caps(), share).plan.inputFingerprint,
    );
  });

  test("excluded UI/timestamp fields do not affect fingerprints", () => {
    const baseFacts = projectStoryVisualRetentionPresetInput(
      scriptOf(mixedScene("s1")),
      { mixedMediaScenesEnabled: true },
    );
    const decorated = {
      ...baseFacts,
      generatedAtIso: "2020-01-01T00:00:00.000Z",
      uiSelection: { sceneId: "s1", focused: true },
    } as VisualRetentionPresetProjectFactsV1 & {
      generatedAtIso: string;
      uiSelection: { sceneId: string; focused: boolean };
    };
    const planA = buildVisualRetentionPresetApplicationPlan({
      facts: baseFacts,
      presetId: "visual-retention-balanced-clarity",
      capabilities: caps(),
    });
    const planB = buildVisualRetentionPresetApplicationPlan({
      facts: decorated,
      presetId: "visual-retention-balanced-clarity",
      capabilities: caps(),
    });
    assert.equal(planA.inputFingerprint, planB.inputFingerprint);
    assert.doesNotMatch(JSON.stringify(planA), /generatedAtIso|generatedAt/);
  });

  test("invalid non-finite facts → typed invalid plan with stable fingerprints", () => {
    const facts = projectStoryVisualRetentionPresetInput(
      scriptOf(mixedScene("s1")),
      { mixedMediaScenesEnabled: true },
    );
    const broken = {
      ...facts,
      scenes: [
        {
          ...facts.scenes[0]!,
          sceneDurationMs: Number.NaN,
        },
      ],
    };
    const plan = buildVisualRetentionPresetApplicationPlan({
      facts: broken,
      presetId: "visual-retention-balanced-clarity",
      capabilities: caps(),
    });
    assert.equal(plan.status, "terminal");
    assert.equal(
      plan.terminalCode,
      VISUAL_RETENTION_PRESET_PLAN_TERMINAL_CODES.PRESET_PLAN_INVALID_INPUT,
    );
    assert.equal(plan.actions.length, 0);
    assert.match(plan.inputFingerprint, /^vrp1:[0-9a-z]+$/);
    assert.match(plan.planFingerprint, /^vrp1:[0-9a-z]+$/);
    const again = buildVisualRetentionPresetApplicationPlan({
      facts: broken,
      presetId: "visual-retention-balanced-clarity",
      capabilities: caps(),
    });
    assert.equal(plan.inputFingerprint, again.inputFingerprint);
    assert.equal(plan.planFingerprint, again.planFingerprint);
  });

  test("stable repeated JSON/plan output", () => {
    const script = scriptOf(mixedScene("s1"), mixedScene("s2"));
    const a = planFingerprint(script, caps(), "visual-retention-share-ready");
    const b = planFingerprint(script, caps(), "visual-retention-share-ready");
    assert.equal(JSON.stringify(a.plan), JSON.stringify(b.plan));
  });

  console.log(`\nvisual-retention-preset-fingerprint: ${passed} PASS\n`);
}

main();
