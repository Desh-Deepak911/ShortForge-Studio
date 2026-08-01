/**
 * Sprint 12B — typed timing entry (StudioNumberStepper draft/commit + panel wiring).
 * Run via: npm run test:mixed-media-scenes-12b
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  clampStepperCommitValue,
  formatStepperCanonicalDisplay,
  INITIAL_STEPPER_DRAFT_UI,
  isIncompleteNumericDraft,
  parseNumericDraftCommit,
  reduceStepperDraftUi,
  STUDIO_NUMBER_STEPPER_INVALID_GUIDANCE,
} from "@/components/ui/studio-number-stepper-draft";
import {
  appendMixedMediaSequenceItem,
  readMixedMediaSequenceItems,
  updateMixedMediaSequenceBoundary,
  updateMixedMediaSequenceItemDuration,
} from "@/features/mixed-media-scenes";
import type { FootieScene, SceneMedia } from "@/features/story/types";

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function imageMedia(url: string): SceneMedia {
  return { type: "image", url, source: "upload", fitMode: "cover" };
}

function twoItemScene(): FootieScene {
  let scene: FootieScene = {
    id: "timing-scene",
    start: 0,
    end: 10,
    duration: 10,
    startMs: 0,
    endMs: 10_000,
    durationMs: 10_000,
    subtitle: "Timing",
    narration: "Narration for typed timing entry tests lasting ten seconds.",
    media: imageMedia("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"),
  };
  scene = appendMixedMediaSequenceItem(scene, imageMedia("data:image/svg+xml,b"), {
    mixedMediaScenesEnabled: true,
    generateId: (() => {
      let n = 0;
      return () => `item-${++n}`;
    })(),
  }).scene;
  return scene;
}

function testDecimalTypingAndEnterHelpers(): void {
  assert.equal(isIncompleteNumericDraft(""), true);
  assert.equal(isIncompleteNumericDraft("2."), true);
  assert.equal(isIncompleteNumericDraft("2.5"), false);

  const parsed = parseNumericDraftCommit("2.5");
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value, 2.5);
  }

  const trailing = parseNumericDraftCommit("3.");
  assert.equal(trailing.ok, true);
  if (trailing.ok) {
    assert.equal(trailing.value, 3);
  }

  // Same path as panel: seconds → ms for boundary command.
  const scene = twoItemScene();
  const items = readMixedMediaSequenceItems(scene);
  const secondId = items[1]!.id;
  const commitSec = 2.5;
  const result = updateMixedMediaSequenceBoundary(
    scene,
    secondId,
    Math.round(commitSec * 1000),
    { mixedMediaScenesEnabled: true },
  );
  const after = readMixedMediaSequenceItems(result.scene);
  assert.equal(after[1]!.startOffsetMs, 2500);
  assert.equal(Number((after[1]!.startOffsetMs / 1000).toFixed(2)), 2.5);
}

function testBlurCommitPath(): void {
  const scene = twoItemScene();
  const items = readMixedMediaSequenceItems(scene);
  const secondId = items[1]!.id;
  // Blur commits through the same command as Enter / plus-minus.
  const result = updateMixedMediaSequenceBoundary(
    scene,
    secondId,
    Math.round(4.2 * 1000),
    { mixedMediaScenesEnabled: true },
  );
  const after = readMixedMediaSequenceItems(result.scene);
  assert.equal(after[1]!.startOffsetMs, 4200);
  assert.equal(after[0]!.durationMs + after[1]!.durationMs, 10_000);

  const stepper = readSrc("src/components/ui/StudioNumberStepper.tsx");
  assert.match(stepper, /onBlur=\{handleBlur\}/);
  assert.match(stepper, /commitDraft\(event\.currentTarget\.value\)/);
}

function testEscapeCancellationWiring(): void {
  const stepper = readSrc("src/components/ui/StudioNumberStepper.tsx");
  assert.match(stepper, /event\.key === ["']Escape["']/);
  assert.match(stepper, /type: ["']escape["']/);
  assert.match(stepper, /formatStepperCanonicalDisplay\(value\)/);
  // Escape must not invoke step/commit callbacks.
  const escapeBlock = stepper.match(
    /else if \(event\.key === ["']Escape["']\) \{[\s\S]*?\n      \}/,
  );
  assert.ok(escapeBlock, "expected Escape handler block");
  assert.doesNotMatch(escapeBlock[0]!, /onStepValue\(|typedCommit\?\.\(|onValueCommit\(/);
  assert.match(escapeBlock[0]!, /dispatchDraft/);
}

function testEmptyInvalidInputRecovery(): void {
  assert.equal(parseNumericDraftCommit("").ok, false);
  assert.equal(parseNumericDraftCommit("abc").ok, false);
  assert.equal(parseNumericDraftCommit("Infinity").ok, false);
  assert.equal(parseNumericDraftCommit("NaN").ok, false);
  const empty = parseNumericDraftCommit("");
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.equal(empty.reason, STUDIO_NUMBER_STEPPER_INVALID_GUIDANCE);
  }

  const sceneBefore = twoItemScene();
  const fingerprint = JSON.stringify(readMixedMediaSequenceItems(sceneBefore));
  // Invalid drafts never reach commands — sequence fingerprint unchanged.
  assert.equal(
    JSON.stringify(readMixedMediaSequenceItems(sceneBefore)),
    fingerprint,
  );

  const recovered = reduceStepperDraftUi(INITIAL_STEPPER_DRAFT_UI, {
    type: "commit",
    raw: "",
    canonical: "4.25",
  });
  assert.equal(recovered.invalidRecovery, true);
  assert.equal(recovered.state.guidance, STUDIO_NUMBER_STEPPER_INVALID_GUIDANCE);
  assert.equal(
    reduceStepperDraftUi(recovered.state, { type: "focus", canonical: "4.25" })
      .state.guidance,
    STUDIO_NUMBER_STEPPER_INVALID_GUIDANCE,
  );

  const stepper = readSrc("src/components/ui/StudioNumberStepper.tsx");
  assert.match(stepper, /StudioNumberStepperGuidance/);
  assert.match(stepper, /aria-invalid=\{guidance \? true/);
  assert.match(stepper, /Keep focus after invalid recovery/);
}

function testBoundaryClampFromTypedEquivalent(): void {
  const scene = twoItemScene();
  const secondId = readMixedMediaSequenceItems(scene)[1]!.id;
  // Typed extreme (near 0s) clamps via the real boundary command.
  const result = updateMixedMediaSequenceBoundary(scene, secondId, 0, {
    mixedMediaScenesEnabled: true,
  });
  assert.ok(result.warnings.some((w) => w.code === "boundary_clamped"));
  const after = readMixedMediaSequenceItems(result.scene);
  assert.ok(after[1]!.startOffsetMs >= 500);
  assert.equal(
    Number((after[1]!.startOffsetMs / 1000).toFixed(2)),
    after[1]!.startOffsetMs / 1000,
  );
  // Displayed canonical seconds match persisted ms.
  assert.equal(
    Math.round(Number((after[1]!.startOffsetMs / 1000).toFixed(2)) * 1000),
    after[1]!.startOffsetMs,
  );
}

function testDurationClampFromTypedEquivalent(): void {
  const scene = twoItemScene();
  const firstId = readMixedMediaSequenceItems(scene)[0]!.id;
  const result = updateMixedMediaSequenceItemDuration(scene, firstId, 20_000, {
    mixedMediaScenesEnabled: true,
  });
  assert.ok(result.warnings.some((w) => w.code === "duration_clamped"));
  const after = readMixedMediaSequenceItems(result.scene);
  assert.ok(after[0]!.durationMs < 20_000);
  assert.equal(
    after[0]!.durationMs + after[1]!.durationMs,
    10_000,
  );
  assert.equal(
    Number((after[0]!.durationMs / 1000).toFixed(2)),
    Number((after[0]!.durationMs / 1000).toFixed(2)),
  );
}

function testFirstItemStartReadOnly(): void {
  const panel = readSrc(
    "src/features/mixed-media-scenes/editor/MixedMediaSequencePanel.tsx",
  );
  assert.match(panel, /data-mixed-media-first-start-fixed/);
  assert.match(panel, /Start \(fixed\)/);
  assert.match(panel, /0\.00/);
  // First item must not mount a boundary stepper.
  assert.match(
    panel,
    /index === 0 \?[\s\S]*data-mixed-media-first-start-fixed[\s\S]*:[\s\S]*StudioNumberStepper/,
  );

  const scene = twoItemScene();
  const firstId = readMixedMediaSequenceItems(scene)[0]!.id;
  const locked = updateMixedMediaSequenceBoundary(scene, firstId, 1500, {
    mixedMediaScenesEnabled: true,
  });
  assert.ok(locked.warnings.some((w) => w.code === "first_item_start_fixed"));
  assert.equal(readMixedMediaSequenceItems(locked.scene)[0]!.startOffsetMs, 0);
}

function testPersistedMatchesDisplayedCanonical(): void {
  const scene = twoItemScene();
  const secondId = readMixedMediaSequenceItems(scene)[1]!.id;
  const typedSec = 3.3;
  const result = updateMixedMediaSequenceBoundary(
    scene,
    secondId,
    Math.round(typedSec * 1000),
    { mixedMediaScenesEnabled: true },
  );
  const item = readMixedMediaSequenceItems(result.scene)[1]!;
  const displayed = Number((item.startOffsetMs / 1000).toFixed(2));
  assert.equal(Math.round(displayed * 1000), item.startOffsetMs);
  assert.equal(formatStepperCanonicalDisplay(displayed), String(displayed));
}

function testPlusMinusSteppingNoRegression(): void {
  const stepper = readSrc("src/components/ui/StudioNumberStepper.tsx");
  assert.match(stepper, /onStepValue/);
  assert.match(stepper, /applyStep\(-1\)/);
  assert.match(stepper, /applyStep\(1\)/);
  assert.match(stepper, /onMouseDown/);

  // Stepper bound clamp matches prior +/- semantics.
  assert.equal(clampStepperCommitValue(2.4, 0.5, 10), 2.4);
  assert.equal(clampStepperCommitValue(0.1, 0.5, 10), 0.5);
  assert.equal(clampStepperCommitValue(99, 0.5, 10), 10);

  const scene = twoItemScene();
  const secondId = readMixedMediaSequenceItems(scene)[1]!.id;
  const before = readMixedMediaSequenceItems(scene)[1]!.startOffsetMs;
  // One +0.1s step equivalent.
  const stepped = updateMixedMediaSequenceBoundary(
    scene,
    secondId,
    before + 100,
    { mixedMediaScenesEnabled: true },
  );
  assert.equal(
    readMixedMediaSequenceItems(stepped.scene)[1]!.startOffsetMs,
    before + 100,
  );
}

function testNoControlledInputReactWarningWiring(): void {
  const stepper = readSrc("src/components/ui/StudioNumberStepper.tsx");
  // Controlled value always paired with an onChange handler (never read-only trap).
  assert.match(stepper, /value=\{displayValue\}/);
  assert.match(stepper, /onChange=\{\(event\) => \{/);
  assert.doesNotMatch(stepper, /readOnly/);
  assert.match(stepper, /managesInternalDraft/);
  assert.match(stepper, /usesExternalOnChange/);

  const panel = readSrc(
    "src/features/mixed-media-scenes/editor/MixedMediaSequencePanel.tsx",
  );
  // Timing steppers omit onChange so StudioNumberStepper draft/commit owns typing.
  const boundaryStepper = panel.match(
    /data-mixed-media-boundary-start=\{item\.id\}[\s\S]*?\/>/,
  );
  const durationStepper = panel.match(
    /data-mixed-media-item-duration=\{item\.id\}[\s\S]*?\/>/,
  );
  assert.ok(boundaryStepper, "expected boundary stepper");
  assert.ok(durationStepper, "expected duration stepper");
  assert.doesNotMatch(boundaryStepper[0]!, /\bonChange=/);
  assert.doesNotMatch(durationStepper[0]!, /\bonChange=/);
  assert.match(panel, /onStepValue=\{\(next\) => \{/);
  assert.match(panel, /updateMixedMediaSequenceBoundary/);
  assert.match(panel, /updateMixedMediaSequenceItemDuration/);
}

function testBackwardCompatibleExternalOnChangePreserved(): void {
  const stepper = readSrc("src/components/ui/StudioNumberStepper.tsx");
  assert.match(stepper, /usesExternalOnChange/);
  assert.match(stepper, /onChange\?\.\(event\)/);

  // Existing consumers still pass onChange + onStepValue.
  const sceneInspector = readSrc(
    "src/features/editor/components/StudioSceneInspector.tsx",
  );
  assert.match(sceneInspector, /onChange=\{\(event\) => \{/);
  assert.match(sceneInspector, /onStepValue=\{\(duration\) =>/);

  const createBrief = readSrc(
    "src/features/create/components/CreateBriefInspector.tsx",
  );
  assert.match(createBrief, /onChange=\{\(event\) => \{/);
  assert.match(createBrief, /onStepValue=\{onSceneCountChange\}/);

  const videoInspector = readSrc(
    "src/features/editor/components/media/SceneVideoInspector.tsx",
  );
  assert.match(videoInspector, /onChange=\{\(event\) => \{/);
  assert.match(videoInspector, /onStepValue=\{\(seconds\) => \{/);
}

async function main(): Promise<void> {
  const tests: Array<[string, () => void]> = [
    ["decimal typing and Enter", testDecimalTypingAndEnterHelpers],
    ["blur commit", testBlurCommitPath],
    ["Escape cancellation", testEscapeCancellationWiring],
    ["empty/invalid input recovery", testEmptyInvalidInputRecovery],
    ["boundary clamp", testBoundaryClampFromTypedEquivalent],
    ["duration clamp", testDurationClampFromTypedEquivalent],
    ["first-item start remains read-only", testFirstItemStartReadOnly],
    ["persisted values match displayed canonical", testPersistedMatchesDisplayedCanonical],
    ["no regression to plus/minus stepping", testPlusMinusSteppingNoRegression],
    ["no controlled-input React warning", testNoControlledInputReactWarningWiring],
    ["backward-compatible external onChange", testBackwardCompatibleExternalOnChangePreserved],
  ];

  let passed = 0;
  for (const [name, run] of tests) {
    run();
    passed += 1;
    console.log(`  ✓ ${name}`);
  }
  console.log(
    `\nSprint 12B mixed-media timing entry: ${passed}/${tests.length} PASS`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
