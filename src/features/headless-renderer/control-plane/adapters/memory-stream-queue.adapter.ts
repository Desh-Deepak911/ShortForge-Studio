/**
 * In-memory dual-lease stream queue for protocol unit tests.
 * Uses FakeRedisStreams under the hood.
 */

import type { HeadlessEnvName } from "../runtime/upstash-environment";
import {
  interpretExactXpendingResponse,
  pendingProbeToDeprecatedBoolean,
  type HeadlessPendingProbeResult,
} from "../runtime/pending-probe";
import {
  interpretExactXrangeResponse,
  type HeadlessStreamPresenceProbeResult,
} from "../runtime/stream-presence-probe";
import {
  interpretXinfoGroupsResponse,
  type HeadlessGroupListProbeResult,
} from "../runtime/group-presence-probe";
import { isExactQaRunScopedStreamKey } from "../runtime/qa-run-scoped-stream-key";
import {
  interpretDelResponse,
  interpretExistsResponse,
  type HeadlessKeyDeleteResult,
  type HeadlessKeyProbeResult,
} from "../runtime/key-presence-probe";
import { deriveHeadlessQueueStreamNames } from "../services/headless-queue-stream-names";
import {
  validateHeadlessStreamQueueEntry,
  type HeadlessRenderQueueMessage,
  type HeadlessStreamQueueEntry,
  type HeadlessVerifyQueueMessage,
} from "../ports/queue.port";
import type {
  HeadlessStreamQueuePort,
  HeadlessStreamQueueReadItem,
} from "../ports/stream-queue.port";
import { cpFail, cpOk } from "../types/control-plane.types";
import type { HeadlessQueueDlqClass } from "../types/queue-dlq-entry";
import { validateHeadlessQueueDlqEntry } from "../types/queue-dlq-entry";
import {
  createFakeIoredisLike,
  FakeRedisStreams,
} from "../testing/fake-redis-streams";
import {
  QA_LOCK_COMPARE_AND_DELETE_LUA,
  QA_LOCK_COMPARE_AND_RENEW_LUA,
} from "./qa-lock-lua";

const TRIM_MAXLEN = 10_000;

export type MemoryHeadlessStreamQueueAdapterOptions = {
  readonly envName?: HeadlessEnvName;
  readonly fake?: FakeRedisStreams;
  readonly nowMs?: () => number;
};

export class MemoryHeadlessStreamQueueAdapter implements HeadlessStreamQueuePort {
  private readonly fake: FakeRedisStreams;
  private readonly names: ReturnType<typeof deriveHeadlessQueueStreamNames>;
  private readonly redis: ReturnType<typeof createFakeIoredisLike>;
  private groupsReady = false;
  private failNextEnqueue = false;
  private failNextAck = false;

  constructor(options: MemoryHeadlessStreamQueueAdapterOptions = {}) {
    this.fake = options.fake ?? new FakeRedisStreams({ nowMs: options.nowMs });
    this.names = deriveHeadlessQueueStreamNames(options.envName ?? "local");
    this.redis = createFakeIoredisLike(this.fake);
  }

  /** Test hook — expose underlying fake. */
  testingFake(): FakeRedisStreams {
    return this.fake;
  }

  testingFailNextEnqueue(): void {
    this.failNextEnqueue = true;
  }

  private enqueueCount = 0;

  /** Test hook — successful enqueueRender call count (XADD analogue). */
  testingEnqueueCount(): number {
    return this.enqueueCount;
  }

  /** Test hook — next ack() returns INTERNAL_ERROR without XACK. */
  testingFailNextAck(): void {
    this.failNextAck = true;
  }

  async enqueueRender(message: HeadlessRenderQueueMessage) {
    return this.enqueue("render", message);
  }

  async enqueueVerify(message: HeadlessVerifyQueueMessage) {
    return this.enqueue("verify", message);
  }

  private async enqueue(
    kind: "render" | "verify",
    message: HeadlessStreamQueueEntry,
  ) {
    if (this.failNextEnqueue) {
      this.failNextEnqueue = false;
      return cpFail("QUEUE_ENQUEUE_FAILED", "Injected stream enqueue failure.");
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
      const fields = entryToFields(validated.entry);
      const streamId = await this.fake.xaddFields(stream, fields);
      await this.fake.xtrim(stream, "MAXLEN", "~", TRIM_MAXLEN);
      this.enqueueCount += 1;
      return cpOk({ streamId });
    } catch {
      return cpFail("QUEUE_ENQUEUE_FAILED", "Stream enqueue failed.");
    }
  }

