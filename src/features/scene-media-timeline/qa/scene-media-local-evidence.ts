/**
 * Sprint 8E.1A — tri-state local-evidence derivation for the Scene Media QA harness.
 * Idle/in-progress → Not tested. Observed Fail is first-class. Structural validation alone ≠ Pass.
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

export const PREVIEW_CHECK_KEYS = [
  "itemABeforeBoundary",
  "itemBAtOrAfterBoundary",
  "finalItemHeld",
  "noBlankSwitchingFrame",
  "itemLocalFramingMotion",
  "captionsContinuous",
  "transitionPeerCoherent",
] as const;

export type PreviewCheckKey = (typeof PREVIEW_CHECK_KEYS)[number];

export const ARTIFACT_VISUAL_CHECK_KEYS = [
  "bothItemsVisibleInOrder",
  "correctBoundarySwitch",
  "noBlankOrRepeatedFirstItem",
  "captionsFinalFrameCoherent",
] as const;

export type ArtifactVisualCheckKey = (typeof ARTIFACT_VISUAL_CHECK_KEYS)[number];

export const EDITOR_CHECK_KEYS = [
  "append",
  "reorder",
  "resize",
  "remove",
  "perItemFramingMotion",
  "videoTrim",
  "draftSaveReload",
  "duplicateSceneIndependence",
  "legacyConversionExplicitOnly",
] as const;

export type EditorCheckKey = (typeof EDITOR_CHECK_KEYS)[number];

export const ARTIFACT_AUTOMATIC_CHECK_KEYS = [
  "preflightApproved",
  "exactPreparedManifestRendered",
  "rendererCompleted",
  "artifactNonEmpty",
  "structuralValidationPassed",
  "durationWithinTolerance",
] as const;

export type ArtifactAutomaticCheckKey =
  (typeof ARTIFACT_AUTOMATIC_CHECK_KEYS)[number];

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

export type ArtifactAutomaticChecks = ChecklistState<ArtifactAutomaticCheckKey>;

export const EMPTY_ARTIFACT_AUTOMATIC_CHECKS: ArtifactAutomaticChecks =
  createEmptyChecklist(ARTIFACT_AUTOMATIC_CHECK_KEYS);

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

function deriveTriStateFromChecks(
  values: readonly EvidenceCheckResult[],
): LocalEvidenceResult {
  if (values.some((value) => value === "fail")) {
    return "fail";
  }
  if (values.length > 0 && values.every((value) => value === "pass")) {
    return "pass";
  }
  return "not-tested";
}

export function derivePreviewEvidenceResult(
  checks: ChecklistState<PreviewCheckKey>,
): LocalEvidenceResult {
  return deriveTriStateFromChecks(
    PREVIEW_CHECK_KEYS.map((key) => checks[key]),
  );
}

/**
 * Local artifact Pass requires every automatic + visual check to be Pass.
 * Idle / preparing / incomplete → Not tested (not Fail).
 * Structural validation alone never yields Pass.
 */
export function deriveArtifactEvidenceResult(input: {
  readonly automatic: ArtifactAutomaticChecks;
  readonly visual: ChecklistState<ArtifactVisualCheckKey>;
  readonly hardFailure: boolean;
}): LocalEvidenceResult {
  if (input.hardFailure) {
    return "fail";
  }

  const automaticValues = ARTIFACT_AUTOMATIC_CHECK_KEYS.map(
    (key) => input.automatic[key],
  );
  const visualValues = ARTIFACT_VISUAL_CHECK_KEYS.map(
    (key) => input.visual[key],
  );
  return deriveTriStateFromChecks([...automaticValues, ...visualValues]);
}

export function deriveEditorEvidenceResult(
  checks: ChecklistState<EditorCheckKey>,
): LocalEvidenceResult {
  return deriveTriStateFromChecks(EDITOR_CHECK_KEYS.map((key) => checks[key]));
}

/**
 * Structural validation outcome maps to generation state only — never local Pass.
 */
