/**
 * Sprint 10E.1 / 10E.1A — Retention path-global model-call budget verification.
 */

import assert from "node:assert/strict";

import {
  RetentionStoryError,
  assertRetentionLedgerMatchesContract,
  buildDeterministicRetentionStoryPlan,
  buildRetentionStoryPlan,
  createRetentionModelCallLedger,
  finalizeRetentionGroundingClaims,
  normalizeStoryContract,
  recordDeterministicOpeningReplacement,
  resolveRetentionModelCallBudgetPolicy,
  runRetentionHookBridge,
  type RetentionModelCallLedger,
} from "@/features/retention-story";
import { buildHookGenerationContext } from "@/features/hook-engine";

import {
  coherentEnvelope,
  completePlannerProposal,
  openingComposerProposal,
} from "./retentionStoryCoherentEnvelope";

let passed = 0;

function check(label: string, fn: () => void | Promise<void>): void | Promise<void> {
  const out = fn();
  if (out instanceof Promise) {
    return out.then(() => {
      passed += 1;
      console.log(`  ✓ ${label}`);
    });
  }
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function expectLedgerInvalid(fn: () => void): void {
  assert.throws(fn, (err: unknown) =>
    err instanceof RetentionStoryError && err.reason === "model_call_ledger_invalid",
  );
}

async function main(): Promise<void> {
  console.log("\nretention-generation-budget (Sprint 10E.1 / 10E.1A)\n");

  console.log("ceilings");
  function consumeAndClose(
    ledger: RetentionModelCallLedger,
    category: Parameters<RetentionModelCallLedger["consume"]>[0],
    outcome: "succeeded" | "failed" = "succeeded",
  ): void {
    ledger.consume(category);
    ledger.recordOutcome(category, outcome);
  }

  await check("[22] Fast ceiling 5 (+1 reliability initial)", () => {
    const policy = resolveRetentionModelCallBudgetPolicy("cheap");
    assert.equal(policy.totalCeiling, 5);
    assert.equal(policy.maxPlanner, 0);
    assert.equal(policy.maxInitialNarration, 2);
    assert.equal(policy.maxRetentionBodyRewrite, 0);
    const ledger = createRetentionModelCallLedger("cheap");
    consumeAndClose(ledger, "initial_narration");
    consumeAndClose(ledger, "length_compression");
    consumeAndClose(ledger, "hook_repair");
    consumeAndClose(ledger, "hook_fallback");
    assert.equal(ledger.snapshot().counts.total, 4);
    // Reserved reliability initial narration still available.
    consumeAndClose(ledger, "initial_narration");
    assert.equal(ledger.snapshot().counts.total, 5);
    assert.throws(
      () => ledger.consume("initial_narration"),
      (err: unknown) =>
        err instanceof RetentionStoryError &&
        err.reason === "model_call_budget_exhausted",
    );
  });

  await check("[23] Balanced ceiling 6 (+1 reliability initial)", () => {
    const policy = resolveRetentionModelCallBudgetPolicy("balanced");
    assert.equal(policy.totalCeiling, 6);
    assert.equal(policy.maxPlanner, 1);
    assert.equal(policy.maxInitialNarration, 2);
    const ledger = createRetentionModelCallLedger("balanced");
    consumeAndClose(ledger, "planner");
    consumeAndClose(ledger, "initial_narration");
    consumeAndClose(ledger, "length_compression");
    consumeAndClose(ledger, "hook_repair");
    consumeAndClose(ledger, "hook_fallback");
    assert.equal(ledger.snapshot().counts.total, 5);
    consumeAndClose(ledger, "initial_narration");
    assert.equal(ledger.snapshot().counts.total, 6);
    assert.equal(ledger.canConsume("retention_body_rewrite"), false);
  });

  await check("[24] Studio ceiling 7 (+1 reliability initial)", () => {
    const policy = resolveRetentionModelCallBudgetPolicy("best");
    assert.equal(policy.totalCeiling, 7);
    assert.equal(policy.maxRetentionBodyRewrite, 1);
    assert.equal(policy.maxInitialNarration, 2);
    const ledger = createRetentionModelCallLedger("best");
    for (const cat of [
      "planner",
      "initial_narration",
      "length_compression",
      "hook_repair",
      "hook_fallback",
      "retention_body_rewrite",
    ] as const) {
      consumeAndClose(ledger, cat);
    }
    assert.equal(ledger.snapshot().counts.total, 6);
    consumeAndClose(ledger, "initial_narration");
    assert.equal(ledger.snapshot().counts.total, 7);
    assert.throws(
      () => ledger.consume("planner"),
      (err: unknown) => err instanceof RetentionStoryError,
    );
  });

  await check("[31] Scenes-only ceiling 0", () => {
    const policy = resolveRetentionModelCallBudgetPolicy("scenes_only");
    assert.equal(policy.totalCeiling, 0);
    const ledger = createRetentionModelCallLedger("scenes_only");
    assert.throws(
      () => ledger.consume("initial_narration"),
      (err: unknown) => err instanceof RetentionStoryError,
    );
  });

  console.log("ledger misuse — negatives");
  await check("[19] outcome without consume fails", () => {
    const ledger = createRetentionModelCallLedger("balanced");
    expectLedgerInvalid(() => ledger.recordOutcome("planner", "succeeded"));
  });

  await check("[20] duplicate consume while pending fails", () => {
    const ledger = createRetentionModelCallLedger("balanced");
    ledger.consume("planner");
    expectLedgerInvalid(() => ledger.consume("initial_narration"));
  });

  await check("[21] wrong category on recordOutcome fails", () => {
    const ledger = createRetentionModelCallLedger("balanced");
    ledger.consume("planner");
    expectLedgerInvalid(() => ledger.recordOutcome("initial_narration", "succeeded"));
  });

  await check("[18] deterministic opening cannot close pending", () => {
    const ledger = createRetentionModelCallLedger("cheap");
    ledger.consume("initial_narration");
    expectLedgerInvalid(() => recordDeterministicOpeningReplacement(ledger));
  });

  console.log("ledger behavior — positives");
  await check("failed calls still consume; compression shared; fallback shared", () => {
    const ledger = createRetentionModelCallLedger("balanced");
    ledger.consume("length_compression");
    ledger.recordOutcome("length_compression", "failed");
    assert.equal(ledger.canConsume("length_compression"), false);

    const fb = createRetentionModelCallLedger("balanced");
    fb.consume("hook_fallback");
    assert.equal(fb.canConsume("hook_fallback"), false);
  });

  await check("deterministic opening costs zero when no pending", () => {
    const ledger = createRetentionModelCallLedger("cheap");
    ledger.consume("initial_narration");
    ledger.recordOutcome("initial_narration", "succeeded");
    recordDeterministicOpeningReplacement(ledger);
    assert.equal(ledger.snapshot().counts.total, 1);
    assert.ok(
      ledger
        .snapshot()
        .events.some((e) => e.outcome === "skipped_deterministic"),
    );
  });

  await check("immutable snapshots; no reset API", () => {
    const ledger = createRetentionModelCallLedger("cheap");
    ledger.consume("initial_narration");
    const snap = ledger.snapshot();
    assert.ok(Object.isFrozen(snap));
    assert.ok(Object.isFrozen(snap.counts));
    assert.ok(Object.isFrozen(snap.events));
    assert.equal(ledger.snapshot().counts.initial_narration, 1);
  });

  await check("concurrent ledgers do not leak state", () => {
    const a = createRetentionModelCallLedger("cheap");
    const b = createRetentionModelCallLedger("best");
    consumeAndClose(a, "initial_narration");
    assert.equal(a.snapshot().counts.total, 1);
    assert.equal(b.snapshot().counts.total, 0);
    consumeAndClose(b, "planner");
    assert.equal(a.snapshot().counts.planner, 0);
    assert.equal(b.snapshot().counts.planner, 1);
  });

  await check("[30] ledger policy must match contract", () => {
    const contract = normalizeStoryContract({
      topic: "Spain pressure night",
      durationSec: 30,
      generationPath: "script_only",
      scriptMode: "story",
      tone: "dramatic",
      desiredReaction: "curiosity",
      qualityMode: "balanced",
    });
    const ledger = createRetentionModelCallLedger("cheap");
    assert.throws(
      () => assertRetentionLedgerMatchesContract(ledger, contract),
      (err: unknown) =>
        err instanceof RetentionStoryError &&
        err.reason === "model_call_ledger_invalid",
    );
  });

  await check("[30] combined ledger across buildRetentionStoryPlan + runRetentionHookBridge", async () => {
    const env = await coherentEnvelope("balanced");
    const ledger = env.ledger;
    assert.equal(ledger.snapshot().counts.planner, 1);

    const hookContext = buildHookGenerationContext({
      topic: env.contract.topic,
      durationSec: 30,
      scriptMode: "story",
      tone: "dramatic",
      generationPath: "script_only",
      qualityMode: "balanced",
    });
    await runRetentionHookBridge({
      contract: env.contract,
      plan: env.plan,
      strategySeed: env.strategySeed,
      grounding: env.grounding,
      hookContext,
      composer: () => openingComposerProposal(env.plan),
      ledger,
      topic: env.contract.topic,
      tone: "dramatic",
      duration: 30,
      scriptMode: "story",
    });
    assert.ok(ledger.snapshot().counts.total >= 1);
    assert.equal(ledger.policy.qualityMode, "balanced");
  });

  await check("buildRetentionStoryPlan closes planner pending on success", async () => {
    const env = await coherentEnvelope("balanced");
    const freshLedger = createRetentionModelCallLedger("balanced");
    const input = {
      contract: env.contract,
      grounding: env.grounding,
      planner: () =>
        completePlannerProposal({
          contract: env.contract,
          grounding: env.grounding,
          manualContext: null,
          userInstructions: null,
          planner: null,
        }),
      ledger: freshLedger,
    };
    const result = await buildRetentionStoryPlan(input);
    assert.equal(result.status, "ready");
    assert.equal(freshLedger.canConsume("planner"), false);
    assert.equal(freshLedger.snapshot().counts.planner, 1);
    assert.ok(
      freshLedger
        .snapshot()
        .events.some(
          (e) => e.category === "planner" && e.outcome === "succeeded",
        ),
    );
  });

  await check("diagnostics never embed private content fields", () => {
    const ledger = createRetentionModelCallLedger("balanced");
    ledger.consume("planner");
    ledger.recordOutcome("planner", "malformed");
    const json = JSON.stringify(ledger.snapshot());
    assert.equal(/"prompt"|claim text|Bearer |sk-[a-zA-Z0-9]/i.test(json), false);
    assert.equal(
      /"assembledNarration"|"segmentText"|"manualContext"/i.test(json),
      false,
    );
  });

  console.log("scenes-only ledger matrix (10E.1A)");
  await check(
    "scenes_only + scenes_only ledger → skipped sync/async, zero planner calls",
    async () => {
      const contract = normalizeStoryContract({
        topic: "AC Milan rivalry",
        durationSec: 30,
        generationPath: "scenes_only",
        scriptMode: "story",
        tone: "dramatic",
        desiredReaction: "curiosity",
        qualityMode: "balanced",
      });
      const input = {
        contract,
        grounding: finalizeRetentionGroundingClaims([]),
        planner: null,
        ledger: createRetentionModelCallLedger("scenes_only"),
      };
      const sync = buildDeterministicRetentionStoryPlan(input);
      assert.deepEqual(sync, { status: "skipped", reason: "scenes_only" });
      assert.equal(input.ledger.snapshot().counts.total, 0);

      const asyncResult = await buildRetentionStoryPlan(input);
      assert.deepEqual(asyncResult, { status: "skipped", reason: "scenes_only" });
      assert.equal(input.ledger.snapshot().counts.total, 0);
    },
  );

  await check(
    "scenes_only + cheap/balanced/best ledger → model_call_ledger_invalid",
    async () => {
      const contract = normalizeStoryContract({
        topic: "AC Milan rivalry",
        durationSec: 30,
        generationPath: "scenes_only",
        scriptMode: "story",
        tone: "dramatic",
        desiredReaction: "curiosity",
        qualityMode: "cheap",
      });
      for (const qualityMode of ["cheap", "balanced", "best"] as const) {
        const ledger = createRetentionModelCallLedger(qualityMode);
        const input = {
          contract,
          grounding: finalizeRetentionGroundingClaims([]),
          planner: null,
          ledger,
        };
        expectLedgerInvalid(() => buildDeterministicRetentionStoryPlan(input));
        await assert.rejects(
          () => buildRetentionStoryPlan(input),
          (err: unknown) =>
            err instanceof RetentionStoryError &&
            err.reason === "model_call_ledger_invalid",
        );
      }
    },
  );

  await check("scenes_only without ledger → skipped", async () => {
    const input = {
      contract: normalizeStoryContract({
        topic: "AC Milan rivalry",
        durationSec: 30,
        generationPath: "scenes_only",
        scriptMode: "story",
        tone: "dramatic",
        desiredReaction: "curiosity",
        qualityMode: "balanced",
      }),
      grounding: finalizeRetentionGroundingClaims([]),
      planner: null,
    };
    const sync = buildDeterministicRetentionStoryPlan(input);
    assert.deepEqual(sync, { status: "skipped", reason: "scenes_only" });
    const asyncResult = await buildRetentionStoryPlan(input);
    assert.deepEqual(asyncResult, { status: "skipped", reason: "scenes_only" });
  });

  console.log(`\nAll retention generation budget checks passed (${passed}).\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
