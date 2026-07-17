/**
 * Sprint 10H / 10H.1 — Core Retention Story live-model sign-off (QA-only gate).
 *
 * Activation:
 *   RETENTION_LIVE_QA=1 QA_BASE_URL=http://localhost:3000 npm run test:retention-story-live-qa
 *
 * Gate behavior:
 * - RETENTION_LIVE_QA != 1 → Not tested in console, exit 0, preserve existing results file
 * - RETENTION_LIVE_QA === 1 && missing QA_BASE_URL → configuration failure, exit non-zero
 * - RETENTION_LIVE_QA === 1 && any required Fail → exit non-zero
 *
 * Audio-first policy:
 * - RETENTION_LIVE_AUDIO_FIRST=1 → Core-required for eligibility (must Pass)
 * - otherwise → capability-gated Not tested (voice/TTS not configured for sign-off)
 *
 * Not a production feature flag. Not required in .env.local.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { assertRetentionLiveSuccessEnvelope } from "./assertRetentionLiveSuccessEnvelope";
import {
  assertFlexibleCreativePremiseLiveSemantics,
  assertFlexibleExplicitHookLiveSemantics,
} from "./assertRetentionLiveGenerationDisposition";
import {
  classifyRetentionLiveTransportFailure,
  formatSafeRetentionLiveFailureSummary,
  type SafeRetentionLiveFailureCategory,
  type TransientTransportCategory,
} from "./formatSafeRetentionLiveFailureSummary";

type LiveStatus = "Pass" | "Fail" | "Not tested";

interface LiveCaseResult {
  readonly id: string;
  readonly name: string;
  readonly status: LiveStatus;
  readonly notes: string;
  readonly evidenceClass: "live-model" | "not-tested" | "capability-gated";
  readonly formatStrategyId?: string;
  readonly qualityMode?: string;
  readonly generationPath?: string;
  readonly retryOccurred?: boolean;
  readonly retryCategory?: TransientTransportCategory | null;
}

interface CaseExpect {
  readonly generationPath: "script_only" | "audio_first_full";
  readonly formatStrategyId: string;
  readonly qualityMode: "cheap" | "balanced" | "best";
  readonly requestedDurationSec: number;
  readonly narrationStartsWith?: string;
  /** Soft substring checks for Creative Premise / realistic briefs. */
  readonly narrationMustInclude?: readonly string[];
  readonly expectedHookStrategyId?: string;
  readonly expectedHookStrategySource?: string;
  /**
   * Sprint 10H.5A — Flexible Explicit Hook: exact OR truthful reconciliation.
   * Do not set for Precise / Write My Own / strict Explicit Hook selection.
   */
  readonly flexibleExplicitHook?: {
    readonly requestedStrategyId: string;
    readonly requestedStrategySource: string;
  };
  /**
   * Sprint 10H.5A — Flexible Creative Premise: participants required;
   * optional premise tokens may be omitted when disclosed.
   */
  readonly flexibleCreativePremise?: {
    readonly requiredParticipants: readonly string[];
    readonly optionalPremiseDetailTokens: readonly string[];
  };
  readonly expectedFactHandlingMode?: "verified_facts_only" | "creative_premise";
  /** When true, case is audio-first and subject to RETENTION_LIVE_AUDIO_FIRST policy. */
  readonly audioFirstSignOff?: boolean;
}

const ENABLED = process.env.RETENTION_LIVE_QA === "1";
const AUDIO_FIRST_REQUIRED = process.env.RETENTION_LIVE_AUDIO_FIRST === "1";
const BASE_URL = (process.env.QA_BASE_URL ?? "").replace(/\/$/, "");
const RESULTS_PATH = join(
  process.cwd(),
  "docs/qa/retention-story-live-model-results.md",
);

const CORE_TOPIC = "Spain versus France tactical preview";
const WRITE_MY_OWN_OPENING = "Spain never saw this coming";
const REALISTIC_35_TOPIC =
  "Argentina versus England dramatic match review — late pressure, fouls, and a narrow 2–1 finish that still feels unfinished";
