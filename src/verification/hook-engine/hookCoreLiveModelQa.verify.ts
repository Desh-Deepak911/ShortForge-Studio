/**
 * Sprint 7E.6A — Core Hook live-model sign-off (non-research).
 * Does not require API-Football preflight. Does not run Evidence Surprise.
 *
 * Activation:
 *   HOOK_CORE_LIVE_QA=1 QA_BASE_URL=http://localhost:3000 npm run test:hook-core-live-qa
 *
 * Gate behavior:
 * - HOOK_CORE_LIVE_QA != 1 → all cases Not tested, exit 0
 * - HOOK_CORE_LIVE_QA === 1 && missing QA_BASE_URL → configuration failure, exit non-zero
 * - HOOK_CORE_LIVE_QA === 1 && any Fail → exit non-zero
 *
 * Evidence written to docs/qa/hook-core-live-model-results.md (does not overwrite
 * docs/qa/hook-live-model-results.md).
 */
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { assertHookLiveSuccessEnvelope } from "./assertHookLiveEnvelope";

type LiveStatus = "Pass" | "Fail" | "Not tested";

interface LiveCaseResult {
  readonly id: string;
  readonly name: string;
  readonly status: LiveStatus;
  readonly notes: string;
  readonly evidenceClass: "live-model" | "not-tested";
  readonly strategyId?: string;
  readonly strategySource?: string;
  readonly generationPath?: string;
  readonly terminal?: boolean;
}

const ENABLED = process.env.HOOK_CORE_LIVE_QA === "1";
const BASE_URL = (process.env.QA_BASE_URL ?? "").replace(/\/$/, "");
const RESULTS_PATH = join(process.cwd(), "docs/qa/hook-core-live-model-results.md");

const WRITE_MY_OWN_OPENING = "Arsenal never saw this coming";
const CORE_TOPIC = "Arsenal vs Tottenham North London derby";
const MAX_ATTEMPTS = 3;

async function postGenerate(body: Record<string, unknown>): Promise<{
  ok: boolean;
  status: number;
  json: Record<string, unknown>;
  terminal: boolean;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(`${BASE_URL}/api/generate-script`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...body, stream: false }),
      signal: controller.signal,
    });
    const json = (await response.json()) as Record<string, unknown>;
    // One JSON body = one terminal response for non-stream path.
    const terminal =
      typeof json.success === "boolean" &&
      (json.success === true ? typeof json.data === "object" : typeof json.error === "string");
    return { ok: response.ok, status: response.status, json, terminal };
  } finally {
    clearTimeout(timeout);
  }
}

function notTested(id: string, name: string, reason: string): LiveCaseResult {
  return { id, name, status: "Not tested", notes: reason, evidenceClass: "not-tested" };
}

function fail(id: string, name: string, notes: string): LiveCaseResult {
  return { id, name, status: "Fail", notes, evidenceClass: "live-model", terminal: true };
}

function pass(
  id: string,
  name: string,
  notes: string,
  meta: {
    strategyId: string;
    strategySource: string;
    generationPath: string;
  },
): LiveCaseResult {
  return {
    id,
    name,
    status: "Pass",
    notes,
    evidenceClass: "live-model",
    terminal: true,
    ...meta,
  };
}

