#!/usr/bin/env node
/**
 * Provider-free relative Markdown link check.
 * Does not fetch URLs. Does not read environment files.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  ".next",
  ".tmp",
  "dist",
  "coverage",
  "archive",
]);

const LINK_RE = /(?<!!)\[[^\]]*\]\(([^)]+)\)/g;

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (name.endsWith(".md")) acc.push(full);
  }
  return acc;
}

function stripHashAndQuery(target) {
  const noQuery = target.split("?")[0] ?? target;
  return noQuery.split("#")[0] ?? noQuery;
}

const files = walk(ROOT);
const missing = [];
let checked = 0;

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(LINK_RE)) {
    const raw = (match[1] ?? "").trim();
    if (!raw) continue;
    if (/^(https?:|mailto:|tel:)/i.test(raw)) continue;
    if (raw.startsWith("#")) continue;
    const dest = stripHashAndQuery(raw);
    if (!dest || dest.startsWith("mailto:")) continue;
    checked += 1;
    const resolved = path.resolve(path.dirname(file), dest);
    try {
      statSync(resolved);
    } catch {
      missing.push({
        file: path.relative(ROOT, file),
        href: raw,
      });
    }
  }
}

if (missing.length > 0) {
  console.error(`check-docs-links: ${missing.length} missing relative targets (${checked} checked)`);
  for (const row of missing.slice(0, 80)) {
    console.error(`  ${row.file} -> ${row.href}`);
  }
  if (missing.length > 80) console.error(`  … ${missing.length - 80} more`);
  process.exit(1);
}

console.log(`check-docs-links: ok (${checked} relative links in ${files.length} Markdown files)`);
