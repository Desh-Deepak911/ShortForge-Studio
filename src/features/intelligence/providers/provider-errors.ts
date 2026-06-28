import type { ResearchProviderId } from "./provider.types";

/** Base error for provider engine failures. */
export class ProviderError extends Error {
  readonly providerId?: ResearchProviderId;
  readonly code: string;

  constructor(message: string, options?: { providerId?: ResearchProviderId; code?: string; cause?: unknown }) {
    super(message, options?.cause != null ? { cause: options.cause } : undefined);
    this.name = "ProviderError";
    this.providerId = options?.providerId;
    this.code = options?.code ?? "PROVIDER_ERROR";
  }
}

export class ProviderNotFoundError extends ProviderError {
  constructor(providerId: ResearchProviderId) {
    super(`Research provider "${providerId}" is not registered.`, {
      providerId,
      code: "PROVIDER_NOT_FOUND",
    });
    this.name = "ProviderNotFoundError";
  }
}

export class ProviderUnavailableError extends ProviderError {
  constructor(providerId: ResearchProviderId, message?: string) {
    super(message ?? `Research provider "${providerId}" is unavailable.`, {
      providerId,
      code: "PROVIDER_UNAVAILABLE",
    });
    this.name = "ProviderUnavailableError";
  }
}

export class ProviderPlanError extends ProviderError {
  constructor(providerId: ResearchProviderId, message: string, cause?: unknown) {
    super(message, { providerId, code: "PROVIDER_PLAN_ERROR", cause });
    this.name = "ProviderPlanError";
  }
}

export class ProviderExecutionError extends ProviderError {
  constructor(providerId: ResearchProviderId, message: string, cause?: unknown) {
    super(message, { providerId, code: "PROVIDER_EXECUTION_ERROR", cause });
    this.name = "ProviderExecutionError";
  }
}
