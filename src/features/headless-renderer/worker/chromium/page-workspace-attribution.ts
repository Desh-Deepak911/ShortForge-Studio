/**
 * Privacy-safe page workspace materialization classifications.
 */

export const PAGE_WORKSPACE_SOURCE_PRESENT_CLASSES = Object.freeze([
  "present_readable",
  "absent",
  "unreadable",
  "not_applicable",
] as const);

export type PageWorkspaceSourcePresentClass =
  (typeof PAGE_WORKSPACE_SOURCE_PRESENT_CLASSES)[number];

export const PAGE_WORKSPACE_SHIPPED_RESOLUTION_CLASSES = Object.freeze([
  "resolved_readable",
  "absent",
  "unreadable",
  "not_applicable",
] as const);

export type PageWorkspaceShippedResolutionClass =
  (typeof PAGE_WORKSPACE_SHIPPED_RESOLUTION_CLASSES)[number];

export const PAGE_WORKSPACE_DIGEST_MATCH_CLASSES = Object.freeze([
  "match",
  "mismatch",
  "not_applicable",
] as const);

export type PageWorkspaceDigestMatchClass =
  (typeof PAGE_WORKSPACE_DIGEST_MATCH_CLASSES)[number];

export const PAGE_WORKSPACE_INDEX_SCRIPT_REFERENCE_CLASSES = Object.freeze([
  "valid_relative",
  "invalid",
  "missing",
  "not_applicable",
] as const);

export type PageWorkspaceIndexScriptReferenceClass =
  (typeof PAGE_WORKSPACE_INDEX_SCRIPT_REFERENCE_CLASSES)[number];

export const PAGE_WORKSPACE_FILE_NAVIGATION_LOAD_CLASSES = Object.freeze([
  "not_reached",
  "loaded",
  "failed",
  "not_applicable",
] as const);

export type PageWorkspaceFileNavigationLoadClass =
  (typeof PAGE_WORKSPACE_FILE_NAVIGATION_LOAD_CLASSES)[number];

export const PAGE_WORKSPACE_SCRIPT_LOAD_CLASSES = Object.freeze([
  "not_reached",
  "loaded",
  "load_failed",
  "not_applicable",
] as const);

export type PageWorkspaceScriptLoadClass =
  (typeof PAGE_WORKSPACE_SCRIPT_LOAD_CLASSES)[number];

export const PAGE_WORKSPACE_SCRIPT_EXECUTION_CLASSES = Object.freeze([
  "not_reached",
  "executed",
  "load_failed",
  "evaluation_error",
  "not_applicable",
] as const);

export type PageWorkspaceScriptExecutionClass =
  (typeof PAGE_WORKSPACE_SCRIPT_EXECUTION_CLASSES)[number];

export const PAGE_WORKSPACE_PAGE_ERROR_CLASSES = Object.freeze([
  "none",
  "bootstrap_rejected",
  "runtime_exception",
  "timeout",
  "not_applicable",
] as const);

export type PageWorkspacePageErrorClass =
  (typeof PAGE_WORKSPACE_PAGE_ERROR_CLASSES)[number];

export const PAGE_WORKSPACE_CONTRACT_GLOBAL_CLASSES = Object.freeze([
  "present",
  "missing",
  "not_applicable",
] as const);

export type PageWorkspaceContractGlobalClass =
  (typeof PAGE_WORKSPACE_CONTRACT_GLOBAL_CLASSES)[number];

export const PAGE_WORKSPACE_CONTRACT_VERSION_CLASSES = Object.freeze([
  "match",
  "mismatch",
  "not_applicable",
] as const);

export type PageWorkspaceContractVersionClass =
  (typeof PAGE_WORKSPACE_CONTRACT_VERSION_CLASSES)[number];

export const PAGE_WORKSPACE_BOOTSTRAP_RESPONSE_CLASSES = Object.freeze([
  "not_reached",
  "accepted",
  "rejected",
  "missing_contract",
  "version_mismatch",
  "not_applicable",
] as const);

export type PageWorkspaceBootstrapResponseClass =
  (typeof PAGE_WORKSPACE_BOOTSTRAP_RESPONSE_CLASSES)[number];

export const PAGE_WORKSPACE_CLEANUP_DISPOSITION_CLASSES = Object.freeze([
  "ok",
  "failed",
  "not_run",
  "not_applicable",
] as const);

export type PageWorkspaceCleanupDispositionClass =
  (typeof PAGE_WORKSPACE_CLEANUP_DISPOSITION_CLASSES)[number];

