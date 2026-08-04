/**
 * Brand-sting export controls accessibility / focus / hydration verification.
 * Run via: npm run test:brand-sting-export
 */

import "../test-utils/install-minimal-dom";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, useState, type ReactElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import BrandStingExportControls from "@/features/brand-sting/editor/BrandStingExportControls";
import {
  enableBrandSting,
  type BrandStingCommandResult,
} from "@/features/brand-sting";
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
  return createElement(BrandStingExportControls, {
    script,
    shortForgeBrandStingEnabled: enabled,
    capabilitiesReady: ready,
    onScriptCommit: (result: BrandStingCommandResult) => {
      setScript(result.script);
    },
  });
}

async function main(): Promise<void> {
  console.log("\nbrand-sting-accessibility\n");

  test("capability loading/off renders nothing (no hydration flash)", () => {
    const off = renderToStaticMarkup(
      createElement(Harness, { initial: baseScript(), enabled: false }),
    );
    assert.equal(off, "");
    const loading = renderToStaticMarkup(
      createElement(Harness, {
        initial: baseScript(),
        enabled: true,
        ready: false,
      }),
    );
    assert.equal(loading, "");
  });

  test("named radiogroup and Add/Remove controls are present", () => {
    const markup = renderToStaticMarkup(
      createElement(Harness, { initial: baseScript() }),
    );
    assert.match(markup, /ShortForge Studio outro/);
    assert.match(markup, /Add ShortForge Studio outro/);
    assert.match(markup, /data-narrow-width-safe/);
    assert.doesNotMatch(markup, /voiceover|speech rate|narration style/i);
  });

  await testAsync("Add focuses duration choice", async () => {
    const { host, cleanup } = await mount(
      createElement(Harness, { initial: baseScript() }),
    );
    const add = host.querySelector(
      '[data-brand-sting-add="true"]',
    ) as HTMLButtonElement | null;
    assert.ok(add, `expected add control, got: ${host.innerHTML.slice(0, 200)}`);
    await act(async () => {
      getReactProps(add!).onClick?.({});
    });
    assert.ok(host.querySelector('[data-brand-sting-remove="true"]'));
    assert.ok(host.querySelector('[role="radiogroup"]'));
    assert.equal(document.activeElement?.getAttribute("role"), "radio");
    await cleanup();
  });

  test("enabled controls expose three duration radios in markup", () => {
    const enabled = enableBrandSting(baseScript(), {
      shortForgeBrandStingEnabled: true,
    }).script;
    const markup = renderToStaticMarkup(
      createElement(Harness, { initial: enabled }),
    );
    assert.equal((markup.match(/role="radio"/g) ?? []).length, 3);
    assert.match(markup, />2s</);
    assert.match(markup, />2\.5s</);
    assert.match(markup, />3s</);
  });

  await testAsync("Remove focuses Add ShortForge Studio outro", async () => {
    const enabled = enableBrandSting(baseScript(), {
      shortForgeBrandStingEnabled: true,
    }).script;
    const { host, cleanup } = await mount(
      createElement(Harness, { initial: enabled }),
    );
    const remove = host.querySelector(
      '[data-brand-sting-remove="true"]',
    ) as HTMLButtonElement | null;
    assert.ok(remove);
    await act(async () => {
      getReactProps(remove!).onClick?.({});
    });
    const addAgain = host.querySelector(
      '[data-brand-sting-add="true"]',
    ) as HTMLElement | null;
    assert.ok(addAgain);
    assert.equal(document.activeElement, addAgain);
    await cleanup();
  });

  await testAsync("duration radiogroup supports arrow-key navigation", async () => {
    const enabled = enableBrandSting(baseScript(), {
      shortForgeBrandStingEnabled: true,
    }).script;
    const { host, cleanup } = await mount(
      createElement(Harness, { initial: enabled }),
    );
    const first = host.querySelector('[role="radio"]') as HTMLButtonElement | null;
    assert.ok(first);
    await act(async () => {
      getReactProps(first!).onKeyDown?.({
        key: "ArrowRight",
        preventDefault() {},
      });
    });
    const checked = host.querySelector('[role="radio"][aria-checked="true"]');
    assert.ok(checked);
    assert.match(checked?.textContent ?? "", /2\.5s|3s|2s/);
    await cleanup();
  });

  await testAsync("duration radiogroup supports Home/End and clear selected state", async () => {
    const enabled = enableBrandSting(baseScript(), {
      shortForgeBrandStingEnabled: true,
    }).script;
    const { host, cleanup } = await mount(
      createElement(Harness, { initial: enabled }),
    );
    const anyRadio = host.querySelector('[role="radio"]') as HTMLButtonElement | null;
    assert.ok(anyRadio);
    await act(async () => {
      getReactProps(anyRadio!).onKeyDown?.({
        key: "End",
        preventDefault() {},
      });
    });
    // Selected radio text updates; minimal DOM querySelector is first-match only.
    assert.match(host.textContent ?? "", /3s/);
    await act(async () => {
      getReactProps(
        host.querySelector('[role="radio"]') as HTMLButtonElement,
      ).onKeyDown?.({
        key: "Home",
        preventDefault() {},
      });
    });
    assert.match(host.textContent ?? "", /2s/);
    await cleanup();
  });

  test("preview hydration uses capability-off duration until capabilities ready", () => {
    const preview = readSrc("src/features/preview/hooks/usePreviewPlayback.ts");
    assert.match(preview, /visualRetentionCapabilitiesReady/);
    assert.match(preview, /hydration-safe/);
    assert.match(preview, /shortForgeBrandStingCapability/);
    const controls = readSrc(
      "src/features/brand-sting/editor/BrandStingExportControls.tsx",
    );
    assert.match(controls, /event\.key === "Home"/);
    assert.match(controls, /event\.key === "End"/);
    assert.match(controls, /ArrowRight|ArrowLeft/);
  });

  test("no create-on-open; Export drawer wiring and source contracts", () => {
    const controls = readSrc(
      "src/features/brand-sting/editor/BrandStingExportControls.tsx",
    );
    assert.doesNotMatch(controls, /enableBrandSting\([^\)]*\)\s*;/);
    assert.match(controls, /role=\{statusIsAlert \? "alert" : "status"\}/);
    const exportPanel = readSrc("src/components/ExportPanel.tsx");
    assert.match(exportPanel, /BrandStingExportControls/);
    assert.match(exportPanel, /useShortForgeBrandStingEnabled/);
    assert.match(exportPanel, /onScriptCommit/);
  });

  test("opening export never auto-adds overlays/stings in controls source", () => {
    const commands = readSrc(
      "src/features/brand-sting/editor/brand-sting.commands.ts",
    );
    assert.match(commands, /createDefaultShortForgeBrandSting/);
    assert.doesNotMatch(
      readSrc("src/features/brand-sting/editor/BrandStingExportControls.tsx"),
      /useEffect\([\s\S]*enableBrandSting/,
    );
  });

  console.log(`\n${passed} passed\n`);
}

void main();
