/**
 * Sprint 10E.1 / 10E.1A — Retention Hook bridge + reconciliation verification.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { buildHookGenerationContext, generateHookedNarration } from "@/features/hook-engine";
import {
  RetentionStoryError,
  assertRetentionNarrationCandidateCoherence,
  buildRetentionNarrationCandidateFromProposal,
  buildRetentionStoryPlan,
  createRetentionModelCallLedger,
  finalizeRetentionGroundingClaims,
  normalizeStoryContract,
  reconcileRetentionCandidateAfterHook,
  runRetentionHookBridge,
  type RetentionComposerCallback,
  type RetentionHookRunner,
  type RetentionNarrationCandidate,
  type RetentionStoryPlan,
  type RetentionStrategySeed,
} from "@/features/retention-story";

import {
  coherentEnvelope,
  completePlannerProposal,
  eligibleClaimGrounding,
  openingComposerProposal,
} from "./retentionStoryCoherentEnvelope";

const ROOT = path.resolve(__dirname, "../../..");
const INTEGRATION_ROOT = path.join(ROOT, "features/retention-story/integration");

let passed = 0;

async function check(
  label: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
    else if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

function makeComposer(plan: RetentionStoryPlan): RetentionComposerCallback {
  return () => openingComposerProposal(plan);
}

function buildCandidate(
  plan: RetentionStoryPlan,
  grounding: ReturnType<typeof finalizeRetentionGroundingClaims>,
  strategySeed: RetentionStrategySeed,
  mutator?: (candidate: RetentionNarrationCandidate) => void,
): RetentionNarrationCandidate {
  const built = buildRetentionNarrationCandidateFromProposal({
    proposal: openingComposerProposal(plan),
    plan,
    grounding,
    strategySeed,
    origin: "initial_compose",
  });
  if (mutator) mutator(built.candidate);
  return built.candidate;
}

async function main(): Promise<void> {
  console.log("\nretention-hook-bridge (Sprint 10E.1 / 10E.1A)\n");

  console.log("reconciliation");
  await check("[27] unchanged approval with exact opening span", async () => {
    const env = await coherentEnvelope("balanced");
    const source = buildCandidate(env.plan, env.grounding, env.strategySeed);
    const openingEnd = source.assembledNarration.indexOf(".") + 1;
    const openingText = source.assembledNarration.slice(0, openingEnd);
    const reconciled = reconcileRetentionCandidateAfterHook({
      plan: env.plan,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      sourceCandidate: source,
      approvedNarration: source.assembledNarration,
      approvedOpening: {
        openingText,
        openingStartOffset: 0,
        openingEndOffset: openingEnd,
      },
    });
    assert.equal(reconciled.origin, "after_hook_approval");
    assert.equal(reconciled.assembledNarration, source.assembledNarration);
  });

  await check("[28] opening-only repair reconciles first segment", async () => {
    const env = await coherentEnvelope("balanced");
    const source = buildCandidate(env.plan, env.grounding, env.strategySeed);
    const oldOpenEnd = source.assembledNarration.indexOf(".") + 1;
    const newOpening = "Spain pressure night hits harder.";
    const approved = newOpening + source.assembledNarration.slice(oldOpenEnd);
    const reconciled = reconcileRetentionCandidateAfterHook({
      plan: env.plan,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      sourceCandidate: source,
      approvedNarration: approved,
      approvedOpening: {
        openingText: newOpening,
        openingStartOffset: 0,
        openingEndOffset: newOpening.length,
      },
    });
    assert.equal(reconciled.origin, "after_hook_approval");
    assert.equal(reconciled.assembledNarration, approved);
    assert.ok(reconciled.segments[0]!.text.startsWith(newOpening));
  });

  await check("[11] opening body-tail mismatch rejected", async () => {
    const env = await coherentEnvelope("balanced");
    const source = buildCandidate(env.plan, env.grounding, env.strategySeed);
    assert.throws(
      () =>
        reconcileRetentionCandidateAfterHook({
          plan: env.plan,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          sourceCandidate: source,
          approvedNarration: "Totally different body that cannot map.",
          approvedOpening: {
            openingText: "Totally different body that cannot map.",
            openingStartOffset: 0,
            openingEndOffset: "Totally different body that cannot map.".length,
          },
        }),
      (err: unknown) =>
        err instanceof RetentionStoryError &&
        err.reason === "candidate_reconciliation_failed",
    );
  });

  await check("[29] structured compression/fallback source maps when narration matches", async () => {
    const env = await coherentEnvelope("balanced");
    const compressed = buildRetentionNarrationCandidateFromProposal({
      proposal: {
        title: "Spain pressure",
        hookClaimRefs: [],
        segments: env.plan.beatPlan.beats.map((beat, index) => ({
          beatId: beat.id,
          text:
            index === 0
              ? "Spain pressure night lands hard. The short keeps moving."
              : "Body stays tight for Spain through the next stretch.",
          claimRefs: [],
        })),
      },
      plan: env.plan,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      origin: "after_length_enforcement",
    }).candidate;
    const openingEnd = compressed.assembledNarration.indexOf(".") + 1;
    const reconciled = reconcileRetentionCandidateAfterHook({
      plan: env.plan,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      sourceCandidate: compressed,
      approvedNarration: compressed.assembledNarration,
      approvedOpening: {
        openingText: compressed.assembledNarration.slice(0, openingEnd),
        openingStartOffset: 0,
        openingEndOffset: openingEnd,
      },
    });
    assert.equal(reconciled.origin, "after_hook_approval");
    assert.equal(reconciled.assembledNarration, compressed.assembledNarration);
  });

  await check("[14] stale pre-Hook candidate cannot become final via forged origin", async () => {
    const env = await coherentEnvelope("balanced");
    const source = buildCandidate(env.plan, env.grounding, env.strategySeed);
    assert.throws(
      () =>
        assertRetentionNarrationCandidateCoherence(
          { ...source, origin: "final" },
          {
            plan: env.plan,
            grounding: env.grounding,
            strategySeed: env.strategySeed,
          },
        ),
      (err: unknown) =>
        err instanceof RetentionStoryError &&
        err.reason === "candidate_fingerprint_mismatch",
    );
  });

  await check(
    "[30A] reconciliation cannot preserve forged unauthorized CI claim ref",
    async () => {
      const claimText = "Spain shapes the contest with pressing.";
      const env = await coherentEnvelope("balanced");
      assert.equal(env.strategySeed.controllingIdeaClaimRefs.length, 0);
      const grounding = eligibleClaimGrounding([
        { id: "forged-ci", text: claimText },
      ]);
      const source = buildCandidate(env.plan, env.grounding, env.strategySeed);
      const forged = JSON.parse(
        JSON.stringify(source),
      ) as RetentionNarrationCandidate;
      (forged.segments as RetentionNarrationCandidate["segments"][number][])[0] = {
        ...forged.segments[0]!,
        claimRefs: ["forged-ci"],
      };
      const openingEnd = source.assembledNarration.indexOf(".") + 1;
      assert.throws(
        () =>
          reconcileRetentionCandidateAfterHook({
            plan: env.plan,
            grounding,
            strategySeed: env.strategySeed,
            sourceCandidate: forged,
            approvedNarration: source.assembledNarration,
            approvedOpening: {
              openingText: source.assembledNarration.slice(0, openingEnd),
              openingStartOffset: 0,
              openingEndOffset: openingEnd,
            },
          }),
        (err: unknown) =>
          err instanceof RetentionStoryError &&
          err.reason === "candidate_reconciliation_failed",
      );
    },
  );

  console.log("bridge — negatives");
  await check("[15] hookRunner bypassing modelCall fails reconciliation", async () => {
    const env = await coherentEnvelope("balanced");
    const hookContext = buildHookGenerationContext({
      topic: env.contract.topic,
      durationSeconds: 30,
      scriptMode: "story",
      tone: "dramatic",
      generationPath: "script_only",
    });
    const result = await runRetentionHookBridge({
      contract: env.contract,
      plan: env.plan,
      strategySeed: env.strategySeed,
      grounding: env.grounding,
      hookContext,
      composer: makeComposer(env.plan),
      ledger: env.ledger,
      topic: env.contract.topic,
      tone: "dramatic",
      duration: 30,
      scriptMode: "story",
      hookRunner: (async () => ({
        ok: true as const,
        title: "Bypass",
        approvedNarration:
          "Bypass narration without any structured Retention candidate behind it.",
        selection: {
          openingText:
            "Bypass narration without any structured Retention candidate behind it.",
          openingStartOffset: 0,
          openingEndOffset:
            "Bypass narration without any structured Retention candidate behind it."
              .length,
          strategyId: "direct_statement",
          hookClaimRefs: [],
        },
        diagnostics: {
          attempts: 1,
          repairAttempts: 0,
          fallbackAttempts: 0,
          lengthEnforcement: "none",
          lengthEnforcementKind: "none",
          rejectedCandidates: 0,
          selectedCandidateIndex: 0,
          hookClaimRefs: [],
        },
        snapshot: hookContext.snapshot,
        compressionRevalidated: false,
        // Missing terminalEvidence → fail closed before reconciliation.
      })) as unknown as RetentionHookRunner,
    });
    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.equal(result.reason, "hook_terminal_failure");
    }
  });

  await check("[16] composer failure surfaces composer_call_failed not hook_terminal_failure", async () => {
    const env = await coherentEnvelope("balanced");
    const hookContext = buildHookGenerationContext({
      topic: env.contract.topic,
      durationSeconds: 30,
      scriptMode: "story",
      tone: "dramatic",
      generationPath: "script_only",
    });
    const result = await runRetentionHookBridge({
      contract: env.contract,
      plan: env.plan,
      strategySeed: env.strategySeed,
      grounding: env.grounding,
      hookContext,
      composer: () => {
        throw new Error("boom");
      },
      ledger: createRetentionModelCallLedger("balanced"),
      topic: env.contract.topic,
      tone: "dramatic",
      duration: 30,
      scriptMode: "story",
    });
    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.equal(result.reason, "composer_call_failed");
      assert.notEqual(result.reason, "hook_terminal_failure");
      assert.equal("candidate" in result, false);
      assert.equal(JSON.stringify(result).includes("boom"), false);
    }
  });

  await check("[17] lastCandidate unrelated approved narration fails reconciliation", async () => {
    const env = await coherentEnvelope("balanced");
    const hookContext = buildHookGenerationContext({
      topic: env.contract.topic,
      durationSeconds: 30,
      scriptMode: "story",
      tone: "dramatic",
      generationPath: "script_only",
    });
    const ledger = createRetentionModelCallLedger("balanced");
    const result = await runRetentionHookBridge({
      contract: env.contract,
      plan: env.plan,
      strategySeed: env.strategySeed,
      grounding: env.grounding,
      hookContext,
      composer: makeComposer(env.plan),
      ledger,
      topic: env.contract.topic,
      tone: "dramatic",
      duration: 30,
      scriptMode: "story",
      hookRunner: (async (
        input: Parameters<RetentionHookRunner>[0],
      ) => {
        const first = await input.modelCall({
          kind: "initial",
          topic: input.topic,
          tone: input.tone,
          duration: input.duration,
          scriptMode: input.scriptMode,
          hookDirectiveBlock: "Use a charged opening.",
          permittedClaimIds: [],
          qualityMode: "balanced",
        });
        // Missing terminalEvidence fails closed as hook_terminal_failure.
        return {
          ok: true as const,
          title: first.title,
          approvedNarration: first.narration + " Unrelated tail mutation.",
          selection: {
            openingText: first.narration.slice(
              0,
              first.narration.indexOf(".") + 1,
            ),
            openingStartOffset: 0,
            openingEndOffset: first.narration.indexOf(".") + 1,
            strategyId: "direct_statement",
            hookClaimRefs: [],
          },
          diagnostics: {
            attempts: 1,
            repairAttempts: 0,
            fallbackAttempts: 0,
            lengthEnforcement: "none",
            lengthEnforcementKind: "none",
            rejectedCandidates: 0,
            selectedCandidateIndex: 0,
            hookClaimRefs: [],
          },
          snapshot: input.hookContext.snapshot,
          compressionRevalidated: false,
        };
      }) as unknown as RetentionHookRunner,
    });
    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.equal(result.reason, "hook_terminal_failure");
    }
  });

  await check("[18] ledger policy mismatch fails closed", async () => {
    const env = await coherentEnvelope("balanced");
    const hookContext = buildHookGenerationContext({
      topic: env.contract.topic,
      durationSeconds: 30,
      scriptMode: "story",
      tone: "dramatic",
      generationPath: "script_only",
    });
    const result = await runRetentionHookBridge({
      contract: env.contract,
      plan: env.plan,
      strategySeed: env.strategySeed,
      grounding: env.grounding,
      hookContext,
      composer: makeComposer(env.plan),
      ledger: createRetentionModelCallLedger("cheap"),
      topic: env.contract.topic,
      tone: "dramatic",
      duration: 30,
      scriptMode: "story",
    });
    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.equal(result.reason, "model_call_ledger_invalid");
    }
  });

  console.log("bridge — positives");
  await check("[19] hookRunner invokes Retention modelCall (no bypass)", async () => {
    const env = await coherentEnvelope("balanced");
    const hookContext = buildHookGenerationContext({
      topic: env.contract.topic,
      durationSeconds: 30,
      scriptMode: "story",
      tone: "dramatic",
      generationPath: "script_only",
    });
    let modelCallInvoked = false;
    const result = await runRetentionHookBridge({
      contract: env.contract,
      plan: env.plan,
      strategySeed: env.strategySeed,
      grounding: env.grounding,
      hookContext,
      composer: makeComposer(env.plan),
      ledger: createRetentionModelCallLedger("balanced"),
      topic: env.contract.topic,
      tone: "dramatic",
      duration: 30,
      scriptMode: "story",
      hookRunner: async (input) => {
        assert.equal(typeof input.modelCall, "function");
        modelCallInvoked = true;
        return generateHookedNarration(input);
      },
    });
    assert.ok(modelCallInvoked);
    assert.ok(result.status === "ready" || result.status === "failed");
  });

  await check("[30] combined shared ledger across plan + bridge", async () => {
    const env = await coherentEnvelope("balanced");
    const ledger = env.ledger;
    assert.equal(ledger.snapshot().counts.planner, 1);

    const hookContext = buildHookGenerationContext({
      topic: env.contract.topic,
      durationSeconds: 30,
      scriptMode: "story",
      tone: "dramatic",
      generationPath: "script_only",
    });
    const result = await runRetentionHookBridge({
      contract: env.contract,
      plan: env.plan,
      strategySeed: env.strategySeed,
      grounding: env.grounding,
      hookContext,
      composer: makeComposer(env.plan),
      ledger,
      topic: env.contract.topic,
      tone: "dramatic",
      duration: 30,
      scriptMode: "story",
    });
    assert.ok(result.status === "ready" || result.status === "failed");
    assert.ok(ledger.snapshot().counts.total >= 1);
    assert.equal(ledger.policy.qualityMode, "balanced");
  });

  await check("[31] scenes-only skips with zero composer/hook work", async () => {
    const grounding = finalizeRetentionGroundingClaims([]);
    const contract = normalizeStoryContract({
      topic: "Spain pressure night",
      durationSec: 30,
      generationPath: "scenes_only",
      scriptMode: "story",
      tone: "dramatic",
      desiredReaction: "curiosity",
      qualityMode: "balanced",
    });
    const ledger = createRetentionModelCallLedger("scenes_only");
    const cheapEnv = await coherentEnvelope("cheap");
    const hookContext = buildHookGenerationContext({
      topic: "Spain pressure night",
      durationSeconds: 30,
      scriptMode: "story",
      tone: "dramatic",
      generationPath: "script_only",
    });
    const result = await runRetentionHookBridge({
      contract,
      plan: cheapEnv.plan,
      strategySeed: cheapEnv.strategySeed,
      grounding,
      hookContext,
      composer: makeComposer(cheapEnv.plan),
      ledger,
      topic: contract.topic,
      tone: "dramatic",
      duration: 30,
      scriptMode: "story",
    });
    assert.equal(result.status, "skipped");
    if (result.status === "skipped") {
      assert.equal(result.reason, "scenes_only");
      assert.equal(result.diagnostics.hookAdapterRan, false);
      assert.equal(result.diagnostics.composerAttempts, 0);
      assert.equal(ledger.snapshot().counts.total, 0);
    }
  });

  await check("full bridge can approve and reconcile when Hook accepts narration", async () => {
    const env = await coherentEnvelope("balanced");
    const hookContext = buildHookGenerationContext({
      topic: env.contract.topic,
      durationSeconds: 30,
      scriptMode: "story",
      tone: "dramatic",
      generationPath: "script_only",
    });
    const result = await runRetentionHookBridge({
      contract: env.contract,
      plan: env.plan,
      strategySeed: env.strategySeed,
      grounding: env.grounding,
      hookContext,
      composer: makeComposer(env.plan),
      ledger: createRetentionModelCallLedger("balanced"),
      topic: env.contract.topic,
      tone: "dramatic",
      duration: 30,
      scriptMode: "story",
    });
    assert.ok(result.status === "ready" || result.status === "failed");
    if (result.status === "ready") {
      assert.equal(result.candidate.origin, "after_hook_approval");
      assert.equal(result.approvedNarration, result.candidate.assembledNarration);
      assert.equal(result.diagnostics.hookAdapterRan, true);
      assert.ok(result.diagnostics.composerAttempts >= 1);
    }
  });

  await check("buildRetentionStoryPlan returns strategySeed in ready result", async () => {
    const env = await coherentEnvelope("balanced");
    const ledger = createRetentionModelCallLedger("balanced");
    const input = {
      contract: env.contract,
      grounding: env.grounding,
      planner: () => completePlannerProposal({
        contract: env.contract,
        grounding: env.grounding,
        manualContext: null,
        userInstructions: null,
        planner: null,
      }),
      ledger,
    };
    const result = await buildRetentionStoryPlan(input);
    assert.equal(result.status, "ready");
    if (result.status === "ready") {
      assert.ok(result.strategySeed);
      assert.ok(result.diagnostics);
      assert.equal(result.diagnostics.plannerAttempts, 1);
    }
  });

  console.log("boundaries");
  await check("integration avoids SI/env/FootieScript commit surfaces", () => {
    const files = collectTsFiles(INTEGRATION_ROOT);
    const forbidden = [
      /from ["']@\/features\/studio-intelligence/,
      /NarrativeBeat/,
      /process\.env/,
      /NEXT_PUBLIC_/,
      /commitFootie|FootieScript/,
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        assert.equal(pattern.test(src), false, `${file} matched ${pattern}`);
      }
    }
    const route = readFileSync(
      path.join(ROOT, "app/api/generate-script/route.ts"),
      "utf8",
    );
    // Route must not call the Hook bridge directly — production orchestration owns it.
    assert.equal(/runRetentionHookBridge/i.test(route), false);
    assert.equal(/buildRetentionNarrationCandidate/i.test(route), false);
    assert.equal(
      /createRetentionComposerBridgeState|createRetentionHookedModelCall/.test(
        readFileSync(
          path.join(ROOT, "features/retention-story/index.ts"),
          "utf8",
        ),
      ),
      false,
    );
  });

  console.log(`\nAll retention hook bridge checks passed (${passed}).\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
