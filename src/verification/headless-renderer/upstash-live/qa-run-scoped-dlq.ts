/**
 * QA/live-harness-only run-scoped TCP DLQ writer (Sprint 11E 2D.1G).
 * Never imported by production product routes or control-plane barrels.
 *
 * Writes only to binding.names.renderDlq / verifyDlq via TCP XADD.
 * Never uses the TCP adapter’s constructor-derived shared staging DLQ keys.
 */

import {
  cpFail,
  cpOk,
  type HeadlessControlPlaneResult,
} from "@/features/headless-renderer/control-plane";
import type { HeadlessStreamQueueEntry } from "@/features/headless-renderer/control-plane/ports/queue.port";
import type { HeadlessQueueDlqClass } from "@/features/headless-renderer/control-plane/types/queue-dlq-entry";
import { validateHeadlessQueueDlqEntry } from "@/features/headless-renderer/control-plane/types/queue-dlq-entry";

import {
  canonicalizeQaRunScopedStreamBinding,
  streamKeyBelongsToQaRunBinding,
  type QaRunScopedStreamBinding,
} from "./qa-run-stream-names";
import type { UpstashLiveConsumerPort } from "./types";

const SHARED_STAGING_DLQ =
  /^hfq:(render|verify)-dlq:(local|staging|production)$/;

export type QaRunScopedDlqKind = "render" | "verify";

export type QaRunScopedTcpDlqWriter = {
  readonly dlqAuthority: "qa_run_scoped";
  readonly binding: QaRunScopedStreamBinding;
  /**
   * Validate kind → exact binding DLQ key. Fail closed for shared staging,
   * cross-kind, cross-run, and arbitrary keys.
   */
  resolveDlqKey(
    kind: QaRunScopedDlqKind,
  ): { readonly ok: true; readonly streamKey: string } | { readonly ok: false };
  /**
   * TCP XADD of a validated DLQ entry onto the binding DLQ for `kind`.
   * Returns the created streamId.
   */
  xaddDlq(input: {
    readonly kind: QaRunScopedDlqKind;
    readonly entry: HeadlessStreamQueueEntry;
    readonly class: HeadlessQueueDlqClass;
    readonly reasonId: string;
  }): Promise<
    HeadlessControlPlaneResult<{ readonly streamId: string }>
  >;
  /** Port-shaped wrapper — never delegates to tcpConsumer.moveToDlq. */
  moveToDlq(input: {
    readonly kind: QaRunScopedDlqKind;
    readonly entry: HeadlessStreamQueueEntry;
    readonly class: HeadlessQueueDlqClass;
    readonly reasonId: string;
  }): Promise<HeadlessControlPlaneResult<true>>;
};

function buildDlqFields(entry: {
  readonly deliveryId: string;
  readonly jobId?: string;
  readonly ownedObjectId?: string;
  readonly ownerId: string;
  readonly attempt: number;
  readonly class: HeadlessQueueDlqClass;
  readonly enqueuedAtMs: number;
  readonly reasonId: string;
}): Record<string, string> {
  const fields: Record<string, string> = {
    deliveryId: entry.deliveryId,
    ownerId: entry.ownerId,
    attempt: String(entry.attempt),
    class: entry.class,
    enqueuedAtMs: String(entry.enqueuedAtMs),
    reasonId: entry.reasonId,
  };
  if (entry.jobId != null) fields.jobId = entry.jobId;
  if (entry.ownedObjectId != null) fields.ownedObjectId = entry.ownedObjectId;
  return fields;
}

/**
 * Authorize a candidate DLQ key against an explicit binding + kind.
 * Never infers authority from key string shape alone without a binding.
 */
