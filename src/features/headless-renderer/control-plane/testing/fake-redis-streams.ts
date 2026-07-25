/**
 * In-memory Redis Streams / consumer-group fake for dual-lease unit tests.
 * Not exported from the production barrel.
 */

import {
  QA_LOCK_COMPARE_AND_DELETE_LUA,
  QA_LOCK_COMPARE_AND_RENEW_LUA,
} from "../adapters/qa-lock-lua";
import { validateHeadlessStreamQueueEntry } from "../ports/queue.port";
import type { HeadlessStreamQueueEntry } from "../ports/queue.port";

export type FakeRedisStreamEntry = {
  readonly streamId: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly addedAtMs: number;
};

export type FakeRedisPendingEntry = {
  readonly streamId: string;
  readonly consumer: string;
  readonly deliveredAtMs: number;
  readonly deliveryCount: number;
};

type StreamGroupState = {
  lastDeliveredId: string;
  pending: Map<string, FakeRedisPendingEntry>;
  consumers: Set<string>;
};

type StreamState = {
  entries: FakeRedisStreamEntry[];
  groups: Map<string, StreamGroupState>;
  nextIdCounter: number;
};

type StringKeyState = {
  value: string;
  expiresAtMs: number | null;
};

export type FakeRedisStreamsOptions = {
  readonly nowMs?: () => number;
  /** Fail next N write commands (xadd/xack/xtrim/xgroup). */
  readonly failNextWrites?: number;
};

/**
 * Minimal Redis Streams surface used by REST producer + TCP consumer adapters.
 */
export class FakeRedisStreams {
  private readonly streams = new Map<string, StreamState>();
  private readonly stringKeys = new Map<string, StringKeyState>();
  private readonly nowMs: () => number;
  private failNextWrites: number;
  private connectionOpen = true;
  /** Simulated wall-clock for idle tests (overrides nowMs when set). */
  private frozenNowMs: number | null = null;

  constructor(options: FakeRedisStreamsOptions = {}) {
    this.nowMs = options.nowMs ?? (() => Date.now());
    this.failNextWrites = options.failNextWrites ?? 0;
  }

  testingSetFailNextWrites(n: number): void {
    this.failNextWrites = Math.max(0, n);
  }

  testingAdvanceMs(delta: number): void {
    const base = this.frozenNowMs ?? this.nowMs();
    this.frozenNowMs = base + delta;
  }

  testingSetNowMs(ms: number): void {
    this.frozenNowMs = ms;
  }

  testingClose(): void {
    this.connectionOpen = false;
  }

  testingOpen(): void {
    this.connectionOpen = true;
  }

  private clock(): number {
    return this.frozenNowMs ?? this.nowMs();
  }

  private ensureWrite(): void {
    if (!this.connectionOpen) {
      throw new Error("FAKE_REDIS_CLOSED");
    }
    if (this.failNextWrites > 0) {
      this.failNextWrites -= 1;
      throw new Error("FAKE_REDIS_WRITE_FAILED");
    }
  }

  private ensureRead(): void {
    if (!this.connectionOpen) {
      throw new Error("FAKE_REDIS_CLOSED");
    }
  }

  private getOrCreateStream(key: string): StreamState {
    let s = this.streams.get(key);
    if (!s) {
      s = { entries: [], groups: new Map(), nextIdCounter: 1 };
      this.streams.set(key, s);
    }
    return s;
  }

  private mintId(stream: StreamState): string {
    const ms = this.clock();
    const seq = stream.nextIdCounter++;
    return `${ms}-${seq}`;
  }

  /** Upstash/ioredis-compatible XADD key * field value ... */
  async xadd(
    key: string,
    id: string,
    ...fieldValues: string[]
  ): Promise<string> {
    this.ensureWrite();
    if (id !== "*") {
      throw new Error("FAKE_REDIS_ONLY_AUTO_ID");
    }
    if (fieldValues.length === 0 || fieldValues.length % 2 !== 0) {
      throw new Error("FAKE_REDIS_XADD_FIELDS");
    }
    const fields: Record<string, string> = {};
    for (let i = 0; i < fieldValues.length; i += 2) {
      fields[fieldValues[i]!] = fieldValues[i + 1]!;
    }
    const stream = this.getOrCreateStream(key);
    const streamId = this.mintId(stream);
    stream.entries.push({
      streamId,
      fields: Object.freeze({ ...fields }),
      addedAtMs: this.clock(),
    });
    return streamId;
  }