async function runCase(
  id: string,
  name: string,
  body: Record<string, unknown>,
  expect: {
    strategyId: string;
    strategySource: string;
    generationPath: "script_only";
    narrationStartsWith?: string;
  },
): Promise<LiveCaseResult> {
  const attemptNotes: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Awaited<ReturnType<typeof postGenerate>>;
    try {
      response = await postGenerate(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attemptNotes.push(`attempt ${attempt}: no terminal (${message})`);
      continue;
    }

    if (!response.terminal) {
      attemptNotes.push(`attempt ${attempt}: non-terminal envelope`);
      continue;
    }

    try {
      const { narration, hookPlan, hookDiagnostics } = assertHookLiveSuccessEnvelope(
        response.json,
        {
          expectedGenerationPath: expect.generationPath,
          expectedStrategyId: expect.strategyId,
          expectedStrategySource: expect.strategySource,
        },
      );

      if (expect.narrationStartsWith) {
        const opening = expect.narrationStartsWith.trim();
        assert.ok(
          narration.trim().startsWith(opening),
          `committed narration must begin with approved user opening "${opening}"`,
        );
      }

      assert.equal(hookPlan.strategyId, expect.strategyId);
      assert.equal(hookPlan.strategySource, expect.strategySource);
      assert.equal(hookDiagnostics.generationPath, expect.generationPath);
      assert.equal(hookDiagnostics.strategyId, expect.strategyId);
      assert.equal(hookDiagnostics.strategySource, expect.strategySource);

      return pass(
        id,
        name,
        `${expect.strategyId} / ${expect.strategySource} / envelope ok (attempt ${attempt})`,
        {
          strategyId: expect.strategyId,
          strategySource: expect.strategySource,
          generationPath: expect.generationPath,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attemptNotes.push(`attempt ${attempt}: ${message}`);
    }
  }

  return fail(id, name, attemptNotes.join(" | "));
}

function writeResults(results: readonly LiveCaseResult[]): void {
  mkdirSync(join(process.cwd(), "docs/qa"), { recursive: true });
  const allPass = results.every((r) => r.status === "Pass");
  const lines = [
    "# Hook Core Live-Model QA Results",
    "",
    `Generated: ${new Date().toISOString()}`,
    "HOOK_CORE_LIVE_QA=1",
    `QA_BASE_URL=${BASE_URL}`,
    "",
    allPass
      ? "## CORE LIVE-MODEL SIGN-OFF: ELIGIBLE"
      : "## CORE LIVE-MODEL SIGN-OFF: NOT ELIGIBLE",
    "",
    "| Case | Status | Strategy | Source | Path | Notes |",
    "|------|--------|----------|--------|------|-------|",
    ...results.map((r) => {
      const notes = r.notes.replace(/\|/g, "\\|").replace(/\n/g, " ");
      return `| ${r.name} | ${r.status} | ${r.strategyId ?? "—"} | ${r.strategySource ?? "—"} | ${r.generationPath ?? "—"} | ${notes} |`;
    }),
    "",
    "Status values: Pass / Fail / Not tested.",
    "Evidence Surprise live provider path is out of scope for Core sign-off.",
    "Previous research-dependent live evidence in hook-live-model-results.md is preserved.",
    "",
  ];
  writeFileSync(RESULTS_PATH, lines.join("\n"), "utf8");
  console.log(`\nWrote ${RESULTS_PATH}`);
}

async function main() {
  console.log("hookCoreLiveModelQa\n");

  if (!ENABLED) {
    const skipped = [
      notTested("core-auto", "Auto cold_open", "HOOK_CORE_LIVE_QA != 1"),
      notTested("core-explicit", "Explicit provocative_question", "HOOK_CORE_LIVE_QA != 1"),
      notTested("core-write-my-own", "Write My Own user_directed", "HOOK_CORE_LIVE_QA != 1"),
    ];
    for (const row of skipped) {
      console.log(`  ○ ${row.name} — Not tested (${row.notes})`);
    }
    console.log("\nCore live QA gated off (exit 0).");
    process.exit(0);
  }

  if (!BASE_URL) {
    console.error("HOOK_CORE_LIVE_QA=1 requires QA_BASE_URL (e.g. http://localhost:3000)");
    process.exit(1);
  }

  const results: LiveCaseResult[] = [];

  results.push(
    await runCase(
      "core-auto",
      "Auto cold_open",
      {
        topic: CORE_TOPIC,
        tone: "dramatic",
        duration: 30,
        scriptMode: "story",
        mode: "script-only",
        enableResearch: false,
        sceneCount: 4,
      },
      {
        strategyId: "cold_open",
        strategySource: "strategy_library",
        generationPath: "script_only",
      },
    ),
  );

  results.push(
    await runCase(
      "core-explicit",
      "Explicit provocative_question",
      {
        topic: CORE_TOPIC,
        tone: "dramatic",
        duration: 30,
        scriptMode: "story",
        mode: "script-only",
        enableResearch: false,
        hookStyle: "provocative_question",
        sceneCount: 4,
      },
      {
        strategyId: "provocative_question",
        strategySource: "user_selected",
        generationPath: "script_only",
      },
    ),
  );

  results.push(
    await runCase(
      "core-write-my-own",
      "Write My Own user_directed",
      {
        topic: CORE_TOPIC,
        tone: "dramatic",
        duration: 30,
        scriptMode: "story",
        mode: "script-only",
        enableResearch: false,
        hookStyle: "user_written",
        userAuthoredHook: WRITE_MY_OWN_OPENING,
        sceneCount: 4,
      },
      {
        strategyId: "user_directed",
        strategySource: "user_authored",
        generationPath: "script_only",
        narrationStartsWith: WRITE_MY_OWN_OPENING,
      },
    ),
  );

  for (const row of results) {
    const mark = row.status === "Pass" ? "✓" : row.status === "Fail" ? "✗" : "○";
    console.log(`  ${mark} ${row.name} — ${row.status}: ${row.notes}`);
  }

  writeResults(results);

  const failed = results.filter((r) => r.status === "Fail");
  if (failed.length > 0) {
    console.error(`\nCore live QA failed: ${failed.length} case(s)`);
    process.exit(1);
  }

  console.log("\nAll Core Hook live QA cases passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
