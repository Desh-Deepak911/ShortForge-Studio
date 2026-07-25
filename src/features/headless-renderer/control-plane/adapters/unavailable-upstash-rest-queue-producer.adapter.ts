/**
 * Production stand-in when Upstash REST producer is not configured.
 */

import { cpFail } from "../types/control-plane.types";

export class UnavailableUpstashRestQueueProducerAdapter {
  async enqueueRender() {
    return cpFail(
      "CONFIGURATION_UNAVAILABLE",
      "Upstash REST producer is not configured.",
    );
  }

  async enqueueVerify() {
    return cpFail(
      "CONFIGURATION_UNAVAILABLE",
      "Upstash REST producer is not configured.",
    );
  }
}
