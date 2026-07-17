/**
 * Sprint 8A / 8A.1 — Scene media timeline domain foundation + hardening.
 * Run: npm run test:scene-media-timeline-domain
 */
import assert from "node:assert/strict";

import { classifyStoryPatch } from "@/features/editor/story-patches";
import {
  buildExportManifest,
  buildExportManifestFingerprint,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import {
  applyBuiltMediaTimelineToScene,
  applyNormalizedMediaTimelineToScene,
  buildLegacyVirtualMediaItemId,
  buildSceneMediaTimeline,
  cloneSceneMediaTimeline,
  isSceneMediaTimelineBuildError,
  normalizeSceneMediaTimeline,
  projectSceneMediaTimeline,
  resolveActiveSceneMediaAtElapsed,
  resolveProjectedActiveSceneMedia,
  resolveSceneMediaWindows,
  sceneMediaTimelineSignature,
  SceneMediaTimelineBuildError,
} from "@/features/scene-media-timeline";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { getSceneMedia } from "@/features/story/utils/scene.utils";
import { duplicateScene } from "@/features/story/utils/timeline.utils";
import { buildMasterTimeline } from "@/features/timeline-intelligence/build-master-timeline";
import { applySceneUpdate, syncFootieScript } from "@/lib/utils/voiceover";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function baseScene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 5,
    duration: 5,
    startMs: 0,
    endMs: 5000,
    durationMs: 5000,
    subtitle: "Scene caption",
    ...overrides,
  };
}

function imageMedia(url: string, extras: Partial<SceneMedia> = {}): SceneMedia {
  return {
    type: "image",
    url,
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    ...extras,
  };
}

function videoMedia(url: string): SceneMedia {
  return {
    type: "video",
    url,
    source: "upload",
    durationMs: 8000,
    trimStartMs: 500,
    trimEndMs: 4500,
    muted: true,
    fitMode: "cover",
    transform: { x: 2, y: -1, scale: 1.1, rotation: 0 },
    motion: { version: 1, enabled: true, presetId: "slow-drift", intensity: 1 },
  };
}

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

console.log("\nscene-media-timeline-domain (Sprint 8A)\n");

test("1. legacy image becomes one virtual full-scene item", () => {
  const scene = baseScene({
    image: {
      url: "https://example.com/legacy.jpg",
      scale: 1.2,
      x: 10,
      y: -5,
      fitMode: "fill",
    },
  });
  const projected = projectSceneMediaTimeline(scene);
  assert.equal(projected.fromStoredTimeline, false);
  assert.equal(projected.items.length, 1);
  assert.equal(projected.items[0]?.id, buildLegacyVirtualMediaItemId("scene-1"));
  assert.equal(projected.items[0]?.media.type, "image");
  assert.equal(projected.items[0]?.media.url, "https://example.com/legacy.jpg");
  const windows = resolveSceneMediaWindows({
    items: projected.items,
    sceneDurationMs: 5000,
    provenance: "legacy_virtual",
  });
  assert.equal(windows[0]?.startMs, 0);
  assert.equal(windows[0]?.endMs, 5000);
});

test("2. legacy video becomes one virtual full-scene item", () => {
  const scene = baseScene({ media: videoMedia("blob:video-1") });
  const projected = projectSceneMediaTimeline(scene);
  assert.equal(projected.items.length, 1);
  assert.equal(projected.items[0]?.media.type, "video");
  assert.equal(projected.items[0]?.media.trimStartMs, 500);
  assert.equal(projected.fromStoredTimeline, false);
});

test("3. empty legacy scene resolves safely", () => {
  const scene = baseScene();
  const projected = projectSceneMediaTimeline(scene);
  assert.deepEqual(projected.items, []);
  const active = resolveProjectedActiveSceneMedia(scene, 100);
  assert.equal(active.active, null);
  assert.equal(active.itemElapsedMs, 0);
});

test("4. one stored item occupies the full scene", () => {
  const built = buildSceneMediaTimeline({
    items: [{ id: "item-a", media: imageMedia("https://example.com/a.jpg"), durationWeight: 3 }],
  });
  const scene = baseScene({
    media: built.compatibilityMedia,
    mediaTimeline: built.mediaTimeline,
  });
  const windows = resolveSceneMediaWindows({
    items: scene.mediaTimeline!.items,
    sceneDurationMs: 5000,
  });
  assert.equal(windows.length, 1);
  assert.equal(windows[0]?.startMs, 0);
  assert.equal(windows[0]?.endMs, 5000);
  assert.equal(windows[0]?.durationMs, 5000);
});

