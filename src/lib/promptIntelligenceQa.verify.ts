/**
 * Prompt Intelligence QA (run: npm run test:prompt-intelligence-qa).
 *
 * Live execution loads `.env.local` when present (API_FOOTBALL_KEY).
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { graphContextToPromptText } from "@/features/intelligence/context/graph-context-to-prompt";
import type { GraphContext } from "@/features/intelligence/context/graph-context.types";
import { buildPromptIntelligence } from "@/features/intelligence/prompts/build-prompt-intelligence";
import { buildNarrativePlan } from "@/features/intelligence/prompts/build-narrative-plan";
import { comparePromptIntelligenceForDev } from "@/features/intelligence/prompts/prompt-intelligence-comparison.dev.utils";
import { promptIntelligenceToPromptText } from "@/features/intelligence/prompts/prompt-intelligence-to-prompt";
import type { ScriptMode } from "@/types/footiebitz";

const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
};

const root = process.cwd();

interface QaCase {
  id: number;
  topic: string;
  mode: ScriptMode;
  expectRankings?: boolean;
  expectSparse?: boolean;
}

const CASES: QaCase[] = [
  {
    id: 1,
    topic: "top 5 highest goal scorers fifa world cup",
    mode: "top_5",
    expectRankings: true,
  },
  {
    id: 2,
    topic: "Premier League top scorers 2024",
    mode: "top_5",
    expectRankings: true,
  },
  {
    id: 3,
    topic: "Cristiano Ronaldo FIFA World Cup 2026",
    mode: "player_analysis",
  },
  {
    id: 4,
    topic: "Barcelona vs Real Madrid tactical analysis",
    mode: "tactical_review",
  },
  {
    id: 5,
    topic: "Manchester City vs Arsenal preview",
    mode: "match_preview",
  },
  {
    id: 6,
    topic: "Spain vs Germany recap",
    mode: "match_recap",
  },
  {
    id: 7,
    topic: "Messi",
    mode: "player_analysis",
    expectSparse: true,
  },
  {
    id: 8,
    topic: "World Cup 2026",
    mode: "historical_explainer",
    expectSparse: true,
  },
  {
    id: 9,
    topic: "El Clasico",
    mode: "match_preview",
    expectSparse: true,
  },
  {
    id: 10,
    topic: "Should Ronaldo start for Portugal in 2026?",
    mode: "opinion_debate",
    expectSparse: true,
  },
];

interface CaseOutcome {
  qaCase: QaCase;
  graphContext: GraphContext;
  graphPrompt: string;
  promptIntelligencePrompt: string;
  comparison: ReturnType<typeof comparePromptIntelligenceForDev>;
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

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
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

function assertPromptBetterOrEqual(outcome: CaseOutcome): string[] {
  const failures: string[] = [];
  const { comparison } = outcome;

  if (
    comparison.requiredFactsTotal > 0 &&
    comparison.requiredFactsCoveredPromptIntelligence <
      comparison.requiredFactsCoveredGraph
  ) {
    failures.push(
      `required fact coverage worse than graph (${comparison.requiredFactsCoveredPromptIntelligence}/${comparison.requiredFactsTotal} vs graph ${comparison.requiredFactsCoveredGraph})`,
    );
  }

  const rankingOrder = (status: string): number => {
    if (status === "pass") return 3;
    if (status === "partial") return 2;
    if (status === "n/a") return 2;
    return 1;
  };

  if (
    rankingOrder(comparison.rankingsPreservedPromptIntelligence) <
    rankingOrder(comparison.rankingsPreservedGraph)
  ) {
    failures.push(
      `ranking preservation worse than graph (${comparison.rankingsPreservedPromptIntelligence} vs ${comparison.rankingsPreservedGraph})`,
    );
  }

  if (
    comparison.forbiddenClaimsTotal > 0 &&
    comparison.forbiddenClaimsIncludedPromptIntelligence <
      comparison.forbiddenClaimsIncludedGraph
  ) {
    failures.push(
      `forbidden claim coverage worse than graph (${comparison.forbiddenClaimsIncludedPromptIntelligence}/${comparison.forbiddenClaimsTotal} vs graph ${comparison.forbiddenClaimsIncludedGraph})`,
    );
  }

  const lengthRatio =
    comparison.graphPromptLength === 0
      ? 1
      : comparison.promptIntelligencePromptLength / comparison.graphPromptLength;

  const coverageAtLeastEqual =
    comparison.requiredFactsCoveredPromptIntelligence >= comparison.requiredFactsCoveredGraph &&
    rankingOrder(comparison.rankingsPreservedPromptIntelligence) >=
      rankingOrder(comparison.rankingsPreservedGraph) &&
    comparison.forbiddenClaimsIncludedPromptIntelligence >=
      comparison.forbiddenClaimsIncludedGraph;

  if (lengthRatio > 1.15 && !coverageAtLeastEqual) {
    failures.push(
      `prompt longer than graph without coverage gains (${comparison.promptIntelligencePromptLength} vs ${comparison.graphPromptLength})`,
    );
  }

  return failures;
}

function verifyCase(outcome: CaseOutcome): string[] {
  const failures: string[] = [];
  const { graphContext, comparison } = outcome;
  const result = buildPromptIntelligence({ graphContext });
  const narrativePlan = buildNarrativePlan({ graphContext });

  if (narrativePlan.beats.length === 0) {
    failures.push("narrative plan has no beats");
  }

  if (result.narrativePlan.beats.length === 0) {
    failures.push("PromptIntelligenceResult missing narrative beats");
  }

  const hasStructuredFacts =
    graphContext.rankedFacts.length > 0 ||
    graphContext.verifiedFacts.some((fact) => fact.type !== "manual_note") ||
    graphContext.fixtureFacts.length > 0 ||
    graphContext.statisticFacts.length > 0 ||
    graphContext.timelineFacts.length > 0;

  if (hasStructuredFacts && narrativePlan.requiredFacts.length === 0) {
    failures.push("structured research present but no required facts mapped");
  }

  if (
    hasStructuredFacts &&
    result.factUsagePlan.beatAssignments.every((assignment) => assignment.factIds.length === 0)
  ) {
    failures.push("structured research present but no facts mapped to beats");
  }

  if (
    outcome.qaCase.expectRankings &&
    graphContext.rankedFacts.length > 0 &&
    comparison.rankingsPreservedPromptIntelligence === "fail"
  ) {
    failures.push(`ranking preservation failed: ${comparison.rankingDetailsPromptIntelligence}`);
  }

  if (narrativePlan.forbiddenClaims.length > 0) {
    if (comparison.forbiddenClaimsIncludedPromptIntelligence === 0) {
      failures.push("forbidden claims missing from prompt intelligence prompt");
    }
  }

  if (result.diagnostics.sparseContext || outcome.qaCase.expectSparse) {
    const sparseLengthLimit = Math.ceil(outcome.graphPrompt.length * 1.1);
    if (
      outcome.promptIntelligencePrompt.length > sparseLengthLimit &&
      graphContext.warnings.length > 0
    ) {
      failures.push(
        `sparse case prompt longer than graph (${outcome.promptIntelligencePrompt.length} > ${sparseLengthLimit})`,
      );
    }
  }

  failures.push(...assertPromptBetterOrEqual(outcome));

  if (outcome.promptIntelligencePrompt.trim().length === 0) {
    failures.push("prompt intelligence prompt is empty");
  }

  if (/\{[\s\S]*"queryId"/.test(outcome.promptIntelligencePrompt)) {
    failures.push("prompt contains raw JSON");
  }

  return failures;
}

async function executeCase(qaCase: QaCase): Promise<CaseOutcome> {
  const { executeIntelligenceQuery } = await import(
    "@/features/intelligence/planner/execute-intelligence-query"
  );

  const execution = await executeIntelligenceQuery({
    topic: qaCase.topic,
    selectedMode: qaCase.mode,
    enableResearch: true,
  });

  assert.ok(execution.graphContext, `${qaCase.id}: graphContext missing`);

  const graphContext = execution.graphContext;
  const graphPrompt = graphContextToPromptText(graphContext);
  const result = buildPromptIntelligence({ graphContext });
  const promptIntelligencePrompt = promptIntelligenceToPromptText({
    result,
    graphContext,
  });
  const comparison = comparePromptIntelligenceForDev({ graphContext });

  const outcome: CaseOutcome = {
    qaCase,
    graphContext,
    graphPrompt,
    promptIntelligencePrompt,
    comparison,
    failures: [],
  };

  outcome.failures = verifyCase(outcome);

  return outcome;
}

async function runQa() {
  console.log("promptIntelligenceQa");
  loadEnvLocal();

  await test("PI-0 production uses Prompt Intelligence via resolveResearchPromptText", () => {
    const resolvePrompt = readSrc(
      "src/features/intelligence/context/resolve-research-prompt-text.ts",
    );

    assert.match(resolvePrompt, /buildPromptIntelligence/);
    assert.match(resolvePrompt, /promptIntelligenceToPromptText/);
    assert.match(resolvePrompt, /graphContextToPromptText/);
    assert.match(resolvePrompt, /prompt-intelligence/);
  });

  const caseErrors: { id: number; topic: string; error: string }[] = [];

  for (const qaCase of CASES) {
    try {
      await test(`PI-${qaCase.id} ${qaCase.topic}`, async () => {
        const outcome = await executeCase(qaCase);

        console.log(
          `    beats=${outcome.comparison.narrativeBeats.length} requiredFacts=${outcome.comparison.requiredFactsTotal} graphLen=${outcome.comparison.graphPromptLength} piLen=${outcome.comparison.promptIntelligencePromptLength} ranking=${outcome.comparison.rankingsPreservedPromptIntelligence} forbidden=${outcome.comparison.forbiddenClaimsIncludedPromptIntelligence}/${outcome.comparison.forbiddenClaimsTotal} recommend=${outcome.comparison.recommendedPromptSource}`,
        );

        assert.equal(
          outcome.failures.length,
          0,
          `${qaCase.topic}: ${outcome.failures.join("; ")}`,
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      caseErrors.push({
        id: qaCase.id,
        topic: qaCase.topic,
        error: message.split("\n")[0] ?? message,
      });
    }
  }

  console.log("\n--- Prompt Intelligence QA Summary ---");
  console.log(`Cases tested: ${CASES.length}`);
  console.log(`Failures: ${caseErrors.length}`);

  if (caseErrors.length > 0) {
    console.log("\nFailed cases:");
    for (const failure of caseErrors) {
      console.log(`  - PI-${failure.id} ${failure.topic}: ${failure.error}`);
    }
    console.log("\nNOT READY");
    process.exit(1);
  }

  console.log("\nREADY to wire Prompt Intelligence into script generation");
}

runQa().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  console.error("\nNOT READY");
  process.exit(1);
});
