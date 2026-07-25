/**
 * Provider-neutral dual-lease Streams queue port.
 * Production: Upstash REST producer (web) + TCP consumer (worker).
 * Tests: MemoryHeadlessStreamQueueAdapter / FakeRedisStreams.
 */

import type { HeadlessControlPlaneResult } from "../types/control-plane.types";
import type { HeadlessQueueDlqClass } from "../types/queue-dlq-entry";
import type {
  HeadlessDeliveryKind,
  HeadlessRenderQueueMessage,
  HeadlessStreamQueueEntry,
  HeadlessVerifyQueueMessage,
} from "./queue.port";

export type HeadlessStreamQueueReadItem = {
  readonly streamId: string;
  readonly entry: HeadlessStreamQueueEntry;
};

export interface HeadlessStreamQueuePort {
  enqueueRender(
    message: HeadlessRenderQueueMessage,
  ): Promise<HeadlessControlPlaneResult<{ streamId: string }>>;

  enqueueVerify(
    message: HeadlessVerifyQueueMessage,
  ): Promise<HeadlessControlPlaneResult<{ streamId: string }>>;

  /** XGROUP CREATE … MKSTREAM — idempotent (BUSYGROUP ignored). */
  ensureConsumerGroups(): Promise<HeadlessControlPlaneResult<true>>;

  readGroup(input: {
    readonly kind: HeadlessDeliveryKind;
    readonly consumerName: string;
    readonly count: number;
    readonly blockMs: number;
    readonly signal?: AbortSignal;
  }): Promise<HeadlessControlPlaneResult<readonly HeadlessStreamQueueReadItem[]>>;

  ack(input: {
    readonly kind: HeadlessDeliveryKind;
    readonly streamId: string;
    readonly deliveryId: string;
  }): Promise<HeadlessControlPlaneResult<true>>;

  autoClaimIdle(input: {
    readonly kind: HeadlessDeliveryKind;
    readonly consumerName: string;
    readonly minIdleMs: number;
    readonly count: number;
  }): Promise<HeadlessControlPlaneResult<readonly HeadlessStreamQueueReadItem[]>>;

  moveToDlq(input: {
    readonly kind: HeadlessDeliveryKind;
    readonly entry: HeadlessStreamQueueEntry;
    readonly class: HeadlessQueueDlqClass;
    readonly reasonId: string;
  }): Promise<HeadlessControlPlaneResult<true>>;
}
