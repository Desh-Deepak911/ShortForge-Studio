/**
 * Sprint 7E.3A — QA-only safe failure summary for live Hook harness notes.
 * Never echoes raw provider/SDK error text, credentials, narration, or prompts.
 * Formatting must never alter Pass/Fail/Not tested classification.
 */

const FINGERPRINT_DISPLAY_CHARS = 16;

export const SAFE_LIVE_FAILURE_CATEGORIES = [
  "hook_approval_failed",
  "server_configuration",
  "model_or_api_failure",
  "voice_service_unavailable",
  "research_unavailable",
  "scene_planning_failure",
  "unknown_failure",
] as const;

export type SafeLiveFailureCategory =
  (typeof SAFE_LIVE_FAILURE_CATEGORIES)[number];

/** Exact public application messages that may be mapped without echoing arbitrary text. */
const ALLOWED_PUBLIC_MESSAGES: ReadonlyMap<string, SafeLiveFailureCategory> =
  new Map([
    [
      "Hook Engine could not approve a safe narration opening.",
      "hook_approval_failed",
    ],
    ["Approved narration opening span mismatch.", "hook_approval_failed"],
    [
      "This topic could not clear Hook safety or grounding checks. Try Auto, Write My Own, or adjust the topic — no unsafe opening was approved.",
      "hook_approval_failed",
    ],
    ["Server configuration error", "server_configuration"],
    ["Title and narration are required", "scene_planning_failure"],
    ["Valid voiceover duration is required", "scene_planning_failure"],
    ["Prompt is required", "scene_planning_failure"],
  ]);

/** Dynamic creator-facing quality/fallback messages end with this safe suffix. */
const QUALITY_FALLBACK_MESSAGE_SUFFIX =
  "could not produce a valid opening after one repair and a safe fallback. Try again or switch Hook Style to Auto.";

const SAFE_DIAGNOSTIC_KEYS = [
  "strategyId",
  "strategyVersion",
  "strategySource",
  "generationPath",
  "validationOutcome",
  "fallbackReason",
  "repairAttempts",
  "groundingStatus",
  "lengthEnforcement",
  "adapterRan",
  "requestFingerprint",
  "planFingerprint",
] as const;

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
];

const VOICE_SERVICE_UNAVAILABLE_RE =
  /OPENAI_API_KEY|api key.*(missing|not (set|configured|found|provided))|missing.*api.?key|Incorrect API key|invalid.?api.?key|TTS.*(unavailable|not configured)|voiceover.*(unavailable|not configured|provider.*(missing|unavailable))|audio\.speech|speech\.create|insufficient.*(quota|credit).*tts/i;

const RESEARCH_UNAVAILABLE_RE =
  /API_FOOTBALL|api-football|research.*(unavailable|failed|no structured)|provider research returned no/i;

const SCENE_PLANNING_RE =
  /scene plan|scenes?[- ]only|voiceover duration|Title and narration/i;

const SERVER_CONFIG_RE =
  /Server configuration error|not configured|missing environment/i;

const HOOK_APPROVAL_RE =
  /Hook Engine could not approve|opening span mismatch|generation_failed|safe narration opening|valid opening after one repair|Hook safety or grounding/i;

const MODEL_OR_API_RE =
  /model_|openai|rate limit|timeout|ECONNRESET|fetch failed|503|502|500\b|APIError|chat\.completions/i;

