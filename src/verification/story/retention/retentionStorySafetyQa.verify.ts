/**
 * Sprint 10H — Retention Story structural + semantic + ledger safety QA.
 * Run: npm run test:retention-story-safety-qa
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

import {
  RetentionStoryError,
  assertNoPrivateRetentionFieldsSerialized,
  buildProductionStoryContractInput,
  buildRetentionSafeResponseEnvelope,
  createRetentionModelCallLedger,
  normalizeStoryContract,
  resolveRetentionModelCallBudgetPolicy,
  runRetentionProductionNarration,
  type RetentionProductionNarrationResult,
} from "@/features/retention-story";
import { assertCommitGateLedgerAuthority } from "@/features/retention-story/production/assert-commit-gate-ledger-authority";

import {
  assertNoSecrets,
  retentionProductionDoubles,
} from "./retentionStoryQaDoubles";
import {
  eligibleClaimGrounding,
  emptyGrounding,
} from "./retentionStoryCoherentEnvelope";

let passed = 0;

async function check(
  label: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function assertPass(
  result: RetentionProductionNarrationResult,
): asserts result is Extract<RetentionProductionNarrationResult, { ok: true }> {
  assert.equal(result.ok, true, result.ok ? "" : result.error);
}

const GENERIC_INTRO =
  /\b(in this (video|short)|today (we|i) (will|are going to)|welcome to)\b/i;

async function main(): Promise<void> {
  console.log("\nretention-story-safety-qa (Sprint 10H)\n");

  await check("immediate approved Hook + Retention before commit", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      ...retentionProductionDoubles("cheap"),
    });
    assertPass(result);
    assert.equal(result.approved.hookDiagnostics.validationOutcome, "pass");
    assert.equal(result.approved.validationSummary.ok, true);
    assert.ok(result.approved.narration.trim().length > 0);
    assert.equal(GENERIC_INTRO.test(result.approved.narration), false);
  });

  await check("one coherent controlling idea + ordered beats", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      ...retentionProductionDoubles("cheap"),
    });
    assertPass(result);
    assert.ok(result.approved.planSnapshot.controllingIdea.length > 0);
    assert.ok(result.approved.planSnapshot.beatCount >= 2);
    assert.ok(result.approved.planSnapshot.primaryEmotion.length > 0);
    assert.ok(result.approved.planSnapshot.endingStrategy.length > 0);
  });

  await check("word count within final plan budget", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      ...retentionProductionDoubles("cheap"),
    });
    assertPass(result);
    const budget = Math.round(30 * 2.4);
    const words = result.approved.narration
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    assert.ok(words <= budget, `words ${words} > budget ${budget}`);
  });

  await check("manual context never grants factual authority", () => {
    const input = buildProductionStoryContractInput({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      manualContext: "I think Spain scored 7 goals.",
      qualityMode: "cheap",
    });
    const grounding = input.grounding!;
    for (const claim of grounding.claims.filter(
      (c) => c.provenance === "manual_user",
    )) {
      assert.equal(claim.permittedFactualUse, false);
      assert.equal(claim.verification, "unverified");
    }
  });

  await check("eligible provider claims marked permitted; forbidden not", () => {
    const eligible = eligibleClaimGrounding([
      { id: "c1", text: "Spain pressed high in the first half" },
    ]);
    assert.equal(eligible.claims[0]!.permittedFactualUse, true);
    const empty = emptyGrounding();
    assert.equal(empty.claims.length, 0);
  });

  await check("failed generation — no Retention plan/validation commit", async () => {
    const result = await runRetentionProductionNarration({
      topic: "   ",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      planner: null,
      composer: () => {
        throw new Error("compose fail");
      },
    });
    assert.equal(result.ok, false);
    const envelope = buildRetentionSafeResponseEnvelope(result);
    assert.equal(envelope.retentionPlan, undefined);
    assert.equal(envelope.retentionValidation, undefined);
    assertNoSecrets(JSON.stringify(result));
    assertNoPrivateRetentionFieldsSerialized({
      type: "complete",
      success: false,
      error: result.ok ? "" : result.error,
      retentionDiagnostics: result.ok ? undefined : result.retentionDiagnostics,
    });
  });

  await check("Fast ceiling 5 — failed calls consume budget", () => {
    const policy = resolveRetentionModelCallBudgetPolicy("cheap");
    assert.equal(policy.totalCeiling, 5);
    const ledger = createRetentionModelCallLedger("cheap");
    for (const cat of [
      "initial_narration",
      "length_compression",
      "hook_repair",
      "hook_fallback",
    ] as const) {
      ledger.consume(cat);
      ledger.recordOutcome(cat, "failed");
    }
    assert.equal(ledger.snapshot().counts.total, 4);
    // Sprint 10H.3 — one reserved reliability initial remains under ceiling 5.
    ledger.consume("initial_narration");
    ledger.recordOutcome("initial_narration", "failed");
    assert.equal(ledger.snapshot().counts.total, 5);
    assert.throws(
      () => ledger.consume("length_compression"),
      (err: unknown) =>
        err instanceof RetentionStoryError &&
        err.reason === "model_call_budget_exhausted",
    );
  });

  await check("Balanced ceiling 6 + planner slot; Studio 7 + rewrite ≤1", () => {
    const balanced = resolveRetentionModelCallBudgetPolicy("balanced");
    assert.equal(balanced.totalCeiling, 6);
    assert.ok(balanced.maxPlanner >= 1);
    assert.equal(balanced.maxInitialNarration, 2);
    const studio = resolveRetentionModelCallBudgetPolicy("best");
    assert.equal(studio.totalCeiling, 7);
    assert.equal(studio.maxRetentionBodyRewrite, 1);
    assert.ok(
      resolveRetentionModelCallBudgetPolicy("cheap").maxRetentionBodyRewrite ===
        0,
    );
  });

  await check("Balanced/Studio production requires planner evidence path", async () => {
    const balanced = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "balanced",
      ...retentionProductionDoubles("balanced"),
    });
    assertPass(balanced);
    assert.ok(
      (balanced.approved.safeDiagnostics.budget?.planner ?? 0) >= 1 ||
        balanced.approved.planSnapshot.planFingerprint.length > 0,
    );

    const studio = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "best",
      ...retentionProductionDoubles("best"),
    });
    assertPass(studio);
    assert.ok(
      studio.approved.safeDiagnostics.budget?.retentionBodyRewrite !==
        undefined,
    );
    assert.ok(
      (studio.approved.safeDiagnostics.budget?.retentionBodyRewrite ?? 0) <= 1,
    );
  });

  await check("commit gate rejects forged/incoherent ledger histories", () => {
    const live = createRetentionModelCallLedger("cheap");
    live.consume("initial_narration");
    live.recordOutcome("initial_narration", "succeeded");
    const swapped = createRetentionModelCallLedger("cheap");
    swapped.consume("hook_repair");
    swapped.recordOutcome("hook_repair", "succeeded");
    assert.equal(live.snapshot().counts.total, swapped.snapshot().counts.total);
    assert.throws(() =>
      assertCommitGateLedgerAuthority({
        liveLedger: live,
        terminalBudget: swapped.snapshot(),
        bridgeBudget: live.snapshot(),
        qualityMode: "cheap",
        terminalState: "pass_without_rewrite",
      }),
    );
  });

  await check("success envelope strips private Retention fields", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      ...retentionProductionDoubles("cheap"),
    });
    assertPass(result);
    const envelope = buildRetentionSafeResponseEnvelope(result);
    const blob = JSON.stringify({
      type: "complete",
      success: true,
      ...envelope,
      hookPlan: result.approved.hookPlan,
      hookDiagnostics: result.approved.hookDiagnostics,
    });
    assertNoSecrets(blob);
    assert.equal(blob.includes("terminalHookAuthority"), false);
    assert.equal(blob.includes("promptBlock"), false);
    assertNoPrivateRetentionFieldsSerialized({
      type: "complete",
      success: true,
      ...envelope,
    });
  });

  await check("contract Auto omission vs explicit strategy identities", () => {
    const auto = normalizeStoryContract(
      buildProductionStoryContractInput({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        formatStrategyId: "auto",
        qualityMode: "cheap",
      }),
    );
    assert.equal(auto.formatStrategyId, "short_retention");

    const explicit = normalizeStoryContract(
      buildProductionStoryContractInput({
        topic: "Spain versus France tactical preview",
        durationSec: 30,
        generationPath: "script_only",
        formatStrategyId: "short_standard",
        qualityMode: "cheap",
      }),
    );
    assert.equal(explicit.formatStrategyId, "short_standard");
  });

  console.log(`\nretention-story-safety-qa — ${passed} checks passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
