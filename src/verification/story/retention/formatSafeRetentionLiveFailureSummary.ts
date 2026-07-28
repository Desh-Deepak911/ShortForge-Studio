/**
 * Sprint 10H.1 / 10H.2 — QA-only safe Retention live failure formatter.
 * Never echoes narration, prompts, claims, credentials, raw provider errors, or stacks.
 * Definitive success:false results retain only bounded production diagnostic authority.
 */

const FINGERPRINT_DISPLAY_CHARS = 16;
const MAX_SAFE_REASON_IDS = 12;
const MAX_REASON_ID_CHARS = 64;
const SAFE_REASON_ID_RE = /^[a-z][a-z0-9_]{0,63}$/;

export const SAFE_RETENTION_LIVE_FAILURE_CATEGORIES = [
  "hook_assertion_failure",
  "retention_assertion_failure",
  "success_false",
  "malformed_terminal_envelope",
  "wrong_strategy_quality_or_path",
  "grounding_or_validation_failure",
  "commit_failure",
  "model_or_api_failure",
  "transient_transport",
  "voice_tts_unavailable",
  "server_configuration",
  "unknown_failure",
] as const;

export type SafeRetentionLiveFailureCategory =
  (typeof SAFE_RETENTION_LIVE_FAILURE_CATEGORIES)[number];

export type TransientTransportCategory =
  | "connection_reset"
  | "timeout"
  | "http_429"
  | "temporary_5xx";

/** Closed allowlist of derived failure stages (never from creator error text). */
export const SAFE_RETENTION_FAILURE_STAGES = [
  "contract",
  "grounding",
  "planner",
  "composer",
  "hook",
  "retention_validation",
  "rewrite",
  "commit",
  "downstream",
  "unknown",
] as const;

export type SafeRetentionFailureStage =
  (typeof SAFE_RETENTION_FAILURE_STAGES)[number];

const FORBIDDEN_SUMMARY_PATTERNS: readonly RegExp[] = [
  /promptBlock/i,
  /hookClaimRefs/i,
  /candidateText/i,
  /openingText/i,
  /manualNotes|manual context/i,
  /Ignore previous instructions/i,
  /OPENAI_API_KEY|API_FOOTBALL_KEY|x-apisports-key/i,
  /"narration"\s*:/,
  /permittedClaim/i,
  /\bsk-[a-zA-Z0-9_-]{8,}/i,
  /\bsk-proj-[a-zA-Z0-9_-]{8,}/i,
  /\bBearer\s+[A-Za-z0-9._\-]+/i,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._\-]+/i,
  /(?:^|[?&\s])(?:token|api[_-]?key|key)=[^\s&]+/i,
  /https?:\/\/[^\s]+[?&](token|key|api[_-]?key)=/i,
  /at\s+\S+\s+\(/i,
];

function shortenFingerprint(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (value.length <= FINGERPRINT_DISPLAY_CHARS) return value;
  return `${value.slice(0, FINGERPRINT_DISPLAY_CHARS)}…`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scrubOrPass(summary: string): string {
  for (const pattern of FORBIDDEN_SUMMARY_PATTERNS) {
    if (pattern.test(summary)) {
      return "category=unknown_failure; safe-summary-scrubbed";
    }
  }
  if (/[A-Za-z0-9+/=]{48,}/.test(summary)) {
    return "category=unknown_failure; safe-summary-scrubbed";
  }
  return summary;
}

function sanitizeSafeReasonIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const out: string[] = [];
  for (const entry of value.slice(0, MAX_SAFE_REASON_IDS)) {
    if (typeof entry !== "string") continue;
    if (entry.length === 0 || entry.length > MAX_REASON_ID_CHARS) continue;
    if (!SAFE_REASON_ID_RE.test(entry)) continue;
    if (FORBIDDEN_SUMMARY_PATTERNS.some((p) => p.test(entry))) continue;
    out.push(entry);
  }
  return Object.freeze(out);
}

