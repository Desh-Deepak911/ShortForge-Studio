/**
 * Durable maintenance sweep lease — prevents overlapping cleanup batches.
 */

import type { HeadlessControlPlaneResult } from "../types/control-plane.types";

export type HeadlessMaintenanceLeaseScope = "export_cleanup_global";

export interface HeadlessMaintenanceLeasePort {
  claim(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
    readonly leaseMs: number;
    readonly holderClass: string;
  }): Promise<
    HeadlessControlPlaneResult<
      | { readonly kind: "claimed" }
      | { readonly kind: "lease_rejected" }
    >
  >;

  release(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
  }): Promise<HeadlessControlPlaneResult<{ readonly kind: "released" }>>;
}
