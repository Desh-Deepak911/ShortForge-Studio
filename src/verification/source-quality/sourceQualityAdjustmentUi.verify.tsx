/**
 * Source-quality adjustment controls UI verification.
 * Run via: npm run test:source-quality-adjustment-ui
 */

import "../test-utils/install-minimal-dom";

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { act, createElement, useState, type ReactElement } from "react";
import { createRoot } from "react-dom/client";

import { resolveSceneMediaFraming } from "@/features/media-framing";
import {
  appendMixedMediaSequenceItem,
  readMixedMediaSequenceItems,
  removeMixedMediaSequenceItem,
} from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import {
  applySourceQualityAdjustmentRecommendation,
} from "@/features/source-quality/editor/source-quality-adjustment.commands";
import { recommendSafeVisualAdjustment } from "@/features/source-quality/domain/safe-visual-adjustment-recommendation";
import { resolveSourceQualityWinningAdjustmentTarget } from "@/features/source-quality/adapters/resolve-source-quality-adjustment-target";
import SourceQualitySummary from "@/features/source-quality/editor/SourceQualitySummary";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import {
  getSceneMedia,
  normalizeSceneMedia,
} from "@/features/story/utils/scene.utils";
import { syncFootieScript } from "@/lib/utils/voiceover";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

let passed = 0;
const consoleErrors: string[] = [];
const originalConsoleError = console.error;

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
  width: number,
  height: number,
  options: {
    readonly url?: string;
    readonly scale?: number;
    readonly fitMode?: "cover" | "contain";
  } = {},
): SceneMedia {
  return {
    type: "image",
    url: options.url ?? "https://example.com/source.jpg",
    source: "upload",
    mimeType: "image/jpeg",
    width,
    height,
    fitMode: options.fitMode ?? "cover",
    transform: {
      x: 0,
      y: 0,
      scale: options.scale ?? 1,
      rotation: 0,
    },
  };
}

function baseScene(media: SceneMedia, narration = "Narration line."): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 6,
    duration: 6,
    startMs: 0,
    endMs: 6_000,
    durationMs: 6_000,
    subtitle: "Fallback",
    narration,
    media,
    image: {
      url: media.url!,
      fitMode: media.fitMode === "contain" ? "fit" : "fill",
      x: media.transform?.x ?? 0,
      y: media.transform?.y ?? 0,
      scale: media.transform?.scale ?? 1,
      rotation: media.transform?.rotation ?? 0,
    },
  };
}

function scriptFor(scene: FootieScene): FootieScript {
  return syncFootieScript({
    title: "SQ adjustment UI",
    narration: scene.narration ?? "Narration line.",
    totalDuration: 6,
    scenes: [scene],
    exportSettings: {
      fileName: "sq-adj-ui",
      format: "webm",
      quality: "standard",
      resolution: "1080x1920",
    },
  });
}

function framingFor(media: SceneMedia) {
  return resolveSceneMediaFraming({ media }, { media });
}

function getReactProps(node: Element): {
  onClick?: (event: unknown) => void;
} {
  const key = Reflect.ownKeys(node).find((entry) =>
    String(entry).startsWith("__reactProps$"),
  );
  assert.ok(key, "expected React props on rendered node");
  return (node as unknown as Record<PropertyKey, unknown>)[key!] as {
    onClick?: (event: unknown) => void;
  };
}

async function click(node: Element | null): Promise<void> {
  assert.ok(node, "expected clickable node");
  const props = getReactProps(node);
  await act(async () => {
    props.onClick?.({
      type: "click",
      target: node,
      currentTarget: node,
      preventDefault() {},
      stopPropagation() {},
    });
  });
}

/**
 * Verification-local harness: derives one coherent winning target the same way
 * StudioSceneInspector does (media + mediaItemId inseparable).
 */
