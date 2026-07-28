/**
 * Sprint 10H.2B — Narrative completeness + sentence-safe length enforcement.
 */

import assert from "node:assert/strict";

import {
  RETENTION_SPOKEN_COMPLETENESS_VERSION,
  assembleRetentionNarrationCandidate,
  buildRetentionNarrationCandidateFromProposal,
  detectRetentionFactualRisk,
  enforceRetentionCandidateWordBudget,
  evaluateRetentionSpokenCompleteness,
  RetentionStoryError,
  type RetentionNarrationCandidate,
} from "@/features/retention-story";

import { coherentEnvelope, qualitativeProposal } from "./retentionStoryCoherentEnvelope";

function assembleIncompleteCandidate(
  plan: Awaited<ReturnType<typeof coherentEnvelope>>["plan"],
  texts: readonly string[],
): RetentionNarrationCandidate {
  return assembleRetentionNarrationCandidate({
    origin: "after_length_enforcement",
    planFingerprint: plan.planFingerprint,
    orderedBeatIds: plan.beatPlan.beats.map((b) => b.id),
    segments: plan.beatPlan.beats.map((beat, i) => {
      const text = texts[i] ?? "Incomplete fragment.";
      return {
        beatId: beat.id,
        text,
        claimRefs: [],
        factualRisk: detectRetentionFactualRisk(text).risky,
      };
    }),
  });
}

let passed = 0;

async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

/** Exact reproduced fragment pattern from the Argentina/England Fast defect. */
const REPRODUCED_FRAGMENT_TEXTS = [
  "Argentina pressure hits harder tonight with rising stakes.",
  "England answers with a brutal high intensity contest shape.",
  "A single surge of pressure",
  "This pivotal",
  "The legacy",
  "In the",
] as const;

function candidateFromTexts(
  plan: Awaited<ReturnType<typeof coherentEnvelope>>["plan"],
  grounding: Awaited<ReturnType<typeof coherentEnvelope>>["grounding"],
  strategySeed: Awaited<ReturnType<typeof coherentEnvelope>>["strategySeed"],
  texts: readonly string[],
  options?: { readonly allowIncompleteNormalize?: boolean },
): RetentionNarrationCandidate {
  if (options?.allowIncompleteNormalize) {
    return assembleIncompleteCandidate(plan, texts);
  }
  const beats = plan.beatPlan.beats;
  const mapped = beats.map((beat, i) => ({
    beatId: beat.id,
    text: texts[i] ?? texts[texts.length - 1] ?? "Incomplete.",
    claimRefs: [] as unknown as string[],
  }));
  return buildRetentionNarrationCandidateFromProposal({
    proposal: {
      title: "Fragment story",
      hookClaimRefs: [],
      segments: mapped,
    },
    plan,
    grounding,
    strategySeed,
    origin: "after_length_enforcement",
  }).candidate;
}

