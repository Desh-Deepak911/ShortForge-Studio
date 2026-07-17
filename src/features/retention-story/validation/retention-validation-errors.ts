/**
 * Typed Retention validation errors — Sprint 10F / 10F.1.
 * Messages never echo narration, claim text, prompts, or secrets.
 */

export type RetentionValidationErrorReason =
  | "validation_input_invalid"
  | "hook_bridge_not_approved"
  | "authority_mismatch"
  | "validation_fingerprint_mismatch"
  | "validation_coherence_mismatch"
  | "hook_bridge_coherence_mismatch";

export class RetentionValidationError extends Error {
  readonly reason: RetentionValidationErrorReason;
  readonly code = "RETENTION_VALIDATION_ERROR" as const;

  constructor(reason: RetentionValidationErrorReason, message: string) {
    super(message);
    this.name = "RetentionValidationError";
    this.reason = reason;
  }
}

export function isRetentionValidationError(
  value: unknown,
): value is RetentionValidationError {
  return value instanceof RetentionValidationError;
}
