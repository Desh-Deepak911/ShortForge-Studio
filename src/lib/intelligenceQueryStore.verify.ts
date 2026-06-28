/**
 * Intelligence query store verification (run: npm run test:intelligence-query-store).
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import { buildGraphContext } from "@/features/intelligence/graph-context/build-graph-context";
import { buildKnowledgeGraphFromAssembledContext } from "@/features/intelligence/knowledge/build-knowledge-graph";
import type { IntelligenceQuery } from "@/features/intelligence/planner/query-orchestrator.types";

const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
};

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(
    () => console.log(`  ✓ ${name}`),
    (error) => {
      console.error(`  ✗ ${name}`);
      throw error;
    },
  );
}

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

const assembled: AssembledContext = {
  queryId: "store-test-query",
  topic: "top 5 highest goal scorers fifa world cup",
  selectedMode: "top_5",
  intent: {
    intent: "ranked_list",
    confidence: "high",
    confidencePercent: 90,
    reasoning: "test",
    topic: {
      competitionWords: [],
      rankingWords: [],
      playerKeywords: [],
      matchKeywords: [],
      predictionKeywords: [],
      historyKeywords: [],
      comparisonKeywords: [],
      normalizedText: "top 5 highest goal scorers fifa world cup",
    },
  },
  entities: [],
  verifiedFacts: [],
  rankings: [],
  fixtures: [],
  statistics: [],
  events: [],
  lineups: [],
  warnings: [],
  confidence: { tier: "high", percent: 90, reasoning: "test" },
  provenance: { source: "static-fallback", fetchedAt: new Date().toISOString() },
  promptSections: [],
  diagnostics: [],
};

const intelligenceQuery: IntelligenceQuery = {
  id: assembled.queryId,
  input: {
    topic: assembled.topic,
    selectedMode: "top_5",
    enableResearch: true,
  },
  intent: assembled.intent,
  entities: [],
  warnings: [],
  confidence: assembled.confidence,
  researchPlan: {
    requiredProviders: [],
    requiredCalls: [],
    reason: "test",
    canProceed: true,
    missingInputs: [],
    fallbackStrategy: "static_fallback",
  },
  diagnostics: { orchestratedAt: new Date().toISOString(), events: [] },
};

async function runQa() {
  const [
    { clearIntelligenceQueryStore, getIntelligenceQueryCache, setIntelligenceQueryCache },
    { resolveIntelligenceQueryFromStore },
  ] = await Promise.all([
    import("@/features/intelligence/planner/intelligence-query-store.server"),
    import("@/features/intelligence/planner/resolve-intelligence-query-store.server"),
  ]);

  console.log("intelligenceQueryStore");

  await test("gate — store module defines in-memory cache chain", () => {
    const store = readSrc("src/features/intelligence/planner/intelligence-query-store.server.ts");
    const resolver = readSrc(
      "src/features/intelligence/planner/resolve-intelligence-query-store.server.ts",
    );
    const previewUtils = readSrc("src/features/create/utils/research-preview.utils.ts");
    const types = readSrc("src/types/footiebitz.ts");

    assert.match(store, /queryId/);
    assert.match(store, /intelligenceQuery/);
    assert.match(store, /canonicalResearchBundle/);
    assert.match(store, /assembledContext/);
    assert.match(store, /knowledgeGraph/);
    assert.match(store, /graphContext/);
    assert.match(resolver, /resolveIntelligenceQueryFromStore/);
    assert.match(resolver, /executeAndCacheIntelligenceQuery/);
    assert.doesNotMatch(resolver, /cacheExecutionResult/);
    assert.match(previewUtils, /queryId: preview\.intelligenceQuery\.id/);
    assert.doesNotMatch(previewUtils, /assembledContext: preview\.assembledContext/);
    assert.match(types, /queryId: string/);
  });

  await test("runtime — cache hit returns stored entry", () => {
    clearIntelligenceQueryStore();
    const knowledgeGraph = buildKnowledgeGraphFromAssembledContext(assembled);
    setIntelligenceQueryCache({
      queryId: assembled.queryId,
      intelligenceQuery,
      assembledContext: assembled,
      knowledgeGraph,
      graphContext: buildGraphContext(knowledgeGraph, assembled),
      executionStatus: "success",
      topic: assembled.topic,
      selectedMode: "top_5",
    });

    const cached = getIntelligenceQueryCache(assembled.queryId);
    assert.ok(cached);
    assert.equal(cached.assembledContext.queryId, assembled.queryId);
    assert.equal(cached.intelligenceQuery.id, intelligenceQuery.id);
  });

  await test("runtime — cache miss rebuilds through executeIntelligenceQuery", async () => {
    clearIntelligenceQueryStore();

    const outcome = await resolveIntelligenceQueryFromStore({
      queryId: "missing-query-id",
      topic: assembled.topic,
      selectedMode: "top_5",
    });

    assert.equal(outcome.fromCache, false);
    assert.equal(outcome.entry.topic, assembled.topic);
    assert.ok(getIntelligenceQueryCache(outcome.entry.queryId));
  });

  console.log("\nAll intelligence query store checks passed.");
}

runQa().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
