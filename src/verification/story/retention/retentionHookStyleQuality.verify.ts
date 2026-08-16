/**
 * Explicit Hook style quality — provider-free, fictional, topic-independent.
 */

import assert from "node:assert/strict";

import {
  buildRetentionComposerRequest,
  buildRetentionCreatorContentContract,
  evaluateRetentionHookBodyPayoff,
  evaluateRetentionSpokenClaimGrounding,
  runRetentionProductionNarration,
} from "@/features/retention-story";
import { createRetentionModelCallLedger } from "@/features/retention-story/budget/create-retention-model-call-ledger";
import { normalizeStoryContract } from "@/features/retention-story/domain/normalize-story-contract";
import { buildReliabilityDeterministicRetentionPlan } from "@/features/retention-story/planning/build-reliability-deterministic-retention-plan";
import { buildProductionStoryContractInput } from "@/features/retention-story/production/build-production-story-contract-input";
import type { HookStyleSelection } from "@/features/hook-engine/presentation/hook-style-selection";
import type { ScriptMode } from "@/types/footiebitz";

import { passRetentionHookRunner } from "./retentionStoryQaDoubles";

const TOPIC = "Can Harbor United win consecutive league titles?";
const CONTEXT = [
  "Harbor United won the league last season.",
  "The club retained its title-winning summer signings.",
  "Harbor United signed midfielder Ivo Calder.",
  "The squad is now stronger, more experienced, and better trained.",
  "The central question is whether Harbor United can win two league titles in a row.",
].join(" ");

function buildFixture(
  hookStyle: HookStyleSelection,
  overrides?: {
    readonly topic: string;
    readonly context: string;
    readonly scriptMode: ScriptMode;
  },
) {
  const topic = overrides?.topic ?? TOPIC;
  const context = overrides?.context ?? CONTEXT;
  const scriptMode = overrides?.scriptMode ?? "opinion_debate";
  const input = buildProductionStoryContractInput({
    topic,
    manualContext: context,
    durationSec: 30,
    generationPath: "script_only",
    qualityMode: "cheap",
    scriptMode,
    factHandlingMode: "verified_facts_only",
    tone: "dramatic",
    hookStyle,
  });
  const contract = normalizeStoryContract(input);
  const grounding = input.grounding!;
  const ledger = createRetentionModelCallLedger(contract.qualityMode);
  const planResult = buildReliabilityDeterministicRetentionPlan({
    contract,
    grounding,
    manualContext: context,
    planner: null,
    ledger,
  });
  assert.equal(planResult.status, "ready");
  if (planResult.status !== "ready") throw new Error("fixture plan not ready");
  const contentContract = buildRetentionCreatorContentContract({
    contract,
    grounding,
    manualContext: context,
    hookStyle,
  });
  const request = buildRetentionComposerRequest({
    contract,
    plan: planResult.plan,
    strategySeed: planResult.strategySeed,
    grounding,
    manualContext: context,
    contentContract,
    hookDirectiveBlock: "",
    modelCallKind: "initial",
  });
  return { contentContract, grounding, request };
}

function styleEvaluation(
  hookStyle: HookStyleSelection,
  narration: string,
) {
  const fixture = buildFixture(hookStyle);
  return evaluateRetentionHookBodyPayoff({
    narration,
    contentContract: fixture.contentContract,
    brief: fixture.request.compositionBrief,
  });
}