test("5. equal-weight multi-image sequence", () => {
  const windows = resolveSceneMediaWindows({
    items: [
      { id: "a", media: imageMedia("a"), durationWeight: 1 },
      { id: "b", media: imageMedia("b"), durationWeight: 1 },
      { id: "c", media: imageMedia("c"), durationWeight: 1 },
    ],
    sceneDurationMs: 3000,
  });
  assert.equal(windows.length, 3);
  assert.equal(windows[0]?.startMs, 0);
  assert.equal(windows[0]?.endMs, 1000);
  assert.equal(windows[1]?.startMs, 1000);
  assert.equal(windows[1]?.endMs, 2000);
  assert.equal(windows[2]?.startMs, 2000);
  assert.equal(windows[2]?.endMs, 3000);
  assert.equal(windows[2]?.endMs, 3000);
});

test("6. unequal weights", () => {
  const windows = resolveSceneMediaWindows({
    items: [
      { id: "a", media: imageMedia("a"), durationWeight: 1 },
      { id: "b", media: imageMedia("b"), durationWeight: 3 },
    ],
    sceneDurationMs: 4000,
  });
  assert.equal(windows[0]?.durationMs, 1000);
  assert.equal(windows[1]?.durationMs, 3000);
  assert.equal(windows[1]?.endMs, 4000);
});

test("7. odd millisecond duration rounding", () => {
  const windows = resolveSceneMediaWindows({
    items: [
      { id: "a", media: imageMedia("a"), durationWeight: 1 },
      { id: "b", media: imageMedia("b"), durationWeight: 1 },
      { id: "c", media: imageMedia("c"), durationWeight: 1 },
    ],
    sceneDurationMs: 1000,
  });
  const total = windows.reduce((sum, w) => sum + w.durationMs, 0);
  assert.equal(total, 1000);
  assert.equal(windows[0]?.startMs, 0);
  assert.equal(windows[windows.length - 1]?.endMs, 1000);
  for (let i = 1; i < windows.length; i += 1) {
    assert.equal(windows[i]?.startMs, windows[i - 1]?.endMs);
  }
});

test("8. internal boundary selects the following item", () => {
  const active = resolveActiveSceneMediaAtElapsed({
    items: [
      { id: "a", media: imageMedia("a"), durationWeight: 1 },
      { id: "b", media: imageMedia("b"), durationWeight: 1 },
    ],
    sceneDurationMs: 2000,
    sceneElapsedMs: 1000,
  });
  assert.equal(active.active?.itemId, "b");
  assert.equal(active.itemElapsedMs, 0);
});

test("9. negative and overflow elapsed times", () => {
  const items = [
    { id: "a", media: imageMedia("a"), durationWeight: 1 },
    { id: "b", media: imageMedia("b"), durationWeight: 1 },
  ];
  const neg = resolveActiveSceneMediaAtElapsed({
    items,
    sceneDurationMs: 2000,
    sceneElapsedMs: -50,
  });
  assert.equal(neg.active?.itemId, "a");
  assert.equal(neg.itemElapsedMs, 0);

  const over = resolveActiveSceneMediaAtElapsed({
    items,
    sceneDurationMs: 2000,
    sceneElapsedMs: 2500,
  });
  assert.equal(over.active?.itemId, "b");
  assert.equal(over.itemElapsedMs, 1000);
});

test("10. zero scene duration", () => {
  const windows = resolveSceneMediaWindows({
    items: [
      { id: "a", media: imageMedia("a"), durationWeight: 1 },
      { id: "b", media: imageMedia("b"), durationWeight: 1 },
    ],
    sceneDurationMs: 0,
  });
  assert.equal(windows.length, 2);
  assert.equal(windows[0]?.durationMs, 0);
  assert.equal(windows[1]?.endMs, 0);
  const active = resolveActiveSceneMediaAtElapsed({
    items: windows.map((w) => ({
      id: w.itemId,
      media: w.media,
      durationWeight: w.durationWeight,
    })),
    sceneDurationMs: 0,
    sceneElapsedMs: 0,
  });
  assert.equal(active.active?.itemId, "b");
  assert.equal(active.itemElapsedMs, 0);
});

