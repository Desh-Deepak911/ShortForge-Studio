/**
 * Visual pacing accessibility verification (including mounted focus regressions).
 * Run: npm run test:visual-pacing-ui
 *
 * Minimal DOM is installed first so react-dom/client can mount the real panel.
 */

import "../test-utils/install-minimal-dom";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { act, createElement, useState, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import {
  appendMixedMediaSequenceItem,
  updateMixedMediaSequenceBoundary,
} from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import VisualPacingPanel, {
  visualPacingPanelCommandRunner,
} from "@/features/visual-beat-density/editor/VisualPacingPanel";
import {
  applyVisualBeatPlan,
  suggestVisualBeatPlan,
} from "@/features/visual-beat-density";

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

function imageMedia(url: string): SceneMedia {
  return {
    type: "image",
    url,
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
}

function baseScene(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 9,
    duration: 9,
    startMs: 0,
    endMs: 9_000,
    durationMs: 9_000,
    subtitle: "Fallback",
    narration: "One sentence. Two sentence, then end!",
    ...overrides,
  };
}

function seededScript(count = 3, sceneOverrides: Partial<FootieScene> = {}): FootieScript {
  let scene = baseScene(sceneOverrides);
  for (let i = 0; i < count; i += 1) {
    scene = appendMixedMediaSequenceItem(
      scene,
      imageMedia(`https://example.com/${i}.jpg`),
      {
        mixedMediaScenesEnabled: true,
        generateId: () => `m${i}`,
      },
    ).scene;
  }
  return {
    title: "Visual pacing a11y",
    totalDuration: scene.duration ?? 9,
    narration: "Story narration",
    scenes: [scene],
  };
}

function getReactProps(node: Element): {
  onClick?: (event: unknown) => void;
} {
  const key = Reflect.ownKeys(node).find((entry) =>
    String(entry).startsWith("__reactProps$"),
  );
  assert.ok(key, "expected React props on rendered control");
  return (node as unknown as Record<PropertyKey, unknown>)[key!] as {
    onClick?: (event: unknown) => void;
  };
}

function assertActiveSuggest(host: HTMLElement): void {
  const active = document.activeElement as HTMLElement | null;
  assert.ok(active, "expected an active element");
  assert.notEqual(active, document.body);
  assert.equal(active.getAttribute("data-visual-pacing-suggest"), "true");
  assert.equal(
    host.querySelector("[data-visual-pacing-suggest]"),
    active,
    "active element must be the mounted Suggest control",
  );
}

function panelStatus(host: HTMLElement): string {
  return (
    host
      .querySelector("[data-visual-pacing-panel]")
      ?.getAttribute("data-visual-pacing-status") || ""
  );
}

function querySuggest(host: HTMLElement): HTMLButtonElement {
  const button = host.querySelector(
    "[data-visual-pacing-suggest]",
  ) as HTMLButtonElement | null;
  assert.ok(button, "expected Suggest button");
  return button;
}

function queryApply(host: HTMLElement): HTMLButtonElement {
  const button = host.querySelector(
    "[data-visual-pacing-apply]",
  ) as HTMLButtonElement | null;
  assert.ok(button, "expected Apply button");
  return button;
}

function queryDiscard(host: HTMLElement): HTMLButtonElement {
  const button = host.querySelector(
    "[data-visual-pacing-discard]",
  ) as HTMLButtonElement | null;
  assert.ok(button, "expected Discard button");
  return button;
}

async function clickButton(button: HTMLButtonElement): Promise<void> {
  const props = getReactProps(button);
  await act(async () => {
    button.focus();
    props.onClick?.({
      type: "click",
      target: button,
      currentTarget: button,
      preventDefault() {},
      stopPropagation() {},
    });
  });
}

interface MountOptions {
  readonly initialScript: FootieScript;
  readonly visualBeatDensityEnabled?: boolean;
  readonly mixedMediaScenesEnabled?: boolean;
  readonly includeOutsideControl?: boolean;
}

async function mountPacingHarness(options: MountOptions): Promise<{
  readonly host: HTMLElement;
  readonly getScript: () => FootieScript;
  readonly setScript: (script: FootieScript) => Promise<void>;
  readonly setCapabilities: (enabled: boolean) => Promise<void>;
  readonly setSceneIndex: (index: number) => Promise<void>;
  readonly cleanup: () => Promise<void>;
}> {
  let latestScript = options.initialScript;
  let setScriptState: ((script: FootieScript) => void) | null = null;
  let setCapsState: ((enabled: boolean) => void) | null = null;
  let setSceneIndexState: ((index: number) => void) | null = null;

  function Harness(): ReactElement {
    const [script, setScript] = useState(options.initialScript);
    const [capsEnabled, setCapsEnabled] = useState(
      options.visualBeatDensityEnabled !== false &&
        options.mixedMediaScenesEnabled !== false,
    );
    const [sceneIndex, setSceneIndex] = useState(0);
    setScriptState = setScript;
    setCapsState = setCapsEnabled;
    setSceneIndexState = setSceneIndex;
    latestScript = script;
    const scene = script.scenes[sceneIndex] ?? script.scenes[0]!;

    return createElement(
      "div",
      { "data-visual-pacing-harness": "true" },
      options.includeOutsideControl
        ? createElement(
            "button",
            {
              type: "button",
              "data-outside-control": "true",
            },
            "Outside control",
          )
        : null,
      createElement(VisualPacingPanel, {
        script,
        scene,
        onScriptChange: (next) => {
          setScript(next);
        },
        visualBeatDensityEnabled: capsEnabled,
        mixedMediaScenesEnabled: capsEnabled,
      }),
    );
  }

  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(Harness));
  });

  return {
    host,
    getScript: () => latestScript,
    async setScript(script: FootieScript) {
      await act(async () => {
        setScriptState?.(script);
      });
    },
    async setCapabilities(enabled: boolean) {
      await act(async () => {
        setCapsState?.(enabled);
      });
    },
    async setSceneIndex(index: number) {
      await act(async () => {
        setSceneIndexState?.(index);
      });
    },
    async cleanup() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function main(): Promise<void> {
  console.log("\nVisual pacing accessibility\n");

  test("heading hierarchy and radiogroup naming", () => {
    const script = seededScript();
    const html = renderToStaticMarkup(
      createElement(VisualPacingPanel, {
        script,
        scene: script.scenes[0]!,
        onScriptChange: () => {},
        visualBeatDensityEnabled: true,
        mixedMediaScenesEnabled: true,
      }),
    );
    assert.match(html, /<h3[^>]*>Visual pacing<\/h3>/);
    assert.match(html, /role="radiogroup"/);
    assert.match(html, /aria-labelledby=/);
    assert.match(html, /role="radio"/);
    assert.match(html, /aria-checked="true"/);
    assert.match(html, /data-visual-pacing-density="balanced"/);
  });

  test("buttons have unambiguous names; disabled Suggest explains why", () => {
    const script = seededScript(1);
    const html = renderToStaticMarkup(
      createElement(VisualPacingPanel, {
        script,
        scene: script.scenes[0]!,
        onScriptChange: () => {},
        visualBeatDensityEnabled: true,
        mixedMediaScenesEnabled: true,
      }),
    );
    assert.match(html, /Suggest pacing/);
    assert.match(html, /title="Add another visual to use pacing suggestions\."/);
    assert.match(html, /aria-disabled="true"/);
  });

  test("suggestion preview has readable text equivalent", () => {
    const suggested = suggestVisualBeatPlan(seededScript(), {
      sceneId: "scene-1",
      density: "balanced",
      generatedAtIso: "2026-08-01T12:00:00.000Z",
      visualBeatDensityEnabled: true,
    });
    assert.equal(suggested.ok, true);
    if (!suggested.ok) return;
    const html = renderToStaticMarkup(
      createElement(VisualPacingPanel, {
        script: suggested.script,
        scene: suggested.script.scenes[0]!,
        onScriptChange: () => {},
        visualBeatDensityEnabled: true,
        mixedMediaScenesEnabled: true,
      }),
    );
    assert.match(html, /data-visual-pacing-preview-text/);
    assert.match(html, /Changes at /);
    assert.match(html, /aria-hidden="true"/);
  });

  test("live region, alert, and post-commit focus mechanism exist in source", () => {
    const panel = readSrc(
      "src/features/visual-beat-density/editor/VisualPacingPanel.tsx",
    );
    assert.match(panel, /aria-live=["']polite["']/);
    assert.match(panel, /role=["']status["']/);
    assert.match(panel, /role=["']alert["']/);
    assert.match(panel, /useLayoutEffect/);
    assert.match(panel, /pendingSuggestFocusRef/);
    assert.match(panel, /requestSuggestFocusAfterCommit/);
    assert.match(panel, /suggestButtonRef\.current\?\.focus\(\)/);
    assert.match(panel, /applyButtonRef\.current\?\.focus\(\)/);
    assert.match(panel, /discardButtonRef\.current\?\.focus\(\)/);
    assert.match(
      panel,
      /\/\/ Apply unmounts; focus surviving Suggest again after the committed render\.\s*requestSuggestFocusAfterCommit\(\);\s*commitScript\(/,
    );
    assert.match(
      panel,
      /\/\/ Discard unmounts; focus surviving Suggest pacing after the committed render\.\s*requestSuggestFocusAfterCommit\(\);\s*commitScript\(/,
    );
  });

  test("keyboard density selection uses arrow keys and roving tabindex", () => {
    const panel = readSrc(
      "src/features/visual-beat-density/editor/VisualPacingPanel.tsx",
    );
    assert.match(panel, /handleDensityRadiogroupKeyDown/);
    assert.match(panel, /ArrowRight/);
    assert.match(panel, /ArrowLeft/);
    assert.match(panel, /Home/);
    assert.match(panel, /End/);
    assert.match(panel, /tabIndex=\{isActive \? 0 : -1\}/);
  });

  test("status and warnings are not color-only", () => {
    const script = seededScript();
    const html = renderToStaticMarkup(
      createElement(VisualPacingPanel, {
        script,
        scene: script.scenes[0]!,
        onScriptChange: () => {},
        visualBeatDensityEnabled: true,
        mixedMediaScenesEnabled: true,
      }),
    );
    assert.match(html, /Visual pacing/);
    assert.match(html, /Suggest pacing/);
    assert.match(html, /Fast/);
    assert.match(html, /Recommended/);
    assert.match(html, /Studio/);
  });

  await testAsync("Suggest success → active element is Suggest again", async () => {
    const mounted = await mountPacingHarness({
      initialScript: seededScript(),
    });
    try {
      await clickButton(querySuggest(mounted.host));
      assert.equal(panelStatus(mounted.host), "draft");
      assert.ok(
        mounted.host.querySelector("[data-visual-pacing-apply]"),
        "draft should offer Apply",
      );
      assertActiveSuggest(mounted.host);
    } finally {
      await mounted.cleanup();
    }
  });

  await testAsync("Apply success → active element is Suggest again", async () => {
    const suggested = suggestVisualBeatPlan(seededScript(), {
      sceneId: "scene-1",
      density: "balanced",
      generatedAtIso: "2026-08-01T12:00:00.000Z",
      visualBeatDensityEnabled: true,
    });
    assert.equal(suggested.ok, true);
    if (!suggested.ok) return;

    const mounted = await mountPacingHarness({
      initialScript: suggested.script,
    });
    try {
      await clickButton(queryApply(mounted.host));
      assert.equal(panelStatus(mounted.host), "applied");
      assert.equal(
        mounted.host.querySelector("[data-visual-pacing-apply]"),
        null,
      );
      assertActiveSuggest(mounted.host);
    } finally {
      await mounted.cleanup();
    }
  });

  await testAsync("Discard draft → active element is Suggest pacing", async () => {
    const suggested = suggestVisualBeatPlan(seededScript(), {
      sceneId: "scene-1",
      density: "balanced",
      generatedAtIso: "2026-08-01T12:00:00.000Z",
      visualBeatDensityEnabled: true,
    });
    assert.equal(suggested.ok, true);
    if (!suggested.ok) return;

    const mounted = await mountPacingHarness({
      initialScript: suggested.script,
    });
    try {
      await clickButton(queryDiscard(mounted.host));
      assert.equal(panelStatus(mounted.host), "absent");
      assert.equal(
        mounted.host.querySelector("[data-visual-pacing-discard]"),
        null,
      );
      assertActiveSuggest(mounted.host);
    } finally {
      await mounted.cleanup();
    }
  });

  await testAsync(
    "Discard applied → active element is Suggest pacing",
    async () => {
      const suggested = suggestVisualBeatPlan(seededScript(), {
        sceneId: "scene-1",
        density: "fast",
        generatedAtIso: "2026-08-01T12:00:00.000Z",
        visualBeatDensityEnabled: true,
      });
      assert.equal(suggested.ok, true);
      if (!suggested.ok) return;
      const applied = applyVisualBeatPlan(suggested.script, {
        sceneId: "scene-1",
        selectedDensity: "fast",
        visualBeatDensityEnabled: true,
        mixedMediaScenesEnabled: true,
      });
      assert.equal(applied.ok, true);
      if (!applied.ok) return;

      const mounted = await mountPacingHarness({
        initialScript: applied.script,
      });
      try {
        await clickButton(queryDiscard(mounted.host));
        assert.equal(panelStatus(mounted.host), "absent");
        assertActiveSuggest(mounted.host);
      } finally {
        await mounted.cleanup();
      }
    },
  );

  await testAsync("Suggest failure → active element remains Suggest", async () => {
    // Seed media at a valid duration, then collapse duration so Suggest fails
    // while the Suggest control remains mounted.
    const script = seededScript(3);
    script.scenes[0] = {
      ...script.scenes[0]!,
      duration: 0,
      durationMs: 0,
      end: 0,
      endMs: 0,
    };
    const mounted = await mountPacingHarness({
      initialScript: script,
    });
    try {
      const suggest = querySuggest(mounted.host);
      await clickButton(suggest);
      assertActiveSuggest(mounted.host);
      assert.ok(
        mounted.host.querySelector("[data-visual-pacing-alert]"),
        "expected terminal failure alert",
      );
    } finally {
      await mounted.cleanup();
    }
  });

  await testAsync(
    "Apply failure → active element remains Apply when still mounted",
    async () => {
      const suggested = suggestVisualBeatPlan(seededScript(), {
        sceneId: "scene-1",
        density: "balanced",
        generatedAtIso: "2026-08-01T12:00:00.000Z",
        visualBeatDensityEnabled: true,
      });
      assert.equal(suggested.ok, true);
      if (!suggested.ok) return;

      const originalApply = visualPacingPanelCommandRunner.applyVisualBeatPlan;
      const mounted = await mountPacingHarness({
        initialScript: suggested.script,
      });
      try {
        visualPacingPanelCommandRunner.applyVisualBeatPlan = (script, input) => ({
          ok: false,
          script,
          sceneId: typeof input.sceneId === "string" ? input.sceneId : null,
          terminalCode: "BEATS_PLAN_INVALID",
          warnings: [],
        });

        const apply = queryApply(mounted.host);
        await clickButton(apply);
        assert.equal(panelStatus(mounted.host), "draft");
        const active = document.activeElement as HTMLElement | null;
        assert.equal(active?.getAttribute("data-visual-pacing-apply"), "true");
        assert.notEqual(active, document.body);
        assert.ok(
          mounted.host.querySelector("[data-visual-pacing-alert]"),
          "expected terminal failure alert",
        );
        assert.ok(
          mounted.host.querySelector("[data-visual-pacing-apply]"),
          "Apply must remain mounted on recoverable terminal failure",
        );
      } finally {
        visualPacingPanelCommandRunner.applyVisualBeatPlan = originalApply;
        await mounted.cleanup();
      }
    },
  );

  await testAsync(
    "manual boundary edit does not move focus into the pacing panel",
    async () => {
      const suggested = suggestVisualBeatPlan(seededScript(), {
        sceneId: "scene-1",
        density: "balanced",
        generatedAtIso: "2026-08-01T12:00:00.000Z",
        visualBeatDensityEnabled: true,
      });
      assert.equal(suggested.ok, true);
      if (!suggested.ok) return;
      const applied = applyVisualBeatPlan(suggested.script, {
        sceneId: "scene-1",
        selectedDensity: "balanced",
        visualBeatDensityEnabled: true,
        mixedMediaScenesEnabled: true,
      });
      assert.equal(applied.ok, true);
      if (!applied.ok) return;

      const mounted = await mountPacingHarness({
        initialScript: applied.script,
        includeOutsideControl: true,
      });
      try {
        const outside = mounted.host.querySelector(
          "[data-outside-control]",
        ) as HTMLButtonElement;
        assert.ok(outside);
        await act(async () => {
          outside.focus();
        });
        assert.equal(document.activeElement, outside);

        const items = applied.script.scenes[0]!.visualSequence!.items;
        const edited = updateMixedMediaSequenceBoundary(
          applied.script.scenes[0]!,
          items[1]!.id,
          items[1]!.startOffsetMs + 400,
          { mixedMediaScenesEnabled: true },
        );
        await mounted.setScript({
          ...applied.script,
          scenes: [edited.scene],
        });

        assert.equal(document.activeElement, outside);
        assert.match(
          mounted.host
            .querySelector("[data-visual-pacing-panel]")
            ?.getAttribute("data-visual-pacing-status") || "",
          /stale/,
        );
      } finally {
        await mounted.cleanup();
      }
    },
  );

  await testAsync(
    "parent script prop update without pending action does not steal focus",
    async () => {
      const mounted = await mountPacingHarness({
        initialScript: seededScript(),
        includeOutsideControl: true,
      });
      try {
        const outside = mounted.host.querySelector(
          "[data-outside-control]",
        ) as HTMLButtonElement;
        await act(async () => {
          outside.focus();
        });
        const next = seededScript();
        next.scenes[0] = {
          ...next.scenes[0]!,
          narration: "Changed narration without pacing action.",
        };
        await mounted.setScript(next);
        assert.equal(document.activeElement, outside);
      } finally {
        await mounted.cleanup();
      }
    },
  );

  await testAsync(
    "scene switch does not focus a pacing action automatically",
    async () => {
      const sceneA = seededScript(3, { id: "scene-a" }).scenes[0]!;
      const sceneB = seededScript(3, { id: "scene-b" }).scenes[0]!;
      const script: FootieScript = {
        title: "Two scenes",
        totalDuration: 18,
        narration: "Story",
        scenes: [sceneA, sceneB],
      };
      const mounted = await mountPacingHarness({
        initialScript: script,
        includeOutsideControl: true,
      });
      try {
        const outside = mounted.host.querySelector(
          "[data-outside-control]",
        ) as HTMLButtonElement;
        await act(async () => {
          outside.focus();
        });
        await mounted.setSceneIndex(1);
        assert.equal(document.activeElement, outside);
        assert.equal(
          (document.activeElement as HTMLElement | null)?.getAttribute(
            "data-visual-pacing-suggest",
          ),
          null,
        );
      } finally {
        await mounted.cleanup();
      }
    },
  );

  await testAsync(
    "capability-off unmount does not throw or focus hidden controls",
    async () => {
      const mounted = await mountPacingHarness({
        initialScript: seededScript(),
        includeOutsideControl: true,
      });
      try {
        const outside = mounted.host.querySelector(
          "[data-outside-control]",
        ) as HTMLButtonElement;
        await act(async () => {
          outside.focus();
        });
        await mounted.setCapabilities(false);
        assert.equal(
          mounted.host.querySelector("[data-visual-pacing-panel]"),
          null,
        );
        assert.equal(document.activeElement, outside);
      } finally {
        await mounted.cleanup();
      }
    },
  );

  console.log(`\nVisual pacing accessibility: ${passed} PASS`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
