/**
 * QA/live-harness-only run-scoped REST producer + TCP group/cleanup helpers
 * (Sprint 11E 2D.1F.1).
 * Never imported by production product routes or control-plane barrels.
 *
 * REST: XADD + best-effort XTRIM on validated run-scoped keys only.
 * TCP: XGROUP / consume / cleanup probes.
 */

import { cpFail, cpOk } from "@/features/headless-renderer/control-plane";
import type { HeadlessUpstashRestClient } from "@/features/headless-renderer/control-plane/adapters/upstash-rest-queue-producer.adapter";
import { validateHeadlessStreamQueueEntry } from "@/features/headless-renderer/control-plane/ports/queue.port";
import type {
  HeadlessRenderQueueMessage,
  HeadlessVerifyQueueMessage,
} from "@/features/headless-renderer/control-plane";
import type {
  HeadlessKeyDeleteResult,
  HeadlessKeyProbeResult,
} from "@/features/headless-renderer/control-plane/runtime/key-presence-probe";

import {
  authorizedGroupForQaRunScopedStream,
  canonicalizeQaRunScopedStreamBinding,
  streamKeyBelongsToQaRunBinding,
  type QaRunScopedStreamBinding,
} from "./qa-run-stream-names";
import type {
  UpstashLiveConsumerPort,
  UpstashLiveProducerPort,
} from "./types";

const TRIM_MAXLEN = 10_000;

function entryFields(
  entry: HeadlessRenderQueueMessage | HeadlessVerifyQueueMessage,
): Record<string, unknown> {
  if (entry.deliveryKind === "render") {
    return {
      deliveryId: entry.deliveryId,
      jobId: entry.jobId,
      ownerId: entry.ownerId,
      attempt: String(entry.attempt),
      enqueuedAtMs: String(entry.enqueuedAtMs),
      deliveryKind: "render",
    };
  }
  return {
    deliveryId: entry.deliveryId,
    ownedObjectId: entry.ownedObjectId,
    ownerId: entry.ownerId,
    attempt: String(entry.attempt),
    enqueuedAtMs: String(entry.enqueuedAtMs),
    deliveryKind: "verify",
  };
}

/**
 * QA-only REST producer: real REST XADD (+ bounded best-effort XTRIM).
 * Accepts only a validated server-derived QaRunScopedStreamBinding.
 * Never uses TCP qaXaddRaw. Never enqueues to shared staging keys.
 */
export function createQaRunScopedRestProducerPort(input: {
  readonly client: HeadlessUpstashRestClient | null;
  readonly binding: unknown;
}): UpstashLiveProducerPort {
  const canonical = canonicalizeQaRunScopedStreamBinding(input.binding);
  const rest = input.client;

  if (canonical == null || rest == null) {
    return {
      async enqueueRender() {
        return cpFail(
          "HOSTILE_INPUT",
          "Invalid QA run-scoped REST producer binding.",
        );
      },
      async enqueueVerify() {
        return cpFail(
          "HOSTILE_INPUT",
          "Invalid QA run-scoped REST producer binding.",
        );
      },
    };
  }

  const binding = canonical;
  const client = rest;

  async function enqueue(
    kind: "render" | "verify",
    message: HeadlessRenderQueueMessage | HeadlessVerifyQueueMessage,
  ) {
    const validated = validateHeadlessStreamQueueEntry(message);
    if (!validated.ok) {
      return cpFail("HOSTILE_INPUT", validated.message);
    }
    if (validated.entry.deliveryKind !== kind) {
      return cpFail("HOSTILE_INPUT", "Delivery kind mismatch.");
    }
    const streamKey =
      kind === "render"
        ? binding.names.renderStream
        : binding.names.verifyStream;
    if (!streamKeyBelongsToQaRunBinding(binding, streamKey)) {
      return cpFail("HOSTILE_INPUT", "Stream key rejected.");
    }
    // Refuse shared production env keys even if somehow present.
    if (
      /^hfq:render:(local|staging|production)$/.test(streamKey) ||
      /^hfq:verify:(local|staging|production)$/.test(streamKey)
    ) {
      return cpFail("HOSTILE_INPUT", "Shared staging stream key rejected.");
    }

    let streamId: string;
    try {
      const rawId = await client.xadd(streamKey, "*", entryFields(validated.entry));
      if (rawId == null || typeof rawId !== "string" || rawId.length === 0) {
        return cpFail("QUEUE_ENQUEUE_FAILED", "Stream enqueue failed.");
      }
      streamId = rawId;
    } catch {
      return cpFail("QUEUE_ENQUEUE_FAILED", "Stream enqueue failed.");
    }

    // Best-effort XTRIM — failure is non-terminal after durable XADD.
    try {
      await client.xtrim(streamKey, {
        strategy: "MAXLEN",
        exactness: "~",
        threshold: TRIM_MAXLEN,
      });
    } catch {
      // Trim best-effort; enqueue remains successful.
    }
    return cpOk({ streamId });
  }

  return {
    enqueueRender: (m) => enqueue("render", m),
    enqueueVerify: (m) => enqueue("verify", m),
  };
}