  /** Object-field XADD (Upstash JS style). */
  async xaddFields(
    key: string,
    fields: Record<string, string>,
  ): Promise<string> {
    const pairs: string[] = [];
    for (const [k, v] of Object.entries(fields)) {
      pairs.push(k, v);
    }
    return this.xadd(key, "*", ...pairs);
  }

  async xtrim(
    key: string,
    strategy: "MAXLEN",
    exactness: "=" | "~",
    threshold: number,
  ): Promise<number> {
    this.ensureWrite();
    void exactness;
    if (strategy !== "MAXLEN") throw new Error("FAKE_REDIS_XTRIM");
    const stream = this.streams.get(key);
    if (!stream) return 0;
    if (stream.entries.length <= threshold) return 0;
    const remove = stream.entries.length - threshold;
    const removedIds = new Set(
      stream.entries.slice(0, remove).map((e) => e.streamId),
    );
    stream.entries = stream.entries.slice(remove);
    for (const group of stream.groups.values()) {
      for (const id of removedIds) {
        group.pending.delete(id);
      }
    }
    return remove;
  }

  /**
   * SET key value [NX] [PX ms] — returns "OK" or null when NX loses.
   */
  async set(
    key: string,
    value: string,
    ...opts: Array<string | number>
  ): Promise<"OK" | null> {
    this.ensureWrite();
    let nx = false;
    let pxMs: number | null = null;
    for (let i = 0; i < opts.length; i++) {
      const tok = String(opts[i]).toUpperCase();
      if (tok === "NX") {
        nx = true;
        continue;
      }
      if (tok === "PX") {
        pxMs = Number(opts[i + 1]);
        i += 1;
      }
    }
    this.expireStringKeys();
    const existing = this.stringKeys.get(key);
    if (nx && existing != null) return null;
    this.stringKeys.set(key, {
      value,
      expiresAtMs:
        pxMs != null && Number.isSafeInteger(pxMs) && pxMs > 0
          ? this.clock() + pxMs
          : null,
    });
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    this.ensureWrite();
    this.expireStringKeys();
    let n = 0;
    for (const key of keys) {
      let removed = false;
      if (this.stringKeys.delete(key)) removed = true;
      if (this.streams.delete(key)) removed = true;
      if (removed) n += 1;
    }
    return n;
  }

  /** EXISTS — count of keys that currently exist (string or stream). */
  async exists(...keys: string[]): Promise<number> {
    this.ensureRead();
    this.expireStringKeys();
    let n = 0;
    for (const key of keys) {
      if (this.stringKeys.has(key) || this.streams.has(key)) n += 1;
    }
    return n;
  }

  async get(key: string): Promise<string | null> {
    this.ensureRead();
    this.expireStringKeys();
    return this.stringKeys.get(key)?.value ?? null;
  }

