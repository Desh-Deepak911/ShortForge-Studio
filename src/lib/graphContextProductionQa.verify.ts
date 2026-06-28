/**
 * GraphContext Production QA (run: npm run test:graph-context-production-qa).
 *
 * Validates production script prompt path across all script modes.
 * Loads `.env.local` when present (API_FOOTBALL_KEY).
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import { assembledContextToPrompt } from "@/features/intelligence/context/assembled-context-to-prompt";
import { compareContextPromptsForDev } from "@/features/intelligence/context/context-prompt-comparison.dev.utils";
import {
  formatScriptPromptSourceForDev,
  isGraphContextReadyForPrompt,
  resolveResearchPromptText,
} from "@/features/intelligence/context/resolve-research-prompt-text";
import type { GraphContext } from "@/features/intelligence/context/graph-context.types";
import { applyAssembledResearchContext } from "@/features/research/utils/script-research-context.utils";
import type { ScriptMode } from "@/types/footiebitz";

const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
};

const root = process.cwd();

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
    topic: "Is Erling Haaland better than Kylian Mbappe?",
    entityPatterns: [/Haaland|Mbappe|Mbappé/i],
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
  label: string;
  mode: ScriptMode;
  topic: string;
  graphContext?: GraphContext;
  assembledContext: AssembledContext;
  assembledPrompt: string;
  graphPrompt: string;
  productionPromptSource: "prompt-intelligence" | "graph" | "assembled";
  productionContext?: string;
  productionResearchApplied: boolean;
  productionTop5Ranked: boolean;
  baselineResearchApplied: boolean;
  baselineTop5Ranked: boolean;
  comparison: ReturnType<typeof compareContextPromptsForDev>;
  unexpectedFallback: boolean;
  graphReady: boolean;
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

function assertGroundingPreserved(input: {
  assembledPrompt: string;
  productionContext: string;
  assembled: AssembledContext;
}): string[] {
  const failures: string[] = [];
  const { assembledPrompt, productionContext, assembled } = input;

  if (/Grounding rules:/i.test(assembledPrompt)) {
    if (!/Grounding rules:/i.test(productionContext)) {
      failures.push("grounding rules missing from production prompt");
    }
  }

  if (assembled.warnings.length > 0) {
    if (!/Warnings \(grounding constraints\):|Grounding constraint:/i.test(productionContext)) {
      failures.push("warnings/grounding constraints missing from production prompt");
    }
  }

  return failures;
}

function assertScriptQualityParity(input: {
  qaCase: ProductionQaCase;
  productionContext?: string;
  productionResearchApplied: boolean;
  productionTop5Ranked: boolean;
  baselineResearchApplied: boolean;
  baselineTop5Ranked: boolean;
  comparison: ReturnType<typeof compareContextPromptsForDev>;
}): string[] {
  const failures: string[] = [];
  const context = input.productionContext ?? "";

  if (input.productionResearchApplied !== input.baselineResearchApplied) {
    failures.push(
      `researchApplied changed (${input.baselineResearchApplied} → ${input.productionResearchApplied})`,
    );
  }

  if (input.qaCase.mode === "top_5" && input.productionTop5Ranked !== input.baselineTop5Ranked) {
    failures.push(
      `top5RankedDataAvailable changed (${input.baselineTop5Ranked} → ${input.productionTop5Ranked})`,
    );
  }

  if (input.comparison.missingCriticalFacts.length > 0) {
    failures.push(
      `missing critical facts: ${input.comparison.missingCriticalFacts.join("; ")}`,
    );
  }

  for (const pattern of input.qaCase.entityPatterns) {
    if (!pattern.test(context)) {
      failures.push(`entity pattern missing from production context: ${pattern}`);
    }
  }

  if (input.productionResearchApplied && context.trim().length < 80) {
    failures.push("production context too short when research applied");
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

  const assembledPrompt = assembledContextToPrompt(execution.assembledContext);
  const graphReady = isGraphContextReadyForPrompt(
    execution.graphContext,
    execution.assembledContext,
  );
  const resolvedPrompt = resolveResearchPromptText({
    assembled: execution.assembledContext,
    graphContext: execution.graphContext,
  });
  const graphPrompt = execution.graphContext
    ? resolvedPrompt.promptText
    : assembledPrompt;

  const production = applyAssembledResearchContext({
    scriptMode: qaCase.mode,
    assembled: execution.assembledContext,
    graphContext: execution.graphContext,
  });

  const baseline = applyAssembledResearchContext({
    scriptMode: qaCase.mode,
    assembled: execution.assembledContext,
  });

  const comparison = execution.graphContext
    ? compareContextPromptsForDev({
        assembledContext: execution.assembledContext,
        graphContext: execution.graphContext,
      })
    : {
        assembledPromptLength: assembledPrompt.length,
        graphPromptLength: 0,
        rankingPreservation: "n/a" as const,
        rankingDetails: "GraphContext unavailable",
        primaryEntitiesPresent: false,
        primaryEntityLabels: [],
        warningsPresent: false,
        warningCount: 0,
        missingCriticalFacts: [],
        recommendedPromptSource: "assembled" as const,
        recommendationReason: "GraphContext unavailable",
        productionPromptSource: "assembled" as const,
        productionPromptSourceLabel: "AssembledContext (fallback)",
      };

  const failures: string[] = [];

  if (graphReady && production.promptSource === "assembled") {
    failures.push("GraphContext ready but production used assembled fallback");
  }

  if (
    graphReady &&
    production.promptSource !== "prompt-intelligence" &&
    production.promptSource !== "graph"
  ) {
    failures.push("GraphContext ready but production did not use graph-derived prompt");
  }

  if (
    qaCase.expectRankings &&
    execution.assembledContext.rankings.some((ranking) => ranking.entries.length > 0) &&
    comparison.rankingPreservation === "fail"
  ) {
    failures.push(`ranking order not preserved: ${comparison.rankingDetails}`);
  }

  failures.push(
    ...assertGroundingPreserved({
      assembledPrompt,
      productionContext: production.context ?? "",
      assembled: execution.assembledContext,
    }),
  );

  failures.push(
    ...assertScriptQualityParity({
      qaCase,
      productionContext: production.context,
      productionResearchApplied: production.researchApplied,
      productionTop5Ranked: production.top5RankedDataAvailable ?? false,
      baselineResearchApplied: baseline.researchApplied,
      baselineTop5Ranked: baseline.top5RankedDataAvailable ?? false,
      comparison,
    }),
  );

  const unexpectedFallback =
    graphReady && production.promptSource === "assembled";

  return {
    label: qaCase.label,
    mode: qaCase.mode,
    topic: qaCase.topic,
    graphContext: execution.graphContext,
    assembledContext: execution.assembledContext,
    assembledPrompt,
    graphPrompt,
    productionPromptSource: production.promptSource ?? "assembled",
    productionContext: production.context,
    productionResearchApplied: production.researchApplied,
    productionTop5Ranked: production.top5RankedDataAvailable ?? false,
    baselineResearchApplied: baseline.researchApplied,
    baselineTop5Ranked: baseline.top5RankedDataAvailable ?? false,
    comparison,
    unexpectedFallback,
    graphReady,
    failures,
  };
}

function formatOutcomeLine(outcome: CaseOutcome): string {
  const source = formatScriptPromptSourceForDev(outcome.productionPromptSource);
  const lengthDelta = outcome.graphPrompt.length - outcome.assembledPrompt.length;
  const lengthNote =
    lengthDelta <= 0
      ? `shorter by ${Math.abs(lengthDelta)}`
      : `longer by ${lengthDelta}`;

  return [
    `    source=${source}`,
    `graphReady=${outcome.graphReady}`,
    `assembledLen=${outcome.assembledPrompt.length}`,
    `graphLen=${outcome.graphPrompt.length}`,
    `(${lengthNote})`,
    `ranking=${outcome.comparison.rankingPreservation}`,
    `researchApplied=${outcome.productionResearchApplied}`,
    `failures=${outcome.failures.length}`,
  ].join(" | ");
}

async function runQa() {
  console.log("graphContextProductionQa");
  loadEnvLocal();

  const outcomes: CaseOutcome[] = [];
  const caseErrors: { label: string; error: string }[] = [];

  for (const qaCase of CASES) {
    try {
      await test(`${qaCase.label} (${qaCase.mode})`, async () => {
        const outcome = await executeCase(qaCase);
        outcomes.push(outcome);

        console.log(formatOutcomeLine(outcome));

        assert.ok(
          outcome.productionPromptSource === "prompt-intelligence" ||
            outcome.productionPromptSource === "graph",
          `${qaCase.label}: expected Prompt Intelligence or GraphContext fallback`,
        );
        assert.equal(
          outcome.unexpectedFallback,
          false,
          `${qaCase.label}: unexpected assembled fallback`,
        );
        assert.equal(
          outcome.failures.length,
          0,
          `${qaCase.label}: ${outcome.failures.join("; ")}`,
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      caseErrors.push({ label: qaCase.label, error: message.split("\n")[0] ?? message });
    }
  }

  const promptIntelligenceCount = outcomes.filter(
    (outcome) => outcome.productionPromptSource === "prompt-intelligence",
  ).length;
  const graphFallbackCount = outcomes.filter(
    (outcome) => outcome.productionPromptSource === "graph",
  ).length;
  const assembledFallbackCount = outcomes.filter(
    (outcome) => outcome.productionPromptSource === "assembled",
  ).length;
  const shorterOrEqualCount = outcomes.filter(
    (outcome) => outcome.graphPrompt.length <= outcome.assembledPrompt.length,
  ).length;

  console.log("\n--- Production QA Summary ---");
  console.log(`Modes tested: ${CASES.length}`);
  console.log(`Cases executed: ${outcomes.length}`);
  console.log(`Prompt Intelligence used: ${promptIntelligenceCount}/${outcomes.length}`);
  console.log(`GraphContext fallback: ${graphFallbackCount}/${outcomes.length}`);
  console.log(`Assembled fallback: ${assembledFallbackCount}/${outcomes.length}`);
  console.log(`Prompt shorter or equal: ${shorterOrEqualCount}/${outcomes.length}`);

  if (caseErrors.length > 0) {
    console.log("\nFailures:");
    for (const failure of caseErrors) {
      console.log(`  - ${failure.label}: ${failure.error}`);
    }
    console.log("\nROLL BACK");
    process.exit(1);
  }

  console.log("\nPRODUCTION READY");
}

runQa().catch((error) => {
  console.error("\n--- Production QA Summary ---");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  console.error("\nROLL BACK");
  process.exit(1);
});