test("11. invalid/non-positive weights", () => {
  const { timeline, diagnostics } = normalizeSceneMediaTimeline({
    version: 1,
    items: [
      { id: "bad-zero", media: imageMedia("a"), durationWeight: 0 },
      { id: "bad-neg", media: imageMedia("b"), durationWeight: -1 },
      { id: "good", media: imageMedia("c"), durationWeight: 2 },
    ],
  });
  assert.equal(timeline?.items.length, 1);
  assert.equal(timeline?.items[0]?.id, "good");
  assert.ok(diagnostics.some((d) => d.code === "invalid_duration_weight"));
});

test("12. duplicate and malformed IDs", () => {
  const { timeline, diagnostics } = normalizeSceneMediaTimeline({
    version: 1,
    items: [
      { id: "dup", media: imageMedia("a"), durationWeight: 1 },
      { id: "dup", media: imageMedia("b"), durationWeight: 1 },
      { id: "  ", media: imageMedia("c"), durationWeight: 1 },
      { id: "ok", media: imageMedia("d"), durationWeight: 1 },
    ],
  });
  assert.deepEqual(
    timeline?.items.map((i) => i.id),
    ["dup", "ok"],
  );
  assert.ok(diagnostics.some((d) => d.code === "duplicate_item_id"));
  assert.ok(diagnostics.some((d) => d.code === "empty_item_id"));
});

test("13. invalid media entries", () => {
  const { timeline, diagnostics } = normalizeSceneMediaTimeline({
    version: 1,
    items: [
      { id: "bad", media: { type: "nope" }, durationWeight: 1 },
      { id: "good", media: imageMedia("ok"), durationWeight: 1 },
    ],
  });
  assert.equal(timeline?.items.length, 1);
  assert.equal(timeline?.items[0]?.id, "good");
  assert.ok(diagnostics.some((d) => d.code === "invalid_media"));
});

test("14. malformed stored timeline with legacy fallback", () => {
  const scene = baseScene({
    media: imageMedia("https://example.com/keep.jpg"),
    mediaTimeline: {
      version: 1,
      items: [{ id: "", media: { type: "image" }, durationWeight: 0 }],
    } as FootieScene["mediaTimeline"],
  });
  const projected = projectSceneMediaTimeline(scene);
  assert.equal(projected.fromStoredTimeline, false);
  assert.equal(projected.items.length, 1);
  assert.equal(projected.items[0]?.media.url, "https://example.com/keep.jpg");
  assert.equal(getSceneMedia(scene)?.url, "https://example.com/keep.jpg");
});

test("15. deterministic repeated resolution", () => {
  const input = {
    items: [
      { id: "a", media: imageMedia("a"), durationWeight: 1 },
      { id: "b", media: imageMedia("b"), durationWeight: 2 },
      { id: "c", media: imageMedia("c"), durationWeight: 1 },
    ],
    sceneDurationMs: 1001,
    sceneElapsedMs: 500,
  };
  const a = resolveActiveSceneMediaAtElapsed(input);
  const b = resolveActiveSceneMediaAtElapsed(input);
  assert.deepEqual(
    a.windows.map((w) => [w.itemId, w.startMs, w.endMs, w.durationMs]),
    b.windows.map((w) => [w.itemId, w.startMs, w.endMs, w.durationMs]),
  );
  assert.equal(a.active?.itemId, b.active?.itemId);
  assert.equal(a.itemElapsedMs, b.itemElapsedMs);
});

test("16. input objects are not mutated", () => {
  const scene = baseScene({
    media: imageMedia("https://example.com/a.jpg"),
    mediaTimeline: {
      version: 1,
      items: [
        {
          id: "item-1",
          media: imageMedia("https://example.com/a.jpg"),
          durationWeight: 1,
        },
      ],
    },
  });
  const snapshot = JSON.stringify(scene);
  projectSceneMediaTimeline(scene);
  resolveProjectedActiveSceneMedia(scene, 10);
  applyNormalizedMediaTimelineToScene(scene);
  assert.equal(JSON.stringify(scene), snapshot);
});

