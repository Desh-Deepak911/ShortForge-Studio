/**
 * Classify provider/client failures into bounded safe classes.
 * Duck-types SDK errors so this module stays provider-import-free.
 */

import {
  freezeRetentionSafeProviderFailure,
  isRetentionProviderFailureClass,
  isUnusableProviderResponseClass,
  type RetentionProviderFailureClass,
  type RetentionProviderFailurePhase,
  type RetentionSafeProviderFailure,
  type RetentionProviderTimeoutClass,
} from "../domain/retention-provider-failure.types";
import {
  isRetentionStoryError,
  RetentionStoryError,
} from "../domain/retention-story-errors";

export interface ClassifyRetentionProviderFailureInput {
  readonly configuredModel?: string;
  readonly endpointFamily?: "responses";
  readonly failurePhase?: RetentionProviderFailurePhase;
  readonly retryCount?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStatus(error: Record<string, unknown>): number | undefined {
  if (typeof error.status === "number" && Number.isInteger(error.status)) {
    return error.status;
  }
  return undefined;
}

function errorName(error: unknown): string {
  if (isRecord(error) && typeof error.name === "string") return error.name;
  if (error instanceof Error) return error.name;
  return "";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return "";
}

function looksLikeSchemaRejection(error: Record<string, unknown>): boolean {
  const param = readString(error.param)?.toLowerCase() ?? "";
  const code = readString(error.code)?.toLowerCase() ?? "";
  const type = readString(error.type)?.toLowerCase() ?? "";
  const message = errorMessage(error).toLowerCase();
  if (
    param.includes("schema") ||
    param.includes("text.format") ||
    param.includes("json_schema")
  ) {
    return true;
  }
  if (code.includes("schema") || type.includes("schema")) return true;
  return (
    message.includes("json_schema") ||
    message.includes("additionalproperties") ||
    message.includes("strict") && message.includes("required") ||
    (message.includes("invalid schema") && message.includes("required"))
  );
}

function looksLikeModelUnavailable(error: Record<string, unknown>): boolean {
  const code = readString(error.code)?.toLowerCase() ?? "";
  const param = readString(error.param)?.toLowerCase() ?? "";
  const message = errorMessage(error).toLowerCase();
  return (
    code === "model_not_found" ||
    code === "invalid_model" ||
    param === "model" ||
    message.includes("model_not_found") ||
    message.includes("does not exist") ||
    message.includes("not authorized to access") ||
    message.includes("do not have access to model")
  );
}

function classifyFromKnownMessage(
  message: string,
): RetentionProviderFailureClass | null {
  if (message === "OPENAI_API_KEY is not configured") {
    return "provider_config_unavailable";
  }
  if (message === "empty_model_response" || message === "empty_provider_response") {
    return "empty_provider_response";
  }
  if (message === "response_extraction_failure") {
    return "response_extraction_failure";
  }
  if (message === "response_json_parse_failure") {
    return "response_json_parse_failure";
  }
  if (message === "composer_proposal_invalid" || message === "rewrite_proposal_invalid") {
    return "composer_proposal_malformed";
  }
  if (message === "planner_proposal_invalid") {
    return "response_schema_mismatch";
  }
  return null;
}

export function classifyRetentionProviderFailure(
  error: unknown,
  extras: ClassifyRetentionProviderFailureInput = {},
): RetentionSafeProviderFailure {
  if (isRetentionStoryError(error) && error.safeProviderFailure) {
    return error.safeProviderFailure;
  }
  if (
    isRecord(error) &&
    error.code === "RETENTION_PROVIDER_REQUEST_ERROR" &&
    isRecord(error.safeProviderFailure) &&
    isRetentionProviderFailureClass(error.safeProviderFailure.class)
  ) {
    return freezeRetentionSafeProviderFailure(
      error.safeProviderFailure as unknown as RetentionSafeProviderFailure,
    );
  }

  const record = isRecord(error) ? error : {};
  const status = readStatus(record);
  const name = errorName(error);
  const message = errorMessage(error);
  const known = classifyFromKnownMessage(message);
  const providerErrorType = readString(record.type) ?? (name || undefined);
  const providerErrorCode = readString(record.code);
  const rejectedParameterName = readString(record.param);
  const providerRequestId =
    readString(record.requestID) ?? readString(record.request_id);

  let failureClass: RetentionProviderFailureClass = "unknown_provider_failure";
  let timeoutClassification: RetentionProviderTimeoutClass | undefined;
  let failurePhase: RetentionProviderFailurePhase =
    extras.failurePhase ?? "provider_request";

  if (known) {
    failureClass = known;
    if (known === "provider_config_unavailable") {
      failurePhase = extras.failurePhase ?? "client_init";
    } else if (isUnusableProviderResponseClass(known)) {
      failurePhase =
        extras.failurePhase ??
        (known === "empty_provider_response"
          ? "response_extraction"
          : known === "response_json_parse_failure"
            ? "response_parse"
            : "composer_proposal");
    }
  } else if (error instanceof SyntaxError || name === "SyntaxError") {
    failureClass = "response_json_parse_failure";
    failurePhase = extras.failurePhase ?? "response_parse";
  } else if (
    name === "APIConnectionTimeoutError" ||
    /timeout/i.test(name) ||
    status === 408
  ) {
    failureClass = "provider_timeout";
    timeoutClassification =
      name === "APIConnectionTimeoutError"
        ? "connection_timeout"
        : status === 408
          ? "request_timeout"
          : "unknown_timeout";
  } else if (name === "APIConnectionError" || status === 0) {
    failureClass = "provider_network_failure";
  } else if (name === "AuthenticationError" || status === 401) {
    failureClass = "authentication_rejected";
  } else if (name === "RateLimitError" || status === 429) {
    failureClass = "rate_limited";
  } else if (name === "InternalServerError" || (status != null && status >= 500)) {
    failureClass = "provider_server_failure";
  } else if (
    name === "NotFoundError" ||
    status === 404 ||
    looksLikeModelUnavailable(record)
  ) {
    failureClass = "model_unavailable";
  } else if (
    name === "PermissionDeniedError" ||
    status === 403
  ) {
    failureClass = looksLikeModelUnavailable(record)
      ? "model_unavailable"
      : "authentication_rejected";
  } else if (
    name === "BadRequestError" ||
    status === 400 ||
    status === 422
  ) {
    failureClass = looksLikeSchemaRejection(record)
      ? "structured_output_schema_rejected"
      : looksLikeModelUnavailable(record)
        ? "model_unavailable"
        : "request_parameter_rejected";
  } else if (message === "openai_strict_json_schema_invalid:required_missing_property") {
    failureClass = "structured_output_schema_rejected";
    failurePhase = extras.failurePhase ?? "schema_construction";
  } else if (message.startsWith("openai_strict_json_schema_invalid:")) {
    failureClass = "structured_output_schema_rejected";
    failurePhase = extras.failurePhase ?? "schema_construction";
  }

  return freezeRetentionSafeProviderFailure({
    class: failureClass,
    endpointFamily: extras.endpointFamily ?? "responses",
    ...(extras.configuredModel ? { configuredModel: extras.configuredModel } : {}),
    ...(status != null ? { httpStatus: status } : {}),
    ...(providerErrorType ? { providerErrorType } : {}),
    ...(providerErrorCode ? { providerErrorCode } : {}),
    ...(rejectedParameterName ? { rejectedParameterName } : {}),
    ...(providerRequestId ? { providerRequestId } : {}),
    failurePhase,
    retryCount: extras.retryCount ?? 0,
    ...(timeoutClassification ? { timeoutClassification } : {}),
  });
}

export class RetentionProviderRequestError extends Error {
  readonly code = "RETENTION_PROVIDER_REQUEST_ERROR" as const;
  readonly safeProviderFailure: RetentionSafeProviderFailure;

  constructor(
    failure: RetentionSafeProviderFailure,
    message = "Retention provider request failed.",
  ) {
    super(message);
    this.name = "RetentionProviderRequestError";
    this.safeProviderFailure = freezeRetentionSafeProviderFailure(failure);
  }
}

export function isRetentionProviderRequestError(
  value: unknown,
): value is RetentionProviderRequestError {
  return value instanceof RetentionProviderRequestError;
}

export function retentionStoryErrorFromProviderFailure(
  failure: RetentionSafeProviderFailure,
  message?: string,
): RetentionStoryError {
  const unusable = isUnusableProviderResponseClass(failure.class);
  return new RetentionStoryError(
    unusable ? "composer_proposal_invalid" : "composer_call_failed",
    message ??
      (unusable
        ? "Retention composer response could not be used."
        : "Retention composer callback failed."),
    {
      normalizeSeam: failure.class,
      safeProviderFailure: failure,
    },
  );
}
