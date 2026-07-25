/**
 * Immutable canonical registry of required Upstash dual-lease live case IDs.
 * Live PASS authority is exact membership — not "some cases passed".
 * Prefix-FAIL allows NOT_TESTED only after the first FAIL (full 22 padded).
 */

import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

import { isDuplicateLiveAttributionReasonId } from "./duplicate-live-attribution";
import { isEnqueueAttributionReasonId } from "./enqueue-attribution";
import type { UpstashLiveCaseEvidence } from "./evidence";
import { isTerminalAttributionReasonId } from "./terminal-attribution";

function isAllowlistedLiveFailureReasonId(value: unknown): boolean {
  return (
    isEnqueueAttributionReasonId(value) ||
    isTerminalAttributionReasonId(value) ||
    isDuplicateLiveAttributionReasonId(value)
  );
}

export const REQUIRED_UPSTASH_LIVE_CASE_IDS = Object.freeze([
  "env.producer.config",
  "env.consumer.config",
  "env.lease.settings",
  "stream.names",
  "protocol.version",
  "enqueue.render",
  "enqueue.verify",
  "group.create",
  "read.group",
  "consume.claim.ack",
  "consume.terminal.noop",
  "consume.duplicate.live",
  "consume.leave.pending",
  "autoclaim.idle",
  "recover.render.expired",
  "recover.verify.expired",
  "dlq.malformed",
  "trim.maxlen",
  "concurrency.no.steal",
  "compose.blocked",
  "neon.fingerprint",
  "evidence.privacy",
] as const);

export type RequiredUpstashLiveCaseId =
  (typeof REQUIRED_UPSTASH_LIVE_CASE_IDS)[number];

const REQUIRED_SET = new Set<string>(REQUIRED_UPSTASH_LIVE_CASE_IDS);

export const UPSTASH_LIVE_FAILURE_CATEGORIES = Object.freeze([
  "ENV_PRODUCER_FAILED",
  "ENV_CONSUMER_FAILED",
  "LEASE_SETTINGS_FAILED",
  "STREAM_NAMES_FAILED",
  "PROTOCOL_VERSION_FAILED",
  "ENQUEUE_RENDER_FAILED",
  "ENQUEUE_VERIFY_FAILED",
  "GROUP_CREATE_FAILED",
  "READ_GROUP_FAILED",
  "CONSUME_CLAIM_ACK_FAILED",
  "CONSUME_TERMINAL_FAILED",
  "CONSUME_DUPLICATE_FAILED",
  "CONSUME_LEAVE_PENDING_FAILED",
  "AUTOCLAIM_FAILED",
  "RECOVER_RENDER_FAILED",
  "RECOVER_VERIFY_FAILED",
  "DLQ_FAILED",
  "TRIM_FAILED",
  "CONCURRENCY_FAILED",
  "COMPOSE_NOT_BLOCKED",
  "NEON_FINGERPRINT_FAILED",
  "EVIDENCE_PRIVACY_FAILED",
  "CASE_SHAPE_INVALID",
  "MATRIX_EXCEPTION",
  "STUB_RUNNERS_REFUSED",
  "SCHEMA_PREFLIGHT_FAILED",
  "CLEANUP_FAILED",
] as const);

export type UpstashLiveFailureCategory =
  (typeof UPSTASH_LIVE_FAILURE_CATEGORIES)[number];

const FAILURE_SET = new Set<string>(UPSTASH_LIVE_FAILURE_CATEGORIES);

export function isRequiredUpstashLiveCaseId(
  value: string,
): value is RequiredUpstashLiveCaseId {
  return REQUIRED_SET.has(value);
}

export function validateUpstashLiveCaseEvidenceShape(
  value: unknown,
):
  | { readonly ok: true; readonly case: UpstashLiveCaseEvidence }
  | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(value)) {
      return { ok: false, message: "Hostile case evidence rejected." };
    }
    if (
      value == null ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return { ok: false, message: "Case evidence must be a plain object." };
    }
    const c = value as Record<string, unknown>;
    if (
      typeof c.caseId !== "string" ||
      !isRequiredUpstashLiveCaseId(c.caseId)
    ) {
      return { ok: false, message: "caseId is not a required Upstash live case." };
    }
    if (
      c.status !== "PASS" &&
      c.status !== "FAIL" &&
      c.status !== "NOT_TESTED"
    ) {
      return { ok: false, message: "status invalid." };
    }
    if (c.status === "FAIL") {
      if (
        typeof c.failureCategory !== "string" ||
        !FAILURE_SET.has(c.failureCategory)
      ) {
        return { ok: false, message: "failureCategory invalid." };
      }
      if (
        c.failureReasonId != null &&
        !isAllowlistedLiveFailureReasonId(c.failureReasonId)
      ) {
        return { ok: false, message: "failureReasonId invalid." };
      }
      return {
        ok: true,
        case: {
          caseId: c.caseId,
          status: "FAIL",
          failureCategory: c.failureCategory,
          ...(typeof c.failureReasonId === "string"
            ? { failureReasonId: c.failureReasonId }
            : {}),
        },
      };
    }
    return {
      ok: true,
      case: { caseId: c.caseId, status: c.status },
    };
  } catch {
    return { ok: false, message: "Case evidence validation failed." };
  }
}

