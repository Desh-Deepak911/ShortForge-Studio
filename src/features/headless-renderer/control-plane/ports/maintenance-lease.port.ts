/**
 * Durable maintenance sweep lease with fencing tokens.
 *
 * Only one valid lease holder may execute provider deletion. Expired leases may
 * be reclaimed atomically; active leases cannot be stolen. Renewal and release
 * require the current fencing token so stale workers cannot persist outcomes.
 */

import type { HeadlessControlPlaneResult } from "../types/control-plane.types";

export type HeadlessMaintenanceLeaseScope = "export_cleanup_global";

export type HeadlessMaintenanceLeaseClaimResult =
  | { readonly kind: "claimed" }
  | { readonly kind: "lease_rejected" };

export type HeadlessMaintenanceLeaseValidationResult =
  | { readonly kind: "valid" }
  | { readonly kind: "stale" };

export interface HeadlessMaintenanceLeasePort {
  claim(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
    readonly leaseMs: number;
    readonly holderClass: string;
  }): Promise<HeadlessControlPlaneResult<HeadlessMaintenanceLeaseClaimResult>>;

  renew(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
    readonly leaseMs: number;
  }): Promise<
    HeadlessControlPlaneResult<
      | { readonly kind: "renewed" }
      | { readonly kind: "stale_token" }
    >
  >;

  release(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
  }): Promise<
    HeadlessControlPlaneResult<
      | { readonly kind: "released" }
      | { readonly kind: "stale_token" }
    >
  >;

  assertActiveLease(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
  }): Promise<HeadlessControlPlaneResult<HeadlessMaintenanceLeaseValidationResult>>;
}
