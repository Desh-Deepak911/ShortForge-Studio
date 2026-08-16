/**
 * Story-quality Prompt 8 — canonical narration acceptance, transport parity,
 * spoken grounding, and certification budget. Provider-free.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  assertRetentionPublicPayloadPrivacy,
  buildRetentionComposerRequest,
  buildRetentionCreatorContentContract,
  buildRetentionPublicGenerationContextPresence,
  createRetentionCertificationCallBudget,
  createRetentionFrozenProductionComposer,
  evaluateRetentionCanonicalNarrationAcceptance,
  evaluateRetentionHookBodyPayoff,
  mapRetentionNarrationToBeats,
  parseRetentionNdjsonComplete,
  RETENTION_EXPECTED_PROVIDER_CALLS,
  RETENTION_PUBLIC_GENERATION_CONTEXT_SUPPLIED,
  runRetentionProductionNarration,
  serializeRetentionCanonicalGenerationResult,
  validateRetentionNarrationFirstProposal,
} from "@/features/retention-story";
import { createRetentionModelCallLedger } from "@/features/retention-story/budget/create-retention-model-call-ledger";
import { normalizeStoryContract } from "@/features/retention-story/domain/normalize-story-contract";
import { buildReliabilityDeterministicRetentionPlan } from "@/features/retention-story/planning/build-reliability-deterministic-retention-plan";
import { buildProductionStoryContractInput } from "@/features/retention-story/production/build-production-story-contract-input";
import type { RetentionComposerCallback } from "@/features/retention-story";
import type { RetentionHookRunner } from "@/features/retention-story";
import type { ScriptMode } from "@/types/footiebitz";

import { passRetentionHookRunner } from "./retentionStoryQaDoubles";

const ROOT = path.resolve(__dirname, "../../..");
const PROMPT7_SUMMARY = path.join(
  ROOT,
  "../.tmp/story-quality-real-cert/prompt7/model-cert-summary.json",
);

const PLAYER_TOPIC = "Soren Vale Driftmere return";
const PLAYER_CONTEXT = [
  "After a long suspension kept Soren Vale out of every competitive fixture, the midfielder returned to Driftmere still serving a club monitoring plan.",
  "Driftmere finished twelfth in Vale's first stretch back.",
  "New coach Petra Quill asked the crowd to stay patient.",
  "The support-versus-pressure payoff is whether Driftmere stands with Vale.",
  "Do not claim Vale failed a new test.",
].join("\n");

const PREVIEW_TOPIC = "Ashwick versus Thornwell continental preview";
const PREVIEW_CONTEXT = [
  "Both clubs won continental titles in the last decade.",
  "Each side has missed the knockout rounds for two seasons.",
  "Former Ashwick coach Bram Ives now leads Thornwell.",
  "The redemption angle is whether Ives can answer the club that discarded him.",
].join("\n");

const RANKING_TOPIC = "Five Driftmere midfielders to watch";
const RANKING_CONTEXT = [
  "1. Lina Crowe — she creates the first shot in almost every Driftmere attack.",
  "2. Oren Pike — tempo control through the middle third.",
  "3. Sable Quin — recovery sprints that rescue broken presses.",
  "4. Theo Marrow — set-piece delivery from both flanks.",
  "5. Vesper Holt — late-box arrivals after the second ball.",
].join("\n");

const SENTINEL = "FBZ_SECRET_NOTE_9f3a2c_DO_NOT_LEAK";

async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  console.log(`  ✓ ${label}`);
}

function ready(input: {
  readonly topic: string;
  readonly manualContext?: string;
  readonly scriptMode?: ScriptMode;
  readonly durationSec?: number;
  readonly hookStyle?: "auto" | "provocative_question" | "stakes_first";
}) {
  const contractInput = buildProductionStoryContractInput({
    topic: input.topic,
    durationSec: input.durationSec ?? 45,
    generationPath: "script_only",
    qualityMode: "cheap",
    scriptMode: input.scriptMode ?? "story",
    tone: "dramatic",
    factHandlingMode: "verified_facts_only",
    manualContext: input.manualContext,
    hookStyle: input.hookStyle,
  });
  const contract = normalizeStoryContract(contractInput);
  const grounding = contractInput.grounding!;
  const ledger = createRetentionModelCallLedger(contract.qualityMode);
  const planResult = buildReliabilityDeterministicRetentionPlan({
    contract,
    grounding,
    manualContext: input.manualContext ?? null,
    planner: null,
    ledger,
  });
  if (planResult.status !== "ready") {
    throw new Error("plan");
  }
  const contentContract = buildRetentionCreatorContentContract({
    contract,
    grounding,
    manualContext: input.manualContext,
    hookStyle: input.hookStyle,
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
    contract,
    grounding,
    plan: planResult.plan,
    strategySeed: planResult.strategySeed,
    contentContract,
    request,
    eligibleClaimIds: new Set(request.eligibleClaims.map((claim) => claim.claimId)),
  };
}

function productionProposal(input: {
  readonly title: string;
  readonly narration: string;
  readonly usedContentIds?: readonly string[];
  readonly hookOpening?: string;
  readonly payoffClosing?: string;
  readonly hookClaimRefs?: readonly string[];
}) {
  const sentences = input.narration.split(/(?<=[.!?…])\s+/u).filter(Boolean);
  return {
    title: input.title,
    narration: input.narration,
    usedContentIds: [...(input.usedContentIds ?? [])],
    omittedContentIds: [],
    hookClaimRefs: [...(input.hookClaimRefs ?? [])],
    hookOpening: input.hookOpening ?? sentences[0] ?? "",
    payoffClosing: input.payoffClosing ?? sentences.at(-1) ?? "",
    requiredUncertaintyMarkersUsed: [],
    factualSupport: [],
  };
}

const rejectAfterComposeHookRunner: RetentionHookRunner = async (input) => {
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
    error: "hook engine quality-only reject",
    diagnostics: {
      contractVersion: input.hookContext.request.contractVersion,
      strategyId: input.hookContext.plan.strategyId,
      strategyVersion: input.hookContext.plan.strategyVersion,
      strategySource: input.hookContext.plan.strategySource,
      generationPath: input.hookContext.generationPath,
      requestFingerprint: input.hookContext.request.requestFingerprint,
      planFingerprint: input.hookContext.plan.planFingerprint,
      groundingStatus: "user_context_only",
      validationOutcome: "fail",
      repairAttempts: 0,
      templateInfluenced: false,
      promptIntelligenceInfluenced: false,
      adapterRan: true,
    },
    snapshot: input.hookContext.snapshot,
  };
};

async function main(): Promise<void> {
  console.log("retention-canonical-narration-acceptance (Prompt 8)");

  await check("[8A] Prompt 7 live artifacts record the split-authority stages", () => {
    if (!existsSync(PROMPT7_SUMMARY)) {
      console.log("    (Prompt 7 summary absent; shape fixtures still run)");
      return;
    }
    const summary = JSON.parse(readFileSync(PROMPT7_SUMMARY, "utf8")) as {
      results?: readonly {
        id?: string;
        rejectionOrRepairStage?: string | null;
        safeAcceptanceTrace?: { earliestDecisiveRejection?: string | null };
      }[];
    };
    const serialized = JSON.stringify(summary);
    assert.doesNotMatch(serialized, /After a long doping ban/u);
    const stageOf = (id: string) => {
      const row = (summary.results ?? []).find((item) => item.id === id);
      return (
        row?.rejectionOrRepairStage ??
        row?.safeAcceptanceTrace?.earliestDecisiveRejection ??
        null
      );
    };
    assert.equal(stageOf("player-comeback-fast"), null);
    assert.equal(stageOf("match-preview-fast"), "hook_validation_rejection");
    assert.equal(stageOf("top-five-fast"), "hook_body_relationship_rejection");
    assert.equal(
      stageOf("player-comeback-balanced"),
      "unsupported_claim_or_claim_reference_rejection",
    );
    assert.equal(
      stageOf("preview-hook-bold"),
      "unsupported_claim_or_claim_reference_rejection",
    );
  });

  await check("[8B] stale Hook metadata cannot reject coherent spoken narration", () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
    });
    const narration =
      "Can Vale hold Driftmere? Vale returned after the long suspension while still serving the monitoring plan. Driftmere finished twelfth in that first stretch back. Petra Quill asked the crowd to stay patient. Support and pressure now decide whether Driftmere stands with Vale.";
    const accepted = evaluateRetentionCanonicalNarrationAcceptance({
      raw: productionProposal({
        title: "Soren Vale Driftmere return",
        narration,
        hookOpening: "What decides the outcome?",
        payoffClosing: "A leftover plan label.",
      }),
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(accepted.decision, "accept");
    assert.equal(accepted.metadataNormalized, true);
    assert.equal(accepted.spokenOpening, "Can Vale hold Driftmere?");
    assert.doesNotMatch(accepted.spokenOpening, /What decides/u);
    const validated = validateRetentionNarrationFirstProposal({
      raw: productionProposal({
        title: "Soren Vale Driftmere return",
        narration,
        hookOpening: "What decides the outcome?",
      }),
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(validated.hookOpening, "Can Vale hold Driftmere?");
  });

  await check("[8B] stale payoff metadata is derived again from speech", () => {
    const bundle = ready({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
    });
    const narration =
      "Can Ives answer Ashwick? Both clubs carry continental titles and two missed knockout seasons. Thornwell now follows the discarded coach into that same meeting. The question stays open when the sides meet.";
    const accepted = evaluateRetentionCanonicalNarrationAcceptance({
      raw: productionProposal({
        title: "Ashwick Thornwell preview",
        narration,
        payoffClosing: "Plan payoff label unused.",
      }),
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(accepted.decision, "accept", accepted.stage ?? "accept");
    assert.equal(accepted.spokenPayoff.endsWith("meet."), true);
  });

  await check("[8C] supported speech with unknown claim IDs is normalized", () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
    });
    const narration =
      "Can Vale hold Driftmere? Vale returned to Driftmere still serving a monitoring plan. Driftmere finished twelfth in Vale's first stretch back. Petra Quill asked the crowd to stay patient. The payoff is whether Driftmere stands with Vale.";
    const accepted = evaluateRetentionCanonicalNarrationAcceptance({
      raw: productionProposal({
        title: "Soren Vale Driftmere return",
        narration,
        usedContentIds: ["claim_invented_xyz"],
        hookClaimRefs: ["claim_invented_xyz"],
      }),
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(accepted.decision, "accept");
    assert.ok(!accepted.usedContentIds.includes("claim_invented_xyz"));
    assert.ok(!accepted.hookClaimRefs.includes("claim_invented_xyz"));
  });

  await check("[8C] unsupported speech with a plausible ID is rejected", () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
    });
    const plausible = [...bundle.eligibleClaimIds][0] ?? "missing";
    const accepted = evaluateRetentionCanonicalNarrationAcceptance({
      raw: productionProposal({
        title: "Soren Vale Driftmere return",
        narration:
          "Can Vale hold Driftmere? Vale scored 19 goals after the ban and sealed a victory over Thornwell.",
        usedContentIds: [plausible],
        hookClaimRefs: [plausible],
      }),
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(accepted.decision, "textual_repair");
    assert.equal(accepted.stage, "unsupported_claim_or_claim_reference_rejection");
  });

  await check("[8C] Hook claim references use the same grounding authority", () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
    });
    const accepted = evaluateRetentionCanonicalNarrationAcceptance({
      raw: productionProposal({
        title: "Soren Vale Driftmere return",
        narration:
          "Can Vale hold Driftmere? Vale returned still serving a monitoring plan. The payoff is whether Driftmere stands with Vale.",
        hookClaimRefs: ["hook_invented_id"],
      }),
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(accepted.decision, "accept");
    assert.ok(!accepted.hookClaimRefs.includes("hook_invented_id"));
  });

  await check("[8B] accepted narration cannot be reversed by a later Hook-engine gate", async () => {
    const proposal = productionProposal({
      title: "Soren Vale Driftmere return",
      narration:
        "Can Vale hold Driftmere? Vale returned after the long suspension while still serving the monitoring plan. Driftmere finished twelfth in that first stretch back. Petra Quill asked the crowd to stay patient. Support and pressure now decide whether Driftmere stands with Vale.",
    });
    const result = await runRetentionProductionNarration({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      durationSec: 40,
      generationPath: "script_only",
      qualityMode: "cheap",
      factHandlingMode: "verified_facts_only",
      planner: null,
      composer: createRetentionFrozenProductionComposer(proposal),
      hookRunner: rejectAfterComposeHookRunner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("canonical pass must survive Hook-engine reject");
    const authority =
      result.approved.generationDisposition?.acceptanceTrace?.finalNarrationAuthority;
    assert.ok(authority === "model_direct" || authority === "model_after_rewrite");
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace?.deterministicRescueEntered,
      false,
    );
  });

  await check("[8E] preview semantic relationship with low token overlap", () => {
    const bundle = ready({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
    });
    const relation = evaluateRetentionHookBodyPayoff({
      narration:
        "Can Ives answer Ashwick? Both clubs carry continental titles and two missed knockout seasons. Thornwell now follows the discarded coach into that same meeting. The question stays open when the sides meet.",
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
    });
    assert.equal(relation.ok, true, relation.reasonIds.join(","));
  });

  await check("[8E] genuinely unrelated preview Hook is rejected", () => {
    const bundle = ready({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
    });
    const relation = evaluateRetentionHookBodyPayoff({
      narration:
        "Why does weather matter? Both clubs carry continental titles and two missed knockout seasons. The question stays open when the sides meet.",
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
    });
    assert.equal(relation.ok, false);
  });

  await check("[8E] complete ordered ranking with number-one payoff in the last member sentence", () => {
    const bundle = ready({
      topic: RANKING_TOPIC,
      manualContext: RANKING_CONTEXT,
      scriptMode: "top_5",
    });
    const narration =
      "Who stands last tonight? Oren Pike controls tempo through the middle. Sable Quin rescues broken presses. Theo Marrow delivers set pieces. Vesper Holt arrives late. Lina Crowe creates the first shot and stands last as the number one.";
    const accepted = evaluateRetentionCanonicalNarrationAcceptance({
      raw: productionProposal({
        title: "Five Driftmere midfielders",
        narration,
      }),
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(accepted.decision, "accept", accepted.stage ?? "accept");
  });

  await check("[8E] ranking missing its number-one payoff is repairable", () => {
    const bundle = ready({
      topic: RANKING_TOPIC,
      manualContext: RANKING_CONTEXT,
      scriptMode: "top_5",
    });
    const accepted = evaluateRetentionCanonicalNarrationAcceptance({
      raw: productionProposal({
        title: "Five Driftmere midfielders",
        narration:
          "Who stands last tonight? Lina Crowe creates the first shot. Oren Pike controls tempo. Sable Quin rescues broken presses. Theo Marrow delivers set pieces. Vesper Holt arrives late.",
      }),
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(accepted.decision, "textual_repair");
    assert.equal(accepted.stage, "hook_body_relationship_rejection");
  });

  await check("[8D] metadata repair uses zero provider calls", async () => {
    const proposal = productionProposal({
      title: "Soren Vale Driftmere return",
      narration:
        "Can Vale hold Driftmere? Vale returned after the long suspension while still serving the monitoring plan. Driftmere finished twelfth in that first stretch back. Petra Quill asked the crowd to stay patient. Support and pressure now decide whether Driftmere stands with Vale.",
      usedContentIds: ["unknown_model_id"],
      hookOpening: "What decides the outcome?",
    });
    const result = await runRetentionProductionNarration({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      durationSec: 40,
      generationPath: "script_only",
      qualityMode: "cheap",
      factHandlingMode: "verified_facts_only",
      planner: null,
      composer: createRetentionFrozenProductionComposer(proposal),
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("metadata normalize must accept");
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace?.finalNarrationAuthority,
      "model_direct",
    );
    const budget = result.approved.safeDiagnostics.budget;
    assert.equal(budget?.hookRepair ?? 0, 0);
    assert.equal(budget?.retentionBodyRewrite ?? 0, 0);
  });

  await check("[8D] textual repair becomes model_after_rewrite", async () => {
    let calls = 0;
    const composer: RetentionComposerCallback = (request) => {
      calls += 1;
      const body =
        "Vale returned after the long suspension while still serving the monitoring plan. Driftmere finished twelfth in that first stretch back. Petra Quill asked the crowd to stay patient. Support and pressure now decide whether Driftmere stands with Vale.";
      if (request.modelCallKind === "repair") {
        return productionProposal({
          title: "Soren Vale Driftmere return",
          narration: `Can Vale still stand? ${body}`,
        });
      }
        return productionProposal({
          title: "Soren Vale Driftmere return",
          narration: `Weather tonight? ${body}`,
        });
    };
    const result = await runRetentionProductionNarration({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      durationSec: 40,
      generationPath: "script_only",
      qualityMode: "cheap",
      factHandlingMode: "verified_facts_only",
      planner: null,
      composer,
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected rewrite accept");
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace?.finalNarrationAuthority,
      "model_after_rewrite",
    );
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace?.boundedRewriteType,
      "supported_opening_promotion",
    );
    assert.equal(result.approved.generationDisposition?.acceptanceTrace?.rewriteAccepted, true);
    assert.equal(calls, 1);
  });

  await check("[8D] failed textual repair enters coherent rescue", async () => {
    const composer: RetentionComposerCallback = (request) => {
      const body =
        "Vale returned after the long suspension while still serving the monitoring plan. Driftmere finished twelfth in that first stretch back. Vale already scored 19 goals yesterday.";
      if (request.modelCallKind === "repair") {
        return productionProposal({
          title: "Soren Vale Driftmere return",
          narration: `Did Vale already score 19 goals? ${body} The payoff is whether Driftmere stands with Vale.`,
        });
      }
      return productionProposal({
        title: "Soren Vale Driftmere return",
        narration: `Weather tonight? ${body} The payoff is whether Driftmere stands with Vale.`,
      });
    };
    const result = await runRetentionProductionNarration({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      durationSec: 40,
      generationPath: "script_only",
      qualityMode: "cheap",
      factHandlingMode: "verified_facts_only",
      planner: null,
      composer,
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected rescue");
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace?.finalNarrationAuthority,
      "deterministic_rescue",
    );
  });

  await check("[8] mapping preserves accepted narration", () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
    });
    const narration =
      "Can Vale hold Driftmere? Vale returned after the long suspension while still serving the monitoring plan. Driftmere finished twelfth in that first stretch back. Petra Quill asked the crowd to stay patient. Support and pressure now decide whether Driftmere stands with Vale.";
    const accepted = validateRetentionNarrationFirstProposal({
      raw: productionProposal({
        title: "Soren Vale Driftmere return",
        narration,
      }),
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    const mapped = mapRetentionNarrationToBeats({
      narration: accepted.narration,
      plan: bundle.plan,
      grounding: bundle.grounding,
      strategySeed: bundle.strategySeed,
      usedClaimIds: accepted.usedContentIds,
      hookOpening: accepted.hookOpening,
      payoffClosing: accepted.payoffClosing,
      allowEmptyInternalBeats: true,
    });
    const rebuilt = mapped.segments.map((segment) => segment.text).join(" ").replace(/\s+/g, " ").trim();
    assert.equal(rebuilt, narration);
  });

  await check("[8F] frozen JSON/NDJSON parity shares one internal result", () => {
    const frozen = {
      success: true,
      data: { title: "Soren Vale Driftmere return", narration: "Can Vale hold Driftmere?" },
      generationContext: RETENTION_PUBLIC_GENERATION_CONTEXT_SUPPLIED,
      generationDisposition: {
        disposition: "acceptable",
        qualityBelowTarget: false,
        acceptanceTrace: { finalNarrationAuthority: "model_direct" },
      },
    };
    const encoded = serializeRetentionCanonicalGenerationResult(frozen);
    const parsed = parseRetentionNdjsonComplete(encoded.ndjson);
    assert.equal(encoded.json.success, parsed.success);
    assert.deepEqual(encoded.json.data, parsed.data);
    assert.deepEqual(
      encoded.json.generationDisposition,
      parsed.generationDisposition,
    );
    assert.equal(encoded.json.generationContext, parsed.generationContext);
  });

  await check("[8G] certification budget counts hidden rewrite and planner calls", () => {
    const budget = createRetentionCertificationCallBudget(10);
    budget.beforeInvoke("planner");
    budget.beforeInvoke("composer");
    budget.beforeInvoke("rewrite");
    assert.equal(budget.snapshot().used, 3);
    assert.equal(budget.canStartOptionalCase(RETENTION_EXPECTED_PROVIDER_CALLS.cheapInitial), true);
    assert.equal(budget.canStartOptionalCase(8), false);
    assert.throws(() => {
      for (let i = 0; i < 8; i += 1) budget.beforeInvoke("retry");
    }, /certification_provider_budget_exhausted/);
  });

  await check("[8H] public diagnostics do not leak creator input", async () => {
    assert.equal(
      buildRetentionPublicGenerationContextPresence(`${SENTINEL} notes`),
      RETENTION_PUBLIC_GENERATION_CONTEXT_SUPPLIED,
    );
    const result = await runRetentionProductionNarration({
      topic: PLAYER_TOPIC,
      manualContext: `${PLAYER_CONTEXT}\n${SENTINEL}`,
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
    if (!result.ok) throw new Error("rescue required");
    const publicPayload = {
      generationContext: buildRetentionPublicGenerationContextPresence(`${SENTINEL} notes`),
      retentionDiagnostics: result.approved.safeDiagnostics,
      generationDisposition: result.approved.generationDisposition,
      validationSummary: result.approved.validationSummary,
    };
    assertRetentionPublicPayloadPrivacy(publicPayload, [SENTINEL]);
    assert.doesNotMatch(JSON.stringify(publicPayload), new RegExp(SENTINEL, "u"));
  });

  await check("[source] no production club special-casing in Prompt 8 authorities", () => {
    const files = [
      "features/retention-story/composition/evaluate-retention-canonical-narration-acceptance.ts",
      "features/retention-story/composition/evaluate-retention-spoken-claim-grounding.ts",
      "features/retention-story/production/build-retention-public-generation-context.ts",
    ];
    for (const rel of files) {
      const source = readFileSync(path.join(ROOT, rel), "utf8");
      assert.doesNotMatch(
        source,
        /\b(?:Manchester United|Chelsea|Real Madrid|Spain|France|Arsenal|Liverpool)\b/u,
      );
    }
  });

  console.log("retention-canonical-narration-acceptance: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
