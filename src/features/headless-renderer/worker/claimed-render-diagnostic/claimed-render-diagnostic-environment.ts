/**
 * Sprint 11E Phase 2E.2D.8F.6 — provider-free claimed-render diagnostic gate.
 */

export const HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE =
  "HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC" as const;

const FORBIDDEN_EXACT_KEYS = Object.freeze([
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "CLERK_SECRET_KEY",
  "CLERK_PUBLISHABLE_KEY",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "HEADLESS_FLY_STAGING_AUTHORIZE_RENDER_SCALE_UP",
  "HEADLESS_FLY_RENDER_QA",
  "HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE",
  "HEADLESS_FLY_STAGING_EXECUTION_AUTHORIZED",
] as const);

const FORBIDDEN_PREFIXES = Object.freeze([
  "DATABASE_URL",
  "R2_",
  "UPSTASH_",
  "NEXT_PUBLIC_",
] as const);

const FORBIDDEN_WORKER_MODES = Object.freeze(["verify", "render"] as const);

const DEPLOYMENT_GATE_ENV_NAMES = Object.freeze([
  "HEADLESS_FLY_STAGING_AUTHORIZE_APP_CREATE",
  "HEADLESS_FLY_STAGING_AUTHORIZE_SECRETS_INSTALL",
  "HEADLESS_FLY_STAGING_AUTHORIZE_IMAGE_DEPLOY",
  "HEADLESS_FLY_STAGING_AUTHORIZE_VERIFY_SCALE_UP",
  "HEADLESS_FLY_STAGING_AUTHORIZE_RENDER_SCALE_UP",
  "HEADLESS_FLY_STAGING_AUTHORIZE_ROLLBACK",
  "HEADLESS_FLY_STAGING_AUTHORIZE_TEARDOWN",
] as const);

export type ClaimedRenderDiagnosticEnvironmentVerdict =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reasonId:
        | "gate_off"
        | "forbidden_secret_present"
        | "forbidden_worker_mode"
        | "forbidden_deployment_gate";
      readonly forbiddenKeyClass: string | null;
    };

export function isClaimedRenderDiagnosticGateOn(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): boolean {
  return (
    (env as Record<string, unknown>)[
      HEADLESS_FLY_RENDER_QA_CLAIMED_RENDER_DIAGNOSTIC_GATE
    ] === "1"
  );
}

function envHasNonEmptyValue(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
  key: string,
): boolean {
  const raw = (env as Record<string, unknown>)[key];
  return typeof raw === "string" && raw.trim().length > 0;
}

export function validateClaimedRenderDiagnosticEnvironment(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): ClaimedRenderDiagnosticEnvironmentVerdict {
  if (!isClaimedRenderDiagnosticGateOn(env)) {
    return { ok: false, reasonId: "gate_off", forbiddenKeyClass: null };
  }

  const modeRaw = (env as Record<string, unknown>).HEADLESS_WORKER_MODE;
  if (
    typeof modeRaw === "string" &&
    (FORBIDDEN_WORKER_MODES as readonly string[]).includes(modeRaw)
  ) {
    return {
      ok: false,
      reasonId: "forbidden_worker_mode",
      forbiddenKeyClass: "HEADLESS_WORKER_MODE",
    };
  }

  for (const key of FORBIDDEN_EXACT_KEYS) {
    if (envHasNonEmptyValue(env, key)) {
      return {
        ok: false,
        reasonId: "forbidden_secret_present",
        forbiddenKeyClass: key,
      };
    }
  }

  for (const key of Object.keys(env)) {
    for (const prefix of FORBIDDEN_PREFIXES) {
      if (key.startsWith(prefix) && envHasNonEmptyValue(env, key)) {
        return {
          ok: false,
          reasonId: "forbidden_secret_present",
          forbiddenKeyClass: prefix.replace(/_$/, ""),
        };
      }
    }
    if (
      key.toLowerCase().includes("clerk") &&
      envHasNonEmptyValue(env, key)
    ) {
      return {
        ok: false,
        reasonId: "forbidden_secret_present",
        forbiddenKeyClass: "Clerk",
      };
    }
  }

  for (const gateEnv of DEPLOYMENT_GATE_ENV_NAMES) {
    if ((env as Record<string, unknown>)[gateEnv] === "1") {
      return {
        ok: false,
        reasonId: "forbidden_deployment_gate",
        forbiddenKeyClass: "deployment_gate",
      };
    }
  }

  return { ok: true };
}

export function listClaimedRenderDiagnosticForbiddenEnvKeyClasses(): readonly string[] {
  return Object.freeze([
    ...FORBIDDEN_EXACT_KEYS,
    ...FORBIDDEN_PREFIXES.map((p) => p.replace(/_$/, "")),
    "HEADLESS_WORKER_MODE",
    "Clerk",
    "deployment_gate",
  ]);
}
