/**
 * Script research context resolution (run: npm run test:script-research-context).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import type { GraphContext } from "@/features/intelligence/context/graph-context.types";
import {
  applyAssembledResearchContext,
  isReusableResearchPreview,
  matchesResearchPreviewHandoff,
} from "@/features/research/utils/script-research-context.utils";
import { applyResolvedResearchContext } from "@/features/research/legacy/script-research-context.legacy.utils";
import type { FootballResearchContext } from "@/features/research/types/football-research.types";
import type { GenerateScriptResearchPreview } from "@/types/footiebitz";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

const root = process.cwd();

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

const worldCupAssembled: AssembledContext = {
  queryId: "test-query",
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
  verifiedFacts: [
    {
      id: "fact-1",
      text: "Miroslav Klose leads with 16 goals.",
      provenance: { source: "static-fallback" },
    },
  ],
  rankings: [
    {
      metric: "goals",
      limit: 5,
      entries: [{ rank: 1, label: "Miroslav Klose", value: 16 }],
    },
  ],
  fixtures: [],
  statistics: [],
  events: [],
  lineups: [],
  warnings: ["Using curated all-time World Cup record fallback."],
  confidence: { tier: "high", percent: 90, reasoning: "test" },
  provenance: { source: "static-fallback", fetchedAt: new Date().toISOString() },
  promptSections: [],
  diagnostics: [],
};

const worldCupGraphContext: GraphContext = {
  queryId: worldCupAssembled.queryId,
  topic: worldCupAssembled.topic,
  selectedMode: worldCupAssembled.selectedMode,
  primaryEntities: [],
  rankedFacts: [
    {
      id: "rank-1",
      text: "#1 Miroslav Klose: 16 goals",
      type: "ranking",
      rank: 1,
      value: 16,
      confidence: worldCupAssembled.confidence,
      provenance: { source: "static-fallback" },
    },
  ],
  verifiedFacts: worldCupAssembled.verifiedFacts.map((fact) => ({
    id: fact.id,
    text: fact.text,
    type: "verified",
    confidence: worldCupAssembled.confidence,
    provenance: { source: "static-fallback" },
  })),
  timelineFacts: [],
  statisticFacts: [],
  fixtureFacts: [],
  entitySummaries: [],
  relationshipSummaries: [],
  groundingRules: ["Only use facts listed in this research context."],
  warnings: worldCupAssembled.warnings,
  confidence: worldCupAssembled.confidence,
  provenance: worldCupAssembled.provenance,
  diagnostics: {
    nodeCount: 0,
    edgeCount: 0,
    factCount: 1,
    verifiedFactCount: 1,
    rankedFactCount: 1,
    timelineFactCount: 0,
    statisticFactCount: 0,
    fixtureFactCount: 0,
    entitySummaryCount: 0,
    relationshipSummaryCount: 0,
    providerDiagnostics: [],
  },
};

const previewPayload: GenerateScriptResearchPreview = {
  queryId: worldCupAssembled.queryId,
  topic: worldCupAssembled.topic,
  mode: "top_5",
};

console.log("scriptResearchContext");

test("isReusableResearchPreview requires queryId handoff", () => {
  assert.equal(
    isReusableResearchPreview(
      { ...previewPayload, queryId: "" },
      { topic: previewPayload.topic, scriptMode: "top_5" },
    ),
    false,
  );

  assert.equal(
    matchesResearchPreviewHandoff(previewPayload, {
      topic: previewPayload.topic,
      scriptMode: "top_5",
    }),
    true,
  );
});

test("isReusableResearchPreview requires matching topic and mode", () => {
  assert.equal(
    isReusableResearchPreview(previewPayload, {
      topic: previewPayload.topic,
      scriptMode: "top_5",
    }),
    true,
  );
  assert.equal(
    isReusableResearchPreview(previewPayload, {
      topic: "different topic",
      scriptMode: "top_5",
    }),
    false,
  );
  assert.equal(
    isReusableResearchPreview(previewPayload, {
      topic: previewPayload.topic,
      scriptMode: "story",
    }),
    false,
  );
});

test("applyAssembledResearchContext uses GraphContext prompt when available", () => {
  const resolved = applyAssembledResearchContext({
    scriptMode: "top_5",
    manualContext: "Manual xG note",
    assembled: {
      ...worldCupAssembled,
      manualNotes: "Manual xG note",
    },
    graphContext: worldCupGraphContext,
    usedResearchPreview: false,
  });

  assert.equal(resolved.promptSource, "prompt-intelligence");
  assert.equal(resolved.researchApplied, true);
  assert.equal(resolved.top5RankedDataAvailable, true);
  assert.match(resolved.context ?? "", /RANKED FACTS|RANKINGS:|RANKED PLAYER DATA/);
  assert.doesNotMatch(resolved.context ?? "", /--- Football research ---/);
});

test("applyAssembledResearchContext falls back to assembled when GraphContext is missing", () => {
  const resolved = applyAssembledResearchContext({
    scriptMode: "top_5",
    manualContext: "Manual xG note",
    assembled: {
      ...worldCupAssembled,
      manualNotes: "Manual xG note",
    },
    usedResearchPreview: false,
  });

  assert.equal(resolved.promptSource, "assembled");
  assert.equal(resolved.researchApplied, true);
  assert.match(resolved.context ?? "", /RANKINGS:|RANKED PLAYER DATA/);
});

test("applyAssembledResearchContext reuses assembled preview payload", () => {
  const resolved = applyAssembledResearchContext({
    scriptMode: "top_5",
    manualContext: "Manual xG note",
    assembled: worldCupAssembled,
    graphContext: worldCupGraphContext,
    usedResearchPreview: true,
  });

  assert.equal(resolved.usedResearchPreview, true);
  assert.equal(resolved.promptSource, "prompt-intelligence");
  assert.equal(resolved.researchApplied, true);
  assert.equal(resolved.top5RankedDataAvailable, true);
  assert.match(resolved.context ?? "", /Manual xG note/);
  assert.match(resolved.context ?? "", /RANKED FACTS|RANKED PLAYER DATA/);
});

test("applyResolvedResearchContext merges manual notes with preview context", () => {
  const worldCupPreviewContext: FootballResearchContext = {
    mode: "top_5",
    topic: worldCupAssembled.topic,
    summary: "All-time World Cup top scorers",
    facts: ["Miroslav Klose leads with 16 goals."],
    players: [
      { id: 1, name: "Miroslav Klose", nationality: "Germany", goals: 16 },
      { id: 2, name: "Ronaldo Nazário", nationality: "Brazil", goals: 15 },
    ],
    warnings: ["Using curated all-time World Cup record fallback."],
    source: "static-fallback",
  };

  const resolved = applyResolvedResearchContext({
    scriptMode: "top_5",
    manualContext: "Manual xG note",
    researchContext: worldCupPreviewContext,
    contextText: [
      "RESEARCHED FOOTBALL CONTEXT",
      "",
      "RANKED PLAYER DATA:",
      "1. Miroslav Klose — Germany — 16 goals",
    ].join("\n"),
    usedResearchPreview: true,
  });

  assert.equal(resolved.usedResearchPreview, true);
  assert.equal(resolved.researchApplied, true);
  assert.equal(resolved.top5RankedDataAvailable, true);
  assert.match(resolved.context ?? "", /Manual xG note/);
  assert.match(resolved.context ?? "", /RANKED PLAYER DATA/);
});

test("applyResolvedResearchContext sets top5RankedDataAvailable false without ranked players", () => {
  const resolved = applyResolvedResearchContext({
    scriptMode: "top_5",
    researchContext: {
      mode: "top_5",
      topic: "Top 5 Premier League strikers",
      summary: "No rankings",
      facts: [],
      warnings: ["No ranked player data found."],
      source: "fallback",
    },
    contextText: "RESEARCHED FOOTBALL CONTEXT\n\nWarnings:\n- No ranked player data found.",
  });

  assert.equal(resolved.researchApplied, false);
  assert.equal(resolved.top5RankedDataAvailable, false);
});

test("failed research keeps manual context and marks not applied", () => {
  const resolved = applyResolvedResearchContext({
    scriptMode: "player_analysis",
    manualContext: "Focus on Portugal captaincy",
    researchContext: {
      mode: "player_analysis",
      topic: "Cristiano Ronaldo FIFA World Cup 2026",
      summary: "Research brief",
      facts: [],
      warnings: ["No player data found."],
      source: "fallback",
    },
    contextText: "RESEARCHED FOOTBALL CONTEXT\n\nWarnings:\n- No player data found.",
    usedResearchPreview: false,
  });

  assert.equal(resolved.researchApplied, false);
  assert.match(resolved.context ?? "", /Focus on Portugal captaincy/);
  assert.match(resolved.researchWarning ?? "", /No player data found/);
});

test("generate-script route passes top5RankedDataAvailable to generation", () => {
  const route = readSrc("src/app/api/generate-script/route.ts");
  const resolver = readSrc("src/features/research/utils/script-research-context.utils.ts");
  const serverResolver = readSrc(
    "src/features/research/utils/script-research-context.server.utils.ts",
  );
  const routeResearch = readSrc("src/app/api/research-football/route.ts");
  const assembleContext = readSrc("src/features/intelligence/context/assemble-context.ts");
  assert.match(route, /researchPreview/);
  assert.match(route, /resolveScriptResearchContext/);
  assert.match(route, /researchAttemptedWithoutData/);
  assert.match(route, /top5RankedDataAvailable/);
  assert.match(serverResolver, /resolveIntelligenceQueryFromStore/);
  assert.match(serverResolver, /isReusableResearchPreview/);
  assert.doesNotMatch(serverResolver, /buildIntelligenceQueryWithProviderRouting/);
  assert.doesNotMatch(serverResolver, /buildIntelligenceQuery/);
  assert.doesNotMatch(serverResolver, /researchFootballContextDetailed/);
  assert.match(serverResolver, /applyAssembledResearchContext/);
  assert.match(serverResolver, /graphContext/);
  assert.match(serverResolver, /resolveResearchPromptText|formatScriptPromptSourceForDev/);
  assert.match(resolver, /resolveResearchPromptText/);
  const promptResolver = readSrc(
    "src/features/intelligence/context/resolve-research-prompt-text.ts",
  );
  assert.match(promptResolver, /buildPromptIntelligence/);
  assert.match(promptResolver, /promptIntelligenceToPromptText/);
  assert.match(promptResolver, /assembledContextToPrompt/);
  assert.match(promptResolver, /graphContextToPromptText/);
  const store = readSrc("src/features/intelligence/planner/intelligence-query-store.server.ts");
  assert.match(store, /IntelligenceQueryCacheEntry/);
  assert.match(store, /intelligenceQueryStore/);
  assert.match(routeResearch, /executeAndCacheIntelligenceQuery/);
  assert.doesNotMatch(routeResearch, /cacheExecutionResult/);
  assert.doesNotMatch(serverResolver, /cacheExecutionResult/);
  assert.match(serverResolver, /executeAndCacheIntelligenceQuery/);
  assert.doesNotMatch(serverResolver, /contextText/);
  assert.doesNotMatch(routeResearch, /researchContext/);
  assert.doesNotMatch(routeResearch, /contextText/);
  assert.doesNotMatch(routeResearch, /assembleResearchContextFromBundle/);
  assert.doesNotMatch(routeResearch, /buildCautiousIntelligenceExecutionFailure/);
  assert.doesNotMatch(serverResolver, /buildCautiousIntelligenceExecutionFailure/);
  assert.match(assembleContext, /assembleContextFromBundle/);
  assert.doesNotMatch(assembleContext, /buildPromptSectionsFromBundle/);
  const assemblePipeline = readSrc("src/features/intelligence/context/assemble-research-context.ts");
  assert.match(assemblePipeline, /assembledContextToPrompt/);
  assert.doesNotMatch(assemblePipeline, /renderAssembledPromptSections/);
  const contextIndex = readSrc("src/features/intelligence/context/index.ts");
  assert.doesNotMatch(contextIndex, /buildPromptSectionsFromBundle/);
  assert.match(contextIndex, /assembledContextToPrompt/);
});

test("CreateStoryFlow uses single research-football executeIntelligenceQuery path", () => {
  const flow = readSrc("src/features/create/components/CreateStoryFlow.tsx");
  const route = readSrc("src/app/api/research-football/route.ts");
  assert.match(flow, /buildGenerateScriptResearchPreview/);
  assert.match(flow, /researchPreview:/);
  const previewUtils = readSrc("src/features/create/utils/research-preview.utils.ts");
  assert.match(previewUtils, /queryId: preview\.intelligenceQuery\.id/);
  assert.match(flow, /\/api\/research-football/);
  assert.match(flow, /assembledContext/);
  assert.match(flow, /buildEntityPreviewFromExecution/);
  assert.doesNotMatch(flow, /resolveEntities/);
  assert.doesNotMatch(flow, /buildEntityPreviewFromExtraction/);
  assert.doesNotMatch(flow, /researchContext/);
  assert.doesNotMatch(flow, /contextText/);
  assert.doesNotMatch(flow, /\/api\/intelligence-query/);
  assert.doesNotMatch(flow, /\/api\/resolve-entities/);
  assert.match(route, /executeAndCacheIntelligenceQuery/);
  assert.doesNotMatch(route, /cacheExecutionResult/);
  assert.match(route, /assembledContext/);
  assert.doesNotMatch(route, /researchFootballContextDetailed/);
  assert.doesNotMatch(route, /runRegistryResearchDetailed/);
});

test("production routes and Create flow do not import quarantined legacy symbols", () => {
  const productionPaths = [
    "src/app/api/research-football/route.ts",
    "src/app/api/intelligence-query/route.ts",
    "src/app/api/resolve-entities/route.ts",
    "src/app/api/generate-script/route.ts",
    "src/features/create/components/CreateStoryFlow.tsx",
    "src/features/create/components/ScriptReviewFlow.tsx",
    "src/features/create/components/ResearchPreviewPanel.tsx",
    "src/features/research/utils/script-research-context.server.utils.ts",
  ];
  const legacyImportPattern =
    /@\/features\/(football\/legacy|research\/legacy|intelligence\/context\/legacy|intelligence\/providers\/legacy|intelligence\/entities\/legacy)/;
  const deprecatedSymbols = [
    "executeCanonicalResearchPlan",
    "runRegistryResearch",
    "researchFootballContext",
    "assembleResearchContextFromBundle",
    "buildFootballResearchContextText",
    "bundleToResearchContextText",
    "applyResolvedResearchContext",
    "resolveEntitiesForPreviewWithDebug",
    "assembledContextToPromptText",
  ];

  for (const relativePath of productionPaths) {
    const src = readSrc(relativePath);
    assert.doesNotMatch(
      src,
      legacyImportPattern,
      `${relativePath} must not import legacy barrels`,
    );
    for (const symbol of deprecatedSymbols) {
      assert.doesNotMatch(
        src,
        new RegExp(symbol),
        `${relativePath} must not reference ${symbol}`,
      );
    }
  }

  const contextIndex = readSrc("src/features/intelligence/context/index.ts");
  assert.doesNotMatch(contextIndex, /assembledContextToPromptText/);
  const footballIndex = readSrc("src/features/football/index.ts");
  assert.doesNotMatch(footballIndex, /researchFootballContext/);
  const providersIndex = readSrc("src/features/intelligence/providers/index.ts");
  assert.doesNotMatch(providersIndex, /mergeProviderResults/);
});

console.log("\nAll script research context checks passed.");
