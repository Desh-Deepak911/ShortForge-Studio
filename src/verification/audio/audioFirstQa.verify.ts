/**
 * Audio-first generation QA (run: npm run test:audio-first-qa).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildFootieExportPayload,
  getExportTransitionsFromPayload,
  getRenderableScenesFromPayload,
  isVideoSegmentTimelineItem,
} from "@/features/export/services";
import {
  attachEvenVoiceoverTiming,
  attachSceneNarrationFromScript,
  getStoryTotalDuration,
  resolveVoiceoverDurationMs,
} from "@/features/story/utils";
import { syncFootieScript } from "@/lib/utils/voiceover";
import { GENERATION_LOADING_STEPS, resolveSceneCount } from "@/types/footiebitz";
import type { FootieScene, FootieScript } from "@/features/story/types";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function makeScene(id: string): FootieScene {
  return {
    id,
    start: 0,
    end: 1,
    duration: 1,
    subtitle: `Scene ${id}`,
  };
}

function sumSceneDurationMs(scenes: FootieScene[]): number {
  return scenes.reduce((sum, scene) => sum + (scene.durationMs ?? 0), 0);
}

console.log("audio-first-qa");

test("CreateStoryFlow collects prompt and scene count", () => {
  const createFlow = readSrc("src/features/create/components/CreateStoryFlow.tsx");
  const createPage = readSrc("src/app/create/page.tsx");

  assert.match(createFlow, /sceneCount/);
  assert.match(createFlow, /setSceneCount/);
  assert.match(createFlow, /topic/);
  assert.match(createPage, /CreateStoryFlow/);
});

test("resolveSceneCount clamps user scene count input", () => {
  assert.equal(resolveSceneCount(6), 6);
  assert.equal(resolveSceneCount(2), 3);
  assert.equal(resolveSceneCount(99), 12);
});

test("orchestrator runs script → voiceover → scenes in order", () => {
  const orchestrator = readSrc("src/features/story/services/audio-first-generation.service.ts");

  const scriptIdx = orchestrator.indexOf("await generateStoryScript");
  const voiceIdx = orchestrator.indexOf("await generateVoiceoverFromScript");
  const scenesIdx = orchestrator.indexOf("await generateScenesFromScriptAndAudio");

  assert.ok(scriptIdx >= 0 && voiceIdx > scriptIdx && scenesIdx > voiceIdx);
  assert.match(orchestrator, /onProgress\?\.\(1,/);
  assert.match(orchestrator, /onProgress\?\.\(2,/);
  assert.match(orchestrator, /onProgress\?\.\(3,/);
  assert.match(orchestrator, /onProgress\?\.\(4,/);
});

test("loading steps match generation pipeline labels", () => {
  assert.deepEqual([...GENERATION_LOADING_STEPS], [
    "Writing your story...",
    "Creating narration...",
    "Preparing your scenes...",
    "Building storyboard...",
  ]);
});

test("voiceover duration can be measured or estimated", () => {
  const measured = resolveVoiceoverDurationMs(
    Uint8Array.from([
      0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]).buffer,
    "fallback narration text",
  );
  assert.equal(measured.durationSource, "measured");
  assert.ok(measured.durationMs > 0);

  const estimated = resolveVoiceoverDurationMs(
    new ArrayBuffer(0),
    "one two three four five six seven eight nine ten",
  );
  assert.equal(estimated.durationSource, "estimated");
  assert.equal(estimated.durationMs, 4567);
});

test("scene durations sum exactly to voiceover duration", () => {
  for (const voiceoverMs of [12_000, 42_001, 7_777, 3000]) {
    for (const count of [3, 6, 7]) {
      const scenes = attachEvenVoiceoverTiming(
        Array.from({ length: count }, (_, i) => makeScene(String(i + 1))),
        voiceoverMs,
      );

      assert.equal(sumSceneDurationMs(scenes), Math.max(count, Math.round(voiceoverMs)));
      assert.equal(scenes[scenes.length - 1]?.endMs, Math.max(count, Math.round(voiceoverMs)));
    }
  }
});

test("visual timeline end does not exceed voiceover duration", () => {
  const voiceoverMs = 18_500;
  const scenes = attachEvenVoiceoverTiming(
    [makeScene("1"), makeScene("2"), makeScene("3"), makeScene("4")],
    voiceoverMs,
  );

  const timelineEndMs = scenes[scenes.length - 1]?.endMs ?? 0;
  assert.ok(timelineEndMs <= voiceoverMs || timelineEndMs === Math.round(voiceoverMs));
  assert.equal(getStoryTotalDuration(scenes), timelineEndMs / 1000);
});

test("scene narration segments are split from full script without AI", () => {
  const narration = "alpha beta gamma delta epsilon zeta eta theta";
  const scenes = attachSceneNarrationFromScript(
    attachEvenVoiceoverTiming([makeScene("1"), makeScene("2"), makeScene("3")], 9000),
    narration,
  );

  assert.equal(scenes.map((s) => s.narration).join(" "), narration);
  const scenePlan = readSrc("src/features/story/services/scene-planning.service.ts");
  assert.doesNotMatch(scenePlan, /generateVoiceoverFromScript/);
  assert.match(scenePlan, /attachSceneNarrationFromScript/);
});

test("editor workspace and timeline components remain wired", () => {
  const editorPage = readSrc("src/app/editor/[draftId]/page.tsx");
  const workspace = readSrc("src/components/StoryWorkspace.tsx");

  assert.match(editorPage, /DraftEditorFlow/);
  assert.match(workspace, /EditorProjectSidebar/);
  assert.match(workspace, /InspectorResolver/);
  assert.match(workspace, /VideoPreview/);
  assert.match(workspace, /onScriptChange/);
});

test("captions and subtitles paths remain intact", () => {
  const sceneInspector = readSrc("src/features/editor/components/StudioSceneInspector.tsx");
  const videoPreview = readSrc("src/features/preview/components/VideoPreview.tsx");

  assert.match(sceneInspector, /captionMode/);
  assert.match(sceneInspector, /subtitleText/);
  assert.match(videoPreview, /CaptionOverlay/);
  assert.match(videoPreview, /SubtitleOverlay/);
});

test("transition timeline cards are not exported as video scenes", () => {
  const script: FootieScript = syncFootieScript({
    title: "QA Story",
    narration: "Narration for export QA.",
    totalDuration: 6,
    scenes: [
      { id: "1", start: 0, end: 3, duration: 3, subtitle: "One" },
      { id: "2", start: 3, end: 6, duration: 3, subtitle: "Two" },
    ],
  });

  const payload = buildFootieExportPayload(script);
  const transitions = getExportTransitionsFromPayload(payload);
  const renderable = getRenderableScenesFromPayload(payload);
  const sceneItems = payload.timelineItems.filter(isVideoSegmentTimelineItem);

  assert.ok(transitions.length >= 1);
  assert.equal(renderable.length, sceneItems.length);
  assert.ok(payload.timelineItems.every((item) => item.type === "scene" || item.type === "transition"));
  assert.equal(payload.renderTransitions, false);
});

test("API route falls back to legacy generation when audio-first fails", () => {
  const route = readSrc("src/app/api/generate-script/route.ts");

  assert.match(route, /generateAudioFirstStory/);
  assert.match(route, /if \(audioFirstResult\.success\)/);
  assert.match(route, /generateFootieScript/);
  assert.match(route, /applyAudioFirstTiming/);
  assert.match(route, /usedFallback: true/);
});

test("audio-first story populates voiceover fields for preview/export", () => {
  const voiceoverMs = 15_000;
  const scenes = attachEvenVoiceoverTiming([makeScene("1"), makeScene("2"), makeScene("3")], voiceoverMs);
  const script: FootieScript = syncFootieScript({
    title: "Audio QA",
    narration: "Full narration text for the short.",
    totalDuration: getStoryTotalDuration(scenes),
    scenes,
    voiceoverUrl: "blob:mock-voiceover",
    voiceoverDurationMs: voiceoverMs,
  });

  const payload = buildFootieExportPayload(script);
  assert.equal(payload.voiceoverUrl, "blob:mock-voiceover");
  assert.equal(payload.voiceoverDurationMs, voiceoverMs);
  assert.equal(payload.audioFirst, true);
  assert.equal(payload.narration, script.narration);
});

console.log("All audio-first QA checks passed.");