export function mapStructuralValidationToGenerationState(
  structuralValid: boolean | null,
): ArtifactGenerationState {
  if (structuralValid === null) {
    return "idle";
  }
  if (!structuralValid) {
    return "validation-fail";
  }
  return "awaiting-visual-review";
}

export function assertPreparedManifestForSceneMediaQa(
  manifest: {
    readonly version: number;
    readonly rendererContractVersion: string;
    readonly scenes: readonly {
      readonly id: string;
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
  } else if ((scene.mediaTimeline?.items.length ?? 0) < 2) {
    issues.push("primary scene must have at least two timeline items");
  }
  if (typeof manifest.fingerprint !== "string" || !manifest.fingerprint.trim()) {
    issues.push("fingerprint required");
  }
  return issues;
}

export function collectFailedEvidenceKeys(input: {
  readonly previewChecks: ChecklistState<PreviewCheckKey>;
  readonly artifactAutomatic: ArtifactAutomaticChecks;
  readonly artifactVisual: ChecklistState<ArtifactVisualCheckKey>;
  readonly editorChecks: ChecklistState<EditorCheckKey>;
}): readonly string[] {
  const failed: string[] = [];
  for (const key of PREVIEW_CHECK_KEYS) {
    if (input.previewChecks[key] === "fail") {
      failed.push(`preview.${key}`);
    }
  }
  for (const key of ARTIFACT_AUTOMATIC_CHECK_KEYS) {
    if (input.artifactAutomatic[key] === "fail") {
      failed.push(`artifact.automatic.${key}`);
    }
  }
  for (const key of ARTIFACT_VISUAL_CHECK_KEYS) {
    if (input.artifactVisual[key] === "fail") {
      failed.push(`artifact.visual.${key}`);
    }
  }
  for (const key of EDITOR_CHECK_KEYS) {
    if (input.editorChecks[key] === "fail") {
      failed.push(`editor.${key}`);
    }
  }
  return failed;
}

export interface SafeEvidenceReportInput {
  readonly timestampIso: string;
  readonly browserName: string;
  readonly goldenId: string;
  readonly renderedFingerprint: string | null;
  readonly manifestVersion: number | null;
  readonly rendererContractVersion: string | null;
  readonly itemWindows: readonly {
    readonly id: string;
    readonly startOffsetMs: number;
    readonly endOffsetMs: number;
    readonly durationMs: number;
  }[];
  readonly artifact: {
    readonly filename: string | null;
    readonly mimeType: string | null;
    readonly byteSize: number | null;
    readonly generationState: ArtifactGenerationState;
  };
  readonly duration: DurationComparison | null;
  readonly previewChecks: ChecklistState<PreviewCheckKey>;
  readonly artifactAutomatic: ArtifactAutomaticChecks;
  readonly artifactVisual: ChecklistState<ArtifactVisualCheckKey>;
  readonly editorChecks: ChecklistState<EditorCheckKey>;
  readonly previewResult: LocalEvidenceResult;
  readonly artifactResult: LocalEvidenceResult;
  readonly editorResult: LocalEvidenceResult;
}

const UNSAFE_REPORT_PATTERNS = [
  /blob:/i,
  /https?:\/\//i,
  /data:image\//i,
  /local:\/\//i,
  /process\.env/i,
  /NEXT_PUBLIC_/i,
  /api[_-]?key/i,
  /password/i,
  /secret/i,
  /Bearer\s+/i,
];

export function buildSafeSceneMediaEvidenceReport(
  input: SafeEvidenceReportInput,
): string {
  const failedKeys = collectFailedEvidenceKeys(input);
  const lines = [
    "# Sprint 8 Scene Media Local Evidence",
    "",
    `Timestamp: ${input.timestampIso}`,
    `Browser: ${input.browserName}`,
    `Golden: ${input.goldenId}`,
    `Rendered fingerprint: ${input.renderedFingerprint ?? "n/a"}`,
    `Manifest version: ${input.manifestVersion ?? "n/a"}`,
    `Renderer contract: ${input.rendererContractVersion ?? "n/a"}`,
    "",
    "## Frozen item windows",
    ...input.itemWindows.map(
      (item) =>
        `- ${item.id}: [${item.startOffsetMs}, ${item.endOffsetMs}) ${item.durationMs}ms`,
    ),
    "",
    "## Artifact metadata",
    `- filename: ${input.artifact.filename ?? "n/a"}`,
    `- mimeType: ${input.artifact.mimeType ?? "n/a"}`,
    `- byteSize: ${input.artifact.byteSize ?? "n/a"}`,
    `- generationState: ${input.artifact.generationState}`,
    "",
    "## Duration comparison",
    input.duration
      ? `- expected=${input.duration.expectedMs}ms · measured=${input.duration.measuredMs ?? "unknown"}ms · delta=${input.duration.deltaMs ?? "n/a"}ms · tolerance=${input.duration.toleranceMs}ms · result=${input.duration.result}`
      : "- n/a",
    "",
    "## Preview checklist",
    ...PREVIEW_CHECK_KEYS.map(
      (key) => `- ${key}: ${input.previewChecks[key]}`,
    ),
    `Derived Preview: ${input.previewResult}`,
    "",
    "## Artifact automatic checks",
    ...ARTIFACT_AUTOMATIC_CHECK_KEYS.map(
      (key) => `- ${key}: ${input.artifactAutomatic[key]}`,
    ),
    "",
    "## Artifact visual checklist",
    ...ARTIFACT_VISUAL_CHECK_KEYS.map(
      (key) => `- ${key}: ${input.artifactVisual[key]}`,
    ),
    `Derived Artifact: ${input.artifactResult}`,
    "",
    "## Manual editor checklist",
    ...EDITOR_CHECK_KEYS.map(
      (key) => `- ${key}: ${input.editorChecks[key]}`,
    ),
    `Derived Editor: ${input.editorResult}`,
    "",
    "## Failed checks",
    failedKeys.length > 0
      ? failedKeys.map((key) => `- ${key}`).join("\n")
      : "- none",
    "",
    "## Remaining Not tested device classes",
    "- Safari / Firefox device matrix",
    "- 1080p browser capability path",
    "- Multi-video device playback",
    "",
    "Safe report: no media URLs, blob/object URLs, blob contents, stack traces, credentials, env values, or private draft content.",
  ];
  return lines.join("\n");
}

export function assertSafeEvidenceReport(report: string): readonly string[] {
  const issues: string[] = [];
  for (const pattern of UNSAFE_REPORT_PATTERNS) {
    if (pattern.test(report)) {
      issues.push(`unsafe pattern matched: ${pattern}`);
    }
  }
  return issues;
}

/** QA video seek checkpoints from frozen item windows (scene-local ms → absolute export ms). */
export function buildArtifactPlaybackCheckpoints(
  sceneStartMs: number,
  items: readonly {
    readonly id: string;
    readonly startOffsetMs: number;
    readonly endOffsetMs: number;
    readonly durationMs: number;
  }[],
): readonly { readonly label: string; readonly seekMs: number }[] {
  if (items.length < 2) {
    return [];
  }
  const a = items[0]!;
  const b = items[1]!;
  const last = items[items.length - 1]!;
  return [
    {
      label: "ITEM A midpoint",
      seekMs: sceneStartMs + a.startOffsetMs + Math.floor(a.durationMs / 2),
    },
    {
      label: "1ms before boundary",
      seekMs: sceneStartMs + Math.max(0, a.endOffsetMs - 1),
    },
    {
      label: "Exact boundary",
      seekMs: sceneStartMs + a.endOffsetMs,
    },
    {
      label: "ITEM B midpoint",
      seekMs: sceneStartMs + b.startOffsetMs + Math.floor(b.durationMs / 2),
    },
    {
      label: "Final frame",
      seekMs: sceneStartMs + Math.max(0, last.endOffsetMs - 1),
    },
  ];
}
