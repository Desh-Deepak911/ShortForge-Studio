/**
 * Shared hosted render delivery-event ingestion for matrix and execution probe.
 * Uses parseHostedRenderDeliveryEventsFromFlyLogs — no divergent matrix parser.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  parseHostedRenderDeliveryEventsFromFlyLogs,
  type HostedRenderDeliveryEventObservation,
} from "./claim-correlation-authority";
import type { FlyRenderLiveSessionState } from "./types";

const execFileAsync = promisify(execFile);

export async function defaultReadFlyLogs(appName: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "fly",
      ["logs", "-a", appName, "--no-tail"],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    return stdout;
  } catch {
    return "";
  }
}

export function resolveHostedDeliveryObservationBoundaryMs(
  session: Pick<
    FlyRenderLiveSessionState,
    | "probeObservationBoundaryMs"
    | "renderEnqueuedAtMs"
    | "renderStartedAtMs"
  >,
): number {
  return (
    session.probeObservationBoundaryMs ??
    session.renderEnqueuedAtMs ??
    session.renderStartedAtMs ??
    0
  );
}

export function filterHostedRenderDeliveryEventsForRunObservation(input: {
  readonly events: readonly HostedRenderDeliveryEventObservation[];
  readonly renderMachineId: string | null;
  readonly observationBoundaryMs: number;
}): readonly HostedRenderDeliveryEventObservation[] {
  const out: HostedRenderDeliveryEventObservation[] = [];
  for (const event of input.events) {
    if (event.name !== "hosted.loop.delivery") continue;
    if (event.mode === "verify") continue;
    if (event.atMs < input.observationBoundaryMs) continue;
    if (input.renderMachineId != null) {
      if (event.machineId == null) continue;
      if (event.machineId !== input.renderMachineId) continue;
    }
    out.push(event);
  }
  return Object.freeze(out);
}

export function createReadHostedDeliveryEvents(input: {
  readonly flyAppName: string;
  readonly readFlyLogs?: (appName: string) => Promise<string>;
  readonly getSession: () => Pick<
    FlyRenderLiveSessionState,
    | "baselineRenderMachineId"
    | "probeObservationBoundaryMs"
    | "renderEnqueuedAtMs"
    | "renderStartedAtMs"
  >;
}): () => Promise<readonly HostedRenderDeliveryEventObservation[]> {
  const readFlyLogs = input.readFlyLogs ?? defaultReadFlyLogs;
  return async () => {
    const session = input.getSession();
    const parsed = parseHostedRenderDeliveryEventsFromFlyLogs(
      await readFlyLogs(input.flyAppName),
    );
    return filterHostedRenderDeliveryEventsForRunObservation({
      events: parsed,
      renderMachineId: session.baselineRenderMachineId,
      observationBoundaryMs: resolveHostedDeliveryObservationBoundaryMs(session),
    });
  };
}
