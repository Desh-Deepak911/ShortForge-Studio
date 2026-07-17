/**
 * Sprint 9D.1 — tri-state local-evidence derivation for intra-scene transition QA.
 *
 * Core freeze evidence is separated from optional capability evidence.
 * Structural validation alone ≠ Pass. Silent / local:// / backdrop-only
 * surfaces cannot satisfy optional video, audio, or scene-to-scene checks.
 */

import { resolveFinalArtifactDurationPolicy } from "@/features/export/formats";
import {
  EXPORT_MANIFEST_VERSION,
  EXPORT_RENDERER_CONTRACT_VERSION,
} from "@/features/export/domain/export-manifest.types";

export type EvidenceCheckResult = "not-tested" | "pass" | "fail";

export type LocalEvidenceResult = EvidenceCheckResult;

export type ArtifactGenerationState =
  | "idle"
  | "generated"
  | "validation-pass"
  | "validation-fail"
  | "awaiting-visual-review";

export type IstEvidenceCategory =
  | "preview-core"
  | "preview-optional"
  | "artifact-automatic"
  | "artifact-visual-core"
  | "artifact-visual-optional"
  | "editor-core"
  | "optional-video"
  | "optional-audio"
  | "device-matrix";

/** Core Preview — image harness can exercise these. */
export const IST_CORE_PREVIEW_CHECK_KEYS = [
  "correctMediaSwitch",
  "transitionStartsAtIncomingBoundary",
  "effectMatchesSelection",
  "noFlashRemountAtCompletion",
  "captionsRemainVisible",
] as const;

export type IstCorePreviewCheckKey = (typeof IST_CORE_PREVIEW_CHECK_KEYS)[number];

/**
 * Optional Preview / capability — not core-freeze blockers when Not tested.
 * videoContinuityAcceptable requires real playable video (not local://).
 * sceneToScenePrecedence requires full production Preview composition.
 */
export const IST_OPTIONAL_PREVIEW_CHECK_KEYS = [
  "videoContinuityAcceptable",
  "sceneToScenePrecedence",
] as const;

export type IstOptionalPreviewCheckKey =
  (typeof IST_OPTIONAL_PREVIEW_CHECK_KEYS)[number];

/** @deprecated Use IST_CORE_PREVIEW_CHECK_KEYS + IST_OPTIONAL_PREVIEW_CHECK_KEYS */
export const IST_PREVIEW_CHECK_KEYS = [
  ...IST_CORE_PREVIEW_CHECK_KEYS,
  ...IST_OPTIONAL_PREVIEW_CHECK_KEYS,
] as const;

export type IstPreviewCheckKey = (typeof IST_PREVIEW_CHECK_KEYS)[number];

export const IST_CORE_ARTIFACT_VISUAL_CHECK_KEYS = [
  "transitionVisibleInArtifact",
  "correctOutgoingIncomingMedia",
  "noBlackOrStaleFrame",
  "noUnexpectedCaptionDisappearance",
  "completionReturnsToIncoming",
] as const;

export type IstCoreArtifactVisualCheckKey =
  (typeof IST_CORE_ARTIFACT_VISUAL_CHECK_KEYS)[number];

/** Audible continuity — cannot Pass from silent export. */
export const IST_OPTIONAL_ARTIFACT_VISUAL_CHECK_KEYS = [
  "audioRemainsContinuous",
] as const;

export type IstOptionalArtifactVisualCheckKey =
  (typeof IST_OPTIONAL_ARTIFACT_VISUAL_CHECK_KEYS)[number];

/** @deprecated Prefer core + optional splits */
export const IST_ARTIFACT_VISUAL_CHECK_KEYS = [
  ...IST_CORE_ARTIFACT_VISUAL_CHECK_KEYS,
  ...IST_OPTIONAL_ARTIFACT_VISUAL_CHECK_KEYS,
] as const;

export type IstArtifactVisualCheckKey =
  (typeof IST_ARTIFACT_VISUAL_CHECK_KEYS)[number];

