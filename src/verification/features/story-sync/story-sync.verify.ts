/**
 * Story Synchronization Engine foundation — 4.0A-1 / 4.0A-3.
 * Run: npm run test:story-sync
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  advanceNarrationVersion,
  advanceStoryVersion,
  advanceVoiceVersion,
  applyStorySyncEdit,
  createInitialStorySynchronizationState,
  getSynchronizationSummary,
  markExportSynchronized,
  markNarrationSynchronized,
  markPreviewSynchronized,
  markVoiceSynchronized,
  NO_USABLE_NARRATION_WARNING,
  rebuildNarrationFromScenes,
  resolveSceneNarrationSourceText,
  resolveStorySyncEditKind,
  resolvePresentationSyncEditKind,
  resolveStorySyncBanner,
  isStorySyncExportBlocked,
  STORY_SYNC_EXPORT_BLOCKED_MESSAGE,
} from "@/features/story-sync";
import {
  applyPendingSceneCaptionDrafts,
  registerPendingSceneCaptionDraft,
  resetSceneCaptionDraftRegistryForTests,
} from "@/features/editor/scene-caption-drafts/scene-caption-draft-registry";
import { classifyStoryPatch } from "@/features/editor/story-patches";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { recalculateSceneTimings } from "@/features/story/utils";
import {
  applyCaptionModeSwitchUpdate,
  applyNarrationRebuildStoryUpdate,
  applyPresentationSceneUpdate,
  applyPresentationStoryUpdate,
  applySceneUpdate,
  applyStoryUpdate,
  syncFootieScript,
} from "@/lib/utils/voiceover";
import { getSubtitlesCaptionSource } from "@/features/story/utils/subtitle.utils";
import {
  buildSceneCaptionPresetPatch,
  buildSceneSubtitleEffectPatch,
} from "@/features/caption-engine/caption-engine.utils";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const FIXED_AT = "2026-07-04T00:00:00.000Z";

function commitPresentation(prev: FootieScript, next: FootieScript) {
  const synced = applyPresentationStoryUpdate(prev, next);
  const classification = classifyStoryPatch(prev, synced);
  const kind = resolvePresentationSyncEditKind(classification);
  return { synced, classification, kind };
}

test("insert scene (structural) marks narration dirty", () => {
  const initial = createInitialStorySynchronizationState();
  const next = applyStorySyncEdit(initial, "structural");

  assert.equal(next.storyDirty, true);
  assert.equal(next.narrationDirty, true);
  assert.equal(next.voiceDirty, true);
  assert.equal(next.previewDirty, true);
  assert.equal(next.exportDirty, true);
  assert.equal(next.storyVersion, initial.storyVersion + 1);
});

test("duration marks narration dirty", () => {
  const initial = createInitialStorySynchronizationState();
  const next = applyStorySyncEdit(initial, "duration");

  assert.equal(next.storyDirty, true);
  assert.equal(next.narrationDirty, true);
  assert.equal(next.voiceDirty, true);
  assert.equal(next.previewDirty, true);
  assert.equal(next.exportDirty, true);
});

test("written caption edit does not mark dirty", () => {
  const initial = createInitialStorySynchronizationState();
  const next = applyStorySyncEdit(initial, "caption");

  assert.deepEqual(next, initial);
  assert.equal(next.storyDirty, false);
  assert.equal(next.narrationDirty, false);
  assert.equal(next.voiceDirty, false);
  assert.equal(next.previewDirty, false);
  assert.equal(next.exportDirty, false);
});

test("narrated subtitle edit marks narration voice preview and export dirty", () => {
  const synced = markExportSynchronized(
    markPreviewSynchronized(
      markVoiceSynchronized(markNarrationSynchronized(createInitialStorySynchronizationState(), FIXED_AT), FIXED_AT),
      FIXED_AT,
    ),
    FIXED_AT,
  );
  const next = applyStorySyncEdit(synced, "spoken_text");
  assert.equal(next.storyDirty, false);
  assert.equal(next.narrationDirty, true);
  assert.equal(next.voiceDirty, true);
  assert.equal(next.previewDirty, true);
  assert.equal(next.exportDirty, true);
});

test("image edit marks export stale only", () => {
  const initial = createInitialStorySynchronizationState();
  const next = applyStorySyncEdit(initial, "image");

  assert.equal(next.narrationDirty, false);
  assert.equal(next.voiceDirty, false);
  assert.equal(next.exportDirty, true);
});

test("motion edit marks export stale only", () => {
  const initial = createInitialStorySynchronizationState();
  const next = applyStorySyncEdit(initial, "motion");

  assert.equal(next.narrationDirty, false);
  assert.equal(next.voiceDirty, false);
  assert.equal(next.exportDirty, true);
});

test("transition timing marks preview and export dirty only", () => {
  const initial = createInitialStorySynchronizationState();
  const next = applyStorySyncEdit(initial, "transition");

  assert.equal(next.storyDirty, false);
  assert.equal(next.narrationDirty, false);
  assert.equal(next.voiceDirty, false);
  assert.equal(next.previewDirty, true);
  assert.equal(next.exportDirty, true);
});

test("narration update clears narration dirty", () => {
  const dirty = applyStorySyncEdit(createInitialStorySynchronizationState(), "structural");
  assert.equal(dirty.narrationDirty, true);
  assert.equal(dirty.storyDirty, true);

  const afterNarration = applyStorySyncEdit(dirty, "narration", FIXED_AT);

  assert.equal(afterNarration.narrationDirty, false);
  assert.equal(afterNarration.storyDirty, false);
  assert.equal(afterNarration.lastNarrationGeneratedAt, FIXED_AT);
  assert.equal(afterNarration.narrationVersion, dirty.narrationVersion + 1);
  assert.equal(afterNarration.voiceDirty, true);
  assert.equal(afterNarration.previewDirty, true);
  assert.equal(afterNarration.exportDirty, true);
});

test("voice generation clears voice dirty", () => {
  const dirty = applyStorySyncEdit(createInitialStorySynchronizationState(), "duration");
  assert.equal(dirty.voiceDirty, true);
  assert.equal(dirty.exportDirty, true);

  const afterVoice = applyStorySyncEdit(dirty, "voice_generated", FIXED_AT);

  assert.equal(afterVoice.voiceDirty, false);
  assert.equal(afterVoice.previewDirty, false);
  // Export stays dirty until an explicit export succeeds.
  assert.equal(afterVoice.exportDirty, true);
  assert.equal(afterVoice.lastVoiceGeneratedAt, FIXED_AT);
  assert.equal(afterVoice.voiceVersion, dirty.voiceVersion + 1);
});

test("export clears export dirty", () => {
  const dirty = applyStorySyncEdit(createInitialStorySynchronizationState(), "transition");
  assert.equal(dirty.exportDirty, true);

  const afterExport = applyStorySyncEdit(dirty, "export_success", FIXED_AT);

  assert.equal(afterExport.exportDirty, false);
  assert.equal(afterExport.lastExportAt, FIXED_AT);
  assert.equal(afterExport.exportVersion, dirty.exportVersion + 1);
  // Preview may still be dirty after transition-only export clear.
  assert.equal(afterExport.previewDirty, true);
});

test("version increments behave correctly", () => {
  let state = createInitialStorySynchronizationState();

  state = advanceStoryVersion(state);
  state = advanceStoryVersion(state);
  assert.equal(state.storyVersion, 2);

  state = advanceNarrationVersion(state);
  assert.equal(state.narrationVersion, 1);

  state = advanceVoiceVersion(state);
  state = advanceVoiceVersion(state);
  state = advanceVoiceVersion(state);
  assert.equal(state.voiceVersion, 3);

  state = applyStorySyncEdit(state, "structural");
  assert.equal(state.storyVersion, 3);

  state = markNarrationSynchronized(state, FIXED_AT);
  state = markVoiceSynchronized(state, FIXED_AT);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.exportDirty, true);
  state = markExportSynchronized(state, FIXED_AT);
  assert.equal(state.exportDirty, false);
});

function makeScene(
  id: string,
  durationSec: number,
  text: { narration?: string; subtitleText?: string; subtitle?: string } = {},
): FootieScene {
  const durationMs = durationSec * 1000;
  const defaultSubtitle =
    text.subtitle ??
    (text.narration || text.subtitleText ? "" : `Caption ${id}`);
  return {
    id,
    start: 0,
    end: durationSec,
    duration: durationSec,
    startMs: 0,
    endMs: durationMs,
    durationMs,
    durationSource: "manual",
    subtitle: defaultSubtitle,
    captionMode: "generated",
    subtitleText: text.subtitleText,
    narration: text.narration,
    image: {
      url: `https://example.com/${id}.jpg`,
      scale: 1.2,
      x: 0.1,
      y: -0.1,
      fitMode: "fill",
      imageMotion: { type: "zoom-in", intensity: "medium" },
    },
  };
}

function buildStory(scenes: FootieScene[], narration = "Original narration."): FootieScript {
  const timedScenes = recalculateSceneTimings(scenes);
  const totalDuration = timedScenes.reduce((sum, scene) => sum + scene.duration, 0);
  return syncFootieScript({
    title: "Narration rebuild story",
    narration,
    scenes: timedScenes,
    totalDuration,
    voiceoverUrl: "blob:voice",
    voiceoverDurationMs: totalDuration * 1000,
    backgroundMusic: { enabled: true, volume: 0.4, source: "library", duckingEnabled: true, fadeIn: true, fadeOut: true },
  });
}

test("legacy generated scenes still rebuild from narration excerpts", () => {
  const story = buildStory([
    makeScene("s1", 3, { narration: "Opening line." }),
    makeScene("s2", 3, { narration: "Second line." }),
  ]);
  const result = rebuildNarrationFromScenes(story);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.narration, "Opening line. Second line.");
  }
});

test("written captions are excluded from spoken text rebuild", () => {
  const story = buildStory([
    {
      ...makeScene("s1", 3, { subtitleText: "Narrated one.", subtitle: "Caption one" }),
      captionMode: "subtitles",
    },
    makeScene("s2", 3, { narration: "Spoken from narration.", subtitle: "Visual only caption." }),
  ]);
  const result = rebuildNarrationFromScenes(story);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.narration, "Narrated one. Spoken from narration.");
    assert.doesNotMatch(result.narration, /Visual only caption/);
  }
});

test("placeholder written caption is ignored when narration exists", () => {
  const story = buildStory([
    makeScene("s1", 3, { narration: "Keep this." }),
    makeScene("s2", 3, { narration: "Also keep this.", subtitle: "Add subtitle..." }),
  ]);
  const result = rebuildNarrationFromScenes(story);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.narration, "Keep this. Also keep this.");
    assert.doesNotMatch(result.narration, /Add subtitle/i);
  }
});

test("inserted scene with subtitleText only is included in rebuilt narration", () => {
  const story = buildStory([
    {
      ...makeScene("s1", 3, { subtitleText: "Opening line.", subtitle: "" }),
      captionMode: "subtitles",
    },
    {
      ...makeScene("s2", 3, { subtitleText: "Inserted narrated subtitle.", subtitle: "" }),
      captionMode: "subtitles",
    },
  ]);
  const result = rebuildNarrationFromScenes(story);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.narration, "Opening line. Inserted narrated subtitle.");
  }
});

test("subtitleText wins over subtitle and narration", () => {
  const story = buildStory([
    {
      ...makeScene("s1", 3, {
        narration: "Stale derived narration.",
        subtitleText: "Edited narrated subtitle.",
        subtitle: "Generated caption heading.",
      }),
      captionMode: "subtitles",
    },
  ]);
  const result = rebuildNarrationFromScenes(story);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.narration, "Edited narrated subtitle.");
  }
});

test("stale scene narration loses to edited subtitleText", () => {
  const story = buildStory([
    {
      ...makeScene("s1", 3, {
        narration: "Old voiceover excerpt.",
        subtitleText: "User edited spoken text.",
        subtitle: "On-screen caption.",
      }),
      captionMode: "subtitles",
    },
  ]);
  const result = rebuildNarrationFromScenes(story);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.narration, "User edited spoken text.");
    assert.doesNotMatch(result.narration, /Old voiceover excerpt/);
  }
});

test("scene order preserved in rebuilt narration", () => {
  const story = buildStory([
    makeScene("b", 3, { narration: "Second." }),
    makeScene("a", 3, { narration: "First." }),
  ]);
  // Order is array order, not id order.
  const ordered = buildStory([
    makeScene("a", 3, { narration: "First." }),
    makeScene("b", 3, { narration: "Second." }),
  ]);
  const result = rebuildNarrationFromScenes(ordered);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.narration, "First. Second.");
  }
  void story;
});

test("script settings images and audio preserved", () => {
  const story = buildStory([
    {
      ...makeScene("s1", 5, { subtitleText: "Line one.", subtitle: "" }),
      captionMode: "subtitles",
    },
    {
      ...makeScene("s2", 7, { subtitleText: "Line two.", subtitle: "" }),
      captionMode: "subtitles",
    },
  ]);
  const result = rebuildNarrationFromScenes(story);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.notEqual(result.script, story);
  assert.equal(result.script.title, story.title);
  assert.equal(result.script.scenes, story.scenes);
  assert.equal(result.script.scenes[0]?.duration, 5);
  assert.equal(result.script.scenes[1]?.duration, 7);
  assert.equal(result.script.scenes[0]?.image?.url, story.scenes[0]?.image?.url);
  assert.equal(result.script.scenes[0]?.image?.imageMotion?.type, "zoom-in");
  assert.equal(result.script.voiceoverUrl, story.voiceoverUrl);
  assert.deepEqual(result.script.backgroundMusic, story.backgroundMusic);
  assert.equal(result.script.timelineItems, story.timelineItems);
});

test("no usable text does not clear existing narration", () => {
  const story = buildStory(
    [makeScene("s1", 3, { subtitle: "Add subtitle..." })],
    "Keep original narration.",
  );
  const result = rebuildNarrationFromScenes(story);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "no_usable_text");
    assert.equal(result.script.narration, "Keep original narration.");
    assert.equal(result.script, story);
  }
  assert.match(NO_USABLE_NARRATION_WARNING, /No scene narration or captions found/);
});

test("update narration clears narrationDirty and keeps voiceDirty", () => {
  const prev = buildStory(
    [
      {
        ...makeScene("s1", 3, { subtitleText: "Old narrated one.", subtitle: "" }),
        captionMode: "subtitles",
      },
      {
        ...makeScene("s2", 3, { subtitleText: "New narrated two.", subtitle: "" }),
        captionMode: "subtitles",
      },
    ],
    "Stale global narration.",
  );
  let state = applyStorySyncEdit(createInitialStorySynchronizationState(), "structural");
  assert.equal(state.narrationDirty, true);
  assert.equal(state.voiceDirty, true);

  const rebuilt = rebuildNarrationFromScenes(prev);
  assert.equal(rebuilt.ok, true);
  if (!rebuilt.ok) {
    return;
  }

  const synced = applyNarrationRebuildStoryUpdate(prev, rebuilt.script);
  const classification = classifyStoryPatch(prev, synced);
  const kind = resolveStorySyncEditKind(prev, synced, classification);
  assert.equal(kind, "narration");

  state = applyStorySyncEdit(state, kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, true);
  assert.equal(state.previewDirty, true);
  assert.equal(state.exportDirty, true);
});

test("update narration does not trigger voice generation", () => {
  const rebuildSource = readFileSync(
    join(process.cwd(), "src/features/story-sync/story-narration-rebuild.utils.ts"),
    "utf8",
  );
  const workspace = readFileSync(
    join(process.cwd(), "src/components/StoryWorkspace.tsx"),
    "utf8",
  );
  const voiceHook = readFileSync(
    join(process.cwd(), "src/hooks/useStoryVoiceoverApply.ts"),
    "utf8",
  );
  assert.doesNotMatch(rebuildSource, /generate-voiceover|applyVoiceoverRegeneration/);
  assert.match(voiceHook, /applyVoiceoverChanges/);
  assert.match(workspace, /rebuildNarrationFromScenes/);
  assert.match(workspace, /applyPendingSceneCaptionDrafts/);
  assert.match(voiceHook, /baseline\.narration\.trim\(\)/);
  assert.doesNotMatch(
    workspace.slice(
      workspace.indexOf("handleUpdateNarration"),
      workspace.indexOf("handlePreviewStart"),
    ),
    /generate-voiceover|applyVoiceoverRegeneration/,
  );
});

test("pending caption drafts flush into narration rebuild", () => {
  resetSceneCaptionDraftRegistryForTests();
  const story = buildStory([
    {
      ...makeScene("s1", 3, { subtitleText: "Opening.", subtitle: "" }),
      captionMode: "subtitles",
    },
    {
      ...makeScene("s2", 3, { subtitle: "Add subtitle...", subtitleText: undefined }),
      captionMode: "subtitles",
    },
  ]);

  registerPendingSceneCaptionDraft("s2", {
    subtitleText: "Typed narrated subtitle before debounce.",
  });

  const merged = applyPendingSceneCaptionDrafts(story);
  const result = rebuildNarrationFromScenes(merged);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.match(result.narration, /Typed narrated subtitle before debounce/);
    assert.match(result.narration, /Opening/);
  }

  resetSceneCaptionDraftRegistryForTests();
});

test("resolveSceneNarrationSourceText priority is subtitleText then narration only", () => {
  const scene = makeScene("s1", 3, {
    narration: "Derived narration.",
    subtitleText: "Spoken subtitle text.",
    subtitle: "Generated caption.",
  });
  assert.equal(resolveSceneNarrationSourceText(scene), "Spoken subtitle text.");

  const captionOnly = makeScene("s2", 3, {
    narration: undefined,
    subtitle: "Caption only.",
    subtitleText: undefined,
  });
  assert.equal(resolveSceneNarrationSourceText(captionOnly), null);

  const narrationFallback = makeScene("s3", 3, {
    narration: "Fallback narration.",
    subtitle: "Add subtitle...",
    subtitleText: undefined,
  });
  assert.equal(resolveSceneNarrationSourceText(narrationFallback), "Fallback narration.");
});

test("subtitleText edit classified as spoken_text sync kind", () => {
  const prev = buildStory([makeScene("s1", 3, { subtitleText: "Original spoken text." })]);
  const next = applyStoryUpdate(
    prev,
    applySceneUpdate(prev, "s1", { subtitleText: "Edited spoken text." }),
  );
  const classification = classifyStoryPatch(prev, next);
  assert.ok(classification.classes.includes("spoken_text"));
  const kind = resolveStorySyncEditKind(prev, next, classification);
  assert.equal(kind, "spoken_text");
});

test("written caption edit classified as caption sync kind", () => {
  const prev = buildStory([makeScene("s1", 3, { subtitle: "Heading", subtitleText: "Spoken" })]);
  const next = applyStoryUpdate(prev, applySceneUpdate(prev, "s1", { subtitle: "New heading only." }));
  const classification = classifyStoryPatch(prev, next);
  assert.ok(classification.classes.includes("caption"));
  assert.doesNotMatch(classification.classes.join(","), /spoken_text/);
  const kind = resolveStorySyncEditKind(prev, next, classification);
  assert.equal(kind, "caption");
});

test("narrated subtitle edit after sync dirties narration again", () => {
  let state = markExportSynchronized(
    markPreviewSynchronized(
      markVoiceSynchronized(markNarrationSynchronized(createInitialStorySynchronizationState(), FIXED_AT), FIXED_AT),
      FIXED_AT,
    ),
    FIXED_AT,
  );
  assert.equal(resolveStorySyncBanner(state), null);

  const prev = buildStory([makeScene("s1", 3, { subtitleText: "Synced spoken text." })]);
  const next = applyStoryUpdate(
    prev,
    applySceneUpdate(prev, "s1", { subtitleText: "Edited again after sync." }),
  );
  const classification = classifyStoryPatch(prev, next);
  const kind = resolveStorySyncEditKind(prev, next, classification);
  assert.equal(kind, "spoken_text");
  state = applyStorySyncEdit(state, kind!);
  assert.equal(state.narrationDirty, true);
  assert.equal(state.voiceDirty, true);
  assert.equal(resolveStorySyncBanner(state)?.title, "Narrated subtitles changed.");
});

test("deleting narrated subtitle dirties narration", () => {
  const prev = buildStory([makeScene("s1", 3, { subtitleText: "Remove me." })]);
  const next = applyStoryUpdate(prev, applySceneUpdate(prev, "s1", { subtitleText: "" }));
  const kind = resolveStorySyncEditKind(prev, next, classifyStoryPatch(prev, next));
  assert.equal(kind, "spoken_text");
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, true);
});

test("export blocked when narration, voice, or media incomplete", () => {
  const scriptWithMedia = buildStory([makeScene("s1", 3, { subtitleText: "Line." })]);
  const scriptWithoutMedia = buildStory([
    { ...makeScene("s1", 3, { subtitleText: "Line." }), image: undefined, uploadedImage: undefined },
  ]);

  const clean = createInitialStorySynchronizationState();
  assert.equal(isStorySyncExportBlocked(clean), false);
  assert.equal(isStorySyncExportBlocked(clean, scriptWithMedia), false);
  assert.equal(isStorySyncExportBlocked(clean, scriptWithoutMedia), true);

  const narrationDirty = applyStorySyncEdit(clean, "spoken_text");
  assert.equal(isStorySyncExportBlocked(narrationDirty, scriptWithMedia), true);

  const voiceDirty = applyStorySyncEdit(
    markNarrationSynchronized(createInitialStorySynchronizationState(), FIXED_AT),
    "narration",
  );
  assert.equal(isStorySyncExportBlocked(voiceDirty, scriptWithMedia), true);

  let exportOnly = applyStorySyncEdit(createInitialStorySynchronizationState(), "structural");
  exportOnly = applyStorySyncEdit(exportOnly, "narration");
  exportOnly = applyStorySyncEdit(exportOnly, "voice_generated");
  assert.equal(isStorySyncExportBlocked(exportOnly), false);
  assert.equal(isStorySyncExportBlocked(exportOnly, scriptWithMedia), false);
  assert.equal(isStorySyncExportBlocked(exportOnly, scriptWithoutMedia), true);
  assert.equal(exportOnly.exportDirty, true);
  assert.match(STORY_SYNC_EXPORT_BLOCKED_MESSAGE, /Update narration and regenerate voiceover/);
});

test("export panel blocks when sync is dirty", () => {
  const exportPanel = readFileSync(
    join(process.cwd(), "src/components/ExportPanel.tsx"),
    "utf8",
  );
  assert.match(exportPanel, /resolveExportReadiness/);
  assert.match(exportPanel, /exportBlocked/);
  assert.match(exportPanel, /exportBlocked/);
  assert.doesNotMatch(
    exportPanel.slice(exportPanel.indexOf("const handleExport"), exportPanel.indexOf("await exportFootieShort")),
    /await exportFootieShort/,
  );
});

test("caption mode switch to narrated subtitles does not dirty narration", () => {
  const prev = buildStory([
    {
      ...makeScene("s1", 3, { narration: "Scene narration excerpt.", subtitle: "Heading" }),
      captionMode: "generated",
      subtitleText: undefined,
    },
  ]);
  const { kind } = commitPresentation(prev, applyCaptionModeSwitchUpdate(prev, "s1", "subtitles"));
  assert.equal(kind, "caption");
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(isStorySyncExportBlocked(state), false);
});

test("caption mode switch on legacy scene without ms fields does not dirty narration", () => {
  const legacyScene: FootieScene = {
    ...makeScene("s1", 3, { narration: "Scene narration excerpt.", subtitle: "Heading" }),
    captionMode: "generated",
    subtitleText: undefined,
    startMs: undefined,
    endMs: undefined,
    durationMs: undefined,
  };
  const prev = syncFootieScript({
    title: "Legacy draft",
    narration: "Original narration.",
    scenes: [legacyScene],
    totalDuration: 3,
    voiceoverUrl: "blob:voice",
    voiceoverDurationMs: 3000,
  });
  const next = applyPresentationStoryUpdate(prev, applyCaptionModeSwitchUpdate(prev, "s1", "subtitles"));
  assert.equal(next.scenes[0]?.startMs, prev.scenes[0]?.startMs);
  assert.equal(next.scenes[0]?.endMs, prev.scenes[0]?.endMs);
  assert.equal(next.scenes[0]?.durationMs, prev.scenes[0]?.durationMs);
  assert.equal(next.scenes[0]?.subtitleText, prev.scenes[0]?.subtitleText);
  assert.equal(next.scenes[0]?.narration, prev.scenes[0]?.narration);
  const classification = classifyStoryPatch(prev, next);
  assert.equal(classification.primary, "caption");
  assert.doesNotMatch(classification.classes.join(","), /timing|spoken_text|structural/);
  const kind = resolvePresentationSyncEditKind(classification);
  assert.equal(kind, "caption");
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.previewDirty, false);
  assert.equal(state.exportDirty, false);
  assert.equal(isStorySyncExportBlocked(state), false);
});

test("fresh generated story with written and narrated copy switches without dirty sync", () => {
  const synced = markExportSynchronized(
    markPreviewSynchronized(
      markVoiceSynchronized(markNarrationSynchronized(createInitialStorySynchronizationState(), FIXED_AT), FIXED_AT),
      FIXED_AT,
    ),
    FIXED_AT,
  );
  const prev = buildStory([
    {
      ...makeScene("s1", 3, {
        narration: "Opening spoken line.",
        subtitle: "Opening visual heading",
        subtitleText: "Opening spoken line.",
      }),
      captionMode: "generated",
    },
    {
      ...makeScene("s2", 4, {
        narration: "Second spoken line.",
        subtitle: "Second visual heading",
        subtitleText: "Second spoken line.",
      }),
      captionMode: "generated",
    },
  ]);

  let state = synced;
  const toNarrated = applyPresentationStoryUpdate(prev, applyCaptionModeSwitchUpdate(prev, "s1", "subtitles"));
  const toNarratedKind = resolvePresentationSyncEditKind(classifyStoryPatch(prev, toNarrated));
  assert.equal(toNarratedKind, "caption");
  state = applyStorySyncEdit(state, toNarratedKind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.previewDirty, false);
  assert.equal(state.exportDirty, false);
  assert.equal(isStorySyncExportBlocked(state), false);

  const toWritten = applyPresentationStoryUpdate(toNarrated, applyCaptionModeSwitchUpdate(toNarrated, "s1", "generated"));
  const toWrittenKind = resolvePresentationSyncEditKind(classifyStoryPatch(toNarrated, toWritten));
  assert.equal(toWrittenKind, "caption");
  state = applyStorySyncEdit(state, toWrittenKind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(isStorySyncExportBlocked(state), false);
});

test("caption mode switch does not persist subtitleText seed", () => {
  const prev = buildStory([
    {
      ...makeScene("s1", 3, { narration: "Seed from narration excerpt.", subtitle: "Visual heading" }),
      captionMode: "generated",
      subtitleText: undefined,
    },
  ]);
  const { synced, kind } = commitPresentation(
    prev,
    applyCaptionModeSwitchUpdate(prev, "s1", "subtitles"),
  );
  assert.equal(synced.scenes[0]?.subtitleText, undefined);
  assert.equal(getSubtitlesCaptionSource(synced.scenes[0]!), "Seed from narration excerpt.");
  assert.equal(kind, "caption");
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.deepEqual(state, createInitialStorySynchronizationState());
});

test("caption mode switch back to written caption does not dirty narration", () => {
  const prev = buildStory([
    {
      ...makeScene("s1", 3, { subtitleText: "Narrated copy.", narration: "Scene narration excerpt." }),
      captionMode: "subtitles",
    },
  ]);
  const { kind } = commitPresentation(prev, applyCaptionModeSwitchUpdate(prev, "s1", "generated"));
  assert.equal(kind, "caption");
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(isStorySyncExportBlocked(state), false);
});

test("user subtitleText edit after full sync dirties narration again", () => {
  let state = markExportSynchronized(
    markPreviewSynchronized(
      markVoiceSynchronized(markNarrationSynchronized(createInitialStorySynchronizationState(), FIXED_AT), FIXED_AT),
      FIXED_AT,
    ),
    FIXED_AT,
  );
  const prev = buildStory([
    {
      ...makeScene("s1", 3, { subtitleText: "Synced spoken text.", narration: "Synced spoken text." }),
      captionMode: "subtitles",
    },
  ]);
  const next = applyStoryUpdate(
    prev,
    applySceneUpdate(prev, "s1", { subtitleText: "Edited again after sync." }),
  );
  const kind = resolveStorySyncEditKind(prev, next, classifyStoryPatch(prev, next));
  assert.equal(kind, "spoken_text");
  state = applyStorySyncEdit(state, kind!);
  assert.equal(state.narrationDirty, true);
  assert.equal(state.voiceDirty, true);
  assert.equal(state.previewDirty, true);
  assert.equal(state.exportDirty, true);
  assert.equal(isStorySyncExportBlocked(state), true);
});

test("update narration noop clears narrationDirty when rebuilt text is unchanged", () => {
  const prev = buildStory(
    [
      {
        ...makeScene("s1", 3, { subtitleText: "Same spoken line.", narration: "Same spoken line." }),
        captionMode: "subtitles",
      },
    ],
    "Same spoken line.",
  );
  let state = applyStorySyncEdit(createInitialStorySynchronizationState(), "spoken_text");
  assert.equal(state.narrationDirty, true);

  const rebuilt = rebuildNarrationFromScenes(prev);
  assert.equal(rebuilt.ok, true);
  if (!rebuilt.ok) {
    return;
  }
  assert.equal(rebuilt.script.narration, prev.narration);

  const synced = applyNarrationRebuildStoryUpdate(prev, rebuilt.script);
  const kind = resolveStorySyncEditKind(prev, synced, classifyStoryPatch(prev, synced));
  assert.equal(kind, null);

  state = applyStorySyncEdit(state, "narration");
  assert.equal(state.narrationDirty, false);
  assert.equal(state.storyDirty, false);
  assert.equal(state.voiceDirty, true);
  assert.equal(state.previewDirty, true);
  assert.equal(state.exportDirty, true);
});

test("user subtitleText edit after mode switch dirties narration", () => {
  let state = createInitialStorySynchronizationState();
  const base = buildStory([
    {
      ...makeScene("s1", 3, { narration: "Scene narration excerpt.", subtitle: "Heading" }),
      captionMode: "generated",
      subtitleText: undefined,
    },
  ]);
  const switched = applyPresentationStoryUpdate(base, applyCaptionModeSwitchUpdate(base, "s1", "subtitles"));
  const switchKind = resolvePresentationSyncEditKind(classifyStoryPatch(base, switched));
  state = applyStorySyncEdit(state, switchKind!);
  assert.equal(state.narrationDirty, false);

  const edited = applyStoryUpdate(
    switched,
    applySceneUpdate(switched, "s1", { subtitleText: "User edited narrated copy." }),
  );
  const editKind = resolveStorySyncEditKind(switched, edited, classifyStoryPatch(switched, edited));
  assert.equal(editKind, "spoken_text");
  state = applyStorySyncEdit(state, editKind!);
  assert.equal(state.narrationDirty, true);
  assert.equal(isStorySyncExportBlocked(state), true);
});

test("getSynchronizationSummary prioritizes outstanding work", () => {
  const synced = createInitialStorySynchronizationState();
  assert.equal(getSynchronizationSummary(synced).status, "Synced");

  const needsNarration = applyStorySyncEdit(synced, "structural");
  assert.equal(getSynchronizationSummary(needsNarration).status, "Needs narration update");

  const needsVoice = applyStorySyncEdit(needsNarration, "narration", FIXED_AT);
  assert.equal(getSynchronizationSummary(needsVoice).status, "Needs voice regeneration");

  const previewOnly = {
    ...createInitialStorySynchronizationState(),
    previewDirty: true,
  };
  assert.equal(getSynchronizationSummary(previewOnly).status, "Needs preview refresh");

  const exportOnly = {
    ...createInitialStorySynchronizationState(),
    exportDirty: true,
  };
  assert.equal(getSynchronizationSummary(exportOnly).status, "Needs export");
});

test("presentation caption mode switch does not write timing ms fields", () => {
  const prev = buildStory([
    {
      ...makeScene("s1", 3, { narration: "Spoken excerpt.", subtitle: "Heading" }),
      captionMode: "generated",
    },
  ]);
  const { synced } = commitPresentation(prev, applyCaptionModeSwitchUpdate(prev, "s1", "subtitles"));
  assert.equal(synced.scenes[0]?.startMs, prev.scenes[0]?.startMs);
  assert.equal(synced.scenes[0]?.endMs, prev.scenes[0]?.endMs);
  assert.equal(synced.scenes[0]?.durationMs, prev.scenes[0]?.durationMs);
});

test("presentation caption preset change does not dirty narration or voice", () => {
  const prev = buildStory([
    {
      ...makeScene("s1", 3, { subtitleText: "Narrated copy.", narration: "Narrated copy." }),
      captionMode: "subtitles",
    },
  ]);
  const { kind } = commitPresentation(
    prev,
    applyPresentationSceneUpdate(prev, "s1", buildSceneCaptionPresetPatch("tiktok")),
  );
  assert.equal(kind, "caption");
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
});

test("presentation subtitle effect change does not dirty narration or voice", () => {
  const prev = buildStory([
    {
      ...makeScene("s1", 3, { subtitleText: "Narrated copy.", narration: "Narrated copy." }),
      captionMode: "subtitles",
    },
  ]);
  const { kind } = commitPresentation(
    prev,
    applyPresentationSceneUpdate(prev, "s1", buildSceneSubtitleEffectPatch("typewriter")),
  );
  assert.equal(kind, "caption");
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
});

console.log(`\nstory-sync: ${passed} passed`);
