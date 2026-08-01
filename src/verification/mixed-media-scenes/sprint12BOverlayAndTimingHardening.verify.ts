/**
 * Sprint 12B — StudioOverlay hydration + live-value stepper Enter/blur regressions.
 * Run via: npm run test:mixed-media-scenes-12b
 *
 * Minimal DOM is installed first so react-dom/client can mount the real stepper.
 */

import "../test-utils/install-minimal-dom";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import ExportDrawer from "@/components/studio-shell/ExportDrawer";
import StudioOverlay from "@/components/studio-overlay/StudioOverlay";
import {
  getClientMountedSnapshot,
  getServerMountedSnapshot,
} from "@/components/studio-overlay/client-mounted";
import StudioNumberStepper from "@/components/ui/StudioNumberStepper";
import { STUDIO_NUMBER_STEPPER_INVALID_GUIDANCE } from "@/components/ui/studio-number-stepper-draft";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function getReactProps(node: Element): {
  onChange?: (event: unknown) => void;
  onKeyDown?: (event: unknown) => void;
  onBlur?: (event: unknown) => void;
  onFocus?: (event: unknown) => void;
} {
  const key = Reflect.ownKeys(node).find((entry) =>
    String(entry).startsWith("__reactProps$"),
  );
  assert.ok(key, "expected React props on rendered input");
  return (node as unknown as Record<PropertyKey, unknown>)[key!] as {
    onChange?: (event: unknown) => void;
    onKeyDown?: (event: unknown) => void;
    onBlur?: (event: unknown) => void;
    onFocus?: (event: unknown) => void;
  };
}

function testOverlayMountedSnapshots(): void {
  assert.equal(getServerMountedSnapshot(), false);
  assert.equal(getClientMountedSnapshot(), true);
}

function testOverlayServerRenderOmitsPortal(): void {
  const closedDrawer = renderToStaticMarkup(
    createElement(
      StudioOverlay,
      {
        open: false,
        onOpenChange: () => {},
        variant: "drawer-end",
        title: "Export Video",
        keepMounted: true,
      },
      "panel-body",
    ),
  );
  const openDrawer = renderToStaticMarkup(
    createElement(
      StudioOverlay,
      {
        open: true,
        onOpenChange: () => {},
        variant: "drawer-end",
        title: "Export Video",
        keepMounted: true,
      },
      "panel-body",
    ),
  );
  const openModal = renderToStaticMarkup(
    createElement(
      StudioOverlay,
      {
        open: true,
        onOpenChange: () => {},
        variant: "modal-center",
        title: "Confirm",
        keepMounted: false,
      },
      "modal-body",
    ),
  );
  const exportDrawer = renderToStaticMarkup(
    createElement(
      ExportDrawer,
      { open: true, onOpenChange: () => {} },
      "export-body",
    ),
  );

  for (const html of [closedDrawer, openDrawer, openModal, exportDrawer]) {
    assert.equal(html, "");
    assert.doesNotMatch(html, /data-studio-overlay-backdrop/);
    assert.doesNotMatch(html, /role="dialog"/);
    assert.doesNotMatch(html, /aria-modal/);
  }

  // Mobile Storyboard toolbar is a separate StoryWorkspace node — not overlay output.
  const workspace = readSrc("src/components/StoryWorkspace.tsx");
  assert.match(workspace, /aria-label="Storyboard actions"/);
  assert.match(workspace, /studioMobileActionBar/);
  assert.doesNotMatch(workspace, /data-studio-overlay-backdrop/);
  assert.doesNotMatch(closedDrawer + openDrawer, /Storyboard actions/);
}