  async ensureConsumerGroups() {
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
    try {
      await this.redis.call(
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
    readonly kind: "render" | "verify";
    readonly consumerName: string;
    readonly count: number;
    readonly blockMs: number;
    readonly signal?: AbortSignal;
  }) {
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
    const stream =
      input.kind === "render"
        ? this.names.renderStream
        : this.names.verifyStream;
    const group =
      input.kind === "render" ? this.names.renderGroup : this.names.verifyGroup;
    try {
      const raw = await this.redis.call(
        "XREADGROUP",
        "GROUP",
        group,
        input.consumerName,
        "COUNT",
        input.count,
        "BLOCK",
        Math.max(0, input.blockMs),
        "STREAMS",
        stream,
        ">",
      );
      return cpOk(parseReadResult(raw));
    } catch {
      return cpFail("INTERNAL_ERROR", "Stream readGroup failed.");
    }
  }

  async ack(input: {
    readonly kind: "render" | "verify";
    readonly streamId: string;
    readonly deliveryId: string;
  }) {
    void input.deliveryId;
    if (this.failNextAck) {
      this.failNextAck = false;
      return cpFail("INTERNAL_ERROR", "Injected stream ack failure.");
    }
    const stream =
      input.kind === "render"
        ? this.names.renderStream
        : this.names.verifyStream;
    const group =
      input.kind === "render" ? this.names.renderGroup : this.names.verifyGroup;
    try {
      const n = await this.redis.call("XACK", stream, group, input.streamId);
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
    readonly kind: "render" | "verify";
    readonly consumerName: string;
    readonly minIdleMs: number;
    readonly count: number;
  }) {
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
      const raw = await this.redis.call(
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

  /** QA: XACK tracked pending on the production worker group. */
  async qaXack(
    kind: "render" | "verify",
    streamId: string,
  ): Promise<boolean> {
    const stream =
      kind === "render" ? this.names.renderStream : this.names.verifyStream;
    const group =
      kind === "render" ? this.names.renderGroup : this.names.verifyGroup;
    try {
      const n = await this.fake.xack(stream, group, streamId);
      return typeof n === "number" ? n > 0 : Number(n) > 0;
    } catch {
      return false;
    }
  }

  async qaXdel(streamKey: string, ...streamIds: string[]): Promise<number> {
    try {
      return await this.fake.xdel(streamKey, ...streamIds);
    } catch {
      return 0;
    }
  }

  async qaDelConsumer(
    kind: "render" | "verify",
    consumerName: string,
  ): Promise<boolean> {
    const stream =
      kind === "render" ? this.names.renderStream : this.names.verifyStream;
    const group =
      kind === "render" ? this.names.renderGroup : this.names.verifyGroup;
    try {
      const n = await this.fake.xgroup(
        "DELCONSUMER",
        stream,
        group,
        consumerName,
      );
      return typeof n === "number" ? n > 0 : true;
    } catch {
      return false;
    }
  }

  async qaProbePending(
    kind: "render" | "verify",
    streamId: string,
  ): Promise<HeadlessPendingProbeResult> {
    const stream =
      kind === "render" ? this.names.renderStream : this.names.verifyStream;
    const group =
      kind === "render" ? this.names.renderGroup : this.names.verifyGroup;
    return this.qaProbePendingInGroup(stream, group, streamId);
  }

  /** @deprecated Fail-closed boolean — use `qaProbePending`. */
  async qaIsPending(
    kind: "render" | "verify",
    streamId: string,
  ): Promise<boolean> {
    return pendingProbeToDeprecatedBoolean(
      await this.qaProbePending(kind, streamId),
    );
  }

  async qaXaddRaw(
    streamKey: string,
    fields: Readonly<Record<string, string>>,
  ): Promise<string | null> {
    try {
      return await this.fake.xaddFields(streamKey, { ...fields });
    } catch {
      return null;
    }
  }

  async qaSetNxPx(
    key: string,
    value: string,
    pxMs: number,
  ): Promise<boolean> {
    try {
      const r = await this.fake.set(key, value, "NX", "PX", pxMs);
      return r === "OK";
    } catch {
      return false;
    }
  }

  async qaDelKey(key: string): Promise<boolean> {
    try {
      return (await this.fake.del(key)) > 0;
    } catch {
      return false;
    }
  }

  async qaDelExactKey(key: string): Promise<HeadlessKeyDeleteResult> {
    if (key.length === 0) {
      return { ok: false, reasonId: "key_delete_failed" };
    }
    try {
      const raw = await this.fake.del(key);
      return interpretDelResponse(raw);
    } catch {
      return { ok: false, reasonId: "key_delete_failed" };
    }
  }

  async qaProbeKeyExists(key: string): Promise<HeadlessKeyProbeResult> {
    if (key.length === 0) {
      return { ok: false, reasonId: "key_probe_failed" };
    }
    try {
      const raw = await this.fake.exists(key);
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
    try {
      const r = await this.fake.eval(
        QA_LOCK_COMPARE_AND_RENEW_LUA,
        1,
        key,
        token,
        ttlMs,
      );
      return r === 1;
    } catch {
      return false;
    }
  }

  async qaCompareAndDeleteLock(
    key: string,
    token: string,
  ): Promise<"deleted" | "not_owner" | "error"> {
    try {
      const r = await this.fake.eval(
        QA_LOCK_COMPARE_AND_DELETE_LUA,
        1,
        key,
        token,
      );
      return r === 1 ? "deleted" : "not_owner";
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
    try {
      await this.fake.xgroup(
        "CREATE",
        input.streamKey,
        input.group,
        input.id,
        input.mkstream === false ? undefined : "MKSTREAM",
      );
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
    // Never destroy production worker groups on shared production streams.
    // Run-scoped QA streams (`hfq:qa-run:v1:…`) may destroy protocol groups.
    if (
      (group === "hfq:render-workers" || group === "hfq:verify-workers") &&
      !isExactQaRunScopedStreamKey(streamKey)
    ) {
      return false;
    }
    try {
      const n = await this.fake.xgroup("DESTROY", streamKey, group);
      return typeof n === "number" ? n > 0 : true;
    } catch {
      return false;
    }
  }

  async qaXinfoGroups(streamKey: string): Promise<HeadlessGroupListProbeResult> {
    if (streamKey.length === 0) {
      return { ok: false, reasonId: "group_probe_failed" };
    }
    try {
      const raw = await this.fake.xinfoGroups(streamKey);
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
    try {
      const rest =
        input.count != null ? (["COUNT", input.count] as const) : [];
      const raw = await this.fake.xrange(
        input.streamKey,
        input.start,
        input.end,
        ...rest,
      );
      return Object.freeze(
        raw.map(([streamId, flat]) => ({
          streamId,
          fields: Object.freeze(flatPairsToRecord(flat)),
        })),
      );
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
    if (input.signal?.aborted) return { ok: false };
    try {
      const raw = await this.fake.xreadgroup(
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
      if (raw == null) {
        return { ok: true, items: Object.freeze([]) };
      }
      const first = raw[0];
      if (!Array.isArray(first) || first.length < 2) {
        return { ok: true, items: Object.freeze([]) };
      }
      const entries = first[1] as Array<[string, string[]]>;
      return {
        ok: true,
        items: Object.freeze(
          entries.map(([streamId, flat]) => ({
            streamId,
            fields: Object.freeze(flatPairsToRecord(flat)),
          })),
        ),
      };
    } catch {
      return { ok: false };
    }
  }

  async qaXackInGroup(
    streamKey: string,
    group: string,
    streamId: string,
  ): Promise<boolean> {
    try {
      const n = await this.fake.xack(streamKey, group, streamId);
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
    try {
      const raw = await this.fake.xpending(
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
    try {
      const raw = await this.fake.xrange(streamKey, streamId, streamId, "COUNT", 1);
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
    try {
      const n = await this.fake.xgroup(
        "DELCONSUMER",
        streamKey,
        group,
        consumerName,
      );
      return typeof n === "number" ? n > 0 : true;
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
    try {
      const raw = await this.redis.call(
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
        items.push({
          streamId,
          fields: Object.freeze(flatPairsToRecord(flat.map(String))),
        });
      }
      return { ok: true, items: Object.freeze(items) };
    } catch {
      return { ok: false };
    }
  }

  streamNames(): ReturnType<typeof deriveHeadlessQueueStreamNames> {
    return this.names;
  }

  async moveToDlq(input: {
    readonly kind: "render" | "verify";
    readonly entry: HeadlessStreamQueueEntry;
    readonly class: HeadlessQueueDlqClass;
    readonly reasonId: string;
  }) {
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
      const fields: Record<string, string> = {
        deliveryId: validated.entry.deliveryId,
        ownerId: validated.entry.ownerId,
        attempt: String(validated.entry.attempt),
        class: validated.entry.class,
        enqueuedAtMs: String(validated.entry.enqueuedAtMs),
        reasonId: validated.entry.reasonId,
      };
      if (validated.entry.jobId != null) fields.jobId = validated.entry.jobId;
      if (validated.entry.ownedObjectId != null) {
        fields.ownedObjectId = validated.entry.ownedObjectId;
      }
      await this.fake.xaddFields(dlq, fields);
      return cpOk(true as const);
    } catch {
      return cpFail("INTERNAL_ERROR", "DLQ move failed.");
    }
  }
}

function flatPairsToRecord(flat: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (let i = 0; i < flat.length; i += 2) {
    fields[String(flat[i])] = String(flat[i + 1]);
  }
  return fields;
}

function entryToFields(entry: HeadlessStreamQueueEntry): Record<string, string> {
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
    const fields: Record<string, string> = {};
    for (let i = 0; i < flat.length; i += 2) {
      fields[String(flat[i])] = String(flat[i + 1]);
    }
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
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