export function authorizeQaRunScopedDlqKey(input: {
  readonly binding: unknown;
  readonly kind: QaRunScopedDlqKind;
  readonly streamKey: string;
}): boolean {
  const binding = canonicalizeQaRunScopedStreamBinding(input.binding);
  if (binding == null) return false;
  if (typeof input.streamKey !== "string" || input.streamKey.length === 0) {
    return false;
  }
  if (SHARED_STAGING_DLQ.test(input.streamKey)) return false;
  const expected =
    input.kind === "render"
      ? binding.names.renderDlq
      : binding.names.verifyDlq;
  if (input.streamKey !== expected) return false;
  if (!streamKeyBelongsToQaRunBinding(binding, input.streamKey)) return false;
  // Cross-kind: render must not resolve to verify DLQ and vice versa.
  if (
    input.kind === "render" &&
    input.streamKey === binding.names.verifyDlq
  ) {
    return false;
  }
  if (
    input.kind === "verify" &&
    input.streamKey === binding.names.renderDlq
  ) {
    return false;
  }
  return true;
}

/**
 * Create a QA-only TCP DLQ writer bound to a validated run-scoped binding.
 */
export function createQaRunScopedTcpDlqWriter(input: {
  readonly redis: UpstashLiveConsumerPort;
  readonly binding: unknown;
}): QaRunScopedTcpDlqWriter | null {
  const binding = canonicalizeQaRunScopedStreamBinding(input.binding);
  if (binding == null) return null;
  const redis = input.redis;

  const writer: QaRunScopedTcpDlqWriter = {
    dlqAuthority: "qa_run_scoped",
    binding,

    resolveDlqKey(kind) {
      const streamKey =
        kind === "render" ? binding.names.renderDlq : binding.names.verifyDlq;
      if (
        !authorizeQaRunScopedDlqKey({
          binding,
          kind,
          streamKey,
        })
      ) {
        return { ok: false };
      }
      return { ok: true, streamKey };
    },

    async xaddDlq(moveInput) {
      if (
        moveInput.kind !== "render" &&
        moveInput.kind !== "verify"
      ) {
        return cpFail("HOSTILE_INPUT", "DLQ kind invalid.");
      }
      if (moveInput.entry.deliveryKind !== moveInput.kind) {
        return cpFail("HOSTILE_INPUT", "DLQ delivery kind mismatch.");
      }
      const resolved = writer.resolveDlqKey(moveInput.kind);
      if (!resolved.ok) {
        return cpFail("HOSTILE_INPUT", "Run-scoped DLQ key rejected.");
      }
      const dlqEntry =
        moveInput.entry.deliveryKind === "render"
          ? {
              deliveryId: moveInput.entry.deliveryId,
              jobId: moveInput.entry.jobId,
              ownerId: moveInput.entry.ownerId,
              attempt: moveInput.entry.attempt,
              class: moveInput.class,
              enqueuedAtMs: moveInput.entry.enqueuedAtMs,
              reasonId: moveInput.reasonId,
            }
          : {
              deliveryId: moveInput.entry.deliveryId,
              ownedObjectId: moveInput.entry.ownedObjectId,
              ownerId: moveInput.entry.ownerId,
              attempt: moveInput.entry.attempt,
              class: moveInput.class,
              enqueuedAtMs: moveInput.entry.enqueuedAtMs,
              reasonId: moveInput.reasonId,
            };
      const validated = validateHeadlessQueueDlqEntry(dlqEntry);
      if (!validated.ok) {
        return cpFail("HOSTILE_INPUT", validated.message);
      }
      let streamId: string | null;
      try {
        streamId = await redis.qaXaddRaw(
          resolved.streamKey,
          buildDlqFields(validated.entry),
        );
      } catch {
        return cpFail("INTERNAL_ERROR", "DLQ move failed.");
      }
      if (streamId == null || streamId.length === 0) {
        return cpFail("INTERNAL_ERROR", "DLQ move failed.");
      }
      return cpOk({ streamId });
    },

    async moveToDlq(moveInput) {
      const result = await writer.xaddDlq(moveInput);
      if (!result.ok) return result;
      return cpOk(true as const);
    },
  };

  return writer;
}
