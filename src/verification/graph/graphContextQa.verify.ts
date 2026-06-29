/**
 * Graph Context QA (run: npm run test:graph-context-qa).
 *
 * Live execution loads `.env.local` when present (API_FOOTBALL_KEY).
 * Optional HTTP replay: QA_BASE_URL=http://localhost:3000 npm run test:graph-context-qa
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import { assembledContextToPrompt } from "@/features/intelligence/context/assembled-context-to-prompt";
import { compareContextPromptsForDev } from "@/features/intelligence/context/context-prompt-comparison.dev.utils";
import { graphContextToPromptText } from "@/features/intelligence/context/graph-context-to-prompt";
import type { GraphContext } from "@/features/intelligence/context/graph-context.types";
import type { ScriptMode } from "@/types/footiebitz";

const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
};

const QA_BASE_URL = process.env.QA_BASE_URL?.replace(/\/$/, "") ?? "";
const root = process.cwd();

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

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

interface QaCase {
  id: number;
  topic: string;
  mode: ScriptMode;
  entityPatterns: RegExp[];
  expectRankings?: boolean;
  expectPlayerOrdering?: boolean;
  expectMatchSections?: boolean;
}

const CASES: QaCase[] = [
  {
    id: 1,
    topic: "top 5 highest goal scorers fifa world cup",
    mode: "top_5",
    entityPatterns: [/Klose|Ronaldo|Müller|Fontaine|Messi/i],
    expectRankings: true,
  },
  {
    id: 2,
    topic: "Premier League top scorers 2024",
    mode: "top_5",
    entityPatterns: [/Premier|League|2024|goal|scorer/i],
    expectRankings: true,
  },
  {
    id: 3,
    topic: "Cristiano Ronaldo FIFA World Cup 2026",
    mode: "player_analysis",
    entityPatterns: [/Ronaldo|Cristiano/i],
    expectPlayerOrdering: true,
  },
  {
    id: 4,
    topic: "Barcelona vs Real Madrid tactical analysis",
    mode: "tactical_review",
    entityPatterns: [/Barcelona|Real Madrid/i],
    expectMatchSections: true,
  },
  {
    id: 5,
    topic: "Manchester City vs Arsenal preview",
    mode: "match_preview",
    entityPatterns: [/Manchester City|Arsenal|City/i],
    expectMatchSections: true,
  },
  {
    id: 6,
    topic: "Spain vs Germany recap",
    mode: "match_recap",
    entityPatterns: [/Spain|Germany/i],
    expectMatchSections: true,
  },
];

interface ExecutionOutcome {
  assembledContext: AssembledContext;
  graphContext: GraphContext;
  assembledPrompt: string;
  graphPrompt: string;
}

function primaryEntityText(context: GraphContext): string {
  return [
    ...context.primaryEntities.map((entity) => entity.label),
    ...context.entitySummaries.map((summary) => summary.label),
  ].join("\n");
}

function assertGraphContextBuilt(qaCase: QaCase, outcome: ExecutionOutcome): void {
  const { assembledContext: assembled, graphContext: context } = outcome;

  assert.ok(context, `${qaCase.id}: graphContext missing`);
  assert.equal(context.queryId, assembled.queryId);
  assert.equal(context.topic, assembled.topic);
  assert.equal(context.selectedMode, qaCase.mode);
  assert.equal(context.provenance.source, assembled.provenance.source);
  assert.ok(context.diagnostics.factCount >= 0);
}

function assertPrimaryEntities(qaCase: QaCase, outcome: ExecutionOutcome): void {
  const text = primaryEntityText(outcome.graphContext);
  const promptText = `${text}\n${outcome.graphPrompt}`;

  if (
    outcome.graphContext.primaryEntities.length === 0 &&
    outcome.graphContext.entitySummaries.length === 0 &&
    outcome.assembledContext.entities.length === 0
  ) {
    console.log(`    (${qaCase.id}: no primary entities resolved — topic-level graph only)`);
    return;
  }

  assert.ok(
    outcome.graphContext.primaryEntities.length > 0 ||
      outcome.graphContext.entitySummaries.length > 0,
    `${qaCase.id}: expected primary entities`,
  );

  for (const pattern of qaCase.entityPatterns) {
    assert.match(promptText, pattern, `${qaCase.id}: primary entity pattern ${pattern}`);
  }
}

function assertRankingsOrdered(qaCase: QaCase, outcome: ExecutionOutcome): void {
  const hasAssembledRankings = outcome.assembledContext.rankings.some(
    (ranking) => ranking.entries.length > 0,
  );

  if (!hasAssembledRankings) {
    if (qaCase.expectRankings) {
      console.log(`    (${qaCase.id}: no assembled rankings — provider may be unavailable)`);
    }
    return;
  }

  assert.ok(
    outcome.graphContext.rankedFacts.length > 0,
    `${qaCase.id}: expected rankedFacts when assembled has rankings`,
  );

  const ranks = outcome.graphContext.rankedFacts
    .map((fact) => fact.rank)
    .filter((rank): rank is number => rank != null);

  for (let index = 1; index < ranks.length; index += 1) {
    assert.ok(
      ranks[index]! >= ranks[index - 1]!,
      `${qaCase.id}: rankedFacts out of order at index ${index}`,
    );
  }

  assert.match(outcome.graphPrompt, /RANKED FACTS:/i, `${qaCase.id}: graph prompt missing RANKED FACTS`);
}

function assertPlayerFactsBeforeGeneric(qaCase: QaCase, outcome: ExecutionOutcome): void {
  if (!qaCase.expectPlayerOrdering) {
    return;
  }

  const primaryIndex = outcome.graphPrompt.indexOf("PRIMARY ENTITY:");
  const verifiedIndex = outcome.graphPrompt.indexOf("VERIFIED FACTS:");

  if (primaryIndex >= 0 && verifiedIndex >= 0) {
    assert.ok(
      primaryIndex < verifiedIndex,
      `${qaCase.id}: PRIMARY ENTITY should appear before VERIFIED FACTS`,
    );
    return;
  }

  assert.ok(
    primaryIndex >= 0 || outcome.graphContext.primaryEntities.length > 0,
    `${qaCase.id}: expected player primary entity section`,
  );
}

function assertGroundingAndWarnings(outcome: ExecutionOutcome): void {
  const { assembledContext: assembled, graphContext: context, graphPrompt } = outcome;

  if (assembled.warnings.length > 0) {
    assert.ok(
      context.warnings.length > 0 ||
        context.groundingRules.some((rule) => rule.includes("Grounding constraint:")),
      "expected warnings preserved on graph context",
    );
    assert.match(graphPrompt, /Warnings \(grounding constraints\):|Grounding constraint:/i);
  }

  if (assembled.manualNotes?.trim()) {
    assert.match(graphPrompt, /CREATOR NOTES \(manual/i);
  }

  const assembledPrompt = outcome.assembledPrompt;
  if (/Grounding rules:/i.test(assembledPrompt)) {
    assert.match(graphPrompt, /Grounding rules:/i, "graph prompt should include grounding rules");
  }
}

function assertGraphPromptFactualParity(qaCase: QaCase, outcome: ExecutionOutcome): void {
  const comparison = compareContextPromptsForDev({
    assembledContext: outcome.assembledContext,
    graphContext: outcome.graphContext,
  });

  assert.ok(
    outcome.graphPrompt.length > 0,
    `${qaCase.id}: graph prompt empty`,
  );

  assert.ok(
    comparison.missingCriticalFacts.length === 0,
    `${qaCase.id}: graph prompt missing critical facts: ${comparison.missingCriticalFacts.join("; ")}`,
  );

  if (qaCase.expectRankings && outcome.graphContext.rankedFacts.length > 0) {
    assert.notEqual(
      comparison.rankingPreservation,
      "fail",
      `${qaCase.id}: ranking preservation failed — ${comparison.rankingDetails}`,
    );
  }
}

function assertMatchSectionsWhenAvailable(qaCase: QaCase, outcome: ExecutionOutcome): void {
  if (!qaCase.expectMatchSections) {
    return;
  }

  const { graphContext, graphPrompt } = outcome;
  const hasMatchData =
    graphContext.fixtureFacts.length > 0 ||
    graphContext.statisticFacts.length > 0 ||
    graphContext.timelineFacts.length > 0;

  if (!hasMatchData) {
    console.log(`    (${qaCase.id}: no fixture/stat/event facts from provider)`);
    assert.match(graphPrompt, /Barcelona|Real Madrid|Manchester|Arsenal|Spain|Germany|City/i);
    return;
  }

  assert.ok(
    /FIXTURE:|STATISTICS:|EVENTS:/i.test(graphPrompt),
    `${qaCase.id}: expected match-oriented sections in graph prompt`,
  );
}

async function executeCase(qaCase: QaCase): Promise<ExecutionOutcome> {
  const { executeIntelligenceQuery } = await import(
    "@/features/intelligence/planner/execute-intelligence-query"
  );

  const execution = await executeIntelligenceQuery({
    topic: qaCase.topic,
    selectedMode: qaCase.mode,
    enableResearch: true,
  });

  const assembledPrompt = assembledContextToPrompt(execution.assembledContext);
  assert.ok(execution.graphContext, "expected graphContext from executeIntelligenceQuery");
  const graphPrompt = graphContextToPromptText(execution.graphContext);

  return {
    assembledContext: execution.assembledContext,
    graphContext: execution.graphContext,
    assembledPrompt,
    graphPrompt,
  };
}

async function runQa() {
  console.log("graphContextQa");
  loadEnvLocal();

  await test("GC-0 production script generation uses GraphContext with assembled fallback", () => {
    const scriptResolver = readSrc("src/features/research/utils/script-research-context.utils.ts");
    const serverResolver = readSrc(
      "src/features/research/utils/script-research-context.server.utils.ts",
    );
    const promptResolver = readSrc(
      "src/features/intelligence/context/resolve-research-prompt-text.ts",
    );

    assert.match(scriptResolver, /resolveResearchPromptText/);
    assert.match(scriptResolver, /assembledContextToPrompt/);
    assert.match(promptResolver, /isGraphContextReadyForPrompt/);
    assert.match(serverResolver, /graphContext/);
    assert.match(serverResolver, /formatScriptPromptSourceForDev/);
    assert.match(serverResolver, /Prompt Source:/);
  });

  for (const qaCase of CASES) {
    await test(`GC-${qaCase.id} ${qaCase.topic}`, async () => {
      const outcome = await executeCase(qaCase);

      assertGraphContextBuilt(qaCase, outcome);
      assertPrimaryEntities(qaCase, outcome);
      assertRankingsOrdered(qaCase, outcome);
      assertPlayerFactsBeforeGeneric(qaCase, outcome);
      assertGroundingAndWarnings(outcome);
      assertGraphPromptFactualParity(qaCase, outcome);
      assertMatchSectionsWhenAvailable(qaCase, outcome);

      console.log(
        `    primary=${outcome.graphContext.primaryEntities.length} ranked=${outcome.graphContext.rankedFacts.length} verified=${outcome.graphContext.verifiedFacts.length} assembledLen=${outcome.assembledPrompt.length} graphLen=${outcome.graphPrompt.length}`,
      );
    });
  }

  await test("GC-7 dev API exposes graphContext snapshot in development", async () => {
    if (!QA_BASE_URL) {
      console.log("    (skipped — set QA_BASE_URL=http://localhost:3000 with dev server running)");
      return;
    }

    const response = await fetch(`${QA_BASE_URL}/api/research-football`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "top 5 highest goal scorers fifa world cup",
        mode: "top_5",
      }),
    });
    const payload = (await response.json()) as {
      graphContext?: { queryId: string; sectionCount: number; rankedFactCount: number };
    };

    assert.equal(response.status, 200);
    assert.ok(payload.graphContext, "expected dev graphContext in API response");
    assert.ok(payload.graphContext!.sectionCount > 0);
  });

  console.log("\nGraph Context QA checks passed.");
}

runQa().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
