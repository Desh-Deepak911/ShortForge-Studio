/**
 * Total safe Clerk environment classification — never logs key values or which key failed.
 */

export type ClerkEnvironmentStatus =
  | "unconfigured"
  | "configured"
  | "invalid";

/** Safe ceiling — Clerk keys are short; reject hostile oversized env values. */
export const CLERK_ENV_KEY_MAX_LENGTH = 512;

const PUBLISHABLE_PREFIXES = Object.freeze(["pk_test_", "pk_live_"] as const);
const SECRET_PREFIXES = Object.freeze(["sk_test_", "sk_live_"] as const);

function hasWhitespace(value: string): boolean {
  return /\s/.test(value);
}

function readEnvString(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
  key: string,
): { readonly kind: "absent" } | { readonly kind: "present"; readonly value: string } | { readonly kind: "hostile" } {
  try {
    if (env == null || typeof env !== "object") {
      return { kind: "hostile" };
    }
    const raw = (env as Record<string, unknown>)[key];
    if (raw === undefined || raw === null) {
      return { kind: "absent" };
    }
    if (typeof raw !== "string") {
      return { kind: "hostile" };
    }
    return { kind: "present", value: raw };
  } catch {
    return { kind: "hostile" };
  }
}

function keyStructuralOk(
  value: string,
  prefixes: readonly string[],
): { readonly ok: true; readonly tier: "test" | "live" } | { readonly ok: false } {
  if (value.length === 0 || value.length > CLERK_ENV_KEY_MAX_LENGTH) {
    return { ok: false };
  }
  if (hasWhitespace(value)) {
    return { ok: false };
  }
  // Must not trim — whitespace anywhere is invalid; prefix check on exact value.
  for (const prefix of prefixes) {
    if (value.startsWith(prefix) && value.length > prefix.length) {
      return { ok: true, tier: prefix.includes("_test_") ? "test" : "live" };
    }
  }
  return { ok: false };
}

/**
 * Classify Clerk environment keys without revealing which key failed.
 */
export function classifyClerkEnvironment(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): ClerkEnvironmentStatus {
  try {
    const pk = readEnvString(env, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
    const sk = readEnvString(env, "CLERK_SECRET_KEY");

    if (pk.kind === "hostile" || sk.kind === "hostile") {
      return "invalid";
    }

    const pkAbsent = pk.kind === "absent";
    const skAbsent = sk.kind === "absent";

    if (pkAbsent && skAbsent) {
      return "unconfigured";
    }
    if (pkAbsent || skAbsent) {
      return "invalid";
    }

    // Both present (possibly blank strings).
    const pkCheck = keyStructuralOk(pk.value, PUBLISHABLE_PREFIXES);
    const skCheck = keyStructuralOk(sk.value, SECRET_PREFIXES);
    if (!pkCheck.ok || !skCheck.ok) {
      return "invalid";
    }
    if (pkCheck.tier !== skCheck.tier) {
      return "invalid";
    }
    return "configured";
  } catch {
    return "invalid";
  }
}

/** Compatibility wrapper — true only when classification is `configured`. */
export function isClerkEnvironmentConfigured(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): boolean {
  return classifyClerkEnvironment(env) === "configured";
}
