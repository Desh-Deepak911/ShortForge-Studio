/**
 * Sprint 8E.1A — Scene Media local evidence harness (tri-state coherence).
 * Run: npm run test:scene-media-local-evidence
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ARTIFACT_AUTOMATIC_CHECK_KEYS,
  ARTIFACT_VISUAL_CHECK_KEYS,
  assertPreparedManifestForSceneMediaQa,
  assertSafeEvidenceReport,
  buildArtifactPlaybackCheckpoints,
  buildSafeSceneMediaEvidenceReport,
  collectFailedEvidenceKeys,
  compareArtifactDuration,
  createChecklistWithResult,
  createEmptyChecklist,
  deriveArtifactEvidenceResult,
  deriveEditorEvidenceResult,
  derivePreviewEvidenceResult,
  EDITOR_CHECK_KEYS,
  EMPTY_ARTIFACT_AUTOMATIC_CHECKS,
  mapStructuralValidationToGenerationState,
  PREVIEW_CHECK_KEYS,
  type ArtifactAutomaticChecks,
  type ArtifactVisualCheckKey,
  type ChecklistState,
  type EditorCheckKey,
  type EvidenceCheckResult,
  type PreviewCheckKey,
} from "@/features/scene-media-timeline/qa/scene-media-local-evidence";
import {
  EXPORT_MANIFEST_VERSION,
  EXPORT_RENDERER_CONTRACT_VERSION,
} from "@/features/export/domain";
import { resolveFinalArtifactDurationPolicy } from "@/features/export/formats";

function withResult<T extends string>(
  keys: readonly T[],
  result: EvidenceCheckResult,
): ChecklistState<T> {
  return createChecklistWithResult(keys, result);
}

function patchChecklist<T extends string>(
  base: ChecklistState<T>,
  patch: Partial<ChecklistState<T>>,
): ChecklistState<T> {
  return { ...base, ...patch };
}

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const AUTO_PASS: ArtifactAutomaticChecks = withResult(
  ARTIFACT_AUTOMATIC_CHECK_KEYS,
  "pass",
);
const VISUAL_PASS = withResult<ArtifactVisualCheckKey>(
  ARTIFACT_VISUAL_CHECK_KEYS,
  "pass",
);
const PREVIEW_PASS = withResult<PreviewCheckKey>(PREVIEW_CHECK_KEYS, "pass");
const EDITOR_PASS = withResult<EditorCheckKey>(EDITOR_CHECK_KEYS, "pass");

console.log("\nscene-media-local-evidence-harness (Sprint 8E.1A)\n");

test("1. Initial automatic state derives Not tested", () => {
  assert.equal(
    deriveArtifactEvidenceResult({
      automatic: EMPTY_ARTIFACT_AUTOMATIC_CHECKS,
      visual: createEmptyChecklist(ARTIFACT_VISUAL_CHECK_KEYS),
      hardFailure: false,
    }),
    "not-tested",
  );
});

test("2. Reset state derives Not tested", () => {
  const resetAuto = createEmptyChecklist(ARTIFACT_AUTOMATIC_CHECK_KEYS);
  const resetVisual = createEmptyChecklist(ARTIFACT_VISUAL_CHECK_KEYS);
  const resetPreview = createEmptyChecklist(PREVIEW_CHECK_KEYS);
  const resetEditor = createEmptyChecklist(EDITOR_CHECK_KEYS);
  assert.equal(
    deriveArtifactEvidenceResult({
      automatic: resetAuto,
      visual: resetVisual,
      hardFailure: false,
    }),
    "not-tested",
  );
  assert.equal(derivePreviewEvidenceResult(resetPreview), "not-tested");
  assert.equal(deriveEditorEvidenceResult(resetEditor), "not-tested");
  for (const key of ARTIFACT_AUTOMATIC_CHECK_KEYS) {
    assert.equal(resetAuto[key], "not-tested");
  }
});

test("3. Preparing/rendering with incomplete checks derives Not tested", () => {
  const preparing: ArtifactAutomaticChecks = {
    ...EMPTY_ARTIFACT_AUTOMATIC_CHECKS,
  };
  assert.equal(
    deriveArtifactEvidenceResult({
      automatic: preparing,
      visual: createEmptyChecklist(ARTIFACT_VISUAL_CHECK_KEYS),
      hardFailure: false,
    }),
    "not-tested",
  );
  // Structural validation Pass alone — duration/visual still not-tested.
  const afterStructural: ArtifactAutomaticChecks = {
    preflightApproved: "pass",
    exactPreparedManifestRendered: "pass",
    rendererCompleted: "pass",
    artifactNonEmpty: "pass",
    structuralValidationPassed: "pass",
    durationWithinTolerance: "not-tested",
  };
  assert.equal(
    deriveArtifactEvidenceResult({
      automatic: afterStructural,
      visual: createEmptyChecklist(ARTIFACT_VISUAL_CHECK_KEYS),
      hardFailure: false,
    }),
    "not-tested",
  );
});

test("4. A hard automatic failure derives Fail", () => {
  assert.equal(
    deriveArtifactEvidenceResult({
      automatic: patchChecklist(AUTO_PASS, {
        preflightApproved: "fail",
      }),
      visual: VISUAL_PASS,
      hardFailure: false,
    }),
    "fail",
  );
  assert.equal(
    deriveArtifactEvidenceResult({
      automatic: AUTO_PASS,
      visual: VISUAL_PASS,
      hardFailure: true,
    }),
    "fail",
  );
});

test("5. An explicit Preview failure derives Fail", () => {
  const preview = patchChecklist(PREVIEW_PASS, {
    noBlankSwitchingFrame: "fail",
  });
  assert.equal(derivePreviewEvidenceResult(preview), "fail");
});

test("6. An explicit artifact visual failure derives Fail", () => {
  assert.equal(
    deriveArtifactEvidenceResult({
      automatic: AUTO_PASS,
      visual: patchChecklist(VISUAL_PASS, {
        correctBoundarySwitch: "fail",
      }),
      hardFailure: false,
    }),
    "fail",
  );
});

test("7. An explicit editor failure derives Fail", () => {
  assert.equal(
    deriveEditorEvidenceResult(
      patchChecklist(EDITOR_PASS, { append: "fail" }),
    ),
    "fail",
  );
});

test("8. Partial Pass plus remaining Not tested derives Not tested", () => {
  const partialPreview = patchChecklist(
    createEmptyChecklist(PREVIEW_CHECK_KEYS),
    {
      itemABeforeBoundary: "pass",
      itemBAtOrAfterBoundary: "pass",
    },
  );
  assert.equal(derivePreviewEvidenceResult(partialPreview), "not-tested");

  const partialVisual = patchChecklist(
    createEmptyChecklist(ARTIFACT_VISUAL_CHECK_KEYS),
    {
      bothItemsVisibleInOrder: "pass",
    },
  );
  assert.equal(
    deriveArtifactEvidenceResult({
      automatic: AUTO_PASS,
      visual: partialVisual,
      hardFailure: false,
    }),
    "not-tested",
  );

  const partialEditor = patchChecklist(
    createEmptyChecklist(EDITOR_CHECK_KEYS),
    { append: "pass", reorder: "pass" },
  );
  assert.equal(deriveEditorEvidenceResult(partialEditor), "not-tested");
});

test("9. Every required check Pass derives Pass", () => {
  assert.equal(
    deriveArtifactEvidenceResult({
      automatic: AUTO_PASS,
      visual: VISUAL_PASS,
      hardFailure: false,
    }),
    "pass",
  );
  assert.equal(derivePreviewEvidenceResult(PREVIEW_PASS), "pass");
  assert.equal(deriveEditorEvidenceResult(EDITOR_PASS), "pass");
});

test("10. Unknown duration remains Not tested", () => {
  const expected = 6400;
  const unknown = compareArtifactDuration(expected, null);
  assert.equal(unknown.result, "not-tested");
  assert.equal(
    deriveArtifactEvidenceResult({
      automatic: patchChecklist(AUTO_PASS, {
        durationWithinTolerance: "not-tested",
      }),
      visual: VISUAL_PASS,
      hardFailure: false,
    }),
    "not-tested",
  );
});

test("11. Out-of-tolerance duration derives Fail", () => {
  const expected = 6400;
  const policy = resolveFinalArtifactDurationPolicy(expected);
  const outside = compareArtifactDuration(
    expected,
    (expected + policy.toleranceMs + 500) / 1000,
  );
  assert.equal(outside.result, "fail");
  assert.equal(
    deriveArtifactEvidenceResult({
      automatic: patchChecklist(AUTO_PASS, {
        durationWithinTolerance: "fail",
      }),
      visual: VISUAL_PASS,
      hardFailure: false,
    }),
    "fail",
  );
});

test("12. Fixture change/reset clears prior Pass/Fail observations", () => {
  const priorPreview = patchChecklist(PREVIEW_PASS, {
    captionsContinuous: "fail",
  });
  const priorEditor = patchChecklist(EDITOR_PASS, { remove: "fail" });
  const priorVisual = patchChecklist(VISUAL_PASS, {
    bothItemsVisibleInOrder: "fail",
  });
  assert.equal(derivePreviewEvidenceResult(priorPreview), "fail");
  assert.equal(deriveEditorEvidenceResult(priorEditor), "fail");

  const clearedPreview = createEmptyChecklist(PREVIEW_CHECK_KEYS);
  const clearedEditor = createEmptyChecklist(EDITOR_CHECK_KEYS);
  const clearedVisual = createEmptyChecklist(ARTIFACT_VISUAL_CHECK_KEYS);
  const clearedAuto = createEmptyChecklist(ARTIFACT_AUTOMATIC_CHECK_KEYS);

  assert.equal(derivePreviewEvidenceResult(clearedPreview), "not-tested");
  assert.equal(deriveEditorEvidenceResult(clearedEditor), "not-tested");
  assert.equal(
    deriveArtifactEvidenceResult({
      automatic: clearedAuto,
      visual: clearedVisual,
      hardFailure: false,
    }),
    "not-tested",
  );
  assert.notDeepEqual(priorPreview, clearedPreview);
  assert.notDeepEqual(priorVisual, clearedVisual);

  const page = readSrc("src/app/dev/scene-media-qa/page.tsx");
  assert.match(page, /resetEvidence\(\)/);
  assert.match(
    page,
    /onChange=\{\(e\) => \{\s*setGoldenId[\s\S]*?resetEvidence\(\)/,
  );
});

test("13. Safe reports preserve tri-state results", () => {
  const preview = patchChecklist(PREVIEW_PASS, {
    noBlankSwitchingFrame: "fail",
  });
  const visual = createEmptyChecklist(ARTIFACT_VISUAL_CHECK_KEYS);
  const report = buildSafeSceneMediaEvidenceReport({
    timestampIso: "2026-07-15T00:00:00.000Z",
    browserName: "Chrome",
    goldenId: "sm-two-equal-images",
    renderedFingerprint: "fp-tri-state",
    manifestVersion: EXPORT_MANIFEST_VERSION,
    rendererContractVersion: EXPORT_RENDERER_CONTRACT_VERSION,
    itemWindows: [],
    artifact: {
      filename: "story.webm",
      mimeType: "video/webm",
      byteSize: 10,
      generationState: "awaiting-visual-review",
    },
    duration: compareArtifactDuration(6400, null),
    previewChecks: preview,
    artifactAutomatic: EMPTY_ARTIFACT_AUTOMATIC_CHECKS,
    artifactVisual: visual,
    editorChecks: createEmptyChecklist(EDITOR_CHECK_KEYS),
    previewResult: "fail",
    artifactResult: "not-tested",
    editorResult: "not-tested",
  });
  assert.match(report, /noBlankSwitchingFrame: fail/);
  assert.match(report, /itemABeforeBoundary: pass/);
  assert.match(report, /preflightApproved: not-tested/);
  assert.match(report, /Derived Preview: fail/);
  assert.match(report, /Derived Artifact: not-tested/);
  // Checklist lines must use tri-state tokens, not boolean yes/no.
  assert.doesNotMatch(report, /^-[^:\n]+: yes$/m);
  assert.doesNotMatch(report, /^-[^:\n]+: no$/m);
  assert.match(report, /preview\.noBlankSwitchingFrame/);
  assert.equal(assertSafeEvidenceReport(report).length, 0);
  assert.ok(
    collectFailedEvidenceKeys({
      previewChecks: preview,
      artifactAutomatic: EMPTY_ARTIFACT_AUTOMATIC_CHECKS,
      artifactVisual: visual,
      editorChecks: createEmptyChecklist(EDITOR_CHECK_KEYS),
    }).includes("preview.noBlankSwitchingFrame"),
  );
});

test("14. No code path turns structural validation alone into Pass", () => {
  assert.equal(
    mapStructuralValidationToGenerationState(true),
    "awaiting-visual-review",
  );
  assert.equal(
    deriveArtifactEvidenceResult({
      automatic: {
        preflightApproved: "pass",
        exactPreparedManifestRendered: "pass",
        rendererCompleted: "pass",
        artifactNonEmpty: "pass",
        structuralValidationPassed: "pass",
        durationWithinTolerance: "not-tested",
      },
      visual: createEmptyChecklist(ARTIFACT_VISUAL_CHECK_KEYS),
      hardFailure: false,
    }),
    "not-tested",
  );
  assert.equal(
    mapStructuralValidationToGenerationState(true) === "awaiting-visual-review" &&
      deriveArtifactEvidenceResult({
        automatic: AUTO_PASS,
        visual: createEmptyChecklist(ARTIFACT_VISUAL_CHECK_KEYS),
        hardFailure: false,
      }) !== "pass",
    true,
  );
});

test("Page uses production export path + tri-state controls + object URL revoke", () => {
  const page = readSrc("src/app/dev/scene-media-qa/page.tsx");
  assert.match(page, /exportFootieShortFromManifest/);
  assert.match(page, /prepareExportRequest/);
  const prepareCall = page.match(
    /prepareExportRequest\(\{[\s\S]*?throwIfBlocked:\s*true,\s*\}\)/,
  );
  assert.ok(prepareCall, "expected prepareExportRequest call site");
  assert.doesNotMatch(prepareCall[0]!, /multiImageScenesEnabled/);
  assert.match(page, /multi-image scenes \(default\)|multi-image \(default\)/i);
  assert.doesNotMatch(page, /isMultiImageScenesEnabled|Feature gate OFF/);
  assert.match(page, /URL\.revokeObjectURL/);
  assert.match(page, /EvidenceCheckResult/);
  assert.match(page, /role="radiogroup"/);
  assert.match(page, /EMPTY_ARTIFACT_AUTOMATIC_CHECKS/);
  assert.match(page, /awaiting-visual-review/);
  assert.doesNotMatch(page, /setLocalArtifact\(\s*["']pass["']\s*\)/);
  assert.match(page, /NODE_ENV === ["']production["']/);
  const download = readSrc("src/features/export/utils/download.utils.ts");
  assert.match(download, /exportDownloadCaptureHandler\?\.\(blob, filename\)/);
  assert.match(download, /anchor\.download/);
});

test("Playback checkpoints and prepared-manifest assertions still hold", () => {
  const points = buildArtifactPlaybackCheckpoints(0, [
    { id: "a", startOffsetMs: 0, endOffsetMs: 3000, durationMs: 3000 },
    { id: "b", startOffsetMs: 3000, endOffsetMs: 6000, durationMs: 3000 },
  ]);
  assert.equal(points.length, 5);
  assert.equal(points[2]!.seekMs, 3000);
  assert.equal(
    assertPreparedManifestForSceneMediaQa(
      {
        version: EXPORT_MANIFEST_VERSION,
        rendererContractVersion: EXPORT_RENDERER_CONTRACT_VERSION,
        fingerprint: "fp",
        scenes: [
          { id: "scene-equal", mediaTimeline: { items: [{}, {}] } },
        ],
      },
      "scene-equal",
    ).length,
    0,
  );
});

console.log(`\n${passed} passed\n`);