const REALISTIC_35_CONTEXT = [
  "Focus on the emotional swing after the equalizer.",
  "Keep the narration qualitative: intensity, discipline, and late-game nerve.",
  "Do not invent extra scorelines or player statistics beyond the brief.",
  "End on why the result still leaves an open question for the next meeting.",
].join("\n");
const CREATIVE_PREMISE_DETAILS = [
  "Argentina beat England 2–1.",
  "The match had 26 fouls.",
  "The match had 35 tackles.",
].join("\n");

const REQUIRED_CORE_IDS = Object.freeze([
  "live-30-auto-fast",
  "live-30-retention-balanced",
  "live-30-standard-balanced",
  "live-30-studio",
  "live-45-auto-extended",
  "live-explicit-hook-retention",
  "live-wmo-retention",
  // Sprint 10H.3 / 10H.3A — realistic creator briefs (required for freeze eligibility).
  "live-35-studio-retention-match-review",
  "live-creative-premise-argentina",
  "live-creative-premise-with-research",
  "live-creative-premise-with-manual-context",
  "live-explicit-hook-reconcile",
] as const);

function notTested(
  id: string,
  name: string,
  reason: string,
  evidenceClass: LiveCaseResult["evidenceClass"] = "not-tested",
): LiveCaseResult {
  return { id, name, status: "Not tested", notes: reason, evidenceClass };
}

function fail(
  id: string,
  name: string,
  notes: string,
  meta?: Partial<LiveCaseResult>,
): LiveCaseResult {
  return {
    id,
    name,
    status: "Fail",
    notes,
    evidenceClass: "live-model",
    ...meta,
  };
}

function pass(
  id: string,
  name: string,
  notes: string,
  meta: {
    formatStrategyId: string;
    qualityMode: string;
    generationPath: string;
    retryOccurred?: boolean;
    retryCategory?: TransientTransportCategory | null;
  },
): LiveCaseResult {
  return {
    id,
    name,
    status: "Pass",
    notes,
    evidenceClass: "live-model",
    ...meta,
  };
}

async function postGenerate(body: Record<string, unknown>): Promise<{
  status: number;
  json: Record<string, unknown>;
  terminal: boolean;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(`${BASE_URL}/api/generate-script`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...body, stream: false }),
      signal: controller.signal,
    });
    let json: Record<string, unknown>;
    try {
      json = (await response.json()) as Record<string, unknown>;
    } catch {
      throw Object.assign(new Error("malformed_json_body"), {
        httpStatus: response.status,
      });
    }
    const terminal =
      typeof json.success === "boolean" &&
      (json.success === true
        ? typeof json.data === "object" && json.data !== null
        : typeof json.error === "string" || json.success === false);
    return { status: response.status, json, terminal };
  } finally {
    clearTimeout(timeout);
  }
}

function categorizeDefinitiveFailure(
  json: Record<string, unknown>,
  assertionError?: unknown,
): SafeRetentionLiveFailureCategory {
  if (json.success === false) {
    const diag = json.retentionDiagnostics;
    if (
      typeof diag === "object" &&
      diag !== null &&
      "failureCategory" in diag &&
      typeof (diag as { failureCategory?: string }).failureCategory === "string"
    ) {
      const cat = (diag as { failureCategory: string }).failureCategory;
      if (cat.includes("grounding") || cat.includes("validation") || cat.includes("hard_gate")) {
        return "grounding_or_validation_failure";
      }
      if (cat.includes("commit")) return "commit_failure";
    }
    return "success_false";
  }
  const message =
    assertionError instanceof Error ? assertionError.message : String(assertionError ?? "");
  if (/hook|Hook|adapterRan|hookPlan|hookDiagnostics/i.test(message)) {
    return "hook_assertion_failure";
  }
  if (/formatStrategyId|generationPath|qualityMode|expected/i.test(message)) {
    return "wrong_strategy_quality_or_path";
  }
  if (/malformed|unknown\/private|must be present|non-terminal/i.test(message)) {
    return "malformed_terminal_envelope";
  }
  return "retention_assertion_failure";
}

