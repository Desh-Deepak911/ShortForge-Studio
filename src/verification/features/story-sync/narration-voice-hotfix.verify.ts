/**
 * P1 hotfix — unified spoken text resolution + narration rebuild completeness.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyStoryPatch } from "@/features/editor/story-patches";
import { getCanonicalVoiceover } from "@/features/audio/utils/canonical-voiceover.utils";
import { buildPreviewMasterTimeline } from "@/features/preview/utils/preview-master-timeline.utils";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import {
  applyStorySyncEdit,
  createInitialStorySynchronizationState,
  rebuildNarrationFromScenes,
  resolvePresentationSyncEditKind,
  resolveSceneSpokenText,
  resolveStorySyncEditKind,
  validateNarrationRebuildSources,
} from "@/features/story-sync";
import type { FootieScene, FootieScript } from "@/features/story/types";
import { recalculateSceneTimings } from "@/features/story/utils";
import { getStoryTotalDuration } from "@/features/story/utils/scene.utils";
import {
  applyNarrationRebuildStoryUpdate,
  applyPresentationSceneUpdate,
  applyVoiceoverChanges,
  syncFootieScript,
} from "@/lib/utils/voiceover";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function makeNarratedScene(
  id: string,
  durationSec: number,
  options: {
    subtitleText?: string;
    narration?: string;
    subtitle?: string;
    captionMode?: FootieScene["captionMode"];
    captionLayout?: FootieScene["captionLayout"];
  } = {},
): FootieScene {
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
    subtitle: options.subtitle ?? `Caption ${id}`,
    captionMode: options.captionMode ?? "subtitles",
    subtitleText: options.subtitleText,
    subtitleEffect: "fade-up",
    narration:
      "narration" in options
        ? options.narration
        : `Derived excerpt for ${id}`,
    captionLayout: options.captionLayout,
  };
}

function buildNarratedStory(scenes: FootieScene[]): FootieScript {
  const timedScenes = recalculateSceneTimings(scenes);
  const totalDuration = getStoryTotalDuration(timedScenes);
  return {
    title: "Narrated rebuild story",
    narration: "Stale global narration.",
    scenes: timedScenes,
    totalDuration,
    voiceoverUrl: "blob:voice-old",
    voiceoverDurationMs: totalDuration * 1000,
    voiceoverNarration: "Stale voiceover snapshot.",
  };
}

function joinResolvedSpokenText(scenes: FootieScene[]): string {
  return scenes
    .map((scene) => resolveSceneSpokenText(scene))
    .filter((resolved) => resolved.isUsable)
    .map((resolved) => resolved.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

test("fresh generated story with only scene.narration rebuilds successfully", () => {
  const scenes = [
    makeNarratedScene("s1", 3, { subtitleText: undefined, narration: "Scene one narrated." }),
    makeNarratedScene("s2", 3, { subtitleText: undefined, narration: "Scene two narrated." }),
    makeNarratedScene("s3", 3, { subtitleText: undefined, narration: "Scene three narrated." }),
  ];
  const story = buildNarratedStory(scenes);

  const validation = validateNarrationRebuildSources(story);
  assert.equal(validation.isSafe, true);
  assert.deepEqual(validation.blockedSceneNumbers, []);

  const result = rebuildNarrationFromScenes(story);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(
    result.narration,
    "Scene one narrated. Scene two narrated. Scene three narrated.",
  );
  assert.equal(result.diagnostics.contributingSceneCount, 3);
  assert.ok(result.diagnostics.sources.every((entry) => entry.sourceType === "narration"));
});

test("one edited narrated subtitle uses mixed spoken sources", () => {
  const scenes = [
    makeNarratedScene("s1", 3, { subtitleText: undefined, narration: "Scene one narration." }),
    makeNarratedScene("s2", 3, {
      subtitleText: "Scene two edited subtitle.",
      narration: "Scene two narration.",
    }),
    makeNarratedScene("s3", 3, { subtitleText: undefined, narration: "Scene three narration." }),
  ];
  const story = buildNarratedStory(scenes);

  const result = rebuildNarrationFromScenes(story);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(
    result.narration,
    "Scene one narration. Scene two edited subtitle. Scene three narration.",
  );
  assert.equal(result.diagnostics.sources[0]?.sourceType, "narration");
  assert.equal(result.diagnostics.sources[1]?.sourceType, "subtitleText");
  assert.equal(result.diagnostics.sources[2]?.sourceType, "narration");
});

test("multiple edited narrated subtitles preserve unedited narration sources", () => {
  const scenes = [
    makeNarratedScene("s1", 3, {
      subtitleText: "Edited scene one.",
      narration: "Scene one narration.",
    }),
    makeNarratedScene("s2", 3, { subtitleText: undefined, narration: "Scene two narration." }),
    makeNarratedScene("s3", 3, {
      subtitleText: "Edited scene three.",
      narration: "Scene three narration.",
    }),
  ];
  const story = buildNarratedStory(scenes);

  const result = rebuildNarrationFromScenes(story);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(
    result.narration,
    "Edited scene one. Scene two narration. Edited scene three.",
  );
});

test("empty scene with neither subtitleText nor narration blocks rebuild", () => {
  const story = buildNarratedStory([
    makeNarratedScene("s1", 3, { subtitleText: undefined, narration: "Ready." }),
    makeNarratedScene("s2", 3, { subtitleText: "", narration: "" }),
  ]);

  const validation = validateNarrationRebuildSources(story);
  assert.equal(validation.isSafe, false);
  assert.deepEqual(validation.blockedSceneNumbers, [2]);

  const result = rebuildNarrationFromScenes(story);
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.reason, "unsafe_partial_rebuild");
  assert.equal(result.script.narration, story.narration);
});

test("written caption only is not used as spoken text and blocks rebuild", () => {
  const story = buildNarratedStory([
    makeNarratedScene("s1", 3, { subtitleText: undefined, narration: "Spoken one." }),
    makeNarratedScene("s2", 3, {
      subtitleText: undefined,
      narration: undefined,
      subtitle: "Visual caption only.",
    }),
  ]);

  const resolved = resolveSceneSpokenText(story.scenes[1]!);
  assert.equal(resolved.isUsable, false);
  assert.equal(resolved.source, "empty");

  const result = rebuildNarrationFromScenes(story);
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.reason, "unsafe_partial_rebuild");
  assert.deepEqual(result.blockedSceneNumbers, [2]);
});

test("written caption plus narration uses narration for spoken text", () => {
  const story = buildNarratedStory([
    makeNarratedScene("s1", 3, {
      subtitleText: undefined,
      narration: "Spoken from narration.",
      subtitle: "Visual heading only.",
    }),
  ]);

  const resolved = resolveSceneSpokenText(story.scenes[0]!);
  assert.equal(resolved.isUsable, true);
  assert.equal(resolved.source, "narration");
  assert.equal(resolved.text, "Spoken from narration.");

  const result = rebuildNarrationFromScenes(story);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.narration, "Spoken from narration.");
  assert.doesNotMatch(result.narration, /Visual heading only/);
});

test("voice regeneration receives script.narration assembled from resolveSceneSpokenText", () => {
  const scenes = [
    makeNarratedScene("s1", 4, { subtitleText: undefined, narration: "Alpha narration." }),
    makeNarratedScene("s2", 4, { subtitleText: "Beta edited.", narration: "Beta narration." }),
  ];
  const prev = buildNarratedStory(scenes);
  const rebuilt = rebuildNarrationFromScenes(prev);
  assert.equal(rebuilt.ok, true);
  if (!rebuilt.ok) {
    return;
  }

  assert.equal(rebuilt.narration, joinResolvedSpokenText(prev.scenes));

  const afterNarration = applyNarrationRebuildStoryUpdate(prev, rebuilt.script);
  const afterVoice = applyVoiceoverChanges(afterNarration, {
    voiceoverUrl: "blob:voice-new",
    voiceoverDurationMs: 9_500,
  });

  assert.equal(afterVoice.narration, joinResolvedSpokenText(prev.scenes));
  assert.equal(afterVoice.voiceoverNarration, afterVoice.narration);
});

test("update narration preserves existing subtitleText values", () => {
  const scenes = [
    {
      ...makeNarratedScene("s1", 3, { subtitleText: "Narrated one.", narration: "Narrated one." }),
      subtitle: "Written caption one.",
    },
    {
      ...makeNarratedScene("s2", 3, {
        subtitleText: "Narrated two edited.",
        narration: "Narrated two.",
      }),
      subtitle: "Written caption two.",
    },
  ];
  const prev = buildNarratedStory(scenes);
  const rebuilt = rebuildNarrationFromScenes(prev);
  assert.equal(rebuilt.ok, true);
  if (!rebuilt.ok) {
    return;
  }

  const synced = applyNarrationRebuildStoryUpdate(prev, rebuilt.script);
  assert.equal(synced.scenes[0]?.subtitleText, "Narrated one.");
  assert.equal(synced.scenes[1]?.subtitleText, "Narrated two edited.");
});

test("update narration preserves caption layout", () => {
  const prev = buildNarratedStory([
    {
      ...makeNarratedScene("s1", 3, { subtitleText: "Spoken text.", narration: "Spoken text." }),
      captionLayout: { anchor: "center", version: 2, offsetX: 12, offsetY: -8 },
    },
  ]);
  const rebuilt = rebuildNarrationFromScenes(prev);
  assert.equal(rebuilt.ok, true);
  if (!rebuilt.ok) {
    return;
  }

  const synced = applyNarrationRebuildStoryUpdate(prev, rebuilt.script);
  assert.deepEqual(synced.scenes[0]?.captionLayout, prev.scenes[0]?.captionLayout);
});

test("update narration preserves written captions", () => {
  const prev = buildNarratedStory([
    {
      ...makeNarratedScene("s1", 3, { subtitleText: "Spoken one.", narration: "Spoken one." }),
      subtitle: "Written caption one.",
    },
    {
      ...makeNarratedScene("s2", 3, { subtitleText: undefined, narration: "Spoken two." }),
      subtitle: "Written caption two.",
    },
  ]);
  const rebuilt = rebuildNarrationFromScenes(prev);
  assert.equal(rebuilt.ok, true);
  if (!rebuilt.ok) {
    return;
  }

  const synced = applyNarrationRebuildStoryUpdate(prev, rebuilt.script);
  assert.equal(synced.scenes[0]?.subtitle, "Written caption one.");
  assert.equal(synced.scenes[1]?.subtitle, "Written caption two.");
});

test("five narrated scenes rebuild includes all spoken text in order", () => {
  const scenes = [
    makeNarratedScene("s1", 3, { subtitleText: "Scene one narrated.", narration: "Scene one narrated." }),
    makeNarratedScene("s2", 3, { subtitleText: "Scene two narrated.", narration: "Scene two narrated." }),
    makeNarratedScene("s3", 3, { subtitleText: "Scene three narrated.", narration: "Scene three narrated." }),
    makeNarratedScene("s4", 3, { subtitleText: "Scene four narrated.", narration: "Scene four narrated." }),
    makeNarratedScene("s5", 3, { subtitleText: "Scene five narrated.", narration: "Scene five narrated." }),
  ];
  const edited = buildNarratedStory(
    scenes.map((scene, index) =>
      index === 4
        ? { ...scene, subtitleText: "Scene five edited narrated." }
        : scene,
    ),
  );

  const result = rebuildNarrationFromScenes(edited);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.diagnostics.contributingSceneCount, 5);
  assert.equal(
    result.narration,
    "Scene one narrated. Scene two narrated. Scene three narrated. Scene four narrated. Scene five edited narrated.",
  );
  assert.equal(edited.scenes[4]?.subtitleText, "Scene five edited narrated.");
});

test("voice regeneration refits scenes and updates voiceover metadata", () => {
  const scenes = [
    makeNarratedScene("s1", 4, { subtitleText: "Alpha.", narration: "Alpha." }),
    makeNarratedScene("s2", 4, { subtitleText: "Beta.", narration: "Beta." }),
  ];
  const prev = buildNarratedStory(scenes);
  const rebuilt = rebuildNarrationFromScenes(prev);
  assert.equal(rebuilt.ok, true);
  if (!rebuilt.ok) {
    return;
  }

  const afterNarration = applyNarrationRebuildStoryUpdate(prev, rebuilt.script);
  const nextVoiceDurationMs = 9_500;
  const afterVoice = applyVoiceoverChanges(afterNarration, {
    voiceoverUrl: "blob:voice-new",
    voiceoverDurationMs: nextVoiceDurationMs,
  });

  assert.equal(afterVoice.voiceoverNarration, afterVoice.narration);
  assert.equal(afterVoice.voiceoverDurationMs, nextVoiceDurationMs);
  const sceneDurationSumMs = afterVoice.scenes.reduce(
    (sum, scene) => sum + (scene.durationMs ?? 0),
    0,
  );
  assert.ok(Math.abs(sceneDurationSumMs - nextVoiceDurationMs) <= 50);
});

test("preview master timeline narration duration matches voiceover after regen", () => {
  const prev = buildNarratedStory([
    makeNarratedScene("s1", 3, { subtitleText: "One.", narration: "One." }),
    makeNarratedScene("s2", 3, { subtitleText: "Two.", narration: "Two." }),
  ]);
  const afterVoice = applyVoiceoverChanges(prev, {
    voiceoverUrl: "blob:voice-new",
    voiceoverDurationMs: 8_200,
  });

  const previewTimeline = buildPreviewMasterTimeline(afterVoice, { assumeSynced: true });
  assert.ok(previewTimeline);
  assert.equal(previewTimeline!.narrationDurationMs, 8_200);
});

test("export preflight uses latest voiceover metadata", () => {
  const prev = buildNarratedStory([
    makeNarratedScene("s1", 3, { subtitleText: "Export one.", narration: "Export one." }),
    makeNarratedScene("s2", 3, { subtitleText: "Export two.", narration: "Export two." }),
  ]);
  const afterVoice = applyVoiceoverChanges(prev, {
    voiceoverUrl: "blob:voice-export",
    voiceoverDurationMs: 7_500,
  });

  const preflight = prepareStoryForExport(afterVoice);
  assert.equal(preflight.story.voiceoverDurationMs, 7_500);
  assert.equal(preflight.masterTimeline.narrationDurationMs, 7_500);
});

test("getCanonicalVoiceover prefers persisted base64 over stale blob URL", () => {
  const oldBase64 = Buffer.from("old-audio-bytes").toString("base64");
  const newBase64 = Buffer.from("new-audio-bytes-longer").toString("base64");
  const script = syncFootieScript({
    title: "Canonical voiceover",
    narration: "Test.",
    totalDuration: 5,
    voiceoverUrl: "blob:stale-voice",
    voiceoverDurationMs: 5_000,
    voiceoverAudioBase64: newBase64,
    scenes: [
      {
        id: "s1",
        start: 0,
        end: 5,
        duration: 5,
        subtitle: "Caption",
        captionMode: "subtitles",
        subtitleText: "Spoken.",
      },
    ],
  });

  const canonical = getCanonicalVoiceover(script);
  assert.ok(canonical?.url);
  assert.notEqual(canonical?.url, "blob:stale-voice");
  assert.equal(canonical?.durationMs, 5_000);
  void oldBase64;
});

test("caption layout change does not affect narration or voice fields", () => {
  const prev = buildNarratedStory([
    makeNarratedScene("s1", 3, { subtitleText: "Spoken text.", narration: "Spoken text." }),
  ]);
  const next = applyPresentationSceneUpdate(prev, "s1", {
    captionLayout: { anchor: "center", version: 2 },
  });

  assert.equal(next.scenes[0]?.subtitleText, prev.scenes[0]?.subtitleText);
  assert.equal(next.narration, prev.narration);
  assert.equal(next.voiceoverUrl, prev.voiceoverUrl);
  assert.equal(next.voiceoverDurationMs, prev.voiceoverDurationMs);
  assert.equal(next.voiceoverNarration, prev.voiceoverNarration);

  const kind = resolvePresentationSyncEditKind(classifyStoryPatch(prev, next));
  const state = applyStorySyncEdit(createInitialStorySynchronizationState(), kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.exportDirty, true);
});

test("narration rebuild wiring uses narration_rebuild intent", () => {
  const workspace = readFileSync(join(process.cwd(), "src/components/StoryWorkspace.tsx"), "utf8");
  const draftFlow = readFileSync(
    join(process.cwd(), "src/features/drafts/components/DraftEditorFlow.tsx"),
    "utf8",
  );
  const voiceHook = readFileSync(join(process.cwd(), "src/hooks/useStoryVoiceoverApply.ts"), "utf8");

  assert.match(workspace, /intent: "narration_rebuild"/);
  assert.match(workspace, /formatUnsafeNarrationRebuildWarning/);
  assert.match(draftFlow, /applyNarrationRebuildStoryUpdate/);
  assert.match(voiceHook, /applyVoiceoverChanges/);
});

test("update narration sync kind remains narration without excerpt resync side effects", () => {
  const prev = buildNarratedStory([
    makeNarratedScene("s1", 3, { subtitleText: "One.", narration: "One." }),
    makeNarratedScene("s2", 3, { subtitleText: "Two.", narration: "Two." }),
  ]);
  const rebuilt = rebuildNarrationFromScenes({
    ...prev,
    scenes: prev.scenes.map((scene, index) =>
      index === 1 ? { ...scene, subtitleText: "Two edited." } : scene,
    ),
  });
  assert.equal(rebuilt.ok, true);
  if (!rebuilt.ok) {
    return;
  }

  const synced = applyNarrationRebuildStoryUpdate(prev, rebuilt.script);
  const kind = resolveStorySyncEditKind(prev, synced, classifyStoryPatch(prev, synced));
  assert.equal(kind, "narration");
  assert.equal(synced.scenes[1]?.subtitleText, "Two edited.");
  assert.equal(synced.scenes[1]?.narration, prev.scenes[1]?.narration);
});

console.log(`\nnarration-voice-hotfix: ${passed} passed`);