  async pexpire(key: string, ttlMs: number): Promise<number> {
    this.ensureWrite();
    this.expireStringKeys();
    const state = this.stringKeys.get(key);
    if (state == null) return 0;
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) return 0;
    state.expiresAtMs = this.clock() + ttlMs;
    return 1;
  }

  /**
   * EVAL with fixed QA lock scripts only (numkeys=1).
   * Same atomic semantics as Upstash/Redis Lua for compare-and-delete/renew.
   */
  async eval(
    script: string,
    numKeys: number,
    ...keyAndArgv: Array<string | number>
  ): Promise<number> {
    this.ensureWrite();
    if (numKeys !== 1 || keyAndArgv.length < 1) {
      throw new Error("FAKE_REDIS_EVAL_KEYS");
    }
    const key = String(keyAndArgv[0]);
    const argv = keyAndArgv.slice(1).map(String);
    this.expireStringKeys();

    if (script === QA_LOCK_COMPARE_AND_DELETE_LUA) {
      const token = argv[0] ?? "";
      const state = this.stringKeys.get(key);
      if (state == null || state.value !== token) return 0;
      this.stringKeys.delete(key);
      return 1;
    }
    if (script === QA_LOCK_COMPARE_AND_RENEW_LUA) {
      const token = argv[0] ?? "";
      const ttlMs = Number(argv[1]);
      const state = this.stringKeys.get(key);
      if (state == null || state.value !== token) return 0;
      if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) return 0;
      state.expiresAtMs = this.clock() + ttlMs;
      return 1;
    }
    throw new Error("FAKE_REDIS_EVAL_UNSUPPORTED_SCRIPT");
  }

  testingGetString(key: string): string | null {
    this.expireStringKeys();
    return this.stringKeys.get(key)?.value ?? null;
  }

  testingStringTtlMs(key: string): number | null {
    this.expireStringKeys();
    const state = this.stringKeys.get(key);
    if (state == null) return null;
    if (state.expiresAtMs == null) return -1;
    return Math.max(0, state.expiresAtMs - this.clock());
  }

  private expireStringKeys(): void {
    const now = this.clock();
    for (const [key, state] of [...this.stringKeys.entries()]) {
      if (state.expiresAtMs != null && state.expiresAtMs <= now) {
        this.stringKeys.delete(key);
      }
    }
  }

  async xgroup(
    subcommand: "CREATE" | "DELCONSUMER" | "DESTROY",
    key: string,
    group: string,
    idOrConsumer?: string,
    mkstream?: "MKSTREAM",
  ): Promise<"OK" | number> {
    this.ensureWrite();
    if (subcommand === "DESTROY") {
      const stream = this.streams.get(key);
      if (!stream) return 0;
      return stream.groups.delete(group) ? 1 : 0;
    }
    if (subcommand === "DELCONSUMER") {
      const stream = this.streams.get(key);
      if (!stream) return 0;
      const g = stream.groups.get(group);
      if (!g) return 0;
      const consumer = idOrConsumer ?? "";
      if (!g.consumers.has(consumer)) return 0;
      g.consumers.delete(consumer);
      for (const [pid, pend] of [...g.pending.entries()]) {
        if (pend.consumer === consumer) g.pending.delete(pid);
      }
      return 1;
    }
    if (subcommand !== "CREATE") throw new Error("FAKE_REDIS_XGROUP");
    if (idOrConsumer == null) throw new Error("FAKE_REDIS_XGROUP_ID");
    if (mkstream === "MKSTREAM") {
      this.getOrCreateStream(key);
    }
    const stream = this.streams.get(key);
    if (!stream) {
      throw new Error("FAKE_REDIS_NOSTREAM");
    }
    if (stream.groups.has(group)) {
      const err = new Error("BUSYGROUP Consumer Group name already exists");
      (err as Error & { message: string }).message =
        "BUSYGROUP Consumer Group name already exists";
      throw err;
    }
    // `$` = only messages arriving after group creation (tip of stream).
    let lastDeliveredId: string;
    if (idOrConsumer === "$") {
      const tip = stream.entries[stream.entries.length - 1];
      lastDeliveredId = tip?.streamId ?? "0-0";
    } else if (idOrConsumer === "0") {
      lastDeliveredId = "0-0";
    } else {
      lastDeliveredId = idOrConsumer;
    }
    stream.groups.set(group, {
      lastDeliveredId,
      pending: new Map(),
      consumers: new Set(),
    });
    return "OK";
  }

  /**
   * XRANGE key start end [COUNT n]
   * start/end: stream ids, `-`, or `+`. Exclusive `(` prefix supported for start.
   */
  async xrange(
    key: string,
    start: string,
    end: string,
    ...rest: Array<string | number>
  ): Promise<Array<[string, string[]]>> {
    this.ensureRead();
    let count: number | null = null;
    for (let i = 0; i < rest.length; i++) {
      if (String(rest[i]).toUpperCase() === "COUNT") {
        count = Number(rest[i + 1]);
      }
    }
    const stream = this.streams.get(key);
    if (!stream) return [];
    const exclusiveStart = start.startsWith("(");
    const startId = exclusiveStart ? start.slice(1) : start;
    const out: Array<[string, string[]]> = [];
    for (const entry of stream.entries) {
      if (count != null && out.length >= count) break;
      if (start !== "-") {
        const cmp = compareStreamId(entry.streamId, startId);
        if (exclusiveStart ? cmp <= 0 : cmp < 0) continue;
      }
      if (end !== "+" && compareStreamId(entry.streamId, end) > 0) continue;
      const flat: string[] = [];
      for (const [fk, fv] of Object.entries(entry.fields)) {
        flat.push(fk, fv);
      }
      out.push([entry.streamId, flat]);
    }
    return out;
  }

  /**
   * XINFO GROUPS key — simplified Redis-shaped flat field pairs per group.
   */
  async xinfoGroups(key: string): Promise<
    Array<Array<string | number>>
  > {
    this.ensureRead();
    const stream = this.streams.get(key);
    if (!stream) return [];
    const out: Array<Array<string | number>> = [];
    for (const [name, g] of stream.groups) {
      out.push([
        "name",
        name,
        "consumers",
        g.consumers.size,
        "pending",
        g.pending.size,
        "last-delivered-id",
        g.lastDeliveredId,
      ]);
    }
    return out;
  }

  testingLastDeliveredId(
    key: string,
    group: string,
  ): string | null {
    return this.streams.get(key)?.groups.get(group)?.lastDeliveredId ?? null;
  }

  testingPendingOwner(
    key: string,
    group: string,
    streamId: string,
  ): string | null {
    return (
      this.streams.get(key)?.groups.get(group)?.pending.get(streamId)
        ?.consumer ?? null
    );
  }

  testingHasGroup(key: string, group: string): boolean {
    return this.streams.get(key)?.groups.has(group) ?? false;
  }

  /** XDEL key id [id ...] — removes tracked entries only. */
  async xdel(key: string, ...ids: string[]): Promise<number> {
    this.ensureWrite();
    const stream = this.streams.get(key);
    if (!stream || ids.length === 0) return 0;
    const remove = new Set(ids);
    const before = stream.entries.length;
    stream.entries = stream.entries.filter((e) => !remove.has(e.streamId));
    for (const group of stream.groups.values()) {
      for (const id of remove) {
        group.pending.delete(id);
      }
    }
    return before - stream.entries.length;
  }

  /**
   * Test hook: set pending idle as if delivered `idleMs` ago.
   * Used for XAUTOCLAIM / autoclaim.idle without mutating production lease defaults.
   */
  testingSetPendingIdleMs(
    key: string,
    group: string,
    streamId: string,
    idleMs: number,
  ): void {
    const g = this.streams.get(key)?.groups.get(group);
    const pend = g?.pending.get(streamId);
    if (pend == null || g == null) {
      throw new Error("FAKE_REDIS_PENDING_MISSING");
    }
    const now = this.clock();
    g.pending.set(streamId, {
      ...pend,
      deliveredAtMs: now - Math.max(0, idleMs),
    });
  }

  testingIsPending(key: string, group: string, streamId: string): boolean {
    return this.streams.get(key)?.groups.get(group)?.pending.has(streamId) ?? false;
  }

  testingHasConsumer(key: string, group: string, consumer: string): boolean {
    return (
      this.streams.get(key)?.groups.get(group)?.consumers.has(consumer) ?? false
    );
  }

  testingHasEntry(key: string, streamId: string): boolean {
    return (
      this.streams.get(key)?.entries.some((e) => e.streamId === streamId) ?? false
    );
  }

  testingConsumers(key: string, group: string): readonly string[] {
    const g = this.streams.get(key)?.groups.get(group);
    return g != null ? Object.freeze([...g.consumers]) : Object.freeze([]);
  }

  async xreadgroup(
    _groupKeyword: "GROUP",
    group: string,
    consumer: string,
    ...rest: Array<string | number>
  ): Promise<Array<[string, Array<[string, string[]]>]> | null> {
    this.ensureRead();
    // Parse: [COUNT n] [BLOCK ms] STREAMS key id
    let count = 10;
    let blockMs = 0;
    let i = 0;
    while (i < rest.length) {
      const tok = String(rest[i]);
      if (tok === "COUNT") {
        count = Number(rest[i + 1]);
        i += 2;
        continue;
      }
      if (tok === "BLOCK") {
        blockMs = Number(rest[i + 1]);
        i += 2;
        continue;
      }
      if (tok === "STREAMS") {
        i += 1;
        break;
      }
      i += 1;
    }
    void blockMs;
    const key = String(rest[i]);
    const stream = this.streams.get(key);
    if (!stream) return null;
    const g = stream.groups.get(group);
    if (!g) throw new Error("FAKE_REDIS_NOGROUP");
    g.consumers.add(consumer);

    const out: Array<[string, string[]]> = [];
    for (const entry of stream.entries) {
      if (out.length >= count) break;
      if (g.pending.has(entry.streamId)) continue;
      // Only deliver entries after lastDeliveredId (simple lexicographic/time order).
      if (compareStreamId(entry.streamId, g.lastDeliveredId) <= 0) continue;
      const flat: string[] = [];
      for (const [fk, fv] of Object.entries(entry.fields)) {
        flat.push(fk, fv);
      }
      out.push([entry.streamId, flat]);
      g.pending.set(entry.streamId, {
        streamId: entry.streamId,
        consumer,
        deliveredAtMs: this.clock(),
        deliveryCount: 1,
      });
      g.lastDeliveredId = entry.streamId;
    }
    if (out.length === 0) return null;
    return [[key, out]];
  }

  async xack(key: string, group: string, ...ids: string[]): Promise<number> {
    this.ensureWrite();
    const stream = this.streams.get(key);
    if (!stream) return 0;
    const g = stream.groups.get(group);
    if (!g) return 0;
    let n = 0;
    for (const id of ids) {
      if (g.pending.delete(id)) n += 1;
    }
    return n;
  }

  async xpending(
    key: string,
    group: string,
    start?: string,
    end?: string,
    count?: number,
  ): Promise<
    | [number, string | null, string | null, Array<[string, number]> | null]
    | Array<[string, string, number, number]>
  > {
    this.ensureRead();
    const stream = this.streams.get(key);
    if (!stream) {
      return start != null ? [] : [0, null, null, null];
    }
    const g = stream.groups.get(group);
    if (!g) {
      return start != null ? [] : [0, null, null, null];
    }
    const pending = [...g.pending.values()];
    if (start != null && end != null) {
      const limit =
        typeof count === "number" && Number.isSafeInteger(count) ? count : 10;
      const now = this.clock();
      const out: Array<[string, string, number, number]> = [];
      // Inclusive stream-ID range (exact probe: start === end === streamId).
      // Supports Redis `-` / `+` bounds for scan fixtures only.
      const sorted = pending.slice().sort((a, b) =>
        compareStreamId(a.streamId, b.streamId),
      );
      for (const p of sorted) {
        if (start !== "-" && compareStreamId(p.streamId, start) < 0) continue;
        if (end !== "+" && compareStreamId(p.streamId, end) > 0) continue;
        out.push([
          p.streamId,
          p.consumer,
          Math.max(0, now - p.deliveredAtMs),
          p.deliveryCount,
        ]);
        if (out.length >= limit) break;
      }
      return out;
    }
    if (pending.length === 0) return [0, null, null, null];
    const byConsumer = new Map<string, number>();
    for (const p of pending) {
      byConsumer.set(p.consumer, (byConsumer.get(p.consumer) ?? 0) + 1);
    }
    return [
      pending.length,
      pending[0]!.streamId,
      pending[pending.length - 1]!.streamId,
      [...byConsumer.entries()],
    ];
  }

  async xautoclaim(
    key: string,
    group: string,
    consumer: string,
    minIdleMs: number,
    start: string,
    ...rest: Array<string | number>
  ): Promise<[string, Array<[string, string[]]>]> {
    this.ensureWrite();
    let count = 10;
    for (let i = 0; i < rest.length; i++) {
      if (String(rest[i]) === "COUNT") {
        count = Number(rest[i + 1]);
      }
    }
    void start;
    const stream = this.streams.get(key);
    if (!stream) return ["0-0", []];
    const g = stream.groups.get(group);
    if (!g) throw new Error("FAKE_REDIS_NOGROUP");
    g.consumers.add(consumer);
    const now = this.clock();
    const claimed: Array<[string, string[]]> = [];
    for (const [id, pend] of g.pending) {
      if (claimed.length >= count) break;
      const idle = now - pend.deliveredAtMs;
      if (idle < minIdleMs) continue;
      const entry = stream.entries.find((e) => e.streamId === id);
      if (!entry) {
        g.pending.delete(id);
        continue;
      }
      g.pending.set(id, {
        streamId: id,
        consumer,
        deliveredAtMs: now,
        deliveryCount: pend.deliveryCount + 1,
      });
      const flat: string[] = [];
      for (const [fk, fv] of Object.entries(entry.fields)) {
        flat.push(fk, fv);
      }
      claimed.push([id, flat]);
    }
    const next = claimed.length > 0 ? claimed[claimed.length - 1]![0] : "0-0";
    return [next, claimed];
  }

  /** Test helper: parse fields into validated stream entry. */
  static parseEntryFields(
    fields: Readonly<Record<string, string>> | string[],
  ): HeadlessStreamQueueEntry | null {
    const obj: Record<string, unknown> = {};
    if (Array.isArray(fields)) {
      for (let i = 0; i < fields.length; i += 2) {
        obj[fields[i]!] = coerceField(fields[i + 1]!);
      }
    } else {
      for (const [k, v] of Object.entries(fields)) {
        obj[k] = coerceField(v);
      }
    }
    const validated = validateHeadlessStreamQueueEntry(obj);
    return validated.ok ? validated.entry : null;
  }

  testingPendingCount(key: string, group: string): number {
    return this.streams.get(key)?.groups.get(group)?.pending.size ?? 0;
  }

  testingLength(key: string): number {
    return this.streams.get(key)?.entries.length ?? 0;
  }
}

