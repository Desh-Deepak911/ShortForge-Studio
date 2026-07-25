/**
 * Provider-neutral headless availability — never inferred from environment variables in the client.
 */

export const HEADLESS_AVAILABILITY_STATES = [
  "available",
  "configuration_unavailable",
  "temporarily_unavailable",
  "unsupported_profile",
  "authentication_required",
] as const;

export type HeadlessAvailabilityState =
  (typeof HEADLESS_AVAILABILITY_STATES)[number];

export interface HeadlessAvailabilityV1 {
  readonly version: 1;
  readonly state: HeadlessAvailabilityState;
  /** Safe creator-facing message (no provider secrets). */
  readonly message: string;
  /** Whether Headless may be offered as a selectable renderer. */
  readonly headlessSelectable: boolean;
  /** Whether createJob may proceed. */
  readonly canCreateJob: boolean;
}

export const HEADLESS_STAGING_AVAILABLE: HeadlessAvailabilityV1 =
  Object.freeze({
    version: 1 as const,
    state: "available" as const,
    message: "Server rendering is ready.",
    headlessSelectable: true,
    canCreateJob: true,
  });

export const PRODUCTION_HEADLESS_UNAVAILABLE: HeadlessAvailabilityV1 =
  Object.freeze({
    version: 1 as const,
    state: "configuration_unavailable" as const,
    message:
      "Server rendering is not configured yet. You can continue with Browser Export.",
    headlessSelectable: true,
    canCreateJob: false,
  });

/** Staging access session absent or expired — create remains blocked. */
export const HEADLESS_AUTHENTICATION_REQUIRED: HeadlessAvailabilityV1 =
  Object.freeze({
    version: 1 as const,
    state: "authentication_required" as const,
    message: "Enter a staging access code to use server export.",
    headlessSelectable: true,
    canCreateJob: false,
  });

/**
 * Auth provider/integration failure — do not tell the creator to sign in.
 * Maps from AUTHENTICATION_FAILED (Phase 2A.1).
 */
export const HEADLESS_AUTH_TEMPORARILY_UNAVAILABLE: HeadlessAvailabilityV1 =
  Object.freeze({
    version: 1 as const,
    state: "temporarily_unavailable" as const,
    message:
      "Server authentication is temporarily unavailable. You can continue with Browser Export.",
    headlessSelectable: true,
    canCreateJob: false,
  });