function Harness({
  initialScript,
  selectedMediaItemId = null,
  mixedMediaScenesEnabled = false,
  ready = true,
  enabled = true,
}: {
  readonly initialScript: FootieScript;
  readonly selectedMediaItemId?: string | null;
  readonly mixedMediaScenesEnabled?: boolean;
  readonly ready?: boolean;
  readonly enabled?: boolean;
}): ReactElement {
  const [script, setScript] = useState(initialScript);
  const scene = script.scenes[0]!;
  const target = resolveSourceQualityWinningAdjustmentTarget(scene, {
    mixedMediaScenesEnabled,
    selectedMediaItemId,
  });
  return createElement(SourceQualitySummary, {
    script,
    scene,
    onScriptChange: (next) => setScript(next),
    media: target.media,
    framing: target.media
      ? framingFor(target.media)
      : framingFor(imageMedia(1080, 1920)),
    mediaItemId: target.mediaItemId,
    mixedMediaScenesEnabled,
    readiness: { ready, enabled },
  });
}

async function mountHarness(element: ReactElement): Promise<{
  host: HTMLElement;
  cleanup: () => Promise<void>;
}> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return {
    host,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function openDetails(host: HTMLElement): Promise<void> {
  const toggle = host.querySelector(
    "[data-source-quality-details-toggle]",
  ) as HTMLButtonElement | null;
  assert.ok(toggle);
  if (toggle.getAttribute("aria-expanded") === "true") {
    return;
  }
  await click(toggle);
}

function emptyTimedScene(): FootieScene {
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
  };
}

function buildMixedThreeItemScene(): FootieScene {
  let scene = emptyTimedScene();
  scene = appendMixedMediaSequenceItem(
    scene,
    imageMedia(1080, 1920, {
      url: "https://example.com/first.jpg",
      scale: 1.5,
    }),
    { mixedMediaScenesEnabled: true, generateId: () => "item-first" },
  ).scene;
  scene = appendMixedMediaSequenceItem(
    scene,
    imageMedia(1080, 1920, {
      url: "https://example.com/middle.jpg",
      scale: 1.6,
    }),
    { mixedMediaScenesEnabled: true, generateId: () => "item-middle" },
  ).scene;
  scene = appendMixedMediaSequenceItem(
    scene,
    imageMedia(800, 800, {
      url: "https://example.com/last.jpg",
      scale: 1.2,
    }),
    { mixedMediaScenesEnabled: true, generateId: () => "item-last" },
  ).scene;
  // Compatibility scene.media intentionally diverges from projected first item.
  return {
    ...scene,
    media: imageMedia(640, 640, {
      url: "https://example.com/ignored-scene-media.jpg",
      scale: 1.8,
    }),
  };
}