export type PageWorkspaceAttribution = Readonly<{
  shippedArtifactResolutionClass: PageWorkspaceShippedResolutionClass;
  sourcePageArtifactPresent: PageWorkspaceSourcePresentClass;
  sourceArtifactDigestMatch: PageWorkspaceDigestMatchClass;
  materializedArtifactPresent: PageWorkspaceSourcePresentClass;
  materializedArtifactDigestMatch: PageWorkspaceDigestMatchClass;
  materializedByteLengthMatch: PageWorkspaceDigestMatchClass;
  indexScriptReferenceClass: PageWorkspaceIndexScriptReferenceClass;
  fileNavigationLoadClass: PageWorkspaceFileNavigationLoadClass;
  scriptLoadClass: PageWorkspaceScriptLoadClass;
  scriptExecutionClass: PageWorkspaceScriptExecutionClass;
  pageErrorClass: PageWorkspacePageErrorClass;
  contractGlobalPresence: PageWorkspaceContractGlobalClass;
  contractVersionMatch: PageWorkspaceContractVersionClass;
  bootstrapResponseClass: PageWorkspaceBootstrapResponseClass;
  cleanupDisposition: PageWorkspaceCleanupDispositionClass;
}>;

export const PAGE_WORKSPACE_TELEMETRY_FIELD_NAMES = Object.freeze([
  "shipped_artifact_resolution_class",
  "source_artifact_presence_class",
  "source_artifact_digest_class",
  "materialized_artifact_presence_class",
  "materialized_artifact_digest_class",
  "materialized_artifact_length_class",
  "index_script_reference_class",
  "page_navigation_class",
  "script_load_class",
  "script_execution_class",
  "page_error_class",
  "contract_global_class",
  "contract_version_class",
  "bootstrap_response_class",
  "workspace_cleanup_class",
] as const);

export type PageWorkspaceTelemetryFieldName =
  (typeof PAGE_WORKSPACE_TELEMETRY_FIELD_NAMES)[number];

const SHIPPED_RESOLUTION_SET = new Set<string>(
  PAGE_WORKSPACE_SHIPPED_RESOLUTION_CLASSES,
);
const SOURCE_PRESENT_SET = new Set<string>(PAGE_WORKSPACE_SOURCE_PRESENT_CLASSES);
const DIGEST_MATCH_SET = new Set<string>(PAGE_WORKSPACE_DIGEST_MATCH_CLASSES);
const INDEX_SCRIPT_SET = new Set<string>(
  PAGE_WORKSPACE_INDEX_SCRIPT_REFERENCE_CLASSES,
);
const NAVIGATION_SET = new Set<string>(
  PAGE_WORKSPACE_FILE_NAVIGATION_LOAD_CLASSES,
);
const SCRIPT_LOAD_SET = new Set<string>(PAGE_WORKSPACE_SCRIPT_LOAD_CLASSES);
const SCRIPT_EXECUTION_SET = new Set<string>(
  PAGE_WORKSPACE_SCRIPT_EXECUTION_CLASSES,
);
const PAGE_ERROR_SET = new Set<string>(PAGE_WORKSPACE_PAGE_ERROR_CLASSES);
const CONTRACT_GLOBAL_SET = new Set<string>(
  PAGE_WORKSPACE_CONTRACT_GLOBAL_CLASSES,
);
const CONTRACT_VERSION_SET = new Set<string>(
  PAGE_WORKSPACE_CONTRACT_VERSION_CLASSES,
);
const BOOTSTRAP_RESPONSE_SET = new Set<string>(
  PAGE_WORKSPACE_BOOTSTRAP_RESPONSE_CLASSES,
);
const CLEANUP_SET = new Set<string>(PAGE_WORKSPACE_CLEANUP_DISPOSITION_CLASSES);

export function createInitialPageWorkspaceAttribution(): PageWorkspaceAttribution {
  return Object.freeze({
    shippedArtifactResolutionClass: "not_applicable",
    sourcePageArtifactPresent: "not_applicable",
    sourceArtifactDigestMatch: "not_applicable",
    materializedArtifactPresent: "not_applicable",
    materializedArtifactDigestMatch: "not_applicable",
    materializedByteLengthMatch: "not_applicable",
    indexScriptReferenceClass: "not_applicable",
    fileNavigationLoadClass: "not_applicable",
    scriptLoadClass: "not_applicable",
    scriptExecutionClass: "not_applicable",
    pageErrorClass: "not_applicable",
    contractGlobalPresence: "not_applicable",
    contractVersionMatch: "not_applicable",
    bootstrapResponseClass: "not_applicable",
    cleanupDisposition: "not_run",
  });
}

const FORBIDDEN_TELEMETRY =
  /(?:postgresql:\/\/|rediss?:\/\/|UPSTASH_|R2_|password=|token=|BEGIN PRIVATE KEY|\/Users\/|\/tmp\/|https?:\/\/|file:\/\/|@sha256:|process\.env)/i;

