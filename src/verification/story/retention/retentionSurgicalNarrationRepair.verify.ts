/**
 * Story-quality Prompt 10 — surgical narration repair, weak-vs-broken Hooks,
 * saved-proposal replay, and post-acceptance keep invariant. Provider-free.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  applyRetentionBoundedOpeningRepair,
  applyRetentionBoundedRankingPayoffRepair,
  buildDeterministicRankingNumberOneCloser,
  buildRetentionComposerRequest,
  buildRetentionCreatorContentContract,
  buildRetentionPublicGenerationContextPresence,
  createRetentionFrozenProductionComposer,
  evaluateRetentionCanonicalNarrationAcceptance,
  evaluateRetentionHookBodyPayoff,
  evaluateRetentionSpokenClaimGrounding,
  RETENTION_PUBLIC_GENERATION_CONTEXT_SUPPLIED,
  runRetentionProductionNarration,
  serializeRetentionCanonicalGenerationResult,
} from "@/features/retention-story";
import { createRetentionModelCallLedger } from "@/features/retention-story/budget/create-retention-model-call-ledger";
import { normalizeStoryContract } from "@/features/retention-story/domain/normalize-story-contract";
import { buildReliabilityDeterministicRetentionPlan } from "@/features/retention-story/planning/build-reliability-deterministic-retention-plan";
import { buildProductionStoryContractInput } from "@/features/retention-story/production/build-production-story-contract-input";
import type { RetentionHookRunner } from "@/features/retention-story";
import type { ScriptMode } from "@/types/footiebitz";

import { passRetentionHookRunner } from "./retentionStoryQaDoubles";

const repairThenFailHook: RetentionHookRunner = async (input) => {
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
  } catch {
    // The later repair miss must not discard the accepted initial speech.
  }
  return {
    ok: false,
    error: "hook grounding failed after quality validation",
    diagnostics: { fallbackReason: "grounding" },
  };
};

const rejectHookGrounding: RetentionHookRunner = async (input) => {
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
  return {
    ok: false,
    error: "hook grounding failed after quality validation",
    diagnostics: { fallbackReason: "grounding" },
  };
};

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

const CAPTURE_DIR = path.resolve(
  process.cwd(),
  ".tmp/story-quality-rejected-proposals",
);

const SAVED = {
  player:
    "Can Calen Voss hold at Harbor United? After a long doping ban kept him out of every competitive fixture, Voss returned still under a club monitoring plan. Harbor United finished tenth in his first stretch back. New coach Mira Solan arrived midseason and asked fans to stay patient. The real question now is whether Harbor will stand with Voss or turn on him.",
  preview:
    "Rookfall versus Silvermere continental preview sets the stage for a dramatic clash. Both clubs have won continental titles in the last decade, yet each has missed the knockout rounds for two seasons. Former Rookfall coach Ivo Kest now leads Silvermere, adding a personal edge to the contest. The key question remains whether Kest can beat the club that discarded him, making this more than just a match but a test of redemption.",
  ranking:
    "Five Harbor attackers to watch start with Nia Calder, who creates the first shot in almost every Harbor attack. Next is Tess Orlow, controlling tempo through the middle third. Bo Renwick follows with recovery sprints that rescue broken presses. Imani Shore delivers set-pieces from both flanks. Finally, Pax Ellery makes late-box arrivals after the second ball, completing the threat lineup.",
  balanced:
    "Calen Voss Harbor return? After a long doping ban kept Calen Voss out of every competitive fixture, the striker returned to Harbor United still serving a club monitoring plan. Harbor United finished tenth in Voss's first stretch back. New coach Mira Solan arrived midseason and asked the crowd to stay patient. Does Harbor stand with Voss or turn on him?",
} as const;

function loadCapturedNarration(
  caseId: string,
  fallback: string,
): { readonly title: string; readonly narration: string } {
  const file = path.join(CAPTURE_DIR, `${caseId}.json`);
  if (!existsSync(file)) {
    return { title: caseId, narration: fallback };
  }
  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    readonly parsedModelProposal?: { title?: string; narration?: string };
  };
  const narration = raw.parsedModelProposal?.narration ?? fallback;
  const title = raw.parsedModelProposal?.title ?? caseId;
  return { title, narration };
}

async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  console.log(`  ✓ ${label}`);
}

function ready(input: {
  readonly topic: string;
  readonly manualContext?: string;
  readonly scriptMode?: ScriptMode;
}) {
  const contractInput = buildProductionStoryContractInput({
    topic: input.topic,
    durationSec: 45,
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
    strategySeed: planResult.strategySeed,
    grounding,
  };
}

async function replay(input: {
  readonly topic: string;
  readonly manualContext: string;
  readonly scriptMode: ScriptMode;
  readonly title: string;
  readonly narration: string;
  readonly hookRunner?: RetentionHookRunner;
}) {
  return runRetentionProductionNarration({
    topic: input.topic,
    manualContext: input.manualContext,
    durationSec: 45,
    generationPath: "script_only",
    qualityMode: "cheap",
    scriptMode: input.scriptMode,
    planner: null,
    composer: createRetentionFrozenProductionComposer({
      title: input.title,
      narration: input.narration,
    }),
    hookRunner: input.hookRunner ?? rejectHookGrounding,
  });
}

async function main(): Promise<void> {
  console.log("retention-surgical-narration-repair (Prompt 10)");

  const playerCapture = loadCapturedNarration(
    "prompt9-recert-fast-player",
    SAVED.player,
  );
  const previewCapture = loadCapturedNarration(
    "prompt9-recert-fast-preview",
    SAVED.preview,
  );
  const rankingCapture = loadCapturedNarration(
    "prompt9-recert-fast-ranking",
    SAVED.ranking,
  );
  const balancedCapture = loadCapturedNarration(
    "prompt9-recert-balanced-player",
    SAVED.balanced,
  );

  await check("[10A] saved Fast player replay is accepted and not reversed", async () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      scriptMode: "player_analysis",
    });
    const canonical = evaluateRetentionCanonicalNarrationAcceptance({
      raw: playerCapture,
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(canonical.decision, "accept", canonical.stage ?? "accept");
    const result = await replay({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      scriptMode: "player_analysis",
      title: playerCapture.title,
      narration: playerCapture.narration,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("player replay");
    const trace = result.approved.generationDisposition?.acceptanceTrace;
    assert.equal(trace?.finalNarrationAuthority, "model_direct");
    assert.equal(trace?.deterministicRescueEntered, false);
    assert.equal(result.approved.narration, playerCapture.narration);
  });

  await check("[10A] saved Fast preview replay is accepted and not reversed", async () => {
    const bundle = ready({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
    });
    const canonical = evaluateRetentionCanonicalNarrationAcceptance({
      raw: previewCapture,
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(canonical.decision, "accept", canonical.stage ?? "accept");
    const result = await replay({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
      title: previewCapture.title,
      narration: previewCapture.narration,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("preview replay");
    const trace = result.approved.generationDisposition?.acceptanceTrace;
    assert.equal(trace?.finalNarrationAuthority, "model_direct");
    assert.equal(trace?.deterministicRescueEntered, false);
    assert.equal(result.approved.narration, previewCapture.narration);
  });

  await check("[10A] later Hook repair failure cannot reverse accepted preview", async () => {
    const livePreview = loadCapturedNarration(
      "prompt10-cert-fast-preview",
      SAVED.preview,
    );
    const result = await replay({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
      title: livePreview.title,
      narration: livePreview.narration,
      hookRunner: repairThenFailHook,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("preview keep after repair miss");
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace?.finalNarrationAuthority,
      "model_direct",
    );
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace?.deterministicRescueEntered,
      false,
    );
    assert.equal(result.approved.narration, livePreview.narration);
  });

  await check("[10A] post-acceptance Hook/metadata stages cannot enter rescue", async () => {
    const result = await replay({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      scriptMode: "player_analysis",
      title: playerCapture.title,
      narration: playerCapture.narration,
      hookRunner: rejectHookGrounding,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("keep invariant");
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace?.deterministicRescueEntered,
      false,
    );
    assert.equal(result.approved.narration, playerCapture.narration);
  });

  await check("[10A/10D] saved ranking gets bounded number-one payoff repair", async () => {
    const bundle = ready({
      topic: RANKING_TOPIC,
      manualContext: RANKING_CONTEXT,
      scriptMode: "top_5",
    });
    const first = evaluateRetentionCanonicalNarrationAcceptance({
      raw: rankingCapture,
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(first.decision, "textual_repair");
    assert.equal(first.stage, "hook_body_relationship_rejection");
    const result = await replay({
      topic: RANKING_TOPIC,
      manualContext: RANKING_CONTEXT,
      scriptMode: "top_5",
      title: rankingCapture.title,
      narration: rankingCapture.narration,
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("ranking replay");
    const trace = result.approved.generationDisposition?.acceptanceTrace;
    assert.equal(trace?.finalNarrationAuthority, "model_after_rewrite");
    assert.equal(trace?.boundedRewriteType, "ranking_payoff_repair");
    assert.equal(trace?.deterministicRescueEntered, false);
    assert.ok(result.approved.narration.startsWith(rankingCapture.narration));
    assert.match(result.approved.narration, /number one|stands last|decisive name|#1/iu);
    for (const name of ["Nia Calder", "Tess Orlow", "Bo Renwick", "Imani Shore", "Pax Ellery"]) {
      assert.match(result.approved.narration, new RegExp(name.split(" ")[0]!, "u"));
    }
  });

  await check("[10A/10B] saved Balanced subject-led opening accepts with warning", async () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      scriptMode: "player_analysis",
    });
    const canonical = evaluateRetentionCanonicalNarrationAcceptance({
      raw: balancedCapture,
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(canonical.decision, "accept", canonical.stage ?? "accept");
    assert.ok(canonical.qualityWarningIds.includes("hook_subject_led"));
    const result = await replay({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      scriptMode: "player_analysis",
      title: balancedCapture.title,
      narration: balancedCapture.narration,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("balanced replay");
    const trace = result.approved.generationDisposition?.acceptanceTrace;
    assert.equal(trace?.finalNarrationAuthority, "model_direct");
    assert.equal(trace?.deterministicRescueEntered, false);
    assert.equal(result.approved.generationDisposition?.qualityBelowTarget, true);
    const notes = JSON.stringify(result.approved.generationDisposition);
    assert.match(notes, /hook_subject_led|quality_below_target/u);
  });

  await check("[10B] weak relevant Hook is accepted with a warning", () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      scriptMode: "player_analysis",
    });
    const relation = evaluateRetentionHookBodyPayoff({
      narration: SAVED.balanced,
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
    });
    assert.equal(relation.ok, true, relation.reasonIds.join(","));
    assert.ok(relation.qualityWarningIds.includes("hook_subject_led"));
  });

  await check("[10B] meaningless and unrelated Hooks are rejected", () => {
    const bundle = ready({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
    });
    const meaningless = evaluateRetentionHookBodyPayoff({
      narration:
        "?? After both clubs won continental titles, each missed the knockout rounds. Ivo Kest now leads Silvermere. The question stays open.",
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
    });
    assert.equal(meaningless.ok, false);
    assert.ok(meaningless.reasonIds.includes("opening_meaningless"));
    const unrelated = evaluateRetentionHookBodyPayoff({
      narration:
        "Why does weather matter? Both clubs carry continental titles and two missed knockout seasons. Ivo Kest now leads Silvermere. The question stays open.",
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
    });
    assert.equal(unrelated.ok, false);
    assert.ok(unrelated.reasonIds.includes("opening_unrelated"));
  });

  await check("[10C] bounded opening repair preserves body and payoff bytes", () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      scriptMode: "player_analysis",
    });
    const source =
      "Weather tonight? After a long doping ban kept Calen Voss out of every competitive fixture, the striker returned to Harbor United still serving a club monitoring plan. Harbor United finished tenth in Voss's first stretch back. New coach Mira Solan arrived midseason and asked the crowd to stay patient. Does Harbor stand with Voss or turn on him?";
    const { rest } = (() => {
      const opening = source.slice(0, source.indexOf("?") + 1);
      return { rest: source.slice(opening.length).trimStart() };
    })();
    const payoff = "Does Harbor stand with Voss or turn on him?";
    const body = rest.replace(payoff, "").trim();
    const repaired = applyRetentionBoundedOpeningRepair({
      title: "Calen Voss Harbor return",
      narration: source,
      replacementOpening: "Can Voss hold Harbor?",
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(repaired.ok, true, "opening repair should accept");
    assert.equal(repaired.rewriteType, "opening_repair");
    assert.equal(repaired.preservedBody, body);
    assert.equal(repaired.preservedPayoff, payoff);
    assert.ok(repaired.narration.endsWith(payoff));
    assert.ok(repaired.narration.includes(body));
  });

  await check("[10C] bounded opening repair rejects invented facts", () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      scriptMode: "player_analysis",
    });
    const repaired = applyRetentionBoundedOpeningRepair({
      title: "Calen Voss Harbor return",
      narration: SAVED.balanced,
      replacementOpening: "Did Voss already score 14 goals?",
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(repaired.ok, false);
    assert.equal(repaired.inventionRejected, true);
    assert.equal(repaired.narration, SAVED.balanced);
  });

  await check("[10D] ranking closing repair preserves prior order", () => {
    const bundle = ready({
      topic: RANKING_TOPIC,
      manualContext: RANKING_CONTEXT,
      scriptMode: "top_5",
    });
    const closer = buildDeterministicRankingNumberOneCloser({
      brief: bundle.request.compositionBrief,
      narration: SAVED.ranking,
    });
    assert.ok(closer);
    const repaired = applyRetentionBoundedRankingPayoffRepair({
      title: "Five Harbor Attackers to Watch",
      narration: SAVED.ranking,
      replacementClosing: closer!,
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(repaired.ok, true, "ranking closer should accept");
    assert.equal(repaired.rewriteType, "ranking_payoff_repair");
    assert.ok(repaired.narration.startsWith(SAVED.ranking));
    const order = ["Nia", "Tess", "Bo", "Imani", "Pax"].map((name) =>
      repaired.narration.indexOf(name),
    );
    for (let i = 1; i < order.length; i += 1) {
      assert.ok(order[i]! > order[i - 1]!);
    }
    assert.match(repaired.narration, /Nia Calder stands last as the number-one name/u);
  });

  await check("[10D] ranking closing repair rejects invented reasons", () => {
    const bundle = ready({
      topic: RANKING_TOPIC,
      manualContext: RANKING_CONTEXT,
      scriptMode: "top_5",
    });
    const repaired = applyRetentionBoundedRankingPayoffRepair({
      title: "Five Harbor Attackers to Watch",
      narration: SAVED.ranking,
      replacementClosing:
        "Nia Calder stands last as the number-one name because she scored 14 goals in May.",
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(repaired.ok, false);
    assert.equal(repaired.inventionRejected, true);
  });

  await check("[10D] deterministic ranking rescue remains the honest fallback", async () => {
    const result = await runRetentionProductionNarration({
      topic: RANKING_TOPIC,
      manualContext: RANKING_CONTEXT,
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      scriptMode: "top_5",
      planner: null,
      composer: () => {
        throw new Error("force rescue");
      },
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("rescue");
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace?.finalNarrationAuthority,
      "deterministic_rescue",
    );
    assert.match(result.approved.narration, /number one|stands last|decisive name|#1/iu);
  });

  await check("[10E] compound facts, punctuation, titles, and conservative paraphrases pass", () => {
    const bundle = ready({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
    });
    const grounding = evaluateRetentionSpokenClaimGrounding({
      narration:
        "Rookfall versus Silvermere continental preview sets the stage. Both clubs have tasted glory in continental titles in the last decade, yet each has missed the knockout rounds for two seasons. Former Rookfall coach Ivo Kest now leads Silvermere. Can Kest achieve redemption by beating the club that discarded him?",
      contentContract: bundle.contentContract,
      eligibleClaimIds: bundle.eligibleClaimIds,
    });
    assert.equal(grounding.ok, true, grounding.sentenceProvenance.join(","));
  });

  await check("[10E] support-versus-pressure question restatement stays supported", () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      scriptMode: "player_analysis",
    });
    const grounding = evaluateRetentionSpokenClaimGrounding({
      narration:
        "Can Calen Voss regain trust? After a long doping ban kept him out of every competitive fixture, Voss returned to Harbor United still under a club monitoring plan. Harbor United finished tenth in his first stretch back. New coach Mira Solan arrived midseason and asked the crowd to stay patient. Now the question remains whether Harbor will stand with Voss or turn on him.",
      contentContract: bundle.contentContract,
      eligibleClaimIds: bundle.eligibleClaimIds,
    });
    assert.equal(grounding.ok, true, grounding.sentenceProvenance.join(","));
  });

  await check("[10D] ranking that names the wrong number one is not a closer-only miss", () => {
    const bundle = ready({
      topic: RANKING_TOPIC,
      manualContext: RANKING_CONTEXT,
      scriptMode: "top_5",
    });
    const relation = evaluateRetentionHookBodyPayoff({
      narration:
        "Five Harbor attackers to watch start with Nia Calder, who creates the first shot in almost every Harbor attack. Tess Orlow follows, controlling tempo through the middle third. Bo Renwick stands out for recovery sprints that rescue broken presses. Imani Shore delivers set-piece balls from both flanks. Finally, Pax Ellery makes late-box arrivals after the second ball, securing his place as number one.",
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
    });
    assert.equal(relation.ok, false);
    assert.ok(relation.reasonIds.includes("payoff_does_not_resolve_hook"));
  });

  await check("[10E] connective topic-echo and coach-side move stay supported", () => {
    const bundle = ready({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
    });
    const grounding = evaluateRetentionSpokenClaimGrounding({
      narration: SAVED.preview,
      contentContract: bundle.contentContract,
      eligibleClaimIds: bundle.eligibleClaimIds,
    });
    assert.equal(grounding.ok, true, grounding.sentenceProvenance.join(","));
  });

  await check("[10E] unsupported causal escalation, invented stats, and stronger certainty fail", () => {
    const bundle = ready({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
    });
    const causal = evaluateRetentionSpokenClaimGrounding({
      narration:
        "Rookfall versus Silvermere continental preview sets the stage. Both clubs won continental titles in the last decade, which led to a collapse. Ivo Kest now leads Silvermere. The question stays open.",
      contentContract: bundle.contentContract,
      eligibleClaimIds: bundle.eligibleClaimIds,
    });
    assert.equal(causal.ok, false);
    const stats = evaluateRetentionSpokenClaimGrounding({
      narration:
        "Rookfall versus Silvermere continental preview sets the stage. Both clubs won continental titles in the last decade. Ivo Kest now leads Silvermere with 14 goals. The question stays open.",
      contentContract: bundle.contentContract,
      eligibleClaimIds: bundle.eligibleClaimIds,
    });
    assert.equal(stats.ok, false);
    const certainty = evaluateRetentionSpokenClaimGrounding({
      narration:
        "Rookfall versus Silvermere continental preview sets the stage. Both clubs won continental titles in the last decade. Ivo Kest now leads Silvermere. Kest will definitely beat the club that discarded him.",
      contentContract: bundle.contentContract,
      eligibleClaimIds: bundle.eligibleClaimIds,
    });
    assert.equal(certainty.ok, false);
  });

  await check("[10F] soft quality warning does not change authority", async () => {
    const result = await replay({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      scriptMode: "player_analysis",
      title: balancedCapture.title,
      narration: balancedCapture.narration,
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("authority");
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace?.finalNarrationAuthority,
      "model_direct",
    );
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace?.rewriteAccepted,
      false,
    );
  });

  await check("[10F] JSON/NDJSON preserve one frozen accepted result", () => {
    const frozen = serializeRetentionCanonicalGenerationResult({
      success: true,
      data: { title: "Public", narration: playerCapture.narration },
      generationContext: RETENTION_PUBLIC_GENERATION_CONTEXT_SUPPLIED,
      generationDisposition: {
        disposition: "acceptable",
        qualityBelowTarget: true,
        acceptanceTrace: {
          version: 1,
          events: [],
          earliestDecisiveRejection: null,
          finalNarrationAuthority: "model_direct",
          deterministicRescueEntered: false,
          deterministicRescueAccepted: false,
          modelNarrationAccepted: true,
          rewriteAccepted: false,
        },
      },
    });
    assert.equal(
      JSON.parse(frozen.ndjson.match(/"narration":("[^"]+")/)?.[1] ?? "null"),
      playerCapture.narration,
    );
    assert.equal(
      (frozen.json as { data?: { narration?: string } }).data?.narration,
      playerCapture.narration,
    );
    assert.equal(
      buildRetentionPublicGenerationContextPresence(PLAYER_CONTEXT),
      RETENTION_PUBLIC_GENERATION_CONTEXT_SUPPLIED,
    );
  });

  await check("[source] no topic-specific production names in Prompt 10 repair", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "src/features/retention-story/composition/apply-retention-bounded-region-repair.ts",
      ),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /\b(?:Manchester United|Chelsea|Real Madrid|Spain|France|Harbor United|Rookfall)\b/u,
    );
  });

  console.log("retention-surgical-narration-repair: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
