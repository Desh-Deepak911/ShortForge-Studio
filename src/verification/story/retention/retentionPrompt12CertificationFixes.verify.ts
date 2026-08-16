/**
 * Story-quality Prompt 12 — post-acceptance keep, opening promotion,
 * ranking duration, and ranking brief. Provider-free.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "path";

import {
  applyRetentionBoundedDurationCompression,
  applyRetentionSupportedOpeningPromotion,
  buildRetentionComposerRequest,
  buildRetentionCreatorContentContract,
  createRetentionFrozenProductionComposer,
  evaluateRetentionCanonicalNarrationAcceptance,
  evaluateRetentionDurationFit,
  evaluateRetentionSpokenClaimGrounding,
  runRetentionProductionNarration,
} from "@/features/retention-story";
import { createRetentionModelCallLedger } from "@/features/retention-story/budget/create-retention-model-call-ledger";
import { normalizeStoryContract } from "@/features/retention-story/domain/normalize-story-contract";
import { buildReliabilityDeterministicRetentionPlan } from "@/features/retention-story/planning/build-reliability-deterministic-retention-plan";
import { RETENTION_WORDS_PER_SECOND } from "@/features/retention-story/planning/retention-story-plan.constants";
import { buildProductionStoryContractInput } from "@/features/retention-story/production/build-production-story-contract-input";
import { countRetentionNarrationWords } from "@/features/retention-story/validation/count-retention-narration-words";
import type { RetentionHookRunner } from "@/features/retention-story";
import type { RetentionComposerCallback } from "@/features/retention-story";
import type { ScriptMode } from "@/types/footiebitz";

const CAPTURE_DIR = path.resolve(
  process.cwd(),
  ".tmp/story-quality-rejected-proposals",
);

const PLAYER_TOPIC = "Calen Voss Harbor return";
const PLAYER_CONTEXT = [
  "After a long doping ban kept Calen Voss out of every competitive fixture, the striker returned to Harbor United still serving a club monitoring plan.",
  "Harbor United finished tenth in Voss's first stretch back.",
  "New coach Mira Solan arrived midseason and asked the crowd to stay patient.",
  "The support-versus-pressure payoff is whether Harbor stands with Voss or turns on him.",
  "Do not claim Voss failed a new test.",
].join("\n");

const PREVIEW_TOPIC = "Rookfall versus Silvermere continental preview";
const PREVIEW_CONTEXT = [
  "Both clubs won continental titles in the last decade.",
  "Each side has missed the knockout rounds for two seasons.",
  "Former Rookfall coach Ivo Kest now leads Silvermere.",
  "The redemption angle is whether Kest can beat the club that discarded him.",
].join("\n");

const RANKING_TOPIC = "Five Harbor attackers to watch";
const RANKING_CONTEXT = [
  "1. Nia Calder — she creates the first shot in almost every Harbor attack.",
  "2. Tess Orlow — tempo control through the middle third.",
  "3. Bo Renwick — recovery sprints that rescue broken presses.",
  "4. Imani Shore — set-piece delivery from both flanks.",
  "5. Pax Ellery — late-box arrivals after the second ball.",
].join("\n");

const DRIFTMERE_TOPIC = "Five Driftmere midfielders to watch";
const DRIFTMERE_CONTEXT = [
  "1. Lina Crowe — she creates the first shot in almost every Driftmere attack.",
  "2. Oren Pike — tempo control through the middle third.",
  "3. Sable Quin — recovery sprints that rescue broken presses.",
  "4. Theo Marrow — set-piece delivery from both flanks.",
  "5. Vesper Holt — late-box arrivals after the second ball.",
].join("\n");

function loadCaptured(
  caseId: string,
  fallbackTitle: string,
  fallbackNarration: string,
): { readonly title: string; readonly narration: string } {
  const file = path.join(CAPTURE_DIR, `${caseId}.json`);
  if (!existsSync(file)) {
    return { title: fallbackTitle, narration: fallbackNarration };
  }
  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    readonly parsedModelProposal?: { title?: string; narration?: string };
  };
  return {
    title: raw.parsedModelProposal?.title ?? fallbackTitle,
    narration: raw.parsedModelProposal?.narration ?? fallbackNarration,
  };
}

const repairSpyHook = (counts: { repair: number; initial: number }): RetentionHookRunner =>
  async (input) => {
    await input.modelCall({
      kind: "initial",
      topic: input.topic,
      tone: input.tone,
      duration: input.duration,
      scriptMode: input.scriptMode,
      context: input.context,
      templatePromptBlock: input.templatePromptBlock,
      hookDirectiveBlock: input.hookContext.directive.promptBlock,
      permittedClaimIds: input.hookContext.permittedClaimIds,
      qualityMode: input.qualityMode,
      model: input.model,
    });
    counts.initial += 1;
    try {
      await input.modelCall({
        kind: "repair",
        topic: input.topic,
        tone: input.tone,
        duration: input.duration,
        scriptMode: input.scriptMode,
        context: input.context,
        templatePromptBlock: input.templatePromptBlock,
        hookDirectiveBlock: input.hookContext.directive.promptBlock,
        permittedClaimIds: input.hookContext.permittedClaimIds,
        qualityMode: input.qualityMode,
        model: input.model,
      });
      counts.repair += 1;
    } catch {
      counts.repair += 1;
    }
    return {
      ok: false,
      error: "safe_fallback_failed_hard_gate",
      diagnostics: { fallbackReason: "safe_fallback_failed_hard_gate" },
    };
  };

async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  console.log(`  ✓ ${label}`);
}

function ready(input: {
  readonly topic: string;
  readonly manualContext?: string;
  readonly scriptMode?: ScriptMode;
  readonly durationSec?: number;
}) {
  const contractInput = buildProductionStoryContractInput({
    topic: input.topic,
    durationSec: input.durationSec ?? 30,
    generationPath: "script_only",
    qualityMode: "cheap",
    scriptMode: input.scriptMode ?? "story",
    tone: "dramatic",
    factHandlingMode: "verified_facts_only",
    manualContext: input.manualContext,
  });
  const contract = normalizeStoryContract(contractInput);
  const grounding = contractInput.grounding!;
  const planResult = buildReliabilityDeterministicRetentionPlan({
    contract,
    grounding,
    manualContext: input.manualContext ?? null,
    planner: null,
    ledger: createRetentionModelCallLedger(contract.qualityMode),
  });
  if (planResult.status !== "ready") throw new Error("plan");
  const contentContract = buildRetentionCreatorContentContract({
    contract,
    grounding,
    manualContext: input.manualContext,
  });
  const request = buildRetentionComposerRequest({
    contract,
    plan: planResult.plan,
    strategySeed: planResult.strategySeed,
    grounding,
    manualContext: input.manualContext,
    hookDirectiveBlock: "",
    modelCallKind: "initial",
    contentContract,
  });
  return {
    contentContract,
    request,
    eligibleClaimIds: new Set(request.eligibleClaims.map((c) => c.claimId)),
    plan: planResult.plan,
    grounding,
  };
}

async function replay(input: {
  readonly topic: string;
  readonly manualContext: string;
  readonly scriptMode: ScriptMode;
  readonly title: string;
  readonly narration: string;
  readonly durationSec?: number;
  readonly qualityMode?: "cheap" | "balanced";
  readonly hookRunner?: RetentionHookRunner;
  readonly composerCalls?: { count: number };
  readonly composer?: RetentionComposerCallback;
}) {
  return runRetentionProductionNarration({
    topic: input.topic,
    manualContext: input.manualContext,
    durationSec: input.durationSec ?? 30,
    generationPath: "script_only",
    qualityMode: input.qualityMode ?? "cheap",
    scriptMode: input.scriptMode,
    planner: null,
    composer: input.composer ?? (async (request) => {
      if (input.composerCalls) input.composerCalls.count += 1;
      return createRetentionFrozenProductionComposer({
        title: input.title,
        narration: input.narration,
      })(request);
    }),
    hookRunner: input.hookRunner,
  });
}

async function main(): Promise<void> {
  console.log("retention-prompt12-certification-fixes");

  const preview = loadCaptured(
    "prompt11-cert-fast-preview",
    "Rookfall versus Silvermere continental preview",
    "Rookfall versus Silvermere continental preview sets the stage for a fierce contest. Both clubs won continental titles in the last decade, but each has missed the knockout rounds for two seasons. Former Rookfall coach Ivo Kest now leads Silvermere, raising the question of whether Kest can achieve redemption by beating the club that discarded him.",
  );
  const balanced = loadCaptured(
    "prompt11-cert-balanced-player",
    "Calen Voss Harbor return: support or pressure?",
    "Why Calen Voss? After a long doping ban, Voss returned to Harbor United still under club monitoring, with every move watched. In his first stretch back, Harbor finished tenth—hardly the comeback fans hoped for. Then, midseason, new coach Mira Solan pleaded for patience from the crowd. Now the real question: does Harbor stand with Voss, or turn on him?",
  );
  const wrongRanking = loadCaptured(
    "prompt11-cert-fast-ranking",
    "Five Harbor attackers to watch",
    "Five Harbor attackers to watch start with Nia Calder, who creates the first shot in almost every Harbor attack. Next is Tess Orlow, controlling tempo through the middle third. Bo Renwick follows with recovery sprints that rescue broken presses. Imani Shore delivers set-pieces from both flanks, setting up key chances. Finally, Pax Ellery stands out with late-box arrivals after the second ball, making him the decisive name in this lineup.",
  );
  const durationRanking = loadCaptured(
    "prompt11-cert-fast-ranking-second",
    "Five Driftmere midfielders to watch",
    "Five Driftmere midfielders to watch start with Lina Crowe, who creates the first shot in almost every Driftmere attack. Next is Oren Pike, who controls the tempo through the middle third. Then comes Sable Quin, known for recovery sprints that rescue broken presses. Theo Marrow contributes with set-piece delivery from both flanks. Finally, Vesper Holt excels with late-box arrivals after the second ball, making her decisive in finishing plays. Lina Crowe stands as the number one due to her pivotal role in initiating attacks.",
  );

  await check("[12A] captured preview finishes model_direct", async () => {
    const counts = { repair: 0, initial: 0 };
    const composerCalls = { count: 0 };
    const result = await replay({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
      title: preview.title,
      narration: preview.narration,
      hookRunner: repairSpyHook(counts),
      composerCalls,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("preview");
    const trace = result.approved.generationDisposition?.acceptanceTrace;
    assert.equal(trace?.finalNarrationAuthority, "model_direct");
    assert.equal(trace?.deterministicRescueEntered, false);
    assert.equal(result.approved.narration, preview.narration);
    assert.equal(counts.repair, 0);
    assert.equal(composerCalls.count, 1);
  });

  await check("[12A] canonical Pass cannot reach Hook repair or rescue", async () => {
    const counts = { repair: 0, initial: 0 };
    const result = await replay({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
      title: preview.title,
      narration: preview.narration,
      hookRunner: repairSpyHook(counts),
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("keep");
    assert.equal(counts.repair, 0);
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace?.deterministicRescueEntered,
      false,
    );
  });

  await check("[12A] stale hardGatesPassed cannot reverse accepted preview", async () => {
    const result = await replay({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
      title: preview.title,
      narration: preview.narration,
      hookRunner: async () => ({
        ok: false,
        error: "compatibility_fallback_failed_hard_gate",
        diagnostics: { fallbackReason: "compatibility_fallback_failed_hard_gate" },
      }),
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("stale gates");
    assert.equal(result.approved.narration, preview.narration);
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace?.finalNarrationAuthority,
      "model_direct",
    );
  });

  await check("[12A] rejected narration can still repair or rescue before commit", async () => {
    const invented =
      "Calen Voss already scored 14 Harbor goals this week. Harbor finished tenth. Mira Solan asked for patience. Will Harbor stand with him?";
    const result = await replay({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      scriptMode: "player_analysis",
      title: "Calen Voss Harbor return",
      narration: invented,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("invention");
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace?.finalNarrationAuthority,
      "deterministic_rescue",
    );
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace?.deterministicRescueEntered,
      true,
    );
    assert.doesNotMatch(result.approved.narration, /\b14\b/);
  });

  await check("[12B] unsupported opening plus grounded body promotes", () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      scriptMode: "player_analysis",
    });
    const source =
      "Why Calen Voss? After a long doping ban kept Calen Voss out of every competitive fixture, the striker returned to Harbor United still serving a club monitoring plan. Harbor United finished tenth in Voss's first stretch back. New coach Mira Solan arrived midseason and asked the crowd to stay patient. Does Harbor stand with Voss or turn on him?";
    const openingGrounding = evaluateRetentionSpokenClaimGrounding({
      narration: "Why Calen Voss?",
      contentContract: bundle.contentContract,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(openingGrounding.ok, false);
    const promoted = applyRetentionSupportedOpeningPromotion({
      title: "Calen Voss Harbor return",
      narration: source,
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(promoted.ok, true, "promotion should accept");
    assert.equal(promoted.rewriteType, "supported_opening_promotion");
    assert.equal(promoted.providerCalls, 0);
    assert.equal(
      promoted.preservedRemainder,
      source.slice(source.indexOf("After")).trim(),
    );
    assert.equal(promoted.narration, promoted.preservedRemainder);
    assert.match(promoted.promotedOpening, /After a long doping ban/u);
    assert.match(promoted.narration, /Does Harbor stand with Voss/u);
  });

  await check("[12B] captured Balanced promotes when the body qualifies", async () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      scriptMode: "player_analysis",
    });
    const remainder = balanced.narration.replace(/^Why Calen Voss\?\s*/u, "");
    const restGrounding = evaluateRetentionSpokenClaimGrounding({
      narration: remainder,
      contentContract: bundle.contentContract,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(restGrounding.ok, true, "captured Balanced remainder must qualify");
    const result = await replay({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      scriptMode: "player_analysis",
      qualityMode: "balanced",
      title: balanced.title,
      narration: balanced.narration,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("balanced");
    const trace = result.approved.generationDisposition?.acceptanceTrace;
    assert.equal(
      trace?.finalNarrationAuthority,
      "model_after_rewrite",
      JSON.stringify(trace),
    );
    assert.equal(trace?.boundedRewriteType, "supported_opening_promotion");
    assert.equal(result.approved.narration, remainder);
    assert.equal(trace?.deterministicRescueEntered, false);
  });

  await check("[12B] incomplete remainder after opening removal is rejected", () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      scriptMode: "player_analysis",
    });
    const promoted = applyRetentionSupportedOpeningPromotion({
      title: "Calen Voss Harbor return",
      narration: "Why Calen Voss? And then.",
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(promoted.ok, false);
  });

  await check("[12B] unsupported later body still rescues", async () => {
    const result = await replay({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      scriptMode: "player_analysis",
      title: "Calen Voss Harbor return",
      narration:
        "After a long doping ban kept Calen Voss out of every competitive fixture, the striker returned to Harbor United still serving a club monitoring plan. Harbor secretly signed a $40 million fee yesterday. New coach Mira Solan arrived midseason and asked the crowd to stay patient. Does Harbor stand with Voss or turn on him?",
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("later unsupported");
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace?.finalNarrationAuthority,
      "deterministic_rescue",
    );
  });

  await check("[12C] wrong-number-one ranking still rescues", async () => {
    const result = await replay({
      topic: RANKING_TOPIC,
      manualContext: RANKING_CONTEXT,
      scriptMode: "top_5",
      title: wrongRanking.title,
      narration: wrongRanking.narration,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("wrong ranking");
    const trace = result.approved.generationDisposition?.acceptanceTrace;
    assert.equal(trace?.finalNarrationAuthority, "deterministic_rescue");
    assert.match(result.approved.narration, /Nia Calder/u);
    assert.match(result.approved.narration, /number one|stands last|decisive name|#1/iu);
  });

  await check("[12C] one unsupported final ranking flourish is replaced locally", async () => {
    const supportedPrefix =
      "Five Harbor attackers to watch start with Nia Calder, who creates the first shot in almost every Harbor attack. Tess Orlow controls tempo through the middle third. Bo Renwick makes recovery sprints that rescue broken presses. Imani Shore delivers set pieces from both flanks. Pax Ellery makes late-box arrivals after the second ball.";
    const result = await replay({
      topic: RANKING_TOPIC,
      manualContext: RANKING_CONTEXT,
      scriptMode: "top_5",
      title: "Five Harbor attackers to watch",
      narration: `${supportedPrefix} Nia Calder is number one because her influence guarantees Harbor's greatest season.`,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("ranking closer repair");
    const trace = result.approved.generationDisposition?.acceptanceTrace;
    assert.equal(trace?.finalNarrationAuthority, "model_after_rewrite");
    assert.equal(trace?.boundedRewriteType, "ranking_payoff_repair");
    assert.equal(trace?.deterministicRescueEntered, false);
    assert.ok(result.approved.narration.startsWith(supportedPrefix));
    assert.doesNotMatch(result.approved.narration, /guarantees Harbor's greatest season/u);
    assert.match(result.approved.narration, /Nia Calder.+number-one/u);
  });

  await check("[12C] repaired overlong ranking gets one bounded compression", async () => {
    const source =
      "Five Harbor attackers to watch begin with Nia Calder, who creates the first shot in almost every Harbor attack and carries the opening threat through each phase. Tess Orlow controls the tempo through the middle third and gives Harbor a stable rhythm in possession. Bo Renwick makes recovery sprints that rescue broken presses whenever the shape opens. Imani Shore supplies set-piece delivery from both flanks throughout the match. Pax Ellery makes late-box arrivals after the second ball. Nia Calder is number one because her influence guarantees Harbor's greatest season.";
    const compressed =
      "Five Harbor attackers to watch begin with Nia Calder, who creates the first shot in almost every Harbor attack. Tess Orlow controls tempo through the middle third. Bo Renwick makes recovery sprints that rescue broken presses. Imani Shore delivers set pieces from both flanks. Pax Ellery makes late-box arrivals after the second ball. Nia Calder stands last as the number-one name.";
    const bundle = ready({
      topic: RANKING_TOPIC,
      manualContext: RANKING_CONTEXT,
      scriptMode: "top_5",
    });
    const compressedAcceptance = evaluateRetentionCanonicalNarrationAcceptance({
      raw: { title: "Five Harbor attackers to watch", narration: compressed },
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(
      compressedAcceptance.decision,
      "accept",
      compressedAcceptance.stage ?? "compressed acceptance",
    );
    const result = await replay({
      topic: RANKING_TOPIC,
      manualContext: RANKING_CONTEXT,
      scriptMode: "top_5",
      title: "Five Harbor attackers to watch",
      narration: source,
      composer: async (request) =>
        request.modelCallKind === "length_compress"
          ? { title: "Five Harbor attackers to watch", narration: compressed }
          : { title: "Five Harbor attackers to watch", narration: source },
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("ranking chained compression");
    const trace = result.approved.generationDisposition?.acceptanceTrace;
    assert.equal(
      trace?.finalNarrationAuthority,
      "model_after_rewrite",
      JSON.stringify(trace),
    );
    assert.equal(trace?.boundedRewriteType, "duration_compression");
    assert.equal(trace?.deterministicRescueEntered, false);
    assert.equal(result.approved.narration, compressed);
  });

  await check("[12C] correct ranking duration miss is measured and accepted", async () => {
    const bundle = ready({
      topic: DRIFTMERE_TOPIC,
      manualContext: DRIFTMERE_CONTEXT,
      scriptMode: "top_5",
      durationSec: 30,
    });
    const words = countRetentionNarrationWords(durationRanking.narration);
    const hard = bundle.request.compositionBrief.durationUtilisation.storyHardWordBudget;
    const fit = evaluateRetentionDurationFit({
      narration: durationRanking.narration,
      hardWordBudget: hard,
      targetWordBudget: bundle.request.compositionBrief.durationUtilisation.storyTargetWordBudget,
      minimumUsefulWords: bundle.request.compositionBrief.durationUtilisation.minimumUsefulWords,
      durationSec: 30,
      preserveCompleteRanking: true,
    });
    assert.equal(hard, Math.round(30 * RETENTION_WORDS_PER_SECOND));
    assert.ok(words > hard, `expected captured overrun, got ${words}/${hard}`);
    assert.equal(fit.acceptable, true);
    assert.ok(
      fit.warningIds.includes("duration_target_not_fully_met") ||
        fit.warningIds.includes("duration_slightly_over_target"),
    );
    const compressed = applyRetentionBoundedDurationCompression({
      narration: durationRanking.narration,
      brief: bundle.request.compositionBrief,
    });
    assert.equal(compressed.membersPreserved, true);
    assert.equal(compressed.orderPreserved, true);
    assert.equal(compressed.numberOnePreserved, true);
    const canonical = evaluateRetentionCanonicalNarrationAcceptance({
      raw: durationRanking,
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(canonical.decision, "accept", canonical.stage ?? "accept");
    const result = await replay({
      topic: DRIFTMERE_TOPIC,
      manualContext: DRIFTMERE_CONTEXT,
      scriptMode: "top_5",
      title: durationRanking.title,
      narration: durationRanking.narration,
      durationSec: 30,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("duration ranking");
    const trace = result.approved.generationDisposition?.acceptanceTrace;
    assert.ok(
      trace?.finalNarrationAuthority === "model_direct" ||
        trace?.finalNarrationAuthority === "model_after_rewrite",
    );
    assert.equal(trace?.deterministicRescueEntered, false);
    for (const name of ["Lina Crowe", "Oren Pike", "Sable Quin", "Theo Marrow", "Vesper Holt"]) {
      assert.match(result.approved.narration, new RegExp(name.split(" ")[0]!, "u"));
    }
    assert.match(result.approved.narration, /Lina Crowe/u);
    assert.match(result.approved.narration, /number one|stands last|decisive name|#1/iu);
  });

  await check("[12D] ranking brief names exact number-one and direction", () => {
    const five = ready({
      topic: RANKING_TOPIC,
      manualContext: RANKING_CONTEXT,
      scriptMode: "top_5",
    });
    assert.equal(five.request.compositionBrief.rankingNumberOneMember, "Nia Calder");
    assert.equal(
      five.request.compositionBrief.rankingSpeakDirection,
      "listed_order_to_number_one",
    );
    assert.match(
      five.request.compositionBrief.rankingPresentationInstruction,
      /Nia Calder/,
    );
    assert.match(
      five.request.compositionBrief.rankingPresentationInstruction,
      /Do not infer a different winner/,
    );

    const three = ready({
      topic: "Three Harbor attackers to watch",
      manualContext: [
        "1. Nia Calder — first shot creation.",
        "2. Tess Orlow — tempo control.",
        "3. Bo Renwick — recovery sprints.",
      ].join("\n"),
      scriptMode: "top_5",
    });
    assert.equal(three.request.compositionBrief.rankingNumberOneMember, "Nia Calder");
    assert.equal(three.request.compositionBrief.requiredRankingOrder.length, 3);

    const oneToFive = ready({
      topic: DRIFTMERE_TOPIC,
      manualContext: DRIFTMERE_CONTEXT,
      scriptMode: "top_5",
    });
    assert.equal(oneToFive.request.compositionBrief.rankingNumberOneMember, "Lina Crowe");
    assert.deepEqual(oneToFive.request.compositionBrief.requiredRankingOrder, [
      "Lina Crowe",
      "Oren Pike",
      "Sable Quin",
      "Theo Marrow",
      "Vesper Holt",
    ]);

    const unordered = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      scriptMode: "player_analysis",
    });
    assert.equal(unordered.request.compositionBrief.rankingNumberOneMember, null);
    assert.equal(unordered.request.compositionBrief.rankingSpeakDirection, "unordered");
  });

  console.log("retention-prompt12-certification-fixes: pass");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
