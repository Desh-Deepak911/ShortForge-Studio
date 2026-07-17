#!/usr/bin/env node
/**
 * Sprint 7E — deterministic Hook sprint aggregate suite.
 * Runs via Node spawn (not shell chaining). Fail-fast. No network required.
 */
import { spawnSync } from "node:child_process";

const steps = [
  "test:hook-style-selector",
  "test:hook-strategy-library",
  "test:hook-validator",
  "test:hook-integration",
  "test:hook-golden-matrix",
  "test:hook-safety-qa",
  "test:hook-deterministic-terminal-fallback",
  "test:hook-persistence-qa",
  "test:hook-streaming-qa",
  "test:creator-templates",
  "test:story-script-prompt",
  "test:prompt-intelligence-qa",
  "test:prompt-intelligence-production-qa",
  "test:story-structure-intelligence-qa",
  "test:audio-first-qa",
  "test:top5-research-qa",
  "test:duration-control-qa",
  "test:football-research-layer-qa",
  "test:api-football-execution-session-qa",
  "test:hook-research-preflight-qa",
];

console.log("hook-sprint — running Sprint 7E deterministic suite\n");

for (const script of steps) {
  console.log(`\n── npm run ${script} ──`);
  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`\nhook-sprint FAILED at ${script} (exit ${result.status ?? 1})`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nhook-sprint — all deterministic steps passed");