test("17. JSON serialization/reload parity", () => {
  const built = buildSceneMediaTimeline({
    items: [
      {
        id: "item-1",
        media: {
          ...videoMedia("blob:v1"),
          posterUrl: "https://example.com/poster.jpg",
          posterTimeMs: 120,
        },
        durationWeight: 2,
      },
      {
        id: "item-2",
        media: imageMedia("https://example.com/b.jpg", {
          motion: { version: 1, enabled: true, presetId: "zoom-in", intensity: 0.8 },
        }),
        durationWeight: 1,
      },
    ],
  });
  const scene = baseScene({
    media: built.compatibilityMedia,
    mediaTimeline: built.mediaTimeline,
  });
  const reloaded = JSON.parse(JSON.stringify(scene)) as FootieScene;
  const { timeline } = normalizeSceneMediaTimeline(reloaded.mediaTimeline);
  assert.equal(timeline?.items.length, 2);
  assert.equal(timeline?.items[0]?.id, "item-1");
  assert.equal(timeline?.items[0]?.media.trimEndMs, 4500);
  assert.equal(timeline?.items[0]?.media.motion?.presetId, "slow-drift");
  assert.equal(timeline?.items[1]?.media.url, "https://example.com/b.jpg");
  assert.equal(timeline?.items[1]?.durationWeight, 1);
});

test("18. syncFootieScript preservation", () => {
  const built = buildSceneMediaTimeline({
    items: [
      { id: "keep-a", media: imageMedia("https://example.com/a.jpg"), durationWeight: 1 },
      { id: "keep-b", media: imageMedia("https://example.com/b.jpg"), durationWeight: 2 },
    ],
  });
  const script: FootieScript = {
    title: "Timeline preserve",
    narration: "Narration.",
    totalDuration: 5,
    scenes: [
      baseScene({
        media: built.compatibilityMedia,
        mediaTimeline: built.mediaTimeline,
      }),
    ],
  };
  const synced = syncFootieScript(script);
  assert.equal(synced.scenes[0]?.mediaTimeline?.items.length, 2);
  assert.equal(synced.scenes[0]?.mediaTimeline?.items[0]?.id, "keep-a");
  assert.equal(synced.scenes[0]?.mediaTimeline?.items[1]?.id, "keep-b");
  assert.equal(synced.scenes[0]?.mediaTimeline?.items[1]?.durationWeight, 2);
  assert.equal(synced.scenes[0]?.media?.url, "https://example.com/a.jpg");
});

test("19. applySceneUpdate preservation", () => {
  const built = buildSceneMediaTimeline({
    items: [
      { id: "u1", media: imageMedia("https://example.com/a.jpg"), durationWeight: 1 },
      { id: "u2", media: imageMedia("https://example.com/b.jpg"), durationWeight: 1 },
    ],
  });
  const prev = syncFootieScript({
    title: "Update preserve",
    narration: "Narration.",
    totalDuration: 5,
    scenes: [
      baseScene({
        media: built.compatibilityMedia,
        mediaTimeline: built.mediaTimeline,
      }),
    ],
  });
  const next = applySceneUpdate(prev, "scene-1", { subtitle: "Updated caption" });
  assert.equal(next.scenes[0]?.mediaTimeline?.items.length, 2);
  assert.equal(next.scenes[0]?.mediaTimeline?.items[1]?.id, "u2");
  assert.notEqual(next.scenes[0]?.mediaTimeline, prev.scenes[0]?.mediaTimeline);
  assert.notEqual(
    next.scenes[0]?.mediaTimeline?.items,
    prev.scenes[0]?.mediaTimeline?.items,
  );
});

test("20. scene duplication creates independent nested state", () => {
  const built = buildSceneMediaTimeline({
    items: [
      { id: "d1", media: imageMedia("https://example.com/a.jpg"), durationWeight: 1 },
      { id: "d2", media: videoMedia("blob:v-dup"), durationWeight: 1 },
    ],
  });
  const original = baseScene({
    media: built.compatibilityMedia,
    mediaTimeline: built.mediaTimeline,
  });
  const dup = duplicateScene(original);
  assert.notEqual(dup.id, original.id);
  assert.ok(dup.mediaTimeline);
  assert.notEqual(dup.mediaTimeline, original.mediaTimeline);
  assert.notEqual(dup.mediaTimeline?.items, original.mediaTimeline?.items);
  assert.notEqual(dup.mediaTimeline?.items[0], original.mediaTimeline?.items[0]);
  assert.notEqual(dup.mediaTimeline?.items[0]?.media, original.mediaTimeline?.items[0]?.media);
  assert.notEqual(dup.media, original.media);
  dup.mediaTimeline!.items[0]!.media.url = "https://example.com/mutated.jpg";
  assert.equal(original.mediaTimeline?.items[0]?.media.url, "https://example.com/a.jpg");
});

