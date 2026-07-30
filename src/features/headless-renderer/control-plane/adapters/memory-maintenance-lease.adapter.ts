/**
 * In-memory maintenance lease for tests and local verification.
 */

import type {
  HeadlessMaintenanceLeasePort,
  HeadlessMaintenanceLeaseScope,
} from "../ports/maintenance-lease.port";
import { cpOk } from "../types/control-plane.types";

type LeaseRow = {
  readonly leaseToken: string;
  readonly expiresAtMs: number;
  readonly releaseState: "active" | "released";
  readonly renewedAtMs: number | null;
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
    if (
      existing != null &&
      existing.releaseState === "active" &&
      existing.expiresAtMs > input.nowMs
    ) {
      return cpOk({ kind: "lease_rejected" as const });
    }
    leases.set(
      input.scope,
      Object.freeze({
        leaseToken: input.leaseToken,
        expiresAtMs: input.nowMs + input.leaseMs,
        releaseState: "active",
        renewedAtMs: null,
      }),
    );
    return cpOk({ kind: "claimed" as const });
  }

  async renew(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
    readonly leaseMs: number;
  }) {
    const existing = leases.get(input.scope);
    if (
      existing == null ||
      existing.leaseToken !== input.leaseToken ||
      existing.releaseState !== "active" ||
      existing.expiresAtMs <= input.nowMs
    ) {
      return cpOk({ kind: "stale_token" as const });
    }
    leases.set(
      input.scope,
      Object.freeze({
        ...existing,
        expiresAtMs: input.nowMs + input.leaseMs,
        renewedAtMs: input.nowMs,
      }),
    );
    return cpOk({ kind: "renewed" as const });
  }

  async release(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
  }) {
    const existing = leases.get(input.scope);
    if (
      existing == null ||
      existing.leaseToken !== input.leaseToken ||
      existing.releaseState !== "active"
    ) {
      return cpOk({ kind: "stale_token" as const });
    }
    leases.set(
      input.scope,
      Object.freeze({
        ...existing,
        releaseState: "released",
        expiresAtMs: input.nowMs,
      }),
    );
    return cpOk({ kind: "released" as const });
  }

  async assertActiveLease(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
  }) {
    const existing = leases.get(input.scope);
    if (
      existing == null ||
      existing.leaseToken !== input.leaseToken ||
      existing.releaseState !== "active" ||
      existing.expiresAtMs <= input.nowMs
    ) {
      return cpOk({ kind: "stale" as const });
    }
    return cpOk({ kind: "valid" as const });
  }
}

export function resetMemoryMaintenanceLeasesForTests(): void {
  leases.clear();
}
