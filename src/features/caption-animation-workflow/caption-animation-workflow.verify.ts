/**
 * Caption animation workflow — copy/paste, apply-all, defaults — 4.1C-2.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyStoryPatch } from "@/features/editor/story-patches";
import {
  applyCaptionAnimationToAllScenes,
  buildCaptionAnimationPastePatch,
  buildProjectDefaultCaptionAnimationPatch,
  buildResetCaptionAnimationPatch,
  clearCaptionAnimationClipboard,
  copyCaptionAnimationToClipboard,
  extractCopyableCaptionAnimation,
  getCaptionAnimationClipboard,
} from "@/features/caption-animation-workflow";
import {
  applyStorySyncEdit,
  createInitialStorySynchronizationState,
  resolvePresentationSyncEditKind,
} from "@/features/story-sync";
import type { FootieScene, FootieScript } from "@/features/story/types";
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

function makeScript(scenes: FootieScene[]): FootieScript {
  return {
    title: "Animation workflow",
    narration: "Narration.",
    totalDuration: scenes.reduce((sum, scene) => sum + (scene.duration ?? 0), 0),
    scenes,
  };
}

function assertExportDirtyOnly(prev: FootieScript, next: FootieScript) {
  const classification = classifyStoryPatch(prev, next);
  const kind = resolvePresentationSyncEditKind(classification);
  assert.equal(kind, "caption_animation");
  let state = createInitialStorySynchronizationState();
  state = applyStorySyncEdit(state, kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.previewDirty, false);
  assert.equal(state.storyDirty, false);
  assert.equal(state.exportDirty, true);
}

test("copy animation settings extracts only animation fields", () => {
  clearCaptionAnimationClipboard();
  const copied = extractCopyableCaptionAnimation(
    { preset: "typewriter", durationMs: 900, delayMs: 100, intensity: 80 },
    { preset: "fade" },
  );
  assert.equal(copied.preset, "typewriter");
  assert.equal(copied.durationMs, 900);
  assert.equal(copied.delayMs, 100);
  assert.equal(copied.intensity, 80);
});

test("paste animation applies only animation fields", () => {
  const patch = buildCaptionAnimationPastePatch({
    preset: "highlight",
    durationMs: 1200,
    delayMs: 50,
    intensity: 70,
  });
  assert.equal(patch.captionAnimation?.preset, "highlight");
  assert.equal(patch.subtitleEffect, "highlight");
  assert.equal(patch.captionAnimation?.durationMs, 1200);
});

test("apply to all copies animation settings to every scene", () => {
  const script = makeScript([
    {
      id: "s1",
      start: 0,
      end: 3,
      duration: 3,
      subtitle: "One",
      captionAnimation: { preset: "typewriter", durationMs: 800 },
    },
    {
      id: "s2",
      start: 0,
      end: 3,
      duration: 3,
      subtitle: "Two",
      captionAnimation: { preset: "fade" },
    },
  ]);

  const next = applyCaptionAnimationToAllScenes(script, "s1");
  assert.equal(next.scenes[0]?.captionAnimation?.preset, "typewriter");
  assert.equal(next.scenes[1]?.captionAnimation?.preset, "typewriter");
  assert.equal(next.scenes[1]?.captionAnimation?.durationMs, 800);
  assert.equal(next.scenes[1]?.subtitleEffect, "typewriter");
});

test("reset animation clears scene override", () => {
  const patch = buildResetCaptionAnimationPatch();
  assert.equal(patch.captionAnimation, undefined);
});

test("set project default writes defaultCaptionAnimation only", () => {
  const script = makeScript([
    {
      id: "s1",
      start: 0,
      end: 3,
      duration: 3,
      subtitle: "One",
      captionAnimation: { preset: "highlight", intensity: 60 },
    },
    {
      id: "s2",
      start: 0,
      end: 3,
      duration: 3,
      subtitle: "Two",
    },
  ]);

  const patch = buildProjectDefaultCaptionAnimationPatch(script.scenes[0]!, script);
  assert.equal(patch.defaultCaptionAnimation?.preset, "highlight");
  assert.equal(patch.defaultCaptionAnimation?.intensity, 60);
  assert.equal(script.scenes[1]?.captionAnimation, undefined);
});

test("copy and paste workflow uses in-memory clipboard", () => {
  clearCaptionAnimationClipboard();
  copyCaptionAnimationToClipboard({ preset: "none", durationMs: 400 });
  assert.ok(getCaptionAnimationClipboard());
  const patch = buildCaptionAnimationPastePatch(getCaptionAnimationClipboard()!);
  assert.equal(patch.captionAnimation?.preset, "none");
});

test("workflow actions mark export dirty only", () => {
  const prev = makeScript([
    {
      id: "s1",
      start: 0,
      end: 3,
      duration: 3,
      subtitle: "One",
    },
  ]);
  const next = applyPresentationSceneUpdate(prev, "s1", {
    captionAnimation: { preset: "typewriter", durationMs: 600 },
    subtitleEffect: "typewriter",
  });
  assertExportDirtyOnly(prev, next);
});

test("caption animation inspector wiring uses presentation intent", () => {
  const inspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  assert.match(inspector, /CaptionAnimationControl/);
  assert.match(inspector, /CaptionAnimationWorkflow/);
  assert.match(inspector, /title="Caption Animation"/);
});

console.log(`\ncaption-animation-workflow: ${passed} passed`);