export const IST_EDITOR_CHECK_KEYS = [
  "transitionControlsVisiblyPresent",
  "noClippingAtMultiItemLayouts",
  "boundaryControlSelectsCorrectPair",
  "inspectorOpensAutomatically",
  "setChangeResetBoundary",
  "cutRemovesOnlySelectedBoundary",
  "multipleBoundariesIndependent",
  "effectDurationChangesCommit",
  "interactionLocksWork",
  "persistenceReloadWorks",
  "duplicatedScenesIndependentGraphs",
  "narrowLayoutUsable",
] as const;

export type IstEditorCheckKey = (typeof IST_EDITOR_CHECK_KEYS)[number];

export const IST_ARTIFACT_AUTOMATIC_CHECK_KEYS = [
  "preflightApproved",
  "exactPreparedManifestRendered",
  "rendererCompleted",
  "artifactNonEmpty",
  "expectedMimeContainer",
  "durationWithinTolerance",
  "manifestV3Contract9C",
  "oneTerminalExportOutcome",
] as const;

export type IstArtifactAutomaticCheckKey =
  (typeof IST_ARTIFACT_AUTOMATIC_CHECK_KEYS)[number];

export const IST_DEVICE_MATRIX_CHECK_KEYS = [
  "safari",
  "firefox",
  "export1080p",
  "deviceMultiVideo",
] as const;

export type IstDeviceMatrixCheckKey =
  (typeof IST_DEVICE_MATRIX_CHECK_KEYS)[number];

export const IST_EDITOR_OPERATOR_WORKFLOW: readonly string[] = [
  "Confirm transition chips are visible above media segments (not clipped) for 2/3/4 items.",
  "Select a boundary chip and confirm the Inspector Image/Media group opens with the pair.",
  "Set a boundary effect on an adjacent media pair.",
  "Change its requested duration and confirm it commits.",
  "Add a second independent boundary on another pair.",
  "Reset one boundary to Cut (absence).",
  "Confirm the sibling boundary remains.",
  "Exercise interaction locking (playback / exclusive owners block selection).",
  "Confirm narrow timeline width remains usable and keyboard-accessible.",
  "Reload the draft and confirm transitions persist.",
  "Duplicate the scene and edit one copy.",
  "Confirm the duplicate has an independent transition graph.",
] as const;

export type IstSafeFailureCategory =
  | "preflight_blocked"
  | "renderer_failed"
  | "artifact_empty"
  | "artifact_validation_failed"
  | "duration_unavailable"
  | "duration_out_of_tolerance"
  | "video_unplayable"
  | "stale_run_discarded";

export type ChecklistState<T extends string> = Record<T, EvidenceCheckResult>;

export function createEmptyChecklist<T extends readonly string[]>(
  keys: T,
): ChecklistState<T[number]> {
  return Object.fromEntries(
    keys.map((key) => [key, "not-tested" as const]),
  ) as ChecklistState<T[number]>;
}

export function createChecklistWithResult<T extends readonly string[]>(
  keys: T,
  result: EvidenceCheckResult,
): ChecklistState<T[number]> {
  return Object.fromEntries(keys.map((key) => [key, result])) as ChecklistState<
    T[number]
  >;
}

export type IstArtifactAutomaticChecks =
  ChecklistState<IstArtifactAutomaticCheckKey>;

export const EMPTY_IST_ARTIFACT_AUTOMATIC_CHECKS: IstArtifactAutomaticChecks =
  createEmptyChecklist(IST_ARTIFACT_AUTOMATIC_CHECK_KEYS);

export interface IstEvidenceRecord {
  readonly checkId: string;
  readonly fixtureId: string;
  readonly category: IstEvidenceCategory;
  readonly result: EvidenceCheckResult;
}

export type IstEvidenceLedger = readonly IstEvidenceRecord[];

export function evidenceRecordKey(
  category: IstEvidenceCategory,
  checkId: string,
  fixtureId: string,
): string {
  return `${category}::${checkId}::${fixtureId}`;
}

