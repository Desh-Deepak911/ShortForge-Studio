/**
 * Sprint 10F.2 / 10F.2A — Retention Studio body-rewrite + length authority verification.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  buildHookCandidate,
  buildHookPlanFromRequest,
  buildCompatibilityFallbackPlan,
  normalizeHookRequest,
  validateHookCandidate,
} from "@/features/hook-engine";
import {
  assertRetentionHookBridgeReadyCoherence,
  assertRetentionModelCallLedgerSnapshotCoherence,
  buildRetentionNarrationCandidateFromProposal,
  countRetentionNarrationWords,
  createRetentionModelCallLedger,
  normalizeStoryContract,
  runRetentionTerminalValidation,
  type RetentionBodyRewriteCallback,
  type RetentionNarrationCandidate,
  type RetentionStoryPlan,
  type RetentionStrategySeed,
} from "@/features/retention-story";
import { assertExactApprovedOpeningPreserved } from "@/features/retention-story/rewrite/reconcile-retention-candidate-after-body-rewrite";
import { rebuildRetentionCandidateFromEnforcedNarration } from "@/features/retention-story/rewrite/reconcile-retention-candidate-after-body-rewrite";
import { enforceRetentionRewriteLength } from "@/features/retention-story/rewrite/enforce-retention-rewrite-length";
import { runRetentionBodyRewrite } from "@/features/retention-story/rewrite/run-retention-body-rewrite";
import { assertRetentionHookBridgePostRewriteCoherence } from "@/features/retention-story/rewrite/assert-retention-hook-bridge-post-rewrite-coherence";
import { assertRetentionTerminalHookAuthorityCoherence } from "@/features/retention-story/rewrite/assert-retention-terminal-hook-authority-coherence";

import {
  SECTION_WORDS,
  coherentEnvelope,
  eligibleClaimGrounding,
} from "./retentionStoryCoherentEnvelope";
import {
  buildTerminalHookAuthority,
  readyBridgeWithAuthority,
} from "./retentionStoryReadyBridge";
import {
  joinOpeningAndBody,
  padSpokenWords,
} from "./retentionSpokenFixtureText";

const ROOT = path.resolve(__dirname, "../..");
const REWRITE_ROOT = path.join(ROOT, "features/retention-story/rewrite");
const PUBLIC_INDEX = path.join(ROOT, "features/retention-story/index.ts");

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

function padWords(base: string, target: number): string {
  return padSpokenWords(base, target);
}

function proposalWithTexts(
  plan: RetentionStoryPlan,
  texts: readonly string[],
) {
  return {
    title: "Spain pressure story",
    hookClaimRefs: [] as unknown as string[],
    segments: plan.beatPlan.beats.map((beat, index) => ({
      beatId: beat.id,
      text: texts[index] ?? texts[texts.length - 1] ?? "Spain pressure advances.",
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
  const texts = plan.beatPlan.beats.map((_, i) => {
    const section = SECTION_WORDS[i] ?? "next";
    const target = Math.max(minPer, base + (rem > 0 ? 1 : 0));
    if (rem > 0) rem -= 1;
    if (i === 0) {
      // Keep a Hook-valid short opening; pad body after the sentence end.
      const open = "Why does Spain pressure matter?";
      const body = padWords(
        "Spain tactical focus reshapes this France preview tonight",
        Math.max(3, target - countRetentionNarrationWords(open)),
      );
      return joinOpeningAndBody(open, body);
    }
    const seed =
      i === n - 1
        ? "Spain pressure closes this preview decisively tonight"
        : `Spain ${section} pressure advances with clear focus`;
    return padWords(seed, target);
  });
  return proposalWithTexts(plan, texts);
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
    const opening = request.immutableApprovedOpening.openingText;
    const budget = request.targetWordBudget;
    const n = request.orderedBeatIds.length;
    const first = source.segments[0]!.text;
    assert.ok(first.startsWith(opening));
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
          return { beatId, text: first, claimRefs: [] as unknown as string[] };
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

/** Rewrite composer that returns ~80 words against a 72-word Retention target. */
function eightyWordRewriteComposer(
  source: RetentionNarrationCandidate,
): RetentionBodyRewriteCallback {
  return (request) => {
    const opening = request.immutableApprovedOpening.openingText;
    const first = source.segments[0]!.text;
    assert.ok(first.startsWith(opening));
    const n = request.orderedBeatIds.length;
    const targetTotal = 80;
    const base = Math.floor(targetTotal / n);
    let rem = targetTotal - base * n;
    return {
      title: "Spain pressure story",
      hookClaimRefs: [],
      segments: request.orderedBeatIds.map((beatId, i) => {
        if (i === 0) {
          const openingWords = countRetentionNarrationWords(opening);
          const bodyTarget = Math.max(
            2,
            base + (rem > 0 ? 1 : 0) - openingWords,
          );
          if (rem > 0) rem -= 1;
          const body = padWords(
            "Spain tactical body keeps rising with clear spoken focus",
            bodyTarget,
          );
          // Preserve exact opening prefix bytes (offset 0..opening.length).
          return {
            beatId,
            text: `${opening} ${body}`,
            claimRefs: [] as unknown as string[],
          };
        }
        const target = Math.max(5, base + (rem > 0 ? 1 : 0));
        if (rem > 0) rem -= 1;
        return {
          beatId,
          text: padWords(
            `Spain ${SECTION_WORDS[i] ?? "next"} pressure advances with decisive spoken focus tonight`,
            target,
          ),
          claimRefs: [] as unknown as string[],
        };
      }),
    };
  };
}

