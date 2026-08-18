/**
 * Prompt 2 Preview media lifecycle and clock reconciliation.
 * Behavior-based — no production source-line regex for control flow.
 * Run: npm run test:preview-runtime-parity-lifecycle
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  collectReconciledPreviewMountedLayers,
  inventoryContainsMedia,
} from "@/features/preview/runtime-parity/collect-authoritative-preview-mounted-layers";
import {
  buildPreviewRuntimeParityStory,
  buildThreeVideoEqualWindowScene,
  buildThreeVideoIntraSceneTransitionScene,
} from "@/features/preview/runtime-parity/build-preview-runtime-parity-story";
import {
  buildPreviewMediaPlanSignature,
  resolveIdlePreviewSceneElapsedMs,
  resolvePlaySceneStartMs,
  resolvePreviewClockAfterMediaMutation,
  resolvePreviewClockAfterSceneSelection,
} from "@/features/preview/runtime-parity/reconcile-preview-playback-clock";
import { planReconciledPreviewMediaLayers } from "@/features/preview/runtime-parity/reconcile-preview-media-layer-plan";
import {
  buildPreviewMediaLayerLifecycleKey,
  resolvePreviewMediaLayerIdentity,
  resolvePreviewMediaSourceIdentity,
} from "@/features/preview/runtime-parity/resolve-preview-media-layer-identity";
import { resolvePreviewClockAuthority } from "@/features/preview/runtime-parity/resolve-preview-clock-authority";
import { retirePreviewVideoRuntime } from "@/features/preview/runtime-parity/retire-preview-video-runtime";
import {
  collectScriptMediaUrls,
  registerMountedPreviewMediaSource,
  revokeOwnedPreviewBlobUrlsAbsentFromReferences,
  scheduleOwnedPreviewBlobRevocation,
} from "@/features/preview/runtime-parity/schedule-owned-preview-blob-revocation";
import {
  appendSceneMediaImageItem,
  removeSceneMediaItem,
  reorderSceneMediaItem,
  resolveActiveSceneMediaRenderView,
  resolvePreviewSceneMediaWindows,
  updateSceneMediaItemMedia,
} from "@/features/scene-media-timeline";
import { composeIntraSceneTransitionPreview } from "@/features/scene-media-transitions/preview/compose-intra-scene-transition-preview";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function threeVideoWindows() {
  const scene = buildThreeVideoEqualWindowScene();
  const windows = resolvePreviewSceneMediaWindows(scene, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(windows.length, 3);
  return { scene, windows };
}

function mountedAt(
  scene: ReturnType<typeof buildThreeVideoEqualWindowScene>,
  sceneElapsedMs: number,
  isPlaying = false,
) {
  return collectReconciledPreviewMountedLayers({
    scene,
    sceneElapsedMs,
    isPlaying,
    mixedMediaScenesEnabled: true,
  });
}

test("1. removing the current first, middle, and last item drops that identity", () => {
  const { scene, windows } = threeVideoWindows();
  for (const window of windows) {
    const mid = window.startMs + Math.floor(window.durationMs / 2);
    const before = mountedAt(scene, mid);
    assert.equal(before.mediaItemIds[0], window.itemId);
    const removed = removeSceneMediaItem(scene, window.itemId).scene;
    const after = mountedAt(removed, mid);
    assert.equal(
      inventoryContainsMedia(after, {
        mediaItemId: window.itemId,
        mediaUrl: window.media.url,
      }),
      false,
    );
    assert.ok(after.mediaItemIds.length > 0 || after.layers.length === 0);
  }
});

test("2. removing a non-current item leaves the current primary unchanged", () => {
  const { scene, windows } = threeVideoWindows();
  const current = windows[0]!;
  const other = windows[2]!;
  const removed = removeSceneMediaItem(scene, other.itemId).scene;
  const after = mountedAt(removed, current.startMs + 200);
  assert.equal(after.mediaItemIds[0], current.itemId);
  assert.equal(after.mediaItemIds.includes(other.itemId), false);
});

test("3. replacement keeps the item id and retires the old source", () => {
  const { scene, windows } = threeVideoWindows();
  const current = windows[1]!;
  const nextUrl = "/preview-runtime-parity/image-q.svg";
  const replaced = updateSceneMediaItemMedia(scene, current.itemId, {
    type: "image",
    url: nextUrl,
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  }).scene;
  const after = mountedAt(replaced, current.startMs + 200);
  assert.equal(after.mediaItemIds[0], current.itemId);
  assert.equal(after.mediaUrls.includes(current.media.url ?? ""), false);
  assert.equal(after.mediaUrls.includes(nextUrl), true);
  const beforeKey = buildPreviewMediaLayerLifecycleKey({
    role: "primary",
    sceneId: scene.id,
    mediaItemId: current.itemId,
    sourceIdentity: resolvePreviewMediaSourceIdentity(current.media.url),
  });
  const afterKey = buildPreviewMediaLayerLifecycleKey({
    role: "primary",
    sceneId: scene.id,
    mediaItemId: current.itemId,
    sourceIdentity: resolvePreviewMediaSourceIdentity(nextUrl),
  });
  assert.notEqual(beforeKey, afterKey);
});

test("4. reorder at a clock that previously belonged to another item remounts the new owner", () => {
  const { scene, windows } = threeVideoWindows();
  const first = windows[0]!;
  const last = windows[2]!;
  const clockInFirst = first.startMs + 200;
  const before = mountedAt(scene, clockInFirst);
  assert.equal(before.mediaItemIds[0], first.itemId);
  const reordered = reorderSceneMediaItem(scene, last.itemId, 0).scene;
  const after = mountedAt(reordered, clockInFirst);
  assert.equal(after.mediaItemIds[0], last.itemId);
  assert.equal(after.mediaItemIds.includes(first.itemId), false);
  assert.equal(
    (reordered.mediaTimeline?.items ?? []).some((item) => item.id === first.itemId),
    true,
  );
});

test("5. deleting an incoming or outgoing transition peer drops that peer", () => {
  const scene = buildThreeVideoIntraSceneTransitionScene();
  let composition = null;
  for (let elapsed = 0; elapsed <= 9_000; elapsed += 50) {
    composition = composeIntraSceneTransitionPreview(scene, elapsed, {
      mixedMediaScenesEnabled: true,
    });
    if (composition) break;
  }
  assert.ok(composition);
  const elapsed = 3_000;
  for (const mediaItemId of [composition.fromMediaItemId, composition.toMediaItemId]) {
    const removed = removeSceneMediaItem(scene, mediaItemId).scene;
    const plan = planReconciledPreviewMediaLayers({
      scene: removed,
      sceneElapsedMs: elapsed,
      isPlaying: true,
      mixedMediaScenesEnabled: true,
    });
    const mounted = mountedAt(removed, elapsed, true);
    assert.equal(mounted.mediaItemIds.includes(mediaItemId), false);
    assert.equal(plan.intraScene, null);
    assert.equal(plan.outgoing, null);
    assert.ok(plan.primary.view.mediaItemId);
    assert.notEqual(plan.primary.view.mediaItemId, mediaItemId);
  }
});

test("6. deleting the final remaining item leaves no mounted media identity", () => {
  let scene = buildThreeVideoEqualWindowScene();
  const windows = resolvePreviewSceneMediaWindows(scene, {
    mixedMediaScenesEnabled: true,
  });
  for (const window of windows) {
    scene = removeSceneMediaItem(scene, window.itemId).scene;
  }
  const after = mountedAt(scene, 200);
  assert.deepEqual(after.mediaItemIds, []);
  assert.deepEqual(after.mediaUrls, []);
});

test("7. rapid remove → add → remove never remounts a retired id or url", () => {
  const { scene, windows } = threeVideoWindows();
  const first = windows[0]!;
  const removed = removeSceneMediaItem(scene, first.itemId).scene;
  const added = appendSceneMediaImageItem(removed, {
    type: "image",
    url: "/preview-runtime-parity/image-q.svg",
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  }).scene;
  const addedWindows = resolvePreviewSceneMediaWindows(added, {
    mixedMediaScenesEnabled: true,
  });
  const newest = addedWindows[addedWindows.length - 1]!;
  const removedAgain = removeSceneMediaItem(added, newest.itemId).scene;
  const after = mountedAt(removedAgain, 200);
  assert.equal(after.mediaItemIds.includes(first.itemId), false);
  assert.equal(after.mediaItemIds.includes(newest.itemId), false);
  assert.equal(after.mediaUrls.includes(first.media.url ?? ""), false);
  assert.equal(after.mediaUrls.includes(newest.media.url ?? ""), false);
});

test("8. owned blob URL revocation waits until the mounted source unregisters", () => {
  const originalRevoke = URL.revokeObjectURL;
  const revoked: string[] = [];
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };
  try {
    const owned = new Set(["blob:owned-preview"]);
    let runTask = () => {};
    const unregister = registerMountedPreviewMediaSource("blob:owned-preview");
    const first = scheduleOwnedPreviewBlobRevocation({
      url: "blob:owned-preview",
      owned,
      schedule: (task) => {
        runTask = task;
        return () => {};
      },
    });
    assert.equal(first.scheduled, true);
    runTask();
    assert.deepEqual(revoked, []);
    assert.equal(owned.has("blob:owned-preview"), true);

    unregister();
    const second = scheduleOwnedPreviewBlobRevocation({
      url: "blob:owned-preview",
      owned,
      schedule: (task) => {
        runTask = task;
        return () => {};
      },
    });
    assert.equal(second.scheduled, true);
    runTask();
    assert.deepEqual(revoked, ["blob:owned-preview"]);
    assert.equal(owned.has("blob:owned-preview"), false);

    const third = scheduleOwnedPreviewBlobRevocation({
      url: "blob:owned-preview",
      owned,
      schedule: (task) => {
        runTask = task;
        return () => {};
      },
    });
    assert.equal(third.scheduled, false);
  } finally {
    URL.revokeObjectURL = originalRevoke;
  }
});

test("9. non-owned URLs are never revoked", () => {
  const originalRevoke = URL.revokeObjectURL;
  const revoked: string[] = [];
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };
  try {
    const owned = new Set(["blob:owned-preview"]);
    let ran = false;
    const foreign = scheduleOwnedPreviewBlobRevocation({
      url: "https://cdn.example/video.mp4",
      owned,
      schedule: (task) => {
        ran = true;
        task();
        return () => {};
      },
    });
    assert.equal(foreign.scheduled, false);
    assert.equal(ran, false);
    const unownedBlob = scheduleOwnedPreviewBlobRevocation({
      url: "blob:foreign",
      owned,
      schedule: (task) => {
        ran = true;
        task();
        return () => {};
      },
    });
    assert.equal(unownedBlob.scheduled, false);
    assert.deepEqual(revoked, []);
  } finally {
    URL.revokeObjectURL = originalRevoke;
  }
});

test("10. video, seek-loop, and background-paint cleanup is idempotent", () => {
  const cancelled: number[] = [];
  const video = {
    paused: false,
    src: "blob:retired",
    pause() {
      this.paused = true;
    },
    removeAttribute(name: string) {
      if (name === "src") this.src = "";
    },
    load() {
      this.src = "";
    },
  };
  const first = retirePreviewVideoRuntime({
    video,
    seekRafId: 11,
    paintRafId: 22,
    cancelAnimationFrame: (id) => cancelled.push(id),
    clearSource: true,
  });
  assert.deepEqual(cancelled, [11, 22]);
  assert.equal(first.paused, true);
  assert.equal(first.sourceCleared, true);
  assert.equal(video.paused, true);
  assert.equal(video.src, "");
  const second = retirePreviewVideoRuntime({
    video,
    seekRafId: null,
    paintRafId: null,
    cancelAnimationFrame: (id) => cancelled.push(id),
    clearSource: true,
  });
  assert.equal(second.paused, true);
  assert.equal(video.src, "");
  retirePreviewVideoRuntime({
    video: {
      get paused() {
        throw new Error("pause must not be terminal");
      },
      src: "blob:boom",
      pause() {
        throw new Error("pause must not be terminal");
      },
      removeAttribute() {
        throw new Error("clear must not be terminal");
      },
    },
    seekRafId: 3,
    paintRafId: 4,
    cancelAnimationFrame: () => {
      throw new Error("cancel must not be terminal");
    },
    clearSource: true,
  });
});

test("11. scene change and return after deletion keeps the removed id retired", () => {
  const story = buildPreviewRuntimeParityStory("clock-lifecycle-two-scenes");
  const firstScene = story.scenes[0]!;
  const windows = resolvePreviewSceneMediaWindows(firstScene, {
    mixedMediaScenesEnabled: true,
  });
  const removedId = windows[0]!.itemId;
  const edited = removeSceneMediaItem(firstScene, removedId).scene;
  const nextScenes = story.scenes.map((scene, index) =>
    index === 0 ? edited : scene,
  );
  const selected = resolvePreviewClockAfterSceneSelection({
    scenes: nextScenes,
    sceneIndex: 1,
    timelineMs: 8_000,
    clockKind: "completed-story",
    isPlaying: false,
  });
  assert.ok(selected);
  assert.equal(selected.sceneIndex, 1);
  const returned = resolvePreviewClockAfterSceneSelection({
    scenes: nextScenes,
    sceneIndex: 0,
    timelineMs: selected.timelineMs,
    clockKind: "completed-story",
    isPlaying: false,
  });
  assert.ok(returned);
  const after = mountedAt(edited, returned.sceneElapsedMs);
  assert.equal(after.mediaItemIds.includes(removedId), false);
});

test("12. completed scene playback can restart from that scene start", () => {
  const story = buildPreviewRuntimeParityStory("clock-lifecycle-two-scenes");
  const completed = resolvePreviewClockAuthority({
    action: "complete-scene",
    scenes: story.scenes,
    sceneIndex: 0,
    timelineMs: 8_000,
  });
  assert.equal(completed.kind, "completed-scene");
  const replay = resolvePreviewClockAuthority({
    action: "restart-scene",
    scenes: story.scenes,
    sceneIndex: 0,
    timelineMs: completed.timelineMs,
  });
  assert.equal(replay.kind, "idle");
  assert.equal(replay.timelineMs, story.scenes[0]?.startMs ?? 0);
  const play = resolvePlaySceneStartMs({
    clockKind: "completed-scene",
    playbackScope: "scene",
    sceneIndex: 0,
    scopedSceneIndex: 0,
    timelineMs: completed.timelineMs,
    startMs: story.scenes[0]!.startMs ?? 0,
    endMs: story.scenes[0]!.endMs ?? 9_000,
  });
  assert.equal(play.resume, false);
  assert.equal(play.startMs, story.scenes[0]!.startMs ?? 0);
});

test("13. completed story playback can select and replay an earlier scene", () => {
  const story = buildPreviewRuntimeParityStory("clock-lifecycle-two-scenes");
  const completed = resolvePreviewClockAuthority({
    action: "complete-story",
    scenes: story.scenes,
    sceneIndex: 1,
    timelineMs: 20_000,
  });
  assert.equal(completed.kind, "completed-story");
  const selected = resolvePreviewClockAfterSceneSelection({
    scenes: story.scenes,
    sceneIndex: 0,
    timelineMs: completed.timelineMs,
    clockKind: "completed-story",
    isPlaying: false,
  });
  assert.ok(selected);
  assert.equal(selected.kind, "idle");
  assert.equal(selected.sceneIndex, 0);
  assert.equal(selected.timelineMs, story.scenes[0]?.startMs ?? 0);
  const storyReplay = resolvePreviewClockAuthority({
    action: "restart-story",
    scenes: story.scenes,
    sceneIndex: completed.sceneIndex,
    timelineMs: completed.timelineMs,
  });
  assert.equal(storyReplay.timelineMs, 0);
  assert.equal(storyReplay.sceneIndex, 0);
});

test("14. media edits after completion restart the selected scene clock", () => {
  const { scene, windows } = threeVideoWindows();
  const scenes = [{ ...scene, startMs: 0, endMs: scene.durationMs ?? 9_000 }];
  const afterEdit = resolvePreviewClockAfterMediaMutation({
    scenes,
    sceneIndex: 0,
    timelineMs: 8_999,
    clockKind: "completed-scene",
  });
  assert.equal(afterEdit.kind, "idle");
  assert.equal(afterEdit.timelineMs, 0);
  const replaced = updateSceneMediaItemMedia(scene, windows[0]!.itemId, {
    type: "image",
    url: "/preview-runtime-parity/image-p.svg",
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  }).scene;
  const mounted = mountedAt(replaced, afterEdit.sceneElapsedMs);
  assert.equal(mounted.mediaUrls.includes("/preview-runtime-parity/image-p.svg"), true);
});

test("15. outside a transition the canonical active id equals the mounted primary", () => {
  const { scene, windows } = threeVideoWindows();
  const mid = windows[1]!.startMs + 200;
  const plan = planReconciledPreviewMediaLayers({
    scene,
    sceneElapsedMs: mid,
    isPlaying: false,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(plan.outgoing, null);
  assert.equal(plan.primary.view.mediaItemId, windows[1]!.itemId);
  const mounted = mountedAt(scene, mid);
  assert.deepEqual(mounted.mediaItemIds, [windows[1]!.itemId]);
});

test("16. during a transition mounted ids equal the canonical primary/outgoing plan", () => {
  const scene = buildThreeVideoIntraSceneTransitionScene();
  let composition = null;
  let elapsed = 0;
  for (elapsed = 0; elapsed <= 9_000; elapsed += 50) {
    composition = composeIntraSceneTransitionPreview(scene, elapsed, {
      mixedMediaScenesEnabled: true,
    });
    if (composition) break;
  }
  assert.ok(composition);
  const plan = planReconciledPreviewMediaLayers({
    scene,
    sceneElapsedMs: elapsed,
    isPlaying: true,
    mixedMediaScenesEnabled: true,
  });
  assert.ok(plan.outgoing);
  assert.equal(plan.primary.view.mediaItemId, composition.toMediaItemId);
  assert.equal(plan.outgoing?.view.mediaItemId, composition.fromMediaItemId);
  const mounted = mountedAt(scene, elapsed, true);
  assert.deepEqual(new Set(mounted.mediaItemIds), new Set([
    composition.fromMediaItemId,
    composition.toMediaItemId,
  ]));
});

test("17. no removed id or url remains in mounted-layer diagnostics", () => {
  const { scene, windows } = threeVideoWindows();
  const removed = windows[1]!;
  const next = removeSceneMediaItem(scene, removed.itemId).scene;
  const after = mountedAt(next, removed.startMs + 200);
  assert.equal(after.mediaItemIds.includes(removed.itemId), false);
  assert.equal(after.mediaUrls.includes(removed.media.url ?? ""), false);
  const staleView = resolveActiveSceneMediaRenderView(scene, removed.startMs + 200, {
    mixedMediaScenesEnabled: true,
  });
  const remaining = resolvePreviewSceneMediaWindows(next, {
    mixedMediaScenesEnabled: true,
  });
  const identity = resolvePreviewMediaLayerIdentity({
    sceneId: next.id,
    role: "primary",
    view: staleView,
    authoritativeItemIds: new Set(remaining.map((window) => window.itemId)),
    authoritativeSources: new Set(
      remaining
        .map((window) => window.media.url)
        .filter((url): url is string => Boolean(url)),
    ),
  });
  assert.equal(identity.authority, "retired");
});

test("18. Browser/Headless production files do not import Preview lifecycle modules", () => {
  const exportFiles = [
    "src/features/export/services/video-render.service.ts",
    "src/features/export/utils/ffmpeg.utils.ts",
    "src/features/export/utils/export-preflight.utils.ts",
    "src/features/headless-renderer/worker/runtime/execute-render-job.ts",
  ];
  for (const file of exportFiles) {
    const source = readSrc(file);
    assert.doesNotMatch(source, /reconcilePreviewMediaLayerPlan/);
    assert.doesNotMatch(source, /retirePreviewVideoRuntime/);
    assert.doesNotMatch(source, /scheduleOwnedPreviewBlobRevocation/);
    assert.doesNotMatch(source, /selectedMediaItemId/);
  }
});

test("lifecycle keys ignore clock ticks and distinguish role/item/source/scene", () => {
  const key = buildPreviewMediaLayerLifecycleKey({
    role: "primary",
    sceneId: "scene-a",
    mediaItemId: "item-1",
    sourceIdentity: "blob:one",
  });
  assert.equal(
    key,
    buildPreviewMediaLayerLifecycleKey({
      role: "primary",
      sceneId: "scene-a",
      mediaItemId: "item-1",
      sourceIdentity: "blob:one",
    }),
  );
  assert.notEqual(
    key,
    buildPreviewMediaLayerLifecycleKey({
      role: "outgoing",
      sceneId: "scene-a",
      mediaItemId: "item-1",
      sourceIdentity: "blob:one",
    }),
  );
});

test("Play Scene resumes only a valid paused scene-scope session", () => {
  const resume = resolvePlaySceneStartMs({
    clockKind: "paused",
    playbackScope: "scene",
    sceneIndex: 1,
    scopedSceneIndex: 1,
    timelineMs: 4_500,
    startMs: 4_000,
    endMs: 8_000,
  });
  assert.equal(resume.resume, true);
  assert.equal(resume.startMs, 4_500);
  const restart = resolvePlaySceneStartMs({
    clockKind: "paused",
    playbackScope: "story",
    sceneIndex: 1,
    scopedSceneIndex: 1,
    timelineMs: 4_500,
    startMs: 4_000,
    endMs: 8_000,
  });
  assert.equal(restart.resume, false);
  assert.equal(restart.startMs, 4_000);
});

test("idle elapsed clamps to the selected scene instead of a completed story clock", () => {
  const story = buildPreviewRuntimeParityStory("clock-lifecycle-two-scenes");
  const first = story.scenes[0]!;
  const elapsed = resolveIdlePreviewSceneElapsedMs({
    scene: first,
    sceneIndex: 0,
    timelineMs: 20_000,
  });
  assert.ok(elapsed < (first.durationMs ?? 9_000));
  assert.equal(
    buildPreviewMediaPlanSignature(story.scenes, 0) !==
      buildPreviewMediaPlanSignature(story.scenes, 1),
    true,
  );
});

test("unreferenced owned URLs can be revoked without touching script URLs", () => {
  const originalRevoke = URL.revokeObjectURL;
  const revoked: string[] = [];
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };
  try {
    const story = buildPreviewRuntimeParityStory("three-videos-equal-windows");
    const referenced = collectScriptMediaUrls(story);
    const leftover = "blob:leftover-unmounted";
    const owned = new Set([...referenced, leftover]);
    const revokedUrls = revokeOwnedPreviewBlobUrlsAbsentFromReferences({
      owned,
      referencedUrls: referenced,
    });
    assert.deepEqual(revokedUrls, [leftover]);
    assert.equal(owned.has(leftover), false);
    for (const url of referenced) {
      assert.equal(owned.has(url), true);
    }
  } finally {
    URL.revokeObjectURL = originalRevoke;
  }
});

test("production Preview wires reconciliation and selected-media inspection", () => {
  const previewFrame = readSrc("src/features/preview/components/PreviewFrame.tsx");
  const video = readSrc("src/features/editor/components/SceneFrameVideo.tsx");
  const playback = readSrc("src/features/preview/hooks/usePreviewPlayback.ts");
  const append = readSrc(
    "src/features/timeline-editor/scene-media/useSceneMediaImageAppend.ts",
  );
  const mixed = readSrc(
    "src/features/mixed-media-scenes/editor/useMixedMediaSequenceUpload.ts",
  );
  assert.match(previewFrame, /planPreviewMediaLayers/);
  assert.match(previewFrame, /reconcilePreviewMediaLayerPlan/);
  assert.match(previewFrame, /buildPreviewMediaLayerLifecycleKey/);
  assert.match(previewFrame, /selectedMediaItemId/);
  assert.match(video, /retirePreviewVideoRuntime/);
  assert.match(video, /registerMountedPreviewMediaSource/);
  assert.doesNotMatch(video, /selectedMediaItemId/);
  assert.match(playback, /resolvePlaySceneStartMs/);
  assert.match(playback, /completed-scene/);
  assert.match(playback, /resolvePreviewClockAfterSceneSelection/);
  assert.doesNotMatch(playback, /selectedMediaItemId/);
  assert.match(append, /scheduleOwnedPreviewBlobRevocation/);
  assert.match(append, /Intentionally no unmount revoke/);
  assert.match(mixed, /scheduleOwnedPreviewBlobRevocation/);
});

console.log(`\nAll preview runtime-parity lifecycle checks passed (${passed}).`);
