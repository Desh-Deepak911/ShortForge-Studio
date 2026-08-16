#!/usr/bin/env node
/**
 * Deployable hosted-worker packaging — Phase 2E.2C.2.
 *
 * Produces a complete Node 24 CJS worker + Chromium page IIFE + BUILD_INFO.
 * No Next.js application entry. Source maps disabled. Deterministic digests.
 */

import * as esbuild from "esbuild";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  copyFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "dist", "headless-worker");
const OUT_FILE = path.join(OUT_DIR, "hosted-worker.js");
const PAGE_OUT_FILE = path.join(OUT_DIR, "page-render.iife.js");
const BUILD_INFO_PATH = path.join(OUT_DIR, "BUILD_INFO.json");
const MANIFEST_SRC = path.join(
  ROOT,
  "src/features/headless-renderer/worker/hosted/hosted-build-manifest.json",
);
const EMBEDDED_FINGERPRINT_SRC = path.join(
  ROOT,
  "src/features/headless-renderer/control-plane/migrations/embedded-schema-fingerprint.ts",
);
const MIGRATIONS_DIR = path.join(
  ROOT,
  "src/features/headless-renderer/control-plane/migrations",
);
const ENTRY = path.join(
  ROOT,
  "src/features/headless-renderer/worker/hosted/hosted-worker-cli.ts",
);
const PAGE_ENTRY = path.join(
  ROOT,
  "src/features/headless-renderer/worker/chromium/page-entry.ts",
);

const HOSTED_NODE_MAJOR = 24;
const REJECTED_NODE_MAJORS = new Set([16, 18, 20]);

/** Hard-blocked path fragments (never ship). */
const BLOCKED_RESOLVED_FRAGMENTS = [
  "/features/headless-renderer/product/",
  "/features/headless-renderer/control-plane/testing/",
  "/features/headless-renderer/worker/testing/",
  "/src/app/",
  "/src/components/",
  "/features/drafts/",
  "/features/editor/components/",
  "/features/editor/pages/",
  "SpeechStylePanel",
  "StoryWorkspace",
  "AudioMixerPanel",
  "DraftEditorFlow",
  "HeadlessExportSection",
  "/verification/",
  "/features/clerk",
  "node_modules/next/",
  "node_modules/react-dom/",
];

/**
 * Narrow allowlist under /features/export/ — replaces blanket exclusion.
 * Only contracts, validators, fingerprinting, manifest, and render-domain logic.
 */
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
];

const EXPORT_BLOCKED_FRAGMENTS = [
  "/features/export/components/",
  "/features/export/ui/",
  "/features/export/pages/",
  "/features/export/browser/",
  "/features/export/product/",
  "/features/export/domain/index.ts",
  "/features/export/index.ts",
  "prepareExportRequest",
  "buildExportManifest.ts",
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

function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function discoverExecutableMigrations() {
  const pattern = /^(\d{3}_[a-z0-9_]+)\.sql$/;
  const names = readdirSync(MIGRATIONS_DIR)
    .filter((name) => pattern.test(name))
    .sort((a, b) => a.localeCompare(b));
  const byId = new Map();
  for (const fileName of names) {
    const match = pattern.exec(fileName);
    if (!match) continue;
    const migrationId = match[1];
    if (byId.has(migrationId)) {
      throw new Error(`DUPLICATE_MIGRATION_ID:${migrationId}`);
    }
    const sqlText = readFileSync(path.join(MIGRATIONS_DIR, fileName), "utf8");
    byId.set(migrationId, {
      migrationId,
      fileName,
      checksumSha256: sha256Hex(sqlText),
    });
  }
  return [...byId.values()];
}

function parseEmbeddedFingerprintFromSource() {
  const src = readFileSync(EMBEDDED_FINGERPRINT_SRC, "utf8");
  const entries = [];
  const re =
    /migrationId:\s*"([^"]+)"\s*,\s*checksumSha256:\s*\n?\s*"([a-f0-9]{64})"/g;
  let m;
  while ((m = re.exec(src)) != null) {
    entries.push({ migrationId: m[1], checksumSha256: m[2] });
  }
  if (entries.length === 0) {
    throw new Error("EMBEDDED_SCHEMA_FINGERPRINT_PARSE_FAILED");
  }
  const ids = new Set();
  for (const e of entries) {
    if (ids.has(e.migrationId)) {
      throw new Error(`EMBEDDED_DUPLICATE_MIGRATION_ID:${e.migrationId}`);
    }
    ids.add(e.migrationId);
  }
  return entries;
}

