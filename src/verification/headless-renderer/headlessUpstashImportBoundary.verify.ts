/**
 * Sprint 11E Phase 2D.1 — Upstash import / privacy / composition boundary.
 * Run: npm run test:headless-upstash-import-boundary
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  classifyHeadlessUpstashProducerEnvironment,
  composeProductionHeadlessControlPlane,
} from "@/features/headless-renderer/control-plane";

const ROOT = path.resolve(__dirname, "../..");
const FEATURE = path.join(ROOT, "features/headless-renderer");

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "migrations") continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  console.log("\nSprint 11E Phase 2D.1 — Upstash import boundary\n");

  test("production availability remains false", () => {
    const prod = composeProductionHeadlessControlPlane();
    assert.equal(prod.productionAvailable, false);
    assert.equal(prod.canCreateJob, false);
    assert.equal(prod.reason, "CONFIGURATION_UNAVAILABLE");
  });

  test("classification alone does not flip productionAvailable", () => {
    const status = classifyHeadlessUpstashProducerEnvironment({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token_value_0123456789",
      HEADLESS_ENV_NAME: "staging",
    });
    assert.equal(status, "configured");
    const prod = composeProductionHeadlessControlPlane();
    assert.equal(prod.productionAvailable, false);
  });

  test("no @upstash/redis or ioredis in product / domain / components", () => {
    const blockedDirs = [
      path.join(FEATURE, "product"),
      path.join(FEATURE, "domain"),
      path.join(ROOT, "components"),
    ];
    const hits: string[] = [];
    for (const dir of blockedDirs) {
      if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue;
      for (const file of walk(dir)) {
        const src = readFileSync(file, "utf8");
        if (
          src.includes("@upstash/redis") ||
          src.includes("ioredis") ||
          src.includes("FakeRedisStreams") ||
          src.includes("UpstashRestQueueProducerAdapter") ||
          src.includes("UpstashTcpStreamConsumerAdapter")
        ) {
          hits.push(path.relative(ROOT, file));
        }
      }
    }
    assert.deepEqual(hits, []);
  });

  test("ioredis only under worker/", () => {
    const files = walk(FEATURE);
    const ioredisImporters = files.filter((f) =>
      readFileSync(f, "utf8").includes('from "ioredis"') ||
      readFileSync(f, "utf8").includes("from 'ioredis'"),
    );
    for (const f of ioredisImporters) {
      const rel = path.relative(FEATURE, f);
      assert.ok(
        rel.startsWith("worker/"),
        `unexpected ioredis import: ${rel}`,
      );
    }
  });

  test("@upstash/redis only under control-plane adapters", () => {
    const files = walk(FEATURE);
    const upstashImporters = files.filter((f) =>
      readFileSync(f, "utf8").includes("@upstash/redis"),
    );
    assert.ok(upstashImporters.length >= 1);
    for (const f of upstashImporters) {
      const rel = path.relative(path.join(FEATURE, "control-plane"), f);
      assert.ok(
        rel.startsWith("adapters/"),
        `unexpected @upstash/redis import: ${rel}`,
      );
    }
  });

  test("REST producer adapter has no as-unknown-as client cast", () => {
    const src = readFileSync(
      path.join(
        FEATURE,
        "control-plane/adapters/upstash-rest-queue-producer.adapter.ts",
      ),
      "utf8",
    );
    assert.equal(src.includes("as unknown as HeadlessUpstashRestClient"), false);
    assert.ok(src.includes("bindHeadlessUpstashRestClientFromRedis"));
  });

  test("production barrel excludes REST/TCP adapters and FakeRedis", () => {
    const prodIndex = readFileSync(
      path.join(FEATURE, "control-plane/index.ts"),
      "utf8",
    );
    // Unavailable* is allowed; concrete REST/TCP adapters are not.
    assert.equal(
      /(?<!Unavailable)UpstashRestQueueProducerAdapter/.test(prodIndex),
      false,
    );
    assert.equal(
      prodIndex.includes("./adapters/upstash-rest-queue-producer"),
      false,
    );
    assert.equal(prodIndex.includes("UpstashTcpStreamConsumerAdapter"), false);
    assert.equal(prodIndex.includes("fake-redis-streams"), false);
    assert.equal(prodIndex.includes("FakeRedisStreams"), false);
    assert.equal(prodIndex.includes("@upstash/redis"), false);
    assert.equal(prodIndex.includes("ioredis"), false);
    assert.equal(
      prodIndex.includes("readConfiguredHeadlessUpstashProducerConfig"),
      false,
    );
    assert.equal(
      prodIndex.includes("readConfiguredHeadlessUpstashConsumerConfig"),
      false,
    );
  });

  test("production barrel exports classifiers + Unavailable + protocol", () => {
    const prodIndex = readFileSync(
      path.join(FEATURE, "control-plane/index.ts"),
      "utf8",
    );
    assert.ok(prodIndex.includes("classifyHeadlessUpstashProducerEnvironment"));
    assert.ok(prodIndex.includes("classifyHeadlessUpstashConsumerEnvironment"));
    assert.ok(prodIndex.includes("UnavailableUpstashRestQueueProducerAdapter"));
    assert.ok(prodIndex.includes("HEADLESS_QUEUE_PROTOCOL_VERSION"));
    assert.ok(prodIndex.includes("deriveHeadlessQueueStreamNames"));
    assert.ok(prodIndex.includes("consumeRenderDeliveryOnce"));
    assert.ok(prodIndex.includes("stableHeadlessVerifyDeliveryId"));
    // QA run-scoped bindings stay harness-only (Sprint 11E 2D.1F / 2D.1G).
    assert.equal(prodIndex.includes("deriveQaRunScopedStreamBinding"), false);
    assert.equal(prodIndex.includes("qa-run-stream-names"), false);
    assert.equal(prodIndex.includes("qa-run-scoped-stream-key"), false);
    assert.equal(prodIndex.includes("createQaRunScopedTcpDlqWriter"), false);
    assert.equal(prodIndex.includes("qa-run-scoped-dlq"), false);
  });

  test("compose reports upstash status and never TCP consumer", () => {
    const prod = composeProductionHeadlessControlPlane();
    assert.ok(
      prod.upstashProducerEnvironmentStatus === "unconfigured" ||
        prod.upstashProducerEnvironmentStatus === "configured" ||
        prod.upstashProducerEnvironmentStatus === "invalid",
    );
    assert.equal(typeof prod.upstashProducerConfigured, "boolean");
    assert.equal(prod.productionAvailable, false);
    const composeSrc = readFileSync(
      path.join(
        FEATURE,
        "control-plane/runtime/compose-production-control-plane.ts",
      ),
      "utf8",
    );
    assert.equal(composeSrc.includes("UpstashTcpStreamConsumerAdapter"), false);
    assert.equal(composeSrc.includes("ioredis"), false);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main();
