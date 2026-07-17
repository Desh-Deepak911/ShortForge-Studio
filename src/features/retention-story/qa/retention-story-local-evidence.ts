/**
 * Sprint 10H / 10H.1 — tri-state local product evidence for /dev/retention-story-qa.
 * Structural checks never auto-claim Pass. Incomplete checklists are never eligible.
 */

export type EvidenceCheckResult = "not-tested" | "pass" | "fail";

export type ChecklistState<T extends string> = Record<T, EvidenceCheckResult>;

export function createEmptyChecklist<T extends readonly string[]>(
  keys: T,
): ChecklistState<T[number]> {
  return Object.fromEntries(
    keys.map((key) => [key, "not-tested" as const]),
  ) as ChecklistState<T[number]>;
}

export const CREATE_CHECK_KEYS = [
  "autoIsDefault",
  "retentionAndStandardSelectable",
  "durationCompatReset",
  "hookStyleIndependent",
  "invalidSelectionBlocksGenerate",
] as const;

export type CreateCheckKey = (typeof CREATE_CHECK_KEYS)[number];

export const CREATE_CHECK_LABELS: Record<CreateCheckKey, string> = {
  autoIsDefault: "Auto is the default Story Strategy",
  retentionAndStandardSelectable: "Retention-first and Standard are selectable",
  durationCompatReset:
    "Duration incompatibility resets incompatible explicit strategy to Auto",
  hookStyleIndependent: "Hook Style remains independent of Story Strategy",
  invalidSelectionBlocksGenerate:
    "Invalid Story Strategy selections cannot generate",
};

export const GENERATED_CHECK_KEYS = [
  "conciseImmediate",
  "noGenericSetup",
  "clearControllingIdea",
  "frequentMeaningfulBeats",
  "strongPayoff",
  "reviewPanelUnderstandable",
] as const;

export type GeneratedCheckKey = (typeof GENERATED_CHECK_KEYS)[number];

export const GENERATED_CHECK_LABELS: Record<GeneratedCheckKey, string> = {
  conciseImmediate: "25–35s narration feels concise and immediate",
  noGenericSetup: "No generic setup / introduction",
  clearControllingIdea: "Clear controlling idea",
  frequentMeaningfulBeats: "Frequent meaningful beats",
  strongPayoff: "Strong payoff",
  reviewPanelUnderstandable:
    "Review Story intelligence panel is understandable",
};

export const PERSISTENCE_CHECK_KEYS = [
  "saveReloadNarration",
  "explainabilityCoherent",
  "malformedNeverCrashes",
] as const;

export type PersistenceCheckKey = (typeof PERSISTENCE_CHECK_KEYS)[number];

export const PERSISTENCE_CHECK_LABELS: Record<PersistenceCheckKey, string> = {
  saveReloadNarration: "Save/reload keeps narration unchanged",
  explainabilityCoherent: "Explainability remains available and coherent",
  malformedNeverCrashes: "Malformed evidence never crashes Review",
};

/**
 * Audio-first local policy (unambiguous):
 * - Core-required when voice/TTS is configured for Sprint 10 sign-off.
 * - Capability-gated Not tested when voice/TTS is genuinely unavailable.
 * Never “optional for Pass” while also “Core-required”.
 */
export const AUDIO_FIRST_CHECK_KEYS = [
  "approvalBeforeVoScenes",
  "storyboardFromApprovedNarration",
] as const;

export type AudioFirstCheckKey = (typeof AUDIO_FIRST_CHECK_KEYS)[number];

export const AUDIO_FIRST_CHECK_LABELS: Record<AudioFirstCheckKey, string> = {
  approvalBeforeVoScenes:
    "Hook + Retention approval precedes VO/scenes (Core-required when voice/TTS configured)",
  storyboardFromApprovedNarration:
    "Storyboard generation succeeds from approved narration (Core-required when voice/TTS configured)",
};

export const AUDIO_FIRST_POLICY_COPY =
  "Audio-first is Core-required for local sign-off when voice/TTS is configured. If voice/TTS is unavailable, leave these Not tested (capability-gated) — do not mark Pass from structural checks alone.";

export type LocalSignOffVerdict =
  | "eligible"
  | "not-eligible"
  | "incomplete"
  | "capability-gated-audio";

export interface RetentionStoryLocalEvidenceReport {
  readonly version: 2;
  readonly generatedAt: string;
  readonly browser: string;
  readonly create: ChecklistState<CreateCheckKey>;
  readonly generated: ChecklistState<GeneratedCheckKey>;
  readonly persistence: ChecklistState<PersistenceCheckKey>;
  readonly audioFirst: ChecklistState<AudioFirstCheckKey>;
  readonly audioFirstConfiguredForSignOff: boolean;
  readonly notes: string;
  readonly verdict: LocalSignOffVerdict;
}