function assertEmbeddedFingerprintMatchesRepo() {
  const discovered = discoverExecutableMigrations();
  const embedded = parseEmbeddedFingerprintFromSource();
  if (discovered.length !== embedded.length) {
    throw new Error(
      `EMBEDDED_FINGERPRINT_COUNT_DRIFT: repo=${discovered.length} embedded=${embedded.length}`,
    );
  }
  for (let i = 0; i < discovered.length; i += 1) {
    const d = discovered[i];
    const e = embedded[i];
    if (d.migrationId !== e.migrationId) {
      throw new Error(
        `EMBEDDED_FINGERPRINT_ID_DRIFT: index=${i} repo=${d.migrationId} embedded=${e.migrationId}`,
      );
    }
    if (d.checksumSha256 !== e.checksumSha256) {
      throw new Error(
        `EMBEDDED_FINGERPRINT_CHECKSUM_DRIFT:${d.migrationId}:repo=${d.checksumSha256}:embedded=${e.checksumSha256}`,
      );
    }
  }
  // Exact required IDs including 005/006.
  const required = [
    "000_headless_schema_migrations",
    "001_headless_project_ownership",
    "002_headless_jobs",
    "004_headless_owned_objects",
    "005_headless_cleanup_intents",
    "006_headless_render_dispatch_outbox",
    "007_headless_owned_object_slot_key_capacity",
    "008_headless_export_maintenance_lease",
    "009_headless_verify_queued_unclaimed",
  ];
  const embeddedIds = embedded.map((e) => e.migrationId);
  if (JSON.stringify(embeddedIds) !== JSON.stringify(required)) {
    throw new Error(
      `EMBEDDED_FINGERPRINT_ID_SET_MISMATCH:${embeddedIds.join(",")}`,
    );
  }
  const expected005 =
    "59252610bbb0761840c8d479bcd5482b9d3c56c19f94e67cc5f0a6757dca5f2d";
  const expected006 =
    "960e1ae12451bd5f95c47473fc90ba97cb5bbd71cbc053fd6de7150f867a77b1";
  const expected004 =
    "a2f05a8316c1e257317975e2c47036034ceecebe423a62dfedc6f71149f60db3";
  const expected007 =
    "699a3565d7e12bf9245891e47a1a20a425a0d266fcdaf4b03bd9515611c60244";
  const m004 = embedded.find((e) => e.migrationId.includes("004_"));
  const m005 = embedded.find((e) => e.migrationId.includes("005_"));
  const m006 = embedded.find((e) => e.migrationId.includes("006_"));
  const m007 = embedded.find((e) => e.migrationId.includes("007_"));
  if (m004?.checksumSha256 !== expected004) {
    throw new Error("EMBEDDED_004_CHECKSUM_MISMATCH");
  }
  if (m005?.checksumSha256 !== expected005) {
    throw new Error("EMBEDDED_005_CHECKSUM_MISMATCH");
  }
  if (m006?.checksumSha256 !== expected006) {
    throw new Error("EMBEDDED_006_CHECKSUM_MISMATCH");
  }
  if (m007?.checksumSha256 !== expected007) {
    throw new Error("EMBEDDED_007_CHECKSUM_MISMATCH");
  }
  return {
    version: 1,
    migrations: embedded,
  };
}

function assertNoBlockedInputs(metafile, label) {
  const inputs = Object.keys(metafile?.inputs ?? {});
  const hits = [];
  for (const input of inputs) {
    const normalized = normalizePath(input);
    if (isBlockedResolvedPath(normalized)) {
      hits.push(normalized);
    }
  }
  if (hits.length > 0) {
    throw new Error(
      `${label} includes blocked import paths:\n${hits.slice(0, 40).join("\n")}`,
    );
  }
}

