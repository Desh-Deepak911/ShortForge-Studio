/**
 * Sprint 9D — Intra-scene transition deterministic golden QA.
 * Run: npm run test:intra-scene-transition-golden
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildExportManifest,
  buildExportManifestFingerprint,
  EXPORT_INVALID_MANIFEST_COST_SENTINEL,
  EXPORT_MANIFEST_VERSION,
  EXPORT_MANIFEST_V5_VERSION,
  EXPORT_MANIFEST_V2_VERSION,
  EXPORT_RENDERER_CONTRACT_VERSION,
  EXPORT_RENDERER_CONTRACT_V5,
  EXPORT_RENDERER_CONTRACT_V2,
  isExportManifestV4,
  isExportManifestV5,
  isExportSceneManifestV3,
  resolveExportIntraSceneTransitionAtElapsed,
  runExportCapabilityPreflight,
  validateExportManifest,
  validateExportManifestV2SceneMedia,
  validateExportManifestV3SceneMedia,
  type ExportManifest,
  type ExportManifestV2,
  type ExportSceneManifestV3,
} from "@/features/export/domain";
import { buildExportMediaCacheKey } from "@/features/export/utils/export-media-cache.utils";
import {
  composeIntraSceneTransitionPreview,
  planPreviewMediaLayers,
} from "@/features/scene-media-transitions/preview";
import { resolveIntraSceneTransitionAtElapsed } from "@/features/scene-media-transitions";
import { resolveTransitionEffectLayers } from "@/features/timeline-intelligence/resolve-transition-state.utils";
import { resolveExportTransitionFrame } from "@/features/export/timing";

import {
  assertGoldenRegistryComplete,
  buildIntraSceneTransitionGoldenFixture,
  INTRA_SCENE_TRANSITION_GOLDEN_IDS,
  INTRA_SCENE_TRANSITION_GOLDEN_PROJECTS,
  type IntraSceneTransitionGoldenFixture,
} from "./goldens";

let passed = 0;

type DeepMutable<T> = T extends ReadonlyArray<infer Item>
  ? DeepMutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

function mutableClone<T>(value: T): DeepMutable<T> {
  return structuredClone(value) as DeepMutable<T>;
}

function asManifest(value: unknown): ExportManifest {
  return value as ExportManifest;
}

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const CAPABLE_ENV = {
  browserName: "chrome",
  supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true,
  supportsMediaRecorder: true,
  supportsRequestVideoFrameCallback: true,
  supportsWebAssembly: true,
  estimatedHeapLimitBytes: 2_000_000_000,
  serverRendererAvailable: false,
  ffmpegRuntimePoisoned: false,
  mp4EncoderAvailable: true,
} as const;

function buildV3(fixture: IntraSceneTransitionGoldenFixture): ExportManifest {
  const manifest = buildExportManifest({
    story: fixture.story,
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  return manifest;
}

function primaryV3Scene(
  manifest: ExportManifest,
  fixture: IntraSceneTransitionGoldenFixture,
): ExportSceneManifestV3 {
  const scene = manifest.scenes.find((s) => s.id === fixture.primarySceneId) ??
    manifest.scenes[0]!;
  assert.ok(isExportSceneManifestV3(scene));
  return scene;
}

function freezeAsV2(manifest: ExportManifest): ExportManifestV2 {
  const scenes = manifest.scenes.map((scene) => {
    const rest = { ...scene };
    delete (rest as { mediaTransitions?: unknown }).mediaTransitions;
    return rest;
  });
  const draft = {
    ...manifest,
    version: EXPORT_MANIFEST_V2_VERSION,
    rendererContractVersion: EXPORT_RENDERER_CONTRACT_V2,
    scenes,
  } as unknown as Omit<ExportManifestV2, "fingerprint">;
  return {
    ...draft,
    fingerprint: buildExportManifestFingerprint(draft),
  };
}

function primaryScene(fixture: IntraSceneTransitionGoldenFixture) {
  return fixture.story.scenes.find((s) => s.id === fixture.primarySceneId)!;
}

function checkpointElapsedMs(
  scene: ExportSceneManifestV3,
  kind: "before" | "start" | "mid" | "late" | "end" | "after",
  boundaryIndex = 0,
): number | null {
  const boundary = scene.mediaTransitions.boundaries[boundaryIndex];
  if (!boundary) {
    if (kind === "before") return Math.max(0, Math.floor(scene.durationMs / 2) - 1);
    return null;
  }
  const start = boundary.overlayStartOffsetMs;
  const end = boundary.overlayEndOffsetMs;
  const mid = start + Math.floor(boundary.effectiveDurationMs / 2);
  const late = Math.max(start, end - 1);
  switch (kind) {
    case "before":
      return Math.max(0, start - 1);
    case "start":
      return start;
    case "mid":
      return mid;
    case "late":
      return late;
    case "end":
      return end;
    case "after":
      return Math.min(scene.durationMs - 1, end + 1);
    default:
      return null;
  }
}

console.log("\nintra-scene-transition-golden (Sprint 9D)\n");

test("Registry covers all required golden ids", () => {
  assertGoldenRegistryComplete();
  assert.equal(INTRA_SCENE_TRANSITION_GOLDEN_IDS.length, 22);
  assert.equal(INTRA_SCENE_TRANSITION_GOLDEN_PROJECTS.length, 22);
  for (const id of INTRA_SCENE_TRANSITION_GOLDEN_IDS) {
    const fixture = buildIntraSceneTransitionGoldenFixture(id);
    assert.equal(fixture.id, id);
    assert.ok(fixture.descriptor.title);
    assert.ok(fixture.descriptor.evidenceClass);
    // Evidence reports must never require embedding private remote URLs.
    assert.doesNotMatch(fixture.notes, /https?:\/\/(?!example\.com)/i);
  }
});

test("Production manifests use current authority with v3-shaped mediaTransitions on every scene", () => {
  for (const id of INTRA_SCENE_TRANSITION_GOLDEN_IDS) {
    if (
      id === "ist-fingerprint-tamper-reject" ||
      id === "ist-malformed-boundary-reject"
    ) {
      continue;
    }
    const fixture = buildIntraSceneTransitionGoldenFixture(id);
    const manifest = buildV3(fixture);
    const hasTransitions = manifest.scenes.some(
      (scene) =>
        isExportSceneManifestV3(scene) &&
        scene.mediaTransitions.boundaries.length > 0,
    );
    if (hasTransitions) {
      assert.ok(isExportManifestV5(manifest));
      assert.equal(manifest.version, EXPORT_MANIFEST_V5_VERSION);
      assert.equal(manifest.rendererContractVersion, EXPORT_RENDERER_CONTRACT_V5);
    } else {
      assert.ok(isExportManifestV4(manifest));
      assert.equal(manifest.version, EXPORT_MANIFEST_VERSION);
      assert.equal(manifest.rendererContractVersion, EXPORT_RENDERER_CONTRACT_VERSION);
    }
    for (const scene of manifest.scenes) {
      assert.ok(isExportSceneManifestV3(scene));
      assert.equal(scene.mediaTransitions.version, 1);
      assert.ok(Array.isArray(scene.mediaTransitions.boundaries));
    }
  }
});

test("Hard-cut goldens: Preview null composition; Export empty track", () => {
  for (const id of [
    "ist-hard-cut-absence",
    "ist-hard-cut-explicit-removal",
    "ist-placeholder-fallback",
  ] as const) {
    const fixture = buildIntraSceneTransitionGoldenFixture(id);
    const scene = primaryScene(fixture);
    const mid = Math.floor((scene.durationMs ?? 6000) / 2);
    assert.equal(composeIntraSceneTransitionPreview(scene, mid), null);
    const plan = planPreviewMediaLayers({
      scene,
      sceneElapsedMs: mid,
      isPlaying: true,
    });
    assert.equal(plan.intraScene, null);
    assert.ok(plan.primary);

    const manifest = buildV3(fixture);
    const exportScene = primaryV3Scene(manifest, fixture);
    assert.equal(exportScene.mediaTransitions.boundaries.length, 0);
    assert.equal(resolveExportIntraSceneTransitionAtElapsed(exportScene, mid), null);
    assert.equal(validateExportManifest(manifest).ok, true);
  }
});

test("Effect goldens: Preview/Export parity at checkpoints", () => {
  const effectIds = [
    "ist-fade",
    "ist-slide-left",
    "ist-slide-right",
    "ist-zoom-in",
    "ist-zoom-out",
    "ist-blur",
    "ist-image-to-image",
    "ist-image-to-video",
    "ist-video-to-image",
    "ist-video-to-video",
    "ist-duration-under-clamp",
    "ist-duration-clamped-40pct",
    "ist-captions-during-overlay",
  ] as const;

  for (const id of effectIds) {
    const fixture = buildIntraSceneTransitionGoldenFixture(id);
    const storyScene = primaryScene(fixture);
    const manifest = buildV3(fixture);
    const exportScene = primaryV3Scene(manifest, fixture);
    assert.ok(exportScene.mediaTransitions.boundaries.length >= 1);
    const boundary = exportScene.mediaTransitions.boundaries[0]!;

    const before = checkpointElapsedMs(exportScene, "before")!;
    const start = checkpointElapsedMs(exportScene, "start")!;
    const mid = checkpointElapsedMs(exportScene, "mid")!;
    const late = checkpointElapsedMs(exportScene, "late")!;
    const end = checkpointElapsedMs(exportScene, "end")!;
    const after = checkpointElapsedMs(exportScene, "after")!;

    assert.equal(composeIntraSceneTransitionPreview(storyScene, before), null);
    assert.equal(resolveExportIntraSceneTransitionAtElapsed(exportScene, before), null);

    const previewStart = composeIntraSceneTransitionPreview(storyScene, start);
    const exportStart = resolveExportIntraSceneTransitionAtElapsed(exportScene, start);
    assert.ok(previewStart, id);
    assert.ok(exportStart, id);
    assert.equal(previewStart!.effect, exportStart!.effect);
    assert.equal(previewStart!.fromMediaItemId, exportStart!.fromItem.id);
    assert.equal(previewStart!.toMediaItemId, exportStart!.toItem.id);
    assert.ok(previewStart!.progress < 0.01);

    const previewMid = composeIntraSceneTransitionPreview(storyScene, mid)!;
    const exportMid = resolveExportIntraSceneTransitionAtElapsed(exportScene, mid)!;
    assert.equal(previewMid.effect, exportMid.effect);
    assert.ok(Math.abs(previewMid.progress - exportMid.progress) < 0.02);
    const layers = resolveTransitionEffectLayers(previewMid.effect, previewMid.progress);
    assert.ok(layers.opacityTo > 0);

    const planMid = planPreviewMediaLayers({
      scene: storyScene,
      sceneElapsedMs: mid,
      isPlaying: true,
    });
    assert.ok(planMid.intraScene);
    assert.ok(planMid.outgoing);
    assert.equal(planMid.primary.view.mediaItemId, boundary.toItemId);
    assert.equal(planMid.outgoing.view.mediaItemId, boundary.fromItemId);
    assert.match(planMid.primary.stableKey, /^primary:/);
    assert.match(planMid.outgoing.stableKey, /^outgoing:/);

    // Both peers advance under the same centered timing authority.
    assert.ok(exportMid.outgoingItemLocalMs < exportMid.fromItem.durationMs);
    assert.ok(exportMid.outgoingItemLocalMs > 0);
    assert.ok(
      Math.abs(
        exportMid.outgoingItemLocalMs - previewMid.fromView.itemElapsedMs,
      ) < 1,
    );
    assert.ok(
      Math.abs(
        exportMid.incomingItemLocalMs - previewMid.toView.itemElapsedMs,
      ) < 1,
    );
    assert.ok(exportMid.incomingItemLocalMs >= 0);
    assert.ok(exportMid.incomingItemLocalMs < boundary.effectiveDurationMs);

    const previewLate = composeIntraSceneTransitionPreview(storyScene, late)!;
    assert.ok(previewLate.progress > 0.5);

    assert.equal(composeIntraSceneTransitionPreview(storyScene, end), null);
    assert.equal(resolveExportIntraSceneTransitionAtElapsed(exportScene, end), null);

    const planAfter = planPreviewMediaLayers({
      scene: storyScene,
      sceneElapsedMs: after,
      isPlaying: true,
    });
    assert.equal(planAfter.intraScene, null);
    assert.equal(planAfter.outgoing, null);
    assert.equal(planAfter.primary.view.mediaItemId, boundary.toItemId);
    // Continuous primary key through overlay end.
    assert.equal(planMid.primary.stableKey, planAfter.primary.stableKey);

    // Scrub backward: start again after visiting after.
    const scrubBack = composeIntraSceneTransitionPreview(storyScene, start);
    assert.ok(scrubBack);
    assert.equal(scrubBack!.toMediaItemId, boundary.toItemId);

    // Collision-safe cache keys for peers.
    const fromKey = buildExportMediaCacheKey(exportScene.id, boundary.fromItemId);
    const toKey = buildExportMediaCacheKey(exportScene.id, boundary.toItemId);
    assert.notEqual(fromKey, toKey);

    // Duration / audio invariants.
    assert.equal(
      manifest.project.contentDurationMs,
      buildV3(fixture).project.contentDurationMs,
    );
    assert.equal(manifest.audio.sourceVideoAudioPolicy, "muted");
  }
});

test("40% clamp golden freezes effective duration 400", () => {
  const fixture = buildIntraSceneTransitionGoldenFixture("ist-duration-clamped-40pct");
  const exportScene = primaryV3Scene(buildV3(fixture), fixture);
  const boundary = exportScene.mediaTransitions.boundaries[0]!;
  assert.equal(boundary.requestedDurationMs, 1000);
  assert.equal(boundary.effectiveDurationMs, 400);
  const under = primaryV3Scene(
    buildV3(buildIntraSceneTransitionGoldenFixture("ist-duration-under-clamp")),
    buildIntraSceneTransitionGoldenFixture("ist-duration-under-clamp"),
  ).mediaTransitions.boundaries[0]!;
  assert.equal(under.requestedDurationMs, 500);
  assert.equal(under.effectiveDurationMs, 500);
});

test("Multi-boundary A→B, B→C Preview/Export windows", () => {
  const fixture = buildIntraSceneTransitionGoldenFixture("ist-multi-boundary-abc");
  const storyScene = primaryScene(fixture);
  const exportScene = primaryV3Scene(buildV3(fixture), fixture);
  assert.equal(exportScene.mediaTransitions.boundaries.length, 2);
  const [ab, bc] = exportScene.mediaTransitions.boundaries;

  const midAb = resolveExportIntraSceneTransitionAtElapsed(
    exportScene,
    ab!.overlayStartOffsetMs + 10,
  );
  assert.ok(midAb);
  assert.equal(midAb!.fromItem.id, ab!.fromItemId);
  assert.equal(midAb!.toItem.id, ab!.toItemId);

  const midBc = resolveExportIntraSceneTransitionAtElapsed(
    exportScene,
    bc!.overlayStartOffsetMs + 10,
  );
  assert.ok(midBc);
  assert.equal(midBc!.fromItem.id, bc!.fromItemId);
  assert.equal(midBc!.toItem.id, bc!.toItemId);

  assert.equal(
    resolveExportIntraSceneTransitionAtElapsed(exportScene, ab!.overlayEndOffsetMs),
    null,
  );
  assert.ok(
    composeIntraSceneTransitionPreview(storyScene, ab!.overlayStartOffsetMs),
  );
  assert.ok(
    composeIntraSceneTransitionPreview(storyScene, bc!.overlayStartOffsetMs),
  );
});

test("Legacy single-media ordinary Preview/Export", () => {
  const fixture = buildIntraSceneTransitionGoldenFixture("ist-legacy-single-media");
  const scene = primaryScene(fixture);
  assert.equal(composeIntraSceneTransitionPreview(scene, 1000), null);
  const manifest = buildV3(fixture);
  const exportScene = primaryV3Scene(manifest, fixture);
  assert.equal(exportScene.mediaTimeline.items.length, 1);
  assert.equal(exportScene.mediaTransitions.boundaries.length, 0);
});

test("Scene-to-scene priority over intra-scene", () => {
  const fixture = buildIntraSceneTransitionGoldenFixture("ist-scene-to-scene-priority");
  const manifest = buildV3(fixture);
  const fromScene = manifest.scenes.find((s) => s.id === fixture.primarySceneId)!;
  assert.ok(fromScene.transitionOut);
  assert.ok(fromScene.transitionOut!.durationMs > 0);
  // Near scene end, scene-to-scene transition frame is active.
  const nearEnd = fromScene.endMs - 1;
  const transition = resolveExportTransitionFrame(manifest, nearEnd);
  assert.ok(transition);
  // Intra-scene may also exist earlier; priority is composition-order in prepare/draw.
  const prepareSrc = readSrc("src/features/export/runtime/prepare-export-frame.ts");
  assert.match(prepareSrc, /Scene-to-scene transition takes precedence/);
  const previewSrc = readSrc("src/features/preview/components/PreviewFrame.tsx");
  assert.match(previewSrc, /planPreviewMediaLayers|transitionState|hideCaptionsDuringTransition/);
});

test("Captions remain visible during intra-scene (draw does not early-return)", () => {
  const drawSrc = readSrc("src/features/export/runtime/draw-prepared-export-frame.ts");
  assert.match(drawSrc, /Intra-scene: captions continue/);
  assert.match(drawSrc, /if \(transition\) \{\s*return;/);
  assert.doesNotMatch(drawSrc, /if \(transition \|\| intra\)/);
  const fixture = buildIntraSceneTransitionGoldenFixture("ist-captions-during-overlay");
  const scene = primaryScene(fixture);
  assert.ok(scene.subtitle);
  assert.ok(composeIntraSceneTransitionPreview(scene, 3100));
});

test("Frozen v2 / 8D hard-cut compatibility", () => {
  const fixture = buildIntraSceneTransitionGoldenFixture("ist-v2-hard-cut-compat");
  const v3 = buildV3(fixture);
  assert.ok(primaryV3Scene(v3, fixture).mediaTransitions.boundaries.length >= 1);
  const v2 = freezeAsV2(v3);
  assert.equal(v2.version, 2);
  assert.equal(v2.rendererContractVersion, "8D");
  assert.equal(validateExportManifestV2SceneMedia(v2).ok, true);
  assert.equal(validateExportManifest(v2).ok, true);
  assert.equal(
    Object.prototype.hasOwnProperty.call(v2.scenes[0], "mediaTransitions"),
    false,
  );
  // v2 path has no intra-scene resolver track.
  assert.ok(!("mediaTransitions" in v2.scenes[0]!));
});

test("Fingerprint-tampered and malformed reject before cost", () => {
  const fpFixture = buildIntraSceneTransitionGoldenFixture("ist-fingerprint-tamper-reject");
  const good = buildV3(fpFixture);
  const tampered = mutableClone(good);
  tampered.scenes[0]!.mediaTransitions.boundaries[0]!.effect = "blur";
  const fpResult = validateExportManifestV3SceneMedia(tampered);
  assert.equal(fpResult.ok, false);
  assert.ok(fpResult.issues.some((i) => i.code === "MANIFEST_FINGERPRINT_MISMATCH"));
  const fpPreflight = runExportCapabilityPreflight(asManifest(tampered));
  assert.equal(fpPreflight.supported, false);
  assert.equal(fpPreflight.estimatedCost, EXPORT_INVALID_MANIFEST_COST_SENTINEL);

  const malFixture = buildIntraSceneTransitionGoldenFixture("ist-malformed-boundary-reject");
  const malGood = buildV3(malFixture);
  const malformed = mutableClone(malGood);
  malformed.scenes[0]!.mediaTransitions.boundaries[0]!.effect =
    "cut" as never;
  const malResult = validateExportManifestV3SceneMedia(malformed);
  assert.equal(malResult.ok, false);
  assert.ok(malResult.issues.some((i) => i.code === "CUT_NOT_STORED"));
  assert.equal(runExportCapabilityPreflight(asManifest(malformed)).supported, false);
});

test("Manifest-only rendering path has no Story/Preview imports in resolver", () => {
  const resolver = readSrc(
    "src/features/export/domain/resolve-export-intra-scene-transition.ts",
  );
  assert.doesNotMatch(resolver, /features\/story/);
  assert.doesNotMatch(resolver, /features\/preview/);
  assert.doesNotMatch(resolver, /composeIntraSceneTransitionPreview/);
});

test("Story domain resolver matches Export windows for fade golden", () => {
  const fixture = buildIntraSceneTransitionGoldenFixture("ist-fade");
  const storyScene = primaryScene(fixture);
  const exportScene = primaryV3Scene(buildV3(fixture), fixture);
  const boundary = exportScene.mediaTransitions.boundaries[0]!;
  const storyResolved = resolveIntraSceneTransitionAtElapsed(
    storyScene,
    boundary.overlayStartOffsetMs + 20,
  );
  const exportResolved = resolveExportIntraSceneTransitionAtElapsed(
    exportScene,
    boundary.overlayStartOffsetMs + 20,
  );
  assert.ok(storyResolved.active);
  assert.ok(exportResolved);
  assert.equal(storyResolved.effect, exportResolved!.effect);
  assert.equal(storyResolved.fromItemId, exportResolved!.fromItem.id);
  assert.equal(storyResolved.toItemId, exportResolved!.toItem.id);
  assert.equal(storyResolved.effectiveDurationMs, exportResolved!.effectiveDurationMs);
});

test("Content/render duration and scene count stable across transition presence", () => {
  const cut = buildV3(buildIntraSceneTransitionGoldenFixture("ist-hard-cut-absence"));
  const fade = buildV3(buildIntraSceneTransitionGoldenFixture("ist-fade"));
  assert.equal(cut.project.sceneCount, fade.project.sceneCount);
  assert.equal(cut.project.contentDurationMs, fade.project.contentDurationMs);
  assert.equal(cut.project.renderDurationMs, fade.project.renderDurationMs);
});

console.log(`\n${passed} passed\n`);
