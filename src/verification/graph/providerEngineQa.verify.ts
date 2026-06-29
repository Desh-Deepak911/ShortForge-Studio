/**
 * Provider Engine QA (run: npm run test:provider-engine-qa).
 *
 * Live routing checks use the intelligence query + registry on the server side.
 * Optional live HTTP replay: QA_BASE_URL=http://localhost:3000 npm run test:provider-engine-qa
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { buildIntelligenceQuery } from "@/features/intelligence/planner/query-orchestrator";
import type { ResearchPlanProviderRouting } from "@/features/intelligence/planner/query-orchestrator.types";
import type { ProviderDiagnosticEntry } from "@/features/intelligence/providers/provider-diagnostics.types";
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
  const envPath = join(root, ".env.local");
  try {
    const contents = readFileSync(envPath, "utf8");
    for (const line of contents.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Optional — QA runs without local env when file is absent.
  }
}

function isApiFootballKeyConfigured(): boolean {
  const key = process.env.API_FOOTBALL_KEY?.trim();
  return Boolean(key && key !== "your_key_here");
}

interface ProviderEngineQaCase {
  id: string;
  topic: string;
  mode: ScriptMode;
  expectedSelected: string;
  expectStatsBombStub?: boolean;
}

interface ProviderEngineQaResult {
  id: string;
  topic: string;
  selectedProvider: string;
  fallbackProviders: string;
  reason: string;
  latencyMs: number;
  health: string;
  cache: string;
  pass: boolean;
  notes?: string;
}

const QA_CASES: ProviderEngineQaCase[] = [
  {
    id: "world-cup-top-scorers",
    topic: "top 5 highest goal scorers fifa world cup",
    mode: "top_5",
    expectedSelected: "static-fallback",
  },
  {
    id: "premier-league-top-scorers",
    topic: "top 5 premier league scorers 2024",
    mode: "top_5",
    expectedSelected: "api-football",
  },
  {
    id: "el-clasico",
    topic: "Barcelona vs Real Madrid",
    mode: "match_preview",
    expectedSelected: "api-football",
  },
  {
    id: "cristiano-ronaldo",
    topic: "Cristiano Ronaldo",
    mode: "player_analysis",
    expectedSelected: "api-football",
  },
  {
    id: "future-tactical",
    topic: "tactical analysis Barcelona vs Real Madrid pressing patterns",
    mode: "tactical_review",
    expectedSelected: "api-football",
    expectStatsBombStub: true,
  },
];

const PROVIDER_ENGINE_PREFIX = "src/features/intelligence/providers/";
const ALLOWED_API_FOOTBALL_IMPORT_PATHS = [
  "src/features/intelligence/providers/",
  "src/features/intelligence/entities/entity-api-football.resolver.ts",
  "src/lib/football/",
  "src/features/research/utils/api-football-mappers.utils.ts",
  "src/features/research/utils/player-analysis.utils.ts",
  "src/features/football/utils/format-research-context.utils.ts",
];

type ProviderEngineServer = {
  executeIntelligenceQuery: typeof import("@/features/intelligence/planner/execute-intelligence-query").executeIntelligenceQuery;
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

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(dir, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") {
        continue;
      }
      files.push(...listSourceFiles(absolutePath));
      continue;
    }

    if (absolutePath.endsWith(".ts") || absolutePath.endsWith(".tsx")) {
      files.push(relative(root, absolutePath));
    }
  }

  return files;
}

function formatCache(cacheHit: boolean | null | undefined): string {
  if (cacheHit === true) {
    return "hit";
  }

  if (cacheHit === false) {
    return "miss";
  }

  return "n/a";
}

function summarizeDiagnostics(
  routing: ResearchPlanProviderRouting | undefined,
  diagnostics: ProviderDiagnosticEntry[] | undefined,
  expectedSelected: string,
): Pick<
  ProviderEngineQaResult,
  "selectedProvider" | "fallbackProviders" | "reason" | "latencyMs" | "health" | "cache"
> {
  const selectedEntry =
    diagnostics?.find((entry) => entry.provider === routing?.selectedProvider) ??
    diagnostics?.find((entry) => entry.selected && entry.provider === expectedSelected);

  return {
    selectedProvider: routing?.selectedProvider ?? "none",
    fallbackProviders: (routing?.fallbackProviders ?? []).join(", ") || "none",
    reason: routing?.reasoning ?? "—",
    latencyMs: selectedEntry?.latencyMs ?? 0,
    health: selectedEntry?.health ?? "unknown",
    cache: formatCache(selectedEntry?.cacheHit),
  };
}

async function loadProviderEngineServer(): Promise<ProviderEngineServer> {
  const executor = await import("@/features/intelligence/planner/execute-intelligence-query");

  return {
    executeIntelligenceQuery: executor.executeIntelligenceQuery,
  };
}

async function evaluateCase(
  server: ProviderEngineServer,
  input: ProviderEngineQaCase,
): Promise<ProviderEngineQaResult> {
  const execution = await server.executeIntelligenceQuery({
    topic: input.topic,
    selectedMode: input.mode,
    enableResearch: true,
  });
  const query = execution.intelligenceQuery;
  const routing = query.researchPlan.providerRouting;

  const outcome = {
    providerDiagnostics: execution.diagnostics,
  };

  const summary = summarizeDiagnostics(routing, outcome.providerDiagnostics, input.expectedSelected);
  const apiFootballEntry = outcome.providerDiagnostics?.find((entry) => entry.provider === "api-football");
  const planTargetsApiFootball = query.researchPlan.requiredProviders.includes("api-football");

  let pass = routing?.selectedProvider === input.expectedSelected;
  let notes: string | undefined;

  if (
    !pass &&
    input.expectedSelected === "api-football" &&
    !isApiFootballKeyConfigured() &&
    planTargetsApiFootball &&
    apiFootballEntry?.health === "unavailable"
  ) {
    pass = true;
    notes = "API_FOOTBALL_KEY not configured — planner/registry route to API-Football verified.";
  }

  if (input.expectStatsBombStub) {
    const { statsBombProvider } = await import(
      "@/features/intelligence/providers/stats-bomb.provider"
    );
    const handleDecision = statsBombProvider.canHandle(query);
    const health = await statsBombProvider.health();
    const stubVisible =
      !handleDecision.canHandle &&
      health.status === "unavailable" &&
      /unsupported|not connected|not enabled/i.test(
        `${handleDecision.reason ?? ""} ${health.message ?? ""}`,
      );
    pass = pass && stubVisible;
    if (!stubVisible) {
      notes = "StatsBomb stub not visible in provider diagnostics.";
    }
  }

  if (!pass && !notes) {
    notes = `Expected ${input.expectedSelected}, got ${routing?.selectedProvider ?? "none"}.`;
  }

  return {
    id: input.id,
    topic: input.topic,
    ...summary,
    pass,
    ...(notes ? { notes } : {}),
  };
}

async function postIntelligenceQuery(body: Record<string, unknown>) {
  const response = await fetch(`${QA_BASE_URL}/api/intelligence-query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    json: (await response.json()) as {
      intelligenceQuery?: {
        researchPlan?: {
          providerRouting?: ResearchPlanProviderRouting;
        };
      };
      error?: string;
    },
  };
}

function assertNoDirectApiFootballOutsideProviderEngine() {
  const violations: string[] = [];
  const files = listSourceFiles(join(root, "src"));

  for (const file of files) {
    if (file.startsWith(PROVIDER_ENGINE_PREFIX)) {
      continue;
    }

    if (file.includes(".verify.") || file.includes(".test.")) {
      continue;
    }

    const source = readSrc(file);
    const importsFootballClient =
      /from ["']@\/lib\/football["']/.test(source) ||
      /from ["']@\/lib\/football\/.+["']/.test(source);
    const callsExecuteApiFootball = /executeApiFootballResearch\s*\(/.test(source);
    const callsApiFootballProvider = /apiFootballProvider\s*\./.test(source);

    if (!importsFootballClient && !callsExecuteApiFootball && !callsApiFootballProvider) {
      continue;
    }

    const allowed = ALLOWED_API_FOOTBALL_IMPORT_PATHS.some((prefix) => file.startsWith(prefix));
    if (!allowed) {
      violations.push(file);
    }
  }

  assert.equal(
    violations.length,
    0,
    `Direct API-Football usage outside Provider Engine:\n${violations.join("\n")}`,
  );
}

function printResultsTable(results: ProviderEngineQaResult[]) {
  console.log("\nProvider Engine QA results");
  console.log("=".repeat(120));

  for (const result of results) {
    console.log(`\n[${result.pass ? "PASS" : "FAIL"}] ${result.id}`);
    console.log(`  Topic:              ${result.topic}`);
    console.log(`  Provider selected:  ${result.selectedProvider}`);
    console.log(`  Fallback:           ${result.fallbackProviders}`);
    console.log(`  Reason:             ${result.reason}`);
    console.log(`  Latency:            ${result.latencyMs}ms`);
    console.log(`  Health:             ${result.health}`);
    console.log(`  Cache:              ${result.cache}`);
    if (result.notes) {
      console.log(`  Notes:              ${result.notes}`);
    }
  }

  const failed = results.filter((result) => !result.pass);
  console.log(`\n${"=".repeat(120)}`);
  console.log(`Summary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    throw new Error(`Provider Engine QA failed for: ${failed.map((entry) => entry.id).join(", ")}`);
  }
}

async function runQa() {
  console.log("providerEngineQa");
  loadEnvLocal();
  console.log(`  API-Football key configured: ${isApiFootballKeyConfigured() ? "yes" : "no"}`);

  await test("gate — research service routes through canonical plan → bundle", () => {
    const researchIndex = readSrc("src/features/research/index.ts");
    const canonical = readSrc(
      "src/features/intelligence/context/execute-canonical-research.server.ts",
    );
    const assembleContext = readSrc("src/features/intelligence/context/assemble-context.ts");
    const assemblePipeline = readSrc("src/features/intelligence/context/assemble-research-context.ts");
    const executeQuery = readSrc("src/features/intelligence/planner/execute-intelligence-query.ts");
    const enrichment = readSrc("src/features/intelligence/planner/execution-enrichment.server.ts");
    const scriptResolver = readSrc(
      "src/features/research/utils/script-research-context.server.utils.ts",
    );
    const registry = readSrc(
      "src/features/intelligence/providers/legacy/provider-research.legacy.server.ts",
    );
    const fallback = readSrc("src/features/intelligence/providers/provider-fallback-chain.server.ts");
    assert.match(researchIndex, /executeIntelligenceQuery/);
    assert.doesNotMatch(researchIndex, /researchFootballContextDetailed/);
    assert.match(executeQuery, /executeIntelligenceQuery/);
    assert.match(executeQuery, /buildExecutionEnrichmentFromQuery/);
    assert.match(enrichment, /resolveResearchRankingIntent/);
    assert.match(executeQuery, /assembleContextFromBundle/);
    assert.match(executeQuery, /mergeProviderResults/);
    assert.match(canonical, /executeIntelligenceQuery/);
    assert.match(assemblePipeline, /assembleResearchContextFromBundle/);
    assert.match(assemblePipeline, /@deprecated Legacy adapter/);
    assert.doesNotMatch(canonical, /assembleResearchContextFromBundle/);
    assert.match(canonical, /assembledContextToPrompt/);
    const footballLegacy = readSrc("src/features/football/legacy/football-research.service.legacy.ts");
    const footballIndex = readSrc("src/features/football/index.ts");
    assert.match(footballLegacy, /executeIntelligenceQuery/);
    assert.doesNotMatch(footballLegacy, /buildFootballResearchContextText/);
    assert.doesNotMatch(footballIndex, /researchFootballContext/);
    assert.match(assembleContext, /collectAssemblyWarnings/);
    assert.match(assembleContext, /computeAssemblyConfidence/);
    assert.match(assembleContext, /missingInputs/);
    assert.match(scriptResolver, /resolveIntelligenceQueryFromStore/);
    assert.doesNotMatch(scriptResolver, /intelligenceQuery: forwardedQuery/);
    const store = readSrc("src/features/intelligence/planner/intelligence-query-store.server.ts");
    assert.match(store, /setIntelligenceQueryCache/);
    const routeResearch = readSrc("src/app/api/research-football/route.ts");
    assert.match(routeResearch, /executeAndCacheIntelligenceQuery/);
    assert.doesNotMatch(routeResearch, /cacheExecutionResult/);
    assert.doesNotMatch(scriptResolver, /cacheExecutionResult/);
    assert.match(scriptResolver, /executeAndCacheIntelligenceQuery/);
    assert.match(registry, /runRegistryResearchDetailed/);
    assert.match(registry, /buildProviderQueryFromResearchInput/);
    assert.match(fallback, /provider\.plan\(query\)/);
    assert.match(fallback, /provider\.execute\(query, plan\)/);
    assert.doesNotMatch(executeQuery, /apiFootballProvider/);
    assert.doesNotMatch(executeQuery, /executeApiFootballResearch/);
    assert.doesNotMatch(executeQuery, /isApiFootballConfigured/);
    assert.doesNotMatch(scriptResolver, /runRegistryResearch/);
    assert.doesNotMatch(scriptResolver, /buildProviderQueryFromResearchInput/);
    const intelligenceQueryRoute = readSrc("src/app/api/intelligence-query/route.ts");
    assert.match(intelligenceQueryRoute, /executeAndCacheIntelligenceQuery/);
    assert.doesNotMatch(intelligenceQueryRoute, /buildIntelligenceQueryWithProviderRouting/);
    assert.doesNotMatch(intelligenceQueryRoute, /runRegistryResearch/);
    const resolveEntitiesRoute = readSrc("src/app/api/resolve-entities/route.ts");
    assert.match(resolveEntitiesRoute, /executeAndCacheIntelligenceQuery/);
    assert.match(resolveEntitiesRoute, /buildEntityPreviewFromExecution/);
    assert.doesNotMatch(resolveEntitiesRoute, /resolveEntitiesForPreviewWithDebug/);
    assert.doesNotMatch(resolveEntitiesRoute, /resolveEntities\(/);
    assert.doesNotMatch(resolveEntitiesRoute, /buildIntelligenceAnalysis/);
  });

  await test("gate — no direct API-Football calls outside Provider Engine", () => {
    assertNoDirectApiFootballOutsideProviderEngine();
  });

  await test("gate — planner exposes provider routing fields", () => {
    const types = readSrc("src/features/intelligence/planner/query-orchestrator.types.ts");
    assert.match(types, /providerRouting\?: ResearchPlanProviderRouting/);
    assert.match(types, /selectedProvider/);
    assert.match(types, /fallbackProviders/);
    assert.match(types, /reasoning/);
  });

  await test("gate — no regressions in existing research verify contracts", () => {
    const serviceVerify = readSrc("src/verification/football/footballResearchService.verify.ts");
    const topScorersVerify = readSrc("src/verification/research/topScorersResearch.verify.ts");
    const executeQuery = readSrc("src/features/intelligence/planner/execute-intelligence-query.ts");
    assert.match(serviceVerify, /executeIntelligenceQuery/);
    assert.match(executeQuery, /buildCautiousIntelligenceExecutionFailure/);
    assert.match(topScorersVerify, /executeIntelligenceQuery/);
  });

  const server = await loadProviderEngineServer();
  const results: ProviderEngineQaResult[] = [];

  for (const qaCase of QA_CASES) {
    await test(`routing — ${qaCase.id}`, async () => {
      const result = await evaluateCase(server, qaCase);
      results.push(result);
      assert.equal(result.pass, true, result.notes ?? "Provider routing mismatch.");
    });
  }

  printResultsTable(results);

  if (QA_BASE_URL) {
    await test("http — intelligence-query API returns provider routing", async () => {
      const { status, json } = await postIntelligenceQuery({
        topic: QA_CASES[0]!.topic,
        selectedMode: QA_CASES[0]!.mode,
        enableResearch: true,
      });
      assert.equal(status, 200);
      assert.equal(
        json.intelligenceQuery?.researchPlan?.providerRouting?.selectedProvider,
        "static-fallback",
      );
    });
  } else {
    console.log("  (skipped HTTP replay — set QA_BASE_URL=http://localhost:3000 to verify API route)");
  }

  await test("planner — world cup all-time plan schedules static fallback", async () => {
    const query = await buildIntelligenceQuery({
      topic: QA_CASES[0]!.topic,
      selectedMode: QA_CASES[0]!.mode,
      enableResearch: true,
    });
    assert.ok(query.researchPlan.requiredProviders.includes("static-fallback"));
    assert.ok(
      query.researchPlan.requiredCalls.some((call) => call.provider === "static-fallback"),
    );
  });

  console.log("\nAll Provider Engine QA checks passed.");
}

runQa().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
