/**
 * QA-only non-destructive delivery isolation helpers
 * (Sprint 11E 2D.1C.1 / 2D.1C.2 / 2D.1C.3 / 2D.1D).
 * Uses a run/case-scoped consumer group on the shared staging stream — never
 * XGROUP SETID / DESTROY on production worker groups.
 *
 * Exclusivity lock uses unguessable ownership tokens + atomic compare-and-*
 * Lua (EVAL). Local safe deadline uses an injected monotonic clock — never
 * frozen ctx.nowMs. Never GET then DEL/PEXPIRE as separate commands.
 */

import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import type { HeadlessEnvName } from "@/features/headless-renderer/control-plane/runtime/upstash-environment";

import { trackQaGroup } from "./live-fixtures";
import type {
  UpstashLiveConsumerPort,
  UpstashLiveMatrixContext,
} from "./types";

/** Redis lease TTL for the QA exclusivity lock. */
export const QA_LOCK_TTL_MS = 30_000;
/** Local safe deadline — shorter than lease; critical work must finish inside. */
export const QA_LOCK_SAFE_DEADLINE_MS = 20_000;

/** Hex digest length for bounded collision-resistant QA group names. */
const QA_CASE_GROUP_DIGEST_HEX_LEN = 32;

/**
 * Injected clock for local deadline enforcement.
 * Live default is monotonic (`performance.now`). Redis TTL remains server-side.
 */
export type QaLockClock = {
  readonly nowMs: () => number;
};

/** Live/production default — monotonic elapsed-time source. */
export function createLiveQaLockClock(): QaLockClock {
  return Object.freeze({
    nowMs: () => performance.now(),
  });
}

export type FakeQaLockClock = QaLockClock & {
  advanceMs(delta: number): void;
  /** Absolute set for fixtures (wall-clock rollback must not extend deadline). */
  setMs(ms: number): void;
  peekMs(): number;
};

/**
 * Deterministic suites only — injectable fake monotonic clock.
 * `setMs` never moves backwards (wall-clock rollback cannot extend deadline).
 */
export function createFakeQaLockClock(initialMs = 0): FakeQaLockClock {
  let current = initialMs;
  return {
    nowMs: () => current,
    advanceMs(delta: number) {
      if (!Number.isFinite(delta) || delta < 0) {
        throw new Error("FAKE_QA_LOCK_CLOCK_ADVANCE");
      }
      current += delta;
    },
    setMs(ms: number) {
      if (!Number.isFinite(ms)) {
        throw new Error("FAKE_QA_LOCK_CLOCK_SET");
      }
      // Monotonic: ignore rollback attempts (same property as performance.now).
      if (ms > current) {
        current = ms;
      }
    },
    peekMs: () => current,
  };
}

/**
 * Case-scoped QA consumer group — collision-resistant from FULL runId + caseId
 * + kind (never 8-char runId prefix alone). Bounded digest keeps Redis names short.
 */
export function qaCaseGroupName(
  runId: string,
  caseId: string,
  kind: "render" | "verify",
): string {
  if (runId.length === 0 || caseId.length === 0) {
    throw new Error("QA_CASE_GROUP_NAME_EMPTY");
  }
  if (kind !== "render" && kind !== "verify") {
    throw new Error("QA_CASE_GROUP_KIND_INVALID");
  }
  const digest = createHash("sha256")
    .update(runId, "utf8")
    .update("\0", "utf8")
    .update(caseId, "utf8")
    .update("\0", "utf8")
    .update(kind, "utf8")
    .digest("hex")
    .slice(0, QA_CASE_GROUP_DIGEST_HEX_LEN);
  return `hfq:qa:${kind}:${digest}`;
}

/**
 * Run-scoped render QA group — full runId identity (not 8-char prefix).
 * Prefer {@link qaCaseGroupName} for matrix cases.
 */
export function qaRenderGroupName(runId: string): string {
  return qaCaseGroupName(runId, "__run__", "render");
}