function coerceField(raw: string): unknown {
  if (raw === "render" || raw === "verify") return raw;
  if (/^-?\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isSafeInteger(n)) return n;
  }
  return raw;
}

function compareStreamId(a: string, b: string): number {
  if (b === "0-0" || b === "0") return 1;
  const [am, as] = a.split("-").map(Number);
  const [bm, bs] = b.split("-").map(Number);
  if (am !== bm) return (am ?? 0) - (bm ?? 0);
  return (as ?? 0) - (bs ?? 0);
}

/** Upstash REST-shaped client wrapping FakeRedisStreams. */
export type FakeUpstashRestClient = {
  xadd: (
    key: string,
    id: "*" | `${number}-*` | string,
    fields: Record<string, unknown>,
  ) => Promise<string>;
  xtrim: (
    key: string,
    opts: {
      strategy: "MAXLEN" | "MINID";
      exactness?: "~" | "=";
      threshold: number | string;
      limit?: number;
    },
  ) => Promise<string>;
};

export function createFakeUpstashRestClient(
  fake: FakeRedisStreams,
): FakeUpstashRestClient {
  return {
    async xadd(key, id, fields) {
      if (id !== "*") throw new Error("FAKE_REDIS_ONLY_AUTO_ID");
      const stringFields: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields)) {
        stringFields[k] = String(v);
      }
      return fake.xaddFields(key, stringFields);
    },
    async xtrim(key, opts) {
      if (opts.strategy !== "MAXLEN") {
        throw new Error("FAKE_REDIS_XTRIM_MAXLEN_ONLY");
      }
      const n = await fake.xtrim(
        key,
        "MAXLEN",
        opts.exactness === "=" ? "=" : "~",
        Number(opts.threshold),
      );
      return String(n);
    },
  };
}

