/**
 * Visual Retention Presets accessibility + mounted focus verification.
 * Run via: npm run test:visual-retention-presets-ui
 */

import "../test-utils/install-minimal-dom";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  act,
  createElement,
  useState,
  type ReactElement,
} from "react";
import { createRoot } from "react-dom/client";

import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import {
  applyVisualRetentionPresetPlan,
  buildVisualRetentionPresetApplicationPlan,
  projectStoryVisualRetentionPresetInput,
  type VisualRetentionPresetPlanningCapabilities,
} from "@/features/visual-retention-presets";
import VisualRetentionPresetsPanel from "@/features/visual-retention-presets/editor/VisualRetentionPresetsPanel";

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

function allCapabilities(
  overrides: Partial<VisualRetentionPresetPlanningCapabilities> = {},
): VisualRetentionPresetPlanningCapabilities {
  return {
    ready: true,
    visualRetentionPresetsEnabled: true,
    visualBeatDensityEnabled: true,
    keyframedVisualEffectsEnabled: true,
    engagementOverlaysEnabled: true,
    shortForgeBrandStingEnabled: true,
    mixedMediaScenesEnabled: true,
    ...overrides,
  };
}

function imageMedia(url: string): SceneMedia {
  return { type: "image", source: "upload", url };
}

function videoMedia(url: string): SceneMedia {
  return { type: "video", source: "upload", url };
}

function mixedScene(id: string): FootieScene {
  const durationMs = 10_000;
  const split = 4_000;
  return {
    id,
    start: 0,
    end: 10,
    duration: 10,
    startMs: 0,
    endMs: durationMs,
    durationMs,
    subtitle: "Fallback",
    narration: "Opening beat. Middle beat. Closing beat.",
    media: imageMedia("https://example.com/ignored.jpg"),
    visualSequence: {
      version: 1,
      items: [
        {
          id: `${id}-a`,
          media: imageMedia(`https://example.com/${id}-a.jpg`),
          startOffsetMs: 0,
          durationMs: split,
        },
        {
          id: `${id}-b`,
          media: videoMedia(`https://example.com/${id}-b.mp4`),
          startOffsetMs: split,
          durationMs: durationMs - split,
        },
      ],
    },
  };
}

function fixtureScript(): FootieScript {
  return {
    title: "Preset a11y",
    narration: "Story",
    totalDuration: 20,
    scenes: [mixedScene("scene-1"), mixedScene("scene-2")],
  };
}

function applyBalanced(script: FootieScript) {
  const caps = allCapabilities();
  const plan = buildVisualRetentionPresetApplicationPlan({
    facts: projectStoryVisualRetentionPresetInput(script, {
      mixedMediaScenesEnabled: true,
    }),
    presetId: "visual-retention-balanced-clarity",
    capabilities: caps,
  });
  return applyVisualRetentionPresetPlan({
    script,
    plan,
    capabilities: caps,
    generatedAtIso: "2026-08-01T00:00:00.000Z",
  });
}

function getReactProps(node: Element): {
  onClick?: (event: unknown) => void;
  tabIndex?: number;
  onKeyDown?: (event: {
    key: string;
    preventDefault: () => void;
    target?: EventTarget | null;
    currentTarget?: EventTarget | null;
  }) => void;
} {
  const key = Reflect.ownKeys(node).find((entry) =>
    String(entry).startsWith("__reactProps$"),
  );
  assert.ok(key, "expected React props");
  return (node as unknown as Record<PropertyKey, unknown>)[key!] as {
    onClick?: (event: unknown) => void;
    tabIndex?: number;
    onKeyDown?: (event: {
      key: string;
      preventDefault: () => void;
      target?: EventTarget | null;
      currentTarget?: EventTarget | null;
    }) => void;
  };
}

function walkElements(root: Element): Element[] {
  const out: Element[] = [];
  const visit = (node: Element) => {
    out.push(node);
    for (const child of Array.from(node.childNodes)) {
      if ((child as { nodeType?: number }).nodeType === 1) {
        visit(child as Element);
      }
    }
  };
  visit(root);
  return out;
}

function presetRadios(host: HTMLElement): HTMLElement[] {
  return walkElements(host).filter(
    (node) => node.getAttribute("role") === "radio",
  ) as HTMLElement[];
}

