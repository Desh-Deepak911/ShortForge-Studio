/**
 * Prompt Intelligence Production QA (run: npm run test:prompt-intelligence-production-qa).
 *
 * Validates live production prompt path across every script mode.
 * Loads `.env.local` when present (API_FOOTBALL_KEY).
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { graphContextToPromptText } from "@/features/intelligence/context/graph-context-to-prompt";
import type { GraphContext } from "@/features/intelligence/context/graph-context.types";
import {
  isGraphContextReadyForPrompt,
  resolveResearchPromptText,
} from "@/features/intelligence/context/resolve-research-prompt-text";
import { buildPromptIntelligence } from "@/features/intelligence/prompts/build-prompt-intelligence";
import { comparePromptIntelligenceForDev } from "@/features/intelligence/prompts/prompt-intelligence-comparison.dev.utils";
import {
  isSparseOpinionGraphContext,
  resolvePromptCompressionLevel,
} from "@/features/intelligence/prompts/graph-context-sparse.utils";
import { applyAssembledResearchContext } from "@/features/research/utils/script-research-context.utils";
import { getNarrationWordBudget } from "@/features/story/utils/narration-duration-budget.utils";
import type { ScriptMode } from "@/types/footiebitz";

const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
};

const root = process.cwd();
const DEFAULT_TARGET_DURATION_SECONDS = 30;

interface ProductionQaCase {
  label: string;
  mode: ScriptMode;
  topic: string;
  entityPatterns: RegExp[];
  expectRankings?: boolean;
}

const CASES: ProductionQaCase[] = [
  {
    label: "Top 5",
    mode: "top_5",
    topic: "top 5 highest goal scorers fifa world cup",
    entityPatterns: [/Klose|Ronaldo|Müller|Fontaine|Messi/i],
    expectRankings: true,
  },
  {
    label: "Player Analysis",
    mode: "player_analysis",
    topic: "Cristiano Ronaldo FIFA World Cup 2026",
    entityPatterns: [/Ronaldo|Cristiano/i],
  },
  {
    label: "Preview",
    mode: "match_preview",
    topic: "Manchester City vs Arsenal preview",
    entityPatterns: [/Manchester City|Arsenal|City/i],
  },
  {
    label: "Recap",
    mode: "match_recap",
    topic: "Spain vs Germany recap",
    entityPatterns: [/Spain|Germany/i],
  },
  {
    label: "Tactical",
    mode: "tactical_review",
    topic: "Barcelona vs Real Madrid tactical analysis",
    entityPatterns: [/Barcelona|Real Madrid/i],
  },
  {
    label: "Opinion",
    mode: "opinion_debate",
    topic: "Should Ronaldo start for Portugal in 2026?",
    entityPatterns: [/Ronaldo|Portugal/i],
  },
  {
    label: "Story",
    mode: "story",
    topic: "Liverpool comeback against Barcelona 2019",
    entityPatterns: [/Liverpool|Barcelona|2019/i],
  },
  {
    label: "Explainer",
    mode: "historical_explainer",
    topic: "How England won the 1966 World Cup",
    entityPatterns: [/England|1966|World Cup/i],
  },
];

interface CaseOutcome {
  qaCase: ProductionQaCase;
  graphContext?: GraphContext;
  promptSource: "prompt-intelligence" | "graph" | "assembled";
  productionContext: string;
  resolvedPromptText: string;
  graphPrompt: string;
  comparison: ReturnType<typeof comparePromptIntelligenceForDev>;
  compression: ReturnType<typeof resolvePromptCompressionLevel>;
  failures: string[];
}

function loadEnvLocal(): void {
  try {
    const contents = readFileSync(join(root, ".env.local"), "utf8");
    for (const line of contents.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(
    () => console.log(`  ✓ ${name}`),
    (error) => {
      console.error(`  ✗ ${name}`);
      throw error;
    },
  );
}

function assertPromptIntelligenceUsed(
  promptSource: CaseOutcome["promptSource"],
): string[] {
  if (promptSource !== "prompt-intelligence") {
    return [`fallback triggered (${promptSource}) — expected Prompt Intelligence`];
  }

  return [];
}

function assertNarrativePlanRespected(
  graphContext: GraphContext,
  productionContext: string,
  compression: ReturnType<typeof resolvePromptCompressionLevel>,
): string[] {
  const failures: string[] = [];
  const result = buildPromptIntelligence({ graphContext });

  if (result.narrativePlan.beats.length === 0) {
    failures.push("narrative plan has no beats");
    return failures;
  }

  if (compression === "full") {
    if (!/NARRATIVE PLAN/i.test(productionContext)) {
      failures.push("NARRATIVE PLAN section missing from production prompt");
    }

    const structureLabel = result.narrativePlan.structureLabel;
    if (!productionContext.includes(structureLabel)) {
      failures.push(`narrative structure "${structureLabel}" missing from prompt`);
    }

    const missingBeat = result.narrativePlan.beats.find(
      (beat) => !productionContext.includes(beat.label),
    );
    if (missingBeat) {
      failures.push(`narrative beat "${missingBeat.label}" missing from prompt`);
    }
  }

  return failures;
}

function assertWordBudgetRespected(graphContext: GraphContext): string[] {
  const failures: string[] = [];
  const result = buildPromptIntelligence({
    graphContext,
    targetDurationSeconds: DEFAULT_TARGET_DURATION_SECONDS,
  });
  const budget = getNarrationWordBudget(DEFAULT_TARGET_DURATION_SECONDS);
  const beatWordTotal = result.narrativePlan.beats.reduce(
    (total, beat) => total + beat.targetWordCount,
    0,
  );

  if (beatWordTotal > budget.hardCapWords) {
    failures.push(
      `beat word budget exceeds hard cap (${beatWordTotal} > ${budget.hardCapWords})`,
    );
  }

  const totalRule = result.lengthRules.find((rule) => rule.id === "total-budget");
  if (totalRule?.maxWordCount && beatWordTotal > totalRule.maxWordCount * 1.05) {
    failures.push(
      `beat allocations exceed total budget max (${beatWordTotal} > ${totalRule.maxWordCount})`,
    );
  }

  const compression = resolvePromptCompressionLevel(graphContext);
  if (compression === "full") {
    const productionContext = resolveResearchPromptText({
      assembled: {
        queryId: graphContext.queryId,
        topic: graphContext.topic,
        selectedMode: graphContext.selectedMode,
        verifiedFacts: [],
        rankings: [],
        fixtures: [],
        statistics: [],
        events: [],
        lineups: [],
        warnings: graphContext.warnings,
        confidence: graphContext.confidence,
        provenance: graphContext.provenance,
      },
      graphContext,
    }).promptText;

    if (!/LENGTH BUDGET/i.test(productionContext)) {
      failures.push("LENGTH BUDGET section missing from full production prompt");
    }

    if (
      totalRule?.targetWordCount &&
      !productionContext.includes(String(totalRule.targetWordCount))
    ) {
      failures.push("target word count missing from LENGTH BUDGET section");
    }
  }

  return failures;
}

function assertGroundingPreserved(
  graphContext: GraphContext,
  productionContext: string,
): string[] {
  const failures: string[] = [];

  if (graphContext.groundingRules.length > 0) {
    if (!/Grounding rules:|GROUNDING/i.test(productionContext)) {
      failures.push("grounding section missing from production prompt");
    }
  }

  if (graphContext.warnings.length > 0) {
    if (!/Warnings \(grounding constraints\):|WARNINGS/i.test(productionContext)) {
      failures.push("warnings section missing from production prompt");
    }
  }

  return failures;
}

function assertOpinionConcise(
  graphContext: GraphContext,
  resolvedPromptText: string,
): string[] {
  if (graphContext.selectedMode !== "opinion_debate") {
    return [];
  }

  const graphPrompt = graphContextToPromptText(graphContext);
  const limit = Math.ceil(graphPrompt.length * 1.05);

  if (resolvedPromptText.length > limit) {
    return [
      `opinion prompt not concise (${resolvedPromptText.length} > ${limit} vs graph ${graphPrompt.length})`,
    ];
  }

  if (isSparseOpinionGraphContext(graphContext) && /LENGTH BUDGET|STYLE|NARRATIVE PLAN/i.test(resolvedPromptText)) {
    return ["sparse opinion prompt includes verbose PI blocks"];
  }

  return [];
}

function verifyCase(outcome: CaseOutcome): string[] {
  const failures: string[] = [];
  const { graphContext, productionContext, comparison, compression } = outcome;

  if (!graphContext) {
    failures.push("graphContext missing");
    return failures;
  }

  failures.push(...assertPromptIntelligenceUsed(outcome.promptSource));
  failures.push(...assertNarrativePlanRespected(graphContext, productionContext, compression));
  failures.push(...assertWordBudgetRespected(graphContext));
  failures.push(...assertGroundingPreserved(graphContext, productionContext));
  failures.push(...assertOpinionConcise(graphContext, outcome.resolvedPromptText));

  if (
    outcome.qaCase.expectRankings &&
    graphContext.rankedFacts.length > 0 &&
    comparison.rankingsPreservedPromptIntelligence === "fail"
  ) {
    failures.push(
      `rankings not preserved: ${comparison.rankingDetailsPromptIntelligence}`,
    );
  }

  if (comparison.forbiddenClaimsTotal > 0 && comparison.forbiddenClaimsIncludedPromptIntelligence === 0) {
    failures.push("forbidden claims missing from production prompt");
  }

  if (productionContext.trim().length === 0) {
    failures.push("production prompt is empty");
  }

  for (const pattern of outcome.qaCase.entityPatterns) {
    if (!pattern.test(productionContext)) {
      failures.push(`entity pattern missing: ${pattern}`);
    }
  }

  return failures;
}

async function executeCase(qaCase: ProductionQaCase): Promise<CaseOutcome> {
  const { executeIntelligenceQuery } = await import(
    "@/features/intelligence/planner/execute-intelligence-query"
  );

  const execution = await executeIntelligenceQuery({
    topic: qaCase.topic,
    selectedMode: qaCase.mode,
    enableResearch: true,
  });

  assert.ok(execution.graphContext, `${qaCase.label}: graphContext missing`);
  assert.ok(
    isGraphContextReadyForPrompt(execution.graphContext, execution.assembledContext),
    `${qaCase.label}: graphContext not ready for production prompt`,
  );

  const graphContext = execution.graphContext;
  const production = applyAssembledResearchContext({
    scriptMode: qaCase.mode,
    assembled: execution.assembledContext,
    graphContext,
  });

  const graphPrompt = graphContextToPromptText(graphContext);
  const comparison = comparePromptIntelligenceForDev({ graphContext });
  const compression = resolvePromptCompressionLevel(graphContext);

  const resolved = resolveResearchPromptText({
    assembled: execution.assembledContext,
    graphContext,
  });

  const outcome: CaseOutcome = {
    qaCase,
    graphContext,
    promptSource: production.promptSource ?? "assembled",
    productionContext: production.context ?? "",
    resolvedPromptText: resolved.promptText,
    graphPrompt,
    comparison,
    compression,
    failures: [],
  };

  outcome.failures = verifyCase(outcome);

  return outcome;
}

async function runQa() {
  console.log("promptIntelligenceProductionQa");
  loadEnvLocal();

  const caseErrors: { label: string; error: string }[] = [];
  let promptIntelligenceCount = 0;
  let fallbackCount = 0;

  for (const qaCase of CASES) {
    try {
      await test(`${qaCase.label} (${qaCase.mode})`, async () => {
        const outcome = await executeCase(qaCase);

        if (outcome.promptSource === "prompt-intelligence") {
          promptIntelligenceCount += 1;
        } else {
          fallbackCount += 1;
        }

        console.log(
          `    source=${outcome.promptSource} compression=${outcome.compression} len=${outcome.productionContext.length} beats=${outcome.comparison.narrativeBeats.length} ranking=${outcome.comparison.rankingsPreservedPromptIntelligence} forbidden=${outcome.comparison.forbiddenClaimsIncludedPromptIntelligence}/${outcome.comparison.forbiddenClaimsTotal}`,
        );

        assert.equal(
          outcome.failures.length,
          0,
          `${qaCase.label}: ${outcome.failures.join("; ")}`,
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      caseErrors.push({
        label: qaCase.label,
        error: message.split("\n")[0] ?? message,
      });
    }
  }

  console.log("\n--- Prompt Intelligence Production QA Summary ---");
  console.log(`Modes tested: ${CASES.length}`);
  console.log(`Prompt Intelligence used: ${promptIntelligenceCount}/${CASES.length}`);
  console.log(`Fallback triggered: ${fallbackCount}/${CASES.length}`);
  console.log(`Failures: ${caseErrors.length}`);

  if (caseErrors.length > 0) {
    console.log("\nFailed cases:");
    for (const failure of caseErrors) {
      console.log(`  - ${failure.label}: ${failure.error}`);
    }
    console.log("\nROLL BACK");
    process.exit(1);
  }

  console.log("\nPRODUCTION READY");
}

runQa().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  console.error("\nROLL BACK");
  process.exit(1);
});
