/**
 * Visual-effect controls UI verification.
 * Run via: npm run test:media-visual-effects
 */

import "../test-utils/install-minimal-dom";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, useState, type ReactElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import MediaVisualEffectControls from "@/features/media-motion/editor/MediaVisualEffectControls";
import {
  applyMediaVisualEffectPreset,
  MEDIA_VISUAL_EFFECT_SELECTION_REQUIRED_MESSAGE,
  normalizeSceneMediaMotion,
  resetMediaVisualEffect,
} from "@/features/media-motion";
import type { SceneMedia } from "@/features/story/types";

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

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function baseMedia(): SceneMedia {
  return {
    type: "image",
    url: "https://example.com/a.jpg",
    source: "upload",
    motion: normalizeSceneMediaMotion({
      version: 1,
      enabled: false,
      presetId: "static",
      easing: "linear",
      intensity: 0,
      startTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
      endTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    }),
  };
}

function getReactProps(node: Element): {
  onClick?: (event: unknown) => void;
  onKeyDown?: (event: {
    key: string;
    preventDefault: () => void;
  }) => void;
} {
  const key = Reflect.ownKeys(node).find((entry) =>
    String(entry).startsWith("__reactProps$"),
  );
  assert.ok(key, "expected React props");
  return (node as unknown as Record<PropertyKey, unknown>)[key!] as {
    onClick?: (event: unknown) => void;
    onKeyDown?: (event: {
      key: string;
      preventDefault: () => void;
    }) => void;
  };
}

function Harness({ initial }: { initial: SceneMedia }): ReactElement {
  const [media, setMedia] = useState(initial);
  return createElement(MediaVisualEffectControls, {
    controlId: "look-test",
    media,
    mediaItemId: "item-a",
    mediaWindowDurationMs: 4000,
    keyframedVisualEffectsEnabled: true,
    onMediaCommit: (result) => setMedia(result.media),
  });
}