export function upsertIstEvidenceRecord(
  ledger: IstEvidenceLedger,
  record: IstEvidenceRecord,
): IstEvidenceLedger {
  const key = evidenceRecordKey(
    record.category,
    record.checkId,
    record.fixtureId,
  );
  const next = ledger.filter(
    (entry) =>
      evidenceRecordKey(entry.category, entry.checkId, entry.fixtureId) !== key,
  );
  return [...next, record];
}

export function clearIstEvidenceLedger(): IstEvidenceLedger {
  return [];
}

export function invalidateFixtureArtifactEvidence(
  ledger: IstEvidenceLedger,
  fixtureId: string,
): IstEvidenceLedger {
  return ledger.filter(
    (entry) =>
      !(
        entry.fixtureId === fixtureId &&
        (entry.category === "artifact-automatic" ||
          entry.category === "artifact-visual-core" ||
          entry.category === "artifact-visual-optional" ||
          entry.category === "optional-audio")
      ),
  );
}

export function resolveCheckAcrossFixtures(
  ledger: IstEvidenceLedger,
  category: IstEvidenceCategory,
  checkId: string,
): {
  readonly result: EvidenceCheckResult;
  readonly provingFixtureId: string | null;
} {
  const matches = ledger.filter(
    (entry) => entry.category === category && entry.checkId === checkId,
  );
  if (matches.some((entry) => entry.result === "fail")) {
    const failed = matches.find((entry) => entry.result === "fail")!;
    return { result: "fail", provingFixtureId: failed.fixtureId };
  }
  const passed = matches.find((entry) => entry.result === "pass");
  if (passed) {
    return { result: "pass", provingFixtureId: passed.fixtureId };
  }
  return { result: "not-tested", provingFixtureId: null };
}

function deriveFromResults(
  results: readonly EvidenceCheckResult[],
  hardFailure = false,
): LocalEvidenceResult {
  if (hardFailure) {
    return "fail";
  }
  if (results.some((value) => value === "fail")) {
    return "fail";
  }
  if (results.length > 0 && results.every((value) => value === "pass")) {
    return "pass";
  }
  return "not-tested";
}

function deriveFromChecklist(
  checks: Record<string, EvidenceCheckResult>,
  hardFailure = false,
): LocalEvidenceResult {
  return deriveFromResults(Object.values(checks), hardFailure);
}

export function deriveIstCorePreviewEvidenceResult(input: {
  readonly checks: ChecklistState<IstCorePreviewCheckKey>;
  readonly hardFailure?: boolean;
}): LocalEvidenceResult {
  return deriveFromChecklist(input.checks, input.hardFailure === true);
}

export function deriveIstOptionalVideoEvidenceResult(input: {
  readonly videoContinuity: EvidenceCheckResult;
  readonly hardFailure?: boolean;
}): LocalEvidenceResult {
  return deriveFromResults([input.videoContinuity], input.hardFailure === true);
}

export function deriveIstOptionalAudioEvidenceResult(input: {
  readonly audioContinuity: EvidenceCheckResult;
  readonly hardFailure?: boolean;
}): LocalEvidenceResult {
  return deriveFromResults([input.audioContinuity], input.hardFailure === true);
}

export function deriveIstDeviceMatrixEvidenceResult(input: {
  readonly checks: ChecklistState<IstDeviceMatrixCheckKey>;
  readonly hardFailure?: boolean;
}): LocalEvidenceResult {
  return deriveFromChecklist(input.checks, input.hardFailure === true);
}

/** Core Preview from ledger (cross-fixture). Optional keys ignored. */
export function deriveIstCorePreviewFromLedger(
  ledger: IstEvidenceLedger,
  hardFailure = false,
): LocalEvidenceResult {
  const results = IST_CORE_PREVIEW_CHECK_KEYS.map(
    (key) =>
      resolveCheckAcrossFixtures(ledger, "preview-core", key).result,
  );
  return deriveFromResults(results, hardFailure);
}

