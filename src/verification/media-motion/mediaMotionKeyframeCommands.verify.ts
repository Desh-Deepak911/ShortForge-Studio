/**
 * Immutable media-motion keyframe command verification.
 * Run via: npm run test:media-motion-keyframe-ui
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { buildExportManifest } from "@/features/export/domain";
import type { ExportEnvironmentSnapshot } from "@/features/export/domain";
import {
  addMediaMotionKeyframe,
  buildMediaMotionPatch,
  clearMediaMotionKeyframes,
  deleteMediaMotionKeyframe,
  initializeMediaMotionKeyframes,
  MEDIA_MOTION_KEYFRAME_BELOW_TWO_WARNING,
  MEDIA_MOTION_KEYFRAME_CAPABILITY_OFF_MESSAGE,
  MEDIA_MOTION_KEYFRAME_DUPLICATE_TIME_WARNING,
  MEDIA_MOTION_KEYFRAME_INVALID_DURATION_MESSAGE,
  MEDIA_MOTION_KEYFRAME_SELECTION_REQUIRED_MESSAGE,
  normalizeSceneMediaMotion,
  resolveLocalMediaMotionKeyframeSelection,
  resolveMediaMotionAuthoringTarget,
  resolveRenderedMediaMotion,
  sampleMediaMotionKeyframeDefaults,
  setMediaMotionEnabledPreservingKeyframes,
  updateMediaMotionKeyframe,
} from "@/features/media-motion";
import {
  readMixedMediaSequenceItems,
  writeMixedMediaSequenceItems,
} from "@/features/mixed-media-scenes";
import type { FootieScene, SceneMedia, SceneMediaMotion } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

const CAPABLE = { keyframedVisualEffectsEnabled: true } as const;

const CAPABLE_ENV: Partial<ExportEnvironmentSnapshot> = {
  browserName: "chrome",
  supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true,
  supportsMediaRecorder: true,
  supportsRequestVideoFrameCallback: true,
  supportsWebAssembly: true,
  serverRendererAvailable: false,
  ffmpegRuntimePoisoned: false,
  estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
};

function baseMotion(): SceneMediaMotion {
  return normalizeSceneMediaMotion({
    version: 1,
    enabled: true,
    presetId: "slow-zoom-in",
    easing: "ease-in-out",
    intensity: 1,
    startTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    endTransform: { x: 40, y: -20, scale: 1.2, rotation: 5 },
  });
}

function imageMedia(url: string, motion: SceneMediaMotion): SceneMedia {
  return {
    type: "image",
    url,
    source: "upload",
    motion,
  };
}

function main(): void {
  console.log("\nmedia-motion-keyframe-commands\n");

  test("initialize creates two endpoint keyframes and enables motion", () => {
    const disabled = normalizeSceneMediaMotion({
      ...baseMotion(),
      enabled: false,
      presetId: "static",
    });
    const result = initializeMediaMotionKeyframes(disabled, 4000, CAPABLE);
    assert.equal(result.status, "ok");
    assert.equal(result.motion.enabled, true);
    assert.equal(result.motion.presetId, "custom");
    assert.equal(result.motion.keyframes?.length, 2);
    assert.equal(result.motion.keyframes![0]!.offsetMs, 0);
    assert.equal(result.motion.keyframes![1]!.offsetMs, 4000);
    assert.equal(result.motion.keyframes![0]!.x, 0);
    assert.equal(result.motion.keyframes![1]!.x, 40);
    assert.equal(result.selectedKeyframeIndex, 0);
  });

  test("capability-off and omitted flag refuse keyframe mutations without writing", () => {
    const motion = baseMotion();
    for (const options of [undefined, { keyframedVisualEffectsEnabled: false }]) {
      const init = initializeMediaMotionKeyframes(motion, 4000, options);
      assert.equal(init.status, "terminal");
      assert.equal(init.message, MEDIA_MOTION_KEYFRAME_CAPABILITY_OFF_MESSAGE);
      assert.equal(init.motion.keyframes, undefined);
      assert.deepEqual(init.motion.endTransform, motion.endTransform);

      const add = addMediaMotionKeyframe(motion, { offsetMs: 1000 }, 4000, options);
      assert.equal(add.status, "terminal");
      assert.equal(add.motion.keyframes, undefined);

      const clear = clearMediaMotionKeyframes(
        initializeMediaMotionKeyframes(motion, 4000, CAPABLE).motion,
        options,
      );
      assert.equal(clear.status, "terminal");
      assert.ok(clear.motion.keyframes?.length === 2);
    }
  });

  test("selection-required refuse never writes ignored scene.media keyframes", () => {
    const motion = baseMotion();
    const result = initializeMediaMotionKeyframes(motion, 4000, {
      keyframedVisualEffectsEnabled: true,
      requiresMediaItemSelection: true,
    });
    assert.equal(result.status, "terminal");
    assert.equal(result.message, MEDIA_MOTION_KEYFRAME_SELECTION_REQUIRED_MESSAGE);
    assert.equal(result.motion.keyframes, undefined);
  });

  test("authoring target unifies mediaItemId and duration for display/commands", () => {
    const needs = resolveMediaMotionAuthoringTarget({
      keyframedVisualEffectsEnabled: true,
      requiresMediaItemSelection: true,
      mediaItemId: null,
      mediaWindowDurationMs: 3500,
    });
    assert.equal(needs.status, "needs_selection");
    assert.equal(needs.mediaItemId, null);
    assert.equal(needs.mediaWindowDurationMs, 3500);

    const ready = resolveMediaMotionAuthoringTarget({
      keyframedVisualEffectsEnabled: true,
      requiresMediaItemSelection: false,
      mediaItemId: "item-b",
      mediaWindowDurationMs: 2500,
    });
    assert.equal(ready.status, "ready");
    assert.equal(ready.mediaItemId, "item-b");
    assert.equal(ready.mediaWindowDurationMs, 2500);

    const legacy = resolveMediaMotionAuthoringTarget({
      keyframedVisualEffectsEnabled: false,
      requiresMediaItemSelection: true,
      mediaItemId: null,
      mediaWindowDurationMs: 4000,
    });
    assert.equal(legacy.status, "legacy_scene_media");
  });

  test("add samples current motion to avoid a visual jump", () => {
    const motion = initializeMediaMotionKeyframes(baseMotion(), 4000, CAPABLE).motion;
    const sample = sampleMediaMotionKeyframeDefaults(motion, 2000, 4000);
    const result = addMediaMotionKeyframe(motion, { offsetMs: 2000 }, 4000, CAPABLE);
    assert.ok(result.status === "ok" || result.status === "recoverable");
    assert.equal(result.motion.keyframes?.length, 3);
    const added = result.motion.keyframes!.find((frame) => frame.offsetMs === 2000)!;
    assert.equal(added.x, sample.x);
    assert.equal(added.y, sample.y);
    assert.equal(added.scale, sample.scale);
  });

  test("time edits clamp to the item window", () => {
    const motion = initializeMediaMotionKeyframes(baseMotion(), 2000, CAPABLE).motion;
    const result = updateMediaMotionKeyframe(
      motion,
      1,
      { offsetMs: 9000 },
      2000,
      CAPABLE,
    );
    assert.equal(result.motion.keyframes![1]!.offsetMs, 2000);
    assert.ok(result.warnings.some((warning) => /adjusted|duration/i.test(warning)));
  });

  test("duplicate-time resolution keeps last-write-wins selection", () => {
    const motion = initializeMediaMotionKeyframes(baseMotion(), 4000, CAPABLE).motion;
    const result = addMediaMotionKeyframe(
      motion,
      {
        offsetMs: 0,
        sample: { x: 12, y: 0, scale: 1.05, rotation: 0, opacity: 1, easing: "linear" },
      },
      4000,
      CAPABLE,
    );
    assert.ok(result.warnings.includes(MEDIA_MOTION_KEYFRAME_DUPLICATE_TIME_WARNING));
    assert.equal(result.motion.keyframes?.length, 2);
    assert.equal(result.motion.keyframes![0]!.x, 12);
    assert.equal(result.selectedKeyframeIndex, 0);
  });

  test("local selection retains semantic offset or nearest temporal survivor", () => {
    const frames = initializeMediaMotionKeyframes(baseMotion(), 4000, CAPABLE).motion
      .keyframes!;
    const mid = addMediaMotionKeyframe(
      { ...baseMotion(), keyframes: frames },
      { offsetMs: 2000 },
      4000,
      CAPABLE,
    ).motion.keyframes!;
    assert.equal(
      resolveLocalMediaMotionKeyframeSelection({
        keyframes: mid,
        preferredOffsetMs: 2000,
      }),
      1,
    );
    const afterDelete = mid.filter((frame) => frame.offsetMs !== 2000);
    assert.equal(
      resolveLocalMediaMotionKeyframeSelection({
        keyframes: afterDelete,
        preferredOffsetMs: 2000,
      }),
      findNearestByHand(afterDelete, 2000),
    );

    const reordered = updateMediaMotionKeyframe(
      { ...baseMotion(), keyframes: mid },
      0,
      { offsetMs: 3000 },
      4000,
      CAPABLE,
    );
    assert.equal(reordered.selectedKeyframeIndex, reordered.motion.keyframes!.findIndex(
      (frame) => frame.offsetMs === 3000,
    ));
  });

  test("delete below two surfaces recoverable legacy fallback warning", () => {
    const motion = initializeMediaMotionKeyframes(baseMotion(), 4000, CAPABLE).motion;
    const result = deleteMediaMotionKeyframe(motion, 1, 4000, CAPABLE);
    assert.equal(result.motion.keyframes?.length, 1);
    assert.ok(result.warnings.includes(MEDIA_MOTION_KEYFRAME_BELOW_TWO_WARNING));
    const rendered = resolveRenderedMediaMotion({
      motion: result.motion,
      baseTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
      itemElapsedMs: 1000,
      mediaWindowDurationMs: 4000,
      keyframedVisualEffectsEnabled: true,
    });
    assert.equal(rendered.authority, "preset");
  });

  test("clear removes only keyframes and keeps legacy motion", () => {
    const motion = initializeMediaMotionKeyframes(baseMotion(), 4000, CAPABLE).motion;
    const result = clearMediaMotionKeyframes(motion, CAPABLE);
    assert.equal(result.motion.keyframes, undefined);
    assert.equal(result.motion.presetId, motion.presetId);
    assert.deepEqual(result.motion.endTransform, motion.endTransform);
  });

  test("zero duration refuses creation without mutation", () => {
    const motion = baseMotion();
    const result = initializeMediaMotionKeyframes(motion, 0, CAPABLE);
    assert.equal(result.status, "terminal");
    assert.equal(result.message, MEDIA_MOTION_KEYFRAME_INVALID_DURATION_MESSAGE);
    assert.equal(result.motion.keyframes, undefined);
    assert.deepEqual(result.motion.startTransform, motion.startTransform);
  });

  test("non-finite transform patches never persist NaN or Infinity", () => {
    const motion = initializeMediaMotionKeyframes(baseMotion(), 4000, CAPABLE).motion;
    const result = updateMediaMotionKeyframe(
      motion,
      0,
      { x: Number.NaN, y: Number.POSITIVE_INFINITY, scale: -1, opacity: 2 },
      4000,
      CAPABLE,
    );
    const frame = result.motion.keyframes![0]!;
    assert.ok(Number.isFinite(frame.x));
    assert.ok(Number.isFinite(frame.y));
    assert.ok(Number.isFinite(frame.scale));
    assert.ok(Number.isFinite(frame.opacity));
    assert.ok(frame.scale >= 0.5 && frame.scale <= 3);
    assert.ok(frame.opacity >= 0 && frame.opacity <= 1);
  });

  test("disabled motion retains keyframe metadata but renders identity/legacy", () => {
    const keyed = initializeMediaMotionKeyframes(baseMotion(), 4000, CAPABLE).motion;
    const disabled = setMediaMotionEnabledPreservingKeyframes(keyed, false);
    assert.equal(disabled.motion.enabled, false);
    assert.equal(disabled.motion.keyframes?.length, 2);
    const scene = {
      media: imageMedia("https://example.com/a.jpg", disabled.motion),
    };
    const patched = buildMediaMotionPatch(scene, {
      enabled: false,
      presetId: "static",
      keyframes: disabled.motion.keyframes,
    });
    assert.ok(patched?.motion.keyframes?.length === 2);

    const rendered = resolveRenderedMediaMotion({
      motion: disabled.motion,
      baseTransform: { x: 10, y: 0, scale: 1, rotation: 0 },
      itemElapsedMs: 2000,
      mediaWindowDurationMs: 4000,
      keyframedVisualEffectsEnabled: true,
    });
    assert.equal(rendered.authority, "preset");
    assert.equal(rendered.active, false);
  });

  test("capability-off export stays v4 while edits produce v5 when enabled", () => {
    const keyed = initializeMediaMotionKeyframes(baseMotion(), 4000, CAPABLE).motion;
    const story = syncFootieScript({
      title: "Keyframe UI",
      narration: "n",
      totalDuration: 4,
      scenes: [
        {
          id: "s1",
          start: 0,
          end: 4,
          duration: 4,
          startMs: 0,
          endMs: 4000,
          durationMs: 4000,
          subtitle: "n",
          narration: "n",
          media: imageMedia("https://example.com/a.jpg", keyed),
          image: {
            url: "https://example.com/a.jpg",
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            fitMode: "fill",
          },
        },
      ],
    });
    const off = buildExportManifest({
      story,
      environment: CAPABLE_ENV,
      audioMode: "silent",
      keyframedVisualEffectsEnabled: false,
    });
    assert.equal(off.version, 4);
    const on = buildExportManifest({
      story,
      environment: CAPABLE_ENV,
      audioMode: "silent",
      keyframedVisualEffectsEnabled: true,
    });
    assert.equal(on.version, 5);
  });

  test("mixed-media visualSequence dual-write updates only the selected item", () => {
    const keyed = initializeMediaMotionKeyframes(baseMotion(), 2000, CAPABLE).motion;
    const scene: FootieScene = {
      id: "scene-1",
      start: 0,
      end: 4,
      duration: 4,
      startMs: 0,
      endMs: 4000,
      durationMs: 4000,
      subtitle: "n",
      narration: "n",
      media: imageMedia("https://example.com/first.jpg", baseMotion()),
      visualSequence: {
        version: 1,
        items: [
          {
            id: "item-a",
            startOffsetMs: 0,
            durationMs: 2000,
            media: imageMedia("https://example.com/a.jpg", baseMotion()),
          },
          {
            id: "item-b",
            startOffsetMs: 2000,
            durationMs: 2000,
            media: imageMedia("https://example.com/b.jpg", baseMotion()),
          },
        ],
      },
    };
    const sequence = readMixedMediaSequenceItems(scene);
    assert.equal(sequence.length, 2);
    const nextItems = sequence.map((item) =>
      item.id === "item-b" ? { ...item, media: { ...item.media, motion: keyed } } : item,
    );
    const written = writeMixedMediaSequenceItems(scene, nextItems, {
      mixedMediaScenesEnabled: true,
    });
    const after = readMixedMediaSequenceItems(written.scene);
    assert.equal(after[0]!.media.url, "https://example.com/a.jpg");
    assert.equal(after[0]!.media.motion?.keyframes, undefined);
    assert.equal(after[1]!.media.url, "https://example.com/b.jpg");
    assert.equal(after[1]!.media.motion?.keyframes?.length, 2);
    assert.equal(after[0]!.id, "item-a");
    assert.equal(after[1]!.id, "item-b");
  });

  test("mixed-media item inspector dual-writes visualSequence authority", () => {
    const itemInspector = readSrc(
      "src/features/editor/components/media/SceneMediaItemInspector.tsx",
    );
    assert.match(itemInspector, /writeMixedMediaSequenceItems/);
    assert.match(itemInspector, /readMixedMediaSequenceItems/);
    assert.match(itemInspector, /mediaWindowDurationMs=\{itemDurationMs\}/);
    assert.match(itemInspector, /mediaItemId=\{mediaItemId\}/);
    assert.match(itemInspector, /liveProjected/);
    assert.doesNotMatch(
      readSrc("src/features/media-motion/editor/media-motion-keyframe.commands.ts"),
      /visualSequence|mediaTimeline|narration|backgroundMusic/,
    );
  });

  test("non-keyframe motion enable/disable remains available without keyframe capability", () => {
    const keyed = initializeMediaMotionKeyframes(baseMotion(), 4000, CAPABLE).motion;
    const disabled = setMediaMotionEnabledPreservingKeyframes(keyed, false);
    assert.equal(disabled.status, "ok");
    assert.equal(disabled.motion.enabled, false);
    assert.equal(disabled.motion.keyframes?.length, 2);
  });

  test("commands never invent second capability fetch or focus side effects", () => {
    const commands = readSrc(
      "src/features/media-motion/editor/media-motion-keyframe.commands.ts",
    );
    assert.doesNotMatch(commands, /fetch\(|useKeyframedVisualEffectsEnabled|focus\(/);
    const panel = readSrc(
      "src/features/editor/components/media/MediaMotionInspectorPanel.tsx",
    );
    assert.match(panel, /useVisualRetentionCapabilitiesReady/);
    assert.match(panel, /useKeyframedVisualEffectsEnabled/);
    assert.match(panel, /data-media-motion-panel="blocked"/);
    assert.match(panel, /resolveMediaMotionAuthoringTarget/);
    assert.doesNotMatch(panel, /fetch\(/);
  });

  console.log(`\n${passed} passed\n`);
}

function findNearestByHand(
  frames: readonly { offsetMs: number }[],
  offsetMs: number,
): number {
  let nearest = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < frames.length; index += 1) {
    const distance = Math.abs(frames[index]!.offsetMs - offsetMs);
    if (distance < best) {
      best = distance;
      nearest = index;
    }
  }
  return nearest;
}

main();
