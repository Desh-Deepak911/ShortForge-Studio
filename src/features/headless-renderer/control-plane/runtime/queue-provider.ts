/**
 * HEADLESS_QUEUE_PROVIDER classifier.
 * Never logs or returns secrets. Staging/production fail closed when missing
 * or invalid. Local may omit the flag (defaults to upstash) so existing
 * developer setups keep working.
 */

export type HeadlessQueueProviderId = "upstash" | "neon";

export type HeadlessQueueProviderStatus =
  | "unconfigured"
  | "configured"
  | "invalid";

export type HeadlessQueueProviderClassification = {
  readonly status: HeadlessQueueProviderStatus;
  readonly provider: HeadlessQueueProviderId | null;
  readonly envName: "local" | "staging" | "production" | null;
};

const PROVIDERS = new Set<string>(["upstash", "neon"]);
const ENV_NAMES = new Set<string>(["local", "staging", "production"]);

function readEnvString(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
  key: string,
):
  | { readonly kind: "absent" }
  | { readonly kind: "present"; readonly value: string }
  | { readonly kind: "hostile" } {
  try {
    if (env == null || typeof env !== "object") return { kind: "hostile" };
    const raw = (env as Record<string, unknown>)[key];
    if (raw === undefined || raw === null) return { kind: "absent" };
    if (typeof raw !== "string") return { kind: "hostile" };
    return { kind: "present", value: raw };
  } catch {
    return { kind: "hostile" };
  }
}

export function classifyHeadlessQueueProvider(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): HeadlessQueueProviderClassification {
  const envNameRead = readEnvString(env, "HEADLESS_ENV_NAME");
  const providerRead = readEnvString(env, "HEADLESS_QUEUE_PROVIDER");

  if (envNameRead.kind === "hostile" || providerRead.kind === "hostile") {
    return { status: "invalid", provider: null, envName: null };
  }

  const envName =
    envNameRead.kind === "present" && ENV_NAMES.has(envNameRead.value)
      ? (envNameRead.value as "local" | "staging" | "production")
      : envNameRead.kind === "present"
        ? null
        : null;

  if (envNameRead.kind === "present" && envName == null) {
    return { status: "invalid", provider: null, envName: null };
  }

  const requiresExplicit = envName === "staging" || envName === "production";

  if (providerRead.kind === "absent") {
    if (requiresExplicit) {
      return { status: "invalid", provider: null, envName };
    }
    return { status: "unconfigured", provider: "upstash", envName: envName ?? "local" };
  }

  if (!PROVIDERS.has(providerRead.value)) {
    return { status: "invalid", provider: null, envName };
  }

  return {
    status: "configured",
    provider: providerRead.value as HeadlessQueueProviderId,
    envName: envName ?? "local",
  };
}

/** Safe diagnostic — provider id and status only. */
export function headlessQueueProviderDiagnostic(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): {
  readonly queueProviderStatus: HeadlessQueueProviderStatus;
  readonly queueProvider: HeadlessQueueProviderId | null;
} {
  const classified = classifyHeadlessQueueProvider(env);
  return {
    queueProviderStatus: classified.status,
    queueProvider: classified.provider,
  };
}

export function assertHeadlessQueueProviderReady(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): HeadlessQueueProviderClassification {
  return classifyHeadlessQueueProvider(env);
}

/**
 * Attach the REST producer only for the Upstash provider.
 * Neon never XADDs verify or render. Invalid flags stay fail-closed.
 */
export function shouldConstructUpstashRestProducer(
  queueProvider: HeadlessQueueProviderClassification,
): boolean {
  return (
    queueProvider.status !== "invalid" && queueProvider.provider !== "neon"
  );
}
