/**
 * Draft persistence verification (run: npm run test:drafts).
 */
import assert from "node:assert/strict";

import {
  createDraft,
  createMemoryDraftStorageAdapter,
  deleteDraft,
  getDraft,
  isJsonSerializable,
  listDrafts,
  mergeDraftUpdatesSafely,
  normalizeDraft,
  resolveDraftScriptForEditor,
  serializeEditorStateForDraft,
  updateDraft,
} from "@/features/drafts";
import { buildAudioMixFromStory } from "@/features/audio";
import type { FootieScript } from "@/features/story/types";
import type { ExportSettings, StoryBackgroundMusic, StoryVoiceSettings } from "@/features/story/types";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const baseScript: FootieScript = {
  title: "Derby Day Chaos",
  narration: "A last-minute winner changes everything.",
  totalDuration: 12,
  scenes: [
    {
      id: "1",
      start: 0,
      end: 12,
      duration: 12,
      subtitle: "Chaos",
    },
  ],
  voiceoverUrl: "blob:voiceover",
  voiceoverDurationMs: 12000,
  voiceSettings: { voice: "alloy", speed: 1 },
  exportSettings: {
    fileName: "derby-day-chaos",
    format: "mp4",
    quality: "high",
    resolution: "1080x1920",
  },
  backgroundMusic: {
    enabled: true,
    source: "upload",
    fileUrl: "blob:music",
    fileName: "ambient.mp3",
    volume: 0.18,
    duckingEnabled: true,
    fadeIn: true,
    fadeOut: true,
  },
};

const adapter = () => createMemoryDraftStorageAdapter();
const withAdapter = { adapter: adapter() };

console.log("drafts");

test("createDraft persists a draft with metadata", () => {
  const draft = createDraft(
    {
      script: baseScript,
      creationBrief: {
        topic: "Derby day chaos",
        tone: "dramatic",
        duration: 30,
        qualityMode: "cheap",
        sceneCount: 6,
      },
      prompt: "Derby day chaos",
    },
    withAdapter,
  );

  assert.equal(draft.title, "Derby Day Chaos");
  assert.equal(draft.sceneCount, 1);
  assert.equal(draft.hasVoiceover, true);
  assert.equal(draft.prompt, "Derby day chaos");
  assert.equal(getDraft(draft.id, withAdapter)?.script.title, "Derby Day Chaos");
});

test("listDrafts returns newest drafts first", () => {
  const options = { adapter: adapter() };
  const first = createDraft({ script: { ...baseScript, title: "First" } }, options);
  const second = createDraft({ script: { ...baseScript, title: "Second" } }, options);

  const drafts = listDrafts(options);
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0]?.id, second.id);
  assert.equal(drafts[1]?.id, first.id);
});

test("updateDraft refreshes summary fields from script updates", () => {
  const options = { adapter: adapter() };
  const draft = createDraft({ script: baseScript }, options);

  const updatedScript: FootieScript = {
    ...baseScript,
    title: "Updated Title",
    totalDuration: 18,
    scenes: [
      ...baseScript.scenes,
      {
        id: "2",
        start: 12,
        end: 18,
        duration: 6,
        subtitle: "Finish",
      },
    ],
  };

  const updated = updateDraft(draft.id, { script: updatedScript }, options);
  assert.ok(updated);
  assert.equal(updated?.title, "Updated Title");
  assert.equal(updated?.sceneCount, 2);
  assert.equal(updated?.totalDuration, 18);
});

test("deleteDraft removes a saved draft", () => {
  const options = { adapter: adapter() };
  const draft = createDraft({ script: baseScript }, options);

  assert.equal(deleteDraft(draft.id, options), true);
  assert.equal(getDraft(draft.id, options), null);
  assert.equal(listDrafts(options).length, 0);
});

test("safeParseStore handles corrupted localStorage payload", () => {
  const memory = createMemoryDraftStorageAdapter();
  memory.setItem("footiebitz:drafts:v1", "{not-json");

  assert.equal(listDrafts({ adapter: memory }).length, 0);
});

test("normalizeDraft mirrors full editor slices from script", () => {
  const draft = normalizeDraft({
    id: "draft-1",
    script: baseScript,
    status: "exported",
  });

  assert.equal(draft.status, "exported");
  assert.deepEqual(draft.voiceSettings, baseScript.voiceSettings as StoryVoiceSettings);
  assert.equal(draft.voiceover?.url, "blob:voiceover");
  assert.deepEqual(draft.exportSettings, baseScript.exportSettings as ExportSettings);
  assert.deepEqual(draft.backgroundMusic, baseScript.backgroundMusic as StoryBackgroundMusic);
});

