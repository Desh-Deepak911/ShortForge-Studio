/**
 * In-memory maintenance lease for tests and local verification.
 */

import { randomUUID } from "node:crypto";

import type {
  HeadlessMaintenanceLeasePort,
  HeadlessMaintenanceLeaseScope,
} from "../ports/maintenance-lease.port";
import { cpOk, cpFail } from "../types/control-plane.types";

type LeaseRow = {
  readonly leaseToken: string;
  readonly expiresAtMs: number;
};

const leases = new Map<HeadlessMaintenanceLeaseScope, LeaseRow>();

export class MemoryHeadlessMaintenanceLeaseAdapter
  implements HeadlessMaintenanceLeasePort
{
  async claim(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
    readonly leaseMs: number;
    readonly holderClass: string;
  }) {
    const existing = leases.get(input.scope);
    if (existing != null && existing.expiresAtMs > input.nowMs) {
      return cpOk({ kind: "lease_rejected" as const });
    }
    leases.set(
      input.scope,
      Object.freeze({
        leaseToken: input.leaseToken,
        expiresAtMs: input.nowMs + input.leaseMs,
      }),
    );
    return cpOk({ kind: "claimed" as const });
  }

  async release(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
  }) {
    const existing = leases.get(input.scope);
    if (existing?.leaseToken === input.leaseToken) {
      leases.delete(input.scope);
    }
    return cpOk({ kind: "released" as const });
  }
}

export function createMemoryMaintenanceLeaseToken(): string {
  return randomUUID();
}

export function resetMemoryMaintenanceLeasesForTests(): void {
  leases.clear();
}