/** Stream key kind implied by a QA group name (`hfq:qa:render:…` / `hfq:qa:verify:…`). */
export function qaGroupDeliveryKind(
  group: string,
): "render" | "verify" | null {
  if (group.startsWith("hfq:qa:render:")) return "render";
  if (group.startsWith("hfq:qa:verify:")) return "verify";
  return null;
}

export function qaRenderLockKey(envName: HeadlessEnvName): string {
  return `hfq:qa-lock:render:${envName}`;
}

export function qaVerifyLockKey(envName: HeadlessEnvName): string {
  return `hfq:qa-lock:verify:${envName}`;
}

export function qaLockKeyForKind(
  envName: HeadlessEnvName,
  kind: "render" | "verify",
): string {
  return kind === "verify"
    ? qaVerifyLockKey(envName)
    : qaRenderLockKey(envName);
}

export function isProductionWorkerGroup(group: string): boolean {
  return group === "hfq:render-workers" || group === "hfq:verify-workers";
}

export function isQaOwnedGroup(group: string): boolean {
  return group.startsWith("hfq:qa:") && !isProductionWorkerGroup(group);
}

export type QaLockHandle = {
  readonly key: string;
  readonly token: string;
  readonly acquiredAtMs: number;
  readonly ttlMs: number;
  readonly deadlineMs: number;
  readonly acquired: true;
};

export type QaLockAcquireResult =
  | QaLockHandle
  | { readonly acquired: false; readonly reasonId: "queue_lock_unavailable" };

/**
 * Renew/confirm failure reasons (fail-closed; never weakens ownership rules).
 * - deadline_elapsed: local safe deadline crossed before/after renew
 * - ownership_lost: compare-and-renew token mismatch / absent key
 */
export type QaLockRenewFailureReasonId =
  | "queue_lock_deadline_elapsed"
  | "queue_lock_ownership_lost";

export type QaLockRenewResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasonId: QaLockRenewFailureReasonId };

export type QaLockReleaseResult =
  | { readonly status: "deleted" }
  | { readonly status: "lost" }
  | { readonly status: "error" };

export function isQaLockDeadlineElapsed(
  handle: QaLockHandle,
  clock: QaLockClock,
): boolean {
  return clock.nowMs() >= handle.deadlineMs;
}

/**
 * Acquire exclusivity with an unguessable run-specific token (never runId).
 * Deadline metadata is stamped from a fresh `clock.nowMs()` read.
 */
export async function acquireQaExclusivityLock(input: {
  readonly redis: UpstashLiveConsumerPort;
  readonly envName: HeadlessEnvName;
  readonly clock: QaLockClock;
  readonly kind?: "render" | "verify";
  readonly ttlMs?: number;
  readonly safeDeadlineMs?: number;
}): Promise<QaLockAcquireResult> {
  const key = qaLockKeyForKind(input.envName, input.kind ?? "render");
  const ttl = input.ttlMs ?? QA_LOCK_TTL_MS;
  const safeDeadline = input.safeDeadlineMs ?? QA_LOCK_SAFE_DEADLINE_MS;
  const acquiredAtMs = input.clock.nowMs();
  const token = randomUUID();
  const ok = await input.redis.qaSetNxPx(key, token, ttl);
  if (!ok) {
    return { acquired: false, reasonId: "queue_lock_unavailable" };
  }
  return {
    key,
    token,
    acquiredAtMs,
    ttlMs: ttl,
    deadlineMs: acquiredAtMs + safeDeadline,
    acquired: true,
  };
}

/**
 * Compare-and-renew with before/after deadline checks on a fresh clock read.
 * Fails closed when the local safe deadline elapsed or ownership is lost.
 */