/** @deprecated Use createQaRunScopedRestProducerPort — TCP qaXaddRaw is not enqueue authority. */
export function createQaRunScopedProducerPort(input: {
  readonly redis: UpstashLiveConsumerPort;
  readonly binding: QaRunScopedStreamBinding;
  readonly client?: HeadlessUpstashRestClient | null;
}): UpstashLiveProducerPort {
  void input.redis;
  return createQaRunScopedRestProducerPort({
    client: input.client ?? null,
    binding: input.binding,
  });
}

/**
 * Ensure production-protocol worker groups exist on the run-scoped streams.
 * Never mutates shared hfq:render:{env} / hfq:verify:{env}.
 */
export async function ensureQaRunScopedProductionGroups(input: {
  readonly redis: UpstashLiveConsumerPort;
  readonly binding: unknown;
}): Promise<boolean> {
  const binding = canonicalizeQaRunScopedStreamBinding(input.binding);
  if (binding == null) return false;

  const pairs: ReadonlyArray<{
    readonly streamKey: string;
    readonly group: string;
  }> = [
    {
      streamKey: binding.names.renderStream,
      group: binding.names.renderGroup,
    },
    {
      streamKey: binding.names.verifyStream,
      group: binding.names.verifyGroup,
    },
  ];

  for (const { streamKey, group } of pairs) {
    if (!streamKeyBelongsToQaRunBinding(binding, streamKey)) return false;
    const authorized = authorizedGroupForQaRunScopedStream(binding, streamKey);
    if (authorized == null || authorized !== group) return false;
    const created = await input.redis.qaXgroupCreate({
      streamKey,
      group,
      id: "0",
      mkstream: true,
    });
    if (created === "failed") return false;
  }
  return true;
}

/**
 * Destroy only the coherent production-protocol group for a run-scoped stream.
 * Rejects arbitrary groups, DLQ keys, and cross-kind pairs.
 */
export async function destroyGroupOnQaRunScopedStream(input: {
  readonly redis: UpstashLiveConsumerPort;
  readonly binding: unknown;
  readonly streamKey: string;
  readonly group: string;
}): Promise<boolean> {
  const binding = canonicalizeQaRunScopedStreamBinding(input.binding);
  if (binding == null) return false;
  if (typeof input.streamKey !== "string" || typeof input.group !== "string") {
    return false;
  }
  if (!streamKeyBelongsToQaRunBinding(binding, input.streamKey)) {
    return false;
  }
  const authorized = authorizedGroupForQaRunScopedStream(
    binding,
    input.streamKey,
  );
  if (authorized == null || authorized !== input.group) {
    return false;
  }
  return input.redis.qaXgroupDestroy(input.streamKey, input.group);
}

/**
 * Exact delete of one binding-owned key with authoritative DEL outcome.
 *
 * Idempotency rule (explicit): DEL deletedCount=0 is acceptable only when a
 * subsequent EXISTS probe returns ok:true, exists:false (already absent).
 * Provider/malformed DEL or EXISTS failure always fails.
 */
export async function deleteExactQaRunScopedKey(input: {
  readonly redis: UpstashLiveConsumerPort;
  readonly binding: QaRunScopedStreamBinding;
  readonly streamKey: string;
}): Promise<boolean> {
  if (!streamKeyBelongsToQaRunBinding(input.binding, input.streamKey)) {
    return false;
  }
  let delResult: HeadlessKeyDeleteResult;
  try {
    delResult = await input.redis.qaDelExactKey(input.streamKey);
  } catch {
    return false;
  }
  if (!delResult.ok) return false;

  let exists: HeadlessKeyProbeResult;
  try {
    exists = await input.redis.qaProbeKeyExists(input.streamKey);
  } catch {
    return false;
  }
  if (!exists.ok) return false;
  if (exists.exists) return false;
  // deletedCount 0 or 1 both OK when EXISTS confirms absence.
  return true;
}

/**
 * Delete exact run-scoped stream/DLQ keys; require EXISTS false for each.
 * Never infers absence from XINFO GROUPS.
 */
export async function deleteQaRunScopedStreamKeys(input: {
  readonly redis: UpstashLiveConsumerPort;
  readonly binding: unknown;
}): Promise<boolean> {
  const binding = canonicalizeQaRunScopedStreamBinding(input.binding);
  if (binding == null) return false;
  const keys = [
    binding.names.renderStream,
    binding.names.verifyStream,
    binding.names.renderDlq,
    binding.names.verifyDlq,
  ];
  for (const streamKey of keys) {
    const ok = await deleteExactQaRunScopedKey({
      redis: input.redis,
      binding,
      streamKey,
    });
    if (!ok) return false;
  }
  return true;
}
