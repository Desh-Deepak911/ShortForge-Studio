/**
 * AudioEngine end-to-end QA checklist (run: npm run test:audio-engine-qa).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildAudioMixFromStory, getAudioEngineDebugState, resolveExportAudioSource } from "@/features/audio";
import {
  buildFootieExportPayload,
  getExportTotalDurationSec,
} from "@/features/export/services";
import {
  isExportBackgroundMusicActiveFromMix,
  resolveExportBackgroundMusicMixSettingsFromMix,
} from "@/features/export/utils/export-background-music.utils";
import {
  createDraft,
  createMemoryDraftStorageAdapter,
  getDraft,
  resolveDraftScriptForEditor,
  serializeEditorStateForDraft,
  updateDraft,
} from "@/features/drafts";
import { getPreviewFrameAtTime } from "@/features/preview/utils/previewTimeline";
import { resolveSceneImageMotionScale } from "@/features/story/utils";
import type { FootieScript } from "@/features/story/types";
import { applyVoiceoverRegeneration, syncFootieScript } from "@/lib/utils/voiceover";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function buildStory(): FootieScript {
  return syncFootieScript({
    title: "AudioEngine QA",
    narration: "A quick story for audio engine verification.",
    totalDuration: 10,
    voiceoverUrl: "blob:voiceover-qa",
    voiceoverDurationMs: 10_000,
    voiceSettings: { voice: "alloy", speed: 1 },
    scenes: [
      {
        id: "1",
        start: 0,
        end: 5,
        duration: 5,
        startMs: 0,
        endMs: 5000,
        durationMs: 5000,
        subtitle: "First half",
        captionMode: "subtitles",
        subtitleText: "First half subtitle copy for sync check.",
        subtitleEffect: "fade-up",
        image: {
          url: "https://example.com/scene.jpg",
          scale: 1,
          x: 0,
          y: 0,
          imageMotion: { type: "zoom-in", intensity: "medium" },
        },
      },
      {
        id: "2",
        start: 5,
        end: 10,
        duration: 5,
        startMs: 5000,
        endMs: 10_000,
        durationMs: 5000,
        subtitle: "Second half",
        captionMode: "generated",
      },
    ],
    timelineItems: [
      { id: "1", type: "scene", scene: { id: "1", start: 0, end: 5, duration: 5, subtitle: "First half" } },
      {
        id: "t1",
        type: "transition",
        fromSceneId: "1",
        toSceneId: "2",
        effect: "fade",
        durationMs: 400,
        label: "Fade",
      },
      { id: "2", type: "scene", scene: { id: "2", start: 5, end: 10, duration: 5, subtitle: "Second half" } },
    ],
  });
}

function withBackgroundMusic(script: FootieScript): FootieScript {
  return {
    ...script,
    backgroundMusic: {
      enabled: true,
      source: "upload",
      fileUrl: "blob:music-qa",
      fileName: "bed.mp3",
      volume: 0.2,
      duckingEnabled: true,
      fadeIn: true,
      fadeOut: true,
    },
  };
}

console.log("audio-engine-qa");

test("1. staged create flow generates script only; review flow handles voiceover", () => {
  const createFlow = readSrc("src/features/create/components/CreateStoryFlow.tsx");
  const reviewFlow = readSrc("src/features/create/components/ScriptReviewFlow.tsx");
  assert.match(createFlow, /generate-script/);
  assert.match(createFlow, /mode: "script-only"/);
  assert.doesNotMatch(createFlow, /StoryWorkspace/);
  assert.doesNotMatch(createFlow, /materializeVoiceoverBase64|getAudioEngine\(\)/);
  assert.match(reviewFlow, /VoiceSettingsCard|Create Narration/);
});

test("2. preview plays voiceover via buildAudioMixFromStory", () => {
  const preview = readSrc("src/features/preview/hooks/usePreviewPlayback.ts");
  assert.match(preview, /buildAudioMixFromStory/);
  assert.match(preview, /getNarrationAudioElementBySrc/);

  const mix = buildAudioMixFromStory(buildStory());
  assert.ok(mix.voiceover?.src);
});

test("3. export includes voiceover via buildAudioMixFromStory", () => {
  const exportRender = readSrc("src/features/export/services/video-render.service.ts");
  assert.match(exportRender, /buildAudioMixFromStory/);
  assert.match(exportRender, /voiceoverInput/);

  const mix = buildAudioMixFromStory(buildStory());
  assert.equal(resolveExportAudioSource(mix), "voiceover");
});

test("4–6. background music preview and export mix", () => {
  const script = withBackgroundMusic(buildStory());
  const mix = buildAudioMixFromStory(script);

  assert.equal(isExportBackgroundMusicActiveFromMix(mix), true);
  assert.ok(mix.background?.src);
  assert.ok(resolveExportBackgroundMusicMixSettingsFromMix(script, mix, true, 10_000));
  assert.equal(resolveExportAudioSource(mix), "voiceover+background");

  const preview = readSrc("src/features/preview/hooks/usePreviewPlayback.ts");
  assert.match(preview, /getBackgroundMusicAudioElementBySrc/);
});

test("7–9. voice speed apply updates canonical voiceover for preview and export", () => {
  const script = buildStory();
  const updated = applyVoiceoverRegeneration(script, {
    voiceoverUrl: "blob:voiceover-speed-qa",
    voiceoverDurationMs: 8000,
    voiceSettings: { voice: "alloy", speed: 1.25 },
  });

  const mix = buildAudioMixFromStory(updated);
  assert.equal(mix.voiceover?.src, "blob:voiceover-speed-qa");
  assert.equal(mix.voiceover?.durationMs, 8000);
  assert.equal(mix.voiceover?.playbackRate, 1.25);
  assert.equal(resolveExportAudioSource(mix), "voiceover");

  const debug = getAudioEngineDebugState(updated);
  assert.equal(debug?.voiceoverSrcType, "blob");
});

test("10. draft save/load preserves latest voiceover metadata", () => {
  const adapter = createMemoryDraftStorageAdapter();
  const options = { adapter };
  const voiceoverBase64 = Buffer.from("qa-voiceover-bytes").toString("base64");
  const draft = createDraft({ script: buildStory() }, options);

  const saved = updateDraft(
    draft.id,
    {
      script: serializeEditorStateForDraft({
        ...buildStory(),
        voiceoverUrl: undefined,
        voiceoverDurationMs: 8000,
        voiceoverAudioBase64: voiceoverBase64,
        voiceSettings: { voice: "alloy", speed: 1.25 },
      } as FootieScript),
    },
    options,
  );

  assert.ok(saved);
  const reloaded = getDraft(draft.id, options);
  assert.ok(reloaded);
  assert.equal(reloaded?.voiceover?.audioBase64, voiceoverBase64);
  assert.equal(reloaded?.voiceSettings?.speed, 1.25);

  const editorScript = resolveDraftScriptForEditor(reloaded!);
  const mix = buildAudioMixFromStory(editorScript);
  assert.ok(mix.voiceover?.src?.startsWith("blob:"));
  assert.equal(mix.voiceover?.durationMs, 8000);
});

test("11. opening draft editor does not call AI", () => {
  const editorFlow = readSrc("src/features/drafts/components/DraftEditorFlow.tsx");
  assert.match(editorFlow, /useEditorStoryDocument/);
  assert.doesNotMatch(editorFlow, /generate-script/);
  assert.doesNotMatch(editorFlow, /\/api\/generate-voiceover/);
  assert.doesNotMatch(editorFlow, /fetch\(/);
});

test("12. subtitles still sync from scene timing", () => {
  const script = buildStory();
  const timelineItems = script.timelineItems ?? [];
  const frame = getPreviewFrameAtTime(timelineItems, script.scenes, 2.5);
  assert.equal(frame.kind, "scene");
  if (frame.kind === "scene") {
    assert.equal(frame.sceneIndex, 0);
  }

  const payload = buildFootieExportPayload(script);
  assert.equal(getExportTotalDurationSec(payload), 10);
});

test("13. transitions still work in timeline and overlay utilities", () => {
  const script = buildStory();
  const transition = script.timelineItems?.find((item) => item.type === "transition");
  assert.ok(transition && transition.type === "transition");
  assert.equal(transition.effect, "fade");

  const transitionQa = readSrc("src/verification/timeline/transitionQa.verify.ts");
  assert.match(transitionQa, /getTransitionLayerStyles/);
  assert.match(transitionQa, /getExportTransitionLayerDrawStates/);
});

test("14. Ken Burns motion still resolves during playback/export", () => {
  const script = buildStory();
  const motion = script.scenes[0]!.image!.imageMotion!;
  const start = resolveSceneImageMotionScale(motion, 0);
  const mid = resolveSceneImageMotionScale(motion, 0.5);
  const end = resolveSceneImageMotionScale(motion, 1);

  assert.equal(start, 1);
  assert.ok(end > start);
  assert.ok(mid > start && mid < end);
});

console.log("\nAutomated AudioEngine QA checks passed.");
console.log("Also run: npm run lint && npm run build");
