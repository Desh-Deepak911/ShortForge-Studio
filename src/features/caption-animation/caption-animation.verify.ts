/**
 * Caption Animation Engine — 4.1C-1
 * Run: npm run test:caption-animation
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_CAPTION_ANIMATION_PRESET,
  mergeCaptionAnimationSettings,
  resolveCaptionAnimation,
  resolveCaptionAnimationDiagnostics,
  resolveCaptionAnimationFromChunk,
  resolveCaptionAnimationFromTimelineEvent,
  resolveExportCaptionAnimation,
  resolvePreviewCaptionAnimation,
  usesLegacyCaptionAnimationTiming,
} from "./index";
import { classifyStoryPatch } from "@/features/editor/story-patches";
import {
  applyStorySyncEdit,
  createInitialStorySynchronizationState,
  resolvePresentationSyncEditKind,
} from "@/features/story-sync";
import { applyPresentationSceneUpdate } from "@/lib/utils/voiceover";
import type { CaptionAnimationTimelineEvent } from "@/features/timeline-intelligence/timeline.types";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function makeEvent(
  effect: "fade-up" | "typewriter" | "highlight",
  options: {
    text?: string;
    subtitleStartMs?: number;
    subtitleEndMs?: number;
    animationStartMs?: number;
    animationEndMs?: number;
    availableDurationMs?: number;
    captionTooShortForEffect?: boolean;
  } = {},
): CaptionAnimationTimelineEvent {
  const subtitleStartMs = options.subtitleStartMs ?? 0;
  const subtitleEndMs = options.subtitleEndMs ?? 3000;
  const animationStartMs = options.animationStartMs ?? subtitleStartMs;
  const animationEndMs = options.animationEndMs ?? subtitleStartMs + 500;
  const availableDurationMs = options.availableDurationMs ?? subtitleEndMs - subtitleStartMs;

  return {
    id: "caption-animation-test",
    type: "caption-animation",
    startMs: animationStartMs,
    endMs: subtitleEndMs,
    metadata: {
      sceneId: "scene-1",
      sceneIndex: 0,
      chunkIndex: 0,
      subtitleEventId: "subtitle-1",
      effect,
      subtitleId: "subtitle-1",
      subtitleStartMs,
      subtitleEndMs,
      animationStartMs,
      animationEndMs,
      availableDurationMs,
      holdDurationMs: subtitleEndMs - animationEndMs,
      effectType: effect,
      textLength: (options.text ?? "Hello world").length,
      text: options.text ?? "Hello world",
      captionTooShortForEffect: options.captionTooShortForEffect,
    },
  };
}

test("fade animation resolves opacity and translateY", () => {
  const event = makeEvent("fade-up");
  const atStart = resolveCaptionAnimationFromTimelineEvent(event, 0);
  const afterReveal = resolveCaptionAnimationFromTimelineEvent(event, 600);

  assert.ok(atStart.opacity < 1);
  assert.ok(atStart.translateY > 0);
  assert.equal(afterReveal.opacity, 1);
  assert.equal(afterReveal.translateY, 0);
  assert.equal(afterReveal.transform, "none");
});

test("highlight animation resolves highlight progress and scale", () => {
  const event = makeEvent("highlight", { subtitleEndMs: 4000, animationEndMs: 4000 });
  const early = resolveCaptionAnimationFromTimelineEvent(event, 200);
  const late = resolveCaptionAnimationFromTimelineEvent(event, 2000);

  assert.ok(early.highlightProgress > 0);
  assert.ok(late.highlightProgress >= early.highlightProgress);
  assert.ok(early.scale >= 0.88);
});

test("typewriter animation resolves progressive visible text", () => {
  const text = "ShortForge caption animation engine";
  const event = makeEvent("typewriter", {
    text,
    subtitleEndMs: 5000,
    animationStartMs: 0,
    animationEndMs: 2000,
    availableDurationMs: 5000,
  });

  const first = resolveCaptionAnimationFromTimelineEvent(event, 0);
  const mid = resolveCaptionAnimationFromTimelineEvent(event, 800);
  const complete = resolveCaptionAnimationFromTimelineEvent(event, 2100);

  assert.ok(first.visibleText.length >= 1);
  assert.ok(mid.visibleText.length > first.visibleText.length);
  assert.equal(complete.visibleText, text);
  assert.equal(complete.shouldRenderFullText, true);
});

test("none animation preset resolves static visible text", () => {
  const resolved = mergeCaptionAnimationSettings({
    sceneAnimation: { preset: "none" },
  });
  assert.equal(resolved.preset, "none");

  const state = resolveCaptionAnimationFromChunk({
    preset: "none",
    text: "Static caption",
    chunkElapsedMs: 100,
    chunkDurationMs: 2000,
  });
  assert.equal(state.visibleText, "Static caption");
  assert.equal(state.opacity, 1);
});

test("scene animation override beats project default", () => {
  const resolved = resolveCaptionAnimation({
    projectAnimation: { preset: "fade" },
    sceneAnimation: { preset: "typewriter" },
  });
  assert.equal(resolved.animationPreset, "typewriter");
  assert.equal(resolved.animationSource, "scene");
});

test("project default beats engine default", () => {
  const resolved = resolveCaptionAnimation({
    projectAnimation: { preset: "highlight" },
  });
  assert.equal(resolved.animationPreset, "highlight");
  assert.equal(resolved.animationSource, "project");
});

test("engine default applies when no overrides exist", () => {
  const resolved = resolveCaptionAnimation();
  assert.equal(resolved.animationPreset, DEFAULT_CAPTION_ANIMATION_PRESET);
  assert.equal(resolved.animationSource, "engine");
  assert.equal(resolved.useLegacyTiming, true);
});

test("preview and export parity preserved for timeline animation", () => {
  const event = makeEvent("fade-up", { text: "Parity check" });
  const preview = resolvePreviewCaptionAnimation(event, 120);
  const exportState = resolveExportCaptionAnimation(event, 120);

  assert.deepEqual(preview, exportState);
});

test("engine source is pure with no React dependency", () => {
  const engine = readSrc("src/features/caption-animation/caption-animation.engine.ts");
  const utils = readSrc("src/features/caption-animation/caption-animation.utils.ts");
  const defaults = readSrc("src/features/caption-animation/caption-animation.defaults.ts");

  assert.doesNotMatch(engine, /from "react"|from 'react'/);
  assert.doesNotMatch(utils, /from "react"|from 'react'/);
  assert.doesNotMatch(defaults, /from "react"|from 'react'/);
  assert.doesNotMatch(engine, /story-sync|voiceover|voice-/i);
});

test("legacy stories unchanged via subtitleEffect fallback", () => {
  const resolved = resolveCaptionAnimation({
    sceneSubtitleEffect: "fade-up",
  });
  assert.equal(resolved.animationPreset, "fade");
  assert.equal(resolved.animationSource, "legacy");

  const legacyChunk = resolveCaptionAnimationFromChunk({
    preset: "fade",
    text: "Legacy chunk",
    chunkElapsedMs: 250,
    chunkDurationMs: 3000,
  });
  assert.ok(legacyChunk.opacity > 0);
  assert.equal(legacyChunk.visibleText, "Legacy chunk");
});

test("preview and export wired through caption animation adapters", () => {
  const previewUtils = readSrc("src/features/preview/utils/preview-master-timeline.utils.ts");
  const exportSubtitle = readSrc("src/features/export/utils/export-subtitle.utils.ts");
  const exportCanvas = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  const effectPreview = readSrc("src/features/editor/components/subtitleEffectPreview.tsx");

  assert.match(previewUtils, /resolvePreviewCaptionAnimation/);
  assert.match(exportSubtitle, /resolveExportCaptionAnimation/);
  assert.match(exportCanvas, /resolveExportCaptionHighlightFrame/);
  assert.match(effectPreview, /resolveExportCaptionHighlightFrame/);
  assert.doesNotMatch(exportCanvas, /getExportHighlightSubtitleFrame/);
});

test("animation preset selection resolves through merge", () => {
  const resolved = mergeCaptionAnimationSettings({
    sceneAnimation: { preset: "highlight" },
  });
  assert.equal(resolved.preset, "highlight");
});

test("duration override resolves from scene", () => {
  const resolved = mergeCaptionAnimationSettings({
    sceneAnimation: { durationMs: 1500 },
  });
  assert.equal(resolved.durationMs, 1500);
  assert.equal(
    resolveCaptionAnimation({ sceneAnimation: { durationMs: 1500 } }).fieldSources.durationSource,
    "scene",
  );
});

test("delay override resolves from project default", () => {
  const resolved = mergeCaptionAnimationSettings({
    projectAnimation: { delayMs: 250 },
  });
  assert.equal(resolved.delayMs, 250);
});

test("easing override resolves from scene", () => {
  const resolved = mergeCaptionAnimationSettings({
    sceneAnimation: { easing: "linear" },
  });
  assert.equal(resolved.easing, "linear");
});

test("direction override resolves from scene", () => {
  const resolved = mergeCaptionAnimationSettings({
    sceneAnimation: { direction: "reverse" },
  });
  assert.equal(resolved.direction, "reverse");
});

test("intensity override resolves from scene", () => {
  const resolved = mergeCaptionAnimationSettings({
    sceneAnimation: { intensity: 65 },
  });
  assert.equal(resolved.intensity, 65);
});

test("custom duration changes fade timing while legacy stories stay unchanged", () => {
  const event = makeEvent("fade-up");
  const legacyAt250 = resolveCaptionAnimationFromTimelineEvent(event, 250);
  const customAt250 = resolveCaptionAnimationFromTimelineEvent(event, 250, {
    sceneAnimation: { durationMs: 1000 },
  });

  assert.ok(usesLegacyCaptionAnimationTiming(undefined, undefined));
  assert.notDeepEqual(legacyAt250, customAt250);
  assert.ok(customAt250.opacity < legacyAt250.opacity);
});

test("diagnostics expose field source metadata", () => {
  const diagnostics = resolveCaptionAnimationDiagnostics({
    sceneAnimation: { durationMs: 900, easing: "linear" },
    projectAnimation: { delayMs: 100 },
  });
  assert.equal(diagnostics.durationSource, "scene");
  assert.equal(diagnostics.easingSource, "scene");
  assert.equal(diagnostics.delaySource, "project");
});

test("presentation animation edits do not dirty narration or voice", () => {
  const prev = {
    title: "Animation story",
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
  const next = applyPresentationSceneUpdate(prev, "s1", {
    captionAnimation: { preset: "typewriter", durationMs: 800 },
    subtitleEffect: "typewriter",
  });
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

test("caption animation control and engine wiring", () => {
  const control = readSrc("src/features/caption-engine/CaptionAnimationControl.tsx");
  const engine = readSrc("src/features/caption-animation/caption-animation.engine.ts");
  assert.match(control, /Animation Preset/);
  assert.match(control, /Animation Duration/);
  assert.match(control, /buildSceneCaptionAnimationPresetPatch/);
  assert.doesNotMatch(engine, /story-sync/i);
  assert.doesNotMatch(readSrc("src/features/caption-animation/caption-animation.utils.ts"), /timeline-intelligence/i);
});

test("legacy fade timing matches prior implementation at midpoint", () => {
  const event = makeEvent("fade-up");
  const legacy = resolveCaptionAnimationFromTimelineEvent(event, 250, {
    sceneSubtitleEffect: "fade-up",
  });
  const baseline = resolveCaptionAnimationFromTimelineEvent(event, 250);
  assert.deepEqual(legacy, baseline);
  assert.equal(legacy.intensity, 100);
});

console.log(`\ncaption-animation: ${passed} passed`);
