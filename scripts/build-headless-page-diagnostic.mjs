#!/usr/bin/env node
/**
 * Provider-free page diagnostic packaging — Phase 2E.2D.8F.3.
 *
 * Requires prior `npm run build:headless-worker` (page-render.iife.js authority).
 * Does NOT mutate hosted-worker.js or BUILD_INFO.json.
 */

import * as esbuild from "esbuild";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "dist", "headless-worker");
const DIAGNOSTIC_OUT = path.join(OUT_DIR, "page-diagnostic.js");
const PAGE_OUT_FILE = path.join(OUT_DIR, "page-render.iife.js");
const BUILD_INFO_PATH = path.join(OUT_DIR, "PAGE_DIAGNOSTIC_BUILD_INFO.json");
const MANIFEST_SRC = path.join(
  ROOT,
  "src/features/headless-renderer/worker/page-diagnostic/page-diagnostic-build-manifest.json",
);
const ENTRY = path.join(
  ROOT,
  "src/features/headless-renderer/worker/page-diagnostic/page-diagnostic-cli.ts",
);

const HOSTED_NODE_MAJOR = 24;

const BLOCKED_RESOLVED_FRAGMENTS = [
  "/features/headless-renderer/product/",
  "/features/headless-renderer/control-plane/testing/",
  "/features/headless-renderer/control-plane/adapters/",
  "/features/headless-renderer/worker/testing/",
  "/features/headless-renderer/worker/hosted/hosted-entrypoint",
  "/features/headless-renderer/worker/hosted/hosted-worker-loop",
  "/features/headless-renderer/worker/hosted/materialize-hosted-worker-adapters",
  "/features/headless-renderer/worker/hosted/compose-hosted-worker",
  "/src/app/",
  "/src/components/",
  "/verification/",
  "/features/clerk",
  "node_modules/next/",
  "node_modules/react-dom/",
];

const EXPORT_ALLOWLIST_FRAGMENTS = [
  "/features/export/domain/headless-safe",
  "/features/export/domain/export-manifest",
  "/features/export/domain/export-request",
  "/features/export/domain/export-capability",
  "/features/export/domain/export-fingerprint",
  "/features/export/domain/export-output",
  "/features/export/domain/export-scene",
  "/features/export/domain/export-audio",
  "/features/export/domain/export-caption",
  "/features/export/domain/export-media",
  "/features/export/domain/export-branding",
  "/features/export/domain/export-timing",
  "/features/export/domain/assert-export-",
  "/features/export/domain/build-export-",
  "/features/export/domain/resolve-",
  "/features/export/domain/validate-",
  "/features/export/domain/fingerprint",
  "/features/export/runtime/",
  "/features/export/utils/",
  "/features/export/timing",
  "/features/export/audio",
  "/features/story/types",
];

const EXPORT_BLOCKED_FRAGMENTS = [
  "/features/export/components/",
  "/features/export/ui/",
  "/features/export/pages/",
  "/features/export/browser/",
  "/features/export/product/",
  "/features/export/domain/index.ts",
  "/features/export/index.ts",
];

function normalizePath(p) {
  return p.replace(/\\/g, "/");
}

function isBlockedExportPath(normalized) {
  if (!normalized.includes("/features/export/")) return false;
  for (const frag of EXPORT_BLOCKED_FRAGMENTS) {
    if (normalized.includes(frag)) return true;
  }
  return !EXPORT_ALLOWLIST_FRAGMENTS.some((frag) => normalized.includes(frag));
}

function isBlockedResolvedPath(normalized) {
  for (const frag of BLOCKED_RESOLVED_FRAGMENTS) {
    if (normalized.includes(frag)) return true;
  }
  if (isBlockedExportPath(normalized)) return true;
  return false;
}

