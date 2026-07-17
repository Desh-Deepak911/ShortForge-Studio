/**
 * Sprint 10E.1 / 10E.1A — Retention Narrative Composer authority verification.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  RETENTION_CANDIDATE_FINGERPRINT_PREFIX,
  RETENTION_SEGMENT_SEPARATOR,
  RetentionStoryError,
  assertRetentionNarrationCandidateCoherence,
  assembleRetentionNarrationCandidate,
  buildDeterministicRetentionStrategySeed,
  buildRetentionComposerRequest,
  buildRetentionNarrationCandidateFromProposal,
  buildRetentionNarrationCandidateFingerprint,
  detectRetentionFactualRisk,
  normalizeStoryContract,
  validateRetentionNarrationCandidate,
  type RetentionNarrationCandidate,
} from "@/features/retention-story";

import {
  coherentEnvelope,
  eligibleClaimGrounding,
  qualitativeProposal,
  qualitativeSegmentText,
} from "./retentionStoryCoherentEnvelope";

const ROOT = path.resolve(__dirname, "../..");
const COMPOSITION_ROOT = path.join(ROOT, "features/retention-story/composition");
const RECONCILE_FILE = path.join(
  COMPOSITION_ROOT,
  "reconcile-retention-candidate-after-hook.ts",
);

let passed = 0;

async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
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

function expectRetentionError(
  fn: () => unknown,
  reason: string,
): void {
  assert.throws(fn, (err: unknown) =>
    err instanceof RetentionStoryError && err.reason === reason,
  );
}

async function main(): Promise<void> {
  console.log("\nretention-narration-composer (Sprint 10E.1 / 10E.1A)\n");

  console.log("negatives — composer request authority");
  await check("[1] cheap plan + balanced contract fails buildRetentionComposerRequest", async () => {
    const cheapEnv = await coherentEnvelope("cheap");
    const balancedEnv = await coherentEnvelope("balanced");
    expectRetentionError(
      () =>
        buildRetentionComposerRequest({
          contract: balancedEnv.contract,
          plan: cheapEnv.plan,
          strategySeed: cheapEnv.strategySeed,
          grounding: cheapEnv.grounding,
          modelCallKind: "initial",
        }),
      "strategy_seed_mismatch",
    );
    expectRetentionError(
      () =>
        buildRetentionComposerRequest({
          contract: balancedEnv.contract,
          plan: cheapEnv.plan,
          strategySeed: balancedEnv.strategySeed,
          grounding: balancedEnv.grounding,
          modelCallKind: "initial",
        }),
      "retention_story_plan_mismatch",
    );
  });

  await check("[2] wrong strategySeed fails buildRetentionComposerRequest", async () => {
    const env = await coherentEnvelope("cheap");
    const otherContract = normalizeStoryContract({
      topic: "Different topic entirely for seed drift",
      durationSec: 30,
      generationPath: "script_only",
      scriptMode: "story",
      tone: "dramatic",
      desiredReaction: "curiosity",
      qualityMode: "cheap",
    });
    const otherSeed = buildDeterministicRetentionStrategySeed({
      contract: otherContract,
      grounding: env.grounding,
    });
    assert.equal(otherSeed.status, "ready");
    if (otherSeed.status !== "ready") throw new Error("seed not ready");
    expectRetentionError(
      () =>
        buildRetentionComposerRequest({
          contract: env.contract,
          plan: env.plan,
          strategySeed: otherSeed.seed,
          grounding: env.grounding,
          modelCallKind: "initial",
        }),
      "strategy_seed_mismatch",
    );
  });

  console.log("negatives — candidate coherence");
  await check("[3] unknown origin fails even with recomputed fingerprint", async () => {
    const env = await coherentEnvelope("cheap");
    const built = buildRetentionNarrationCandidateFromProposal({
      proposal: qualitativeProposal(env.plan),
      plan: env.plan,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      origin: "initial_compose",
    });
    const forged = JSON.parse(
      JSON.stringify(built.candidate),
    ) as RetentionNarrationCandidate;
    (forged as { origin: string }).origin = "forged_origin";
    (forged as { candidateFingerprint: string }).candidateFingerprint =
      `${RETENTION_CANDIDATE_FINGERPRINT_PREFIX}recomputed-for-forged-origin`;
    expectRetentionError(
      () =>
        assertRetentionNarrationCandidateCoherence(forged, {
          plan: env.plan,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
        }),
      "candidate_fingerprint_mismatch",
    );
  });

  await check("[4] non-canonical internal whitespace fails even with recomputed fingerprint", async () => {
    const env = await coherentEnvelope("cheap");
    const built = buildRetentionNarrationCandidateFromProposal({
      proposal: qualitativeProposal(env.plan),
      plan: env.plan,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      origin: "initial_compose",
    });
    const forged = JSON.parse(
      JSON.stringify(built.candidate),
    ) as RetentionNarrationCandidate;
    const badText = "Spain  pressure keeps the short moving in section one.";
    forged.segments[0] = { ...forged.segments[0]!, text: badText };
    forged.assembledNarration = forged.assembledNarration.replace(
      qualitativeSegmentText(0),
      badText,
    );
    const recomputedFp = buildRetentionNarrationCandidateFingerprint({
      origin: forged.origin,
      planFingerprint: forged.planFingerprint,
      orderedBeatIds: forged.orderedBeatIds,
      segments: forged.segments,
      assembledNarration: forged.assembledNarration,
    });
    (forged as { candidateFingerprint: string }).candidateFingerprint = recomputedFp;
    expectRetentionError(
      () =>
        assertRetentionNarrationCandidateCoherence(forged, {
          plan: env.plan,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
        }),
      "candidate_fingerprint_mismatch",
    );
  });

  await check("[5] forged offsets rejected", async () => {
    const env = await coherentEnvelope("cheap");
    const built = buildRetentionNarrationCandidateFromProposal({
      proposal: qualitativeProposal(env.plan),
      plan: env.plan,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      origin: "initial_compose",
    });
    const forged = JSON.parse(
      JSON.stringify(built.candidate),
    ) as RetentionNarrationCandidate;
    (forged.segments[0] as { startOffset: number }).startOffset += 1;
    expectRetentionError(
      () =>
        assertRetentionNarrationCandidateCoherence(forged, {
          plan: env.plan,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
        }),
      "candidate_fingerprint_mismatch",
    );
  });

  await check("[6] factual-risk recompute mismatch fails coherence", async () => {
    const env = await coherentEnvelope("cheap");
    const built = buildRetentionNarrationCandidateFromProposal({
      proposal: qualitativeProposal(env.plan),
      plan: env.plan,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      origin: "initial_compose",
    });
    const forged = JSON.parse(
      JSON.stringify(built.candidate),
    ) as RetentionNarrationCandidate;
    (forged.segments[0] as { factualRisk: boolean }).factualRisk =
      !forged.segments[0]!.factualRisk;
    expectRetentionError(
      () =>
        assertRetentionNarrationCandidateCoherence(forged, {
          plan: env.plan,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
        }),
      "candidate_fingerprint_mismatch",
    );
  });

  console.log("negatives — hookClaimRefs authority");
  await check("[7] empty permitted requires hookClaimRefs []", async () => {
    const env = await coherentEnvelope("cheap");
    const proposal = qualitativeProposal(env.plan);
    proposal.hookClaimRefs = ["any-id"];
    expectRetentionError(
      () =>
        buildRetentionNarrationCandidateFromProposal({
          proposal,
          plan: env.plan,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          origin: "initial_compose",
          permittedHookClaimIds: [],
        }),
      "composer_grounding_invalid",
    );
  });

  await check("[8] non-permitted hookClaimRef fails", async () => {
    const claimText = "Spain shapes the contest with pressing.";
    const grounding = eligibleClaimGrounding([
      { id: "hook-ok", text: claimText, role: "required" },
    ]);
    const env = await coherentEnvelope(
      "cheap",
      { topic: "Spain versus France tactical preview" },
      grounding,
    );
    const proposal = qualitativeProposal(env.plan);
    proposal.segments[0]!.text = claimText;
    proposal.segments[0]!.claimRefs = ["hook-ok"];
    proposal.hookClaimRefs = ["hook-ok"];
    expectRetentionError(
      () =>
        buildRetentionNarrationCandidateFromProposal({
          proposal,
          plan: env.plan,
          grounding,
          strategySeed: env.strategySeed,
          origin: "initial_compose",
          permittedHookClaimIds: ["other-id"],
        }),
      "composer_grounding_invalid",
    );
  });

  await check("[9] later-beat hookClaimRef fails", async () => {
    const claimText = "Spain shapes the contest with pressing.";
    const grounding = eligibleClaimGrounding([
      { id: "later-only", text: claimText, role: "required" },
    ]);
    const env = await coherentEnvelope(
      "cheap",
      { topic: "Spain versus France tactical preview" },
      grounding,
    );
    const lastBeatId =
      env.plan.beatPlan.beats[env.plan.beatPlan.beats.length - 1]!.id;
    const plan = {
      ...env.plan,
      claimIdRelationships: [],
      hookHandoff: {
        ...env.plan.hookHandoff,
        groundingRequirements: {
          ...env.plan.hookHandoff.groundingRequirements,
          claimIds: [],
        },
      },
      beatPlan: {
        ...env.plan.beatPlan,
        beats: env.plan.beatPlan.beats.map((beat) => ({
          ...beat,
          groundingClaimRefs:
            beat.id === lastBeatId ? (["later-only"] as const) : [],
        })),
      },
    };
    const proposal = qualitativeProposal(plan);
    const lastIdx = proposal.segments.length - 1;
    proposal.segments[lastIdx]!.text = claimText;
    proposal.segments[lastIdx]!.claimRefs = ["later-only"];
    proposal.hookClaimRefs = ["later-only"];
    expectRetentionError(
      () =>
        buildRetentionNarrationCandidateFromProposal({
          proposal,
          plan,
          grounding,
          strategySeed: env.strategySeed,
          origin: "initial_compose",
          permittedHookClaimIds: ["later-only"],
        }),
      "composer_grounding_invalid",
    );
  });

  await check("[10] unrelated hookClaimRef fails", async () => {
    const claimText = "Spain shapes the contest with pressing.";
    const grounding = eligibleClaimGrounding([
      { id: "unrelated", text: claimText, role: "required" },
    ]);
    const env = await coherentEnvelope(
      "cheap",
      { topic: "Spain versus France tactical preview" },
      grounding,
    );
    const proposal = qualitativeProposal(env.plan);
    proposal.hookClaimRefs = ["unrelated"];
    expectRetentionError(
      () =>
        buildRetentionNarrationCandidateFromProposal({
          proposal,
          plan: env.plan,
          grounding,
          strategySeed: env.strategySeed,
          origin: "initial_compose",
          permittedHookClaimIds: ["unrelated"],
        }),
      "composer_grounding_invalid",
    );
  });

  console.log("negatives — segment / grounding");
  await check("[11] missing/duplicate/reordered beat rejection", async () => {
    const env = await coherentEnvelope("cheap");
    const base = qualitativeProposal(env.plan);

    expectRetentionError(
      () =>
        buildRetentionNarrationCandidateFromProposal({
          proposal: { ...base, segments: base.segments.slice(1) },
          plan: env.plan,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          origin: "initial_compose",
        }),
      "composer_segment_mismatch",
    );

    const dup = {
      ...base,
      segments: base.segments.map((s, i) =>
        i === 1 ? { ...s, beatId: base.segments[0]!.beatId } : s,
      ),
    };
    assert.throws(
      () =>
        buildRetentionNarrationCandidateFromProposal({
          proposal: dup,
          plan: env.plan,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          origin: "initial_compose",
        }),
      (err: unknown) => err instanceof RetentionStoryError,
    );

    const reordered = { ...base, segments: [...base.segments].reverse() };
    assert.throws(
      () =>
        buildRetentionNarrationCandidateFromProposal({
          proposal: reordered,
          plan: env.plan,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          origin: "initial_compose",
        }),
      (err: unknown) => err instanceof RetentionStoryError,
    );
  });

  await check("[12] qualitative zero-ref passes; factual-risk zero-ref fails", async () => {
    const env = await coherentEnvelope("cheap");
    const ok = buildRetentionNarrationCandidateFromProposal({
      proposal: qualitativeProposal(env.plan),
      plan: env.plan,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      origin: "initial_compose",
    });
    assert.equal(ok.candidate.segments.every((s) => s.claimRefs.length === 0), true);

    const risky = qualitativeProposal(env.plan);
    risky.segments[2]!.text = "Spain defeated France in the final.";
    expectRetentionError(
      () =>
        buildRetentionNarrationCandidateFromProposal({
          proposal: risky,
          plan: env.plan,
          grounding: env.grounding,
          strategySeed: env.strategySeed,
          origin: "initial_compose",
        }),
      "composer_grounding_invalid",
    );
  });

  await check("[13] unauthorized other-beat ref fails", async () => {
    const claimText = "Spain shapes the contest with pressing.";
    const env = await coherentEnvelope("cheap");
    assert.equal(env.strategySeed.controllingIdeaClaimRefs.length, 0);
    const grounding = eligibleClaimGrounding([
      { id: "only-beat-later", text: claimText },
    ]);
    const lastBeatId =
      env.plan.beatPlan.beats[env.plan.beatPlan.beats.length - 1]!.id;
    const plan = {
      ...env.plan,
      claimIdRelationships: [],
      hookHandoff: {
        ...env.plan.hookHandoff,
        groundingRequirements: {
          ...env.plan.hookHandoff.groundingRequirements,
          claimIds: [],
        },
      },
      beatPlan: {
        ...env.plan.beatPlan,
        beats: env.plan.beatPlan.beats.map((beat) => ({
          ...beat,
          groundingClaimRefs:
            beat.id === lastBeatId ? (["only-beat-later"] as const) : [],
        })),
      },
    };
    const proposal = qualitativeProposal(plan);
    proposal.segments[0]!.claimRefs = ["only-beat-later"];
    expectRetentionError(
      () =>
        buildRetentionNarrationCandidateFromProposal({
          proposal,
          plan,
          grounding,
          strategySeed: env.strategySeed,
          origin: "initial_compose",
        }),
      "composer_grounding_invalid",
    );
  });

  await check("[14] stale pre-Hook candidate cannot become final via forged origin", async () => {
    const env = await coherentEnvelope("cheap");
    const built = buildRetentionNarrationCandidateFromProposal({
      proposal: qualitativeProposal(env.plan),
      plan: env.plan,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      origin: "initial_compose",
    });
    expectRetentionError(
      () =>
        assertRetentionNarrationCandidateCoherence(
          { ...built.candidate, origin: "final" },
          {
            plan: env.plan,
            grounding: env.grounding,
            strategySeed: env.strategySeed,
          },
        ),
      "candidate_fingerprint_mismatch",
    );
  });

  console.log("positives — coherent envelopes");
  await check("[22] coherent Fast envelope builds composer request", async () => {
    const env = await coherentEnvelope("cheap");
    const request = buildRetentionComposerRequest({
      contract: env.contract,
      plan: env.plan,
      strategySeed: env.strategySeed,
      grounding: env.grounding,
      modelCallKind: "initial",
    });
    assert.equal(request.qualityMode, "cheap");
    assert.equal(request.planFingerprint, env.plan.planFingerprint);
    assert.ok(Object.isFrozen(request));
  });

  await check("[23] coherent Balanced envelope builds composer request", async () => {
    const env = await coherentEnvelope("balanced");
    const request = buildRetentionComposerRequest({
      contract: env.contract,
      plan: env.plan,
      strategySeed: env.strategySeed,
      grounding: env.grounding,
      modelCallKind: "initial",
    });
    assert.equal(request.qualityMode, "balanced");
    assert.equal(env.ledger.snapshot().counts.planner, 1);
  });

  await check("[24] coherent Studio envelope builds composer request", async () => {
    const env = await coherentEnvelope("best");
    const request = buildRetentionComposerRequest({
      contract: env.contract,
      plan: env.plan,
      strategySeed: env.strategySeed,
      grounding: env.grounding,
      modelCallKind: "initial",
    });
    assert.equal(request.qualityMode, "best");
    assert.equal(env.ledger.snapshot().counts.planner, 1);
  });

  console.log("positives — candidate assembly");
  await check("[25] exact one-segment-per-beat with UTF-16 offsets", async () => {
    const env = await coherentEnvelope("cheap");
    const proposal = qualitativeProposal(env.plan);
    proposal.segments[0]!.text = "Spain pressure — São Paulo pace?";
    const built = buildRetentionNarrationCandidateFromProposal({
      proposal,
      plan: env.plan,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      origin: "initial_compose",
    });
    assert.equal(built.candidate.segments.length, env.plan.beatPlan.beats.length);
    for (const segment of built.candidate.segments) {
      assert.equal(
        built.candidate.assembledNarration.slice(
          segment.startOffset,
          segment.endOffset,
        ),
        segment.text,
      );
    }
    assert.ok(
      built.candidate.candidateFingerprint.startsWith(
        RETENTION_CANDIDATE_FINGERPRINT_PREFIX,
      ),
    );
    assert.ok(
      built.candidate.assembledNarration.includes(RETENTION_SEGMENT_SEPARATOR),
    );
  });

  await check("[26] authorized first-segment hook claim passes", async () => {
    const claimText = "Spain shapes the contest with pressing.";
    const grounding = eligibleClaimGrounding([
      { id: "hook-ok", text: claimText, role: "required" },
    ]);
    const env = await coherentEnvelope(
      "cheap",
      { topic: "Spain versus France tactical preview" },
      grounding,
    );
    const proposal = qualitativeProposal(env.plan);
    proposal.segments[0]!.text = claimText;
    proposal.segments[0]!.claimRefs = ["hook-ok"];
    proposal.hookClaimRefs = ["hook-ok"];
    const built = buildRetentionNarrationCandidateFromProposal({
      proposal,
      plan: env.plan,
      grounding,
      strategySeed: env.strategySeed,
      origin: "initial_compose",
      permittedHookClaimIds: ["hook-ok"],
    });
    assert.deepEqual(built.hookClaimRefs, ["hook-ok"]);
    assert.deepEqual([...env.strategySeed.controllingIdeaClaimRefs], ["hook-ok"]);
    assert.equal(detectRetentionFactualRisk(claimText).risky, false);
  });

  await check("[27] fingerprint stable under claim-ref order; sensitive to text/origin", async () => {
    const env = await coherentEnvelope("cheap");
    const a = assembleRetentionNarrationCandidate({
      origin: "initial_compose",
      planFingerprint: env.plan.planFingerprint,
      orderedBeatIds: env.plan.beatPlan.beats.map((b) => b.id),
      segments: env.plan.beatPlan.beats.map((b) => ({
        beatId: b.id,
        text: `Line for ${b.purpose}.`,
        claimRefs: Object.freeze(["c-b", "c-a"] as string[]),
        factualRisk: false,
      })),
    });
    const fp1 = buildRetentionNarrationCandidateFingerprint({
      origin: a.origin,
      planFingerprint: a.planFingerprint,
      orderedBeatIds: a.orderedBeatIds,
      segments: a.segments.map((s) => ({ ...s, claimRefs: ["c-b", "c-a"] })),
      assembledNarration: a.assembledNarration,
    });
    const fp2 = buildRetentionNarrationCandidateFingerprint({
      origin: a.origin,
      planFingerprint: a.planFingerprint,
      orderedBeatIds: a.orderedBeatIds,
      segments: a.segments.map((s) => ({ ...s, claimRefs: ["c-a", "c-b"] })),
      assembledNarration: a.assembledNarration,
    });
    assert.equal(fp1, fp2);
    const fpText = buildRetentionNarrationCandidateFingerprint({
      origin: a.origin,
      planFingerprint: a.planFingerprint,
      orderedBeatIds: a.orderedBeatIds,
      segments: a.segments.map((s, i) =>
        i === 0 ? { ...s, text: `${s.text}x` } : s,
      ),
      assembledNarration: a.assembledNarration + "x",
    });
    assert.notEqual(fp1, fpText);
    const fpOrigin = buildRetentionNarrationCandidateFingerprint({
      origin: "after_hook_approval",
      planFingerprint: a.planFingerprint,
      orderedBeatIds: a.orderedBeatIds,
      segments: a.segments,
      assembledNarration: a.assembledNarration,
    });
    assert.notEqual(fp1, fpOrigin);
  });

  await check("[28] deep-freeze isolation on asserted candidate", async () => {
    const env = await coherentEnvelope("cheap");
    const built = buildRetentionNarrationCandidateFromProposal({
      proposal: qualitativeProposal(env.plan),
      plan: env.plan,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      origin: "initial_compose",
    });
    const asserted = assertRetentionNarrationCandidateCoherence(built.candidate, {
      plan: env.plan,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
    });
    assert.ok(Object.isFrozen(asserted));
    assert.ok(Object.isFrozen(asserted.segments));
    assert.equal(validateRetentionNarrationCandidate(asserted), true);
    assert.equal(validateRetentionNarrationCandidate(null), false);
  });

  console.log("negatives — seed CI claim authority (10E.1A)");
  await check(
    "[15A] empty seed + empty relationships + unrelated eligible ref fails (proposal + forged candidate)",
    async () => {
      const claimText = "Spain shapes the contest with pressing.";
      const env = await coherentEnvelope("cheap");
      assert.equal(env.strategySeed.controllingIdeaClaimRefs.length, 0);
      const grounding = eligibleClaimGrounding([
        { id: "unrelated-eligible", text: claimText },
      ]);
      const plan = {
        ...env.plan,
        claimIdRelationships: [],
        hookHandoff: {
          ...env.plan.hookHandoff,
          groundingRequirements: {
            ...env.plan.hookHandoff.groundingRequirements,
            claimIds: [],
          },
        },
        beatPlan: {
          ...env.plan.beatPlan,
          beats: env.plan.beatPlan.beats.map((beat) => ({
            ...beat,
            groundingClaimRefs: [],
          })),
        },
      };
      const proposal = qualitativeProposal(plan);
      proposal.segments[0]!.text = claimText;
      proposal.segments[0]!.claimRefs = ["unrelated-eligible"];
      expectRetentionError(
        () =>
          buildRetentionNarrationCandidateFromProposal({
            proposal,
            plan,
            grounding,
            strategySeed: env.strategySeed,
            origin: "initial_compose",
          }),
        "composer_grounding_invalid",
      );

      const ok = buildRetentionNarrationCandidateFromProposal({
        proposal: qualitativeProposal(plan),
        plan,
        grounding,
        strategySeed: env.strategySeed,
        origin: "initial_compose",
      });
      const forged = JSON.parse(
        JSON.stringify(ok.candidate),
      ) as RetentionNarrationCandidate;
      forged.segments[0] = {
        ...forged.segments[0]!,
        text: claimText,
        claimRefs: ["unrelated-eligible"],
      };
      forged.assembledNarration = forged.assembledNarration.replace(
        qualitativeSegmentText(0),
        claimText,
      );
      const recomputedFp = buildRetentionNarrationCandidateFingerprint({
        origin: forged.origin,
        planFingerprint: forged.planFingerprint,
        orderedBeatIds: forged.orderedBeatIds,
        segments: forged.segments,
        assembledNarration: forged.assembledNarration,
      });
      forged.candidateFingerprint = recomputedFp;
      expectRetentionError(
        () =>
          assertRetentionNarrationCandidateCoherence(forged, {
            plan,
            grounding,
            strategySeed: env.strategySeed,
          }),
        "candidate_fingerprint_mismatch",
      );
    },
  );

  await check("[16A] seed with claim A rejects segment use of claim B", async () => {
    const textA = "Spain shapes the contest with pressing.";
    const textB = "France responds with compact defensive spacing.";
    const grounding = eligibleClaimGrounding([
      { id: "claim-a", text: textA, role: "required" },
      { id: "claim-b", text: textB },
    ]);
    const env = await coherentEnvelope(
      "cheap",
      { topic: "Spain versus France tactical preview" },
      grounding,
    );
    assert.deepEqual([...env.strategySeed.controllingIdeaClaimRefs], ["claim-a"]);
    const proposal = qualitativeProposal(env.plan);
    proposal.segments[0]!.text = textB;
    proposal.segments[0]!.claimRefs = ["claim-b"];
    expectRetentionError(
      () =>
        buildRetentionNarrationCandidateFromProposal({
          proposal,
          plan: env.plan,
          grounding,
          strategySeed: env.strategySeed,
          origin: "initial_compose",
        }),
      "composer_grounding_invalid",
    );
  });

  await check(
    "[17A] hookClaimRef eligible only if seed CI were forged fails",
    async () => {
      const claimText = "Spain shapes the contest with pressing.";
      const env = await coherentEnvelope("cheap");
      assert.equal(env.strategySeed.controllingIdeaClaimRefs.length, 0);
      const grounding = eligibleClaimGrounding([
        { id: "ci-only", text: claimText },
      ]);
      const proposal = qualitativeProposal(env.plan);
      proposal.segments[0]!.text = claimText;
      proposal.segments[0]!.claimRefs = ["ci-only"];
      proposal.hookClaimRefs = ["ci-only"];
      expectRetentionError(
        () =>
          buildRetentionNarrationCandidateFromProposal({
            proposal,
            plan: env.plan,
            grounding,
            strategySeed: env.strategySeed,
            origin: "initial_compose",
            permittedHookClaimIds: ["ci-only"],
          }),
        "composer_grounding_invalid",
      );
    },
  );

  console.log("positives — seed CI claim authority (10E.1A)");
  await check(
    "[28A] exact grounded CI claim from asserted seed passes on any beat",
    async () => {
      const claimText = "Spain shapes the contest with pressing.";
      const grounding = eligibleClaimGrounding([
        { id: "ci-grounded", text: claimText, role: "required" },
      ]);
      const env = await coherentEnvelope(
        "cheap",
        { topic: "Spain versus France tactical preview" },
        grounding,
      );
      assert.deepEqual(
        [...env.strategySeed.controllingIdeaClaimRefs],
        ["ci-grounded"],
      );
      const proposal = qualitativeProposal(env.plan);
      proposal.segments[2]!.text = claimText;
      proposal.segments[2]!.claimRefs = ["ci-grounded"];
      const built = buildRetentionNarrationCandidateFromProposal({
        proposal,
        plan: env.plan,
        grounding,
        strategySeed: env.strategySeed,
        origin: "initial_compose",
      });
      assert.deepEqual(built.candidate.segments[2]!.claimRefs, ["ci-grounded"]);
    },
  );

  await check(
    "[28B] deterministic seed with zero refs remains valid",
    async () => {
      const env = await coherentEnvelope("cheap");
      assert.equal(env.strategySeed.controllingIdeaClaimRefs.length, 0);
      const built = buildRetentionNarrationCandidateFromProposal({
        proposal: qualitativeProposal(env.plan),
        plan: env.plan,
        grounding: env.grounding,
        strategySeed: env.strategySeed,
        origin: "initial_compose",
      });
      assert.equal(
        built.candidate.segments.every((s) => s.claimRefs.length === 0),
        true,
      );
    },
  );

  await check(
    "[28C] planner seed echoes canonical ordered CI refs in composer request",
    async () => {
      const claimText = "Haaland pressing forces the Premier League contest open.";
      const grounding = eligibleClaimGrounding([
        { id: "required-h", text: claimText, role: "required" },
      ]);
      const env = await coherentEnvelope(
        "balanced",
        { topic: "Haaland Premier League impact", scriptMode: "player_analysis" },
        grounding,
      );
      assert.deepEqual(
        [...env.strategySeed.controllingIdeaClaimRefs],
        ["required-h"],
      );
      const request = buildRetentionComposerRequest({
        contract: env.contract,
        plan: env.plan,
        strategySeed: env.strategySeed,
        grounding: env.grounding,
        modelCallKind: "initial",
      });
      assert.deepEqual(
        [...request.controllingIdeaClaimRefs],
        [...env.strategySeed.controllingIdeaClaimRefs],
      );
      assert.ok(Object.isFrozen(request.controllingIdeaClaimRefs));
    },
  );

  await check(
    "[28D] beat-authorized claim passes only on its beat",
    async () => {
      const claimText = "Spain shapes the contest with pressing.";
      const env = await coherentEnvelope("cheap");
      assert.equal(env.strategySeed.controllingIdeaClaimRefs.length, 0);
      const grounding = eligibleClaimGrounding([
        { id: "beat-local", text: claimText },
      ]);
      const lastBeatId =
        env.plan.beatPlan.beats[env.plan.beatPlan.beats.length - 1]!.id;
      const plan = {
        ...env.plan,
        beatPlan: {
          ...env.plan.beatPlan,
          beats: env.plan.beatPlan.beats.map((beat) => ({
            ...beat,
            groundingClaimRefs:
              beat.id === lastBeatId ? (["beat-local"] as const) : [],
          })),
        },
      };
      const okProposal = qualitativeProposal(plan);
      okProposal.segments[okProposal.segments.length - 1]!.text = claimText;
      okProposal.segments[okProposal.segments.length - 1]!.claimRefs = [
        "beat-local",
      ];
      const built = buildRetentionNarrationCandidateFromProposal({
        proposal: okProposal,
        plan,
        grounding,
        strategySeed: env.strategySeed,
        origin: "initial_compose",
      });
      const lastIdx = built.candidate.segments.length - 1;
      assert.deepEqual(built.candidate.segments[lastIdx]!.claimRefs, [
        "beat-local",
      ]);

      const badProposal = qualitativeProposal(plan);
      badProposal.segments[0]!.claimRefs = ["beat-local"];
      expectRetentionError(
        () =>
          buildRetentionNarrationCandidateFromProposal({
            proposal: badProposal,
            plan,
            grounding,
            strategySeed: env.strategySeed,
            origin: "initial_compose",
          }),
        "composer_grounding_invalid",
      );
    },
  );

  console.log("boundaries");
  await check("[29] composition has no Hook/SI/env duplication except reconcile extract-opening-span", () => {
    const files = collectTsFiles(COMPOSITION_ROOT);
    const forbidden = [
      /from ["']@\/features\/studio-intelligence/,
      /NarrativeBeat/,
      /process\.env/,
      /openai/i,
      /FootieScript/,
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        assert.equal(pattern.test(src), false, `${file} matched ${pattern}`);
      }
      if (file === RECONCILE_FILE) {
        const hookImports = src.match(
          /from ["']@\/features\/hook-engine[^"']*["']/g,
        );
        assert.deepEqual(hookImports, [
          'from "@/features/hook-engine/validation/extract-opening-span"',
        ]);
      } else {
        assert.equal(
          /@\/features\/hook-engine/.test(src),
          false,
          `${file} must not import hook-engine`,
        );
      }
    }
  });

  console.log(`\nAll retention narration composer checks passed (${passed}).\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