test("serializeEditorStateForDraft preserves full editor state for reload", () => {
  const richScript: FootieScript = {
    ...baseScript,
    totalDuration: 9,
    scenes: [
      {
        id: "scene-1",
        start: 0,
        end: 4,
        duration: 4,
        durationMs: 4000,
        startMs: 0,
        endMs: 4000,
        durationSource: "manual",
        subtitle: "Opening",
        captionMode: "subtitles",
        subtitleEffect: "typewriter",
        subtitleText: "The stadium erupts.",
        narration: "The stadium erupts.",
        image: {
          url: "blob:scene-image",
          scale: 1.2,
          x: 12,
          y: -8,
          fitMode: "fill",
          imageMotion: { type: "zoom-in", intensity: "medium" },
        },
      },
      {
        id: "scene-2",
        start: 4,
        end: 9,
        duration: 5,
        durationMs: 5000,
        startMs: 4000,
        endMs: 9000,
        subtitle: "Finish",
        captionMode: "generated",
        subtitleEffect: "highlight",
      },
    ],
    timelineItems: [
      {
        id: "scene-1",
        type: "scene",
        scene: {
          id: "scene-1",
          start: 0,
          end: 4,
          duration: 4,
          subtitle: "Opening",
        },
      },
      {
        id: "transition-1",
        type: "transition",
        fromSceneId: "scene-1",
        toSceneId: "scene-2",
        effect: "fade",
        durationMs: 500,
        label: "Fade",
      },
      {
        id: "scene-2",
        type: "scene",
        scene: {
          id: "scene-2",
          start: 4,
          end: 9,
          duration: 5,
          subtitle: "Finish",
        },
      },
    ],
  };

  const serialized = serializeEditorStateForDraft(richScript, {
    exportSettings: {
      fileName: "custom-export",
      format: "mp4",
      quality: "standard",
      resolution: "720x1280",
    },
  });

  assert.equal(isJsonSerializable(serialized), true);
  assert.equal(serialized.scenes.length, 2);
  assert.equal(serialized.scenes[0]?.durationMs, 4000);
  assert.equal(serialized.scenes[0]?.captionMode, "subtitles");
  assert.equal(serialized.scenes[0]?.subtitleText, "The stadium erupts.");
  assert.equal(serialized.scenes[0]?.image?.imageMotion?.type, "zoom-in");
  assert.equal(serialized.timelineItems?.some((item) => item.type === "transition"), true);
  assert.equal(serialized.voiceoverUrl, "blob:voiceover");
  assert.equal(serialized.exportSettings?.resolution, "720x1280");
  assert.equal(serialized.backgroundMusic?.fileName, "ambient.mp3");

  const options = { adapter: adapter() };
  const draft = createDraft({ script: serialized }, options);
  const reloaded = getDraft(draft.id, options);

  assert.equal(reloaded?.script.scenes[0]?.image?.scale, 1.2);
  assert.equal(reloaded?.script.timelineItems?.[1]?.type, "transition");
  assert.equal(reloaded?.exportSettings?.fileName, "custom-export");
});

test("saved drafts preserve voiceover, voice speed, and background music metadata", () => {
  const persistedBase64 = Buffer.from("draft-voiceover-bytes").toString("base64");
  const musicBase64 = Buffer.from("draft-music-bytes").toString("base64");
  const scriptWithAudio: FootieScript = {
    ...baseScript,
    voiceoverUrl: undefined,
    voiceoverDurationMs: 12_000,
    voiceoverAudioBase64: persistedBase64,
    voiceSettings: { voice: "fable", speed: 1.25 },
    backgroundMusic: {
      enabled: true,
      source: "upload",
      fileName: "ambient.mp3",
      volume: 0.18,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: true,
      fileDataBase64: musicBase64,
    },
  } as FootieScript;

  const serialized = serializeEditorStateForDraft(scriptWithAudio);
  assert.equal(isJsonSerializable(serialized), true);
  assert.equal(serialized.voiceoverDurationMs, 12_000);
  assert.equal(serialized.voiceSettings?.speed, 1.25);
  assert.equal((serialized as FootieScript & { voiceoverAudioBase64?: string }).voiceoverAudioBase64, persistedBase64);
  assert.equal(
    (serialized.backgroundMusic as { fileDataBase64?: string })?.fileDataBase64,
    musicBase64,
  );

  const options = { adapter: adapter() };
  const draft = createDraft({ script: serialized }, options);
  const reloaded = getDraft(draft.id, options);

  assert.ok(reloaded);
  assert.equal(reloaded?.voiceover?.audioBase64, persistedBase64);
  assert.equal(reloaded?.voiceover?.durationMs, 12_000);
  assert.equal(reloaded?.voiceSettings?.speed, 1.25);
  assert.equal(reloaded?.backgroundMusic?.fileName, "ambient.mp3");
  assert.equal(
    (reloaded?.backgroundMusic as { fileDataBase64?: string })?.fileDataBase64,
    musicBase64,
  );
});