export async function renewQaExclusivityLock(input: {
  readonly redis: UpstashLiveConsumerPort;
  readonly handle: QaLockHandle;
  readonly clock: QaLockClock;
}): Promise<QaLockRenewResult> {
  if (isQaLockDeadlineElapsed(input.handle, input.clock)) {
    return { ok: false, reasonId: "queue_lock_deadline_elapsed" };
  }
  const renewed = await input.redis.qaCompareAndRenewLock(
    input.handle.key,
    input.handle.token,
    input.handle.ttlMs,
  );
  if (!renewed) {
    return { ok: false, reasonId: "queue_lock_ownership_lost" };
  }
  // Provider delay during renew cannot be hidden by a frozen timestamp.
  if (isQaLockDeadlineElapsed(input.handle, input.clock)) {
    return { ok: false, reasonId: "queue_lock_deadline_elapsed" };
  }
  return { ok: true };
}

/** Checkpoint helper — same atomic renew + before/after deadline semantics. */
export async function confirmQaLockOwnership(input: {
  readonly redis: UpstashLiveConsumerPort;
  readonly handle: QaLockHandle;
  readonly clock: QaLockClock;
}): Promise<QaLockRenewResult> {
  return renewQaExclusivityLock(input);
}

/**
 * Compare-and-delete release. Never deletes a successor's lock.
 */
export async function releaseQaExclusivityLock(input: {
  readonly redis: UpstashLiveConsumerPort;
  readonly handle: QaLockHandle | null | undefined;
}): Promise<QaLockReleaseResult> {
  if (input.handle == null || !input.handle.acquired) {
    return { status: "lost" };
  }
  const outcome = await input.redis.qaCompareAndDeleteLock(
    input.handle.key,
    input.handle.token,
  );
  if (outcome === "deleted") return { status: "deleted" };
  if (outcome === "not_owner") return { status: "lost" };
  return { status: "error" };
}

export type QaGroupCreateResult =
  | {
      readonly ok: true;
      readonly group: string;
      readonly lastDeliveredId: string;
    }
  | {
      readonly ok: false;
      readonly reasonId:
        | "queue_cursor_changed"
        | "queue_lock_unavailable"
        | "group_probe_failed";
    };

/**
 * Create case-scoped QA-only group with `$` so only post-create enqueues are visible.
 * BUSYGROUP fails closed (never SETID / never reuse foreign tip).
 */
export async function createQaCaseConsumerGroup(input: {
  readonly redis: UpstashLiveConsumerPort;
  readonly streamKey: string;
  readonly runId: string;
  readonly caseId: string;
  readonly kind: "render" | "verify";
  readonly ctx?: UpstashLiveMatrixContext;
}): Promise<QaGroupCreateResult> {
  let group: string;
  try {
    group = qaCaseGroupName(input.runId, input.caseId, input.kind);
  } catch {
    return { ok: false, reasonId: "queue_cursor_changed" };
  }
  if (isProductionWorkerGroup(group) || !isQaOwnedGroup(group)) {
    return { ok: false, reasonId: "queue_cursor_changed" };
  }
  const created = await input.redis.qaXgroupCreate({
    streamKey: input.streamKey,
    group,
    id: "$",
    mkstream: true,
  });
  if (created === "failed") {
    return { ok: false, reasonId: "queue_cursor_changed" };
  }
  // BUSYGROUP: fail closed rather than SETID / reuse.
  const list = await input.redis.qaXinfoGroups(input.streamKey);
  if (!list.ok) {
    return { ok: false, reasonId: "group_probe_failed" };
  }
  const info = list.groups.find((g) => g.name === group);
  if (info == null) {
    return { ok: false, reasonId: "queue_cursor_changed" };
  }
  if (created === "busy") {
    return { ok: false, reasonId: "queue_cursor_changed" };
  }
  if (input.ctx != null) {
    trackQaGroup(input.ctx, group);
  }
  return {
    ok: true,
    group,
    lastDeliveredId: info.lastDeliveredId,
  };
}

/**
 * Create run-scoped render QA group with `$` (legacy helper — prefer case-scoped).
 */
