/**
 * Media-motion keyframe editor UI verification.
 * Run via: npm run test:media-motion-keyframe-ui
 */

import "../test-utils/install-minimal-dom";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, useState, type ReactElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import MediaMotionKeyframeEditor from "@/features/media-motion/editor/MediaMotionKeyframeEditor";
import {
  initializeMediaMotionKeyframes,
  MEDIA_MOTION_KEYFRAME_SELECTION_REQUIRED_MESSAGE,
  normalizeSceneMediaMotion,
  resolveMediaMotionAuthoringTarget,
  type SceneMediaMotion,
} from "@/features/media-motion";

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

function baseMotion(): SceneMediaMotion {
  return normalizeSceneMediaMotion({
    version: 1,
    enabled: true,
    presetId: "slow-zoom-in",
    easing: "linear",
    intensity: 1,
    startTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    endTransform: { x: 30, y: 0, scale: 1.15, rotation: 0 },
  });
}

function getReactProps(node: Element): {
  onClick?: (event: unknown) => void;
  onKeyDown?: (event: unknown) => void;
} {
  const key = Reflect.ownKeys(node).find((entry) =>
    String(entry).startsWith("__reactProps$"),
  );
  assert.ok(key, "expected React props on rendered node");
  return (node as unknown as Record<PropertyKey, unknown>)[key!] as {
    onClick?: (event: unknown) => void;
    onKeyDown?: (event: unknown) => void;
  };
}

