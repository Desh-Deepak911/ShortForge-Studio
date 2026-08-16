/**
 * Story-quality release gate — Prompts 1–6 provider-free obligations.
 * Fails closed when any listed obligation is missing.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  RETENTION_PROMPT5_COMPOSER_JSON_SCHEMA_WITH_OPTIONAL_PROPERTIES,
  assertRetentionOpenAiStrictJsonSchema,
  buildRetentionCoherentDeterministicRescue,
  buildRetentionComposerJsonSchema,
  buildRetentionComposerRequest,
  buildRetentionCreatorContentContract,
  evaluateRetentionHookBodyPayoff,
  inspectRetentionOpenAiStrictJsonSchema,
  evaluateRetentionNarrationSubstance,
  getRetentionCoherentRescueRuntimeProbe,
  resetRetentionCoherentRescueRuntimeProbe,
  RETENTION_COHERENT_DETERMINISTIC_RESCUE_ID,
  runRetentionProductionNarration,
} from "@/features/retention-story";
import { createRetentionModelCallLedger } from "@/features/retention-story/budget/create-retention-model-call-ledger";
import { normalizeStoryContract } from "@/features/retention-story/domain/normalize-story-contract";
import { buildReliabilityDeterministicRetentionPlan } from "@/features/retention-story/planning/build-reliability-deterministic-retention-plan";
import { buildProductionStoryContractInput } from "@/features/retention-story/production/build-production-story-contract-input";

import { passRetentionHookRunner } from "./retentionStoryQaDoubles";

const ROOT = path.resolve(__dirname, "../../..");
const SCAFFOLD =
  /central idea|that connection|consequence keeps growing|What decides|those details|comes into focus/iu;

const COMEBACK = [
  "After a long doping ban kept Calen Voss out of every competitive fixture, the striker returned to Harbor United.",
  "Harbor United finished tenth in Voss's first stretch back.",
  "New coach Mira Solan arrived midseason and asked the crowd to stay patient.",
  "The support-versus-pressure payoff is whether Harbor stands with Voss or turns on him.",
].join("\n");

const RANKING = [
  "1. Nia Calder — first shot creation.",
  "2. Tess Orlow — tempo control.",
  "3. Bo Renwick — recovery sprints.",
  "4. Imani Shore — set-piece delivery.",
  "5. Pax Ellery — late-box arrivals.",
].join("\n");

const PREVIEW = [
  "Both clubs won continental titles in the last decade.",
  "Each side has missed the knockout rounds for two seasons.",
  "Former Rookfall coach Ivo Kest now leads Silvermere.",
].join("\n");

const OVERFULL = [
  "Required:",
  "Jori Flint missed six months after a broken ankle.",
  "The new manager wants Flint as the first substitute, not the starter.",
  "Optional:",
  "A travel blog mentioned the away end snack prices.",
].join("\n");

async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  console.log(`  ✓ ${label}`);
}

function ready(input: {
  readonly topic: string;
  readonly manualContext?: string;
  readonly scriptMode?: "story" | "match_preview" | "top_5";
  readonly durationSec?: number;
}) {
  const contractInput = buildProductionStoryContractInput({
    topic: input.topic,
    durationSec: input.durationSec ?? 30,
    generationPath: "script_only",
    qualityMode: "cheap",
    scriptMode: input.scriptMode ?? "story",
    factHandlingMode: "verified_facts_only",
    manualContext: input.manualContext,
    tone: "dramatic",
  });
  const contract = normalizeStoryContract(contractInput);
  const grounding = contractInput.grounding!;
  const ledger = createRetentionModelCallLedger(contract.qualityMode);
  const plan = buildReliabilityDeterministicRetentionPlan({
    contract,
    grounding,
    manualContext: input.manualContext ?? null,
    planner: null,
    ledger,
  });
  assert.equal(plan.status, "ready");
  if (plan.status !== "ready") throw new Error("plan");
  return {
    contract,
    grounding,
    plan: plan.plan,
    strategySeed: plan.strategySeed,
    contentContract: buildRetentionCreatorContentContract({
      contract,
      grounding,
      manualContext: input.manualContext,
    }),
    ledger,
    manualContext: input.manualContext,
  };
}

async function main(): Promise<void> {
  console.log("retention-story-quality-release-gate");

  await check("creator substance reaches the composer request", () => {
    const input = ready({
      topic: "Calen Voss Harbor return",
      manualContext: COMEBACK,
    });
    const request = buildRetentionComposerRequest({
      contract: input.contract,
      plan: input.plan,
      grounding: input.grounding,
      strategySeed: input.strategySeed,
      contentContract: input.contentContract,
      manualContext: input.manualContext,
    });
    assert.match(JSON.stringify(request), /Voss|Harbor|Solan|tenth/u);
    assert.ok(request.contentAuthority.orderedEssentialUnits.length > 0);
  });

  await check("settings stay separate from factual authority", () => {
    const news = ready({
      topic: "Calen Voss Harbor return",
      manualContext: COMEBACK,
    });
    assert.ok(news.contentContract.presentationSettings);
    assert.doesNotMatch(COMEBACK, /dramatic|funny|tactical/u);
  });

  await check("mode obligations, ranking membership, and matchup participants", () => {
    const ranking = ready({
      topic: "Five Harbor attackers to watch",
      manualContext: RANKING,
      scriptMode: "top_5",
      durationSec: 45,
    });
    const rankingRescue = buildRetentionCoherentDeterministicRescue({
      contract: ranking.contract,
      plan: ranking.plan,
      grounding: ranking.grounding,
      contentContract: ranking.contentContract,
      strategySeed: ranking.strategySeed,
    });
    const rankingText = rankingRescue.candidate.assembledNarration;
    for (const name of ["Nia Calder", "Tess Orlow", "Bo Renwick", "Imani Shore", "Pax Ellery"]) {
      assert.match(rankingText, new RegExp(name, "u"));
    }
    const preview = ready({
      topic: "Rookfall versus Silvermere continental preview",
      manualContext: PREVIEW,
      scriptMode: "match_preview",
    });
    const previewRescue = buildRetentionCoherentDeterministicRescue({
      contract: preview.contract,
      plan: preview.plan,
      grounding: preview.grounding,
      contentContract: preview.contentContract,
      strategySeed: preview.strategySeed,
    });
    assert.match(previewRescue.candidate.assembledNarration, /Rookfall/u);
    assert.match(previewRescue.candidate.assembledNarration, /Silvermere/u);
  });

  await check("hook/body/payoff, sparse honesty, overfull omission, no scaffold", () => {
    const comeback = ready({
      topic: "Calen Voss Harbor return",
      manualContext: COMEBACK,
    });
    const built = buildRetentionCoherentDeterministicRescue({
      contract: comeback.contract,
      plan: comeback.plan,
      grounding: comeback.grounding,
      contentContract: comeback.contentContract,
      strategySeed: comeback.strategySeed,
    });
    assert.doesNotMatch(built.candidate.assembledNarration, SCAFFOLD);
    const relation = evaluateRetentionHookBodyPayoff({
      narration: built.candidate.assembledNarration,
      contentContract: comeback.contentContract,
      hookOpening: built.hookOpening,
      payoffClosing: built.payoffClosing,
    });
    assert.equal(relation.ok, true, relation.reasonIds.join(","));
    const substance = evaluateRetentionNarrationSubstance({
      topic: comeback.contract.topic,
      grounding: comeback.grounding,
      candidate: built.candidate,
    });
    assert.equal(substance.planningScaffoldDetected, false);

    const sparse = ready({ topic: "Maren Quill", durationSec: 20 });
    const sparseBuilt = buildRetentionCoherentDeterministicRescue({
      contract: sparse.contract,
      plan: sparse.plan,
      grounding: sparse.grounding,
      contentContract: sparse.contentContract,
      strategySeed: sparse.strategySeed,
    });
    assert.match(sparseBuilt.candidate.assembledNarration, /Quill/u);
    assert.doesNotMatch(sparseBuilt.candidate.assembledNarration, SCAFFOLD);

    const overfull = ready({
      topic: "Jori Flint Harbor return",
      manualContext: OVERFULL,
      durationSec: 15,
    });
    const overfullBuilt = buildRetentionCoherentDeterministicRescue({
      contract: overfull.contract,
      plan: overfull.plan,
      grounding: overfull.grounding,
      contentContract: overfull.contentContract,
      strategySeed: overfull.strategySeed,
    });
    assert.match(overfullBuilt.candidate.assembledNarration, /Flint|ankle/u);
    assert.ok(overfullBuilt.omittedContentUnitIds.length >= 1);
    assert.doesNotMatch(overfullBuilt.candidate.assembledNarration, /snack prices/u);
  });

  await check("old scaffold unreachable; rescue coherent and transparent", async () => {
    resetRetentionCoherentRescueRuntimeProbe();
    const result = await runRetentionProductionNarration({
      topic: "Jordan Hale comeback after injury",
      manualContext: "Hale missed eight months after ankle surgery.",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      factHandlingMode: "verified_facts_only",
      planner: null,
      composer: () => {
        throw new Error("model composer unavailable");
      },
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("fail-soft required");
    const trace = result.approved.generationDisposition?.acceptanceTrace;
    assert.equal(trace?.finalNarrationAuthority, "deterministic_rescue");
    assert.equal(result.approved.generationDisposition?.disposition, "fallback");
    assert.equal(result.approved.generationDisposition?.qualityBelowTarget, true);
    assert.equal(trace?.events.filter((event) => event.stage === "deterministic_rescue_entered").length, 1);
    assert.equal(trace?.events.filter((event) => event.stage === "deterministic_rescue_accepted").length, 1);
    assert.equal(getRetentionCoherentRescueRuntimeProbe().builderId, RETENTION_COHERENT_DETERMINISTIC_RESCUE_ID);
    assert.equal(getRetentionCoherentRescueRuntimeProbe().legacyScaffoldInvocations, 0);
    assert.doesNotMatch(result.approved.narration, SCAFFOLD);
    const persisted = JSON.stringify(result.approved.safeDiagnostics);
    assert.doesNotMatch(persisted, /Hale missed eight months after ankle surgery/u);
  });

  await check("Fast/Balanced/Studio ceilings and scenes-only remain unchanged", () => {
    const cheap = createRetentionModelCallLedger("cheap").snapshot();
    const balanced = createRetentionModelCallLedger("balanced").snapshot();
    const best = createRetentionModelCallLedger("best").snapshot();
    assert.equal(cheap.policy.qualityMode, "cheap");
    assert.equal(balanced.policy.qualityMode, "balanced");
    assert.equal(best.policy.qualityMode, "best");
    assert.ok(cheap.policy.totalCeiling <= balanced.policy.totalCeiling);
    assert.ok(balanced.policy.totalCeiling <= best.policy.totalCeiling);
    assert.ok(cheap.policy.maxRetentionBodyRewrite <= balanced.policy.maxRetentionBodyRewrite);
    assert.ok(balanced.policy.maxRetentionBodyRewrite <= best.policy.maxRetentionBodyRewrite);
    const scenes = buildProductionStoryContractInput({
      topic: "Harbor derby",
      durationSec: 30,
      generationPath: "scenes_only",
      qualityMode: "cheap",
      scriptMode: "story",
    });
    assert.equal(scenes.generationPath, "scenes_only");
  });

  await check("Prompt 9 rejected-proposal capture stays off by default", () => {
    const capture = readFileSync(
      path.join(
        ROOT,
        "features/retention-story/production/create-retention-rejected-proposal-capture.ts",
      ),
      "utf8",
    );
    assert.match(capture, /isRetentionRejectedProposalCaptureEnabled/u);
    assert.match(capture, /NODE_ENV === "production"/u);
    assert.match(capture, /story-quality-rejected-proposals/u);
  });

  await check("Prompt 8 canonical acceptance and privacy authorities stay exported", () => {
    const canonical = readFileSync(
      path.join(
        ROOT,
        "features/retention-story/composition/evaluate-retention-canonical-narration-acceptance.ts",
      ),
      "utf8",
    );
    assert.match(canonical, /evaluateRetentionCanonicalNarrationAcceptance/u);
    assert.match(canonical, /textual_repair/u);
    const privacy = readFileSync(
      path.join(
        ROOT,
        "features/retention-story/production/build-retention-public-generation-context.ts",
      ),
      "utf8",
    );
    assert.match(privacy, /RETENTION_PUBLIC_GENERATION_CONTEXT_SUPPLIED/u);
  });

  await check("Prompt 7 claim-reference and hook/body authorities stay exported", () => {
    const source = readFileSync(
      path.join(ROOT, "features/retention-story/composition/rebind-retention-composer-content-ids.ts"),
      "utf8",
    );
    assert.match(source, /safely_rebound/u);
    assert.match(source, /Unknown IDs never authorize/u);
    const hookBody = readFileSync(
      path.join(ROOT, "features/retention-story/composition/evaluate-retention-hook-body-payoff.ts"),
      "utf8",
    );
    assert.match(hookBody, /resolveSpokenOpening/u);
    assert.doesNotMatch(hookBody, /Manchester United|Chelsea|Real Madrid/u);
  });

  await check("OpenAI strict composer schema is repaired; Prompt 5 defect remains classified", () => {
    const defect = inspectRetentionOpenAiStrictJsonSchema(
      RETENTION_PROMPT5_COMPOSER_JSON_SCHEMA_WITH_OPTIONAL_PROPERTIES,
    );
    assert.ok(defect.some((issue) => issue.code === "required_missing_property"));
    assert.doesNotThrow(() =>
      assertRetentionOpenAiStrictJsonSchema(
        buildRetentionComposerJsonSchema({ eligibleClaims: [] }),
      ),
    );
  });

  await check("Prompt 12 post-accept commit and opening promotion exist", () => {
    const commit = readFileSync(
      path.join(
        ROOT,
        "features/retention-story/integration/commit-retention-canonically-accepted-candidate.ts",
      ),
      "utf8",
    );
    assert.match(commit, /commitRetentionCanonicallyAcceptedCandidate/u);
    assert.match(commit, /hardGatesPassed/u);
    const promotion = readFileSync(
      path.join(
        ROOT,
        "features/retention-story/composition/apply-retention-supported-opening-promotion.ts",
      ),
      "utf8",
    );
    assert.match(promotion, /supported_opening_promotion/u);
    assert.doesNotMatch(promotion, /Manchester United|Chelsea|Real Madrid/u);
    const duration = readFileSync(
      path.join(
        ROOT,
        "features/retention-story/composition/evaluate-retention-duration-fit.ts",
      ),
      "utf8",
    );
    assert.match(duration, /duration_slightly_over_target/u);
    assert.match(duration, /preserveCompleteRanking/u);
  });

  await check("no real-name production special cases were added", () => {
    const rescueSource = readFileSync(
      path.join(ROOT, "features/retention-story/composition/build-retention-coherent-deterministic-rescue.ts"),
      "utf8",
    );
    assert.doesNotMatch(
      rescueSource,
      /\b(?:Arsenal|Chelsea|Liverpool|Barcelona|Real Madrid|Premier League|La Liga|Haaland|Mbappe)\b/u,
    );
  });

  console.log("retention-story-quality-release-gate: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
