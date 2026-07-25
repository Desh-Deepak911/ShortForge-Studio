/**
 * Upstash REST producer — XADD + XTRIM only.
 * Never XREADGROUP / BLOCK / claim. Inject Redis-like client for tests.
 * Not exported from the production barrel (Unavailable type may be).
 */

import { Redis } from "@upstash/redis";

import type { HeadlessEnvName } from "../runtime/upstash-environment";
import {
  readConfiguredHeadlessUpstashProducerConfig,
  type HeadlessConfiguredUpstashProducerConfig,
} from "../runtime/upstash-environment";
import { deriveHeadlessQueueStreamNames } from "../services/headless-queue-stream-names";
import {
  validateHeadlessStreamQueueEntry,
  type HeadlessRenderQueueMessage,
  type HeadlessVerifyQueueMessage,
} from "../ports/queue.port";
import type { HeadlessStreamQueuePort } from "../ports/stream-queue.port";
import { cpFail, cpOk } from "../types/control-plane.types";

const TRIM_MAXLEN = 10_000;

/**
 * Minimal REST client surface used by this adapter.
 * Structurally compatible with installed `@upstash/redis` Redis.xadd / Redis.xtrim.
 */
export type HeadlessUpstashRestClient = {
  xadd: (
    key: string,
    id: "*" | `${number}-*` | string,
    fields: Record<string, unknown>,
  ) => Promise<string | null>;
  xtrim: (
    key: string,
    opts: {
      strategy: "MAXLEN" | "MINID";
      exactness?: "~" | "=";
      threshold: number | string;
      limit?: number;
    },
  ) => Promise<unknown>;
};

export type UpstashRestQueueProducerOptions = {
  /**
   * Explicit config. When the `config` key is present (including `null`),
   * process.env is not consulted — deterministic tests must pass `config: null`
   * or `env: {}` to force unconfigured.
   */
  readonly config?: HeadlessConfiguredUpstashProducerConfig | null;
  /** Env bag for classification when `config` key is omitted. */
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly envName?: HeadlessEnvName;
  /** Injected client for tests — never constructed from secrets in unit tests. */
  readonly client?: HeadlessUpstashRestClient;
};

/**
 * Bind Redis instance methods with compile-time structural compatibility.
 * No `as unknown as` — wrapper calls real Redis.xadd / Redis.xtrim.
 */
export function bindHeadlessUpstashRestClientFromRedis(
  redis: Pick<Redis, "xadd" | "xtrim">,
): HeadlessUpstashRestClient {
  const client: HeadlessUpstashRestClient = {
    xadd: (key, id, fields) => redis.xadd(key, id, fields),
    xtrim: (key, opts) => redis.xtrim(key, opts),
  };
  return client;
}

/**
 * REST producer implements enqueue + trim only.
 * Other HeadlessStreamQueuePort methods return CONFIGURATION_UNAVAILABLE
 * (consumer path is TCP-only under worker/).
 */
export class UpstashRestQueueProducerAdapter
  implements Pick<
    HeadlessStreamQueuePort,
    "enqueueRender" | "enqueueVerify"
  >
{
  private readonly client: HeadlessUpstashRestClient | null;
  private readonly names: ReturnType<typeof deriveHeadlessQueueStreamNames> | null;
  private readonly configured: boolean;

  constructor(options: UpstashRestQueueProducerOptions = {}) {
    const config =
      "config" in options
        ? (options.config ?? null)
        : readConfiguredHeadlessUpstashProducerConfig(options.env);
    if (options.client != null) {
      const envName = options.envName ?? config?.envName ?? "local";
      this.client = options.client;
      this.names = deriveHeadlessQueueStreamNames(envName);
      this.configured = true;
      return;
    }
    if (config == null) {
      this.client = null;
      this.names = null;
      this.configured = false;
      return;
    }
    const redis = new Redis({
      url: config.restUrl,
      token: config.restToken,
    });
    this.client = bindHeadlessUpstashRestClientFromRedis(redis);
    this.names = deriveHeadlessQueueStreamNames(config.envName);
    this.configured = true;
  }

  async enqueueRender(message: HeadlessRenderQueueMessage) {
    return this.enqueue("render", message);
  }

  async enqueueVerify(message: HeadlessVerifyQueueMessage) {
    return this.enqueue("verify", message);
  }

  private async enqueue(
    kind: "render" | "verify",
    message: HeadlessRenderQueueMessage | HeadlessVerifyQueueMessage,
  ) {
    if (!this.configured || this.client == null || this.names == null) {
      return cpFail(
        "CONFIGURATION_UNAVAILABLE",
        "Upstash REST producer is not configured.",
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
    const fields =
      validated.entry.deliveryKind === "render"
        ? {
            deliveryId: validated.entry.deliveryId,
            jobId: validated.entry.jobId,
            ownerId: validated.entry.ownerId,
            attempt: String(validated.entry.attempt),
            enqueuedAtMs: String(validated.entry.enqueuedAtMs),
            deliveryKind: "render",
          }
        : {
            deliveryId: validated.entry.deliveryId,
            ownedObjectId: validated.entry.ownedObjectId,
            ownerId: validated.entry.ownerId,
            attempt: String(validated.entry.attempt),
            enqueuedAtMs: String(validated.entry.enqueuedAtMs),
            deliveryKind: "verify",
          };
    try {
      const streamId = await this.client.xadd(stream, "*", fields);
      if (streamId == null || typeof streamId !== "string") {
        return cpFail("QUEUE_ENQUEUE_FAILED", "Stream enqueue failed.");
      }
      try {
        await this.client.xtrim(stream, {
          strategy: "MAXLEN",
          exactness: "~",
          threshold: TRIM_MAXLEN,
        });
      } catch {
        // Trim is best-effort after successful enqueue.
      }
      return cpOk({ streamId });
    } catch {
      return cpFail("QUEUE_ENQUEUE_FAILED", "Stream enqueue failed.");
    }
  }
}