/** ioredis-like call surface for TCP consumer injection. */
export type FakeIoredisLike = {
  call: (command: string, ...args: Array<string | number>) => Promise<unknown>;
  quit: () => Promise<"OK">;
  disconnect: () => void;
};

export function createFakeIoredisLike(fake: FakeRedisStreams): FakeIoredisLike {
  return {
    async call(command, ...args) {
      const cmd = command.toUpperCase();
      if (cmd === "EVAL") {
        const script = String(args[0]);
        const numKeys = Number(args[1]);
        return fake.eval(script, numKeys, ...args.slice(2));
      }
      if (cmd === "GET") {
        return fake.get(String(args[0]));
      }
      if (cmd === "PEXPIRE") {
        return fake.pexpire(String(args[0]), Number(args[1]));
      }
      if (cmd === "SET") {
        return fake.set(
          String(args[0]),
          String(args[1]),
          ...args.slice(2),
        );
      }
      if (cmd === "DEL") {
        return fake.del(...args.map(String));
      }
      if (cmd === "EXISTS") {
        return fake.exists(...args.map(String));
      }
      if (cmd === "XADD") {
        const key = String(args[0]);
        const id = String(args[1]);
        const rest = args.slice(2).map(String);
        return fake.xadd(key, id, ...rest);
      }
      if (cmd === "XTRIM") {
        // XTRIM key MAXLEN ~ threshold
        const key = String(args[0]);
        const exactness = String(args[2]) === "~" ? "~" : "=";
        const threshold = Number(args[3] ?? args[2]);
        return fake.xtrim(key, "MAXLEN", exactness, threshold);
      }
      if (cmd === "XGROUP") {
        const sub = String(args[0]).toUpperCase();
        if (sub === "DELCONSUMER") {
          return fake.xgroup(
            "DELCONSUMER",
            String(args[1]),
            String(args[2]),
            String(args[3]),
          );
        }
        if (sub === "DESTROY") {
          return fake.xgroup("DESTROY", String(args[1]), String(args[2]));
        }
        return fake.xgroup(
          "CREATE",
          String(args[1]),
          String(args[2]),
          String(args[3]),
          args[4] === "MKSTREAM" ? "MKSTREAM" : undefined,
        );
      }
      if (cmd === "XDEL") {
        return fake.xdel(String(args[0]), ...args.slice(1).map(String));
      }
      if (cmd === "XRANGE") {
        return fake.xrange(
          String(args[0]),
          String(args[1]),
          String(args[2]),
          ...args.slice(3),
        );
      }
      if (cmd === "XINFO") {
        const sub = String(args[0]).toUpperCase();
        if (sub === "GROUPS") {
          return fake.xinfoGroups(String(args[1]));
        }
        throw new Error(`FAKE_REDIS_UNSUPPORTED XINFO ${sub}`);
      }
      if (cmd === "XREADGROUP") {
        return fake.xreadgroup(
          "GROUP",
          String(args[1]),
          String(args[2]),
          ...args.slice(3),
        );
      }
      if (cmd === "XACK") {
        return fake.xack(
          String(args[0]),
          String(args[1]),
          ...args.slice(2).map(String),
        );
      }
      if (cmd === "XPENDING") {
        if (args.length >= 5) {
          return fake.xpending(
            String(args[0]),
            String(args[1]),
            String(args[2]),
            String(args[3]),
            Number(args[4]),
          );
        }
        return fake.xpending(String(args[0]), String(args[1]));
      }
      if (cmd === "XAUTOCLAIM") {
        return fake.xautoclaim(
          String(args[0]),
          String(args[1]),
          String(args[2]),
          Number(args[3]),
          String(args[4]),
          ...args.slice(5),
        );
      }
      throw new Error(`FAKE_REDIS_UNSUPPORTED ${cmd}`);
    },
    async quit() {
      return "OK";
    },
    disconnect() {
      fake.testingClose();
    },
  };
}
