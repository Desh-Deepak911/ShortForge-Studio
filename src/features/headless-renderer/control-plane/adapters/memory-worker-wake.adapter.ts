/**
 * Test-only worker wake/stop. Concurrent wake is idempotent.
 */

import type { HeadlessWorkerWakePort } from "../ports/worker-wake.port";
import { cpOk } from "../types/control-plane.types";

export class MemoryHeadlessWorkerWakeAdapter implements HeadlessWorkerWakePort {
  private running = false;
  private failNextWake = false;
  wakeCalls = 0;
  stopCalls = 0;

  testingFailNextWake(): void {
    this.failNextWake = true;
  }

  testingIsRunning(): boolean {
    return this.running;
  }

  async wake(_input?: { readonly nowMs: number }) {
    this.wakeCalls += 1;
    if (this.failNextWake) {
      this.failNextWake = false;
      return cpOk({ kind: "failed" as const });
    }
    if (this.running) {
      return cpOk({ kind: "already_running" as const });
    }
    this.running = true;
    return cpOk({ kind: "started" as const });
  }

  async stop(_input?: { readonly nowMs: number }) {
    this.stopCalls += 1;
    if (!this.running) {
      return cpOk({ kind: "already_stopped" as const });
    }
    this.running = false;
    return cpOk({ kind: "stopped" as const });
  }
}