export function assertExactRequiredUpstashLiveCasePassAuthority(
  cases: readonly UpstashLiveCaseEvidence[],
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  if (cases.length !== REQUIRED_UPSTASH_LIVE_CASE_IDS.length) {
    return {
      ok: false,
      message: `Expected ${REQUIRED_UPSTASH_LIVE_CASE_IDS.length} cases, got ${cases.length}.`,
    };
  }
  const byId = new Map(cases.map((c) => [c.caseId, c]));
  for (const id of REQUIRED_UPSTASH_LIVE_CASE_IDS) {
    const c = byId.get(id);
    if (c == null) {
      return { ok: false, message: `Missing required case ${id}.` };
    }
    if (c.status !== "PASS") {
      return { ok: false, message: `Case ${id} is not PASS.` };
    }
  }
  if (byId.size !== REQUIRED_UPSTASH_LIVE_CASE_IDS.length) {
    return { ok: false, message: "Duplicate or extra case ids." };
  }
  return { ok: true };
}

/**
 * Prefix-FAIL with NOT_TESTED padding: registry-ordered full length.
 * Zero+ PASS, exactly one FAIL, then only NOT_TESTED for remaining ids.
 */
export function assertExactRequiredUpstashLiveCasePrefixFailAuthority(
  cases: readonly UpstashLiveCaseEvidence[],
):
  | {
      readonly ok: true;
      readonly failedCaseId: RequiredUpstashLiveCaseId;
      readonly lastCompletedRequiredCase: RequiredUpstashLiveCaseId | null;
    }
  | { readonly ok: false; readonly message: string } {
  if (cases.length !== REQUIRED_UPSTASH_LIVE_CASE_IDS.length) {
    return {
      ok: false,
      message: `Prefix-FAIL requires exactly ${REQUIRED_UPSTASH_LIVE_CASE_IDS.length} cases (with NOT_TESTED pad).`,
    };
  }

  let failIndex = -1;
  for (let i = 0; i < cases.length; i++) {
    const shaped = validateUpstashLiveCaseEvidenceShape(cases[i]);
    if (!shaped.ok) {
      return { ok: false, message: shaped.message };
    }
    const expectedId = REQUIRED_UPSTASH_LIVE_CASE_IDS[i]!;
    if (shaped.case.caseId !== expectedId) {
      return { ok: false, message: "Prefix-FAIL case order invalid." };
    }
    if (shaped.case.status === "FAIL") {
      if (failIndex >= 0) {
        return { ok: false, message: "Prefix-FAIL allows exactly one FAIL." };
      }
      if (shaped.case.failureCategory == null) {
        return { ok: false, message: "FAIL requires failureCategory." };
      }
      failIndex = i;
      continue;
    }
    if (failIndex < 0) {
      if (shaped.case.status !== "PASS") {
        return {
          ok: false,
          message: "Cases before first FAIL must be PASS.",
        };
      }
    } else if (shaped.case.status !== "NOT_TESTED") {
      return {
        ok: false,
        message: "Cases after first FAIL must be NOT_TESTED.",
      };
    }
  }

  if (failIndex < 0) {
    return { ok: false, message: "Prefix-FAIL requires a FAIL case." };
  }

  const failed = cases[failIndex]!;
  const lastPass =
    failIndex >= 1 ? (cases[failIndex - 1]!.caseId as RequiredUpstashLiveCaseId) : null;
  return {
    ok: true,
    failedCaseId: failed.caseId as RequiredUpstashLiveCaseId,
    lastCompletedRequiredCase: lastPass,
  };
}

export function createExactPassUpstashCaseResults(): readonly UpstashLiveCaseEvidence[] {
  return Object.freeze(
    REQUIRED_UPSTASH_LIVE_CASE_IDS.map((caseId) =>
      Object.freeze({ caseId, status: "PASS" as const }),
    ),
  );
}
