export type ValidationSeverity = "info" | "warning" | "error";

export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
  /** Claim or span that failed validation, when available. */
  claim?: string;
}

export interface ValidationResult {
  passed: boolean;
  issues: ValidationIssue[];
}
