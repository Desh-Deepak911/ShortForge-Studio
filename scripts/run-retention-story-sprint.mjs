#!/usr/bin/env node
/**
 * Sprint 10H — deterministic Retention Story sprint aggregate suite.
 * Fail-fast. Sequential only (Node memory pressure). No network required.
 * Live QA is opt-in via test:retention-story-live-qa (not included here).
 */
import { spawnSync } from "node:child_process";

const steps = [
  "test:retention-story-contract",
  "test:retention-story-strategy",
  "test:retention-story-planning",
  "test:retention-story-composer",
  "test:retention-hook-bridge",
  "test:retention-generation-budget",
  "test:retention-story-validator",
  "test:retention-story-rewrite",
  "test:retention-terminal-validation",
  "test:retention-production-integration",
  "test:retention-reliable-generation",
  "test:retention-creator-context-authority",
  "test:retention-matchup-participant-coverage",
  "test:retention-universal-reliability",
  "test:retention-story-ui",
  "test:retention-story-golden",
  "test:retention-story-safety-qa",
  "test:retention-story-persistence-qa",
  "test:retention-story-streaming-qa",
  "test:retention-story-live-assertion-qa",
  "test:retention-story-local-evidence",
];

console.log("retention-story-sprint — running Sprint 10H deterministic suite\n");

for (const script of steps) {
  console.log(`\n── npm run ${script} ──`);
  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(
      `\nretention-story-sprint FAILED at ${script} (exit ${result.status ?? 1})`,
    );
    process.exit(result.status ?? 1);
  }
}

console.log("\nretention-story-sprint — all deterministic steps passed");
console.log(
  "Core live / local product sign-off remain separate (RETENTION_LIVE_QA + /dev/retention-story-qa).",
);