function loadDeployableManifest(schemaFingerprint) {
  const raw = JSON.parse(readFileSync(MANIFEST_SRC, "utf8"));
  if (raw.imageClass !== "deployable_worker") {
    throw new Error("BUILD_MANIFEST_MUST_BE_DEPLOYABLE_WORKER");
  }
  if (raw.deployable !== true || raw.canStartConsumerLoop !== true) {
    throw new Error("DEPLOYABLE_WORKER_FLAGS_INVALID");
  }
  if (
    !Array.isArray(raw.unresolvedDynamicModules) ||
    raw.unresolvedDynamicModules.length !== 0
  ) {
    throw new Error("DEPLOYABLE_WORKER_MUST_HAVE_EMPTY_DYNAMIC_MODULES");
  }
  if (
    !Array.isArray(raw.unresolvedCompositionSeams) ||
    raw.unresolvedCompositionSeams.length !== 0
  ) {
    throw new Error("DEPLOYABLE_WORKER_MUST_HAVE_EMPTY_COMPOSITION_SEAMS");
  }
  if (raw.nodeMajor !== HOSTED_NODE_MAJOR || raw.target !== `node${HOSTED_NODE_MAJOR}`) {
    throw new Error("BUILD_MANIFEST_NODE_MAJOR_MISMATCH");
  }
  if (REJECTED_NODE_MAJORS.has(raw.nodeMajor)) {
    throw new Error("BUILD_MANIFEST_REJECTED_EOL_NODE");
  }
  if (raw.sourcemap !== false) {
    throw new Error("BUILD_MANIFEST_SOURCEMAP_FORBIDDEN");
  }
  const ordered = {
    imageClass: raw.imageClass,
    canStartConsumerLoop: raw.canStartConsumerLoop,
    deployable: raw.deployable,
    entry: raw.entry,
    outfile: raw.outfile,
    pageArtifact: raw.pageArtifact ?? "page-render.iife.js",
    target: raw.target,
    nodeMajor: raw.nodeMajor,
    sourcemap: false,
    artifactFormat: raw.artifactFormat ?? "headless-hosted-worker",
    artifactVersion: raw.artifactVersion ?? 1,
    unresolvedDynamicModules: [],
    unresolvedCompositionSeams: [],
    schemaFingerprint: {
      version: schemaFingerprint.version,
      migrations: schemaFingerprint.migrations.map((m) => ({
        migrationId: m.migrationId,
        checksumSha256: m.checksumSha256,
      })),
    },
    note: raw.note,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

function createBoundaryPlugin(label) {
  return {
    name: `reject-blocked-${label}`,
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        const probe = normalizePath(args.path);
        if (
          probe === "next" ||
          probe.startsWith("next/") ||
          probe === "react-dom" ||
          probe.startsWith("react-dom/") ||
          probe === "react" ||
          probe.startsWith("react/")
        ) {
          // React is forbidden in the Node worker graph. Page IIFE also blocks it.
          return {
            errors: [{ text: `Blocked import: ${args.path}` }],
          };
        }
        if (isBlockedResolvedPath(probe) || isBlockedExportPath(probe)) {
          return {
            errors: [
              {
                text: `Blocked worker import path: ${args.path}`,
              },
            ],
          };
        }
        return undefined;
      });
    },
  };
}

async function buildPageIife() {
  const srcRoot = path.join(ROOT, "src");
  const result = await esbuild.build({
    absWorkingDir: ROOT,
    entryPoints: [PAGE_ENTRY],
    bundle: true,
    platform: "browser",
    format: "iife",
    target: ["chrome120"],
    outfile: PAGE_OUT_FILE,
    sourcemap: false,
    metafile: true,
    logLevel: "warning",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    external: [
      "@ffmpeg/ffmpeg",
      "@ffmpeg/util",
      "server-only",
      "puppeteer-core",
    ],
    plugins: [
      {
        name: "footie-alias",
        setup(build) {
          build.onResolve({ filter: /^@\// }, (args) => {
            const resolved = resolveTsPath(
              path.join(srcRoot, args.path.slice(2)),
            );
            if (!resolved) {
              return {
                errors: [{ text: `Unresolved ${args.path}` }],
              };
            }
            const normalized = normalizePath(resolved);
            if (isBlockedResolvedPath(normalized)) {
              return {
                errors: [{ text: `Blocked page import: ${normalized}` }],
              };
            }
            return { path: resolved };
          });
        },
      },
      createBoundaryPlugin("page"),
    ],
  });
  assertNoBlockedInputs(result.metafile, "page IIFE");
  writeFileSync(
    path.join(OUT_DIR, "page-metafile.json"),
    JSON.stringify(result.metafile, null, 2),
  );
}