async function runCase(
  id: string,
  name: string,
  body: Record<string, unknown>,
  expect: CaseExpect,
): Promise<LiveCaseResult> {
  if (expect.audioFirstSignOff && !AUDIO_FIRST_REQUIRED) {
    return notTested(
      id,
      name,
      "capability-gated: voice/TTS not configured for Sprint 10 sign-off (set RETENTION_LIVE_AUDIO_FIRST=1 when required)",
      "capability-gated",
    );
  }

  let retryOccurred = false;
  let retryCategory: TransientTransportCategory | null = null;
  let attempt = 0;

  while (attempt < 2) {
    attempt += 1;
    let response: Awaited<ReturnType<typeof postGenerate>>;
    try {
      response = await postGenerate(body);
    } catch (error) {
      const httpStatus =
        typeof error === "object" &&
        error !== null &&
        "httpStatus" in error &&
        typeof (error as { httpStatus?: unknown }).httpStatus === "number"
          ? (error as { httpStatus: number }).httpStatus
          : undefined;
      const transport = classifyRetentionLiveTransportFailure({
        error,
        httpStatus,
      });
      if (transport && attempt === 1) {
        retryOccurred = true;
        retryCategory = transport;
        continue;
      }
      return fail(
        id,
        name,
        formatSafeRetentionLiveFailureSummary({
          caseId: id,
          httpStatus,
          category: transport ? "transient_transport" : "model_or_api_failure",
          expectedFormatStrategyId: expect.formatStrategyId,
          expectedQualityMode: expect.qualityMode,
          expectedGenerationPath: expect.generationPath,
          attemptCount: attempt,
          retryOccurred,
          retryCategory,
        }),
        { retryOccurred, retryCategory },
      );
    }

    // Transient HTTP statuses before parsing definitive application outcomes.
    const transportStatus = classifyRetentionLiveTransportFailure({
      httpStatus: response.status,
    });
    if (
      transportStatus &&
      attempt === 1 &&
      (response.status === 429 ||
        response.status === 500 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504)
    ) {
      // Only retry when body is not a definitive application failure envelope.
      if (response.json.success !== true && response.json.success !== false) {
        retryOccurred = true;
        retryCategory = transportStatus;
        continue;
      }
    }

    if (!response.terminal) {
      return fail(
        id,
        name,
        formatSafeRetentionLiveFailureSummary({
          caseId: id,
          httpStatus: response.status,
          category: "malformed_terminal_envelope",
          expectedFormatStrategyId: expect.formatStrategyId,
          expectedQualityMode: expect.qualityMode,
          expectedGenerationPath: expect.generationPath,
          attemptCount: attempt,
          retryOccurred,
          retryCategory,
          retentionDiagnostics: response.json.retentionDiagnostics,
        }),
        { retryOccurred, retryCategory },
      );
    }

    if (response.json.success !== true) {
      // Definitive — never retry.
      return fail(
        id,
        name,
        formatSafeRetentionLiveFailureSummary({
          caseId: id,
          httpStatus: response.status,
          category: categorizeDefinitiveFailure(response.json),
          expectedFormatStrategyId: expect.formatStrategyId,
          expectedQualityMode: expect.qualityMode,
          expectedGenerationPath: expect.generationPath,
          attemptCount: attempt,
          retryOccurred,
          retryCategory,
          retentionDiagnostics: response.json.retentionDiagnostics,
        }),
        { retryOccurred, retryCategory },
      );
    }

    try {
      // Flexible Explicit Hook: do not require exact Hook identity in envelope.
      const strictHook = expect.flexibleExplicitHook == null;
      const asserted = assertRetentionLiveSuccessEnvelope(response.json, {
        expectedGenerationPath: expect.generationPath,
        expectedFormatStrategyId: expect.formatStrategyId,
        expectedQualityMode: expect.qualityMode,
        requestedDurationSec: expect.requestedDurationSec,
        ...(strictHook
          ? {
              expectedHookStrategyId: expect.expectedHookStrategyId,
              expectedHookStrategySource: expect.expectedHookStrategySource,
            }
          : {}),
        narrationStartsWith: expect.narrationStartsWith,
        ...(expect.expectedFactHandlingMode
          ? { expectedFactHandlingMode: expect.expectedFactHandlingMode }
          : {}),
      });

      const hookPlan = response.json.hookPlan as {
        strategyId: string;
        strategySource: string;
      };
      const hookDiagnostics = response.json.hookDiagnostics as {
        strategyId: string;
        strategySource: string;
        adapterRan: boolean;
      };

      let noteExtra = "";
      if (expect.flexibleExplicitHook) {
        const flex = assertFlexibleExplicitHookLiveSemantics({
          hookPlan,
          hookDiagnostics,
          disposition: asserted.generationDisposition,
          requestedStrategyId: expect.flexibleExplicitHook.requestedStrategyId,
          requestedStrategySource:
            expect.flexibleExplicitHook.requestedStrategySource,
          writeMyOwnInvolved: false,
        });
        noteExtra = ` hook=${flex.fulfillment}:${flex.resolvedStrategyId}/${flex.resolvedStrategySource} adaptations=${asserted.generationDisposition.adaptations.join(",") || "none"}`;
      }

      if (expect.flexibleCreativePremise) {
        const premise = assertFlexibleCreativePremiseLiveSemantics({
          narration: asserted.narration,
          disposition: asserted.generationDisposition,
          requiredParticipants:
            expect.flexibleCreativePremise.requiredParticipants,
          optionalPremiseDetailTokens:
            expect.flexibleCreativePremise.optionalPremiseDetailTokens,
        });
        noteExtra = ` premise=${premise.premisePath} adaptations=${premise.adaptations.join(",") || "none"}`;
      } else if (expect.narrationMustInclude?.length) {
        const lower = asserted.narration.toLowerCase();
        for (const needle of expect.narrationMustInclude) {
          if (!lower.includes(needle.toLowerCase())) {
            throw new Error(
              `narration missing required premise/detail substring: ${needle}`,
            );
          }
        }
      }

      const retryNote = retryOccurred
        ? ` retry=${retryCategory ?? "yes"}`
        : "";
      return pass(
        id,
        name,
        `${asserted.retentionPlan.formatStrategyId} / ${expect.qualityMode} / envelope ok (attempt ${attempt}${retryNote})${noteExtra}`,
        {
          formatStrategyId: asserted.retentionPlan.formatStrategyId,
          qualityMode: expect.qualityMode,
          generationPath: expect.generationPath,
          retryOccurred,
          retryCategory,
        },
      );
    } catch (error) {
      // Assertion / strategy / path failures are definitive — never retry.
      return fail(
        id,
        name,
        formatSafeRetentionLiveFailureSummary({
          caseId: id,
          httpStatus: response.status,
          category: categorizeDefinitiveFailure(response.json, error),
          expectedFormatStrategyId: expect.formatStrategyId,
          expectedQualityMode: expect.qualityMode,
          expectedGenerationPath: expect.generationPath,
          attemptCount: attempt,
          retryOccurred,
          retryCategory,
          retentionDiagnostics: response.json.retentionDiagnostics,
          contractFingerprint:
            typeof (response.json.retentionPlan as { contractFingerprint?: string })
              ?.contractFingerprint === "string"
              ? (response.json.retentionPlan as { contractFingerprint: string })
                  .contractFingerprint
              : null,
          planFingerprint:
            typeof (response.json.retentionPlan as { planFingerprint?: string })
              ?.planFingerprint === "string"
              ? (response.json.retentionPlan as { planFingerprint: string })
                  .planFingerprint
              : null,
        }),
        { retryOccurred, retryCategory },
      );
    }
  }

  return fail(
    id,
    name,
    formatSafeRetentionLiveFailureSummary({
      caseId: id,
      category: "transient_transport",
      expectedFormatStrategyId: expect.formatStrategyId,
      expectedQualityMode: expect.qualityMode,
      expectedGenerationPath: expect.generationPath,
      attemptCount: 2,
      retryOccurred: true,
      retryCategory,
    }),
    { retryOccurred: true, retryCategory },
  );
}