export function deriveIstCoreArtifactFromLedger(
  ledger: IstEvidenceLedger,
  hardFailure = false,
): LocalEvidenceResult {
  const automatic = IST_ARTIFACT_AUTOMATIC_CHECK_KEYS.map(
    (key) =>
      resolveCheckAcrossFixtures(ledger, "artifact-automatic", key).result,
  );
  const visual = IST_CORE_ARTIFACT_VISUAL_CHECK_KEYS.map(
    (key) =>
      resolveCheckAcrossFixtures(ledger, "artifact-visual-core", key).result,
  );
  return deriveFromResults([...automatic, ...visual], hardFailure);
}

export function deriveIstCoreEditorFromLedger(
  ledger: IstEvidenceLedger,
  hardFailure = false,
): LocalEvidenceResult {
  const results = IST_EDITOR_CHECK_KEYS.map(
    (key) => resolveCheckAcrossFixtures(ledger, "editor-core", key).result,
  );
  return deriveFromResults(results, hardFailure);
}

/** @deprecated Prefer deriveIstCorePreviewEvidenceResult / ledger helpers */
export function deriveIstPreviewEvidenceResult(input: {
  readonly checks: ChecklistState<IstPreviewCheckKey>;
  readonly hardFailure?: boolean;
}): LocalEvidenceResult {
  const core = Object.fromEntries(
    IST_CORE_PREVIEW_CHECK_KEYS.map((key) => [key, input.checks[key]]),
  ) as ChecklistState<IstCorePreviewCheckKey>;
  return deriveIstCorePreviewEvidenceResult({
    checks: core,
    hardFailure: input.hardFailure,
  });
}

export function deriveIstArtifactEvidenceResult(input: {
  readonly automatic: IstArtifactAutomaticChecks;
  readonly visual: ChecklistState<IstArtifactVisualCheckKey>;
  readonly hardFailure?: boolean;
}): LocalEvidenceResult {
  if (input.hardFailure) {
    return "fail";
  }
  const coreVisual = Object.fromEntries(
    IST_CORE_ARTIFACT_VISUAL_CHECK_KEYS.map((key) => [key, input.visual[key]]),
  ) as ChecklistState<IstCoreArtifactVisualCheckKey>;
  return deriveFromResults(
    [...Object.values(input.automatic), ...Object.values(coreVisual)],
    false,
  );
}

export function deriveIstEditorEvidenceResult(input: {
  readonly checks: ChecklistState<IstEditorCheckKey>;
  readonly hardFailure?: boolean;
}): LocalEvidenceResult {
  return deriveFromChecklist(input.checks, input.hardFailure === true);
}

export function mapStructuralValidationToGenerationState(
  structuralOk: boolean,
): ArtifactGenerationState {
  if (!structuralOk) {
    return "validation-fail";
  }
  return "awaiting-visual-review";
}

export interface DurationComparison {
  readonly expectedMs: number;
  readonly measuredMs: number | null;
  readonly deltaMs: number | null;
  readonly toleranceMs: number;
  readonly result: LocalEvidenceResult;
}

export function compareArtifactDuration(
  expectedDurationMs: number,
  measuredDurationSec: number | null | undefined,
): DurationComparison {
  const policy = resolveFinalArtifactDurationPolicy(expectedDurationMs);
  if (
    measuredDurationSec == null ||
    !Number.isFinite(measuredDurationSec) ||
    measuredDurationSec <= 0
  ) {
    return {
      expectedMs: expectedDurationMs,
      measuredMs: null,
      deltaMs: null,
      toleranceMs: policy.toleranceMs,
      result: "not-tested",
    };
  }
  const measuredMs = Math.round(measuredDurationSec * 1000);
  const deltaMs = Math.abs(measuredMs - expectedDurationMs);
  return {
    expectedMs: expectedDurationMs,
    measuredMs,
    deltaMs,
    toleranceMs: policy.toleranceMs,
    result: deltaMs <= policy.toleranceMs ? "pass" : "fail",
  };
}