function pickAllowlisted<T extends string>(
  value: unknown,
  allowlist: ReadonlySet<string>,
): T | undefined {
  return typeof value === "string" && allowlist.has(value)
    ? (value as T)
    : undefined;
}

export function pageWorkspaceAttributionToTelemetryFacts(
  attribution: PageWorkspaceAttribution,
): Readonly<Record<PageWorkspaceTelemetryFieldName, string>> {
  const facts = Object.freeze({
    shipped_artifact_resolution_class: attribution.shippedArtifactResolutionClass,
    source_artifact_presence_class: attribution.sourcePageArtifactPresent,
    source_artifact_digest_class: attribution.sourceArtifactDigestMatch,
    materialized_artifact_presence_class: attribution.materializedArtifactPresent,
    materialized_artifact_digest_class: attribution.materializedArtifactDigestMatch,
    materialized_artifact_length_class: attribution.materializedByteLengthMatch,
    index_script_reference_class: attribution.indexScriptReferenceClass,
    page_navigation_class: attribution.fileNavigationLoadClass,
    script_load_class: attribution.scriptLoadClass,
    script_execution_class: attribution.scriptExecutionClass,
    page_error_class: attribution.pageErrorClass,
    contract_global_class: attribution.contractGlobalPresence,
    contract_version_class: attribution.contractVersionMatch,
    bootstrap_response_class: attribution.bootstrapResponseClass,
    workspace_cleanup_class: attribution.cleanupDisposition,
  });
  for (const value of Object.values(facts)) {
    if (FORBIDDEN_TELEMETRY.test(value)) {
      throw new Error("page workspace telemetry contains forbidden pattern");
    }
  }
  return facts;
}

export function isPageWorkspaceAttributionTelemetryComplete(
  facts: Readonly<Record<string, string | number | boolean | null>>,
): boolean {
  return PAGE_WORKSPACE_TELEMETRY_FIELD_NAMES.every(
    (key) => typeof facts[key] === "string" && facts[key]!.length > 0,
  );
}

export function sanitizePageWorkspaceAttributionFromTelemetryFacts(
  facts: Readonly<Record<string, string | number | boolean | null>> | undefined,
): PageWorkspaceAttribution | undefined {
  if (facts == null) return undefined;
  if (!isPageWorkspaceAttributionTelemetryComplete(facts)) return undefined;

  const shippedArtifactResolutionClass = pickAllowlisted(
    facts.shipped_artifact_resolution_class,
    SHIPPED_RESOLUTION_SET,
  );
  const sourcePageArtifactPresent = pickAllowlisted(
    facts.source_artifact_presence_class,
    SOURCE_PRESENT_SET,
  );
  const sourceArtifactDigestMatch = pickAllowlisted(
    facts.source_artifact_digest_class,
    DIGEST_MATCH_SET,
  );
  const materializedArtifactPresent = pickAllowlisted(
    facts.materialized_artifact_presence_class,
    SOURCE_PRESENT_SET,
  );
  const materializedArtifactDigestMatch = pickAllowlisted(
    facts.materialized_artifact_digest_class,
    DIGEST_MATCH_SET,
  );
  const materializedByteLengthMatch = pickAllowlisted(
    facts.materialized_artifact_length_class,
    DIGEST_MATCH_SET,
  );
  const indexScriptReferenceClass = pickAllowlisted(
    facts.index_script_reference_class,
    INDEX_SCRIPT_SET,
  );
  const fileNavigationLoadClass = pickAllowlisted(
    facts.page_navigation_class,
    NAVIGATION_SET,
  );
  const scriptLoadClass = pickAllowlisted(facts.script_load_class, SCRIPT_LOAD_SET);
  const scriptExecutionClass = pickAllowlisted(
    facts.script_execution_class,
    SCRIPT_EXECUTION_SET,
  );
  const pageErrorClass = pickAllowlisted(facts.page_error_class, PAGE_ERROR_SET);
  const contractGlobalPresence = pickAllowlisted(
    facts.contract_global_class,
    CONTRACT_GLOBAL_SET,
  );
  const contractVersionMatch = pickAllowlisted(
    facts.contract_version_class,
    CONTRACT_VERSION_SET,
  );
  const bootstrapResponseClass = pickAllowlisted(
    facts.bootstrap_response_class,
    BOOTSTRAP_RESPONSE_SET,
  );
  const cleanupDisposition = pickAllowlisted(
    facts.workspace_cleanup_class,
    CLEANUP_SET,
  );

  if (
    shippedArtifactResolutionClass == null ||
    sourcePageArtifactPresent == null ||
    sourceArtifactDigestMatch == null ||
    materializedArtifactPresent == null ||
    materializedArtifactDigestMatch == null ||
    materializedByteLengthMatch == null ||
    indexScriptReferenceClass == null ||
    fileNavigationLoadClass == null ||
    scriptLoadClass == null ||
    scriptExecutionClass == null ||
    pageErrorClass == null ||
    contractGlobalPresence == null ||
    contractVersionMatch == null ||
    bootstrapResponseClass == null ||
    cleanupDisposition == null
  ) {
    return undefined;
  }

  return Object.freeze({
    shippedArtifactResolutionClass,
    sourcePageArtifactPresent,
    sourceArtifactDigestMatch,
    materializedArtifactPresent,
    materializedArtifactDigestMatch,
    materializedByteLengthMatch,
    indexScriptReferenceClass,
    fileNavigationLoadClass,
    scriptLoadClass,
    scriptExecutionClass,
    pageErrorClass,
    contractGlobalPresence,
    contractVersionMatch,
    bootstrapResponseClass,
    cleanupDisposition,
  }) as PageWorkspaceAttribution;
}

