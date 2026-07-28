/**
 * Caption motion presets — 4.1C-3
 * Run: npm run test:caption-animation-presets
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyStoryPatch } from "@/features/editor/story-patches";
import {
  applyMotionPresetToAllScenes,
  buildApplyMotionPresetPatch,
  buildMotionPresetPastePatch,
  buildProjectDefaultMotionPresetPatch,
  buildResetMotionPresetPatch,
  CAPTION_MOTION_PRESETS,
  clearMotionPresetClipboard,
  copyMotionPresetToClipboard,
  getCaptionMotionPreset,
  resolveMotionPresetDiagnostics,
} from "@/features/caption-animation-presets";
import {
  mergeCaptionAnimationSettings,
  resolveExportCaptionAnimation,
  resolvePreviewCaptionAnimation,
} from "@/features/caption-animation";
import {
  applyStorySyncEdit,
  createInitialStorySynchronizationState,
  resolvePresentationSyncEditKind,
} from "@/features/story-sync";
import type { CaptionAnimationTimelineEvent } from "@/features/timeline-intelligence/timeline.types";
import { applyPresentationSceneUpdate } from "@/lib/utils/voiceover";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function makeEvent(effect: "fade-up" | "typewriter" | "highlight"): CaptionAnimationTimelineEvent {
  return {
    id: "motion-preset-test",
    type: "caption-animation",
    startMs: 0,
    endMs: 3000,
    durationMs: 3000,
    source: "derived-caption-animation",
    metadata: {
      sceneId: "scene-1",
      sceneIndex: 0,
      chunkIndex: 0,
      subtitleEventId: "subtitle-1",
      effect,
      subtitleId: "subtitle-1",
      subtitleStartMs: 0,
      subtitleEndMs: 3000,
      animationStartMs: 0,
      animationEndMs: 500,
      availableDurationMs: 3000,
      holdDurationMs: 2500,
      effectType: effect,
      textLength: 11,
      text: "Hello world",
    },
  };
}

test("every built-in motion preset resolves correctly", () => {
  for (const motionPreset of CAPTION_MOTION_PRESETS) {
    const definition = getCaptionMotionPreset(motionPreset.id);
    assert.ok(definition, `missing preset ${motionPreset.id}`);
    assert.equal(definition!.config.preset, motionPreset.config.preset);
    assert.ok(definition!.label.length > 0);
  }

  assert.equal(CAPTION_MOTION_PRESETS.length, 24);
});

test("preset inheritance applies project motion preset config", () => {
  const resolved = mergeCaptionAnimationSettings({
    projectAnimation: { motionPresetId: "social-tiktok" },
  });

  assert.equal(resolved.preset, "typewriter");
  assert.equal(resolved.durationMs, 1200);
  assert.equal(resolved.motionPresetId, "social-tiktok");
});

test("scene override beats project motion preset", () => {
  const resolved = mergeCaptionAnimationSettings({
    projectAnimation: { motionPresetId: "social-tiktok" },
    sceneAnimation: { durationMs: 650, motionPresetId: "social-tiktok" },
  });

  assert.equal(resolved.durationMs, 650);
  assert.equal(
    resolveMotionPresetDiagnostics({
      sceneAnimation: { motionPresetId: "social-tiktok" },
      projectAnimation: { motionPresetId: "minimal-fade" },
    }).motionPresetSource,
    "scene",
  );
});

test("project default beats engine defaults through motion preset", () => {
  const resolved = mergeCaptionAnimationSettings({
    projectAnimation: { motionPresetId: "news-breaking" },
  });

  assert.equal(resolved.preset, "highlight");
  assert.equal(resolved.durationMs, 600);
});

test("individual overrides after preset selection win on scene storage", () => {
  const resolved = mergeCaptionAnimationSettings({
    sceneAnimation: {
      motionPresetId: "social-tiktok",
      durationMs: 1500,
      easing: "linear",
    },
  });

  assert.equal(resolved.durationMs, 1500);
  assert.equal(resolved.easing, "linear");
  assert.equal(resolved.preset, "typewriter");
});

test("copy and paste motion preset uses in-memory clipboard", () => {
  clearMotionPresetClipboard();
  copyMotionPresetToClipboard("sports-espn-style");
  const patch = buildMotionPresetPastePatch({});
  assert.equal(patch?.captionAnimation?.motionPresetId, "sports-espn-style");
  assert.equal(patch?.captionAnimation?.preset, "highlight");
});

test("apply motion preset to all scenes copies preset config", () => {
  const script = {
    title: "Preset story",
    narration: "Narration.",
    totalDuration: 6,
    scenes: [
      {
        id: "s1",
        start: 0,
        end: 3,
        duration: 3,
        subtitle: "One",
        captionAnimation: { motionPresetId: "gaming-neon" },
      },
      {
        id: "s2",
        start: 0,
        end: 3,
        duration: 3,
        subtitle: "Two",
      },
    ],
  };

  const next = applyMotionPresetToAllScenes(script, "s1");
  assert.ok(next);
  assert.equal(next!.scenes[1]?.captionAnimation?.motionPresetId, "gaming-neon");
  assert.equal(next!.scenes[1]?.captionAnimation?.preset, "highlight");
});

test("reset motion preset clears motionPresetId only", () => {
  const patch = buildResetMotionPresetPatch({
    captionAnimation: {
      motionPresetId: "minimal-fade",
      durationMs: 900,
      preset: "fade",
    },
  });

  assert.ok(patch);
  assert.equal(patch!.captionAnimation?.motionPresetId, undefined);
  assert.equal(patch!.captionAnimation?.durationMs, 900);
});

test("preview and export parity preserved with motion preset config", () => {
  const event = makeEvent("fade-up");
  const resolveInput = {
    sceneAnimation: buildApplyMotionPresetPatch("minimal-documentary")!.captionAnimation,
  };
  const preview = resolvePreviewCaptionAnimation(event, 200, resolveInput);
  const exportState = resolveExportCaptionAnimation(event, 200, resolveInput);
  assert.deepEqual(preview, exportState);
});

test("motion preset presentation edits mark export dirty only", () => {
  const prev = {
    title: "Motion preset story",
    narration: "Narration.",
    totalDuration: 3,
    scenes: [
      {
        id: "s1",
        start: 0,
        end: 3,
        duration: 3,
        subtitle: "Caption",
      },
    ],
  };

  const patch = buildApplyMotionPresetPatch("cinematic-trailer");
  assert.ok(patch);
  const next = applyPresentationSceneUpdate(prev, "s1", patch!);
  const classification = classifyStoryPatch(prev, next);
  assert.ok(classification.classes.includes("caption_animation"));
  const kind = resolvePresentationSyncEditKind(classification);
  assert.equal(kind, "caption_animation");

  let state = createInitialStorySynchronizationState();
  state = applyStorySyncEdit(state, kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.previewDirty, false);
  assert.equal(state.exportDirty, true);
});

test("legacy stories unchanged without stored motion preset", () => {
  const legacy = mergeCaptionAnimationSettings({
    sceneSubtitleEffect: "fade-up",
  });
  assert.equal(legacy.preset, "fade");
  assert.equal(legacy.motionPresetId, undefined);

  const baseline = mergeCaptionAnimationSettings();
  assert.equal(baseline.motionPresetId, undefined);
});

test("motion preset module and inspector wiring remain pure configuration", () => {
  const presets = readSrc("src/features/caption-animation-presets/caption-animation-presets.ts");
  const utils = readSrc("src/features/caption-animation-presets/caption-animation-presets.utils.ts");
  const control = readSrc("src/features/caption-engine/CaptionAnimationControl.tsx");

  assert.doesNotMatch(presets, /from "react"|from 'react'/);
  assert.doesNotMatch(utils, /from "react"|from 'react'/);
  assert.doesNotMatch(utils, /story-sync|voiceover|timeline-intelligence/i);
  assert.match(control, /Motion Preset/);
  assert.match(control, /buildApplyMotionPresetPatch/);
});

test("set project default motion preset writes defaultCaptionAnimation only", () => {
  const script = {
    title: "Preset default",
    narration: "Narration.",
    totalDuration: 3,
    scenes: [
      {
        id: "s1",
        start: 0,
        end: 3,
        duration: 3,
        subtitle: "One",
        captionAnimation: { motionPresetId: "news-bbc" },
      },
    ],
  };

  const patch = buildProjectDefaultMotionPresetPatch(
    script.scenes[0]!,
    script as Pick<import("@/features/story/types").FootieScript, "defaultCaptionAnimation">,
  );
  assert.ok(patch);
  assert.equal(patch!.defaultCaptionAnimation.motionPresetId, "news-bbc");
  assert.equal(patch!.defaultCaptionAnimation.preset, "fade");
});

console.log(`\ncaption-animation-presets: ${passed} passed`);