async function buildWorkerBundle() {
  const result = await esbuild.build({
    absWorkingDir: ROOT,
    entryPoints: [ENTRY],
    bundle: true,
    platform: "node",
    target: [`node${HOSTED_NODE_MAJOR}`],
    format: "cjs",
    outfile: OUT_FILE,
    sourcemap: false,
    metafile: true,
    logLevel: "warning",
    packages: "bundle",
    alias: {
      "@": path.join(ROOT, "src"),
    },
    // esbuild is only used for local source-tree page fallback; deployable
    // workers ship page-render.iife.js and must not embed the esbuild package.
    external: ["esbuild"],
    banner: {
      js: "/* footiebitz headless hosted worker — secrets must never appear in this bundle */\n",
    },
    plugins: [createBoundaryPlugin("worker")],
  });

  assertNoBlockedInputs(result.metafile, "hosted worker");

  writeFileSync(
    path.join(OUT_DIR, "metafile.json"),
    JSON.stringify(result.metafile, null, 2),
  );

  const built = readFileSync(OUT_FILE, "utf8");
  for (const token of [
    'from "next/',
    'require("next/',
    "from 'next/",
    "StoryWorkspace",
    "DraftEditorFlow",
    "HeadlessExportSection",
    "SpeechStylePanel",
    "MemoryHeadless",
    "FakeRedis",
    "ClerkProvider",
  ]) {
    if (built.includes(token)) {
      throw new Error(`Worker bundle contains forbidden token: ${token}`);
    }
  }

  // Required production execution hooks must be present in the artifact.
  for (const required of [
    "executeClaimedRender",
    "executeTrustedVerifyPromotion",
    "materializeHostedWorkerAdapters",
    "createHostedWorkerLoop",
    "runHeadlessSchemaPreflight",
    "HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT",
  ]) {
    if (!built.includes(required)) {
      throw new Error(`Worker bundle missing required symbol: ${required}`);
    }
  }

  // Must not retain unresolved dynamic-require of the former externals.
  if (
    /require\(["']\.\/materialize-hosted-worker-adapters/.test(built) ||
    /require\(["']\.\/hosted-worker-loop/.test(built)
  ) {
    throw new Error("Worker bundle still externalizes adapter/loop modules");
  }

  return result.metafile;
}

async function buildOnce(schemaFingerprint) {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  await buildPageIife();
  await buildWorkerBundle();

  const buildInfo = loadDeployableManifest(schemaFingerprint);
  writeFileSync(BUILD_INFO_PATH, buildInfo);
  copyFileSync(MANIFEST_SRC, path.join(OUT_DIR, "hosted-build-manifest.json"));

  return {
    workerSha: sha256File(OUT_FILE),
    pageSha: sha256File(PAGE_OUT_FILE),
    buildInfoSha: sha256File(BUILD_INFO_PATH),
  };
}

async function main() {
  if (!existsSync(ENTRY)) {
    throw new Error(`Missing worker entry: ${ENTRY}`);
  }
  if (!existsSync(PAGE_ENTRY)) {
    throw new Error(`Missing page entry: ${PAGE_ENTRY}`);
  }
  if (!existsSync(MANIFEST_SRC)) {
    throw new Error(`Missing hosted manifest: ${MANIFEST_SRC}`);
  }
  if (!existsSync(EMBEDDED_FINGERPRINT_SRC)) {
    throw new Error(`Missing embedded fingerprint: ${EMBEDDED_FINGERPRINT_SRC}`);
  }

  const schemaFingerprint = assertEmbeddedFingerprintMatchesRepo();

  const first = await buildOnce(schemaFingerprint);
  const second = await buildOnce(schemaFingerprint);

  if (
    first.workerSha !== second.workerSha ||
    first.pageSha !== second.pageSha ||
    first.buildInfoSha !== second.buildInfoSha
  ) {
    throw new Error(
      `Non-deterministic worker build:\n` +
        `  hosted-worker.js     ${first.workerSha} vs ${second.workerSha}\n` +
        `  page-render.iife.js  ${first.pageSha} vs ${second.pageSha}\n` +
        `  BUILD_INFO.json      ${first.buildInfoSha} vs ${second.buildInfoSha}`,
    );
  }

  console.log(`headless-worker build ok → ${path.relative(ROOT, OUT_FILE)}`);
  console.log(`page artifact → ${path.relative(ROOT, PAGE_OUT_FILE)}`);
  console.log(`imageClass=deployable_worker target=node${HOSTED_NODE_MAJOR}`);
  console.log(`sha256 hosted-worker.js=${first.workerSha}`);
  console.log(`sha256 page-render.iife.js=${first.pageSha}`);
  console.log(`sha256 BUILD_INFO.json=${first.buildInfoSha}`);
  console.log("deterministic two-build digests: PASS");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "build failed");
  process.exit(1);
});
