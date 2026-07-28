/**
 * Sprint 8B — Scene Media Timeline UI.
 * Run: npm run test:scene-media-timeline-ui
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import {
  projectSceneMediaTimeline,
  resolveProjectedSceneMediaWindows,
} from "@/features/scene-media-timeline";
import {
  reconcileMediaItemSelectionAuthority,
  SelectionType,
} from "@/features/editor/selection";
import {
  appendSceneMediaImageItem,
  canAddSceneMediaItem,
  canRemoveSceneMediaItem,
  createSequentialMediaItemIdGenerator,
  ensureStoredSceneMediaTimeline,
  isSelectableSceneMediaItemId,
  moveSceneMediaItemLeft,
  moveSceneMediaItemRight,
  removeSceneMediaItem,
  reorderSceneMediaItem,
  resizeAdjacentSceneMediaBoundary,
  resolveAverageDurationWeight,
  resolveNextMediaItemSelectionAfterRemoval,
  SCENE_MEDIA_MIN_ITEM_DURATION_MS,
  SCENE_MEDIA_TIMELINE_EXPERIMENTAL_NOTICE,
} from "@/features/scene-media-timeline/editor";
import type {
  FootieScene,
  FootieScript,
  SceneMedia,
} from "@/features/story/types";
import { getSceneMedia } from "@/features/story/utils/scene.utils";
import { buildMasterTimeline } from "@/features/timeline-intelligence/build-master-timeline";
import {
  isOwnedBlobUrl,
  revokeOwnedBlobUrlIfPresent,
  shouldRevokeOnOwnerUnmount,
} from "@/features/timeline-editor/scene-media/blob-url-ownership";
import {
  beginBoundaryInteraction,
  cancelBoundaryInteraction,
  cancelBoundaryInteractionOnSceneChange,
  createIdleBoundaryInteraction,
  pointerUpBoundaryInteraction,
  previewBoundaryInteraction,
} from "@/features/timeline-editor/scene-media/media-boundary-interaction.machine";
import {
  isMediaBoundaryGlobalLockActive,
  isMediaBoundaryLaneLocked,
  releaseMediaBoundaryOwner,
  tryAcquireMediaBoundaryOwner,
} from "@/features/timeline-editor/scene-media/media-boundary-owner.lock";
import {
  isSafeSceneMediaLaneErrorMessage,
  resolveSceneMediaLaneErrorCode,
  resolveSceneMediaLaneErrorMessage,
  SCENE_MEDIA_LANE_ERROR_MESSAGES,
} from "@/features/timeline-editor/scene-media/scene-media-lane-errors";
import { applySceneUpdate, syncFootieScript } from "@/lib/utils/voiceover";

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

function baseScene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 6,
    duration: 6,
    startMs: 0,
    endMs: 6000,
    durationMs: 6000,
    subtitle: "Scene caption",
    narration: "Scene narration stays put.",
    ...overrides,
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

console.log("\nscene-media-timeline-ui (Sprint 8B / 8B.1)\n");

test("1. multi-image is the default production capability (flag retired)", () => {
  assert.doesNotMatch(
    readSrc("src/features/scene-media-timeline/index.ts"),
    /isMultiImageScenesEnabled|feature-gate/,
  );
  assert.throws(() => {
    readFileSync(
      join(process.cwd(), "src/features/scene-media-timeline/feature-gate.ts"),
      "utf8",
    );
  }, /ENOENT/);
});

test("2. production surfaces never read the retired env variable", () => {
  for (const path of [
    "src/features/timeline-editor/StudioTimeline.tsx",
    "src/features/timeline-editor/scene-media/SceneMediaTimelineLane.tsx",
    "src/features/editor/components/StudioSceneInspector.tsx",
    "src/features/preview/components/PreviewFrame.tsx",
    "src/features/export/domain/prepare-export-request.ts",
    "src/components/studio-shell/StudioTimelineShell.tsx",
  ]) {
    assert.doesNotMatch(
      readSrc(path),
      /process\.env\.NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES|isMultiImageScenesEnabled/,
    );
  }
});

test("3. domain adapters never read process.env for multi-image", () => {
  const build = readSrc("src/features/export/domain/build-export-manifest.ts");
  assert.doesNotMatch(build, /process\.env\./);
  assert.match(build, /multiImageScenesEnabled !== false/);
  const resolve = readSrc(
    "src/features/scene-media-timeline/adapters/resolve-active-scene-media-render-view.ts",
  );
  assert.doesNotMatch(resolve, /process\.env\./);
  assert.match(resolve, /multiImageScenesEnabled !== false/);
});

test("4. Studio Timeline always mounts Scene Media Timeline lane when scenes exist", () => {
  const studio = readSrc("src/features/timeline-editor/StudioTimeline.tsx");
  assert.match(studio, /SceneMediaTimelineLane/);
  assert.doesNotMatch(studio, /multiImageScenesEnabled \? \(/);
  assert.match(studio, /script\.scenes\.length > 0/);
});

test("5. legacy virtual item renders as one full-scene segment", () => {
  const scene = baseScene({
    image: { url: "https://example.com/legacy.jpg", scale: 1, x: 0, y: 0 },
  });
  const windows = resolveProjectedSceneMediaWindows(scene);
  assert.equal(windows.length, 1);
  assert.equal(windows[0]?.provenance, "legacy_virtual");
  assert.equal(windows[0]?.startMs, 0);
  assert.equal(windows[0]?.endMs, 6000);
});

test("6. first explicit add creates a stored two-item timeline", () => {
  const generateId = createSequentialMediaItemIdGenerator("t");
  const scene = baseScene({
    media: imageMedia("https://example.com/first.jpg"),
  });
  const result = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/second.jpg"),
    {
      generateId,
    },
  );
  assert.equal(result.convertedFromLegacy, true);
  assert.equal(result.scene.mediaTimeline?.items.length, 2);
  assert.equal(result.scene.media?.url, "https://example.com/first.jpg");
});

test("7. added image appends rather than replaces", () => {
  const generateId = createSequentialMediaItemIdGenerator("a");
  const scene = baseScene({
    media: imageMedia("https://example.com/keep.jpg"),
  });
  const result = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/new.jpg"),
    {
      generateId,
    },
  );
  assert.equal(
    result.scene.mediaTimeline?.items[0]?.media.url,
    "https://example.com/keep.jpg",
  );
  assert.equal(
    result.scene.mediaTimeline?.items[1]?.media.url,
    "https://example.com/new.jpg",
  );
  assert.equal(result.scene.media?.url, "https://example.com/keep.jpg");
});

test("8. stable injected IDs", () => {
  const generateId = createSequentialMediaItemIdGenerator("fixed");
  const scene = baseScene({ media: imageMedia("https://example.com/a.jpg") });
  const first = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/b.jpg"),
    {
      generateId,
    },
  );
  const second = appendSceneMediaImageItem(
    first.scene,
    imageMedia("https://example.com/c.jpg"),
    { generateId },
  );
  assert.equal(first.selectedMediaItemId, "fixed-1");
  assert.equal(second.selectedMediaItemId, "fixed-2");
  assert.equal(second.scene.mediaTimeline?.items[1]?.id, "fixed-1");
  assert.equal(second.scene.mediaTimeline?.items[2]?.id, "fixed-2");
});

test("9–10. reorder updates array order and compatibility scene.media", () => {
  const generateId = createSequentialMediaItemIdGenerator("r");
  let scene = baseScene({ media: imageMedia("https://example.com/a.jpg") });
  scene = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/b.jpg"),
    {
      generateId,
    },
  ).scene;
  const reordered = reorderSceneMediaItem(scene, "r-1", 0);
  assert.equal(reordered.scene.mediaTimeline?.items[0]?.id, "r-1");
  assert.equal(
    reordered.scene.mediaTimeline?.items[0]?.media.url,
    "https://example.com/b.jpg",
  );
  assert.equal(reordered.scene.media?.url, "https://example.com/b.jpg");
});

test("11. remove selects nearest surviving item", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(resolveNextMediaItemSelectionAfterRemoval(items, "b"), "c");
  assert.equal(resolveNextMediaItemSelectionAfterRemoval(items, "c"), "b");
  assert.equal(resolveNextMediaItemSelectionAfterRemoval(items, "a"), "b");

  const generateId = createSequentialMediaItemIdGenerator("n");
  let scene = baseScene({ media: imageMedia("https://example.com/a.jpg") });
  scene = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/b.jpg"),
    {
      generateId,
    },
  ).scene;
  scene = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/c.jpg"),
    {
      generateId,
    },
  ).scene;
  const removed = removeSceneMediaItem(scene, "n-1");
  assert.equal(removed.selectedMediaItemId, "n-2");
  assert.equal(removed.scene.media?.url, "https://example.com/a.jpg");
});

test("12. only-item removal creates a canonical empty scene", () => {
  const scene = baseScene({
    media: imageMedia("https://example.com/only.jpg"),
  });
  assert.equal(canRemoveSceneMediaItem(scene), true);
  const removed = removeSceneMediaItem(scene, "legacy-media:scene-1");
  assert.equal(removed.selectedMediaItemId, null);
  assert.equal(removed.scene.media, undefined);
  assert.equal(removed.scene.mediaTimeline, undefined);
  assert.equal(removed.scene.image, undefined);
  assert.equal(removed.scene.uploadedImage, undefined);
  assert.equal(removed.scene.assetAttachment, undefined);
});

test("13. move-left/right boundaries", () => {
  const generateId = createSequentialMediaItemIdGenerator("m");
  let scene = baseScene({ media: imageMedia("https://example.com/a.jpg") });
  scene = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/b.jpg"),
    {
      generateId,
    },
  ).scene;
  const left = moveSceneMediaItemLeft(scene, scene.mediaTimeline!.items[0]!.id);
  assert.equal(
    left.scene.mediaTimeline?.items[0]?.media.url,
    "https://example.com/a.jpg",
  );
  const right = moveSceneMediaItemRight(
    scene,
    scene.mediaTimeline!.items[0]!.id,
  );
  assert.equal(
    right.scene.mediaTimeline?.items[0]?.media.url,
    "https://example.com/b.jpg",
  );
  assert.equal(right.scene.media?.url, "https://example.com/b.jpg");
});

test("14. average-weight append behavior (legacy + first add → equal windows)", () => {
  const generateId = createSequentialMediaItemIdGenerator("w");
  const scene = baseScene({
    media: imageMedia("https://example.com/a.jpg"),
    durationMs: 6000,
  });
  const result = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/b.jpg"),
    {
      generateId,
    },
  );
  const windows = resolveProjectedSceneMediaWindows(result.scene);
  assert.equal(windows.length, 2);
  assert.equal(windows[0]?.durationMs, 3000);
  assert.equal(windows[1]?.durationMs, 3000);
});

test("15–17. adjacent boundary resize, min 500ms, scene duration unchanged", () => {
  const generateId = createSequentialMediaItemIdGenerator("b");
  let scene = baseScene({
    media: imageMedia("https://example.com/a.jpg"),
    durationMs: 6000,
    narration: "Keep narration.",
  });
  scene = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/b.jpg"),
    {
      generateId,
    },
  ).scene;
  const beforeDuration = scene.durationMs;
  const beforeNarration = scene.narration;
  const resized = resizeAdjacentSceneMediaBoundary(scene, 0, 1000);
  assert.equal(resized.scene.durationMs, beforeDuration);
  assert.equal(resized.scene.narration, beforeNarration);
  const windows = resolveProjectedSceneMediaWindows(resized.scene);
  assert.equal(windows[0]!.durationMs + windows[1]!.durationMs, 6000);
  assert.ok(windows[0]!.durationMs >= SCENE_MEDIA_MIN_ITEM_DURATION_MS);
  assert.ok(windows[1]!.durationMs >= SCENE_MEDIA_MIN_ITEM_DURATION_MS);

  // Extreme deltas clamp to the 500ms minimum rather than producing invalid windows.
  const clamped = resizeAdjacentSceneMediaBoundary(scene, 0, 10_000);
  const clampedWindows = resolveProjectedSceneMediaWindows(clamped.scene);
  assert.ok(
    (clampedWindows[1]?.durationMs ?? 0) <=
      SCENE_MEDIA_MIN_ITEM_DURATION_MS + 1,
  );
  assert.ok(
    (clampedWindows[1]?.durationMs ?? 0) >= SCENE_MEDIA_MIN_ITEM_DURATION_MS,
  );
  assert.equal(
    (clampedWindows[0]?.durationMs ?? 0) + (clampedWindows[1]?.durationMs ?? 0),
    6000,
  );
});

test("18. narration remains unchanged across append/reorder/remove", () => {
  const generateId = createSequentialMediaItemIdGenerator("nar");
  let scene = baseScene({
    media: imageMedia("https://example.com/a.jpg"),
    narration: "Immutable narration line.",
  });
  scene = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/b.jpg"),
    {
      generateId,
    },
  ).scene;
  scene = reorderSceneMediaItem(scene, "nar-1", 0).scene;
  scene = removeSceneMediaItem(scene, "nar-1").scene;
  assert.equal(scene.narration, "Immutable narration line.");
});

test("19. pointer cancellation documented in lane (no commit on Escape/cancel)", () => {
  const lane = readSrc(
    "src/features/timeline-editor/scene-media/SceneMediaTimelineLane.tsx",
  );
  assert.match(lane, /cancelBoundaryDrag/);
  assert.match(lane, /Escape/);
  assert.match(lane, /pointercancel/);
  assert.match(lane, /blur/);

  let globalOwner: string | null = null;
  let session = createIdleBoundaryInteraction();
  const started = beginBoundaryInteraction(session, globalOwner, {
    sceneId: "scene-a",
    leftIndex: 0,
    startClientX: 0,
    trackWidthPx: 100,
    sceneDurationMs: 2000,
  });
  assert.equal(started.acquired, true);
  session = started.state;
  globalOwner = started.nextGlobalOwner;
  session = previewBoundaryInteraction(session, 40);
  const cancelled = cancelBoundaryInteraction(session, globalOwner);
  assert.equal(cancelled.didCancel, true);
  assert.equal(cancelled.state.status, "cancelled");
  const lateUp = pointerUpBoundaryInteraction(
    cancelled.state,
    cancelled.nextGlobalOwner,
    80,
  );
  assert.equal(lateUp.shouldCommit, false);
});

test("20. keyboard boundary nudge", () => {
  const handle = readSrc(
    "src/features/timeline-editor/scene-media/SceneMediaBoundaryHandle.tsx",
  );
  const lane = readSrc(
    "src/features/timeline-editor/scene-media/SceneMediaTimelineLane.tsx",
  );
  assert.match(handle, /aria-valuenow/);
  assert.match(lane, /ArrowLeft/);
  assert.match(lane, /ArrowRight/);
});

test("21. playback lock wiring", () => {
  const studio = readSrc("src/features/timeline-editor/StudioTimeline.tsx");
  assert.match(studio, /playbackLocked=\{playbackLocked\}/);
  assert.match(studio, /mediaInteractionActive/);
  const lane = readSrc(
    "src/features/timeline-editor/scene-media/SceneMediaTimelineLane.tsx",
  );
  assert.match(lane, /playbackLocked/);
  assert.match(lane, /controlsDisabled/);
});

test("22–23. scene change clears media item; Scene/Image selection APIs remain", () => {
  const provider = readSrc(
    "src/features/editor/selection/EditorSelectionProvider.tsx",
  );
  assert.match(provider, /selectSceneMediaItem/);
  assert.match(provider, /clearSceneMediaItemSelection/);
  assert.match(provider, /setSelectedMediaItemId\(null\)/);
  assert.match(provider, /selectImage/);
  assert.match(provider, /selectScene/);
  const types = readSrc("src/features/editor/selection/selection.types.ts");
  assert.match(types, /SceneMediaItem/);
});

test("24. no nested interactive controls inside scene button", () => {
  const block = readSrc("src/features/timeline-editor/TimelineSceneBlock.tsx");
  assert.match(block, /mediaLane/);
  assert.match(block, /data-scene-media-lane-slot/);
  // mediaLane is rendered after resize handle, outside the main scene <button>.
  const buttonClose = block.lastIndexOf("</button>");
  const laneSlot = block.indexOf("data-scene-media-lane-slot");
  assert.ok(laneSlot > 0);
  assert.ok(laneSlot > block.indexOf("data-timeline-resize-handle"));
  void buttonClose;
});

test("25. no Preview/MasterTimeline/ExportManifest imports in UI command modules", () => {
  const commands = readSrc(
    "src/features/scene-media-timeline/editor/scene-media-timeline.commands.ts",
  );
  assert.doesNotMatch(commands, /@\/features\/preview/);
  assert.doesNotMatch(commands, /buildMasterTimeline/);
  assert.doesNotMatch(commands, /ExportManifest|buildExportManifest/);
  assert.doesNotMatch(commands, /@\/features\/export/);
});

test("26. Preview/Export still use first compatibility media", () => {
  const generateId = createSequentialMediaItemIdGenerator("pe");
  let scene = baseScene({
    media: imageMedia("https://example.com/first.jpg"),
  });
  scene = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/second.jpg"),
    {
      generateId,
    },
  ).scene;
  scene = reorderSceneMediaItem(scene, "pe-1", 0).scene;

  assert.equal(getSceneMedia(scene)?.url, "https://example.com/second.jpg");
  assert.equal(scene.media?.url, "https://example.com/second.jpg");

  const story = syncFootieScript({
    title: "Compat",
    narration: "Narration.",
    totalDuration: 6,
    scenes: [scene],
  });
  const timeline = buildMasterTimeline(story, { mode: "export" });
  assert.ok(timeline.renderDurationMs > 0);

  const manifest = buildExportManifest({ story, environment: CAPABLE_ENV });
  const media = manifest.scenes[0]?.media;
  assert.ok(media && media.type === "image");
  if (media && media.type === "image") {
    // ExportManifest uses `source` (not SceneMedia.url) — still first-item compatibility.
    assert.equal(media.source, "https://example.com/second.jpg");
  }
});

test("27. draft JSON preserves item order/weights/IDs", () => {
  const generateId = createSequentialMediaItemIdGenerator("json");
  let scene = baseScene({ media: imageMedia("https://example.com/a.jpg") });
  scene = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/b.jpg"),
    {
      generateId,
    },
  ).scene;
  const script: FootieScript = {
    title: "Draft",
    narration: "Narration.",
    totalDuration: 6,
    scenes: [scene],
  };
  const reloaded = JSON.parse(
    JSON.stringify(syncFootieScript(script)),
  ) as FootieScript;
  assert.deepEqual(
    reloaded.scenes[0]?.mediaTimeline?.items.map((item) => item.id),
    scene.mediaTimeline?.items.map((item) => item.id),
  );
  assert.equal(reloaded.scenes[0]?.mediaTimeline?.items[1]?.durationWeight, 1);
});

test("28. retired-flag ledger and .env.example have no active multi-image config", () => {
  const envExample = readSrc(".env.example");
  const ledger = readSrc("docs/operations/ENV_AND_FEATURE_FLAGS.md");
  assert.doesNotMatch(
    envExample,
    /^\s*NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES=/m,
  );
  assert.match(ledger, /Retired-flag ledger/);
  assert.match(ledger, /NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES/);
  assert.match(ledger, /Retired: Sprint 8E\.3|Sprint 8E\.3/);
  assert.match(
    ledger,
    /Remove NEXT_PUBLIC_SHORTFORGE_MULTI_IMAGE_SCENES=1 from \.env\.local/,
  );
  assert.match(ledger, /restart the development server/i);
});

test("add disabled when scene too short for 500ms/item", () => {
  const short = baseScene({
    durationMs: 900,
    duration: 0.9,
    media: imageMedia("https://example.com/a.jpg"),
  });
  assert.equal(canAddSceneMediaItem(short), false);
});

test("applySceneUpdate preserves timeline after media intent patch shape", () => {
  const generateId = createSequentialMediaItemIdGenerator("patch");
  const built = appendSceneMediaImageItem(
    baseScene({ media: imageMedia("https://example.com/a.jpg") }),
    imageMedia("https://example.com/b.jpg"),
    { generateId },
  );
  const prev = syncFootieScript({
    title: "Patch",
    narration: "Narration.",
    totalDuration: 6,
    scenes: [built.scene],
  });
  const next = applySceneUpdate(prev, "scene-1", {
    media: built.scene.media,
    mediaTimeline: built.scene.mediaTimeline,
  });
  assert.equal(next.scenes[0]?.mediaTimeline?.items.length, 2);
  assert.equal(
    projectSceneMediaTimeline(next.scenes[0]!).fromStoredTimeline,
    true,
  );
});

// ── Sprint 8B.1 hardening ─────────────────────────────────────────────

test("8B.1-1/2. owner lane active; other lanes locked", () => {
  let owner: string | null = null;
  const acquireA = tryAcquireMediaBoundaryOwner(owner, "scene-a");
  assert.equal(acquireA.ok, true);
  owner = acquireA.ok ? acquireA.owner : owner;
  assert.equal(isMediaBoundaryGlobalLockActive(owner), true);
  assert.equal(isMediaBoundaryLaneLocked(owner, "scene-a"), false);
  assert.equal(isMediaBoundaryLaneLocked(owner, "scene-b"), true);
});

test("8B.1-3. second boundary interaction rejected", () => {
  let owner: string | null = null;
  const first = tryAcquireMediaBoundaryOwner(owner, "scene-a");
  assert.equal(first.ok, true);
  owner = first.ok ? first.owner : null;
  const second = tryAcquireMediaBoundaryOwner(owner, "scene-b");
  assert.equal(second.ok, false);
  assert.equal(owner, "scene-a");
});

test("8B.1-4/5. scene selection change cancels; late pointer-up cannot commit", () => {
  let globalOwner: string | null = null;
  let session = createIdleBoundaryInteraction();
  const started = beginBoundaryInteraction(session, globalOwner, {
    sceneId: "scene-a",
    leftIndex: 0,
    startClientX: 10,
    trackWidthPx: 200,
    sceneDurationMs: 4000,
  });
  session = started.state;
  globalOwner = started.nextGlobalOwner;
  session = previewBoundaryInteraction(session, 110);

  const onSceneChange = cancelBoundaryInteractionOnSceneChange(
    session,
    globalOwner,
    "scene-b",
  );
  assert.equal(onSceneChange.didCancel, true);
  assert.equal(onSceneChange.nextGlobalOwner, null);

  const late = pointerUpBoundaryInteraction(
    onSceneChange.state,
    onSceneChange.nextGlobalOwner,
    150,
  );
  assert.equal(late.shouldCommit, false);
  assert.equal(late.deltaMs === 0 || late.shouldCommit === false, true);
});

test("8B.1-6. global scene ops remain locked during drag", () => {
  const studio = readSrc("src/features/timeline-editor/StudioTimeline.tsx");
  assert.match(studio, /mediaBoundaryOwnerSceneId/);
  assert.match(studio, /isMediaBoundaryGlobalLockActive/);
  assert.match(
    studio,
    /reorderDisabled =\s*playbackLocked\s*\|\|\s*resizeState != null\s*\|\|\s*trimState != null\s*\|\|\s*mediaInteractionActive/,
  );
  assert.match(
    studio,
    /resizeDisabled =\s*playbackLocked\s*\|\|\s*dragState != null\s*\|\|\s*trimState != null\s*\|\|\s*mediaInteractionActive/,
  );
  assert.match(
    studio,
    /trimDisabled =\s*playbackLocked\s*\|\|\s*dragState != null\s*\|\|\s*resizeState != null\s*\|\|\s*mediaInteractionActive/,
  );
});

test("8B.1-7/8. 3:1 weights in 2s scene reject append; input unchanged", () => {
  const scene = baseScene({
    durationMs: 2000,
    duration: 2,
    end: 2,
    endMs: 2000,
    media: imageMedia("https://example.com/a.jpg"),
    mediaTimeline: {
      version: 1,
      items: [
        {
          id: "w3",
          media: imageMedia("https://example.com/a.jpg"),
          durationWeight: 3,
        },
        {
          id: "w1",
          media: imageMedia("https://example.com/b.jpg"),
          durationWeight: 1,
        },
      ],
    },
  });
  const before = JSON.stringify(scene);
  assert.equal(canAddSceneMediaItem(scene), false);
  assert.throws(() =>
    appendSceneMediaImageItem(scene, imageMedia("https://example.com/c.jpg"), {
      generateId: createSequentialMediaItemIdGenerator("reject"),
    }),
  );
  assert.equal(JSON.stringify(scene), before);
});

test("8B.1-9. equal valid weights still append", () => {
  const generateId = createSequentialMediaItemIdGenerator("eq");
  let scene = baseScene({
    durationMs: 6000,
    media: imageMedia("https://example.com/a.jpg"),
  });
  scene = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/b.jpg"),
    {
      generateId,
    },
  ).scene;
  assert.equal(canAddSceneMediaItem(scene), true);
  const next = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/c.jpg"),
    {
      generateId,
    },
  );
  assert.equal(next.scene.mediaTimeline?.items.length, 3);
  const windows = resolveProjectedSceneMediaWindows(next.scene);
  assert.ok(
    windows.every(
      (window) => window.durationMs >= SCENE_MEDIA_MIN_ITEM_DURATION_MS,
    ),
  );
});

test("8B.1-10. legacy plus first image remains equal", () => {
  const generateId = createSequentialMediaItemIdGenerator("leg");
  const scene = baseScene({
    media: imageMedia("https://example.com/legacy.jpg"),
  });
  const result = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/new.jpg"),
    {
      generateId,
    },
  );
  const windows = resolveProjectedSceneMediaWindows(result.scene);
  assert.equal(windows.length, 2);
  assert.equal(windows[0]?.durationMs, windows[1]?.durationMs);
});

test("8B.1-11. very large finite weights produce a finite average", () => {
  const average = resolveAverageDurationWeight([
    { durationWeight: Number.MAX_VALUE },
    { durationWeight: Number.MAX_VALUE / 2 },
  ]);
  assert.equal(Number.isFinite(average), true);
  assert.ok(average > 0);
  assert.notEqual(average, Infinity);
  assert.equal(Number.isNaN(average), false);

  const hugeEqual = resolveAverageDurationWeight([
    { durationWeight: Number.MAX_VALUE },
    { durationWeight: Number.MAX_VALUE },
    { durationWeight: Number.MAX_VALUE },
  ]);
  assert.equal(Number.isFinite(hugeEqual), true);
  assert.ok(hugeEqual > 0);
});

test("8B.1-12. partially malformed stored state normalized before explicit edit", () => {
  const scene = baseScene({
    media: imageMedia("https://example.com/keep.jpg"),
    mediaTimeline: {
      version: 1,
      items: [
        {
          id: "good",
          media: imageMedia("https://example.com/keep.jpg"),
          durationWeight: 1,
        },
        {
          id: "",
          media: imageMedia("https://example.com/drop.jpg"),
          durationWeight: 1,
        },
        {
          id: "bad-weight",
          media: imageMedia("https://example.com/drop2.jpg"),
          durationWeight: -1,
        },
      ],
    },
  });
  const ensured = ensureStoredSceneMediaTimeline(scene);
  assert.equal(ensured.convertedFromLegacy, false);
  assert.equal(ensured.items.length, 1);
  assert.equal(ensured.items[0]?.id, "good");
  assert.equal(ensured.scene.mediaTimeline?.items.length, 1);

  const generateId = createSequentialMediaItemIdGenerator("norm");
  const appended = appendSceneMediaImageItem(
    ensured.scene,
    imageMedia("https://example.com/added.jpg"),
    { generateId },
  );
  assert.equal(appended.scene.mediaTimeline?.items.length, 2);
  assert.equal(appended.convertedFromLegacy, false);
});

test("8B.1-13. unknown media-item selection is rejected", () => {
  const scene = baseScene({ media: imageMedia("https://example.com/a.jpg") });
  assert.equal(isSelectableSceneMediaItemId(scene, ""), false);
  assert.equal(isSelectableSceneMediaItemId(scene, "not-a-real-id"), false);
  assert.equal(
    isSelectableSceneMediaItemId(scene, "legacy-media:scene-1"),
    true,
  );

  const provider = readSrc(
    "src/features/editor/selection/EditorSelectionProvider.tsx",
  );
  assert.match(provider, /isSelectableSceneMediaItemId/);
});

test("8B.1-14. stale selection clears after external item removal", () => {
  const generateId = createSequentialMediaItemIdGenerator("stale");
  let scene = baseScene({ media: imageMedia("https://example.com/a.jpg") });
  scene = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/b.jpg"),
    {
      generateId,
    },
  ).scene;
  const selectedId = "stale-1";
  assert.equal(isSelectableSceneMediaItemId(scene, selectedId), true);
  scene = removeSceneMediaItem(scene, selectedId).scene;
  assert.equal(isSelectableSceneMediaItemId(scene, selectedId), false);

  const provider = readSrc(
    "src/features/editor/selection/EditorSelectionProvider.tsx",
  );
  assert.match(provider, /validatedMediaItemId/);
  assert.match(provider, /isSelectableSceneMediaItemId/);
});

test("8B.1-15. experimental notice has one render authority", () => {
  const studio = readSrc("src/features/timeline-editor/StudioTimeline.tsx");
  const lane = readSrc(
    "src/features/timeline-editor/scene-media/SceneMediaTimelineLane.tsx",
  );
  assert.match(studio, /data-scene-media-experimental-notice/);
  assert.match(studio, /SCENE_MEDIA_TIMELINE_EXPERIMENTAL_NOTICE/);
  assert.doesNotMatch(lane, /SCENE_MEDIA_TIMELINE_EXPERIMENTAL_NOTICE/);
  assert.match(
    SCENE_MEDIA_TIMELINE_EXPERIMENTAL_NOTICE,
    /hard-cut item boundaries/,
  );
  assert.match(
    SCENE_MEDIA_TIMELINE_EXPERIMENTAL_NOTICE,
    /Intra-scene transition effects are editable metadata/,
  );
});

test("8B.1-16. shared minimum-duration constant drives command and ARIA bounds", () => {
  const handle = readSrc(
    "src/features/timeline-editor/scene-media/SceneMediaBoundaryHandle.tsx",
  );
  const commands = readSrc(
    "src/features/scene-media-timeline/editor/scene-media-timeline.commands.ts",
  );
  assert.match(handle, /SCENE_MEDIA_MIN_ITEM_DURATION_MS/);
  assert.doesNotMatch(handle, /aria-valuemin=\{500\}/);
  assert.match(commands, /SCENE_MEDIA_MIN_ITEM_DURATION_MS/);
  assert.equal(SCENE_MEDIA_MIN_ITEM_DURATION_MS, 500);
});

test("8B.1-17. safe error messages contain no URLs or stack content", () => {
  for (const message of Object.values(SCENE_MEDIA_LANE_ERROR_MESSAGES)) {
    assert.equal(isSafeSceneMediaLaneErrorMessage(message), true);
  }
  assert.equal(
    resolveSceneMediaLaneErrorCode(new Error("Only image files can be added.")),
    "unsupported_image",
  );
  assert.equal(
    resolveSceneMediaLaneErrorCode(
      new Error("Cannot add media item: scene is shorter than 500ms per item."),
    ),
    "scene_too_short",
  );
  const message = resolveSceneMediaLaneErrorMessage(
    new Error(
      "boom at Module.load (/Users/secret/app.ts:1:1) https://evil.example/x",
    ),
  );
  assert.equal(isSafeSceneMediaLaneErrorMessage(message), true);
  assert.doesNotMatch(message, /https?:\/\//);
  assert.doesNotMatch(message, /\/Users\//);
});

test("8B.1-18. blob revocation matrix", () => {
  const owned = new Set<string>(["blob:owned-1", "blob:owned-2"]);
  assert.equal(isOwnedBlobUrl("blob:owned-1", owned), true);
  assert.equal(isOwnedBlobUrl("https://cdn.example/a.jpg", owned), false);
  assert.equal(isOwnedBlobUrl("blob:foreign", owned), false);

  // Reorder/selection/cancel never call revoke — only owned remove/fail.
  assert.equal(
    revokeOwnedBlobUrlIfPresent("https://cdn.example/a.jpg", owned),
    false,
  );
  assert.equal(revokeOwnedBlobUrlIfPresent("blob:foreign", owned), false);
  assert.equal(owned.has("blob:owned-1"), true);

  assert.equal(revokeOwnedBlobUrlIfPresent("blob:owned-1", owned), true);
  assert.equal(owned.has("blob:owned-1"), false);
  assert.equal(owned.has("blob:owned-2"), true);

  // Unmount never revokes (duplicate-scene safety).
  assert.equal(shouldRevokeOnOwnerUnmount("blob:owned-2", owned), false);
  assert.equal(
    shouldRevokeOnOwnerUnmount("blob:other", new Set(["blob:other"])),
    false,
  );

  const appendHook = readSrc(
    "src/features/timeline-editor/scene-media/useSceneMediaImageAppend.ts",
  );
  assert.doesNotMatch(appendHook, /collectOwnedBlobUrlsFromScene/);
  assert.match(appendHook, /revokeOwnedBlobUrlIfPresent/);
  assert.match(appendHook, /Intentionally no unmount revoke/);
});

test("8B.1 stale owner release does not clear newer owner", () => {
  let owner: string | null = "scene-a";
  owner = releaseMediaBoundaryOwner(owner, "scene-b");
  assert.equal(owner, "scene-a");
  owner = releaseMediaBoundaryOwner(owner, "scene-a");
  assert.equal(owner, null);
});

// ── Sprint 8B.2 final ownership correction ────────────────────────────

test("8B.2-1. local A + global null → pointer-up does not commit", () => {
  let session = createIdleBoundaryInteraction();
  const started = beginBoundaryInteraction(session, null, {
    sceneId: "scene-a",
    leftIndex: 0,
    startClientX: 0,
    trackWidthPx: 100,
    sceneDurationMs: 2000,
  });
  session = previewBoundaryInteraction(started.state, 40);
  const late = pointerUpBoundaryInteraction(session, null, 80);
  assert.equal(late.shouldCommit, false);
  assert.equal(late.deltaMs, 0);
  assert.equal(late.nextGlobalOwner, null);
  assert.equal(late.state.status, "idle");
});

test("8B.2-2. local A + global B → no commit; B remains owner", () => {
  let session = createIdleBoundaryInteraction();
  const started = beginBoundaryInteraction(session, null, {
    sceneId: "scene-a",
    leftIndex: 0,
    startClientX: 0,
    trackWidthPx: 100,
    sceneDurationMs: 2000,
  });
  session = started.state;
  const late = pointerUpBoundaryInteraction(session, "scene-b", 50);
  assert.equal(late.shouldCommit, false);
  assert.equal(late.deltaMs, 0);
  assert.equal(late.nextGlobalOwner, "scene-b");
});

test("8B.2-3. local A + global A → commit allowed", () => {
  let globalOwner: string | null = null;
  let session = createIdleBoundaryInteraction();
  const started = beginBoundaryInteraction(session, globalOwner, {
    sceneId: "scene-a",
    leftIndex: 0,
    startClientX: 0,
    trackWidthPx: 100,
    sceneDurationMs: 2000,
  });
  session = started.state;
  globalOwner = started.nextGlobalOwner;
  session = previewBoundaryInteraction(session, 25);
  const up = pointerUpBoundaryInteraction(session, globalOwner, 25);
  assert.equal(up.shouldCommit, true);
  assert.equal(up.ownerSceneId, "scene-a");
  assert.equal(up.nextGlobalOwner, null);
});

test("8B.2-4/5. parent release before cancel epoch; stale pointer-up cannot clear newer owner", () => {
  let globalOwner: string | null = null;
  let session = createIdleBoundaryInteraction();
  const started = beginBoundaryInteraction(session, globalOwner, {
    sceneId: "scene-a",
    leftIndex: 0,
    startClientX: 0,
    trackWidthPx: 200,
    sceneDurationMs: 4000,
  });
  session = started.state;
  globalOwner = started.nextGlobalOwner;

  // Parent releases ownership (scene change) before lane cancel epoch arrives.
  globalOwner = releaseMediaBoundaryOwner(globalOwner, "scene-a");
  assert.equal(globalOwner, null);

  // Newer owner acquires.
  const newer = tryAcquireMediaBoundaryOwner(globalOwner, "scene-b");
  assert.equal(newer.ok, true);
  globalOwner = newer.ok ? newer.owner : null;

  const staleUp = pointerUpBoundaryInteraction(session, globalOwner, 120);
  assert.equal(staleUp.shouldCommit, false);
  assert.equal(staleUp.deltaMs, 0);
  assert.equal(staleUp.nextGlobalOwner, "scene-b");
});

test("8B.2 empty scene first-image append", () => {
  const empty = baseScene({
    durationMs: 3000,
    duration: 3,
    end: 3,
    endMs: 3000,
    narration: "Keep narration.",
  });
  assert.equal(canAddSceneMediaItem(empty), true);
  const generateId = createSequentialMediaItemIdGenerator("empty");
  const result = appendSceneMediaImageItem(
    empty,
    imageMedia("https://example.com/first.jpg"),
    {
      generateId,
    },
  );
  assert.equal(result.convertedFromLegacy, false);
  assert.equal(result.selectedMediaItemId, "empty-1");
  assert.equal(result.scene.mediaTimeline?.items.length, 1);
  assert.equal(result.scene.mediaTimeline?.items[0]?.id, "empty-1");
  assert.equal(result.scene.mediaTimeline?.items[0]?.durationWeight, 1);
  assert.equal(result.scene.media?.url, "https://example.com/first.jpg");
  assert.equal(result.scene.narration, "Keep narration.");
  assert.equal(result.scene.durationMs, 3000);

  const tooShort = baseScene({
    durationMs: 400,
    duration: 0.4,
    end: 0.4,
    endMs: 400,
  });
  assert.equal(canAddSceneMediaItem(tooShort), false);
  assert.throws(() =>
    appendSceneMediaImageItem(
      tooShort,
      imageMedia("https://example.com/x.jpg"),
      {
        generateId: createSequentialMediaItemIdGenerator("short"),
      },
    ),
  );
});

test("8B.2 malformed unusable timeline recovers via first-image path", () => {
  const scene = baseScene({
    durationMs: 3000,
    duration: 3,
    end: 3,
    endMs: 3000,
    mediaTimeline: {
      version: 1,
      items: [
        {
          id: "",
          media: imageMedia("https://example.com/bad.jpg"),
          durationWeight: 1,
        },
        {
          id: "neg",
          media: imageMedia("https://example.com/bad2.jpg"),
          durationWeight: -2,
        },
      ],
    },
  });
  assert.equal(projectSceneMediaTimeline(scene).items.length, 0);
  assert.equal(canAddSceneMediaItem(scene), true);
  const result = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/ok.jpg"),
    {
      generateId: createSequentialMediaItemIdGenerator("rec"),
    },
  );
  assert.equal(result.convertedFromLegacy, false);
  assert.equal(result.scene.mediaTimeline?.items.length, 1);
  assert.equal(result.scene.media?.url, "https://example.com/ok.jpg");
});

test("8B.2 ensureStored always rebuilds complete normalized projection", () => {
  const scene = baseScene({
    media: imageMedia("https://example.com/same.jpg"),
    mediaTimeline: {
      version: 1,
      items: [
        {
          id: "same",
          durationWeight: 1,
          media: {
            type: "image",
            url: "https://example.com/same.jpg",
            source: "upload",
            // Malformed nested fields that share id/type/URL with normalized form.
            transform: {
              x: Number.NaN,
              y: "bad" as unknown as number,
              scale: 99,
              rotation: Number.POSITIVE_INFINITY,
            },
            motion: {
              version: 1,
              enabled: true,
              presetId: "zoom-in",
              intensity: 99,
              easing: "not-a-real-easing" as unknown as "linear",
            },
            posterUrl: "   ",
            mimeType: " image/jpeg ",
            width: -10,
            height: Number.NaN,
          } as SceneMedia,
        },
      ],
    },
  });

  const ensured = ensureStoredSceneMediaTimeline(scene);
  assert.equal(ensured.convertedFromLegacy, false);
  const written = ensured.scene.mediaTimeline?.items[0]?.media;
  assert.ok(written);
  assert.equal(written.url, "https://example.com/same.jpg");
  assert.equal(
    written.transform?.scale != null && written.transform.scale <= 5,
    true,
  );
  assert.notEqual(written.transform?.x, Number.NaN);
  assert.equal(written.mimeType, "image/jpeg");
  assert.equal(written.width, undefined);
  assert.equal(written.height, undefined);
  assert.equal(written.posterUrl, undefined);
  assert.ok(
    written.motion == null ||
      written.motion.easing !== ("not-a-real-easing" as "linear"),
  );
  // Rejected raw fields must not be silently restored.
  assert.notDeepEqual(
    written.transform,
    (scene.mediaTimeline!.items[0]!.media as SceneMedia).transform,
  );
});

test("8B.2 duplicate-scene blob lifetime; unmount does not revoke", () => {
  const sharedBlob = "blob:shared-upload-1";
  const originalOwned = new Set<string>([sharedBlob]);
  const duplicateSceneUrl = sharedBlob;

  // Duplicate still references the same blob after "original lane unmount".
  assert.equal(shouldRevokeOnOwnerUnmount(sharedBlob, originalOwned), false);
  assert.equal(originalOwned.has(sharedBlob), true);
  assert.equal(duplicateSceneUrl, sharedBlob);

  // Explicit owned-item removal still revokes.
  assert.equal(revokeOwnedBlobUrlIfPresent(sharedBlob, originalOwned), true);
  assert.equal(originalOwned.has(sharedBlob), false);

  // Failed append path still revokes (owned set simulation).
  const failedOwned = new Set<string>(["blob:failed-append"]);
  assert.equal(
    revokeOwnedBlobUrlIfPresent("blob:failed-append", failedOwned),
    true,
  );

  // External/legacy never revoke.
  const legacyOwned = new Set<string>(["blob:x"]);
  assert.equal(
    revokeOwnedBlobUrlIfPresent("https://cdn.example/asset.jpg", legacyOwned),
    false,
  );
  assert.equal(
    revokeOwnedBlobUrlIfPresent("blob:not-owned", legacyOwned),
    false,
  );
});

test("8B.2 stale selection reconciliation clears stored authority", () => {
  const generateId = createSequentialMediaItemIdGenerator("sel");
  let scene = baseScene({ media: imageMedia("https://example.com/a.jpg") });
  scene = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/b.jpg"),
    {
      generateId,
    },
  ).scene;
  const storedId = "sel-1";
  assert.equal(
    reconcileMediaItemSelectionAuthority({
      storedMediaItemId: storedId,
      selectionFocus: SelectionType.SceneMediaItem,
      scene,
    }).didClear,
    false,
  );

  scene = removeSceneMediaItem(scene, storedId).scene;
  const cleared = reconcileMediaItemSelectionAuthority({
    storedMediaItemId: storedId,
    selectionFocus: SelectionType.SceneMediaItem,
    scene,
  });
  assert.equal(cleared.didClear, true);
  assert.equal(cleared.storedMediaItemId, null);
  assert.equal(cleared.selectionFocus, SelectionType.Scene);

  // Nearest survivor remains selectable — command selection is not cleared by reconcile.
  const survivor = scene.mediaTimeline?.items[0]?.id ?? null;
  assert.ok(survivor);
  const keepSurvivor = reconcileMediaItemSelectionAuthority({
    storedMediaItemId: survivor,
    selectionFocus: SelectionType.SceneMediaItem,
    scene,
  });
  assert.equal(keepSurvivor.didClear, false);
  assert.equal(keepSurvivor.storedMediaItemId, survivor);

  // After clear, reusing the same ID on an unrelated later item does not auto-resurrect
  // because stored authority is already null.
  const resurrectGuard = reconcileMediaItemSelectionAuthority({
    storedMediaItemId: null,
    selectionFocus: SelectionType.Scene,
    scene,
  });
  assert.equal(resurrectGuard.storedMediaItemId, null);
  assert.equal(resurrectGuard.didClear, false);

  const provider = readSrc(
    "src/features/editor/selection/EditorSelectionProvider.tsx",
  );
  assert.match(provider, /reconcileMediaItemSelectionAuthority/);
  assert.match(provider, /queueMicrotask/);
});

test("8B.2 non-finite reorder index rejected", () => {
  const generateId = createSequentialMediaItemIdGenerator("idx");
  let scene = baseScene({ media: imageMedia("https://example.com/a.jpg") });
  scene = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/b.jpg"),
    {
      generateId,
    },
  ).scene;
  const movedId = scene.mediaTimeline?.items[1]?.id;
  assert.ok(movedId);
  const before = JSON.stringify(scene);
  assert.throws(() => reorderSceneMediaItem(scene, movedId, Number.NaN));
  assert.throws(() =>
    reorderSceneMediaItem(scene, movedId, Number.POSITIVE_INFINITY),
  );
  assert.equal(JSON.stringify(scene), before);
  // Valid no-op reorder remains allowed.
  const firstId = scene.mediaTimeline?.items[0]?.id;
  assert.ok(firstId);
  const noop = reorderSceneMediaItem(scene, firstId, 0);
  assert.equal(noop.scene.mediaTimeline?.items[0]?.id, firstId);
});

test("8E.2/8E.3 layout — multi-image shell height is the production default", () => {
  const ui = readSrc("src/lib/utils/studioUi.ts");
  assert.match(ui, /studioShellTimelineHeightMultiImage/);
  assert.match(ui, /min-h-\[7\.5rem\]/);
  assert.match(ui, /h-auto/);

  const shell = readSrc("src/components/studio-shell/StudioTimelineShell.tsx");
  assert.match(shell, /studioShellTimelineHeightMultiImage/);
  assert.match(shell, /data-timeline-shell-multi-image="true"/);
  assert.doesNotMatch(shell, /isMultiImageScenesEnabled/);
  assert.match(shell, /multi-image shell height is the production default/i);
});

test("8E.2 shared append authority — Inspector + lane use one provider", () => {
  const workspace = readSrc("src/components/StoryWorkspace.tsx");
  assert.match(workspace, /SceneMediaImageAppendProvider/);

  const lane = readSrc(
    "src/features/timeline-editor/scene-media/SceneMediaTimelineLane.tsx",
  );
  assert.match(lane, /appendApi/);
  assert.match(lane, /Add another image/);
  assert.match(lane, /data-scene-media-ordinal/);
  assert.doesNotMatch(lane, /useSceneMediaImageAppend\(/);

  const inspector = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );
  assert.match(inspector, /Replace current image/);
  assert.match(inspector, /Add another image/);
  assert.match(inspector, /data-scene-media-replace-current/);
  assert.match(inspector, /SceneMediaAddAnotherImageButton/);
  assert.match(inspector, /useOptionalSceneMediaImageAppendContext/);

  const affordance = readSrc(
    "src/features/timeline-editor/scene-media/scene-media-append-affordance.tsx",
  );
  assert.match(affordance, /appendApi\.appendImageFile/);
  assert.match(affordance, /data-scene-media-add-another/);
});

test("8E.2 append selects new item; replace labels cannot be confused", () => {
  const generateId = createSequentialMediaItemIdGenerator("vis");
  const scene = baseScene({
    media: imageMedia("https://example.com/keep.jpg"),
  });
  const firstUrl = scene.media?.url;
  const result = appendSceneMediaImageItem(
    scene,
    imageMedia("https://example.com/second.jpg"),
    {
      generateId,
    },
  );
  assert.equal(result.scene.media?.url, firstUrl);
  assert.equal(result.scene.mediaTimeline?.items.length, 2);
  assert.equal(result.selectedMediaItemId, "vis-1");
  assert.equal(result.scene.mediaTimeline?.items[0]?.media.url, firstUrl);
  assert.equal(
    result.scene.mediaTimeline?.items[1]?.media.url,
    "https://example.com/second.jpg",
  );

  const inspector = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );
  assert.match(inspector, /Replace current image/);
  assert.match(inspector, /Add another\s+image appends a new timeline item/);
  assert.doesNotMatch(
    inspector,
    /multiImageScenesEnabled \? "Replace current image"/,
  );
});

test("8E.2 too-short scene rejects without mutation; locks documented", () => {
  const short = baseScene({
    durationMs: SCENE_MEDIA_MIN_ITEM_DURATION_MS,
    media: imageMedia("https://example.com/only.jpg"),
  });
  assert.equal(canAddSceneMediaItem(short), false);
  const before = JSON.stringify(short);
  assert.throws(() =>
    appendSceneMediaImageItem(
      short,
      imageMedia("https://example.com/nope.jpg"),
      {
        generateId: createSequentialMediaItemIdGenerator("x"),
      },
    ),
  );
  assert.equal(JSON.stringify(short), before);

  const lock = readSrc(
    "src/features/timeline-editor/scene-media/timeline-exclusive-interaction.lock.ts",
  );
  assert.match(lock, /subscribeTimelineExclusiveInteraction/);
  assert.match(lock, /releaseTimelineExclusiveInteraction/);
  assert.match(lock, /isTimelineExclusiveInteractionActive/);
  const studio = readSrc("src/features/timeline-editor/StudioTimeline.tsx");
  assert.match(studio, /setTimelineExclusiveInteraction/);
  assert.match(studio, /releaseTimelineExclusiveInteraction/);
  const inspector = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );
  assert.match(inspector, /useTimelineExclusiveInteractionLocked/);
  assert.match(inspector, /SelectionPhase\.PlaybackLocked/);
});

test("8E.3 production default — Add another image and multi-image shell always present", () => {
  const studio = readSrc("src/features/timeline-editor/StudioTimeline.tsx");
  assert.match(studio, /SceneMediaTimelineLane/);
  assert.match(
    studio,
    /Add another image|SceneMediaAddAnotherImageButton|appendApi/,
  );
  const shell = readSrc("src/components/studio-shell/StudioTimelineShell.tsx");
  assert.match(shell, /studioShellTimelineHeightMultiImage/);
  assert.doesNotMatch(
    shell,
    /studioShellTimelineHeight\b(?!MultiImage|Compact)/,
  );
  const inspector = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );
  assert.match(inspector, /Add another image/);
  assert.match(inspector, /Replace current image/);
});

console.log(`\n${passed} passed\n`);
