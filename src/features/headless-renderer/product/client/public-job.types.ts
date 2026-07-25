/**
 * Client-safe public job view DTOs (mirror control-plane safe views).
 * Product must not import control-plane barrels from client leaves.
 */

export const HEADLESS_PUBLIC_JOB_STATES = [
  "created",
  "materializing",
  "queued",
  "rendering",
  "encoding",
  "validating",
  "uploading",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
] as const;

export type HeadlessPublicJobState =
  (typeof HEADLESS_PUBLIC_JOB_STATES)[number];

export const HEADLESS_TERMINAL_PUBLIC_STATES = [
  "succeeded",
  "failed",
  "cancelled",
  "expired",
] as const;

export type HeadlessTerminalPublicState =
  (typeof HEADLESS_TERMINAL_PUBLIC_STATES)[number];

export interface HeadlessPublicAdvisoryProgress {
  readonly percent: number | null;
  readonly stage: string | null;
}

export interface HeadlessPublicTerminalReason {
  readonly reasonId: string;
  readonly retryable: boolean;
}

export interface HeadlessPublicJobView {
  readonly version: 1;
  readonly jobId: string;
  readonly state: HeadlessPublicJobState;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly progress: HeadlessPublicAdvisoryProgress | null;
  readonly terminalReason: HeadlessPublicTerminalReason | null;
  readonly artifactAvailable: boolean;
  readonly cancelAccepted: boolean;
}

export interface HeadlessDownloadCapabilityV1 {
  readonly version: 1;
  readonly jobId: string;
  readonly url: string;
  readonly expiresAtMs: number;
  readonly filename: string;
}

export type HeadlessClientErrorCode =
  | "CONFIGURATION_UNAVAILABLE"
  | "AUTHENTICATION_REQUIRED"
  | "TEMPORARILY_UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "NETWORK_ERROR"
  | "JOB_NOT_FOUND"
  | "NOT_RETRYABLE"
  | "NOT_DOWNLOADABLE"
  | "CANCEL_REJECTED"
  | "CREATE_REJECTED"
  | "UNKNOWN";

export interface HeadlessClientFailure {
  readonly ok: false;
  readonly code: HeadlessClientErrorCode;
  /** Safe creator message — never stack traces or locators. */
  readonly message: string;
}

export type HeadlessClientResult<T> =
  | { readonly ok: true; readonly value: T }
  | HeadlessClientFailure;