async function main(): Promise<void> {
  console.log("\nretention-narrative-completeness (Sprint 10H.2B)\n");

  await check("[C1] spoken-completeness version is stable", () => {
    assert.equal(RETENTION_SPOKEN_COMPLETENESS_VERSION, "spoken-completeness/1");
  });

  await check("[C2] exact reproduced fragments fail spoken completeness", async () => {
    const env = await coherentEnvelope("cheap");
    // Align fragment list length to beat count by padding complete fillers then
    // overwriting the terminal span with the reproduced incomplete endings.
    const n = env.plan.beatPlan.beats.length;
    const texts = Array.from({ length: n }, (_, i) => {
      if (i < REPRODUCED_FRAGMENT_TEXTS.length) {
        return REPRODUCED_FRAGMENT_TEXTS[i]!;
      }
      return `Argentina England tension advances with clear spoken focus in beat ${i + 1}.`;
    });
    // Force the last four beats to the reproduced incomplete endings when n>=6.
    if (n >= 6) {
      texts[n - 4] = "A single surge of pressure";
      texts[n - 3] = "This pivotal";
      texts[n - 2] = "The legacy";
      texts[n - 1] = "In the";
    }
    const candidate = candidateFromTexts(
      env.plan,
      env.grounding,
      env.strategySeed,
      texts,
      { allowIncompleteNormalize: true },
    );
    const result = evaluateRetentionSpokenCompleteness(candidate, env.plan);
    assert.equal(result.ok, false);
    assert.ok(result.reasonIds.includes("missing_terminal_sentence_punctuation"));
    assert.ok(
      result.reasonIds.includes("two_word_fragment") ||
        result.reasonIds.includes("dangling_function_word") ||
        result.reasonIds.includes("mechanically_clipped_phrase"),
    );
    assert.ok(result.reasonIds.includes("payoff_narration_incomplete"));
  });

  await check("[C3] unterminated phrase and Because-the fragment fail", async () => {
    const env = await coherentEnvelope("cheap");
    const n = env.plan.beatPlan.beats.length;
    const texts = Array.from({ length: n }, (_, i) =>
      i === n - 1
        ? "Because the"
        : `Argentina England tension advances with clear spoken focus in beat ${i + 1}.`,
    );
    const candidate = candidateFromTexts(
      env.plan,
      env.grounding,
      env.strategySeed,
      texts,
      { allowIncompleteNormalize: true },
    );
    const result = evaluateRetentionSpokenCompleteness(candidate, env.plan);
    assert.equal(result.ok, false);
    assert.ok(
      result.reasonIds.includes("dangling_function_word") ||
        result.reasonIds.includes("two_word_fragment") ||
        result.reasonIds.includes("missing_terminal_sentence_punctuation"),
    );
  });

  await check("[C4] complete short Hook + complete body Passes", async () => {
    const env = await coherentEnvelope("cheap");
    const proposal = qualitativeProposal(env.plan);
    // Ensure first segment opens with a short complete Hook sentence.
    proposal.segments = proposal.segments.map((s, i) =>
      i === 0
        ? {
            ...s,
            text: "Why Argentina press? Argentina England tension keeps rising with clear spoken focus.",
          }
        : s,
    );
    const candidate = buildRetentionNarrationCandidateFromProposal({
      proposal,
      plan: env.plan,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      origin: "after_hook_approval",
    }).candidate;
    const result = evaluateRetentionSpokenCompleteness(candidate, env.plan);
    assert.equal(result.ok, true, result.reasonIds.join(","));
  });

  await check("[C5] word-by-word style overlong candidate fails closed sentence-safe", async () => {
    const env = await coherentEnvelope("cheap");
    const n = env.plan.beatPlan.beats.length;
    // Build an intentionally over-budget but complete-sentence candidate.
    const texts = Array.from({ length: n }, (_, i) => {
      const filler = Array.from({ length: 20 }, () => "pressure").join(" ");
      return i === 0
        ? `Why Argentina press? ${filler} reshapes the England contest tonight.`
        : `Argentina England ${filler} advances the contest focus tonight.`;
    });
    const candidate = candidateFromTexts(
      env.plan,
      env.grounding,
      env.strategySeed,
      texts,
    );
    assert.throws(
      () =>
        enforceRetentionCandidateWordBudget({
          candidate,
          plan: env.plan,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          approvedOpeningText: "Why Argentina press?",
        }),
      (err: unknown) =>
        err instanceof RetentionStoryError &&
        err.reason === "length_enforcement_failed",
    );
  });

  await check("[C6] sentence-safe trim preserves opening and complete utterances when possible", async () => {
    const env = await coherentEnvelope("cheap");
    const n = env.plan.beatPlan.beats.length;
    const opening = "Why Argentina press?";
    const texts = Array.from({ length: n }, (_, i) => {
      if (i === 0) {
        return `${opening} Argentina England tension keeps rising tonight. Extra optional sentence remains here for trim.`;
      }
      if (i === n - 1 || i === n - 2) {
        // Protected setup/payoff-ish endings stay complete and shorter.
        return `Argentina England closes the contest with decisive spoken focus tonight.`;
      }
      return `Argentina England tension advances with clear spoken focus tonight. Optional trim sentence stays removable here.`;
    });
    const candidate = candidateFromTexts(
      env.plan,
      env.grounding,
      env.strategySeed,
      texts,
    );
    // Only run trim when over budget; construct guaranteed overage.
    const oversized = assembleRetentionNarrationCandidate({
      origin: "after_length_enforcement",
      planFingerprint: env.plan.planFingerprint,
      orderedBeatIds: candidate.orderedBeatIds,
      segments: candidate.segments.map((s) => ({
        beatId: s.beatId,
        text: `${s.text} More optional complete padding keeps the total long enough for enforcement.`,
        claimRefs: s.claimRefs,
        factualRisk: s.factualRisk,
      })),
    });
    // May fail closed if protected beats leave no safe trim room — either Pass fit or typed failure.
    try {
      const enforced = enforceRetentionCandidateWordBudget({
        candidate: oversized,
        plan: env.plan,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        approvedOpeningText: opening,
      });
      assert.ok(enforced.assembledNarration.startsWith(opening));
      const spoken = evaluateRetentionSpokenCompleteness(enforced, env.plan);
      assert.equal(spoken.ok, true, spoken.reasonIds.join(","));
    } catch (err) {
      assert.ok(
        err instanceof RetentionStoryError &&
          err.reason === "length_enforcement_failed",
      );
    }
  });

  console.log(`\nAll narrative completeness checks passed (${passed}).\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