async function mount(element: ReactElement): Promise<{
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
    async cleanup() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function main(): Promise<void> {
  console.log("\nmedia-visual-effect-controls\n");
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" "));
    originalConsoleError(...args);
  };

  test("controls expose non-technical look labels", () => {
    const html = renderToStaticMarkup(
      createElement(MediaVisualEffectControls, {
        controlId: "look",
        media: baseMedia(),
        keyframedVisualEffectsEnabled: true,
        onMediaCommit: () => undefined,
      }),
    );
    assert.match(html, /Look/);
    assert.match(html, /Vivid/);
    assert.match(html, /Cinematic/);
    assert.match(html, /Monochrome/);
    assert.match(html, /Reset to None/);
    assert.match(html, /role="radiogroup"/);
    assert.match(html, /aria-activedescendant/);
    assert.doesNotMatch(html, /keyframed-visual-effects|brightness\(|capability/i);
  });

  test("panel nests controls only when capability ready and selection allowed", () => {
    const panel = readSrc(
      "src/features/editor/components/media/MediaMotionInspectorPanel.tsx",
    );
    assert.match(panel, /MediaVisualEffectControls/);
    assert.match(panel, /showVisualEffectControls/);
    assert.match(panel, /onVisualEffectMediaChange/);
    assert.match(panel, /!blockForSelection/);
    assert.match(panel, /data-media-visual-effect-controls="blocked"/);
    assert.match(panel, /MEDIA_MOTION_KEYFRAME_SELECTION_REQUIRED_MESSAGE/);
  });

  test("no-selection path explains explicit selection requirement", () => {
    const html = renderToStaticMarkup(
      createElement(MediaVisualEffectControls, {
        controlId: "look",
        media: baseMedia(),
        keyframedVisualEffectsEnabled: true,
        requiresMediaItemSelection: true,
        onMediaCommit: () => undefined,
      }),
    );
    assert.match(html, new RegExp(MEDIA_VISUAL_EFFECT_SELECTION_REQUIRED_MESSAGE));
    assert.doesNotMatch(html, /data-media-visual-effect-preset=/);
  });

  await testAsync("preset apply and reset update media through controls", async () => {
    const { host, cleanup } = await mount(createElement(Harness, { initial: baseMedia() }));
    const vivid = host.querySelector(
      '[data-media-visual-effect-preset-id="vivid"]',
    ) as HTMLButtonElement;
    await act(async () => {
      getReactProps(vivid).onClick?.({});
    });
    assert.ok(host.querySelector("[data-media-visual-effect-intensity-value]"));
    assert.equal(
      host
        .querySelector('[data-media-visual-effect-preset-id="vivid"]')
        ?.getAttribute("aria-checked"),
      "true",
    );
    const reset = host.querySelector(
      '[data-media-visual-effect-reset="true"]',
    ) as HTMLButtonElement;
    await act(async () => {
      getReactProps(reset).onClick?.({});
    });
    assert.equal(
      host.querySelector("[data-media-visual-effect-intensity-value]"),
      null,
    );
    await cleanup();
  });

  await testAsync("radiogroup arrows move programmatic selection", async () => {
    const { host, cleanup } = await mount(createElement(Harness, { initial: baseMedia() }));
    const group = host.querySelector(
      '[data-media-visual-effect-preset="true"]',
    ) as HTMLElement;
    await act(async () => {
      getReactProps(group).onKeyDown?.({
        key: "ArrowRight",
        preventDefault() {},
      });
    });
    assert.equal(
      host
        .querySelector('[data-media-visual-effect-preset-id="vivid"]')
        ?.getAttribute("aria-checked"),
      "true",
    );
    await act(async () => {
      getReactProps(group).onKeyDown?.({
        key: "End",
        preventDefault() {},
      });
    });
    assert.equal(
      host
        .querySelector('[data-media-visual-effect-preset-id="monochrome"]')
        ?.getAttribute("aria-checked"),
      "true",
    );
    await act(async () => {
      getReactProps(group).onKeyDown?.({
        key: "Home",
        preventDefault() {},
      });
    });
    assert.equal(
      host
        .querySelector('[data-media-visual-effect-preset-id="none"]')
        ?.getAttribute("aria-checked"),
      "true",
    );
    await cleanup();
  });

  await testAsync("capability-off create refuses without mutation", async () => {
    let committed = false;
    const media = applyMediaVisualEffectPreset(baseMedia(), "vivid", {
      keyframedVisualEffectsEnabled: true,
    }).media;
    const { host, cleanup } = await mount(
      createElement(MediaVisualEffectControls, {
        controlId: "look-off",
        media,
        keyframedVisualEffectsEnabled: false,
        onMediaCommit: () => {
          committed = true;
        },
      }),
    );
    const cinematic = host.querySelector(
      '[data-media-visual-effect-preset-id="cinematic"]',
    ) as HTMLButtonElement;
    await act(async () => {
      getReactProps(cinematic).onClick?.({});
    });
    assert.equal(committed, false);
    assert.ok(host.querySelector('[role="alert"]'));
    await cleanup();
  });

  test("intensity stepper uses shared StudioNumberStepper lifecycle", () => {
    const controls = readSrc(
      "src/features/media-motion/editor/MediaVisualEffectControls.tsx",
    );
    assert.match(controls, /StudioNumberStepper/);
    assert.match(controls, /setMediaVisualEffectIntensity/);
    assert.match(controls, /min=\{0\}/);
    assert.match(controls, /max=\{100\}/);
    const stepper = readSrc("src/components/ui/StudioNumberStepper.tsx");
    assert.match(stepper, /Escape/);
    assert.match(stepper, /formatStepperCanonicalDisplay/);
    assert.doesNotMatch(controls, /durationMs|seconds/);
  });

  test("item inspector dual-writes visual effect through commitItemMedia", () => {
    const itemInspector = readSrc(
      "src/features/editor/components/media/SceneMediaItemInspector.tsx",
    );
    assert.match(itemInspector, /onVisualEffectMediaChange/);
    assert.match(itemInspector, /commitItemMedia\(nextMedia\)/);
    assert.match(
      itemInspector,
      /Fail closed if the selected target disappeared between render and commit/,
    );
  });

  test("narrow inspector avoids horizontal overflow classes", () => {
    const controls = readSrc(
      "src/features/media-motion/editor/MediaVisualEffectControls.tsx",
    );
    assert.match(controls, /min-w-0/);
    assert.match(controls, /overflow-x-hidden/);
    assert.match(controls, /flex-wrap/);
  });

  test("reset command authority is look-only", () => {
    const media = {
      ...applyMediaVisualEffectPreset(baseMedia(), "vivid", {
        keyframedVisualEffectsEnabled: true,
      }).media,
      visualAdjustments: {
        version: 1 as const,
        brightness: 111,
        contrast: 109,
        saturation: 101,
        shadowEnabled: false,
        shadowColor: "#000000",
        shadowOpacity: 0.35,
        shadowBlur: 16,
        shadowOffsetX: 0,
        shadowOffsetY: 8,
      },
    };
    const adjustments = media.visualAdjustments;
    const reset = resetMediaVisualEffect(media, {
      keyframedVisualEffectsEnabled: true,
    });
    assert.equal(reset.media.visualEffect, undefined);
    assert.equal(reset.media.visualAdjustments, adjustments);
  });

  test("hydration-safe controls avoid browser-only reads", () => {
    const controls = readSrc(
      "src/features/media-motion/editor/MediaVisualEffectControls.tsx",
    );
    assert.doesNotMatch(controls, /window\.|localStorage|fetch\(/);
    const ssr = renderToStaticMarkup(
      createElement(MediaVisualEffectControls, {
        controlId: "look-ssr",
        media: baseMedia(),
        keyframedVisualEffectsEnabled: true,
        onMediaCommit: () => undefined,
      }),
    );
    assert.match(ssr, /Look/);
  });

  console.error = originalConsoleError;
  assert.equal(consoleErrors.length, 0, consoleErrors.join("\n"));
  console.log(`\n${passed} passed\n`);
}

void main();
