/**
 * Subject-aware framing UI verification (picker + controls + a11y).
 * Run via: npm run test:subject-aware-framing
 */

import "../test-utils/install-minimal-dom";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";

import { resolveSceneMediaFraming } from "@/features/media-framing";
import {
  buildManualSubjectFocusFromGrid,
  setSubjectFocus,
} from "@/features/source-quality";
import SourceQualitySummary from "@/features/source-quality/editor/SourceQualitySummary";
import SubjectFocusPicker from "@/features/source-quality/editor/SubjectFocusPicker";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
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

function landscapeMedia(): SceneMedia {
  return {
    type: "image",
    url: "https://example.com/landscape.jpg",
    source: "upload",
    mimeType: "image/jpeg",
    width: 1920,
    height: 1080,
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
}

function baseScene(media: SceneMedia): FootieScene {
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
    media,
    image: {
      url: media.url!,
      fitMode: "fill",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
    },
  };
}

function baseScript(scene: FootieScene): FootieScript {
  return syncFootieScript({
    title: "Subject aware",
    narration: scene.narration ?? "Narration line.",
    totalDuration: 6,
    scenes: [scene],
    exportSettings: {
      fileName: "subject-aware-ui",
      format: "webm",
      quality: "standard",
      resolution: "1080x1920",
    },
  });
}

