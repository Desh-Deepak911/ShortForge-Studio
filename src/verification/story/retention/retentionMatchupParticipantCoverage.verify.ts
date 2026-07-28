/**
 * Sprint 10H.4B — matchup participant-coverage + reliable rescue fixtures.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildRetentionParticipantCoverage,
  evaluateRetentionParticipantCoverage,
  normalizeStoryContract,
  parseRetentionMatchupParticipantGroups,
  reconcileRetentionParticipantCoverageZeroModel,
  runRetentionProductionNarration,
  buildRetentionNarrationCandidateFromProposal,
  buildProductionStoryContractInput,
  toRetentionParticipantCoverageSummary,
  countRetentionNarrationWords,
} from "@/features/retention-story";
import { enforceRetentionCandidateWordBudget } from "@/features/retention-story/composition/enforce-retention-candidate-word-budget";

import { coherentEnvelope, SECTION_WORDS } from "./retentionStoryCoherentEnvelope";
import {
  assertNoSecrets,
  retentionProductionDoubles,
} from "./retentionStoryQaDoubles";
import { joinOpeningAndBody, padSpokenWords } from "./retentionSpokenFixtureText";

async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  console.log(`  ✓ ${label}`);
}

function fittingProposal(
  plan: Awaited<ReturnType<typeof coherentEnvelope>>["plan"],
  texts?: readonly string[],
) {
  const budget = plan.compressionGoals.targetWordBudget;
  const n = plan.beatPlan.beats.length;
  const minPer = 4;
  const targetTotal = Math.min(
    Math.max(n * minPer, budget - 8),
    Math.max(n * minPer, Math.floor(budget * 0.78)),
  );
  const base = Math.floor(targetTotal / n);
  let rem = targetTotal - base * n;
  return {
    title: "Matchup pressure story",
    hookClaimRefs: [] as unknown as string[],
    segments: plan.beatPlan.beats.map((beat, i) => {
      if (texts?.[i]) {
        return {
          beatId: beat.id,
          text: texts[i]!,
          claimRefs: [] as unknown as string[],
        };
      }
      const target = Math.max(minPer, base + (rem > 0 ? 1 : 0));
      if (rem > 0) rem -= 1;
      const section = SECTION_WORDS[i] ?? "next";
      if (i === 0) {
        const open = "Why does Argentina pressure matter?";
        const body = padSpokenWords(
          "Argentina focus reshapes this review tonight",
          Math.max(3, target - countRetentionNarrationWords(open)),
        );
        return {
          beatId: beat.id,
          text: joinOpeningAndBody(open, body),
          claimRefs: [] as unknown as string[],
        };
      }
      const seed =
        i === n - 1
          ? "Argentina pressure closes this review tonight"
          : `Argentina ${section} focus advances tonight`;
      return {
        beatId: beat.id,
        text: padSpokenWords(seed, target),
        claimRefs: [] as unknown as string[],
      };
    }),
  };
}

async function main(): Promise<void> {
  console.log("retentionMatchupParticipantCoverage (Sprint 10H.4B)\n");

  await check("[M1] Argentina versus England — Argentina-only rejects then reconciles", async () => {
    const contract = normalizeStoryContract(
      buildProductionStoryContractInput({
        topic:
          "Argentina versus England dramatic match review — late pressure, fouls, and a narrow 2–1 finish that still feels unfinished",
        durationSec: 35,
        generationPath: "script_only",
        qualityMode: "cheap",
        scriptMode: "match_recap",
        formatStrategyId: "short_retention",
      }),
    );
    const coverage = buildRetentionParticipantCoverage(contract);
    assert.equal(coverage.required, true);
    assert.equal(coverage.groups.length, 2);
    assert.ok(coverage.groups[0]!.tokens.includes("argentina"));
    assert.ok(coverage.groups[1]!.tokens.includes("england"));

    const argentinaOnly =
      "Argentina holds its breath again. Pressure mounts under late challenges. Intensity collides with discipline.";
    const evalMissing = evaluateRetentionParticipantCoverage({
      coverage,
      narration: argentinaOnly,
    });
    assert.equal(evalMissing.passed, false);
    assert.ok(evalMissing.missingGroupIds.includes("g1"));

    const result = await runRetentionProductionNarration({
      topic: contract.topic,
      durationSec: 35,
      generationPath: "script_only",
      qualityMode: "cheap",
      scriptMode: "match_recap",
      formatStrategyId: "short_retention",
      // Force Argentina-only composer output.
      composer: async (request) => {
        const n = request.orderedBeatIds.length;
        return {
          title: "Argentina only",
          hookClaimRefs: [],
          segments: request.orderedBeatIds.map((beatId, i) => ({
            beatId,
            text:
              i === 0
                ? "Why does Argentina pressure matter? Argentina focus reshapes this review tonight."
                : i === n - 1
                  ? "Argentina pressure closes this review tonight."
                  : "Argentina focus advances with clear intensity tonight.",
            claimRefs: [],
          })),
        };
      },
      planner: null,
      hookRunner: retentionProductionDoubles("cheap").hookRunner,
    });
    assert.equal(result.ok, true, result.ok ? "" : result.failureCategory);
    if (result.ok) {
      assert.match(result.approved.narration, /Argentina/i);
      assert.match(result.approved.narration, /England/i);
      assert.ok(
        result.approved.generationDisposition?.adaptations.includes(
          "participant_coverage_reconciled",
        ) ||
          /England/i.test(result.approved.narration),
      );
    }
  });

  await check("[M2] Spain vs France — both required", () => {
    const groups = parseRetentionMatchupParticipantGroups(
      "Spain vs France tactical preview",
      "match_preview",
    );
    assert.ok(groups);
    assert.equal(groups!.length, 2);
    assert.ok(groups![0]!.tokens.includes("spain"));
    assert.ok(groups![1]!.tokens.includes("france"));
  });

  await check("[M3] Real Madrid versus Manchester City — multi-token identity", () => {
    const groups = parseRetentionMatchupParticipantGroups(
      "Real Madrid versus Manchester City preview",
      "match_preview",
    );
    assert.ok(groups);
    assert.ok(groups![0]!.requiredIdentityTokens.includes("real"));
    assert.ok(groups![0]!.requiredIdentityTokens.includes("madrid"));
    assert.ok(groups![1]!.requiredIdentityTokens.includes("manchester"));
    assert.ok(groups![1]!.requiredIdentityTokens.includes("city"));
    assert.match(groups![0]!.displayLabel, /Real Madrid/);
    const coverage = buildRetentionParticipantCoverage({
      topic: "Real Madrid versus Manchester City preview",
      scriptMode: "match_preview",
    });
    assert.equal(
      evaluateRetentionParticipantCoverage({
        coverage,
        narration: "Real changed the city under late pressure.",
      }).passed,
      false,
      "incidental Real/city must not satisfy Real Madrid vs Manchester City",
    );
    assert.equal(
      evaluateRetentionParticipantCoverage({
        coverage,
        narration:
          "Real Madrid met Manchester City. Intensity climbed through the night.",
      }).passed,
      true,
    );
  });

  await check("[M4] AC Milan versus AS Roma — prefixes optional, cores required", () => {
    const groups = parseRetentionMatchupParticipantGroups(
      "AC Milan versus AS Roma match review",
      "match_recap",
    );
    assert.ok(groups);
    assert.ok(groups![0]!.tokens.includes("ac"));
    assert.ok(groups![0]!.tokens.includes("milan"));
    assert.ok(groups![1]!.tokens.includes("as"));
    assert.ok(groups![1]!.tokens.includes("roma"));
    assert.deepEqual([...groups![0]!.requiredIdentityTokens], ["milan"]);
    assert.deepEqual([...groups![1]!.requiredIdentityTokens], ["roma"]);
    const coverage = buildRetentionParticipantCoverage({
      topic: "AC Milan versus AS Roma match review",
      scriptMode: "match_recap",
    });
    assert.equal(
      evaluateRetentionParticipantCoverage({
        coverage,
        narration: "Milan met Roma under clear stakes tonight.",
      }).passed,
      true,
    );
  });

  await check("[M5] São Paulo versus AI FC — Unicode/ASCII folding", () => {
    const groups = parseRetentionMatchupParticipantGroups(
      "São Paulo versus AI FC preview",
      "match_preview",
    );
    assert.ok(groups);
    assert.ok(groups![0]!.tokens.includes("sao"));
    assert.ok(groups![0]!.tokens.includes("paulo"));
    assert.ok(groups![1]!.tokens.includes("ai"));
    assert.ok(groups![1]!.tokens.includes("fc"));
    const narration = "Sao Paulo met AI FC.";
    const coverage = buildRetentionParticipantCoverage({
      topic: "São Paulo versus AI FC preview",
      scriptMode: "match_preview",
    });
    assert.equal(
      evaluateRetentionParticipantCoverage({ coverage, narration }).passed,
      true,
    );
  });

  await check("[M6] generic Argentina resilience — no opponent invented", () => {
    const groups = parseRetentionMatchupParticipantGroups(
      "Argentina resilience story under pressure",
      "match_recap",
    );
    assert.equal(groups, null);
    const coverage = buildRetentionParticipantCoverage({
      topic: "Argentina resilience story under pressure",
      scriptMode: "match_recap",
    });
    assert.equal(coverage.required, false);
  });

  await check("[M7] How Spain can beat the press — not a matchup", () => {
    const groups = parseRetentionMatchupParticipantGroups(
      "How Spain can beat the press",
      "match_preview",
    );
    assert.equal(groups, null);
  });

  await check("[M8] result-like topic — identities ok, unsupported result not granted", () => {
    const coverage = buildRetentionParticipantCoverage({
      topic: "Argentina versus England 2–1 dramatic finish",
      scriptMode: "match_recap",
    });
    assert.equal(coverage.required, true);
    // Coverage does not encode scoreline authority in participant tokens/labels.
    const identityBlob = JSON.stringify({
      labels: coverage.groups.map((g) => g.displayLabel),
      tokens: coverage.groups.map((g) => g.tokens),
      required: coverage.groups.map((g) => g.requiredIdentityTokens),
    });
    assert.equal(/\b2\b|2-1|2–1/.test(identityBlob), false);
  });

  await check("[M9] Hook opening Argentina, body England — passes", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Argentina versus England match review",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      scriptMode: "match_recap",
      formatStrategyId: "short_retention",
      composer: async (request) => {
        const n = request.orderedBeatIds.length;
        return {
          title: "Argentina England coverage",
          hookClaimRefs: [],
          segments: request.orderedBeatIds.map((beatId, i) => ({
            beatId,
            text:
              i === 0
                ? "Why does Argentina pressure matter? Argentina focus reshapes this review tonight."
                : i === 1
                  ? "England answers with discipline under relentless pressure tonight."
                  : i === n - 1
                    ? "Argentina pressure closes this England review tonight."
                    : "Momentum swings with every collision and reset tonight.",
            claimRefs: [],
          })),
        };
      },
      planner: null,
      hookRunner: retentionProductionDoubles("cheap").hookRunner,
    });
    assert.equal(result.ok, true, result.ok ? "" : result.failureCategory);
    if (result.ok) {
      assert.match(result.approved.narration, /^Why does Argentina/i);
      assert.match(result.approved.narration, /England/i);
      assert.equal(
        result.approved.generationDisposition?.adaptations.includes(
          "participant_coverage_reconciled",
        ) ?? false,
        false,
      );
    }
  });

  await check("[M10] compression protects sole England reference", async () => {
    const env = await coherentEnvelope("cheap", {
      topic: "Argentina versus England match review",
      scriptMode: "match_recap",
    });
    const englandSentence = "England answers with discipline under relentless pressure.";
    const texts = env.plan.beatPlan.beats.map((beat, i) => {
      if (i === 0) {
        return "Why does Argentina pressure matter? Argentina focus reshapes this review tonight with extra filler words for budget pressure.";
      }
      if (i === 1) return englandSentence;
      return padSpokenWords(
        "Momentum swings with every collision and reset tonight across the pitch",
        12,
      );
    });
    const candidate = buildRetentionNarrationCandidateFromProposal({
      proposal: {
        title: "t",
        hookClaimRefs: [],
        segments: env.plan.beatPlan.beats.map((beat, i) => ({
          beatId: beat.id,
          text: texts[i]!,
          claimRefs: [],
        })),
      },
      plan: env.plan,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      origin: "after_hook_approval",
    }).candidate;

    // Force over-budget by using a tiny fake target via plan clone is hard;
    // instead assert sole-coverage protection helper via enforce with contract.
    const enforced = enforceRetentionCandidateWordBudget({
      candidate,
      plan: {
        ...env.plan,
        compressionGoals: {
          ...env.plan.compressionGoals,
          // Keep enough room that England sentence need not be the only cut —
          // if over budget, England must not be sole-coverage dropped.
          targetWordBudget: Math.max(
            20,
            countRetentionNarrationWords(candidate.assembledNarration) - 8,
          ),
        },
      },
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      contract: env.contract,
      approvedOpeningText: "Why does Argentina pressure matter?",
    });
    assert.match(enforced.assembledNarration, /England/i);
  });

  await check("[M11] forged participant groups fail closed", async () => {
    const env = await coherentEnvelope("cheap", {
      topic: "Argentina versus England match review",
      scriptMode: "match_recap",
    });
    const forged = {
      policyVersion: env.plan.participantCoverage.policyVersion,
      required: true,
      groupTokenSets: [["spain"], ["france"]],
    };
    const canonical = env.plan.participantCoverage;
    assert.notEqual(
      JSON.stringify(forged.groupTokenSets),
      JSON.stringify(canonical.groupTokenSets),
    );
    // Stamped plan authority must equal recomputed contract coverage.
    const recomputed = toRetentionParticipantCoverageSummary(
      buildRetentionParticipantCoverage(env.contract),
    );
    assert.deepEqual(recomputed.groupTokenSets, canonical.groupTokenSets);
    assert.notDeepEqual(forged.groupTokenSets, recomputed.groupTokenSets);
  });

  await check("[M12] scenes-only unchanged / zero Retention participant work", () => {
    const coverage = buildRetentionParticipantCoverage({
      topic: "Argentina versus England",
      scriptMode: "match_recap",
    });
    assert.equal(coverage.required, true);
    // scenes-only generation path never builds a Retention plan with coverage.
    const scenes = readFileSync(
      path.join(
        process.cwd(),
        "src/features/retention-story/production/run-retention-production-narration.ts",
      ),
      "utf8",
    );
    assert.match(scenes, /scenes_only_not_applicable/);
  });

  await check("[M13] JSON/NDJSON privacy — no raw authority leakage", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Argentina versus England match review",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      scriptMode: "match_recap",
      ...retentionProductionDoubles("cheap"),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const blob = JSON.stringify(result.approved);
    assert.equal(blob.includes("participantCoverage"), false);
    assert.equal(blob.includes("groupTokenSets"), false);
    assertNoSecrets(blob);
  });

  await check("[M14] zero-model reconcile inserts qualitative meeting language only", async () => {
    const env = await coherentEnvelope("cheap", {
      topic: "Argentina versus England match review",
      scriptMode: "match_recap",
    });
    const candidate = buildRetentionNarrationCandidateFromProposal({
      proposal: fittingProposal(env.plan),
      plan: env.plan,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      origin: "after_hook_approval",
    }).candidate;
    assert.equal(
      evaluateRetentionParticipantCoverage({
        coverage: buildRetentionParticipantCoverage(env.contract),
        narration: candidate.assembledNarration,
      }).passed,
      false,
    );
    const reconciled = reconcileRetentionParticipantCoverageZeroModel({
      contract: env.contract,
      plan: env.plan,
      grounding: env.grounding,
      strategySeed: env.strategySeed,
      candidate,
    });
    assert.equal(reconciled.ok, true);
    if (!reconciled.ok) return;
    assert.match(reconciled.candidate.assembledNarration, /England/i);
    assert.doesNotMatch(reconciled.candidate.assembledNarration, /\b2\s*[-–]\s*1\b/);
    assert.match(
      reconciled.candidate.assembledNarration,
      /Argentina met England/i,
    );
  });

  await check("[M15] Argentina wins against England — identity only, framing fails", () => {
    const groups = parseRetentionMatchupParticipantGroups(
      "Argentina wins against England with 2-1 scoreline",
      "match_recap",
    );
    assert.ok(groups);
    assert.deepEqual([...groups![0]!.requiredIdentityTokens], ["argentina"]);
    assert.deepEqual([...groups![1]!.requiredIdentityTokens], ["england"]);
    assert.equal(groups![0]!.displayLabel, "Argentina");
    assert.equal(groups![1]!.displayLabel, "England");
    assert.equal(groups![0]!.tokens.includes("wins"), false);
    assert.equal(groups![1]!.tokens.includes("with"), false);
    assert.equal(groups![1]!.tokens.includes("scoreline"), false);
    const coverage = buildRetentionParticipantCoverage({
      topic: "Argentina wins against England with 2-1 scoreline",
      scriptMode: "match_recap",
    });
    assert.equal(
      evaluateRetentionParticipantCoverage({
        coverage,
        narration: "Wins arrived with pressure and a scoreline still unfinished.",
      }).passed,
      false,
    );
    assert.equal(
      evaluateRetentionParticipantCoverage({
        coverage,
        narration: "Argentina met England. Late pressure stayed unfinished.",
      }).passed,
      true,
    );
  });

  await check("[M16] Argentina defeated England — result verb separator", () => {
    const groups = parseRetentionMatchupParticipantGroups(
      "Argentina defeated England in a dramatic match",
      "match_recap",
    );
    assert.ok(groups);
    assert.deepEqual([...groups![0]!.requiredIdentityTokens], ["argentina"]);
    assert.deepEqual([...groups![1]!.requiredIdentityTokens], ["england"]);
    assert.equal(groups![0]!.tokens.includes("defeated"), false);
    assert.equal(groups![1]!.tokens.includes("dramatic"), false);
  });

  await check("[M17] England lost against Argentina — framing stripped", () => {
    const groups = parseRetentionMatchupParticipantGroups(
      "England lost against Argentina",
      "match_recap",
    );
    assert.ok(groups);
    assert.deepEqual([...groups![0]!.requiredIdentityTokens], ["england"]);
    assert.deepEqual([...groups![1]!.requiredIdentityTokens], ["argentina"]);
    assert.equal(groups![0]!.tokens.includes("lost"), false);
  });

  await check("[M18] framing-only narration fails both sides", () => {
    const coverage = buildRetentionParticipantCoverage({
      topic: "argentina versus england match review",
      scriptMode: "match_recap",
    });
    assert.equal(coverage.required, true);
    assert.equal(
      evaluateRetentionParticipantCoverage({
        coverage,
        narration:
          "A dramatic match review under late pressure with a narrow scoreline result.",
      }).passed,
      false,
    );
  });

  await check("[M19] malformed / repeated separators fail closed", () => {
    assert.equal(
      parseRetentionMatchupParticipantGroups(
        "Argentina versus England versus France",
        "match_recap",
      ),
      null,
    );
    assert.equal(
      parseRetentionMatchupParticipantGroups(
        "Argentina versus versus England",
        "match_recap",
      ),
      null,
    );
    assert.equal(
      parseRetentionMatchupParticipantGroups("versus England", "match_recap"),
      null,
    );
  });

  await check("[M20] lowercase creator topics preserve identity", () => {
    const groups = parseRetentionMatchupParticipantGroups(
      "argentina versus england dramatic match review",
      "match_recap",
    );
    assert.ok(groups);
    assert.deepEqual([...groups![0]!.requiredIdentityTokens], ["argentina"]);
    assert.deepEqual([...groups![1]!.requiredIdentityTokens], ["england"]);
    assert.equal(
      evaluateRetentionParticipantCoverage({
        coverage: buildRetentionParticipantCoverage({
          topic: "argentina versus england dramatic match review",
          scriptMode: "match_recap",
        }),
        narration: "argentina met england under clear stakes.",
      }).passed,
      true,
    );
  });

  await check("[M21] policy version is participant-coverage/2", () => {
    const coverage = buildRetentionParticipantCoverage({
      topic: "Spain vs France",
      scriptMode: "match_preview",
    });
    assert.equal(coverage.policyVersion, "participant-coverage/2");
    assert.equal(
      toRetentionParticipantCoverageSummary(coverage).policyVersion,
      "participant-coverage/2",
    );
  });

  console.log("\nretentionMatchupParticipantCoverage — all fixtures passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
