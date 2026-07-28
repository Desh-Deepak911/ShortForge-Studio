/**
 * Sprint 9D.1 — Intra-scene transition local evidence harness (behavioral).
 * Run: npm run test:intra-scene-transition-local-evidence
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EXPORT_MANIFEST_VERSION,
  EXPORT_RENDERER_CONTRACT_VERSION,
} from "@/features/export/domain";
import {
  assertPreparedManifestForIstQa,
  assertSafeIstEvidenceReport,
  buildSafeIstEvidenceReport,
  canMarkAudioContinuityPass,
  canMarkSceneToScenePrecedencePass,
  canMarkVideoContinuityPass,
  classifyIstSafeFailure,
  clearIstEvidenceLedger,
  collectFailedIstEvidenceKeys,
  compareArtifactDuration,
  createChecklistWithResult,
  createEmptyChecklist,
  createIstExportRunIdentity,
  deriveIstArtifactEvidenceResult,
  deriveIstCoreArtifactFromLedger,
  deriveIstCoreEditorFromLedger,
  deriveIstCorePreviewEvidenceResult,
  deriveIstCorePreviewFromLedger,
  deriveIstEditorEvidenceResult,
  EMPTY_IST_ARTIFACT_AUTOMATIC_CHECKS,
  invalidateFixtureArtifactEvidence,
  isSemanticLocalVideoIdentity,
  isStaleIstExportRun,
  IST_ARTIFACT_AUTOMATIC_CHECK_KEYS,
  IST_CORE_ARTIFACT_VISUAL_CHECK_KEYS,
  IST_CORE_PREVIEW_CHECK_KEYS,
  IST_EDITOR_CHECK_KEYS,
  IST_OPTIONAL_PREVIEW_CHECK_KEYS,
  mapStructuralValidationToGenerationState,
  resolveCheckAcrossFixtures,
  resolveExactPreparedManifestRendered,
  upsertIstEvidenceRecord,
  type ChecklistState,
  type EvidenceCheckResult,
  type IstArtifactAutomaticChecks,
  type IstCorePreviewCheckKey,
  type IstEvidenceLedger,
} from "@/features/scene-media-transitions/qa/intra-scene-transition-local-evidence";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function withResult<T extends string>(
  keys: readonly T[],
  result: EvidenceCheckResult,
): ChecklistState<T> {
  return createChecklistWithResult(keys, result);
}

function fillCorePreview(result: EvidenceCheckResult): ChecklistState<IstCorePreviewCheckKey> {
  return withResult(IST_CORE_PREVIEW_CHECK_KEYS, result);
}

function fillCoreLedger(
  fixtureId: string,
  result: EvidenceCheckResult,
): IstEvidenceLedger {
  let ledger: IstEvidenceLedger = [];
  for (const key of IST_CORE_PREVIEW_CHECK_KEYS) {
    ledger = upsertIstEvidenceRecord(ledger, {
      checkId: key,
      fixtureId,
      category: "preview-core",
      result,
    });
  }
  for (const key of IST_ARTIFACT_AUTOMATIC_CHECK_KEYS) {
    ledger = upsertIstEvidenceRecord(ledger, {
      checkId: key,
      fixtureId,
      category: "artifact-automatic",
      result,
    });
  }
  for (const key of IST_CORE_ARTIFACT_VISUAL_CHECK_KEYS) {
    ledger = upsertIstEvidenceRecord(ledger, {
      checkId: key,
      fixtureId,
      category: "artifact-visual-core",
      result,
    });
  }
  for (const key of IST_EDITOR_CHECK_KEYS) {
    ledger = upsertIstEvidenceRecord(ledger, {
      checkId: key,
      fixtureId,
      category: "editor-core",
      result,
    });
  }
  return ledger;
}

console.log("\nintra-scene-transition-local-evidence-harness (Sprint 9D.1)\n");

test("Silent export cannot satisfy audio continuity", () => {
  assert.equal(
    canMarkAudioContinuityPass({ audioMode: "silent", hasAudibleStem: false }),
    false,
  );
  assert.equal(
    canMarkAudioContinuityPass({ audioMode: "voice", hasAudibleStem: true }),
    true,
  );
});

test("Semantic local:// video cannot satisfy video continuity", () => {
  assert.equal(isSemanticLocalVideoIdentity("local://clip-a"), true);
  assert.equal(
    canMarkVideoContinuityPass({
      mediaUrls: ["local://clip-a", "local://clip-b"],
      videoPlayable: true,
    }),
    false,
  );
  assert.equal(
    canMarkVideoContinuityPass({
      mediaUrls: ["blob:opaque"],
      videoPlayable: true,
    }),
    true,
  );
  assert.equal(
    canMarkVideoContinuityPass({
      mediaUrls: ["blob:opaque"],
      videoPlayable: false,
    }),
    false,
  );
});

test("Non-full Preview surface cannot satisfy precedence", () => {
  assert.equal(
    canMarkSceneToScenePrecedencePass({
      previewSurface: "scene-backdrop-only",
    }),
    false,
  );
  assert.equal(
    canMarkSceneToScenePrecedencePass({
      previewSurface: "full-preview-composition",
    }),
    true,
  );
});

test("Optional Not tested does not block core Pass", () => {
  const ledger = fillCoreLedger("ist-fade", "pass");
  assert.equal(deriveIstCorePreviewFromLedger(ledger), "pass");
  assert.equal(deriveIstCoreArtifactFromLedger(ledger), "pass");
  assert.equal(deriveIstCoreEditorFromLedger(ledger), "pass");
  // Optional video remains not-tested on ledger — core still Pass.
  assert.equal(
    resolveCheckAcrossFixtures(
      ledger,
      "preview-optional",
      "videoContinuityAcceptable",
    ).result,
    "not-tested",
  );
});

test("Required Not tested prevents core Pass", () => {
  let ledger = fillCoreLedger("ist-fade", "pass");
  ledger = upsertIstEvidenceRecord(ledger, {
    checkId: "captionsRemainVisible",
    fixtureId: "ist-fade",
    category: "preview-core",
    result: "not-tested",
  });
  assert.equal(deriveIstCorePreviewFromLedger(ledger), "not-tested");
});

test("Cross-fixture evidence accumulation", () => {
  let ledger: IstEvidenceLedger = [];
  ledger = upsertIstEvidenceRecord(ledger, {
    checkId: "correctMediaSwitch",
    fixtureId: "ist-fade",
    category: "preview-core",
    result: "pass",
  });
  ledger = upsertIstEvidenceRecord(ledger, {
    checkId: "effectMatchesSelection",
    fixtureId: "ist-blur",
    category: "preview-core",
    result: "pass",
  });
  assert.equal(
    resolveCheckAcrossFixtures(ledger, "preview-core", "correctMediaSwitch")
      .provingFixtureId,
    "ist-fade",
  );
  assert.equal(
    resolveCheckAcrossFixtures(ledger, "preview-core", "effectMatchesSelection")
      .provingFixtureId,
    "ist-blur",
  );
  // Switching active fixture conceptually does not clear the other.
  assert.equal(ledger.length, 2);
});

test("Fixture-specific artifact invalidation", () => {
  let ledger = fillCoreLedger("ist-fade", "pass");
  ledger = upsertIstEvidenceRecord(ledger, {
    checkId: "transitionVisibleInArtifact",
    fixtureId: "ist-slide-left",
    category: "artifact-visual-core",
    result: "pass",
  });
  ledger = invalidateFixtureArtifactEvidence(ledger, "ist-fade");
  assert.equal(
    resolveCheckAcrossFixtures(
      ledger,
      "artifact-visual-core",
      "transitionVisibleInArtifact",
    ).result,
    "pass",
  );
  assert.equal(
    resolveCheckAcrossFixtures(
      ledger,
      "artifact-visual-core",
      "noBlackOrStaleFrame",
    ).result,
    "not-tested",
  );
  // Preview evidence for ist-fade remains.
  assert.equal(
    resolveCheckAcrossFixtures(ledger, "preview-core", "correctMediaSwitch")
      .result,
    "pass",
  );
});

test("Reset All clears ledger", () => {
  let ledger = fillCoreLedger("ist-fade", "pass");
  ledger = clearIstEvidenceLedger();
  assert.equal(ledger.length, 0);
  assert.equal(deriveIstCorePreviewFromLedger(ledger), "not-tested");
});

test("Stale export completion discarded", () => {
  const run1 = createIstExportRunIdentity({
    fixtureId: "ist-fade",
    sequence: 1,
    fingerprint: "em:a",
  });
  const run2 = createIstExportRunIdentity({
    fixtureId: "ist-fade",
    sequence: 2,
    fingerprint: "em:b",
  });
  assert.equal(isStaleIstExportRun(run2, run1), true);
  assert.equal(isStaleIstExportRun(run2, run2), false);
  assert.equal(isStaleIstExportRun(null, run1), true);
  assert.equal(classifyIstSafeFailure("stale"), "stale_run_discarded");
});

test("exactPreparedManifestRendered only after successful render", () => {
  assert.equal(
    resolveExactPreparedManifestRendered({
      prepareCompleted: true,
      exportInvokedWithPrepared: false,
      renderCompleted: false,
      artifactCapturedForRun: false,
      artifactNonEmpty: false,
      oneTerminalOutcome: false,
      stale: false,
    }),
    "not-tested",
  );
  assert.equal(
    resolveExactPreparedManifestRendered({
      prepareCompleted: true,
      exportInvokedWithPrepared: true,
      renderCompleted: true,
      artifactCapturedForRun: true,
      artifactNonEmpty: true,
      oneTerminalOutcome: true,
      stale: false,
    }),
    "pass",
  );
  assert.equal(
    resolveExactPreparedManifestRendered({
      prepareCompleted: true,
      exportInvokedWithPrepared: true,
      renderCompleted: true,
      artifactCapturedForRun: true,
      artifactNonEmpty: false,
      oneTerminalOutcome: true,
      stale: false,
    }),
    "fail",
  );
});

test("One terminal artifact outcome + empty Fail", () => {
  const auto = {
    ...EMPTY_IST_ARTIFACT_AUTOMATIC_CHECKS,
    preflightApproved: "pass" as const,
    exactPreparedManifestRendered: "fail" as const,
    rendererCompleted: "pass" as const,
    artifactNonEmpty: "fail" as const,
    oneTerminalExportOutcome: "pass" as const,
  };
  assert.equal(
    deriveIstArtifactEvidenceResult({
      automatic: auto,
      visual: createEmptyChecklist([
        ...IST_CORE_ARTIFACT_VISUAL_CHECK_KEYS,
        "audioRemainsContinuous",
      ]),
    }),
    "fail",
  );
});

test("Structural validation alone never becomes Artifact Pass", () => {
  assert.equal(
    mapStructuralValidationToGenerationState(true),
    "awaiting-visual-review",
  );
  assert.equal(
    deriveIstArtifactEvidenceResult({
      automatic: withResult(IST_ARTIFACT_AUTOMATIC_CHECK_KEYS, "pass"),
      visual: createEmptyChecklist([
        ...IST_CORE_ARTIFACT_VISUAL_CHECK_KEYS,
        "audioRemainsContinuous",
      ]),
    }),
    "not-tested",
  );
});

test("Safe report categorization and no URL/blob leakage", () => {
  let ledger = fillCoreLedger("ist-fade", "pass");
  ledger = upsertIstEvidenceRecord(ledger, {
    checkId: "videoContinuityAcceptable",
    fixtureId: "ist-fade",
    category: "preview-optional",
    result: "not-tested",
  });
  const report = buildSafeIstEvidenceReport({
    timestampIso: "2026-07-15T00:00:00.000Z",
    browserName: "Chrome",
    activeFixtureId: "ist-fade",
    renderedFingerprint: "em:abc",
    manifestVersion: EXPORT_MANIFEST_VERSION,
    rendererContractVersion: EXPORT_RENDERER_CONTRACT_VERSION,
    mediaItemIds: ["item-a", "item-b"],
    effect: "fade",
    requestedDurationMs: 500,
    effectiveDurationMs: 500,
    artifact: {
      filename: "story.webm",
      mimeType: "video/webm",
      byteSize: 12,
      generationState: "awaiting-visual-review",
    },
    duration: compareArtifactDuration(6400, null),
    ledger,
    corePreviewResult: "pass",
    coreArtifactResult: "pass",
    coreEditorResult: "pass",
    optionalVideoResult: "not-tested",
    optionalAudioResult: "not-tested",
    deviceMatrixResult: "not-tested",
    safeFailureCategory: "preflight_blocked",
    previewSurface: "scene-backdrop-only",
    audioMode: "silent",
  });
  assert.match(report, /Derived Core Preview: pass/);
  assert.match(report, /safeFailureCategory: preflight_blocked/);
  assert.match(report, /fixture=ist-fade/);
  assert.doesNotMatch(report, /blob:/i);
  assert.doesNotMatch(report, /local:\/\//i);
  assert.equal(assertSafeIstEvidenceReport(report).length, 0);

  const dirty = `${report}\nblob:http://localhost/abc`;
  assert.ok(assertSafeIstEvidenceReport(dirty).length > 0);
});

test("Any core Fail derives Fail; duration unknown stays Not tested", () => {
  assert.equal(
    deriveIstCorePreviewEvidenceResult({
      checks: {
        ...fillCorePreview("pass"),
        captionsRemainVisible: "fail",
      },
    }),
    "fail",
  );
  assert.equal(compareArtifactDuration(6400, null).result, "not-tested");
  assert.equal(classifyIstSafeFailure("duration_unknown"), "duration_unavailable");
});

test("Prepared manifest assertion + editor derivation unchanged", () => {
  assert.equal(
    assertPreparedManifestForIstQa(
      {
        version: EXPORT_MANIFEST_VERSION,
        rendererContractVersion: EXPORT_RENDERER_CONTRACT_VERSION,
        fingerprint: "em:test",
        scenes: [
          {
            id: "scene-fade",
            mediaTransitions: { boundaries: [{}] },
            mediaTimeline: { items: [{}, {}] },
          },
        ],
      },
      "scene-fade",
    ).length,
    0,
  );
  assert.equal(
    deriveIstEditorEvidenceResult({
      checks: withResult(IST_EDITOR_CHECK_KEYS, "pass"),
    }),
    "pass",
  );
  assert.ok(
    collectFailedIstEvidenceKeys({
      ledger: [
        {
          checkId: "effectMatchesSelection",
          fixtureId: "ist-fade",
          category: "preview-core",
          result: "fail",
        },
      ],
    }).includes("preview-core.effectMatchesSelection@ist-fade"),
  );
});

test("Core versus optional key sets are disjoint for freeze gating", () => {
  for (const key of IST_OPTIONAL_PREVIEW_CHECK_KEYS) {
    assert.equal(
      (IST_CORE_PREVIEW_CHECK_KEYS as readonly string[]).includes(key),
      false,
    );
  }
});

test("Dev QA page wires production export, ledger, gates, and Reset All", () => {
  const page = readSrc("src/app/dev/intra-scene-transition-qa/page.tsx");
  assert.match(page, /prepareExportRequest/);
  assert.match(page, /exportFootieShortFromManifest/);
  assert.match(page, /URL\.revokeObjectURL/);
  assert.match(page, /NODE_ENV === ["']production["']/);
  assert.match(page, /upsertIstEvidenceRecord|invalidateFixtureArtifactEvidence/);
  assert.match(page, /Reset All evidence/);
  assert.match(page, /resolveExactPreparedManifestRendered/);
  assert.match(page, /isStaleIstExportRun/);
  assert.match(page, /scene-backdrop-only/);
  assert.match(page, /audioMode: ["']silent["']|AUDIO_MODE = ["']silent["']/);
  assert.match(page, /canMarkVideoContinuityPass|canMarkAudioContinuityPass/);
  assert.match(page, /IST_EDITOR_OPERATOR_WORKFLOW/);
  assert.doesNotMatch(page, /multiImageScenesEnabled:\s*false/);
  // Must not set exactPreparedManifestRendered to pass before export invocation path.
  assert.match(page, /exportInvokedWithPrepared/);
});

console.log(`\n${passed} passed\n`);
