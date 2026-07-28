/**
 * Sprint 10H.5B — Targeted Explicit Hook disposition coherence (1 case).
 *
 * Activation:
 *   RETENTION_LIVE_QA=1 QA_BASE_URL=http://localhost:3000 npm run test:retention-story-live-diagnostic-qa
 *
 * Writes ONLY to docs/qa/retention-story-live-diagnostic-results.md.
 * Never overwrites docs/qa/retention-story-live-model-results.md or archives.
 * Creative Premise is not re-run (already passed under 10H.5A).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { assertRetentionLiveSuccessEnvelope } from "./assertRetentionLiveSuccessEnvelope";
import { assertFlexibleExplicitHookLiveSemantics } from "./assertRetentionLiveGenerationDisposition";
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
  readonly formatStrategyId?: string;
  readonly qualityMode?: string;
  readonly generationPath?: string;
  readonly retryOccurred?: boolean;
  readonly retryCategory?: TransientTransportCategory | null;
}

const ENABLED = process.env.RETENTION_LIVE_QA === "1";
const BASE_URL = (process.env.QA_BASE_URL ?? "").replace(/\/$/, "");
const DIAGNOSTIC_PATH = join(
  process.cwd(),
  "docs/qa/retention-story-live-diagnostic-results.md",
);
const OFFICIAL_PATH = join(
  process.cwd(),
  "docs/qa/retention-story-live-model-results.md",
);
const FIRST_ATTEMPT_PATH = join(
  process.cwd(),
  "docs/qa/retention-story-live-model-results.first-attempt.md",
);
const PRE_10H4_PATH = join(
  process.cwd(),
  "docs/qa/retention-story-live-model-results.pre-10h4.md",
);
const PRE_10H5_PATH = join(
  process.cwd(),
  "docs/qa/retention-story-live-model-results.pre-10h5.md",
);
const LAST_APPROVED_PATH = join(
  process.cwd(),
  "docs/qa/retention-story-live-model-results.last-approved.md",
);

const CORE_TOPIC = "Spain versus France tactical preview";

function sha256File(path: string): string | null {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
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
    return "success_false";
  }
  const message =
    assertionError instanceof Error
      ? assertionError.message
      : String(assertionError ?? "");
  if (/hook|Hook|adapterRan|hook_style_reconciled/i.test(message)) {
    return "hook_assertion_failure";
  }
  if (/premise|Argentina|England|26|35|factHandling|omission/i.test(message)) {
    return "retention_assertion_failure";
  }
  if (/formatStrategyId|generationPath|qualityMode|expected/i.test(message)) {
    return "wrong_strategy_quality_or_path";
  }
  if (/malformed|unknown\/private|must be present|generationDisposition/i.test(message)) {
    return "malformed_terminal_envelope";
  }
  return "retention_assertion_failure";
}

function safeHookEvidenceNotes(input: {
  readonly fulfillment: string;
  readonly requestedStrategyId: string;
  readonly requestedStrategySource: string;
  readonly resolvedStrategyId: string;
  readonly resolvedStrategySource: string;
  readonly adaptations: readonly string[];
  readonly retentionDiagnostics: unknown;
}): string {
  const diag =
    input.retentionDiagnostics != null &&
    typeof input.retentionDiagnostics === "object"
      ? (input.retentionDiagnostics as Record<string, unknown>)
      : {};
  const budget =
    diag.budget != null && typeof diag.budget === "object"
      ? (diag.budget as Record<string, unknown>)
      : {};
  const hookRepair =
    typeof budget.hookRepair === "number" ? budget.hookRepair : "?";
  const terminalState =
    typeof diag.terminalState === "string" ? diag.terminalState : "?";
  return [
    `requested=${input.requestedStrategyId}/${input.requestedStrategySource}`,
    `resolved=${input.resolvedStrategyId}/${input.resolvedStrategySource}`,
    `fulfillment=${input.fulfillment}`,
    `hookRepair=${hookRepair}`,
    `adaptations=${input.adaptations.join(",") || "none"}`,
    `terminalState=${terminalState}`,
  ].join("; ");
}

async function runFlexibleHookCase(): Promise<LiveCaseResult> {
  const id = "diag-explicit-hook-retention-flexible";
  const name = "Explicit Hook + Retention-first";
  const expect = {
    generationPath: "script_only" as const,
    formatStrategyId: "short_retention",
    qualityMode: "cheap" as const,
    requestedDurationSec: 30,
  };
  let retryOccurred = false;
  let retryCategory: TransientTransportCategory | null = null;
  let attempt = 0;

  while (attempt < 2) {
    attempt += 1;
    let response: Awaited<ReturnType<typeof postGenerate>>;
    try {
      response = await postGenerate({
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
      });
    } catch (error) {
      const transport = classifyRetentionLiveTransportFailure({ error });
      if (transport && attempt === 1) {
        retryOccurred = true;
        retryCategory = transport;
        continue;
      }
      return {
        id,
        name,
        status: "Fail",
        notes: formatSafeRetentionLiveFailureSummary({
          caseId: id,
          category: transport ? "transient_transport" : "model_or_api_failure",
          expectedFormatStrategyId: expect.formatStrategyId,
          expectedQualityMode: expect.qualityMode,
          expectedGenerationPath: expect.generationPath,
          attemptCount: attempt,
          retryOccurred,
          retryCategory,
        }),
        retryOccurred,
        retryCategory,
      };
    }

    if (response.json.success !== true) {
      return {
        id,
        name,
        status: "Fail",
        notes: formatSafeRetentionLiveFailureSummary({
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
        retryOccurred,
        retryCategory,
      };
    }

    try {
      const asserted = assertRetentionLiveSuccessEnvelope(response.json, {
        expectedGenerationPath: expect.generationPath,
        expectedFormatStrategyId: expect.formatStrategyId,
        expectedQualityMode: expect.qualityMode,
        requestedDurationSec: expect.requestedDurationSec,
      });
      const flex = assertFlexibleExplicitHookLiveSemantics({
        hookPlan: response.json.hookPlan as {
          strategyId: string;
          strategySource: string;
        },
        hookDiagnostics: response.json.hookDiagnostics as {
          strategyId: string;
          strategySource: string;
          adapterRan: boolean;
        },
        disposition: asserted.generationDisposition,
        requestedStrategyId: "provocative_question",
        requestedStrategySource: "user_selected",
        writeMyOwnInvolved: false,
      });
      // Safe notes only — no narration / premise / prompts.
      return {
        id,
        name,
        status: "Pass",
        notes: safeHookEvidenceNotes({
          fulfillment: flex.fulfillment,
          requestedStrategyId: "provocative_question",
          requestedStrategySource: "user_selected",
          resolvedStrategyId: flex.resolvedStrategyId,
          resolvedStrategySource: flex.resolvedStrategySource,
          adaptations: asserted.generationDisposition.adaptations,
          retentionDiagnostics: response.json.retentionDiagnostics,
        }),
        formatStrategyId: expect.formatStrategyId,
        qualityMode: expect.qualityMode,
        generationPath: expect.generationPath,
        retryOccurred,
        retryCategory,
      };
    } catch (error) {
      return {
        id,
        name,
        status: "Fail",
        notes: formatSafeRetentionLiveFailureSummary({
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
        }),
        retryOccurred,
        retryCategory,
      };
    }
  }

  return {
    id,
    name,
    status: "Fail",
    notes: formatSafeRetentionLiveFailureSummary({
      caseId: id,
      category: "transient_transport",
      expectedFormatStrategyId: expect.formatStrategyId,
      expectedQualityMode: expect.qualityMode,
      expectedGenerationPath: expect.generationPath,
      attemptCount: 2,
      retryOccurred: true,
      retryCategory,
    }),
    retryOccurred: true,
    retryCategory,
  };
}

function writeDiagnosticResults(
  results: readonly LiveCaseResult[],
  harnessExitCode: number,
): void {
  mkdirSync(join(process.cwd(), "docs/qa"), { recursive: true });
  const allPass = results.every((r) => r.status === "Pass");
  const lines = [
    "# Retention Story Live Diagnostic Results (Sprint 10H.5B)",
    "",
    `Generated: ${new Date().toISOString()}`,
    `RETENTION_LIVE_QA=${ENABLED ? "1" : "0"}`,
    `QA_BASE_URL=${BASE_URL || "(unset)"}`,
    `Harness exit code: ${harnessExitCode}`,
    "",
    allPass
      ? "## TARGETED EXPLICIT HOOK LIVE: PASS — full core matrix authorized"
      : "## TARGETED EXPLICIT HOOK LIVE: FAIL — full core matrix NOT authorized",
    "",
    "Creative Premise: not re-run (10H.5A targeted Pass preserved).",
    "",
    "| Case | Status | Strategy | Quality | Path | Notes |",
    "|------|--------|----------|---------|------|-------|",
    ...results.map(
      (r) =>
        `| ${r.name} | ${r.status} | ${r.formatStrategyId ?? "—"} | ${r.qualityMode ?? "—"} | ${r.generationPath ?? "—"} | ${r.notes.replace(/\|/g, "/")} |`,
    ),
    "",
    "Official + archived live-results documents are NOT modified by this harness.",
    `Official path checksum (sha256): ${sha256File(OFFICIAL_PATH) ?? "(missing)"}`,
    `Pre-10H.5 archive checksum (sha256): ${sha256File(PRE_10H5_PATH) ?? "(missing)"}`,
    `First-attempt archive checksum (sha256): ${sha256File(FIRST_ATTEMPT_PATH) ?? "(missing)"}`,
    `Last-approved archive checksum (sha256): ${sha256File(LAST_APPROVED_PATH) ?? "(missing)"}`,
    `Pre-10H.4 archive checksum (sha256): ${sha256File(PRE_10H4_PATH) ?? "(missing)"}`,
    "",
  ];
  writeFileSync(DIAGNOSTIC_PATH, lines.join("\n"), "utf8");
  console.log(`\nWrote ${DIAGNOSTIC_PATH}`);
}

async function main(): Promise<void> {
  console.log("retentionStoryLiveDiagnosticQa (Sprint 10H.5B Explicit Hook)\n");

  const beforeOfficial = sha256File(OFFICIAL_PATH);
  const beforeArchive = sha256File(FIRST_ATTEMPT_PATH);
  const beforePre10h4 = sha256File(PRE_10H4_PATH);
  const beforePre10h5 = sha256File(PRE_10H5_PATH);
  const beforeLastApproved = sha256File(LAST_APPROVED_PATH);

  // Preserve prior diagnostic evidence before overwrite.
  if (existsSync(DIAGNOSTIC_PATH)) {
    const priorDiagArchive = join(
      process.cwd(),
      "docs/qa/retention-story-live-diagnostic-results.pre-10h5b.md",
    );
    if (!existsSync(priorDiagArchive)) {
      writeFileSync(priorDiagArchive, readFileSync(DIAGNOSTIC_PATH));
      console.log(`Archived prior diagnostic → ${priorDiagArchive}`);
    }
  }

  if (!ENABLED) {
    console.log("  ○ Diagnostic live cases — Not tested (RETENTION_LIVE_QA != 1)");
    writeDiagnosticResults(
      [
        {
          id: "diag-explicit-hook-retention-flexible",
          name: "Explicit Hook + Retention-first",
          status: "Not tested",
          notes: "RETENTION_LIVE_QA != 1",
        },
      ],
      0,
    );
    process.exit(0);
  }

  if (!BASE_URL) {
    console.error("QA_BASE_URL is required when RETENTION_LIVE_QA=1");
    process.exit(1);
  }

  // 10H.5B — Explicit Hook only (Creative Premise already passed).
  const result = await runFlexibleHookCase();
  const results: LiveCaseResult[] = [result];
  const mark = result.status === "Pass" ? "✓" : "✗";
  console.log(`  ${mark} ${result.name} — ${result.status}: ${result.notes}`);

  const exitCode = results.some((r) => r.status !== "Pass") ? 1 : 0;
  writeDiagnosticResults(results, exitCode);

  const afterOfficial = sha256File(OFFICIAL_PATH);
  const afterArchive = sha256File(FIRST_ATTEMPT_PATH);
  const afterPre10h4 = sha256File(PRE_10H4_PATH);
  const afterPre10h5 = sha256File(PRE_10H5_PATH);
  const afterLastApproved = sha256File(LAST_APPROVED_PATH);
  if (beforeOfficial !== afterOfficial) {
    console.error("FATAL: official live-results document was modified during diagnosis");
    process.exit(1);
  }
  if (beforeArchive !== afterArchive) {
    console.error("FATAL: first-attempt archive was modified during diagnosis");
    process.exit(1);
  }
  if (beforePre10h4 !== afterPre10h4) {
    console.error("FATAL: pre-10H.4 archive was modified during diagnosis");
    process.exit(1);
  }
  if (beforePre10h5 !== afterPre10h5) {
    console.error("FATAL: pre-10H.5 archive was modified during diagnosis");
    process.exit(1);
  }
  if (beforeLastApproved !== afterLastApproved) {
    console.error("FATAL: last-approved archive was modified during diagnosis");
    process.exit(1);
  }
  console.log("\nPreserved official + archive live-results checksums.");

  if (exitCode !== 0) {
    console.error(
      "\nTARGETED EXPLICIT HOOK LIVE: FAIL — full core matrix NOT authorized.",
    );
    process.exit(1);
  }
  console.log(
    "\nTARGETED EXPLICIT HOOK LIVE: PASS — full core matrix authorized.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