function checkedPresetRadios(host: HTMLElement): HTMLElement[] {
  return presetRadios(host).filter(
    (node) => node.getAttribute("aria-checked") === "true",
  );
}

function isDisabledControl(node: Element | null): boolean {
  if (!node) return false;
  return (
    node.getAttribute("aria-disabled") === "true" ||
    node.hasAttribute("disabled")
  );
}

async function click(node: Element | null): Promise<void> {
  assert.ok(node);
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

function Harness({
  initialScript,
  projectKey = "a11y-project",
  capabilities = allCapabilities(),
}: {
  readonly initialScript: FootieScript;
  readonly projectKey?: string;
  readonly capabilities?: VisualRetentionPresetPlanningCapabilities;
}): ReactElement {
  const [script, setScript] = useState(initialScript);
  return createElement(VisualRetentionPresetsPanel, {
    key: projectKey,
    script,
    projectKey,
    capabilities,
    onScriptChange: setScript,
  });
}

async function mount(element: ReactElement): Promise<{
  host: HTMLElement;
  cleanup: () => Promise<void>;
  root: ReturnType<typeof createRoot>;
}> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return {
    host,
    root,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function main(): Promise<void> {
  console.log("\nvisual-retention-presets-accessibility\n");
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" "));
    originalConsoleError(...args);
  };

  try {
    test("source contracts: radiogroup, enabled focus destinations, no timers", () => {
      const panel = readSrc(
        "src/features/visual-retention-presets/editor/VisualRetentionPresetsPanel.tsx",
      );
      assert.match(panel, /role="radiogroup"/);
      assert.match(panel, /aria-label="Visual Retention Preset"/);
      assert.match(panel, /role="radio"/);
      assert.match(panel, /ArrowRight|ArrowDown/);
      assert.match(panel, /event\.key === "Home"/);
      assert.match(panel, /event\.key === "End"/);
      assert.match(panel, /pendingFocusRef/);
      assert.match(panel, /useLayoutEffect/);
      assert.match(panel, /apply-or-radio/);
      assert.match(panel, /isEnabledButton/);
      assert.match(panel, /aria-live="polite"/);
      assert.match(panel, /role="alert"/);
      assert.doesNotMatch(panel, /setTimeout|setInterval|requestAnimationFrame/);
      const hook = readSrc(
        "src/features/visual-retention-presets/editor/useVisualRetentionPresetSelection.ts",
      );
      assert.doesNotMatch(hook, /if\s*\([^)]*\)\s*\{\s*setState/);
    });

    await testAsync("radiogroup Arrow/Home/End and Space select without Apply", async () => {
      let commits = 0;
      const { host, cleanup } = await mount(
        createElement(function SelectHarness() {
          const [script, setScript] = useState(fixtureScript());
          return createElement(VisualRetentionPresetsPanel, {
            key: "keys",
            script,
            projectKey: "keys",
            capabilities: allCapabilities(),
            onScriptChange: (next) => {
              commits += 1;
              setScript(next);
            },
          });
        }),
      );
      const group = host.querySelector(
        "[data-visual-retention-preset-chooser]",
      ) as HTMLElement;
      const radios = presetRadios(host);
      assert.equal(radios.length, 4);
      assert.equal(checkedPresetRadios(host).length, 0);
      assert.equal(radios[0]?.getAttribute("aria-checked"), "false");
      assert.equal(getReactProps(radios[0]!).tabIndex, 0);
      assert.equal(getReactProps(radios[1]!).tabIndex, -1);

      await act(async () => {
        getReactProps(group).onKeyDown?.({
          key: "ArrowDown",
          preventDefault() {},
          currentTarget: group,
          target: radios[0],
        });
      });
      assert.equal(
        checkedPresetRadios(host)[0]?.getAttribute(
          "data-visual-retention-preset-id",
        ),
        "visual-retention-balanced-clarity",
      );
      assert.equal(commits, 0);

      await act(async () => {
        getReactProps(group).onKeyDown?.({
          key: "End",
          preventDefault() {},
          currentTarget: group,
        });
      });
      assert.equal(
        checkedPresetRadios(host)[0]?.getAttribute(
          "data-visual-retention-preset-id",
        ),
        "visual-retention-share-ready",
      );

      await act(async () => {
        getReactProps(group).onKeyDown?.({
          key: "Home",
          preventDefault() {},
          currentTarget: group,
        });
      });
      assert.equal(
        checkedPresetRadios(host)[0]?.getAttribute(
          "data-visual-retention-preset-id",
        ),
        "visual-retention-balanced-clarity",
      );

      // Space on a focused non-selected card selects it even when another is selected.
      const pulse = host.querySelector(
        '[data-visual-retention-preset-id="visual-retention-pulse-edit"]',
      ) as HTMLElement;
      await act(async () => {
        getReactProps(group).onKeyDown?.({
          key: " ",
          preventDefault() {},
          currentTarget: group,
          target: pulse,
        });
      });
      assert.equal(
        checkedPresetRadios(host)[0]?.getAttribute(
          "data-visual-retention-preset-id",
        ),
        "visual-retention-pulse-edit",
      );
      assert.equal(checkedPresetRadios(host).length, 1);
      assert.equal(commits, 0);
      await cleanup();
    });

    await testAsync("click selects only; never Applies", async () => {
      let commits = 0;
      const { host, cleanup } = await mount(
        createElement(function ClickHarness() {
          const [script, setScript] = useState(fixtureScript());
          return createElement(VisualRetentionPresetsPanel, {
            key: "click",
            script,
            projectKey: "click",
            capabilities: allCapabilities(),
            onScriptChange: (next) => {
              commits += 1;
              setScript(next);
            },
          });
        }),
      );
      await click(
        host.querySelector(
          '[data-visual-retention-preset-id="visual-retention-pulse-edit"]',
        ),
      );
      assert.equal(commits, 0);
      assert.equal(checkedPresetRadios(host).length, 1);
      await cleanup();
    });

    await testAsync("Apply success → enabled Undo focus", async () => {
      const { host, cleanup } = await mount(
        createElement(Harness, { initialScript: fixtureScript() }),
      );
      await click(
        host.querySelector(
          '[data-visual-retention-preset-id="visual-retention-balanced-clarity"]',
        ),
      );
      await click(host.querySelector("[data-visual-retention-preset-apply]"));
      const undo = host.querySelector(
        "[data-visual-retention-preset-undo]",
      ) as HTMLButtonElement | null;
      assert.ok(undo);
      assert.equal(isDisabledControl(undo), false);
      assert.equal(document.activeElement, undo);
      await cleanup();
    });

    await testAsync("Apply failure → Apply focus + alert", async () => {
      const applied = applyBalanced(fixtureScript());
      assert.equal(applied.ok, true);
      if (!applied.ok) return;
      const { host, cleanup } = await mount(
        createElement(Harness, { initialScript: applied.script }),
      );
      await click(
        host.querySelector(
          '[data-visual-retention-preset-id="visual-retention-pulse-edit"]',
        ),
      );
      const apply = host.querySelector(
        "[data-visual-retention-preset-apply]",
      ) as HTMLButtonElement;
      assert.ok(apply);
      assert.equal(isDisabledControl(apply), true);
      apply.focus();
      await click(apply);
      assert.ok(host.querySelector('[role="alert"]'));
      assert.equal(document.activeElement, apply);
      await cleanup();
    });

    await testAsync("Undo success → enabled Apply or radio", async () => {
      const { host, cleanup } = await mount(
        createElement(Harness, { initialScript: fixtureScript() }),
      );
      await click(
        host.querySelector(
          '[data-visual-retention-preset-id="visual-retention-balanced-clarity"]',
        ),
      );
      await click(host.querySelector("[data-visual-retention-preset-apply]"));
      await click(host.querySelector("[data-visual-retention-preset-undo]"));
      const apply = host.querySelector(
        "[data-visual-retention-preset-apply]",
      ) as HTMLButtonElement | null;
      const radio = host.querySelector(
        '[data-visual-retention-preset-id="visual-retention-balanced-clarity"]',
      );
      if (apply && !isDisabledControl(apply)) {
        assert.equal(document.activeElement, apply);
      } else {
        assert.equal(document.activeElement, radio);
        assert.ok(apply == null || isDisabledControl(apply));
      }
      await cleanup();
    });

    await testAsync("Undo failure → Undo focus + alert", async () => {
      const bridge: { script: FootieScript } = { script: fixtureScript() };
      const { host, cleanup } = await mount(
        createElement(function UndoFailHarness() {
          const [script, setScript] = useState(bridge.script);
          bridge.script = script;
          return createElement(VisualRetentionPresetsPanel, {
            key: "undo-fail",
            script,
            projectKey: "undo-fail",
            capabilities: allCapabilities(),
            onScriptChange: setScript,
          });
        }),
      );
      await click(
        host.querySelector(
          '[data-visual-retention-preset-id="visual-retention-balanced-clarity"]',
        ),
      );
      await click(host.querySelector("[data-visual-retention-preset-apply]"));
      const undo = host.querySelector(
        "[data-visual-retention-preset-undo]",
      ) as HTMLButtonElement;
      assert.ok(undo);
      (
        bridge.script as { visualRetentionPresetProvenance?: unknown }
      ).visualRetentionPresetProvenance = { version: 1 };
      undo.focus();
      await click(undo);
      assert.ok(host.querySelector('[role="alert"]'));
      assert.equal(document.activeElement, undo);
      await cleanup();
    });

    await testAsync("Keep success → enabled Apply only when canApply", async () => {
      const { host, cleanup } = await mount(
        createElement(Harness, { initialScript: fixtureScript() }),
      );
      await click(
        host.querySelector(
          '[data-visual-retention-preset-id="visual-retention-balanced-clarity"]',
        ),
      );
      await click(host.querySelector("[data-visual-retention-preset-apply]"));
      await click(host.querySelector("[data-visual-retention-preset-keep]"));
      const apply = host.querySelector(
        "[data-visual-retention-preset-apply]",
      ) as HTMLButtonElement | null;
      const radio = host.querySelector(
        '[data-visual-retention-preset-id="visual-retention-balanced-clarity"]',
      );
      if (apply && !isDisabledControl(apply)) {
        assert.equal(document.activeElement, apply);
      } else {
        assert.equal(document.activeElement, radio);
      }
      await cleanup();
    });

    await testAsync("Dismiss success → enabled Apply or radio", async () => {
      const applied = applyBalanced(fixtureScript());
      assert.equal(applied.ok, true);
      if (!applied.ok) return;
      const overridden: FootieScript = {
        ...applied.script,
        scenes: applied.script.scenes.map((scene) => {
          if (!scene.visualSequence) return scene;
          const items = scene.visualSequence.items.map((item, index) => {
            if (index !== 0) return item;
            return {
              ...item,
              media: {
                ...item.media,
                motion: {
                  version: 1 as const,
                  enabled: true,
                  presetId: "sports-punch" as const,
                  intensity: 0.99,
                },
              },
            };
          });
          return {
            ...scene,
            visualSequence: { version: 1 as const, items },
          };
        }),
      };
      const { host, cleanup } = await mount(
        createElement(Harness, { initialScript: overridden }),
      );
      await click(
        host.querySelector(
          '[data-visual-retention-preset-id="visual-retention-cinematic-hold"]',
        ),
      );
      await click(host.querySelector("[data-visual-retention-preset-dismiss]"));
      const apply = host.querySelector(
        "[data-visual-retention-preset-apply]",
      ) as HTMLButtonElement | null;
      const radio = host.querySelector(
        '[data-visual-retention-preset-id="visual-retention-cinematic-hold"]',
      );
      if (apply && !isDisabledControl(apply)) {
        assert.equal(document.activeElement, apply);
      } else {
        assert.equal(document.activeElement, radio);
      }
      await cleanup();
    });

    await testAsync("external prop update does not steal focus", async () => {
      const outside = document.createElement("button");
      outside.textContent = "outside";
      document.body.appendChild(outside);
      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = createRoot(host);
      function ControlledPanel({ script }: { script: FootieScript }) {
        return createElement(VisualRetentionPresetsPanel, {
          key: "external",
          script,
          projectKey: "external",
          capabilities: allCapabilities(),
          onScriptChange: () => {},
        });
      }
      const base = fixtureScript();
      await act(async () => {
        root.render(createElement(ControlledPanel, { script: base }));
      });
      await click(
        host.querySelector(
          '[data-visual-retention-preset-id="visual-retention-balanced-clarity"]',
        ),
      );
      outside.focus();
      assert.equal(document.activeElement, outside);
      await act(async () => {
        root.render(
          createElement(ControlledPanel, {
            script: { ...base, title: "Updated externally" },
          }),
        );
      });
      assert.equal(document.activeElement, outside);
      await act(async () => {
        root.unmount();
      });
      host.remove();
      outside.remove();
    });

    await testAsync("capability-off with pending focus clears without moving focus", async () => {
      const outside = document.createElement("button");
      outside.textContent = "outside";
      document.body.appendChild(outside);
      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = createRoot(host);
      let caps = allCapabilities();
      function CapHarness() {
        const [script, setScript] = useState(fixtureScript());
        return createElement(VisualRetentionPresetsPanel, {
          key: "cap",
          script,
          projectKey: "cap",
          capabilities: caps,
          onScriptChange: setScript,
        });
      }
      await act(async () => {
        root.render(createElement(CapHarness));
      });
      await click(
        host.querySelector(
          '[data-visual-retention-preset-id="visual-retention-balanced-clarity"]',
        ),
      );
      // Start Apply (success queues undo focus), then capability-off before layout settles
      // by flipping caps and re-rendering in the same act after click's commit.
      await click(host.querySelector("[data-visual-retention-preset-apply]"));
      outside.focus();
      caps = allCapabilities({ visualRetentionPresetsEnabled: false });
      await act(async () => {
        root.render(createElement(CapHarness));
      });
      assert.equal(
        host.querySelector("[data-visual-retention-presets-panel]"),
        null,
      );
      assert.equal(document.activeElement, outside);

      // Capability return must not restore prior pending focus.
      caps = allCapabilities({ visualRetentionPresetsEnabled: true });
      await act(async () => {
        root.render(createElement(CapHarness));
      });
      assert.equal(document.activeElement, outside);
      assert.ok(host.querySelector("[data-visual-retention-presets-panel]"));
      await act(async () => {
        root.unmount();
      });
      host.remove();
      outside.remove();
    });

    await testAsync("project switch keyed remount does not steal focus", async () => {
      const outside = document.createElement("button");
      outside.textContent = "outside";
      document.body.appendChild(outside);
      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = createRoot(host);
      await act(async () => {
        root.render(
          createElement(Harness, {
            initialScript: fixtureScript(),
            projectKey: "story-a",
          }),
        );
      });
      await click(
        host.querySelector(
          '[data-visual-retention-preset-id="visual-retention-pulse-edit"]',
        ),
      );
      outside.focus();
      await act(async () => {
        root.render(
          createElement(Harness, {
            initialScript: fixtureScript(),
            projectKey: "story-b",
          }),
        );
      });
      assert.equal(document.activeElement, outside);
      assert.equal(checkedPresetRadios(host).length, 0);
      assert.equal(
        host.querySelector("[data-visual-retention-preset-status]"),
        null,
      );
      await act(async () => {
        root.unmount();
      });
      host.remove();
      outside.remove();
    });

    await testAsync("valid provenance on initial project mount seeds selection", async () => {
      const applied = applyBalanced(fixtureScript());
      assert.equal(applied.ok, true);
      if (!applied.ok) return;
      const { host, cleanup } = await mount(
        createElement(Harness, { initialScript: applied.script }),
      );
      assert.equal(
        checkedPresetRadios(host)[0]?.getAttribute(
          "data-visual-retention-preset-id",
        ),
        "visual-retention-balanced-clarity",
      );
      assert.equal(
        host
          .querySelector("[data-visual-retention-preset-provenance]")
          ?.getAttribute("data-visual-retention-preset-effective-status"),
        "applied",
      );
      assert.ok(host.querySelector("[data-visual-retention-preset-undo]"));
      await cleanup();
    });

    test("no hydration/update-during-render/controlled-input console errors", () => {
      const relevant = consoleErrors.filter((entry) =>
        /Cannot update a component|while rendering|hydrat|controlled|uncontrolled/i.test(
          entry,
        ),
      );
      assert.deepEqual(relevant, []);
    });
  } finally {
    console.error = originalConsoleError;
  }

  console.log(`\nvisual-retention-presets-accessibility: ${passed} PASS\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