export function sanitizePageWorkspaceAttributionSnapshot(
  value: unknown,
): PageWorkspaceAttribution | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const v = value as Record<string, unknown>;
  const shippedArtifactResolutionClass = pickAllowlisted(
    v.shippedArtifactResolutionClass,
    SHIPPED_RESOLUTION_SET,
  );
  const sourcePageArtifactPresent = pickAllowlisted(
    v.sourcePageArtifactPresent,
    SOURCE_PRESENT_SET,
  );
  const sourceArtifactDigestMatch = pickAllowlisted(
    v.sourceArtifactDigestMatch,
    DIGEST_MATCH_SET,
  );
  const materializedArtifactPresent = pickAllowlisted(
    v.materializedArtifactPresent,
    SOURCE_PRESENT_SET,
  );
  const materializedArtifactDigestMatch = pickAllowlisted(
    v.materializedArtifactDigestMatch,
    DIGEST_MATCH_SET,
  );
  const materializedByteLengthMatch = pickAllowlisted(
    v.materializedByteLengthMatch,
    DIGEST_MATCH_SET,
  );
  const indexScriptReferenceClass = pickAllowlisted(
    v.indexScriptReferenceClass,
    INDEX_SCRIPT_SET,
  );
  const fileNavigationLoadClass = pickAllowlisted(
    v.fileNavigationLoadClass,
    NAVIGATION_SET,
  );
  const scriptLoadClass = pickAllowlisted(v.scriptLoadClass, SCRIPT_LOAD_SET);
  const scriptExecutionClass = pickAllowlisted(
    v.scriptExecutionClass,
    SCRIPT_EXECUTION_SET,
  );
  const pageErrorClass = pickAllowlisted(v.pageErrorClass, PAGE_ERROR_SET);
  const contractGlobalPresence = pickAllowlisted(
    v.contractGlobalPresence,
    CONTRACT_GLOBAL_SET,
  );
  const contractVersionMatch = pickAllowlisted(
    v.contractVersionMatch,
    CONTRACT_VERSION_SET,
  );
  const bootstrapResponseClass = pickAllowlisted(
    v.bootstrapResponseClass,
    BOOTSTRAP_RESPONSE_SET,
  );
  const cleanupDisposition = pickAllowlisted(v.cleanupDisposition, CLEANUP_SET);

  if (
    shippedArtifactResolutionClass == null ||
    sourcePageArtifactPresent == null ||
    sourceArtifactDigestMatch == null ||
    materializedArtifactPresent == null ||
    materializedArtifactDigestMatch == null ||
    materializedByteLengthMatch == null ||
    indexScriptReferenceClass == null ||
    fileNavigationLoadClass == null ||
    scriptLoadClass == null ||
    scriptExecutionClass == null ||
    pageErrorClass == null ||
    contractGlobalPresence == null ||
    contractVersionMatch == null ||
    bootstrapResponseClass == null ||
    cleanupDisposition == null
  ) {
    return undefined;
  }

  return Object.freeze({
    shippedArtifactResolutionClass,
    sourcePageArtifactPresent,
    sourceArtifactDigestMatch,
    materializedArtifactPresent,
    materializedArtifactDigestMatch,
    materializedByteLengthMatch,
    indexScriptReferenceClass,
    fileNavigationLoadClass,
    scriptLoadClass,
    scriptExecutionClass,
    pageErrorClass,
    contractGlobalPresence,
    contractVersionMatch,
    bootstrapResponseClass,
    cleanupDisposition,
  }) as PageWorkspaceAttribution;
}
