/**
 * Single editor sync boundary — P1 hotfix verification.
 * Run: npm run test:single-sync-boundary
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolvePreviewMasterTimelineState } from "@/features/timeline-intelligence/master-timeline";
import { buildMasterTimeline } from "@/features/timeline-intelligence/build-master-timeline";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { recalculateSceneTimings } from "@/features/story/utils";
import {
  applySceneUpdate,
  applyScenesUpdate,
  applyStoryUpdate,
  syncFootieScript,
} from "@/lib/utils/voiceover";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function makeScene(id: string, durationSec: number): FootieScene {
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
    captionMode: "generated",
    subtitleText: `Subtitle ${id}`,
    narration: `Narration ${id}`,
  };
}

function buildStory(scenes: FootieScene[]): FootieScript {
  const timedScenes = recalculateSceneTimings(scenes);
  const totalDuration = timedScenes.reduce((sum, scene) => sum + scene.duration, 0);
  return syncFootieScript({
    title: "Single sync boundary story",
    narration: "Single sync boundary story narration.",
    scenes: timedScenes,
    totalDuration,
  });
}

/** Simulates DraftEditorFlow.handleStoryChange — the single editor sync boundary. */
function editorCommit(prev: FootieScript, next: FootieScript): FootieScript {
  return applyStoryUpdate(prev, next);
}