function shortenFingerprint(value: string): string {
  if (value.length <= FINGERPRINT_DISPLAY_CHARS) return value;
  return `${value.slice(0, FINGERPRINT_DISPLAY_CHARS)}…`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Map an arbitrary error string to a safe category. Never returns the raw text.
 */
export function categorizeLiveFailureError(
  error: unknown,
  options?: { readonly preferVoiceUnavailable?: boolean },
): SafeLiveFailureCategory {
  if (typeof error !== "string" || !error.trim()) {
    return "unknown_failure";
  }
  const msg = error.replace(/\s+/g, " ").trim();
  const allowed = ALLOWED_PUBLIC_MESSAGES.get(msg);
  if (allowed) return allowed;
  if (msg.endsWith(QUALITY_FALLBACK_MESSAGE_SUFFIX)) {
    return "hook_approval_failed";
  }

  if (options?.preferVoiceUnavailable && VOICE_SERVICE_UNAVAILABLE_RE.test(msg)) {
    return "voice_service_unavailable";
  }
  if (VOICE_SERVICE_UNAVAILABLE_RE.test(msg)) {
    return "voice_service_unavailable";
  }
  if (HOOK_APPROVAL_RE.test(msg)) return "hook_approval_failed";
  if (SERVER_CONFIG_RE.test(msg)) return "server_configuration";
  if (RESEARCH_UNAVAILABLE_RE.test(msg)) return "research_unavailable";
  if (SCENE_PLANNING_RE.test(msg)) return "scene_planning_failure";
  if (MODEL_OR_API_RE.test(msg)) return "model_or_api_failure";
  return "unknown_failure";
}

/** Whether a raw error matches the narrow voice-service Not-tested allowlist. */
export function isVoiceServiceUnavailableError(error: unknown): boolean {
  return (
    typeof error === "string" &&
    VOICE_SERVICE_UNAVAILABLE_RE.test(error.replace(/\s+/g, " ").trim())
  );
}

function appendDiagnostics(
  parts: string[],
  diagnostics: unknown,
): void {
  if (!isPlainRecord(diagnostics)) {
    parts.push("hookDiagnostics=(absent)");
    return;
  }
  for (const key of SAFE_DIAGNOSTIC_KEYS) {
    const value = diagnostics[key];
    if (value === undefined || value === null) continue;
    if (key === "requestFingerprint" || key === "planFingerprint") {
      if (typeof value === "string" && value.length > 0) {
        parts.push(`${key}=${shortenFingerprint(value)}`);
      }
      continue;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      parts.push(`${key}=${String(value)}`);
    }
  }
}

function scrubOrPass(summary: string): string {
  for (const pattern of FORBIDDEN_SUMMARY_PATTERNS) {
    if (pattern.test(summary)) {
      return "category=unknown_failure; safe-summary-scrubbed";
    }
  }
  // Reject accidental high-entropy raw dumps that slipped past mapping.
  if (/[A-Za-z0-9+\/=]{48,}/.test(summary)) {
    return "category=unknown_failure; safe-summary-scrubbed";
  }
  return summary;
}

/**
 * Build a single-line safe failure note from an unsuccessful generate-script JSON body.
 * Emits category=… plus approved diagnostics — never raw error text.
 */
export function formatSafeLiveFailureSummary(input: {
  readonly httpStatus?: number;
  readonly json: Record<string, unknown>;
  readonly categoryOverride?: SafeLiveFailureCategory;
}): string {
  const parts: string[] = [];
  if (typeof input.httpStatus === "number") {
    parts.push(`http=${input.httpStatus}`);
  }

  const category =
    input.categoryOverride ??
    categorizeLiveFailureError(input.json.error);
  parts.push(`category=${category}`);

  appendDiagnostics(parts, input.json.hookDiagnostics);

  return scrubOrPass(parts.join("; "));
}

/** Deterministic scrubbing check for QA fixtures. */
export function assertSafeLiveFailureSummaryScrubbed(summary: string): void {
  for (const pattern of FORBIDDEN_SUMMARY_PATTERNS) {
    if (pattern.test(summary)) {
      throw new Error(`Unsafe live failure summary matched ${pattern}`);
    }
  }
  if (/\berror=/i.test(summary) && !/category=/.test(summary)) {
    throw new Error("Unsafe live failure summary still uses raw error=");
  }
  // Disallow embedding the historical public message as free text outside category.
  if (/Hook Engine could not approve/i.test(summary)) {
    throw new Error("Raw Hook approval message leaked into summary");
  }
}
