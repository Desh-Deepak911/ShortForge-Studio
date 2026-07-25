/**
 * Upstash TCP Streams consumer — worker-only.
 * Uses ioredis command API with array args (shell-free).
 * NEVER imported by product routes / control-plane production barrel.
 */

import Redis from "ioredis";

import type { HeadlessEnvName } from "../../control-plane/runtime/upstash-environment";
import {
  readConfiguredHeadlessUpstashConsumerConfig,
  type HeadlessConfiguredUpstashConsumerConfig,
} from "../../control-plane/runtime/upstash-environment";
import {
  interpretExactXpendingResponse,
  pendingProbeToDeprecatedBoolean,
  type HeadlessPendingProbeResult,
} from "../../control-plane/runtime/pending-probe";
import {
  interpretExactXrangeResponse,
  type HeadlessStreamPresenceProbeResult,
} from "../../control-plane/runtime/stream-presence-probe";
import {
  interpretXinfoGroupsResponse,
  type HeadlessGroupListProbeResult,
} from "../../control-plane/runtime/group-presence-probe";
import { isExactQaRunScopedStreamKey } from "../../control-plane/runtime/qa-run-scoped-stream-key";
import {
  interpretDelResponse,
  interpretExistsResponse,
  type HeadlessKeyDeleteResult,
  type HeadlessKeyProbeResult,
} from "../../control-plane/runtime/key-presence-probe";
import { deriveHeadlessQueueStreamNames } from "../../control-plane/services/headless-queue-stream-names";
import {
  validateHeadlessStreamQueueEntry,
  type HeadlessDeliveryKind,
  type HeadlessStreamQueueEntry,
} from "../../control-plane/ports/queue.port";
import type {
  HeadlessStreamQueuePort,
  HeadlessStreamQueueReadItem,
} from "../../control-plane/ports/stream-queue.port";
import { cpFail, cpOk } from "../../control-plane/types/control-plane.types";
import type { HeadlessQueueDlqClass } from "../../control-plane/types/queue-dlq-entry";
import { validateHeadlessQueueDlqEntry } from "../../control-plane/types/queue-dlq-entry";
import {
  QA_LOCK_COMPARE_AND_DELETE_LUA,
  QA_LOCK_COMPARE_AND_RENEW_LUA,
} from "../../control-plane/adapters/qa-lock-lua";

const TRIM_MAXLEN = 10_000;

/** ioredis-like surface for injection (FakeRedis / tests). */
export type HeadlessIoredisLike = {
  call: (command: string, ...args: Array<string | number>) => Promise<unknown>;
  quit?: () => Promise<unknown>;
  disconnect?: () => void;
};

export type UpstashTcpStreamConsumerOptions = {
  readonly config?: HeadlessConfiguredUpstashConsumerConfig;
  readonly envName?: HeadlessEnvName;
  readonly client?: HeadlessIoredisLike;
};

export class UpstashTcpStreamConsumerAdapter implements HeadlessStreamQueuePort {
  private readonly client: HeadlessIoredisLike | null;
  private readonly names: ReturnType<typeof deriveHeadlessQueueStreamNames> | null;
  private readonly configured: boolean;
  private readonly ownsClient: boolean;
  private groupsReady = false;

