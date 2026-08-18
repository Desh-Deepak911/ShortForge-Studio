/**
 * Caption layout workflow — copy/paste, apply-all, defaults — 4.1A-3B.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyStoryPatch } from "@/features/editor/story-patches";
import { resolveCaptionThirdsGuidePercents } from "@/features/caption-layout-drag/caption-layout-drag.utils";
import { buildResetCaptionLayoutPatch, mergeCaptionLayoutSettings } from "@/features/caption-layout";
import {
  applyCaptionLayoutToAllScenes,
  applyResetAllCaptionLayouts,
  buildCaptionLayoutPastePatch,
  buildCopyPreviousSceneLayoutPatch,
  buildProjectDefaultCaptionLayoutPatch,
  canCopyPreviousSceneLayout,
  clearCaptionLayoutClipboard,
  copyCaptionLayoutToClipboard,
  extractCopyableCaptionLayout,
  getCaptionLayoutClipboard,
} from "@/features/caption-layout-workflow/caption-layout-workflow.utils";
import {
  applyStorySyncEdit,
  createInitialStorySynchronizationState,
  resolvePresentationSyncEditKind,
} from "@/features/story-sync";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { recalculateSceneTimings } from "@/features/story/utils";
import { syncFootieScript } from "@/lib/utils/voiceover";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function makeScene(id: string, durationSec: number, extra: Partial<FootieScene> = {}): FootieScene {
  const durationMs = durationSec * 1000;
  return {
    id,
    start: 0,
    end: durationSec,
    duration: durationSec,
    startMs: 0,
    endMs: durationMs,
    durationMs,
    durationSource: "manual",
    subtitle: `Caption ${id}`,
    captionMode: "subtitles",
    subtitleText: `Narrated subtitle for ${id}.`,
    subtitleEffect: "fade-up",
    narration: `Narrated subtitle for ${id}.`,
    captionPreset: "tiktok",
    ...extra,
  };
}

function buildStory(scenes: FootieScene[], patch: Partial<FootieScript> = {}): FootieScript {
  const timedScenes = recalculateSceneTimings(scenes);
  const totalDuration = timedScenes.reduce((sum, scene) => sum + scene.duration, 0);
  return syncFootieScript({
    title: "Caption layout workflow story",
    narration: timedScenes.map((scene) => scene.narration).join(" "),
    scenes: timedScenes,
    totalDuration,
    voiceoverUrl: "blob:voice",
    voiceoverDurationMs: totalDuration * 1000,
    ...patch,
  });
}

function assertExportDirtyOnly(prev: FootieScript, next: FootieScript) {
  const kind = resolvePresentationSyncEditKind(classifyStoryPatch(prev, next));
  assert.equal(kind, "caption_layout");
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.exportDirty, true);
}

clearCaptionLayoutClipboard();

test("copy layout copies only layout fields", () => {
  const scene = makeScene("s1", 4, {
    captionLayout: {
      version: 2,
      anchor: "top_left",
      textAlign: "left",
      offsetX: 40,
      offsetY: -30,
      maxWidthPercent: 70,
      safeAreaEnabled: false,
      backgroundOpacity: 55,
    },
    captionPreset: "sports",
    subtitleEffect: "typewriter",
  });
  const copied = extractCopyableCaptionLayout(scene.captionLayout, undefined);
  assert.equal(copied.anchor, "top_left");
  assert.equal(copied.textAlign, "left");
  assert.equal(copied.offsetX, 40);
  assert.equal(copied.offsetY, -30);
  assert.equal(copied.maxWidthPercent, 70);
  assert.equal(copied.safeAreaEnabled, false);
  assert.equal("backgroundOpacity" in copied, false);
  assert.equal("captionPreset" in copied, false);
  assert.equal("subtitleText" in copied, false);
  assert.equal("subtitle" in copied, false);

  copyCaptionLayoutToClipboard(copied);
  assert.deepEqual(getCaptionLayoutClipboard(), copied);
});

test("paste layout applies only layout fields", () => {
  clearCaptionLayoutClipboard();
  const layout = extractCopyableCaptionLayout(
    {
      version: 2,
      anchor: "center",
      textAlign: "right",
      offsetX: 12,
      offsetY: 24,
      maxWidthPercent: 80,
      safeAreaEnabled: true,
      backgroundOpacity: 60,
    },
    undefined,
  );
  copyCaptionLayoutToClipboard(layout);
  const patch = buildCaptionLayoutPastePatch(getCaptionLayoutClipboard()!);
  assert.deepEqual(Object.keys(patch), ["captionLayout"]);
  assert.equal(patch.captionLayout.anchor, "center");
  assert.equal(patch.captionLayout.textAlign, "right");
});

test("paste does not copy caption text", () => {
  const source = makeScene("s1", 4, {
    captionLayout: { anchor: "top_center", version: 2, offsetX: 50 },
    subtitle: "Scene 1 caption",
    subtitleText: "Scene 1 narrated",
  });
  const target = makeScene("s2", 4, {
    subtitle: "Scene 2 caption",
    subtitleText: "Scene 2 narrated",
  });
  const prev = buildStory([source, target]);
  const clipboard = extractCopyableCaptionLayout(source.captionLayout, undefined);
  const next = buildStory([
    source,
    { ...target, ...buildCaptionLayoutPastePatch(clipboard) },
  ]);

  assert.equal(next.scenes[1]?.subtitle, "Scene 2 caption");
  assert.equal(next.scenes[1]?.subtitleText, "Scene 2 narrated");
  assert.equal(next.scenes[1]?.captionLayout?.anchor, "top_center");
  assert.equal(next.scenes[1]?.captionLayout?.offsetX, 50);
  assertExportDirtyOnly(prev, next);
});

test("apply all updates every scene layout", () => {
  const s1 = makeScene("s1", 4, {
    captionLayout: { anchor: "top_right", textAlign: "right", offsetX: 100, version: 2 },
  });
  const s2 = makeScene("s2", 4);
  const s3 = makeScene("s3", 4, {
    captionLayout: { anchor: "bottom_left", version: 2 },
  });
  const prev = buildStory([s1, s2, s3]);
  const next = applyCaptionLayoutToAllScenes(prev, "s1");

  for (const scene of next.scenes) {
    assert.equal(scene.captionLayout?.anchor, "top_right");
    assert.equal(scene.captionLayout?.textAlign, "right");
    assert.equal(scene.captionLayout?.offsetX, 100);
  }

  assertExportDirtyOnly(prev, next);
});

test("reset current layout restores defaults", () => {
  const scene = makeScene("s1", 4, {
    captionLayout: {
      anchor: "center",
      textAlign: "left",
      offsetX: 80,
      offsetY: -120,
      maxWidthPercent: 55,
      safeAreaEnabled: false,
      backgroundOpacity: 20,
      version: 2,
    },
  });
  const reset = buildResetCaptionLayoutPatch().captionLayout;
  const nextScene = { ...scene, captionLayout: reset };
  assert.equal(nextScene.captionLayout.anchor, "bottom_center");
  assert.equal(nextScene.captionLayout.offsetX, 0);
  assert.equal(nextScene.captionLayout.safeAreaEnabled, true);
});

test("reset all restores every scene layout", () => {
  const prev = buildStory([
    makeScene("s1", 4, { captionLayout: { anchor: "center", version: 2 } }),
    makeScene("s2", 4, { captionLayout: { anchor: "top_left", offsetX: 40, version: 2 } }),
  ]);
  const next = applyResetAllCaptionLayouts(prev);

  for (const scene of next.scenes) {
    assert.equal(scene.captionLayout?.anchor, "bottom_center");
    assert.equal(scene.captionLayout?.offsetX, 0);
  }

  assertExportDirtyOnly(prev, next);
});

test("copy previous disabled on first scene", () => {
  assert.equal(canCopyPreviousSceneLayout(0), false);
  assert.equal(buildCopyPreviousSceneLayoutPatch(buildStory([makeScene("s1", 4)]), 0), null);
});

test("copy previous applies previous scene layout", () => {
  const s1 = makeScene("s1", 4, {
    captionLayout: { anchor: "top_center", offsetX: 33, offsetY: -10, version: 2 },
  });
  const s2 = makeScene("s2", 4);
  const script = buildStory([s1, s2]);
  const patch = buildCopyPreviousSceneLayoutPatch(script, 1);
  assert.ok(patch);
  assert.equal(patch!.captionLayout.anchor, "top_center");
  assert.equal(patch!.captionLayout.offsetX, 33);
  assert.equal(patch!.captionLayout.offsetY, -10);
});

test("set project default writes defaultCaptionLayout only", () => {
  const scene = makeScene("s1", 4, {
    captionLayout: { anchor: "center_right", offsetX: 15, version: 2 },
    captionPreset: "news",
  });
  const script = buildStory([scene]);
  const patch = buildProjectDefaultCaptionLayoutPatch(scene, script);
  assert.deepEqual(Object.keys(patch), ["defaultCaptionLayout"]);
  assert.equal(patch.defaultCaptionLayout.anchor, "center_right");
  assert.equal(patch.defaultCaptionLayout.offsetX, 15);
});

test("existing scenes unchanged after set project default", () => {
  const s1 = makeScene("s1", 4, {
    captionLayout: { anchor: "top_left", version: 2 },
  });
  const s2 = makeScene("s2", 4, {
    captionLayout: { anchor: "bottom_right", version: 2 },
  });
  const script = buildStory([s1, s2]);
  const withDefault = {
    ...script,
    ...buildProjectDefaultCaptionLayoutPatch(s1, script),
  };
  assert.equal(withDefault.scenes[0]?.captionLayout?.anchor, "top_left");
  assert.equal(withDefault.scenes[1]?.captionLayout?.anchor, "bottom_right");
  assert.equal(withDefault.defaultCaptionLayout?.anchor, "top_left");
});

test("new scenes inherit project default through merge logic", () => {
  const defaultLayout = extractCopyableCaptionLayout(
    { anchor: "center", offsetX: 42, version: 2 },
    undefined,
  );
  const merged = mergeCaptionLayoutSettings(undefined, defaultLayout);
  assert.equal(merged.anchor, "center");
  assert.equal(merged.offsetX, 42);
});

test("workflow actions do not dirty narration", () => {
  const prev = buildStory([
    makeScene("s1", 4, { captionLayout: { anchor: "center", version: 2 } }),
    makeScene("s2", 4),
  ]);
  const next = applyCaptionLayoutToAllScenes(prev, "s1");
  const kind = resolvePresentationSyncEditKind(classifyStoryPatch(prev, next));
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, false);
});

test("workflow actions do not dirty voice", () => {
  const prev = buildStory([makeScene("s1", 4), makeScene("s2", 4)]);
  const next = applyResetAllCaptionLayouts(prev);
  const kind = resolvePresentationSyncEditKind(classifyStoryPatch(prev, next));
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.voiceDirty, false);
});

test("workflow actions mark export dirty", () => {
  const prev = buildStory([makeScene("s1", 4), makeScene("s2", 4)]);
  const pasted = buildStory([
    makeScene("s1", 4),
    {
      ...makeScene("s2", 4),
      ...buildCaptionLayoutPastePatch(
        extractCopyableCaptionLayout({ anchor: "top_center", version: 2 }, undefined),
      ),
    },
  ]);
  assertExportDirtyOnly(prev, pasted);
});

test("caption layout lock is not implemented", () => {
  const storyTypes = readSrc("src/features/story/types/story.types.ts");
  assert.equal(/captionLayoutLocked/.test(storyTypes), false);
});

test("smart guides include thirds lines", () => {
  const guides = readSrc("src/features/caption-layout-drag/CaptionLayoutGuides.tsx");
  assert.match(guides, /resolveCaptionThirdsGuidePercents/);
  assert.match(guides, /third-v-/);
  assert.match(guides, /third-h-/);

  const thirds = resolveCaptionThirdsGuidePercents();
  assert.equal(thirds.vertical.length, 2);
  assert.equal(thirds.horizontal.length, 2);
  assert.ok(Math.abs(thirds.vertical[0]! - 100 / 3) < 0.01);
});

test("workflow UI wired in caption layout inspector", () => {
  const inspector = readSrc("src/features/editor/components/caption-workspace/CaptionWorkspace.tsx");
  const workflow = readSrc("src/features/caption-layout-workflow/CaptionLayoutWorkflow.tsx");
  assert.match(inspector, /CaptionLayoutWorkflow/);
  assert.match(workflow, /Apply All/);
  assert.match(workflow, /Set Default/);
  assert.match(workflow, /applyPresentationScriptUpdate/);
});

console.log(`\ncaption-layout-workflow: ${passed} passed`);