function buildNotTestedTemplate(): string {
  const rows = [
    ["30s Auto / Fast", "Not tested", "RETENTION_LIVE_QA != 1"],
    ["30s Retention-first / Balanced", "Not tested", "RETENTION_LIVE_QA != 1"],
    ["30s Standard / Balanced", "Not tested", "RETENTION_LIVE_QA != 1"],
    ["30s Studio", "Not tested", "RETENTION_LIVE_QA != 1"],
    ["45s Auto / extended-short", "Not tested", "RETENTION_LIVE_QA != 1"],
    ["Explicit Hook + Retention-first", "Not tested", "RETENTION_LIVE_QA != 1"],
    ["Write My Own + Retention-first", "Not tested", "RETENTION_LIVE_QA != 1"],
    [
      "35s Studio Retention-first match review",
      "Not tested",
      "RETENTION_LIVE_QA != 1",
    ],
    [
      "Creative Premise Argentina match review",
      "Not tested",
      "RETENTION_LIVE_QA != 1",
    ],
    [
      "Creative Premise + Smart Research",
      "Not tested",
      "RETENTION_LIVE_QA != 1",
    ],
    [
      "Creative Premise + manual context",
      "Not tested",
      "RETENTION_LIVE_QA != 1",
    ],
    [
      "Explicit Hook selection",
      "Not tested",
      "RETENTION_LIVE_QA != 1",
    ],
    [
      "Full audio-first ordering",
      "Not tested",
      "capability-gated until RETENTION_LIVE_AUDIO_FIRST=1",
    ],
  ];
  return [
    "# Retention Story Core Live-Model QA Results",
    "",
    "Generated: (awaiting first gated run)",
    "RETENTION_LIVE_QA=0",
    "QA_BASE_URL=(unset)",
    "",
    "## CORE LIVE-MODEL SIGN-OFF: AWAITING (gate off)",
    "",
    "| Case | Status | Strategy | Quality | Path | Notes |",
    "|------|--------|----------|---------|------|-------|",
    ...rows.map(
      ([name, status, notes]) =>
        `| ${name} | ${status} | — | — | — | ${notes} |`,
    ),
    "",
    "Status values: Pass / Fail / Not tested.",
    "Required Core (non-research): seven script-only cases must Pass for eligibility.",
    "Audio-first: Core-required when RETENTION_LIVE_AUDIO_FIRST=1; otherwise capability-gated Not tested.",
    "Evidence Surprise / live research path is capability-gated and does not block Core Retention freeze.",
    "Generic model/API failures are Fail, never safety Pass.",
    "",
  ].join("\n");
}