test("21. story patch classifier detects item/order/media changes", () => {
  const base = syncFootieScript({
    title: "Classifier",
    narration: "Narration.",
    totalDuration: 5,
    scenes: [
      applyBuiltMediaTimelineToScene(baseScene(), {
        items: [
          { id: "c1", media: imageMedia("https://example.com/a.jpg"), durationWeight: 1 },
          { id: "c2", media: imageMedia("https://example.com/b.jpg"), durationWeight: 1 },
        ],
      }),
    ],
  });

  const reordered = applySceneUpdate(base, "scene-1", {
    mediaTimeline: {
      version: 1,
      items: [
        { id: "c2", media: imageMedia("https://example.com/b.jpg"), durationWeight: 1 },
        { id: "c1", media: imageMedia("https://example.com/a.jpg"), durationWeight: 1 },
      ],
    },
  });
  const orderClass = classifyStoryPatch(base, reordered);
  assert.ok(orderClass.classes.includes("media"));
  assert.equal(orderClass.classes.includes("timing"), false);
  assert.equal(orderClass.classes.includes("spoken_text"), false);

  const weightChanged = applySceneUpdate(base, "scene-1", {
    mediaTimeline: {
      version: 1,
      items: [
        { id: "c1", media: imageMedia("https://example.com/a.jpg"), durationWeight: 2 },
        { id: "c2", media: imageMedia("https://example.com/b.jpg"), durationWeight: 1 },
      ],
    },
  });
  assert.ok(classifyStoryPatch(base, weightChanged).classes.includes("media"));

  const urlChanged = applySceneUpdate(base, "scene-1", {
    mediaTimeline: {
      version: 1,
      items: [
        { id: "c1", media: imageMedia("https://example.com/changed.jpg"), durationWeight: 1 },
        { id: "c2", media: imageMedia("https://example.com/b.jpg"), durationWeight: 1 },
      ],
    },
  });
  assert.ok(classifyStoryPatch(base, urlChanged).classes.includes("media"));
});

test("22. legacy scenes retain existing getSceneMedia behavior", () => {
  const legacyImage = baseScene({
    image: { url: "https://example.com/legacy.jpg", scale: 1, x: 0, y: 0 },
  });
  assert.equal(getSceneMedia(legacyImage)?.url, "https://example.com/legacy.jpg");
  assert.equal(getSceneMedia(legacyImage)?.source, "legacy");

  const mediaWins = baseScene({
    image: { url: "https://example.com/legacy.jpg", scale: 1, x: 0, y: 0 },
    media: imageMedia("https://example.com/media.jpg"),
  });
  assert.equal(getSceneMedia(mediaWins)?.url, "https://example.com/media.jpg");

  const withTimeline = applyBuiltMediaTimelineToScene(mediaWins, {
    items: [
      { id: "t1", media: imageMedia("https://example.com/first.jpg"), durationWeight: 1 },
      { id: "t2", media: imageMedia("https://example.com/second.jpg"), durationWeight: 1 },
    ],
  });
  // Compatibility projection keeps first item on scene.media; getSceneMedia unchanged.
  assert.equal(getSceneMedia(withTimeline)?.url, "https://example.com/first.jpg");
});

