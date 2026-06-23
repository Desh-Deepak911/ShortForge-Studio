/**
 * Draft reload QA (run: npm run test:draft-reload-qa).
 * Simulates create → edit → save → reload → list → delete without a browser.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createDraft,
  createMemoryDraftStorageAdapter,
  deleteDraft,
  getDraft,
  listDrafts,
  resolveDraftScriptForEditor,
  serializeEditorStateForDraft,
  updateDraft,
} from "@/features/drafts";
import { buildAudioMixFromStory } from "@/features/audio";
import type { FootieScript } from "@/features/story/types";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const generatedScript: FootieScript = {
  title: "Reload QA Story",
  narration: "A dramatic finish in stoppage time.",
  totalDuration: 8,
  scenes: [
    {
      id: "1",
      start: 0,
      end: 8,
      duration: 8,
      subtitle: "Opening",
      captionMode: "generated",
    },
  ],
  voiceoverUrl: "blob:voiceover-qa",
  voiceoverDurationMs: 8000,
  voiceSettings: { voice: "alloy", speed: 1 },
};

console.log("draft-reload-qa");

test("landing page route exists at /", () => {
  const landing = readSrc("src/app/page.tsx");
  assert.match(landing, /LandingPage/);
  assert.doesNotMatch(landing, /StoryComposer/);
  assert.doesNotMatch(landing, /StoryWorkspace/);
});

test("/create hosts generator without editor shell", () => {
  const createPage = readSrc("src/app/create/page.tsx");
  const flow = readSrc("src/features/create/components/CreateStoryFlow.tsx");

  assert.match(createPage, /CreateStoryFlow/);
  assert.match(flow, /StoryComposer/);
  assert.match(flow, /generate-script/);
  assert.doesNotMatch(flow, /StoryWorkspace/);
});

test("generation success creates draft and redirects to editor", () => {
  const flow = readSrc("src/features/create/components/CreateStoryFlow.tsx");
  assert.match(flow, /createDraft\(/);
  assert.match(flow, /router\.push\(`\/editor\/\$\{draft\.id\}`\)/);
});

test("editor loads draft from storage without AI calls", () => {
  const editorFlow = readSrc("src/features/drafts/components/DraftEditorFlow.tsx");
  assert.match(editorFlow, /getDraft\(draftId\)/);
  assert.match(editorFlow, /resolveDraftScriptForEditor/);
  assert.match(editorFlow, /StoryWorkspace/);
  assert.doesNotMatch(editorFlow, /generate-script/);
  assert.doesNotMatch(editorFlow, /fetch\(/);
});

test("save draft persists edited editor state and survives reload", () => {
  const adapter = createMemoryDraftStorageAdapter();
  const options = { adapter };

  const draft = createDraft(
    { script: generatedScript, prompt: "Reload QA prompt" },
    options,
  );

  const editedScript: FootieScript = {
    ...generatedScript,
    title: "Edited Reload QA Story",
    scenes: [
      {
        ...generatedScript.scenes[0]!,
        subtitle: "Edited subtitle",
        captionMode: "subtitles",
        subtitleText: "Custom subtitle copy",
        duration: 6,
        end: 6,
        durationMs: 6000,
        image: {
          url: "blob:edited-image",
          scale: 1.15,
          x: 4,
          y: -2,
          fitMode: "fit",
          imageMotion: { type: "zoom-out", intensity: "subtle" },
        },
      },
    ],
    exportSettings: {
      fileName: "reload-qa",
      format: "mp4",
      quality: "standard",
      resolution: "720x1280",
    },
    backgroundMusic: {
      enabled: true,
      source: "upload",
      fileUrl: "blob:music",
      fileName: "bed.mp3",
      volume: 0.2,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: true,
    },
  };

  const serialized = serializeEditorStateForDraft(editedScript, {
    exportSettings: editedScript.exportSettings,
  });

  const saved = updateDraft(draft.id, { script: serialized }, options);
  assert.ok(saved);

  const reloaded = getDraft(draft.id, options);
  assert.ok(reloaded);
  assert.equal(reloaded?.script.title, "Edited Reload QA Story");
  assert.equal(reloaded?.script.scenes[0]?.subtitleText, "Custom subtitle copy");
  assert.equal(reloaded?.script.scenes[0]?.image?.scale, 1.15);
  assert.equal(reloaded?.script.exportSettings?.resolution, "720x1280");
  assert.equal(reloaded?.script.backgroundMusic?.fileName, "bed.mp3");
  assert.ok(reloaded!.updatedAt >= draft.updatedAt);
});

test("reload restores saved voiceover audio for preview and export mix", () => {
  const adapter = createMemoryDraftStorageAdapter();
  const options = { adapter };
  const voiceoverBase64 = Buffer.from("reload-voiceover-audio").toString("base64");

  const draft = createDraft({ script: generatedScript }, options);
  const saved = updateDraft(
    draft.id,
    {
      script: {
        ...generatedScript,
        voiceoverUrl: undefined,
        voiceoverDurationMs: 8000,
        voiceoverAudioBase64: voiceoverBase64,
        voiceSettings: { voice: "alloy", speed: 1.25 },
      } as FootieScript,
    },
    options,
  );

  assert.ok(saved);
  const reloaded = getDraft(draft.id, options);
  assert.ok(reloaded);

  const editorScript = resolveDraftScriptForEditor(reloaded!);
  const mix = buildAudioMixFromStory(editorScript);

  assert.ok(mix.voiceover?.src);
  assert.equal(mix.voiceover?.durationMs, 8000);
  assert.equal(editorScript.voiceSettings?.speed, 1.25);
});

test("/drafts lists saved drafts with open and delete actions", () => {
  const dashboard = readSrc("src/features/drafts/components/DraftsDashboard.tsx");
  assert.match(dashboard, /listDrafts\(/);
  assert.match(dashboard, /\/editor\/\$\{draft\.id\}/);
  assert.match(dashboard, /deleteDraft\(/);
  assert.match(dashboard, /No drafts yet\. Create your first story\./);

  const adapter = createMemoryDraftStorageAdapter();
  const options = { adapter };
  const draft = createDraft({ script: generatedScript }, options);

  const summaries = listDrafts(options);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.id, draft.id);

  assert.equal(deleteDraft(draft.id, options), true);
  assert.equal(getDraft(draft.id, options), null);
  assert.equal(listDrafts(options).length, 0);
});

console.log("All draft reload QA checks passed.");