export async function createQaRenderConsumerGroup(input: {
  readonly redis: UpstashLiveConsumerPort;
  readonly streamKey: string;
  readonly runId: string;
  readonly caseId?: string;
  readonly ctx?: UpstashLiveMatrixContext;
}): Promise<QaGroupCreateResult> {
  return createQaCaseConsumerGroup({
    redis: input.redis,
    streamKey: input.streamKey,
    runId: input.runId,
    caseId: input.caseId ?? "__run__",
    kind: "render",
    ctx: input.ctx,
  });
}

export async function destroyQaConsumerGroup(input: {
  readonly redis: UpstashLiveConsumerPort;
  readonly streamKey: string;
  readonly group: string;
}): Promise<boolean> {
  if (!isQaOwnedGroup(input.group) || isProductionWorkerGroup(input.group)) {
    return false;
  }
  return input.redis.qaXgroupDestroy(input.streamKey, input.group);
}

export type QueueCursorSnapshot = {
  readonly group: string;
  readonly lastDeliveredId: string;
};

export type SnapshotQaGroupCursorResult =
  | { readonly ok: true; readonly snapshot: QueueCursorSnapshot }
  | {
      readonly ok: false;
      readonly reasonId: "group_probe_failed" | "queue_cursor_changed";
    };

export async function snapshotQaGroupCursor(input: {
  readonly redis: UpstashLiveConsumerPort;
  readonly streamKey: string;
  readonly group: string;
}): Promise<SnapshotQaGroupCursorResult> {
  const list = await input.redis.qaXinfoGroups(input.streamKey);
  if (!list.ok) {
    return { ok: false, reasonId: "group_probe_failed" };
  }
  const info = list.groups.find((g) => g.name === input.group);
  if (info == null) {
    return { ok: false, reasonId: "queue_cursor_changed" };
  }
  return {
    ok: true,
    snapshot: {
      group: input.group,
      lastDeliveredId: info.lastDeliveredId,
    },
  };
}

export type IsolationPreconditionResult =
  | { readonly ok: true; readonly nextStreamId: string }
  | {
      readonly ok: false;
      readonly reasonId:
        | "queue_precondition_not_isolated"
        | "queue_cursor_changed"
        | "group_probe_failed"
        | "expected_delivery_unavailable";
      readonly observedForeignStreamId?: string;
    };

/**
 * Prove expectedStreamId is the next unread entry for the QA group.
 * Does NOT call XREADGROUP. Does not mutate pending/cursor/foreign entries.
 */
export async function assertExpectedIsNextUnread(input: {
  readonly redis: UpstashLiveConsumerPort;
  readonly streamKey: string;
  readonly group: string;
  readonly expectedStreamId: string;
  readonly expectedLastDeliveredId?: string;
}): Promise<IsolationPreconditionResult> {
  const cursor = await snapshotQaGroupCursor({
    redis: input.redis,
    streamKey: input.streamKey,
    group: input.group,
  });
  if (!cursor.ok) {
    return { ok: false, reasonId: cursor.reasonId };
  }
  if (
    input.expectedLastDeliveredId != null &&
    cursor.snapshot.lastDeliveredId !== input.expectedLastDeliveredId
  ) {
    return { ok: false, reasonId: "queue_cursor_changed" };
  }

  const start =
    cursor.snapshot.lastDeliveredId === "0-0" ||
    cursor.snapshot.lastDeliveredId === "0"
      ? "-"
      : `(${cursor.snapshot.lastDeliveredId}`;
  const range = await input.redis.qaXrange({
    streamKey: input.streamKey,
    start,
    end: "+",
    count: 2,
  });
  if (range.length === 0) {
    return { ok: false, reasonId: "expected_delivery_unavailable" };
  }
  const next = range[0]!;
  if (next.streamId !== input.expectedStreamId) {
    return {
      ok: false,
      reasonId: "queue_precondition_not_isolated",
      observedForeignStreamId: next.streamId,
    };
  }
  return { ok: true, nextStreamId: next.streamId };
}
