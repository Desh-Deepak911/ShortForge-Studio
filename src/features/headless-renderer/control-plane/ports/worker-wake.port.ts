/**
 * Provider-neutral on-demand worker activation.
 * Production: Fly Machines start/stop. Tests: memory adapter.
 * Credentials never appear on this port.
 */

import type { HeadlessControlPlaneResult } from "../types/control-plane.types";

export type HeadlessWorkerWakeResultKind =
  | "started"
  | "already_running"
  | "failed";

export type HeadlessWorkerStopResultKind =
  | "stopped"
  | "already_stopped"
  | "failed";

export interface HeadlessWorkerWakePort {
  wake(input: { readonly nowMs: number }): Promise<
    HeadlessControlPlaneResult<{
      readonly kind: HeadlessWorkerWakeResultKind;
    }>
  >;

  stop(input: { readonly nowMs: number }): Promise<
    HeadlessControlPlaneResult<{
      readonly kind: HeadlessWorkerStopResultKind;
    }>
  >;
}
