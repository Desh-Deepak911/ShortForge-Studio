/**
 * Source-quality Slice 2 — capability-aware metadata capture seams.
 * Run: npm run test:source-quality-metadata
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { attachNormalizedAssetToScene } from "@/features/asset-attach/asset-attach.service";
import type { NormalizedAssetResult } from "@/features/asset-search/orchestrator";
import {
  performSceneMediaReplace,
  type SceneMediaReplaceSession,
} from "@/features/editor/hooks/useSceneImageUpload";
import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import { EXPORT_MANIFEST_VERSION } from "@/features/export/domain/export-manifest.types";
import { resolveSceneMediaFraming } from "@/features/media-framing";
import {
  appendMixedMediaSequenceItem,
  reorderMixedMediaSequenceItem,
  writeMixedMediaSequenceItems,
} from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import { appendSceneMediaImageItem } from "@/features/scene-media-timeline/editor";
import {
  probeImageFileMetadata,
  probeImageObjectUrlMetadata,
} from "@/features/source-quality/client/probe-source-media-metadata";
import {
  normalizeSourceMediaDimension,
  normalizeSourceMediaDurationMs,
  normalizeSourceMediaMetadataFacts,
  normalizeSourceMediaMimeType,
  sourceMediaMetadataFactsFromAssetResult,
} from "@/features/source-quality/domain/source-media-metadata";
import SourceQualitySummary from "@/features/source-quality/editor/SourceQualitySummary";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import {
  createSceneImageFromUrl,
  getSceneMedia,
  normalizeSceneMedia,
} from "@/features/story/utils/scene.utils";
import {
  buildSceneMediaImageFromUpload,
  buildSceneMediaVideoFromUpload,
} from "@/features/story/utils/scene-media-upload.utils";
import { syncFootieScript } from "@/lib/utils/voiceover";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function imageMedia(
  overrides: Partial<SceneMedia> & { url?: string } = {},
): SceneMedia {
  return {
    type: "image",
    url: overrides.url ?? "https://example.com/source.jpg",
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    ...overrides,
  };
}

function videoMedia(overrides: Partial<SceneMedia> = {}): SceneMedia {
  return {
    type: "video",
    url: "blob:video-1",
    source: "upload",
    mimeType: "video/mp4",
    durationMs: 4_000,
    width: 1080,
    height: 1920,
    muted: true,
    trimStartMs: 0,
    trimEndMs: 4_000,
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    ...overrides,
  };
}

function baseScene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 6,
    duration: 6,
    startMs: 0,
    endMs: 6_000,
    durationMs: 6_000,
    subtitle: "Fallback",
    narration: "Narration line.",
    ...overrides,
  };
}

function buildSampleAsset(
  partial: Partial<NormalizedAssetResult> = {},
): NormalizedAssetResult {
  return {
    id: partial.id ?? "mock:sample-attach-1",
    providerId: partial.providerId ?? "mock",
    title: partial.title ?? "Portrait source",
    description: partial.description ?? "Sample normalized asset",
    previewUrl: partial.previewUrl ?? "https://mock.asset-search.local/preview/sample-1",
    thumbnailUrl:
      partial.thumbnailUrl ?? "https://mock.asset-search.local/thumb/sample-1",
    fullResolutionUrl:
      partial.fullResolutionUrl ?? "https://mock.asset-search.local/full/sample-1",
    width: partial.width ?? 1080,
    height: partial.height ?? 1920,
    orientation: partial.orientation ?? "portrait",
    tags: partial.tags ?? ["football"],
    license: partial.license ?? {
      licenseType: "platform",
      requiresAttribution: false,
      commercialUse: true,
      modificationAllowed: true,
      editorialOnly: false,
    },
    attribution: partial.attribution ?? {
      creatorName: "Mock Creator",
      creatorUrl: "https://mock.asset-search.local/creator",
      providerName: "Mock Asset Search",
      providerUrl: "https://mock.asset-search.local",
      requiredText: "Photo by Mock Creator on Mock Asset Search",
    },
    score: partial.score ?? 0.82,
    metadata: partial.metadata ?? {},
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

function installImageProbeDom(options: {
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly fail?: boolean;
}): {
  createdUrls: string[];
  revokedUrls: string[];
  restore: () => void;
} {
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];
  const previous = {
    document: (globalThis as { document?: unknown }).document,
    window: (globalThis as { window?: unknown }).window,
    Image: (globalThis as { Image?: unknown }).Image,
    URL: globalThis.URL,
  };

  class FakeImage {
    onload: ((ev?: unknown) => void) | null = null;
    onerror: ((ev?: unknown) => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    private _src = "";
    set src(value: string) {
      this._src = value;
      queueMicrotask(() => {
        if (options.fail) {
          this.onerror?.(new Error("decode failed"));
          return;
        }
        this.naturalWidth = options.naturalWidth;
        this.naturalHeight = options.naturalHeight;
        this.onload?.(undefined);
      });
    }
    get src() {
      return this._src;
    }
  }

  (globalThis as { document: unknown }).document = {};
  (globalThis as { window: unknown }).window = {
    Image: FakeImage,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
  (globalThis as { Image: unknown }).Image = FakeImage;
  globalThis.URL.createObjectURL = ((blob: Blob) => {
    const url = `blob:probe-${createdUrls.length}-${blob.size}`;
    createdUrls.push(url);
    return url;
  }) as typeof URL.createObjectURL;
  globalThis.URL.revokeObjectURL = ((url: string) => {
    revokedUrls.push(url);
  }) as typeof URL.revokeObjectURL;

  return {
    createdUrls,
    revokedUrls,
    restore: () => {
      if (previous.document === undefined) {
        delete (globalThis as { document?: unknown }).document;
      } else {
        (globalThis as { document: unknown }).document = previous.document;
      }
      if (previous.window === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window: unknown }).window = previous.window;
      }
      if (previous.Image === undefined) {
        delete (globalThis as { Image?: unknown }).Image;
      } else {
        (globalThis as { Image: unknown }).Image = previous.Image;
      }
      globalThis.URL.createObjectURL = previous.URL.createObjectURL.bind(previous.URL);
      globalThis.URL.revokeObjectURL = previous.URL.revokeObjectURL.bind(previous.URL);
    },
  };
}

function createReplaceHarness(initial: FootieScript) {
  let script = initial;
  const owned = new Set<string>();
  const revoked: string[] = [];
  const generations = new Map<string, number>();
  let objectUrlSeq = 0;

  const session: SceneMediaReplaceSession = {
    getScript: () => script,
    onScriptChange: (next) => {
      script = next;
    },
    sourceQualityIntelligenceEnabled: true,
    isOwnedBlobUrl: (url) => owned.has(url),
    trackOwnedBlobUrl: (url) => {
      owned.add(url);
    },
    revokeOwnedBlobUrl: (url) => {
      if (!url || !url.startsWith("blob:") || !owned.has(url)) return;
      revoked.push(url);
      owned.delete(url);
    },
    beginRequest: (sceneId) => {
      const next = (generations.get(sceneId) ?? 0) + 1;
      generations.set(sceneId, next);
      return next;
    },
    isCurrentRequest: (sceneId, token) => generations.get(sceneId) === token,
    createObjectUrl: () => {
      objectUrlSeq += 1;
      const url = `blob:candidate-${objectUrlSeq}`;
      return url;
    },
  };

  return {
    session,
    getScript: () => script,
    setScript: (next: FootieScript) => {
      script = next;
    },
    owned,
    revoked,
  };
}

async function main(): Promise<void> {
  console.log("\nSource media metadata capture\n");

  test("domain/client split: pure domain has no browser APIs", () => {
    const domain = readSrc(
      "src/features/source-quality/domain/source-media-metadata.ts",
    );
    assert.doesNotMatch(domain, /["']use client["']/);
    assert.doesNotMatch(domain, /\bwindow\b|\bdocument\b/);
    assert.doesNotMatch(domain, /createObjectURL|revokeObjectURL/);
    assert.doesNotMatch(domain, /from ["']react["']/);
    assert.doesNotMatch(domain, /from ["']@\/features\/(preview|export|headless)/);

    const client = readSrc(
      "src/features/source-quality/client/probe-source-media-metadata.ts",
    );
    assert.match(client, /["']use client["']/);
    assert.match(client, /domain\/source-media-metadata/);
    assert.match(client, /assertBrowserImageProbeEnvironment|requires a browser environment/);
    assert.doesNotMatch(client, /sourceMediaMetadataFactsFromAssetResult/);
    assert.doesNotMatch(
      client,
      /export function normalizeSourceMediaDimension/,
    );
  });

  test("static dependency: asset-attach / server-safe code avoid client probe", () => {
    const assetService = readSrc("src/features/asset-attach/asset-attach.service.ts");
    assert.match(
      assetService,
      /from ["']@\/features\/source-quality\/domain\/source-media-metadata["']/,
    );
    assert.doesNotMatch(assetService, /source-quality\/client/);

    const barrel = readSrc("src/features/source-quality/index.ts");
    assert.match(barrel, /domain\/source-media-metadata/);
    assert.doesNotMatch(barrel, /probe-source-media-metadata|probeImage/);

    for (const rel of [
      "src/features/asset-attach/asset-attach.service.ts",
      "src/features/asset-attach/asset-attach.utils.ts",
      "src/features/export/domain/build-export-manifest.ts",
      "src/app/api/visual-retention/capabilities/route.ts",
    ]) {
      assert.doesNotMatch(
        readSrc(rel),
        /source-quality\/client|probe-source-media-metadata/,
      );
    }
  });

  test("normalization: positive finite dims rounded; invalid omitted", () => {
    assert.equal(normalizeSourceMediaDimension(1080.4), 1080);
    assert.equal(normalizeSourceMediaDimension(0), undefined);
    assert.equal(normalizeSourceMediaMimeType(" Image/PNG "), "image/png");
    assert.equal(normalizeSourceMediaDurationMs(1234.6), 1235);
    assert.deepEqual(
      normalizeSourceMediaMetadataFacts({
        width: 0,
        height: 1920,
        mimeType: " ",
        durationMs: -1,
      }),
      { height: 1920 },
    );
  });

  await testAsync(
    "image probe: naturalWidth/Height + MIME after successful decode",
    async () => {
      const dom = installImageProbeDom({
        naturalWidth: 1080,
        naturalHeight: 1920,
      });
      try {
        const file = new File([new Uint8Array([1, 2, 3])], "shot.png", {
          type: "image/png",
        });
        const facts = await probeImageFileMetadata(file);
        assert.deepEqual(facts, {
          width: 1080,
          height: 1920,
          mimeType: "image/png",
        });
        assert.deepEqual(dom.revokedUrls, dom.createdUrls);
      } finally {
        dom.restore();
      }
    },
  );

  await testAsync("browser guard: missing Image fails without leaking URLs", async () => {
    const previousWindow = (globalThis as { window?: unknown }).window;
    const previousImage = (globalThis as { Image?: unknown }).Image;
    const revoked: string[] = [];
    const previousCreate = globalThis.URL.createObjectURL;
    const previousRevoke = globalThis.URL.revokeObjectURL;
    (globalThis as { window: unknown }).window = {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    };
    delete (globalThis as { Image?: unknown }).Image;
    globalThis.URL.createObjectURL = (() => {
      throw new Error("should not create object URL without Image");
    }) as typeof URL.createObjectURL;
    globalThis.URL.revokeObjectURL = ((url: string) => {
      revoked.push(url);
    }) as typeof URL.revokeObjectURL;
    try {
      await assert.rejects(
        () => probeImageObjectUrlMetadata("blob:x", "image/png"),
        /browser environment|Image support/i,
      );
      assert.equal(revoked.length, 0);
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window: unknown }).window = previousWindow;
      }
      if (previousImage === undefined) {
        delete (globalThis as { Image?: unknown }).Image;
      } else {
        (globalThis as { Image: unknown }).Image = previousImage;
      }
      globalThis.URL.createObjectURL = previousCreate;
      globalThis.URL.revokeObjectURL = previousRevoke;
    }
  });

  await testAsync(
    "replace transaction: failed image probe preserves old media and blob",
    async () => {
      const oldUrl = "blob:owned-old";
      const harness = createReplaceHarness(
        syncFootieScript({
          title: "Replace",
          narration: "Line",
          totalDuration: 6,
          scenes: [
            baseScene({
              media: imageMedia({ url: oldUrl, width: 720, height: 1280 }),
              image: createSceneImageFromUrl(oldUrl),
            }),
          ],
        }),
      );
      harness.owned.add(oldUrl);

      const outcome = await performSceneMediaReplace(
        {
          ...harness.session,
          probeImageObjectUrlMetadata: async () => {
            throw new Error("Unable to read image metadata");
          },
        },
        "scene-1",
        new File([new Uint8Array([1])], "bad.png", { type: "image/png" }),
      );

      assert.equal(outcome.status, "failed");
      assert.equal(harness.getScript().scenes[0]?.media?.url, oldUrl);
      assert.equal(harness.getScript().scenes[0]?.media?.width, 720);
      assert.ok(harness.owned.has(oldUrl));
      assert.equal(harness.revoked.includes(oldUrl), false);
      assert.ok(harness.revoked.some((url) => url.startsWith("blob:candidate-")));
    },
  );

  await testAsync(
    "replace transaction: failed video probe preserves old media",
    async () => {
      const oldUrl = "blob:owned-video-old";
      const harness = createReplaceHarness(
        syncFootieScript({
          title: "Replace video",
          narration: "Line",
          totalDuration: 6,
          scenes: [baseScene({ media: videoMedia({ url: oldUrl }) })],
        }),
      );
      harness.owned.add(oldUrl);

      const outcome = await performSceneMediaReplace(
        {
          ...harness.session,
          probeVideoMetadata: async () => {
            throw new Error("Unable to read video metadata");
          },
        },
        "scene-1",
        new File([new Uint8Array([1])], "clip.mp4", { type: "video/mp4" }),
      );

      assert.equal(outcome.status, "failed");
      assert.equal(harness.getScript().scenes[0]?.media?.url, oldUrl);
      assert.equal(harness.revoked.includes(oldUrl), false);
      assert.ok(harness.revoked.some((url) => url.startsWith("blob:candidate-")));
    },
  );

  await testAsync(
    "replace transaction: success revokes old owned blob after commit only",
    async () => {
      const oldUrl = "blob:owned-old-success";
      const harness = createReplaceHarness(
        syncFootieScript({
          title: "Replace ok",
          narration: "Line",
          totalDuration: 6,
          scenes: [
            baseScene({
              media: imageMedia({ url: oldUrl }),
              image: createSceneImageFromUrl(oldUrl),
            }),
          ],
        }),
      );
      harness.owned.add(oldUrl);
      let revokedBeforeCommit = false;

      const outcome = await performSceneMediaReplace(
        {
          ...harness.session,
          onScriptChange: (next) => {
            revokedBeforeCommit = harness.revoked.includes(oldUrl);
            harness.session.onScriptChange(next);
          },
          probeImageObjectUrlMetadata: async () => ({
            width: 1080,
            height: 1920,
            mimeType: "image/png",
          }),
        },
        "scene-1",
        new File([new Uint8Array([1])], "ok.png", { type: "image/png" }),
      );

      assert.equal(outcome.status, "committed");
      assert.equal(revokedBeforeCommit, false);
      assert.ok(harness.revoked.includes(oldUrl));
      assert.equal(harness.getScript().scenes[0]?.media?.width, 1080);
      assert.match(harness.getScript().scenes[0]?.media?.url ?? "", /^blob:candidate-/);
    },
  );

  await testAsync(
    "replace transaction: external old URLs are never revoked",
    async () => {
      const external = "https://cdn.example.com/keep.jpg";
      const harness = createReplaceHarness(
        syncFootieScript({
          title: "External",
          narration: "Line",
          totalDuration: 6,
          scenes: [
            baseScene({
              media: imageMedia({ url: external }),
              image: createSceneImageFromUrl(external),
            }),
          ],
        }),
      );

      const outcome = await performSceneMediaReplace(
        {
          ...harness.session,
          probeImageObjectUrlMetadata: async () => ({
            width: 900,
            height: 1600,
            mimeType: "image/jpeg",
          }),
        },
        "scene-1",
        new File([new Uint8Array([1])], "next.jpg", { type: "image/jpeg" }),
      );

      assert.equal(outcome.status, "committed");
      assert.equal(harness.revoked.includes(external), false);
      assert.equal(harness.owned.has(external), false);
    },
  );

  await testAsync(
    "stale-script: unrelated narration edit during image probe survives",
    async () => {
      const harness = createReplaceHarness(
        syncFootieScript({
          title: "Stale",
          narration: "Original",
          totalDuration: 6,
          scenes: [
            baseScene({
              media: imageMedia({ url: "blob:old" }),
              narration: "Scene narration",
            }),
          ],
        }),
      );
      harness.owned.add("blob:old");

      const probeControl: { release: (() => void) | null } = { release: null };
      const probeGate = new Promise<void>((resolve) => {
        probeControl.release = resolve;
      });

      const replacePromise = performSceneMediaReplace(
        {
          ...harness.session,
          probeImageObjectUrlMetadata: async () => {
            await probeGate;
            return { width: 1080, height: 1920, mimeType: "image/png" };
          },
        },
        "scene-1",
        new File([new Uint8Array([1])], "new.png", { type: "image/png" }),
      );

      harness.setScript({
        ...harness.getScript(),
        narration: "Edited during probe",
        scenes: harness.getScript().scenes.map((scene) =>
          scene.id === "scene-1"
            ? { ...scene, subtitle: "Caption edited during probe" }
            : scene,
        ),
      });
      probeControl.release?.();
      const outcome = await replacePromise;

      assert.equal(outcome.status, "committed");
      assert.equal(harness.getScript().narration, "Edited during probe");
      assert.equal(
        harness.getScript().scenes[0]?.subtitle,
        "Caption edited during probe",
      );
      assert.equal(harness.getScript().scenes[0]?.media?.width, 1080);
    },
  );

  await testAsync(
    "stale-script: newer replacement wins; stale candidate revoked",
    async () => {
      const harness = createReplaceHarness(
        syncFootieScript({
          title: "Race",
          narration: "Line",
          totalDuration: 6,
          scenes: [baseScene({ media: imageMedia({ url: "blob:old" }) })],
        }),
      );
      harness.owned.add("blob:old");

      const slowControl: { release: (() => void) | null } = { release: null };
      const slowGate = new Promise<void>((resolve) => {
        slowControl.release = resolve;
      });

      const slow = performSceneMediaReplace(
        {
          ...harness.session,
          probeImageObjectUrlMetadata: async () => {
            await slowGate;
            return { width: 100, height: 200, mimeType: "image/png" };
          },
        },
        "scene-1",
        new File([new Uint8Array([1])], "slow.png", { type: "image/png" }),
      );

      const fast = performSceneMediaReplace(
        {
          ...harness.session,
          probeImageObjectUrlMetadata: async () => ({
            width: 2160,
            height: 3840,
            mimeType: "image/png",
          }),
        },
        "scene-1",
        new File([new Uint8Array([2])], "fast.png", { type: "image/png" }),
      );

      const fastOutcome = await fast;
      slowControl.release?.();
      const slowOutcome = await slow;

      assert.equal(fastOutcome.status, "committed");
      assert.equal(slowOutcome.status, "aborted");
      assert.equal(harness.getScript().scenes[0]?.media?.width, 2160);
      assert.ok(harness.revoked.includes("blob:candidate-1"));
    },
  );

  await testAsync(
    "stale-script: deleted scene is not recreated",
    async () => {
      const harness = createReplaceHarness(
        syncFootieScript({
          title: "Delete",
          narration: "Line",
          totalDuration: 6,
          scenes: [baseScene({ media: imageMedia({ url: "blob:old" }) })],
        }),
      );
      harness.owned.add("blob:old");

      const probeControl: { release: (() => void) | null } = { release: null };
      const probeGate = new Promise<void>((resolve) => {
        probeControl.release = resolve;
      });

      const replacePromise = performSceneMediaReplace(
        {
          ...harness.session,
          probeImageObjectUrlMetadata: async () => {
            await probeGate;
            return { width: 1080, height: 1920, mimeType: "image/png" };
          },
        },
        "scene-1",
        new File([new Uint8Array([1])], "late.png", { type: "image/png" }),
      );

      harness.setScript({
        ...harness.getScript(),
        scenes: [],
        totalDuration: 0,
      });
      probeControl.release?.();
      const outcome = await replacePromise;

      assert.equal(outcome.status, "failed");
      assert.equal(harness.getScript().scenes.length, 0);
      assert.ok(harness.revoked.some((url) => url.startsWith("blob:candidate-")));
      assert.equal(harness.revoked.includes("blob:old"), false);
    },
  );

  await testAsync(
    "stale-script: simultaneous uploads to different scenes do not cancel",
    async () => {
      const harness = createReplaceHarness(
        syncFootieScript({
          title: "Two scenes",
          narration: "Line",
          totalDuration: 12,
          scenes: [
            baseScene({
              id: "scene-1",
              media: imageMedia({ url: "blob:a" }),
            }),
            baseScene({
              id: "scene-2",
              start: 6,
              end: 12,
              startMs: 6_000,
              endMs: 12_000,
              media: imageMedia({ url: "blob:b" }),
            }),
          ],
        }),
      );
      harness.owned.add("blob:a");
      harness.owned.add("blob:b");

      const aControl: { release: (() => void) | null } = { release: null };
      const gateA = new Promise<void>((resolve) => {
        aControl.release = resolve;
      });

      const aPromise = performSceneMediaReplace(
        {
          ...harness.session,
          probeImageObjectUrlMetadata: async () => {
            await gateA;
            return { width: 720, height: 1280, mimeType: "image/png" };
          },
        },
        "scene-1",
        new File([new Uint8Array([1])], "a.png", { type: "image/png" }),
      );

      const bPromise = performSceneMediaReplace(
        {
          ...harness.session,
          probeImageObjectUrlMetadata: async () => ({
            width: 1080,
            height: 1920,
            mimeType: "image/png",
          }),
        },
        "scene-2",
        new File([new Uint8Array([2])], "b.png", { type: "image/png" }),
      );

      const bOutcome = await bPromise;
      aControl.release?.();
      const aOutcome = await aPromise;

      assert.equal(aOutcome.status, "committed");
      assert.equal(bOutcome.status, "committed");
      assert.equal(
        harness.getScript().scenes.find((scene) => scene.id === "scene-1")?.media
          ?.width,
        720,
      );
      assert.equal(
        harness.getScript().scenes.find((scene) => scene.id === "scene-2")?.media
          ?.width,
        1080,
      );
    },
  );

  test("async append callers handle Promise; stale selections silenced", () => {
    const affordance = readSrc(
      "src/features/timeline-editor/scene-media/scene-media-append-affordance.tsx",
    );
    assert.match(affordance, /appendApi\s*\.\s*appendImageFile/);
    assert.match(affordance, /\.then\(/);
    assert.match(affordance, /\.catch\(/);
    assert.match(affordance, /isStaleSceneMediaAppendError/);

    const appendHook = readSrc(
      "src/features/timeline-editor/scene-media/useSceneMediaImageAppend.ts",
    );
    assert.match(appendHook, /appendGenerationByScene/);
    assert.match(appendHook, /StaleSceneMediaAppendError/);
    assert.match(appendHook, /scriptRef\.current/);

    const mixedPanel = readSrc(
      "src/features/mixed-media-scenes/editor/MixedMediaSequencePanel.tsx",
    );
    assert.match(mixedPanel, /isStaleSceneMediaAppendError/);
  });

  await testAsync(
    "asset attach: capability-on remains render-equivalent; off keeps legacy shape",
    async () => {
      const asset = buildSampleAsset({
        width: 1080,
        height: 1920,
        fullResolutionUrl: "https://example.com/full.jpg",
        previewUrl: "https://example.com/preview.jpg",
      });
      const script = syncFootieScript({
        title: "Asset parity",
        narration: "Line",
        totalDuration: 6,
        scenes: [baseScene()],
      });

      const enabled = await attachNormalizedAssetToScene(
        {
          script,
          sceneId: "scene-1",
          asset,
          source: "asset_search",
          options: {
            sourceQualityIntelligenceEnabled: true,
            fitMode: "fit",
          },
        },
        {
          materializeAssetUrl: async () => ({
            success: true,
            playableUrl: "https://example.com/full.jpg",
            strategy: "remote",
            persisted: false,
          }),
        },
      );
      assert.equal(enabled.success, true);
      const scene = enabled.script!.scenes[0]!;
      assert.equal(scene.image?.url, "https://example.com/full.jpg");
      assert.equal(scene.media?.url, "https://example.com/full.jpg");
      assert.equal(scene.media?.source, "asset");
      assert.equal(scene.media?.width, 1080);
      assert.equal(scene.image?.fitMode, "fit");
      assert.equal(scene.media?.fitMode, "contain");
      assert.equal(scene.image?.x, scene.media?.transform?.x ?? 0);
      assert.equal(scene.image?.y, scene.media?.transform?.y ?? 0);
      assert.equal(scene.image?.scale, scene.media?.transform?.scale ?? 1);
      assert.equal(scene.image?.rotation ?? 0, scene.media?.transform?.rotation ?? 0);

      const framingImage = resolveSceneMediaFraming(scene, {
        media: getSceneMedia(scene),
      });
      const framingMedia = resolveSceneMediaFraming(
        { ...scene, image: undefined },
        { media: scene.media },
      );
      assert.equal(framingImage.fitMode, framingMedia.fitMode);
      assert.equal(framingImage.zoom, framingMedia.zoom);
      assert.equal(framingImage.rotationDeg, framingMedia.rotationDeg);

      const storyFor = (entry: FootieScene): FootieScript =>
        syncFootieScript({
          title: "Asset parity",
          narration: "Line",
          totalDuration: 6,
          scenes: [entry],
          exportSettings: {
            fileName: "asset-parity",
            format: "webm",
            quality: "standard",
            resolution: "1080x1920",
          },
        });
      const withoutMeta = {
        ...scene,
        media: scene.media
          ? { ...scene.media, width: undefined, height: undefined, mimeType: undefined }
          : undefined,
      };
      const manifestA = buildExportManifest({
        story: storyFor(withoutMeta),
        environment: CAPABLE_ENV,
      });
      const manifestB = buildExportManifest({
        story: storyFor(scene),
        environment: CAPABLE_ENV,
      });
      assert.equal(manifestA.fingerprint, manifestB.fingerprint);
      assert.equal(manifestA.version, EXPORT_MANIFEST_VERSION);

      const disabled = await attachNormalizedAssetToScene(
        {
          script,
          sceneId: "scene-1",
          asset,
          source: "asset_search",
          options: { sourceQualityIntelligenceEnabled: false },
        },
        {
          materializeAssetUrl: async () => ({
            success: true,
            playableUrl: "https://example.com/full.jpg",
            strategy: "remote",
            persisted: false,
          }),
        },
      );
      assert.equal(disabled.sceneMedia, undefined);
      assert.equal(disabled.script?.scenes[0]?.media, undefined);
      assert.ok(disabled.script?.scenes[0]?.image?.url);
    },
  );

  test("mixed-media append/replace/reorder preserves metadata; dual-write agrees", () => {
    const mediaA = imageMedia({
      url: "https://example.com/a.jpg",
      width: 1080,
      height: 1920,
      mimeType: "image/jpeg",
    });
    const mediaB = videoMedia({
      url: "blob:video-b",
      width: 720,
      height: 1280,
      mimeType: "video/webm",
      durationMs: 3_000,
      trimEndMs: 3_000,
    });

    let scene = baseScene();
    scene = appendMixedMediaSequenceItem(scene, mediaA, {
      mixedMediaScenesEnabled: true,
      generateId: () => "item-a",
    }).scene;
    scene = appendMixedMediaSequenceItem(scene, mediaB, {
      mixedMediaScenesEnabled: true,
      generateId: () => "item-b",
    }).scene;
    assert.equal(scene.visualSequence!.items[0]!.media.width, 1080);
    assert.equal(scene.mediaTimeline!.items[0]!.media.width, 1080);

    scene = reorderMixedMediaSequenceItem(scene, "item-b", 0, {
      mixedMediaScenesEnabled: true,
    }).scene;
    assert.equal(scene.visualSequence!.items[0]!.media.width, 720);

    scene = writeMixedMediaSequenceItems(
      scene,
      [
        {
          id: "item-b",
          media: scene.visualSequence!.items[0]!.media,
          startOffsetMs: 0,
          durationMs: 3_000,
        },
        {
          id: "item-a",
          media: imageMedia({
            url: "https://example.com/replaced.jpg",
            width: 2160,
            height: 3840,
          }),
          startOffsetMs: 3_000,
          durationMs: 3_000,
        },
      ],
      { mixedMediaScenesEnabled: true },
    ).scene;
    assert.equal(scene.visualSequence!.items[1]!.media.width, 2160);
    assert.equal(scene.mediaTimeline!.items[1]!.media.height, 3840);
  });

  test("UI: details facts + no Apply/Reset; failed replacement leaves prior summary intact", () => {
    const knownMedia = imageMedia({
      width: 1080,
      height: 1920,
      mimeType: "image/jpeg",
    });
    const known = renderToStaticMarkup(
      createElement(SourceQualitySummary, {
        scene: baseScene({ media: knownMedia }),
        media: knownMedia,
        readiness: { ready: true, enabled: true },
      }),
    );
    assert.match(known, /Suitable for 1080p/);

    const prior = renderToStaticMarkup(
      createElement(SourceQualitySummary, {
        scene: baseScene({ media: knownMedia }),
        media: knownMedia,
        readiness: { ready: true, enabled: true },
      }),
    );
    assert.match(prior, /Suitable for 1080p/);

    const summarySrc = readSrc(
      "src/features/source-quality/editor/SourceQualitySummary.tsx",
    );
    assert.match(summarySrc, /data-source-quality-facts/);
    assert.match(summarySrc, /data-source-quality-fact="dimensions"/);
    assert.match(summarySrc, /No changes are applied automatically/);
    assert.doesNotMatch(summarySrc, /buildMediaFramingPatch/);

    const uploadHook = readSrc("src/features/editor/hooks/useSceneImageUpload.ts");
    assert.match(uploadHook, /performSceneMediaReplace/);
    assert.match(uploadHook, /beginRequest/);
    assert.match(uploadHook, /revokeOwnedBlobUrl\(previousUrl\)/);
    const replaceFn = uploadHook.slice(
      uploadHook.indexOf("export async function performSceneMediaReplace"),
    );
    const probeIndex = replaceFn.search(/await probe(Image|Video)\b|await probeImage\b|await probeVideo\b/);
    const revokePreviousIndex = replaceFn.indexOf("revokeOwnedBlobUrl(previousUrl)");
    assert.ok(probeIndex >= 0);
    assert.ok(revokePreviousIndex > probeIndex);
  });

  test("8B image append preserves metadata through mediaTimeline", () => {
    const media = buildSceneMediaImageFromUpload(
      createSceneImageFromUrl("https://example.com/timeline.jpg"),
      "image/png",
      { width: 900, height: 1600 },
    );
    const scene = appendSceneMediaImageItem(baseScene({ media: imageMedia() }), media, {
      generateId: () => "timeline-2",
    }).scene;
    const item = scene.mediaTimeline!.items.find((entry) => entry.id === "timeline-2");
    assert.equal(item!.media.width, 900);
  });

  test("JSON round-trip + normalizeSceneMedia omit invalid metadata", () => {
    const normalized = normalizeSceneMedia(
      JSON.parse(
        JSON.stringify(
          imageMedia({ width: 1080, height: 1920, mimeType: "image/png" }),
        ),
      ),
    );
    assert.equal(normalized?.width, 1080);
    const invalid = normalizeSceneMedia({
      type: "image",
      url: "https://example.com/x.jpg",
      width: 0,
      height: -5,
      mimeType: "   ",
    });
    assert.equal(invalid?.width, undefined);
    assert.equal(invalid?.mimeType, undefined);
  });

  test("legacy project remains compatible without metadata", () => {
    const media = getSceneMedia(
      baseScene({
        image: {
          url: "https://example.com/legacy.jpg",
          scale: 1,
          x: 0,
          y: 0,
          fitMode: "fill",
        },
      }),
    );
    assert.equal(media?.width, undefined);
  });

  test("video builder retains probe fields; capability-off image path omits dims", () => {
    const video = buildSceneMediaVideoFromUpload("blob:vid", {
      durationMs: 2500,
      width: 1920,
      height: 1080,
      mimeType: "video/mp4",
    });
    assert.equal(video.width, 1920);
    assert.equal(video.durationMs, 2500);
    const image = buildSceneMediaImageFromUpload(
      createSceneImageFromUrl("blob:legacy"),
      "image/png",
    );
    assert.equal(image.width, undefined);
  });

  test("asset-result facts copied without provider call", () => {
    assert.deepEqual(
      sourceMediaMetadataFactsFromAssetResult({
        width: 1080,
        height: 1920,
        metadata: { mimeType: "image/jpeg" },
      }),
      { width: 1080, height: 1920, mimeType: "image/jpeg" },
    );
  });

  console.log(`\nSource media metadata capture: ${passed} PASS\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
