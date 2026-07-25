/**
 * Sprint 11E Phase 2E.2D.7A — Amended Fly verify live readiness authority.
 * Run: npm run test:headless-fly-verify-live-readiness-authority
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  FLY_VERIFY_LIVE_ACCEPTED_IMAGE_DIGEST,
} from "./fly-verify-live/evidence-authority";
import { parseHeadlessFlyStagingSecretsListJson } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-secret-activation";

import {
  classifyFlyVerifyLiveAmendedReadiness,
  classifyFlyVerifyLiveOperationalHeartbeatReadiness,
  classifyFlyVerifyLiveStartupDirectReadiness,
  FLY_VERIFY_LIVE_READINESS_HEARTBEAT_MIN_GAP_MS,
  FLY_VERIFY_LIVE_READINESS_OBSERVATION_WINDOW_MS,
  parseFlyVerifyLogHostedEvents,
} from "./fly-verify-live/fly-verify-live-readiness";
import { HOSTED_WORKER_DELIVERY_GATED_BY_SCHEMA_PREFLIGHT } from "./fly-verify-live/hosted-worker-startup-ordering";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const VERIFY_MACHINE_ID = "d895907a3de168";
const OTHER_MACHINE_ID = "abc12345deadbeef";
const ACCEPTED_DIGEST = FLY_VERIFY_LIVE_ACCEPTED_IMAGE_DIGEST;

function machinesJson(input: {
  readonly machineId?: string;
  readonly digest?: string;
  readonly state?: string;
  readonly region?: string;
  readonly cpus?: number;
  readonly memoryMb?: number;
  readonly cpuKind?: string;
  readonly verifyCount?: number;
  readonly renderCount?: number;
} = {}): string {
  const verifyCount = input.verifyCount ?? 1;
  const renderCount = input.renderCount ?? 0;
  const rows = [];
  if (verifyCount === 1) {
    rows.push({
      id: input.machineId ?? VERIFY_MACHINE_ID,
      region: input.region ?? "iad",
      state: input.state ?? "started",
      config: {
        metadata: { fly_process_group: "verify" },
        guest: {
          cpu_kind: input.cpuKind ?? "shared",
          cpus: input.cpus ?? 1,
          memory_mb: input.memoryMb ?? 2048,
        },
        image: `@sha256:${input.digest ?? ACCEPTED_DIGEST}`,
      },
    });
  }
  for (let i = 0; i < renderCount; i += 1) {
    rows.push({
      id: `render${i}`,
      region: "iad",
      state: "started",
      config: {
        metadata: { fly_process_group: "render" },
        guest: { cpu_kind: "performance", cpus: 4, memory_mb: 8192 },
        image: `@sha256:${ACCEPTED_DIGEST}`,
      },
    });
  }
  return JSON.stringify(rows);
}

const deployedSecrets = parseHeadlessFlyStagingSecretsListJson(
  JSON.stringify(
    [
      "DATABASE_URL",
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_ASSETS",
      "R2_BUCKET_ARTIFACTS",
      "R2_ENDPOINT",
      "HEADLESS_ALLOWED_ORIGINS",
      "UPSTASH_REDIS_TCP_URL",
    ].map((name) => ({ Name: name, Status: "Deployed" })),
  ),
  { listCommandSucceeded: true },
)!;

function heartbeatLine(
  iso: string,
  machineId: string,
  action = "dispatch_sweep",
): string {
  return `${iso} app[${machineId}] iad [info]${JSON.stringify({
    name: "hosted.loop.delivery",
    atMs: Date.parse(iso),
    mode: "verify",
    reasonId: "dispatch_outbox_sweep",
    action,
  })}`;
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.7A — Fly verify live readiness authority\n",
  );

  await test("startup-ordering contract is enforced", () => {
    assert.equal(HOSTED_WORKER_DELIVERY_GATED_BY_SCHEMA_PREFLIGHT, true);
    const entrypoint = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/worker/hosted/hosted-entrypoint.ts",
      ),
      "utf8",
    );
    assert.match(entrypoint, /hosted\.schema\.preflight/);
    assert.match(entrypoint, /Only after schema PASS/);
    assert.doesNotMatch(
      entrypoint.slice(0, entrypoint.indexOf("hosted.schema.preflight")),
      /hosted\.loop\.delivery/,
    );
  });

  await test("rule A accepts direct startup events", () => {
    const logs = [
      '{"name":"hosted.schema.preflight","atMs":1,"mode":"verify","status":"ok","reasonId":"schema_preflight_ok"}',
      '{"name":"hosted.loop.started","atMs":2,"mode":"verify","status":"ok"}',
    ].join("\n");
    const events = parseFlyVerifyLogHostedEvents(logs);
    const result = classifyFlyVerifyLiveStartupDirectReadiness({ events });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.path, "startup_direct");
      assert.equal(result.schemaReadiness, "direct_log");
    }
  });

  await test("rule B accepts bounded operational heartbeats", () => {
    const nowMs = Date.parse("2026-07-22T19:20:00.000Z");
    const logs = [
      heartbeatLine("2026-07-22T19:18:30.000Z", VERIFY_MACHINE_ID),
      heartbeatLine("2026-07-22T19:19:00.000Z", VERIFY_MACHINE_ID),
    ].join("\n");
    const events = parseFlyVerifyLogHostedEvents(logs);
    const result = classifyFlyVerifyLiveOperationalHeartbeatReadiness({
      events,
      verifyMachineId: VERIFY_MACHINE_ID,
      nowMs,
      observationWindowMs: FLY_VERIFY_LIVE_READINESS_OBSERVATION_WINDOW_MS,
      minHeartbeatGapMs: FLY_VERIFY_LIVE_READINESS_HEARTBEAT_MIN_GAP_MS,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.loopReadiness, "operational_heartbeat");
      assert.equal(result.schemaReadiness, "implied_by_gated_startup");
      assert.equal(result.startupLogRetention, "expired");
    }
  });

  await test("rule B rejects stale latest heartbeat", () => {
    const nowMs = Date.parse("2026-07-22T19:20:00.000Z");
    const logs = [
      heartbeatLine("2026-07-22T19:17:00.000Z", VERIFY_MACHINE_ID),
      heartbeatLine("2026-07-22T19:17:30.000Z", VERIFY_MACHINE_ID),
    ].join("\n");
    const result = classifyFlyVerifyLiveOperationalHeartbeatReadiness({
      events: parseFlyVerifyLogHostedEvents(logs),
      verifyMachineId: VERIFY_MACHINE_ID,
      nowMs,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failClass, "stale_latest_heartbeat");
    }
  });

  await test("rule B rejects wrong machine heartbeat", () => {
    const nowMs = Date.parse("2026-07-22T19:20:00.000Z");
    const logs = [
      heartbeatLine("2026-07-22T19:19:00.000Z", OTHER_MACHINE_ID),
      heartbeatLine("2026-07-22T19:19:30.000Z", OTHER_MACHINE_ID),
    ].join("\n");
    const result = classifyFlyVerifyLiveOperationalHeartbeatReadiness({
      events: parseFlyVerifyLogHostedEvents(logs),
      verifyMachineId: VERIFY_MACHINE_ID,
      nowMs,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failClass, "foreign_machine_event");
    }
  });

  await test("rule B rejects fatal/exit/schema-failure events", () => {
    const nowMs = Date.parse("2026-07-22T19:20:00.000Z");
    const logs = [
      heartbeatLine("2026-07-22T19:19:00.000Z", VERIFY_MACHINE_ID),
      `2026-07-22T19:19:20.000Z app[${VERIFY_MACHINE_ID}] iad [info]${JSON.stringify({ name: "hosted.process.exit", atMs: nowMs, mode: "verify", status: "failed" })}`,
      heartbeatLine("2026-07-22T19:19:40.000Z", VERIFY_MACHINE_ID),
    ].join("\n");
    const result = classifyFlyVerifyLiveOperationalHeartbeatReadiness({
      events: parseFlyVerifyLogHostedEvents(logs),
      verifyMachineId: VERIFY_MACHINE_ID,
      nowMs,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failClass, "forbidden_event_in_window");
    }
  });

  await test("rule B rejects restart observed in observation window", () => {
    const nowMs = Date.parse("2026-07-22T19:20:00.000Z");
    const logs = [
      heartbeatLine("2026-07-22T19:19:00.000Z", VERIFY_MACHINE_ID),
      `2026-07-22T19:19:10.000Z app[${VERIFY_MACHINE_ID}] iad [info]${JSON.stringify({ name: "hosted.loop.started", atMs: nowMs, mode: "verify", status: "ok" })}`,
      heartbeatLine("2026-07-22T19:19:40.000Z", VERIFY_MACHINE_ID),
    ].join("\n");
    const result = classifyFlyVerifyLiveOperationalHeartbeatReadiness({
      events: parseFlyVerifyLogHostedEvents(logs),
      verifyMachineId: VERIFY_MACHINE_ID,
      nowMs,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failClass, "restart_observed_in_window");
    }
  });

  await test("rule B rejects no heartbeat", () => {
    const nowMs = Date.parse("2026-07-22T19:20:00.000Z");
    const result = classifyFlyVerifyLiveOperationalHeartbeatReadiness({
      events: parseFlyVerifyLogHostedEvents(""),
      verifyMachineId: VERIFY_MACHINE_ID,
      nowMs,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failClass, "insufficient_heartbeats");
    }
  });

  await test("amended readiness rejects wrong image digest", () => {
    const nowMs = Date.parse("2026-07-22T19:20:00.000Z");
    const logs = [
      heartbeatLine("2026-07-22T19:19:00.000Z", VERIFY_MACHINE_ID),
      heartbeatLine("2026-07-22T19:19:30.000Z", VERIFY_MACHINE_ID),
    ].join("\n");
    const result = classifyFlyVerifyLiveAmendedReadiness({
      machinesJson: machinesJson({ digest: "b".repeat(64) }),
      servicesJson: "[]",
      secretLedger: deployedSecrets,
      logsText: logs,
      nowMs,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failClass, "image_digest_mismatch");
    }
  });

  await test("amended readiness accepts operational heartbeat end-to-end", () => {
    const nowMs = Date.parse("2026-07-22T19:20:00.000Z");
    const logs = [
      heartbeatLine("2026-07-22T19:19:00.000Z", VERIFY_MACHINE_ID),
      heartbeatLine("2026-07-22T19:19:30.000Z", VERIFY_MACHINE_ID),
    ].join("\n");
    const result = classifyFlyVerifyLiveAmendedReadiness({
      machinesJson: machinesJson(),
      servicesJson: "[]",
      secretLedger: deployedSecrets,
      logsText: logs,
      nowMs,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.loopReadiness, "operational_heartbeat");
      assert.equal(result.schemaReadiness, "implied_by_gated_startup");
      assert.equal(result.startupLogRetention, "expired");
    }
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
