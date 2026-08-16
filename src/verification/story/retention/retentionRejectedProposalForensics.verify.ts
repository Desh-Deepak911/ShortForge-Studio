/**
 * Story-quality Prompt 9 — rejected-proposal capture, transformation
 * invariants, and ranking-rescue responsibilities. Provider-free.
 */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildRetentionComposerRequest,
  buildRetentionCreatorContentContract,
  buildRetentionPublicGenerationContextPresence,
  createRetentionFrozenProductionComposer,
  createRetentionRejectedProposalCaptureSession,
  digestRetentionNarration,
  evaluateRetentionCanonicalNarrationAcceptance,
  evaluateRetentionSpokenClaimGrounding,
  isRetentionRejectedProposalCaptureEnabled,
  mapRetentionNarrationToBeats,
  metadataOnlyStageMayChangeNarration,
  recordRetentionNarrationTransform,
  RETENTION_PUBLIC_GENERATION_CONTEXT_SUPPLIED,
  runRetentionProductionNarration,
  serializeRetentionCanonicalGenerationResult,
  textChangingStageRequiresProvenance,
} from "@/features/retention-story";
import { createRetentionModelCallLedger } from "@/features/retention-story/budget/create-retention-model-call-ledger";
import { normalizeStoryContract } from "@/features/retention-story/domain/normalize-story-contract";
import { buildReliabilityDeterministicRetentionPlan } from "@/features/retention-story/planning/build-reliability-deterministic-retention-plan";
import { buildProductionStoryContractInput } from "@/features/retention-story/production/build-production-story-contract-input";
import { buildRetentionComposerJsonSchema } from "@/features/retention-story/production/retention-composer-json-schema";
import type { RetentionHookRunner } from "@/features/retention-story";
import { passRetentionHookRunner } from "./retentionStoryQaDoubles";

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

const SENTINEL = "FBZ_CAPTURE_SENTINEL_9f3c2a1b7e44";
const RANKING_TOPIC = "Five Driftmere midfielders to watch";
const RANKING_CONTEXT = [
  "1. Lina Crowe — she creates the first shot in almost every Driftmere attack.",
  "2. Oren Pike — tempo control through the middle third.",
  "3. Sable Quin — recovery sprints that rescue broken presses.",
  "4. Theo Marrow — set-piece delivery from both flanks.",
  "5. Vesper Holt — late-box arrivals after the second ball.",
].join("\n");

async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  console.log(`  ✓ ${label}`);
}