async function main(): Promise<void> {
  console.log("retention-hook-style-quality");

  const topicQuestion = [
    "Can Harbor United win consecutive league titles?",
    "Harbor United retained the summer signings from its title-winning season.",
    "The club also added midfielder Ivo Calder.",
    "Those moves leave Harbor stronger, more experienced, and better trained as the new campaign begins.",
    "Now the advantage has to become a second league title.",
  ].join(" ");
  assert.ok(
    styleEvaluation("provocative_question", topicQuestion).qualityWarningIds.includes(
      "hook_below_style_target",
    ),
  );
  assert.ok(
    styleEvaluation("contrarian_claim", topicQuestion).qualityWarningIds.includes(
      "hook_below_style_target",
    ),
  );
  assert.ok(
    styleEvaluation("myth_challenge", topicQuestion).qualityWarningIds.includes(
      "hook_below_style_target",
    ),
  );

  const provocative = topicQuestion.replace(
    "Can Harbor United win consecutive league titles?",
    "Can anyone stop Harbor now?",
  );
  assert.ok(
    !styleEvaluation("provocative_question", provocative).qualityWarningIds.includes(
      "hook_below_style_target",
    ),
  );

  const contrarian = topicQuestion.replace(
    "Can Harbor United win consecutive league titles?",
    "Harbor is even stronger now.",
  );
  assert.ok(
    !styleEvaluation("contrarian_claim", contrarian).qualityWarningIds.includes(
      "hook_below_style_target",
    ),
  );
  const comparativeContrarian = topicQuestion.replace(
    "Can Harbor United win consecutive league titles?",
    "Harbor United is better off without last season's captain.",
  );
  const comparativeEvaluation = styleEvaluation(
    "contrarian_claim",
    comparativeContrarian,
  );
  assert.ok(!comparativeEvaluation.qualityWarningIds.includes("hook_low_tension"));
  assert.ok(
    !comparativeEvaluation.qualityWarningIds.includes("hook_below_style_target"),
  );

  const myth = topicQuestion.replace(
    "Can Harbor United win consecutive league titles?",
    "Last season was not Harbor's ceiling.",
  );
  assert.ok(
    !styleEvaluation("myth_challenge", myth).qualityWarningIds.includes(
      "hook_below_style_target",
    ),
  );

  const rankingContext = [
    "1. Nia Calder — she returned after injury.",
    "2. Pax Rowan — he renewed his contract.",
    "3. Ivo Mere — he received the captain's armband.",
    "Preserve this order and make Nia Calder the explicit number-one payoff.",
  ].join(" ");
  const rankingFixture = buildFixture("countdown_tease", {
    topic: "Top players to watch next season",
    context: rankingContext,
    scriptMode: "top_5",
  });
  const spoiledCountdown = evaluateRetentionHookBodyPayoff({
    narration:
      "Top players start with Nia Calder. Pax Rowan renewed his contract. Ivo Mere received the captain's armband. Nia Calder is number one.",
    contentContract: rankingFixture.contentContract,
    brief: rankingFixture.request.compositionBrief,
  });
  assert.ok(
    spoiledCountdown.qualityWarningIds.includes("hook_below_style_target"),
  );
  const teasedCountdown = evaluateRetentionHookBodyPayoff({
    narration:
      "Who takes number one? Pax Rowan renewed his contract. Ivo Mere received the captain's armband. Nia Calder returned after injury. Nia Calder is number one.",
    contentContract: rankingFixture.contentContract,
    brief: rankingFixture.request.compositionBrief,
  });
  assert.ok(
    !teasedCountdown.qualityWarningIds.includes("hook_below_style_target"),
  );

  const fixture = buildFixture("myth_challenge");
  const inventedBelief = evaluateRetentionSpokenClaimGrounding({
    narration:
      "Many doubt Harbor can win again. Harbor United retained its title-winning signings.",
    contentContract: fixture.contentContract,
    eligibleClaimIds: new Set(
      fixture.request.eligibleClaims.map((claim) => claim.claimId),
    ),
    grounding: fixture.grounding,
  });
  assert.equal(inventedBelief.ok, false);
  assert.equal(inventedBelief.unsupportedSpokenClaim, true);
  const inventedCommonDoubt = evaluateRetentionSpokenClaimGrounding({
    narration:
      "Despite common doubts, Harbor is positioned as the favorite. Harbor United retained its title-winning signings.",
    contentContract: fixture.contentContract,
    eligibleClaimIds: new Set(
      fixture.request.eligibleClaims.map((claim) => claim.claimId),
    ),
    grounding: fixture.grounding,
  });
  assert.equal(inventedCommonDoubt.ok, false);

  const mudrykContext =
    "Mykhailo Mudryk returns to Chelsea after a two-year football ban caused by doping charges. His first performance back was bad: he struggled to touch or pass the ball properly. He returns under Joapi Alonso in a Chelsea side that is also struggling. He may struggle for pace. The central question is whether he receives the support and patience needed to recover.";
  const mudrykFixture = buildFixture("curiosity_gap", {
    topic: "Mykhailo Mudryk returns to Chelsea",
    context: mudrykContext,
    scriptMode: "player_analysis",
  });
  const mudrykParaphrase = evaluateRetentionSpokenClaimGrounding({
    narration:
      "His performance was poor, struggling to control or pass the ball effectively.",
    contentContract: mudrykFixture.contentContract,
    eligibleClaimIds: new Set(
      mudrykFixture.request.eligibleClaims.map((claim) => claim.claimId),
    ),
    grounding: mudrykFixture.grounding,
  });
  assert.equal(mudrykParaphrase.ok, true);

  const previewContext =
    "Rookfall and Silvermere meet in preseason. Both clubs have declined. Ivo Kest now coaches Rookfall after previously coaching Silvermere. This gives Kest a chance for redemption against his former club. The central question is whether he can produce a result against Silvermere.";
  const previewFixture = buildFixture("stakes_first", {
    topic: "Rookfall versus Silvermere preseason match",
    context: previewContext,
    scriptMode: "match_preview",
  });
  const centralQuestionParaphrase = evaluateRetentionSpokenClaimGrounding({
    narration:
      "The central question remains whether he can produce a result against Silvermere in this preseason encounter.",
    contentContract: previewFixture.contentContract,
    eligibleClaimIds: new Set(
      previewFixture.request.eligibleClaims.map((claim) => claim.claimId),
    ),
    grounding: previewFixture.grounding,
  });
  assert.equal(centralQuestionParaphrase.ok, true);
  assert.equal(centralQuestionParaphrase.ambiguousSpokenClaim, false);

  const initial = topicQuestion;
  const repairedOpening = "Harbor's squad isn't just stronger but better trained.";
  let initialCalls = 0;
  let repairCalls = 0;
  const result = await runRetentionProductionNarration({
    topic: TOPIC,
    manualContext: CONTEXT,
    durationSec: 30,
    generationPath: "script_only",
    qualityMode: "cheap",
    scriptMode: "opinion_debate",
    factHandlingMode: "verified_facts_only",
    tone: "dramatic",
    hookStyle: "contrarian_claim",
    planner: null,
    hookRunner: passRetentionHookRunner,
    composer: async (request) => {
      if (request.modelCallKind === "repair") {
        repairCalls += 1;
        return { title: "Harbor's title defense", narration: repairedOpening };
      }
      initialCalls += 1;
      return { title: "Harbor's title defense", narration: initial };
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.error);
  assert.equal(initialCalls, 1);
  assert.equal(
    repairCalls,
    1,
    JSON.stringify({
      narration: result.approved.narration,
      diagnostics: result.approved.safeDiagnostics,
      disposition: result.approved.generationDisposition,
    }),
  );
  assert.ok(result.approved.narration.startsWith(repairedOpening));
  assert.ok(
    result.approved.narration.endsWith(
      "Now the advantage has to become a second league title.",
    ),
  );
  assert.equal(
    result.approved.generationDisposition?.acceptanceTrace
      ?.finalNarrationAuthority,
    "model_after_rewrite",
  );
  assert.equal(
    result.approved.generationDisposition?.acceptanceTrace?.boundedRewriteType,
    "opening_repair",
  );
  assert.equal(
    result.approved.generationDisposition?.qualityBelowTarget,
    false,
  );

  const failedPolish = await runRetentionProductionNarration({
    topic: TOPIC,
    manualContext: CONTEXT,
    durationSec: 30,
    generationPath: "script_only",
    qualityMode: "cheap",
    scriptMode: "opinion_debate",
    factHandlingMode: "verified_facts_only",
    tone: "dramatic",
    hookStyle: "contrarian_claim",
    planner: null,
    hookRunner: passRetentionHookRunner,
    composer: async () => ({
      title: "Harbor's title defense",
      narration: initial,
    }),
  });
  assert.equal(failedPolish.ok, true);
  if (!failedPolish.ok) throw new Error(failedPolish.error);
  assert.equal(failedPolish.approved.narration, initial);
  assert.equal(
    failedPolish.approved.generationDisposition?.acceptanceTrace
      ?.finalNarrationAuthority,
    "model_direct",
  );
  assert.equal(
    failedPolish.approved.generationDisposition?.qualityBelowTarget,
    true,
  );

  const previewNarration = [
    "Rookfall and Silvermere have declined.",
    "Rookfall and Silvermere meet in preseason after both clubs declined.",
    "Ivo Kest now coaches Rookfall after previously coaching Silvermere.",
    "That history gives Kest a redemption opportunity against his former club.",
    "Can he produce a result against Silvermere?",
  ].join(" ");
  const previewResult = await runRetentionProductionNarration({
    topic: "Rookfall versus Silvermere preseason match",
    manualContext: previewContext,
    durationSec: 30,
    generationPath: "script_only",
    qualityMode: "cheap",
    scriptMode: "match_preview",
    factHandlingMode: "verified_facts_only",
    tone: "dramatic",
    hookStyle: "stakes_first",
    planner: null,
    hookRunner: passRetentionHookRunner,
    composer: async () => ({
      title: "Rookfall versus Silvermere",
      narration: previewNarration,
    }),
  });
  assert.equal(previewResult.ok, true);
  if (!previewResult.ok) throw new Error(previewResult.error);
  assert.equal(previewResult.approved.narration, previewNarration);
  assert.equal(
    previewResult.approved.generationDisposition?.qualityBelowTarget,
    false,
  );
  assert.notEqual(
    previewResult.approved.generationDisposition?.acceptanceTrace
      ?.finalNarrationAuthority,
    "deterministic_rescue",
  );

  const incompatibleFlexible = await runRetentionProductionNarration({
    topic: TOPIC,
    manualContext: CONTEXT,
    durationSec: 30,
    generationPath: "script_only",
    qualityMode: "cheap",
    scriptMode: "opinion_debate",
    factHandlingMode: "verified_facts_only",
    tone: "dramatic",
    // Headline First is not offered for Opinion / Debate. A stale client or
    // changed mode must visibly reconcile instead of turning a valid brief
    // into success:false.
    hookStyle: "headline_first",
    planner: null,
    hookRunner: passRetentionHookRunner,
    composer: async () => ({
      title: "Harbor's title defense",
      narration: [
        "Harbor United enters stronger than its title-winning team.",
        "The club retained its summer signings and added midfielder Ivo Calder.",
        "That leaves a more experienced and better-trained squad.",
        "Now the advantage has to become a second league title.",
      ].join(" "),
    }),
  });
  assert.equal(incompatibleFlexible.ok, true);
  if (!incompatibleFlexible.ok) throw new Error(incompatibleFlexible.error);
  assert.ok(
    incompatibleFlexible.approved.generationDisposition?.adaptations.includes(
      "hook_style_reconciled",
    ),
  );

  console.log("  ✓ explicit style shapes are distinct");
  console.log("  ✓ invented audience belief is unsupported");
  console.log("  ✓ style-only repair preserves the accepted body and payoff");
  console.log("  ✓ failed style polish returns the coherent original with a warning");
  console.log("  ✓ declarative Stakes Hook plus final question scores as one payoff arc");
  console.log("  ✓ incompatible Flexible style visibly reconciles without failing creation");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