function sanitizeBudgetCounts(
  value: unknown,
): Record<string, number> | null {
  if (!isPlainRecord(value)) return null;
  const keys = [
    "total",
    "totalCeiling",
    "planner",
    "initialNarration",
    "lengthCompression",
    "hookRepair",
    "hookFallback",
    "retentionBodyRewrite",
  ] as const;
  const out: Record<string, number> = {};
  for (const key of keys) {
    const n = value[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
    out[key] = Math.floor(n);
  }
  return out;
}

/**
 * Derive failure stage from canonical production failureCategory / reason IDs only.
 */
export function deriveRetentionFailureStage(input: {
  readonly productionFailureCategory?: string | null;
  readonly safeReasonIds?: readonly string[];
  readonly terminalState?: string | null;
}): SafeRetentionFailureStage {
  const cat = input.productionFailureCategory ?? "";
  const ids = input.safeReasonIds ?? [];
  const terminal = input.terminalState ?? "";

  if (cat === "contract_normalization_failure" || ids.some((id) => id.startsWith("invalid_") && id.includes("contract"))) {
    return "contract";
  }
  if (cat === "grounding_failure" || ids.some((id) => id.includes("grounding"))) {
    return "grounding";
  }
  if (
    cat === "planner_unavailable" ||
    cat === "planner_failed" ||
    cat === "planner_invalid" ||
    ids.some((id) => id.startsWith("planner_"))
  ) {
    return "planner";
  }
  if (
    cat === "composer_unavailable" ||
    cat === "composer_failed" ||
    cat === "composer_invalid" ||
    ids.some((id) => id.startsWith("composer_"))
  ) {
    return "composer";
  }
  if (
    cat === "hook_terminal_failure" ||
    ids.includes("hook_terminal_failure") ||
    ids.includes("hook_bridge_not_ready") ||
    ids.includes("candidate_reconciliation_failed") ||
    ids.includes("hook_bridge_unhandled_exception")
  ) {
    return "hook";
  }
  if (
    cat === "validation_authority_mismatch" ||
    ids.includes("creator_context_identity_mismatch") ||
    ids.includes("grounding_summary_mismatch") ||
    ids.includes("grounding_identity_mismatch") ||
    ids.includes("validation_authority_mismatch") ||
    ids.includes("authority_mismatch")
  ) {
    return "retention_validation";
  }
  if (
    cat === "retention_hard_gate_failure" ||
    cat === "quality_failure" ||
    cat === "length_enforcement_failure" ||
    terminal === "rewrite_not_allowed" ||
    ids.includes("hard_gate_failure") ||
    ids.includes("quality_mode_not_studio") ||
    ids.includes("quality_threshold")
  ) {
    return "retention_validation";
  }
  if (
    cat === "rewrite_failure" ||
    terminal.startsWith("rewrite_") ||
    terminal.startsWith("post_rewrite_") ||
    ids.some((id) => id.includes("rewrite") && id !== "pass_without_rewrite" && id !== "pass_after_rewrite")
  ) {
    return "rewrite";
  }
  if (
    cat === "commit_gate_coherence_failure" ||
    cat === "budget_ledger_failure" ||
    ids.some((id) =>
      [
        "fingerprint_mismatch",
        "validation_not_ok",
        "word_budget_violation",
        "ledger_invalid",
      ].includes(id),
    )
  ) {
    return "commit";
  }
  if (cat === "scenes_only_not_applicable" || ids.includes("scenes_only")) {
    return "downstream";
  }
  return "unknown";
}

/**
 * Classify a transport-level failure for the narrow one-retry allowlist.
 * Returns null when the outcome is definitive (must not retry).
 */
export function classifyRetentionLiveTransportFailure(input: {
  readonly error?: unknown;
  readonly httpStatus?: number;
}): TransientTransportCategory | null {
  if (typeof input.httpStatus === "number") {
    if (input.httpStatus === 429) return "http_429";
    if (
      input.httpStatus === 502 ||
      input.httpStatus === 503 ||
      input.httpStatus === 504 ||
      input.httpStatus === 500
    ) {
      return "temporary_5xx";
    }
  }

  const message =
    input.error instanceof Error
      ? input.error.message
      : typeof input.error === "string"
        ? input.error
        : "";
  const msg = message.replace(/\s+/g, " ").trim();
  if (!msg) return null;

  if (/ECONNRESET|socket hang up|connection reset/i.test(msg)) {
    return "connection_reset";
  }
  if (/timeout|aborted|AbortError|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT/i.test(msg)) {
    return "timeout";
  }
  if (/\b429\b|rate limit/i.test(msg)) return "http_429";
  if (/\b(502|503|504|500)\b/.test(msg)) return "temporary_5xx";
  return null;
}

function appendValidationSummary(
  parts: string[],
  validationFailureSummary: unknown,
): void {
  if (!isPlainRecord(validationFailureSummary)) return;

  const failureClass = validationFailureSummary.failureClass;
  if (failureClass === "hard_gate" || failureClass === "quality_threshold") {
    parts.push(`failureClass=${failureClass}`);
  }

  const readiness = validationFailureSummary.readinessScore;
  if (typeof readiness === "number" && Number.isFinite(readiness)) {
    parts.push(`readiness=${Math.round(readiness * 100) / 100}`);
  }

  const threshold = validationFailureSummary.activeThreshold;
  if (typeof threshold === "number" && Number.isFinite(threshold)) {
    parts.push(`threshold=${Math.round(threshold * 100) / 100}`);
  }

  const gates = validationFailureSummary.failedHardGateIds;
  if (Array.isArray(gates)) {
    const clean = gates
      .filter(
        (id): id is string =>
          typeof id === "string" && SAFE_REASON_ID_RE.test(id),
      )
      .slice(0, MAX_SAFE_REASON_IDS);
    if (clean.length > 0) parts.push(`failedHardGates=${clean.join(",")}`);
  }

  const qualityIds = validationFailureSummary.qualityDiagnosticIds;
  if (Array.isArray(qualityIds)) {
    const clean = qualityIds
      .filter(
        (id): id is string =>
          typeof id === "string" && SAFE_REASON_ID_RE.test(id),
      )
      .slice(0, MAX_SAFE_REASON_IDS);
    if (clean.length > 0) parts.push(`qualityDiagIds=${clean.join(",")}`);
  }

  const scores = validationFailureSummary.editorialScores;
  if (isPlainRecord(scores)) {
    const pairs: string[] = [];
    for (const [key, value] of Object.entries(scores)) {
      if (!SAFE_REASON_ID_RE.test(key)) continue;
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      pairs.push(`${key}:${Math.round(value * 100) / 100}`);
      if (pairs.length >= 11) break;
    }
    if (pairs.length > 0) parts.push(`editorial=${pairs.join(",")}`);
  }
}

export function formatSafeRetentionLiveFailureSummary(input: {
  readonly caseId: string;
  readonly httpStatus?: number;
  readonly category: SafeRetentionLiveFailureCategory;
  readonly expectedFormatStrategyId?: string;
  readonly expectedQualityMode?: string;
  readonly expectedGenerationPath?: string;
  readonly terminalState?: string | null;
  readonly contractFingerprint?: string | null;
  readonly planFingerprint?: string | null;
  readonly candidateFingerprint?: string | null;
  readonly validationFingerprint?: string | null;
  readonly attemptCount?: number;
  readonly retryOccurred?: boolean;
  readonly retryCategory?: TransientTransportCategory | null;
  readonly retentionDiagnostics?: unknown;
}): string {
  const parts: string[] = [`case=${input.caseId}`];

  if (typeof input.httpStatus === "number") {
    parts.push(`http=${input.httpStatus}`);
  }
  parts.push(`category=${input.category}`);

  if (input.expectedFormatStrategyId) {
    parts.push(`expectedStrategy=${input.expectedFormatStrategyId}`);
  }
  if (input.expectedQualityMode) {
    parts.push(`expectedQuality=${input.expectedQualityMode}`);
  }
  if (input.expectedGenerationPath) {
    parts.push(`expectedPath=${input.expectedGenerationPath}`);
  }

  const diag = isPlainRecord(input.retentionDiagnostics)
    ? input.retentionDiagnostics
    : null;

  // Production failureCategory — never from creator-facing error text.
  let productionFailureCategory: string | null = null;
  if (diag && typeof diag.failureCategory === "string") {
    productionFailureCategory = diag.failureCategory;
    parts.push(`productionFailureCategory=${productionFailureCategory}`);
  }

  let terminal = input.terminalState ?? null;
  if (terminal == null && diag && typeof diag.terminalState === "string") {
    terminal = diag.terminalState;
  }
  if (terminal) parts.push(`terminalState=${terminal}`);

  if (diag && typeof diag.qualityMode === "string") {
    parts.push(`qualityMode=${diag.qualityMode}`);
  }

  const safeReasonIds = sanitizeSafeReasonIds(diag?.safeReasonIds);
  if (safeReasonIds.length > 0) {
    parts.push(`safeReasonIds=${safeReasonIds.join(",")}`);
  }

  const stage = deriveRetentionFailureStage({
    productionFailureCategory,
    safeReasonIds,
    terminalState: terminal,
  });
  parts.push(`failureStage=${stage}`);

  const contractFp =
    shortenFingerprint(input.contractFingerprint) ??
    (diag ? shortenFingerprint(diag.contractFingerprint) : null);
  const planFp =
    shortenFingerprint(input.planFingerprint) ??
    (diag ? shortenFingerprint(diag.planFingerprint) : null);
  const candidateFp =
    shortenFingerprint(input.candidateFingerprint) ??
    (diag ? shortenFingerprint(diag.candidateFingerprint) : null);
  const validationFp =
    shortenFingerprint(input.validationFingerprint) ??
    (diag ? shortenFingerprint(diag.validationFingerprint) : null);
  if (contractFp) parts.push(`contractFp=${contractFp}`);
  if (planFp) parts.push(`planFp=${planFp}`);
  if (candidateFp) parts.push(`candidateFp=${candidateFp}`);
  if (validationFp) parts.push(`validationFp=${validationFp}`);

  const budget = sanitizeBudgetCounts(diag?.budget);
  if (budget) {
    parts.push(
      `budget=total:${budget.total}/${budget.totalCeiling}` +
        `|planner:${budget.planner}` +
        `|initial:${budget.initialNarration}` +
        `|compress:${budget.lengthCompression}` +
        `|hookRepair:${budget.hookRepair}` +
        `|hookFallback:${budget.hookFallback}` +
        `|rewrite:${budget.retentionBodyRewrite}`,
    );
  }

  if (stage === "retention_validation") {
    appendValidationSummary(parts, diag?.validationFailureSummary);
  }

  if (typeof input.attemptCount === "number") {
    parts.push(`attempts=${Math.min(Math.max(1, input.attemptCount), 2)}`);
  }
  if (input.retryOccurred) {
    parts.push(
      `retry=yes${input.retryCategory ? `(${input.retryCategory})` : ""}`,
    );
  } else if (input.retryOccurred === false) {
    parts.push("retry=no");
  }

  return scrubOrPass(parts.join("; "));
}

export function assertSafeRetentionLiveFailureSummaryScrubbed(
  summary: string,
): void {
  for (const pattern of FORBIDDEN_SUMMARY_PATTERNS) {
    if (pattern.test(summary)) {
      throw new Error(`Unsafe Retention live failure summary matched ${pattern}`);
    }
  }
  if (/\berror=/i.test(summary) && !/category=/.test(summary)) {
    throw new Error("Unsafe Retention live failure summary still uses raw error=");
  }
}

/** Scrub operator notes for local evidence downloads. */
export function scrubRetentionOperatorNotes(notes: string): string {
  let out = notes.slice(0, 2000);
  out = out.replace(
    /\b(sk-[A-Za-z0-9_-]{8,}|sk-proj-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._\-]+)\b/gi,
    "[redacted-token]",
  );
  out = out.replace(
    /https?:\/\/[^\s]+/gi,
    (url) =>
      /[?&](token|key|api[_-]?key)=/i.test(url) ? "[redacted-url]" : url.split("?")[0]!,
  );
  out = out.replace(/(?:^|[?&\s])(?:token|api[_-]?key|key)=[^\s&]+/gi, " [redacted]");
  out = out.replace(/[A-Za-z0-9+/=]{48,}/g, "[redacted-blob]");
  return out.trim();
}
