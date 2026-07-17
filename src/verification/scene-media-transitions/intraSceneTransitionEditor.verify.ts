/**
 * Sprint 9A / 9D.2 — Intra-scene transition editor UI, selection, discoverability.
 * Run: npm run test:intra-scene-transition-editor
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  appendSceneMediaImageItem,
  createSequentialMediaItemIdGenerator,
  projectSceneMediaTimeline,
  removeSceneMediaItem,
  reorderSceneMediaItem,
} from "@/features/scene-media-timeline";
import {
  formatMediaTransitionAffordanceLabel,
  INTRA_SCENE_TRANSITION_EDITOR_NOTICE,
  INTRA_SCENE_TRANSITION_MULTI_ITEM_GUIDANCE,
  INTRA_SCENE_TRANSITION_SINGLE_ITEM_GUIDANCE,
  isSelectableSceneMediaTransitionPair,
  setSceneMediaTransitionBoundary,
} from "@/features/scene-media-transitions";
import {
  reconcileMediaTransitionSelectionAuthority,
  SelectionType,
} from "@/features/editor/selection";
import type { FootieScene, SceneMedia } from "@/features/story/types";
import {
  getTimelineExclusiveInteractionSnapshot,
  isTimelineExclusiveInteractionActive,
  releaseTimelineExclusiveInteraction,
  resetTimelineExclusiveInteractionForTests,
  setTimelineExclusiveInteraction,
  subscribeTimelineExclusiveInteraction,
  type TimelineExclusiveInteractionOwner,
} from "@/features/timeline-editor/scene-media/timeline-exclusive-interaction.lock";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function imageMedia(url: string): SceneMedia {
  return {
    type: "image",
    url,
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
}

function twoItemScene(): { scene: FootieScene; a: string; b: string } {
  const generateId = createSequentialMediaItemIdGenerator("e");
  let scene: FootieScene = {
    id: "scene-1",
    start: 0,
    end: 6,
    duration: 6,
    startMs: 0,
    endMs: 6000,
    durationMs: 6000,
    subtitle: "Cap",
    media: imageMedia("https://example.com/a.jpg"),
  };
  scene = appendSceneMediaImageItem(scene, imageMedia("https://example.com/b.jpg"), {
    generateId,
  }).scene;
  const items = projectSceneMediaTimeline(scene).items;
  return { scene, a: items[0]!.id, b: items[1]!.id };
}

console.log("\nintra-scene-transition-editor (Sprint 9D.2)\n");

test("Transition control is outside clipping ancestors", () => {
  const ui = readSrc(
    "src/features/timeline-editor/scene-media/scene-media-timeline.ui.ts",
  );
  assert.match(ui, /sceneMediaTransitionRow/);
  assert.match(ui, /overflow-visible/);
  assert.doesNotMatch(
    ui,
    /sceneMediaTransitionAffordance[\s\S]*-top-3/,
  );
  assert.match(ui, /sceneMediaLaneTrack[\s\S]*overflow-hidden/);

  const lane = readSrc(
    "src/features/timeline-editor/scene-media/SceneMediaTimelineLane.tsx",
  );
  assert.match(lane, /SceneMediaTransitionRow/);
  assert.match(lane, /SceneMediaBoundaryHandle/);
  // Transition row is rendered before the overflow-hidden track.
  const rowIdx = lane.indexOf("<SceneMediaTransitionRow");
  const trackIdx = lane.indexOf('data-scene-media-track');
  assert.ok(rowIdx >= 0 && trackIdx > rowIdx);
  // Affordance is not composed inside the track segment map.
  assert.doesNotMatch(
    lane,
    /data-scene-media-track[\s\S]*SceneMediaTransitionAffordance/,
  );
});

test("No negative-top transition affordance inside overflow-hidden track", () => {
  const affordance = readSrc(
    "src/features/timeline-editor/scene-media/SceneMediaTransitionAffordance.tsx",
  );
  assert.doesNotMatch(affordance, /-top-3/);
  assert.doesNotMatch(affordance, /left:\s*["']100%["']/);
  const ui = readSrc(
    "src/features/timeline-editor/scene-media/scene-media-timeline.ui.ts",
  );
  assert.doesNotMatch(ui, /sceneMediaTransitionAffordance\s*=\s*"[^"]*-top-3/);
});

test("Dedicated transition row renders once per adjacent pair", () => {
  const row = readSrc(
    "src/features/timeline-editor/scene-media/SceneMediaTransitionRow.tsx",
  );
  assert.match(row, /data-scene-media-transition-row/);
  assert.match(row, /data-scene-media-transition-control-count=\{windows\.length - 1\}/);
  assert.match(row, /windows\.length < 2/);
  assert.match(row, /SceneMediaTransitionAffordance/);
  assert.match(row, /role="toolbar"/);
});

test("Item-count guidance and control counts", () => {
  const lane = readSrc(
    "src/features/timeline-editor/scene-media/SceneMediaTimelineLane.tsx",
  );
  assert.match(lane, /INTRA_SCENE_TRANSITION_SINGLE_ITEM_GUIDANCE/);
  assert.match(lane, /INTRA_SCENE_TRANSITION_MULTI_ITEM_GUIDANCE/);
  assert.match(lane, /data-scene-media-transition-guidance/);
  assert.equal(
    INTRA_SCENE_TRANSITION_SINGLE_ITEM_GUIDANCE.includes("Add another image"),
    true,
  );
  assert.equal(
    INTRA_SCENE_TRANSITION_MULTI_ITEM_GUIDANCE.includes("Cut or an effect"),
    true,
  );
  // Behavioral counts: n items → n-1 controls (encoded in row).
  const row = readSrc(
    "src/features/timeline-editor/scene-media/SceneMediaTransitionRow.tsx",
  );
  assert.match(row, /windows\.length - 1/);
});

test("Keyboard / ARIA contract on affordance", () => {
  const affordance = readSrc(
    "src/features/timeline-editor/scene-media/SceneMediaTransitionAffordance.tsx",
  );
  assert.match(affordance, /aria-label=\{label\}/);
  assert.match(affordance, /aria-pressed=\{selected\}/);
  assert.match(affordance, /aria-disabled=\{disabled\}/);
  assert.match(affordance, /title=\{label\}/);
  assert.match(affordance, /event\.key === "Enter"/);
  assert.match(affordance, /event\.key === " "/);
  assert.match(affordance, /formatMediaTransitionAffordanceLabel\(fromIndex, toIndex, effect\)/);
  assert.equal(
    formatMediaTransitionAffordanceLabel(0, 1, "fade"),
    "Transition between Media 1 and Media 2: Fade",
  );
  assert.doesNotMatch(affordance, /<button[\s\S]*<button/);
});

test("Selection opens the Inspector Image/Media group", () => {
  const studio = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  assert.match(studio, /showMediaTransitionInspector/);
  assert.match(studio, /onImageGroupOpenChange\(true\)/);
  assert.match(studio, /SceneMediaTransitionInspector/);
  assert.match(studio, /useEffect/);
});

test("Inspector clarity and current Preview/Export copy", () => {
  const inspector = readSrc(
    "src/features/editor/components/media/SceneMediaTransitionInspector.tsx",
  );
  assert.match(inspector, /INTRA_SCENE_TRANSITION_EDITOR_NOTICE/);
  assert.match(inspector, /Reset to Cut/);
  assert.match(inspector, /data-scene-media-transition-pair-label/);
  assert.match(inspector, /Narration, captions/);
  assert.match(inspector, /not a scene-to-scene transition/);
  assert.doesNotMatch(inspector, /TransitionCard/);
  assert.doesNotMatch(inspector, /hard cuts until Sprint 9C/);
  assert.equal(
    INTRA_SCENE_TRANSITION_EDITOR_NOTICE.includes("Preview and Export"),
    true,
  );
  assert.equal(INTRA_SCENE_TRANSITION_EDITOR_NOTICE.includes("hard cuts"), false);
});

test("Selection validation, stale clear, sibling independence", () => {
  const pair = twoItemScene();
  let scene = pair.scene;
  const a = pair.a;
  const b = pair.b;
  assert.equal(isSelectableSceneMediaTransitionPair(scene, a, b), true);
  assert.equal(isSelectableSceneMediaTransitionPair(scene, b, a), false);

  scene = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const generateId = createSequentialMediaItemIdGenerator("x");
  scene = appendSceneMediaImageItem(scene, imageMedia("https://example.com/c.jpg"), {
    generateId,
  }).scene;
  const ids = projectSceneMediaTimeline(scene).items.map((i) => i.id);
  const c = ids[2]!;
  scene = setSceneMediaTransitionBoundary(scene, b, c, "slide-left", 500).scene;
  assert.equal(scene.mediaTransitions?.boundaries.length, 2);

  scene = setSceneMediaTransitionBoundary(scene, a, b, "blur", 800).scene;
  const ab = scene.mediaTransitions?.boundaries.find(
    (boundary) => boundary.fromItemId === a && boundary.toItemId === b,
  );
  const bc = scene.mediaTransitions?.boundaries.find(
    (boundary) => boundary.fromItemId === b && boundary.toItemId === c,
  );
  assert.equal(ab?.effect, "blur");
  assert.equal(bc?.effect, "slide-left");

  scene = reorderSceneMediaItem(scene, b, 0).scene;
  const cleared = reconcileMediaTransitionSelectionAuthority({
    storedTransition: { fromItemId: a, toItemId: b },
    selectionFocus: SelectionType.SceneMediaTransition,
    scene,
  });
  assert.equal(cleared.didClear, true);
  assert.equal(cleared.storedTransition, null);

  const afterIds = projectSceneMediaTimeline(scene).items.map((i) => i.id);
  scene = removeSceneMediaItem(scene, afterIds[0]!).scene;
  const afterRemove = reconcileMediaTransitionSelectionAuthority({
    storedTransition: { fromItemId: afterIds[0]!, toItemId: afterIds[1]! },
    selectionFocus: SelectionType.SceneMediaTransition,
    scene,
  });
  assert.equal(afterRemove.didClear, true);
});

test("Lock matrix disables affordance during exclusive interactions", () => {
  const lane = readSrc(
    "src/features/timeline-editor/scene-media/SceneMediaTimelineLane.tsx",
  );
  assert.match(
    lane,
    /SceneMediaTransitionRow[\s\S]*disabled=\{controlsDisabled\}/,
  );
  assert.match(
    lane,
    /controlsDisabled = playbackLocked \|\| interactionLocked \|\| isDragging/,
  );

  const owners: Exclude<TimelineExclusiveInteractionOwner, null>[] = [
    "reorder",
    "scene-resize",
    "video-trim",
    "media-boundary",
  ];
  resetTimelineExclusiveInteractionForTests();
  for (const owner of owners) {
    setTimelineExclusiveInteraction(owner);
    assert.equal(isTimelineExclusiveInteractionActive(), true, owner);
    releaseTimelineExclusiveInteraction(owner);
  }
  resetTimelineExclusiveInteractionForTests();

  const studio = readSrc("src/features/timeline-editor/StudioTimeline.tsx");
  assert.match(studio, /releaseTimelineExclusiveInteraction\(owner\)/);
});

test("Observable interaction-lock notifications and stale-owner release", () => {
  resetTimelineExclusiveInteractionForTests();
  const notifications: TimelineExclusiveInteractionOwner[] = [];
  const unsubscribe = subscribeTimelineExclusiveInteraction(() => {
    notifications.push(getTimelineExclusiveInteractionSnapshot());
  });

  setTimelineExclusiveInteraction("reorder");
  assert.deepEqual(notifications, ["reorder"]);
  setTimelineExclusiveInteraction("reorder");
  assert.equal(notifications.length, 1);
  setTimelineExclusiveInteraction("media-boundary");
  assert.deepEqual(notifications, ["reorder", "media-boundary"]);
  releaseTimelineExclusiveInteraction("reorder");
  assert.equal(getTimelineExclusiveInteractionSnapshot(), "media-boundary");
  releaseTimelineExclusiveInteraction("media-boundary");
  assert.equal(getTimelineExclusiveInteractionSnapshot(), null);
  unsubscribe();
  resetTimelineExclusiveInteractionForTests();
});

test("Playback / exclusive locks in inspector; late mutations guarded", () => {
  const inspector = readSrc(
    "src/features/editor/components/media/SceneMediaTransitionInspector.tsx",
  );
  assert.match(inspector, /PlaybackLocked/);
  assert.match(inspector, /useTimelineExclusiveInteractionLocked/);
  assert.match(inspector, /isTimelineExclusiveInteractionActive/);
  assert.match(inspector, /intent:\s*"media"/);
});

test("Selection API wired; Escape returns to scene", () => {
  const provider = readSrc(
    "src/features/editor/selection/EditorSelectionProvider.tsx",
  );
  assert.match(provider, /selectSceneMediaTransition/);
  assert.match(provider, /SelectionType\.SceneMediaTransition/);
  assert.match(provider, /reconcileMediaTransitionSelectionAuthority/);
  assert.match(provider, /clearSceneMediaTransitionSelection/);
  assert.match(provider, /event\.key !== "Escape"/);
});

test("Scene-to-scene TransitionCard remains distinct", () => {
  const studio = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  assert.match(studio, /TransitionCard/);
});

test("No production feature flag for transitions", () => {
  const lane = readSrc(
    "src/features/timeline-editor/scene-media/SceneMediaTimelineLane.tsx",
  );
  const affordance = readSrc(
    "src/features/timeline-editor/scene-media/SceneMediaTransitionAffordance.tsx",
  );
  const row = readSrc(
    "src/features/timeline-editor/scene-media/SceneMediaTransitionRow.tsx",
  );
  for (const src of [lane, affordance, row]) {
    assert.doesNotMatch(src, /NEXT_PUBLIC_.*TRANSITION/);
    assert.doesNotMatch(src, /process\.env/);
    assert.doesNotMatch(src, /featureFlag|feature_flag/i);
  }
});

console.log(`\n${passed} passed\n`);