function resolveTsPath(candidate) {
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  if (existsSync(`${candidate}.ts`)) return `${candidate}.ts`;
  if (existsSync(`${candidate}.tsx`)) return `${candidate}.tsx`;
  const indexTs = path.join(candidate, "index.ts");
  if (existsSync(indexTs)) return indexTs;
  const indexTsx = path.join(candidate, "index.tsx");
  if (existsSync(indexTsx)) return indexTsx;
  return null;
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function loadDiagnosticManifest() {
  const raw = JSON.parse(readFileSync(MANIFEST_SRC, "utf8"));
  return raw;
}

function serializeBuildInfo(manifest) {
  const ordered = {
    imageClass: manifest.imageClass,
    canStartConsumerLoop: manifest.canStartConsumerLoop,
    deployable: manifest.deployable,
    providerAccess: manifest.providerAccess,
    publicService: manifest.publicService,
    entry: manifest.entry,
    outfile: manifest.outfile,
    pageArtifact: manifest.pageArtifact,
    target: manifest.target,
    nodeMajor: manifest.nodeMajor,
    sourcemap: manifest.sourcemap,
    artifactFormat: manifest.artifactFormat,
    artifactVersion: manifest.artifactVersion,
    note: manifest.note,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

function createBoundaryPlugin(label) {
  const srcRoot = path.join(ROOT, "src");
  return {
    name: `footie-page-diagnostic-boundary-${label}`,
    setup(build) {
      build.onResolve({ filter: /^@\// }, (args) => {
        const resolved = resolveTsPath(path.join(srcRoot, args.path.slice(2)));
        if (!resolved) {
          return { errors: [{ text: `Unresolved ${args.path}` }] };
        }
        const normalized = normalizePath(resolved);
        if (isBlockedResolvedPath(normalized)) {
          return { errors: [{ text: `Blocked diagnostic import: ${normalized}` }] };
        }
        return { path: resolved };
      });
    },
  };
}

function assertNoBlockedInputs(metafile, label) {
  for (const inputPath of Object.keys(metafile.inputs)) {
    const normalized = normalizePath(inputPath);
    if (isBlockedResolvedPath(normalized)) {
      throw new Error(`${label} blocked input: ${normalized}`);
    }
  }
}

async function buildDiagnosticBundle() {
  const result = await esbuild.build({
    absWorkingDir: ROOT,
    entryPoints: [ENTRY],
    bundle: true,
    platform: "node",
    target: [`node${HOSTED_NODE_MAJOR}`],
    format: "cjs",
    outfile: DIAGNOSTIC_OUT,
    sourcemap: false,
    metafile: true,
    logLevel: "warning",
    packages: "bundle",
    alias: {
      "@": path.join(ROOT, "src"),
    },
    external: ["esbuild"],
    banner: {
      js: "/* footiebitz page diagnostic — no provider secrets in this bundle */\n",
    },
    plugins: [createBoundaryPlugin("diagnostic")],
  });

  assertNoBlockedInputs(result.metafile, "page diagnostic");

  writeFileSync(
    path.join(OUT_DIR, "page-diagnostic-metafile.json"),
    JSON.stringify(result.metafile, null, 2),
  );

  const built = readFileSync(DIAGNOSTIC_OUT, "utf8");
  for (const token of [
    'from "next/',
    "materializeHostedWorkerAdapters",
    "createHostedWorkerLoop",
    "runHostedWorkerEntrypoint",
    "NeonHeadless",
    "UpstashRest",
    "UpstashTcp",
    "ClerkProvider",
    "FakeRedis",
    "composeTestHeadlessControlPlane",
  ]) {
    if (built.includes(token)) {
      throw new Error(`Diagnostic bundle contains forbidden token: ${token}`);
    }
  }

  for (const required of [
    "runPageDiagnostic",
    "renderFramesWithChromium",
    "HEADLESS_FLY_RENDER_QA_PAGE_DIAGNOSTIC",
    "materializeHeadlessPageWorkspace",
    "readShippedPageArtifactAuthority",
  ]) {
    if (!built.includes(required)) {
      throw new Error(`Diagnostic bundle missing required symbol: ${required}`);
    }
  }

  return result.metafile;
}

async function buildOnce() {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }
  if (!existsSync(PAGE_OUT_FILE)) {
    throw new Error(
      "Missing page-render.iife.js — run npm run build:headless-worker first",
    );
  }

  await buildDiagnosticBundle();
  const manifest = loadDiagnosticManifest();
  writeFileSync(BUILD_INFO_PATH, serializeBuildInfo(manifest));
  copyFileSync(
    MANIFEST_SRC,
    path.join(OUT_DIR, "page-diagnostic-build-manifest.json"),
  );

  return {
    diagnosticSha: sha256File(DIAGNOSTIC_OUT),
    pageSha: sha256File(PAGE_OUT_FILE),
    buildInfoSha: sha256File(BUILD_INFO_PATH),
  };
}

async function main() {
  if (!existsSync(ENTRY)) {
    throw new Error(`Missing diagnostic entry: ${ENTRY}`);
  }

  const first = await buildOnce();
  const second = await buildOnce();

  if (
    first.diagnosticSha !== second.diagnosticSha ||
    first.buildInfoSha !== second.buildInfoSha
  ) {
    throw new Error(
      `Non-deterministic page diagnostic build:\n` +
        `  page-diagnostic.js           ${first.diagnosticSha} vs ${second.diagnosticSha}\n` +
        `  PAGE_DIAGNOSTIC_BUILD_INFO   ${first.buildInfoSha} vs ${second.buildInfoSha}`,
    );
  }

  console.log(
    `page-diagnostic build ok → ${path.relative(ROOT, DIAGNOSTIC_OUT)}`,
  );
  console.log(`imageClass=page_diagnostic target=node${HOSTED_NODE_MAJOR}`);
  console.log(`sha256 page-diagnostic.js=${first.diagnosticSha}`);
  console.log(`sha256 page-render.iife.js=${first.pageSha} (production copy)`);
  console.log(`sha256 PAGE_DIAGNOSTIC_BUILD_INFO.json=${first.buildInfoSha}`);
  console.log("deterministic two-build digests: PASS");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "build failed");
  process.exit(1);
});
