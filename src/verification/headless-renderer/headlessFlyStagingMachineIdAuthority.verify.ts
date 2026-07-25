/**
 * Sprint 11E Phase 2E.2D.8A.2 — Fly Machine-ID authority.
 * Run: npm run test:headless-fly-staging-machine-id-authority
 */

import assert from "node:assert/strict";

import {
  HEADLESS_FLY_STAGING_MACHINE_ID_MAX_LENGTH,
  HEADLESS_FLY_STAGING_MACHINE_ID_MIN_LENGTH,
  HEADLESS_FLY_STAGING_MACHINE_ID_RE,
  isHeadlessFlyStagingMachineId,
  parseHeadlessFlyStagingMachineId,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-machine-id-authority";
import {
  classifyHeadlessFlyStagingQuietMachineList,
  parseHeadlessFlyStagingMachineListJson,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-machine-authority";
import { parseHeadlessFlyStagingDualMachineInventoryFromListJson } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-render-machine-authority";
import { parseHeadlessFlyStagingVerifyMachineFromListJson } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-secret-activation";

const LIVE_VERIFY_ID = "d895907a3de168";
const LIVE_RENDER_ID = "784503db505948";
const FIXTURE_VERIFY_ID = "abcd1234abcd1234";
const FIXTURE_RENDER_ID = "efgh5678efgh5678";
const ACCEPTED_DIGEST =
  "ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function machineRow(input: {
  readonly id: string;
  readonly group: "verify" | "render" | "other";
  readonly region?: string;
}): Record<string, unknown> {
  return {
    id: input.id,
    region: input.region ?? "iad",
    state: "started",
    config: {
      metadata: { fly_process_group: input.group },
      guest:
        input.group === "render"
          ? { cpu_kind: "performance", cpus: 4, memory_mb: 8192 }
          : { cpu_kind: "shared", cpus: 1, memory_mb: 2048 },
      image: `registry.fly.io/app@sha256:${ACCEPTED_DIGEST}`,
    },
  };
}