  constructor(options: UpstashTcpStreamConsumerOptions = {}) {
    const config =
      options.config ?? readConfiguredHeadlessUpstashConsumerConfig();
    if (options.client != null) {
      const envName = options.envName ?? config?.envName ?? "local";
      this.client = options.client;
      this.names = deriveHeadlessQueueStreamNames(envName);
      this.configured = true;
      this.ownsClient = false;
      return;
    }
    if (config == null) {
      this.client = null;
      this.names = null;
      this.configured = false;
      this.ownsClient = false;
      return;
    }
    this.client = new Redis(config.tcpUrl, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
    }) as unknown as HeadlessIoredisLike;
    this.names = deriveHeadlessQueueStreamNames(config.envName);
    this.configured = true;
    this.ownsClient = true;
  }

  async close(): Promise<void> {
    if (!this.ownsClient || this.client == null) return;
    try {
      if (this.client.quit) await this.client.quit();
      else if (this.client.disconnect) this.client.disconnect();
    } catch {
      // ignore close errors
    }
  }

  /**
   * Hosted verify→promote path enqueues render over the same TCP client.
   * REST producer credentials remain forbidden in the hosted worker env.
   */
  async enqueueRender(message: HeadlessStreamQueueEntry) {
    return this.enqueueValidated("render", message);
  }

  async enqueueVerify(message: HeadlessStreamQueueEntry) {
    return this.enqueueValidated("verify", message);
  }

  private async enqueueValidated(
    kind: HeadlessDeliveryKind,
    message: HeadlessStreamQueueEntry | unknown,
  ) {
    if (!this.configured || this.client == null || this.names == null) {
      return cpFail(
        "CONFIGURATION_UNAVAILABLE",
        "Upstash TCP consumer is not configured.",
      );
    }
    const validated = validateHeadlessStreamQueueEntry(message);
    if (!validated.ok) {
      return cpFail("HOSTILE_INPUT", validated.message);
    }
    if (validated.entry.deliveryKind !== kind) {
      return cpFail("HOSTILE_INPUT", "Delivery kind mismatch.");
    }
    const stream =
      kind === "render" ? this.names.renderStream : this.names.verifyStream;
    try {
      const args: Array<string | number> = [stream, "*"];
      if (validated.entry.deliveryKind === "render") {
        args.push(
          "deliveryId",
          validated.entry.deliveryId,
          "jobId",
          validated.entry.jobId,
          "ownerId",
          validated.entry.ownerId,
          "attempt",
          String(validated.entry.attempt),
          "enqueuedAtMs",
          String(validated.entry.enqueuedAtMs),
          "deliveryKind",
          "render",
        );
      } else {
        args.push(
          "deliveryId",
          validated.entry.deliveryId,
          "ownedObjectId",
          validated.entry.ownedObjectId,
          "ownerId",
          validated.entry.ownerId,
          "attempt",
          String(validated.entry.attempt),
          "enqueuedAtMs",
          String(validated.entry.enqueuedAtMs),
          "deliveryKind",
          "verify",
        );
      }
      const streamId = await this.client.call("XADD", ...args);
      if (streamId == null || typeof streamId !== "string") {
        return cpFail("QUEUE_ENQUEUE_FAILED", "Stream enqueue failed.");
      }
      try {
        await this.client.call("XTRIM", stream, "MAXLEN", "~", TRIM_MAXLEN);
      } catch {
        // Trim is best-effort after successful enqueue.
      }
      return cpOk({ streamId });
    } catch {
      return cpFail("QUEUE_ENQUEUE_FAILED", "Stream enqueue failed.");
    }
  }

  async ensureConsumerGroups() {
    if (!this.configured || this.client == null || this.names == null) {
      return cpFail(
        "CONFIGURATION_UNAVAILABLE",
        "Upstash TCP consumer is not configured.",
      );
    }
    try {
      await this.createGroup(this.names.renderStream, this.names.renderGroup);
      await this.createGroup(this.names.verifyStream, this.names.verifyGroup);
      this.groupsReady = true;
      return cpOk(true as const);
    } catch {
      return cpFail("INTERNAL_ERROR", "Consumer group ensure failed.");
    }
  }

  private async createGroup(stream: string, group: string): Promise<void> {
    if (this.client == null) return;
    try {
      await this.client.call(
        "XGROUP",
        "CREATE",
        stream,
        group,
        "0",
        "MKSTREAM",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("BUSYGROUP")) throw err;
    }
  }

  async readGroup(input: {
    readonly kind: HeadlessDeliveryKind;
    readonly consumerName: string;
    readonly count: number;
    readonly blockMs: number;
    readonly signal?: AbortSignal;
  }) {
    if (!this.configured || this.client == null || this.names == null) {
      return cpFail(
        "CONFIGURATION_UNAVAILABLE",
        "Upstash TCP consumer is not configured.",
      );
    }
    if (input.signal?.aborted) {
      return cpFail("INTERNAL_ERROR", "Read aborted.");
    }
    if (!this.groupsReady) {
      const ensured = await this.ensureConsumerGroups();
      if (!ensured.ok) return ensured;
    }
    if (
      !Number.isSafeInteger(input.count) ||
      input.count < 1 ||
      input.count > 100
    ) {
      return cpFail("INVALID_TRANSPORT", "Invalid read count.");
    }
    if (
      !Number.isSafeInteger(input.blockMs) ||
      input.blockMs < 0 ||
      input.blockMs > 60_000
    ) {
      return cpFail("INVALID_TRANSPORT", "Invalid blockMs.");
    }
    const stream =
      input.kind === "render"
        ? this.names.renderStream
        : this.names.verifyStream;
    const group =
      input.kind === "render" ? this.names.renderGroup : this.names.verifyGroup;
    try {
      const onAbort = () => {
        // Best-effort: disconnect interrupts BLOCK.
        try {
          this.client?.disconnect?.();
        } catch {
          // ignore
        }
      };
      if (input.signal) {
        input.signal.addEventListener("abort", onAbort, { once: true });
      }
      try {
        const raw = await this.client.call(
          "XREADGROUP",
          "GROUP",
          group,
          input.consumerName,
          "COUNT",
          input.count,
          "BLOCK",
          input.blockMs,
          "STREAMS",
          stream,
          ">",
        );
        return cpOk(parseReadResult(raw));
      } finally {
        if (input.signal) {
          input.signal.removeEventListener("abort", onAbort);
        }
      }
    } catch {
      if (input.signal?.aborted) {
        return cpFail("INTERNAL_ERROR", "Read aborted.");
      }
      return cpFail("INTERNAL_ERROR", "Stream readGroup failed.");
    }
  }

  async ack(input: {
    readonly kind: HeadlessDeliveryKind;
    readonly streamId: string;
    readonly deliveryId: string;
  }) {
    if (!this.configured || this.client == null || this.names == null) {
      return cpFail(
        "CONFIGURATION_UNAVAILABLE",
        "Upstash TCP consumer is not configured.",
      );
    }
    void input.deliveryId;
    const stream =
      input.kind === "render"
        ? this.names.renderStream
        : this.names.verifyStream;
    const group =
      input.kind === "render" ? this.names.renderGroup : this.names.verifyGroup;
    try {
      const n = await this.client.call("XACK", stream, group, input.streamId);
      const count = typeof n === "number" ? n : Number(n);
      if (!(count > 0)) {
        return cpFail(
          "INTERNAL_ERROR",
          "Stream ack acknowledged zero pending entries.",
        );
      }
      return cpOk(true as const);
    } catch {
      return cpFail("INTERNAL_ERROR", "Stream ack failed.");
    }
  }

  async autoClaimIdle(input: {
    readonly kind: HeadlessDeliveryKind;
    readonly consumerName: string;
    readonly minIdleMs: number;
    readonly count: number;
  }) {
    if (!this.configured || this.client == null || this.names == null) {
      return cpFail(
        "CONFIGURATION_UNAVAILABLE",
        "Upstash TCP consumer is not configured.",
      );
    }
    if (!this.groupsReady) {
      const ensured = await this.ensureConsumerGroups();
      if (!ensured.ok) return ensured;
    }
    const stream =
      input.kind === "render"
        ? this.names.renderStream
        : this.names.verifyStream;
    const group =
      input.kind === "render" ? this.names.renderGroup : this.names.verifyGroup;
    try {
      // Touch XPENDING for ops visibility (idle reclaim uses XAUTOCLAIM).
      await this.client.call("XPENDING", stream, group);
      const raw = await this.client.call(
        "XAUTOCLAIM",
        stream,
        group,
        input.consumerName,
        input.minIdleMs,
        "0-0",
        "COUNT",
        input.count,
      );
      const claimed = Array.isArray(raw) ? raw[1] : [];
      return cpOk(parseClaimedEntries(claimed));
    } catch {
      return cpFail("INTERNAL_ERROR", "Stream autoClaimIdle failed.");
    }
  }

  async moveToDlq(input: {
    readonly kind: HeadlessDeliveryKind;
    readonly entry: HeadlessStreamQueueEntry;
    readonly class: HeadlessQueueDlqClass;
    readonly reasonId: string;
  }) {
    if (!this.configured || this.client == null || this.names == null) {
      return cpFail(
        "CONFIGURATION_UNAVAILABLE",
        "Upstash TCP consumer is not configured.",
      );
    }
    const dlqEntry =
      input.entry.deliveryKind === "render"
        ? {
            deliveryId: input.entry.deliveryId,
            jobId: input.entry.jobId,
            ownerId: input.entry.ownerId,
            attempt: input.entry.attempt,
            class: input.class,
            enqueuedAtMs: input.entry.enqueuedAtMs,
            reasonId: input.reasonId,
          }
        : {
            deliveryId: input.entry.deliveryId,
            ownedObjectId: input.entry.ownedObjectId,
            ownerId: input.entry.ownerId,
            attempt: input.entry.attempt,
            class: input.class,
            enqueuedAtMs: input.entry.enqueuedAtMs,
            reasonId: input.reasonId,
          };
    const validated = validateHeadlessQueueDlqEntry(dlqEntry);
    if (!validated.ok) {
      return cpFail("HOSTILE_INPUT", validated.message);
    }
    const dlq =
      input.kind === "render" ? this.names.renderDlq : this.names.verifyDlq;
    try {
      const args: Array<string | number> = [dlq, "*"];
      args.push("deliveryId", validated.entry.deliveryId);
      if (validated.entry.jobId != null) {
        args.push("jobId", validated.entry.jobId);
      }
      if (validated.entry.ownedObjectId != null) {
        args.push("ownedObjectId", validated.entry.ownedObjectId);
      }
      args.push(
        "ownerId",
        validated.entry.ownerId,
        "attempt",
        String(validated.entry.attempt),
        "class",
        validated.entry.class,
        "enqueuedAtMs",
        String(validated.entry.enqueuedAtMs),
        "reasonId",
        validated.entry.reasonId,
      );
      await this.client.call("XADD", ...args);
      return cpOk(true as const);
    } catch {
      return cpFail("INTERNAL_ERROR", "DLQ move failed.");
    }
  }

  /** Optional trim helper for ops — not part of dual-lease consume path. */
  async trimStream(kind: HeadlessDeliveryKind): Promise<void> {
    if (!this.configured || this.client == null || this.names == null) return;
    const stream =
      kind === "render" ? this.names.renderStream : this.names.verifyStream;
    try {
      await this.client.call("XTRIM", stream, "MAXLEN", "~", TRIM_MAXLEN);
    } catch {
      // best-effort
    }
  }

  /** QA: XACK a tracked pending entry (does not destroy shared groups). */
  async qaXack(
    kind: HeadlessDeliveryKind,
    streamId: string,
  ): Promise<boolean> {
    if (!this.configured || this.client == null || this.names == null) {
      return false;
    }
    const stream =
      kind === "render" ? this.names.renderStream : this.names.verifyStream;
    const group =
      kind === "render" ? this.names.renderGroup : this.names.verifyGroup;
    try {
      const n = await this.client.call("XACK", stream, group, streamId);
      return typeof n === "number" ? n > 0 : Number(n) > 0;
    } catch {
      return false;
    }
  }

  /** QA: XDEL only the given stream ids (tracked cleanup). */
  async qaXdel(
    streamKey: string,
    ...streamIds: string[]
  ): Promise<number> {
    if (!this.configured || this.client == null || streamIds.length === 0) {
      return 0;
    }
    try {
      const n = await this.client.call("XDEL", streamKey, ...streamIds);
      return typeof n === "number" ? n : Number(n) || 0;
    } catch {
      return 0;
    }
  }

  /** QA: remove a run-scoped consumer; never DESTROY the shared group. */
  async qaDelConsumer(
    kind: HeadlessDeliveryKind,
    consumerName: string,
  ): Promise<boolean> {
    if (!this.configured || this.client == null || this.names == null) {
      return false;
    }
    const stream =
      kind === "render" ? this.names.renderStream : this.names.verifyStream;
    const group =
      kind === "render" ? this.names.renderGroup : this.names.verifyGroup;
    try {
      await this.client.call(
        "XGROUP",
        "DELCONSUMER",
        stream,
        group,
        consumerName,
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Exact pending probe on the production worker group. */
  async qaProbePending(
    kind: HeadlessDeliveryKind,
    streamId: string,
  ): Promise<HeadlessPendingProbeResult> {
    if (!this.configured || this.client == null || this.names == null) {
      return { ok: false, reasonId: "pending_probe_failed" };
    }
    const stream =
      kind === "render" ? this.names.renderStream : this.names.verifyStream;
    const group =
      kind === "render" ? this.names.renderGroup : this.names.verifyGroup;
    return this.qaProbePendingInGroup(stream, group, streamId);
  }

  /** @deprecated Fail-closed boolean — use `qaProbePending`. */
  async qaIsPending(
    kind: HeadlessDeliveryKind,
    streamId: string,
  ): Promise<boolean> {
    return pendingProbeToDeprecatedBoolean(
      await this.qaProbePending(kind, streamId),
    );
  }

  /** QA: forge a raw XADD (malformed DLQ cases). Returns stream id or null. */
  async qaXaddRaw(
    streamKey: string,
    fields: Readonly<Record<string, string>>,
  ): Promise<string | null> {
    if (!this.configured || this.client == null) return null;
    try {
      const args: Array<string | number> = [streamKey, "*"];
      for (const [k, v] of Object.entries(fields)) {
        args.push(k, v);
      }
      const id = await this.client.call("XADD", ...args);
      return id == null ? null : String(id);
    } catch {
      return null;
    }
  }

  async qaSetNxPx(
    key: string,
    value: string,
    pxMs: number,
  ): Promise<boolean> {
    if (!this.configured || this.client == null) return false;
    try {
      const r = await this.client.call("SET", key, value, "NX", "PX", pxMs);
      return r === "OK";
    } catch {
      return false;
    }
  }

  async qaDelKey(key: string): Promise<boolean> {
    if (!this.configured || this.client == null) return false;
    try {
      const n = await this.client.call("DEL", key);
      return typeof n === "number" ? n > 0 : Number(n) > 0;
    } catch {
      return false;
    }
  }

  async qaDelExactKey(key: string): Promise<HeadlessKeyDeleteResult> {
    if (!this.configured || this.client == null) {
      return { ok: false, reasonId: "key_delete_failed" };
    }
    if (key.length === 0) {
      return { ok: false, reasonId: "key_delete_failed" };
    }
    try {
      const raw = await this.client.call("DEL", key);
      return interpretDelResponse(raw);
    } catch {
      return { ok: false, reasonId: "key_delete_failed" };
    }
  }

  async qaProbeKeyExists(key: string): Promise<HeadlessKeyProbeResult> {
    if (!this.configured || this.client == null) {
      return { ok: false, reasonId: "key_probe_failed" };
    }
    if (key.length === 0) {
      return { ok: false, reasonId: "key_probe_failed" };
    }
    try {
      const raw = await this.client.call("EXISTS", key);
      return interpretExistsResponse(raw);
    } catch {
      return { ok: false, reasonId: "key_probe_failed" };
    }
  }

  async qaCompareAndRenewLock(
    key: string,
    token: string,
    ttlMs: number,
  ): Promise<boolean> {
    if (!this.configured || this.client == null) return false;
    try {
      const r = await this.client.call(
        "EVAL",
        QA_LOCK_COMPARE_AND_RENEW_LUA,
        1,
        key,
        token,
        ttlMs,
      );
      return Number(r) === 1;
    } catch {
      return false;
    }
  }

  async qaCompareAndDeleteLock(
    key: string,
    token: string,
  ): Promise<"deleted" | "not_owner" | "error"> {
    if (!this.configured || this.client == null) return "error";
    try {
      const r = await this.client.call(
        "EVAL",
        QA_LOCK_COMPARE_AND_DELETE_LUA,
        1,
        key,
        token,
      );
      return Number(r) === 1 ? "deleted" : "not_owner";
    } catch {
      return "error";
    }
  }

  async qaXgroupCreate(input: {
    readonly streamKey: string;
    readonly group: string;
    readonly id: "$" | "0" | string;
    readonly mkstream?: boolean;
  }): Promise<"created" | "busy" | "failed"> {
    if (!this.configured || this.client == null) return "failed";
    try {
      const args: Array<string | number> = [
        "CREATE",
        input.streamKey,
        input.group,
        input.id,
      ];
      if (input.mkstream !== false) args.push("MKSTREAM");
      await this.client.call("XGROUP", ...args);
      return "created";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("BUSYGROUP")) return "busy";
      return "failed";
    }
  }

  async qaXgroupDestroy(
    streamKey: string,
    group: string,
  ): Promise<boolean> {
    if (!this.configured || this.client == null) return false;
    // Never destroy production worker groups on shared production streams.
    // Run-scoped QA streams (`hfq:qa-run:v1:…`) may destroy protocol groups.
    if (
      (group === "hfq:render-workers" || group === "hfq:verify-workers") &&
      !isExactQaRunScopedStreamKey(streamKey)
    ) {
      return false;
    }
    try {
      const n = await this.client.call("XGROUP", "DESTROY", streamKey, group);
      return typeof n === "number" ? n > 0 : Number(n) > 0;
    } catch {
      return false;
    }
  }

  async qaXinfoGroups(streamKey: string): Promise<HeadlessGroupListProbeResult> {
    if (!this.configured || this.client == null) {
      return { ok: false, reasonId: "group_probe_failed" };
    }
    if (streamKey.length === 0) {
      return { ok: false, reasonId: "group_probe_failed" };
    }
    try {
      const raw = await this.client.call("XINFO", "GROUPS", streamKey);
      return interpretXinfoGroupsResponse(raw);
    } catch {
      return { ok: false, reasonId: "group_probe_failed" };
    }
  }

  async qaXrange(input: {
    readonly streamKey: string;
    readonly start: string;
    readonly end: string;
    readonly count?: number;
  }): Promise<
    readonly {
      readonly streamId: string;
      readonly fields: Readonly<Record<string, string>>;
    }[]
  > {
    if (!this.configured || this.client == null) return Object.freeze([]);
    try {
      const args: Array<string | number> = [
        input.streamKey,
        input.start,
        input.end,
      ];
      if (input.count != null) {
        args.push("COUNT", input.count);
      }
      const raw = await this.client.call("XRANGE", ...args);
      if (!Array.isArray(raw)) return Object.freeze([]);
      const out: Array<{
        streamId: string;
        fields: Readonly<Record<string, string>>;
      }> = [];
      for (const item of raw) {
        if (!Array.isArray(item) || item.length < 2) continue;
        const streamId = String(item[0]);
        const flat = item[1];
        if (!Array.isArray(flat)) continue;
        const fields: Record<string, string> = {};
        for (let i = 0; i < flat.length; i += 2) {
          fields[String(flat[i])] = String(flat[i + 1]);
        }
        out.push({ streamId, fields: Object.freeze(fields) });
      }
      return Object.freeze(out);
    } catch {
      return Object.freeze([]);
    }
  }

  async qaXreadGroupInGroup(input: {
    readonly streamKey: string;
    readonly group: string;
    readonly consumerName: string;
    readonly count: number;
    readonly blockMs: number;
    readonly signal?: AbortSignal;
  }): Promise<
    | {
        readonly ok: true;
        readonly items: readonly {
          readonly streamId: string;
          readonly fields: Readonly<Record<string, string>>;
        }[];
      }
    | { readonly ok: false }
  > {
    if (!this.configured || this.client == null) return { ok: false };
    if (input.signal?.aborted) return { ok: false };
    try {
      const raw = await this.client.call(
        "XREADGROUP",
        "GROUP",
        input.group,
        input.consumerName,
        "COUNT",
        input.count,
        "BLOCK",
        Math.max(0, input.blockMs),
        "STREAMS",
        input.streamKey,
        ">",
      );
      if (raw == null || !Array.isArray(raw) || raw.length === 0) {
        return { ok: true, items: Object.freeze([]) };
      }
      const first = raw[0];
      if (!Array.isArray(first) || first.length < 2) {
        return { ok: true, items: Object.freeze([]) };
      }
      const entries = first[1];
      if (!Array.isArray(entries)) {
        return { ok: true, items: Object.freeze([]) };
      }
      const out: Array<{
        streamId: string;
        fields: Readonly<Record<string, string>>;
      }> = [];
      for (const item of entries) {
        if (!Array.isArray(item) || item.length < 2) continue;
        const streamId = String(item[0]);
        const flat = item[1];
        if (!Array.isArray(flat)) continue;
        const fields: Record<string, string> = {};
        for (let i = 0; i < flat.length; i += 2) {
          fields[String(flat[i])] = String(flat[i + 1]);
        }
        out.push({ streamId, fields: Object.freeze(fields) });
      }
      return { ok: true, items: Object.freeze(out) };
    } catch {
      return { ok: false };
    }
  }

  async qaXackInGroup(
    streamKey: string,
    group: string,
    streamId: string,
  ): Promise<boolean> {
    if (!this.configured || this.client == null) return false;
    try {
      const n = await this.client.call("XACK", streamKey, group, streamId);
      return typeof n === "number" ? n > 0 : Number(n) > 0;
    } catch {
      return false;
    }
  }

  async qaProbePendingInGroup(
    streamKey: string,
    group: string,
    streamId: string,
  ): Promise<HeadlessPendingProbeResult> {
    if (!this.configured || this.client == null) {
      return { ok: false, reasonId: "pending_probe_failed" };
    }
    try {
      const raw = await this.client.call(
        "XPENDING",
        streamKey,
        group,
        streamId,
        streamId,
        1,
      );
      return interpretExactXpendingResponse(raw, streamId);
    } catch {
      return { ok: false, reasonId: "pending_probe_failed" };
    }
  }

  /** @deprecated Fail-closed boolean — use `qaProbePendingInGroup`. */
  async qaIsPendingInGroup(
    streamKey: string,
    group: string,
    streamId: string,
  ): Promise<boolean> {
    return pendingProbeToDeprecatedBoolean(
      await this.qaProbePendingInGroup(streamKey, group, streamId),
    );
  }

  async qaProbeStreamEntry(
    streamKey: string,
    streamId: string,
  ): Promise<HeadlessStreamPresenceProbeResult> {
    if (!this.configured || this.client == null) {
      return { ok: false, reasonId: "stream_presence_probe_failed" };
    }
    try {
      const raw = await this.client.call(
        "XRANGE",
        streamKey,
        streamId,
        streamId,
        "COUNT",
        1,
      );
      return interpretExactXrangeResponse(raw, streamId);
    } catch {
      return { ok: false, reasonId: "stream_presence_probe_failed" };
    }
  }

  async qaDelConsumerInGroup(
    streamKey: string,
    group: string,
    consumerName: string,
  ): Promise<boolean> {
    if (!this.configured || this.client == null) return false;
    try {
      await this.client.call(
        "XGROUP",
        "DELCONSUMER",
        streamKey,
        group,
        consumerName,
      );
      return true;
    } catch {
      return false;
    }
  }

  async qaAutoClaimIdleInGroup(input: {
    readonly streamKey: string;
    readonly group: string;
    readonly consumerName: string;
    readonly minIdleMs: number;
    readonly count: number;
  }): Promise<
    | {
        readonly ok: true;
        readonly items: readonly {
          readonly streamId: string;
          readonly fields: Readonly<Record<string, string>>;
        }[];
      }
    | { readonly ok: false }
  > {
    if (!this.configured || this.client == null) return { ok: false };
    try {
      const raw = await this.client.call(
        "XAUTOCLAIM",
        input.streamKey,
        input.group,
        input.consumerName,
        input.minIdleMs,
        "0-0",
        "COUNT",
        input.count,
      );
      const claimed = Array.isArray(raw) ? raw[1] : [];
      if (!Array.isArray(claimed)) {
        return { ok: true, items: Object.freeze([]) };
      }
      const items: Array<{
        streamId: string;
        fields: Readonly<Record<string, string>>;
      }> = [];
      for (const item of claimed) {
        if (!Array.isArray(item) || item.length < 2) continue;
        const streamId = String(item[0]);
        const flat = item[1];
        if (!Array.isArray(flat)) continue;
        const fields: Record<string, string> = {};
        for (let i = 0; i < flat.length; i += 2) {
          fields[String(flat[i])] = String(flat[i + 1]);
        }
        items.push({ streamId, fields: Object.freeze(fields) });
      }
      return { ok: true, items: Object.freeze(items) };
    } catch {
      return { ok: false };
    }
  }

  streamNames(): ReturnType<typeof deriveHeadlessQueueStreamNames> | null {
    return this.names;
  }
}

function parseReadResult(raw: unknown): readonly HeadlessStreamQueueReadItem[] {
  if (raw == null || !Array.isArray(raw) || raw.length === 0) return [];
  const first = raw[0];
  if (!Array.isArray(first) || first.length < 2) return [];
  return parseClaimedEntries(first[1]);
}

function parseClaimedEntries(raw: unknown): readonly HeadlessStreamQueueReadItem[] {
  if (!Array.isArray(raw)) return [];
  const out: HeadlessStreamQueueReadItem[] = [];
  for (const item of raw) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const streamId = String(item[0]);
    const flat = item[1];
    if (!Array.isArray(flat)) continue;
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < flat.length; i += 2) {
      const k = String(flat[i]);
      const v = String(flat[i + 1]);
      if (k === "attempt" || k === "enqueuedAtMs") {
        obj[k] = Number(v);
      } else {
        obj[k] = v;
      }
    }
    const validated = validateHeadlessStreamQueueEntry(obj);
    if (!validated.ok) continue;
    out.push({ streamId, entry: validated.entry });
  }
  return Object.freeze(out.slice());
}
