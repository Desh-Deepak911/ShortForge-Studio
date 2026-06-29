/**
 * Phase A QA verification (run: npm run test:phase-a-qa).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getDisplayCaption,
  getDisplayCaptionLines,
  mergeSubtitleTextOnSubtitlesModeSwitch,
} from "@/features/story/utils";
import { splitSubtitleChunks } from "@/features/story/utils";
import {
  getActiveSubtitleChunk,
  getActiveSubtitleChunkState,
} from "@/features/story/utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const root = process.cwd();
const globalsCss = readFileSync(join(root, "src/app/globals.css"), "utf8");
const studioUi = readFileSync(join(root, "src/lib/utils/studioUi.ts"), "utf8");
const videoPreview = readFileSync(
  join(root, "src/features/preview/components/VideoPreview.tsx"),
  "utf8",
);
const captionOverlay = readFileSync(
  join(root, "src/features/preview/components/CaptionOverlay.tsx"),
  "utf8",
);
const subtitleOverlay = readFileSync(
  join(root, "src/features/preview/components/SubtitleOverlay.tsx"),
  "utf8",
);
const studioSceneInspector = readFileSync(
  join(root, "src/features/editor/components/StudioSceneInspector.tsx"),
  "utf8",
);
const subtitleEffectPreview = readFileSync(
  join(root, "src/features/editor/components/subtitleEffectPreview.tsx"),
  "utf8",
);
const storyReview = readFileSync(join(root, "src/components/StoryReview.tsx"), "utf8");
const voiceover = readFileSync(join(root, "src/lib/utils/voiceover.ts"), "utf8");
const previewTimeline = readFileSync(
  join(root, "src/features/preview/utils/previewTimeline.ts"),
  "utf8",
);
const narrationPanel = readFileSync(join(root, "src/components/NarrationPanel.tsx"), "utf8");
const voiceSettingsCard = readFileSync(join(root, "src/components/VoiceSettingsCard.tsx"), "utf8");
const voiceoverApplyHook = readFileSync(join(root, "src/hooks/useStoryVoiceoverApply.ts"), "utf8");

test("story workspace places voice settings near story controls", () => {
  const workspace = readFileSync(join(root, "src/components/StoryWorkspace.tsx"), "utf8");
  const projectInspector = readFileSync(
    join(root, "src/features/editor/components/EditorProjectInspector.tsx"),
    "utf8",
  );
  assert.match(workspace, /InspectorResolver/);
  assert.match(projectInspector, /VoiceSettingsCard/);
  assert.match(projectInspector, /StoryReview/);
});

test("generated caption mode uses inline preview path unchanged", () => {
  assert.match(videoPreview, /isNarrationSubtitles/);
  assert.match(videoPreview, /CaptionOverlay/);
  assert.match(
    videoPreview,
    /showGeneratedCaption = !isNarrationSubtitles && !hideCaptionsDuringTransition/,
  );
  assert.match(
    videoPreview,
    /showGeneratedCaption \? <CaptionOverlay scene=\{displayScene\} \/> : null/,
  );
  assert.match(captionOverlay, /studioPreviewCaption/);

  const generatedLines = getDisplayCaptionLines({
    captionMode: "generated",
    subtitle: "Big match tonight under the lights",
  });
  assert.equal(generatedLines.length, 1);
  assert.match(generatedLines[0] ?? "", /Big match tonight/);
});

test("narration subtitles render inside device frame at bottom only", () => {
  assert.match(
    videoPreview,
    /showSubtitles = isNarrationSubtitles && !hideCaptionsDuringTransition/,
  );
  assert.match(videoPreview, /showSubtitles \? \(/);
  assert.match(videoPreview, /SubtitleOverlay/);
  assert.match(videoPreview, /getPreviewSceneTiming/);
  assert.match(videoPreview, /sceneElapsedMs=\{sceneElapsedMs\}/);
  assert.match(videoPreview, /sceneDurationMs=\{sceneDurationMs\}/);
  assert.match(subtitleOverlay, /preview-narration-subtitle-overlay/);
  assert.match(globalsCss, /\.preview-narration-subtitle-overlay[\s\S]*bottom:\s*8%/);
  assert.match(globalsCss, /\.preview-narration-subtitle-overlay[\s\S]*justify-content:\s*center/);
});

test("narration subtitles do not cover the screen", () => {
  assert.match(globalsCss, /\.preview-narration-subtitle-pill[\s\S]*max-width:\s*90%/);
  assert.match(globalsCss, /\.preview-narration-subtitle-text[\s\S]*-webkit-line-clamp:\s*3/);
  assert.match(globalsCss, /\.preview-narration-subtitle-text[\s\S]*line-height:\s*1\.3/);
  assert.match(globalsCss, /\.preview-narration-subtitle-overlay[\s\S]*overflow:\s*hidden/);
  assert.doesNotMatch(globalsCss, /\.preview-narration-subtitle-overlay[\s\S]*inset:\s*0/);
});

test("subtitle preview uses timed chunk selection when playing", () => {
  assert.match(videoPreview, /sceneElapsedMs/);
  assert.match(videoPreview, /sceneDurationMs/);
  assert.match(subtitleOverlay, /captionAnimationState/);
  assert.match(subtitleOverlay, /resolveActiveSubtitleForScene/);
  assert.match(subtitleOverlay, /sceneElapsedMs/);
  assert.match(subtitleOverlay, /sceneDurationMs/);
});

test("only the first short subtitle chunk is shown when timing is omitted", () => {
  assert.doesNotMatch(subtitleOverlay, /splitSubtitleChunks/);

  const narration =
    "The palace was alive. Music echoing through marble halls as guests gathered for the annual ball.";
  const chunks = splitSubtitleChunks(narration);
  assert.ok(chunks.length >= 2);
  assert.equal(chunks[0], "The palace was alive.");
  assert.ok(chunks.every((chunk) => chunk.split(" ").length <= 5));

  assert.equal(
    getDisplayCaption({
      captionMode: "subtitles",
      subtitleText: narration,
      subtitle: "Generated caption must not appear",
      caption: "Generated caption must not appear",
    }),
    "The palace was alive.",
  );
});

test("fade-up, typewriter, and highlight effect hooks exist", () => {
  assert.match(subtitleEffectPreview, /case "fade-up"/);
  assert.match(subtitleEffectPreview, /case "typewriter"/);
  assert.match(subtitleEffectPreview, /case "highlight"/);
  assert.match(subtitleEffectPreview, /TimelineFadeUpSubtitleCaption/);
  assert.match(subtitleEffectPreview, /captionAnimationState/);
  assert.match(subtitleEffectPreview, /TimelineTypewriterSubtitleCaption/);
  assert.match(globalsCss, /translateY\(8px\)/);
  assert.match(subtitleEffectPreview, /subtitle-effect-highlight-bar/);
  assert.match(globalsCss, /@keyframes subtitle-fade-up/);
  assert.match(globalsCss, /\.subtitle-effect-typewriter-caret::after/);
  assert.match(globalsCss, /\.subtitle-effect-highlight-bar/);
});

test("subtitle mode uses subtitleText for display", () => {
  assert.equal(
    getDisplayCaption({
      captionMode: "subtitles",
      subtitleText: "Custom subtitle copy",
      narration: "Voiceover excerpt should not show",
      subtitle: "Generated must not show",
    }),
    "Custom subtitle copy",
  );

  assert.equal(
    getDisplayCaption({
      captionMode: "subtitles",
      narration: "Fallback from narration excerpt",
      subtitle: "Generated must not show",
    }),
    "Fallback from narration excerpt",
  );

  const merged = mergeSubtitleTextOnSubtitlesModeSwitch(
    { id: "s1", start: 0, end: 3, duration: 3, subtitle: "Cap", narration: "Scene voiceover bit" },
    { captionMode: "subtitles" },
  );
  assert.equal(merged.subtitleText, "Scene voiceover bit");
});

test("subtitle mode edits subtitleText in scene inspector", () => {
  assert.match(studioSceneInspector, /Subtitle text/);
  assert.match(studioSceneInspector, /subtitleEditorValue/);
  assert.match(studioSceneInspector, /scene\.subtitleText \|\| scene\.narration/);
  assert.match(studioSceneInspector, /subtitleText: event\.target\.value/);
});

test("subtitle effect selector appears only in subtitles mode", () => {
  assert.match(studioSceneInspector, /isSubtitlesMode \?/);
  assert.match(studioSceneInspector, /SubtitleEffectControl/);
  assert.match(studioSceneInspector, /subtitleEffect: effect/);
});

test("mobile preview shell prevents overflow", () => {
  assert.match(studioUi, /studioPreviewScreen[\s\S]*overflow-hidden/);
  assert.match(studioUi, /studioPreviewDevice[\s\S]*max-w-\[min\(100%/);
  assert.match(videoPreview, /min-w-0/);
});

test("Phase A scope stays in caption overlay layer", () => {
  assert.doesNotMatch(videoPreview, /splitSubtitleChunks/);
  assert.doesNotMatch(subtitleEffectPreview, /getPlaybackEntryAtTimeMs/);
  assert.doesNotMatch(subtitleOverlay, /animateTransitionProgress/);
});

console.log("\neditable-timed-subtitles-qa");

test("generated captions still work in generated mode", () => {
  assert.equal(
    getDisplayCaption({
      captionMode: "generated",
      subtitle: "Big match tonight",
      subtitleText: "Should not appear in generated mode",
    }),
    "Big match tonight",
  );

  assert.equal(
    getDisplayCaptionLines({
      captionMode: "generated",
      subtitle: "Legacy generated caption",
    })[0],
    "Legacy generated caption",
  );

  assert.match(subtitleEffectPreview, /if \(!isSubtitlesMode\)/);
  assert.match(subtitleEffectPreview, /CaptionLines lines=\{lines\}/);
});

test("switching to subtitles initializes subtitleText from narration", () => {
  const merged = mergeSubtitleTextOnSubtitlesModeSwitch(
    {
      id: "s1",
      start: 0,
      end: 4,
      duration: 4,
      subtitle: "Generated caption preserved",
      narration: "Voiceover excerpt for this scene",
    },
    { captionMode: "subtitles" },
  );
  assert.equal(merged.subtitleText, "Voiceover excerpt for this scene");
  assert.equal(merged.subtitle, undefined);
});

test("switching back to generated preserves subtitleText and generated caption", () => {
  assert.match(studioSceneInspector, /captionMode: mode/);
  assert.doesNotMatch(
    studioSceneInspector,
    /captionMode: "generated"[\s\S]{0,120}subtitleText:\s*""/,
  );

  const scene = {
    captionMode: "generated" as const,
    subtitle: "Generated caption preserved",
    subtitleText: "Edited subtitle copy",
    narration: "Narration excerpt",
  };
  assert.equal(getDisplayCaption({ ...scene, captionMode: "generated" }), "Generated caption preserved");
  assert.equal(
    getDisplayCaption({ ...scene, captionMode: "subtitles" }),
    "Edited subtitle copy",
  );
});

test("subtitleText edits change preview subtitle source", () => {
  assert.match(subtitleOverlay, /resolveActiveSubtitleForScene\(scene/);
  assert.match(subtitleOverlay, /sceneDurationMs/);

  const before = getDisplayCaption({
    captionMode: "subtitles",
    subtitleText: "Original subtitle chunk one.",
  });
  const after = getDisplayCaption({
    captionMode: "subtitles",
    subtitleText: "Rewritten subtitle chunk one.",
  });
  assert.notEqual(before, after);
  assert.match(before, /Original/);
  assert.match(after, /Rewritten/);
});

test("narration remains separate from subtitle editing", () => {
  assert.doesNotMatch(studioSceneInspector, /updateScene\(scene\.id, \{ narration:/);
  assert.match(storyReview, /story\.narration/);
  assert.match(storyReview, /onStoryChange\(\{ \.\.\.story, narration: e\.target\.value \}\)/);
  assert.match(studioSceneInspector, /Plays during voiceover/);
  assert.doesNotMatch(studioSceneInspector, /id=\{`story-narration/);
});

test("only one subtitle chunk is visible at a time", () => {
  const text =
    "The palace was alive. Music echoing through marble halls as guests gathered for the annual ball.";
  const chunks = splitSubtitleChunks(text);
  assert.ok(chunks.length >= 2);

  const durationMs = chunks.length * 2000;
  const seen = new Set<string>();
  for (let index = 0; index < chunks.length; index++) {
    const chunk = getActiveSubtitleChunk(text, index * 2000 + 100, durationMs);
    assert.ok(chunk);
    seen.add(chunk);
  }
  assert.equal(seen.size, chunks.length);

  const state = getActiveSubtitleChunkState(text, 2500, durationMs);
  assert.equal(state.chunk.split(" ").length <= 7, true);
  assert.doesNotMatch(subtitleEffectPreview, /lines\.map[\s\S]*activeSubtitleChunk[\s\S]*lines\.map/);
});

test("subtitle chunk advances during preview playback timing", () => {
  const text =
    "The palace was alive. Music echoing through marble halls as guests gathered for the annual ball.";
  const early = getActiveSubtitleChunk(text, 500, 8000);
  const late = getActiveSubtitleChunk(text, 5500, 8000);
  assert.notEqual(early, late);

  const earlyProgress = getActiveSubtitleChunkState(text, 500, 8000).progress;
  const lateProgress = getActiveSubtitleChunkState(text, 5500, 8000).progress;
  assert.ok(earlyProgress < 1);
  assert.ok(lateProgress >= 0 && lateProgress <= 1);
});

test("subtitle effects target the active chunk with restart keys", () => {
  assert.match(subtitleEffectPreview, /TimelineFadeUpSubtitleCaption/);
  assert.match(subtitleEffectPreview, /TimelineTypewriterSubtitleCaption/);
  assert.match(subtitleEffectPreview, /subtitle-effect-highlight/);
  assert.match(globalsCss, /@keyframes subtitle-fade-up/);
});

test("no UI redesign or playback architecture drift", () => {
  assert.match(studioUi, /studioStoryboardCard/);
  assert.match(studioUi, /studioPreviewDevice/);
  assert.doesNotMatch(globalsCss, /\.preview-narration-subtitle-overlay[\s\S]*inset:\s*0/);
  assert.doesNotMatch(videoPreview, /splitSubtitleChunks/);
});

test("transition and voiceover generation flows unchanged", () => {
  assert.match(previewTimeline, /getPreviewFrameAtTime/);
  assert.doesNotMatch(subtitleOverlay, /updateTransitionInTimeline/);
  assert.doesNotMatch(voiceover, /fetch\(\s*["']\/api\/generate/);
  assert.match(voiceover, /Does not modify narration text or trigger AI generation/);
  assert.match(voiceoverApplyHook, /generate-voiceover/);
  assert.match(voiceSettingsCard, /Apply Changes/);
  assert.doesNotMatch(narrationPanel, /subtitleText/);
});

test("export and preview skip transition items as video segments", () => {
  const exportPayload = readFileSync(
    join(root, "src/features/export/services/export-payload.service.ts"),
    "utf8",
  );
  const exportVideo = readFileSync(
    join(root, "src/features/export/services/video-render.service.ts"),
    "utf8",
  );

  assert.match(exportPayload, /getExportScenesFromPayload/);
  assert.match(exportPayload, /isVideoSegmentTimelineItem/);
  assert.match(exportPayload, /assertTimelineItemIsNotVideoSegment/);
  assert.match(exportPayload, /isTransitionVideoContent/);
  assert.match(exportVideo, /getRenderableScenesFromPayload/);
  assert.match(exportVideo, /isTransitionVideoContent/);
  assert.doesNotMatch(videoPreview, /TRANSITION_CARD_TITLE/);
  const studioTimeline = readFileSync(
    join(root, "src/features/timeline-editor/StudioTimeline.tsx"),
    "utf8",
  );
  const sceneInspector = readFileSync(
    join(root, "src/features/editor/components/StudioSceneInspector.tsx"),
    "utf8",
  );
  assert.match(studioTimeline, /segment\.type === "transition"/);
  assert.match(sceneInspector, /TransitionCard/);
});

console.log("All editable timed subtitles QA checks passed.");