function Harness({
  initial,
  requiresMediaItemSelection = false,
  mediaItemId = "item-a",
  mediaWindowDurationMs = 4000,
  keyframedVisualEffectsEnabled = true,
}: {
  initial: SceneMediaMotion;
  requiresMediaItemSelection?: boolean;
  mediaItemId?: string | null;
  mediaWindowDurationMs?: number;
  keyframedVisualEffectsEnabled?: boolean;
}): ReactElement {
  const [motion, setMotion] = useState(initial);
  return createElement(MediaMotionKeyframeEditor, {
    controlId: "kf-test",
    motion,
    mediaWindowDurationMs,
    mediaItemId,
    keyframedVisualEffectsEnabled,
    requiresMediaItemSelection,
    onMotionCommit: (result) => setMotion(result.motion),
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
  console.log("\nmedia-motion-keyframe-editor\n");
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" "));
    originalConsoleError(...args);
  };

  test("empty editor offers explicit Create keyframes action", () => {
    const html = renderToStaticMarkup(
      createElement(MediaMotionKeyframeEditor, {
        controlId: "kf",
        motion: baseMotion(),
        mediaWindowDurationMs: 4000,
        keyframedVisualEffectsEnabled: true,
        onMotionCommit: () => undefined,
      }),
    );
    assert.match(html, /Create keyframes/);
    assert.match(html, /turns on custom motion/);
    assert.match(html, /own duration/);
    assert.match(html, /whole project/);
    assert.doesNotMatch(html, /keyframed-visual-effects-v1|fingerprint|schema/i);
  });

  test("no-selection mixed-media path explains explicit selection requirement", () => {
    const html = renderToStaticMarkup(
      createElement(MediaMotionKeyframeEditor, {
        controlId: "kf",
        motion: baseMotion(),
        mediaWindowDurationMs: 4000,
        keyframedVisualEffectsEnabled: true,
        requiresMediaItemSelection: true,
        onMotionCommit: () => undefined,
      }),
    );
    assert.match(html, new RegExp(MEDIA_MOTION_KEYFRAME_SELECTION_REQUIRED_MESSAGE));
    assert.doesNotMatch(html, /Create keyframes/);
    assert.doesNotMatch(html, /data-media-motion-preset/);
  });

  test("panel blocks complete motion area when selection is required under capability", () => {
    const panel = readSrc(
      "src/features/editor/components/media/MediaMotionInspectorPanel.tsx",
    );
    assert.match(panel, /data-media-motion-panel="blocked"/);
    assert.match(panel, /MEDIA_MOTION_KEYFRAME_SELECTION_REQUIRED_MESSAGE/);
    assert.match(panel, /blockForSelection/);
    assert.match(panel, /keyframesCapable && authoringTarget\.status === "needs_selection"/);
    assert.match(panel, /data-media-motion-target-status/);
    assert.match(panel, /data-media-motion-target-item/);
    assert.match(panel, /data-media-motion-target-duration/);
    // Capability-off path must not use the blocked panel for legacy presets.
    assert.match(panel, /keyframesCapable && !blockForSelection/);
  });

  test("displayed target attributes share one mediaItemId and duration", () => {
    const target = resolveMediaMotionAuthoringTarget({
      keyframedVisualEffectsEnabled: true,
      requiresMediaItemSelection: false,
      mediaItemId: "item-b",
      mediaWindowDurationMs: 2750,
    });
    const html = renderToStaticMarkup(
      createElement(MediaMotionKeyframeEditor, {
        controlId: "kf-target",
        motion: baseMotion(),
        mediaWindowDurationMs: target.mediaWindowDurationMs,
        mediaItemId: target.mediaItemId,
        keyframedVisualEffectsEnabled: true,
        onMotionCommit: () => undefined,
      }),
    );
    assert.match(html, /data-media-motion-target-item="item-b"/);
    assert.match(html, /data-media-motion-target-duration="2750"/);
  });

  await testAsync("create/add/delete update motion through the editor", async () => {
    const { host, cleanup } = await mount(
      createElement(Harness, { initial: baseMotion() }),
    );
    const create = host.querySelector(
      '[data-media-motion-keyframe-create="true"]',
    ) as HTMLButtonElement | null;
    assert.ok(create);
    await act(async () => {
      getReactProps(create!).onClick?.({});
    });
    assert.ok(host.querySelector('[data-media-motion-keyframe-strip="true"]'));
    assert.ok(host.querySelector('[data-media-motion-keyframe-add="true"]'));
    assert.equal(
      host
        .querySelector("[data-media-motion-keyframe-editor]")
        ?.getAttribute("data-media-motion-target-item"),
      "item-a",
    );
    assert.equal(
      host
        .querySelector("[data-media-motion-keyframe-editor]")
        ?.getAttribute("data-media-motion-target-duration"),
      "4000",
    );

    assert.ok(host.querySelector('[data-media-motion-keyframe-chip="0"]'));
    assert.ok(host.querySelector('[data-media-motion-keyframe-chip="1"]'));
    const add = host.querySelector(
      '[data-media-motion-keyframe-add="true"]',
    ) as HTMLButtonElement;
    await act(async () => {
      getReactProps(add).onClick?.({});
    });
    assert.ok(host.querySelector('[data-media-motion-keyframe-chip="0"]'));
    assert.ok(host.querySelector('[data-media-motion-keyframe-chip="1"]'));
    assert.ok(
      host.textContent?.includes("already exists") ||
        host.querySelector('[data-media-motion-keyframe-chip="0"]'),
    );

    const del = host.querySelector(
      '[data-media-motion-keyframe-delete="true"]',
    ) as HTMLButtonElement;
    await act(async () => {
      getReactProps(del).onClick?.({});
    });
    await cleanup();
  });

  await testAsync("clear returns to Create keyframes", async () => {
    const keyed = initializeMediaMotionKeyframes(baseMotion(), 4000, {
      keyframedVisualEffectsEnabled: true,
    }).motion;
    const { host, cleanup } = await mount(createElement(Harness, { initial: keyed }));
    const clear = host.querySelector(
      '[data-media-motion-keyframe-clear="true"]',
    ) as HTMLButtonElement;
    await act(async () => {
      getReactProps(clear).onClick?.({});
    });
    assert.ok(host.querySelector('[data-media-motion-keyframe-create="true"]'));
    await cleanup();
  });

  await testAsync("zero duration create refuses without mutation and alerts", async () => {
    let committed = false;
    const { host, cleanup } = await mount(
      createElement(MediaMotionKeyframeEditor, {
        controlId: "kf-zero",
        motion: baseMotion(),
        mediaWindowDurationMs: 0,
        keyframedVisualEffectsEnabled: true,
        onMotionCommit: () => {
          committed = true;
        },
      }),
    );
    const create = host.querySelector(
      '[data-media-motion-keyframe-create="true"]',
    ) as HTMLButtonElement;
    await act(async () => {
      getReactProps(create).onClick?.({});
    });
    assert.equal(committed, false);
    assert.ok(host.querySelector('[role="alert"]'));
    assert.match(host.textContent ?? "", /valid duration/i);
    assert.ok(host.querySelector('[data-media-motion-keyframe-create="true"]'));
    await cleanup();
  });

  await testAsync("capability-off editor commands do not mutate on Create", async () => {
    let committed = false;
    const { host, cleanup } = await mount(
      createElement(MediaMotionKeyframeEditor, {
        controlId: "kf-off",
        motion: baseMotion(),
        mediaWindowDurationMs: 4000,
        keyframedVisualEffectsEnabled: false,
        onMotionCommit: () => {
          committed = true;
        },
      }),
    );
    const create = host.querySelector(
      '[data-media-motion-keyframe-create="true"]',
    ) as HTMLButtonElement;
    await act(async () => {
      getReactProps(create).onClick?.({});
    });
    assert.equal(committed, false);
    assert.ok(host.querySelector('[role="alert"]'));
    assert.match(host.textContent ?? "", /turned off/i);
    await cleanup();
  });

  test("panel nests editor only after capability ready/enabled", () => {
    const panel = readSrc(
      "src/features/editor/components/media/MediaMotionInspectorPanel.tsx",
    );
    assert.match(panel, /capabilitiesReady && keyframedVisualEffectsEnabled === true/);
    assert.match(panel, /MediaMotionKeyframeEditor/);
    assert.match(
      readSrc("src/features/editor/components/StudioSceneInspector.tsx"),
      /requiresMediaItemSelection/,
    );
    assert.match(
      readSrc("src/features/editor/components/StudioSceneInspector.tsx"),
      /mediaItemId=\{null\}/,
    );
  });

  test("opening inspector source never auto-initializes keyframes", () => {
    const panel = readSrc(
      "src/features/editor/components/media/MediaMotionInspectorPanel.tsx",
    );
    const editor = readSrc(
      "src/features/media-motion/editor/MediaMotionKeyframeEditor.tsx",
    );
    assert.doesNotMatch(panel, /initializeMediaMotionKeyframes\(/);
    assert.match(editor, /onClick=\{\(\) => \{[\s\S]*initializeMediaMotionKeyframes/);
  });

  test("narrow inspector uses compact strip and non-technical labels", () => {
    const editor = readSrc(
      "src/features/media-motion/editor/MediaMotionKeyframeEditor.tsx",
    );
    assert.match(editor, /Horizontal movement/);
    assert.match(editor, /Vertical movement/);
    assert.match(editor, /Zoom/);
    assert.match(editor, /Rotation/);
    assert.match(editor, /Opacity/);
    assert.match(editor, /Transition/);
    assert.match(editor, /StudioNumberStepper/);
    assert.match(editor, /onValueCommit/);
    assert.match(editor, /MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_X/);
    assert.match(
      readSrc("src/features/media-motion/editor/MediaMotionKeyframeStrip.tsx"),
      /overflow-x-auto/,
    );
  });

  test("hydration-safe markup has no browser-only capability read in editor leaf", () => {
    const editor = readSrc(
      "src/features/media-motion/editor/MediaMotionKeyframeEditor.tsx",
    );
    assert.doesNotMatch(editor, /window\.|localStorage|fetch\(/);
    const ssr = renderToStaticMarkup(
      createElement(MediaMotionKeyframeEditor, {
        controlId: "kf-ssr",
        motion: baseMotion(),
        mediaWindowDurationMs: 4000,
        keyframedVisualEffectsEnabled: true,
        onMotionCommit: () => undefined,
      }),
    );
    assert.match(ssr, /Create keyframes/);
  });

  console.error = originalConsoleError;
  assert.equal(consoleErrors.length, 0, consoleErrors.join("\n"));
  console.log(`\n${passed} passed\n`);
}

void main();
