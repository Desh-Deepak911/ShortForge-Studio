/**
 * Sprint 11E Phase 2D.1A — Upstash live stub-boundary authority.
 * Run: npm run test:headless-upstash-live-stub-boundary
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { runUpstashLiveHarness } from "./upstash-live/run-upstash-live-harness";
import {
  assertDefaultUpstashLiveRunnersAreNotStubs,
  assertUpstashLiveHarnessProductionWiring,
} from "./upstash-live/stub-boundary";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nSprint 11E Phase 2D.1A — Upstash live stub boundary\n");

  await test("DEFAULT runners are not async () => pass stubs", () => {
    const result = assertDefaultUpstashLiveRunnersAreNotStubs();
    assert.equal(result.ok, true, result.ok ? "" : result.message);
  });

  await test(
    "harness production wiring imports cleanup + preflight + stub check",
    () => {
      const result = assertUpstashLiveHarnessProductionWiring();
      assert.equal(result.ok, true, result.ok ? "" : result.message);
    },
  );

  await test("source scan detects stub runners in a fake tree", () => {
    const fakeRoot = mkdtempSync(path.join(tmpdir(), "upstash-stub-src-"));
    const matrixDir = path.join(
      fakeRoot,
      "src/verification/headless-renderer/upstash-live",
    );
    mkdirSync(matrixDir, { recursive: true });
    writeFileSync(
      path.join(matrixDir, "live-matrix.ts"),
      `
export const DEFAULT_UPSTASH_LIVE_CASE_RUNNERS = {
  "enqueue.render": async () => pass("enqueue.render"),
};
`,
      "utf8",
    );
    const stubs = assertDefaultUpstashLiveRunnersAreNotStubs(fakeRoot);
    assert.equal(stubs.ok, false);
  });

  await test(
    "stub refusal before contact does not overwrite evidence.md",
    async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "upstash-stub-"));
      const evidencePath = path.join(dir, "evidence.md");
      const marker =
        "# Sprint 11E Phase 2D.1 — Upstash dual-lease live QA evidence\n\n**Overall:** NOT_TESTED\n";
      writeFileSync(evidencePath, marker, "utf8");

      let connections = 0;
      const result = await runUpstashLiveHarness({
        forceGateOn: true,
        evidencePath,
        env: {
          HEADLESS_UPSTASH_QA: "1",
          HEADLESS_ENV_NAME: "staging",
          DATABASE_URL:
            "postgresql://user:pass@ep-test.us-east-1.aws.neon.tech/neondb",
          UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
          UPSTASH_REDIS_REST_TOKEN: "token_value_0123456789",
          UPSTASH_REDIS_TCP_URL:
            "rediss://default:pass@example.upstash.io:6379",
        },
        stubCheck: () => ({
          ok: false,
          message: "injected stub refusal",
        }),
        connectionProbe: () => {
          connections += 1;
        },
      });
      assert.equal(result.exitCode, 1);
      assert.equal(result.overall, "CONFIGURATION_UNAVAILABLE");
      assert.equal(connections, 0);
      assert.equal(readFileSync(evidencePath, "utf8"), marker);
    },
  );

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