export function assertPreparedManifestForIstQa(
  manifest: {
    readonly version: number;
    readonly rendererContractVersion: string;
    readonly scenes: readonly {
      readonly id: string;
      readonly mediaTransitions?: { readonly boundaries: readonly unknown[] };
      readonly mediaTimeline?: { readonly items: readonly unknown[] };
    }[];
    readonly fingerprint?: string;
  },
  primarySceneId: string,
): readonly string[] {
  const issues: string[] = [];
  if (manifest.version !== EXPORT_MANIFEST_VERSION) {
    issues.push(`version must be ${EXPORT_MANIFEST_VERSION}`);
  }
  if (manifest.rendererContractVersion !== EXPORT_RENDERER_CONTRACT_VERSION) {
    issues.push(
      `rendererContractVersion must be ${EXPORT_RENDERER_CONTRACT_VERSION}`,
    );
  }
  const scene = manifest.scenes.find((entry) => entry.id === primarySceneId);
  if (!scene) {
    issues.push(`primary scene ${primarySceneId} missing`);
  } else if (!scene.mediaTransitions) {
    issues.push("primary scene must include mediaTransitions on v3");
  }
  if (typeof manifest.fingerprint !== "string" || !manifest.fingerprint.trim()) {
    issues.push("fingerprint required");
  }
  return issues;
}

/** Semantic local:// identities cannot prove browser video playback. */
export function isSemanticLocalVideoIdentity(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith("local://");
}

export function canMarkVideoContinuityPass(input: {
  readonly mediaUrls: readonly (string | null | undefined)[];
  readonly videoPlayable: boolean;
}): boolean {
  if (!input.videoPlayable) {
    return false;
  }
  if (input.mediaUrls.some((url) => isSemanticLocalVideoIdentity(url))) {
    return false;
  }
  return true;
}

/** Silent export cannot prove audible continuity. */
export function canMarkAudioContinuityPass(input: {
  readonly audioMode: string | null | undefined;
  readonly hasAudibleStem: boolean;
}): boolean {
  if (input.audioMode === "silent" || !input.hasAudibleStem) {
    return false;
  }
  return true;
}

export type IstPreviewSurface =
  | "scene-backdrop-only"
  | "full-preview-composition";

/** Backdrop-only QA surface cannot prove scene-to-scene precedence. */
export function canMarkSceneToScenePrecedencePass(input: {
  readonly previewSurface: IstPreviewSurface;
}): boolean {
  return input.previewSurface === "full-preview-composition";
}

export interface IstExportRunIdentity {
  readonly runId: string;
  readonly fixtureId: string;
  readonly fingerprint: string | null;
}

export function createIstExportRunIdentity(input: {
  readonly fixtureId: string;
  readonly fingerprint?: string | null;
  readonly sequence: number;
}): IstExportRunIdentity {
  return {
    runId: `ist-export-${input.fixtureId}-${input.sequence}`,
    fixtureId: input.fixtureId,
    fingerprint: input.fingerprint ?? null,
  };
}

export function isStaleIstExportRun(
  active: IstExportRunIdentity | null,
  completing: IstExportRunIdentity,
): boolean {
  if (!active) {
    return true;
  }
  return active.runId !== completing.runId;
}

/**
 * exactPreparedManifestRendered may Pass only after successful render of the
 * exact prepared request with a captured non-empty artifact for this run.
 */
export function resolveExactPreparedManifestRendered(input: {
  readonly prepareCompleted: boolean;
  readonly exportInvokedWithPrepared: boolean;
  readonly renderCompleted: boolean;
  readonly artifactCapturedForRun: boolean;
  readonly artifactNonEmpty: boolean;
  readonly oneTerminalOutcome: boolean;
  readonly stale: boolean;
}): EvidenceCheckResult {
  if (input.stale) {
    return "not-tested";
  }
  if (!input.prepareCompleted) {
    return "not-tested";
  }
  if (
    !input.exportInvokedWithPrepared ||
    !input.renderCompleted ||
    !input.artifactCapturedForRun ||
    !input.oneTerminalOutcome
  ) {
    return "not-tested";
  }
  if (!input.artifactNonEmpty) {
    return "fail";
  }
  return "pass";
}

