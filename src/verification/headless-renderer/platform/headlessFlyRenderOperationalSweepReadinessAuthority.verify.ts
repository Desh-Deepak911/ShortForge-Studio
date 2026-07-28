/**
 * Sprint 11E Phase 2E.2D.8F.7.2B / 8F.7.2D — render operational dispatch-sweep readiness authority.
 * Run: npm run test:headless-fly-render-operational-sweep-readiness-authority
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  resolveCurrentFlyStagingAcceptedImageDigestSha256,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";
import { parseHeadlessFlyStagingSecretsListJson } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-secret-activation";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/worker-types";

import {
  classifyFlyRenderLiveAmendedReadiness,
  classifyFlyRenderLiveOperationalDispatchSweepReadiness,
  classifyFlyRenderLiveOperationalHeartbeat,
  FLY_RENDER_LIVE_READINESS_HEARTBEAT_MIN_GAP_MS,
  renderReadinessAttributionToSafeFacts,
} from "../fly-render-live/fly-render-live-readiness";
import { HOSTED_WORKER_DELIVERY_GATED_BY_SCHEMA_PREFLIGHT } from "../fly-render-live/hosted-worker-startup-ordering";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const RENDER_MACHINE_ID = "d895d16f264918";
const VERIFY_MACHINE_ID = "d895d12a240938";
const OTHER_MACHINE_ID = "abc12345deadbeef";
const ACCEPTED_DIGEST = resolveCurrentFlyStagingAcceptedImageDigestSha256();
const APP = "shortforge-hw-staging-4def8fa0";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
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

function machinesJson(input: {
  readonly verifyDigest?: string;
  readonly renderDigest?: string;
  readonly verifyState?: string;
  readonly renderState?: string;
  readonly verifyUpdatedAt?: string;
  readonly renderUpdatedAt?: string;
} = {}): string {
  return JSON.stringify([
    {
      id: VERIFY_MACHINE_ID,
      region: "iad",
      state: input.verifyState ?? "started",
      updated_at: input.verifyUpdatedAt ?? "2026-07-24T08:00:00.000Z",
      config: {
        metadata: { fly_process_group: "verify" },
        guest: { cpu_kind: "shared", cpus: 1, memory_mb: 2048 },
        image: `@sha256:${input.verifyDigest ?? ACCEPTED_DIGEST}`,
      },
    },
    {
      id: RENDER_MACHINE_ID,
      region: "iad",
      state: input.renderState ?? "started",
      updated_at: input.renderUpdatedAt ?? "2026-07-24T08:00:00.000Z",
      config: {
        metadata: { fly_process_group: "render" },
        guest: { cpu_kind: "performance", cpus: 4, memory_mb: 8192 },
        image: `@sha256:${input.renderDigest ?? ACCEPTED_DIGEST}`,
      },
    },
  ]);
}

function sweepLine(
  iso: string,
  machineId: string,
  action = "dispatch_sweep",
  mode = "render",
): string {
  return `${iso} app[${machineId}] iad [info]${JSON.stringify({
    name: "hosted.loop.delivery",
    atMs: Date.parse(iso),
    mode,
    action,
    reasonId: action === "dispatch_sweep" ? "dispatch_outbox_sweep" : action,
  })}`;
}

function amended(input: {
  readonly logsText: string;
  readonly nowMs: number;
  readonly rolloutObservationBoundaryMs?: number;
  readonly machinesJson?: string;
}) {
  return classifyFlyRenderLiveAmendedReadiness({
    appName: APP,
    machinesJson: input.machinesJson ?? machinesJson(),
    servicesJson: "[]",
    secretLedger: deployedSecrets,
    logsText: input.logsText,
    nowMs: input.nowMs,
    expectedImageDigestSha256: ACCEPTED_DIGEST,
    rolloutObservationBoundaryMs: input.rolloutObservationBoundaryMs,
  });
}

function dispatchSweepInput(input: {
  readonly events: Parameters<
    typeof classifyFlyRenderLiveOperationalDispatchSweepReadiness
  >[0]["events"];
  readonly nowMs: number;
  readonly rolloutObservationBoundaryMs: number;
}) {
  return {
    events: input.events,
    renderMachineId: RENDER_MACHINE_ID,
    verifyMachineId: VERIFY_MACHINE_ID,
    nowMs: input.nowMs,
    rolloutObservationBoundaryMs: input.rolloutObservationBoundaryMs,
  };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8F.7.2D — shared-log machine partitioning readiness\n",
  );

  await test("accepted probe evidence SHAs remain byte-identical", () => {
    const shas = {
      current:
        "d23acb8c1b25db87319018c7899128f75e30938a986c5725756d7fc334dd44ef",
      preRun:
        "535c7cc07f06866ebbc148ff9cd406e0d01bb1285505bcecf56db4e289b806f0",
      prior:
        "f9042d8067b9189f56bbd3c11fa2beb267fca6e976930da407351f4f42928082",
      diag:
        "da861f68858a48ab330804e36c9d9dd0c2e8e586f11dd4a6736f6fbb51f0ffc4",
    };
    assert.equal(
      createHash("sha256")
        .update(readFileSync(path.join(ROOT, "docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.md")))
        .digest("hex"),
      shas.current,
    );
    assert.equal(
      createHash("sha256")
        .update(
          readFileSync(
            path.join(
              ROOT,
              `docs/evidence/headless/archive/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-run-${shas.preRun}.md`,
            ),
          ),
        )
        .digest("hex"),
      shas.preRun,
    );
    assert.equal(
      createHash("sha256")
        .update(readFileSync(path.join(ROOT, "docs/evidence/headless/current/HEADLESS_11E_FLY_CLAIMED_RENDER_DIAGNOSTIC.md")))
        .digest("hex"),
      shas.diag,
    );
  });

  await test("startup-ordering contract: dispatch scheduler after schema preflight", () => {
    assert.equal(HOSTED_WORKER_DELIVERY_GATED_BY_SCHEMA_PREFLIGHT, true);
    const entrypoint = readFileSync(
      path.join(
        ROOT,
        "src/features/headless-renderer/worker/hosted/hosted-entrypoint.ts",
      ),
      "utf8",
    );
    assert.match(entrypoint, /hosted\.schema\.preflight/);
    assert.match(entrypoint, /createRenderDispatchOutboxScheduler/);
    const schemaIdx = entrypoint.indexOf('name: "hosted.schema.preflight"');
    const dispatchIdx = entrypoint.indexOf("const dispatch = createRenderDispatchOutboxScheduler");
    assert.ok(schemaIdx >= 0 && dispatchIdx > schemaIdx);
    assert.match(entrypoint, /action: result\.ok \? "dispatch_sweep"/);
  });

  await test("two valid current sweeps → PASS operational_dispatch_sweep", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const boundary = Date.parse("2026-07-24T08:30:00.000Z");
    const logs = [
      sweepLine("2026-07-24T09:57:10.000Z", RENDER_MACHINE_ID),
      sweepLine("2026-07-24T09:58:20.000Z", RENDER_MACHINE_ID),
    ].join("\n");
    const result = amended({ logsText: logs, nowMs, rolloutObservationBoundaryMs: boundary });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.path, "operational_dispatch_sweep");
    assert.equal(result.loopReadiness, "operational_dispatch_sweep");
    assert.equal(result.schemaReadiness, "implied_by_gated_startup");
    assert.equal(result.attribution.readiness_path, "operational_dispatch_sweep");
    assert.equal(result.attribution.sweep_sequence, "monotonic");
    assert.equal(result.attribution.fatal_window, "clear");
    assert.equal(result.attribution.machine_partition, "exact");
  });

  await test("interleaved valid verify/render sweeps → PASS", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const boundary = Date.parse("2026-07-24T08:30:00.000Z");
    const logs = [
      sweepLine("2026-07-24T09:57:10.000Z", RENDER_MACHINE_ID),
      sweepLine("2026-07-24T09:57:10.000Z", VERIFY_MACHINE_ID, "dispatch_sweep", "verify"),
      sweepLine("2026-07-24T09:58:20.000Z", VERIFY_MACHINE_ID, "dispatch_sweep", "verify"),
      sweepLine("2026-07-24T09:58:20.000Z", RENDER_MACHINE_ID),
    ].join("\n");
    const result = amended({ logsText: logs, nowMs, rolloutObservationBoundaryMs: boundary });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.path, "operational_dispatch_sweep");
    const facts = renderReadinessAttributionToSafeFacts(result.attribution);
    assert.equal(facts.verify_events_ignored, "2");
    assert.equal(facts.machine_partition, "exact");
  });

  await test("many verify sweeps plus two render sweeps → PASS", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const boundary = Date.parse("2026-07-24T08:30:00.000Z");
    const lines: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const iso = `2026-07-24T09:57:${String(10 + i).padStart(2, "0")}.000Z`;
      lines.push(sweepLine(iso, VERIFY_MACHINE_ID, "dispatch_sweep", "verify"));
    }
    lines.push(sweepLine("2026-07-24T09:58:10.000Z", RENDER_MACHINE_ID));
    lines.push(sweepLine("2026-07-24T09:59:20.000Z", RENDER_MACHINE_ID));
    const result = amended({
      logsText: lines.join("\n"),
      nowMs,
      rolloutObservationBoundaryMs: boundary,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(
        result.attribution.verify_events_ignored != null &&
          result.attribution.verify_events_ignored >= 8,
        true,
      );
    }
  });

  await test("three valid sweeps → PASS", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const boundary = Date.parse("2026-07-24T08:30:00.000Z");
    const logs = [
      sweepLine("2026-07-24T09:57:00.000Z", RENDER_MACHINE_ID),
      sweepLine("2026-07-24T09:58:10.000Z", RENDER_MACHINE_ID),
      sweepLine("2026-07-24T09:59:20.000Z", RENDER_MACHINE_ID),
    ].join("\n");
    const result = amended({ logsText: logs, nowMs, rolloutObservationBoundaryMs: boundary });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.path, "operational_dispatch_sweep");
  });

  await test("one sweep → FAIL insufficient_dispatch_sweeps", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const boundary = Date.parse("2026-07-24T08:30:00.000Z");
    const result = classifyFlyRenderLiveOperationalDispatchSweepReadiness(
      dispatchSweepInput({
      events: [
        {
          name: "hosted.loop.delivery",
          atMs: Date.parse("2026-07-24T09:58:20.000Z"),
          logTimestampMs: Date.parse("2026-07-24T09:58:20.000Z"),
          mode: "render",
          status: null,
          reasonId: "dispatch_outbox_sweep",
          action: "dispatch_sweep",
          machineId: RENDER_MACHINE_ID,
        },
      ],
      nowMs,
      rolloutObservationBoundaryMs: boundary,
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failClass, "insufficient_dispatch_sweeps");
  });

  await test("stale sweeps → FAIL stale_latest_sweep", () => {
    const nowMs = Date.parse("2026-07-24T12:00:00.000Z");
    const boundary = Date.parse("2026-07-24T08:30:00.000Z");
    const logs = [
      sweepLine("2026-07-24T11:57:10.000Z", RENDER_MACHINE_ID),
      sweepLine("2026-07-24T11:57:20.000Z", RENDER_MACHINE_ID),
    ].join("\n");
    const result = amended({ logsText: logs, nowMs, rolloutObservationBoundaryMs: boundary });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failClass, "stale_latest_sweep");
  });

  await test("pre-boundary sweeps → FAIL insufficient_dispatch_sweeps", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const boundary = Date.parse("2026-07-24T09:58:00.000Z");
    const logs = [
      sweepLine("2026-07-24T09:57:10.000Z", RENDER_MACHINE_ID),
      sweepLine("2026-07-24T09:57:50.000Z", RENDER_MACHINE_ID),
    ].join("\n");
    const result = amended({ logsText: logs, nowMs, rolloutObservationBoundaryMs: boundary });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failClass, "insufficient_dispatch_sweeps");
  });

  await test("wrong Machine render sweeps → FAIL unknown_machine_render_sweep", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const boundary = Date.parse("2026-07-24T08:30:00.000Z");
    const logs = [
      sweepLine("2026-07-24T09:57:10.000Z", OTHER_MACHINE_ID),
      sweepLine("2026-07-24T09:58:20.000Z", OTHER_MACHINE_ID),
    ].join("\n");
    const result = amended({ logsText: logs, nowMs, rolloutObservationBoundaryMs: boundary });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failClass, "unknown_machine_render_sweep");
  });

  await test("verify-only sweeps → FAIL no_render_sweeps", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const boundary = Date.parse("2026-07-24T08:30:00.000Z");
    const logs = [
      sweepLine("2026-07-24T09:57:10.000Z", VERIFY_MACHINE_ID, "dispatch_sweep", "verify"),
      sweepLine("2026-07-24T09:58:20.000Z", VERIFY_MACHINE_ID, "dispatch_sweep", "verify"),
    ].join("\n");
    const result = amended({ logsText: logs, nowMs, rolloutObservationBoundaryMs: boundary });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failClass, "no_render_sweeps");
  });

  await test("verify mode on render Machine → FAIL cross_group_incoherence", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const boundary = Date.parse("2026-07-24T08:30:00.000Z");
    const logs = sweepLine(
      "2026-07-24T09:57:10.000Z",
      RENDER_MACHINE_ID,
      "dispatch_sweep",
      "verify",
    );
    const result = amended({ logsText: logs, nowMs, rolloutObservationBoundaryMs: boundary });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failClass, "cross_group_incoherence");
  });

  await test("render mode on verify Machine → FAIL cross_group_incoherence", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const boundary = Date.parse("2026-07-24T08:30:00.000Z");
    const logs = sweepLine(
      "2026-07-24T09:57:10.000Z",
      VERIFY_MACHINE_ID,
      "dispatch_sweep",
      "render",
    );
    const result = amended({ logsText: logs, nowMs, rolloutObservationBoundaryMs: boundary });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failClass, "cross_group_incoherence");
  });

  await test("missing Machine attribution on render sweep → FAIL missing_machine_attribution", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const boundary = Date.parse("2026-07-24T08:30:00.000Z");
    const result = classifyFlyRenderLiveOperationalDispatchSweepReadiness(
      dispatchSweepInput({
        events: [
          {
            name: "hosted.loop.delivery",
            atMs: Date.parse("2026-07-24T09:57:10.000Z"),
            logTimestampMs: Date.parse("2026-07-24T09:57:10.000Z"),
            mode: "render",
            status: null,
            reasonId: "dispatch_outbox_sweep",
            action: "dispatch_sweep",
            machineId: null,
          },
        ],
        nowMs,
        rolloutObservationBoundaryMs: boundary,
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failClass, "missing_machine_attribution");
  });

  await test("wrong image → FAIL image_mismatch", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const logs = [
      sweepLine("2026-07-24T09:57:10.000Z", RENDER_MACHINE_ID),
      sweepLine("2026-07-24T09:58:20.000Z", RENDER_MACHINE_ID),
    ].join("\n");
    const result = amended({
      logsText: logs,
      nowMs,
      machinesJson: machinesJson({ renderDigest: "b".repeat(64) }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failClass, "image_mismatch");
  });

  await test("malformed timestamps → FAIL malformed_timestamp", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const boundary = Date.parse("2026-07-24T08:30:00.000Z");
    const result = classifyFlyRenderLiveOperationalDispatchSweepReadiness(
      dispatchSweepInput({
      events: [
        {
          name: "hosted.loop.delivery",
          atMs: Number.NaN,
          logTimestampMs: null,
          mode: "render",
          status: null,
          reasonId: "dispatch_outbox_sweep",
          action: "dispatch_sweep",
          machineId: RENDER_MACHINE_ID,
        },
        {
          name: "hosted.loop.delivery",
          atMs: Date.parse("2026-07-24T09:58:20.000Z"),
          logTimestampMs: Date.parse("2026-07-24T09:58:20.000Z"),
          mode: "render",
          status: null,
          reasonId: "dispatch_outbox_sweep",
          action: "dispatch_sweep",
          machineId: RENDER_MACHINE_ID,
        },
      ],
      nowMs,
      rolloutObservationBoundaryMs: boundary,
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failClass, "malformed_timestamp");
  });

  await test("non-monotonic timestamps → FAIL non_monotonic_sweeps", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const boundary = Date.parse("2026-07-24T08:30:00.000Z");
    const ts = Date.parse("2026-07-24T09:57:10.000Z");
    const result = classifyFlyRenderLiveOperationalDispatchSweepReadiness(
      dispatchSweepInput({
      events: [
        {
          name: "hosted.loop.delivery",
          atMs: ts,
          logTimestampMs: ts,
          mode: "render",
          status: null,
          reasonId: "dispatch_outbox_sweep",
          action: "dispatch_sweep",
          machineId: RENDER_MACHINE_ID,
        },
        {
          name: "hosted.loop.delivery",
          atMs: ts,
          logTimestampMs: ts,
          mode: "render",
          status: null,
          reasonId: "dispatch_outbox_sweep",
          action: "dispatch_sweep",
          machineId: RENDER_MACHINE_ID,
        },
      ],
      nowMs,
      rolloutObservationBoundaryMs: boundary,
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failClass, "non_monotonic_sweeps");
  });

  await test("wrong action → FAIL insufficient_dispatch_sweeps", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const boundary = Date.parse("2026-07-24T08:30:00.000Z");
    const logs = [
      sweepLine("2026-07-24T09:57:10.000Z", RENDER_MACHINE_ID, "claimed_and_acked"),
      sweepLine("2026-07-24T09:58:20.000Z", RENDER_MACHINE_ID, "claimed_and_acked"),
    ].join("\n");
    const result = amended({ logsText: logs, nowMs, rolloutObservationBoundaryMs: boundary });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failClass, "insufficient_dispatch_sweeps");
  });

  await test("verify fatal with healthy render sweeps → render PASS separately", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const boundary = Date.parse("2026-07-24T08:30:00.000Z");
    const logs = [
      sweepLine("2026-07-24T09:57:10.000Z", RENDER_MACHINE_ID),
      sweepLine("2026-07-24T09:58:20.000Z", RENDER_MACHINE_ID),
      sweepLine("2026-07-24T09:57:15.000Z", VERIFY_MACHINE_ID, "dispatch_sweep", "verify"),
      `2026-07-24T09:59:00.000Z app[${VERIFY_MACHINE_ID}] iad [info]${JSON.stringify({
        name: "hosted.process.exit",
        atMs: Date.parse("2026-07-24T09:59:00.000Z"),
        mode: "verify",
        status: "failed",
        reasonId: "entrypoint_failed",
      })}`,
    ].join("\n");
    const result = amended({ logsText: logs, nowMs, rolloutObservationBoundaryMs: boundary });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.path, "operational_dispatch_sweep");
      assert.equal(result.attribution.fatal_window, "clear");
    }
  });

  await test("render fatal with healthy verify sweeps → FAIL fatal_after_sweep", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const boundary = Date.parse("2026-07-24T08:30:00.000Z");
    const logs = [
      sweepLine("2026-07-24T09:57:10.000Z", RENDER_MACHINE_ID),
      sweepLine("2026-07-24T09:58:20.000Z", RENDER_MACHINE_ID),
      sweepLine("2026-07-24T09:57:15.000Z", VERIFY_MACHINE_ID, "dispatch_sweep", "verify"),
      `2026-07-24T09:59:00.000Z app[${RENDER_MACHINE_ID}] iad [info]${JSON.stringify({
        name: "hosted.process.exit",
        atMs: Date.parse("2026-07-24T09:59:00.000Z"),
        mode: "render",
        status: "failed",
        reasonId: "entrypoint_failed",
      })}`,
    ].join("\n");
    const result = amended({ logsText: logs, nowMs, rolloutObservationBoundaryMs: boundary });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failClass, "fatal_after_sweep");
  });

  await test("schema failure after sweep → FAIL fatal_after_sweep", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const boundary = Date.parse("2026-07-24T08:30:00.000Z");
    const logs = [
      sweepLine("2026-07-24T09:57:10.000Z", RENDER_MACHINE_ID),
      sweepLine("2026-07-24T09:58:20.000Z", RENDER_MACHINE_ID),
      `2026-07-24T09:59:00.000Z app[${RENDER_MACHINE_ID}] iad [info]${JSON.stringify({
        name: "hosted.schema.preflight",
        atMs: Date.parse("2026-07-24T09:59:00.000Z"),
        mode: "render",
        status: "failed",
        reasonId: "database_unavailable",
      })}`,
    ].join("\n");
    const result = amended({ logsText: logs, nowMs, rolloutObservationBoundaryMs: boundary });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failClass, "fatal_after_sweep");
  });

  await test("process exit after sweep → FAIL fatal_after_sweep", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const boundary = Date.parse("2026-07-24T08:30:00.000Z");
    const logs = [
      sweepLine("2026-07-24T09:57:10.000Z", RENDER_MACHINE_ID),
      sweepLine("2026-07-24T09:58:20.000Z", RENDER_MACHINE_ID),
      `2026-07-24T09:59:00.000Z app[${RENDER_MACHINE_ID}] iad [info]${JSON.stringify({
        name: "hosted.loop.fatal",
        atMs: Date.parse("2026-07-24T09:59:00.000Z"),
        mode: "render",
        status: "failed",
      })}`,
    ].join("\n");
    const result = amended({ logsText: logs, nowMs, rolloutObservationBoundaryMs: boundary });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failClass, "fatal_after_sweep");
  });

  await test("recent loop.started remains PASS via startup_direct", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const logs = [
      `2026-07-24T09:00:00.000Z app[${RENDER_MACHINE_ID}] iad [info]${JSON.stringify({
        name: "hosted.schema.preflight",
        atMs: Date.parse("2026-07-24T09:00:00.000Z"),
        mode: "render",
        status: "ok",
        reasonId: "schema_preflight_ok",
      })}`,
      `2026-07-24T09:00:01.000Z app[${RENDER_MACHINE_ID}] iad [info]${JSON.stringify({
        name: "hosted.loop.started",
        atMs: Date.parse("2026-07-24T09:00:01.000Z"),
        mode: "render",
        status: "ok",
      })}`,
    ].join("\n");
    const result = amended({ logsText: logs, nowMs });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.path, "startup_direct");
  });

  await test("no acceptable signal → FAIL", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const result = amended({ logsText: "", nowMs });
    assert.equal(result.ok, false);
  });

  await test("operational heartbeat path still PASS when heartbeat present", () => {
    const nowMs = 1_700_000_000_000;
    const cls = classifyFlyRenderLiveOperationalHeartbeat({
      nowMs,
      startupLogRetention: "expired",
      verifyMachineId: VERIFY_MACHINE_ID,
      renderMachineId: RENDER_MACHINE_ID,
      events: [
        {
          name: "hosted.loop.heartbeat",
          atMs: nowMs - 10_000,
          action: "dispatch_sweep",
        },
      ],
    });
    assert.equal(cls.ok, true);
    if (cls.ok) {
      assert.equal(cls.path, "operational_heartbeat");
      assert.equal(cls.schemaReadiness, "implied_by_gated_startup");
    }
  });

  await test("sweep gap below minimum → FAIL sweep_gap_too_short", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const boundary = Date.parse("2026-07-24T08:30:00.000Z");
    const t1 = Date.parse("2026-07-24T09:57:10.000Z");
    const t2 = t1 + FLY_RENDER_LIVE_READINESS_HEARTBEAT_MIN_GAP_MS - 1;
    const result = classifyFlyRenderLiveOperationalDispatchSweepReadiness(
      dispatchSweepInput({
      events: [
        {
          name: "hosted.loop.delivery",
          atMs: t1,
          logTimestampMs: t1,
          mode: "render",
          status: null,
          reasonId: "dispatch_outbox_sweep",
          action: "dispatch_sweep",
          machineId: RENDER_MACHINE_ID,
        },
        {
          name: "hosted.loop.delivery",
          atMs: t2,
          logTimestampMs: t2,
          mode: "render",
          status: null,
          reasonId: "dispatch_outbox_sweep",
          action: "dispatch_sweep",
          machineId: RENDER_MACHINE_ID,
        },
      ],
      nowMs,
      rolloutObservationBoundaryMs: boundary,
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failClass, "sweep_gap_too_short");
  });

  await test("stopped render Machine → FAIL machine_not_healthy", () => {
    const nowMs = Date.parse("2026-07-24T10:00:00.000Z");
    const result = amended({
      logsText: "",
      nowMs,
      machinesJson: machinesJson({ renderState: "stopped" }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failClass, "machine_not_healthy");
  });

  await test("production worker artifact hash unchanged at ae04b7eb", () => {
    const hash = createHash("sha256")
      .update(readFileSync(path.join(ROOT, "dist/headless-worker/hosted-worker.js")))
      .digest("hex");
    assert.equal(
      hash,
      "ae04b7ebb37e34c4399454a25d9635694573b6651dd60148cba4cd91c4af0f0a",
    );
    assert.equal(HEADLESS_WORKER_RENDERER_BUILD_ID.length > 0, true);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