test("patch helpers do not call syncFootieScript", () => {
  const applyScene = readSrc("src/lib/utils/voiceover.ts");
  const sceneUpdateFn = applyScene.slice(
    applyScene.indexOf("export function applySceneUpdate"),
    applyScene.indexOf("export function applySceneImageSettings"),
  );
  const scenesUpdateFn = applyScene.slice(
    applyScene.indexOf("export function applyScenesUpdate"),
    applyScene.indexOf("export function applyTransitionUpdate"),
  );
  const transitionFn = applyScene.slice(
    applyScene.indexOf("export function applyTransitionUpdate"),
    applyScene.indexOf("export function syncFootieScript"),
  );

  assert.doesNotMatch(sceneUpdateFn, /syncFootieScript\s*\(/);
  assert.doesNotMatch(scenesUpdateFn, /syncFootieScript\s*\(/);
  assert.doesNotMatch(transitionFn, /syncFootieScript\s*\(/);
  assert.match(applyScene, /export function applyStoryUpdate[\s\S]*syncFootieScript\(next, prev\)/);
});

test("one editor scene update results in one sync boundary call", () => {
  const prev = buildStory([makeScene("s1", 3), makeScene("s2", 4)]);
  const patched = applySceneUpdate(prev, "s1", { subtitle: "Updated caption" });

  // Patch is not fully synced (timeline scene refs may still point at prior caption).
  assert.equal(patched.scenes[0]?.subtitle, "Updated caption");

  const synced = editorCommit(prev, patched);
  assert.equal(synced.scenes[0]?.subtitle, "Updated caption");
  assert.ok(synced.timelineItems?.length);
  assert.equal(typeof synced.totalDuration, "number");

  // Embedded timeline scene refs reflect the caption after the boundary sync.
  const sceneItem = synced.timelineItems?.find(
    (item) => item.type === "scene" && item.id === "s1",
  );
  assert.ok(sceneItem && sceneItem.type === "scene");
  if (sceneItem && sceneItem.type === "scene") {
    assert.equal(sceneItem.scene.subtitle, "Updated caption");
  }
});

test("preview timeline provider does not resync already-synced script", () => {
  const provider = readSrc(
    "src/features/timeline-intelligence/master-timeline/PreviewMasterTimelineProvider.tsx",
  );
  const previewUtils = readSrc("src/features/preview/utils/preview-master-timeline.utils.ts");
  const buildMaster = readSrc("src/features/timeline-intelligence/build-master-timeline.ts");

  assert.match(provider, /assumeSynced:\s*true/);
  assert.match(previewUtils, /assumeSynced:\s*options\.assumeSynced/);
  assert.match(buildMaster, /options\.assumeSynced\s*\?\s*script\s*:\s*syncFootieScript\(script\)/);

  const story = buildStory([makeScene("s1", 3), makeScene("s2", 4)]);
  const state = resolvePreviewMasterTimelineState(story);
  assert.ok(state.previewMasterTimeline);

  // assumeSynced path produces the same duration as a defensive build.
  const defensive = buildMasterTimeline(story, {
    mode: "preview",
    useVoiceoverRefit: true,
  });
  assert.equal(state.previewDurationMs, defensive.renderDurationMs);
});

test("story evolution receives synced script from editor boundary", () => {
  const draftEditorFlow = readSrc("src/features/drafts/components/DraftEditorFlow.tsx");
  assert.match(draftEditorFlow, /applyStoryUpdate\(baseScript, next\)/);
  assert.match(draftEditorFlow, /nextScript: synced/);
  assert.match(draftEditorFlow, /prevScript:[\s\S]*baseScript/);
  assert.doesNotMatch(draftEditorFlow, /syncFootieScript\s*\(/);
  assert.doesNotMatch(draftEditorFlow, /return syncFootieScript\(script\)/);
});

test("external draft load and export still sync defensively", () => {
  const draftLoad = readSrc("src/features/drafts/utils/draft-load.utils.ts");
  const store = readSrc("src/features/drafts/store/story-document.store.tsx");
  const exportPanel = readSrc("src/components/ExportPanel.tsx");
  const preflight = readSrc("src/features/export/utils/export-preflight.utils.ts");

  assert.match(draftLoad, /syncFootieScript/);
  assert.match(store, /function scriptFromDraft[\s\S]*syncFootieScript/);
  assert.match(store, /export function setCurrentScript[\s\S]*syncFootieScript\(script\)/);
  assert.match(exportPanel, /prepareStoryVoiceoverForExport\(syncFootieScript\(script\)\)/);
  assert.match(preflight, /const synced = syncFootieScript\(story\)/);
});

test("export fingerprint does not resync editor script", () => {
  const exportPanel = readSrc("src/components/ExportPanel.tsx");
  assert.match(exportPanel, /buildExportFingerprint\(\{\s*script,/);
  assert.doesNotMatch(
    exportPanel,
    /buildExportFingerprint\(\{\s*script:\s*syncFootieScript/,
  );
});

test("store trusts direct synced script values from editor boundary", () => {
  const store = readSrc("src/features/drafts/store/story-document.store.tsx");
  assert.match(store, /typeof updater === "function"/);
  assert.match(store, /syncFootieScript\(updater\(currentScript\), currentScript\)/);
  assert.match(store, /: updater/);
  assert.match(store, /applyScriptToDocument\(nextScript\)/);
});

test("duration and insert patches still normalize through applyStoryUpdate", () => {
  const prev = buildStory([makeScene("s1", 3), makeScene("s2", 4)]);
  const durationPatched = applySceneUpdate(prev, "s1", {
    duration: 5,
    durationMs: 5000,
    durationSource: "manual",
  });
  const durationSynced = editorCommit(prev, durationPatched);
  assert.equal(durationSynced.scenes[0]?.duration, 5);
  assert.equal(durationSynced.totalDuration, 9);

  const insertedScenes = [
    ...prev.scenes.slice(0, 1),
    makeScene("inserted", 3),
    ...prev.scenes.slice(1),
  ];
  const insertPatched = applyScenesUpdate(prev, insertedScenes);
  const insertSynced = editorCommit(prev, insertPatched);
  assert.equal(insertSynced.scenes.length, 3);
  assert.equal(insertSynced.timelineItems?.filter((item) => item.type === "scene").length, 3);
});

console.log(`\nsingleSyncBoundary: ${passed} passed`);
