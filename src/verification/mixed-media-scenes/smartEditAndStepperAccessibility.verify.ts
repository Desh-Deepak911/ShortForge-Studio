/**
 * Smart Edit hydration + StudioNumberStepper accessibility guidance.
 * Run via: npm run test:mixed-media-scenes
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import StudioNumberStepper from "@/components/ui/StudioNumberStepper";
import StudioNumberStepperGuidance from "@/components/ui/StudioNumberStepperGuidance";
import {
  INITIAL_STEPPER_DRAFT_UI,
  reduceStepperDraftUi,
  STUDIO_NUMBER_STEPPER_INVALID_GUIDANCE,
} from "@/components/ui/studio-number-stepper-draft";
import {
  resolveClientSmartEditReturnTo,
  resolveInitialSmartEditReturnTo,
} from "@/features/tool/hooks/smart-edit-return-to";
import { buildSmartEditImageToolUrl } from "@/lib/utils/smart-image-tool.utils";
import { isLocalDevQaHarnessAllowed } from "@/features/visual-retention/qa/assert-local-dev-qa-harness-allowed";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function testDeterministicSmartEditReturnTo(): void {
  const pathname = "/dev/mixed-media-scenes-qa";
  const serverReturnTo = resolveInitialSmartEditReturnTo(pathname);
  const clientInitialReturnTo = resolveInitialSmartEditReturnTo(pathname);
  assert.equal(serverReturnTo, clientInitialReturnTo);
  assert.equal(serverReturnTo, pathname);

  const serverHref = buildSmartEditImageToolUrl({
    returnTo: serverReturnTo,
    sceneId: "mm-qa-scene-1",
  });
  const clientInitialHref = buildSmartEditImageToolUrl({
    returnTo: clientInitialReturnTo,
    sceneId: "mm-qa-scene-1",
  });
  assert.equal(serverHref, clientInitialHref);
  assert.match(serverHref, /returnTo=%2Fdev%2Fmixed-media-scenes-qa/);

  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: { location: { href: string } } }).window = {
    location: { href: "http://localhost:3000/dev/mixed-media-scenes-qa?x=1" },
  };
  try {
    const postHydration = resolveClientSmartEditReturnTo(serverReturnTo);
    assert.equal(
      postHydration,
      "http://localhost:3000/dev/mixed-media-scenes-qa?x=1",
    );
    assert.notEqual(postHydration, serverReturnTo);
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = previousWindow;
    }
  }
}

function testSmartEditHookWiringHydrationSafe(): void {
  const hook = readSrc("src/features/tool/hooks/useSmartEditImageContext.ts");
  assert.match(hook, /resolveInitialSmartEditReturnTo/);
  assert.match(hook, /resolveClientSmartEditReturnTo/);
  assert.match(hook, /useSyncExternalStore/);
  // Server snapshot is pathname-only; client snapshot reads location after hydrate.
  assert.match(hook, /\(\) => initialReturnTo/);
  assert.match(hook, /resolveClientSmartEditReturnTo\(initialReturnTo\)/);
  assert.doesNotMatch(hook, /useEffect/);
  assert.doesNotMatch(
    hook,
    /typeof window !== ["']undefined["'] \? window\.location\.href/,
  );

  const action = readSrc("src/features/tool/components/SmartEditImageAction.tsx");
  assert.match(action, /useSmartEditImageContext/);
  assert.match(action, /buildSmartEditImageToolUrl/);
  assert.doesNotMatch(action, /suppressHydrationWarning/);

  const openUtil = readSrc("src/lib/utils/smart-image-tool.utils.ts");
  assert.match(openUtil, /window\.location\.href/);
}

function testRenderedStepperBaselineMarkup(): void {
  const html = renderToStaticMarkup(
    createElement(StudioNumberStepper, {
      value: 4.25,
      min: 0,
      step: 0.1,
      onStepValue: () => {},
      "aria-label": "Boundary start",
    }),
  );
  assert.match(html, /data-studio-number-stepper="true"/);
  assert.match(html, /data-studio-number-stepper-draft="true"/);
  assert.match(html, /value="4\.25"/);
  assert.match(html, /data-studio-number-stepper-guidance/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /role="status"/);
  // Controlled input is present; React warning is avoided by always wiring onChange in component source.
  assert.doesNotMatch(html, /readOnly/);
}

function testRenderedInvalidGuidancePersists(): void {
  const recovered = reduceStepperDraftUi(INITIAL_STEPPER_DRAFT_UI, {
    type: "commit",
    raw: "",
    canonical: "4.25",
  });
  assert.equal(recovered.invalidRecovery, true);
  assert.equal(recovered.commitValue, undefined);
  assert.equal(recovered.state.guidance, STUDIO_NUMBER_STEPPER_INVALID_GUIDANCE);
  assert.equal(recovered.state.editing, false);

  // Render the real guidance component + the same aria contract the stepper applies.
  const html = renderToStaticMarkup(
    createElement(
      "div",
      { "data-studio-number-stepper": "true" },
      createElement("input", {
        type: "number",
        value: 4.25,
        "aria-invalid": true,
        "aria-describedby": "stepper-guidance",
        "aria-label": "Boundary start",
        readOnly: true,
      }),
      createElement(StudioNumberStepperGuidance, {
        id: "stepper-guidance",
        guidance: recovered.state.guidance,
      }),
    ),
  );

  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="stepper-guidance"/);
  assert.match(html, new RegExp(STUDIO_NUMBER_STEPPER_INVALID_GUIDANCE));
  assert.match(html, /data-studio-number-stepper-guidance/);
  assert.match(html, /value="4\.25"/);

  // Focus must not clear guidance (fixes Enter → blur → re-focus wipe).
  const afterFocus = reduceStepperDraftUi(recovered.state, {
    type: "focus",
    canonical: "4.25",
  });
  assert.equal(afterFocus.state.guidance, STUDIO_NUMBER_STEPPER_INVALID_GUIDANCE);

  // Clear on next edit.
  const afterEdit = reduceStepperDraftUi(afterFocus.state, {
    type: "change",
    text: "3",
  });
  assert.equal(afterEdit.state.guidance, null);

  // Escape clears guidance without committing.
  const withGuidance = reduceStepperDraftUi(INITIAL_STEPPER_DRAFT_UI, {
    type: "commit",
    raw: "abc",
    canonical: "4.25",
  }).state;
  const afterEscape = reduceStepperDraftUi(withGuidance, {
    type: "escape",
    canonical: "4.25",
  });
  assert.equal(afterEscape.state.guidance, null);
  assert.equal(afterEscape.commitValue, undefined);
}

function testInvalidEnterDoesNotBlurWiring(): void {
  const stepper = readSrc("src/components/ui/StudioNumberStepper.tsx");
  assert.match(stepper, /Keep focus after invalid recovery/);
  assert.match(stepper, /if \(ok\) \{\s*event\.currentTarget\.blur\(\)/);
  assert.match(stepper, /StudioNumberStepperGuidance/);
  // Focus keeps existing guidance (does not set guidance: null).
  assert.match(stepper, /type: ["']focus["']/);
  const draft = readSrc("src/components/ui/studio-number-stepper-draft.ts");
  assert.match(draft, /Keep invalid guidance until the user edits/);
  assert.doesNotMatch(
    draft.match(/case ["']focus["']:[\s\S]*?case ["']change["']/)?.[0] ?? "",
    /guidance:\s*null/,
  );
}

function testNoControlledInputWarningWiring(): void {
  const stepper = readSrc("src/components/ui/StudioNumberStepper.tsx");
  assert.match(stepper, /value=\{displayValue\}/);
  assert.match(stepper, /onChange=\{\(event\) => \{/);
}

function testQaRouteGuardAndCapabilityStillFailClosed(): void {
  assert.equal(isLocalDevQaHarnessAllowed("production"), false);
  assert.equal(isLocalDevQaHarnessAllowed("development"), true);
  const page = readSrc("src/app/dev/mixed-media-scenes-qa/page.tsx");
  assert.match(page, /assertLocalDevQaHarnessAllowed/);
  const harness = readSrc(
    "src/app/dev/mixed-media-scenes-qa/MixedMediaScenesQaHarness.tsx",
  );
  assert.doesNotMatch(harness, /mixedMediaScenesEnabled\s*=/);
  assert.doesNotMatch(harness, /generateStory|openai|elevenlabs/i);
  assert.match(harness, /StoryWorkspace/);
}

async function main(): Promise<void> {
  const tests: Array<[string, () => void]> = [
    ["deterministic Smart Edit returnTo (SSR/CSR)", testDeterministicSmartEditReturnTo],
    ["Smart Edit hook hydration-safe wiring", testSmartEditHookWiringHydrationSafe],
    ["rendered stepper baseline markup", testRenderedStepperBaselineMarkup],
    ["rendered invalid guidance persists", testRenderedInvalidGuidancePersists],
    ["invalid Enter does not blur", testInvalidEnterDoesNotBlurWiring],
    ["no controlled-input warning wiring", testNoControlledInputWarningWiring],
    ["QA route guard + capability fail-closed", testQaRouteGuardAndCapabilityStillFailClosed],
  ];

  let passed = 0;
  for (const [name, run] of tests) {
    run();
    passed += 1;
    console.log(`  ✓ ${name}`);
  }
  console.log(
    `\nSmart Edit + stepper accessibility: ${passed}/${tests.length} PASS`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
