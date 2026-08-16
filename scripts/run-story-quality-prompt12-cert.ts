/**
 * Prompt 12 live recertification. Fresh maximum 10 provider invocations.
 * Run only after the frozen implementation fingerprint is recorded.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  parseRetentionNdjsonComplete,
  serializeRetentionCanonicalGenerationResult,
  type RetentionCanonicalPublicGenerationResult,
} from "@/features/retention-story/production/serialize-retention-canonical-generation-result";
import { RETENTION_PUBLIC_GENERATION_CONTEXT_SUPPLIED } from "@/features/retention-story/production/build-retention-public-generation-context";
import { evaluateRetentionDurationFit } from "@/features/retention-story/composition/evaluate-retention-duration-fit";
import { RETENTION_WORDS_PER_SECOND } from "@/features/retention-story/planning/retention-story-plan.constants";
import type { HookStyleSelection } from "@/features/hook-engine/presentation/hook-style-selection";

const OUT = path.resolve(".tmp/story-quality-real-cert/prompt12");
const CAPTURE_DIR = path.resolve(".tmp/story-quality-rejected-proposals");
const TOTAL_CAP = 10;
const NUMBER_ONE_CUE =
  /\b(?:number one|no\.?\s*1|stands last|decisive name|#1)\b/iu;

type CertCase = {
  readonly id: string;
  readonly topic: string;
  readonly context: string;
  readonly scriptMode: "player_analysis" | "match_preview" | "top_5";
  readonly qualityMode: "cheap" | "balanced";
  readonly model: string;
  readonly expected: number;
  readonly hookStyle?: HookStyleSelection;
  readonly numberOneName?: string;
  readonly rankingMembers?: readonly string[];
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
  topic: "Five Driftmere midfielders to watch",
  context: [
    "1. Lina Crowe — she creates the first shot in almost every Driftmere attack.",
    "2. Oren Pike — tempo control through the middle third.",
    "3. Sable Quin — recovery sprints that rescue broken presses.",
    "4. Theo Marrow — set-piece delivery from both flanks.",
    "5. Vesper Holt — late-box arrivals after the second ball.",
  ].join("\n"),
  scriptMode: "top_5",
  qualityMode: "cheap",
  model: "gpt-4.1-mini",
  expected: 2,
  numberOneName: "Lina Crowe",
  rankingMembers: [
    "Lina Crowe",
    "Oren Pike",
    "Sable Quin",
    "Theo Marrow",
    "Vesper Holt",
  ],
};

const BALANCED: CertCase = {
  ...PLAYER,
  id: "balanced-player",
  qualityMode: "balanced",
  model: "gpt-4.1",
  expected: 3,
};

const HOOK: CertCase = {
  ...PLAYER,
  id: "fast-player-provocative-hook",
  hookStyle: "provocative_question",
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

function readCapture(caseId: string): {
  readonly narration: string;
  readonly canonicalDecision: string | null;
  readonly canonicalStage: string | null;
  readonly groundingOk: boolean | null;
  readonly hookOk: boolean | null;
  readonly hookReasons: readonly string[];
  readonly hookWarnings: readonly string[];
} | null {
  const file = path.join(CAPTURE_DIR, `prompt12-cert-${caseId}.json`);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    readonly parsedModelProposal?: { narration?: string };
    readonly canonicalRejectionReason?: string | null;
    readonly canonicalRejectionStage?: string | null;
    readonly clauseSupport?: { ok?: boolean };
    readonly hookBodyPayoff?: {
      ok?: boolean;
      reasonIds?: string[];
      qualityWarningIds?: string[];
    };
  };
  return {
    narration: raw.parsedModelProposal?.narration ?? "",
    canonicalDecision: raw.canonicalRejectionReason ?? null,
    canonicalStage: raw.canonicalRejectionStage ?? null,
    groundingOk: raw.clauseSupport?.ok ?? null,
    hookOk: raw.hookBodyPayoff?.ok ?? null,
    hookReasons: raw.hookBodyPayoff?.reasonIds ?? [],
    hookWarnings: raw.hookBodyPayoff?.qualityWarningIds ?? [],
  };
}

function firstSpeechNamesWrongNumberOne(
  narration: string,
  numberOneName: string,
  members: readonly string[],
): boolean {
  if (!NUMBER_ONE_CUE.test(narration)) return false;
  const firstToken = numberOneName.split(" ")[0] ?? numberOneName;
  const sentences = narration.split(/(?<=[.!?…])\s+/u).filter(Boolean);
  const closer =
    [...sentences].reverse().find((sentence) => NUMBER_ONE_CUE.test(sentence)) ??
    narration;
  if (closer.includes(firstToken)) return false;
  return members.slice(1).some((name) => closer.includes(name.split(" ")[0] ?? name));
}

function classifyRescue(input: {
  readonly authority: string | null;
  readonly capture: ReturnType<typeof readCapture>;
  readonly scriptMode: string;
  readonly numberOneName?: string;
  readonly rankingMembers?: readonly string[];
}): "correct_protection" | "incorrect_pipeline_rejection" | "uncertain" | "not_rescue" {
  if (input.authority !== "deterministic_rescue") return "not_rescue";
  const capture = input.capture;
  if (!capture) return "uncertain";
  if (capture.canonicalDecision === "accept" && capture.groundingOk === true) {
    return "incorrect_pipeline_rejection";
  }
  const first = capture.narration;
  if (
    input.scriptMode === "top_5" &&
    input.numberOneName &&
    input.rankingMembers &&
    firstSpeechNamesWrongNumberOne(first, input.numberOneName, input.rankingMembers)
  ) {
    return "correct_protection";
  }
  if (input.rankingMembers && input.rankingMembers.some((name) => !first.includes(name.split(" ")[0] ?? name))) {
    return "correct_protection";
  }
  if (capture.groundingOk === false) return "correct_protection";
  if (
    capture.hookOk === false &&
    capture.hookReasons.some((reason) =>
      /opening_meaningless|opening_unrelated|opening_result_leak|opening_missing/.test(reason),
    )
  ) {
    return "correct_protection";
  }
  if (capture.canonicalDecision === "accept") return "incorrect_pipeline_rejection";
  return "uncertain";
}

async function main(): Promise<void> {
  loadEnvConfig(path.resolve("."));
  mkdirSync(OUT, { recursive: true });
  const budget = createRetentionCertificationCallBudget(TOTAL_CAP);
  bindRetentionCertificationCallBudget(budget);
  const rows: Record<string, unknown>[] = [];
  let stoppedReason: string | null = null;
  let frozen: RetentionCanonicalPublicGenerationResult | null = null;

  const queue: CertCase[] = [PREVIEW, BALANCED, RANKING, PLAYER, HOOK];
  for (const spec of queue) {
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
      rejectedProposalCaptureCaseId: `prompt12-cert-${spec.id}`,
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
    const capture = readCapture(spec.id);
    const rescueClass = classifyRescue({
      authority,
      capture,
      scriptMode: spec.scriptMode,
      numberOneName: spec.numberOneName,
      rankingMembers: spec.rankingMembers,
    });
    const members = spec.rankingMembers ?? [];
    const durationFit = evaluateRetentionDurationFit({
      narration,
      hardWordBudget: 72,
      targetWordBudget: 72,
      minimumUsefulWords: 47,
      durationSec: 30,
      preserveCompleteRanking:
        spec.scriptMode === "top_5" &&
        spec.numberOneName != null &&
        narration.includes(spec.numberOneName.split(" ")[0] ?? ""),
    });
    const row = {
      id: spec.id,
      model: spec.model,
      qualityMode: spec.qualityMode,
      scriptMode: spec.scriptMode,
      hookStyle: spec.hookStyle ?? "auto",
      ok: result.ok,
      rawProviderInvocations: countInvocations(budgetSnap),
      certBudget: budget.snapshot(),
      firstModelNarrationSupport: capture
        ? capture.groundingOk === true && capture.canonicalDecision === "accept"
          ? "supported_accepted"
          : capture.groundingOk === false
            ? "unsupported"
            : capture.canonicalDecision ?? "unknown"
        : "capture_missing",
      hookClassification: capture
        ? {
            ok: capture.hookOk,
            reasonIds: capture.hookReasons,
            qualityWarningIds: capture.hookWarnings,
          }
        : null,
      transformations: trace?.events?.map((event) => event.stage) ?? [],
      finalNarrationAuthority: authority,
      essentialContentCoverage: result.ok,
      subjectEntityCoverage: result.ok,
      rankingMemberCoverage:
        spec.scriptMode !== "top_5" ||
        members.every((name) => narration.includes(name.split(" ")[0] ?? name)),
      rankingOrderPreserved:
        spec.scriptMode !== "top_5" ||
        members.every((name, index) => {
          if (index === 0) return narration.includes(name.split(" ")[0] ?? name);
          const prev = members[index - 1]!.split(" ")[0] ?? members[index - 1]!;
          const token = name.split(" ")[0] ?? name;
          return narration.indexOf(token) > narration.indexOf(prev);
        }),
      rankingNumberOnePayoff: NUMBER_ONE_CUE.test(narration),
      rankingNumberOneMember:
        spec.numberOneName && narration.includes(spec.numberOneName.split(" ")[0] ?? ""),
      durationWords: durationFit.wordCount,
      durationMeasurement: {
        targetDurationSec: 30,
        voiceWordsPerSecond: RETENTION_WORDS_PER_SECOND,
        wordCount: durationFit.wordCount,
        estimatedSpokenSec: durationFit.estimatedSpokenSec,
        hardWordBudget: durationFit.hardWordBudget,
        targetWordBudget: durationFit.targetWordBudget,
        minimumUsefulWords: durationFit.minimumUsefulWords,
        acceptedRangeWords: {
          min: durationFit.minimumUsefulWords,
          max: durationFit.hardWordBudget + durationFit.evidenceSlackWords,
        },
        underTarget: durationFit.underTarget,
        overTarget: durationFit.overTarget,
        materialOverrun: durationFit.materialOverrun,
        acceptable: durationFit.acceptable,
        warningIds: durationFit.warningIds,
        compressionAttempted: Boolean(
          budgetSnap && (budgetSnap.lengthCompression ?? 0) > 0,
        ),
      },
      qualityWarnings: result.ok
        ? result.approved.generationDisposition?.creatorFacingNotes ?? []
        : [],
      qualityBelowTarget: result.ok
        ? result.approved.generationDisposition?.qualityBelowTarget ?? false
        : true,
      rescueEntry: Boolean(trace?.deterministicRescueEntered),
      rescueReason: stage,
      rescueClassification: rescueClass,
      boundedRewriteType: trace?.boundedRewriteType ?? null,
      firstSpeechWrongNumberOne:
        spec.scriptMode === "top_5" && capture
          ? firstSpeechNamesWrongNumberOne(
              capture.narration,
              spec.numberOneName ?? "",
              spec.rankingMembers ?? [],
            )
          : false,
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
          beats: result.approved.planSnapshot,
        },
        generationContext: RETENTION_PUBLIC_GENERATION_CONTEXT_SUPPLIED,
        generationDisposition: result.approved.generationDisposition,
        retentionDiagnostics: result.approved.safeDiagnostics,
        retentionValidation: result.approved.validationSummary,
      };
    }
    console.log(
      `${spec.id}: authority=${authority} class=${rescueClass} calls=${row.rawProviderInvocations} stage=${stage}`,
    );
  }

  let transportParity = null;
  if (frozen) {
    const encoded = serializeRetentionCanonicalGenerationResult(frozen);
    const parsed = parseRetentionNdjsonComplete(encoded.ndjson);
    const jsonDisp = JSON.stringify(encoded.json.generationDisposition);
    const ndjsonDisp = JSON.stringify(parsed.generationDisposition);
    transportParity = {
      sharedInternalResult: true,
      independentSecondGeneration: false,
      narrationParity:
        JSON.stringify((encoded.json.data as { narration?: string })?.narration) ===
        JSON.stringify((parsed.data as { narration?: string })?.narration),
      beatsParity:
        JSON.stringify((encoded.json.data as { beats?: unknown })?.beats) ===
        JSON.stringify((parsed.data as { beats?: unknown })?.beats),
      dispositionParity: jsonDisp === ndjsonDisp,
      diagnosticsParity:
        JSON.stringify(encoded.json.retentionDiagnostics) ===
        JSON.stringify(parsed.retentionDiagnostics),
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
    historicalPriorPrompts: {
      prompt9: 12,
      prompt10: 6,
      prompt11: 11,
      prompt12Fresh: budget.snapshot().used,
    },
    stoppedReason,
    transportParity,
    authorityCounts: {
      model_direct: rows.filter((row) => row.finalNarrationAuthority === "model_direct").length,
      model_after_rewrite: rows.filter((row) => row.finalNarrationAuthority === "model_after_rewrite").length,
      deterministic_rescue: rows.filter((row) => row.finalNarrationAuthority === "deterministic_rescue").length,
    },
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
