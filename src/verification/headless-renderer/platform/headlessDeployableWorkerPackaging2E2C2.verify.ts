/**
 * Sprint 11E Phase 2E.2C.2 — deployable hosted-worker packaging.
 * Run: npm run test:headless-deployable-worker-packaging-2e2c2
 *
 * Local packaging verification only — no Neon/R2/Upstash/Fly contact.
 */

import assert from "node:assert/strict";
import { sha256Bytes } from "../../support/evidence-hash";
import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT,
  embeddedSchemaFingerprintAsPreflightSources,
} from "@/features/headless-renderer/control-plane/migrations/embedded-schema-fingerprint";
import { discoverHeadlessMigrationSources } from "@/features/headless-renderer/control-plane/migrations/migration-catalog";
import { runHeadlessSchemaPreflight } from "@/features/headless-renderer/control-plane/runtime/neon-schema-preflight";
import type {
  HeadlessSqlClient,
  HeadlessSqlExecutor,
} from "@/features/headless-renderer/control-plane/runtime/sql-client";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker";
import {
  assertDeployableWorkerImage,
  buildHeadlessHostedBuildManifest,
  composeHostedHeadlessWorker,
  HEADLESS_HOSTED_IMAGE_CLASS,
  HEADLESS_HOSTED_UNRESOLVED_DYNAMIC_MODULES,
  runHostedWorkerEntrypoint,
} from "@/features/headless-renderer/worker/hosted";

const ROOT = path.resolve(__dirname, "../../../..");
const DIST = path.join(ROOT, "dist/headless-worker");
const DEPLOY = path.join(ROOT, "deploy/headless-worker");
const MIGRATIONS = path.join(
  ROOT,
  "src/features/headless-renderer/control-plane/migrations",
);

let passed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    });
}


function validHostedEnv(
  mode: "verify" | "render",
): Record<string, string> {
  return {
    HEADLESS_WORKER_MODE: mode,
    HEADLESS_ENV_NAME: "staging",
    DATABASE_URL: "postgresql://user:pass@ep-staging.example/neondb",
    R2_ACCOUNT_ID: "a".repeat(32),
    R2_ACCESS_KEY_ID: "AKIA" + "B".repeat(16),
    R2_SECRET_ACCESS_KEY: "secretvalue" + "c".repeat(20),
    R2_BUCKET_ASSETS: "footie-assets-staging",
    R2_BUCKET_ARTIFACTS: "footie-artifacts-staging",
    R2_ENDPOINT: "https://accountid.r2.cloudflarestorage.com",
    HEADLESS_ALLOWED_ORIGINS: "https://staging.example.com",
    UPSTASH_REDIS_TCP_URL: "rediss://default:pass@example.upstash.io:6379",
    HEADLESS_CHROME_PATH: "/usr/bin/chromium",
    HEADLESS_FFMPEG_PATH: "/usr/bin/ffmpeg",
    HEADLESS_FFPROBE_PATH: "/usr/bin/ffprobe",
    HEADLESS_RENDERER_BUILD_ID: HEADLESS_WORKER_RENDERER_BUILD_ID,
    HEADLESS_WORKER_CONCURRENCY: "1",
  };
}

