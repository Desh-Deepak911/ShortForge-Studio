/**
 * Sprint 7E.4A — Query-scoped API-Football execution session QA (network-free).
 * Run: npm run test:api-football-execution-session-qa
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Seed before any dynamic import of server-only modules (static imports hoist).
const require = createRequire(import.meta.url);
require.cache[require.resolve("server-only")] = {
  id: require.resolve("server-only"),
  filename: require.resolve("server-only"),
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(
    () => console.log(`  ✓ ${name}`),
    (error) => {
      console.error(`  ✗ ${name}`);
      throw error;
    },
  );
}

const TEAM_ID = 50;
const FIXTURE_ID = 1200345;

async function main() {
  const {
    clearProviderExecutionContext,
    getOrCreateApiFootballExecutionSession,
    peekApiFootballExecutionSession,
    registerProviderExecutionContext,
  } = await import(
    "@/features/intelligence/providers/provider-execution-context.server"
  );
  const {
    executeApiFootballOperation,
    mergeApiFootballOperationOutputs,
  } = await import("@/features/intelligence/providers/api-football-operations.engine");
  type ApiFootballOperationAdapters = import("@/features/intelligence/providers/api-football-operations.engine").ApiFootballOperationAdapters;
  type ProviderQuery = import("@/features/intelligence/providers/provider.types").ProviderQuery;

  function mockQuery(id: string): ProviderQuery {
    return {
      id,
      topic: "Manchester City latest completed match",
      mode: "match_recap",
      entities: [],
      confidence: { score: 0.8, percent: 80, label: "high", reasoning: "qa" },
      researchPlan: {
        requiredProviders: ["api-football"],
        requiredCalls: [],
        missingInputs: [],
      },
    } as unknown as ProviderQuery;
  }

  function mockAdapters(order: string[]): ApiFootballOperationAdapters {
    return {
      searchTeams: async (queryText) => {
        order.push(`teamSearch:${queryText}`);
        return [
          {
            team: {
              id: TEAM_ID,
              name: "Manchester City",
              country: "England",
            },
          },
        ] as never;
      },
      searchFixturesByTeam: async (teamId) => {
        order.push(`fixtureSearch:${teamId}`);
        assert.equal(teamId, TEAM_ID, "fixtureSearch must receive team id from teamSearch state");
        return [
          {
            fixture: {
              id: FIXTURE_ID,
              date: "2024-05-19T15:00:00+00:00",
              status: { short: "FT", long: "Match Finished" },
            },
            league: { name: "Premier League", season: 2023, round: "Regular Season - 38" },
            teams: {
              home: { id: TEAM_ID, name: "Manchester City" },
              away: { id: 42, name: "Arsenal" },
            },
            goals: { home: 2, away: 1 },
          },
        ] as never;
      },
      getFixtureStatistics: async (fixtureId) => {
        order.push(`fixtureStats:${fixtureId}`);
        assert.equal(fixtureId, FIXTURE_ID);
        return [
          {
            team: { id: TEAM_ID, name: "Manchester City" },
            statistics: [
              { type: "Ball Possession", value: "61%" },
              { type: "Total Shots", value: 18 },
            ],
          },
        ] as never;
      },
      getFixtureEvents: async (fixtureId) => {
        order.push(`fixtureEvents:${fixtureId}`);
        assert.equal(fixtureId, FIXTURE_ID);
        return [
          {
            fixture: { id: FIXTURE_ID },
            events: [
              {
                time: { elapsed: 12, extra: null },
                team: { id: TEAM_ID, name: "Manchester City" },
                player: { id: 9, name: "Haaland" },
                assist: { id: null, name: null },
                type: "Goal",
                detail: "Normal Goal",
              },
            ],
          },
        ] as never;
      },
      getFixtureLineups: async (fixtureId) => {
        order.push(`fixtureLineups:${fixtureId}`);
        assert.equal(fixtureId, FIXTURE_ID);
        return [
          {
            team: { id: TEAM_ID, name: "Manchester City" },
            formation: "4-3-3",
            startXI: [
              { player: { id: 1, name: "Ederson", number: 31, pos: "G" } },
              { player: { id: 2, name: "Walker", number: 2, pos: "D" } },
              { player: { id: 9, name: "Haaland", number: 9, pos: "F" } },
            ],
            substitutes: [],
          },
        ] as never;
      },
    };
  }

  console.log("apiFootballExecutionSessionQa");

  await test("source — provider execute uses query-scoped session; plan clears in finally", () => {
    const provider = readFileSync(
      join(process.cwd(), "src/features/intelligence/providers/api-football.provider.ts"),
      "utf8",
    );
    const plan = readFileSync(
      join(
        process.cwd(),
        "src/features/intelligence/providers/provider-execute-research-plan.server.ts",
      ),
      "utf8",
    );
    const context = readFileSync(
      join(
        process.cwd(),
        "src/features/intelligence/providers/provider-execution-context.server.ts",
      ),
      "utf8",
    );
    assert.match(provider, /getOrCreateApiFootballExecutionSession\(query\.id\)/);
    assert.doesNotMatch(
      provider,
      /const state: ApiFootballExecutionState = \{ teams: \[\] \}/,
    );
    assert.match(plan, /clearProviderExecutionContext\(query\.id\)/);
    assert.match(plan, /finally/);
    assert.match(context, /apiFootballSessions/);
    assert.match(context, /clearApiFootballExecutionSession|apiFootballSessions\.delete/);
  });

  await test("isolation — concurrent query IDs cannot share teams or fixture IDs", () => {
    const a = getOrCreateApiFootballExecutionSession("qa-concurrent-a");
    const b = getOrCreateApiFootballExecutionSession("qa-concurrent-b");
    a.teams.push({ id: 1, name: "Team A" });
    a.fixtureId = 111;
    assert.equal(b.teams.length, 0);
    assert.equal(b.fixtureId, undefined);
    b.teams.push({ id: 2, name: "Team B" });
    b.fixtureId = 222;
    assert.equal(a.teams[0]?.id, 1);
    assert.equal(a.fixtureId, 111);
    assert.equal(b.teams[0]?.id, 2);
    assert.equal(b.fixtureId, 222);
    clearProviderExecutionContext("qa-concurrent-a");
    clearProviderExecutionContext("qa-concurrent-b");
    assert.equal(peekApiFootballExecutionSession("qa-concurrent-a"), undefined);
    assert.equal(peekApiFootballExecutionSession("qa-concurrent-b"), undefined);
  });

  await test("cleanup — session cleared after success path", () => {
    const id = "qa-success-clear";
    registerProviderExecutionContext(id, {
      topic: "Manchester City",
      mode: "match_recap",
    });
    const session = getOrCreateApiFootballExecutionSession(id);
    session.teams.push({ id: TEAM_ID, name: "Manchester City" });
    session.fixtureId = FIXTURE_ID;
    clearProviderExecutionContext(id);
    assert.equal(peekApiFootballExecutionSession(id), undefined);
  });

  await test("cleanup — session cleared after failure path", async () => {
    const id = "qa-failure-clear";
    registerProviderExecutionContext(id, {
      topic: "Manchester City",
      mode: "match_recap",
    });
    getOrCreateApiFootballExecutionSession(id).teams.push({
      id: TEAM_ID,
      name: "Manchester City",
    });
    try {
      throw new Error("simulated plan failure");
    } catch {
      clearProviderExecutionContext(id);
    }
    assert.equal(peekApiFootballExecutionSession(id), undefined);
  });

  await test("chain — teamSearch state reaches fixtureSearch; fixtureId reaches detail ops", async () => {
    const id = "qa-chain";
    const order: string[] = [];
    const adapters = mockAdapters(order);
    const query = mockQuery(id);
    registerProviderExecutionContext(id, {
      topic: query.input.topic,
      mode: "match_recap",
    });

    try {
      const sessionCall1 = getOrCreateApiFootballExecutionSession(id);
      const teamOut = await executeApiFootballOperation(
        "teamSearch",
        { query: "Manchester City" },
        query,
        sessionCall1,
        adapters,
      );
      assert.equal(teamOut.status, "success");
      assert.equal(sessionCall1.teams[0]?.id, TEAM_ID);

      const sessionCall2 = getOrCreateApiFootballExecutionSession(id);
      assert.equal(sessionCall2, sessionCall1, "same query session object across executes");
      const fixtureOut = await executeApiFootballOperation(
        "fixtureSearch",
        { direction: "last" },
        query,
        sessionCall2,
        adapters,
      );
      assert.equal(fixtureOut.status, "success");
      assert.equal(sessionCall2.fixtureId, FIXTURE_ID);
      assert.ok(fixtureOut.fixtures.some((f) => f.id === FIXTURE_ID));

      const statsOut = await executeApiFootballOperation(
        "fixtureStats",
        {},
        query,
        sessionCall2,
        adapters,
      );
      const eventsOut = await executeApiFootballOperation(
        "fixtureEvents",
        {},
        query,
        sessionCall2,
        adapters,
      );
      const lineupsOut = await executeApiFootballOperation(
        "fixtureLineups",
        {},
        query,
        sessionCall2,
        adapters,
      );

      assert.equal(statsOut.status, "success");
      assert.ok(statsOut.statistics.length >= 1);
      assert.equal(eventsOut.status, "success");
      assert.ok(eventsOut.events.length >= 1);
      assert.equal(lineupsOut.status, "success");
      assert.ok(lineupsOut.lineups.length >= 1);

      const merged = mergeApiFootballOperationOutputs([
        teamOut,
        fixtureOut,
        statsOut,
        eventsOut,
        lineupsOut,
      ]);
      assert.ok(merged.fixtures.some((f) => f.id === FIXTURE_ID));
      assert.ok(merged.statistics.length >= 1);

      assert.deepEqual(order, [
        `teamSearch:Manchester City`,
        `fixtureSearch:${TEAM_ID}`,
        `fixtureStats:${FIXTURE_ID}`,
        `fixtureEvents:${FIXTURE_ID}`,
        `fixtureLineups:${FIXTURE_ID}`,
      ]);
    } finally {
      clearProviderExecutionContext(id);
    }
  });

  await test("honest partial — unavailable statistics does not fabricate data", async () => {
    const id = "qa-partial-stats";
    const order: string[] = [];
    const adapters: ApiFootballOperationAdapters = {
      ...mockAdapters(order),
      getFixtureStatistics: async (fixtureId) => {
        order.push(`fixtureStats:${fixtureId}`);
        return null as never;
      },
    };
    const query = mockQuery(id);
    registerProviderExecutionContext(id, {
      topic: query.input.topic,
      mode: "match_recap",
    });
    try {
      const session = getOrCreateApiFootballExecutionSession(id);
      await executeApiFootballOperation(
        "teamSearch",
        { query: "Manchester City" },
        query,
        session,
        adapters,
      );
      await executeApiFootballOperation(
        "fixtureSearch",
        { direction: "last" },
        query,
        session,
        adapters,
      );
      const statsOut = await executeApiFootballOperation(
        "fixtureStats",
        {},
        query,
        session,
        adapters,
      );
      assert.equal(statsOut.status, "partial");
      assert.equal(statsOut.statistics.length, 0);
      assert.match(statsOut.warnings.join(" "), /statistics unavailable/i);
    } finally {
      clearProviderExecutionContext(id);
    }
  });

  console.log("\nAll API-Football execution session QA checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
