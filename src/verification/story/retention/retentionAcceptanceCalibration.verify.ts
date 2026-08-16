/**
 * Story-quality Prompt 7 — acceptance calibration matrix.
 * Provider-free. Varied fictional subjects. No production special-casing.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  buildRetentionComposerRequest,
  buildRetentionCreatorContentContract,
  buildRetentionInternalRejectionRecord,
  buildRetentionNarrationCandidateFromProposal,
  classifyRetentionHookMetadataMismatch,
  evaluateRetentionHookBodyPayoff,
  evaluateRetentionNarrationSubstance,
  mapRetentionNarrationToBeats,
  rebindRetentionComposerContentIds,
  runRetentionProductionNarration,
  validateRetentionNarrationFirstProposal,
} from "@/features/retention-story";
import { isRetentionStoryError } from "@/features/retention-story/domain/retention-story-errors";
import { createRetentionModelCallLedger } from "@/features/retention-story/budget/create-retention-model-call-ledger";
import { normalizeStoryContract } from "@/features/retention-story/domain/normalize-story-contract";
import { buildReliabilityDeterministicRetentionPlan } from "@/features/retention-story/planning/build-reliability-deterministic-retention-plan";
import { buildProductionStoryContractInput } from "@/features/retention-story/production/build-production-story-contract-input";
import type { RetentionComposerCallback } from "@/features/retention-story";
import type { ScriptMode } from "@/types/footiebitz";

import { passRetentionHookRunner } from "./retentionStoryQaDoubles";

const ROOT = path.resolve(__dirname, "../../..");
const PROMPT6_SUMMARY = path.join(
  ROOT,
  "../.tmp/story-quality-real-cert/prompt6/model-cert-slice-summary.json",
);
const PROMPT6_BASE = path.join(
  ROOT,
  "../.tmp/story-quality-real-cert/prompt6/model-cert-summary.json",
);

const PLAYER_TOPIC = "Soren Vale Driftmere return";
const PLAYER_CONTEXT = [
  "After a long suspension kept Soren Vale out of every competitive fixture, the midfielder returned to Driftmere still serving a club monitoring plan.",
  "Driftmere finished twelfth in Vale's first stretch back.",
  "New coach Petra Quill arrived midseason and asked the crowd to stay patient.",
  "The support-versus-pressure payoff is whether Driftmere stands with Vale or turns on him.",
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

const AMBIGUOUS_TOPIC = "Driftmere midfield absences";
const AMBIGUOUS_CONTEXT = [
  "Lina Crowe missed six weeks after a knee issue.",
  "Oren Pike missed six weeks after a knee issue.",
].join("\n");

async function check(
  label: string,
  fn: () => void | Promise<void>,
): Promise<void> {
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
  assert.equal(planResult.status, "ready");
  if (planResult.status !== "ready") throw new Error("plan");
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
    eligibleClaimIds: new Set(
      request.eligibleClaims.map((claim) => claim.claimId),
    ),
  };
}

function knownIds(bundle: ReturnType<typeof ready>): string[] {
  return [
    ...bundle.contentContract.orderedUnits.map((unit) => unit.contentUnitId),
    ...bundle.contentContract.orderedUnits
      .map((unit) => unit.claimId)
      .filter((id): id is string => id != null),
    ...bundle.eligibleClaimIds,
  ];
}

function validate(bundle: ReturnType<typeof ready>, raw: unknown) {
  return validateRetentionNarrationFirstProposal({
    raw,
    contentContract: bundle.contentContract,
    brief: bundle.request.compositionBrief,
    eligibleClaimIds: bundle.eligibleClaimIds,
    grounding: bundle.grounding,
  });
}

function rejectionStage(error: unknown): string {
  assert.equal(isRetentionStoryError(error), true);
  if (!isRetentionStoryError(error)) throw new Error("expected story error");
  return error.normalizeSeam ?? error.reason;
}

async function main(): Promise<void> {
  console.log("retention-acceptance-calibration (Prompt 7)\n");

  await check("[7A] forensic replay classifies Prompt 6 rejections without exposing text", () => {
    const slice = existsSync(PROMPT6_SUMMARY)
      ? (JSON.parse(readFileSync(PROMPT6_SUMMARY, "utf8")) as {
          readonly results?: readonly {
            readonly id: string;
            readonly earliestDecisiveRejection?: string;
            readonly finalNarrationAuthority?: string;
          }[];
        })
      : { results: [] };
    const base = existsSync(PROMPT6_BASE)
      ? (JSON.parse(readFileSync(PROMPT6_BASE, "utf8")) as {
          readonly results?: readonly {
            readonly id: string;
            readonly safeAcceptanceTrace?: {
              readonly earliestDecisiveRejection?: string;
            };
          }[];
        })
      : { results: [] };
    const records = [
      buildRetentionInternalRejectionRecord({
        rejectionStage: "hook_body_relationship_rejection",
        reasonCode: "opening_subject_only",
        spokenClaimIndependentlySupported: true,
        hookPromiseRepresentation: "metadata_only",
        bodyPayoffEvidenceRepresentation: "semantic",
        rewriteOutcome: "unavailable",
        rewriteUnavailableReason: "cheap_targeted_body_rewrite_disabled",
        contentIdProvenance: "model_supplied",
        classification: classifyRetentionHookMetadataMismatch({
          hookOpeningInNarration: false,
          spokenOpeningPaysOff: true,
        }),
      }),
      buildRetentionInternalRejectionRecord({
        rejectionStage: "unsupported_claim_or_claim_reference_rejection",
        reasonCode: "unknown_claim_id",
        unknownIds: ["unknown_model_id"],
        spokenClaimIndependentlySupported: true,
        hookPromiseRepresentation: "spoken_opening",
        bodyPayoffEvidenceRepresentation: "semantic",
        rewriteOutcome: "not_attempted",
        contentIdProvenance: "safely_rebound",
        classification: "valid_narration_with_invalid_metadata",
      }),
    ];
    assert.equal(records[0]?.classification, "valid_narration_with_invalid_metadata");
    assert.equal(records[1]?.classification, "valid_narration_with_invalid_metadata");
    const serialized = JSON.stringify({ records, slice, base });
    assert.doesNotMatch(serialized, /After a long doping ban/u);
    assert.doesNotMatch(serialized, /sk-|Bearer |promptBlock/u);
    for (const result of [...(slice.results ?? []), ...(base.results ?? [])]) {
      if (result.id.includes("preview") || result.id.includes("top-five")) {
        assert.equal(
          "earliestDecisiveRejection" in result
            ? (result as { earliestDecisiveRejection?: string })
                .earliestDecisiveRejection
            : result.safeAcceptanceTrace?.earliestDecisiveRejection,
          "hook_body_relationship_rejection",
        );
      }
    }
  });

  await check("[7B] supported narration with an unknown model-supplied claim ID", () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
    });
    const known = knownIds(bundle);
    const rebound = rebindRetentionComposerContentIds({
      usedContentIds: ["claim_invented_xyz"],
      omittedContentIds: [],
      hookClaimRefs: ["claim_invented_xyz"],
      factualSupport: [{ claimId: "claim_invented_xyz" }],
      narration:
        "Can Vale hold Driftmere? After a long suspension Vale returned still serving a monitoring plan. Driftmere finished twelfth in that first stretch. Petra Quill asked the crowd to stay patient. The payoff is whether Driftmere stands with Vale.",
      contentContract: bundle.contentContract,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.ok(!rebound.usedContentIds.includes("claim_invented_xyz"));
    assert.ok(rebound.droppedUnknownIds.includes("claim_invented_xyz"));
    assert.ok(rebound.usedContentIds.every((id) => known.includes(id)));
    assert.ok(rebound.usedContentIds.length >= 1);
    assert.equal(rebound.provenance, "safely_rebound");
    const accepted = validate(bundle, {
      title: "Soren Vale Driftmere return",
      narration:
        "Can Vale hold Driftmere? After a long suspension Vale returned still serving a monitoring plan. Driftmere finished twelfth in that first stretch. Petra Quill asked the crowd to stay patient. The payoff is whether Driftmere stands with Vale.",
      usedContentIds: ["claim_invented_xyz"],
      omittedContentIds: [],
      hookClaimRefs: ["claim_invented_xyz"],
      hookOpening: "Can Vale hold Driftmere?",
      payoffClosing: "The payoff is whether Driftmere stands with Vale.",
      factualSupport: [{ claimId: "claim_invented_xyz" }],
    });
    assert.ok(accepted.usedContentIds.every((id) => known.includes(id)));
  });

  await check("[7B] unsupported narration with a plausible-looking claim ID", () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
    });
    const plausible = [...bundle.eligibleClaimIds][0] ?? "missing";
    assert.notEqual(plausible, "missing");
    try {
      validate(bundle, {
        title: "Soren Vale Driftmere return",
        narration:
          "Can Vale hold Driftmere? Vale scored 19 goals after the ban and sealed a victory over Thornwell. The crowd then turned away.",
        usedContentIds: [plausible],
        omittedContentIds: [],
        hookClaimRefs: [plausible],
        hookOpening: "Can Vale hold Driftmere?",
        payoffClosing: "The crowd then turned away.",
        factualSupport: [{ claimId: plausible }],
      });
      assert.fail("expected unsupported rejection");
    } catch (error) {
      assert.equal(
        rejectionStage(error),
        "unsupported_claim_or_claim_reference_rejection",
      );
    }
  });

  await check("[7B] supported paraphrase safely rebound to a known unit", () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
    });
    const narration =
      "Can Vale hold Driftmere? Vale returned to Driftmere still serving a monitoring plan. Driftmere finished twelfth in Vale's first stretch back. Petra Quill asked the crowd to stay patient. The payoff is whether Driftmere stands with Vale.";
    const rebound = rebindRetentionComposerContentIds({
      usedContentIds: ["unknown_paraphrase_id"],
      omittedContentIds: [],
      hookClaimRefs: [],
      factualSupport: [],
      narration,
      contentContract: bundle.contentContract,
      eligibleClaimIds: bundle.eligibleClaimIds,
      grounding: bundle.grounding,
    });
    assert.equal(rebound.provenance, "safely_rebound");
    assert.ok(
      rebound.reboundIds.length >= 1 || rebound.usedContentIds.length >= 1,
    );
    assert.ok(
      rebound.usedContentIds.every((id) => knownIds(bundle).includes(id)),
    );
    const accepted = validate(bundle, {
      title: "Soren Vale Driftmere return",
      narration,
      usedContentIds: ["unknown_paraphrase_id"],
      omittedContentIds: [],
      hookClaimRefs: [],
      hookOpening: "Can Vale hold Driftmere?",
      payoffClosing: "The payoff is whether Driftmere stands with Vale.",
    });
    assert.ok(accepted.usedContentIds.every((id) => knownIds(bundle).includes(id)));
  });

  await check("[7B] ambiguous paraphrase rejected", () => {
    const bundle = ready({
      topic: AMBIGUOUS_TOPIC,
      manualContext: AMBIGUOUS_CONTEXT,
    });
    try {
      validate(bundle, {
        title: "Driftmere midfield absences",
        narration:
          "Can Driftmere hold the middle? The midfielder missed six weeks after a knee issue. That absence still shapes the next selection.",
        usedContentIds: [],
        omittedContentIds: [],
        hookClaimRefs: [],
        hookOpening: "Can Driftmere hold the middle?",
        payoffClosing: "That absence still shapes the next selection.",
      });
      assert.fail("expected ambiguous rejection");
    } catch (error) {
      assert.equal(
        rejectionStage(error),
        "unsupported_claim_or_claim_reference_rejection",
      );
    }
  });

  await check("[7C] preview Hook with semantic payoff but low token overlap", () => {
    const bundle = ready({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
    });
    const narration =
      "Can Ashwick answer Thornwell? Both sides carry recent continental titles and two seasons outside the knockouts. Bram Ives now leads the visitors after being discarded. The meeting still leaves that contest open.";
    const relation = evaluateRetentionHookBodyPayoff({
      narration,
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      hookOpening: "Ashwick preview",
    });
    assert.equal(relation.ok, true, relation.reasonIds.join(","));
    assert.notEqual(relation.opening, "Ashwick preview");
    const accepted = validate(bundle, {
      title: "Ashwick Thornwell preview",
      narration,
      usedContentIds: [],
      omittedContentIds: [],
      hookClaimRefs: [],
      hookOpening: "Ashwick preview",
      payoffClosing: "The meeting still leaves that contest open.",
    });
    assert.match(accepted.hookOpening, /Ashwick|Thornwell/u);
  });

  await check("[7C] preview Hook genuinely unrelated to the body", () => {
    const bundle = ready({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "match_preview",
    });
    const relation = evaluateRetentionHookBodyPayoff({
      narration:
        "Will the river freeze tonight? Both sides carry recent continental titles and two seasons outside the knockouts. Bram Ives now leads Thornwell after being discarded. The meeting still leaves that contest open.",
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
    });
    assert.equal(relation.ok, false);
    assert.ok(relation.reasonIds.length >= 1);
  });

  await check("[7C] ordered ranking with explicit number-one payoff", () => {
    const bundle = ready({
      topic: RANKING_TOPIC,
      manualContext: RANKING_CONTEXT,
      scriptMode: "top_5",
    });
    const narration =
      "Who defines Driftmere? Lina Crowe creates the first shot with a dummy and cutback. Oren Pike controls tempo through the middle. Sable Quin rescues broken presses. Theo Marrow delivers set pieces. Vesper Holt arrives late, and Lina Crowe stands last as the decisive name.";
    const accepted = validate(bundle, {
      title: "Five Driftmere midfielders",
      narration,
      usedContentIds: [],
      omittedContentIds: [],
      hookClaimRefs: [],
      hookOpening: "Who defines Driftmere?",
      payoffClosing: "Lina Crowe stands last as the decisive name.",
    });
    assert.match(accepted.payoffClosing, /Lina|decisive|number one/u);
  });

  await check("[7C] disconnected ranking checklist rejected", () => {
    const bundle = ready({
      topic: RANKING_TOPIC,
      manualContext: RANKING_CONTEXT,
      scriptMode: "top_5",
    });
    try {
      validate(bundle, {
        title: "Five Driftmere midfielders",
        narration:
          "Who defines Driftmere? Lina Crowe. Oren Pike. Sable Quin. Theo Marrow. Vesper Holt.",
        usedContentIds: [],
        omittedContentIds: [],
        hookClaimRefs: [],
        hookOpening: "Who defines Driftmere?",
        payoffClosing: "Vesper Holt.",
      });
      assert.fail("expected disconnected ranking rejection");
    } catch (error) {
      assert.equal(rejectionStage(error), "hook_body_relationship_rejection");
    }
  });

  await check("[7C] player comeback Hook paid off by support and fit", () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
    });
    const accepted = validate(bundle, {
      title: "Soren Vale Driftmere return",
      narration:
        "Can Vale hold Driftmere? The return after suspension still meets a twelfth-place stretch and a new coach asking for patience. Support and pressure now decide whether Driftmere stands with Vale.",
      usedContentIds: [],
      omittedContentIds: [],
      hookClaimRefs: [],
      hookOpening: "Can Vale hold Driftmere?",
      payoffClosing:
        "Support and pressure now decide whether Driftmere stands with Vale.",
    });
    assert.match(accepted.narration, /support|pressure|stands/u);
    const substance = evaluateRetentionNarrationSubstance({
      topic: bundle.contract.topic,
      grounding: bundle.grounding,
      candidate: {
        assembledNarration: accepted.narration,
        segments: [
          {
            beatId: "b1",
            text: accepted.narration,
            startOffset: 0,
            endOffset: accepted.narration.length,
            claimRefs: accepted.usedContentIds,
            factualRisk: false,
          },
        ],
      } as never,
    });
    assert.equal(substance.diagnosticIds.includes("hook_promise_without_payoff"), false);
  });

  await check("[7F] explicit provocative Hook preserved; unsupported provocative rejected", async () => {
    const bundle = ready({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "story",
      hookStyle: "provocative_question",
    });
    const accepted = validate(bundle, {
      title: "Ashwick Thornwell preview",
      narration:
        "Can Ives answer Ashwick? Both clubs carry continental titles and two missed knockout seasons. Thornwell now follows the discarded coach into that same meeting. The question stays open when the sides meet.",
      usedContentIds: [],
      omittedContentIds: [],
      hookClaimRefs: [],
      hookOpening: "Can Ives answer Ashwick?",
      payoffClosing: "The question stays open when the sides meet.",
    });
    assert.match(accepted.hookOpening, /\?$/u);
    try {
      validate(bundle, {
        title: "Ashwick Thornwell preview",
        narration:
          "Did Ives already claim a victory over Ashwick? Both clubs carry continental titles and two missed knockout seasons. Thornwell now follows the discarded coach. The question stays open when the sides meet.",
        usedContentIds: [],
        omittedContentIds: [],
        hookClaimRefs: [],
        hookOpening: "Did Ives already claim a victory over Ashwick?",
        payoffClosing: "The question stays open when the sides meet.",
      });
      assert.fail("expected unsupported provocative rejection");
    } catch (error) {
      assert.ok(
        rejectionStage(error) === "unsupported_claim_or_claim_reference_rejection" ||
          rejectionStage(error) === "hook_body_relationship_rejection",
      );
    }

    const autoBundle = ready({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      scriptMode: "story",
      durationSec: 40,
    });
    const autoNarration =
      "Can Ashwick still stand? Both clubs carry continental titles and two missed knockout seasons. Bram Ives now leads the visitors after being discarded. The meeting still leaves that contest open.";
    const autoRelation = evaluateRetentionHookBodyPayoff({
      narration: autoNarration,
      contentContract: autoBundle.contentContract,
      brief: autoBundle.request.compositionBrief,
      hookOpening: "Can Ashwick still stand?",
    });
    assert.equal(autoRelation.ok, true, autoRelation.reasonIds.join(","));

    const auto = await runRetentionProductionNarration({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      durationSec: 40,
      generationPath: "script_only",
      qualityMode: "cheap",
      scriptMode: "story",
      factHandlingMode: "verified_facts_only",
      hookStyle: "auto",
      creationReliabilityMode: "flexible",
      planner: null,
      composer: () => ({
        title: "Ashwick Thornwell preview",
        narration: autoNarration,
        usedContentIds: [],
        omittedContentIds: [],
        hookClaimRefs: [],
        hookOpening: "Can Ashwick still stand?",
        payoffClosing: "The meeting still leaves that contest open.",
      }),
      hookRunner: passRetentionHookRunner,
    });
    const provocative = await runRetentionProductionNarration({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      durationSec: 40,
      generationPath: "script_only",
      qualityMode: "cheap",
      scriptMode: "story",
      factHandlingMode: "verified_facts_only",
      hookStyle: "provocative_question",
      creationReliabilityMode: "flexible",
      planner: null,
      composer: () => ({
        title: "Ashwick Thornwell preview",
        narration:
          "Can Ives answer Ashwick? Both clubs carry continental titles and two missed knockout seasons. Thornwell now follows the discarded coach into that same meeting. The question stays open when the sides meet.",
        usedContentIds: [],
        omittedContentIds: [],
        hookClaimRefs: [],
        hookOpening: "Can Ives answer Ashwick?",
        payoffClosing: "The question stays open when the sides meet.",
      }),
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(
      auto.ok,
      true,
      auto.ok
        ? ""
        : `${auto.failureCategory}:${auto.retentionDiagnostics.safeReasonIds.join(",")}:${auto.retentionDiagnostics.terminalState}:${auto.error}`,
    );
    assert.equal(
      provocative.ok,
      true,
      provocative.ok
        ? ""
        : `${provocative.failureCategory}:${provocative.retentionDiagnostics.safeReasonIds.join(",")}`,
    );
    if (!auto.ok || !provocative.ok) throw new Error("expected both");
    assert.equal(
      auto.approved.generationDisposition?.acceptanceTrace?.finalNarrationAuthority,
      "model_direct",
    );
    assert.equal(
      provocative.approved.generationDisposition?.acceptanceTrace
        ?.finalNarrationAuthority,
      "model_direct",
    );
    assert.equal(
      auto.approved.generationDisposition?.acceptanceTrace
        ?.deterministicRescueEntered,
      false,
    );
    assert.match(provocative.approved.narration, /Can Ives answer Ashwick/u);
    assert.notEqual(auto.approved.narration, provocative.approved.narration);

    const bold = await runRetentionProductionNarration({
      topic: PREVIEW_TOPIC,
      manualContext: PREVIEW_CONTEXT,
      durationSec: 40,
      generationPath: "script_only",
      qualityMode: "cheap",
      scriptMode: "match_preview",
      factHandlingMode: "verified_facts_only",
      hookStyle: "stakes_first",
      creationReliabilityMode: "flexible",
      planner: null,
      composer: () => ({
        title: "Ashwick Thornwell preview",
        narration:
          "The cost hits Ashwick first. Both clubs carry continental titles and two missed knockout seasons. Bram Ives now leads Thornwell after being discarded. The meeting still leaves that contest open.",
        usedContentIds: [],
        omittedContentIds: [],
        hookClaimRefs: [],
        hookOpening: "The cost hits Ashwick first.",
        payoffClosing: "The meeting still leaves that contest open.",
      }),
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(bold.ok, true);
    if (!bold.ok) throw new Error("expected bold");
    assert.equal(
      bold.approved.generationDisposition?.acceptanceTrace?.finalNarrationAuthority,
      "model_direct",
    );
    assert.match(bold.approved.narration, /The cost hits Ashwick first/u);
    assert.notEqual(bold.approved.narration, auto.approved.narration);
  });

  await check("[7D] targeted repair succeeds without rescue", async () => {
    const repairBundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      durationSec: 40,
    });
    const repairBody =
      "After a long suspension Vale returned still serving a monitoring plan. Driftmere finished twelfth in that first stretch. Petra Quill asked the crowd to stay patient. The payoff is whether Driftmere stands with Vale.";
    const repairedProposal = {
      title: "Soren Vale Driftmere return",
      narration: `Can Vale still stand? ${repairBody}`,
      usedContentIds: [],
      omittedContentIds: [],
      hookClaimRefs: [],
      hookOpening: "Can Vale still stand?",
      payoffClosing: "The payoff is whether Driftmere stands with Vale.",
    };
    validate(repairBundle, repairedProposal);
    const repairedBuilt = buildRetentionNarrationCandidateFromProposal({
      proposal: repairedProposal,
      plan: repairBundle.plan,
      grounding: repairBundle.grounding,
      strategySeed: repairBundle.strategySeed,
      origin: "after_body_rewrite",
      extras: {
        contentContract: repairBundle.contentContract,
        brief: repairBundle.request.compositionBrief,
        eligibleClaimIds: repairBundle.eligibleClaimIds,
      },
    });
    assert.match(repairedBuilt.candidate.assembledNarration, /Can Vale still stand/u);
    const direct = await runRetentionProductionNarration({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      durationSec: 40,
      generationPath: "script_only",
      qualityMode: "cheap",
      factHandlingMode: "verified_facts_only",
      planner: null,
      composer: () => repairedProposal,
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(
      direct.ok &&
        direct.approved.generationDisposition?.acceptanceTrace
          ?.finalNarrationAuthority,
      "model_direct",
      direct.ok
        ? String(
            direct.approved.generationDisposition?.acceptanceTrace
              ?.finalNarrationAuthority,
          )
        : `direct-fail:${direct.failureCategory}`,
    );

    let calls = 0;
    const composer: RetentionComposerCallback = (request) => {
      calls += 1;
      const body =
        "After a long suspension Vale returned still serving a monitoring plan. Driftmere finished twelfth in that first stretch. Petra Quill asked the crowd to stay patient. The payoff is whether Driftmere stands with Vale.";
      if (request.modelCallKind === "repair") {
        return {
          title: "Soren Vale Driftmere return",
          narration: `Can Vale still stand? ${body}`,
          usedContentIds: [],
          omittedContentIds: [],
          hookClaimRefs: [],
          hookOpening: "Can Vale still stand?",
          payoffClosing: "The payoff is whether Driftmere stands with Vale.",
        };
      }
      return {
        title: "Soren Vale Driftmere return",
        narration: `Weather tonight? ${body}`,
        usedContentIds: [],
        omittedContentIds: [],
        hookClaimRefs: [],
        hookOpening: "Weather tonight?",
        payoffClosing: "The payoff is whether Driftmere stands with Vale.",
      };
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
    if (!result.ok) throw new Error("expected repair accept");
    const trace = result.approved.generationDisposition?.acceptanceTrace;
    assert.equal(trace?.finalNarrationAuthority, "model_after_rewrite");
    assert.equal(trace?.boundedRewriteType, "supported_opening_promotion");
    assert.equal(trace?.rewriteAccepted, true);
    assert.equal(trace?.deterministicRescueEntered, false);
    assert.equal(calls, 1);
    assert.match(result.approved.narration, /After a long suspension Vale returned/u);
  });

  await check("[7D] targeted repair invents a fact and is rejected", async () => {
    const composer: RetentionComposerCallback = (request) => {
      const body =
        "After a long suspension Vale returned still serving a monitoring plan. Driftmere finished twelfth in that first stretch. Vale already scored 19 goals yesterday. Petra Quill asked the crowd to stay patient.";
      if (request.modelCallKind === "repair") {
        return {
          title: "Soren Vale Driftmere return",
          narration: `Did Vale already score 19 goals? ${body} The payoff is whether Driftmere stands with Vale.`,
          usedContentIds: [],
          omittedContentIds: [],
          hookClaimRefs: [],
          hookOpening: "Did Vale already score 19 goals?",
          payoffClosing: "The payoff is whether Driftmere stands with Vale.",
        };
      }
      return {
        title: "Soren Vale Driftmere return",
        narration: `Weather tonight? ${body} The payoff is whether Driftmere stands with Vale.`,
        usedContentIds: [],
        omittedContentIds: [],
        hookClaimRefs: [],
        hookOpening: "Weather tonight?",
        payoffClosing: "The payoff is whether Driftmere stands with Vale.",
      };
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
    const trace = result.approved.generationDisposition?.acceptanceTrace;
    assert.equal(trace?.finalNarrationAuthority, "deterministic_rescue");
    assert.equal(trace?.deterministicRescueEntered, true);
    assert.doesNotMatch(result.approved.narration, /scored 19 goals/u);
  });

  await check("[7D] model narration survives beat mapping", () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
    });
    const accepted = validate(bundle, {
      title: "Soren Vale Driftmere return",
      narration:
        "Can Vale hold Driftmere? After a long suspension Vale returned still serving a monitoring plan. Driftmere finished twelfth in that first stretch. Petra Quill asked the crowd to stay patient. The payoff is whether Driftmere stands with Vale.",
      usedContentIds: [],
      omittedContentIds: [],
      hookClaimRefs: [],
      hookOpening: "Can Vale hold Driftmere?",
      payoffClosing: "The payoff is whether Driftmere stands with Vale.",
    });
    const built = buildRetentionNarrationCandidateFromProposal({
      proposal: {
        ...accepted,
        hookOpening: accepted.hookOpening,
        payoffClosing: accepted.payoffClosing,
      },
      plan: bundle.plan,
      grounding: bundle.grounding,
      strategySeed: bundle.strategySeed,
      origin: "initial_compose",
      extras: {
        contentContract: bundle.contentContract,
        brief: bundle.request.compositionBrief,
        eligibleClaimIds: bundle.eligibleClaimIds,
      },
    });
    const mapped = mapRetentionNarrationToBeats({
      narration: built.candidate.assembledNarration,
      plan: bundle.plan,
      grounding: bundle.grounding,
      strategySeed: bundle.strategySeed,
      allowEmptyInternalBeats: true,
    });
    assert.equal(mapped.narration, built.candidate.assembledNarration);
  });

  await check("[7D] rescue remains available after genuine rejection", async () => {
    const result = await runRetentionProductionNarration({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      factHandlingMode: "verified_facts_only",
      planner: null,
      composer: () => ({
        title: "Soren Vale Driftmere return",
        narration:
          "Did Vale fail a new test? Vale scored 19 goals and sealed a victory over Thornwell after inventing a title. The crowd then turned away.",
        usedContentIds: ["plausible_looking_id"],
        omittedContentIds: [],
        hookClaimRefs: [],
        hookOpening: "Did Vale fail a new test?",
        payoffClosing: "The crowd then turned away.",
      }),
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected rescue");
    const trace = result.approved.generationDisposition?.acceptanceTrace;
    assert.equal(trace?.finalNarrationAuthority, "deterministic_rescue");
    assert.equal(trace?.deterministicRescueEntered, true);
    assert.doesNotMatch(result.approved.narration, /failed a new test/u);
    assert.doesNotMatch(result.approved.narration, /scored 19 goals/u);
  });

  await check("[7E] accepted player coverage is not falsely starved by paraphrase", () => {
    const bundle = ready({
      topic: PLAYER_TOPIC,
      manualContext: PLAYER_CONTEXT,
    });
    const accepted = validate(bundle, {
      title: "Soren Vale Driftmere return",
      narration:
        "Can Vale hold Driftmere? Vale returned after the long suspension while still serving the monitoring plan. Driftmere finished twelfth in that first stretch back. Petra Quill asked the crowd to stay patient. Support and pressure now decide whether Driftmere stands with Vale.",
      usedContentIds: [],
      omittedContentIds: [],
      hookClaimRefs: [],
      hookOpening: "Can Vale hold Driftmere?",
      payoffClosing:
        "Support and pressure now decide whether Driftmere stands with Vale.",
    });
    const substance = evaluateRetentionNarrationSubstance({
      topic: bundle.contract.topic,
      grounding: bundle.grounding,
      candidate: {
        assembledNarration: accepted.narration,
        segments: [
          {
            beatId: "b1",
            text: accepted.narration,
            startOffset: 0,
            endOffset: accepted.narration.length,
            claimRefs: accepted.usedContentIds,
            factualRisk: false,
          },
        ],
      } as never,
    });
    assert.ok(substance.creatorClaimCoverageRatio >= 0.34);
    assert.equal(substance.diagnosticIds.includes("low_creator_claim_coverage"), false);
  });

  await check("[source] no production club special-casing in Prompt 7 authorities", () => {
    const files = [
      "features/retention-story/composition/rebind-retention-composer-content-ids.ts",
      "features/retention-story/composition/evaluate-retention-hook-body-payoff.ts",
      "features/retention-story/composition/validate-retention-narration-first-proposal.ts",
      "features/retention-story/integration/create-retention-hooked-model-call.ts",
    ];
    for (const rel of files) {
      const source = readFileSync(path.join(ROOT, rel), "utf8");
      assert.doesNotMatch(
        source,
        /\b(?:Manchester United|Chelsea|Real Madrid|Spain|France|Arsenal|Liverpool)\b/u,
      );
    }
  });

  console.log("retention-acceptance-calibration: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
