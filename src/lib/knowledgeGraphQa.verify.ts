/**
 * Knowledge Graph QA (run: npm run test:knowledge-graph-qa).
 *
 * Live execution loads `.env.local` when present (API_FOOTBALL_KEY).
 * Optional HTTP replay: QA_BASE_URL=http://localhost:3000 npm run test:knowledge-graph-qa
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import { assembledContextToPrompt } from "@/features/intelligence/context/assembled-context-to-prompt";
import type { KnowledgeGraph } from "@/features/intelligence/knowledge/knowledge-graph.types";
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
  labelPatterns: RegExp[];
  expectRankings?: boolean;
  expectFixturesOrMatch?: boolean;
}

const CASES: QaCase[] = [
  {
    id: 1,
    topic: "top 5 highest goal scorers fifa world cup",
    mode: "top_5",
    labelPatterns: [/Klose|Ronaldo|Müller|Fontaine|Messi/i],
    expectRankings: true,
  },
  {
    id: 2,
    topic: "Premier League top scorers 2024",
    mode: "top_5",
    labelPatterns: [/Premier|League|2024|goal|scorer/i],
    expectRankings: true,
  },
  {
    id: 3,
    topic: "Cristiano Ronaldo FIFA World Cup 2026",
    mode: "player_analysis",
    labelPatterns: [/Ronaldo|Cristiano|World Cup|2026/i],
  },
  {
    id: 4,
    topic: "Barcelona vs Real Madrid tactical analysis",
    mode: "tactical_review",
    labelPatterns: [/Barcelona|Real Madrid|El Cl[aá]sico/i],
    expectFixturesOrMatch: true,
  },
  {
    id: 5,
    topic: "Manchester City vs Arsenal preview",
    mode: "match_preview",
    labelPatterns: [/Manchester City|Arsenal|City|preview/i],
    expectFixturesOrMatch: true,
  },
];

interface ExecutionOutcome {
  assembledContext: AssembledContext;
  knowledgeGraph: KnowledgeGraph;
  graphContext: import("@/features/intelligence/graph-context").GraphContext;
  promptText: string;
}

function assertKnowledgeGraphBuilt(
  qaCase: QaCase,
  outcome: ExecutionOutcome,
): void {
  const { assembledContext: assembled, knowledgeGraph: graph, promptText } = outcome;

  assert.ok(graph, `${qaCase.id}: knowledgeGraph missing`);
  assert.equal(graph.queryId, assembled.queryId, `${qaCase.id}: queryId mismatch`);
  assert.ok(graph.nodes.length > 0, `${qaCase.id}: expected nodes`);
  assert.ok(graph.edges.length > 0, `${qaCase.id}: expected edges`);
  assert.equal(graph.provenance.source, assembled.provenance.source, `${qaCase.id}: provenance source`);

  const queryNode = graph.nodes.find((node) => node.type === "query");
  assert.ok(queryNode, `${qaCase.id}: expected query node`);
  assert.equal(queryNode!.label, assembled.topic);

  for (const entity of assembled.entities) {
    const entityNode = graph.nodes.find(
      (node) => node.id === entity.id || node.label === entity.label,
    );
    assert.ok(entityNode, `${qaCase.id}: entity node missing for ${entity.label}`);
    assert.ok(entityNode!.entityRef || entityNode!.type !== "query", `${qaCase.id}: entity node shape`);
    assert.equal(entityNode!.provenance.source, graph.provenance.source, `${qaCase.id}: entity provenance`);
  }

  if (assembled.rankings.some((ranking) => ranking.entries.length > 0)) {
    const rankingFacts = graph.facts.filter((fact) => fact.type === "ranking_value");
    assert.ok(rankingFacts.length > 0, `${qaCase.id}: expected ranking_value facts`);

    for (const ranking of assembled.rankings) {
      for (const entry of ranking.entries) {
        const rankFact = rankingFacts.find(
          (fact) => fact.text.includes(`#${entry.rank}`) && fact.text.includes(entry.label),
        );
        assert.ok(rankFact, `${qaCase.id}: ranking fact missing for #${entry.rank} ${entry.label}`);
        assert.equal(rankFact!.provenance.source, graph.provenance.source);
        if (entry.value != null) {
          assert.equal(rankFact!.value, entry.value, `${qaCase.id}: ranking value for ${entry.label}`);
        }
      }
    }

    const ranks = rankingFacts
      .map((fact) => {
        const match = fact.text.match(/^#(\d+)/);
        return match ? Number(match[1]) : null;
      })
      .filter((rank): rank is number => rank != null);
    assert.ok(ranks.length >= 2, `${qaCase.id}: expected ordered ranking facts`);
    for (let index = 1; index < ranks.length; index += 1) {
      assert.ok(ranks[index]! >= ranks[index - 1]!, `${qaCase.id}: rankings should be ordered`);
    }
  } else if (qaCase.expectRankings) {
    console.log(`    (${qaCase.id}: no ranking entries — provider may be unavailable)`);
  }

  if (assembled.fixtures.length > 0) {
    for (const fixture of assembled.fixtures) {
      const fixtureNode = graph.nodes.find(
        (node) => node.type === "fixture" && node.id === `fixture:${fixture.id}`,
      );
      assert.ok(fixtureNode, `${qaCase.id}: fixture node missing for ${fixture.id}`);
      const fixtureFact = graph.facts.find((fact) => fact.subjectNodeId === fixtureNode!.id);
      assert.ok(fixtureFact, `${qaCase.id}: fixture fact missing for ${fixture.id}`);
      assert.equal(fixtureFact!.provenance.source, graph.provenance.source);
    }
  }

  if (assembled.statistics.length > 0) {
    const statFacts = graph.facts.filter((fact) => fact.type === "statistic");
    assert.ok(statFacts.length > 0, `${qaCase.id}: expected statistic facts`);
    for (const fact of statFacts) {
      assert.equal(fact.provenance.source, graph.provenance.source);
    }
  }

  if (assembled.events.length > 0) {
    const eventFacts = graph.facts.filter((fact) => fact.type === "event");
    assert.ok(eventFacts.length > 0, `${qaCase.id}: expected event facts`);
    for (const fact of eventFacts) {
      assert.equal(fact.provenance.source, graph.provenance.source);
    }
  }

  const graphText = [
    ...graph.nodes.map((node) => node.label),
    ...graph.facts.map((fact) => fact.text),
  ].join("\n");
  for (const pattern of qaCase.labelPatterns) {
    assert.match(graphText, pattern, `${qaCase.id}: graph content missing ${pattern}`);
  }

  assert.ok(promptText.length > 0, `${qaCase.id}: prompt text empty`);
  assert.doesNotMatch(promptText, /knowledgeGraph|KnowledgeGraph/i, `${qaCase.id}: prompt must not reference KG`);
  assert.doesNotMatch(promptText, /graphContext|GraphContext/i, `${qaCase.id}: prompt must not reference GraphContext`);
}

function assertGraphContextBuilt(
  qaCase: QaCase,
  outcome: ExecutionOutcome,
): void {
  const { assembledContext: assembled, knowledgeGraph: graph, graphContext: context } = outcome;

  assert.ok(context, `${qaCase.id}: graphContext missing`);
  assert.equal(context.queryId, assembled.queryId, `${qaCase.id}: graphContext queryId`);
  assert.equal(context.topic, assembled.topic, `${qaCase.id}: graphContext topic`);
  assert.equal(context.provenance.source, assembled.provenance.source, `${qaCase.id}: graphContext provenance`);
  assert.ok(context.primaryEntities.length > 0 || context.entitySummaries.length > 0, `${qaCase.id}: graphContext entities`);
  assert.equal(context.diagnostics.nodeCount, graph.nodes.length, `${qaCase.id}: graphContext nodeCount`);
  assert.equal(context.diagnostics.factCount, graph.facts.length, `${qaCase.id}: graphContext factCount`);

  if (assembled.rankings.some((ranking) => ranking.entries.length > 0)) {
    assert.ok(context.rankedFacts.length > 0, `${qaCase.id}: graphContext ranked facts`);
  }

  if (assembled.entities.length > 0) {
    assert.ok(context.entitySummaries.length > 0 || context.primaryEntities.length > 0, `${qaCase.id}: graphContext entity summaries`);
  }
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

  return {
    assembledContext: execution.assembledContext,
    knowledgeGraph: execution.knowledgeGraph,
    graphContext: execution.graphContext,
    promptText: assembledContextToPrompt(execution.assembledContext),
  };
}

async function postResearchFootball(topic: string, mode: ScriptMode) {
  const response = await fetch(`${QA_BASE_URL}/api/research-football`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, mode }),
  });
  return {
    status: response.status,
    json: (await response.json()) as {
      assembledContext?: AssembledContext;
      knowledgeGraph?: {
        queryId: string;
        nodeCount: number;
        edgeCount: number;
        factCount: number;
        provenance: KnowledgeGraph["provenance"];
      };
      graphContext?: {
        queryId: string;
        sectionCount: number;
        primaryEntityCount: number;
        rankedFactCount: number;
        verifiedFactCount: number;
        groundingRuleCount: number;
        confidence: { tier: string; percent: number };
      };
    },
  };
}

async function runQa() {
  console.log("knowledgeGraphQa");
  loadEnvLocal();

  await test("KG-0 script generation path does not consume KnowledgeGraph", () => {
    const promptBuilder = readSrc("src/features/intelligence/context/assembled-context-to-prompt.ts");
    const scriptResolver = readSrc("src/features/research/utils/script-research-context.utils.ts");
    const generateRoute = readSrc("src/app/api/generate-script/route.ts");
    const executor = readSrc("src/features/intelligence/planner/execute-intelligence-query.ts");

    assert.doesNotMatch(promptBuilder, /knowledgeGraph|KnowledgeGraph|buildKnowledgeGraph/);
    assert.doesNotMatch(scriptResolver, /knowledgeGraph|KnowledgeGraph|buildKnowledgeGraph/);
    assert.doesNotMatch(promptBuilder, /graphContext|GraphContext|buildGraphContext/);
    assert.doesNotMatch(scriptResolver, /graphContext|GraphContext|buildGraphContext/);
    assert.match(scriptResolver, /assembledContextToPrompt/);
    assert.match(generateRoute, /resolveScriptResearchContext|resolveScriptOnlyGenerationContext/);
    assert.match(executor, /buildKnowledgeGraphFromAssembledContext/);
    assert.match(executor, /buildGraphContext\(/);
    assert.match(executor, /assembledContext:/);
  });

  for (const qaCase of CASES) {
    await test(`KG-${qaCase.id} ${qaCase.topic}`, async () => {
      const outcome = await executeCase(qaCase);
      assertKnowledgeGraphBuilt(qaCase, outcome);
      assertGraphContextBuilt(qaCase, outcome);

      console.log(
        `    nodes=${outcome.knowledgeGraph.nodes.length} edges=${outcome.knowledgeGraph.edges.length} facts=${outcome.knowledgeGraph.facts.length} ranked=${outcome.graphContext.rankedFacts.length} source=${outcome.knowledgeGraph.provenance.source}`,
      );
    });
  }

  await test("KG-6 dev API exposes knowledgeGraph snapshot in development", async () => {
    if (!QA_BASE_URL) {
      console.log("    (skipped — set QA_BASE_URL=http://localhost:3000 with dev server running)");
      return;
    }

    const { status, json } = await postResearchFootball(
      "top 5 highest goal scorers fifa world cup",
      "top_5",
    );
    assert.equal(status, 200);
    assert.ok(json.assembledContext);
    assert.ok(json.knowledgeGraph, "expected dev knowledgeGraph in API response");
    assert.equal(json.knowledgeGraph!.queryId, json.assembledContext!.queryId);
    assert.ok(json.knowledgeGraph!.nodeCount > 0);
    assert.ok(json.knowledgeGraph!.edgeCount > 0);
    assert.ok(json.knowledgeGraph!.factCount > 0);
    assert.equal(
      json.knowledgeGraph!.provenance.source,
      json.assembledContext!.provenance.source,
    );
    assert.ok(json.graphContext, "expected dev graphContext in API response");
    assert.equal(json.graphContext!.queryId, json.assembledContext!.queryId);
    assert.ok(json.graphContext!.sectionCount > 0);
  });

  console.log("\nKnowledge Graph QA checks passed.");
}

runQa().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