test("resolveDraftScriptForEditor hydrates playable voiceover for preview and export", () => {
  const persistedBase64 = Buffer.from("hydrate-voiceover").toString("base64");
  const draft = normalizeDraft({
    id: "draft-audio",
    script: {
      ...baseScript,
      voiceoverUrl: "blob:stale",
      voiceoverDurationMs: 12_000,
      voiceoverAudioBase64: persistedBase64,
      voiceSettings: { voice: "alloy", speed: 1.4 },
    } as FootieScript,
  });

  const resolved = resolveDraftScriptForEditor(draft);
  const mix = buildAudioMixFromStory(resolved);

  assert.ok(mix.voiceover?.src);
  assert.match(mix.voiceover!.src, /^blob:/);
  assert.equal(mix.voiceover?.durationMs, 12_000);
  assert.equal(resolved.voiceSettings?.speed, 1.4);
});

test("mergeDraftUpdatesSafely preserves scenes when a stale voiceover save arrives later", () => {
  const options = { adapter: createMemoryDraftStorageAdapter() };
  const withScenes = createDraft(
    {
      script: baseScript,
      pipelineStage: "editor_ready",
    },
    options,
  );

  const staleVoiceoverScript: FootieScript = {
    title: "Derby Day Chaos",
    narration: "Updated narration from voiceover pass.",
    totalDuration: 12,
    scenes: [],
    voiceoverUrl: "blob:new-voice",
    voiceoverDurationMs: 12_000,
    voiceSettings: { voice: "nova", speed: 1.1 },
  };

  const updated = updateDraft(
    withScenes.id,
    {
      script: staleVoiceoverScript,
      pipelineStage: "voiceover_ready",
    },
    options,
  );

  assert.ok(updated);
  assert.equal(updated!.script.scenes.length, 1);
  assert.equal(updated!.pipelineStage, "editor_ready");
  assert.equal(updated!.script.voiceoverUrl, "blob:new-voice");
  assert.equal(updated!.script.narration, "Updated narration from voiceover pass.");
  assert.equal(updated!.script.voiceSettings?.voice, "nova");
});

test("mergeDraftUpdatesSafely never downgrades pipelineStage from editor_ready", () => {
  const existing = normalizeDraft({
    id: "draft-merge-stage",
    script: baseScript,
    pipelineStage: "editor_ready",
    updatedAt: "2026-01-01T12:00:00.000Z",
  });

  const incoming = normalizeDraft({
    id: "draft-merge-stage",
    script: {
      ...baseScript,
      scenes: [],
      voiceoverUrl: "blob:late-voice",
    },
    pipelineStage: "voiceover_ready",
    updatedAt: "2026-01-02T12:00:00.000Z",
  });

  const merged = mergeDraftUpdatesSafely(existing, incoming);

  assert.equal(merged.pipelineStage, "editor_ready");
  assert.equal(merged.script.scenes.length, 1);
});

test("updateDraft applies mergeDraftUpdatesSafely before writing to storage", () => {
  const options = { adapter: createMemoryDraftStorageAdapter() };
  const draft = createDraft(
    {
      script: {
        title: "Stage test",
        narration: "Voice first.",
        totalDuration: 12,
        scenes: [],
        voiceoverUrl: "blob:voice",
        voiceoverDurationMs: 12_000,
      },
      pipelineStage: "voiceover_ready",
    },
    options,
  );

  const withScenes = updateDraft(
    draft.id,
    {
      script: baseScript,
      pipelineStage: "editor_ready",
    },
    options,
  );

  assert.ok(withScenes);
  assert.equal(withScenes!.script.scenes.length, 1);
  assert.equal(withScenes!.pipelineStage, "editor_ready");

  const reloaded = getDraft(draft.id, options);
  assert.ok(reloaded);
  assert.equal(reloaded!.script.scenes.length, 1);
  assert.equal(reloaded!.pipelineStage, "editor_ready");
});

console.log("All draft checks passed.");