function writeLiveResults(results: readonly LiveCaseResult[]): void {
  mkdirSync(join(process.cwd(), "docs/qa"), { recursive: true });

  const required = results.filter((r) =>
    (REQUIRED_CORE_IDS as readonly string[]).includes(r.id),
  );
  const requiredPass = required.every((r) => r.status === "Pass");
  const audio = results.find((r) => r.id === "live-audio-first");
  const audioOk = AUDIO_FIRST_REQUIRED
    ? audio?.status === "Pass"
    : audio?.status === "Not tested" || audio?.status === "Pass";

  const eligible = requiredPass && audioOk;

  const lines = [
    "# Retention Story Core Live-Model QA Results",
    "",
    `Generated: ${new Date().toISOString()}`,
    "RETENTION_LIVE_QA=1",
    `QA_BASE_URL=${BASE_URL}`,
    `RETENTION_LIVE_AUDIO_FIRST=${AUDIO_FIRST_REQUIRED ? "1" : "0"}`,
    "",
    eligible
      ? "## CORE LIVE-MODEL SIGN-OFF: ELIGIBLE"
      : "## CORE LIVE-MODEL SIGN-OFF: NOT ELIGIBLE",
    "",
    "| Case | Status | Strategy | Quality | Path | Notes |",
    "|------|--------|----------|---------|------|-------|",
    ...results.map((r) => {
      const notes = r.notes.replace(/\|/g, "\\|").replace(/\n/g, " ");
      return `| ${r.name} | ${r.status} | ${r.formatStrategyId ?? "—"} | ${r.qualityMode ?? "—"} | ${r.generationPath ?? "—"} | ${notes} |`;
    }),
    "",
    "Status values: Pass / Fail / Not tested.",
    "Required Core (non-research): seven script-only cases must Pass for eligibility.",
    AUDIO_FIRST_REQUIRED
      ? "Audio-first: Core-required for this run (RETENTION_LIVE_AUDIO_FIRST=1)."
      : "Audio-first: capability-gated Not tested (voice/TTS not configured for sign-off).",
    "Evidence Surprise / live research path is capability-gated and does not block Core Retention freeze.",
    "Generic model/API failures are Fail, never safety Pass.",
    "Retries: at most one, only for transient transport (connection reset / timeout / 429 / temporary 5xx).",
    "",
  ];
  writeFileSync(RESULTS_PATH, lines.join("\n"), "utf8");
  console.log(`\nWrote ${RESULTS_PATH}`);
}