function testOverlayHydrationSafeWiring(): void {
  const overlay = readSrc("src/components/studio-overlay/StudioOverlay.tsx");
  assert.match(overlay, /useClientMounted/);
  assert.match(overlay, /useStudioOverlayLock\(open && mounted/);
  assert.doesNotMatch(overlay, /typeof document === ["']undefined["']/);
  assert.doesNotMatch(overlay, /suppressHydrationWarning/);
  assert.match(overlay, /variant === ["']drawer-end["']/);
  assert.match(overlay, /data-studio-overlay-panel="modal-center"|modal-center/);

  const hook = readSrc("src/components/studio-overlay/useClientMounted.ts");
  assert.match(hook, /useSyncExternalStore/);
  assert.match(hook, /getServerMountedSnapshot/);
  assert.match(hook, /getClientMountedSnapshot/);
}

function readGuidance(root: ParentNode): string {
  const status = root.querySelector("[data-studio-number-stepper-guidance]");
  assert.ok(status, "expected guidance status region");
  return (status.textContent ?? "").trim();
}

async function mountBoundaryStepper(onStepValue: (value: number) => void) {
  function Harness() {
    const [value, setValue] = useState(5);
    return createElement(StudioNumberStepper, {
      value,
      min: 0,
      step: 0.1,
      onStepValue: (next) => {
        onStepValue(next);
        setValue(next);
      },
      "aria-label": "Boundary start",
    });
  }

  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(Harness));
  });
  const input = host.querySelector("input");
  assert.ok(input, "expected rendered stepper input");
  return {
    host,
    input: input as HTMLInputElement,
    async cleanup() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

/**
 * Reproduce the Chrome failure mode: change to "" then Enter in one turn,
 * before reducer state settles. Live currentTarget.value must win over stale
 * draftUi.draftText ("5").
 */
async function testLiveValueEnterEmptyInvalidRecovery(): Promise<void> {
  const commits: number[] = [];
  const { host, input, cleanup } = await mountBoundaryStepper((next) => {
    commits.push(next);
  });

  assert.equal(input.value, "5");
  const props = getReactProps(input);

  await act(async () => {
    props.onFocus?.({
      target: input,
      currentTarget: input,
    });
  });

  await act(async () => {
    // Exact Chrome sequence: clear then Enter with no state-settling gap.
    input.value = "";
    props.onChange?.({
      target: input,
      currentTarget: input,
    });
    props.onKeyDown?.({
      key: "Enter",
      target: input,
      currentTarget: input,
      preventDefault() {},
    });
  });

  assert.equal(commits.length, 0, "invalid empty Enter must not mutate the scene");
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.equal(readGuidance(host), STUDIO_NUMBER_STEPPER_INVALID_GUIDANCE);
  // Canonical display comes from the controlled value prop after recovery.
  assert.equal(String(input.value || input.getAttribute("value") || ""), "5");

  await cleanup();
}

async function testLiveValueBlurEmptyInvalidRecovery(): Promise<void> {
  const commits: number[] = [];
  const { host, input, cleanup } = await mountBoundaryStepper((next) => {
    commits.push(next);
  });
  const props = getReactProps(input);

  await act(async () => {
    props.onFocus?.({
      target: input,
      currentTarget: input,
    });
  });

  await act(async () => {
    input.value = "";
    props.onChange?.({
      target: input,
      currentTarget: input,
    });
    props.onBlur?.({
      target: input,
      currentTarget: input,
    });
  });

  assert.equal(commits.length, 0, "invalid empty blur must not mutate the scene");
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.equal(readGuidance(host), STUDIO_NUMBER_STEPPER_INVALID_GUIDANCE);
  assert.equal(String(input.value || input.getAttribute("value") || ""), "5");

  await cleanup();
}

function testLiveValueWiringSource(): void {
  const stepper = readSrc("src/components/ui/StudioNumberStepper.tsx");
  assert.match(stepper, /commitDraft\(event\.currentTarget\.value\)/);
  assert.doesNotMatch(stepper, /commitDraft\(draftUi\.draftText\)/);
}

async function main(): Promise<void> {
  const syncTests: Array<[string, () => void]> = [
    ["overlay mounted snapshots", testOverlayMountedSnapshots],
    ["overlay server render omits portal", testOverlayServerRenderOmitsPortal],
    ["overlay hydration-safe wiring", testOverlayHydrationSafeWiring],
    ["live-value wiring source", testLiveValueWiringSource],
  ];
  const asyncTests: Array<[string, () => Promise<void>]> = [
    [
      "rendered Enter empty uses live value (Chrome sequence)",
      testLiveValueEnterEmptyInvalidRecovery,
    ],
    [
      "rendered blur empty uses live value",
      testLiveValueBlurEmptyInvalidRecovery,
    ],
  ];

  let passed = 0;
  const total = syncTests.length + asyncTests.length;
  for (const [name, run] of syncTests) {
    run();
    passed += 1;
    console.log(`  ✓ ${name}`);
  }
  for (const [name, run] of asyncTests) {
    await run();
    passed += 1;
    console.log(`  ✓ ${name}`);
  }
  console.log(
    `\nSprint 12B overlay + live timing hardening: ${passed}/${total} PASS`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
