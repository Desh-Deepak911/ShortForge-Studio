/**
 * Sprint 11E Phase 2D.1B — prove REST producer call shapes match @upstash/redis.
 * Run: npm run test:headless-upstash-rest-sdk-compat
 *
 * Does NOT contact providers. Does NOT change command syntax.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { Redis } from "@upstash/redis";

import {
  bindHeadlessUpstashRestClientFromRedis,
  type HeadlessUpstashRestClient,
} from "@/features/headless-renderer/control-plane/adapters/upstash-rest-queue-producer.adapter";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

/** Type-level: Redis.xadd / Redis.xtrim assignable to HeadlessUpstashRestClient. */
function assertSdkStructuralCompat(_client: HeadlessUpstashRestClient): void {
  void _client;
}

function main() {
  console.log("\nSprint 11E Phase 2D.1B — Upstash REST SDK compat\n");

  test("adapter source has no as-unknown-as HeadlessUpstashRestClient", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/adapters/upstash-rest-queue-producer.adapter.ts",
      ),
      "utf8",
    );
    assert.equal(src.includes("as unknown as HeadlessUpstashRestClient"), false);
    assert.ok(src.includes("bindHeadlessUpstashRestClientFromRedis"));
    assert.ok(src.includes('xadd(stream, "*", fields)'));
    assert.ok(src.includes('strategy: "MAXLEN"'));
    assert.ok(src.includes('exactness: "~"'));
  });

  test("Redis instance methods bind without cast", () => {
    // Construct without network — bind only uses method references.
    const redis = new Redis({
      url: "https://example.upstash.io",
      token: "token_value_0123456789",
    });
    const client = bindHeadlessUpstashRestClientFromRedis(redis);
    assertSdkStructuralCompat(client);
    assert.equal(typeof client.xadd, "function");
    assert.equal(typeof client.xtrim, "function");
  });

  test("HeadlessUpstashRestClient call arity matches SDK CommandArgs", () => {
    // Compile-time proof via satisfies against a typed stub matching Redis.
    const stub = {
      xadd: async (
        key: string,
        id: "*" | `${number}-*` | string,
        entries: Record<string, unknown>,
      ): Promise<string> => {
        void key;
        void id;
        void entries;
        return "1-0";
      },
      xtrim: async (
        key: string,
        opts: {
          strategy: "MAXLEN" | "MINID";
          exactness?: "~" | "=";
          threshold: number | string;
          limit?: number;
        },
      ): Promise<number> => {
        void key;
        void opts;
        return 0;
      },
    } satisfies Pick<Redis, "xadd" | "xtrim">;

    const bound = bindHeadlessUpstashRestClientFromRedis(stub);
    assertSdkStructuralCompat(bound);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main();
