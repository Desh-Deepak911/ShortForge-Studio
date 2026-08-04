/**
 * Media-motion keyframe accessibility and focus verification.
 * Run via: npm run test:media-motion-keyframe-ui
 */

import "../test-utils/install-minimal-dom";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, useState, type ReactElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import MediaMotionKeyframeEditor from "@/features/media-motion/editor/MediaMotionKeyframeEditor";
import MediaMotionKeyframeStrip from "@/features/media-motion/editor/MediaMotionKeyframeStrip";
import {
  initializeMediaMotionKeyframes,
  normalizeSceneMediaMotion,
  resolveLocalMediaMotionKeyframeSelection,
  type SceneMediaMotion,
} from "@/features/media-motion";

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
    endTransform: { x: 10, y: 0, scale: 1.1, rotation: 0 },
  });
}

function getReactProps(node: Element): {
  onClick?: (event: unknown) => void;
  onKeyDown?: (event: { key: string; preventDefault: () => void }) => void;
} {
  const key = Reflect.ownKeys(node).find((entry) =>
    String(entry).startsWith("__reactProps$"),
  );
  assert.ok(key, "expected React props");
  return (node as unknown as Record<PropertyKey, unknown>)[key!] as {
    onClick?: (event: unknown) => void;
    onKeyDown?: (event: { key: string; preventDefault: () => void }) => void;
  };
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

function EditorHarness({ initial }: { initial: SceneMediaMotion }): ReactElement {
  const [motion, setMotion] = useState(initial);
  return createElement(MediaMotionKeyframeEditor, {
    controlId: "kf-a11y",
    motion,
    mediaWindowDurationMs: 4000,
    keyframedVisualEffectsEnabled: true,
    onMotionCommit: (result) => setMotion(result.motion),
  });
}

async function main(): Promise<void> {
  console.log("\nmedia-motion-keyframe-accessibility\n");

  test("strip exposes named listbox selection semantics", () => {
    const strip = readSrc(
      "src/features/media-motion/editor/MediaMotionKeyframeStrip.tsx",
    );
    assert.match(strip, /role="listbox"/);
    assert.match(strip, /aria-label="Keyframes"/);
    assert.match(strip, /aria-activedescendant/);
    assert.match(strip, /role="option"/);
    assert.match(strip, /aria-selected/);
    assert.match(strip, /aria-label=\{`Keyframe at \$\{timeLabel\}`\}/);
    assert.match(strip, /ArrowLeft|ArrowRight/);
    assert.match(strip, /Home/);
    assert.match(strip, /End/);
  });

  test("icon/text actions expose accessible names and titles", () => {
    const editor = readSrc(
      "src/features/media-motion/editor/MediaMotionKeyframeEditor.tsx",
    );
    assert.match(editor, /aria-label="Create keyframes"/);
    assert.match(editor, /aria-label="Add keyframe"/);
    assert.match(editor, /aria-label="Delete keyframe"/);
    assert.match(editor, /aria-label="Clear keyframes"/);
    assert.match(editor, /aria-label="Previous keyframe"/);
    assert.match(editor, /aria-label="Next keyframe"/);
    assert.match(editor, /title="Create keyframes and turn on custom motion"/);
  });

  await testAsync("keyboard arrows and Home/End move strip selection only", async () => {
    const keyed = initializeMediaMotionKeyframes(baseMotion(), 4000, {
      keyframedVisualEffectsEnabled: true,
    }).motion;
    let selected = 0;
    const { host, cleanup } = await mount(
      createElement(MediaMotionKeyframeStrip, {
        controlId: "strip",
        keyframes: keyed.keyframes!,
        selectedIndex: selected,
        onSelectIndex: (index: number) => {
          selected = index;
        },
        onMoveSelection: (delta: -1 | 1) => {
          selected = Math.min(
            keyed.keyframes!.length - 1,
            Math.max(0, selected + delta),
          );
        },
        onSelectFirst: () => {
          selected = 0;
        },
        onSelectLast: () => {
          selected = keyed.keyframes!.length - 1;
        },
      }),
    );
    const list = host.querySelector('[data-media-motion-keyframe-strip="true"]')!;
    await act(async () => {
      getReactProps(list).onKeyDown?.({
        key: "ArrowRight",
        preventDefault() {},
      });
    });
    assert.equal(selected, 1);
    await act(async () => {
      getReactProps(list).onKeyDown?.({
        key: "Home",
        preventDefault() {},
      });
    });
    assert.equal(selected, 0);
    await act(async () => {
      getReactProps(list).onKeyDown?.({
        key: "End",
        preventDefault() {},
      });
    });
    assert.equal(selected, keyed.keyframes!.length - 1);
    // Initial mount keeps programmatic selected state via aria-activedescendant.
    assert.equal(list.getAttribute("aria-activedescendant"), "strip-option-0");
    assert.match(
      host.querySelector('[data-selected="true"]')?.getAttribute("aria-label") ?? "",
      /^Keyframe at /,
    );
    await cleanup();
  });

  await testAsync("Create and Clear manage focus targets without stealing on remount", async () => {
    const editor = readSrc(
      "src/features/media-motion/editor/MediaMotionKeyframeEditor.tsx",
    );
    assert.match(editor, /pendingFocusRef/);
    assert.match(editor, /createButtonRef/);
    assert.match(editor, /target === "create"/);
    assert.match(editor, /focus:\s*"strip" \| "create"/);
    assert.match(editor, /role=\{statusIsAlert \? "alert" : "status"\}/);
    assert.match(editor, /aria-live=\{statusIsAlert \? "assertive" : "polite"\}/);

    const { host, cleanup } = await mount(
      createElement(EditorHarness, { initial: baseMotion() }),
    );
    const create = host.querySelector(
      '[data-media-motion-keyframe-create="true"]',
    ) as HTMLButtonElement;
    await act(async () => {
      getReactProps(create).onClick?.({});
    });
    assert.ok(host.querySelector('[data-media-motion-keyframe-strip="true"]'));
    const clear = host.querySelector(
      '[data-media-motion-keyframe-clear="true"]',
    ) as HTMLButtonElement;
    await act(async () => {
      getReactProps(clear).onClick?.({});
    });
    assert.ok(host.querySelector('[data-media-motion-keyframe-create="true"]'));
    await cleanup();
  });

  test("selection hook keeps state local and never writes the story", () => {
    const hook = readSrc(
      "src/features/media-motion/editor/useMediaMotionKeyframeSelection.ts",
    );
    assert.match(hook, /Never persisted into the story/);
    assert.doesNotMatch(hook, /onScriptChange|applySceneUpdate|visualSequence/);
    assert.match(hook, /preferredOffsetMs/);
    assert.match(hook, /resolveLocalMediaMotionKeyframeSelection/);
  });

  test("local selection rule prefers semantic offset then nearest temporal survivor", () => {
    const keyed = initializeMediaMotionKeyframes(baseMotion(), 4000, {
      keyframedVisualEffectsEnabled: true,
    }).motion.keyframes!;
    const withMid = [
      keyed[0]!,
      { ...keyed[0]!, offsetMs: 1500, x: 5 },
      keyed[1]!,
    ];
    assert.equal(
      resolveLocalMediaMotionKeyframeSelection({
        keyframes: withMid,
        preferredOffsetMs: 1500,
      }),
      1,
    );
    assert.equal(
      resolveLocalMediaMotionKeyframeSelection({
        keyframes: [withMid[0]!, withMid[2]!],
        preferredOffsetMs: 1500,
      }),
      0,
    );
  });

  test("failed actions keep focus on the triggering control and use alert", () => {
    const editor = readSrc(
      "src/features/media-motion/editor/MediaMotionKeyframeEditor.tsx",
    );
    assert.match(editor, /retainFocusOnFailure/);
    assert.match(editor, /status === "terminal"/);
    assert.match(editor, /statusIsAlert/);
    assert.match(editor, /role=\{statusIsAlert \? "alert" : "status"\}/);
  });

  test("external updates do not schedule focus theft", () => {
    const editor = readSrc(
      "src/features/media-motion/editor/MediaMotionKeyframeEditor.tsx",
    );
    assert.match(editor, /pendingFocusRef\.current = null/);
    assert.match(editor, /if \(!target\) return;/);
    // Focus moves only after explicit Create/Add/Delete/Clear commit paths.
    assert.match(editor, /pendingFocusRef\.current = focus;/);
    assert.doesNotMatch(editor, /useEffect\(\(\) => \{[\s\S]*focus\(\)[\s\S]*\}, \[motion/);
  });

  console.log(`\n${passed} passed\n`);
}

void main();
