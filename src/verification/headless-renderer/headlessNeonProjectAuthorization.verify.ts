/**
 * Sprint 11E Phase 2B.2 — Neon project authorization adapter.
 * Run: npm run test:headless-neon-project-authorization
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  InMemoryHeadlessSqlFixture,
  NeonHeadlessProjectAuthorizationAdapter,
  ScriptedHeadlessSqlExecutor,
} from "@/features/headless-renderer/control-plane/testing";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const principal = { ownerId: "owner_a", sessionId: "sess_a" as string | null };
const other = { ownerId: "owner_b", sessionId: "sess_b" as string | null };

async function main() {
  console.log("\nSprint 11E Phase 2B.2 — Neon project authorization\n");

  await test("first claim succeeds", async () => {
    const sql = new InMemoryHeadlessSqlFixture();
    const auth = new NeonHeadlessProjectAuthorizationAdapter(sql);
    const projectId = randomUUID();
    const result = await auth.claimUnownedProject(principal, projectId);
    assert.equal(result.ok, true);
    assert.equal(sql.ownership.get(projectId)?.owner_id, "owner_a");
  });

  await test("same-owner replay succeeds", async () => {
    const sql = new InMemoryHeadlessSqlFixture();
    const auth = new NeonHeadlessProjectAuthorizationAdapter(sql);
    const projectId = randomUUID();
    assert.equal((await auth.claimUnownedProject(principal, projectId)).ok, true);
    assert.equal((await auth.claimUnownedProject(principal, projectId)).ok, true);
  });

  await test("competing owner → FORBIDDEN", async () => {
    const sql = new InMemoryHeadlessSqlFixture();
    const auth = new NeonHeadlessProjectAuthorizationAdapter(sql);
    const projectId = randomUUID();
    assert.equal((await auth.claimUnownedProject(principal, projectId)).ok, true);
    const denied = await auth.claimUnownedProject(other, projectId);
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.issues[0]?.code, "FORBIDDEN");
    assert.equal(sql.ownership.get(projectId)?.owner_id, "owner_a");
  });

  await test("UUID v4 enforcement", async () => {
    const sql = new InMemoryHeadlessSqlFixture();
    const auth = new NeonHeadlessProjectAuthorizationAdapter(sql);
    const rejected = await auth.claimUnownedProject(principal, "project-1");
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.issues[0]?.code, "INVALID_TRANSPORT");
  });

  await test("assertProjectAccess missing/wrong owner → FORBIDDEN", async () => {
    const sql = new InMemoryHeadlessSqlFixture();
    const auth = new NeonHeadlessProjectAuthorizationAdapter(sql);
    const projectId = randomUUID();
    const missing = await auth.assertProjectAccess(principal, projectId);
    assert.equal(missing.ok, false);
    await auth.claimUnownedProject(principal, projectId);
    const wrong = await auth.assertProjectAccess(other, projectId);
    assert.equal(wrong.ok, false);
    if (!wrong.ok) assert.equal(wrong.issues[0]?.code, "FORBIDDEN");
    assert.equal((await auth.assertProjectAccess(principal, projectId)).ok, true);
  });

  await test("malformed row → fail closed", async () => {
    const sql = new ScriptedHeadlessSqlExecutor([
      { kind: "rows", rows: [] }, // insert ignored
      {
        kind: "rows",
        rows: [{ project_id: "not-uuid", owner_id: "owner_a", created_at_ms: 1 }],
      },
    ]);
    const auth = new NeonHeadlessProjectAuthorizationAdapter(sql);
    const result = await auth.claimUnownedProject(principal, randomUUID());
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.issues[0]?.code, "JOB_STORE_COHERENCE_REJECTED");
    }
  });

  await test("connection failure → DATABASE_UNAVAILABLE", async () => {
    const sql = new InMemoryHeadlessSqlFixture();
    sql.injectConnectionFailure();
    const auth = new NeonHeadlessProjectAuthorizationAdapter(sql);
    const result = await auth.claimUnownedProject(principal, randomUUID());
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.issues[0]?.code, "DATABASE_UNAVAILABLE");
      assert.equal(JSON.stringify(result).includes("postgresql"), false);
      assert.equal(result.issues[0]?.message.includes("ECONN"), false);
    }
  });

  await test("parameterized SQL only + no secret logging", async () => {
    const sql = new InMemoryHeadlessSqlFixture();
    const auth = new NeonHeadlessProjectAuthorizationAdapter(sql);
    const projectId = randomUUID();
    await auth.claimUnownedProject(principal, projectId);
    assert.ok(sql.queries.length >= 2);
    for (const q of sql.queries) {
      assert.equal(q.text.includes(projectId), false); // bound as params, not interpolated
      assert.equal(/\$\d/.test(q.text) || /BEGIN|COMMIT|ROLLBACK/i.test(q.text), true);
      assert.ok(!("params" in q));
    }
  });

  await test("transaction rollback on query failure", async () => {
    const sql = new ScriptedHeadlessSqlExecutor([
      { kind: "query_failure" },
    ]);
    const auth = new NeonHeadlessProjectAuthorizationAdapter(sql);
    const result = await auth.claimUnownedProject(principal, randomUUID());
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.issues[0]?.code, "DATABASE_UNAVAILABLE");
    }
    assert.equal(sql.transactionRolledBack, true);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main();
