/**
 * Sprint 11E Phase 2B.2D.1 — progressive matrix + exception attribution (no remote DB).
 * Run: npm run test:headless-neon-progressive-matrix-authority
 */

import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { NeonLiveCaseSession } from "./neon-live/case-step";
import {
  INJECTION_EXPECTED_CASE,
  NEON_LIVE_INJECTION_POINTS,
  type NeonLiveInjectionPoint,
} from "./neon-live/injection";
import { runNeonProgressiveDiagnostic } from "./neon-live/run-neon-progressive-diagnostic";
import { REQUIRED_NEON_LIVE_CASE_IDS } from "./neon-live/required-cases";
import { discoverHeadlessMigrationSources } from "@/features/headless-renderer/control-plane/migrations/migration-catalog";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fingerprint() {
  const sources = discoverHeadlessMigrationSources();
  return {
    migrationIds: sources.map((s) => s.migrationId),
    checksums: sources.map((s) => s.checksumSha256),
  };
}

function okPreflight() {
  const fp = fingerprint();
  return async () =>
    ({
      ok: true as const,
      fingerprint: fp,
    }) as const;
}

function noopSql() {
  return {
    withClient: async <T>(
      fn: (c: {
        query: () => Promise<{ rows: unknown[]; rowCount: number }>;
      }) => Promise<T>,
    ) => fn({ query: async () => ({ rows: [], rowCount: 0 }) }),
    withTransaction: async <T>(
      fn: (c: {
        query: () => Promise<{ rows: unknown[]; rowCount: number }>;
      }) => Promise<T>,
    ) => fn({ query: async () => ({ rows: [], rowCount: 0 }) }),
  };
}

async function runInjectedMatrix(
  injectThrowAt: NeonLiveInjectionPoint,
): Promise<{
  readonly exitCode: number;
  readonly evidence: string;
  readonly cases: readonly { caseId: string; status: string; failureCategory?: string }[];
}> {
  const dir = mkdtempSync(path.join(tmpdir(), "neon-prog-"));
  const evidencePath = path.join(dir, "progressive.md");
  let cleaned = false;

  const priorPassCount = REQUIRED_NEON_LIVE_CASE_IDS.indexOf(
    INJECTION_EXPECTED_CASE[injectThrowAt] as (typeof REQUIRED_NEON_LIVE_CASE_IDS)[number],
  );

  const result = await runNeonProgressiveDiagnostic({
    env: { HEADLESS_NEON_QA_PROGRESSIVE: "1" },
    forceGateOn: true,
    assumeConfigured: true,
    injectedExecutor: noopSql(),
    evidencePath,
    runSchemaPreflight: okPreflight(),
    injectThrowAt,
    caseRunner: async () => {
      const session = new NeonLiveCaseSession({ injectThrowAt });
      for (const caseId of REQUIRED_NEON_LIVE_CASE_IDS) {
        if (caseId === INJECTION_EXPECTED_CASE[injectThrowAt]) {
          await session.run(caseId, async () => {
            throw new Error("NEON_LIVE_INJECTED");
          });
          break;
        }
        const outcome = await session.run(caseId, async () => ({ kind: "pass" }));
        if (outcome === "stop") break;
      }
      return { cases: session.results, attribution: session.attribution() };
    },
    cleanupRunner: async () => {
      cleaned = true;
      return "ok";
    },
  });

  assert.equal(existsSync(evidencePath), true);
  const evidence = readFileSync(evidencePath, "utf8");
  const caseLines = [...evidence.matchAll(/- `([^`]+)`: (PASS|FAIL)(?: category=(\S+))?/g)].map(
    (m) => ({
      caseId: m[1]!,
      status: m[2]!,
      failureCategory: m[3],
    }),
  );

  assert.equal(result.exitCode, 1);
  assert.equal(cleaned, true);
  assert.equal(caseLines.filter((c) => c.status === "PASS").length, priorPassCount);
  assert.equal(
    caseLines.some(
      (c) =>
        c.caseId === INJECTION_EXPECTED_CASE[injectThrowAt] &&
        c.status === "FAIL" &&
        c.failureCategory === "CASE_STEP_EXCEPTION",
    ),
    true,
  );
  assert.equal(
    caseLines.some((c) => c.caseId === "matrix.exception"),
    false,
  );
  // Later required cases must not run.
  const failedIdx = REQUIRED_NEON_LIVE_CASE_IDS.indexOf(
    INJECTION_EXPECTED_CASE[injectThrowAt] as (typeof REQUIRED_NEON_LIVE_CASE_IDS)[number],
  );
  for (let i = failedIdx + 1; i < REQUIRED_NEON_LIVE_CASE_IDS.length; i++) {
    assert.equal(
      caseLines.some((c) => c.caseId === REQUIRED_NEON_LIVE_CASE_IDS[i]),
      false,
    );
  }
  assert.match(evidence, /activeFailedCase=`[^`]+`/);
  assert.match(evidence, /safeOperationStage=`[^`]+`/);
  assert.match(evidence, /\*\*Cleanup:\*\* ok/);

  return { exitCode: result.exitCode, evidence, cases: caseLines };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2B.2D.1 — progressive matrix authority\n",
  );

  await test("gate off → NOT TESTED and zero database calls", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "neon-prog-gate-"));
    const evidencePath = path.join(dir, "progressive.md");
    let dbCalls = 0;
    const result = await runNeonProgressiveDiagnostic({
      env: {},
      evidencePath,
      createSqlExecutor: () => {
        dbCalls += 1;
        throw new Error("must not connect");
      },
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.overall, "NOT_TESTED");
    assert.equal(dbCalls, 0);
  });

  await test("gate off initializes progressive NOT_TESTED; never touches official path", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "neon-prog-off-"));
    const progressivePath = path.join(dir, "progressive.md");
    const officialPath = path.join(dir, "official.md");
    await runNeonProgressiveDiagnostic({
      env: {},
      evidencePath: progressivePath,
    });
    assert.equal(existsSync(progressivePath), true);
    assert.match(readFileSync(progressivePath, "utf8"), /NOT_TESTED/);
    assert.equal(existsSync(officialPath), false);
  });

  for (const point of NEON_LIVE_INJECTION_POINTS) {
    await test(
      `inject ${point} → ${INJECTION_EXPECTED_CASE[point]} CASE_STEP_EXCEPTION`,
      async () => {
        await runInjectedMatrix(point);
      },
    );
  }

  await test("session attribution preserves prior PASS cases", async () => {
    const session = new NeonLiveCaseSession();
    await session.run("ownership.first_claim", async () => ({ kind: "pass" }));
    await session.run("ownership.same_owner_access", async () => ({ kind: "pass" }));
    await session.run("ownership.cross_owner_denied", async () => {
      throw new Error("boom");
    });
    await session.run("job.provisional_create", async () => ({ kind: "pass" }));
    assert.equal(session.results.length, 3);
    assert.equal(session.results[0]?.status, "PASS");
    assert.equal(session.results[1]?.status, "PASS");
    assert.equal(session.results[2]?.status, "FAIL");
    assert.equal(session.results[2]?.failureCategory, "CASE_STEP_EXCEPTION");
    assert.equal(session.attribution().activeFailedCase, "ownership.cross_owner_denied");
    assert.equal(
      session.attribution().lastCompletedRequiredCase,
      "ownership.same_owner_access",
    );
    assert.equal(session.stoppedEarly, true);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  console.log("\nFAIL — progressive matrix authority terminated unexpectedly.\n");
  process.exitCode = 1;
});
