/**
 * Patch classification & content-edit fast path — P1 hotfix verification.
 * Run: npm run test:story-patch-classifier
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  classifyStoryPatch,
  DEFERRED_STORY_EVOLUTION_DEBOUNCE_MS,
  IMMEDIATE_STORY_EVOLUTION_DEBOUNCE_MS,
  isMsBackfillOnlyStoryPatch,
  isSceneMsBackfillOnly,
  resolveStoryEvolutionDebounceMs,
  resolveTimelineRebuildPolicy,
} from "@/features/editor/story-patches";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { recalculateSceneTimings } from "@/features/story/utils";
import { scenesStructurallyEqual } from "@/features/story/utils/timeline.utils";
import {
  applySceneImageSettings,
  applySceneUpdate,
  applyScenesUpdate,
  applyStoryUpdate,
  syncFootieScript,
} from "@/lib/utils/voiceover";
import { insertTimelineSceneAfter } from "@/features/timeline-editor/timeline-editor.commands";

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
    captionPreset: "sports",
    subtitleEffect: "fade-up",
    narration: `Narration ${id}`,
    image: {
      url: `https://example.com/${id}.jpg`,
      scale: 1,
      x: 0,
      y: 0,
      fitMode: "fit",
      imageMotion: { type: "none", intensity: "subtle" },
    },
  };
}

function buildStory(scenes: FootieScene[]): FootieScript {
  const timedScenes = recalculateSceneTimings(scenes);
  const totalDuration = timedScenes.reduce((sum, scene) => sum + scene.duration, 0);
  return syncFootieScript({
    title: "Patch classifier story",
    narration: "Patch classifier story narration.",
    scenes: timedScenes,
    totalDuration,
  });
}

function makeLegacyScene(id: string, durationSec: number): FootieScene {
  const scene = makeScene(id, durationSec);
  return {
    ...scene,
    startMs: undefined,
    endMs: undefined,
    durationMs: undefined,
  };
}

test("ms-field backfill from unchanged second timing is not classified as timing", () => {
  const legacy = {
    ...makeLegacyScene("s1", 3),
    captionMode: "generated" as const,
  };
  const prev = syncFootieScript({
    title: "Legacy draft",
    narration: "Narration",
    scenes: [legacy],
    totalDuration: 3,
  });
  const next = applyStoryUpdate(
    prev,
    applySceneUpdate(prev, "s1", { subtitle: "Visual tweak only" }),
  );

  assert.equal(isSceneMsBackfillOnly(prev.scenes[0]!, next.scenes[0]!), true);
  const classification = classifyStoryPatch(prev, next);
  assert.doesNotMatch(classification.classes.join(","), /timing/);
  assert.equal(isMsBackfillOnlyStoryPatch(prev, next), true);
});

test("actual duration change still classified as timing", () => {
  const prev = buildStory([makeScene("s1", 3)]);
  const next = applyStoryUpdate(
    prev,
    applySceneUpdate(prev, "s1", {
      duration: 5,
      durationMs: 5000,
      durationSource: "manual",
    }),
  );
  const classification = classifyStoryPatch(prev, next);
  assert.equal(classification.primary, "timing");
});

test("caption mode switch on legacy scene without ms fields is not timing", () => {
  const legacyScene: FootieScene = {
    ...makeLegacyScene("s1", 3),
    captionMode: "generated",
    subtitleText: undefined,
    narration: "Scene narration excerpt.",
    subtitle: "Visual heading",
  };
  const prev = syncFootieScript({
    title: "Legacy draft",
    narration: "Original narration.",
    scenes: [legacyScene],
    totalDuration: 3,
  });
  const next = applyStoryUpdate(
    prev,
    applySceneUpdate(prev, "s1", { captionMode: "subtitles" }),
  );
  const classification = classifyStoryPatch(prev, next);
  assert.doesNotMatch(classification.classes.join(","), /timing/);
  assert.ok(classification.classes.includes("caption"));
  assert.equal(isMsBackfillOnlyStoryPatch(prev, next), true);
});

test("written caption edit classified as caption", () => {
  const prev = buildStory([makeScene("s1", 3), makeScene("s2", 4)]);
  const next = applyStoryUpdate(prev, applySceneUpdate(prev, "s1", { subtitle: "New caption" }));
  const classification = classifyStoryPatch(prev, next);
  assert.equal(classification.primary, "caption");
  assert.deepEqual(classification.classes, ["caption"]);
});

test("narrated subtitle edit classified as spoken_text", () => {
  const prev = buildStory([makeScene("s1", 3)]);
  const next = applyStoryUpdate(
    prev,
    applySceneUpdate(prev, "s1", { subtitleText: "New subtitle text", captionMode: "subtitles" }),
  );
  const classification = classifyStoryPatch(prev, next);
  assert.ok(classification.classes.includes("spoken_text"));
  assert.equal(classification.primary, "spoken_text");
});

test("caption mode switch to subtitles with narration seed is not spoken_text", () => {
  const prev = buildStory([
    {
      ...makeScene("s1", 3),
      captionMode: "generated",
      subtitleText: undefined,
      narration: "Scene narration excerpt.",
      subtitle: "Visual heading",
    },
  ]);
  const next = applyStoryUpdate(
    prev,
    applySceneUpdate(prev, "s1", { captionMode: "subtitles" }),
  );
  const classification = classifyStoryPatch(prev, next);
  assert.ok(classification.classes.includes("caption"));
  assert.doesNotMatch(classification.classes.join(","), /spoken_text/);
});

test("caption mode switch back to generated is not spoken_text", () => {
  const prev = buildStory([
    {
      ...makeScene("s1", 3),
      captionMode: "subtitles",
      subtitleText: "Existing narrated copy.",
      narration: "Scene narration excerpt.",
    },
  ]);
  const next = applyStoryUpdate(
    prev,
    applySceneUpdate(prev, "s1", { captionMode: "generated" }),
  );
  const classification = classifyStoryPatch(prev, next);
  assert.ok(classification.classes.includes("caption"));
  assert.doesNotMatch(classification.classes.join(","), /spoken_text/);
});

test("written caption edit does not classify as spoken_text", () => {
  const prev = buildStory([makeScene("s1", 3)]);
  const next = applyStoryUpdate(prev, applySceneUpdate(prev, "s1", { subtitle: "Visual heading only." }));
  const classification = classifyStoryPatch(prev, next);
  assert.ok(classification.classes.includes("caption"));
  assert.doesNotMatch(classification.classes.join(","), /spoken_text/);
});

test("captionPreset edit classified as caption", () => {
  const prev = buildStory([makeScene("s1", 3)]);
  const withPreset = applyStoryUpdate(prev, {
    ...prev,
    scenes: prev.scenes.map((scene) =>
      scene.id === "s1"
        ? { ...scene, captionPreset: "tiktok" as const, subtitleEffect: "typewriter" as const }
        : scene,
    ),
  });
  const classification = classifyStoryPatch(prev, withPreset);
  assert.equal(classification.primary, "caption");
  assert.ok(classification.classes.includes("caption"));
});

test("motion speed edit classified as motion", () => {
  const prev = buildStory([makeScene("s1", 3)]);
  const next = applyStoryUpdate(
    prev,
    applySceneImageSettings(prev, "s1", {
      imageMotion: { type: "zoom-in", intensity: "strong" },
    }),
  );
  const classification = classifyStoryPatch(prev, next);
  assert.equal(classification.primary, "motion");
  assert.deepEqual(classification.classes, ["motion"]);
});

test("image transform classified as motion", () => {
  const prev = buildStory([makeScene("s1", 3)]);
  const next = applyStoryUpdate(
    prev,
    applySceneImageSettings(prev, "s1", { scale: 1.4, x: 0.1, fitMode: "fill" }),
  );
  const classification = classifyStoryPatch(prev, next);
  assert.equal(classification.primary, "motion");
});

test("image url change classified as media", () => {
  const prev = buildStory([makeScene("s1", 3)]);
  const next = applyStoryUpdate(
    prev,
    applySceneUpdate(prev, "s1", {
      image: {
        url: "https://example.com/new.jpg",
        scale: 1,
        x: 0,
        y: 0,
      },
    }),
  );
  const classification = classifyStoryPatch(prev, next);
  assert.equal(classification.primary, "media");
});

test("duration classified as timing", () => {
  const prev = buildStory([makeScene("s1", 3), makeScene("s2", 4)]);
  const next = applyStoryUpdate(
    prev,
    applySceneUpdate(prev, "s1", {
      duration: 5,
      durationMs: 5000,
      durationSource: "manual",
    }),
  );
  const classification = classifyStoryPatch(prev, next);
  assert.equal(classification.primary, "timing");
  assert.equal(resolveTimelineRebuildPolicy(prev, next, classification), "immediate");
  assert.equal(
    resolveStoryEvolutionDebounceMs(classification),
    IMMEDIATE_STORY_EVOLUTION_DEBOUNCE_MS,
  );
});

test("insert scene classified as structural", () => {
  const prev = buildStory([makeScene("s1", 3), makeScene("s2", 4)]);
  const insertResult = insertTimelineSceneAfter(prev, "s1");
  assert.ok(insertResult);
  const next = applyStoryUpdate(prev, insertResult.script);
  const classification = classifyStoryPatch(prev, next);
  assert.equal(classification.primary, "structural");
  assert.equal(resolveTimelineRebuildPolicy(prev, next, classification), "immediate");
});

test("caption edit does not trigger structural timelineItems rebuild", () => {
  const prev = buildStory([makeScene("s1", 3), makeScene("s2", 4)]);
  const prevItems = prev.timelineItems;
  const next = applyStoryUpdate(prev, applySceneUpdate(prev, "s1", { subtitle: "Caption only" }));

  assert.equal(scenesStructurallyEqual(prev.scenes, next.scenes), true);
  assert.ok(prevItems);
  assert.ok(next.timelineItems);
  // Transition ids/order preserved — only scene refs refreshed.
  const prevTransitions = prevItems.filter((item) => item.type === "transition").map((item) => item.id);
  const nextTransitions = next.timelineItems
    .filter((item) => item.type === "transition")
    .map((item) => item.id);
  assert.deepEqual(nextTransitions, prevTransitions);

  const classification = classifyStoryPatch(prev, next);
  assert.equal(resolveTimelineRebuildPolicy(prev, next, classification), "debounced");
  assert.equal(
    resolveStoryEvolutionDebounceMs(classification),
    DEFERRED_STORY_EVOLUTION_DEBOUNCE_MS,
  );
});

test("motion edit does not trigger structural timelineItems rebuild", () => {
  const prev = buildStory([makeScene("s1", 3), makeScene("s2", 4)]);
  const prevItems = prev.timelineItems;
  const next = applyStoryUpdate(
    prev,
    applySceneImageSettings(prev, "s1", {
      imageMotion: { type: "zoom-out", intensity: "medium" },
    }),
  );

  assert.equal(scenesStructurallyEqual(prev.scenes, next.scenes), true);
  const prevTransitions = (prevItems ?? [])
    .filter((item) => item.type === "transition")
    .map((item) => item.id);
  const nextTransitions = (next.timelineItems ?? [])
    .filter((item) => item.type === "transition")
    .map((item) => item.id);
  assert.deepEqual(nextTransitions, prevTransitions);

  const classification = classifyStoryPatch(prev, next);
  assert.equal(resolveTimelineRebuildPolicy(prev, next, classification), "debounced");
});

test("media-only edit skips master timeline rebuild", () => {
  const prev = buildStory([makeScene("s1", 3)]);
  const next = applyStoryUpdate(
    prev,
    applySceneUpdate(prev, "s1", {
      image: { url: "https://example.com/replaced.jpg", scale: 1, x: 0, y: 0 },
    }),
  );
  const classification = classifyStoryPatch(prev, next);
  assert.equal(resolveTimelineRebuildPolicy(prev, next, classification), "none");
});

test("structural: DraftEditorFlow wires classification and timeline epoch", () => {
  const draftEditorFlow = readSrc("src/features/drafts/components/DraftEditorFlow.tsx");
  const workspace = readSrc("src/components/StoryWorkspace.tsx");
  const provider = readSrc(
    "src/features/timeline-intelligence/master-timeline/PreviewMasterTimelineProvider.tsx",
  );
  const motionPanel = readSrc("src/features/editor/components/motion/MotionPanel.tsx");

  assert.match(draftEditorFlow, /classifyStoryPatch/);
  assert.match(draftEditorFlow, /resolveTimelineRebuildPolicy/);
  assert.match(draftEditorFlow, /timelineEpoch/);
  assert.match(draftEditorFlow, /DEFERRED_STORY_EVOLUTION_DEBOUNCE_MS|resolveStoryEvolutionDebounceMs/);
  assert.match(workspace, /timelineEpoch=\{props\.timelineEpoch\}/);
  assert.match(provider, /timelineEpoch/);
  assert.match(motionPanel, /setAnimatedPreview\(true\)/);
  assert.doesNotMatch(
    motionPanel.slice(
      motionPanel.indexOf("handleCategoryChange"),
      motionPanel.indexOf("handlePresetSelect"),
    ),
    /onMotionChange\(\{\s*type:\s*"zoom/,
  );
});

test("scenesStructurallyEqual ignores caption and motion fields", () => {
  const a = buildStory([makeScene("s1", 3)]).scenes;
  const b = a.map((scene) => ({
    ...scene,
    subtitle: "Changed",
    image: scene.image
      ? {
          ...scene.image,
          scale: 2,
          imageMotion: { type: "zoom-in" as const, intensity: "strong" as const },
        }
      : scene.image,
  }));
  assert.equal(scenesStructurallyEqual(a, b), true);

  const c = applyScenesUpdate(buildStory(a), [
    { ...a[0]!, duration: 9, durationMs: 9000, durationSource: "manual" },
  ]).scenes;
  assert.equal(scenesStructurallyEqual(a, c), false);
});

console.log(`\nstoryPatchClassifier: ${passed} passed`);
