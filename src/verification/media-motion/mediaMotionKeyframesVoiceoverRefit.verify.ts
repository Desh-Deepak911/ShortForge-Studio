import assert from "node:assert/strict";

import {
  buildExportManifest,
} from "@/features/export/domain";
import { prepareExportRequest } from "@/features/export/domain/prepare-export-request";
import { projectSceneMediaKeyframesToManifest } from "@/features/export/domain/project-media-motion-keyframes-to-manifest";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import type { ExportEnvironmentSnapshot } from "@/features/export/domain";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

const CAPABLE_ENV: Partial<ExportEnvironmentSnapshot> = {
  browserName: "chrome", supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true, supportsMediaRecorder: true,
  supportsRequestVideoFrameCallback: true, supportsWebAssembly: true,
  serverRendererAvailable: false, ffmpegRuntimePoisoned: false,
  estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024, mp4EncoderAvailable: true,
};
let passed = 0;
function test(name: string, fn: () => void): void {
  fn(); passed += 1; console.log(`  ✓ ${name}`);
}
async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
  await fn(); passed += 1; console.log(`  ✓ ${name}`);
}

function keyedMedia(): SceneMedia {
  return {
    type: "image", url: "https://example.com/refit.jpg", source: "upload",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    motion: {
      version: 1, enabled: true, presetId: "slow-zoom-in", easing: "linear", intensity: 1,
      startTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
      endTransform: { x: 0, y: 0, scale: 1.1, rotation: 0 },
      keyframes: [
        { offsetMs: 7000, x: 70, y: 0, scale: 1.1, rotation: 0, opacity: 0.8, easing: "linear" },
        { offsetMs: 9000, x: 90, y: 0, scale: 1.2, rotation: 0, opacity: 0.6, easing: "linear" },
      ],
    },
  };
}
function story(music = true): FootieScript {
  const media = keyedMedia();
  const scene: FootieScene = {
    id: "refit", start: 0, end: 10, duration: 10, startMs: 0, endMs: 10000, durationMs: 10000,
    subtitle: "Refit", narration: "Refit", media,
    image: { url: media.url!, x: 0, y: 0, scale: 1, rotation: 0, fitMode: "fill" },
  };
  return syncFootieScript({
    title: "Keyframe refit", narration: "Refit", totalDuration: 10, scenes: [scene],
    voiceoverUrl: "https://example.com/voice.mp3", voiceoverDurationMs: 2000,
    ...(music ? { backgroundMusic: { enabled: true, source: "upload", fileUrl: "https://example.com/music.mp3", fileName: "music.mp3", volume: 0.5, duckingEnabled: true, fadeIn: false, fadeOut: false } } : {}),
  });
}

async function main(): Promise<void> {
  console.log("\nmedia-motion-keyframes-voiceover-refit\n");
  test("post-refit shortened windows clamp large offsets and drop non-authoritative keyframes", () => {
    const editorStory = story();
    const prepared = prepareStoryForExport(editorStory);
    const preparedMedia = prepared.story.scenes[0]!.media!;
    // The export projection always uses the final prepared window, which may be
    // shorter after voiceover timing refit than authored offsets.
    const projected = projectSceneMediaKeyframesToManifest(preparedMedia, 2000);
    assert.equal(projected, undefined);
    assert.equal(projectSceneMediaKeyframesToManifest(editorStory.scenes[0]!.media!, 10000)!.keyframes.length, 2);
    const shortenedStory = syncFootieScript({
      ...editorStory,
      scenes: [{
        ...editorStory.scenes[0]!,
        end: 2,
        duration: 2,
        endMs: 2000,
        durationMs: 2000,
      }],
    });
    const manifest = buildExportManifest({
      story: shortenedStory,
      environment: CAPABLE_ENV,
      audioMode: "silent",
      keyframedVisualEffectsEnabled: true,
    });
    assert.equal(manifest.version, 4);
  });

  test("preparation uses copies and leaves editor keyframe offsets untouched", () => {
    const editorStory = story();
    const before = JSON.stringify(editorStory.scenes[0]!.media!.motion!.keyframes);
    const prepared = prepareStoryForExport(editorStory);
    assert.equal(JSON.stringify(editorStory.scenes[0]!.media!.motion!.keyframes), before);
    assert.notEqual(prepared.story, editorStory);
  });

  await testAsync("prepareExportRequest only mutates its prepared export copy", async () => {
    const editorStory = story();
    const before = JSON.stringify(editorStory.scenes[0]!.media!.motion!.keyframes);
    const result = await prepareExportRequest({
      story: editorStory, environment: CAPABLE_ENV, throwIfBlocked: false,
      keyframedVisualEffectsEnabled: true,
    });
    assert.equal(JSON.stringify(editorStory.scenes[0]!.media!.motion!.keyframes), before);
    assert.notEqual(result.exportStory, editorStory);
  });

  test("music selection cannot change same-window keyframe projection", () => {
    const withMusic = projectSceneMediaKeyframesToManifest(story(true).scenes[0]!.media!, 8000);
    const withoutMusic = projectSceneMediaKeyframesToManifest(story(false).scenes[0]!.media!, 8000);
    assert.deepEqual(withMusic, withoutMusic);
  });

  test("disabled motion never projects keyframes after voiceover preparation", () => {
    const editorStory = story();
    editorStory.scenes[0]!.media!.motion!.enabled = false;
    const prepared = prepareStoryForExport(editorStory);
    assert.equal(
      projectSceneMediaKeyframesToManifest(prepared.story.scenes[0]!.media!, 2000),
      undefined,
    );
    const result = buildExportManifest({
      story: prepared.story,
      prepared,
      environment: CAPABLE_ENV,
      audioMode: "silent",
      keyframedVisualEffectsEnabled: true,
    });
    assert.equal(result.version, 4);
    assert.doesNotMatch(JSON.stringify(result), /"keyframes"/);
  });

  test("post-refit collapse of all keyframed items falls back globally to v4", () => {
    const editorStory = story();
    // Simulate a final post-refit media window shorter than every authored offset.
    const shortenedStory = syncFootieScript({
      ...editorStory,
      scenes: [{
        ...editorStory.scenes[0]!,
        end: 2,
        duration: 2,
        endMs: 2000,
        durationMs: 2000,
      }],
    });
    const prepared = prepareStoryForExport(shortenedStory);
    assert.equal(
      projectSceneMediaKeyframesToManifest(
        prepared.story.scenes[0]!.media!,
        prepared.story.scenes[0]!.durationMs ?? 2000,
      ),
      undefined,
    );
    const result = buildExportManifest({
      story: prepared.story,
      prepared,
      environment: CAPABLE_ENV,
      audioMode: "with-voice",
      keyframedVisualEffectsEnabled: true,
    });
    assert.equal(result.version, 4);
    assert.ok(!("requiredCapabilities" in result));
    assert.doesNotMatch(JSON.stringify(result), /"keyframes"/);
    // Editor story authored offsets remain untouched.
    assert.equal(editorStory.scenes[0]!.media!.motion!.keyframes![0]!.offsetMs, 7000);
    assert.equal(editorStory.scenes[0]!.durationMs, 10000);
  });

  console.log(`\n${passed} passed\n`);
}
void main();
