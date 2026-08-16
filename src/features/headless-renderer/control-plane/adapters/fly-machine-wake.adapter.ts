/**
 * Fly Machines start/stop for on-demand Neon-queue workers.
 * Server-only. Never logs tokens, Authorization headers, or raw bodies.
 */

import type { HeadlessWorkerWakePort } from "../ports/worker-wake.port";
import type { HeadlessConfiguredFlyWakeConfig } from "../runtime/fly-wake-environment";
import { cpFail, cpOk } from "../types/control-plane.types";

export type FlyMachineWakeFetch = (
  url: string,
  init: {
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
  },
) => Promise<{ readonly status: number }>;

function machineActionUrl(
  config: HeadlessConfiguredFlyWakeConfig,
  action: "start" | "stop",
): string {
  return `${config.apiBaseUrl}/apps/${encodeURIComponent(config.appName)}/machines/${encodeURIComponent(config.machineId)}/${action}`;
}

export class FlyMachineWakeAdapter implements HeadlessWorkerWakePort {
  private readonly config: HeadlessConfiguredFlyWakeConfig;
  private readonly fetchImpl: FlyMachineWakeFetch;

  constructor(input: {
    readonly config: HeadlessConfiguredFlyWakeConfig;
    readonly fetchImpl?: FlyMachineWakeFetch;
  }) {
    this.config = input.config;
    this.fetchImpl = input.fetchImpl ?? defaultFlyWakeFetch;
  }

  async wake(_input: { readonly nowMs: number }) {
    return this.callStart();
  }

  async stop(_input: { readonly nowMs: number }) {
    return this.callStop();
  }

  private async callStart() {
    try {
      const response = await this.postAction("start");
      if (response.status === 200 || response.status === 204) {
        return cpOk({ kind: "started" as const });
      }
      if (response.status === 400 || response.status === 409) {
        return cpOk({ kind: "already_running" as const });
      }
      return cpOk({ kind: "failed" as const });
    } catch {
      return cpFail("INTERNAL_ERROR", "Worker wake transport failed.");
    }
  }

  private async callStop() {
    try {
      const response = await this.postAction("stop");
      if (response.status === 200 || response.status === 204) {
        return cpOk({ kind: "stopped" as const });
      }
      if (response.status === 400 || response.status === 409) {
        return cpOk({ kind: "already_stopped" as const });
      }
      return cpOk({ kind: "failed" as const });
    } catch {
      return cpFail("INTERNAL_ERROR", "Worker wake transport failed.");
    }
  }

  private postAction(action: "start" | "stop") {
    return this.fetchImpl(machineActionUrl(this.config, action), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        "Content-Type": "application/json",
      },
    });
  }
}

async function defaultFlyWakeFetch(
  url: string,
  init: {
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
  },
): Promise<{ readonly status: number }> {
  const response = await fetch(url, {
    method: init.method,
    headers: { ...init.headers },
  });
  return { status: response.status };
}
