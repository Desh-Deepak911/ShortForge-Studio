/**
 * Visual Retention Preset catalog verification.
 * Run via: npm run test:visual-retention-presets-catalog
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  BRAND_STING_DURATION_MS,
  isBrandStingDurationMs,
} from "@/features/brand-sting/domain/brand-sting.presets";
import {
  ENGAGEMENT_OVERLAY_KIND_OPTIONS,
  ENGAGEMENT_OVERLAY_MAX_DURATION_MS,
  ENGAGEMENT_OVERLAY_MIN_DURATION_MS,
  ENGAGEMENT_OVERLAY_POSITION_OPTIONS,
} from "@/features/engagement-overlays/domain/engagement-overlay.presets";
import { MEDIA_MOTION_PRESETS } from "@/features/media-motion/media-motion.presets";
import {
  isMediaVisualEffectPresetId,
  MEDIA_VISUAL_EFFECT_PRESETS,
} from "@/features/media-motion/domain/media-visual-effect-presets";
import {
  EXPORT_BROWSER_SUPPORTED_RENDERER_CAPABILITIES,
} from "@/features/export/domain/export-manifest.types";
import { HEADLESS_WORKER_PHASE3_SUPPORTED } from "@/features/headless-renderer/worker/runtime/worker-types";
import { VISUAL_RETENTION_CAPABILITY_IDS } from "@/features/visual-retention/domain/visual-retention-capabilities";
import {
  assertValidVisualRetentionPresetRecipe,
  deriveVisualRetentionPresetAuthoringCapabilities,
  getVisualRetentionPresetById,
  getVisualRetentionPresetCatalogVersion,
  isPromotionalVisualRetentionPreset,
  isVisualRetentionPresetId,
  listVisualRetentionPresets,
  VISUAL_RETENTION_PRESET_CATALOG_VERSION,
  VISUAL_RETENTION_PRESET_IDS,
  type VisualRetentionPresetDefinitionV1,
  type VisualRetentionPresetId,
} from "@/features/visual-retention-presets";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function assertDeepFrozen(value: unknown, label: string): void {
  if (value === null || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true, `${label} must be frozen`);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      assertDeepFrozen(value[i], `${label}[${i}]`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    assertDeepFrozen(child, `${label}.${key}`);
  }
}

function expectedCapabilities(ids: readonly string[]): readonly string[] {
  return VISUAL_RETENTION_CAPABILITY_IDS.filter((id) => ids.includes(id));
}

const REGISTERED_MOTION_IDS = MEDIA_MOTION_PRESETS.map((preset) => preset.id);

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function main(): void {
  console.log("\nvisual-retention-preset-catalog\n");

  test("exactly four presets in stable order with stable IDs", () => {
    assert.equal(getVisualRetentionPresetCatalogVersion(), 1);
    assert.equal(VISUAL_RETENTION_PRESET_CATALOG_VERSION, 1);
    const list = listVisualRetentionPresets();
    assert.equal(list.length, 4);
    assert.deepEqual(
      list.map((preset) => preset.id),
      [...VISUAL_RETENTION_PRESET_IDS],
    );
    assert.deepEqual(
      [...VISUAL_RETENTION_PRESET_IDS],
      [
        "visual-retention-balanced-clarity",
        "visual-retention-pulse-edit",
        "visual-retention-cinematic-hold",
        "visual-retention-share-ready",
      ],
    );
    assert.equal(isVisualRetentionPresetId("none"), false);
    assert.equal(getVisualRetentionPresetById("none"), null);
  });

  test("exact copy and recipe values for every built-in preset", () => {
    const balanced = getVisualRetentionPresetById(
      "visual-retention-balanced-clarity",
    )!;
    assert.equal(balanced.title, "Balanced Clarity");
    assert.equal(
      balanced.description,
      "Clear, moderate pacing and gentle motion without promotional additions.",
    );
    assert.equal(
      balanced.recommendedFor,
      "most stories, explainers, balanced narration",
    );
    assert.equal(
      balanced.previewCopy,
      "Balanced pacing and light motion. Existing looks, prompts, and outro stay unchanged.",
    );
    assert.deepEqual(balanced.recipe, {
      version: 1,
      pacing: { mode: "suggest", density: "balanced" },
      motion: {
        mode: "apply-if-no-keyframes",
        presetId: "slow-zoom-in",
        intensity: 0.45,
      },
      look: { mode: "preserve" },
      engagement: { mode: "preserve" },
      outro: { mode: "preserve" },
    });
    assert.equal("presetId" in balanced.recipe.look, false);
    assert.equal("intensity" in balanced.recipe.look, false);

    const pulse = getVisualRetentionPresetById("visual-retention-pulse-edit")!;
    assert.equal(pulse.title, "Pulse Edit");
    assert.deepEqual(pulse.recipe.motion, {
      mode: "apply-if-no-keyframes",
      presetId: "sports-punch",
      intensity: 0.7,
    });
    assert.deepEqual(pulse.recipe.look, {
      mode: "apply",
      presetId: "vivid",
      intensity: 0.6,
    });

    const cinematic = getVisualRetentionPresetById(
      "visual-retention-cinematic-hold",
    )!;
    assert.equal(cinematic.title, "Cinematic Hold");
    assert.deepEqual(cinematic.recipe.look, {
      mode: "apply",
      presetId: "cinematic",
      intensity: 0.5,
    });

    const share = getVisualRetentionPresetById(
      "visual-retention-share-ready",
    )!;
    assert.equal(share.title, "Share Ready");
    assert.deepEqual(share.recipe.engagement, {
      mode: "add-if-absent",
      kind: "subscribe",
      position: "top-right",
      durationMs: 2500,
      timingPolicy: "closing-scene",
    });
    assert.deepEqual(share.recipe.outro, {
      mode: "enable-if-absent",
      durationMs: 2500,
    });
  });

  test("existing-registry validation without static fallback helpers", () => {
    assert.ok(REGISTERED_MOTION_IDS.includes("slow-zoom-in"));
    assert.ok(REGISTERED_MOTION_IDS.includes("sports-punch"));
    assert.ok(REGISTERED_MOTION_IDS.includes("gentle-drift"));
    assert.ok(!REGISTERED_MOTION_IDS.includes("not-a-motion"));

    // Prove getMediaMotionPreset would silently fall back — catalog tests must
    // not use it for membership checks.
    const motionSrc = readSrc(
      "src/features/media-motion/media-motion.presets.ts",
    );
    assert.match(motionSrc, /return PRESET_BY_ID\.get\("static"\)/);

    for (const preset of listVisualRetentionPresets()) {
      assert.ok(
        REGISTERED_MOTION_IDS.includes(preset.recipe.motion.presetId),
        preset.recipe.motion.presetId,
      );
      assert.notEqual(preset.recipe.motion.presetId, "static");
      assert.notEqual(preset.recipe.motion.presetId, "custom");
      assert.ok(
        Number.isFinite(preset.recipe.motion.intensity) &&
          preset.recipe.motion.intensity >= 0 &&
          preset.recipe.motion.intensity <= 1,
      );

      const look = preset.recipe.look;
      if (look.mode === "apply") {
        assert.equal(isMediaVisualEffectPresetId(look.presetId), true);
        assert.notEqual(look.presetId, "none");
        assert.ok(
          MEDIA_VISUAL_EFFECT_PRESETS.some((entry) => entry.id === look.presetId),
        );
        assert.ok(look.intensity > 0 && look.intensity <= 1);
      }

      const engagement = preset.recipe.engagement;
      if (engagement.mode === "add-if-absent") {
        assert.ok(
          ENGAGEMENT_OVERLAY_KIND_OPTIONS.some(
            (option) => option.id === engagement.kind,
          ),
        );
        assert.ok(
          ENGAGEMENT_OVERLAY_POSITION_OPTIONS.some(
            (option) => option.id === engagement.position,
          ),
        );
        assert.ok(
          engagement.durationMs >= ENGAGEMENT_OVERLAY_MIN_DURATION_MS &&
            engagement.durationMs <= ENGAGEMENT_OVERLAY_MAX_DURATION_MS,
        );
      }

      const outro = preset.recipe.outro;
      if (outro.mode === "enable-if-absent") {
        assert.equal(isBrandStingDurationMs(outro.durationMs), true);
        assert.ok(
          (BRAND_STING_DURATION_MS as readonly number[]).includes(
            outro.durationMs,
          ),
        );
      }

      assertValidVisualRetentionPresetRecipe(preset.recipe);
    }

    assert.throws(() =>
      assertValidVisualRetentionPresetRecipe({
        version: 1,
        pacing: { mode: "suggest", density: "balanced" },
        motion: {
          mode: "apply-if-no-keyframes",
          presetId: "static" as "slow-zoom-in",
          intensity: 0.5,
        },
        look: { mode: "preserve" },
        engagement: { mode: "preserve" },
        outro: { mode: "preserve" },
      }),
    );
    assert.throws(() =>
      assertValidVisualRetentionPresetRecipe({
        version: 1,
        pacing: { mode: "suggest", density: "balanced" },
        motion: {
          mode: "apply-if-no-keyframes",
          presetId: "slow-zoom-in",
          intensity: 0.5,
        },
        look: {
          mode: "apply",
          presetId: "none" as "vivid",
          intensity: 0.5,
        },
        engagement: { mode: "preserve" },
        outro: { mode: "preserve" },
      }),
    );
  });

  test("only Share Ready is promotional; copy boundary holds", () => {
    for (const preset of listVisualRetentionPresets()) {
      assert.equal(
        isPromotionalVisualRetentionPreset(preset),
        preset.id === "visual-retention-share-ready",
        preset.id,
      );
      const blob = [
        preset.title,
        preset.description,
        preset.recommendedFor,
        preset.previewCopy,
      ].join(" ");
      assert.doesNotMatch(
        blob,
        /automatic timing apply|auto-?apply|\bAI\b|face detection|reorder media|music mix|caption style/i,
      );
      if (preset.id !== "visual-retention-share-ready") {
        assert.doesNotMatch(blob, /subscribe prompt|ShortForge Studio outro/i);
        assert.equal(preset.recipe.engagement.mode, "preserve");
        assert.equal(preset.recipe.outro.mode, "preserve");
      }
    }
    const balanced = getVisualRetentionPresetById(
      "visual-retention-balanced-clarity",
    )!;
    assert.match(
      balanced.previewCopy,
      /Existing looks, prompts, and outro stay unchanged/,
    );
    assert.equal(balanced.recipe.look.mode, "preserve");
  });

  test("preservation semantics: never-overwrite vs recipe-changed fields", () => {
    for (const preset of listVisualRetentionPresets()) {
      assert.equal(preset.preserves.narrationAndVoice, true);
      assert.equal(preset.preserves.musicAudioMixer, true);
      assert.equal(preset.preserves.sceneDurations, true);
      assert.equal(preset.preserves.mediaOrdering, true);
      assert.equal(preset.preserves.manualFraming, true);
      assert.equal(preset.preserves.freeformVisualAdjustments, true);
      assert.equal(preset.preserves.captionStyleAndAnimation, true);
      assert.equal(preset.preserves.subjectFocus, true);
      assert.equal(preset.preserves.sourceQualityProvenance, true);
      assert.equal(preset.preserves.subjectAwareFramingProvenance, true);
      assert.equal(preset.preserves.customKeyframes, true);
      assert.equal(preset.preserves.engagementOverlays, true);
      assert.equal(preset.preserves.shortForgeOutro, true);
      // Must not falsely claim to preserve recipe-owned knobs.
      assert.equal(
        "pacingDensity" in preset.preserves ||
          "motionPreset" in preset.preserves ||
          "mediaLook" in preset.preserves ||
          "legacyMotion" in preset.preserves,
        false,
      );
    }
  });

  test("capability derivation is recipe-driven, deduped, canonical, non-inferring", () => {
    const catalogSrc = readSrc(
      "src/features/visual-retention-presets/domain/visual-retention-preset.catalog.ts",
    );
    assert.match(catalogSrc, /deriveVisualRetentionPresetAuthoringCapabilities\(recipe\)/);
    assert.doesNotMatch(
      catalogSrc,
      /requiredAuthoringCapabilities:\s*\[/,
    );

    const expected: Record<VisualRetentionPresetId, readonly string[]> = {
      "visual-retention-balanced-clarity": expectedCapabilities([
        "visual-retention-presets-v1",
        "visual-beat-density-v1",
      ]),
      "visual-retention-pulse-edit": expectedCapabilities([
        "visual-retention-presets-v1",
        "visual-beat-density-v1",
        "keyframed-visual-effects-v1",
      ]),
      "visual-retention-cinematic-hold": expectedCapabilities([
        "visual-retention-presets-v1",
        "visual-beat-density-v1",
        "keyframed-visual-effects-v1",
      ]),
      "visual-retention-share-ready": expectedCapabilities([
        "visual-retention-presets-v1",
        "visual-beat-density-v1",
        "keyframed-visual-effects-v1",
        "engagement-overlays-v1",
        "shortforge-brand-sting-v1",
      ]),
    };

    for (const preset of listVisualRetentionPresets()) {
      assert.deepEqual(
        [...preset.requiredAuthoringCapabilities],
        [...expected[preset.id]],
        preset.id,
      );
      assert.deepEqual(
        [...deriveVisualRetentionPresetAuthoringCapabilities(preset.recipe)],
        [...preset.requiredAuthoringCapabilities],
      );
      assert.ok(
        preset.requiredAuthoringCapabilities.includes(
          "visual-retention-presets-v1",
        ),
      );
      // Motion alone does not add a capability when look/engagement/outro absent.
      if (preset.id === "visual-retention-balanced-clarity") {
        assert.equal(
          preset.requiredAuthoringCapabilities.includes(
            "keyframed-visual-effects-v1",
          ),
          false,
        );
      }
    }

    // Inferrence guard: look-only recipe does not invent engagement/sting.
    const lookOnly = deriveVisualRetentionPresetAuthoringCapabilities({
      version: 1,
      pacing: { mode: "suggest", density: "balanced" },
      motion: {
        mode: "apply-if-no-keyframes",
        presetId: "slow-zoom-in",
        intensity: 0.5,
      },
      look: { mode: "apply", presetId: "vivid", intensity: 0.5 },
      engagement: { mode: "preserve" },
      outro: { mode: "preserve" },
    });
    assert.deepEqual(
      [...lookOnly],
      expectedCapabilities([
        "visual-retention-presets-v1",
        "visual-beat-density-v1",
        "keyframed-visual-effects-v1",
      ]),
    );
  });

  test("deep immutability and detached list/lookup surfaces", () => {
    const a = listVisualRetentionPresets();
    const b = listVisualRetentionPresets();
    assert.notEqual(a, b);
    assertDeepFrozen(a, "list-a");
    assertDeepFrozen(b, "list-b");
    for (const preset of a) {
      assertDeepFrozen(preset, preset.id);
      assertDeepFrozen(preset.recipe, `${preset.id}.recipe`);
      assertDeepFrozen(preset.preserves, `${preset.id}.preserves`);
      assertDeepFrozen(
        preset.requiredAuthoringCapabilities,
        `${preset.id}.caps`,
      );
    }

    const mutable = a as VisualRetentionPresetDefinitionV1[];
    const beforeLen = a.length;
    try {
      mutable.push(a[0]!);
    } catch {
      // strict engines
    }
    assert.equal(a.length, beforeLen);
    assert.equal(listVisualRetentionPresets().length, 4);

    const first = a[0]!;
    const title = first.title;
    try {
      (first as { title: string }).title = "mutated";
    } catch {
      // strict engines
    }
    assert.equal(first.title, title);
    assert.equal(getVisualRetentionPresetById(first.id)!.title, title);

    try {
      (first.requiredAuthoringCapabilities as string[]).push("narration-timing-v1");
    } catch {
      // strict engines
    }
    assert.equal(
      getVisualRetentionPresetById(first.id)!.requiredAuthoringCapabilities
        .length,
      first.requiredAuthoringCapabilities.length,
    );
  });

  test("determinism and JSON serialization stability", () => {
    const s1 = JSON.stringify(listVisualRetentionPresets());
    const s2 = JSON.stringify(listVisualRetentionPresets());
    const s3 = JSON.stringify(
      VISUAL_RETENTION_PRESET_IDS.map((id) => getVisualRetentionPresetById(id)),
    );
    assert.equal(s1, s2);
    assert.equal(JSON.stringify(JSON.parse(s1)), s1);
    assert.ok(s3.includes("visual-retention-balanced-clarity"));
    assert.doesNotMatch(s1, /function|undefined|"generatedAt"|Map|Set/);
    for (const preset of listVisualRetentionPresets()) {
      assert.equal(
        JSON.stringify(getVisualRetentionPresetById(preset.id)),
        JSON.stringify(preset),
      );
    }
  });

  test("unknown IDs fail closed without fallback", () => {
    assert.equal(getVisualRetentionPresetById("unknown"), null);
    assert.equal(getVisualRetentionPresetById(""), null);
    assert.equal(getVisualRetentionPresetById(null), null);
    assert.equal(getVisualRetentionPresetById("visual-retention-none"), null);
    assert.equal(isVisualRetentionPresetId("Share Ready"), false);
  });

  test("dependency direction and runtime isolation", () => {
    for (const file of [
      "src/features/visual-retention-presets/domain/visual-retention-preset.types.ts",
      "src/features/visual-retention-presets/domain/visual-retention-preset.catalog.ts",
      "src/features/visual-retention-presets/index.ts",
    ] as const) {
      assert.doesNotMatch(
        file,
        /sprint|12[Ff]|slice|checkpoint|hardening|followup|final/i,
      );
      const src = readSrc(file);
      assert.doesNotMatch(src, /from\s+["']react["']/);
      assert.doesNotMatch(src, /VisualRetentionCapabilities|StoryWorkspace/);
      assert.doesNotMatch(src, /process\.env|Date\.now|Math\.random|fetch\(/);
      assert.doesNotMatch(src, /creator-templates|prepare-export|headless-renderer\/worker/);
      assert.doesNotMatch(src, /normalizeStory|localStorage/);
      // Catalog/types remain command-free; barrel may re-export Apply/Undo commands.
      if (!file.endsWith("/index.ts")) {
        assert.doesNotMatch(src, /\.commands/);
      }
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

    for (const file of [
      "src/features/story/types/story.types.ts",
      "src/features/export/domain/export-manifest.types.ts",
      "src/features/export/domain/build-export-manifest.ts",
      "src/features/visual-retention/client/VisualRetentionCapabilitiesContext.tsx",
      "src/app/api/visual-retention/capabilities/route.ts",
      "src/features/editor/components/EditorProjectInspector.tsx",
      "src/components/StoryWorkspace.tsx",
      "src/features/media-motion/media-motion.presets.ts",
      "src/features/visual-beat-density/domain/visual-beat-plan.ts",
      "src/features/engagement-overlays/domain/engagement-overlay.presets.ts",
      "src/features/brand-sting/domain/brand-sting.presets.ts",
    ] as const) {
      assert.doesNotMatch(readSrc(file), /visual-retention-presets/);
    }

    assert.equal(
      (EXPORT_BROWSER_SUPPORTED_RENDERER_CAPABILITIES as readonly string[]).includes(
        "visual-retention-presets-v1",
      ),
      false,
    );
    assert.equal(
      (
        HEADLESS_WORKER_PHASE3_SUPPORTED.rendererCapabilities as readonly string[]
      ).includes("visual-retention-presets-v1"),
      false,
    );
  });

  console.log(`\nvisual-retention-preset-catalog: ${passed} PASS\n`);
}

main();