test("23. MasterTimeline and ExportManifest output remain unchanged for legacy scenes", () => {
  const story = syncFootieScript({
    title: "Authority unchanged",
    narration: "A short narration for the scene.",
    totalDuration: 5,
    scenes: [
      baseScene({
        image: {
          url: "https://example.com/authority.jpg",
          scale: 1,
          x: 0,
          y: 0,
          fitMode: "fit",
        },
      }),
    ],
  });

  const timelineA = buildMasterTimeline(story, { mode: "export" });
  const timelineB = buildMasterTimeline(story, { mode: "export" });
  assert.equal(timelineA.renderDurationMs, timelineB.renderDurationMs);
  assert.equal(timelineA.contentEndMs, timelineB.contentEndMs);
  assert.equal(timelineA.sceneDurationMs, timelineB.sceneDurationMs);
  assert.equal(timelineA.tracks.length, timelineB.tracks.length);

  const manifestA = buildExportManifest({ story, environment: CAPABLE_ENV });
  const manifestB = buildExportManifest({ story, environment: CAPABLE_ENV });
  assert.equal(buildExportManifestFingerprint(manifestA), buildExportManifestFingerprint(manifestB));

  // Adding a dormant stored timeline that mirrors compatibility media must not
  // change MasterTimeline authority or single-slot export media URL.
  const withDormantTimeline = syncFootieScript({
    ...story,
    scenes: [
      applyBuiltMediaTimelineToScene(story.scenes[0]!, {
        items: [
          {
            id: "only",
            media: getSceneMedia(story.scenes[0]!)!,
            durationWeight: 1,
          },
        ],
      }),
    ],
  });
  const timelineDormant = buildMasterTimeline(withDormantTimeline, { mode: "export" });
  assert.equal(timelineDormant.renderDurationMs, timelineA.renderDurationMs);
  assert.equal(timelineDormant.contentEndMs, timelineA.contentEndMs);

  const manifestDormant = buildExportManifest({
    story: withDormantTimeline,
    environment: CAPABLE_ENV,
  });
  assert.equal(manifestDormant.scenes[0]?.media.type, manifestA.scenes[0]?.media.type);
  const urlA =
    manifestA.scenes[0]?.media.type === "image" || manifestA.scenes[0]?.media.type === "video"
      ? manifestA.scenes[0]?.media.url
      : undefined;
  const urlD =
    manifestDormant.scenes[0]?.media.type === "image" ||
    manifestDormant.scenes[0]?.media.type === "video"
      ? manifestDormant.scenes[0]?.media.url
      : undefined;
  assert.equal(urlD, urlA);
});

test("legacy drafts do not gain mediaTimeline on sync", () => {
  const synced = syncFootieScript({
    title: "Legacy",
    narration: "Narration.",
    totalDuration: 5,
    scenes: [
      baseScene({
        image: { url: "https://example.com/legacy.jpg", scale: 1, x: 0, y: 0 },
      }),
    ],
  });
  assert.equal(synced.scenes[0]?.mediaTimeline, undefined);
});

test("cloneSceneMediaTimeline is independent", () => {
  const built = buildSceneMediaTimeline({
    items: [{ id: "x", media: imageMedia("https://example.com/x.jpg"), durationWeight: 1 }],
  });
  const clone = cloneSceneMediaTimeline(built.mediaTimeline);
  assert.notEqual(clone, built.mediaTimeline);
  clone.items[0]!.durationWeight = 99;
  assert.equal(built.mediaTimeline.items[0]?.durationWeight, 1);
});

