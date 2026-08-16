/**
 * Prompt 9 forensic + ablation. Max 4 provider invocations.
 * Writes sensitive notes only under gitignored .tmp/.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

import { runRetentionProductionNarration } from "@/features/retention-story/production/run-retention-production-narration";
import { createRetentionProductionComposer } from "@/features/retention-story/production/create-retention-production-composer";
import { requestRetentionStructuredJson } from "@/features/retention-story/production/retention-production-model-json";
import { evaluateRetentionCanonicalNarrationAcceptance } from "@/features/retention-story/composition/evaluate-retention-canonical-narration-acceptance";
import { evaluateRetentionSpokenClaimGrounding } from "@/features/retention-story/composition/evaluate-retention-spoken-claim-grounding";
import { evaluateRetentionHookBodyPayoff } from "@/features/retention-story/composition/evaluate-retention-hook-body-payoff";
import { buildRetentionCreatorContentContract } from "@/features/retention-story/grounding/build-retention-creator-content-contract";
import { buildRetentionComposerRequest } from "@/features/retention-story/composition/build-retention-composer-request";
import { normalizeStoryContract } from "@/features/retention-story/domain/normalize-story-contract";
import { buildProductionStoryContractInput } from "@/features/retention-story/production/build-production-story-contract-input";
import { buildReliabilityDeterministicRetentionPlan } from "@/features/retention-story/planning/build-reliability-deterministic-retention-plan";
import { createRetentionModelCallLedger } from "@/features/retention-story/budget/create-retention-model-call-ledger";
import { createRetentionCertificationCallBudget } from "@/features/retention-story/production/create-retention-certification-call-budget";
import { bindRetentionCertificationCallBudget } from "@/features/retention-story/production/create-retention-certification-call-budget";

const OUT = path.resolve(".tmp/story-quality-rejected-proposals");
const MAX = 4;
const MODEL = "gpt-4.1-mini";

const PREVIEW = {
  topic: "Rookfall versus Silvermere continental preview",
  context: [
    "Both clubs won continental titles in the last decade.",
    "Each side has missed the knockout rounds for two seasons.",
    "Former Rookfall coach Ivo Kest now leads Silvermere.",
    "The redemption angle is whether Kest can beat the club that discarded him.",
  ].join("\n"),
};

function loadLocalEnv(): void {
  loadEnvConfig(path.resolve("."));
}

function countInvocations(budget: { planner?: number; initialNarration?: number; hookRepair?: number; lengthCompression?: number; hookFallback?: number; retentionBodyRewrite?: number } | undefined): number {
  if (!budget) return 0;
  return (
    (budget.planner ?? 0) +
    (budget.initialNarration ?? 0) +
    (budget.hookRepair ?? 0) +
    (budget.lengthCompression ?? 0) +
    (budget.hookFallback ?? 0) +
    (budget.retentionBodyRewrite ?? 0)
  );
}

function readyBundle() {
  const contractInput = buildProductionStoryContractInput({
    topic: PREVIEW.topic,
    durationSec: 30,
    generationPath: "script_only",
    qualityMode: "cheap",
    scriptMode: "match_preview",
    tone: "dramatic",
    factHandlingMode: "verified_facts_only",
    manualContext: PREVIEW.context,
  });
  const contract = normalizeStoryContract(contractInput);
  const grounding = contractInput.grounding!;
  const planResult = buildReliabilityDeterministicRetentionPlan({
    contract,
    grounding,
    manualContext: PREVIEW.context,
    planner: null,
    ledger: createRetentionModelCallLedger("cheap"),
  });
  if (planResult.status !== "ready") throw new Error("plan");
  const contentContract = buildRetentionCreatorContentContract({
    contract,
    grounding,
    manualContext: PREVIEW.context,
  });
  const request = buildRetentionComposerRequest({
    contract,
    plan: planResult.plan,
    strategySeed: planResult.strategySeed,
    grounding,
    manualContext: PREVIEW.context,
    hookDirectiveBlock: "",
    modelCallKind: "initial",
    contentContract,
  });
  return { contentContract, request, eligibleClaimIds: new Set(request.eligibleClaims.map((c) => c.claimId)) };
}

function classifyOffline(raw: unknown) {
  const bundle = readyBundle();
  const accepted = evaluateRetentionCanonicalNarrationAcceptance({
    raw,
    contentContract: bundle.contentContract,
    brief: bundle.request.compositionBrief,
    eligibleClaimIds: bundle.eligibleClaimIds,
  });
  const grounding = evaluateRetentionSpokenClaimGrounding({
    narration: typeof (raw as { narration?: string }).narration === "string"
      ? (raw as { narration: string }).narration
      : "",
    contentContract: bundle.contentContract,
    eligibleClaimIds: bundle.eligibleClaimIds,
    grounding: undefined,
  });
  const relation = evaluateRetentionHookBodyPayoff({
    narration: accepted.narration || ((raw as { narration?: string }).narration ?? ""),
    contentContract: bundle.contentContract,
    brief: bundle.request.compositionBrief,
  });
  return { accepted, grounding, relation };
}

async function main(): Promise<void> {
  loadLocalEnv();
  mkdirSync(OUT, { recursive: true });
  const budget = createRetentionCertificationCallBudget(MAX);
  bindRetentionCertificationCallBudget(budget);

  const notes: Record<string, unknown> = {
    sensitiveLocalCertificationEvidence: true,
    doNotCommit: true,
    phase: "prompt9-forensic-ablation",
    model: MODEL,
  };

  if (!budget.canStartOptionalCase(2)) {
    throw new Error("budget");
  }
  const production = await runRetentionProductionNarration({
    topic: PREVIEW.topic,
    manualContext: PREVIEW.context,
    durationSec: 30,
    generationPath: "script_only",
    qualityMode: "cheap",
    scriptMode: "match_preview",
    tone: "dramatic",
    factHandlingMode: "verified_facts_only",
    planner: null,
    composer: createRetentionProductionComposer({ model: MODEL }),
    captureRejectedProposals: true,
    rejectedProposalCaptureCaseId: "prompt9-preview-forensic",
  });
  const prodCalls = production.ok
    ? countInvocations(production.approved.safeDiagnostics.budget)
    : countInvocations(production.retentionDiagnostics.budget);
  notes.variantC_production = {
    ok: production.ok,
    authority: production.ok
      ? production.approved.generationDisposition?.acceptanceTrace?.finalNarrationAuthority
      : null,
    stage: production.ok
      ? production.approved.generationDisposition?.acceptanceTrace?.earliestDecisiveRejection
      : production.retentionDiagnostics.acceptanceTrace?.earliestDecisiveRejection,
    invocations: prodCalls,
    budget: production.ok
      ? production.approved.safeDiagnostics.budget
      : production.retentionDiagnostics.budget,
  };

  const captureFile = path.join(OUT, "prompt9-preview-forensic.json");
  notes.captureFile = existsSync(captureFile) ? captureFile : null;
  if (existsSync(captureFile)) {
    const captured = JSON.parse(readFileSync(captureFile, "utf8")) as {
      narrationBeforeNormalization?: string;
      parsedModelProposal?: { narration?: string; title?: string };
      canonicalRejectionStage?: string | null;
      clauseSupport?: { sentenceProvenance?: string[]; ok?: boolean };
      hookBodyPayoff?: { ok?: boolean; reasonIds?: string[] };
    };
    const narration = captured.narrationBeforeNormalization ?? captured.parsedModelProposal?.narration ?? "";
    const clauses = narration.split(/(?<=[.!?…])\s+/u).filter(Boolean);
    notes.forensicClassification = {
      canonicalRejectionStage: captured.canonicalRejectionStage,
      clauseCount: clauses.length,
      clauseSupport: captured.clauseSupport,
      hookBodyPayoff: captured.hookBodyPayoff,
      spokenClauses: clauses.map((clause, index) => ({
        index,
        clause,
        wordCount: clause.split(/\s+/u).filter(Boolean).length,
        provenance: captured.clauseSupport?.sentenceProvenance?.[index] ?? "unknown",
        pendingHumanClass:
          "directly_supported|conservative_paraphrase|connective_editorial|required_uncertainty|unsupported_invention|ambiguous|malformed",
      })),
      hookFailurePendingHumanClass:
        "genuinely_meaningless|unrelated_to_body|supported_but_metadata_stale|supported_but_rejected_by_token_shape|changed_during_promotion|repaired_correctly_but_evaluated_against_pre_repair|repair_made_worse",
      rawNarrationBeforeNormalization: narration,
    };
  }

  const remainingAfterC = MAX - budget.snapshot().used;
  notes.invocationsAfterForensic = budget.snapshot();

  async function runVariant(id: "A" | "B", schema: Record<string, unknown>, prompt: string) {
    if (!budget.canStartOptionalCase(1)) {
      return { skipped: true, reason: "budget" };
    }
    const raw = await requestRetentionStructuredJson({
      model: MODEL,
      prompt,
      durationSec: 30,
      kind: "initial_composer",
      beatCount: 5,
      targetWordBudget: 72,
      temperature: 0.35,
      jsonSchema: {
        name: `retention_ablation_${id.toLowerCase()}`,
        description: "Prompt 9 ablation composer",
        schema,
      },
    });
    const classified = classifyOffline(raw);
    return {
      skipped: false,
      decision: classified.accepted.decision,
      stage: classified.accepted.stage,
      groundingOk: classified.grounding.ok,
      hookBodyOk: classified.relation.ok,
      hookReasons: classified.relation.reasonIds,
      wordCount: classified.accepted.narration.split(/\s+/u).filter(Boolean).length,
    };
  }

  const bundle = readyBundle();
  const units = bundle.contentContract.orderedUnits
    .filter((unit) => unit.kind !== "instruction" && unit.kind !== "forbidden")
    .map((unit) => `- ${unit.contentUnitId}: ${unit.text}`)
    .join("\n");

  notes.variantA = await runVariant(
    "A",
    {
      type: "object",
      additionalProperties: false,
      required: ["title", "narration"],
      properties: {
        title: { type: "string" },
        narration: { type: "string" },
      },
    },
    [
      "Write one continuous spoken match preview. JSON only.",
      "Duration 30 seconds. Mode match_preview. Tone dramatic. Hook style auto.",
      "Use only the creator facts. Do not invent scores, results, or new events.",
      "Name both Rookfall and Silvermere. Keep the meeting uncertain.",
      "Creator facts:",
      units,
    ].join("\n"),
  );

  const allowedIds = bundle.contentContract.orderedUnits
    .map((unit) => unit.contentUnitId)
    .concat(
      bundle.contentContract.orderedUnits
        .map((unit) => unit.claimId)
        .filter((id): id is string => id != null),
    );
  const uniqueIds = [...new Set(allowedIds)];
  notes.variantB = await runVariant(
    "B",
    uniqueIds.length === 0
      ? {
          type: "object",
          additionalProperties: false,
          required: ["title", "narration", "support"],
          properties: {
            title: { type: "string" },
            narration: { type: "string" },
            support: { type: "array", maxItems: 0, items: { type: "string" } },
          },
        }
      : {
          type: "object",
          additionalProperties: false,
          required: ["title", "narration", "support"],
          properties: {
            title: { type: "string" },
            narration: { type: "string" },
            support: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["sentenceIndex", "contentUnitId"],
                properties: {
                  sentenceIndex: { type: "integer" },
                  contentUnitId: { type: "string", enum: uniqueIds },
                },
              },
            },
          },
        },
    [
      "Write one continuous spoken match preview. JSON only.",
      "Annotate sentence support using only allowed content IDs.",
      "Do not invent Hook, payoff, beats, or planning fields.",
      "Use only the creator facts. Do not invent scores or results.",
      "Allowed IDs:",
      uniqueIds.join(", "),
      "Creator facts:",
      units,
    ].join("\n"),
  );

  notes.finalBudget = budget.snapshot();
  writeFileSync(path.join(OUT, "prompt9-investigation-notes.json"), `${JSON.stringify(notes, null, 2)}\n`);
  console.log(JSON.stringify({
    forensicInvocations: notes.invocationsAfterForensic,
    variantC: notes.variantC_production,
    variantA: notes.variantA,
    variantB: notes.variantB,
    finalBudget: notes.finalBudget,
    notesFile: path.join(OUT, "prompt9-investigation-notes.json"),
  }, null, 2));
  bindRetentionCertificationCallBudget(null);
}

main().catch((error) => {
  bindRetentionCertificationCallBudget(null);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