export function scrubRetentionLocalOperatorNotes(notes: string): string {
  let out = notes.slice(0, 2000);
  out = out.replace(
    /\b(sk-[A-Za-z0-9_-]{8,}|sk-proj-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._\-]+)\b/gi,
    "[redacted-token]",
  );
  out = out.replace(/https?:\/\/[^\s]+/gi, (url) =>
    /[?&](token|key|api[_-]?key)=/i.test(url)
      ? "[redacted-url]"
      : url.split("?")[0]!,
  );
  out = out.replace(
    /(?:^|[?&\s])(?:token|api[_-]?key|key)=[^\s&]+/gi,
    " [redacted]",
  );
  out = out.replace(/[A-Za-z0-9+/=]{48,}/g, "[redacted-blob]");
  return out.trim();
}

/** Safe browser label — product/version only, no IP or account data. */
export function formatSafeBrowserLabel(userAgent: string): string {
  const ua = userAgent.slice(0, 180);
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari";
  return "Browser";
}

export function summarizeChecklist(
  checks: Record<string, EvidenceCheckResult>,
): { pass: number; fail: number; notTested: number } {
  let pass = 0;
  let fail = 0;
  let notTested = 0;
  for (const value of Object.values(checks)) {
    if (value === "pass") pass += 1;
    else if (value === "fail") fail += 1;
    else notTested += 1;
  }
  return { pass, fail, notTested };
}

function allPass(checks: Record<string, EvidenceCheckResult>): boolean {
  return Object.values(checks).every((v) => v === "pass");
}

function anyFail(checks: Record<string, EvidenceCheckResult>): boolean {
  return Object.values(checks).some((v) => v === "fail");
}

function anyNotTested(checks: Record<string, EvidenceCheckResult>): boolean {
  return Object.values(checks).some((v) => v === "not-tested");
}

/**
 * Derive local sign-off verdict.
 * Incomplete Core Create/generated/persistence → incomplete (never eligible).
 * Structural suites never promote Pass.
 */
export function deriveLocalSignOffVerdict(input: {
  readonly create: ChecklistState<CreateCheckKey>;
  readonly generated: ChecklistState<GeneratedCheckKey>;
  readonly persistence: ChecklistState<PersistenceCheckKey>;
  readonly audioFirst: ChecklistState<AudioFirstCheckKey>;
  readonly audioFirstConfiguredForSignOff: boolean;
}): LocalSignOffVerdict {
  const core = [input.create, input.generated, input.persistence];
  if (core.some(anyFail)) return "not-eligible";
  if (core.some(anyNotTested)) return "incomplete";
  if (!core.every(allPass)) return "incomplete";

  if (input.audioFirstConfiguredForSignOff) {
    if (anyFail(input.audioFirst)) return "not-eligible";
    if (anyNotTested(input.audioFirst) || !allPass(input.audioFirst)) {
      return "incomplete";
    }
    return "eligible";
  }

  // Voice/TTS not configured — audio-first must remain Not tested (capability-gated).
  if (anyFail(input.audioFirst)) return "not-eligible";
  if (Object.values(input.audioFirst).some((v) => v === "pass")) {
    // Operator claimed Pass without configured sign-off — not eligible.
    return "not-eligible";
  }
  if (!Object.values(input.audioFirst).every((v) => v === "not-tested")) {
    return "incomplete";
  }
  return "capability-gated-audio";
}

export function buildSafeRetentionStoryEvidenceReport(input: {
  readonly create: ChecklistState<CreateCheckKey>;
  readonly generated: ChecklistState<GeneratedCheckKey>;
  readonly persistence: ChecklistState<PersistenceCheckKey>;
  readonly audioFirst: ChecklistState<AudioFirstCheckKey>;
  readonly audioFirstConfiguredForSignOff: boolean;
  readonly notes?: string;
  readonly browser?: string;
}): RetentionStoryLocalEvidenceReport {
  const verdict = deriveLocalSignOffVerdict(input);
  return Object.freeze({
    version: 2,
    generatedAt: new Date().toISOString(),
    browser: formatSafeBrowserLabel(input.browser ?? "Browser"),
    create: { ...input.create },
    generated: { ...input.generated },
    persistence: { ...input.persistence },
    audioFirst: { ...input.audioFirst },
    audioFirstConfiguredForSignOff: input.audioFirstConfiguredForSignOff,
    notes: scrubRetentionLocalOperatorNotes(input.notes ?? ""),
    verdict,
  });
}

/** Structural automated evidence never promotes manual Pass. */
export function assertStructuralChecksDoNotPromotePass(
  structuralOk: boolean,
  manual: EvidenceCheckResult,
): EvidenceCheckResult {
  if (manual === "pass" || manual === "fail") return manual;
  void structuralOk;
  return "not-tested";
}
