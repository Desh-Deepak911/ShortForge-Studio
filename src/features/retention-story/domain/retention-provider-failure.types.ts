/**
 * Bounded, creator-safe provider-failure classification.
 * Never includes API keys, headers, prompts, narration, raw bodies, or stacks.
 */

export const RETENTION_PROVIDER_FAILURE_CLASSES = [
  "provider_config_unavailable",
  "authentication_rejected",
  "model_unavailable",
  "rate_limited",
  "request_parameter_rejected",
  "structured_output_schema_rejected",
  "provider_timeout",
  "provider_network_failure",
  "provider_server_failure",
  "empty_provider_response",
  "response_extraction_failure",
  "response_json_parse_failure",
  "response_schema_mismatch",
  "composer_proposal_malformed",
  "unknown_provider_failure",
] as const;

export type RetentionProviderFailureClass =
  (typeof RETENTION_PROVIDER_FAILURE_CLASSES)[number];

export const RETENTION_PROVIDER_ENDPOINT_FAMILIES = ["responses"] as const;
export type RetentionProviderEndpointFamily =
  (typeof RETENTION_PROVIDER_ENDPOINT_FAMILIES)[number];

export const RETENTION_PROVIDER_FAILURE_PHASES = [
  "client_init",
  "schema_construction",
  "provider_request",
  "response_extraction",
  "response_parse",
  "response_schema",
  "composer_proposal",
  "composer_callback",
] as const;
export type RetentionProviderFailurePhase =
  (typeof RETENTION_PROVIDER_FAILURE_PHASES)[number];

export const RETENTION_PROVIDER_TIMEOUT_CLASSES = [
  "client_timeout",
  "connection_timeout",
  "request_timeout",
  "unknown_timeout",
] as const;
export type RetentionProviderTimeoutClass =
  (typeof RETENTION_PROVIDER_TIMEOUT_CLASSES)[number];

/** Safe extras only. All strings are already sanitized before freeze. */
export interface RetentionSafeProviderFailure {
  readonly class: RetentionProviderFailureClass;
  readonly endpointFamily?: RetentionProviderEndpointFamily;
  readonly configuredModel?: string;
  readonly httpStatus?: number;
  readonly providerErrorType?: string;
  readonly providerErrorCode?: string;
  readonly rejectedParameterName?: string;
  readonly providerRequestId?: string;
  readonly failurePhase?: RetentionProviderFailurePhase;
  readonly retryCount?: number;
  readonly timeoutClassification?: RetentionProviderTimeoutClass;
}

const SAFE_TOKEN = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_MODEL = /^[A-Za-z0-9._:-]{1,64}$/;

function sanitizeToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return SAFE_TOKEN.test(trimmed) ? trimmed : undefined;
}

function sanitizeModel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return SAFE_MODEL.test(trimmed) ? trimmed : undefined;
}

function sanitizeStatus(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value < 100 || value > 599) return undefined;
  return value;
}

function sanitizeRetryCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value < 0 || value > 8) return undefined;
  return value;
}

export function isRetentionProviderFailureClass(
  value: unknown,
): value is RetentionProviderFailureClass {
  return (
    typeof value === "string" &&
    (RETENTION_PROVIDER_FAILURE_CLASSES as readonly string[]).includes(value)
  );
}

export function isUnusableProviderResponseClass(
  value: RetentionProviderFailureClass,
): boolean {
  return (
    value === "empty_provider_response" ||
    value === "response_extraction_failure" ||
    value === "response_json_parse_failure" ||
    value === "response_schema_mismatch" ||
    value === "composer_proposal_malformed"
  );
}

export function freezeRetentionSafeProviderFailure(
  input: RetentionSafeProviderFailure,
): RetentionSafeProviderFailure {
  const frozen: RetentionSafeProviderFailure = {
    class: isRetentionProviderFailureClass(input.class)
      ? input.class
      : "unknown_provider_failure",
    ...(input.endpointFamily === "responses"
      ? { endpointFamily: "responses" as const }
      : {}),
    ...(sanitizeModel(input.configuredModel)
      ? { configuredModel: sanitizeModel(input.configuredModel) }
      : {}),
    ...(sanitizeStatus(input.httpStatus)
      ? { httpStatus: sanitizeStatus(input.httpStatus) }
      : {}),
    ...(sanitizeToken(input.providerErrorType)
      ? { providerErrorType: sanitizeToken(input.providerErrorType) }
      : {}),
    ...(sanitizeToken(input.providerErrorCode)
      ? { providerErrorCode: sanitizeToken(input.providerErrorCode) }
      : {}),
    ...(sanitizeToken(input.rejectedParameterName)
      ? { rejectedParameterName: sanitizeToken(input.rejectedParameterName) }
      : {}),
    ...(sanitizeToken(input.providerRequestId)
      ? { providerRequestId: sanitizeToken(input.providerRequestId) }
      : {}),
    ...(input.failurePhase &&
    (RETENTION_PROVIDER_FAILURE_PHASES as readonly string[]).includes(
      input.failurePhase,
    )
      ? { failurePhase: input.failurePhase }
      : {}),
    ...(sanitizeRetryCount(input.retryCount) != null
      ? { retryCount: sanitizeRetryCount(input.retryCount) }
      : {}),
    ...(input.timeoutClassification &&
    (RETENTION_PROVIDER_TIMEOUT_CLASSES as readonly string[]).includes(
      input.timeoutClassification,
    )
      ? { timeoutClassification: input.timeoutClassification }
      : {}),
  };
  return Object.freeze(frozen);
}