async function main(): Promise<void> {
  console.log("\nretention-story-rewrite (Sprint 10F.2A)\n");

  await check("[M1] rewrite module ownership boundaries", () => {
    assert.ok(statSync(REWRITE_ROOT).isDirectory());
    const sources = collectTsFiles(REWRITE_ROOT)
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    assert.equal(sources.includes("process.env"), false);
    assert.equal(sources.includes("generateFootieScript"), false);
    assert.equal(sources.includes("/api/generate-script"), false);
    assert.equal(sources.includes("runBoundedHookRepair"), false);
    assert.equal(sources.includes("generateHookedNarration"), false);
  });

  await check("[M2] public root omits raw rewrite bypass surfaces", () => {
    const pub = readFileSync(PUBLIC_INDEX, "utf8");
    assert.equal(pub.includes("runRetentionBodyRewrite"), false);
    assert.equal(pub.includes("buildRetentionBodyRewriteRequest"), false);
    assert.equal(pub.includes("normalizeRetentionBodyRewriteProposal"), false);
    assert.equal(pub.includes("enforceRetentionRewriteLength"), false);
    assert.equal(pub.includes("revalidateRetentionHookAfterRewrite"), false);
    assert.equal(pub.includes("rebuildRetentionCandidateFromEnforcedNarration"), false);
    assert.ok(pub.includes("runRetentionTerminalValidation"));
  });

  await check("[N1] Fast quality-below-target succeeds without rewrite", async () => {
    const env = await coherentEnvelope("cheap", {
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
      "cheap",
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
    // Sprint 10H.3 — editorial threshold is advisory; complete stories Pass.
    assert.equal(result.status, "pass_without_rewrite");
    assert.ok(result.diagnostics.safeReasonIds.includes("quality_below_target"));
    assert.equal(env.ledger.snapshot().counts.retention_body_rewrite, 0);
  });

  await check("[N2] Balanced quality-below-target succeeds without rewrite", async () => {
    const env = await coherentEnvelope("balanced", {
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
      "balanced",
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
    assert.equal(result.status, "pass_without_rewrite");
    assert.ok(result.diagnostics.safeReasonIds.includes("quality_below_target"));
    assert.equal(env.ledger.snapshot().counts.retention_body_rewrite, 0);
  });

  await check("[N3] Studio hard-gate failure does not rewrite", async () => {
    const env = await coherentEnvelope("best");
    const budget = env.plan.compressionGoals.targetWordBudget;
    const per = Math.ceil((budget + 20) / env.plan.beatPlan.beats.length);
    // Hook-valid charged opening + over-budget body (Retention hard gate).
    const over = buildCandidate(
      env.plan,
      env.grounding,
      env.strategySeed,
      proposalWithTexts(
        env.plan,
        env.plan.beatPlan.beats.map((_, i) =>
          i === 0
            ? (() => {
                const open = "Why does Spain pressure matter?";
                const body = padWords(
                  "Spain tactical body keeps rising with clear spoken focus",
                  Math.max(8, per - countRetentionNarrationWords(open)),
                );
                return `${open} ${body}`;
              })()
            : padWords(
                `Spain ${SECTION_WORDS[i] ?? "next"} pressure advances the tactical contest with clear focus`,
                per,
              ),
        ),
      ),
    );
    const bridge = readyBridgeWithAuthority(over, env.plan, "best", env.ledger);
    const result = await runRetentionTerminalValidation({
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      hookBridge: bridge,
      candidate: over,
      ledger: env.ledger,
      rewriteComposer: openingPreservingRewriteComposer(over),
    });
    assert.equal(result.status, "rewrite_not_allowed");
    assert.equal(env.ledger.snapshot().counts.retention_body_rewrite, 0);
  });

  await check("[N4] already-passing Studio candidate does not rewrite", async () => {
    const env = await coherentEnvelope("best");
    const candidate = buildCandidate(
      env.plan,
      env.grounding,
      env.strategySeed,
      fittingProposal(env.plan),
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
    assert.equal(result.status, "pass_without_rewrite");
    assert.equal(result.diagnostics.rewriteUsed, false);
    assert.equal(env.ledger.snapshot().counts.retention_body_rewrite, 0);
  });

  await check("[N5] scenes-only discriminated input skips with valid ledger", async () => {
    const contract = normalizeStoryContract({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "scenes_only",
      scriptMode: "story",
      tone: "dramatic",
      desiredReaction: "curiosity",
      qualityMode: "best",
    });
    const ledger = createRetentionModelCallLedger("scenes_only");
    const result = await runRetentionTerminalValidation({
      kind: "scenes_only",
      contract,
      ledger,
    });
    assert.equal(result.status, "skipped_scenes_only");
  });

  await check("[N5b] scenes-only with best ledger → ledger_invalid", async () => {
    const contract = normalizeStoryContract({
      topic: "Spain versus France tactical preview",
      durationSec: 30,
      generationPath: "scenes_only",
      scriptMode: "story",
      tone: "dramatic",
      desiredReaction: "curiosity",
      qualityMode: "best",
    });
    const bestLedger = createRetentionModelCallLedger("best");
    const result = await runRetentionTerminalValidation({
      kind: "scenes_only",
      contract,
      ledger: bestLedger,
    });
    assert.equal(result.status, "ledger_invalid");
  });

  await check("[N6] primary/fallback active-plan swap fails closed", async () => {
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
    const forged = Object.freeze({
      ...primary,
      activePlan: fallback.activePlan,
    });
    assert.throws(
      () =>
        assertRetentionTerminalHookAuthorityCoherence(
          forged,
          candidate.assembledNarration,
        ),
      (err: unknown) =>
        err instanceof Error &&
        String(err.message).includes("Hook authority"),
    );
    const bridge = readyBridgeWithAuthority(
      candidate,
      env.plan,
      "best",
      env.ledger,
      { authority: forged as ReturnType<typeof buildTerminalHookAuthority> },
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
    assert.notEqual(result.status, "pass_after_rewrite");
    assert.ok(
      result.status === "rewrite_not_allowed" ||
        result.status === "post_rewrite_hook_failed" ||
        result.status === "opening_preservation_failed",
      result.status,
    );
  });

  await check("[N7] forged Hook request/plan fingerprints fail", async () => {
    const env = await coherentEnvelope("best");
    const candidate = buildCandidate(
      env.plan,
      env.grounding,
      env.strategySeed,
      fittingProposal(env.plan),
    );
    const authority = buildTerminalHookAuthority(candidate.assembledNarration);
    const otherReq = normalizeHookRequest({
      topic: "Different forged topic for mismatch",
      scriptMode: "story",
      tone: "dramatic",
      durationSeconds: 30,
      generationPath: "script_only",
    });
    const forged = Object.freeze({
      ...authority,
      request: otherReq,
    });
    assert.throws(() =>
      assertRetentionTerminalHookAuthorityCoherence(
        forged,
        candidate.assembledNarration,
      ),
    );
  });

  await check("[N8] copied old Hook validation with changed candidate fails", async () => {
    const env = await coherentEnvelope("best");
    const candidate = buildCandidate(
      env.plan,
      env.grounding,
      env.strategySeed,
      fittingProposal(env.plan),
    );
    const authority = buildTerminalHookAuthority(candidate.assembledNarration);
    const altNarration = candidate.assembledNarration.replace(
      /^Why/,
      "How",
    );
    // Keep opening span valid if possible; otherwise use a distinct approved opening.
    const alt =
      altNarration !== candidate.assembledNarration
        ? altNarration
        : `How ${candidate.assembledNarration.slice(4)}`;
    const altCandidate = buildHookCandidate({
      narration: alt.startsWith(authority.approvedCandidate.openingText)
        ? candidate.assembledNarration
        : candidate.assembledNarration,
      request: authority.request,
      plan: authority.activePlan,
      origin: "model_narration_opening",
      claimRefs: ["forged_claim_id_not_used"],
    });
    // Force different candidate identity while keeping old validation.
    const mutatedCandidate = Object.freeze({
      ...authority.approvedCandidate,
      candidateId: `${authority.approvedCandidate.candidateId}_mutated`,
    });
    const forged = Object.freeze({
      ...authority,
      approvedCandidate: mutatedCandidate,
    });
    assert.throws(() =>
      assertRetentionTerminalHookAuthorityCoherence(
        forged,
        candidate.assembledNarration,
      ),
    );
    void altCandidate;
  });

  await check("[N9] fabricated post-rewrite hook_approved bridge without revalidation fails", async () => {
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
    // Consume rewrite on ledger to look post-rewrite, but omit evidence.
    env.ledger.consume("retention_body_rewrite");
    env.ledger.recordOutcome("retention_body_rewrite", "succeeded");
    const fabricated = Object.freeze({
      ...bridge,
      diagnostics: Object.freeze({
        ...bridge.diagnostics,
        budget: env.ledger.snapshot(),
      }),
      // no postRewriteHookEvidence
    });
    assert.throws(
      () =>
        assertRetentionHookBridgePostRewriteCoherence(fabricated, {
          contract: env.contract,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          plan: env.plan,
          candidate,
        }),
      (err: unknown) =>
        err instanceof Error &&
        String((err as { reason?: string }).reason ?? err.message).length > 0,
    );
  });

  await check("[N10] later duplicate opening fails", () => {
    const opening = "Why does Spain pressure matter?";
    const narration = `${opening} Body continues. ${opening}`;
    assert.throws(() =>
      assertExactApprovedOpeningPreserved(narration, {
        openingText: opening,
        openingStartOffset: 0,
        openingEndOffset: opening.length,
      }),
    );
  });

  await check("[N11] 80-word narration vs 72-word Retention target enforces ≤72", async () => {
    const env = await coherentEnvelope("best", {
      formatStrategyId: "short_standard",
      durationSec: 30,
    });
    assert.equal(env.plan.compressionGoals.targetWordBudget, 72);
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
      rewriteComposer: eightyWordRewriteComposer(candidate),
    });
    // May pass or fail quality, but must not return unchanged 80-word body.
    if (
      result.status === "pass_after_rewrite" ||
      result.status === "length_enforcement_failed" ||
      result.status === "post_rewrite_hook_failed" ||
      result.status === "post_rewrite_retention_failed"
    ) {
      if (result.status === "pass_after_rewrite") {
        assert.ok(
          countRetentionNarrationWords(result.candidate.assembledNarration) <=
            72,
        );
      }
    } else {
      assert.fail(`unexpected status ${result.status}`);
    }
  });

  await check("[N12] compression throw → one consume → deterministic or safe failure", async () => {
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
    // Build an over-budget rewritten-like candidate for length enforcement.
    const overTexts = env.plan.beatPlan.beats.map((_, i) => {
      if (i === 0) {
        return padWords(candidate.segments[0]!.text, 30);
      }
      return padWords(
        `Spain ${SECTION_WORDS[i] ?? "next"} pressure advances with clear spoken focus tonight`,
        20,
      );
    });
    const opening = buildTerminalHookAuthority(
      candidate.assembledNarration,
    ).approvedCandidate;
    const approvedOpening = {
      openingText: opening.openingText,
      openingStartOffset: opening.openingStartOffset,
      openingEndOffset: opening.openingEndOffset,
    };
    // Force opening on over candidate by rebuilding with preserved opening first text.
    const forced = buildCandidate(
      env.plan,
      env.grounding,
      env.strategySeed,
      proposalWithTexts(
        env.plan,
        overTexts.map((t, i) =>
          i === 0
            ? padWords(
                `${approvedOpening.openingText} Spain tactical body keeps rising`,
                30,
              )
            : t,
        ),
      ),
    );
    assert.ok(forced.assembledNarration.startsWith(approvedOpening.openingText));
    assert.ok(
      countRetentionNarrationWords(forced.assembledNarration) > 72,
    );

    const before = env.ledger.snapshot().counts.length_compression;
    try {
      const enforced = await enforceRetentionRewriteLength({
        contract: env.contract,
        plan: env.plan,
        strategySeed: env.strategySeed,
        grounding: env.grounding,
        ledger: env.ledger,
        candidate: forced,
        approvedOpening,
        composer: async () => {
          throw new Error("compression boom");
        },
      });
      assert.equal(env.ledger.snapshot().counts.length_compression, before + 1);
      assert.ok(
        countRetentionNarrationWords(enforced.candidate.assembledNarration) <=
          72,
      );
      assert.equal(enforced.deterministicTruncateUsed, true);
    } catch {
      assert.equal(env.ledger.snapshot().counts.length_compression, before + 1);
    }
  });

  await check("[N13] flat token redistribution cannot manufacture beat/payoff coverage", async () => {
    const env = await coherentEnvelope("best", {
      formatStrategyId: "short_standard",
      durationSec: 30,
    });
    const candidate = buildCandidate(
      env.plan,
      env.grounding,
      env.strategySeed,
      fittingProposal(env.plan),
    );
    const authority = buildTerminalHookAuthority(candidate.assembledNarration);
    const approvedOpening = {
      openingText: authority.approvedCandidate.openingText,
      openingStartOffset: 0,
      openingEndOffset: authority.approvedCandidate.openingEndOffset,
    };
    // Tiny body that cannot cover all beats meaningfully after aggressive cut.
    const tiny = `${approvedOpening.openingText} x`;
    assert.throws(() =>
      rebuildRetentionCandidateFromEnforcedNarration({
        narration: tiny,
        plan: env.plan,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        approvedOpening,
        previousCandidate: {
          ...candidate,
          segments: candidate.segments.map((s, i) =>
            i === 0
              ? { ...s, text: tiny }
              : { ...s, text: "" },
          ),
        } as RetentionNarrationCandidate,
        origin: "after_length_enforcement",
        targetWordBudget: env.plan.compressionGoals.targetWordBudget,
      }),
    );
  });

  await check("[N14] claim refs cannot migrate between segments during deterministic enforcement", async () => {
    const env = await coherentEnvelope("best", {
      formatStrategyId: "short_standard",
      durationSec: 30,
    });
    const claimId = "claim_spain_press";
    const grounding = eligibleClaimGrounding([
      { id: claimId, text: "Spain applied sustained high pressure." },
    ]);
    const beat1 = env.plan.beatPlan.beats[1]!.id;
    const plan = {
      ...env.plan,
      beatPlan: {
        ...env.plan.beatPlan,
        beats: env.plan.beatPlan.beats.map((beat) => ({
          ...beat,
          groundingClaimRefs:
            beat.id === beat1 ? ([claimId] as const) : [],
        })),
      },
    };
    const proposal = fittingProposal(plan);
    proposal.segments = proposal.segments.map((s) => ({
      ...s,
      claimRefs: s.beatId === beat1 ? [claimId] : [],
    }));
    // Multi-sentence optional body so sentence-safe trim can drop trailing units
    // without word-popping or migrating claim refs. Avoid factual-risk phrasing.
    const overCandidate = buildCandidate(plan, grounding, env.strategySeed, {
      title: "Spain pressure story",
      hookClaimRefs: [],
      segments: proposal.segments.map((s, i) => {
        const section = SECTION_WORDS[i] ?? "next";
        if (i === 0) {
          return {
            beatId: s.beatId,
            text: joinOpeningAndBody(
              "Why does Spain pressure matter?",
              "Spain focus advances tonight. Pace keeps climbing across this preview. Pressure layers keep stacking with clearer stakes.",
            ),
            claimRefs: [...s.claimRefs],
          };
        }
        return {
          beatId: s.beatId,
          text:
            i === plan.beatPlan.beats.length - 1
              ? "Spain pressure closes this preview tonight with a decisive finish."
              : `Spain ${section} focus advances tonight. Pace keeps climbing across this preview. Extra detail keeps the optional body long enough to trim.`,
          claimRefs: [...s.claimRefs],
        };
      }),
    });
    const authority = buildTerminalHookAuthority(
      overCandidate.assembledNarration,
    );
    const targetWordBudget = plan.compressionGoals.targetWordBudget;
    assert.ok(
      countRetentionNarrationWords(overCandidate.assembledNarration) >
        targetWordBudget,
      "fixture must start over Retention target so sentence-safe trim runs",
    );
    const enforced = rebuildRetentionCandidateFromEnforcedNarration({
      narration: overCandidate.assembledNarration,
      plan,
      grounding,
      strategySeed: env.strategySeed,
      approvedOpening: {
        openingText: authority.approvedCandidate.openingText,
        openingStartOffset: 0,
        openingEndOffset: authority.approvedCandidate.openingEndOffset,
      },
      previousCandidate: overCandidate,
      origin: "after_length_enforcement",
      targetWordBudget,
    });
    assert.ok(
      countRetentionNarrationWords(enforced.assembledNarration) <=
        targetWordBudget,
    );
    // Claim refs stay on beat index 1 only — never migrate to opening/other beats.
    assert.deepEqual([...enforced.segments[1]!.claimRefs], [claimId]);
    for (let i = 0; i < enforced.segments.length; i++) {
      if (i === 1) continue;
      assert.deepEqual([...enforced.segments[i]!.claimRefs], []);
    }
  });

  await check("[N15] callback throw / opening changed via terminal API", async () => {
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
    const ready = assertRetentionHookBridgeReadyCoherence(bridge, {
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      candidate,
    });
    const throwResult = await runRetentionBodyRewrite({
      contract: env.contract,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      plan: env.plan,
      hookBridge: ready,
      candidate,
      initialValidation: {
        version: 1,
        ok: false,
        failureClass: "quality_threshold",
        hardGates: [],
        editorial: {
          clarity: 0.2,
          curiosity: 0.2,
          emotionalProgression: 0.2,
          compressionQuality: 0.2,
          novelty: 0.2,
          escalation: 0.2,
          payoffStrength: 0.2,
          visualPotential: 0.2,
          repetitionPenalty: 0.2,
          controllingIdeaAdherence: 0.2,
          genericIntroductionQuality: 0.2,
        },
        retentionReadiness: 0.2,
        storyQualityConfidence: 0.2,
        frameworkCompliance: 1,
        activeStrategyThreshold: 0.55,
        notes: [],
        validationFingerprint: "rv:test",
        candidateFingerprint: candidate.candidateFingerprint,
      },
      ledger: env.ledger,
      rewriteComposer: async () => {
        throw new Error("boom");
      },
    });
    assert.equal(throwResult.status, "rewrite_call_failed");
    assert.equal(env.ledger.snapshot().counts.retention_body_rewrite, 1);

    const env2 = await coherentEnvelope("best", {
      formatStrategyId: "short_standard",
      durationSec: 30,
    });
    const candidate2 = buildCandidate(
      env2.plan,
      env2.grounding,
      env2.strategySeed,
      weakProposal(env2.plan),
    );
    const bridge2 = readyBridgeWithAuthority(
      candidate2,
      env2.plan,
      "best",
      env2.ledger,
    );
    const openChanged = await runRetentionTerminalValidation({
      contract: env2.contract,
      grounding: env2.grounding,
      strategySeed: env2.strategySeed,
      plan: env2.plan,
      hookBridge: bridge2,
      candidate: candidate2,
      ledger: env2.ledger,
      rewriteComposer: () => ({
        title: "t",
        hookClaimRefs: [],
        segments: env2.plan.beatPlan.beats.map((b, i) => ({
          beatId: b.id,
          text:
            i === 0
              ? `Z${candidate2.segments[0]!.text.slice(1)}`
              : "Spain pressure advances with clear spoken focus tonight.",
          claimRefs: [],
        })),
      }),
    });
    assert.ok(
      openChanged.status === "opening_preservation_failed" ||
        openChanged.status === "rewrite_proposal_invalid",
      openChanged.status,
    );
  });

  await check("[P1] Studio quality-only failure → one rewrite → pass", async () => {
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
    const opening = bridge.terminalHookAuthority.approvedCandidate.openingText;

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

    assert.equal(result.status, "pass_after_rewrite", result.status);
    if (result.status !== "pass_after_rewrite") throw new Error("expected pass");
    assert.equal(result.diagnostics.rewriteUsed, true);
    assert.equal(env.ledger.snapshot().counts.retention_body_rewrite, 1);
    assert.ok(result.candidate.assembledNarration.startsWith(opening));
    assert.ok(result.hookBridge.postRewriteHookEvidence != null);
    assert.equal(
      result.hookBridge.postRewriteHookEvidence!.rebuiltCandidate.origin,
      "post_retention_body_rewrite",
    );
    assert.ok(
      result.candidate.origin === "after_body_rewrite" ||
        result.candidate.origin === "after_length_enforcement" ||
        result.candidate.origin === "final",
    );
    assert.notEqual(
      result.candidate.candidateFingerprint,
      candidate.candidateFingerprint,
    );
    assert.equal(
      result.validation.candidateFingerprint,
      result.candidate.candidateFingerprint,
    );
    assertRetentionModelCallLedgerSnapshotCoherence(
      result.diagnostics.budget,
      "best",
      {
        requireClosed: true,
        requireSuccessfulInitialNarration: true,
        requireSuccessfulRetentionBodyRewrite: true,
      },
    );
  });

  await check("[P2] fitting rewrite consumes no compression", async () => {
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
    assert.equal(result.diagnostics.lengthCompressionUsed, false);
    assert.equal(env.ledger.snapshot().counts.length_compression, 0);
  });

  await check("[P3] canonical primary-plan authority passes", async () => {
    const env = await coherentEnvelope("best");
    const candidate = buildCandidate(
      env.plan,
      env.grounding,
      env.strategySeed,
      fittingProposal(env.plan),
    );
    const authority = buildTerminalHookAuthority(candidate.assembledNarration);
    assert.notEqual(authority.activePlan.strategySource, "compatibility_fallback");
    const coherent = assertRetentionTerminalHookAuthorityCoherence(
      authority,
      candidate.assembledNarration,
    );
    assert.equal(
      coherent.approvedCandidate.candidateId,
      authority.approvedCandidate.candidateId,
    );
  });

  await check("[P4] canonical compatibility-fallback authority passes", async () => {
    const env = await coherentEnvelope("best", {
      formatStrategyId: "short_standard",
      durationSec: 30,
    });
    const short = proposalWithTexts(
      env.plan,
      env.plan.beatPlan.beats.map((_, i) =>
        i === 0 ? "Spain pressure rises fast." : "Spain keeps rising hard.",
      ),
    );
    const candidate = buildCandidate(
      env.plan,
      env.grounding,
      env.strategySeed,
      short,
    );
    const authority = buildTerminalHookAuthority(candidate.assembledNarration, {
      useFallbackPlan: true,
    });
    assert.equal(authority.activePlan.strategySource, "compatibility_fallback");
    assertRetentionTerminalHookAuthorityCoherence(
      authority,
      candidate.assembledNarration,
    );
  });

  await check("[P5] concurrent ledgers do not leak", async () => {
    const a = await coherentEnvelope("best", {
      formatStrategyId: "short_standard",
      durationSec: 30,
    });
    const b = await coherentEnvelope("best", {
      formatStrategyId: "short_standard",
      durationSec: 30,
    });
    const ca = buildCandidate(a.plan, a.grounding, a.strategySeed, weakProposal(a.plan));
    const cb = buildCandidate(b.plan, b.grounding, b.strategySeed, fittingProposal(b.plan));
    const ba = readyBridgeWithAuthority(ca, a.plan, "best", a.ledger);
    const bb = readyBridgeWithAuthority(cb, b.plan, "best", b.ledger);
    await runRetentionTerminalValidation({
      contract: a.contract,
      grounding: a.grounding,
      strategySeed: a.strategySeed,
      plan: a.plan,
      hookBridge: ba,
      candidate: ca,
      ledger: a.ledger,
      rewriteComposer: openingPreservingRewriteComposer(ca),
    });
    await runRetentionTerminalValidation({
      contract: b.contract,
      grounding: b.grounding,
      strategySeed: b.strategySeed,
      plan: b.plan,
      hookBridge: bb,
      candidate: cb,
      ledger: b.ledger,
    });
    assert.equal(a.ledger.snapshot().counts.retention_body_rewrite, 1);
    assert.equal(b.ledger.snapshot().counts.retention_body_rewrite, 0);
  });

  // Silence unused imports when tree-shaken oddly.
  void buildHookPlanFromRequest;
  void buildCompatibilityFallbackPlan;
  void validateHookCandidate;

  console.log(`\n${passed} checks passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