test("8A.1 atomic builder rejects mixed valid/invalid inputs", () => {
  const cases: Array<{
    label: string;
    items: Parameters<typeof buildSceneMediaTimeline>[0]["items"];
    code: string;
  }> = [
    {
      label: "empty id",
      items: [
        { id: "good", media: imageMedia("https://example.com/a.jpg") },
        { id: "  ", media: imageMedia("https://example.com/b.jpg") },
      ],
      code: "empty_item_id",
    },
    {
      label: "duplicate id",
      items: [
        { id: "dup", media: imageMedia("https://example.com/a.jpg") },
        { id: "dup", media: imageMedia("https://example.com/b.jpg") },
      ],
      code: "duplicate_item_id",
    },
    {
      label: "invalid media",
      items: [
        { id: "good", media: imageMedia("https://example.com/a.jpg") },
        { id: "bad", media: { type: "nope" } as unknown as SceneMedia },
      ],
      code: "invalid_media",
    },
    {
      label: "explicit zero weight",
      items: [
        { id: "good", media: imageMedia("https://example.com/a.jpg") },
        { id: "bad", media: imageMedia("https://example.com/b.jpg"), durationWeight: 0 },
      ],
      code: "invalid_duration_weight",
    },
    {
      label: "explicit negative weight",
      items: [
        { id: "good", media: imageMedia("https://example.com/a.jpg") },
        { id: "bad", media: imageMedia("https://example.com/b.jpg"), durationWeight: -2 },
      ],
      code: "invalid_duration_weight",
    },
    {
      label: "explicit NaN weight",
      items: [
        { id: "good", media: imageMedia("https://example.com/a.jpg") },
        { id: "bad", media: imageMedia("https://example.com/b.jpg"), durationWeight: Number.NaN },
      ],
      code: "invalid_duration_weight",
    },
  ];

  for (const entry of cases) {
    assert.throws(
      () => buildSceneMediaTimeline({ items: entry.items }),
      (error: unknown) => {
        assert.ok(isSceneMediaTimelineBuildError(error), entry.label);
        assert.ok(
          error.diagnostics.some((d) => d.code === entry.code),
          `${entry.label}: expected ${entry.code}`,
        );
        assert.doesNotMatch(error.message, /https?:\/\//);
        assert.equal(
          error.diagnostics.some((d) => JSON.stringify(d).includes("https://")),
          false,
        );
        return true;
      },
    );
  }
});

test("8A.1 undefined weight defaults to 1; explicit invalid does not", () => {
  const built = buildSceneMediaTimeline({
    items: [{ id: "default-weight", media: imageMedia("https://example.com/a.jpg") }],
  });
  assert.equal(built.mediaTimeline.items[0]?.durationWeight, 1);

  assert.throws(
    () =>
      buildSceneMediaTimeline({
        items: [
          {
            id: "explicit-bad",
            media: imageMedia("https://example.com/a.jpg"),
            durationWeight: 0,
          },
        ],
      }),
    SceneMediaTimelineBuildError,
  );
});

test("8A.1 applyBuiltMediaTimelineToScene leaves scene untouched on failure", () => {
  const scene = baseScene({
    media: imageMedia("https://example.com/keep.jpg"),
  });
  const snapshot = JSON.stringify(scene);
  assert.throws(
    () =>
      applyBuiltMediaTimelineToScene(scene, {
        items: [
          { id: "a", media: imageMedia("https://example.com/a.jpg") },
          { id: "a", media: imageMedia("https://example.com/b.jpg") },
        ],
      }),
    SceneMediaTimelineBuildError,
  );
  assert.equal(JSON.stringify(scene), snapshot);
  assert.equal(scene.mediaTimeline, undefined);
});

test("8A.1 timeline absence is normal — no missing_timeline diagnostics", () => {
  for (const value of [undefined, null]) {
    const { timeline, diagnostics } = normalizeSceneMediaTimeline(value);
    assert.equal(timeline, undefined);
    assert.deepEqual(diagnostics, []);
  }

  const legacy = baseScene({
    image: { url: "https://example.com/legacy.jpg", scale: 1, x: 0, y: 0 },
  });
  const projected = projectSceneMediaTimeline(legacy);
  assert.equal(projected.fromStoredTimeline, false);
  assert.equal(projected.items.length, 1);
  assert.equal(
    projected.diagnostics.some((d) => (d.code as string) === "missing_timeline"),
    false,
  );
  assert.deepEqual(projected.diagnostics, []);
});

test("8A.1 signature detects second-item transform/framing/motion/poster/source", () => {
  const baseItems = [
    {
      id: "i1",
      media: imageMedia("https://example.com/a.jpg"),
      durationWeight: 1,
    },
    {
      id: "i2",
      media: imageMedia("https://example.com/b.jpg", {
        source: "upload",
        mimeType: "image/jpeg",
        fitMode: "cover",
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        motion: { version: 1, enabled: true, presetId: "slow-drift", intensity: 1 },
        posterUrl: "https://example.com/poster.jpg",
        posterTimeMs: 100,
      }),
      durationWeight: 1,
    },
  ] as const;

  const base = syncFootieScript({
    title: "Signature",
    narration: "Narration stays the same.",
    totalDuration: 5,
    scenes: [applyBuiltMediaTimelineToScene(baseScene(), { items: [...baseItems] })],
  });

  const mutations: Array<{
    label: string;
    patch: FootieScene["mediaTimeline"];
  }> = [
    {
      label: "transform",
      patch: {
        version: 1,
        items: [
          baseItems[0],
          {
            ...baseItems[1],
            media: {
              ...baseItems[1].media,
              transform: { x: 12, y: -4, scale: 1.25, rotation: 3 },
            },
          },
        ],
      },
    },
    {
      label: "fitMode framing",
      patch: {
        version: 1,
        items: [
          baseItems[0],
          {
            ...baseItems[1],
            media: { ...baseItems[1].media, fitMode: "contain" },
          },
        ],
      },
    },
    {
      label: "motion",
      patch: {
        version: 1,
        items: [
          baseItems[0],
          {
            ...baseItems[1],
            media: {
              ...baseItems[1].media,
              motion: { version: 1, enabled: true, presetId: "zoom-in", intensity: 0.5 },
            },
          },
        ],
      },
    },
    {
      label: "posterTime",
      patch: {
        version: 1,
        items: [
          baseItems[0],
          {
            ...baseItems[1],
            media: { ...baseItems[1].media, posterTimeMs: 250 },
          },
        ],
      },
    },
    {
      label: "source/mime",
      patch: {
        version: 1,
        items: [
          baseItems[0],
          {
            ...baseItems[1],
            media: {
              ...baseItems[1].media,
              source: "asset",
              mimeType: "image/png",
            },
          },
        ],
      },
    },
  ];

  for (const mutation of mutations) {
    const next = applySceneUpdate(base, "scene-1", { mediaTimeline: mutation.patch });
    assert.notEqual(
      sceneMediaTimelineSignature(base.scenes[0]?.mediaTimeline),
      sceneMediaTimelineSignature(next.scenes[0]?.mediaTimeline),
      mutation.label,
    );
    const classification = classifyStoryPatch(base, next);
    assert.ok(classification.classes.includes("media"), `${mutation.label}: media`);
    assert.equal(classification.classes.includes("timing"), false, `${mutation.label}: timing`);
    assert.equal(
      classification.classes.includes("spoken_text"),
      false,
      `${mutation.label}: spoken`,
    );
  }
});

test("8A.1 delimiter-containing IDs/URLs cannot collide in signatures", () => {
  const a = sceneMediaTimelineSignature({
    version: 1,
    items: [
      {
        id: "a|b:c",
        media: imageMedia("https://example.com/x|y:z.jpg"),
        durationWeight: 1,
      },
    ],
  });
  const b = sceneMediaTimelineSignature({
    version: 1,
    items: [
      {
        id: "a",
        media: imageMedia("https://example.com/b:c|https://example.com/x|y:z.jpg"),
        durationWeight: 1,
      },
    ],
  });
  assert.notEqual(a, b);
});

test("8A.1 add/remove/reorder remain detected as media", () => {
  const base = syncFootieScript({
    title: "Order",
    narration: "Narration.",
    totalDuration: 5,
    scenes: [
      applyBuiltMediaTimelineToScene(baseScene(), {
        items: [
          { id: "a", media: imageMedia("https://example.com/a.jpg"), durationWeight: 1 },
          { id: "b", media: imageMedia("https://example.com/b.jpg"), durationWeight: 1 },
        ],
      }),
    ],
  });

  const removed = applySceneUpdate(base, "scene-1", {
    mediaTimeline: {
      version: 1,
      items: [{ id: "a", media: imageMedia("https://example.com/a.jpg"), durationWeight: 1 }],
    },
  });
  assert.ok(classifyStoryPatch(base, removed).classes.includes("media"));

  const added = applySceneUpdate(base, "scene-1", {
    mediaTimeline: {
      version: 1,
      items: [
        { id: "a", media: imageMedia("https://example.com/a.jpg"), durationWeight: 1 },
        { id: "b", media: imageMedia("https://example.com/b.jpg"), durationWeight: 1 },
        { id: "c", media: imageMedia("https://example.com/c.jpg"), durationWeight: 1 },
      ],
    },
  });
  assert.ok(classifyStoryPatch(base, added).classes.includes("media"));
});

test("8A.1 overflow-safe resolution with very large finite weights", () => {
  const huge = Number.MAX_VALUE / 4;
  const inputItems = [
    { id: "a", media: imageMedia("a"), durationWeight: huge },
    { id: "b", media: imageMedia("b"), durationWeight: huge },
    { id: "c", media: imageMedia("c"), durationWeight: huge / 2 },
  ];
  const frozen = JSON.stringify(inputItems);
  const windows = resolveSceneMediaWindows({
    items: inputItems,
    sceneDurationMs: 1000,
  });
  assert.equal(JSON.stringify(inputItems), frozen);
  assert.equal(windows.length, 3);
  assert.equal(windows[0]?.startMs, 0);
  assert.equal(windows[windows.length - 1]?.endMs, 1000);
  let cursor = 0;
  for (const window of windows) {
    assert.ok(Number.isFinite(window.startMs));
    assert.ok(Number.isFinite(window.endMs));
    assert.ok(Number.isFinite(window.durationMs));
    assert.ok(window.startMs >= 0);
    assert.ok(window.endMs >= 0);
    assert.ok(window.durationMs >= 0);
    assert.equal(window.startMs, cursor);
    cursor = window.endMs;
  }
  assert.equal(cursor, 1000);

  const active = resolveActiveSceneMediaAtElapsed({
    items: inputItems,
    sceneDurationMs: 1000,
    sceneElapsedMs: 500,
  });
  assert.ok(active.active);
  assert.ok(Number.isFinite(active.itemElapsedMs));
});

console.log(`\n${passed} passed\n`);