async function main(): Promise<void> {
  console.log("\nSource quality adjustment UI\n");
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" "));
    originalConsoleError(...args);
  };

  try {
    await testAsync("capability loading/off hide the entire Source quality UI", async () => {
      const media = imageMedia(1080, 1920, { scale: 1.4 });
      const script = scriptFor(baseScene(media));
      const off = await mountHarness(
        createElement(Harness, {
          initialScript: script,
          ready: true,
          enabled: false,
        }),
      );
      assert.equal(off.host.querySelector("[data-source-quality-summary]"), null);
      await off.cleanup();

      const loading = await mountHarness(
        createElement(Harness, {
          initialScript: script,
          ready: false,
          enabled: true,
        }),
      );
      assert.equal(
        loading.host.querySelector("[data-source-quality-summary]"),
        null,
      );
      await loading.cleanup();
    });

    await testAsync("low-resolution-only source has no Apply", async () => {
      const media = imageMedia(640, 360, { fitMode: "contain", scale: 1 });
      const script = scriptFor(baseScene(media));
      const { host, cleanup } = await mountHarness(
        createElement(Harness, { initialScript: script }),
      );
      await openDetails(host);
      assert.match(host.textContent ?? "", /higher-resolution source/i);
      assert.equal(
        host.querySelector("[data-source-quality-adjustment-apply]"),
        null,
      );
      await cleanup();
    });

    await testAsync("single-media Apply → Undo exact restoration", async () => {
      const media = imageMedia(1080, 1920, { scale: 1.4 });
      const script = scriptFor(baseScene(media));
      const { host, cleanup } = await mountHarness(
        createElement(Harness, { initialScript: script }),
      );
      await openDetails(host);
      const apply = host.querySelector(
        "[data-source-quality-adjustment-apply]",
      ) as HTMLButtonElement | null;
      assert.ok(apply);
      assert.match(apply.textContent ?? "", /Apply suggested adjustment/);
      await click(apply);
      assert.ok(host.querySelector("[data-source-quality-adjustment-undo]"));
      assert.ok(host.querySelector("[data-source-quality-adjustment-keep]"));
      assert.match(host.textContent ?? "", /Adjustment applied/);
      const undo = host.querySelector(
        "[data-source-quality-adjustment-undo]",
      );
      await click(undo);
      assert.ok(host.querySelector("[data-source-quality-adjustment-apply]"));
      assert.equal(
        host.querySelector("[data-source-quality-adjustment-undo]"),
        null,
      );
      await cleanup();
    });

    await testAsync(
      "mixed-media no selection: Apply mutates first projected item + timeline parity",
      async () => {
        const scene = buildMixedThreeItemScene();
        const ignoredUrl = "https://example.com/ignored-scene-media.jpg";
        const bridge = { latest: scriptFor(scene) };
        const { host, cleanup } = await mountHarness(
          createElement(function NoSelectionHarness() {
            const [current, setCurrent] = useState(bridge.latest);
            bridge.latest = current;
            const active = current.scenes[0]!;
            const target = resolveSourceQualityWinningAdjustmentTarget(active, {
              mixedMediaScenesEnabled: true,
              selectedMediaItemId: null,
            });
            assert.equal(target.mediaItemId, "item-first");
            assert.equal(target.media?.url, "https://example.com/first.jpg");
            return createElement(SourceQualitySummary, {
              script: current,
              scene: active,
              onScriptChange: (next) => setCurrent(next),
              media: target.media,
              framing: framingFor(target.media!),
              mediaItemId: target.mediaItemId,
              mixedMediaScenesEnabled: true,
              readiness: { ready: true, enabled: true },
            });
          }),
        );
        await openDetails(host);
        await click(host.querySelector("[data-source-quality-adjustment-apply]"));
        const after = bridge.latest.scenes[0]!;
        const seq = after.visualSequence!.items.find(
          (item) => item.id === "item-first",
        )!;
        const timeline = after.mediaTimeline!.items.find(
          (item) => item.id === "item-first",
        )!;
        assert.equal(seq.media.transform?.scale, 1);
        assert.equal(timeline.media.transform?.scale, 1);
        assert.deepEqual(
          seq.media.sourceQualityAdjustmentProvenance,
          timeline.media.sourceQualityAdjustmentProvenance,
        );
        assert.ok(seq.media.sourceQualityAdjustmentProvenance);
        const middle = after.visualSequence!.items.find(
          (item) => item.id === "item-middle",
        )!;
        const last = after.visualSequence!.items.find(
          (item) => item.id === "item-last",
        )!;
        assert.equal(middle.media.transform?.scale, 1.6);
        assert.equal(last.media.transform?.scale, 1.2);
        assert.equal(middle.media.sourceQualityAdjustmentProvenance, undefined);
        assert.equal(last.media.sourceQualityAdjustmentProvenance, undefined);
        // Dual-write syncs compatibility scene.media to the first item after write.
        // Pre-apply ignored divergence must not remain as a silent alternate target.
        assert.equal(after.media?.url, "https://example.com/first.jpg");
        assert.equal(after.media?.transform?.scale, 1);
        assert.notEqual(after.media?.url, ignoredUrl);
        await click(host.querySelector("[data-source-quality-adjustment-undo]"));
        const restored = bridge.latest.scenes[0]!.visualSequence!.items.find(
          (item) => item.id === "item-first",
        )!;
        assert.equal(restored.media.transform?.scale, 1.5);
        await cleanup();
      },
    );

    await testAsync(
      "selected mixed-media Apply/Undo with sequence/timeline parity",
      async () => {
        const scene = buildMixedThreeItemScene();
        const bridge = { latest: scriptFor(scene) };
        const { host, cleanup } = await mountHarness(
          createElement(function MixedHarness() {
            const [current, setCurrent] = useState(bridge.latest);
            bridge.latest = current;
            const active = current.scenes[0]!;
            const target = resolveSourceQualityWinningAdjustmentTarget(active, {
              mixedMediaScenesEnabled: true,
              selectedMediaItemId: "item-middle",
            });
            assert.equal(target.mediaItemId, "item-middle");
            return createElement(SourceQualitySummary, {
              script: current,
              scene: active,
              onScriptChange: (next) => setCurrent(next),
              media: target.media,
              framing: framingFor(target.media!),
              mediaItemId: target.mediaItemId,
              mixedMediaScenesEnabled: true,
              readiness: { ready: true, enabled: true },
            });
          }),
        );
        await openDetails(host);
        await click(host.querySelector("[data-source-quality-adjustment-apply]"));
        const after = bridge.latest.scenes[0]!;
        const seq = after.visualSequence!.items.find(
          (item) => item.id === "item-middle",
        )!;
        const timeline = after.mediaTimeline!.items.find(
          (item) => item.id === "item-middle",
        )!;
        assert.equal(seq.media.transform?.scale, 1);
        assert.equal(timeline.media.transform?.scale, 1);
        assert.deepEqual(
          seq.media.sourceQualityAdjustmentProvenance,
          timeline.media.sourceQualityAdjustmentProvenance,
        );
        assert.equal(
          after.visualSequence!.items.find((item) => item.id === "item-first")!
            .media.transform?.scale,
          1.5,
        );
        // Adjustment must not land on ignored/divergent scene.media; dual-write
        // may refresh compatibility from the untouched first item only.
        assert.equal(after.media?.url, "https://example.com/first.jpg");
        assert.equal(after.media?.transform?.scale, 1.5);
        assert.equal(after.media?.sourceQualityAdjustmentProvenance, undefined);
        assert.notEqual(
          after.media?.sourceQualityAdjustmentProvenance,
          seq.media.sourceQualityAdjustmentProvenance,
        );
        await click(host.querySelector("[data-source-quality-adjustment-undo]"));
        const restored = bridge.latest.scenes[0]!.visualSequence!.items.find(
          (item) => item.id === "item-middle",
        )!;
        assert.equal(restored.media.transform?.scale, 1.6);
        await cleanup();
      },
    );

    await testAsync(
      "stale selected id Apply mutates nearest survivor, not stale/first/scene.media",
      async () => {
        let scene = buildMixedThreeItemScene();
        scene = removeMixedMediaSequenceItem(scene, "item-middle", {
          mixedMediaScenesEnabled: true,
        }).scene;
        const items = readMixedMediaSequenceItems(scene);
        assert.equal(
          items.some((item) => item.id === "item-middle"),
          false,
        );
        const target = resolveSourceQualityWinningAdjustmentTarget(scene, {
          mixedMediaScenesEnabled: true,
          selectedMediaItemId: "item-middle",
          previousIndexHint: 1,
        });
        assert.equal(target.mediaItemId, "item-last");
        assert.equal(target.media?.url, "https://example.com/last.jpg");
        assert.notEqual(target.mediaItemId, "item-middle");
        assert.notEqual(target.mediaItemId, "item-first");

        const bridge = { latest: scriptFor(scene) };
        const { host, cleanup } = await mountHarness(
          createElement(function StaleHarness() {
            const [current, setCurrent] = useState(bridge.latest);
            bridge.latest = current;
            const active = current.scenes[0]!;
            const winning = resolveSourceQualityWinningAdjustmentTarget(active, {
              mixedMediaScenesEnabled: true,
              selectedMediaItemId: "item-middle",
              previousIndexHint: 1,
            });
            return createElement(SourceQualitySummary, {
              script: current,
              scene: active,
              onScriptChange: (next) => setCurrent(next),
              media: winning.media,
              framing: framingFor(winning.media!),
              mediaItemId: winning.mediaItemId,
              mixedMediaScenesEnabled: true,
              readiness: { ready: true, enabled: true },
            });
          }),
        );
        await openDetails(host);
        await click(host.querySelector("[data-source-quality-adjustment-apply]"));
        const after = bridge.latest.scenes[0]!;
        const survivor = after.visualSequence!.items.find(
          (item) => item.id === "item-last",
        )!;
        assert.equal(survivor.media.transform?.scale, 1);
        assert.ok(survivor.media.sourceQualityAdjustmentProvenance);
        assert.equal(
          after.visualSequence!.items.find((item) => item.id === "item-first")!
            .media.transform?.scale,
          1.5,
        );
        // Nearest-survivor Apply must not treat ignored scene.media or a stale
        // id as the command target.
        assert.equal(after.media?.url, "https://example.com/first.jpg");
        assert.equal(after.media?.transform?.scale, 1.5);
        assert.equal(after.media?.sourceQualityAdjustmentProvenance, undefined);
        assert.equal(
          after.visualSequence!.items.some((item) => item.id === "item-middle"),
          false,
        );
        await click(host.querySelector("[data-source-quality-adjustment-undo]"));
        assert.equal(
          bridge.latest.scenes[0]!.visualSequence!.items.find(
            (item) => item.id === "item-last",
          )!.media.transform?.scale,
          1.2,
        );
        await cleanup();
      },
    );

    test("Apply passes complete recommendation (static contract + domain)", () => {
      const controls = readSrc(
        "src/features/source-quality/editor/SourceQualityAdjustmentControls.tsx",
      );
      assert.doesNotMatch(controls, /sourceQualityAdjustmentCommandRunner/);
      assert.match(
        controls,
        /applySourceQualityAdjustmentRecommendation\(\{/,
      );
      assert.match(controls, /recommendation,/);
      assert.match(
        controls,
        /expectedRecommendationFingerprint:\s*\n?\s*recommendation\.recommendationFingerprint/,
      );
      assert.doesNotMatch(controls, /recommendationFingerprint:\s*recommendation/);
      const media = imageMedia(1080, 1920, { scale: 1.4 });
      const recommendation = recommendSafeVisualAdjustment({
        media,
        framing: framingFor(media),
      });
      assert.equal(recommendation.applicable, true);
      assert.ok(recommendation.recommendationFingerprint);
      const applied = applySourceQualityAdjustmentRecommendation({
        scene: baseScene(media),
        recommendation,
        sourceQualityIntelligenceEnabled: true,
        mixedMediaScenesEnabled: false,
      });
      assert.equal(applied.ok, true);
    });

    await testAsync("Keep preserves framing and clears provenance", async () => {
      const media = imageMedia(1080, 1920, { scale: 1.4 });
      const bridge = { latest: scriptFor(baseScene(media)) };
      const { host, cleanup } = await mountHarness(
        createElement(function KeepHarness() {
          const [script, setScript] = useState(bridge.latest);
          bridge.latest = script;
          const scene = script.scenes[0]!;
          const target = resolveSourceQualityWinningAdjustmentTarget(scene, {
            mixedMediaScenesEnabled: false,
            selectedMediaItemId: null,
          });
          return createElement(SourceQualitySummary, {
            script,
            scene,
            onScriptChange: setScript,
            media: target.media,
            framing: framingFor(target.media!),
            mediaItemId: target.mediaItemId,
            readiness: { ready: true, enabled: true },
          });
        }),
      );
      await openDetails(host);
      await click(host.querySelector("[data-source-quality-adjustment-apply]"));
      assert.ok(host.querySelector("[data-source-quality-adjustment-keep]"));
      await click(host.querySelector("[data-source-quality-adjustment-keep]"));
      const mediaAfter = getSceneMedia(bridge.latest.scenes[0]!)!;
      assert.equal(mediaAfter.transform?.scale, 1);
      assert.equal(mediaAfter.sourceQualityAdjustmentProvenance, undefined);
      assert.equal(
        host.querySelector("[data-source-quality-adjustment-undo]"),
        null,
      );
      const live =
        host.querySelector("[data-source-quality-adjustment-status-live]")
          ?.textContent ?? "";
      assert.match(live, /Undo history removed|framing is unchanged|Suggested framing/i);
      await cleanup();
    });

    await testAsync(
      "stale manual framing disables unsafe Undo and allows Dismiss",
      async () => {
        const media = imageMedia(1080, 1920, { scale: 1.4 });
        const scene = baseScene(media);
        const recommendation = recommendSafeVisualAdjustment({
          media,
          framing: framingFor(media),
        });
        const applied = applySourceQualityAdjustmentRecommendation({
          scene,
          recommendation,
          sourceQualityIntelligenceEnabled: true,
          mixedMediaScenesEnabled: false,
        });
        assert.equal(applied.ok, true);
        if (!applied.ok) return;
        const manualMedia: SceneMedia = {
          ...getSceneMedia(applied.scene)!,
          transform: {
            x: 0,
            y: 0,
            scale: 1.25,
            rotation: 0,
          },
          sourceQualityAdjustmentProvenance:
            getSceneMedia(applied.scene)!.sourceQualityAdjustmentProvenance,
        };
        const manualScene = {
          ...applied.scene,
          media: manualMedia,
          image: {
            ...applied.scene.image!,
            scale: 1.25,
          },
        };
        const { host, cleanup } = await mountHarness(
          createElement(Harness, {
            initialScript: scriptFor(manualScene),
          }),
        );
        await openDetails(host);
        assert.equal(
          host.querySelector("[data-source-quality-adjustment-undo]"),
          null,
        );
        assert.ok(
          host.querySelector("[data-source-quality-adjustment-dismiss]"),
        );
        assert.match(host.textContent ?? "", /edited manually/i);
        await click(
          host.querySelector("[data-source-quality-adjustment-dismiss]"),
        );
        assert.equal(
          host.querySelector("[data-source-quality-adjustment-dismiss]"),
          null,
        );
        await cleanup();
      },
    );

    await testAsync(
      "recommendation-contract-only stale state retains exact Undo",
      async () => {
        const media = imageMedia(1080, 1920, { scale: 1.4 });
        const scene = baseScene(media);
        const recommendation = recommendSafeVisualAdjustment({
          media,
          framing: framingFor(media),
        });
        const applied = applySourceQualityAdjustmentRecommendation({
          scene,
          recommendation,
          sourceQualityIntelligenceEnabled: true,
          mixedMediaScenesEnabled: false,
        });
        assert.equal(applied.ok, true);
        if (!applied.ok) return;
        const afterMedia = getSceneMedia(applied.scene)!;
        const contractChanged: FootieScene = {
          ...applied.scene,
          media: {
            ...afterMedia,
            sourceQualityAdjustmentProvenance: {
              ...afterMedia.sourceQualityAdjustmentProvenance!,
              recommendationFingerprint: "older-contract",
            },
          },
        };
        const bridge = { latest: scriptFor(contractChanged) };
        const { host, cleanup } = await mountHarness(
          createElement(function ContractHarness() {
            const [script, setScript] = useState(bridge.latest);
            bridge.latest = script;
            const current = script.scenes[0]!;
            const target = resolveSourceQualityWinningAdjustmentTarget(current, {
              mixedMediaScenesEnabled: false,
            });
            return createElement(SourceQualitySummary, {
              script,
              scene: current,
              onScriptChange: setScript,
              media: target.media,
              framing: framingFor(target.media!),
              mediaItemId: target.mediaItemId,
              readiness: { ready: true, enabled: true },
            });
          }),
        );
        await openDetails(host);
        assert.match(host.textContent ?? "", /older recommendation/i);
        assert.ok(host.querySelector("[data-source-quality-adjustment-undo]"));
        await click(host.querySelector("[data-source-quality-adjustment-undo]"));
        assert.equal(
          getSceneMedia(bridge.latest.scenes[0]!)!.transform?.scale,
          1.4,
        );
        await cleanup();
      },
    );

    await testAsync(
      "malformed provenance is discarded by story normalization before inspector",
      async () => {
        const rawMedia = {
          ...imageMedia(1080, 1920, { scale: 1.4 }),
          sourceQualityAdjustmentProvenance: { version: 99 },
        } as unknown as SceneMedia;
        const normalizedAlone = normalizeSceneMedia(rawMedia);
        assert.ok(normalizedAlone);
        assert.equal(
          normalizedAlone!.sourceQualityAdjustmentProvenance,
          undefined,
        );

        const synced = scriptFor(baseScene(rawMedia));
        const syncedMedia = getSceneMedia(synced.scenes[0]!);
        assert.ok(syncedMedia);
        assert.equal(
          syncedMedia!.sourceQualityAdjustmentProvenance,
          undefined,
        );

        const { host, cleanup } = await mountHarness(
          createElement(Harness, { initialScript: synced }),
        );
        await openDetails(host);
        // Live inspector never offers Dismiss for a field already removed by
        // canonical normalization. Command-level dismiss for raw authoring
        // edge cases remains covered in sourceQualityAdjustmentCommands.verify.
        assert.equal(
          host.querySelector("[data-source-quality-adjustment-dismiss]"),
          null,
        );
        assert.doesNotMatch(host.textContent ?? "", /could not be read/i);
        // Applicable recommendation still offered for zoomed framing.
        assert.ok(host.querySelector("[data-source-quality-adjustment-apply]"));
        await cleanup();
      },
    );

    test("one-way feature deps: mixed-media never imports source-quality", () => {
      const root = path.join(process.cwd(), "src/features/mixed-media-scenes");
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const full = path.join(dir, entry);
          if (statSync(full).isDirectory()) {
            walk(full);
          } else if (/\.(ts|tsx)$/.test(entry)) {
            files.push(full);
          }
        }
      };
      walk(root);
      assert.ok(files.length > 0);
      for (const file of files) {
        const src = readFileSync(file, "utf8");
        assert.doesNotMatch(
          src,
          /@\/features\/source-quality|features\/source-quality/,
          `${path.relative(process.cwd(), file)} must not import source-quality`,
        );
      }
      const adapter = readSrc(
        "src/features/source-quality/adapters/resolve-source-quality-adjustment-target.ts",
      );
      assert.match(
        adapter,
        /from ["']@\/features\/mixed-media-scenes\/adapters\/inspector-scene-media-projection["']/,
      );
      assert.match(adapter, /resolveSourceQualityMedia/);
      assert.doesNotMatch(
        adapter,
        /from ["']@\/features\/mixed-media-scenes["']/,
      );
      const mixedBarrel = readSrc("src/features/mixed-media-scenes/index.ts");
      assert.doesNotMatch(
        mixedBarrel,
        /resolveSourceQualityWinningAdjustmentTarget|source-quality/,
      );
      const sqBarrel = readSrc("src/features/source-quality/index.ts");
      assert.match(sqBarrel, /resolve-source-quality-adjustment-target/);
      assert.doesNotMatch(
        sqBarrel,
        /from ["']@\/features\/mixed-media-scenes["']/,
      );
      const inspector = readSrc(
        "src/features/editor/components/StudioSceneInspector.tsx",
      );
      assert.match(
        inspector,
        /from ["']@\/features\/source-quality\/adapters\/resolve-source-quality-adjustment-target["']/,
      );
    });

    test("previous-index ref lifecycle + hydration-safe fallback", () => {
      const inspector = readSrc(
        "src/features/editor/components/StudioSceneInspector.tsx",
      );
      assert.match(inspector, /lastSelectedMediaIndexRef/);
      assert.match(
        inspector,
        /lastSelectedMediaIndexRef\.current = selectedMediaIndex/,
      );
      assert.doesNotMatch(inspector, /lastSelectedMediaIndexHint/);
      assert.doesNotMatch(inspector, /setLastSelectedMediaIndexHint/);
      assert.doesNotMatch(
        inspector,
        /if\s*\(\s*selectedMediaIndex\s*>=\s*0[\s\S]{0,120}set[A-Z]/,
      );
      assert.doesNotMatch(inspector, /setTimeout|setInterval/);

      const scene = buildMixedThreeItemScene();
      const liveMiddle = resolveSourceQualityWinningAdjustmentTarget(scene, {
        mixedMediaScenesEnabled: true,
        selectedMediaItemId: "item-middle",
        previousIndexHint: 1,
      });
      assert.equal(liveMiddle.mediaItemId, "item-middle");
      assert.equal(liveMiddle.media?.url, "https://example.com/middle.jpg");

      const afterDelete = removeMixedMediaSequenceItem(scene, "item-middle", {
        mixedMediaScenesEnabled: true,
      }).scene;
      const nearestAtPriorIndex = resolveSourceQualityWinningAdjustmentTarget(
        afterDelete,
        {
          mixedMediaScenesEnabled: true,
          selectedMediaItemId: "item-middle",
          previousIndexHint: 1,
        },
      );
      assert.equal(nearestAtPriorIndex.mediaItemId, "item-last");
      assert.equal(
        nearestAtPriorIndex.media?.url,
        "https://example.com/last.jpg",
      );

      const noRecordedIndex = resolveSourceQualityWinningAdjustmentTarget(
        afterDelete,
        {
          mixedMediaScenesEnabled: true,
          selectedMediaItemId: "item-middle",
          previousIndexHint: -1,
        },
      );
      assert.equal(noRecordedIndex.mediaItemId, "item-first");
      assert.equal(
        noRecordedIndex.media?.url,
        "https://example.com/first.jpg",
      );

      const inspectorWiring = readSrc(
        "src/features/editor/components/StudioSceneInspector.tsx",
      );
      assert.match(inspectorWiring, /sourceQualityWinningMediaItemId/);
      assert.match(
        inspectorWiring,
        /mediaItemId=\{sourceQualityWinningMediaItemId\}/,
      );
      assert.doesNotMatch(
        inspectorWiring,
        /isSceneMediaItemSelected \? selectedMediaItemId/,
      );
    });

    test("displayed media and command target cannot diverge", () => {
      const adapter = readSrc(
        "src/features/source-quality/adapters/resolve-source-quality-adjustment-target.ts",
      );
      assert.match(adapter, /resolveSourceQualityWinningAdjustmentTarget/);
      assert.match(
        adapter,
        /media:\s*nearest\.media,\s*mediaItemId:\s*nearest\.itemId/,
      );
      const scene = buildMixedThreeItemScene();
      const noSelection = resolveSourceQualityWinningAdjustmentTarget(scene, {
        mixedMediaScenesEnabled: true,
        selectedMediaItemId: null,
      });
      assert.equal(noSelection.mediaItemId, "item-first");
      assert.equal(noSelection.media?.url, "https://example.com/first.jpg");
      const stale = resolveSourceQualityWinningAdjustmentTarget(
        removeMixedMediaSequenceItem(scene, "item-middle", {
          mixedMediaScenesEnabled: true,
        }).scene,
        {
          mixedMediaScenesEnabled: true,
          selectedMediaItemId: "item-middle",
          previousIndexHint: 1,
        },
      );
      assert.equal(stale.mediaItemId, "item-last");
      assert.equal(stale.media?.url, "https://example.com/last.jpg");
    });

    test("no controls outside Details; no direct framing writes; no mutable runner", () => {
      const summary = readSrc(
        "src/features/source-quality/editor/SourceQualitySummary.tsx",
      );
      assert.match(summary, /detailsOpen && assessment\.hasMedia/);
      assert.match(summary, /SourceQualityAdjustmentControls/);
      const controls = readSrc(
        "src/features/source-quality/editor/SourceQualityAdjustmentControls.tsx",
      );
      assert.match(controls, /applySourceQualityAdjustmentRecommendation/);
      assert.doesNotMatch(controls, /sourceQualityAdjustmentCommandRunner/);
      assert.doesNotMatch(controls, /buildMediaFramingPatch|updateSceneMediaItemMedia/);
      assert.doesNotMatch(
        controls,
        /scene\.image\s*=|scene\.media\s*=|visualSequence\s*=/,
      );
      const barrel = readSrc("src/features/source-quality/index.ts");
      assert.doesNotMatch(barrel, /sourceQualityAdjustmentCommandRunner/);
      const itemInspector = readSrc(
        "src/features/editor/components/media/SceneMediaItemInspector.tsx",
      );
      assert.doesNotMatch(itemInspector, /SourceQualitySummary|SourceQualityAdjustment/);
    });

    test("no React controlled-input or hydration warning noise", () => {
      assert.equal(
        consoleErrors.some((entry) =>
          /controlled|uncontrolled|hydration|did not match/i.test(entry),
        ),
        false,
        consoleErrors.join("\n"),
      );
    });

    test("responsibility-based filenames", () => {
      for (const rel of [
        "src/features/source-quality/adapters/resolve-source-quality-adjustment-target.ts",
        "src/features/source-quality/editor/SourceQualityAdjustmentControls.tsx",
        "src/verification/source-quality/sourceQualityAdjustmentUi.verify.tsx",
        "src/verification/source-quality/sourceQualityAdjustmentWorkspaceIntegration.verify.ts",
        "src/verification/source-quality/sourceQualityAdjustmentAccessibility.verify.tsx",
      ]) {
        assert.doesNotMatch(rel, /sprint|12[Dd]|slice|checkpoint|hardening|final/i);
        assert.ok(readSrc(rel).length > 0);
      }
    });
  } finally {
    console.error = originalConsoleError;
  }

  console.log(`\nSource quality adjustment UI: ${passed} PASS\n`);
}

void main();
