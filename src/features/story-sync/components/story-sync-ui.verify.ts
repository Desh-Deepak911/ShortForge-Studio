/**
 * Story sync UI + editor wiring — 4.0A-2.
 * Run: npm run test:story-sync-ui
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  applyStorySyncEdit,
  createInitialStorySynchronizationState,
  isStorySyncExportBlocked,
  markExportSynchronized,
  markNarrationSynchronized,
  markPreviewSynchronized,
  markVoiceSynchronized,
  rebuildNarrationFromScenes,
  resolveStorySyncBanner,
  resolveStorySyncEditKind,
  resolveStorySyncSteps,
} from "@/features/story-sync";
import { classifyStoryPatch } from "@/features/editor/story-patches";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { recalculateSceneTimings } from "@/features/story/utils";
import {
  applySceneImageSettings,
  applySceneUpdate,
  applyStoryUpdate,
  applyTransitionUpdate,
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
    title: "Story sync UI story",
    narration: "Story sync UI narration.",
    scenes: timedScenes,
    totalDuration,
    voiceoverUrl: "blob:voice",
    voiceoverDurationMs: totalDuration * 1000,
  });
}

function commit(prev: FootieScript, next: FootieScript) {
  const synced = applyStoryUpdate(prev, next);
  const classification = classifyStoryPatch(prev, synced);
  const kind = resolveStorySyncEditKind(prev, synced, classification);
  return { synced, classification, kind };
}

test("insert scene shows narration banner", () => {
  const prev = buildStory([makeScene("s1", 3), makeScene("s2", 4)]);
  const insertResult = insertTimelineSceneAfter(prev, "s1");
  assert.ok(insertResult);
  const { kind } = commit(prev, insertResult.script);
  assert.equal(kind, "structural");

  let state = createInitialStorySynchronizationState();
  state = applyStorySyncEdit(state, kind!);
  const banner = resolveStorySyncBanner(state);
  assert.ok(banner);
  assert.equal(banner.kind, "narration");
  assert.match(banner.primaryLabel, /narration/i);
});

test("duration edit keeps narration banner", () => {
  let state = applyStorySyncEdit(createInitialStorySynchronizationState(), "structural");
  assert.equal(resolveStorySyncBanner(state)?.kind, "narration");

  const prev = buildStory([makeScene("s1", 3), makeScene("s2", 4)]);
  const { kind } = commit(
    prev,
    applySceneUpdate(prev, "s1", { duration: 5, durationMs: 5000, durationSource: "manual" }),
  );
  assert.equal(kind, "duration");
  state = applyStorySyncEdit(state, kind!);
  assert.equal(resolveStorySyncBanner(state)?.kind, "narration");
});

test("written caption edit leaves banner unchanged", () => {
  let state = applyStorySyncEdit(createInitialStorySynchronizationState(), "structural");
  const before = resolveStorySyncBanner(state);
  assert.ok(before);

  const prev = buildStory([makeScene("s1", 3)]);
  const { kind } = commit(prev, applySceneUpdate(prev, "s1", { subtitle: "Only caption" }));
  assert.equal(kind, "caption");
  state = applyStorySyncEdit(state, kind!);
  const after = resolveStorySyncBanner(state);
  assert.deepEqual(after, before);
});

test("narrated subtitle edit dirties narration", () => {
  let state = applyStorySyncEdit(createInitialStorySynchronizationState(), "structural");
  state = applyStorySyncEdit(state, "narration");
  state = applyStorySyncEdit(state, "voice_generated");
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);

  const prev = buildStory([makeScene("s1", 3)]);
  const { kind } = commit(
    prev,
    applySceneUpdate(prev, "s1", { subtitleText: "New narrated subtitle copy." }),
  );
  assert.equal(kind, "spoken_text");
  state = applyStorySyncEdit(state, kind!);
  assert.equal(state.narrationDirty, true);
  assert.equal(state.voiceDirty, true);
  assert.equal(state.exportDirty, true);
  assert.equal(resolveStorySyncBanner(state)?.title, "Narrated subtitles changed.");
});

test("narrated subtitle edit after full sync dirties narration again", () => {
  let state = markExportSynchronized(
    markPreviewSynchronized(
      markVoiceSynchronized(markNarrationSynchronized(createInitialStorySynchronizationState()), null),
      null,
    ),
    null,
  );
  assert.equal(resolveStorySyncBanner(state), null);

  const prev = buildStory([makeScene("s1", 3)]);
  const { kind } = commit(
    prev,
    applySceneUpdate(prev, "s1", { subtitleText: "Changed after everything synced." }),
  );
  assert.equal(kind, "spoken_text");
  state = applyStorySyncEdit(state, kind!);
  assert.equal(resolveStorySyncBanner(state)?.kind, "narration");
});

test("caption mode switch does not show narration banner", () => {
  let state = markExportSynchronized(
    markPreviewSynchronized(
      markVoiceSynchronized(markNarrationSynchronized(createInitialStorySynchronizationState()), null),
      null,
    ),
    null,
  );
  const prev = buildStory([
    {
      ...makeScene("s1", 3, { narration: "Scene narration excerpt.", subtitle: "Heading" }),
      captionMode: "generated",
      subtitleText: undefined,
    },
  ]);
  const next = applyStoryUpdate(prev, applySceneUpdate(prev, "s1", { captionMode: "subtitles" }));
  const { kind } = commit(prev, next);
  assert.equal(kind, "caption");
  state = applyStorySyncEdit(state, kind!);
  assert.equal(resolveStorySyncBanner(state), null);
  assert.equal(isStorySyncExportBlocked(state), false);
});

test("caption mode switch back to written caption does not dirty narration", () => {
  const prev = buildStory([
    {
      ...makeScene("s1", 3, { subtitleText: "Narrated copy.", narration: "Scene narration excerpt." }),
      captionMode: "subtitles",
    },
  ]);
  const next = applyStoryUpdate(prev, applySceneUpdate(prev, "s1", { captionMode: "generated" }));
  const { kind } = commit(prev, next);
  assert.equal(kind, "caption");
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, false);
});

test("insert scene dirties narration", () => {
  const prev = buildStory([makeScene("s1", 3)]);
  const insertResult = insertTimelineSceneAfter(prev, "s1");
  assert.ok(insertResult);
  const { kind } = commit(prev, insertResult.script);
  assert.equal(kind, "structural");
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, true);
  assert.equal(state.voiceDirty, true);
});

test("image edit does not dirty narration", () => {
  const prev = buildStory([makeScene("s1", 3)]);
  const { kind } = commit(
    prev,
    applySceneUpdate(prev, "s1", {
      image: { url: "https://example.com/new.jpg", scale: 1, x: 0, y: 0 },
    }),
  );
  assert.equal(kind, "image");
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(resolveStorySyncBanner(state), null);
});

test("generate narration replaces banner with voice banner", () => {
  let state = applyStorySyncEdit(createInitialStorySynchronizationState(), "structural");
  assert.equal(resolveStorySyncBanner(state)?.kind, "narration");

  state = applyStorySyncEdit(state, "narration");
  const banner = resolveStorySyncBanner(state);
  assert.ok(banner);
  assert.equal(banner.kind, "voice");
  assert.match(banner.primaryLabel, /voice/i);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.storyDirty, false);
  assert.equal(state.voiceDirty, true);
});

test("voiceDirty banner shows Generate voice action", () => {
  let state = applyStorySyncEdit(createInitialStorySynchronizationState(), "structural");
  state = applyStorySyncEdit(state, "narration");
  const banner = resolveStorySyncBanner(state);
  assert.ok(banner);
  assert.equal(banner.kind, "voice");
  assert.match(banner.primaryLabel, /Generate voice/i);
});

test("generate voice clears voiceDirty and keeps exportDirty", () => {
  let state = applyStorySyncEdit(createInitialStorySynchronizationState(), "structural");
  state = applyStorySyncEdit(state, "narration");
  assert.equal(resolveStorySyncBanner(state)?.kind, "voice");

  state = applyStorySyncEdit(state, "voice_generated");
  assert.equal(state.voiceDirty, false);
  assert.equal(state.previewDirty, false);
  assert.equal(state.exportDirty, true);
  // Highest remaining priority is export guidance.
  assert.equal(resolveStorySyncBanner(state)?.kind, "export");
});

test("voice upload success clears voiceDirty", () => {
  const prev = buildStory([makeScene("s1", 3)]);
  const uploaded = {
    ...prev,
    voiceoverUrl: "blob:uploaded-voice",
    voiceoverDurationMs: 12_000,
  };
  const { kind } = commit(prev, uploaded);
  assert.equal(kind, "voice_generated");

  let state = applyStorySyncEdit(createInitialStorySynchronizationState(), "narration");
  assert.equal(state.voiceDirty, true);
  state = applyStorySyncEdit(state, kind!);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.previewDirty, false);
  assert.equal(state.exportDirty, true);
});

test("export marks export clean", () => {
  let state = applyStorySyncEdit(createInitialStorySynchronizationState(), "transition");
  assert.equal(state.exportDirty, true);
  assert.equal(resolveStorySyncBanner(state)?.kind, "export");

  state = applyStorySyncEdit(state, "export_success");
  assert.equal(state.exportDirty, false);
});

test("transition edit dirties preview and export only", () => {
  const prev = buildStory([makeScene("s1", 3), makeScene("s2", 4)]);
  const transition = prev.timelineItems?.find((item) => item.type === "transition");
  assert.ok(transition && transition.type === "transition");

  const { kind } = commit(
    prev,
    applyTransitionUpdate(prev, transition.id, { effect: "slide-left", durationMs: 400 }),
  );
  assert.equal(kind, "transition");

  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.storyDirty, false);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.previewDirty, true);
  assert.equal(state.exportDirty, true);
  assert.equal(resolveStorySyncBanner(state)?.kind, "export");
});

test("status card steps reflect dirty flags", () => {
  let state = applyStorySyncEdit(createInitialStorySynchronizationState(), "structural");
  let steps = resolveStorySyncSteps(state);
  assert.equal(steps.find((step) => step.id === "narration")?.tone, "warning");
  assert.equal(steps.find((step) => step.id === "voice")?.tone, "warning");

  state = applyStorySyncEdit(state, "narration");
  steps = resolveStorySyncSteps(state);
  assert.equal(steps.find((step) => step.id === "story")?.tone, "success");
  assert.equal(steps.find((step) => step.id === "narration")?.tone, "success");
  assert.equal(steps.find((step) => step.id === "voice")?.tone, "warning");
});

test("structural: editor wires banner, card, and lifecycle hooks", () => {
  const draftEditorFlow = readSrc("src/features/drafts/components/DraftEditorFlow.tsx");
  const workspace = readSrc("src/components/StoryWorkspace.tsx");
  const shell = readSrc("src/components/studio-shell/StudioShell.tsx");
  const exportPanel = readSrc("src/components/ExportPanel.tsx");
  const preview = readSrc("src/features/preview/components/VideoPreview.tsx");
  const banner = readSrc(
    "src/features/story-sync/components/StorySynchronizationBanner.tsx",
  );
  const card = readSrc(
    "src/features/story-sync/components/SynchronizationStatusCard.tsx",
  );
  const studioSceneInspector = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );

  assert.match(draftEditorFlow, /StorySyncProvider/);
  assert.match(draftEditorFlow, /resolveStorySyncEditKind/);
  assert.match(draftEditorFlow, /applyStorySyncEdit/);
  assert.match(workspace, /StorySynchronizationBanner/);
  assert.match(workspace, /SynchronizationStatusCard/);
  assert.match(workspace, /rebuildNarrationFromScenes/);
  assert.match(workspace, /handleUpdateNarration/);
  assert.match(workspace, /applyPendingSceneCaptionDrafts/);
  assert.match(exportPanel, /isStorySyncExportBlocked/);
  assert.match(exportPanel, /STORY_SYNC_EXPORT_BLOCKED_MESSAGE/);
  assert.match(studioSceneInspector, /buildCaptionModeSwitchPatch/);
  assert.match(workspace, /focusVoiceoverSection/);
  assert.match(workspace, /onRegenerateVoice=\{focusVoiceoverSection\}/);
  assert.match(workspace, /studio-project-voiceover-regenerate/);
  assert.match(workspace, /onExportSuccess/);
  assert.match(workspace, /onPreviewStart/);
  assert.match(shell, /inspectorBanner/);
  assert.match(exportPanel, /onExportSuccess\?\.\(\)/);
  assert.match(preview, /onPreviewStart\?\.\(\)/);
  assert.match(banner, /data-story-sync-banner/);
  assert.match(card, /data-story-sync-card/);
  assert.match(card, /"Update"/);
  assert.match(card, /"Regenerate"/);
  assert.doesNotMatch(banner, /runStudioIntelligence|generate-script|generate-voiceover/);
  assert.doesNotMatch(card, /generate-voiceover|applyVoiceoverChanges/);
  assert.doesNotMatch(
    workspace.slice(
      workspace.indexOf("handleUpdateNarration"),
      workspace.indexOf("handlePreviewStart"),
    ),
    /generate-voiceover/,
  );
  assert.match(
    workspace.slice(
      workspace.indexOf("handleUpdateNarration"),
      workspace.indexOf("handlePreviewStart"),
    ),
    /storySync\?\.applySyncEdit\("narration"\)/,
  );

  const voiceoverSection = readSrc(
    "src/features/editor/components/ProjectAudioVoiceoverSection.tsx",
  );
  assert.match(voiceoverSection, /data-story-sync-voice-guidance/);
  assert.match(voiceoverSection, /Your narration changed\. Regenerate voiceover/);
  assert.match(voiceoverSection, /studio-project-voiceover-regenerate/);
  assert.doesNotMatch(voiceoverSection, /useEffect\([\s\S]*applyVoiceoverChanges/);
});

test("update narration action rebuilds text and clears narration dirty only", () => {
  const prev = buildStory([
    makeScene("s1", 3),
    {
      ...makeScene("inserted", 3),
      narration: undefined,
      subtitleText: undefined,
      subtitle: "Fresh inserted caption.",
    },
  ]);

  const result = rebuildNarrationFromScenes(prev);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.match(result.narration, /Fresh inserted caption/);

  let state = applyStorySyncEdit(createInitialStorySynchronizationState(), "structural");
  const { kind } = commit(prev, result.script);
  assert.equal(kind, "narration");
  state = applyStorySyncEdit(state, kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, true);
});

test("update narration noop clears narration dirty via explicit sync edit", () => {
  const prev = syncFootieScript({
    ...buildStory([
      {
        ...makeScene("s1", 3),
        subtitleText: "Same line.",
        narration: "Same line.",
      },
    ]),
    narration: "Same line.",
  });
  const rebuilt = rebuildNarrationFromScenes(prev);
  assert.equal(rebuilt.ok, true);
  if (!rebuilt.ok) {
    return;
  }
  assert.equal(rebuilt.script.narration, prev.narration);

  let state = applyStorySyncEdit(createInitialStorySynchronizationState(), "spoken_text");
  const { kind } = commit(prev, rebuilt.script);
  assert.equal(kind, null);
  state = applyStorySyncEdit(state, "narration");
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, true);
});

test("motion edit does not change sync banner", () => {
  let state = applyStorySyncEdit(createInitialStorySynchronizationState(), "structural");
  const before = resolveStorySyncBanner(state);

  const prev = buildStory([makeScene("s1", 3)]);
  const { kind } = commit(
    prev,
    applySceneImageSettings(prev, "s1", {
      imageMotion: { type: "zoom-in", intensity: "strong" },
    }),
  );
  assert.equal(kind, "motion");
  state = applyStorySyncEdit(state, kind!);
  assert.deepEqual(resolveStorySyncBanner(state), before);
});

console.log(`\nstory-sync-ui: ${passed} passed`);
