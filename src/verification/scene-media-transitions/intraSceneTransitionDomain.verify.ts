/**
 * Sprint 9A — Intra-scene transition domain.
 * Run: npm run test:intra-scene-transition-domain
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  appendSceneMediaImageItem,
  createSequentialMediaItemIdGenerator,
  projectSceneMediaTimeline,
  removeSceneMediaItem,
  reorderSceneMediaItem,
  resizeAdjacentSceneMediaBoundary,
} from "@/features/scene-media-timeline";
import {
  applyNormalizedSceneMediaTransitionsToScene,
  INTRA_SCENE_TRANSITION_DURATION_OPTIONS,
  INTRA_SCENE_TRANSITION_EFFECTS,
  normalizeSceneMediaTransitionTrack,
  pairKey,
  resetSceneMediaTransitionBoundary,
  resolveEffectiveIntraSceneTransitionDurationMs,
  resolveIntraSceneTransitionAtElapsed,
  resolveStoredBoundaryEffect,
  sceneMediaTransitionTrackSignature,
  sceneMediaTransitionsChanged,
  setSceneMediaTransitionBoundary,
  SceneMediaTransitionCommandError,
} from "@/features/scene-media-transitions";
import type { FootieScene, SceneMedia, TransitionEffect } from "@/features/story/types";
import { duplicateScene } from "@/features/story/utils/timeline.utils";
import {
  TRANSITION_DURATION_OPTIONS,
  TRANSITION_VISUAL_EFFECTS,
} from "@/features/story/utils/transition-vocabulary";
import { classifyStoryPatch } from "@/features/editor/story-patches/story-patch-classifier";
import {
  buildExportManifest,
  EXPORT_MANIFEST_VERSION,
  EXPORT_RENDERER_CONTRACT_VERSION,
} from "@/features/export/domain";
import { syncFootieScript } from "@/lib/utils/voiceover";

function threeItemScene(): { scene: FootieScene; a: string; b: string; c: string } {
  const generateId = createSequentialMediaItemIdGenerator("tri");
  let scene: FootieScene = {
    id: "scene-3",
    start: 0,
    end: 9,
    duration: 9,
    startMs: 0,
    endMs: 9000,
    durationMs: 9000,
    subtitle: "Cap",
    narration: "Narration stays.",
    media: imageMedia("https://example.com/a.jpg"),
  };
  scene = appendSceneMediaImageItem(scene, imageMedia("https://example.com/b.jpg"), {
    generateId,
  }).scene;
  scene = appendSceneMediaImageItem(scene, imageMedia("https://example.com/c.jpg"), {
    generateId,
  }).scene;
  const items = projectSceneMediaTimeline(scene).items;
  return { scene, a: items[0]!.id, b: items[1]!.id, c: items[2]!.id };
}

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function imageMedia(url: string): SceneMedia {
  return {
    type: "image",
    url,
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
}

function twoItemScene(): { scene: FootieScene; a: string; b: string } {
  const generateId = createSequentialMediaItemIdGenerator("t");
  let scene: FootieScene = {
    id: "scene-1",
    start: 0,
    end: 6,
    duration: 6,
    startMs: 0,
    endMs: 6000,
    durationMs: 6000,
    subtitle: "Cap",
    narration: "Narration stays.",
    media: imageMedia("https://example.com/a.jpg"),
  };
  scene = appendSceneMediaImageItem(scene, imageMedia("https://example.com/b.jpg"), {
    generateId,
  }).scene;
  const items = projectSceneMediaTimeline(scene).items;
  return { scene, a: items[0]!.id, b: items[1]!.id };
}

console.log("\nintra-scene-transition-domain (Sprint 9A)\n");

test("Absence equals Cut", () => {
  const { scene, a, b } = twoItemScene();
  assert.equal(resolveStoredBoundaryEffect(scene, a, b).effect, "cut");
  const resolved = resolveIntraSceneTransitionAtElapsed(scene, 3000);
  assert.equal(resolved.active, false);
  assert.equal(resolved.effect, "cut");
});

test("Every supported effect can be stored and resolved", () => {
  const effects: TransitionEffect[] = [
    "fade",
    "slide-left",
    "slide-right",
    "zoom-in",
    "zoom-out",
    "blur",
  ];
  for (const effect of effects) {
    const { scene, a, b } = twoItemScene();
    const next = setSceneMediaTransitionBoundary(scene, a, b, effect, 500).scene;
    assert.equal(resolveStoredBoundaryEffect(next, a, b).effect, effect);
    const at = resolveIntraSceneTransitionAtElapsed(next, 3000);
    assert.equal(at.active, true);
    assert.equal(at.effect, effect);
  }
});

test("Requested vs effective duration and 40% clamp", () => {
  assert.equal(
    resolveEffectiveIntraSceneTransitionDurationMs({
      requestedDurationMs: 1000,
      fromWindowDurationMs: 1000,
      toWindowDurationMs: 1000,
    }),
    400,
  );
  assert.equal(
    resolveEffectiveIntraSceneTransitionDurationMs({
      requestedDurationMs: 300,
      fromWindowDurationMs: 5000,
      toWindowDurationMs: 5000,
    }),
    300,
  );
  assert.equal(
    resolveEffectiveIntraSceneTransitionDurationMs({
      requestedDurationMs: 500,
      fromWindowDurationMs: 2,
      toWindowDurationMs: 2,
    }),
    0,
  );
});

test("Exact boundary semantics: progress 0 at start; inactive at end", () => {
  const { scene, a, b } = twoItemScene();
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const start = resolveIntraSceneTransitionAtElapsed(next, 3000);
  assert.equal(start.active, true);
  assert.equal(start.overlayStartMs, 3000);
  assert.equal(start.progress, 0);
  assert.equal(start.outgoingItemLocalMs, 2999);
  assert.equal(start.incomingItemLocalMs, 0);

  const mid = resolveIntraSceneTransitionAtElapsed(next, 3250);
  assert.equal(mid.active, true);
  assert.ok(mid.progress > 0 && mid.progress < 1);
  assert.equal(mid.incomingItemLocalMs, 250);

  const end = resolveIntraSceneTransitionAtElapsed(next, 3500);
  assert.equal(end.active, false);

  const sceneEnd = resolveIntraSceneTransitionAtElapsed(next, 6000);
  assert.equal(sceneEnd.active, false);
});

test("Single-item / tiny-window / Cut clear", () => {
  const generateId = createSequentialMediaItemIdGenerator("one");
  assert.equal(normalizeSceneMediaTransitionTrack({ version: 1, boundaries: [] }, ["x"]).track, undefined);
  let scene: FootieScene = {
    id: "s",
    start: 0,
    end: 2,
    duration: 2,
    startMs: 0,
    endMs: 2000,
    durationMs: 2000,
    subtitle: "",
    media: imageMedia("https://example.com/only.jpg"),
  };
  scene = appendSceneMediaImageItem(scene, imageMedia("https://example.com/two.jpg"), {
    generateId,
  }).scene;
  const [a, b] = projectSceneMediaTimeline(scene).items.map((i) => i.id);
  const withFade = setSceneMediaTransitionBoundary(scene, a!, b!, "fade", 500).scene;
  const cut = setSceneMediaTransitionBoundary(withFade, a!, b!, "cut", 500).scene;
  assert.equal(cut.mediaTransitions, undefined);
});

test("Malformed / unsupported / stale / duplicate / non-adjacent dropped; unknown effect not Fade", () => {
  const { a, b } = twoItemScene();
  const ids = [a, b];
  const { track, diagnostics } = normalizeSceneMediaTransitionTrack(
    {
      version: 1,
      boundaries: [
        { fromItemId: a, toItemId: b, effect: "mystery", durationMs: 500 },
        { fromItemId: a, toItemId: b, effect: "fade", durationMs: 500 },
        { fromItemId: a, toItemId: b, effect: "fade", durationMs: 500 },
        { fromItemId: "missing", toItemId: b, effect: "fade", durationMs: 500 },
        { fromItemId: b, toItemId: a, effect: "fade", durationMs: 500 },
        { fromItemId: a, toItemId: b, effect: "fade", durationMs: 123 },
      ],
    },
    ids,
  );
  assert.equal(track?.boundaries.length, 1);
  assert.equal(track?.boundaries[0]?.effect, "fade");
  assert.ok(diagnostics.some((d) => d.code === "unsupported_effect"));
  assert.ok(diagnostics.some((d) => d.code === "duplicate_pair"));
  assert.ok(diagnostics.some((d) => d.code === "unknown_item_id"));
  assert.ok(diagnostics.some((d) => d.code === "reversed_or_unordered_pair"));
  assert.ok(diagnostics.some((d) => d.code === "unsupported_duration"));
  assert.doesNotMatch(JSON.stringify(diagnostics), /example\.com/);
});

test("Append / reorder / remove reconciliation", () => {
  const generateId = createSequentialMediaItemIdGenerator("r");
  const __pair = twoItemScene();
  let scene = __pair.scene;
  const a = __pair.a;
  const b = __pair.b;
  scene = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  scene = appendSceneMediaImageItem(scene, imageMedia("https://example.com/c.jpg"), {
    generateId,
  }).scene;
  const ids = projectSceneMediaTimeline(scene).items.map((i) => i.id);
  assert.equal(resolveStoredBoundaryEffect(scene, ids[0]!, ids[1]!).effect, "fade");
  assert.equal(resolveStoredBoundaryEffect(scene, ids[1]!, ids[2]!).effect, "cut");

  // Move A to the end → [b, c, a] breaks ordered adjacency of a→b.
  scene = reorderSceneMediaItem(scene, a, 2).scene;
  assert.equal(
    scene.mediaTransitions?.boundaries.some(
      (x) => x.fromItemId === a && x.toItemId === b,
    ) ?? false,
    false,
  );

  const after = projectSceneMediaTimeline(scene).items.map((i) => i.id);
  scene = setSceneMediaTransitionBoundary(scene, after[0]!, after[1]!, "blur", 300).scene;
  scene = removeSceneMediaItem(scene, after[0]!).scene;
  assert.ok(
    !(scene.mediaTransitions?.boundaries ?? []).some((x) => x.fromItemId === after[0]!),
  );
});

test("Resize preserves pair; framing path preserved via reconcile no-op", () => {
  const __pair = twoItemScene();
  let scene = __pair.scene;
  const a = __pair.a;
  const b = __pair.b;
  scene = setSceneMediaTransitionBoundary(scene, a, b, "fade", 800).scene;
  scene = resizeAdjacentSceneMediaBoundary(scene, 0, 200).scene;
  assert.equal(resolveStoredBoundaryEffect(scene, a, b).effect, "fade");
  assert.equal(resolveStoredBoundaryEffect(scene, a, b).durationMs, 800);
});

test("Draft round-trip + duplication independence", () => {
  const __pair = twoItemScene();
  let scene = __pair.scene;
  const a = __pair.a;
  const b = __pair.b;
  scene = setSceneMediaTransitionBoundary(scene, a, b, "slide-left", 1000).scene;
  const script = syncFootieScript({
    title: "T",
    narration: "N",
    totalDuration: 6,
    scenes: [scene],
  });
  const reloaded = JSON.parse(JSON.stringify(script)) as typeof script;
  const normalized = applyNormalizedSceneMediaTransitionsToScene(reloaded.scenes[0]!);
  assert.equal(resolveStoredBoundaryEffect(normalized, a, b).effect, "slide-left");

  const dup = duplicateScene(normalized);
  assert.notEqual(dup.id, normalized.id);
  assert.deepEqual(dup.mediaTransitions, normalized.mediaTransitions);
  dup.mediaTransitions!.boundaries[0]!.effect = "fade";
  assert.equal(normalized.mediaTransitions!.boundaries[0]!.effect, "slide-left");
});

test("Transition-only change classifies as media", () => {
  const { scene, a, b } = twoItemScene();
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  assert.equal(sceneMediaTransitionsChanged(scene, next), true);
  const classification = classifyStoryPatch(
    { title: "t", narration: "n", totalDuration: 6, scenes: [scene] },
    { title: "t", narration: "n", totalDuration: 6, scenes: [next] },
  );
  assert.ok(classification.classes.includes("media"));
  assert.equal(classification.classes.includes("transition"), false);
  assert.equal(classification.classes.includes("spoken_text"), false);
});

test("Atomic write rejects unsupported effect/duration", () => {
  const { scene, a, b } = twoItemScene();
  assert.throws(
    () => setSceneMediaTransitionBoundary(scene, a, b, "fade", 250),
    SceneMediaTransitionCommandError,
  );
});

test("current ExportManifest freezes mediaTransitions; Preview compose is not imported by export draw", () => {
  const __pair = twoItemScene();
  let scene = __pair.scene;
  const a = __pair.a;
  const b = __pair.b;
  scene = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const story = syncFootieScript({
    title: "t",
    narration: "n",
    totalDuration: 6,
    scenes: [scene],
  });
  const without = buildExportManifest({
    story: {
      ...story,
      scenes: [{ ...scene, mediaTransitions: undefined }],
    },
  });
  const withMeta = buildExportManifest({ story });
  assert.notEqual(without.fingerprint, withMeta.fingerprint);
  assert.equal(withMeta.version, EXPORT_MANIFEST_VERSION);
  assert.equal(withMeta.rendererContractVersion, EXPORT_RENDERER_CONTRACT_VERSION);
  assert.match(JSON.stringify(withMeta.scenes[0]), /mediaTransitions/);
  assert.equal(
    (withMeta.scenes[0] as unknown as { mediaTransitions: { boundaries: unknown[] } })
      .mediaTransitions.boundaries.length,
    1,
  );
  assert.equal(
    (without.scenes[0] as unknown as { mediaTransitions: { boundaries: unknown[] } })
      .mediaTransitions.boundaries.length,
    0,
  );

  const exportDraw = readSrc("src/features/export/runtime/draw-prepared-export-frame.ts");
  assert.doesNotMatch(exportDraw, /composeIntraSceneTransitionPreview/);
  assert.doesNotMatch(exportDraw, /resolveIntraSceneTransitionAtElapsed/);
});

test("Scene-to-scene type remains distinct; layer math owned by timeline-intelligence", () => {
  const index = readSrc("src/features/scene-media-transitions/index.ts");
  assert.doesNotMatch(index, /export[\s\S]*resolveTransitionEffectLayers/);
  assert.doesNotMatch(index, /from ["']@\/features\/timeline-intelligence/);
  assert.match(
    readSrc("src/features/timeline-intelligence/resolve-transition-state.utils.ts"),
    /export function resolveTransitionEffectLayers/,
  );
  assert.match(
    readSrc("src/features/story/types/story.types.ts"),
    /SceneMediaTransitionBoundary/,
  );
  assert.match(
    readSrc("src/features/story/types/story.types.ts"),
    /TransitionTimelineItem/,
  );
});

test("Collision-safe pair identity for delimiter-like IDs", () => {
  const cases: Array<[string, string]> = [
    ["a\u0000b", "c"],
    ["a|b", "c|d"],
    ["a:b", "c:d"],
    ['a"b', "c"],
    ["café", "東京"],
    ["a|b:c", "a|b"],
  ];
  const keys = new Set<string>();
  for (const [from, to] of cases) {
    const key = pairKey(from, to);
    assert.equal(JSON.parse(key)[0], from);
    assert.equal(JSON.parse(key)[1], to);
    assert.equal(keys.has(key), false);
    keys.add(key);
  }
  // Former NUL delimiter would collide these if concatenated naively.
  assert.notEqual(pairKey("a\u0000b", "c"), pairKey("a", "\u0000b\u0000c"));
  assert.notEqual(pairKey("a|b", "c"), pairKey("a", "b|c"));
});

test("Total malformed signatures never throw; order-independent for equivalent tracks", () => {
  assert.equal(sceneMediaTransitionTrackSignature(null), "");
  assert.equal(sceneMediaTransitionTrackSignature(undefined), "");
  assert.equal(sceneMediaTransitionTrackSignature([]), "");
  assert.equal(sceneMediaTransitionTrackSignature("nope"), "");
  assert.equal(sceneMediaTransitionTrackSignature(42), "");

  const { scene, a, b, c } = threeItemScene();
  const withBoth = setSceneMediaTransitionBoundary(
    setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene,
    b,
    c,
    "blur",
    300,
  ).scene;

  const reversedPersist: FootieScene = {
    ...withBoth,
    mediaTransitions: {
      version: 1,
      boundaries: [
        { fromItemId: b, toItemId: c, effect: "blur", durationMs: 300 },
        { fromItemId: a, toItemId: b, effect: "fade", durationMs: 500 },
      ],
    },
  };
  assert.equal(
    sceneMediaTransitionTrackSignature(withBoth),
    sceneMediaTransitionTrackSignature(reversedPersist),
  );

  const stale: FootieScene = {
    ...scene,
    mediaTransitions: {
      version: 1,
      boundaries: [
        { fromItemId: "missing", toItemId: b, effect: "fade", durationMs: 500 },
        { fromItemId: a, toItemId: b, effect: "fade", durationMs: 500 },
        { fromItemId: a, toItemId: b, effect: "fade", durationMs: 500 },
      ],
    },
  };
  const onlyAb = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  assert.equal(sceneMediaTransitionTrackSignature(stale), sceneMediaTransitionTrackSignature(onlyAb));

  const different = setSceneMediaTransitionBoundary(scene, a, b, "zoom-in", 500).scene;
  assert.notEqual(
    sceneMediaTransitionTrackSignature(onlyAb),
    sceneMediaTransitionTrackSignature(different),
  );

  const before = JSON.stringify(stale);
  sceneMediaTransitionTrackSignature(stale);
  assert.equal(JSON.stringify(stale), before);
});

test("Canonical adjacency ordering + multi-boundary edit/reset preservation", () => {
  const { scene, a, b, c } = threeItemScene();
  let next = setSceneMediaTransitionBoundary(scene, b, c, "blur", 300).scene;
  next = setSceneMediaTransitionBoundary(next, a, b, "fade", 500).scene;
  assert.deepEqual(
    next.mediaTransitions?.boundaries.map((x) => [x.fromItemId, x.toItemId, x.effect]),
    [
      [a, b, "fade"],
      [b, c, "blur"],
    ],
  );

  next = setSceneMediaTransitionBoundary(next, a, b, "slide-left", 800).scene;
  assert.equal(next.mediaTransitions?.boundaries.length, 2);
  assert.equal(resolveStoredBoundaryEffect(next, a, b).effect, "slide-left");
  assert.equal(resolveStoredBoundaryEffect(next, b, c).effect, "blur");

  next = resetSceneMediaTransitionBoundary(next, a, b).scene;
  assert.equal(resolveStoredBoundaryEffect(next, a, b).effect, "cut");
  assert.equal(resolveStoredBoundaryEffect(next, b, c).effect, "blur");
  assert.equal(next.mediaTransitions?.boundaries.length, 1);

  // Reapply same semantic setting does not invent extra records / reorder.
  const again = setSceneMediaTransitionBoundary(next, b, c, "blur", 300).scene;
  assert.deepEqual(again.mediaTransitions, next.mediaTransitions);
});

test("Commands do not mutate input scene or nested arrays", () => {
  const { scene, a, b } = twoItemScene();
  const seeded = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const snapshot = JSON.stringify(seeded);
  const nestedRef = seeded.mediaTransitions!.boundaries;
  setSceneMediaTransitionBoundary(seeded, a, b, "blur", 800);
  resetSceneMediaTransitionBoundary(seeded, a, b);
  assert.equal(JSON.stringify(seeded), snapshot);
  assert.equal(nestedRef[0]?.effect, "fade");
});

test("Neutral transition registry parity — single duration/effect source", () => {
  assert.deepEqual(
    [...INTRA_SCENE_TRANSITION_DURATION_OPTIONS],
    [...TRANSITION_DURATION_OPTIONS],
  );
  assert.deepEqual([...INTRA_SCENE_TRANSITION_EFFECTS], [...TRANSITION_VISUAL_EFFECTS]);
  const vocab = readSrc("src/features/story/utils/transition-vocabulary.ts");
  assert.match(vocab, /TRANSITION_DURATION_OPTIONS = \[300, 500, 800, 1000\]/);
  const intraConstants = readSrc(
    "src/features/scene-media-transitions/domain/constants.ts",
  );
  assert.doesNotMatch(intraConstants, /\[300,\s*500,\s*800,\s*1000\]/);
  const timelineUtils = readSrc("src/features/story/utils/timeline.utils.ts");
  assert.doesNotMatch(timelineUtils, /TRANSITION_DURATION_OPTIONS = \[300/);
});

test("Import-cycle prevention — story timeline uses domain-only transition imports", () => {
  const timelineUtils = readSrc("src/features/story/utils/timeline.utils.ts");
  assert.doesNotMatch(
    timelineUtils,
    /from ["']@\/features\/scene-media-transitions["']/,
  );
  assert.match(
    timelineUtils,
    /from ["']@\/features\/scene-media-transitions\/domain\/normalize-track["']/,
  );
  assert.match(
    timelineUtils,
    /from ["']@\/features\/scene-media-transitions\/domain\/clone-track["']/,
  );

  const index = readSrc("src/features/scene-media-transitions/index.ts");
  assert.doesNotMatch(index, /export[\s\S]*resolveTransitionEffectLayers/);
  assert.doesNotMatch(index, /from ["']@\/features\/timeline-intelligence/);

  const labels = readSrc(
    "src/features/scene-media-transitions/presentation/labels.ts",
  );
  assert.doesNotMatch(labels, /timeline\.utils/);
  assert.match(labels, /transition-vocabulary/);

  for (const relative of [
    "src/features/scene-media-transitions/domain/normalize-track.ts",
    "src/features/scene-media-transitions/domain/track-signature.ts",
    "src/features/scene-media-transitions/domain/reconcile-track.ts",
    "src/features/scene-media-transitions/domain/clone-track.ts",
    "src/features/scene-media-transitions/domain/constants.ts",
    "src/features/scene-media-transitions/domain/effect-support.ts",
  ]) {
    const source = readSrc(relative);
    assert.doesNotMatch(source, /scene-media-transitions\/presentation/);
    assert.doesNotMatch(source, /scene-media-transitions\/editor/);
    assert.doesNotMatch(source, /timeline-intelligence/);
    assert.doesNotMatch(source, /features\/preview/);
    assert.doesNotMatch(source, /features\/export/);
  }
});

console.log(`\n${passed} passed\n`);