async function main() {
  console.log("\nSprint 11E Phase 2E.2D.8A.2 — Fly Machine-ID authority\n");

  await test("canonical bounds are frozen", () => {
    assert.equal(HEADLESS_FLY_STAGING_MACHINE_ID_MIN_LENGTH, 8);
    assert.equal(HEADLESS_FLY_STAGING_MACHINE_ID_MAX_LENGTH, 32);
    assert.equal(HEADLESS_FLY_STAGING_MACHINE_ID_RE.test(FIXTURE_VERIFY_ID), true);
    assert.equal(HEADLESS_FLY_STAGING_MACHINE_ID_RE.test(LIVE_VERIFY_ID), true);
  });

  await test("accepts live-shaped 14-character verify and render IDs", () => {
    assert.equal(parseHeadlessFlyStagingMachineId(LIVE_VERIFY_ID).ok, true);
    assert.equal(parseHeadlessFlyStagingMachineId(LIVE_RENDER_ID).ok, true);
    assert.equal(isHeadlessFlyStagingMachineId(LIVE_VERIFY_ID), true);
  });

  await test("accepts existing 16-character authority fixture IDs", () => {
    assert.equal(parseHeadlessFlyStagingMachineId(FIXTURE_VERIFY_ID).ok, true);
    assert.equal(parseHeadlessFlyStagingMachineId(FIXTURE_RENDER_ID).ok, true);
  });

  await test("rejects blank, short, oversized, non-alphanumeric, whitespace", () => {
    assert.equal(parseHeadlessFlyStagingMachineId("").reasonId, "blank");
    assert.equal(parseHeadlessFlyStagingMachineId(null).reasonId, "blank");
    assert.equal(parseHeadlessFlyStagingMachineId("abc").reasonId, "short");
    assert.equal(
      parseHeadlessFlyStagingMachineId("a".repeat(33)).reasonId,
      "oversized",
    );
    assert.equal(
      parseHeadlessFlyStagingMachineId("abcd-1234").reasonId,
      "non_alphanumeric",
    );
    assert.equal(
      parseHeadlessFlyStagingMachineId("abcd 1234").reasonId,
      "whitespace",
    );
    assert.equal(
      parseHeadlessFlyStagingMachineId("abcd\n1234").reasonId,
      "control_character",
    );
    assert.equal(parseHeadlessFlyStagingMachineId({}).reasonId, "hostile_input");
  });

  await test("mixed verify=1/render=1 inventory with live-shaped IDs", () => {
    const inv = parseHeadlessFlyStagingDualMachineInventoryFromListJson([
      machineRow({ id: LIVE_VERIFY_ID, group: "verify" }),
      machineRow({ id: LIVE_RENDER_ID, group: "render" }),
    ]);
    assert.equal(inv.verifyCount, 1);
    assert.equal(inv.renderCount, 1);
    assert.equal(inv.otherCount, 0);
    assert.equal(inv.verify?.machineId, LIVE_VERIFY_ID);
    assert.equal(inv.render?.machineId, LIVE_RENDER_ID);
    assert.equal(inv.verify?.imageDigestSha256, ACCEPTED_DIGEST);
  });

  await test("mixed verify=1/render=1 inventory with 16-character fixture IDs", () => {
    const inv = parseHeadlessFlyStagingDualMachineInventoryFromListJson([
      machineRow({ id: FIXTURE_VERIFY_ID, group: "verify" }),
      machineRow({ id: FIXTURE_RENDER_ID, group: "render" }),
    ]);
    assert.equal(inv.verifyCount, 1);
    assert.equal(inv.renderCount, 1);
    assert.equal(inv.otherCount, 0);
  });

  await test("regression: official 14-character rows must not collapse to zero inventory", () => {
    const inv = parseHeadlessFlyStagingDualMachineInventoryFromListJson([
      {
        id: LIVE_RENDER_ID,
        region: "iad",
        state: "started",
        config: {
          metadata: { fly_process_group: "render" },
          guest: { cpu_kind: "performance", cpus: 4, memory_mb: 8192 },
          image: `registry.fly.io/shortforge-hw-staging-4def8fa0@sha256:${ACCEPTED_DIGEST}`,
        },
      },
      {
        id: LIVE_VERIFY_ID,
        region: "iad",
        state: "started",
        config: {
          metadata: { fly_process_group: "verify" },
          guest: { cpu_kind: "shared", cpus: 1, memory_mb: 2048 },
          image: `registry.fly.io/shortforge-hw-staging-4def8fa0@sha256:${ACCEPTED_DIGEST}`,
        },
      },
    ]);
    assert.notEqual(inv.verifyCount, 0);
    assert.notEqual(inv.renderCount, 0);
    assert.equal(inv.verifyCount, 1);
    assert.equal(inv.renderCount, 1);
    assert.equal(inv.otherCount, 0);
  });

  await test("duplicate machine IDs are counted without collapsing inventory", () => {
    const inv = parseHeadlessFlyStagingDualMachineInventoryFromListJson([
      machineRow({ id: LIVE_VERIFY_ID, group: "verify" }),
      machineRow({ id: LIVE_VERIFY_ID, group: "verify" }),
    ]);
    assert.equal(inv.verifyCount, 2);
    assert.equal(inv.renderCount, 0);
  });

  await test("wrong process group increments otherCount", () => {
    const inv = parseHeadlessFlyStagingDualMachineInventoryFromListJson([
      machineRow({ id: LIVE_VERIFY_ID, group: "other" }),
    ]);
    assert.equal(inv.verifyCount, 0);
    assert.equal(inv.otherCount, 1);
  });

  await test("malformed provider JSON fails closed in machine list parser", () => {
    const cls = parseHeadlessFlyStagingMachineListJson("{not-json");
    assert.equal(cls.status, "invalid");
    assert.equal(cls.reasonId, "malformed_machine_list");
    const inv = parseHeadlessFlyStagingDualMachineInventoryFromListJson(
      "{not-json",
    );
    assert.equal(inv.verifyCount, 0);
    assert.equal(inv.renderCount, 0);
  });

  await test("16-character-only legacy regex would have rejected live inventory", () => {
    const legacy16 = /^[a-z0-9]{16}$/i;
    assert.equal(legacy16.test(LIVE_VERIFY_ID), false);
    assert.equal(legacy16.test(LIVE_RENDER_ID), false);
    assert.equal(parseHeadlessFlyStagingMachineId(LIVE_VERIFY_ID).ok, true);
  });

  await test("quiet machine list accepts live and fixture IDs", () => {
    const stdout = `${LIVE_VERIFY_ID}\n${FIXTURE_RENDER_ID}\n`;
    const cls = classifyHeadlessFlyStagingQuietMachineList(stdout, {
      listCommandSucceeded: true,
    });
    assert.equal(cls.status, "ok");
    if (cls.status === "ok") {
      assert.deepEqual(cls.machineIds, [LIVE_VERIFY_ID, FIXTURE_RENDER_ID]);
    }
  });

  await test("verify-only single-machine parser accepts 14-character live ID", () => {
    const snap = parseHeadlessFlyStagingVerifyMachineFromListJson([
      machineRow({ id: LIVE_VERIFY_ID, group: "verify" }),
    ]);
    assert.notEqual(snap, null);
    assert.equal(snap?.machineId, LIVE_VERIFY_ID);
    assert.equal(snap?.processGroup, "verify");
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
