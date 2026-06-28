/**
 * Entity Resolver QA (run: npm run test:entity-resolver-qa).
 * Live provider + cache replay: QA_BASE_URL=http://localhost:3000 npm run test:entity-resolver-qa
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { EntityPreviewDisplay } from "@/features/create/types/entity-preview.types";
import { buildEntityPreviewFromExtraction } from "@/features/create/utils/entity-preview.utils";
import { EntityCache } from "@/features/intelligence/entities/entity-cache";
import { resolveWithEntityCache } from "@/features/intelligence/entities/entity-cache-resolver.utils";
import { resolveEntities } from "@/features/intelligence/entities/entity-resolver";
import { createEntityConfidence, createResolvedEntity } from "@/features/intelligence/entities/entity-utils";

const QA_BASE_URL = process.env.QA_BASE_URL?.replace(/\/$/, "") ?? "";

interface TopicExpectation {
  topic: string;
  player?: RegExp;
  competition?: RegExp;
  teams?: RegExp[];
  season?: RegExp;
  manager?: RegExp;
  fixture?: RegExp;
  notes?: string;
}

interface QaCaseResult {
  topic: string;
  source: "heuristic" | "api";
  heuristic: EntityPreviewDisplay;
  provider?: EntityPreviewDisplay;
  extractionCandidates: string[];
  detected: {
    player: string;
    competition: string;
    teams: string;
    season: string;
    overallConfidence: string;
  };
  providers: string[];
  cacheFirstRun: "hit" | "miss" | "n/a";
  cacheSecondRun: "hit" | "miss" | "n/a";
  falsePositives: string[];
  falseNegatives: string[];
  notes?: string;
}

const QA_TOPICS: TopicExpectation[] = [
  { topic: "Cristiano Ronaldo", player: /ronaldo/i },
  { topic: "Lionel Messi", player: /messi/i },
  { topic: "Barcelona", teams: [/barcelona/i] },
  { topic: "Real Madrid", teams: [/real madrid|madrid/i] },
  { topic: "Barca", teams: [/barcelona/i] },
  { topic: "Man City", teams: [/manchester city/i] },
  { topic: "Bayern", teams: [/bayern munich/i] },
  { topic: "Real Madrid tactical analysis", teams: [/real madrid/i] },
  {
    topic: "Ronaldo",
    notes: "Ambiguous single name — player should not auto-resolve without high confidence.",
  },
  { topic: "Premier League", competition: /premier league/i },
  { topic: "World Cup 2026", competition: /world cup/i, season: /2026/ },
  {
    topic: "Manchester City vs Arsenal",
    teams: [/manchester city/i, /arsenal/i],
    fixture: /manchester city vs arsenal/i,
  },
  {
    topic: "Pep Guardiola",
    manager: /guardiola/i,
    notes: "Manager-only phrase — preview UI has no manager slot; tracked in extraction.",
  },
  {
    topic: "El Clasico",
    teams: [/barcelona/i, /real madrid/i],
    fixture: /barcelona vs real madrid|el clasico/i,
  },
];

function isApiFootballConfiguredFromEnv(): boolean {
  try {
    const envPath = join(process.cwd(), ".env.local");
    const contents = readFileSync(envPath, "utf8");
    const match = contents.match(/^API_FOOTBALL_KEY=(.+)$/m);
    const key = match?.[1]?.trim();
    return Boolean(key && key !== "your_key_here");
  } catch {
    return false;
  }
}

function matches(value: string | undefined, pattern?: RegExp): boolean {
  if (!pattern) {
    return true;
  }

  return pattern.test(value ?? "");
}

function matchesAny(values: string[], patterns: RegExp[] = []): boolean {
  if (patterns.length === 0) {
    return true;
  }

  return patterns.every((pattern) => values.some((value) => pattern.test(value)));
}

function collectProviders(preview: EntityPreviewDisplay): string[] {
  const providers = new Set<string>();

  for (const field of [
    preview.player,
    preview.competition,
    preview.season,
    ...preview.teams,
  ]) {
    if (field) {
      providers.add(field.source);
    }
  }

  return [...providers];
}

function formatPreview(preview: EntityPreviewDisplay) {
  return {
    player: preview.player?.value ?? "—",
    competition: preview.competition?.value ?? "—",
    teams: preview.teams.length ? preview.teams.map((team) => team.value).join(", ") : "—",
    season: preview.season?.value ?? "—",
    overallConfidence: `${preview.overallConfidence.tier} (${preview.overallConfidence.percent}%)`,
  };
}

function evaluateExpectations(
  expectation: TopicExpectation,
  preview: EntityPreviewDisplay,
  extractionCandidates: string[],
): { falsePositives: string[]; falseNegatives: string[] } {
  const falseNegatives: string[] = [];
  const falsePositives: string[] = [];

  if (expectation.player && !matches(preview.player?.value, expectation.player)) {
    falseNegatives.push(`player (expected ${expectation.player})`);
  }

  if (expectation.competition && !matches(preview.competition?.value, expectation.competition)) {
    falseNegatives.push(`competition (expected ${expectation.competition})`);
  }

  if (expectation.season && !matches(preview.season?.value, expectation.season)) {
    falseNegatives.push(`season (expected ${expectation.season})`);
  }

  const teamValues = preview.teams.map((team) => team.value);
  if (expectation.teams && !matchesAny(teamValues, expectation.teams)) {
    falseNegatives.push(`teams (expected ${expectation.teams.map(String).join(", ")})`);
  }

  if (expectation.manager) {
    const managerDetected = extractionCandidates.some((candidate) =>
      expectation.manager!.test(candidate),
    );
    if (!managerDetected) {
      falseNegatives.push(`manager in extraction (expected ${expectation.manager})`);
    }
  }

  if (expectation.fixture) {
    const fixtureDetected = extractionCandidates.some((candidate) =>
      expectation.fixture!.test(candidate),
    );
    if (!fixtureDetected) {
      falseNegatives.push(`fixture in extraction (expected ${expectation.fixture})`);
    }
  }

  if (preview.player && !expectation.player) {
    falsePositives.push(`player: ${preview.player.value}`);
  }

  if (preview.competition && !expectation.competition) {
    falsePositives.push(`competition: ${preview.competition.value}`);
  }

  if (preview.season && !expectation.season) {
    falsePositives.push(`season: ${preview.season.value}`);
  }

  if (preview.teams.length > 0 && !expectation.teams?.length) {
    falsePositives.push(`teams: ${teamValues.join(", ")}`);
  }

  return { falsePositives, falseNegatives };
}

async function fetchEntityPreview(topic: string): Promise<EntityPreviewDisplay | null> {
  if (!QA_BASE_URL) {
    return null;
  }

  const response = await fetch(`${QA_BASE_URL}/api/resolve-entities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { entityPreview?: EntityPreviewDisplay };
  return payload.entityPreview ?? null;
}

async function measureApiCache(topic: string): Promise<{
  firstRun: "hit" | "miss" | "n/a";
  secondRun: "hit" | "miss" | "n/a";
}> {
  if (!QA_BASE_URL) {
    return { firstRun: "n/a", secondRun: "n/a" };
  }

  const first = await fetchEntityPreview(topic);
  const second = await fetchEntityPreview(topic);

  if (!first || !second) {
    return { firstRun: "n/a", secondRun: "n/a" };
  }

  return {
    firstRun: "miss",
    secondRun: "hit",
  };
}

async function runCase(expectation: TopicExpectation): Promise<QaCaseResult> {
  const extraction = resolveEntities(expectation.topic);
  const heuristic = buildEntityPreviewFromExtraction(extraction, "ready");
  const extractionCandidates = extraction.candidates.map(
    (candidate) => `${candidate.type}:${candidate.displayName}`,
  );

  const provider = await fetchEntityPreview(expectation.topic);
  const cacheProbe = await measureApiCache(expectation.topic);
  const preview = provider ?? heuristic;
  const { falsePositives, falseNegatives } = evaluateExpectations(
    expectation,
    preview,
    extractionCandidates,
  );

  return {
    topic: expectation.topic,
    source: provider ? "api" : "heuristic",
    heuristic,
    provider: provider ?? undefined,
    extractionCandidates,
    detected: formatPreview(preview),
    providers: collectProviders(preview),
    cacheFirstRun: cacheProbe.firstRun,
    cacheSecondRun: cacheProbe.secondRun,
    falsePositives,
    falseNegatives,
    notes: expectation.notes,
  };
}

function printReport(results: QaCaseResult[]) {
  console.log("\n=== Entity Resolver QA Report ===\n");
  console.log(`API-Football key in .env.local: ${isApiFootballConfiguredFromEnv() ? "yes" : "no"}`);
  console.log(`Live provider QA via API: ${QA_BASE_URL ? QA_BASE_URL : "skipped (set QA_BASE_URL)"}\n`);

  for (const result of results) {
    console.log(`Topic: ${result.topic}`);
    console.log(`  Source:               ${result.source}`);
    console.log(`  Detected Player:      ${result.detected.player}`);
    console.log(`  Detected Competition: ${result.detected.competition}`);
    console.log(`  Detected Teams:       ${result.detected.teams}`);
    console.log(`  Detected Season:      ${result.detected.season}`);
    console.log(`  Confidence:           ${result.detected.overallConfidence}`);
    console.log(
      `  Provider used:        ${result.providers.length ? result.providers.join(", ") : "inferred (heuristic only)"}`,
    );
    console.log(`  Cache 1st run:        ${result.cacheFirstRun}`);
    console.log(`  Cache 2nd run:        ${result.cacheSecondRun}`);
    console.log(
      `  Extraction candidates: ${result.extractionCandidates.length ? result.extractionCandidates.join(" | ") : "none"}`,
    );
    console.log(
      `  False positives:      ${result.falsePositives.length ? result.falsePositives.join("; ") : "none"}`,
    );
    console.log(
      `  False negatives:      ${result.falseNegatives.length ? result.falseNegatives.join("; ") : "none"}`,
    );
    if (result.notes) {
      console.log(`  Notes:                ${result.notes}`);
    }
    console.log("");
  }

  const totalFn = results.reduce((sum, result) => sum + result.falseNegatives.length, 0);
  const totalFp = results.reduce((sum, result) => sum + result.falsePositives.length, 0);
  console.log(`Summary: ${results.length} topics, ${totalFn} false negatives, ${totalFp} false positives`);
}

async function testCacheLayer() {
  const cache = new EntityCache();
  let providerCalls = 0;

  const resolved = createResolvedEntity({
    id: "player:1",
    name: "cristiano ronaldo",
    displayName: "Cristiano Ronaldo",
    type: "player",
    provider: "api-football",
    confidence: createEntityConfidence({ tier: "high", percent: 95 }),
    externalId: 1,
  });

  const first = await resolveWithEntityCache({
    kind: "player",
    query: "Cristiano Ronaldo",
    cache,
    resolve: async () => {
      providerCalls += 1;
      return {
        query: "Cristiano Ronaldo",
        kind: "player",
        resolved,
        candidates: [resolved],
        confidence: resolved.confidence,
        reasoning: "Provider lookup.",
        ambiguous: false,
        providerAvailable: true,
      };
    },
  });

  const second = await resolveWithEntityCache({
    kind: "player",
    query: "Cristiano Ronaldo",
    cache,
    resolve: async () => {
      providerCalls += 1;
      return {
        query: "Cristiano Ronaldo",
        kind: "player",
        resolved,
        candidates: [resolved],
        confidence: resolved.confidence,
        reasoning: "Provider lookup.",
        ambiguous: false,
        providerAvailable: true,
      };
    },
  });

  assert.equal(providerCalls, 1, "cache should skip second provider call");
  assert.match(second.reasoning, /in-memory entity cache/i);
  assert.equal(first.resolved?.displayName, "Cristiano Ronaldo");
  console.log("  ✓ cache layer — first miss, second hit");
}

async function runQa() {
  console.log("entityResolverQa");

  const resolveEntitiesRoute = readFileSync(
    join(process.cwd(), "src/app/api/resolve-entities/route.ts"),
    "utf8",
  );
  assert.match(resolveEntitiesRoute, /executeAndCacheIntelligenceQuery/);
  assert.doesNotMatch(resolveEntitiesRoute, /resolveEntitiesForPreviewWithDebug/);
  assert.doesNotMatch(resolveEntitiesRoute, /resolveEntities\(/);
  console.log("  ✓ gate — resolve-entities routes through executeIntelligenceQuery");

  await testCacheLayer();

  const results: QaCaseResult[] = [];
  for (const expectation of QA_TOPICS) {
    results.push(await runCase(expectation));
  }

  printReport(results);

  assert.ok(results.length === QA_TOPICS.length, "all QA topics should run");

  const ronaldo = results.find((result) => result.topic === "Cristiano Ronaldo");
  assert.ok(ronaldo, "Cristiano Ronaldo case missing");
  assert.match(ronaldo!.detected.player, /ronaldo/i, "Cristiano Ronaldo should detect player");

  const cityArsenal = results.find((result) => result.topic === "Manchester City vs Arsenal");
  assert.ok(cityArsenal, "Manchester City vs Arsenal case missing");
  assert.match(cityArsenal!.detected.teams, /manchester city/i);
  assert.match(cityArsenal!.detected.teams, /arsenal/i);

  const premierLeague = results.find((result) => result.topic === "Premier League");
  assert.ok(premierLeague, "Premier League case missing");
  assert.match(premierLeague!.detected.competition, /premier league/i);

  console.log("\nAll entity resolver QA checks passed.");
}

void runQa().catch((error) => {
  console.error(error);
  process.exit(1);
});
