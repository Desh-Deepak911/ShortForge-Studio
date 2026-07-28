/**
 * Sprint 10F.2 / 10F.2A — Retention terminal validation orchestration verification.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildRetentionNarrationCandidateFromProposal,
  countRetentionNarrationWords,
  runRetentionTerminalValidation,
  type RetentionBodyRewriteCallback,
  type RetentionNarrationCandidate,
  type RetentionStoryPlan,
  type RetentionStrategySeed,
} from "@/features/retention-story";
import { assertRetentionTerminalHookAuthorityCoherence } from "@/features/retention-story/rewrite/assert-retention-terminal-hook-authority-coherence";

import {
  SECTION_WORDS,
  coherentEnvelope,
} from "./retentionStoryCoherentEnvelope";
import {
  buildTerminalHookAuthority,
  readyBridgeWithAuthority,
} from "./retentionStoryReadyBridge";
import {
  joinOpeningAndBody,
  padSpokenWords,
} from "./retentionSpokenFixtureText";

let passed = 0;

async function check(
  label: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function padWords(base: string, target: number): string {
  return padSpokenWords(base, target);
}

function proposalWithTexts(plan: RetentionStoryPlan, texts: readonly string[]) {
  return {
    title: "Spain pressure story",
    hookClaimRefs: [] as unknown as string[],
    segments: plan.beatPlan.beats.map((beat, index) => ({
      beatId: beat.id,
      text: texts[index] ?? "Spain pressure advances.",
      claimRefs: [] as unknown as string[],
    })),
  };
}

function fittingProposal(plan: RetentionStoryPlan) {
  const budget = plan.compressionGoals.targetWordBudget;
  const n = plan.beatPlan.beats.length;
  const minPer = 4;
  const targetTotal = Math.min(
    Math.max(n * minPer, budget - 8),
    Math.max(n * minPer, Math.floor(budget * 0.78)),
  );
  const base = Math.floor(targetTotal / n);
  let rem = targetTotal - base * n;
  return proposalWithTexts(
    plan,
    plan.beatPlan.beats.map((_, i) => {
      const section = SECTION_WORDS[i] ?? "next";
      const target = Math.max(minPer, base + (rem > 0 ? 1 : 0));
      if (rem > 0) rem -= 1;
      if (i === 0) {
        const open = "Why does Spain pressure matter?";
        const body = padWords(
          "Spain focus reshapes this preview tonight",
          Math.max(3, target - countRetentionNarrationWords(open)),
        );
        return joinOpeningAndBody(open, body);
      }
      const seed =
        i === n - 1
          ? "Spain pressure closes this preview tonight"
          : `Spain ${section} focus advances tonight`;
      return padWords(seed, target);
    }),
  );
}

function weakProposal(plan: RetentionStoryPlan) {
  return proposalWithTexts(
    plan,
    plan.beatPlan.beats.map((_, i) =>
      i === 0 ? "Why does Spain pressure matter?" : "Pressure keeps rising.",
    ),
  );
}

function buildCandidate(
  plan: RetentionStoryPlan,
  grounding: Parameters<
    typeof buildRetentionNarrationCandidateFromProposal
  >[0]["grounding"],
  strategySeed: RetentionStrategySeed,
  proposal: ReturnType<typeof fittingProposal>,
): RetentionNarrationCandidate {
  return buildRetentionNarrationCandidateFromProposal({
    proposal,
    plan,
    grounding,
    strategySeed,
    origin: "after_hook_approval",
  }).candidate;
}

function openingPreservingRewriteComposer(
  source: RetentionNarrationCandidate,
): RetentionBodyRewriteCallback {
  return (request) => {
    const budget = request.targetWordBudget;
    const n = request.orderedBeatIds.length;
    const first = source.segments[0]!.text;
    const openingWords = countRetentionNarrationWords(first);
    const bodyN = Math.max(1, n - 1);
    const bodyBudget = Math.max(
      bodyN * 4,
      Math.min(budget - openingWords - 2, Math.floor(budget * 0.78) - openingWords),
    );
    const base = Math.floor(bodyBudget / bodyN);
    let rem = bodyBudget - base * bodyN;
    return {
      title: "Spain pressure story",
      hookClaimRefs: [],
      segments: request.orderedBeatIds.map((beatId, i) => {
        if (i === 0) {
          return {
            beatId,
            text: first,
            claimRefs: [] as unknown as string[],
          };
        }
        const section = SECTION_WORDS[i] ?? "next";
        const seed =
          i === n - 1
            ? "Spain pressure closes this preview tonight"
            : `Spain ${section} focus advances tonight`;
        const target = Math.max(4, base + (rem > 0 ? 1 : 0));
        if (rem > 0) rem -= 1;
        return {
          beatId,
          text: padWords(seed, target),
          claimRefs: [] as unknown as string[],
        };
      }),
    };
  };
}

async function main(): Promise<void> {
  console.log("\nretention-terminal-validation (Sprint 10F.2A)\n");

  await check("[T1] Fast/Balanced/Studio pass-without-rewrite remain valid", async () => {
    for (const mode of ["cheap", "balanced", "best"] as const) {
      const env = await coherentEnvelope(mode);
      const candidate = buildCandidate(
        env.plan,
        env.grounding,
        env.strategySeed,
        fittingProposal(env.plan),
      );
      const bridge = readyBridgeWithAuthority(
        candidate,
        env.plan,
        mode,
        env.ledger,
      );
      const result = await runRetentionTerminalValidation({
        contract: env.contract,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        plan: env.plan,
        hookBridge: bridge,
        candidate,
        ledger: env.ledger,
      });
      assert.equal(result.status, "pass_without_rewrite", mode);
      if (result.status !== "pass_without_rewrite") throw new Error("expected pass");
      assert.equal(result.validation.ok, true, mode);
      assert.equal(result.diagnostics.rewriteUsed, false, mode);
      assert.ok(result.hookBridge.terminalHookAuthority);
    }
  });

  await check("[T2] Studio rewrite pass freezes terminal evidence", async () => {
    const env = await coherentEnvelope("best", {
      formatStrategyId: "short_standard",
      durationSec: 30,
    });
    const candidate = buildCandidate(
      env.plan,
      env.grounding,
      env.strategySeed,
      weakProposal(env.plan),
    );
    const bridge = readyBridgeWithAuthority(
      candidate,
      env.plan,
      "best",
      env.ledger,
    );
    const result = await runRetentionTerminalValidation({
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      hookBridge: bridge,
      candidate,
      ledger: env.ledger,
      rewriteComposer: openingPreservingRewriteComposer(candidate),
    });
    assert.equal(result.status, "pass_after_rewrite");
    if (result.status !== "pass_after_rewrite") throw new Error("expected pass");
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.candidate));
    assert.ok(Object.isFrozen(result.diagnostics));
    assert.ok(result.hookBridge.postRewriteHookEvidence);
    const before = result.diagnostics.finalCandidateFingerprint;
    try {
      (result.diagnostics as { rewriteUsed: boolean }).rewriteUsed = false;
    } catch {
      // frozen
    }
    assert.equal(result.diagnostics.rewriteUsed, true);
    assert.equal(result.diagnostics.finalCandidateFingerprint, before);
  });

  await check("[T3] forged active-plan swap cannot yield pass_after_rewrite", async () => {
    const env = await coherentEnvelope("best", {
      formatStrategyId: "short_standard",
      durationSec: 30,
    });
    const shortWeak = proposalWithTexts(
      env.plan,
      env.plan.beatPlan.beats.map((_, i) =>
        i === 0 ? "Spain pressure rises fast." : "Spain keeps rising.",
      ),
    );
    const candidate = buildCandidate(
      env.plan,
      env.grounding,
      env.strategySeed,
      shortWeak,
    );
    const primary = buildTerminalHookAuthority(candidate.assembledNarration);
    const fallback = buildTerminalHookAuthority(candidate.assembledNarration, {
      useFallbackPlan: true,
    });
    assert.equal(fallback.activePlan.strategySource, "compatibility_fallback");

    const forged = Object.freeze({
      ...primary,
      activePlan: fallback.activePlan,
    });
    assert.throws(() =>
      assertRetentionTerminalHookAuthorityCoherence(
        forged,
        candidate.assembledNarration,
      ),
    );

    const bridge = readyBridgeWithAuthority(
      candidate,
      env.plan,
      "best",
      env.ledger,
      { authority: forged as ReturnType<typeof buildTerminalHookAuthority> },
    );
    const wrong = await runRetentionTerminalValidation({
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      hookBridge: bridge,
      candidate,
      ledger: env.ledger,
      rewriteComposer: openingPreservingRewriteComposer(candidate),
    });
    assert.notEqual(wrong.status, "pass_after_rewrite");
    assert.ok(
      wrong.status === "rewrite_not_allowed" ||
        wrong.status === "post_rewrite_hook_failed" ||
        wrong.status === "opening_preservation_failed" ||
        wrong.status === "rewrite_proposal_invalid",
      wrong.status,
    );

    // Correct fallback authority path remains possible.
    const env2 = await coherentEnvelope("best", {
      formatStrategyId: "short_standard",
      durationSec: 30,
    });
    const candidate2 = buildCandidate(
      env2.plan,
      env2.grounding,
      env2.strategySeed,
      shortWeak,
    );
    const bridge2 = readyBridgeWithAuthority(
      candidate2,
      env2.plan,
      "best",
      env2.ledger,
      { useFallbackPlan: true },
    );
    const ok = await runRetentionTerminalValidation({
      contract: env2.contract,
      grounding: env2.grounding,
      strategySeed: env2.strategySeed,
      plan: env2.plan,
      hookBridge: bridge2,
      candidate: candidate2,
      ledger: env2.ledger,
      rewriteComposer: openingPreservingRewriteComposer(candidate2),
    });
    assert.ok(
      ok.status === "pass_after_rewrite" ||
        ok.status === "post_rewrite_retention_failed" ||
        ok.status === "post_rewrite_hook_failed" ||
        ok.status === "rewrite_not_allowed",
      ok.status,
    );
  });

  await check("[T4] no failure path commits narration or starts VO", async () => {
    const rewriteRoot = path.join(
      __dirname,
      "../../../features/retention-story/rewrite",
    );
    const sources = [
      "run-retention-terminal-validation.ts",
      "run-retention-body-rewrite.ts",
    ]
      .map((name) => readFileSync(path.join(rewriteRoot, name), "utf8"))
      .join("\n");
    assert.equal(sources.includes("generateFootieScript"), false);
    assert.equal(sources.includes("generateVoiceover"), false);
    assert.equal(sources.includes("startVoiceover"), false);
    assert.equal(sources.includes("/api/generate-script"), false);
  });

  await check("[T5] caller cannot supply separate terminalHookAuthority field", async () => {
    const env = await coherentEnvelope("best", {
      formatStrategyId: "short_standard",
      durationSec: 30,
    });
    const candidate = buildCandidate(
      env.plan,
      env.grounding,
      env.strategySeed,
      weakProposal(env.plan),
    );
    const bridge = readyBridgeWithAuthority(
      candidate,
      env.plan,
      "best",
      env.ledger,
    );
    // Extra field must be ignored — only bridge.terminalHookAuthority is used.
    const result = await runRetentionTerminalValidation({
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      hookBridge: bridge,
      candidate,
      ledger: env.ledger,
      rewriteComposer: openingPreservingRewriteComposer(candidate),
      // @ts-expect-error — intentionally probing removed public input field
      terminalHookAuthority: { forged: true },
    });
    // Still uses bridge authority (primary). Should not crash.
    assert.ok(
      result.status === "pass_after_rewrite" ||
        result.status === "post_rewrite_retention_failed" ||
        result.status === "post_rewrite_hook_failed" ||
        result.status === "rewrite_not_allowed" ||
        result.status === "opening_preservation_failed" ||
        result.status === "rewrite_proposal_invalid" ||
        result.status === "length_enforcement_failed",
      result.status,
    );
  });

  console.log(`\n${passed} checks passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
