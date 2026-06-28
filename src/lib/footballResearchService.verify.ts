/**
 * Football research service verification (run: npm run test:football-research-service).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { inferFootballTopicKind, splitMatchTopic } from "@/features/research/utils/topic-inference.utils";
import { parseRankingIntent } from "@/features/research/utils/ranking-intent.utils";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

console.log("footballResearchService");

test("topic inference treats vs/v topics as match", () => {
  assert.equal(inferFootballTopicKind("Arsenal vs Chelsea", "story"), "match");
  assert.equal(inferFootballTopicKind("Arsenal v Chelsea", "story"), "match");
  assert.deepEqual(splitMatchTopic("Arsenal vs Chelsea"), ["Arsenal", "Chelsea"]);
});

test("topic inference uses mode for player and top list", () => {
  assert.equal(inferFootballTopicKind("Haaland", "player_analysis"), "player");
  assert.equal(inferFootballTopicKind("Best strikers", "top_5"), "top_list");
});

test("executor routes top_5 world cup scorers through ranking intent enrichment", () => {
  const researchIndex = readSrc("src/features/research/index.ts");
  const enrichment = readSrc("src/features/intelligence/planner/execution-enrichment.server.ts");
  const engine = readSrc("src/features/intelligence/providers/static-knowledge/static-knowledge-research.engine.ts");
  const legacyRegistry = readSrc(
    "src/features/intelligence/providers/legacy/provider-research.legacy.server.ts",
  );
  assert.match(researchIndex, /executeIntelligenceQuery/);
  assert.match(enrichment, /resolveResearchRankingIntent/);
  assert.doesNotMatch(researchIndex, /researchFootballContextDetailed/);
  assert.doesNotMatch(researchIndex, /runRegistryResearch/);
  assert.match(legacyRegistry, /runRegistryResearchDetailed/);
  assert.match(engine, /source: "static-fallback"/);
  assert.match(engine, /getWorldCupAllTimeTopScorersPlayers/);
});

test("executor routes player_analysis through provider engine", () => {
  const executor = readSrc("src/features/intelligence/planner/execute-intelligence-query.ts");
  const engine = readSrc("src/features/intelligence/providers/api-football-research.engine.ts");
  assert.match(engine, /resolvePlayerAnalysisTopic/);
  assert.match(engine, /playerAnalysisIntent/);
  assert.match(engine, /buildVerifiedPlayerFactStrings/);
  assert.match(executor, /executeIntelligenceQuery/);
  assert.match(executor, /buildExecutionEnrichmentFromQuery/);
  assert.doesNotMatch(executor, /await executeRegistryFallbackResearch/);
  assert.doesNotMatch(executor, /apiFootballProvider/);
});

test("ranking intent parses world cup top scorers brief", () => {
  const intent = parseRankingIntent("top 5 highest goal scorers fifa world cup");
  assert.equal(intent.kind, "ranking");
  assert.equal(intent.rankingType, "top_scorers");
  assert.equal(intent.competition, "fifa_world_cup");
  assert.equal(intent.timeScope, "all_time");
  assert.equal(intent.limit, 5);
});

test("executor resolves all-time world cup scorers via executeResearchPlan", () => {
  const executor = readSrc("src/features/intelligence/planner/execute-intelligence-query.ts");
  const enrichment = readSrc("src/features/intelligence/planner/execution-enrichment.server.ts");
  assert.match(executor, /executeIntelligenceQuery/);
  assert.match(enrichment, /rankingIntent/);
  assert.match(executor, /providerRegistry\.executeResearchPlan/);
  assert.doesNotMatch(executor, /runRegistryResearch/);
  assert.doesNotMatch(executor, /staticKnowledgeProvider/);
  assert.doesNotMatch(executor, /isApiFootballConfigured/);
});

test("production research barrel exports executor only", () => {
  const researchIndex = readSrc("src/features/research/index.ts");
  const servicesIndex = readSrc("src/features/research/services/index.ts");
  assert.match(researchIndex, /executeIntelligenceQuery/);
  assert.match(servicesIndex, /executeIntelligenceQuery/);
  assert.doesNotMatch(researchIndex, /researchFootballContextDetailed/);
  assert.doesNotMatch(servicesIndex, /researchFootballContextDetailed/);
});

test("research-football API accepts forwarded intelligence query via executor", () => {
  const route = readSrc("src/app/api/research-football/route.ts");
  const executor = readSrc("src/features/intelligence/planner/execute-intelligence-query.ts");
  assert.match(route, /executeIntelligenceQuery/);
  assert.match(route, /assembledContext/);
  assert.match(executor, /intelligenceQuery\?: IntelligenceQuery/);
  assert.doesNotMatch(route, /contextText/);
  assert.doesNotMatch(route, /researchContext/);
  assert.doesNotMatch(route, /researchFootballContextDetailed/);
});

test("football research legacy adapter routes through executor + assembledContextToPrompt", () => {
  const adapter = readSrc("src/features/football/legacy/football-research.service.legacy.ts");
  const footballIndex = readSrc("src/features/football/index.ts");
  const scriptResolver = readSrc("src/features/research/utils/script-research-context.utils.ts");
  const legacyDetailed = readSrc(
    "src/features/research/legacy/football-research-detailed.legacy.server.ts",
  );
  assert.match(adapter, /executeIntelligenceQuery/);
  assert.match(adapter, /applyAssembledResearchContext/);
  assert.doesNotMatch(adapter, /buildFootballResearchContextText/);
  assert.doesNotMatch(footballIndex, /researchFootballContext/);
  assert.match(scriptResolver, /assembledContextToPrompt/);
  assert.match(legacyDetailed, /executeIntelligenceQuery/);
  assert.match(legacyDetailed, /researchFootballContextDetailed/);
});

console.log("\nAll football research service checks passed.");
