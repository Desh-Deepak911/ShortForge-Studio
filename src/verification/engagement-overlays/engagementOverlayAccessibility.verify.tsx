/**
 * Engagement-overlay controls accessibility / focus / hydration verification.
 * Run via: npm run test:engagement-overlays
 */

import "../test-utils/install-minimal-dom";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, useState, type ReactElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import EngagementOverlayControls from "@/features/engagement-overlays/editor/EngagementOverlayControls";
import {
  addEngagementOverlay,
  type EngagementOverlayCommandResult,
} from "@/features/engagement-overlays";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

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

function baseScript(): FootieScript {
  return syncFootieScript({
    title: "A11y",
    narration: "Hello world",
    totalDuration: 5,
    scenes: [
      {
        id: "scene-a",
        start: 0,
        end: 5,
        duration: 5,
        startMs: 0,
        endMs: 5000,
        durationMs: 5000,
        subtitle: "Hello",
        narration: "Hello",
        media: {
          type: "image",
          url: "https://example.com/a.jpg",
          source: "upload",
        },
      },
    ],
  });
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

function Harness({
  initial,
  enabled = true,
  ready = true,
}: {
  initial: FootieScript;
  enabled?: boolean;
  ready?: boolean;
}): ReactElement {
  const [script, setScript] = useState(initial);
  return createElement(EngagementOverlayControls, {
    controlId: "engagement-a11y",
    script,
    sceneId: "scene-a",
    sceneDurationMs: 5000,
    engagementOverlaysEnabled: enabled,
    capabilitiesReady: ready,
    onScriptCommit: (result: EngagementOverlayCommandResult) => {
      setScript(result.script);
    },
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
  console.log("\nengagement-overlay-accessibility\n");

  test("capability loading/off renders nothing (no hydration flash)", () => {
    const loading = renderToStaticMarkup(
      createElement(Harness, {
        initial: baseScript(),
        ready: false,
        enabled: false,
      }),
    );
    assert.equal(loading, "");
    const off = renderToStaticMarkup(
      createElement(Harness, {
        initial: baseScript(),
        ready: true,
        enabled: false,
      }),
    );
    assert.equal(off, "");
  });

  test("named radiogroups and labeled timing controls are present", () => {
    const withOverlay = addEngagementOverlay(baseScript(), "scene-a", {
      engagementOverlaysEnabled: true,
    }).script;
    const markup = renderToStaticMarkup(
      createElement(Harness, { initial: withOverlay }),
    );
    assert.match(markup, /role="radiogroup"/);
    assert.match(markup, /data-engagement-overlay-kind-group="true"/);
    assert.match(markup, /data-engagement-overlay-position-group="true"/);
    assert.match(markup, /aria-labelledby=/);
    assert.match(markup, /Start/);
    assert.match(markup, /Duration/);
    assert.match(markup, /data-engagement-overlay-controls="true"/);
  });

  await testAsync("Add focuses first configuration control", async () => {
    const { host, cleanup } = await mount(
      createElement(Harness, { initial: baseScript() }),
    );
    const add = host.querySelector(
      '[data-engagement-overlay-add="true"]',
    ) as HTMLButtonElement | null;
    assert.ok(add);
    await act(async () => {
      getReactProps(add!).onClick?.({});
    });
    const kindGroup = host.querySelector(
      '[data-engagement-overlay-kind-group="true"]',
    );
    assert.ok(kindGroup);
    const focused = host.querySelector(
      '[data-engagement-overlay-kind="like"]',
    ) as HTMLElement | null;
    assert.ok(focused);
    assert.equal(document.activeElement, focused);
    await cleanup();
  });

  await testAsync("Remove focuses Add engagement prompt", async () => {
    const withOverlay = addEngagementOverlay(baseScript(), "scene-a", {
      engagementOverlaysEnabled: true,
    }).script;
    const { host, cleanup } = await mount(
      createElement(Harness, { initial: withOverlay }),
    );
    const remove = host.querySelector(
      '[data-engagement-overlay-remove="true"]',
    ) as HTMLButtonElement | null;
    assert.ok(remove);
    await act(async () => {
      getReactProps(remove!).onClick?.({});
    });
    const add = host.querySelector(
      '[data-engagement-overlay-add="true"]',
    ) as HTMLElement | null;
    assert.ok(add);
    assert.equal(document.activeElement, add);
    await cleanup();
  });

  await testAsync("kind radiogroup supports arrow-key navigation", async () => {
    const withOverlay = addEngagementOverlay(baseScript(), "scene-a", {
      engagementOverlaysEnabled: true,
    }).script;
    const { host, cleanup } = await mount(
      createElement(Harness, { initial: withOverlay }),
    );
    const group = host.querySelector(
      '[data-engagement-overlay-kind-group="true"]',
    ) as HTMLElement;
    assert.ok(group);
    await act(async () => {
      getReactProps(group).onKeyDown?.({
        key: "ArrowRight",
        preventDefault() {},
      });
    });
    const selected = host.querySelector(
      '[data-engagement-overlay-kind="share"]',
    );
    assert.ok(selected);
    assert.match(selected!.textContent ?? "", /Share|Like|Subscribe/);
    await cleanup();
  });

  test("source declares narrow-width-safe layout and alert guidance", () => {
    const source = readSrc(
      "src/features/engagement-overlays/editor/EngagementOverlayControls.tsx",
    );
    assert.match(source, /min-w-0/);
    assert.match(source, /max-w-full/);
    assert.match(source, /role=\{statusIsAlert \? "alert" : "status"\}/);
    assert.match(source, /pendingFocusRef/);
    assert.doesNotMatch(source, /useEffect\([^)]*\)\s*=>\s*\{[\s\S]*?\.focus\(/);
  });

  test("inspector placement stays after motion/look and gated on capability ready", () => {
    const inspector = readSrc(
      "src/features/editor/components/StudioSceneInspector.tsx",
    );
    assert.match(inspector, /MediaVisualAdjustmentsPanel/);
    assert.match(inspector, /EngagementOverlayControls/);
    assert.ok(
      inspector.indexOf("MediaVisualAdjustmentsPanel") <
        inspector.indexOf("EngagementOverlayControls"),
    );
    assert.match(inspector, /capabilitiesReady=\{visualRetentionCapabilitiesReady\}/);
  });

  test("Start/Duration typed input uses StudioNumberStepper command path", () => {
    const source = readSrc(
      "src/features/engagement-overlays/editor/EngagementOverlayControls.tsx",
    );
    const stepper = readSrc("src/components/ui/StudioNumberStepper.tsx");
    assert.match(source, /StudioNumberStepper/);
    assert.match(source, /onValueCommit/);
    assert.match(source, /onStepValue/);
    assert.match(source, /setEngagementOverlayStartMs/);
    assert.match(source, /setEngagementOverlayDurationMs/);
    assert.match(stepper, /Escape/);
    assert.match(stepper, /invalidRecovery/);
    assert.match(stepper, /aria-invalid/);
    assert.doesNotMatch(source, /createElement\(["']input["']/);
  });

  test("opening inspector never auto-adds overlays; focus is opt-in only", () => {
    const source = readSrc(
      "src/features/engagement-overlays/editor/EngagementOverlayControls.tsx",
    );
    const inspector = readSrc(
      "src/features/editor/components/StudioSceneInspector.tsx",
    );
    assert.doesNotMatch(source, /useEffect\([\s\S]*addEngagementOverlay/);
    assert.doesNotMatch(inspector, /addEngagementOverlay\(/);
    assert.match(source, /pendingFocusRef/);
    assert.match(source, /focusTarget === "kind"/);
  });

  console.log(`\n${passed} passed\n`);
}

void main();