function ensureNotTestedTemplateIfMissing(): void {
  if (existsSync(RESULTS_PATH)) {
    console.log(
      `\nPreserved existing live-results document (gate off): ${RESULTS_PATH}`,
    );
    return;
  }
  mkdirSync(join(process.cwd(), "docs/qa"), { recursive: true });
  writeFileSync(RESULTS_PATH, buildNotTestedTemplate(), "utf8");
  console.log(`\nCreated initial Not-tested template: ${RESULTS_PATH}`);
}

async function main(): Promise<void> {
  console.log("retentionStoryLiveModelQa (Sprint 10H.1)\n");

  const caseDefs: Array<{
    id: string;
    name: string;
    body: Record<string, unknown>;
    expect: CaseExpect;
  }> = [
    {
      id: "live-30-auto-fast",
      name: "30s Auto / Fast",
      body: {
        topic: CORE_TOPIC,
        tone: "dramatic",
        duration: 30,
        scriptMode: "story",
        mode: "script-only",
        qualityMode: "cheap",
        enableResearch: false,
        formatStrategyId: "auto",
        sceneCount: 4,
      },
      expect: {
        generationPath: "script_only",
        formatStrategyId: "short_retention",
        qualityMode: "cheap",
        requestedDurationSec: 30,
      },
    },
    {
      id: "live-30-retention-balanced",
      name: "30s Retention-first / Balanced",
      body: {
        topic: CORE_TOPIC,
        tone: "dramatic",
        duration: 30,
        scriptMode: "story",
        mode: "script-only",
        qualityMode: "balanced",
        enableResearch: false,
        formatStrategyId: "short_retention",
        sceneCount: 4,
      },
      expect: {
        generationPath: "script_only",
        formatStrategyId: "short_retention",
        qualityMode: "balanced",
        requestedDurationSec: 30,
      },
    },
    {
      id: "live-30-standard-balanced",
      name: "30s Standard / Balanced",
      body: {
        topic: CORE_TOPIC,
        tone: "dramatic",
        duration: 30,
        scriptMode: "story",
        mode: "script-only",
        qualityMode: "balanced",
        enableResearch: false,
        formatStrategyId: "short_standard",
        sceneCount: 4,
      },
      expect: {
        generationPath: "script_only",
        formatStrategyId: "short_standard",
        qualityMode: "balanced",
        requestedDurationSec: 30,
      },
    },
    {
      id: "live-30-studio",
      name: "30s Studio",
      body: {
        topic: CORE_TOPIC,
        tone: "dramatic",
        duration: 30,
        scriptMode: "story",
        mode: "script-only",
        qualityMode: "best",
        enableResearch: false,
        formatStrategyId: "auto",
        sceneCount: 4,
      },
      expect: {
        generationPath: "script_only",
        formatStrategyId: "short_retention",
        qualityMode: "best",
        requestedDurationSec: 30,
      },
    },
    {
      id: "live-45-auto-extended",
      name: "45s Auto / extended-short",
      body: {
        topic: CORE_TOPIC,
        tone: "dramatic",
        duration: 45,
        scriptMode: "story",
        mode: "script-only",
        qualityMode: "balanced",
        enableResearch: false,
        formatStrategyId: "auto",
        sceneCount: 5,
      },
      expect: {
        generationPath: "script_only",
        formatStrategyId: "extended_short",
        qualityMode: "balanced",
        requestedDurationSec: 45,
      },
    },
    {
      id: "live-explicit-hook-retention",
      name: "Explicit Hook + Retention-first",
      body: {
        topic: CORE_TOPIC,
        tone: "dramatic",
        duration: 30,
        scriptMode: "story",
        mode: "script-only",
        qualityMode: "cheap",
        enableResearch: false,
        formatStrategyId: "short_retention",
        hookStyle: "provocative_question",
        sceneCount: 4,
      },
      expect: {
        generationPath: "script_only",
        formatStrategyId: "short_retention",
        qualityMode: "cheap",
        requestedDurationSec: 30,
        // Sprint 10H.5A — Flexible: exact OR hook_style_reconciled.
        flexibleExplicitHook: {
          requestedStrategyId: "provocative_question",
          requestedStrategySource: "user_selected",
        },
      },
    },
    {
      id: "live-wmo-retention",
      name: "Write My Own + Retention-first",
      body: {
        topic: CORE_TOPIC,
        tone: "dramatic",
        duration: 30,
        scriptMode: "story",
        mode: "script-only",
        qualityMode: "cheap",
        enableResearch: false,
        formatStrategyId: "short_retention",
        hookStyle: "user_written",
        userAuthoredHook: WRITE_MY_OWN_OPENING,
        sceneCount: 4,
      },
      expect: {
        generationPath: "script_only",
        formatStrategyId: "short_retention",
        qualityMode: "cheap",
        requestedDurationSec: 30,
        expectedHookStrategyId: "user_directed",
        expectedHookStrategySource: "user_authored",
        narrationStartsWith: WRITE_MY_OWN_OPENING,
      },
    },
    {
      id: "live-35-studio-retention-match-review",
      name: "35s Studio Retention-first match review",
      body: {
        topic: REALISTIC_35_TOPIC,
        tone: "dramatic",
        duration: 35,
        scriptMode: "match_recap",
        mode: "script-only",
        qualityMode: "best",
        enableResearch: false,
        formatStrategyId: "short_retention",
        hookStyle: "auto",
        context: REALISTIC_35_CONTEXT,
        factHandlingMode: "verified_facts_only",
        sceneCount: 4,
      },
      expect: {
        generationPath: "script_only",
        formatStrategyId: "short_retention",
        qualityMode: "best",
        requestedDurationSec: 35,
        narrationMustInclude: ["Argentina", "England"],
      },
    },
    {
      id: "live-creative-premise-argentina",
      name: "Creative Premise Argentina match review",
      body: {
        topic: "Argentina versus England match review",
        tone: "dramatic",
        duration: 30,
        scriptMode: "match_recap",
        mode: "script-only",
        qualityMode: "balanced",
        enableResearch: false,
        formatStrategyId: "short_retention",
        hookStyle: "auto",
        factHandlingMode: "creative_premise",
        premiseDetails: CREATIVE_PREMISE_DETAILS,
        sceneCount: 4,
      },
      expect: {
        generationPath: "script_only",
        formatStrategyId: "short_retention",
        qualityMode: "balanced",
        requestedDurationSec: 30,
        expectedFactHandlingMode: "creative_premise",
        // Sprint 10H.5A — Flexible: 26/35 optional when omission disclosed.
        flexibleCreativePremise: {
          requiredParticipants: ["Argentina", "England"],
          optionalPremiseDetailTokens: ["26", "35"],
        },
      },
    },
    {
      id: "live-creative-premise-with-research",
      name: "Creative Premise + Smart Research",
      body: {
        topic: "Argentina versus England match review",
        tone: "dramatic",
        duration: 30,
        scriptMode: "match_recap",
        mode: "script-only",
        qualityMode: "balanced",
        enableResearch: true,
        formatStrategyId: "short_retention",
        hookStyle: "auto",
        factHandlingMode: "creative_premise",
        premiseDetails: CREATIVE_PREMISE_DETAILS,
        sceneCount: 4,
      },
      expect: {
        generationPath: "script_only",
        formatStrategyId: "short_retention",
        qualityMode: "balanced",
        requestedDurationSec: 30,
        expectedFactHandlingMode: "creative_premise",
        narrationMustInclude: ["Argentina", "England", "26", "35"],
      },
    },
    {
      id: "live-creative-premise-with-manual-context",
      name: "Creative Premise + manual context",
      body: {
        topic: "Argentina versus England match review",
        tone: "dramatic",
        duration: 35,
        scriptMode: "match_recap",
        mode: "script-only",
        qualityMode: "balanced",
        enableResearch: false,
        formatStrategyId: "short_retention",
        hookStyle: "auto",
        factHandlingMode: "creative_premise",
        premiseDetails: CREATIVE_PREMISE_DETAILS,
        context: REALISTIC_35_CONTEXT,
        sceneCount: 4,
      },
      expect: {
        generationPath: "script_only",
        formatStrategyId: "short_retention",
        qualityMode: "balanced",
        requestedDurationSec: 35,
        expectedFactHandlingMode: "creative_premise",
        narrationMustInclude: ["Argentina", "England", "26", "35"],
      },
    },
    {
      // Case id retained for evidence continuity. Creator-facing label is
      // "Explicit Hook selection" — HTTP cannot force reconciliation.
      // Forced reconcile remains H3B-1/H3B-2 + H12D (deterministic).
      id: "live-explicit-hook-reconcile",
      name: "Explicit Hook selection",
      body: {
        topic: CORE_TOPIC,
        tone: "dramatic",
        duration: 30,
        scriptMode: "story",
        mode: "script-only",
        qualityMode: "cheap",
        enableResearch: false,
        formatStrategyId: "short_retention",
        hookStyle: "contrarian_claim",
        sceneCount: 4,
      },
      expect: {
        generationPath: "script_only",
        formatStrategyId: "short_retention",
        qualityMode: "cheap",
        requestedDurationSec: 30,
        // Selected authority when it succeeds directly. Do not require
        // hook_style_reconciled — HTTP cannot force reconciliation.
      },
    },
    {
      id: "live-audio-first",
      name: "Full audio-first ordering",
      body: {
        topic: CORE_TOPIC,
        tone: "dramatic",
        duration: 30,
        scriptMode: "story",
        mode: "full",
        qualityMode: "cheap",
        enableResearch: false,
        formatStrategyId: "auto",
        sceneCount: 4,
      },
      expect: {
        generationPath: "audio_first_full",
        formatStrategyId: "short_retention",
        qualityMode: "cheap",
        requestedDurationSec: 30,
        audioFirstSignOff: true,
      },
    },
  ];

  if (!ENABLED) {
    for (const def of caseDefs) {
      const row =
        def.expect.audioFirstSignOff && !AUDIO_FIRST_REQUIRED
          ? notTested(
              def.id,
              def.name,
              "RETENTION_LIVE_QA != 1; audio-first capability-gated",
              "capability-gated",
            )
          : notTested(def.id, def.name, "RETENTION_LIVE_QA != 1");
      console.log(`  ○ ${row.name} — Not tested (${row.notes})`);
    }
    ensureNotTestedTemplateIfMissing();
    console.log("\nCore Retention live QA gated off (exit 0).");
    process.exit(0);
  }

  if (!BASE_URL) {
    console.error(
      "RETENTION_LIVE_QA=1 requires QA_BASE_URL (e.g. http://localhost:3000)",
    );
    process.exit(1);
  }

  const results: LiveCaseResult[] = [];
  for (const def of caseDefs) {
    results.push(await runCase(def.id, def.name, def.body, def.expect));
  }

  for (const row of results) {
    const mark =
      row.status === "Pass" ? "✓" : row.status === "Fail" ? "✗" : "○";
    console.log(`  ${mark} ${row.name} — ${row.status}: ${row.notes}`);
  }

  writeLiveResults(results);

  const requiredFailed = results.filter(
    (r) =>
      (REQUIRED_CORE_IDS as readonly string[]).includes(r.id) &&
      r.status !== "Pass",
  );
  const audioFailed =
    AUDIO_FIRST_REQUIRED &&
    results.some((r) => r.id === "live-audio-first" && r.status !== "Pass");

  if (requiredFailed.length > 0 || audioFailed) {
    console.error(
      `\nRetention live QA failed: ${requiredFailed.length + (audioFailed ? 1 : 0)} case(s)`,
    );
    process.exit(1);
  }

  console.log("\nAll required Core Retention live QA cases passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
