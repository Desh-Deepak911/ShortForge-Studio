#!/usr/bin/env node
/**
 * Run verification scripts under src/verification by domain.
 *
 * Usage:
 *   node scripts/run-verification.mjs              # all domains
 *   node scripts/run-verification.mjs export       # export/
 *   node scripts/run-verification.mjs timeline     # timeline/
 *   node scripts/run-verification.mjs intelligence # canonical, entity, football, graph, research
 */

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const verificationRoot = join(root, "src/verification");

const DOMAIN_FOLDERS = {
  export: ["export"],
  timeline: ["timeline"],
  intelligence: ["canonical", "entity", "football", "graph", "research"],
};

function listVerifyFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listVerifyFiles(fullPath));
      continue;
    }
    if (entry.endsWith(".verify.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

function resolveTargets(domainArg) {
  if (!domainArg || domainArg === "all") {
    return listVerifyFiles(verificationRoot).sort();
  }

  const folders = DOMAIN_FOLDERS[domainArg];
  if (!folders) {
    console.error(
      `Unknown domain "${domainArg}". Expected: all, export, timeline, intelligence`,
    );
    process.exit(1);
  }

  return folders
    .flatMap((folder) => listVerifyFiles(join(verificationRoot, folder)))
    .sort();
}

function runVerify(filePath) {
  const label = relative(root, filePath);
  process.stdout.write(`\n▶ ${label}\n`);

  const result = spawnSync("npx", ["tsx", filePath], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });

  return {
    filePath,
    label,
    ok: result.status === 0,
    status: result.status ?? 1,
  };
}

const domainArg = process.argv[2] ?? "all";
const targets = resolveTargets(domainArg);

if (targets.length === 0) {
  console.error(`No verification files found for domain "${domainArg}".`);
  process.exit(1);
}

console.log(
  `Running ${targets.length} verification script(s) [domain=${domainArg}]`,
);

const results = targets.map(runVerify);
const failed = results.filter((result) => !result.ok);

console.log("\n" + "=".repeat(72));
console.log(
  `Verification summary [domain=${domainArg}]: ${results.length - failed.length}/${results.length} passed`,
);

if (failed.length > 0) {
  console.log("\nFailed:");
  for (const result of failed) {
    console.log(`  - ${result.label} (exit ${result.status})`);
  }
  process.exit(1);
}

console.log("All verification scripts passed.");