function scriptedExecutor(
  handler: (text: string) => { rows: unknown[]; rowCount: number },
): HeadlessSqlExecutor {
  const client: HeadlessSqlClient = {
    query: async <Row extends Record<string, unknown>>(text: string) =>
      handler(text) as { rows: Row[]; rowCount: number },
  };
  return {
    withClient: async <T>(fn: (client: HeadlessSqlClient) => Promise<T>) =>
      fn(client),
    withTransaction: async <T>(
      fn: (client: HeadlessSqlClient) => Promise<T>,
    ) => fn(client),
  };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2C.2 — Deployable hosted-worker packaging\n",
  );

  await test("deployable build-manifest authority", () => {
    const manifest = buildHeadlessHostedBuildManifest();
    assertDeployableWorkerImage(manifest);
    assert.equal(HEADLESS_HOSTED_IMAGE_CLASS, "deployable_worker");
    assert.deepEqual([...HEADLESS_HOSTED_UNRESOLVED_DYNAMIC_MODULES], []);
    assert.equal(manifest.sourcemap, false);
    assert.equal(manifest.nodeMajor, 24);
  });

  await test("embedded migration fingerprint matches repo SQL", () => {
    const discovered = discoverHeadlessMigrationSources(MIGRATIONS);
    const embedded = HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT.migrations;
    assert.equal(discovered.length, embedded.length);
    for (let i = 0; i < discovered.length; i += 1) {
      assert.equal(discovered[i]!.migrationId, embedded[i]!.migrationId);
      assert.equal(
        discovered[i]!.checksumSha256,
        embedded[i]!.checksumSha256,
      );
    }
    const m005 = embedded.find((m) => m.migrationId.startsWith("005_"));
    const m006 = embedded.find((m) => m.migrationId.startsWith("006_"));
    assert.equal(
      m005?.checksumSha256,
      "59252610bbb0761840c8d479bcd5482b9d3c56c19f94e67cc5f0a6757dca5f2d",
    );
    assert.equal(
      m006?.checksumSha256,
      "960e1ae12451bd5f95c47473fc90ba97cb5bbd71cbc053fd6de7150f867a77b1",
    );
    const m007 = embedded.find((e) => e.migrationId.includes("007_"));
    assert.equal(
      m007?.checksumSha256,
      "699a3565d7e12bf9245891e47a1a20a425a0d266fcdaf4b03bd9515611c60244",
    );
    const m004 = embedded.find((e) => e.migrationId.includes("004_"));
    assert.equal(
      m004?.checksumSha256,
      "a2f05a8316c1e257317975e2c47036034ceecebe423a62dfedc6f71149f60db3",
    );
  });

  await test("schema preflight default uses embedded fingerprint (no readdir)", async () => {
    const sources = embeddedSchemaFingerprintAsPreflightSources();
    const sql = scriptedExecutor((text) => {
      if (text.includes("set_config")) {
        return { rows: [{ set_config: "public, pg_temp" }], rowCount: 1 };
      }
      if (text.includes("FROM pg_class") && text.includes("relkind")) {
        return {
          rows: [{ relkind: "r", relpersistence: "p" }],
          rowCount: 1,
        };
      }
      if (text.includes("FROM public.headless_schema_migrations")) {
        return {
          rows: sources.map((s) => ({
            migration_id: s.migrationId,
            checksum_sha256: s.checksumSha256,
          })),
          rowCount: sources.length,
        };
      }
      // Fail closed on constraints — we only assert fingerprint path ran.
      if (text.includes("FROM pg_constraint")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const result = await runHeadlessSchemaPreflight({ sql });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "SCHEMA_INCOHERENT");
  });

  await test("deterministic deployable worker build + hook presence", () => {
    const build = spawnSync("node", ["scripts/build-headless-worker.mjs"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 180_000,
    });
    assert.equal(build.status, 0, build.stderr || build.stdout);
    assert.ok(existsSync(path.join(DIST, "hosted-worker.js")));
    assert.ok(existsSync(path.join(DIST, "page-render.iife.js")));
    assert.ok(existsSync(path.join(DIST, "BUILD_INFO.json")));

    const worker = readFileSync(path.join(DIST, "hosted-worker.js"), "utf8");
    const info = readFileSync(path.join(DIST, "BUILD_INFO.json"), "utf8");
    const meta = JSON.parse(
      readFileSync(path.join(DIST, "metafile.json"), "utf8"),
    ) as { inputs: Record<string, unknown> };
    const inputs = Object.keys(meta.inputs).map((i) => i.replace(/\\/g, "/"));

    assert.match(info, /"imageClass": "deployable_worker"/);
    assert.match(info, /"deployable": true/);
    assert.match(info, /"canStartConsumerLoop": true/);
    assert.match(info, /"unresolvedDynamicModules": \[\]/);
    assert.match(info, /005_headless_cleanup_intents/);
    assert.match(info, /006_headless_render_dispatch_outbox/);
    assert.match(info, /007_headless_owned_object_slot_key_capacity/);

    for (const required of [
      "executeClaimedRender",
      "executeTrustedVerifyPromotion",
      "materializeHostedWorkerAdapters",
      "createHostedWorkerLoop",
      "runHeadlessSchemaPreflight",
      "HEADLESS_EMBEDDED_SCHEMA_FINGERPRINT",
    ]) {
      assert.ok(worker.includes(required), `missing ${required}`);
    }

    for (const forbidden of [
      'from "next/',
      'require("next/',
      "StoryWorkspace",
      "DraftEditorFlow",
      "HeadlessExportSection",
      "SpeechStylePanel",
      "MemoryHeadless",
      "FakeRedis",
      "ClerkProvider",
      "/src/app/",
      "control-plane/testing",
      "worker/testing",
    ]) {
      assert.equal(worker.includes(forbidden), false, `forbidden ${forbidden}`);
    }

    const forbiddenInputs = inputs.filter(
      (i) =>
        i.includes("/src/app/") ||
        i.includes("/src/components/") ||
        i.includes("/features/drafts/") ||
        i.includes("SpeechStylePanel") ||
        i.includes("control-plane/testing") ||
        i.includes("worker/testing") ||
        i.includes("node_modules/next/") ||
        i.includes("node_modules/react-dom/"),
    );
    assert.deepEqual(forbiddenInputs, []);
  });

  await test("unconfigured artifact smoke — non-zero, no unresolved local import", () => {
    const result = spawnSync(
      process.execPath,
      [path.join(DIST, "hosted-worker.js")],
      {
        cwd: path.join(DIST),
        encoding: "utf8",
        env: { ...process.env, HEADLESS_WORKER_MODE: "" },
        timeout: 15_000,
      },
    );
    assert.notEqual(result.status, 0);
    const out = `${result.stdout}\n${result.stderr}`;
    assert.equal(/Cannot find module/.test(out), false);
    assert.equal(/ERR_MODULE_NOT_FOUND/.test(out), false);
    assert.match(out, /environment_unconfigured|partial_configuration|invalid/);
  });

  await test("invalid env smoke — non-zero without provider network tokens", () => {
    const result = spawnSync(
      process.execPath,
      [path.join(DIST, "hosted-worker.js")],
      {
        cwd: path.join(DIST),
        encoding: "utf8",
        env: {
          NODE_ENV: "test",
          PATH: process.env.PATH ?? "",
          HEADLESS_WORKER_MODE: "render",
          HEADLESS_ENV_NAME: "staging",
        },
        timeout: 15_000,
      },
    );
    assert.notEqual(result.status, 0);
    const out = `${result.stdout}\n${result.stderr}`;
    assert.equal(/ECONNREFUSED|ENOTFOUND|getaddrinfo/.test(out), false);
    assert.equal(/Cannot find module/.test(out), false);
  });

  await test("mode isolation — render/verify composition maps diverge", () => {
    const r = composeHostedHeadlessWorker(validHostedEnv("render"));
    const v = composeHostedHeadlessWorker(validHostedEnv("verify"));
    assert.equal(r.canStartConsumerLoop, true);
    assert.equal(v.canStartConsumerLoop, true);
    assert.equal(r.compositionMap?.chromiumFfmpegRunner, true);
    assert.equal(v.compositionMap?.chromiumFfmpegRunner, false);
    assert.equal(r.compositionMap?.trustedVerifyPromotion, false);
    assert.equal(v.compositionMap?.trustedVerifyPromotion, true);
    assert.equal(r.config?.concurrency, 1);
    assert.equal(v.config?.concurrency, 1);
  });

  await test("schema failure closes adapters and never starts loop", async () => {
    let closed = 0;
    let groups = 0;
    const events: string[] = [];
    const result = await runHostedWorkerEntrypoint({
      env: validHostedEnv("verify"),
      installSignalHandlers: false,
      skipBinaryPreflight: true,
      runSchemaPreflight: async () => ({
        ok: false as const,
        code: "SCHEMA_DRIFT" as const,
        message: "injected drift",
      }),
      materializeAdapters: () =>
        ({
          sql: {
            withClient: async () => {
              throw new Error("unused");
            },
            withTransaction: async () => {
              throw new Error("unused");
            },
          },
          jobStore: {} as never,
          ownedObjectStore: {} as never,
          artifactCleanup: {} as never,
          dispatchOutbox: {} as never,
          streamQueue: {
            ensureConsumerGroups: async () => {
              groups += 1;
              return { ok: true, value: undefined };
            },
            close: async () => undefined,
          },
          r2ObjectIo: {} as never,
          createJobBoundStorage: () => {
            throw new Error("R2 forbidden");
          },
          createOnClaimedRender: () => async () => ({
            kind: "render_failed" as const,
            reasonId: "unused",
          }),
          createOnClaimedVerify: () => async () => ({
            kind: "ok",
            reasonId: "ok",
          }),
          leaseSettings: {
            visibilityTimeoutMs: 30_000,
            minIdleMs: 30_000,
            claimBatchSize: 1,
          },
          close: async () => {
            closed += 1;
          },
        }) as never,
      eventSink: (e) => events.push(e.name),
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.reasonId, "schema_schema_drift");
    assert.ok(closed >= 1);
    assert.equal(groups, 0);
    assert.equal(events.includes("hosted.loop.started"), false);
  });

  await test("Dockerfile / BUILD_INFO classification coherence", () => {
    const dockerfile = readFileSync(path.join(DEPLOY, "Dockerfile"), "utf8");
    const entry = readFileSync(
      path.join(DEPLOY, "docker-entrypoint.sh"),
      "utf8",
    );
    const info = readFileSync(path.join(DIST, "BUILD_INFO.json"), "utf8");
    assert.match(dockerfile, /deployable_worker/);
    assert.match(dockerfile, /"deployable": true/);
    assert.match(dockerfile, /"canStartConsumerLoop": true/);
    assert.match(dockerfile, /NODE_MAJOR=24/);
    assert.match(dockerfile, /\btini\b/);
    assert.match(dockerfile, /USER worker/);
    assert.match(dockerfile, /page-render\.iife\.js/);
    assert.equal(dockerfile.includes("--no-sandbox"), false);
    assert.equal(/^EXPOSE /m.test(dockerfile), false);
    assert.match(entry, /verify\|render/);
    assert.match(info, /"imageClass": "deployable_worker"/);
  });

  await test("Docker CLI availability reported honestly", () => {
    const docker = spawnSync("docker", ["--version"], { encoding: "utf8" });
    const status = docker.status === 0 ? "AVAILABLE" : "NOT INSTALLED";
    console.log(`  · docker: ${status} → image smoke NOT TESTED`);
    assert.ok(existsSync(path.join(DEPLOY, "Dockerfile")));
  });

  await test("migration SQL files remain local authority (005/006/007)", () => {
    const names = readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql"));
    assert.ok(names.some((n) => n.startsWith("005_")));
    assert.ok(names.some((n) => n.startsWith("006_")));
    assert.ok(names.some((n) => n.startsWith("007_")));
    console.log("  · migrations 005/006/007: present locally; 007 NOT APPLIED REMOTELY");
  });

  // Capture digests for the completion report.
  const workerSha = sha256Bytes(readFileSync(path.join(DIST, "hosted-worker.js")));
  const pageSha = sha256Bytes(readFileSync(path.join(DIST, "page-render.iife.js")));
  const infoSha = sha256Bytes(readFileSync(path.join(DIST, "BUILD_INFO.json")));
  console.log(`  · sha256 hosted-worker.js=${workerSha}`);
  console.log(`  · sha256 page-render.iife.js=${pageSha}`);
  console.log(`  · sha256 BUILD_INFO.json=${infoSha}`);

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
