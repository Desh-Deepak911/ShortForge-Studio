/**
 * Mixed-media scenes focused verification (capability + architecture).
 * Run: npm run test:mixed-media-scenes
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import {
  appendMixedMediaSequenceItem,
  isInspectorSelectableMediaItemId,
  isMixedMediaScenesCapabilityEnabled,
  normalizeVisualSequence,
  projectSceneVisualPlan,
  reconcileVisualSequenceRenderAuthority,
  removeMixedMediaSequenceItem,
  reorderMixedMediaSequenceItem,
  resolveInspectorSceneMediaProjection,
  resolveNearestInspectorMediaItemId,
  updateMixedMediaSequenceBoundary,
  updateMixedMediaSequenceItemDuration,
  updateMixedMediaSequenceItemTiming,
} from "@/features/mixed-media-scenes";
import {
  revokeFailedAppendObjectUrl,
  revokeRemovedOwnedMediaUrl,
  shouldRevokeOnOwnerUnmount,
  trackOwnedObjectUrl,
} from "@/features/mixed-media-scenes/editor/mixed-media-blob-ownership";
import { resolveMixedMediaScenesEnabledFromEnvironment } from "@/features/mixed-media-scenes/server/resolve-mixed-media-scenes-enabled";
import {
  applyBuiltMediaTimelineToScene,
  resolveActiveSceneMediaRenderView,
  resolvePreviewSceneMediaWindows,
} from "@/features/scene-media-timeline";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import {
  resolveVisualRetentionGatesFromEnvironment,
  resolveVisualRetentionPhaseGates,
} from "@/features/visual-retention";
import { syncFootieScript } from "@/lib/utils/voiceover";

function imageMedia(url: string): SceneMedia {
  return { type: "image", url, source: "upload", fitMode: "cover" };
}

function videoMedia(url: string): SceneMedia {
  return {
    type: "video",
    url,
    source: "upload",
    fitMode: "cover",
    durationMs: 8000,
    trimStartMs: 0,
    trimEndMs: 8000,
    muted: true,
  };
}

function sceneStub(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 10,
    duration: 10,
    startMs: 0,
    endMs: 10000,
    durationMs: 10000,
    subtitle: "Hello",
    narration: "Hello",
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

function scriptFromScene(scene: FootieScene): FootieScript {
  return syncFootieScript({
    title: "mixed-media test",
    narration: "Hello world narration for the scene.",
    totalDuration: 10,
    scenes: [scene],
  });
}

function divergentScene(): FootieScene {
  return sceneStub({
    visualSequence: {
      version: 1,
      items: [
        {
          id: "a",
          media: imageMedia("https://example.com/seq-a.jpg"),
          startOffsetMs: 0,
          durationMs: 3000,
        },
        {
          id: "b",
          media: videoMedia("https://example.com/seq-b.mp4"),
          startOffsetMs: 3000,
          durationMs: 7000,
        },
      ],
    },
    mediaTimeline: {
      version: 1,
      items: [
        {
          id: "stale-1",
          media: imageMedia("https://example.com/stale.jpg"),
          durationWeight: 1,
        },
      ],
    },
    media: imageMedia("https://example.com/stale.jpg"),
  });
}

function assertWindowParity(
  left: ReadonlyArray<{ startMs: number; durationMs: number; media: { type: string } }>,
  right: ReadonlyArray<{
    startMs?: number;
    startOffsetMs?: number;
    durationMs: number;
    media: { type: string };
  }>,
) {
  assert.equal(left.length, right.length);
  for (let i = 0; i < left.length; i += 1) {
    const rightStart = right[i]!.startMs ?? right[i]!.startOffsetMs;
    assert.equal(left[i]!.startMs, rightStart);
    assert.equal(left[i]!.durationMs, right[i]!.durationMs);
    assert.equal(left[i]!.media.type, right[i]!.media.type);
  }
}

function testCapabilityDefaultOff(): void {
  const gates = resolveVisualRetentionPhaseGates({
    deploymentTarget: "staging",
    sourceBranch: "staging",
  });
  assert.equal(isMixedMediaScenesCapabilityEnabled(gates), false);

  const production = resolveVisualRetentionGatesFromEnvironment({
    HEADLESS_ENV_NAME: "staging",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "staging",
    SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES: "12A,12B",
  });
  assert.equal(isMixedMediaScenesCapabilityEnabled(production), false);
  assert.equal(
    resolveMixedMediaScenesEnabledFromEnvironment({
      HEADLESS_ENV_NAME: "staging",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "staging",
      SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES: "12A,12B",
    }),
    false,
  );
}

function testCapabilityStagingOn(): void {
  const gates = resolveVisualRetentionPhaseGates({
    deploymentTarget: "staging",
    sourceBranch: "staging",
    requestedPhases: "12A,12B",
  });
  assert.equal(isMixedMediaScenesCapabilityEnabled(gates), true);
  assert.equal(
    resolveMixedMediaScenesEnabledFromEnvironment({
      HEADLESS_ENV_NAME: "staging",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES: "12A,12B",
    }),
    true,
  );
}

function testStagingWithoutMixedMediaTimelineWins(): void {
  const gates = resolveVisualRetentionPhaseGates({
    deploymentTarget: "staging",
    sourceBranch: "staging",
    requestedPhases: "12A",
  });
  assert.equal(isMixedMediaScenesCapabilityEnabled(gates), false);

  const scene = divergentScene();
  const preview = resolvePreviewSceneMediaWindows(scene, {
    mixedMediaScenesEnabled: false,
  });
  assert.equal(preview.length, 1);
  assert.equal(preview[0]?.media.url, "https://example.com/stale.jpg");

  const manifest = buildExportManifest({
    story: scriptFromScene(scene),
    environment: CAPABLE_ENV,
    mixedMediaScenesEnabled: false,
  });
  assert.equal(manifest.scenes[0]?.mediaTimeline.items.length, 1);
  assert.match(
    String(manifest.scenes[0]?.mediaTimeline.items[0]?.media.source ?? ""),
    /stale/,
  );
}

function testProductionLookingEnvDoesNotActivate(): void {
  const enabled = resolveMixedMediaScenesEnabledFromEnvironment({
    HEADLESS_ENV_NAME: "staging",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "staging",
    SHORTFORGE_STAGING_VISUAL_RETENTION_PHASES: "12A,12B",
  });
  assert.equal(enabled, false);

  const scene = divergentScene();
  const plan = projectSceneVisualPlan(scene, {
    mixedMediaScenesEnabled: enabled,
  });
  assert.equal(plan.fromVisualSequence, false);
  assert.equal(plan.windows.length, 1);
}

function testCapabilityRequestFailureFailClosedSource(): void {
  const sharedProvider = readFileSync(
    path.join(
      process.cwd(),
      "src/features/visual-retention/client/VisualRetentionCapabilitiesContext.tsx",
    ),
    "utf8",
  );
  assert.match(sharedProvider, /VISUAL_RETENTION_CAPABILITIES_DISABLED/);
  assert.match(sharedProvider, /if \(!response\.ok\)/);
  assert.match(sharedProvider, /\.catch\(/);
  assert.match(sharedProvider, /mixedMediaScenesEnabled: false/);

  const compat = readFileSync(
    path.join(
      process.cwd(),
      "src/features/mixed-media-scenes/client/MixedMediaScenesCapabilityContext.tsx",
    ),
    "utf8",
  );
  assert.match(compat, /useMixedMediaScenesEnabled/);
  assert.match(compat, /MixedMediaScenesCapabilityProvider/);
}

function testValidStagingSequenceWins(): void {
  const scene = divergentScene();
  const reconciled = reconcileVisualSequenceRenderAuthority(scene, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(reconciled.authority, "visual_sequence");
  assert.equal(reconciled.divergedFromStoredTimeline, true);
  assert.ok(
    reconciled.warnings.some((w) => w.code === "timeline_diverged_from_sequence"),
  );
  assert.equal(reconciled.windows.length, 2);
  assert.equal(reconciled.windows[0]?.durationMs, 3000);
}

function testDivergentDisabledTimelineWins(): void {
  const scene = divergentScene();
  const reconciled = reconcileVisualSequenceRenderAuthority(scene, {
    mixedMediaScenesEnabled: false,
  });
  assert.equal(reconciled.fromVisualSequence, false);
  assert.equal(reconciled.authority, "media_timeline");
  assert.equal(reconciled.windows.length, 1);
  assert.equal(reconciled.windows[0]?.media.url, "https://example.com/stale.jpg");
}

function testPreviewBrowserHeadlessSameCapabilityDecision(): void {
  const scene = divergentScene();
  const script = scriptFromScene(scene);

  for (const enabled of [true, false] as const) {
    const preview = resolvePreviewSceneMediaWindows(scene, {
      mixedMediaScenesEnabled: enabled,
    });
    const active = resolveActiveSceneMediaRenderView(scene, 1000, {
      mixedMediaScenesEnabled: enabled,
    });
    const prepared = prepareStoryForExport(script, {
      mixedMediaScenesEnabled: enabled,
    });
    const manifest = buildExportManifest({
      story: script,
      environment: CAPABLE_ENV,
      prepared,
      mixedMediaScenesEnabled: enabled,
    });

    if (enabled) {
      assert.equal(preview.length, 2);
      assert.equal(active.mediaItemId, "a");
      assert.equal(manifest.scenes[0]?.mediaTimeline.items.length, 2);
      assertWindowParity(preview, manifest.scenes[0]!.mediaTimeline.items);
    } else {
      assert.equal(preview.length, 1);
      assert.equal(active.media?.url, "https://example.com/stale.jpg");
      assert.equal(manifest.scenes[0]?.mediaTimeline.items.length, 1);
    }
  }
}

function testUnsetCapabilityDefaultsForceOff(): void {
  const scene = divergentScene();
  // Production entry points must not activate via implicit "auto".
  const plan = projectSceneVisualPlan(scene, {});
  assert.equal(plan.fromVisualSequence, false);
  assert.equal(plan.windows.length, 1);

  const preview = resolvePreviewSceneMediaWindows(scene);
  assert.equal(preview.length, 1);
}

function testVisualSequenceOnlyWhenEnabled(): void {
  const sequenceOnly = sceneStub({
    visualSequence: {
      version: 1,
      items: [
        {
          id: "a",
          media: imageMedia("https://example.com/1.jpg"),
          startOffsetMs: 0,
          durationMs: 4000,
        },
        {
          id: "b",
          media: videoMedia("https://example.com/2.mp4"),
          startOffsetMs: 4000,
          durationMs: 6000,
        },
      ],
    },
  });

  const disabledPreview = resolvePreviewSceneMediaWindows(sequenceOnly, {
    mixedMediaScenesEnabled: false,
  });
  assert.equal(disabledPreview.length, 0);

  const enabledPreview = resolvePreviewSceneMediaWindows(sequenceOnly, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(enabledPreview.length, 2);

  const prepared = prepareStoryForExport(scriptFromScene(sequenceOnly), {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(prepared.story.scenes[0]?.mediaTimeline?.items.length, 2);

  const manifest = buildExportManifest({
    story: scriptFromScene(sequenceOnly),
    environment: CAPABLE_ENV,
    prepared,
    mixedMediaScenesEnabled: true,
  });
  assert.equal(manifest.scenes[0]?.mediaTimeline.items[0]?.durationMs, 4000);
  assert.equal(manifest.scenes[0]?.mediaTimeline.items[1]?.durationMs, 6000);
}

function testVoiceoverRefitThenVisualReconcile(): void {
  const editorScene = sceneStub({
    duration: 5,
    durationMs: 5000,
    end: 5,
    endMs: 5000,
    visualSequence: {
      version: 1,
      items: [
        {
          id: "a",
          media: imageMedia("https://example.com/1.jpg"),
          startOffsetMs: 0,
          durationMs: 2000,
        },
        {
          id: "b",
          media: videoMedia("https://example.com/2.mp4"),
          startOffsetMs: 2000,
          durationMs: 3000,
        },
      ],
    },
    mediaTimeline: {
      version: 1,
      items: [
        {
          id: "a",
          media: imageMedia("https://example.com/1.jpg"),
          durationWeight: 2000,
        },
        {
          id: "b",
          media: videoMedia("https://example.com/2.mp4"),
          durationWeight: 3000,
        },
      ],
    },
    media: imageMedia("https://example.com/1.jpg"),
  });

  const editorStory = syncFootieScript({
    title: "refit-mixed-media",
    narration: "This narration is intentionally longer than five seconds so voiceover refit expands the scene.",
    totalDuration: 5,
    scenes: [editorScene],
    voiceoverUrl: "https://example.com/voice.mp3",
    voiceoverDurationMs: 12000,
  });

  const originalDurationMs = editorStory.scenes[0]!.durationMs;
  const prepared = prepareStoryForExport(editorStory, {
    mixedMediaScenesEnabled: true,
  });

  // Editor object must remain untouched.
  assert.equal(editorStory.scenes[0]!.durationMs, originalDurationMs);
  assert.equal(editorStory.scenes[0]!.visualSequence?.items[1]?.durationMs, 3000);

  const exportScene = prepared.story.scenes[0]!;
  assert.ok((exportScene.durationMs ?? 0) > (originalDurationMs ?? 0));

  const totalVisual = exportScene.visualSequence!.items.reduce(
    (sum, item) => sum + item.durationMs,
    0,
  );
  assert.equal(totalVisual, exportScene.durationMs);

  const browserManifest = buildExportManifest({
    story: editorStory,
    environment: CAPABLE_ENV,
    prepared,
    mixedMediaScenesEnabled: true,
  });
  const headlessManifest = buildExportManifest({
    story: editorStory,
    environment: {
      ...CAPABLE_ENV,
      serverRendererAvailable: true,
    },
    prepared,
    mixedMediaScenesEnabled: true,
  });

  assertWindowParity(
    browserManifest.scenes[0]!.mediaTimeline.items.map((item) => ({
      startMs: item.startOffsetMs,
      durationMs: item.durationMs,
      media: { type: item.media.type },
    })),
    headlessManifest.scenes[0]!.mediaTimeline.items.map((item) => ({
      startMs: item.startOffsetMs,
      durationMs: item.durationMs,
      media: { type: item.media.type },
    })),
  );

  const exportTotal = browserManifest.scenes[0]!.mediaTimeline.items.reduce(
    (sum, item) => sum + item.durationMs,
    0,
  );
  assert.equal(exportTotal, exportScene.durationMs);
}

function testNoCircularBarrelImports(): void {
  const repoRoot = process.cwd();
  const reconcile = readFileSync(
    path.join(
      repoRoot,
      "src/features/mixed-media-scenes/adapters/reconcile-visual-sequence-authority.ts",
    ),
    "utf8",
  );
  const projectVisual = readFileSync(
    path.join(
      repoRoot,
      "src/features/mixed-media-scenes/adapters/project-visual-sequence.ts",
    ),
    "utf8",
  );
  const resolveActive = readFileSync(
    path.join(
      repoRoot,
      "src/features/scene-media-timeline/adapters/resolve-active-scene-media-render-view.ts",
    ),
    "utf8",
  );

  assert.doesNotMatch(
    reconcile,
    /from ["']@\/features\/scene-media-timeline["']/,
  );
  assert.doesNotMatch(
    projectVisual,
    /from ["']@\/features\/scene-media-timeline["']/,
  );
  assert.match(
    reconcile,
    /from ["']@\/features\/scene-media-timeline\/adapters\/project-scene-media-timeline["']/,
  );
  assert.match(
    reconcile,
    /from ["']@\/features\/scene-media-timeline\/resolution\/resolve-media-windows["']/,
  );
  assert.match(
    resolveActive,
    /from ["']@\/features\/mixed-media-scenes\/adapters\/project-visual-sequence["']/,
  );
  assert.doesNotMatch(
    resolveActive,
    /from ["']@\/features\/mixed-media-scenes["']/,
  );
}

function testLegacySingleImage(): void {
  const scene = sceneStub({
    media: imageMedia("https://example.com/a.jpg"),
  });
  const plan = projectSceneVisualPlan(scene, { mixedMediaScenesEnabled: false });
  assert.equal(plan.fromVisualSequence, false);
  assert.equal(plan.windows.length, 1);
}

function testLegacySingleVideo(): void {
  const scene = sceneStub({
    media: videoMedia("https://example.com/a.mp4"),
  });
  const plan = projectSceneVisualPlan(scene, { mixedMediaScenesEnabled: false });
  assert.equal(plan.windows[0]?.media.type, "video");
}

function testMixedSequenceReorderDeleteRoundTrip(): void {
  let scene = sceneStub();
  scene = appendMixedMediaSequenceItem(scene, imageMedia("https://example.com/1.jpg"), {
    mixedMediaScenesEnabled: true,
    generateId: () => "item-1",
  }).scene;
  scene = appendMixedMediaSequenceItem(scene, videoMedia("https://example.com/2.mp4"), {
    mixedMediaScenesEnabled: true,
    generateId: () => "item-2",
  }).scene;
  scene = reorderMixedMediaSequenceItem(scene, "item-2", 0, {
    mixedMediaScenesEnabled: true,
  }).scene;
  scene = removeMixedMediaSequenceItem(scene, "item-2", {
    mixedMediaScenesEnabled: true,
  }).scene;
  const normalized = normalizeVisualSequence(scene.visualSequence, 10000);
  assert.ok(normalized.sequence);
}

function testFlagDisabledBlocksCommands(): void {
  const scene = sceneStub({ media: imageMedia("https://example.com/a.jpg") });
  assert.throws(
    () =>
      appendMixedMediaSequenceItem(scene, imageMedia("https://example.com/b.jpg"), {
        mixedMediaScenesEnabled: false,
      }),
    /unavailable/i,
  );
}

function testBoundaryEditingSemantics(): void {
  let scene = sceneStub();
  scene = appendMixedMediaSequenceItem(scene, imageMedia("https://example.com/1.jpg"), {
    mixedMediaScenesEnabled: true,
    generateId: () => "a",
  }).scene;
  scene = appendMixedMediaSequenceItem(scene, videoMedia("https://example.com/2.mp4"), {
    mixedMediaScenesEnabled: true,
    generateId: () => "b",
  }).scene;
  scene = appendMixedMediaSequenceItem(scene, imageMedia("https://example.com/3.jpg"), {
    mixedMediaScenesEnabled: true,
    generateId: () => "c",
  }).scene;

  scene = updateMixedMediaSequenceBoundary(scene, "b", 2000, {
    mixedMediaScenesEnabled: true,
  }).scene;
  assert.equal(scene.visualSequence!.items[0]!.durationMs, 2000);

  const tooEarly = updateMixedMediaSequenceBoundary(scene, "b", 100, {
    mixedMediaScenesEnabled: true,
  });
  assert.ok(tooEarly.warnings.some((w) => w.code === "boundary_clamped"));

  const firstStart = updateMixedMediaSequenceItemTiming(scene, "a", {
    startOffsetMs: 1500,
  }, { mixedMediaScenesEnabled: true });
  assert.ok(firstStart.warnings.some((w) => w.code === "first_item_start_fixed"));
  assert.equal(firstStart.scene.visualSequence!.items[0]!.startOffsetMs, 0);

  scene = updateMixedMediaSequenceItemDuration(scene, "b", 3000, {
    mixedMediaScenesEnabled: true,
  }).scene;
  const total = scene.visualSequence!.items.reduce(
    (sum, item) => sum + item.durationMs,
    0,
  );
  assert.equal(total, 10000);
}

function testBlobOwnershipPolicy(): void {
  const owned = new Set<string>();
  const created = "blob:mixed-media-test-1";
  trackOwnedObjectUrl(created, owned);
  assert.equal(revokeFailedAppendObjectUrl(created, owned), true);
  assert.equal(revokeRemovedOwnedMediaUrl("https://cdn.example.com/x.jpg", owned), false);
  assert.equal(shouldRevokeOnOwnerUnmount(created, owned), false);
}

function assertInspectorPreviewParity(
  scene: FootieScene,
  mixedMediaScenesEnabled: boolean,
): void {
  const inspector = resolveInspectorSceneMediaProjection(scene, {
    mixedMediaScenesEnabled,
  });
  const preview = resolvePreviewSceneMediaWindows(scene, {
    mixedMediaScenesEnabled,
  });
  assert.equal(inspector.windows.length, preview.length);
  for (let i = 0; i < inspector.windows.length; i += 1) {
    assert.equal(inspector.windows[i]?.itemId, preview[i]?.itemId);
    assert.equal(inspector.windows[i]?.startMs, preview[i]?.startMs);
    assert.equal(inspector.windows[i]?.durationMs, preview[i]?.durationMs);
    assert.equal(inspector.windows[i]?.media.type, preview[i]?.media.type);
  }
}

function testInspectorPreviewParityMatrix(): void {
  // Enabled, aligned sequence/timeline
  let aligned = sceneStub();
  aligned = appendMixedMediaSequenceItem(aligned, imageMedia("https://example.com/1.jpg"), {
    mixedMediaScenesEnabled: true,
    generateId: () => "a",
  }).scene;
  aligned = appendMixedMediaSequenceItem(aligned, videoMedia("https://example.com/2.mp4"), {
    mixedMediaScenesEnabled: true,
    generateId: () => "b",
  }).scene;
  assertInspectorPreviewParity(aligned, true);
  assert.equal(
    isInspectorSelectableMediaItemId(aligned, "a", { mixedMediaScenesEnabled: true }),
    true,
  );

  // Enabled, divergent sequence/timeline
  const divergent = divergentScene();
  assertInspectorPreviewParity(divergent, true);
  assert.equal(resolveInspectorSceneMediaProjection(divergent, {
    mixedMediaScenesEnabled: true,
  }).windows.map((w) => w.itemId).join(","), "a,b");
  assert.ok(
    resolveInspectorSceneMediaProjection(divergent, {
      mixedMediaScenesEnabled: true,
    }).warnings.some((w) => w.code === "timeline_diverged_from_sequence"),
  );

  // Disabled with persisted sequence → timeline/legacy windows
  assertInspectorPreviewParity(divergent, false);
  assert.equal(
    resolveInspectorSceneMediaProjection(divergent, {
      mixedMediaScenesEnabled: false,
    }).windows[0]?.itemId,
    "stale-1",
  );

  // Legacy single-image
  const legacy = sceneStub({
    media: imageMedia("https://example.com/legacy.jpg"),
  });
  assertInspectorPreviewParity(legacy, false);
  assertInspectorPreviewParity(legacy, true);

  // Sprint 8 multi-image (mediaTimeline only)
  const sprint8 = applyBuiltMediaTimelineToScene(sceneStub(), {
    items: [
      {
        id: "s8-a",
        media: imageMedia("https://example.com/s8-a.jpg"),
        durationWeight: 1,
      },
      {
        id: "s8-b",
        media: imageMedia("https://example.com/s8-b.jpg"),
        durationWeight: 2,
      },
    ],
  });
  assertInspectorPreviewParity(sprint8, false);
  assertInspectorPreviewParity(sprint8, true);
  assert.equal(
    resolveInspectorSceneMediaProjection(sprint8, {
      mixedMediaScenesEnabled: false,
    }).windows.length,
    2,
  );

  // Deleted selected item → nearest survivor
  let withThree = aligned;
  withThree = appendMixedMediaSequenceItem(withThree, imageMedia("https://example.com/3.jpg"), {
    mixedMediaScenesEnabled: true,
    generateId: () => "c",
  }).scene;
  const beforeDelete = resolveInspectorSceneMediaProjection(withThree, {
    mixedMediaScenesEnabled: true,
  }).windows;
  const bIndex = beforeDelete.findIndex((w) => w.itemId === "b");
  const removed = removeMixedMediaSequenceItem(withThree, "b", {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(removed.selectedMediaItemId, "c");
  const afterWindows = resolveInspectorSceneMediaProjection(removed.scene, {
    mixedMediaScenesEnabled: true,
  }).windows;
  assert.equal(
    resolveNearestInspectorMediaItemId(afterWindows, "b", bIndex),
    removed.selectedMediaItemId,
  );
  assertInspectorPreviewParity(removed.scene, true);

  // Reordered selected item remains selectable and order matches preview
  const reordered = reorderMixedMediaSequenceItem(aligned, "b", 0, {
    mixedMediaScenesEnabled: true,
  });
  assert.equal(reordered.selectedMediaItemId, "b");
  assert.equal(
    isInspectorSelectableMediaItemId(reordered.scene, "b", {
      mixedMediaScenesEnabled: true,
    }),
    true,
  );
  assertInspectorPreviewParity(reordered.scene, true);
  assert.equal(
    resolveInspectorSceneMediaProjection(reordered.scene, {
      mixedMediaScenesEnabled: true,
    }).windows[0]?.itemId,
    "b",
  );
}

async function main(): Promise<void> {
  const tests: Array<[string, () => void]> = [
    ["capability defaults off", testCapabilityDefaultOff],
    ["capability staging mixed-media on", testCapabilityStagingOn],
    ["staging without mixed-media: timeline/legacy wins", testStagingWithoutMixedMediaTimelineWins],
    ["production-looking env does not activate sequence", testProductionLookingEnvDoesNotActivate],
    ["capability request failure fail-closed (source)", testCapabilityRequestFailureFailClosedSource],
    ["valid staging: sequence wins with divergence warning", testValidStagingSequenceWins],
    ["divergent while disabled: timeline wins", testDivergentDisabledTimelineWins],
    ["preview/browser/headless share enabled/disabled decision", testPreviewBrowserHeadlessSameCapabilityDecision],
    ["unset capability defaults force_off", testUnsetCapabilityDefaultsForceOff],
    ["visualSequence-only only when enabled", testVisualSequenceOnlyWhenEnabled],
    ["voiceover refit then visual reconcile", testVoiceoverRefitThenVisualReconcile],
    ["no circular barrel imports", testNoCircularBarrelImports],
    ["legacy single-image scene", testLegacySingleImage],
    ["legacy single-video scene", testLegacySingleVideo],
    ["mixed sequence reorder/delete/round-trip", testMixedSequenceReorderDeleteRoundTrip],
    ["flag disabled blocks commands", testFlagDisabledBlocksCommands],
    ["boundary editing semantics", testBoundaryEditingSemantics],
    ["blob ownership policy", testBlobOwnershipPolicy],
    ["inspector/preview projection parity matrix", testInspectorPreviewParityMatrix],
  ];

  let passed = 0;
  for (const [name, run] of tests) {
    run();
    passed += 1;
    console.log(`  ✓ ${name}`);
  }
  console.log(`\nMixed-media scenes: ${passed}/${tests.length} PASS`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
