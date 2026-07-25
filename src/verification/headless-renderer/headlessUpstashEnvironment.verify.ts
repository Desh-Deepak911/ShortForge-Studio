/**
 * Sprint 11E Phase 2D.1 — Upstash environment classification.
 * Run: npm run test:headless-upstash-environment
 */

import assert from "node:assert/strict";

import {
  classifyHeadlessUpstashConsumerEnvironment,
  classifyHeadlessUpstashProducerEnvironment,
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_QUEUE_PROTOCOL_VERSION,
  isHeadlessUpstashConsumerEnvironmentConfigured,
  isHeadlessUpstashProducerEnvironmentConfigured,
  readHeadlessQueueLeaseSettings,
} from "@/features/headless-renderer/control-plane";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function producerEnv(overrides: Record<string, string> = {}) {
  return {
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "token_value_0123456789",
    HEADLESS_ENV_NAME: "staging",
    ...overrides,
  };
}

function consumerEnv(overrides: Record<string, string> = {}) {
  return {
    UPSTASH_REDIS_TCP_URL: "rediss://default:pass@example.upstash.io:6379",
    HEADLESS_ENV_NAME: "staging",
    ...overrides,
  };
}

function main() {
  console.log("\nSprint 11E Phase 2D.1 — Upstash environment\n");

  test("protocol version frozen", () => {
    assert.equal(HEADLESS_QUEUE_PROTOCOL_VERSION, "hfq-dual-lease-v1");
  });

  test("producer all absent → unconfigured", () => {
    assert.equal(classifyHeadlessUpstashProducerEnvironment({}), "unconfigured");
    assert.equal(isHeadlessUpstashProducerEnvironmentConfigured({}), false);
  });

  test("producer valid → configured", () => {
    assert.equal(
      classifyHeadlessUpstashProducerEnvironment(producerEnv()),
      "configured",
    );
  });

  test("producer partial → invalid", () => {
    assert.equal(
      classifyHeadlessUpstashProducerEnvironment({
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      }),
      "invalid",
    );
  });

  test("producer http / bad env name → invalid", () => {
    assert.equal(
      classifyHeadlessUpstashProducerEnvironment(
        producerEnv({ UPSTASH_REDIS_REST_URL: "http://example.upstash.io" }),
      ),
      "invalid",
    );
    assert.equal(
      classifyHeadlessUpstashProducerEnvironment(
        producerEnv({ HEADLESS_ENV_NAME: "prod" }),
      ),
      "invalid",
    );
  });

  test("consumer rediss only; redis:// invalid", () => {
    assert.equal(
      classifyHeadlessUpstashConsumerEnvironment(consumerEnv()),
      "configured",
    );
    assert.equal(
      classifyHeadlessUpstashConsumerEnvironment(
        consumerEnv({
          UPSTASH_REDIS_TCP_URL: "redis://default:pass@example.upstash.io:6379",
        }),
      ),
      "invalid",
    );
    assert.equal(isHeadlessUpstashConsumerEnvironmentConfigured({}), false);
  });

  test("lease defaults and bounds", () => {
    const defaults = readHeadlessQueueLeaseSettings({});
    assert.ok(defaults);
    assert.equal(defaults!.deliveryIdleMs, HEADLESS_DEFAULT_DELIVERY_IDLE_MS);
    assert.equal(defaults!.renderClaimMs, HEADLESS_DEFAULT_RENDER_CLAIM_MS);
    assert.equal(
      readHeadlessQueueLeaseSettings({
        HEADLESS_REDIS_DELIVERY_IDLE_MS: "1000",
      }),
      null,
    );
    assert.equal(
      readHeadlessQueueLeaseSettings({
        HEADLESS_RENDER_CLAIM_LEASE_MS: "90000",
      })?.renderClaimMs,
      90_000,
    );
  });

  console.log(`\n${passed} tests passed.\n`);
}

main();
