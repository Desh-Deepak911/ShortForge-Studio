/**
 * Export sync QA (run: npm run test:export-sync-qa).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildAudioMixFromStory, resolveExportAudioSource } from "@/features/audio";
import {
  buildFootieExportPayload,
  getExportTotalDurationSec,
  getRenderableScenesFromPayload,
} from "@/features/export/services";
import {
  EXPORT_NARRATION_VOICEOVER_MISMATCH_WARNING,
  hasNarrationVoiceoverMismatch,
} from "@/features/export/utils/export-narration-voiceover.utils";
import {
  resolveExportBackgroundMusicMixSettingsFromMix,
} from "@/features/export/utils/export-background-music.utils";
import { prepareStoryForExport, type PrepareStoryForExportResult } from "@/features/export/utils/export-preflight.utils";
import {
  getExportSubtitleChunkState,
  resolveExportSubtitleDisplay,
} from "@/features/export/utils/export-subtitle.utils";
import { getExportTransitionLayerDrawStates } from "@/features/export/utils/export-transition-canvas.utils";
import { footieScriptFromAudioFirst } from "@/features/story/utils/audio-first.utils";
import {
  getStoryTotalDuration,
  resolveSceneImageMotionScale,
  splitSubtitleChunks,
} from "@/features/story/utils";
import { VOICEOVER_PROVIDER_OPENAI, type FootieScene, type FootieScript } from "@/features/story/types";
import {
  applySceneUpdate,
  applyVoiceoverRegeneration,
  syncFootieScript,
} from "@/lib/utils/voiceover";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assertMasterTimelineExportDuration(
  preflight: PrepareStoryForExportResult,
  voiceoverDurationMs: number,
): void {
  assert.equal(preflight.exportDurationMs, preflight.masterTimeline.renderDurationMs);
  assert.ok(
    preflight.exportDurationMs >= voiceoverDurationMs,
    `export duration should cover voiceover (${voiceoverDurationMs}ms)`,
  );
  assert.equal(
    Math.round(getStoryTotalDuration(preflight.story.scenes) * 1000),
    voiceoverDurationMs,
  );
}

function makeScene(
  id: string,
  durationSec: number,
  startSec: number,
  subtitleText: string,
): FootieScene {
  const durationMs = durationSec * 1000;
  const startMs = startSec * 1000;
  return {
    id,
    start: startSec,
    end: startSec + durationSec,
    duration: durationSec,
    startMs,
    endMs: startMs + durationMs,
    durationMs,
    durationSource: "manual",
    subtitle: `Caption ${id}`,
    captionMode: "subtitles",
    subtitleText,
    subtitleEffect: "fade-up",
    narration: subtitleText,
    image: {
      url: `https://example.com/${id}.jpg`,
      scale: 1.05,
      x: 0,
      y: 0,
      imageMotion: { type: "zoom-in", intensity: "medium" },
    },
  };
}

function withBackgroundMusic(script: FootieScript): FootieScript {
  return {
    ...script,
    backgroundMusic: {
      enabled: true,
      source: "upload",
      fileUrl: "blob:ambient-track",
      fileName: "ambient.mp3",
      volume: 0.18,
      duckingEnabled: false,
      fadeIn: true,
      fadeOut: true,
    },
  };
}

function buildInitialGeneratedStory(): FootieScript {
  const subtitleText =
    "The stadium erupted as the final whistle blew. History had been written tonight.";
  const audioFirstScript = footieScriptFromAudioFirst({
    script: {
      id: "sync-qa",
      title: "Export Sync QA",
      narration: subtitleText,
    },
    voiceover: {
      audioUrl: "blob:generated-voiceover",
      durationMs: 24_000,
      provider: VOICEOVER_PROVIDER_OPENAI,
      metadata: { voice: "alloy", speed: 1 },
    },
    scenes: [
      makeScene("1", 8, 0, "Opening scene narration excerpt."),
      makeScene("2", 8, 8, "Middle scene narration excerpt."),
      makeScene("3", 8, 16, "Closing scene narration excerpt."),
    ],
    timelineItems: [
      { id: "1", type: "scene", scene: { id: "1", start: 0, end: 8, duration: 8, subtitle: "Caption 1" } },
      {
        id: "t-1",
        type: "transition",
        fromSceneId: "1",
        toSceneId: "2",
        effect: "fade",
        durationMs: 500,
      },
      { id: "2", type: "scene", scene: { id: "2", start: 8, end: 16, duration: 8, subtitle: "Caption 2" } },
      { id: "3", type: "scene", scene: { id: "3", start: 16, end: 24, duration: 8, subtitle: "Caption 3" } },
    ],
  });

  return syncFootieScript(withBackgroundMusic(audioFirstScript));
}

console.log("export-sync-qa");

test("1. initial generated story exports with voiceover + music", () => {
  const editorScript = buildInitialGeneratedStory();
  const preflight = prepareStoryForExport(editorScript);
  const mix = buildAudioMixFromStory(preflight.story);
  const musicSettings = resolveExportBackgroundMusicMixSettingsFromMix(
    mix,
    true,
    preflight.exportDurationMs,
  );

  assertMasterTimelineExportDuration(preflight, 24_000);
  assert.equal(resolveExportAudioSource(mix), "voiceover+background");
  assert.ok(mix.voiceover?.src);
  assert.ok(mix.background?.src);
  assert.equal(musicSettings?.exportDurationMs, preflight.exportDurationMs);

  const videoRender = readSrc("src/features/export/services/video-render.service.ts");
  assert.match(videoRender, /prepareStoryForExport\(script\)/);
  assert.match(videoRender, /mixExportVoiceoverAndBackgroundMusic/);
  assert.match(videoRender, /includeBackgroundMusicMix/);
  assert.match(videoRender, /exportDurationMs/);
});

test("2. edit scene duration, then export refits to voiceover authority", () => {
  const editorScript = buildInitialGeneratedStory();
  const edited = applySceneUpdate(editorScript, "2", {
    duration: 14,
    durationMs: 14_000,
    durationSource: "manual",
  });

  assert.equal(Math.round(getStoryTotalDuration(edited.scenes) * 1000), 30_000);

  const beforeEndMs = edited.scenes[1]?.endMs;
  const preflight = prepareStoryForExport(edited);

  assertMasterTimelineExportDuration(preflight, 24_000);
  assert.equal(edited.scenes[1]?.endMs, beforeEndMs);
  assert.match(
    preflight.warnings.join(" "),
    /Voiceover refit applied|refitted scenes to voiceover duration/i,
  );
});

test("3. edit multiple scene durations, then export preserves proportional intent", () => {
  const editorScript = buildInitialGeneratedStory();
  const edited = syncFootieScript({
    ...editorScript,
    voiceoverDurationMs: 30_000,
    scenes: [
      { ...editorScript.scenes[0]!, duration: 3, durationMs: 3000, durationSource: "manual" },
      { ...editorScript.scenes[1]!, duration: 7, durationMs: 7000, durationSource: "manual" },
      { ...editorScript.scenes[2]!, duration: 5, durationMs: 5000, durationSource: "manual" },
    ],
  });

  const preflight = prepareStoryForExport(edited);

  assertMasterTimelineExportDuration(preflight, 30_000);
  assert.equal(preflight.story.scenes[0]?.duration, 6);
  assert.equal(preflight.story.scenes[1]?.duration, 14);
  assert.equal(preflight.story.scenes[2]?.duration, 10);
  assert.equal(preflight.story.scenes[0]?.durationSource, "manual");
});

test("4. change voice speed, then export uses updated voiceover duration", () => {
  const editorScript = buildInitialGeneratedStory();
  const faster = applyVoiceoverRegeneration(editorScript, {
    voiceoverUrl: "blob:faster-voiceover",
    voiceoverDurationMs: 18_000,
    voiceSettings: { voice: "alloy", speed: 1.25 },
  });

  assert.equal(faster.voiceoverDurationMs, 18_000);
  assert.equal(Math.round(getStoryTotalDuration(faster.scenes) * 1000), 24_000);

  const preflight = prepareStoryForExport(faster);

  assertMasterTimelineExportDuration(preflight, 18_000);
  assert.equal(preflight.story.voiceSettings?.speed, 1.25);
});

test("5. edit narration after voiceover shows mismatch warning", () => {
  const editorScript = syncFootieScript({
    ...buildInitialGeneratedStory(),
    voiceoverNarration: buildInitialGeneratedStory().narration,
  });
  const editedNarration = syncFootieScript({
    ...editorScript,
    narration: "Updated narration after voiceover was generated.",
  });

  assert.equal(hasNarrationVoiceoverMismatch(editedNarration), true);

  const preflight = prepareStoryForExport(editedNarration);
  assert.equal(
    preflight.warnings.includes(EXPORT_NARRATION_VOICEOVER_MISMATCH_WARNING),
    true,
  );

  const exportPanel = readSrc("src/components/ExportPanel.tsx");
  assert.match(exportPanel, /hasNarrationVoiceoverMismatch/);
  assert.match(exportPanel, /EXPORT_NARRATION_VOICEOVER_MISMATCH_WARNING/);
});

test("6. background music uses final normalized export duration", () => {
  const editorScript = buildInitialGeneratedStory();
  const edited = applySceneUpdate(editorScript, "1", {
    duration: 12,
    durationMs: 12_000,
    durationSource: "manual",
  });
  const preflight = prepareStoryForExport(edited);
  const mix = buildAudioMixFromStory(preflight.story);
  const musicSettings = resolveExportBackgroundMusicMixSettingsFromMix(
    mix,
    true,
    preflight.exportDurationMs,
  );

  assertMasterTimelineExportDuration(preflight, 24_000);
  assert.equal(musicSettings?.exportDurationMs, preflight.exportDurationMs);

  const videoRender = readSrc("src/features/export/services/video-render.service.ts");
  assert.match(videoRender, /exportSilentVideoBlob\([\s\S]*masterTimeline/);
  assert.match(videoRender, /resolveExportBackgroundMusicMixSettingsFromMix\([\s\S]*exportDurationMs/);

  const browserMix = readSrc("src/features/export/utils/export-browser-audio-mix.utils.ts");
  assert.match(browserMix, /mixSettings\.exportDurationMs/);

  const ffmpegUtils = readSrc("src/features/export/utils/ffmpeg.utils.ts");
  assert.match(ffmpegUtils, /backgroundMusicMix\.exportDurationMs/);
});

test("7. voiceover remains primary export duration authority", () => {
  const editorScript = syncFootieScript({
    ...buildInitialGeneratedStory(),
    voiceoverDurationMs: 22_000,
    scenes: [
      { ...buildInitialGeneratedStory().scenes[0]!, durationMs: 5000, duration: 5 },
      { ...buildInitialGeneratedStory().scenes[1]!, durationMs: 5000, duration: 5 },
      { ...buildInitialGeneratedStory().scenes[2]!, durationMs: 5000, duration: 5 },
    ],
  });

  const preflight = prepareStoryForExport(editorScript);
  const payload = buildFootieExportPayload(preflight.story);

  assertMasterTimelineExportDuration(preflight, 22_000);
  assert.notEqual(Math.round(getStoryTotalDuration(editorScript.scenes) * 1000), 22_000);
  assert.equal(getExportTotalDurationSec(payload), 22);
  assert.ok(
    preflight.exportDurationMs >= 22_000,
    "optimized render span covers voiceover authority",
  );
});

test("8. subtitles still derive from refitted scene duration", () => {
  const editorScript = buildInitialGeneratedStory();
  const edited = applySceneUpdate(editorScript, "2", {
    duration: 12,
    durationMs: 12_000,
    durationSource: "manual",
  });
  const preflight = prepareStoryForExport(edited);
  const scene = getRenderableScenesFromPayload(buildFootieExportPayload(preflight.story))[1]!;
  const chunks = splitSubtitleChunks(scene.subtitleText ?? "");
  const timing = {
    sceneElapsedMs: Math.floor(scene.durationMs / 2),
    sceneDurationMs: scene.durationMs,
  };
  const chunkDurationMs = scene.durationMs / chunks.length;
  const expectedIndex = Math.floor(timing.sceneElapsedMs / chunkDurationMs);

  const previewDisplay = resolveExportSubtitleDisplay(scene, timing);
  const exportState = getExportSubtitleChunkState(scene, timing);

  assert.equal(scene.durationMs, preflight.story.scenes[1]?.durationMs);
  assert.ok(previewDisplay);
  assert.equal(exportState.chunk, chunks[expectedIndex]);
  assert.equal(previewDisplay?.activeChunk, exportState.chunk);
});

test("9. transitions and Ken Burns still work on export path", () => {
  const editorScript = buildInitialGeneratedStory();
  const preflight = prepareStoryForExport(editorScript);
  const scene = preflight.story.scenes[0]!;

  assert.ok(
    resolveSceneImageMotionScale(scene.image?.imageMotion, 0.5) >= 1,
  );

  const transitionDrawStates = getExportTransitionLayerDrawStates("fade", 0.5);
  assert.ok(transitionDrawStates.from);
  assert.ok(transitionDrawStates.to);

  const videoRender = readSrc("src/features/export/services/video-render.service.ts");
  assert.match(videoRender, /resolveTimelineTransitionOverlay/);
  assert.match(videoRender, /resolveSceneImageMotionTransformState/);
  assert.match(videoRender, /drawExportTransitionBackgrounds/);
});

console.log("\nExport sync QA checks passed (items 1–9).");
console.log("Run npm run lint and npm run build for items 10–11.");
