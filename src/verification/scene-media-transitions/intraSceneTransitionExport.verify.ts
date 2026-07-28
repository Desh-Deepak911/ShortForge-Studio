/**
 * Sprint 9C — ExportManifest v3 + intra-scene transition export.
 * Run: npm run test:intra-scene-transition-export
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createSequentialMediaItemIdGenerator } from "@/features/scene-media-timeline";
import {
  resolveEffectiveIntraSceneTransitionDurationMs,
  setSceneMediaTransitionBoundary,
} from "@/features/scene-media-transitions";
import { resolveTransitionEffectLayers } from "@/features/timeline-intelligence/resolve-transition-state.utils";
import {
  buildExportManifest,
  buildExportManifestFingerprint,
  buildExportSceneMediaTransitionTrack,
  EXPORT_MANIFEST_VERSION,
  EXPORT_MANIFEST_V3_VERSION,
  EXPORT_MANIFEST_V2_VERSION,
  EXPORT_RENDERER_CONTRACT_VERSION,
  EXPORT_RENDERER_CONTRACT_V3,
  EXPORT_RENDERER_CONTRACT_V2,
  isExportSceneManifestV3,
  resolveExportIntraSceneTransitionAtElapsed,
  runExportCapabilityPreflight,
  summarizeExportManifestV3Diagnostics,
  validateExportManifest,
  validateExportManifestV2SceneMedia,
  validateExportManifestV3SceneMedia,
  EXPORT_INVALID_MANIFEST_COST_SENTINEL,
  type ExportManifest,
  type ExportManifestV2,
  type ExportManifestV3,
  type ExportSceneManifestV3,
} from "@/features/export/domain";
import { assertExportManifest } from "@/features/export/runtime/prepare-export-from-manifest";
import { buildExportMediaCacheKey } from "@/features/export/utils/export-media-cache.utils";
import type { FootieScene, SceneMedia, TransitionEffect } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

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

function imageMedia(url: string): SceneMedia {
  return {
    type: "image",
    url,
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
}

function videoMedia(url: string): SceneMedia {
  return {
    type: "video",
    url,
    source: "upload",
    fitMode: "cover",
    durationMs: 10_000,
    trimStartMs: 1000,
    trimEndMs: 7000,
    muted: true,
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
}

function twoItemScene(
  first: SceneMedia,
  second: SceneMedia,
  durationMs = 6000,
): { scene: FootieScene; a: string; b: string } {
  const generateId = createSequentialMediaItemIdGenerator("p9c");
  const a = generateId();
  const b = generateId();
  const scene: FootieScene = {
    id: "scene-export-9c",
    start: 0,
    end: durationMs / 1000,
    duration: durationMs / 1000,
    startMs: 0,
    endMs: durationMs,
    durationMs,
    subtitle: "Caption over overlay",
    narration: "Voice continues.",
    captionMode: "generated",
    media: first,
    mediaTimeline: {
      version: 1,
      items: [
        { id: a, media: first, durationWeight: 1 },
        { id: b, media: second, durationWeight: 1 },
      ],
    },
  };
  return { scene, a, b };
}

function storyFrom(scene: FootieScene) {
  return syncFootieScript({
    title: "9C Export",
    narration: "n",
    totalDuration: Math.max(6, (scene.durationMs ?? 6000) / 1000),
    scenes: [scene],
  });
}

function buildV3(scene: FootieScene): ExportManifestV3 {
  const current = buildExportManifest({
    story: storyFrom(scene),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  const draft = {
    version: EXPORT_MANIFEST_V3_VERSION,
    rendererContractVersion: EXPORT_RENDERER_CONTRACT_V3,
    manifestId: current.manifestId,
    createdAt: current.createdAt,
    project: current.project,
    output: current.output,
    scenes: current.scenes,
    captions: current.captions,
    audio: current.audio,
    branding: current.branding,
    capabilities: current.capabilities,
  } satisfies Omit<ExportManifestV3, "fingerprint">;
  return {
    ...draft,
    fingerprint: buildExportManifestFingerprint(draft),
  };
}

function asV3Scene(manifest: ExportManifest): ExportSceneManifestV3 {
  const scene = manifest.scenes[0]!;
  assert.ok(isExportSceneManifestV3(scene));
  return scene;
}

function freezeAsV2HardCut(manifest: ExportManifestV3): ExportManifestV2 {
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
  const fingerprint = buildExportManifestFingerprint(draft);
  return { ...draft, fingerprint };
}

function rebuildFingerprint<T extends ExportManifest>(manifest: T): T {
  const draft = { ...manifest } as Record<string, unknown>;
  delete draft.fingerprint;
  return {
    ...manifest,
    fingerprint: buildExportManifestFingerprint(
      draft as unknown as Omit<ExportManifestV3, "fingerprint">,
    ),
  };
}

function threeItemSceneWithABAndBC(): {
  scene: FootieScene;
  a: string;
  b: string;
  c: string;
  manifest: ExportManifestV3;
} {
  const generateId = createSequentialMediaItemIdGenerator("p9c1-multi");
  const a = generateId();
  const b = generateId();
  const c = generateId();
  let scene: FootieScene = {
    id: "multi",
    start: 0,
    end: 9,
    duration: 9,
    startMs: 0,
    endMs: 9000,
    durationMs: 9000,
    subtitle: "",
    media: imageMedia("https://example.com/a.jpg"),
    mediaTimeline: {
      version: 1,
      items: [
        { id: a, media: imageMedia("https://example.com/a.jpg"), durationWeight: 1 },
        { id: b, media: imageMedia("https://example.com/b.jpg"), durationWeight: 1 },
        { id: c, media: imageMedia("https://example.com/c.jpg"), durationWeight: 1 },
      ],
    },
  };
  scene = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  scene = setSceneMediaTransitionBoundary(scene, b, c, "slide-left", 500).scene;
  return { scene, a, b, c, manifest: buildV3(scene) };
}

console.log("\nintra-scene-transition-export (Sprint 9C)\n");

test("Production builder emits v4 / 9D", () => {
  assert.equal(EXPORT_MANIFEST_VERSION, 4);
  assert.equal(EXPORT_RENDERER_CONTRACT_VERSION, "9D");
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const withFade = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const manifest = buildExportManifest({
    story: storyFrom(withFade),
    environment: CAPABLE_ENV,
    multiImageScenesEnabled: true,
  });
  assert.equal(manifest.version, 4);
  assert.equal(manifest.rendererContractVersion, "9D");
  const v3Scene = asV3Scene(manifest);
  assert.equal(v3Scene.mediaTransitions.version, 1);
  assert.equal(v3Scene.mediaTransitions.boundaries.length, 1);
  assert.equal(v3Scene.mediaTransitions.boundaries[0]!.effect, "fade");
});

test("Frozen v2 fixture remains valid through v2 validator", () => {
  const { scene } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const v3 = buildV3(scene);
  const v2 = freezeAsV2HardCut(v3);
  const result = validateExportManifestV2SceneMedia(v2);
  assert.equal(result.ok, true, result.issues.map((i) => i.code).join(","));
  assert.equal(v2.version, 2);
  assert.equal(v2.rendererContractVersion, "8D");
  assert.equal(
    Object.prototype.hasOwnProperty.call(v2.scenes[0], "mediaTransitions"),
    false,
  );
});

test("V2 hard-cut compatibility — empty v3 track renders like hard-cut", () => {
  const { scene } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const manifest = buildV3(scene);
  const v3Scene = asV3Scene(manifest);
  assert.deepEqual(v3Scene.mediaTransitions.boundaries, []);
  assert.equal(
    resolveExportIntraSceneTransitionAtElapsed(v3Scene, 3000),
    null,
  );
});

test("Every supported effect freezes into the v3 track", () => {
  const effects: Exclude<TransitionEffect, "cut">[] = [
    "fade",
    "slide-left",
    "slide-right",
    "zoom-in",
    "zoom-out",
    "blur",
  ];
  for (const effect of effects) {
    const { scene, a, b } = twoItemScene(
      imageMedia("https://example.com/a.jpg"),
      imageMedia("https://example.com/b.jpg"),
    );
    const next = setSceneMediaTransitionBoundary(scene, a, b, effect, 500).scene;
    const boundary = asV3Scene(buildV3(next)).mediaTransitions.boundaries[0]!;
    assert.equal(boundary.effect, effect);
  }
});

test("Exact boundary/midpoint/end semantics [start,end)", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const v3Scene = asV3Scene(buildV3(next));
  const boundary = v3Scene.mediaTransitions.boundaries[0]!;
  const start = boundary.overlayStartOffsetMs;
  const end = boundary.overlayEndOffsetMs;

  assert.equal(resolveExportIntraSceneTransitionAtElapsed(v3Scene, start - 1), null);
  const atStart = resolveExportIntraSceneTransitionAtElapsed(v3Scene, start);
  assert.ok(atStart);
  assert.ok(atStart!.progress < 0.01);

  const mid = resolveExportIntraSceneTransitionAtElapsed(
    v3Scene,
    start + Math.floor(boundary.effectiveDurationMs / 2),
  );
  assert.ok(mid);
  assert.ok(mid!.progress > 0.4 && mid!.progress < 0.6);

  assert.equal(resolveExportIntraSceneTransitionAtElapsed(v3Scene, end), null);
});

test("40% clamp frozen in manifest", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
    2000,
  );
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 1000).scene;
  const boundary = asV3Scene(buildV3(next)).mediaTransitions.boundaries[0]!;
  assert.equal(boundary.requestedDurationMs, 1000);
  assert.equal(
    boundary.effectiveDurationMs,
    resolveEffectiveIntraSceneTransitionDurationMs({
      requestedDurationMs: 1000,
      fromWindowDurationMs: 1000,
      toWindowDurationMs: 1000,
    }),
  );
  assert.equal(boundary.effectiveDurationMs, 400);
});

test("9C.1 Multi-boundary A→B, B→C end-to-end integrity", () => {
  const { a, b, c, manifest } = threeItemSceneWithABAndBC();
  const scene = asV3Scene(manifest);
  const boundaries = scene.mediaTransitions.boundaries;
  assert.equal(boundaries.length, 2);
  assert.equal(boundaries[0]!.fromItemId, a);
  assert.equal(boundaries[0]!.toItemId, b);
  assert.equal(boundaries[1]!.fromItemId, b);
  assert.equal(boundaries[1]!.toItemId, c);

  const v3 = validateExportManifestV3SceneMedia(manifest);
  assert.equal(v3.ok, true, v3.issues.map((i) => i.code).join(","));
  const dispatched = validateExportManifest(manifest);
  assert.equal(dispatched.ok, true);
  const preflight = runExportCapabilityPreflight(manifest);
  assert.ok(!preflight.blockers.some((blocker) => blocker.code === "INVALID_MANIFEST"));
  assert.doesNotThrow(() => assertExportManifest(manifest));

  const first = resolveExportIntraSceneTransitionAtElapsed(
    scene,
    boundaries[0]!.overlayStartOffsetMs,
  );
  assert.ok(first);
  assert.equal(first!.fromItem.id, a);
  assert.equal(first!.toItem.id, b);
  assert.equal(
    resolveExportIntraSceneTransitionAtElapsed(scene, boundaries[0]!.overlayEndOffsetMs),
    null,
  );

  const second = resolveExportIntraSceneTransitionAtElapsed(
    scene,
    boundaries[1]!.overlayStartOffsetMs + 1,
  );
  assert.ok(second);
  assert.equal(second!.fromItem.id, b);
  assert.equal(second!.toItem.id, c);
  assert.equal(
    resolveExportIntraSceneTransitionAtElapsed(scene, boundaries[1]!.overlayEndOffsetMs),
    null,
  );
});

test("9C.1 Multi-boundary reverse/duplicate/malformed fail closed", () => {
  const { manifest } = threeItemSceneWithABAndBC();
  const scene = asV3Scene(manifest);
  const [ab, bc] = scene.mediaTransitions.boundaries;

  const reversed = mutableClone(manifest);
  reversed.scenes[0]!.mediaTransitions = {
    version: 1,
    boundaries: [bc!, ab!],
  };
  const reversedResult = validateExportManifestV3SceneMedia(reversed);
  assert.equal(reversedResult.ok, false);
  assert.ok(reversedResult.issues.some((i) => i.code === "MEDIA_TRANSITION_ORDER"));
  assert.ok(
    runExportCapabilityPreflight(asManifest(reversed)).blockers.some(
      (b) => b.code === "INVALID_MANIFEST",
    ),
  );

  const duplicate = mutableClone(manifest);
  duplicate.scenes[0]!.mediaTransitions = {
    version: 1,
    boundaries: [ab!, ab!],
  };
  const dupResult = validateExportManifestV3SceneMedia(duplicate);
  assert.equal(dupResult.ok, false);
  assert.ok(dupResult.issues.some((i) => i.code === "DUPLICATE_MEDIA_TRANSITION"));

  const malformedSecond = mutableClone(manifest);
  malformedSecond.scenes[0]!.mediaTransitions.boundaries[1]!.effect =
    "cut" as never;
  const malformedResult = validateExportManifestV3SceneMedia(malformedSecond);
  assert.equal(malformedResult.ok, false);
  assert.ok(malformedResult.issues.some((i) => i.code === "CUT_NOT_STORED"));
});

test("Image/video combination matrix freezes drawable peers", () => {
  const combos: Array<[SceneMedia, SceneMedia]> = [
    [imageMedia("https://example.com/a.jpg"), imageMedia("https://example.com/b.jpg")],
    [imageMedia("https://example.com/a.jpg"), videoMedia("https://example.com/b.mp4")],
    [videoMedia("https://example.com/a.mp4"), imageMedia("https://example.com/b.jpg")],
    [videoMedia("https://example.com/a.mp4"), videoMedia("https://example.com/b.mp4")],
  ];
  for (const [first, second] of combos) {
    const { scene, a, b } = twoItemScene(first, second);
    const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
    assert.equal(asV3Scene(buildV3(next)).mediaTransitions.boundaries.length, 1);
  }
});

test("Placeholder/non-drawable peer falls back to hard cut", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    { type: "placeholder" },
  );
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  assert.equal(asV3Scene(buildV3(next)).mediaTransitions.boundaries.length, 0);
});

test("Outgoing final-frame freeze + incoming continuity", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const v3Scene = asV3Scene(buildV3(next));
  const boundary = v3Scene.mediaTransitions.boundaries[0]!;
  const resolved = resolveExportIntraSceneTransitionAtElapsed(
    v3Scene,
    boundary.overlayStartOffsetMs + 10,
  );
  assert.ok(resolved);
  assert.equal(
    resolved!.outgoingItemLocalMs,
    Math.max(0, resolved!.fromItem.durationMs - 1),
  );
  assert.equal(resolved!.incomingItemLocalMs, 10);

  const after = resolveExportIntraSceneTransitionAtElapsed(
    v3Scene,
    boundary.overlayEndOffsetMs,
  );
  assert.equal(after, null);
});

test("Shared Preview/Export effect-state parity", () => {
  const layers = resolveTransitionEffectLayers("fade", 0.5);
  assert.ok(layers.opacityFrom < 1);
  assert.ok(layers.opacityTo > 0);
  const drawSrc = readSrc("src/features/export/runtime/draw-prepared-export-frame.ts");
  assert.match(drawSrc, /resolveTransitionEffectLayers/);
  assert.match(drawSrc, /intraSceneTransition/);
});

test("Composite cache identities are collision-safe", () => {
  const a = buildExportMediaCacheKey("scene|1", "item");
  const b = buildExportMediaCacheKey("scene", "1|item");
  assert.notEqual(a, b);
  const prepareSrc = readSrc("src/features/export/runtime/prepare-export-frame.ts");
  assert.match(prepareSrc, /buildExportMediaCacheKey/);
  assert.match(prepareSrc, /preparedByMediaKey/);
});

test("Captions continue during intra-scene overlays (no early return)", () => {
  const drawSrc = readSrc("src/features/export/runtime/draw-prepared-export-frame.ts");
  assert.match(drawSrc, /Scene-to-scene: captions suppressed/);
  assert.match(drawSrc, /Intra-scene: captions continue/);
  assert.match(drawSrc, /if \(transition\) \{\s*return;\s*\}/);
  assert.doesNotMatch(drawSrc, /if \(transition \|\| intra\)/);
});

test("Audio/timing/duration unchanged by intra-scene track", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const withFade = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const plain = buildV3(scene);
  const faded = buildV3(withFade);
  assert.equal(plain.project.contentDurationMs, faded.project.contentDurationMs);
  assert.equal(plain.project.renderDurationMs, faded.project.renderDurationMs);
  assert.equal(plain.audio.sourceVideoAudioPolicy, "muted");
  assert.equal(faded.audio.sourceVideoAudioPolicy, "muted");
});

test("Scene-to-scene priority over intra-scene in prepare", () => {
  const prepareSrc = readSrc("src/features/export/runtime/prepare-export-frame.ts");
  assert.match(
    prepareSrc,
    /Scene-to-scene transition takes precedence/,
  );
  assert.match(prepareSrc, /if \(transition\)/);
});

test("Cancellation checks around peer preparation", () => {
  const prepareSrc = readSrc("src/features/export/runtime/prepare-export-frame.ts");
  const matches = prepareSrc.match(/throwIfCancelled/g) ?? [];
  assert.ok(matches.length >= 4);
});

test("9C.1 Fingerprint coherence matrix", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const base = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const manifest = buildV3(base);
  const v2 = freezeAsV2HardCut(manifest);

  assert.equal(validateExportManifestV3SceneMedia(manifest).ok, true);
  assert.equal(validateExportManifestV2SceneMedia(v2).ok, true);

  const effectTamper = mutableClone(manifest);
  effectTamper.scenes[0]!.mediaTransitions.boundaries[0]!.effect = "blur";
  assert.ok(
    validateExportManifestV3SceneMedia(effectTamper).issues.some(
      (i) => i.code === "MANIFEST_FINGERPRINT_MISMATCH",
    ),
  );

  const durationTamper = mutableClone(manifest);
  durationTamper.scenes[0]!.mediaTransitions.boundaries[0]!.requestedDurationMs = 1000;
  durationTamper.scenes[0]!.mediaTransitions.boundaries[0]!.effectiveDurationMs = 400;
  durationTamper.scenes[0]!.mediaTransitions.boundaries[0]!.overlayEndOffsetMs =
    durationTamper.scenes[0]!.mediaTransitions.boundaries[0]!.overlayStartOffsetMs + 400;
  assert.ok(
    validateExportManifestV3SceneMedia(durationTamper).issues.some(
      (i) => i.code === "MANIFEST_FINGERPRINT_MISMATCH",
    ),
  );

  const { manifest: multi } = threeItemSceneWithABAndBC();
  const orderTamper = mutableClone(multi);
  const bounds = orderTamper.scenes[0]!.mediaTransitions.boundaries;
  orderTamper.scenes[0]!.mediaTransitions = {
    version: 1,
    boundaries: [bounds[1]!, bounds[0]!],
  };
  assert.ok(
    validateExportManifestV3SceneMedia(orderTamper).issues.some(
      (i) => i.code === "MANIFEST_FINGERPRINT_MISMATCH",
    ),
  );

  const mediaTamper = structuredClone(manifest);
  (mediaTamper.scenes[0]!.mediaTimeline.items[0]!.media as { zoom: number }).zoom = 2.5;
  (mediaTamper.scenes[0]!.media as { zoom: number }).zoom = 2.5;
  assert.ok(
    validateExportManifestV3SceneMedia(mediaTamper).issues.some(
      (i) => i.code === "MANIFEST_FINGERPRINT_MISMATCH",
    ),
  );

  const emptyFp = structuredClone(manifest);
  (emptyFp as { fingerprint: string }).fingerprint = "";
  assert.ok(
    validateExportManifestV3SceneMedia(emptyFp).issues.some(
      (i) => i.code === "INVALID_MANIFEST_FINGERPRINT",
    ),
  );

  const metaOnly = structuredClone(manifest);
  (metaOnly as { createdAt: string }).createdAt = "2099-01-01T00:00:00.000Z";
  (metaOnly as { manifestId: string }).manifestId = "changed-id";
  assert.equal(validateExportManifestV3SceneMedia(metaOnly).ok, true);

  const authorized = rebuildFingerprint(asManifest(effectTamper));
  assert.equal(validateExportManifestV3SceneMedia(authorized).ok, true);

  for (const value of [null, undefined, 12, "manifest", true]) {
    assert.doesNotThrow(() => {
      const result = validateExportManifest(value);
      assert.equal(result.ok, false);
    });
  }
});

test("9C.1 Export domain must not import scene-media-transitions barrel", () => {
  const domainDir = join(process.cwd(), "src/features/export/domain");
  const files = readdirSync(domainDir).filter((name) => name.endsWith(".ts"));
  for (const name of files) {
    const src = readFileSync(join(domainDir, name), "utf8");
    assert.doesNotMatch(
      src,
      /from ["']@\/features\/scene-media-transitions["']/,
      `${name} must not import the broad scene-media-transitions barrel`,
    );
  }
  const v3 = readSrc("src/features/export/domain/assert-export-manifest-v3-scene-media.ts");
  assert.doesNotMatch(v3, /SUPPORTED_EFFECTS/);
  assert.match(v3, /isSupportedIntraSceneTransitionEffect/);
  assert.match(v3, /domain\/effect-support/);
});

test("Version/contract invalid combinations fail closed", () => {
  const { scene } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const v3 = buildV3(scene);

  const v2with9C = {
    ...freezeAsV2HardCut(v3),
    rendererContractVersion: "9C",
  };
  assert.equal(validateExportManifest(v2with9C).ok, false);

  const v3with8D = {
    ...v3,
    rendererContractVersion: EXPORT_RENDERER_CONTRACT_V2,
  };
  assert.equal(validateExportManifest(v3with8D).ok, false);

  assert.equal(validateExportManifest({ version: 99, rendererContractVersion: "9C" }).ok, false);

  const v2WithTransitions = {
    ...freezeAsV2HardCut(v3),
    scenes: v3.scenes,
  };
  assert.equal(validateExportManifestV2SceneMedia(v2WithTransitions).ok, false);
});

test("Malformed v3 transition track rejected before side effects", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const good = buildV3(next);
  const bad = mutableClone(good);
  bad.scenes[0]!.mediaTransitions.boundaries[0]!.effect =
    "cut" as never;
  const result = validateExportManifestV3SceneMedia(bad);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === "CUT_NOT_STORED"));

  const preflight = runExportCapabilityPreflight(asManifest(bad));
  assert.equal(preflight.supported, false);
  assert.equal(preflight.blockers[0]?.code, "INVALID_MANIFEST");
  assert.equal(preflight.estimatedCost, EXPORT_INVALID_MANIFEST_COST_SENTINEL);
});

test("Preflight integrity ordering uses dispatching authority", () => {
  const preflightSrc = readSrc(
    "src/features/export/domain/run-export-capability-preflight.ts",
  );
  assert.match(preflightSrc, /validateExportManifest/);
  assert.doesNotMatch(
    preflightSrc,
    /validateExportManifestV2SceneMedia\(manifest\)/,
  );
});

test("Manifest-only resolver has no Story/Preview imports", () => {
  const resolver = readSrc(
    "src/features/export/domain/resolve-export-intra-scene-transition.ts",
  );
  assert.doesNotMatch(resolver, /features\/story/);
  assert.doesNotMatch(resolver, /features\/preview/);
  assert.doesNotMatch(resolver, /composeIntraSceneTransitionPreview/);
  assert.doesNotMatch(resolver, /FootieScene/);
  assert.doesNotMatch(resolver, /process\.env/);
});

test("Diagnostics summary is URL-safe", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/secret.jpg"),
    imageMedia("https://example.com/secret2.jpg"),
  );
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const summary = summarizeExportManifestV3Diagnostics(buildV3(next));
  assert.equal(summary.manifestVersion, 3);
  assert.equal(summary.rendererContractVersion, "9C");
  assert.equal(summary.intraSceneTransitionCount, 1);
  assert.equal(summary.effectCounts.fade, 1);
  assert.doesNotMatch(JSON.stringify(summary), /example\.com/);
});

test("Cost model represents dual-peer compositing", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const withFade = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const plain = runExportCapabilityPreflight(buildV3(scene));
  const faded = runExportCapabilityPreflight(buildV3(withFade));
  assert.ok((faded.estimatedCost.estimatedMediaLayerDraws ?? 0) >
    (plain.estimatedCost.estimatedMediaLayerDraws ?? 0));
  assert.ok((faded.estimatedCost.estimatedAverageMediaLayersPerFrame ?? 1) > 1);
});

test("Track builder matches Preview drawable fallback", () => {
  const { scene, a, b } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const next = setSceneMediaTransitionBoundary(scene, a, b, "fade", 500).scene;
  const manifest = buildV3(next);
  const track = buildExportSceneMediaTransitionTrack(
    next,
    asV3Scene(manifest).mediaTimeline,
  );
  assert.deepEqual(track, asV3Scene(manifest).mediaTransitions);
});

test("Dispatch validateExportManifest accepts valid v2 and v3", () => {
  const { scene } = twoItemScene(
    imageMedia("https://example.com/a.jpg"),
    imageMedia("https://example.com/b.jpg"),
  );
  const v3 = buildV3(scene);
  const v2 = freezeAsV2HardCut(v3);
  assert.equal(validateExportManifest(v3).ok, true);
  assert.equal(validateExportManifest(v2).ok, true);
});

console.log(`\n${passed} passed\n`);
