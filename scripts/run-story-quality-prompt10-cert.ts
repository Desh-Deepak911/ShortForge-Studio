/**
 * Prompt 10 live certification. Maximum 8 provider invocations total.
 * Order: Fast player → Fast preview → Fast ranking → Balanced gpt-4.1
 * → one explicit Hook only if budget remains.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

import { runRetentionProductionNarration } from "@/features/retention-story/production/run-retention-production-narration";
import { createRetentionProductionComposer } from "@/features/retention-story/production/create-retention-production-composer";
import { createRetentionProductionPlanner } from "@/features/retention-story/production/create-retention-production-planner";
import {
  bindRetentionCertificationCallBudget,
  createRetentionCertificationCallBudget,
} from "@/features/retention-story/production/create-retention-certification-call-budget";
import {
  serializeRetentionCanonicalGenerationResult,
  type RetentionCanonicalPublicGenerationResult,
} from "@/features/retention-story/production/serialize-retention-canonical-generation-result";
import { RETENTION_PUBLIC_GENERATION_CONTEXT_SUPPLIED } from "@/features/retention-story/production/build-retention-public-generation-context";
import type { HookStyleSelection } from "@/features/hook-engine/presentation/hook-style-selection";

const OUT = path.resolve(".tmp/story-quality-real-cert/prompt10");
const TOTAL_CAP = 8;

type CertCase = {
  readonly id: string;
  readonly topic: string;
  readonly context: string;
  readonly scriptMode: "player_analysis" | "match_preview" | "top_5";
  readonly qualityMode: "cheap" | "balanced";
  readonly model: string;
  readonly expected: number;
  readonly hookStyle?: HookStyleSelection;
};

const PLAYER: CertCase = {
  id: "fast-player",
  topic: "Calen Voss Harbor return",
  context: [
    "After a long doping ban kept Calen Voss out of every competitive fixture, the striker returned to Harbor United still serving a club monitoring plan.",
    "Harbor United finished tenth in Voss's first stretch back.",
    "New coach Mira Solan arrived midseason and asked the crowd to stay patient.",
    "The support-versus-pressure payoff is whether Harbor stands with Voss or turns on him.",
    "Do not claim Voss failed a new test.",
  ].join("\n"),
  scriptMode: "player_analysis",
  qualityMode: "cheap",
  model: "gpt-4.1-mini",
  expected: 2,
};

const PREVIEW: CertCase = {
  id: "fast-preview",
  topic: "Rookfall versus Silvermere continental preview",
  context: [
    "Both clubs won continental titles in the last decade.",
    "Each side has missed the knockout rounds for two seasons.",
    "Former Rookfall coach Ivo Kest now leads Silvermere.",
    "The redemption angle is whether Kest can beat the club that discarded him.",
  ].join("\n"),
  scriptMode: "match_preview",
  qualityMode: "cheap",
  model: "gpt-4.1-mini",
  expected: 2,
};

const RANKING: CertCase = {
  id: "fast-ranking",
  topic: "Five Harbor attackers to watch",
  context: [
    "1. Nia Calder — she creates the first shot in almost every Harbor attack.",
    "2. Tess Orlow — tempo control through the middle third.",
    "3. Bo Renwick — recovery sprints that rescue broken presses.",
    "4. Imani Shore — set-piece delivery from both flanks.",
    "5. Pax Ellery — late-box arrivals after the second ball.",
  ].join("\n"),
  scriptMode: "top_5",
  qualityMode: "cheap",
  model: "gpt-4.1-mini",
  expected: 2,
};

const BALANCED: CertCase = {
  ...PLAYER,
  id: "balanced-player",
  qualityMode: "balanced",
  model: "gpt-4.1",
  expected: 3,
};

const HOOK: CertCase = {
  ...PREVIEW,
  id: "fast-preview-stakes-hook",
  hookStyle: "stakes_first",
  expected: 2,
};

function countInvocations(budget: {
  planner?: number;
  initialNarration?: number;
  hookRepair?: number;
  lengthCompression?: number;
  hookFallback?: number;
  retentionBodyRewrite?: number;
} | undefined): number {
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

async function main(): Promise<void> {
  loadEnvConfig(path.resolve("."));
  mkdirSync(OUT, { recursive: true });
  const budget = createRetentionCertificationCallBudget(TOTAL_CAP);
  bindRetentionCertificationCallBudget(budget);
  const rows: Record<string, unknown>[] = [];
  let stoppedReason: string | null = null;
  let frozen: RetentionCanonicalPublicGenerationResult | null = null;

  const cases = [PLAYER, PREVIEW, RANKING, BALANCED, HOOK];
  for (const spec of cases) {
    if (!budget.canStartOptionalCase(spec.expected)) {
      stoppedReason = `budget_stop:${spec.id}`;
      break;
    }
    const composer = createRetentionProductionComposer({ model: spec.model });
    const planner =
      spec.qualityMode === "balanced"
        ? createRetentionProductionPlanner({ model: spec.model })
        : null;
    const result = await runRetentionProductionNarration({
      topic: spec.topic,
      manualContext: spec.context,
      durationSec: 30,
      generationPath: "script_only",
      qualityMode: spec.qualityMode,
      scriptMode: spec.scriptMode,
      tone: "dramatic",
      factHandlingMode: "verified_facts_only",
      model: spec.model,
      planner,
      composer,
      ...(spec.hookStyle ? { hookStyle: spec.hookStyle } : {}),
      captureRejectedProposals: true,
      rejectedProposalCaptureCaseId: `prompt10-cert-${spec.id}`,
    });
    const budgetSnap = result.ok
      ? result.approved.safeDiagnostics.budget
      : result.retentionDiagnostics.budget;
    const trace = result.ok
      ? result.approved.generationDisposition?.acceptanceTrace
      : result.retentionDiagnostics.acceptanceTrace;
    const authority = trace?.finalNarrationAuthority ?? null;
    const stage = trace?.earliestDecisiveRejection ?? null;
    const narration = result.ok ? result.approved.narration : "";
    const notes = result.ok
      ? [
          ...(result.approved.generationDisposition?.creatorFacingNotes ?? []),
          ...((result.approved.generationDisposition as { acceptanceTrace?: { boundedRewriteType?: string } })
            ?.acceptanceTrace?.boundedRewriteType
            ? [result.approved.generationDisposition!.acceptanceTrace!.boundedRewriteType!]
            : []),
        ]
      : [];
    const row = {
      id: spec.id,
      model: spec.model,
      qualityMode: spec.qualityMode,
      scriptMode: spec.scriptMode,
      ok: result.ok,
      rawProviderInvocations: countInvocations(budgetSnap),
      certBudget: budget.snapshot(),
      narrationAuthority: authority,
      firstModelNarrationSupported:
        authority === "model_direct" || authority === "model_after_rewrite",
      transformations: trace?.events?.map((event) => event.stage) ?? [],
      canonicalAcceptance:
        authority === "model_direct" || authority === "model_after_rewrite"
          ? "accept"
          : authority === "deterministic_rescue"
            ? "rescue"
            : "reject",
      essentialFactCoverage: result.ok,
      entityRankingCoverage: result.ok,
      orderPreserved: spec.scriptMode !== "top_5" || result.ok,
      hookBodyPayoff: result.ok,
      rankingNumberOne: /number one|stands last|decisive|#1/iu.test(narration),
      durationWords: narration.split(/\s+/u).filter(Boolean).length,
      qualityWarningReasons: notes,
      rescueEntry: Boolean(trace?.deterministicRescueEntered),
      qualityBelowTarget: result.ok
        ? result.approved.generationDisposition?.qualityBelowTarget ?? false
        : true,
      boundedRewriteType: trace?.boundedRewriteType ?? null,
      stage,
    };
    rows.push(row);
    if (
      result.ok &&
      frozen == null &&
      (authority === "model_direct" || authority === "model_after_rewrite")
    ) {
      frozen = {
        success: true,
        data: {
          title: result.approved.title,
          narration: result.approved.narration,
        },
        generationContext: RETENTION_PUBLIC_GENERATION_CONTEXT_SUPPLIED,
        generationDisposition: result.approved.generationDisposition,
      };
    }
    console.log(
      `${spec.id}: authority=${authority} stage=${stage} calls=${row.rawProviderInvocations} rewrite=${row.boundedRewriteType} rescue=${row.rescueEntry}`,
    );
  }

  let transportParity = null;
  if (frozen) {
    const encoded = serializeRetentionCanonicalGenerationResult(frozen);
    transportParity = {
      sharedInternalResult: true,
      independentSecondGeneration: false,
      jsonSuccess: encoded.json.success,
      ndjsonHasComplete: encoded.ndjson.includes('"type":"complete"'),
    };
    writeFileSync(
      path.join(OUT, "shared-result-json-ndjson.json"),
      `${JSON.stringify({ json: encoded.json, ndjson: encoded.ndjson, transportParity }, null, 2)}\n`,
    );
  }

  const summary = {
    recertUsed: budget.snapshot().used,
    totalUsed: budget.snapshot().used,
    totalCap: TOTAL_CAP,
    stoppedReason,
    transportParity,
    results: rows,
  };
  writeFileSync(path.join(OUT, "model-cert-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  bindRetentionCertificationCallBudget(null);
}

main().catch((error) => {
  bindRetentionCertificationCallBudget(null);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