function ready(topic: string, manualContext: string, scriptMode: "story" | "match_preview" | "top_5" = "story") {
  const contractInput = buildProductionStoryContractInput({
    topic,
    durationSec: 45,
    generationPath: "script_only",
    qualityMode: "cheap",
    scriptMode,
    tone: "dramatic",
    factHandlingMode: "verified_facts_only",
    manualContext,
  });
  const contract = normalizeStoryContract(contractInput);
  const grounding = contractInput.grounding!;
  const planResult = buildReliabilityDeterministicRetentionPlan({
    contract,
    grounding,
    manualContext,
    planner: null,
    ledger: createRetentionModelCallLedger(contract.qualityMode),
  });
  if (planResult.status !== "ready") throw new Error("plan");
  const contentContract = buildRetentionCreatorContentContract({
    contract,
    grounding,
    manualContext,
  });
  const request = buildRetentionComposerRequest({
    contract,
    plan: planResult.plan,
    strategySeed: planResult.strategySeed,
    grounding,
    manualContext,
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

async function main(): Promise<void> {
  console.log("retention-rejected-proposal-forensics (Prompt 9)");

  await check("[9A] capture is disabled by default", () => {
    assert.equal(isRetentionRejectedProposalCaptureEnabled(), false);
    assert.equal(isRetentionRejectedProposalCaptureEnabled({}), false);
    assert.equal(
      isRetentionRejectedProposalCaptureEnabled({ captureRejectedProposals: false }),
      false,
    );
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    assert.equal(
      isRetentionRejectedProposalCaptureEnabled({ captureRejectedProposals: true }),
      false,
    );
    process.env.NODE_ENV = previous;
  });

  await check("[9A] public output cannot contain captured text", async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "fbz-capture-"));
    const session = createRetentionRejectedProposalCaptureSession({
      caseId: "public-leak-guard",
      rootDir: tmp,
    });
    session.recordStage("before_normalization", SENTINEL);
    session.recordRejection("unsupported_claim_or_claim_reference_rejection", "reject");
    const file = session.flush();
    assert.ok(file && existsSync(file));
    const captured = readFileSync(file, "utf8");
    assert.match(captured, /sensitiveLocalCertificationEvidence/u);
    assert.match(captured, new RegExp(SENTINEL, "u"));
    const publicPayload = serializeRetentionCanonicalGenerationResult({
      success: true,
      data: { title: "Public", narration: "Can Vale hold Driftmere?" },
      generationContext: RETENTION_PUBLIC_GENERATION_CONTEXT_SUPPLIED,
      generationDisposition: { disposition: "acceptable" },
    });
    assert.doesNotMatch(JSON.stringify(publicPayload.json), new RegExp(SENTINEL, "u"));
    assert.doesNotMatch(publicPayload.ndjson, new RegExp(SENTINEL, "u"));
    assert.equal(
      buildRetentionPublicGenerationContextPresence(SENTINEL),
      RETENTION_PUBLIC_GENERATION_CONTEXT_SUPPLIED,
    );
    rmSync(tmp, { recursive: true, force: true });
  });

  await check("[9A] production path does not capture unless opted in", async () => {
    const result = await runRetentionProductionNarration({
      topic: "Soren Vale Driftmere return",
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: "cheap",
      planner: null,
      composer: () => {
        throw new Error("composer unavailable");
      },
      hookRunner: passRetentionHookRunner,
    });
    assert.equal(result.ok, true);
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /sensitiveLocalCertificationEvidence/u);
    assert.doesNotMatch(serialized, /story-quality-rejected-proposals/u);
  });

  await check("[9E] metadata-only stages preserve narration digest", () => {
    const narration = "Can Vale hold Driftmere? Vale returned after the suspension.";
    const digest = digestRetentionNarration(narration);
    const provenance = recordRetentionNarrationTransform({
      stage: "claim_reference_normalization",
      inputNarration: narration,
      outputNarration: narration,
      reason: "normalize_ids",
      authority: "spoken_claim_grounding",
    });
    assert.equal(provenance.changed, false);
    assert.equal(provenance.inputDigest, digest);
    assert.equal(provenance.outputDigest, digest);
    assert.equal(metadataOnlyStageMayChangeNarration("claim_reference_normalization"), false);
    assert.equal(metadataOnlyStageMayChangeNarration("json_ndjson_serialization"), false);
  });

  await check("[9E] text-changing stages emit provenance", () => {
    const before = "Can Vale hold Driftmere? Vale returned after the suspension.";
    const after = "Can Vale hold Driftmere? Vale returned after the long suspension.";
    const provenance = recordRetentionNarrationTransform({
      stage: "targeted_rewrite",
      inputNarration: before,
      outputNarration: after,
      reason: "unsupported_claim_or_claim_reference_rejection",
      changedRegion: "body",
      authority: "targeted_rewrite",
    });
    assert.equal(provenance.changed, true);
    assert.notEqual(provenance.inputDigest, provenance.outputDigest);
    assert.equal(provenance.authority, "targeted_rewrite");
  });

  await check("[9E] repaired narration is not evaluated with pre-repair metadata", () => {
    const bundle = ready(
      "Soren Vale Driftmere return",
      "After a long suspension kept Soren Vale out, Vale returned to Driftmere. Driftmere finished twelfth.",
    );
    const staleHook = "Unrelated opening about a transfer fee.";
    const repaired =
      "Can Vale hold Driftmere? Vale returned after the long suspension. Driftmere finished twelfth. The crowd may still turn.";
    const stale = evaluateRetentionCanonicalNarrationAcceptance({
      raw: {
        title: "Soren Vale Driftmere return",
        narration: repaired,
        usedContentIds: [],
        omittedContentIds: [],
        hookClaimRefs: [],
        hookOpening: staleHook,
        payoffClosing: "Unrelated payoff about a transfer fee.",
      },
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
    });
    assert.notEqual(stale.spokenOpening, staleHook);
    assert.equal(stale.decision === "accept" || stale.decision === "textual_repair", true);
  });

  await check("[9F] supported speech with bad IDs still passes; invented speech fails", () => {
    const bundle = ready(
      "Soren Vale Driftmere return",
      [
        "After a long suspension kept Soren Vale out of every competitive fixture, the midfielder returned to Driftmere still serving a club monitoring plan.",
        "Driftmere finished twelfth in Vale's first stretch back.",
        "New coach Petra Quill asked the crowd to stay patient.",
        "The support-versus-pressure payoff is whether Driftmere stands with Vale.",
      ].join("\n"),
    );
    const supported = evaluateRetentionCanonicalNarrationAcceptance({
      raw: {
        title: "Soren Vale Driftmere return",
        narration:
          "Can Vale hold Driftmere? Vale returned after the long suspension while still serving the monitoring plan. Driftmere finished twelfth in that first stretch back. Petra Quill asked the crowd to stay patient. Support and pressure now decide whether Driftmere stands with Vale.",
        usedContentIds: ["unknown_id_xyz"],
        omittedContentIds: [],
        hookClaimRefs: ["unknown_id_xyz"],
        hookOpening: "Wrong hook metadata",
        payoffClosing: "Wrong payoff metadata",
      },
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
    });
    assert.equal(supported.decision, "accept", supported.stage ?? "accept");
    const invented = evaluateRetentionCanonicalNarrationAcceptance({
      raw: {
        title: "Soren Vale Driftmere return",
        narration:
          "Can Vale hold Driftmere? Vale scored 14 goals in May and won the title 3-1. The crowd may still turn.",
        usedContentIds: [...bundle.eligibleClaimIds],
        omittedContentIds: [],
        hookClaimRefs: [],
      },
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
    });
    assert.equal(invented.decision !== "accept", true);
    assert.equal(invented.stage, "unsupported_claim_or_claim_reference_rejection");
  });

  await check("[9D] zero-content-unit schema stays valid", () => {
    const schema = buildRetentionComposerJsonSchema({ eligibleClaims: [] });
    assert.equal(schema.additionalProperties, false);
    assert.ok(Array.isArray(schema.required));
    const support = (schema.properties as { support: { maxItems?: number } }).support;
    assert.equal(support.maxItems, 0);
  });

  await check("[9D] support IDs are constrained to the allowed enum", () => {
    const schema = buildRetentionComposerJsonSchema({
      eligibleClaims: [{ claimId: "rs:c:allowed" }],
      allowedContentIds: ["rs:u:allowed"],
    });
    const supportItems = (
      schema.properties as {
        support: {
          items: { properties: { contentUnitId: { enum?: string[] } } };
        };
      }
    ).support.items;
    const allowed = supportItems.properties.contentUnitId.enum ?? [];
    assert.ok(allowed.includes("rs:c:allowed"));
    assert.ok(allowed.includes("rs:u:allowed"));
    assert.equal(allowed.includes("free_form_unknown"), false);
  });

  await check("[9D] narration-only response maps after acceptance", () => {
    const bundle = ready(
      "Ashwick versus Thornwell continental preview",
      [
        "Both clubs won continental titles in the last decade.",
        "Each side has missed the knockout rounds for two seasons.",
        "Former Ashwick coach Bram Ives now leads Thornwell.",
        "The redemption angle is whether Ives can answer the club that discarded him.",
      ].join("\n"),
      "match_preview",
    );
    const raw = {
      title: "Ashwick versus Thornwell continental preview",
      narration:
        "Can Ives answer Ashwick? Both clubs carry continental titles and two missed knockout seasons. Thornwell now follows the discarded coach into that same meeting. The question stays open when the sides meet.",
    };
    const accepted = evaluateRetentionCanonicalNarrationAcceptance({
      raw,
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
    });
    assert.equal(accepted.decision, "accept", accepted.stage ?? "accept");
    const mapped = mapRetentionNarrationToBeats({
      narration: accepted.narration,
      plan: bundle.plan,
      grounding: bundle.grounding,
      strategySeed: bundle.strategySeed,
      usedClaimIds: [...accepted.usedContentIds],
      hookOpening: accepted.spokenOpening,
      payoffClosing: accepted.spokenPayoff,
      allowEmptyInternalBeats: true,
    });
    const rebuilt = mapped.segments.map((segment) => segment.text).join(" ").replace(/\s+/g, " ").trim();
    assert.equal(rebuilt, accepted.narration);
  });

  await check("[9F] captured preview paraphrase is supported speech", () => {
    const bundle = ready(
      "Rookfall versus Silvermere continental preview",
      [
        "Both clubs won continental titles in the last decade.",
        "Each side has missed the knockout rounds for two seasons.",
        "Former Rookfall coach Ivo Kest now leads Silvermere.",
        "The redemption angle is whether Kest can beat the club that discarded him.",
      ].join("\n"),
      "match_preview",
    );
    const grounding = evaluateRetentionSpokenClaimGrounding({
      narration:
        "Rookfall versus Silvermere continental preview sets a high-stakes clash. Both clubs have tasted continental glory in the last decade, yet each has missed the knockout rounds for two seasons, intensifying the pressure. Former Rookfall coach Ivo Kest now leads Silvermere, adding a personal edge to this encounter. The central question remains: can Kest achieve redemption by defeating the club that discarded him?",
      contentContract: bundle.contentContract,
      eligibleClaimIds: bundle.eligibleClaimIds,
    });
    assert.equal(grounding.ok, true, grounding.sentenceProvenance.join(","));
    assert.equal(grounding.unsupportedSpokenClaim, false);
  });

  await check("[9E] text-changing stages require provenance; metadata-only must not rewrite", () => {
    assert.equal(textChangingStageRequiresProvenance("hook_promotion"), true);
    assert.equal(textChangingStageRequiresProvenance("targeted_rewrite"), true);
    assert.equal(textChangingStageRequiresProvenance("deterministic_rescue"), true);
    assert.equal(metadataOnlyStageMayChangeNarration("support_rebinding"), false);
    assert.equal(metadataOnlyStageMayChangeNarration("hook_metadata_derivation"), false);
    assert.equal(metadataOnlyStageMayChangeNarration("payoff_metadata_derivation"), false);
    assert.equal(metadataOnlyStageMayChangeNarration("acceptance_trace"), false);
  });

  await check("[9G] preview narration with a meaningful semantic Hook accepts", () => {
    const bundle = ready(
      "Ashwick versus Thornwell continental preview",
      [
        "Both clubs won continental titles in the last decade.",
        "Each side has missed the knockout rounds for two seasons.",
        "Former Ashwick coach Bram Ives now leads Thornwell.",
        "The redemption angle is whether Ives can answer the club that discarded him.",
      ].join("\n"),
      "match_preview",
    );
    const accepted = evaluateRetentionCanonicalNarrationAcceptance({
      raw: {
        title: "Ashwick versus Thornwell continental preview",
        narration:
          "Can Ives answer Ashwick? Both clubs carry continental titles and two missed knockout seasons. Thornwell now follows the discarded coach into that same meeting. The question stays open when the sides meet.",
      },
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
    });
    assert.equal(accepted.decision, "accept", accepted.stage ?? "accept");
  });

  await check("[9H] ordered ranking with an explicit number-one payoff accepts", () => {
    const bundle = ready(
      RANKING_TOPIC,
      RANKING_CONTEXT,
      "top_5",
    );
    const accepted = evaluateRetentionCanonicalNarrationAcceptance({
      raw: {
        title: "Five Driftmere midfielders to watch",
        narration:
          "Who stands last tonight? Oren Pike controls tempo through the middle. Sable Quin rescues broken presses. Theo Marrow delivers set pieces. Vesper Holt arrives late. Lina Crowe creates the first shot and stands last as the number one.",
      },
      contentContract: bundle.contentContract,
      brief: bundle.request.compositionBrief,
      eligibleClaimIds: bundle.eligibleClaimIds,
    });
    assert.equal(accepted.decision, "accept", accepted.stage ?? "accept");
  });

  await check("[9G] Hook-engine grounding cannot replace canonically accepted speech", async () => {
    const narration =
      "Can Calen Voss hold at Harbor United? After a long doping ban kept him out of every competitive fixture, Voss returned still under a club monitoring plan. Harbor United finished tenth in his first stretch back. New coach Mira Solan arrived midseason and asked fans to stay patient. The real question now is whether Harbor will stand with Voss or turn on him.";
    const result = await runRetentionProductionNarration({
      topic: "Calen Voss Harbor return",
      manualContext: [
        "After a long doping ban kept Calen Voss out of every competitive fixture, the striker returned to Harbor United still serving a club monitoring plan.",
        "Harbor United finished tenth in Voss's first stretch back.",
        "New coach Mira Solan arrived midseason and asked the crowd to stay patient.",
        "The support-versus-pressure payoff is whether Harbor stands with Voss or turns on him.",
      ].join("\n"),
      durationSec: 40,
      generationPath: "script_only",
      qualityMode: "cheap",
      scriptMode: "player_analysis",
      planner: null,
      composer: createRetentionFrozenProductionComposer({
        title: "Calen Voss Harbor return",
        narration,
      }),
      hookRunner: rejectHookGrounding,
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("keep");
    const authority =
      result.approved.generationDisposition?.acceptanceTrace?.finalNarrationAuthority;
    assert.ok(authority === "model_direct" || authority === "model_after_rewrite");
    assert.equal(
      result.approved.generationDisposition?.acceptanceTrace?.deterministicRescueEntered,
      false,
    );
    assert.equal(result.approved.narration, narration);
  });

  await check("[9H] ranking rescue states an explicit number-one payoff", async () => {
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
    assert.equal(result.approved.generationDisposition?.qualityBelowTarget, true);
    const narration = result.approved.narration;
    for (const name of ["Lina Crowe", "Oren Pike", "Sable Quin", "Theo Marrow", "Vesper Holt"]) {
      assert.match(narration, new RegExp(name.split(" ")[0]!, "u"));
    }
    assert.match(narration, /number one|stands last|decisive name|#1/iu);
  });

  await check("[source] no production club special-casing in Prompt 9 capture", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "src/features/retention-story/production/create-retention-rejected-proposal-capture.ts",
      ),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /\b(?:Manchester United|Chelsea|Real Madrid|Spain|France)\b/u,
    );
  });

  console.log("retention-rejected-proposal-forensics: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