function mount<P extends object>(
  node: (props: P) => unknown,
  props: P,
) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(createElement(node as never, props));
  });
  return {
    host,
    root,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
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

async function main(): Promise<void> {
  console.log("\nSubject-aware framing UI\n");

  test("SubjectFocusPicker exposes named 3×3 radiogroup with Arrow/Home/End", () => {
    const src = readSrc(
      "src/features/source-quality/editor/SubjectFocusPicker.tsx",
    );
    assert.match(src, /role="radiogroup"/);
    assert.match(src, /role="radio"/);
    assert.match(src, /ArrowRight/);
    assert.match(src, /ArrowLeft/);
    assert.match(src, /ArrowDown/);
    assert.match(src, /ArrowUp/);
    assert.match(src, /Home/);
    assert.match(src, /End/);
    assert.match(src, /option\.label/);
    const domain = readSrc(
      "src/features/source-quality/domain/subject-focus.ts",
    );
    assert.match(domain, /Top left/);
    assert.match(domain, /Bottom right/);
  });

  await testAsync("picker does not invent focus until onChange", async () => {
    let selected: string | null = null;
    const { host, unmount } = mount(SubjectFocusPicker, {
      value: null,
      onChange: (id: string) => {
        selected = id;
      },
    });
    assert.equal(
      host.querySelectorAll('[data-subject-focus-selected="true"]').length,
      0,
    );
    const center = host.querySelector('[data-subject-focus-cell="center"]');
    await click(center);
    assert.equal(selected, "center");
    unmount();
  });

  await testAsync(
    "SourceQualitySummary Details mounts subject controls only when gated on",
    async () => {
      const scene = baseScene(landscapeMedia());
      const script = baseScript(scene);

      function Harness(props: {
        readonly subjectAwareEnabled: boolean;
        readonly openDetails?: boolean;
      }) {
        const [currentScript, setScript] = useState(script);
        const currentScene = currentScript.scenes[0]!;
        return createElement(SourceQualitySummary, {
          scene: currentScene,
          script: currentScript,
          onScriptChange: setScript,
          media: currentScene.media,
          framing: resolveSceneMediaFraming(currentScene),
          readiness: {
            ready: true,
            enabled: true,
            subjectAwareEnabled: props.subjectAwareEnabled,
          },
        });
      }

      const off = mount(Harness, { subjectAwareEnabled: false });
      await click(off.host.querySelector("[data-source-quality-details-toggle]"));
      assert.equal(
        off.host.querySelector("[data-subject-aware-framing-controls]"),
        null,
      );
      off.unmount();

      const on = mount(Harness, { subjectAwareEnabled: true });
      await click(on.host.querySelector("[data-source-quality-details-toggle]"));
      assert.ok(
        on.host.querySelector("[data-subject-aware-framing-controls]"),
      );
      assert.ok(on.host.querySelector("[data-subject-focus-picker]"));
      on.unmount();
    },
  );

  await testAsync("selecting a grid cell writes focus via command path", async () => {
    const focused = setSubjectFocus({
      scene: baseScene(landscapeMedia()),
      subjectFocus: buildManualSubjectFocusFromGrid("top-left"),
      subjectAwareReframingEnabled: true,
      mixedMediaScenesEnabled: false,
    });
    assert.equal(focused.ok, true);
    if (!focused.ok) return;

    function Harness() {
      const [currentScript, setScript] = useState(baseScript(focused.scene));
      const currentScene = currentScript.scenes[0]!;
      return createElement(SourceQualitySummary, {
        scene: currentScene,
        script: currentScript,
        onScriptChange: setScript,
        media: currentScene.media,
        framing: resolveSceneMediaFraming(currentScene),
        readiness: {
          ready: true,
          enabled: true,
          subjectAwareEnabled: true,
        },
      });
    }

    const { host, unmount } = mount(Harness, {});
    await click(host.querySelector("[data-source-quality-details-toggle]"));
    assert.equal(
      host
        .querySelector('[data-subject-focus-cell="top-left"]')
        ?.getAttribute("data-subject-focus-selected"),
      "true",
    );
    const apply = host.querySelector("[data-subject-aware-apply]");
    // Landscape top-left should offer Apply.
    assert.ok(apply);
    unmount();
  });

  test("controls keep a11y focus retention pattern and non-technical copy", () => {
    const controls = readSrc(
      "src/features/source-quality/editor/SubjectAwareFramingControls.tsx",
    );
    assert.match(controls, /aria-live="polite"/);
    assert.match(controls, /role="alert"/);
    assert.match(controls, /requestFocusAfterCommit/);
    assert.match(controls, /Apply suggestion/);
    assert.match(controls, /Keep framing/);
    assert.match(controls, /Nothing changes until you apply/);
    assert.match(controls, /No automated face or motion/);
    assert.match(controls, /Undo will no longer be available/);
    assert.match(controls, /Undo is no longer offered/);
    assert.match(controls, /data-subject-aware-unknown-dimensions/);
    assert.match(controls, /min-w-0/);
    assert.doesNotMatch(controls, /\bfetch\b/);
    assert.doesNotMatch(controls, /Math\.random|\bDate\.now\b/);
    assert.doesNotMatch(controls, /FaceDetector|createDetector|tracking API/i);
  });

  await testAsync(
    "picker exposes exactly one programmatic selected state when value set",
    async () => {
      const { host, unmount } = mount(SubjectFocusPicker, {
        value: "bottom-right",
        onChange: () => {},
      });
      const selected = host.querySelectorAll(
        '[data-subject-focus-selected="true"]',
      );
      assert.equal(selected.length, 1);
      assert.equal(
        selected[0]?.getAttribute("data-subject-focus-cell"),
        "bottom-right",
      );
      assert.equal(
        host.querySelectorAll('[aria-checked="true"]').length,
        1,
      );
      unmount();
    },
  );

  test("summary wires useSubjectAwareReframingEnabled inside Details only", () => {
    const summary = readSrc(
      "src/features/source-quality/editor/SourceQualitySummary.tsx",
    );
    assert.match(summary, /useSubjectAwareReframingEnabled/);
    assert.match(summary, /SubjectAwareFramingControls/);
    assert.match(summary, /subjectAwareEnabled/);
    // Same winning mediaItemId as Source quality Details — no display/command divergence.
    assert.match(summary, /mediaItemId=\{mediaItemId\}/);
    assert.equal(
      (summary.match(/mediaItemId=\{mediaItemId\}/g) ?? []).length >= 2,
      true,
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
