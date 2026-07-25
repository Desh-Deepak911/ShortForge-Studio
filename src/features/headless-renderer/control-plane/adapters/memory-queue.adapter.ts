/**
 * In-memory queue for fake worker delivery — verification only.
 */

import { cpFail, cpOk } from "../types/control-plane.types";
import type { HeadlessQueueMessage, HeadlessQueuePort } from "../ports/queue.port";

export class MemoryHeadlessQueueAdapter implements HeadlessQueuePort {
  private readonly pending: HeadlessQueueMessage[] = [];
  private readonly delivered = new Set<string>();
  private failNextEnqueue = false;
  private beforeFailEnqueue:
    | ((message: HeadlessQueueMessage) => void | Promise<void>)
    | null = null;
  private afterEnqueue:
    | ((message: HeadlessQueueMessage) => void | Promise<void>)
    | null = null;

  /**
   * Test-only: next enqueue() returns QUEUE_ENQUEUE_FAILED.
   * Optional hook runs after the failure decision (message not pending) so tests
   * can claim the already-persisted queued job before fail-transition CAS.
   */
  testingFailNextEnqueue(
    beforeFail?: (message: HeadlessQueueMessage) => void | Promise<void>,
  ) {
    this.failNextEnqueue = true;
    this.beforeFailEnqueue = beforeFail ?? null;
  }

  /** Test-only: run after a successful enqueue (immediate-delivery race). */
  testingAfterEnqueue(
    hook: (message: HeadlessQueueMessage) => void | Promise<void>,
  ) {
    this.afterEnqueue = hook;
  }

  async enqueue(message: HeadlessQueueMessage) {
    if (this.failNextEnqueue) {
      this.failNextEnqueue = false;
      const before = this.beforeFailEnqueue;
      this.beforeFailEnqueue = null;
      if (before) await before(message);
      return cpFail("QUEUE_ENQUEUE_FAILED", "Injected enqueue failure.");
    }
    this.pending.push(message);
    const after = this.afterEnqueue;
    this.afterEnqueue = null;
    if (after) await after(message);
    return cpOk(true as const);
  }

  async drain(limit: number) {
    return this.pending.splice(0, Math.max(0, limit));
  }

  async markDelivered(deliveryId: string) {
    if (this.delivered.has(deliveryId)) return false;
    this.delivered.add(deliveryId);
    return true;
  }

  async wasDelivered(deliveryId: string) {
    return this.delivered.has(deliveryId);
  }
}