export function classifyIstSafeFailure(
  kind:
    | "preflight"
    | "renderer"
    | "empty"
    | "validation"
    | "duration_unknown"
    | "duration_bad"
    | "video_unplayable"
    | "stale",
): IstSafeFailureCategory {
  switch (kind) {
    case "preflight":
      return "preflight_blocked";
    case "renderer":
      return "renderer_failed";
    case "empty":
      return "artifact_empty";
    case "validation":
      return "artifact_validation_failed";
    case "duration_unknown":
      return "duration_unavailable";
    case "duration_bad":
      return "duration_out_of_tolerance";
    case "video_unplayable":
      return "video_unplayable";
    case "stale":
      return "stale_run_discarded";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function buildSafeIstEvidenceReport(input: {
  readonly timestampIso: string;
  readonly browserName: string;
  readonly activeFixtureId: string;
  readonly renderedFingerprint: string | null;
  readonly manifestVersion: number | null;
  readonly rendererContractVersion: string | null;
  readonly mediaItemIds: readonly string[];
  readonly effect: string | null;
  readonly requestedDurationMs: number | null;
  readonly effectiveDurationMs: number | null;
  readonly artifact: {
    readonly filename: string;
    readonly mimeType: string;
    readonly byteSize: number;
    readonly generationState: ArtifactGenerationState;
  } | null;
  readonly duration: DurationComparison;
  readonly ledger: IstEvidenceLedger;
  readonly corePreviewResult: LocalEvidenceResult;
  readonly coreArtifactResult: LocalEvidenceResult;
  readonly coreEditorResult: LocalEvidenceResult;
  readonly optionalVideoResult: LocalEvidenceResult;
  readonly optionalAudioResult: LocalEvidenceResult;
  readonly deviceMatrixResult: LocalEvidenceResult;
  readonly safeFailureCategory: IstSafeFailureCategory | null;
  readonly previewSurface: IstPreviewSurface;
  readonly audioMode: string;
}): string {
  const provingLines = (
    category: IstEvidenceCategory,
    keys: readonly string[],
  ): string[] =>
    keys.map((key) => {
      const resolved = resolveCheckAcrossFixtures(input.ledger, category, key);
      return `- ${category}.${key}: ${resolved.result}${
        resolved.provingFixtureId
          ? ` (fixture=${resolved.provingFixtureId})`
          : ""
      }`;
    });

  const lines = [
    "# Intra-scene transition local evidence (Sprint 9D.1)",
    `timestamp: ${input.timestampIso}`,
    `browser: ${input.browserName}`,
    `activeFixtureId: ${input.activeFixtureId}`,
    `manifestVersion: ${input.manifestVersion ?? "n/a"}`,
    `rendererContractVersion: ${input.rendererContractVersion ?? "n/a"}`,
    `fingerprint: ${input.renderedFingerprint ?? "n/a"}`,
    `mediaItemIds: ${input.mediaItemIds.join(", ") || "(none)"}`,
    `effect: ${input.effect ?? "n/a"}`,
    `requestedDurationMs: ${input.requestedDurationMs ?? "n/a"}`,
    `effectiveDurationMs: ${input.effectiveDurationMs ?? "n/a"}`,
    `previewSurface: ${input.previewSurface}`,
    `audioMode: ${input.audioMode}`,
    `safeFailureCategory: ${input.safeFailureCategory ?? "none"}`,
    "",
    "## Derived core results",
    `Derived Core Preview: ${input.corePreviewResult}`,
    `Derived Core Artifact: ${input.coreArtifactResult}`,
    `Derived Core Editor: ${input.coreEditorResult}`,
    "",
    "## Derived optional results (do not block core freeze when not-tested)",
    `Derived Optional Video: ${input.optionalVideoResult}`,
    `Derived Optional Audio: ${input.optionalAudioResult}`,
    `Derived Device Matrix: ${input.deviceMatrixResult}`,
    "",
    "## Core Preview checks",
    ...provingLines("preview-core", IST_CORE_PREVIEW_CHECK_KEYS),
    "",
    "## Optional Preview checks",
    ...provingLines("preview-optional", IST_OPTIONAL_PREVIEW_CHECK_KEYS),
    "",
    "## Artifact automatic",
    ...provingLines("artifact-automatic", IST_ARTIFACT_AUTOMATIC_CHECK_KEYS),
    "",
    "## Core Artifact visual",
    ...provingLines("artifact-visual-core", IST_CORE_ARTIFACT_VISUAL_CHECK_KEYS),
    "",
    "## Optional Artifact visual",
    ...provingLines(
      "artifact-visual-optional",
      IST_OPTIONAL_ARTIFACT_VISUAL_CHECK_KEYS,
    ),
    "",
    "## Editor checks",
    ...provingLines("editor-core", IST_EDITOR_CHECK_KEYS),
    "",
    "## Editor workflow",
    ...IST_EDITOR_OPERATOR_WORKFLOW.map((step, index) => `${index + 1}. ${step}`),
    "",
    "## Duration",
    `expectedMs: ${input.duration.expectedMs}`,
    `measuredMs: ${input.duration.measuredMs ?? "n/a"}`,
    `toleranceMs: ${input.duration.toleranceMs}`,
    `durationResult: ${input.duration.result}`,
  ];
  if (input.artifact) {
    lines.push(
      "",
      "## Artifact",
      `filename: ${input.artifact.filename}`,
      `mimeType: ${input.artifact.mimeType}`,
      `byteSize: ${input.artifact.byteSize}`,
      `generationState: ${input.artifact.generationState}`,
    );
  }
  lines.push(
    "",
    "## Safety",
    "No media URLs, blob identities, stack traces, or private content are included.",
    "Optional Not tested does not block core Sprint 9 freeze.",
  );
  return lines.join("\n");
}

export function assertSafeIstEvidenceReport(report: string): readonly string[] {
  const issues: string[] = [];
  if (/blob:/i.test(report)) {
    issues.push("report must not include blob identities");
  }
  if (/local:\/\//i.test(report)) {
    issues.push("report must not include local:// media identities");
  }
  if (/https?:\/\//i.test(report) && !/example\.com/i.test(report)) {
    const urls = report.match(/https?:\/\/[^\s]+/gi) ?? [];
    for (const url of urls) {
      if (!/example\.com/i.test(url) && !url.startsWith("data:")) {
        issues.push(`report must not include private media URL: ${url}`);
      }
    }
  }
  if (/at\s+\S+\s+\(/i.test(report) || /Error:\s+/i.test(report)) {
    issues.push("report must not include raw stack traces or Error objects");
  }
  if (!report.includes("Derived Core Preview:")) {
    issues.push("missing derived Core Preview line");
  }
  return issues;
}

export function collectFailedIstEvidenceKeys(input: {
  readonly ledger: IstEvidenceLedger;
}): readonly string[] {
  return input.ledger
    .filter((entry) => entry.result === "fail")
    .map(
      (entry) =>
        `${entry.category}.${entry.checkId}@${entry.fixtureId}`,
    );
}

export function checklistFromLedgerForFixture<T extends string>(
  ledger: IstEvidenceLedger,
  category: IstEvidenceCategory,
  keys: readonly T[],
  fixtureId: string,
): ChecklistState<T> {
  const checks = {} as ChecklistState<T>;
  for (const key of keys) {
    const match = ledger.find(
      (entry) =>
        entry.category === category &&
        entry.checkId === key &&
        entry.fixtureId === fixtureId,
    );
    checks[key] = match?.result ?? "not-tested";
  }
  return checks;
}
