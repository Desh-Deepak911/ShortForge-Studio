/**
 * Visual Retention Presets Project Inspector UI verification.
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
  listVisualRetentionPresets,
  projectStoryVisualRetentionPresetInput,
  VISUAL_RETENTION_PRESET_IDS,
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

function imageMedia(url: string, extras: Partial<SceneMedia> = {}): SceneMedia {
  return { type: "image", source: "upload", url, ...extras };
}

function videoMedia(url: string, extras: Partial<SceneMedia> = {}): SceneMedia {
  return { type: "video", source: "upload", url, ...extras };
}

function sceneStub(overrides: Partial<FootieScene> = {}): FootieScene {
  return {
    id: "scene-1",
    start: 0,
    end: 10,
    duration: 10,
    startMs: 0,
    endMs: 10_000,
    durationMs: 10_000,
    subtitle: "Fallback subtitle",
    narration: "Opening beat. Middle beat. Closing beat.",
    ...overrides,
  };
}

function mixedSequenceScene(id: string): FootieScene {
  const durationMs = 10_000;
  const split = Math.floor(durationMs * 0.4);
  return sceneStub({
    id,
    media: imageMedia("https://example.com/ignored-scene-media.jpg"),
    visualSequence: {
      version: 1,
      items: [
        {
          id: `${id}-a`,
          media: imageMedia("https://example.com/seq-a.jpg"),
          startOffsetMs: 0,
          durationMs: split,
        },
        {
          id: `${id}-b`,
          media: videoMedia("https://example.com/seq-b.mp4"),
          startOffsetMs: split,
          durationMs: durationMs - split,
        },
      ],
    },
  });
}

function fixtureScript(title = "Preset UI fixture"): FootieScript {
  return {
    title,
    narration: "Story",
    totalDuration: 20,
    scenes: [mixedSequenceScene("scene-1"), mixedSequenceScene("scene-2")],
  };
}

function applyBalanced(
  script: FootieScript,
  caps: VisualRetentionPresetPlanningCapabilities = allCapabilities(),
) {
  const plan = buildVisualRetentionPresetApplicationPlan({
    facts: projectStoryVisualRetentionPresetInput(script, {
      mixedMediaScenesEnabled: caps.mixedMediaScenesEnabled === true,
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
} {
  const key = Reflect.ownKeys(node).find((entry) =>
    String(entry).startsWith("__reactProps$"),
  );
  assert.ok(key, "expected React props");
  return (node as unknown as Record<PropertyKey, unknown>)[key!] as {
    onClick?: (event: unknown) => void;
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

function presetCards(host: HTMLElement): HTMLElement[] {
  return walkElements(host).filter((node) =>
    node.hasAttribute("data-visual-retention-preset-id"),
  ) as HTMLElement[];
}

function isDisabledControl(node: Element | null): boolean {
  if (!node) return false;
  return (
    node.getAttribute("aria-disabled") === "true" ||
    node.hasAttribute("disabled") ||
    (node as HTMLButtonElement).disabled === true
  );
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

function Harness({
  initialScript,
  projectKey = "project-a",
  capabilities = allCapabilities(),
  onCommit,
}: {
  readonly initialScript: FootieScript;
  readonly projectKey?: string;
  readonly capabilities?: VisualRetentionPresetPlanningCapabilities;
  readonly onCommit?: (script: FootieScript) => void;
}): ReactElement {
  const [script, setScript] = useState(initialScript);
  return createElement(VisualRetentionPresetsPanel, {
    key: projectKey,
    script,
    projectKey,
    capabilities,
    onScriptChange: (next) => {
      onCommit?.(next);
      setScript(next);
    },
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

async function selectPreset(
  host: HTMLElement,
  presetId: string,
): Promise<void> {
  await click(
    host.querySelector(`[data-visual-retention-preset-id="${presetId}"]`),
  );
}

async function main(): Promise<void> {
  console.log("\nvisual-retention-presets-ui\n");
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" "));
    originalConsoleError(...args);
  };

  try {
    test("source contracts: no render-phase setters, conditional timestamp, focus", () => {
      const hook = readSrc(
        "src/features/visual-retention-presets/editor/useVisualRetentionPresetSelection.ts",
      );
      assert.doesNotMatch(hook, /if\s*\([^)]*\)\s*\{\s*setState/);
      assert.doesNotMatch(hook, /if\s*\([^)]*\)\s*setState\(/);
      assert.doesNotMatch(hook, /project-local/);
      assert.doesNotMatch(hook, /useEffect|localStorage|sessionStorage|setTimeout/);
      assert.match(hook, /useState/);

      const inspector = readSrc(
        "src/features/editor/components/EditorProjectInspector.tsx",
      );
      assert.match(inspector, /key=\{storyId\}/);
      assert.match(inspector, /projectKey=\{storyId\}/);
      assert.match(inspector, /storyId != null/);
      assert.doesNotMatch(inspector, /project-local/);

      const panel = readSrc(
        "src/features/visual-retention-presets/editor/VisualRetentionPresetsPanel.tsx",
      );
      assert.match(panel, /suggest-pacing/);
      assert.match(panel, /needsGeneratedAt/);
      assert.match(panel, /\.\.\.\(generatedAtIso \? \{ generatedAtIso \} : \{\}\)/);
      assert.match(panel, /apply-or-radio/);
      assert.match(panel, /isEnabledButton|canApply/);
      assert.match(panel, /mixedMediaScenesEnabled === true/);
      assert.doesNotMatch(panel, /setTimeout|setInterval|requestAnimationFrame/);
      assert.doesNotMatch(panel, /CommandRunner|commandRunner|fetch\(/);
      assert.match(panel, /min-w-0/);
      assert.match(panel, /overflow-x-hidden|break-words/);
      assert.match(panel, /flex-col/);
    });

    await testAsync("fail-closed loading/off renders nothing", async () => {
      const script = fixtureScript();
      const loading = await mount(
        createElement(Harness, {
          initialScript: script,
          capabilities: allCapabilities({ ready: false }),
        }),
      );
      assert.equal(
        loading.host.querySelector("[data-visual-retention-presets-panel]"),
        null,
      );
      await loading.cleanup();

      const off = await mount(
        createElement(Harness, {
          initialScript: script,
          capabilities: allCapabilities({
            visualRetentionPresetsEnabled: false,
          }),
        }),
      );
      assert.equal(
        off.host.querySelector("[data-visual-retention-presets-panel]"),
        null,
      );
      await off.cleanup();
    });

    await testAsync("initial open has no selection; first radio roving only", async () => {
      const { host, cleanup } = await mount(
        createElement(Harness, { initialScript: fixtureScript() }),
      );
      assert.equal(checkedPresetRadios(host).length, 0);
      const radios = presetRadios(host);
      assert.equal(radios.length, 4);
      assert.equal(radios[0]?.getAttribute("aria-checked"), "false");
      assert.equal(Number(radios[0]?.getAttribute("tabindex") ?? radios[0]?.tabIndex), 0);
      assert.equal(isDisabledControl(host.querySelector("[data-visual-retention-preset-apply]")), true);
      assert.equal(
        host.querySelector("[data-visual-retention-preset-plan-preview]"),
        null,
      );
      await cleanup();
    });

    await testAsync("four cards in catalog order with copy", async () => {
      const { host, cleanup } = await mount(
        createElement(Harness, { initialScript: fixtureScript() }),
      );
      const radios = presetCards(host);
      assert.equal(radios.length, 4);
      assert.deepEqual(
        radios.map((node) => node.getAttribute("data-visual-retention-preset-id")),
        [...VISUAL_RETENTION_PRESET_IDS],
      );
      for (const preset of listVisualRetentionPresets()) {
        assert.match(host.textContent ?? "", new RegExp(preset.title));
        assert.match(host.textContent ?? "", new RegExp(preset.description));
      }
      assert.match(host.textContent ?? "", /Promotional/);
      await cleanup();
    });

    await testAsync("selection is local only — no parent callback", async () => {
      let commits = 0;
      const { host, cleanup } = await mount(
        createElement(Harness, {
          initialScript: fixtureScript(),
          onCommit: () => {
            commits += 1;
          },
        }),
      );
      await selectPreset(host, "visual-retention-balanced-clarity");
      assert.equal(commits, 0);
      assert.equal(checkedPresetRadios(host).length, 1);
      assert.ok(host.querySelector("[data-visual-retention-preset-plan-preview]"));
      await cleanup();
    });

    await testAsync("same-project script edit does not reset local selection", async () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = createRoot(host);
      function ControlledPanel({ script }: { script: FootieScript }) {
        return createElement(VisualRetentionPresetsPanel, {
          key: "same-project",
          script,
          projectKey: "same-project",
          capabilities: allCapabilities(),
          onScriptChange: () => {},
        });
      }
      const base = fixtureScript("One");
      await act(async () => {
        root.render(createElement(ControlledPanel, { script: base }));
      });
      await selectPreset(host, "visual-retention-cinematic-hold");
      await act(async () => {
        root.render(
          createElement(ControlledPanel, {
            script: { ...base, title: "Edited title only" },
          }),
        );
      });
      assert.equal(
        checkedPresetRadios(host)[0]?.getAttribute(
          "data-visual-retention-preset-id",
        ),
        "visual-retention-cinematic-hold",
      );
      await act(async () => {
        root.unmount();
      });
      host.remove();
    });

    await testAsync("project A selection does not appear in project B keyed remount", async () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = createRoot(host);
      await act(async () => {
        root.render(
          createElement(Harness, {
            initialScript: fixtureScript("A"),
            projectKey: "project-a",
          }),
        );
      });
      await selectPreset(host, "visual-retention-pulse-edit");
      assert.equal(
        checkedPresetRadios(host)[0]?.getAttribute(
          "data-visual-retention-preset-id",
        ),
        "visual-retention-pulse-edit",
      );
      await act(async () => {
        root.render(
          createElement(Harness, {
            initialScript: fixtureScript("B"),
            projectKey: "project-b",
          }),
        );
      });
      assert.equal(checkedPresetRadios(host).length, 0);
      assert.equal(
        host
          .querySelector("[data-visual-retention-presets-panel]")
          ?.getAttribute("data-visual-retention-preset-project-key"),
        "project-b",
      );
      await act(async () => {
        root.unmount();
      });
      host.remove();
    });

    await testAsync("returning to remounted project seeds from current provenance only", async () => {
      const caps = allCapabilities();
      const applied = applyBalanced(fixtureScript("Seed"), caps);
      assert.equal(applied.ok, true);
      if (!applied.ok) return;

      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = createRoot(host);
      function Controlled({
        script,
        projectKey,
      }: {
        script: FootieScript;
        projectKey: string;
      }) {
        return createElement(VisualRetentionPresetsPanel, {
          key: projectKey,
          script,
          projectKey,
          capabilities: caps,
          onScriptChange: () => {},
        });
      }
      await act(async () => {
        root.render(
          createElement(Controlled, {
            script: fixtureScript("Empty"),
            projectKey: "project-return",
          }),
        );
      });
      await selectPreset(host, "visual-retention-share-ready");
      await act(async () => {
        root.render(
          createElement(Controlled, {
            script: fixtureScript("Other"),
            projectKey: "project-other",
          }),
        );
      });
      await act(async () => {
        root.render(
          createElement(Controlled, {
            script: applied.script,
            projectKey: "project-return",
          }),
        );
      });
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
      await act(async () => {
        root.unmount();
      });
      host.remove();
    });

    await testAsync("plan preview counts, deduped skips, no codes", async () => {
      const script = fixtureScript();
      const { host, cleanup } = await mount(
        createElement(Harness, { initialScript: script }),
      );
      await selectPreset(host, "visual-retention-pulse-edit");
      const preview = host.querySelector(
        "[data-visual-retention-preset-plan-preview]",
      ) as HTMLElement;
      assert.ok(preview);
      const plan = buildVisualRetentionPresetApplicationPlan({
        facts: projectStoryVisualRetentionPresetInput(script, {
          mixedMediaScenesEnabled: true,
        }),
        presetId: "visual-retention-pulse-edit",
        capabilities: allCapabilities(),
      });
      assert.equal(
        preview.getAttribute("data-visual-retention-preset-plan-actions"),
        String(plan.summary.actionCount),
      );
      assert.equal(
        preview.getAttribute("data-visual-retention-preset-plan-skipped"),
        String(plan.summary.skippedCount),
      );
      assert.match(
        preview.textContent ?? "",
        /No changes are applied until you choose Apply/,
      );
      assert.match(
        preview.textContent ?? "",
        /Pacing is suggested as a draft; scene timing is not changed automatically/,
      );
      assert.doesNotMatch(preview.textContent ?? "", /vrp1:/);
      assert.doesNotMatch(preview.textContent ?? "", /PRESET_PLAN_/);
      await cleanup();
    });

    await testAsync("partial capability plan shows skipped guidance without terminal", async () => {
      const capabilities = allCapabilities({
        visualBeatDensityEnabled: false,
        keyframedVisualEffectsEnabled: false,
      });
      const { host, cleanup } = await mount(
        createElement(Harness, {
          initialScript: fixtureScript(),
          capabilities,
        }),
      );
      await selectPreset(host, "visual-retention-pulse-edit");
      const preview = host.querySelector(
        "[data-visual-retention-preset-plan-preview]",
      ) as HTMLElement;
      assert.ok(preview);
      assert.equal(
        preview.getAttribute("data-visual-retention-preset-plan-status"),
        "preview",
      );
      assert.ok(
        Number(preview.getAttribute("data-visual-retention-preset-plan-skipped")) >
          0,
      );
      assert.match(host.textContent ?? "", /skip|unavailable|off/i);
      await cleanup();
    });

    await testAsync("no-pacing partial plan Apply succeeds without timestamp", async () => {
      let commits = 0;
      const capabilities = allCapabilities({ visualBeatDensityEnabled: false });
      const script = fixtureScript();
      const plan = buildVisualRetentionPresetApplicationPlan({
        facts: projectStoryVisualRetentionPresetInput(script, {
          mixedMediaScenesEnabled: true,
        }),
        presetId: "visual-retention-balanced-clarity",
        capabilities,
      });
      assert.ok(!plan.actions.some((action) => action.kind === "suggest-pacing"));
      assert.ok(plan.summary.actionCount > 0);

      const { host, cleanup } = await mount(
        createElement(Harness, {
          initialScript: script,
          capabilities,
          onCommit: () => {
            commits += 1;
          },
        }),
      );
      await selectPreset(host, "visual-retention-balanced-clarity");
      const apply = host.querySelector("[data-visual-retention-preset-apply]");
      assert.equal(isDisabledControl(apply), false);
      await click(apply);
      assert.equal(commits, 1);
      assert.ok(host.querySelector("[data-visual-retention-preset-undo]"));
      assert.equal(
        host
          .querySelector("[data-visual-retention-preset-provenance]")
          ?.getAttribute("data-visual-retention-preset-effective-status"),
        "applied",
      );
      await cleanup();
    });

    await testAsync("Apply success commits once; provenance blocks second Apply", async () => {
      let commits = 0;
      const bridge = { latest: fixtureScript() };
      const { host, cleanup } = await mount(
        createElement(function ApplyHarness() {
          const [script, setScript] = useState(bridge.latest);
          bridge.latest = script;
          return createElement(VisualRetentionPresetsPanel, {
            key: "project-apply",
            script,
            projectKey: "project-apply",
            capabilities: allCapabilities(),
            onScriptChange: (next) => {
              commits += 1;
              setScript(next);
            },
          });
        }),
      );
      await selectPreset(host, "visual-retention-balanced-clarity");
      await click(host.querySelector("[data-visual-retention-preset-apply]"));
      assert.equal(commits, 1);
      assert.ok(bridge.latest.visualRetentionPresetProvenance);
      assert.equal(
        host
          .querySelector("[data-visual-retention-preset-provenance]")
          ?.getAttribute("data-visual-retention-preset-effective-status"),
        "applied",
      );
      assert.ok(host.querySelector("[data-visual-retention-preset-undo]"));
      assert.ok(host.querySelector("[data-visual-retention-preset-keep]"));
      assert.equal(host.querySelector("[data-visual-retention-preset-dismiss]"), null);
      const applyAfter = host.querySelector("[data-visual-retention-preset-apply]");
      assert.equal(isDisabledControl(applyAfter), true);
      await click(applyAfter);
      assert.equal(commits, 1);
      await cleanup();
    });

    await testAsync("Apply terminal failure does not commit", async () => {
      let commits = 0;
      const applied = applyBalanced(fixtureScript());
      assert.equal(applied.ok, true);
      if (!applied.ok) return;
      const { host, cleanup } = await mount(
        createElement(Harness, {
          initialScript: applied.script,
          onCommit: () => {
            commits += 1;
          },
        }),
      );
      await selectPreset(host, "visual-retention-pulse-edit");
      const apply = host.querySelector("[data-visual-retention-preset-apply]");
      assert.equal(isDisabledControl(apply), true);
      await click(apply);
      assert.equal(commits, 0);
      assert.ok(host.querySelector("[data-visual-retention-preset-alert]"));
      await cleanup();
    });

    await testAsync("Keep focuses radio when Apply stays disabled after already-matches", async () => {
      const applied = applyBalanced(fixtureScript());
      assert.equal(applied.ok, true);
      if (!applied.ok) return;
      const { host, cleanup } = await mount(
        createElement(Harness, { initialScript: applied.script }),
      );
      // Provenance seeds Balanced Clarity; Keep clears record; plan may already-match.
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

    await testAsync("manual override stale state offers Dismiss, not Undo", async () => {
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
      assert.equal(
        host
          .querySelector("[data-visual-retention-preset-provenance]")
          ?.getAttribute("data-visual-retention-preset-effective-status"),
        "stale",
      );
      assert.equal(host.querySelector("[data-visual-retention-preset-undo]"), null);
      assert.ok(host.querySelector("[data-visual-retention-preset-dismiss]"));
      assert.match(host.textContent ?? "", /manually after Apply/i);
      await cleanup();
    });

    await testAsync("Undo / Keep / Dismiss state matrix for valid provenance", async () => {
      const applied = applyBalanced(fixtureScript());
      assert.equal(applied.ok, true);
      if (!applied.ok) return;

      const appliedMount = await mount(
        createElement(Harness, { initialScript: applied.script }),
      );
      assert.ok(appliedMount.host.querySelector("[data-visual-retention-preset-undo]"));
      assert.ok(appliedMount.host.querySelector("[data-visual-retention-preset-keep]"));
      assert.equal(
        appliedMount.host.querySelector("[data-visual-retention-preset-dismiss]"),
        null,
      );
      await appliedMount.cleanup();

      let undoCommits = 0;
      const undoMount = await mount(
        createElement(Harness, {
          initialScript: applied.script,
          onCommit: () => {
            undoCommits += 1;
          },
        }),
      );
      await click(undoMount.host.querySelector("[data-visual-retention-preset-undo]"));
      assert.equal(undoCommits, 1);
      await undoMount.cleanup();
    });

    test("narrow-layout class contracts", () => {
      const panel = readSrc(
        "src/features/visual-retention-presets/editor/VisualRetentionPresetsPanel.tsx",
      );
      const preview = readSrc(
        "src/features/visual-retention-presets/editor/VisualRetentionPresetPlanPreview.tsx",
      );
      assert.match(panel, /min-w-0/);
      assert.match(panel, /max-w-full/);
      assert.match(panel, /overflow-x-hidden/);
      assert.match(panel, /flex-col/);
      assert.match(panel, /break-words/);
      assert.doesNotMatch(panel, /min-w-\[(2|3|4|5|6|7|8|9)/);
      assert.match(preview, /min-w-0/);
      assert.match(preview, /break-words/);
    });

    test("no update-during-render / controlled-input console errors", () => {
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

  console.log(`\nvisual-retention-presets-ui: ${passed} PASS\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
